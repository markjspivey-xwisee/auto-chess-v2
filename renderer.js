/**
 * Auto Chess Board Renderer Module
 * Handles all visual rendering of the game board, units, and combat animations
 */

// ============================================================================
// RENDERER CLASS
// ============================================================================

class Renderer {
    constructor() {
        // DOM element references
        this.boardGrid = null;
        this.playerBenchSlots = null;
        this.enemyBenchSlots = null;

        // Cell tracking
        this.cells = []; // 2D array of cell elements [row][col]
        this.benchCells = [];

        // Unit element tracking
        this.unitElements = new Map(); // unitId -> DOM element

        // Animation queue
        this.animationQueue = [];
        this.isAnimating = false;

        // Configuration
        this.config = {
            boardCols: GAME_CONFIG.BOARD_COLS,
            boardRows: GAME_CONFIG.BOARD_ROWS, // Full board height (8)
            playerRows: GAME_CONFIG.PLAYER_ROWS, // Player area (4)
            benchSize: GAME_CONFIG.BENCH_SIZE,
            animationDuration: 300,
            damageNumberDuration: 800
        };

        // Highlighted cells for valid placement
        this.highlightedCells = new Set();

        // Selected unit for drag/drop
        this.selectedUnit = null;

        console.log('[Renderer] Renderer instance created');
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize the renderer and create the board DOM structure
     */
    init() {
        this.boardGrid = document.getElementById('board-grid');
        this.playerBenchSlots = document.getElementById('player-bench-slots');
        this.enemyBenchSlots = document.getElementById('enemy-bench-slots');

        if (!this.boardGrid) {
            console.error('[Renderer] Board grid element not found');
            return false;
        }

        // Clear existing content
        this.boardGrid.innerHTML = '';
        if (this.playerBenchSlots) this.playerBenchSlots.innerHTML = '';
        if (this.enemyBenchSlots) this.enemyBenchSlots.innerHTML = '';

        // Create the board grid (8 columns x 8 rows)
        this.createBoardCells();

        // Create bench slots
        this.createBenchSlots();

        // Set up event listeners
        this.setupEventListeners();

        console.log('[Renderer] Initialized');
        return true;
    }

    /**
     * Create the 8x8 board grid cells
     * Top 4 rows = enemy area, Bottom 4 rows = player area
     */
    createBoardCells() {
        this.cells = [];
        const totalRows = this.config.boardRows;
        const cols = this.config.boardCols;

        for (let row = 0; row < totalRows; row++) {
            this.cells[row] = [];
            for (let col = 0; col < cols; col++) {
                const cell = document.createElement('div');
                cell.className = 'board-cell';

                // Checkerboard pattern
                const isLight = (row + col) % 2 === 0;
                cell.classList.add(isLight ? 'light' : 'dark');

                // Mark player vs enemy side
                if (row < this.config.playerRows) {
                    cell.classList.add('enemy-side');
                } else {
                    cell.classList.add('player-side');
                }

                // Store position data
                cell.dataset.row = row;
                cell.dataset.col = col;
                cell.dataset.side = row < this.config.playerRows ? 'enemy' : 'player';

                this.boardGrid.appendChild(cell);
                this.cells[row][col] = cell;
            }
        }
    }

    /**
     * Create bench slot elements
     */
    createBenchSlots() {
        this.benchCells = [];

        if (this.playerBenchSlots) {
            for (let i = 0; i < this.config.benchSize; i++) {
                const slot = document.createElement('div');
                slot.className = 'bench-slot';
                slot.dataset.benchIndex = i;
                slot.dataset.type = 'player-bench';
                this.playerBenchSlots.appendChild(slot);
                this.benchCells.push(slot);
            }
        }
    }

    /**
     * Set up event listeners for drag/drop and clicks
     */
    setupEventListeners() {
        // Board cell events
        this.cells.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                cell.addEventListener('click', (e) => this.onCellClick(e, rowIndex, colIndex));
                cell.addEventListener('dragover', (e) => this.onDragOver(e));
                cell.addEventListener('drop', (e) => this.onDrop(e, rowIndex, colIndex));
                cell.addEventListener('dragenter', (e) => this.onDragEnter(e));
                cell.addEventListener('dragleave', (e) => this.onDragLeave(e));
            });
        });

        // Bench slot events
        this.benchCells.forEach((slot, index) => {
            slot.addEventListener('click', (e) => this.onBenchClick(e, index));
            slot.addEventListener('dragover', (e) => this.onDragOver(e));
            slot.addEventListener('drop', (e) => this.onBenchDrop(e, index));
            slot.addEventListener('dragenter', (e) => this.onDragEnter(e));
            slot.addEventListener('dragleave', (e) => this.onDragLeave(e));
        });
    }

    // ========================================================================
    // BOARD RENDERING
    // ========================================================================

    /**
     * Render the complete board state
     */
    renderBoard() {
        // Clear all existing units from cells
        this.clearAllUnits();

        // Render player units (bottom 4 rows)
        this.renderPlayerBoard();

        // Render enemy units (top 4 rows)
        this.renderEnemyBoard();

        // Render bench
        this.renderBench();

        console.log('[Renderer] Board rendered');
    }

    /**
     * Render player's board (rows 4-7, displayed as bottom half)
     */
    renderPlayerBoard() {
        const state = window.gameState;
        if (!state) return;

        for (let row = 0; row < this.config.playerRows; row++) {
            for (let col = 0; col < this.config.boardCols; col++) {
                const unitId = state.playerBoard[row][col];
                if (unitId) {
                    const unit = state.ownedUnits.get(unitId);
                    if (unit) {
                        // Map player board row to display row (bottom half)
                        const displayRow = row + this.config.playerRows;
                        const cell = this.cells[displayRow][col];
                        this.renderUnit(unit, cell, 'ally');
                    }
                }
            }
        }
    }

    /**
     * Render enemy's board (rows 0-3, displayed as top half)
     */
    renderEnemyBoard() {
        const state = window.gameState;
        if (!state) return;

        for (let row = 0; row < this.config.playerRows; row++) {
            for (let col = 0; col < this.config.boardCols; col++) {
                const unitId = state.enemyBoard[row][col];
                if (unitId) {
                    // Enemy board row maps to display row (mirror: row 0 -> display 3, row 3 -> display 0)
                    const displayRow = this.config.playerRows - 1 - row;
                    const cell = this.cells[displayRow][col];

                    // For enemy units, we need to get unit data differently
                    // Assuming enemy units have their data stored or we create display data
                    const unit = this.getEnemyUnitData(unitId);
                    if (unit) {
                        this.renderUnit(unit, cell, 'enemy');
                    }
                }
            }
        }
    }

    /**
     * Get enemy unit data (from state or combat state)
     */
    getEnemyUnitData(unitId) {
        const state = window.gameState;
        // Check combat state first
        if (state.combatState && state.combatState.enemyUnits) {
            return state.combatState.enemyUnits.find(u => u.id === unitId);
        }
        // Check owned units (might be enemy units stored there during combat)
        return state.ownedUnits.get(unitId);
    }

    /**
     * Render bench units
     */
    renderBench() {
        const state = window.gameState;
        if (!state) return;

        this.benchCells.forEach((slot, index) => {
            // Clear slot
            slot.innerHTML = '';
            slot.classList.remove('occupied');

            const unitId = state.bench[index];
            if (unitId) {
                const unit = state.ownedUnits.get(unitId);
                if (unit) {
                    this.renderUnit(unit, slot, 'ally', true);
                    slot.classList.add('occupied');
                }
            }
        });
    }

    /**
     * Clear all unit elements from the board
     */
    clearAllUnits() {
        this.cells.forEach(row => {
            row.forEach(cell => {
                const unitElement = cell.querySelector('.unit');
                if (unitElement) {
                    unitElement.remove();
                }
            });
        });

        this.unitElements.clear();
    }

    // ========================================================================
    // UNIT RENDERING
    // ========================================================================

    /**
     * Render a single unit in a cell
     * @param {Object} unit - Unit data (UnitInstance or combat unit)
     * @param {HTMLElement} cell - Cell element to render in
     * @param {string} side - 'ally' or 'enemy'
     * @param {boolean} isBench - Whether this is a bench slot
     */
    renderUnit(unit, cell, side = 'ally', isBench = false) {
        // Get unit template data
        const templateData = UNITS[unit.unitId || unit.templateId];
        if (!templateData) {
            console.warn('[Renderer] Unknown unit template:', unit.unitId || unit.templateId);
            return null;
        }

        // Create unit element
        const unitElement = document.createElement('div');
        unitElement.className = 'unit';
        unitElement.classList.add(side);
        unitElement.dataset.unitId = unit.id;

        // Add rarity class based on cost
        const rarityClass = this.getCostRarityClass(templateData.cost);
        if (rarityClass) {
            unitElement.classList.add(rarityClass);
        }

        // Star level indicator
        const starsElement = document.createElement('div');
        starsElement.className = 'unit-stars';
        starsElement.textContent = '⭐'.repeat(unit.starLevel);
        unitElement.appendChild(starsElement);

        // Unit emoji
        const emojiElement = document.createElement('div');
        emojiElement.className = 'unit-emoji';
        emojiElement.textContent = templateData.emoji;
        unitElement.appendChild(emojiElement);

        // Health bar (only during combat or if unit has current HP)
        if (unit.currentHp !== null && unit.currentHp !== undefined) {
            const healthBar = this.createHealthBar(unit);
            unitElement.appendChild(healthBar);
        }

        // Mana bar (only during combat)
        if (unit.currentMana !== undefined && unit.maxMana) {
            const manaBar = this.createManaBar(unit);
            unitElement.appendChild(manaBar);
        }

        // Make unit draggable during prep phase
        if (side === 'ally' && window.gameState && window.gameState.isPrep()) {
            unitElement.draggable = true;
            unitElement.addEventListener('dragstart', (e) => this.onUnitDragStart(e, unit));
            unitElement.addEventListener('dragend', (e) => this.onUnitDragEnd(e));
        }

        // Add spawn animation for new units
        unitElement.classList.add('spawning');
        setTimeout(() => {
            unitElement.classList.remove('spawning');
        }, 400);

        cell.appendChild(unitElement);
        this.unitElements.set(unit.id, unitElement);

        return unitElement;
    }

    /**
     * Create health bar element
     */
    createHealthBar(unit) {
        const container = document.createElement('div');
        container.className = 'unit-health-bar';

        const fill = document.createElement('div');
        fill.className = 'unit-health-fill';

        // Calculate HP stats
        const maxHp = unit.effectiveMaxHp || unit.maxHp || this.getUnitMaxHp(unit);
        const currentHp = unit.currentHp || maxHp;
        const hpPercent = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));

        fill.style.width = `${hpPercent}%`;

        // Color based on HP percentage
        if (hpPercent <= 25) {
            fill.classList.add('critical');
        } else if (hpPercent <= 50) {
            fill.classList.add('low');
        }

        container.appendChild(fill);
        return container;
    }

    /**
     * Create mana bar element
     */
    createManaBar(unit) {
        const container = document.createElement('div');
        container.className = 'unit-mana-bar';

        const fill = document.createElement('div');
        fill.className = 'unit-mana-fill';

        const maxMana = unit.maxMana || GAME_CONFIG.MAX_MANA;
        const currentMana = unit.currentMana || 0;
        const manaPercent = Math.max(0, Math.min(100, (currentMana / maxMana) * 100));

        fill.style.width = `${manaPercent}%`;

        container.appendChild(fill);
        return container;
    }

    /**
     * Get max HP for a unit
     */
    getUnitMaxHp(unit) {
        const template = UNITS[unit.unitId || unit.templateId];
        if (!template) return 100;

        const starMultiplier = STAR_MULTIPLIERS[unit.starLevel] || STAR_MULTIPLIERS[1];
        return Math.floor(template.hp * starMultiplier.hp);
    }

    /**
     * Get rarity class based on unit cost
     */
    getCostRarityClass(cost) {
        const rarityMap = {
            1: 'rarity-common',
            2: 'rarity-uncommon',
            3: 'rarity-rare',
            4: 'rarity-epic',
            5: 'rarity-legendary'
        };
        return rarityMap[cost] || 'rarity-common';
    }

    // ========================================================================
    // HEALTH BAR UPDATES
    // ========================================================================

    /**
     * Update a unit's health bar
     * @param {Object} unit - Unit with updated HP
     */
    updateHealthBar(unit) {
        const unitElement = this.unitElements.get(unit.id);
        if (!unitElement) return;

        const healthBar = unitElement.querySelector('.unit-health-fill');
        if (!healthBar) return;

        const maxHp = unit.effectiveMaxHp || unit.maxHp || this.getUnitMaxHp(unit);
        const currentHp = Math.max(0, unit.currentHp || 0);
        const hpPercent = (currentHp / maxHp) * 100;

        healthBar.style.width = `${hpPercent}%`;

        // Update color classes
        healthBar.classList.remove('low', 'critical');
        if (hpPercent <= 25) {
            healthBar.classList.add('critical');
        } else if (hpPercent <= 50) {
            healthBar.classList.add('low');
        }
    }

    /**
     * Update a unit's mana bar
     * @param {Object} unit - Unit with updated mana
     */
    updateManaBar(unit) {
        const unitElement = this.unitElements.get(unit.id);
        if (!unitElement) return;

        const manaBar = unitElement.querySelector('.unit-mana-fill');
        if (!manaBar) return;

        const maxMana = unit.maxMana || GAME_CONFIG.MAX_MANA;
        const currentMana = unit.currentMana || 0;
        const manaPercent = (currentMana / maxMana) * 100;

        manaBar.style.width = `${manaPercent}%`;
    }

    // ========================================================================
    // DAMAGE NUMBERS
    // ========================================================================

    /**
     * Show floating damage number above a unit
     * @param {Object} unit - Unit that took damage
     * @param {number} amount - Damage amount
     * @param {string} type - 'damage', 'heal', or 'crit'
     */
    showDamage(unit, amount, type = 'damage') {
        const unitElement = this.unitElements.get(unit.id);
        if (!unitElement) return;

        const damageNumber = document.createElement('div');
        damageNumber.className = 'damage-number';

        if (type === 'heal') {
            damageNumber.classList.add('heal');
            damageNumber.textContent = `+${amount}`;
        } else if (type === 'crit') {
            damageNumber.classList.add('crit');
            damageNumber.textContent = `${amount}!`;
        } else {
            damageNumber.textContent = `-${amount}`;
        }

        // Random horizontal offset for variety
        const offsetX = (Math.random() - 0.5) * 30;
        damageNumber.style.left = `calc(50% + ${offsetX}px)`;
        damageNumber.style.top = '-10px';

        unitElement.appendChild(damageNumber);

        // Remove after animation completes
        setTimeout(() => {
            damageNumber.remove();
        }, this.config.damageNumberDuration);
    }

    // ========================================================================
    // ATTACK ANIMATIONS
    // ========================================================================

    /**
     * Animate a unit attacking
     * @param {Object} attacker - Unit performing the attack
     * @param {Object} target - Unit being attacked (optional, for direction)
     */
    animateAttack(attacker, target = null) {
        const unitElement = this.unitElements.get(attacker.id);
        if (!unitElement) return;

        // Determine attack direction
        let direction = 'right';
        if (target && attacker.x !== undefined && target.x !== undefined) {
            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;

            if (Math.abs(dx) > Math.abs(dy)) {
                direction = dx > 0 ? 'right' : 'left';
            } else {
                direction = dy > 0 ? 'down' : 'up';
            }
        }

        // Add attack animation class
        const animClass = `attacking-${direction}`;
        unitElement.classList.add(animClass);

        // Change state indicator
        unitElement.classList.add('attacking');

        // Remove animation class after animation completes
        setTimeout(() => {
            unitElement.classList.remove(animClass);
            unitElement.classList.remove('attacking');
        }, this.config.animationDuration);
    }

    /**
     * Animate a unit taking damage
     * @param {Object} unit - Unit taking damage
     */
    animateTakeDamage(unit) {
        const unitElement = this.unitElements.get(unit.id);
        if (!unitElement) return;

        unitElement.classList.add('taking-damage');

        setTimeout(() => {
            unitElement.classList.remove('taking-damage');
        }, 400);
    }

    /**
     * Animate a unit dying
     * @param {Object} unit - Unit that died
     */
    animateDeath(unit) {
        const unitElement = this.unitElements.get(unit.id);
        if (!unitElement) return;

        unitElement.classList.add('dying');

        setTimeout(() => {
            unitElement.remove();
            this.unitElements.delete(unit.id);
        }, 500);
    }

    /**
     * Animate ability cast
     * @param {Object} unit - Unit casting ability
     */
    animateCast(unit) {
        const unitElement = this.unitElements.get(unit.id);
        if (!unitElement) return;

        unitElement.classList.add('casting');

        setTimeout(() => {
            unitElement.classList.remove('casting');
        }, 600);
    }

    /**
     * Animate unit movement
     * @param {Object} unit - Unit that moved
     * @param {number} fromX - Previous X position
     * @param {number} fromY - Previous Y position
     */
    animateMove(unit, fromX, fromY) {
        const unitElement = this.unitElements.get(unit.id);
        if (!unitElement) return;

        // Calculate movement direction
        const dx = unit.x - fromX;
        const dy = unit.y - fromY;

        // Apply temporary transform for smooth animation
        unitElement.style.transition = 'transform 0.2s ease-out';
        unitElement.style.transform = `translate(${-dx * 100}%, ${-dy * 100}%)`;

        // Reset after short delay
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                unitElement.style.transform = '';
                setTimeout(() => {
                    unitElement.style.transition = '';
                }, 200);
            });
        });
    }

    // ========================================================================
    // CELL HIGHLIGHTING
    // ========================================================================

    /**
     * Highlight cells for valid placement
     * @param {Array} cells - Array of {row, col} positions to highlight
     */
    highlightCells(cells) {
        // Clear previous highlights
        this.clearHighlights();

        if (!cells || cells.length === 0) return;

        cells.forEach(pos => {
            // Adjust row for display (player area is bottom half)
            const displayRow = pos.row + this.config.playerRows;

            if (this.cells[displayRow] && this.cells[displayRow][pos.col]) {
                const cell = this.cells[displayRow][pos.col];
                cell.classList.add('valid-move');
                this.highlightedCells.add(`${displayRow},${pos.col}`);
            }
        });
    }

    /**
     * Clear all cell highlights
     */
    clearHighlights() {
        this.highlightedCells.forEach(key => {
            const [row, col] = key.split(',').map(Number);
            if (this.cells[row] && this.cells[row][col]) {
                this.cells[row][col].classList.remove('valid-move', 'invalid');
            }
        });
        this.highlightedCells.clear();
    }

    /**
     * Highlight valid placement cells for a unit
     * @param {Object} unit - Unit being placed
     */
    highlightValidPlacements(unit) {
        const state = window.gameState;
        if (!state) return;

        const validCells = [];
        const teamSize = state.getTeamSize();
        const maxTeam = state.level;
        const unitIsOnBoard = unit.position !== null;

        // Check each cell in player area
        for (let row = 0; row < this.config.playerRows; row++) {
            for (let col = 0; col < this.config.boardCols; col++) {
                const occupied = state.playerBoard[row][col] !== null;

                // Cell is valid if empty, or if swapping and within team limit
                if (!occupied || (unitIsOnBoard && teamSize <= maxTeam)) {
                    validCells.push({ row, col });
                }
            }
        }

        this.highlightCells(validCells);
    }

    /**
     * Set cell as selected
     * @param {number} row - Row index
     * @param {number} col - Column index
     */
    selectCell(row, col) {
        this.clearSelection();
        if (this.cells[row] && this.cells[row][col]) {
            this.cells[row][col].classList.add('selected');
        }
    }

    /**
     * Clear cell selection
     */
    clearSelection() {
        this.cells.forEach(row => {
            row.forEach(cell => {
                cell.classList.remove('selected');
            });
        });
    }

    // ========================================================================
    // DRAG AND DROP HANDLERS
    // ========================================================================

    /**
     * Handle unit drag start
     */
    onUnitDragStart(e, unit) {
        this.selectedUnit = unit;
        e.dataTransfer.setData('text/plain', unit.id);
        e.dataTransfer.effectAllowed = 'move';

        const unitElement = e.target;
        unitElement.classList.add('dragging');

        // Highlight valid drop locations
        this.highlightValidPlacements(unit);
    }

    /**
     * Handle unit drag end
     */
    onUnitDragEnd(e) {
        const unitElement = e.target;
        unitElement.classList.remove('dragging');

        this.clearHighlights();
        this.selectedUnit = null;
    }

    /**
     * Handle drag over cell
     */
    onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    /**
     * Handle drag enter cell
     */
    onDragEnter(e) {
        e.preventDefault();
        e.target.classList.add('drag-over');
    }

    /**
     * Handle drag leave cell
     */
    onDragLeave(e) {
        e.target.classList.remove('drag-over');
    }

    /**
     * Handle drop on board cell
     */
    onDrop(e, row, col) {
        e.preventDefault();
        e.target.classList.remove('drag-over');

        const unitId = e.dataTransfer.getData('text/plain');
        if (!unitId) return;

        // Convert display row to board row (subtract playerRows for player area)
        const isPlayerArea = row >= this.config.playerRows;
        if (!isPlayerArea) {
            console.log('[Renderer] Cannot place units in enemy area');
            return;
        }

        const boardRow = row - this.config.playerRows;

        // Emit placement event
        if (window.game && typeof window.game.onUnitPlacement === 'function') {
            window.game.onUnitPlacement(unitId, boardRow, col);
        } else {
            // Direct state manipulation fallback
            const state = window.gameState;
            const unit = state.ownedUnits.get(unitId);
            if (unit) {
                state.placeUnitOnBoard(unit, boardRow, col);
                this.renderBoard();
            }
        }

        this.clearHighlights();
    }

    /**
     * Handle drop on bench slot
     */
    onBenchDrop(e, index) {
        e.preventDefault();
        e.target.classList.remove('drag-over');

        const unitId = e.dataTransfer.getData('text/plain');
        if (!unitId) return;

        // Emit bench placement event
        if (window.game && typeof window.game.onUnitBenchPlacement === 'function') {
            window.game.onUnitBenchPlacement(unitId, index);
        } else {
            // Direct state manipulation fallback
            const state = window.gameState;
            const unit = state.ownedUnits.get(unitId);
            if (unit) {
                state.addUnitToBench(unit);
                this.renderBoard();
            }
        }

        this.clearHighlights();
    }

    /**
     * Handle cell click
     */
    onCellClick(e, row, col) {
        const cell = this.cells[row][col];
        const unitElement = cell.querySelector('.unit');

        if (unitElement) {
            const unitId = unitElement.dataset.unitId;
            this.onUnitClick(unitId, row, col);
        } else {
            this.onEmptyCellClick(row, col);
        }
    }

    /**
     * Handle unit click
     */
    onUnitClick(unitId, row, col) {
        // Emit unit selected event
        if (window.game && typeof window.game.onUnitSelected === 'function') {
            window.game.onUnitSelected(unitId);
        }

        // Show unit tooltip
        this.showUnitTooltip(unitId, row, col);
    }

    /**
     * Handle empty cell click
     */
    onEmptyCellClick(row, col) {
        this.clearSelection();
        this.hideUnitTooltip();
    }

    /**
     * Handle bench click
     */
    onBenchClick(e, index) {
        const slot = this.benchCells[index];
        const unitElement = slot.querySelector('.unit');

        if (unitElement) {
            const unitId = unitElement.dataset.unitId;
            this.onUnitClick(unitId, -1, index);
        }
    }

    // ========================================================================
    // TOOLTIP
    // ========================================================================

    /**
     * Show unit tooltip
     */
    showUnitTooltip(unitId, row, col) {
        const tooltip = document.getElementById('unit-tooltip');
        if (!tooltip) return;

        const state = window.gameState;
        const unit = state.ownedUnits.get(unitId);
        if (!unit) return;

        const template = UNITS[unit.unitId];
        if (!template) return;

        const stats = unit.getStats ? unit.getStats() : getUnitStatsAtStar(unit.unitId, unit.starLevel);

        tooltip.innerHTML = `
            <div class="tooltip-header">
                <span class="tooltip-emoji">${template.emoji}</span>
                <div>
                    <div class="tooltip-name">${template.name} ${'⭐'.repeat(unit.starLevel)}</div>
                    <div class="shop-card-synergies">
                        ${template.traits.map(t => `<span class="synergy-tag ${t}">${t}</span>`).join('')}
                    </div>
                </div>
            </div>
            <div class="tooltip-stats">
                <div class="tooltip-stat">
                    <span class="stat-icon">❤️</span>
                    <span class="stat-label">HP:</span>
                    <span class="stat-value">${stats.hp}</span>
                </div>
                <div class="tooltip-stat">
                    <span class="stat-icon">⚔️</span>
                    <span class="stat-label">ATK:</span>
                    <span class="stat-value">${stats.attack}</span>
                </div>
                <div class="tooltip-stat">
                    <span class="stat-icon">🛡️</span>
                    <span class="stat-label">Armor:</span>
                    <span class="stat-value">${template.armor}</span>
                </div>
                <div class="tooltip-stat">
                    <span class="stat-icon">✨</span>
                    <span class="stat-label">M.Res:</span>
                    <span class="stat-value">${template.magicResist}</span>
                </div>
                <div class="tooltip-stat">
                    <span class="stat-icon">🏹</span>
                    <span class="stat-label">Range:</span>
                    <span class="stat-value">${template.range}</span>
                </div>
                <div class="tooltip-stat">
                    <span class="stat-icon">⚡</span>
                    <span class="stat-label">AS:</span>
                    <span class="stat-value">${template.attackSpeed.toFixed(2)}</span>
                </div>
            </div>
            ${template.ability ? `
                <div class="tooltip-ability">
                    <strong>${template.ability.name}</strong>
                    ${template.ability.damage ? ` - ${template.ability.damage} dmg` : ''}
                    ${template.ability.manaCost ? ` (${template.ability.manaCost} mana)` : ''}
                </div>
            ` : ''}
        `;

        // Position tooltip near the cell
        const cell = row >= 0 ? this.cells[row][col] : this.benchCells[col];
        if (cell) {
            const rect = cell.getBoundingClientRect();
            tooltip.style.left = `${rect.right + 10}px`;
            tooltip.style.top = `${rect.top}px`;
        }

        tooltip.classList.remove('hidden');
        tooltip.classList.add('visible');
    }

    /**
     * Hide unit tooltip
     */
    hideUnitTooltip() {
        const tooltip = document.getElementById('unit-tooltip');
        if (tooltip) {
            tooltip.classList.remove('visible');
            tooltip.classList.add('hidden');
        }
    }

    // ========================================================================
    // COMBAT RENDERING
    // ========================================================================

    /**
     * Update display during combat tick
     * @param {Object} combatState - Current combat state
     */
    updateCombat(combatState) {
        if (!combatState) return;

        // Update all unit positions and health
        const allUnits = [...(combatState.playerUnits || []), ...(combatState.enemyUnits || [])];

        allUnits.forEach(unit => {
            if (unit.isAlive !== false) {
                this.updateHealthBar(unit);
                this.updateManaBar(unit);
            }
        });
    }

    /**
     * Render combat state (called when combat starts)
     * @param {Object} combatState - Combat state with playerUnits and enemyUnits
     */
    renderCombatState(combatState) {
        if (!combatState) return;

        // Clear board
        this.clearAllUnits();

        // Render player units
        if (combatState.playerUnits) {
            combatState.playerUnits.forEach(unit => {
                if (unit.isAlive !== false && unit.x !== null && unit.y !== null) {
                    // Map combat position to display position
                    const displayRow = unit.y + this.config.playerRows;
                    if (this.cells[displayRow] && this.cells[displayRow][unit.x]) {
                        this.renderUnit(unit, this.cells[displayRow][unit.x], 'ally');
                    }
                }
            });
        }

        // Render enemy units
        if (combatState.enemyUnits) {
            combatState.enemyUnits.forEach(unit => {
                if (unit.isAlive !== false && unit.x !== null && unit.y !== null) {
                    // Enemy units are in top half, mirrored
                    const displayRow = this.config.playerRows - 1 - unit.y;
                    if (this.cells[displayRow] && this.cells[displayRow][unit.x]) {
                        this.renderUnit(unit, this.cells[displayRow][unit.x], 'enemy');
                    }
                }
            });
        }
    }

    // ========================================================================
    // STATE UPDATE HANDLING
    // ========================================================================

    /**
     * Called when game state changes - refreshes the entire board
     */
    onStateChange() {
        this.renderBoard();
    }

    /**
     * Refresh specific unit
     * @param {string} unitId - Unit ID to refresh
     */
    refreshUnit(unitId) {
        const state = window.gameState;
        const unit = state.ownedUnits.get(unitId);
        if (!unit) return;

        // Find the unit's current location and re-render
        if (unit.position) {
            const displayRow = unit.position.y + this.config.playerRows;
            const cell = this.cells[displayRow][unit.position.x];

            // Remove old element
            const oldElement = this.unitElements.get(unitId);
            if (oldElement) {
                oldElement.remove();
            }

            // Render new element
            this.renderUnit(unit, cell, 'ally');
        } else if (unit.isOnBench && unit.benchIndex !== null) {
            const slot = this.benchCells[unit.benchIndex];

            // Remove old element
            const oldElement = this.unitElements.get(unitId);
            if (oldElement) {
                oldElement.remove();
            }

            // Render new element
            this.renderUnit(unit, slot, 'ally', true);
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Get cell at display position
     */
    getCell(row, col) {
        if (this.cells[row] && this.cells[row][col]) {
            return this.cells[row][col];
        }
        return null;
    }

    /**
     * Get unit element by ID
     */
    getUnitElement(unitId) {
        return this.unitElements.get(unitId);
    }

    /**
     * Flash a cell (for feedback)
     */
    flashCell(row, col, className = 'invalid') {
        const cell = this.getCell(row, col);
        if (!cell) return;

        cell.classList.add(className);
        setTimeout(() => {
            cell.classList.remove(className);
        }, 300);
    }

    /**
     * Show a message overlay on the board
     */
    showBoardMessage(message, duration = 2000) {
        const existingMessage = this.boardGrid.querySelector('.board-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const messageElement = document.createElement('div');
        messageElement.className = 'board-message';
        messageElement.textContent = message;
        messageElement.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px 40px;
            border-radius: 8px;
            font-size: 1.5rem;
            font-weight: bold;
            z-index: 100;
            animation: fade-in 0.3s ease-out;
        `;

        this.boardGrid.appendChild(messageElement);

        if (duration > 0) {
            setTimeout(() => {
                messageElement.style.animation = 'fade-out 0.3s ease-out forwards';
                setTimeout(() => messageElement.remove(), 300);
            }, duration);
        }

        return messageElement;
    }

    /**
     * Create projectile animation between two units
     */
    createProjectile(from, to, emoji = '💫') {
        const fromElement = this.unitElements.get(from.id);
        const toElement = this.unitElements.get(to.id);

        if (!fromElement || !toElement) return;

        const fromRect = fromElement.getBoundingClientRect();
        const toRect = toElement.getBoundingClientRect();

        const projectile = document.createElement('div');
        projectile.className = 'projectile';
        projectile.textContent = emoji;
        projectile.style.left = `${fromRect.left + fromRect.width / 2}px`;
        projectile.style.top = `${fromRect.top + fromRect.height / 2}px`;

        document.body.appendChild(projectile);

        // Animate to target
        requestAnimationFrame(() => {
            projectile.style.transition = 'all 0.3s ease-out';
            projectile.style.left = `${toRect.left + toRect.width / 2}px`;
            projectile.style.top = `${toRect.top + toRect.height / 2}px`;
        });

        setTimeout(() => {
            projectile.remove();
        }, 300);
    }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

// Create global renderer instance
window.renderer = new Renderer();

// Expose class for other modules
window.Renderer = Renderer;

console.log('[Renderer] Renderer module loaded');
