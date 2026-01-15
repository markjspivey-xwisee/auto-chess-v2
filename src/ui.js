/**
 * Auto Chess UI Controller Module
 * Handles user interactions, event binding, and UI updates
 */

// ============================================================================
// UI CONTROLLER CLASS
// ============================================================================

class UI {
    constructor() {
        // DOM element references
        this.elements = {
            // Player stats
            goldDisplay: null,
            levelDisplay: null,
            xpDisplay: null,
            hpDisplay: null,
            roundNumber: null,
            phaseIndicator: null,

            // Buttons
            buyXpBtn: null,
            refreshShopBtn: null,
            lockShopBtn: null,
            startCombatBtn: null,
            restartBtn: null,

            // Panels
            shopUnits: null,
            shopSlots: [],
            traitsList: null,

            // Modals
            gameOverModal: null,
            gameOverTitle: null,
            gameOverMessage: null,

            // Tooltip
            unitTooltip: null
        };

        // Drag state
        this.draggedUnit = null;
        this.dragSource = null; // 'board' or 'bench'
        this.dragSourcePosition = null;

        // Selected unit (for selling, etc.)
        this.selectedUnit = null;

        // Callbacks for game controller
        this.callbacks = {
            onBuyUnit: null,
            onSellUnit: null,
            onBuyXP: null,
            onRefreshShop: null,
            onToggleLock: null,
            onStartCombat: null,
            onUnitPlaced: null,
            onRestart: null
        };

        console.log('[UI] UI Controller instance created');
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize the UI controller
     * @param {Object} callbacks - Callback functions for game actions
     */
    init(callbacks = {}) {
        // Store callbacks
        this.callbacks = { ...this.callbacks, ...callbacks };

        // Get DOM element references
        this.cacheElements();

        // Bind event listeners
        this.bindEvents();

        // Initial UI update
        this.updateDisplay();

        console.log('[UI] UI Controller initialized');
        return true;
    }

    /**
     * Cache DOM element references for performance
     */
    cacheElements() {
        // Player stats
        this.elements.goldDisplay = document.getElementById('player-gold');
        this.elements.levelDisplay = document.getElementById('player-level');
        this.elements.xpDisplay = document.getElementById('player-xp');
        this.elements.hpDisplay = document.getElementById('player-hp');
        this.elements.roundNumber = document.getElementById('round-number');
        this.elements.phaseIndicator = document.getElementById('phase-indicator');

        // Buttons
        this.elements.buyXpBtn = document.getElementById('buy-xp-btn');
        this.elements.refreshShopBtn = document.getElementById('refresh-shop-btn');
        this.elements.lockShopBtn = document.getElementById('lock-shop-btn');
        this.elements.restartBtn = document.getElementById('restart-btn');

        // Shop
        this.elements.shopUnits = document.getElementById('shop-units');
        this.elements.shopSlots = document.querySelectorAll('.shop-slot');

        // Panels
        this.elements.traitsList = document.getElementById('traits-list');

        // Modals
        this.elements.gameOverModal = document.getElementById('game-over-modal');
        this.elements.gameOverTitle = document.getElementById('game-over-title');
        this.elements.gameOverMessage = document.getElementById('game-over-message');

        // Tooltip
        this.elements.unitTooltip = document.getElementById('unit-tooltip');

        // Create start combat button if it doesn't exist
        this.createStartCombatButton();
    }

    /**
     * Create start combat button if it doesn't exist in DOM
     */
    createStartCombatButton() {
        if (!document.getElementById('start-combat-btn')) {
            const header = document.getElementById('game-header');
            if (header) {
                const btn = document.createElement('button');
                btn.id = 'start-combat-btn';
                btn.className = 'action-btn combat-btn';
                btn.textContent = 'Start Combat';
                header.appendChild(btn);
            }
        }
        this.elements.startCombatBtn = document.getElementById('start-combat-btn');
    }

    // ========================================================================
    // EVENT BINDING
    // ========================================================================

    /**
     * Bind all event listeners
     */
    bindEvents() {
        // Buy XP button
        if (this.elements.buyXpBtn) {
            this.elements.buyXpBtn.addEventListener('click', () => this.onBuyXP());
        }

        // Refresh shop button
        if (this.elements.refreshShopBtn) {
            this.elements.refreshShopBtn.addEventListener('click', () => this.onRefreshShop());
        }

        // Lock shop button
        if (this.elements.lockShopBtn) {
            this.elements.lockShopBtn.addEventListener('click', () => this.onToggleLock());
        }

        // Start combat button
        if (this.elements.startCombatBtn) {
            this.elements.startCombatBtn.addEventListener('click', () => this.onStartCombat());
        }

        // Restart button
        if (this.elements.restartBtn) {
            this.elements.restartBtn.addEventListener('click', () => this.onRestart());
        }

        // Shop slot click events
        this.elements.shopSlots.forEach((slot, index) => {
            slot.addEventListener('click', () => this.buyUnit(index));
        });

        // Global right-click handler for selling units
        document.addEventListener('contextmenu', (e) => this.handleRightClick(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Click outside to deselect
        document.addEventListener('click', (e) => this.handleDocumentClick(e));

        console.log('[UI] Events bound');
    }

    // ========================================================================
    // DRAG AND DROP HANDLING
    // ========================================================================

    /**
     * Handle drag start on a unit
     * @param {DragEvent} e - Drag event
     * @param {Object} unit - Unit being dragged
     * @param {string} source - 'board' or 'bench'
     * @param {Object} position - Source position { row, col } or { index }
     */
    handleDrag(e, unit, source, position) {
        if (!window.gameState || !window.gameState.isPrep()) {
            e.preventDefault();
            return false;
        }

        this.draggedUnit = unit;
        this.dragSource = source;
        this.dragSourcePosition = position;

        // Set drag data
        e.dataTransfer.setData('text/plain', unit.id);
        e.dataTransfer.effectAllowed = 'move';

        // Add dragging class
        if (e.target) {
            e.target.classList.add('dragging');
        }

        console.log(`[UI] Started dragging ${unit.unitId} from ${source}`);
        return true;
    }

    /**
     * Handle drop event
     * @param {DragEvent} e - Drop event
     * @param {string} target - 'board' or 'bench'
     * @param {Object} position - Target position { row, col } or { index }
     */
    handleDrop(e, target, position) {
        e.preventDefault();

        if (!this.draggedUnit || !window.gameState || !window.gameState.isPrep()) {
            this.clearDragState();
            return false;
        }

        const state = window.gameState;
        const unit = this.draggedUnit;
        let success = false;

        if (target === 'board') {
            // Dropping onto the board
            const { row, col } = position;

            // Check if position is valid (player area only)
            if (row >= 0 && row < GAME_CONFIG.PLAYER_ROWS && col >= 0 && col < GAME_CONFIG.BOARD_COLS) {
                // Check team size limit if moving from bench
                const currentTeamSize = state.getTeamSize();
                const isFromBench = unit.isOnBench;

                if (isFromBench && currentTeamSize >= state.level) {
                    // Check if swapping with existing unit
                    const existingUnit = state.getUnitAtPosition(row, col);
                    if (!existingUnit) {
                        this.showMessage('Team is full! Level up to add more units.');
                        this.clearDragState();
                        return false;
                    }
                }

                // Handle swap if position is occupied
                const existingUnit = state.getUnitAtPosition(row, col);
                if (existingUnit && existingUnit.id !== unit.id) {
                    // Swap positions
                    this.swapUnits(unit, existingUnit);
                    success = true;
                } else {
                    // Place unit on board
                    success = state.placeUnitOnBoard(unit, row, col);
                }
            }
        } else if (target === 'bench') {
            // Dropping onto the bench
            const { index } = position;

            // Check if bench slot is occupied
            const existingUnit = state.getUnitFromBench(index);
            if (existingUnit && existingUnit.id !== unit.id) {
                // Swap positions
                this.swapUnits(unit, existingUnit);
                success = true;
            } else {
                // Add to bench
                success = state.addUnitToBench(unit);
            }
        }

        if (success) {
            // Trigger callback
            if (this.callbacks.onUnitPlaced) {
                this.callbacks.onUnitPlaced(unit, target, position);
            }

            // Update display
            this.updateDisplay();

            // Update renderer
            if (window.renderer) {
                window.renderer.renderBoard();
            }
        }

        this.clearDragState();
        return success;
    }

    /**
     * Swap two units' positions
     * @param {Object} unit1 - First unit
     * @param {Object} unit2 - Second unit
     */
    swapUnits(unit1, unit2) {
        const state = window.gameState;

        // Store positions
        const pos1 = unit1.position ? { ...unit1.position } : null;
        const bench1 = unit1.isOnBench ? unit1.benchIndex : null;

        const pos2 = unit2.position ? { ...unit2.position } : null;
        const bench2 = unit2.isOnBench ? unit2.benchIndex : null;

        // Remove both from current locations
        state.removeUnitFromCurrentLocation(unit1);
        state.removeUnitFromCurrentLocation(unit2);

        // Place in swapped positions
        if (pos2 !== null) {
            state.playerBoard[pos2.y][pos2.x] = unit1.id;
            unit1.position = pos2;
            unit1.isOnBench = false;
            unit1.benchIndex = null;
        } else if (bench2 !== null) {
            state.bench[bench2] = unit1.id;
            unit1.isOnBench = true;
            unit1.benchIndex = bench2;
            unit1.position = null;
        }

        if (pos1 !== null) {
            state.playerBoard[pos1.y][pos1.x] = unit2.id;
            unit2.position = pos1;
            unit2.isOnBench = false;
            unit2.benchIndex = null;
        } else if (bench1 !== null) {
            state.bench[bench1] = unit2.id;
            unit2.isOnBench = true;
            unit2.benchIndex = bench1;
            unit2.position = null;
        }

        console.log(`[UI] Swapped ${unit1.unitId} and ${unit2.unitId}`);
    }

    /**
     * Clear drag state
     */
    clearDragState() {
        // Remove dragging class from all units
        document.querySelectorAll('.unit.dragging').forEach(el => {
            el.classList.remove('dragging');
        });

        this.draggedUnit = null;
        this.dragSource = null;
        this.dragSourcePosition = null;
    }

    // ========================================================================
    // SHOP ACTIONS
    // ========================================================================

    /**
     * Buy a unit from the shop
     * @param {number} index - Shop slot index (0-4)
     */
    buyUnit(index) {
        const state = window.gameState;

        if (!state || !state.isPrep()) {
            this.showMessage('Cannot buy during combat!');
            return false;
        }

        // Get shop offer
        const shop = window.shop || (window.game && window.game.shop);
        if (!shop) {
            console.error('[UI] Shop not found');
            return false;
        }

        const offer = shop.getOffer(index);
        if (!offer) {
            console.log('[UI] Empty shop slot');
            return false;
        }

        // Check gold
        if (state.gold < offer.cost) {
            this.showMessage('Not enough gold!');
            this.flashElement(this.elements.goldDisplay, 'error');
            return false;
        }

        // Check bench space
        if (!state.hasBenchSpace()) {
            this.showMessage('Bench is full!');
            return false;
        }

        // Attempt purchase
        const result = shop.buyUnit(index);

        if (result.success) {
            // Trigger callback
            if (this.callbacks.onBuyUnit) {
                this.callbacks.onBuyUnit(result.unit, index);
            }

            // Update displays
            this.updateDisplay();
            this.renderShop();

            // Update renderer
            if (window.renderer) {
                window.renderer.renderBoard();
            }

            // Visual feedback
            this.flashElement(this.elements.shopSlots[index], 'success');

            // Check if unit was upgraded
            if (result.upgraded) {
                this.showMessage(`${offer.name} upgraded!`, 'success');
            }

            console.log(`[UI] Bought ${offer.name}`);
            return true;
        } else {
            this.showMessage(result.error || 'Purchase failed');
            return false;
        }
    }

    /**
     * Sell a unit
     * @param {Object} unit - Unit to sell
     */
    sellUnit(unit) {
        if (!unit) return false;

        const state = window.gameState;
        if (!state || !state.isPrep()) {
            this.showMessage('Cannot sell during combat!');
            return false;
        }

        const shop = window.shop || (window.game && window.game.shop);
        if (!shop) {
            // Fall back to direct state selling
            const success = state.sellUnit(unit);
            if (success) {
                this.updateDisplay();
                if (window.renderer) {
                    window.renderer.renderBoard();
                }
            }
            return success;
        }

        const result = shop.sellUnit(unit);

        if (result.success) {
            // Trigger callback
            if (this.callbacks.onSellUnit) {
                this.callbacks.onSellUnit(unit, result.goldRefunded);
            }

            // Update displays
            this.updateDisplay();

            // Update renderer
            if (window.renderer) {
                window.renderer.renderBoard();
            }

            this.showMessage(`Sold for ${result.goldRefunded}g`, 'success');
            console.log(`[UI] Sold unit for ${result.goldRefunded}g`);
            return true;
        } else {
            this.showMessage(result.error || 'Sell failed');
            return false;
        }
    }

    // ========================================================================
    // BUTTON HANDLERS
    // ========================================================================

    /**
     * Handle buy XP button click
     */
    onBuyXP() {
        const state = window.gameState;

        if (!state || !state.isPrep()) {
            this.showMessage('Cannot buy XP during combat!');
            return false;
        }

        if (state.level >= 9) {
            this.showMessage('Already at max level!');
            return false;
        }

        if (state.gold < GAME_CONFIG.XP_PURCHASE_COST) {
            this.showMessage('Not enough gold!');
            this.flashElement(this.elements.goldDisplay, 'error');
            return false;
        }

        const success = state.buyXP();

        if (success) {
            // Trigger callback
            if (this.callbacks.onBuyXP) {
                this.callbacks.onBuyXP();
            }

            // Update display
            this.updateDisplay();

            // Visual feedback
            this.flashElement(this.elements.xpDisplay, 'success');
            this.flashElement(this.elements.buyXpBtn, 'success');

            console.log('[UI] Bought XP');
            return true;
        }

        return false;
    }

    /**
     * Handle refresh shop button click
     */
    onRefreshShop() {
        const state = window.gameState;

        if (!state || !state.isPrep()) {
            this.showMessage('Cannot refresh during combat!');
            return false;
        }

        if (state.gold < GAME_CONFIG.REROLL_COST) {
            this.showMessage('Not enough gold!');
            this.flashElement(this.elements.goldDisplay, 'error');
            return false;
        }

        const shop = window.shop || (window.game && window.game.shop);
        if (!shop) {
            console.error('[UI] Shop not found');
            return false;
        }

        const result = shop.refresh(false);

        if (result.success) {
            // Trigger callback
            if (this.callbacks.onRefreshShop) {
                this.callbacks.onRefreshShop();
            }

            // Update displays
            this.updateDisplay();
            this.renderShop();

            // Visual feedback
            this.flashElement(this.elements.refreshShopBtn, 'success');

            console.log('[UI] Refreshed shop');
            return true;
        } else {
            this.showMessage(result.error || 'Refresh failed');
            return false;
        }
    }

    /**
     * Handle toggle shop lock button click
     */
    onToggleLock() {
        const shop = window.shop || (window.game && window.game.shop);
        if (!shop) {
            console.error('[UI] Shop not found');
            return false;
        }

        const isLocked = shop.toggleLock();

        // Trigger callback
        if (this.callbacks.onToggleLock) {
            this.callbacks.onToggleLock(isLocked);
        }

        // Update button text
        if (this.elements.lockShopBtn) {
            this.elements.lockShopBtn.textContent = isLocked ? 'Unlock' : 'Lock';
            this.elements.lockShopBtn.classList.toggle('locked', isLocked);
        }

        console.log(`[UI] Shop ${isLocked ? 'locked' : 'unlocked'}`);
        return true;
    }

    /**
     * Handle start combat button click
     */
    onStartCombat() {
        const state = window.gameState;

        if (!state || !state.isPrep()) {
            this.showMessage('Combat already in progress!');
            return false;
        }

        if (state.getTeamSize() === 0) {
            this.showMessage('Place units on the board first!');
            return false;
        }

        // Trigger callback
        if (this.callbacks.onStartCombat) {
            this.callbacks.onStartCombat();
        }

        // Update display
        this.updateDisplay();

        console.log('[UI] Combat started');
        return true;
    }

    /**
     * Handle restart button click
     */
    onRestart() {
        // Hide game over modal
        if (this.elements.gameOverModal) {
            this.elements.gameOverModal.classList.add('hidden');
        }

        // Trigger callback
        if (this.callbacks.onRestart) {
            this.callbacks.onRestart();
        }

        // Update display
        this.updateDisplay();

        console.log('[UI] Game restarted');
        return true;
    }

    // ========================================================================
    // INPUT HANDLERS
    // ========================================================================

    /**
     * Handle right-click on units (for selling)
     * @param {MouseEvent} e - Mouse event
     */
    handleRightClick(e) {
        // Find if clicked on a unit
        const unitElement = e.target.closest('.unit');
        if (!unitElement) return;

        const state = window.gameState;
        if (!state || !state.isPrep()) return;

        e.preventDefault();

        const unitId = unitElement.dataset.unitId;
        if (!unitId) return;

        const unit = state.ownedUnits.get(unitId);
        if (!unit) return;

        // Check if it's a player unit (not enemy)
        if (unitElement.classList.contains('enemy')) return;

        // Sell the unit
        this.sellUnit(unit);
    }

    /**
     * Handle keyboard shortcuts
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeyDown(e) {
        const state = window.gameState;
        if (!state) return;

        // Only during prep phase
        if (!state.isPrep()) return;

        switch (e.key.toLowerCase()) {
            case 'd':
                // D to refresh shop
                this.onRefreshShop();
                break;
            case 'f':
                // F to buy XP
                this.onBuyXP();
                break;
            case 'e':
                // E to sell selected unit
                if (this.selectedUnit) {
                    this.sellUnit(this.selectedUnit);
                    this.selectedUnit = null;
                }
                break;
            case ' ':
                // Spacebar to start combat
                if (!e.repeat) {
                    e.preventDefault();
                    this.onStartCombat();
                }
                break;
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
                // Number keys to buy from shop
                const index = parseInt(e.key) - 1;
                this.buyUnit(index);
                break;
        }
    }

    /**
     * Handle document click (for deselection)
     * @param {MouseEvent} e - Mouse event
     */
    handleDocumentClick(e) {
        // Check if clicked outside of interactive elements
        const isInteractive = e.target.closest('.unit, .shop-slot, .bench-slot, .board-cell, button');
        if (!isInteractive) {
            this.selectedUnit = null;
            if (window.renderer) {
                window.renderer.hideUnitTooltip();
            }
        }
    }

    // ========================================================================
    // DISPLAY UPDATE
    // ========================================================================

    /**
     * Update all UI elements based on current game state
     */
    updateDisplay() {
        const state = window.gameState;
        if (!state) return;

        // Update player stats
        this.updatePlayerStats();

        // Update round info
        this.updateRoundInfo();

        // Update shop
        this.renderShop();

        // Update traits
        this.renderTraits();

        // Update button states
        this.updateButtonStates();

        // Check for game over
        if (state.isGameOver()) {
            this.showGameOver();
        }
    }

    /**
     * Update player stats display
     */
    updatePlayerStats() {
        const state = window.gameState;
        if (!state) return;

        // Gold
        if (this.elements.goldDisplay) {
            this.elements.goldDisplay.textContent = state.gold;
        }

        // Level
        if (this.elements.levelDisplay) {
            this.elements.levelDisplay.textContent = state.level;
        }

        // XP
        if (this.elements.xpDisplay) {
            if (state.level >= 9) {
                this.elements.xpDisplay.textContent = 'MAX';
            } else {
                const nextLevelXP = LEVEL_XP[state.level + 1];
                this.elements.xpDisplay.textContent = `${state.xp}/${nextLevelXP}`;
            }
        }

        // HP
        if (this.elements.hpDisplay) {
            this.elements.hpDisplay.textContent = state.hp;

            // Color based on HP percentage
            const hpPercent = (state.hp / state.maxHp) * 100;
            this.elements.hpDisplay.classList.remove('low', 'critical');
            if (hpPercent <= 25) {
                this.elements.hpDisplay.classList.add('critical');
            } else if (hpPercent <= 50) {
                this.elements.hpDisplay.classList.add('low');
            }
        }
    }

    /**
     * Update round and phase information
     */
    updateRoundInfo() {
        const state = window.gameState;
        if (!state) return;

        // Round number
        if (this.elements.roundNumber) {
            this.elements.roundNumber.textContent = `Round: ${state.round}`;
        }

        // Phase indicator
        if (this.elements.phaseIndicator) {
            const phaseText = state.isPrep() ? 'Preparation Phase' :
                              state.isCombat() ? 'Combat Phase' :
                              state.isGameOver() ? 'Game Over' : 'Unknown';
            this.elements.phaseIndicator.textContent = phaseText;

            // Update phase class
            this.elements.phaseIndicator.className = '';
            this.elements.phaseIndicator.classList.add(`phase-${state.phase}`);
        }
    }

    /**
     * Update button states based on game state
     */
    updateButtonStates() {
        const state = window.gameState;
        if (!state) return;

        const isPrep = state.isPrep();
        const shop = window.shop || (window.game && window.game.shop);

        // Buy XP button
        if (this.elements.buyXpBtn) {
            const canBuyXP = isPrep && state.level < 9 && state.gold >= GAME_CONFIG.XP_PURCHASE_COST;
            this.elements.buyXpBtn.disabled = !canBuyXP;
            this.elements.buyXpBtn.classList.toggle('disabled', !canBuyXP);
        }

        // Refresh shop button
        if (this.elements.refreshShopBtn) {
            const canRefresh = isPrep && state.gold >= GAME_CONFIG.REROLL_COST;
            this.elements.refreshShopBtn.disabled = !canRefresh;
            this.elements.refreshShopBtn.classList.toggle('disabled', !canRefresh);
        }

        // Lock shop button
        if (this.elements.lockShopBtn && shop) {
            this.elements.lockShopBtn.textContent = shop.locked ? 'Unlock' : 'Lock';
            this.elements.lockShopBtn.classList.toggle('locked', shop.locked);
        }

        // Start combat button
        if (this.elements.startCombatBtn) {
            const canStartCombat = isPrep && state.getTeamSize() > 0;
            this.elements.startCombatBtn.disabled = !canStartCombat;
            this.elements.startCombatBtn.classList.toggle('disabled', !canStartCombat);
            this.elements.startCombatBtn.style.display = isPrep ? '' : 'none';
        }
    }

    // ========================================================================
    // SHOP RENDERING
    // ========================================================================

    /**
     * Render the shop UI
     */
    renderShop() {
        const state = window.gameState;
        const shop = window.shop || (window.game && window.game.shop);

        if (!state || !shop) return;

        const offers = shop.getOffers();

        this.elements.shopSlots.forEach((slot, index) => {
            // Clear slot
            slot.innerHTML = '';
            slot.className = 'shop-slot';

            const offer = offers[index];

            if (!offer) {
                slot.classList.add('empty');
                return;
            }

            // Add rarity class
            const rarityClass = this.getCostRarityClass(offer.cost);
            slot.classList.add(rarityClass);

            // Check affordability
            const canAfford = state.gold >= offer.cost;
            if (!canAfford) {
                slot.classList.add('unaffordable');
            }

            // Create shop card content
            const card = document.createElement('div');
            card.className = 'shop-card';

            // Unit emoji
            const emoji = document.createElement('div');
            emoji.className = 'shop-card-emoji';
            emoji.textContent = offer.emoji;
            card.appendChild(emoji);

            // Unit name
            const name = document.createElement('div');
            name.className = 'shop-card-name';
            name.textContent = offer.name;
            card.appendChild(name);

            // Cost
            const cost = document.createElement('div');
            cost.className = 'shop-card-cost';
            cost.innerHTML = `<span class="gold-icon">🪙</span>${offer.cost}`;
            card.appendChild(cost);

            // Traits/Synergies
            const synergies = document.createElement('div');
            synergies.className = 'shop-card-synergies';
            offer.traits.forEach(trait => {
                const tag = document.createElement('span');
                tag.className = `synergy-tag ${trait}`;
                tag.textContent = trait;
                synergies.appendChild(tag);
            });
            card.appendChild(synergies);

            // Count owned
            const ownedCount = state.countUnitsOfType(offer.id);
            if (ownedCount > 0) {
                const owned = document.createElement('div');
                owned.className = 'shop-card-owned';
                owned.textContent = `Owned: ${ownedCount}`;
                card.appendChild(owned);
            }

            slot.appendChild(card);
        });
    }

    /**
     * Get CSS class for cost rarity
     * @param {number} cost - Unit cost
     * @returns {string} CSS class name
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
    // TRAITS RENDERING
    // ========================================================================

    /**
     * Render active traits panel
     */
    renderTraits() {
        const state = window.gameState;
        if (!state || !this.elements.traitsList) return;

        const activeTraits = state.getActiveTraits();

        // Clear existing traits
        this.elements.traitsList.innerHTML = '';

        // Get all traits with at least 1 unit
        const traitCounts = {};
        const unitsOnBoard = state.getUnitsOnBoard();

        unitsOnBoard.forEach(unit => {
            const baseData = unit.getBaseData();
            if (!baseData || !baseData.traits) return;

            baseData.traits.forEach(trait => {
                if (!traitCounts[trait]) traitCounts[trait] = 0;
                traitCounts[trait]++;
            });
        });

        // Render each trait
        for (const traitId in traitCounts) {
            const trait = TRAITS[traitId];
            if (!trait) continue;

            const count = traitCounts[traitId];
            const activeTrait = activeTraits[traitId];
            const isActive = !!activeTrait;

            // Get next threshold
            const thresholds = Object.keys(trait.bonuses).map(Number).sort((a, b) => a - b);
            const currentThreshold = activeTrait ? activeTrait.threshold : 0;
            const nextThreshold = thresholds.find(t => t > count) || thresholds[thresholds.length - 1];

            const li = document.createElement('li');
            li.className = `trait-item ${traitId}`;
            if (isActive) {
                li.classList.add('active');
            }

            li.innerHTML = `
                <span class="trait-name">${trait.name}</span>
                <span class="trait-count">${count}/${nextThreshold}</span>
            `;

            // Add tooltip on hover
            li.title = trait.description;
            if (isActive && activeTrait.bonus) {
                const bonusText = Object.entries(activeTrait.bonus)
                    .map(([key, value]) => `${key}: +${value}`)
                    .join(', ');
                li.title += `\nBonus: ${bonusText}`;
            }

            this.elements.traitsList.appendChild(li);
        }

        // Show message if no traits
        if (this.elements.traitsList.children.length === 0) {
            const li = document.createElement('li');
            li.className = 'trait-item empty';
            li.textContent = 'No units on board';
            this.elements.traitsList.appendChild(li);
        }
    }

    // ========================================================================
    // GAME OVER
    // ========================================================================

    /**
     * Show game over modal
     * @param {boolean} won - Whether the player won
     */
    showGameOver(won = false) {
        if (!this.elements.gameOverModal) return;

        const state = window.gameState;

        if (this.elements.gameOverTitle) {
            this.elements.gameOverTitle.textContent = won ? 'Victory!' : 'Game Over';
        }

        if (this.elements.gameOverMessage && state) {
            const message = won
                ? `Congratulations! You won in ${state.round - 1} rounds!`
                : `You survived ${state.round - 1} rounds. Wins: ${state.wins}, Losses: ${state.losses}`;
            this.elements.gameOverMessage.textContent = message;
        }

        this.elements.gameOverModal.classList.remove('hidden');
    }

    /**
     * Hide game over modal
     */
    hideGameOver() {
        if (this.elements.gameOverModal) {
            this.elements.gameOverModal.classList.add('hidden');
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Show a temporary message to the user
     * @param {string} message - Message text
     * @param {string} type - 'info', 'success', 'error'
     */
    showMessage(message, type = 'info') {
        // Try using renderer's board message
        if (window.renderer && typeof window.renderer.showBoardMessage === 'function') {
            window.renderer.showBoardMessage(message);
            return;
        }

        // Fallback: console log
        console.log(`[UI] ${type.toUpperCase()}: ${message}`);
    }

    /**
     * Flash an element with a class for visual feedback
     * @param {HTMLElement} element - Element to flash
     * @param {string} type - 'success' or 'error'
     */
    flashElement(element, type = 'success') {
        if (!element) return;

        const className = `flash-${type}`;
        element.classList.add(className);

        setTimeout(() => {
            element.classList.remove(className);
        }, 300);
    }

    /**
     * Select a unit
     * @param {Object} unit - Unit to select
     */
    selectUnit(unit) {
        this.selectedUnit = unit;

        // Show tooltip
        if (window.renderer && unit) {
            const position = unit.position || { y: -1, x: unit.benchIndex || 0 };
            const displayRow = unit.position ? position.y + GAME_CONFIG.PLAYER_ROWS : -1;
            window.renderer.showUnitTooltip(unit.id, displayRow, position.x);
        }
    }

    /**
     * Deselect current unit
     */
    deselectUnit() {
        this.selectedUnit = null;

        if (window.renderer) {
            window.renderer.hideUnitTooltip();
        }
    }

    /**
     * Enable/disable combat phase UI
     * @param {boolean} inCombat - Whether combat is active
     */
    setCombatMode(inCombat) {
        // Disable interactive elements during combat
        const interactiveElements = [
            this.elements.buyXpBtn,
            this.elements.refreshShopBtn,
            ...this.elements.shopSlots
        ];

        interactiveElements.forEach(el => {
            if (el) {
                el.classList.toggle('disabled', inCombat);
                if (el.tagName === 'BUTTON') {
                    el.disabled = inCombat;
                }
            }
        });

        // Hide start combat button during combat
        if (this.elements.startCombatBtn) {
            this.elements.startCombatBtn.style.display = inCombat ? 'none' : '';
        }

        // Update phase indicator
        this.updateRoundInfo();
    }

    /**
     * Debug: Print UI state
     */
    debug() {
        console.log('=== UI Debug ===');
        console.log('Selected unit:', this.selectedUnit);
        console.log('Dragged unit:', this.draggedUnit);
        console.log('Elements cached:', Object.keys(this.elements).filter(k => this.elements[k] !== null).length);
    }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

// Create global UI instance
window.ui = new UI();

// Expose class for other modules
window.UI = UI;

console.log('[UI] UI Controller module loaded');
