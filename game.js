/**
 * Auto Chess Main Game Controller
 * Entry point that orchestrates all game systems and manages game flow
 */

// ============================================================================
// GAME CONFIGURATION
// ============================================================================

const PREP_PHASE_DURATION = 30; // seconds
const COMBAT_SPEED = 1; // Multiplier for combat speed
const RESULTS_DISPLAY_DURATION = 2000; // ms to show results before next round

// ============================================================================
// GAME CLASS
// ============================================================================

class Game {
    constructor() {
        // Core systems
        this.state = null;
        this.shop = null;
        this.combat = null;
        this.ai = null;
        this.traitSystem = null;
        this.renderer = null;

        // Timer state
        this.prepTimer = null;
        this.prepTimeRemaining = PREP_PHASE_DURATION;
        this.timerInterval = null;

        // Combat state
        this.currentEnemyUnits = [];
        this.combatPromise = null;

        // UI update callbacks
        this.onStateChange = null;

        console.log('[Game] Game controller created');
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize all game systems
     */
    init() {
        console.log('[Game] Initializing game systems...');

        // Initialize game state (already created by state.js)
        this.state = window.gameState;
        this.state.reset();

        // Initialize shop system
        this.shop = new Shop(this.state);

        // Initialize combat system
        this.combat = new Combat();

        // Initialize AI opponent
        this.ai = new AI();

        // Initialize trait system
        this.traitSystem = new TraitSystem();

        // Initialize renderer (already created by renderer.js)
        this.renderer = window.renderer;
        this.renderer.init();

        // Set up UI event handlers
        this.setupUI();

        // Expose game instance globally for renderer callbacks
        window.game = this;

        // Start the first round
        this.startRound();

        console.log('[Game] Game initialized successfully');
    }

    /**
     * Set up UI event handlers
     */
    setupUI() {
        // Buy XP button
        const buyXpBtn = document.getElementById('buy-xp-btn');
        if (buyXpBtn) {
            buyXpBtn.addEventListener('click', () => this.buyXP());
        }

        // Refresh shop button
        const refreshBtn = document.getElementById('refresh-shop-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshShop());
        }

        // Lock shop button
        const lockBtn = document.getElementById('lock-shop-btn');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => this.toggleShopLock());
        }

        // Shop slot click handlers
        const shopSlots = document.querySelectorAll('.shop-slot');
        shopSlots.forEach((slot, index) => {
            slot.addEventListener('click', () => this.buyUnit(index));
        });

        // Restart button
        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.restart());
        }
    }

    // ========================================================================
    // ROUND MANAGEMENT
    // ========================================================================

    /**
     * Start a new round (prep phase)
     */
    startRound() {
        console.log(`[Game] Starting round ${this.state.round}`);

        // Collect income and XP at round start (except round 1)
        if (this.state.round > 1) {
            const income = this.state.startRound();
            this.showIncomeNotification(income);
        }

        // Generate shop for new round
        this.shop.onRoundStart();

        // Generate AI enemy board for this round
        this.currentEnemyUnits = this.ai.generateBoard(this.state.round);

        // Calculate and display traits
        this.updateTraits();

        // Start prep phase timer
        this.startPrepTimer();

        // Update all UI
        this.updateUI();

        // Render the board
        this.renderer.renderBoard();
    }

    /**
     * Start the preparation phase timer
     */
    startPrepTimer() {
        this.prepTimeRemaining = PREP_PHASE_DURATION;
        this.updateTimerDisplay();

        // Clear any existing timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timerInterval = setInterval(() => {
            this.prepTimeRemaining--;
            this.updateTimerDisplay();

            if (this.prepTimeRemaining <= 0) {
                this.startCombat();
            }
        }, 1000);
    }

    /**
     * Stop the prep timer
     */
    stopPrepTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * Update the timer display in the UI
     */
    updateTimerDisplay() {
        const phaseIndicator = document.getElementById('phase-indicator');
        if (phaseIndicator) {
            if (this.state.isPrep()) {
                phaseIndicator.textContent = `Prep Phase: ${this.prepTimeRemaining}s`;
            } else if (this.state.isCombat()) {
                phaseIndicator.textContent = 'Combat!';
            } else if (this.state.isGameOver()) {
                phaseIndicator.textContent = 'Game Over';
            }
        }
    }

    // ========================================================================
    // COMBAT
    // ========================================================================

    /**
     * Start the combat phase
     */
    async startCombat() {
        console.log('[Game] Starting combat phase');

        // Stop prep timer
        this.stopPrepTimer();

        // Set game phase to combat
        this.state.startCombat();
        this.updateTimerDisplay();

        // Get player units from board
        const playerUnits = this.getPlayerCombatUnits();

        // Check if player has units
        if (playerUnits.length === 0) {
            console.log('[Game] No player units on board, auto-lose');
            this.endCombat({
                winner: 'enemy',
                damageToPlayer: this.calculateDamage(this.currentEnemyUnits),
                survivingEnemyUnits: this.currentEnemyUnits
            });
            return;
        }

        // Check if enemy has units
        if (this.currentEnemyUnits.length === 0) {
            console.log('[Game] No enemy units, auto-win');
            this.endCombat({
                winner: 'player',
                damageToEnemy: this.calculateDamage(playerUnits),
                survivingPlayerUnits: playerUnits
            });
            return;
        }

        // Apply trait bonuses to player units
        this.traitSystem.calculateTraits(playerUnits);
        this.traitSystem.applyBonuses(playerUnits);

        // Set up combat tick callback for rendering
        this.combat.onTick = (state) => {
            this.renderer.updateCombat(state);
        };

        // Render initial combat state
        this.renderCombatBoard(playerUnits, this.currentEnemyUnits);

        // Run combat (async)
        try {
            const result = await this.combat.start(playerUnits, this.currentEnemyUnits);
            this.endCombat(result);
        } catch (error) {
            console.error('[Game] Combat error:', error);
            // Fallback: run sync combat
            const result = this.combat.runSync(playerUnits, this.currentEnemyUnits);
            this.endCombat(result);
        }
    }

    /**
     * Get player units configured for combat
     * @returns {Unit[]} Array of Unit instances ready for combat
     */
    getPlayerCombatUnits() {
        const units = [];
        const unitsOnBoard = this.state.getUnitsOnBoard();

        for (const unitInstance of unitsOnBoard) {
            // Create combat unit from unit instance
            const unit = new Unit(unitInstance.unitId, unitInstance.starLevel);
            unit.setPosition(unitInstance.position.x, unitInstance.position.y);
            unit.ownerId = 'player';
            units.push(unit);
        }

        return units;
    }

    /**
     * Calculate damage based on surviving units
     * @param {Unit[]} survivingUnits - Array of surviving units
     * @returns {number} Damage to deal
     */
    calculateDamage(survivingUnits) {
        let damage = 2; // Base damage

        for (const unit of survivingUnits) {
            damage += unit.starLevel || 1;
        }

        return damage;
    }

    /**
     * Render the combat board with positioned units
     */
    renderCombatBoard(playerUnits, enemyUnits) {
        const combatState = {
            playerUnits: playerUnits,
            enemyUnits: enemyUnits
        };
        this.renderer.renderCombatState(combatState);
    }

    /**
     * End combat and process results
     * @param {CombatResult} result - Combat result object
     */
    endCombat(result) {
        console.log('[Game] Combat ended:', result.winner);

        const won = result.winner === 'player';
        const damage = won ? 0 : result.damageToPlayer || 0;

        // Update game state with combat result
        this.state.endCombat(won, damage);

        // Show result message
        this.showCombatResult(result);

        // Check for game over
        if (this.state.isGameOver()) {
            this.gameOver();
            return;
        }

        // Proceed to next round after delay
        setTimeout(() => {
            this.nextRound();
        }, RESULTS_DISPLAY_DURATION);
    }

    /**
     * Show combat result notification
     */
    showCombatResult(result) {
        const message = result.winner === 'player'
            ? 'Victory!'
            : result.winner === 'enemy'
            ? `Defeat! -${result.damageToPlayer || 0} HP`
            : 'Draw!';

        this.renderer.showBoardMessage(message, RESULTS_DISPLAY_DURATION);
    }

    /**
     * Proceed to the next round
     */
    nextRound() {
        console.log('[Game] Proceeding to next round');

        // Start new round
        this.startRound();
    }

    // ========================================================================
    // GAME OVER
    // ========================================================================

    /**
     * Handle game over state
     */
    gameOver() {
        console.log('[Game] Game Over!');

        // Stop any timers
        this.stopPrepTimer();

        // Calculate final score
        const score = this.calculateScore();

        // Show game over modal
        this.showGameOverModal(score);
    }

    /**
     * Calculate final score
     */
    calculateScore() {
        return {
            roundsPlayed: this.state.round - 1,
            wins: this.state.wins,
            losses: this.state.losses,
            goldEarned: this.state.stats.totalGoldEarned,
            unitsUpgraded: this.state.stats.unitsUpgraded,
            // Simple score formula
            total: (this.state.round - 1) * 100 + this.state.wins * 50 + this.state.stats.unitsUpgraded * 25
        };
    }

    /**
     * Show game over modal with score
     */
    showGameOverModal(score) {
        const modal = document.getElementById('game-over-modal');
        const title = document.getElementById('game-over-title');
        const message = document.getElementById('game-over-message');

        if (modal && title && message) {
            title.textContent = 'Game Over';
            message.innerHTML = `
                <div class="score-display">
                    <p><strong>Rounds Survived:</strong> ${score.roundsPlayed}</p>
                    <p><strong>Wins:</strong> ${score.wins} | <strong>Losses:</strong> ${score.losses}</p>
                    <p><strong>Units Upgraded:</strong> ${score.unitsUpgraded}</p>
                    <p class="final-score"><strong>Final Score:</strong> ${score.total}</p>
                </div>
            `;

            modal.classList.remove('hidden');
        }
    }

    /**
     * Hide game over modal
     */
    hideGameOverModal() {
        const modal = document.getElementById('game-over-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Restart the game
     */
    restart() {
        console.log('[Game] Restarting game');

        // Hide game over modal
        this.hideGameOverModal();

        // Reset game state
        this.state.reset();

        // Reinitialize shop
        this.shop = new Shop(this.state);

        // Start fresh
        this.startRound();
    }

    // ========================================================================
    // SHOP ACTIONS
    // ========================================================================

    /**
     * Buy a unit from the shop
     * @param {number} slotIndex - Shop slot index (0-4)
     */
    buyUnit(slotIndex) {
        if (!this.state.isPrep()) {
            console.log('[Game] Can only buy units during prep phase');
            return;
        }

        const result = this.shop.buyUnit(slotIndex);

        if (result.success) {
            console.log(`[Game] Bought unit from slot ${slotIndex}`);

            // Update traits if unit was upgraded
            if (result.upgraded) {
                this.updateTraits();
            }

            // Update UI
            this.updateUI();
            this.renderer.renderBoard();
        } else {
            console.log(`[Game] Failed to buy unit: ${result.error}`);
            // Could show error notification here
        }
    }

    /**
     * Refresh the shop
     */
    refreshShop() {
        if (!this.state.isPrep()) {
            console.log('[Game] Can only refresh shop during prep phase');
            return;
        }

        const result = this.shop.refresh(false);

        if (result.success) {
            console.log('[Game] Shop refreshed');
            this.updateUI();
        } else {
            console.log(`[Game] Failed to refresh shop: ${result.error}`);
        }
    }

    /**
     * Toggle shop lock
     */
    toggleShopLock() {
        const locked = this.shop.toggleLock();
        console.log(`[Game] Shop ${locked ? 'locked' : 'unlocked'}`);
        this.updateLockButton();
    }

    /**
     * Buy XP
     */
    buyXP() {
        if (!this.state.isPrep()) {
            console.log('[Game] Can only buy XP during prep phase');
            return;
        }

        if (this.state.buyXP()) {
            console.log('[Game] Bought XP');
            this.updateUI();
        } else {
            console.log('[Game] Failed to buy XP');
        }
    }

    // ========================================================================
    // UNIT PLACEMENT (called by renderer)
    // ========================================================================

    /**
     * Handle unit placement on board
     * @param {string} unitId - Unit ID
     * @param {number} row - Board row
     * @param {number} col - Board column
     */
    onUnitPlacement(unitId, row, col) {
        if (!this.state.isPrep()) {
            console.log('[Game] Can only place units during prep phase');
            return;
        }

        const unit = this.state.ownedUnits.get(unitId);
        if (!unit) {
            console.log('[Game] Unit not found:', unitId);
            return;
        }

        // Check if there's already a unit at the target position
        const existingUnitId = this.state.playerBoard[row][col];

        if (existingUnitId && existingUnitId !== unitId) {
            // Swap units
            const existingUnit = this.state.ownedUnits.get(existingUnitId);
            if (existingUnit && unit.position) {
                // Store original positions
                const originalPos = unit.position ? { ...unit.position } : null;
                const originalBenchIndex = unit.benchIndex;
                const wasOnBench = unit.isOnBench;

                // Remove both units from current positions
                this.state.removeUnitFromCurrentLocation(unit);
                this.state.removeUnitFromCurrentLocation(existingUnit);

                // Place unit at new position
                this.state.playerBoard[row][col] = unit.id;
                unit.position = { x: col, y: row };
                unit.isOnBench = false;
                unit.benchIndex = null;

                // Place existing unit at original position
                if (wasOnBench) {
                    this.state.bench[originalBenchIndex] = existingUnit.id;
                    existingUnit.isOnBench = true;
                    existingUnit.benchIndex = originalBenchIndex;
                    existingUnit.position = null;
                } else if (originalPos) {
                    this.state.playerBoard[originalPos.y][originalPos.x] = existingUnit.id;
                    existingUnit.position = originalPos;
                    existingUnit.isOnBench = false;
                }
            }
        } else {
            // Normal placement
            this.state.placeUnitOnBoard(unit, row, col);
        }

        // Update traits and render
        this.updateTraits();
        this.updateUI();
        this.renderer.renderBoard();
    }

    /**
     * Handle unit placement on bench
     * @param {string} unitId - Unit ID
     * @param {number} benchIndex - Bench slot index
     */
    onUnitBenchPlacement(unitId, benchIndex) {
        if (!this.state.isPrep()) {
            console.log('[Game] Can only move units during prep phase');
            return;
        }

        const unit = this.state.ownedUnits.get(unitId);
        if (!unit) {
            console.log('[Game] Unit not found:', unitId);
            return;
        }

        // Check if there's already a unit at the bench slot
        const existingUnitId = this.state.bench[benchIndex];

        if (existingUnitId && existingUnitId !== unitId) {
            // Swap with existing bench unit
            const existingUnit = this.state.ownedUnits.get(existingUnitId);
            if (existingUnit) {
                const originalPos = unit.position ? { ...unit.position } : null;
                const originalBenchIndex = unit.benchIndex;
                const wasOnBench = unit.isOnBench;

                // Remove both from current locations
                this.state.removeUnitFromCurrentLocation(unit);
                this.state.removeUnitFromCurrentLocation(existingUnit);

                // Place unit on bench
                this.state.bench[benchIndex] = unit.id;
                unit.isOnBench = true;
                unit.benchIndex = benchIndex;
                unit.position = null;

                // Place existing unit at original location
                if (wasOnBench) {
                    this.state.bench[originalBenchIndex] = existingUnit.id;
                    existingUnit.isOnBench = true;
                    existingUnit.benchIndex = originalBenchIndex;
                } else if (originalPos) {
                    this.state.playerBoard[originalPos.y][originalPos.x] = existingUnit.id;
                    existingUnit.position = originalPos;
                    existingUnit.isOnBench = false;
                }
            }
        } else {
            // Normal bench placement
            this.state.addUnitToBench(unit);
        }

        this.updateTraits();
        this.updateUI();
        this.renderer.renderBoard();
    }

    /**
     * Handle unit selection
     * @param {string} unitId - Selected unit ID
     */
    onUnitSelected(unitId) {
        // Could be used for selling or showing detailed info
        console.log('[Game] Unit selected:', unitId);
    }

    /**
     * Sell a unit
     * @param {string} unitId - Unit ID to sell
     */
    sellUnit(unitId) {
        if (!this.state.isPrep()) {
            console.log('[Game] Can only sell units during prep phase');
            return;
        }

        const unit = this.state.ownedUnits.get(unitId);
        if (!unit) {
            console.log('[Game] Unit not found:', unitId);
            return;
        }

        const result = this.shop.sellUnit(unit);
        if (result.success) {
            console.log(`[Game] Sold unit for ${result.goldRefunded} gold`);
            this.updateTraits();
            this.updateUI();
            this.renderer.renderBoard();
        }
    }

    // ========================================================================
    // TRAIT UPDATES
    // ========================================================================

    /**
     * Update trait calculations and display
     */
    updateTraits() {
        const unitsOnBoard = this.state.getUnitsOnBoard();

        // Create Unit instances for trait calculation
        const combatUnits = unitsOnBoard.map(unitInstance => {
            const unit = new Unit(unitInstance.unitId, unitInstance.starLevel);
            unit.setPosition(unitInstance.position.x, unitInstance.position.y);
            return unit;
        });

        // Calculate traits
        this.traitSystem.calculateTraits(combatUnits);

        // Update trait display
        this.updateTraitDisplay();
    }

    /**
     * Update the traits panel in the UI
     */
    updateTraitDisplay() {
        const traitsList = document.getElementById('traits-list');
        if (!traitsList) return;

        const traitDisplay = this.traitSystem.getTraitDisplay();

        if (traitDisplay.length === 0) {
            traitsList.innerHTML = '<li class="no-traits">No active traits</li>';
            return;
        }

        traitsList.innerHTML = traitDisplay.map(trait => {
            const activeClass = trait.isActive ? 'active' : 'inactive';
            const tierClass = trait.style?.tier || 'inactive';

            return `
                <li class="trait-item ${activeClass} ${tierClass}">
                    <span class="trait-icon">${trait.style?.icon || ''}</span>
                    <span class="trait-name">${trait.name}</span>
                    <span class="trait-count">${trait.progressString}</span>
                </li>
            `;
        }).join('');
    }

    // ========================================================================
    // UI UPDATES
    // ========================================================================

    /**
     * Update all UI elements
     */
    updateUI() {
        this.updatePlayerStats();
        this.updateShopDisplay();
        this.updateRoundInfo();
        this.updateLockButton();
    }

    /**
     * Update player stats display
     */
    updatePlayerStats() {
        const goldEl = document.getElementById('player-gold');
        const levelEl = document.getElementById('player-level');
        const xpEl = document.getElementById('player-xp');
        const hpEl = document.getElementById('player-hp');

        if (goldEl) goldEl.textContent = this.state.gold;
        if (levelEl) levelEl.textContent = this.state.level;
        if (xpEl) {
            const nextLevelXP = LEVEL_XP[this.state.level + 1] || 'MAX';
            xpEl.textContent = this.state.level >= 9 ? 'MAX' : `${this.state.xp}/${nextLevelXP}`;
        }
        if (hpEl) hpEl.textContent = this.state.hp;

        // Update HP color based on remaining HP
        if (hpEl) {
            hpEl.classList.remove('low', 'critical');
            if (this.state.hp <= 25) {
                hpEl.classList.add('critical');
            } else if (this.state.hp <= 50) {
                hpEl.classList.add('low');
            }
        }
    }

    /**
     * Update shop display
     */
    updateShopDisplay() {
        const shopSlots = document.querySelectorAll('.shop-slot');
        const offers = this.shop.getOffers();

        shopSlots.forEach((slot, index) => {
            const offer = offers[index];

            if (offer) {
                const canAfford = this.state.gold >= offer.cost;
                const rarityClass = this.getCostRarityClass(offer.cost);

                slot.innerHTML = `
                    <div class="shop-card ${rarityClass} ${canAfford ? '' : 'cannot-afford'}">
                        <div class="shop-card-emoji">${offer.emoji}</div>
                        <div class="shop-card-name">${offer.name}</div>
                        <div class="shop-card-cost">${offer.cost}g</div>
                        <div class="shop-card-synergies">
                            ${offer.traits.map(t => `<span class="synergy-tag ${t}">${t}</span>`).join('')}
                        </div>
                    </div>
                `;
                slot.classList.remove('empty');
            } else {
                slot.innerHTML = '<div class="empty-slot">Sold</div>';
                slot.classList.add('empty');
            }
        });
    }

    /**
     * Get CSS class for unit rarity based on cost
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

    /**
     * Update round info display
     */
    updateRoundInfo() {
        const roundEl = document.getElementById('round-number');
        if (roundEl) {
            roundEl.textContent = `Round: ${this.state.round}`;
        }
    }

    /**
     * Update lock button state
     */
    updateLockButton() {
        const lockBtn = document.getElementById('lock-shop-btn');
        if (lockBtn) {
            lockBtn.textContent = this.shop.locked ? 'Unlock' : 'Lock';
            lockBtn.classList.toggle('locked', this.shop.locked);
        }
    }

    /**
     * Show income notification
     */
    showIncomeNotification(income) {
        console.log('[Game] Income breakdown:', income);

        // Could add a visual notification here
        // For now just log it
        let message = `+${income.total}g (Base: ${income.base}`;
        if (income.interest > 0) message += `, Interest: ${income.interest}`;
        if (income.streak > 0) message += `, Streak: ${income.streak}`;
        message += ')';

        // Show as board message briefly
        this.renderer.showBoardMessage(message, 1500);
    }

    // ========================================================================
    // DEBUG METHODS
    // ========================================================================

    /**
     * Get debug info about current game state
     */
    debug() {
        console.log('=== Game Debug ===');
        console.log('State:', this.state.getSummary());
        console.log('Shop:', this.shop.getSummary());
        console.log('Traits:', this.traitSystem.getSummary());
        console.log('AI Strategy:', this.ai.getStrategyInfo(this.state.round));
    }

    /**
     * Skip to combat (debug)
     */
    skipToCombat() {
        this.startCombat();
    }

    /**
     * Add gold (debug)
     */
    addGold(amount) {
        this.state.addGold(amount, 'debug');
        this.updateUI();
    }
}

// ============================================================================
// GLOBAL INSTANCE AND INITIALIZATION
// ============================================================================

// Create global game instance
window.Game = Game;
window.game = null;

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Game] DOM loaded, initializing game...');

    // Small delay to ensure all other scripts have loaded
    setTimeout(() => {
        window.game = new Game();
        window.game.init();
    }, 100);
});

console.log('[Game] Game controller module loaded');
