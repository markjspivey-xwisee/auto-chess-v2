/**
 * Real Browser Testing Script
 * Uses Playwright to actually run the game and check for errors
 */

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static file server
function createServer(dir, port) {
    return new Promise((resolve) => {
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
        };

        const server = http.createServer((req, res) => {
            let filePath = path.join(dir, req.url === '/' ? 'index.html' : req.url);
            const ext = path.extname(filePath);
            const contentType = mimeTypes[ext] || 'application/octet-stream';

            fs.readFile(filePath, (err, content) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                } else {
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(content);
                }
            });
        });

        server.listen(port, () => {
            resolve(server);
        });
    });
}

async function runBrowserTests() {
    const results = {
        timestamp: new Date().toISOString(),
        tests: [],
        consoleErrors: [],
        consoleWarnings: [],
        networkErrors: [],
        verdict: 'UNKNOWN',
        summary: ''
    };

    // Start local server
    const PORT = 3333;
    const projectDir = path.resolve(__dirname, '..');
    console.log(`Starting server for ${projectDir} on port ${PORT}...`);
    const server = await createServer(projectDir, PORT);
    console.log(`Server running at http://localhost:${PORT}`);

    // Launch browser
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Capture console messages
    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'error') {
            results.consoleErrors.push(text);
            console.log(`[CONSOLE ERROR] ${text}`);
        } else if (type === 'warning') {
            results.consoleWarnings.push(text);
        }
    });

    // Capture page errors (uncaught exceptions)
    page.on('pageerror', error => {
        results.consoleErrors.push(`Uncaught: ${error.message}`);
        console.log(`[PAGE ERROR] ${error.message}`);
    });

    // Capture network failures
    page.on('requestfailed', request => {
        results.networkErrors.push({
            url: request.url(),
            failure: request.failure()?.errorText
        });
        console.log(`[NETWORK ERROR] ${request.url()} - ${request.failure()?.errorText}`);
    });

    try {
        // TEST 1: Page loads
        console.log('\n=== TEST 1: Page Load ===');
        const response = await page.goto(`http://localhost:${PORT}`, {
            waitUntil: 'networkidle',
            timeout: 10000
        });

        const loadTest = {
            name: 'Page Load',
            passed: response.status() === 200,
            details: `HTTP ${response.status()}`
        };
        results.tests.push(loadTest);
        console.log(`Page load: ${loadTest.passed ? 'PASS' : 'FAIL'} (${loadTest.details})`);

        // Wait for JS to execute
        await page.waitForTimeout(500);

        // TEST 2: No console errors on load
        console.log('\n=== TEST 2: Console Errors ===');
        const noErrorsTest = {
            name: 'No Console Errors',
            passed: results.consoleErrors.length === 0,
            details: results.consoleErrors.length === 0
                ? 'No errors'
                : `${results.consoleErrors.length} errors found`
        };
        results.tests.push(noErrorsTest);
        console.log(`Console errors: ${noErrorsTest.passed ? 'PASS' : 'FAIL'} (${noErrorsTest.details})`);
        if (results.consoleErrors.length > 0) {
            results.consoleErrors.forEach(e => console.log(`  - ${e}`));
        }

        // TEST 3: Board grid exists and has cells
        console.log('\n=== TEST 3: Board Rendering ===');
        const boardCells = await page.$$('#board-grid .board-cell');
        const boardTest = {
            name: 'Board Rendered',
            passed: boardCells.length === 64, // 8x8 grid
            details: `${boardCells.length} cells found (expected 64)`
        };
        results.tests.push(boardTest);
        console.log(`Board cells: ${boardTest.passed ? 'PASS' : 'FAIL'} (${boardTest.details})`);

        // TEST 4: Shop has slots
        console.log('\n=== TEST 4: Shop Rendering ===');
        const shopSlots = await page.$$('.shop-slot');
        const shopTest = {
            name: 'Shop Rendered',
            passed: shopSlots.length >= 5,
            details: `${shopSlots.length} shop slots found`
        };
        results.tests.push(shopTest);
        console.log(`Shop slots: ${shopTest.passed ? 'PASS' : 'FAIL'} (${shopTest.details})`);

        // TEST 5: Game state initialized
        console.log('\n=== TEST 5: Game State ===');
        const gameState = await page.evaluate(() => {
            return {
                hasGameState: typeof window.gameState !== 'undefined',
                hasGame: typeof window.game !== 'undefined',
                gold: window.gameState?.gold,
                level: window.gameState?.level,
                hp: window.gameState?.hp
            };
        });
        const stateTest = {
            name: 'Game State Initialized',
            passed: gameState.hasGameState && gameState.hasGame,
            details: gameState.hasGame
                ? `Gold: ${gameState.gold}, Level: ${gameState.level}, HP: ${gameState.hp}`
                : 'Game not initialized'
        };
        results.tests.push(stateTest);
        console.log(`Game state: ${stateTest.passed ? 'PASS' : 'FAIL'} (${stateTest.details})`);

        // TEST 6: Shop has units to buy
        console.log('\n=== TEST 6: Shop Units ===');
        const shopCards = await page.$$('.shop-card');
        const hasShopUnits = await page.evaluate(() => {
            const cards = document.querySelectorAll('.shop-card');
            return cards.length > 0 && cards[0].querySelector('.shop-card-emoji')?.textContent?.length > 0;
        });
        const shopUnitsTest = {
            name: 'Shop Has Units',
            passed: hasShopUnits,
            details: `${shopCards.length} unit cards in shop`
        };
        results.tests.push(shopUnitsTest);
        console.log(`Shop units: ${shopUnitsTest.passed ? 'PASS' : 'FAIL'} (${shopUnitsTest.details})`);

        // TEST 7: Can click buy button (functional test)
        console.log('\n=== TEST 7: Buy Unit Interaction ===');
        let buyWorked = false;
        try {
            const initialGold = await page.evaluate(() => window.gameState?.gold || 0);

            // Click first shop slot
            const firstSlot = await page.$('.shop-slot:first-child');
            if (firstSlot) {
                await firstSlot.click();
                await page.waitForTimeout(200);

                const newGold = await page.evaluate(() => window.gameState?.gold || 0);
                const benchUnits = await page.evaluate(() => {
                    return window.gameState?.bench?.filter(x => x !== null).length || 0;
                });

                // Either gold decreased OR we got a unit on bench
                buyWorked = newGold < initialGold || benchUnits > 0;
            }
        } catch (e) {
            console.log(`  Error during buy test: ${e.message}`);
        }
        const buyTest = {
            name: 'Buy Unit Works',
            passed: buyWorked,
            details: buyWorked ? 'Successfully bought unit' : 'Buy interaction failed'
        };
        results.tests.push(buyTest);
        console.log(`Buy interaction: ${buyTest.passed ? 'PASS' : 'FAIL'} (${buyTest.details})`);

        // Take screenshot
        const screenshotPath = path.join(__dirname, '..', 'test-screenshot.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`\nScreenshot saved to: ${screenshotPath}`);

    } catch (error) {
        console.error('Test execution error:', error);
        results.tests.push({
            name: 'Test Execution',
            passed: false,
            details: error.message
        });
    }

    // Calculate verdict
    const passedTests = results.tests.filter(t => t.passed).length;
    const totalTests = results.tests.length;
    const hasBlockingErrors = results.consoleErrors.length > 0 ||
                              results.tests.some(t => !t.passed && ['Page Load', 'No Console Errors', 'Game State Initialized'].includes(t.name));

    if (hasBlockingErrors) {
        results.verdict = 'FAIL';
        results.summary = `${passedTests}/${totalTests} tests passed. Blocking issues found.`;
    } else if (passedTests === totalTests) {
        results.verdict = 'PASS';
        results.summary = `All ${totalTests} tests passed!`;
    } else {
        results.verdict = 'PARTIAL';
        results.summary = `${passedTests}/${totalTests} tests passed. Some issues need attention.`;
    }

    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log(`VERDICT: ${results.verdict}`);
    console.log(`SUMMARY: ${results.summary}`);
    console.log('='.repeat(50));

    if (results.consoleErrors.length > 0) {
        console.log('\nBLOCKING ERRORS:');
        results.consoleErrors.forEach(e => console.log(`  ❌ ${e}`));
    }

    // Write results to file
    const resultsPath = path.join(__dirname, '..', 'test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\nFull results saved to: ${resultsPath}`);

    // Cleanup
    await browser.close();
    server.close();

    // Exit with appropriate code
    process.exit(results.verdict === 'PASS' ? 0 : 1);
}

// Run tests
runBrowserTests().catch(console.error);
