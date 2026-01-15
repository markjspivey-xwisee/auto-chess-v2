/**
 * Auto Chess Game State Management Module
 * Handles all game state including player stats, board, bench, and game progression
 */

// ============================================================================
// GAME PHASES
// ============================================================================

const GAME_PHASES = {
    PREP: 'prep',
    COMBAT: 'combat',
    CAROUSEL: 'carousel', // Future use
    GAME_OVER: 'game_over'
};

// ============================================================================
// UNIT INSTANCE CLASS
// ============================================================================

/**
 * Represents an instance of a unit on the board or bench
 */
class UnitInstance {
    constructor(unitId, starLevel = 1) {
        this.id = this.generateId();
        this.unitId = unitId;
        this.starLevel = starLevel;
        this.currentHp = null; // Set when placed in combat
        this.currentMana = 0;
        this.items = [];

        // Position tracking
        this.position = null; // { x, y } for board position
        this.isOnBench = false;
        this.benchIndex = null;
    }

    generateId() {
        return `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get the base unit data
     */
    getBaseData() {
        return UNITS[this.unitId];
    }

    /**
     * Get computed stats with star multipliers
     */
    getStats() {
        return getUnitStatsAtStar(this.unitId, this.starLevel);
    }

    /**
     * Serialize for save/load
     */
    toJSON() {
        return {
            id: this.id,
            unitId: this.unitId,
            starLevel: this.starLevel,
            items: [...this.items],
            position: this.position ? { ...this.position } : null,
            isOnBench: this.isOnBench,
            benchIndex: this.benchIndex
        };
    }

    /**
     * Deserialize from saved data
     */
    static fromJSON(data) {
        const unit = new UnitInstance(data.unitId, data.starLevel);
        unit.id = data.id;
        unit.items = data.items || [];
        unit.position = data.position;
        unit.isOnBench = data.isOnBench;
        unit.benchIndex = data.benchIndex;
        return unit;
    }
}

// ============================================================================
// GAME STATE CLASS
// ============================================================================

class GameState {
    constructor() {
        this.reset();
    }

    /**
     * Reset to initial game state
     */
    reset() {
        // Player stats
        this.gold = GAME_CONFIG.STARTING_GOLD;
        this.level = 1;
        this.xp = 0;
        this.hp = GAME_CONFIG.STARTING_HP;
        this.maxHp = GAME_CONFIG.STARTING_HP;

        // Game progression
        this.round = 1;
        this.phase = GAME_PHASES.PREP;
        this.winStreak = 0;
        this.loseStreak = 0;
        this.wins = 0;
        this.losses = 0;

        // Board state: 8 columns x 4 rows for player
        // Stored as 2D array [row][col], null = empty
        this.playerBoard = this.createEmptyBoard();
        this.enemyBoard = this.createEmptyBoard();

        // Bench state: array of 9 slots
        this.bench = new Array(GAME_CONFIG.BENCH_SIZE).fill(null);

        // Shop state
        this.shop = [];
        this.shopLocked = false;

        // Unit pool tracking - tracks remaining copies of each unit
        this.unitPool = this.initializeUnitPool();

        // All unit instances owned by player
        this.ownedUnits = new Map(); // id -> UnitInstance

        // Combat state (populated during combat phase)
        this.combatState = null;

        // Game statistics
        this.stats = {
            totalGoldEarned: GAME_CONFIG.STARTING_GOLD,
            totalGoldSpent: 0,
            unitsUpgraded: 0,
            roundsPlayed: 0,
            damageDealt: 0,
            damageTaken: 0
        };

        console.log('[State] Game state reset');
    }

    /**
     * Create an empty board grid
     */
    createEmptyBoard() {
        const board = [];
        for (let row = 0; row < GAME_CONFIG.PLAYER_ROWS; row++) {
            board.push(new Array(GAME_CONFIG.BOARD_COLS).fill(null));
        }
        return board;
    }

    /**
     * Initialize the unit pool with all available copies
     */
    initializeUnitPool() {
        const pool = {};
        for (const unitId in UNITS) {
            const unit = UNITS[unitId];
            pool[unitId] = UNIT_POOL_SIZE[unit.cost] || 0;
        }
        return pool;
    }

    // ========================================================================
    // GOLD MANAGEMENT
    // ========================================================================

    /**
     * Add gold to player
     */
    addGold(amount, source = 'unknown') {
        if (amount <= 0) return false;
        this.gold += amount;
        this.stats.totalGoldEarned += amount;
        console.log(`[State] Added ${amount} gold from ${source}. Total: ${this.gold}`);
        return true;
    }

    /**
     * Spend gold if player has enough
     */
    spendGold(amount, reason = 'unknown') {
        if (amount <= 0) return false;
        if (this.gold < amount) {
            console.log(`[State] Not enough gold. Have: ${this.gold}, Need: ${amount}`);
            return false;
        }
        this.gold -= amount;
        this.stats.totalGoldSpent += amount;
        console.log(`[State] Spent ${amount} gold on ${reason}. Remaining: ${this.gold}`);
        return true;
    }

    /**
     * Calculate income for the round
     */
    calculateIncome() {
        let income = GAME_CONFIG.PASSIVE_INCOME;

        // Interest (10% of gold, max 5)
        const interest = Math.min(
            Math.floor(this.gold * GAME_CONFIG.INTEREST_RATE),
            GAME_CONFIG.MAX_INTEREST
        );
        income += interest;

        // Win streak bonus
        if (this.winStreak > 0) {
            const streakIndex = Math.min(this.winStreak, GAME_CONFIG.WIN_STREAK_BONUS.length - 1);
            income += GAME_CONFIG.WIN_STREAK_BONUS[streakIndex];
        }

        // Lose streak bonus
        if (this.loseStreak > 0) {
            const streakIndex = Math.min(this.loseStreak, GAME_CONFIG.LOSE_STREAK_BONUS.length - 1);
            income += GAME_CONFIG.LOSE_STREAK_BONUS[streakIndex];
        }

        return {
            base: GAME_CONFIG.PASSIVE_INCOME,
            interest,
            streak: income - GAME_CONFIG.PASSIVE_INCOME - interest,
            total: income
        };
    }

    /**
     * Collect round income
     */
    collectIncome() {
        const income = this.calculateIncome();
        this.addGold(income.total, 'round income');
        return income;
    }

    // ========================================================================
    // XP AND LEVELING
    // ========================================================================

    /**
     * Gain XP and check for level up
     */
    gainXP(amount, source = 'unknown') {
        if (amount <= 0 || this.level >= 9) return false;

        this.xp += amount;
        console.log(`[State] Gained ${amount} XP from ${source}. Total: ${this.xp}`);

        // Check for level up
        while (this.canLevelUp()) {
            this.levelUp();
        }

        return true;
    }

    /**
     * Check if player can level up
     */
    canLevelUp() {
        if (this.level >= 9) return false;
        const nextLevelXP = LEVEL_XP[this.level + 1];
        return this.xp >= nextLevelXP;
    }

    /**
     * Level up the player
     */
    levelUp() {
        if (this.level >= 9) return false;

        this.level++;
        console.log(`[State] Leveled up to ${this.level}!`);

        return true;
    }

    /**
     * Buy XP with gold
     */
    buyXP() {
        if (this.level >= 9) {
            console.log('[State] Already at max level');
            return false;
        }

        if (!this.spendGold(GAME_CONFIG.XP_PURCHASE_COST, 'buy XP')) {
            return false;
        }

        this.gainXP(GAME_CONFIG.XP_PER_PURCHASE, 'purchase');
        return true;
    }

    /**
     * Get XP needed for next level
     */
    getXPToNextLevel() {
        if (this.level >= 9) return 0;
        return LEVEL_XP[this.level + 1] - this.xp;
    }

    /**
     * Get current level progress as percentage
     */
    getLevelProgress() {
        if (this.level >= 9) return 100;

        const currentLevelXP = LEVEL_XP[this.level];
        const nextLevelXP = LEVEL_XP[this.level + 1];
        const xpIntoLevel = this.xp - currentLevelXP;
        const xpNeeded = nextLevelXP - currentLevelXP;

        return Math.floor((xpIntoLevel / xpNeeded) * 100);
    }

    // ========================================================================
    // HP AND DAMAGE
    // ========================================================================

    /**
     * Take damage to player HP
     */
    takeDamage(amount, source = 'combat') {
        if (amount <= 0) return false;

        this.hp = Math.max(0, this.hp - amount);
        this.stats.damageTaken += amount;
        console.log(`[State] Took ${amount} damage from ${source}. HP: ${this.hp}/${this.maxHp}`);

        if (this.hp <= 0) {
            this.phase = GAME_PHASES.GAME_OVER;
            console.log('[State] Game Over!');
        }

        return true;
    }

    /**
     * Heal player HP (future mechanic)
     */
    heal(amount) {
        if (amount <= 0) return false;
        const oldHp = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        const healed = this.hp - oldHp;
        console.log(`[State] Healed ${healed} HP. HP: ${this.hp}/${this.maxHp}`);
        return healed > 0;
    }

    /**
     * Check if player is alive
     */
    isAlive() {
        return this.hp > 0;
    }

    // ========================================================================
    // BOARD MANAGEMENT
    // ========================================================================

    /**
     * Get unit at board position
     */
    getUnitAtPosition(row, col, isEnemy = false) {
        const board = isEnemy ? this.enemyBoard : this.playerBoard;
        if (row < 0 || row >= GAME_CONFIG.PLAYER_ROWS || col < 0 || col >= GAME_CONFIG.BOARD_COLS) {
            return null;
        }
        const unitId = board[row][col];
        return unitId ? this.ownedUnits.get(unitId) : null;
    }

    /**
     * Place unit on board
     */
    placeUnitOnBoard(unit, row, col) {
        if (row < 0 || row >= GAME_CONFIG.PLAYER_ROWS || col < 0 || col >= GAME_CONFIG.BOARD_COLS) {
            console.log('[State] Invalid board position');
            return false;
        }

        // Check if position is occupied
        if (this.playerBoard[row][col] !== null) {
            console.log('[State] Position already occupied');
            return false;
        }

        // Check team size limit
        const currentTeamSize = this.getUnitsOnBoard().length;
        if (unit.isOnBench && currentTeamSize >= this.level) {
            console.log(`[State] Team size limit reached (${this.level})`);
            return false;
        }

        // Remove from previous location
        this.removeUnitFromCurrentLocation(unit);

        // Place on board
        this.playerBoard[row][col] = unit.id;
        unit.position = { x: col, y: row };
        unit.isOnBench = false;
        unit.benchIndex = null;

        console.log(`[State] Placed ${unit.unitId} at (${row}, ${col})`);
        return true;
    }

    /**
     * Move unit on board
     */
    moveUnit(unit, toRow, toCol) {
        if (!unit.position && !unit.isOnBench) {
            console.log('[State] Unit has no position');
            return false;
        }

        return this.placeUnitOnBoard(unit, toRow, toCol);
    }

    /**
     * Remove unit from its current location
     */
    removeUnitFromCurrentLocation(unit) {
        // Remove from board
        if (unit.position) {
            this.playerBoard[unit.position.y][unit.position.x] = null;
            unit.position = null;
        }

        // Remove from bench
        if (unit.isOnBench && unit.benchIndex !== null) {
            this.bench[unit.benchIndex] = null;
            unit.isOnBench = false;
            unit.benchIndex = null;
        }
    }

    /**
     * Get all units currently on the player's board
     */
    getUnitsOnBoard() {
        const units = [];
        for (let row = 0; row < GAME_CONFIG.PLAYER_ROWS; row++) {
            for (let col = 0; col < GAME_CONFIG.BOARD_COLS; col++) {
                const unitId = this.playerBoard[row][col];
                if (unitId) {
                    const unit = this.ownedUnits.get(unitId);
                    if (unit) units.push(unit);
                }
            }
        }
        return units;
    }

    /**
     * Get team size (units on board)
     */
    getTeamSize() {
        return this.getUnitsOnBoard().length;
    }

    // ========================================================================
    // BENCH MANAGEMENT
    // ========================================================================

    /**
     * Add unit to bench
     */
    addUnitToBench(unit) {
        const emptySlot = this.bench.findIndex(slot => slot === null);
        if (emptySlot === -1) {
            console.log('[State] Bench is full');
            return false;
        }

        // Remove from previous location
        this.removeUnitFromCurrentLocation(unit);

        // Add to bench
        this.bench[emptySlot] = unit.id;
        unit.isOnBench = true;
        unit.benchIndex = emptySlot;
        unit.position = null;

        console.log(`[State] Added ${unit.unitId} to bench slot ${emptySlot}`);
        return true;
    }

    /**
     * Get unit from bench slot
     */
    getUnitFromBench(slotIndex) {
        if (slotIndex < 0 || slotIndex >= GAME_CONFIG.BENCH_SIZE) {
            return null;
        }
        const unitId = this.bench[slotIndex];
        return unitId ? this.ownedUnits.get(unitId) : null;
    }

    /**
     * Get all units on bench
     */
    getUnitsOnBench() {
        return this.bench
            .filter(id => id !== null)
            .map(id => this.ownedUnits.get(id))
            .filter(unit => unit !== undefined);
    }

    /**
     * Check if bench has space
     */
    hasBenchSpace() {
        return this.bench.some(slot => slot === null);
    }

    /**
     * Get number of empty bench slots
     */
    getEmptyBenchSlots() {
        return this.bench.filter(slot => slot === null).length;
    }

    // ========================================================================
    // UNIT MANAGEMENT
    // ========================================================================

    /**
     * Create and add a new unit instance
     */
    createUnit(unitId, addToBench = true) {
        if (!UNITS[unitId]) {
            console.log(`[State] Unknown unit: ${unitId}`);
            return null;
        }

        const unit = new UnitInstance(unitId);
        this.ownedUnits.set(unit.id, unit);

        // Take from pool
        if (this.unitPool[unitId] > 0) {
            this.unitPool[unitId]--;
        }

        if (addToBench) {
            if (!this.addUnitToBench(unit)) {
                // Failed to add to bench, remove unit
                this.ownedUnits.delete(unit.id);
                this.unitPool[unitId]++;
                return null;
            }
        }

        console.log(`[State] Created unit ${unitId}`);
        return unit;
    }

    /**
     * Sell a unit
     */
    sellUnit(unit) {
        if (!unit || !this.ownedUnits.has(unit.id)) {
            return false;
        }

        const baseData = unit.getBaseData();

        // Calculate sell value based on star level
        // 1-star: cost, 2-star: cost * 3, 3-star: cost * 9
        const starMultiplier = Math.pow(GAME_CONFIG.COPIES_TO_UPGRADE, unit.starLevel - 1);
        const sellValue = Math.floor(baseData.cost * starMultiplier * GAME_CONFIG.SELL_REFUND_RATE);

        // Return units to pool
        const unitsReturned = Math.pow(GAME_CONFIG.COPIES_TO_UPGRADE, unit.starLevel - 1);
        this.unitPool[unit.unitId] = (this.unitPool[unit.unitId] || 0) + unitsReturned;

        // Remove from location
        this.removeUnitFromCurrentLocation(unit);

        // Remove from owned units
        this.ownedUnits.delete(unit.id);

        // Give gold
        this.addGold(sellValue, `sell ${unit.unitId}`);

        console.log(`[State] Sold ${unit.unitId} (${unit.starLevel} star) for ${sellValue} gold`);
        return true;
    }

    /**
     * Check and perform unit upgrades (3 of same unit = upgrade)
     */
    checkForUpgrades(unitId) {
        const matchingUnits = Array.from(this.ownedUnits.values())
            .filter(u => u.unitId === unitId);

        // Group by star level
        const byStarLevel = {};
        matchingUnits.forEach(unit => {
            const star = unit.starLevel;
            if (!byStarLevel[star]) byStarLevel[star] = [];
            byStarLevel[star].push(unit);
        });

        let upgraded = false;

        // Check for upgrades (starting from 1-star to 2-star)
        for (let starLevel = 1; starLevel <= 2; starLevel++) {
            const unitsAtLevel = byStarLevel[starLevel] || [];

            while (unitsAtLevel.length >= GAME_CONFIG.COPIES_TO_UPGRADE) {
                // Get 3 units to combine
                const toUpgrade = unitsAtLevel.splice(0, GAME_CONFIG.COPIES_TO_UPGRADE);

                // Keep the first one and upgrade it
                const upgradedUnit = toUpgrade[0];
                upgradedUnit.starLevel++;

                // Remove the other 2
                for (let i = 1; i < toUpgrade.length; i++) {
                    this.removeUnitFromCurrentLocation(toUpgrade[i]);
                    this.ownedUnits.delete(toUpgrade[i].id);
                }

                // Add upgraded unit to next tier tracking
                if (!byStarLevel[starLevel + 1]) byStarLevel[starLevel + 1] = [];
                byStarLevel[starLevel + 1].push(upgradedUnit);

                this.stats.unitsUpgraded++;
                console.log(`[State] Upgraded ${unitId} to ${upgradedUnit.starLevel} star!`);
                upgraded = true;
            }
        }

        return upgraded;
    }

    /**
     * Count units of a specific type owned
     */
    countUnitsOfType(unitId, starLevel = null) {
        return Array.from(this.ownedUnits.values())
            .filter(u => u.unitId === unitId && (starLevel === null || u.starLevel === starLevel))
            .length;
    }

    // ========================================================================
    // UNIT POOL MANAGEMENT
    // ========================================================================

    /**
     * Get remaining copies of a unit in the pool
     */
    getPoolCount(unitId) {
        return this.unitPool[unitId] || 0;
    }

    /**
     * Check if a unit is available in the pool
     */
    isUnitAvailable(unitId) {
        return this.getPoolCount(unitId) > 0;
    }

    /**
     * Return a unit to the pool
     */
    returnToPool(unitId, count = 1) {
        const maxPool = UNIT_POOL_SIZE[UNITS[unitId]?.cost] || 0;
        this.unitPool[unitId] = Math.min(
            (this.unitPool[unitId] || 0) + count,
            maxPool
        );
    }

    /**
     * Take a unit from the pool
     */
    takeFromPool(unitId) {
        if (this.unitPool[unitId] > 0) {
            this.unitPool[unitId]--;
            return true;
        }
        return false;
    }

    // ========================================================================
    // PHASE AND ROUND MANAGEMENT
    // ========================================================================

    /**
     * Start a new round
     */
    startRound() {
        this.stats.roundsPlayed++;

        // Give XP at start of round
        this.gainXP(GAME_CONFIG.XP_PER_ROUND, 'round start');

        // Collect income
        const income = this.collectIncome();

        this.phase = GAME_PHASES.PREP;
        console.log(`[State] Round ${this.round} started. Income: ${income.total}`);

        return income;
    }

    /**
     * Start combat phase
     */
    startCombat() {
        this.phase = GAME_PHASES.COMBAT;
        console.log('[State] Combat phase started');
    }

    /**
     * End combat with result
     */
    endCombat(won, damage = 0) {
        if (won) {
            this.wins++;
            this.winStreak++;
            this.loseStreak = 0;
            console.log(`[State] Round ${this.round} won! Win streak: ${this.winStreak}`);
        } else {
            this.losses++;
            this.loseStreak++;
            this.winStreak = 0;
            this.takeDamage(damage, 'combat loss');
            console.log(`[State] Round ${this.round} lost. Lose streak: ${this.loseStreak}`);
        }

        this.round++;
        this.phase = GAME_PHASES.PREP;
    }

    /**
     * Get current phase
     */
    getCurrentPhase() {
        return this.phase;
    }

    /**
     * Check if in prep phase
     */
    isPrep() {
        return this.phase === GAME_PHASES.PREP;
    }

    /**
     * Check if in combat phase
     */
    isCombat() {
        return this.phase === GAME_PHASES.COMBAT;
    }

    /**
     * Check if game is over
     */
    isGameOver() {
        return this.phase === GAME_PHASES.GAME_OVER;
    }

    // ========================================================================
    // TRAIT CALCULATIONS
    // ========================================================================

    /**
     * Get active traits from units on board
     */
    getActiveTraits() {
        const traitCounts = {};
        const unitsOnBoard = this.getUnitsOnBoard();

        // Count unique units per trait
        const traitUnits = {};

        unitsOnBoard.forEach(unit => {
            const baseData = unit.getBaseData();
            if (!baseData || !baseData.traits) return;

            baseData.traits.forEach(trait => {
                if (!traitUnits[trait]) traitUnits[trait] = new Set();
                traitUnits[trait].add(unit.unitId);
            });
        });

        // Convert to counts
        for (const trait in traitUnits) {
            traitCounts[trait] = traitUnits[trait].size;
        }

        // Get active bonuses
        const activeTraits = {};
        for (const trait in traitCounts) {
            const bonus = getTraitBonus(trait, traitCounts[trait]);
            if (bonus) {
                activeTraits[trait] = {
                    count: traitCounts[trait],
                    threshold: bonus.threshold,
                    bonus: bonus.bonus,
                    traitData: TRAITS[trait]
                };
            }
        }

        return activeTraits;
    }

    // ========================================================================
    // SHOP MANAGEMENT
    // ========================================================================

    /**
     * Set current shop offerings
     */
    setShop(shopUnits) {
        this.shop = shopUnits;
    }

    /**
     * Lock/unlock shop
     */
    toggleShopLock() {
        this.shopLocked = !this.shopLocked;
        console.log(`[State] Shop ${this.shopLocked ? 'locked' : 'unlocked'}`);
        return this.shopLocked;
    }

    /**
     * Clear shop slot after purchase
     */
    clearShopSlot(index) {
        if (index >= 0 && index < this.shop.length) {
            this.shop[index] = null;
        }
    }

    // ========================================================================
    // SAVE/LOAD
    // ========================================================================

    /**
     * Serialize game state for saving
     */
    toJSON() {
        return {
            version: 1,
            timestamp: Date.now(),

            // Player stats
            gold: this.gold,
            level: this.level,
            xp: this.xp,
            hp: this.hp,
            maxHp: this.maxHp,

            // Progression
            round: this.round,
            phase: this.phase,
            winStreak: this.winStreak,
            loseStreak: this.loseStreak,
            wins: this.wins,
            losses: this.losses,

            // Boards (store unit IDs)
            playerBoard: this.playerBoard.map(row => [...row]),
            enemyBoard: this.enemyBoard.map(row => [...row]),

            // Bench
            bench: [...this.bench],

            // Shop
            shop: [...this.shop],
            shopLocked: this.shopLocked,

            // Unit pool
            unitPool: { ...this.unitPool },

            // Owned units
            ownedUnits: Array.from(this.ownedUnits.entries()).map(([id, unit]) => ({
                id,
                data: unit.toJSON()
            })),

            // Stats
            stats: { ...this.stats }
        };
    }

    /**
     * Load game state from saved data
     */
    fromJSON(data) {
        if (!data || data.version !== 1) {
            console.log('[State] Invalid save data');
            return false;
        }

        try {
            // Player stats
            this.gold = data.gold;
            this.level = data.level;
            this.xp = data.xp;
            this.hp = data.hp;
            this.maxHp = data.maxHp;

            // Progression
            this.round = data.round;
            this.phase = data.phase;
            this.winStreak = data.winStreak;
            this.loseStreak = data.loseStreak;
            this.wins = data.wins;
            this.losses = data.losses;

            // Boards
            this.playerBoard = data.playerBoard.map(row => [...row]);
            this.enemyBoard = data.enemyBoard.map(row => [...row]);

            // Bench
            this.bench = [...data.bench];

            // Shop
            this.shop = [...data.shop];
            this.shopLocked = data.shopLocked;

            // Unit pool
            this.unitPool = { ...data.unitPool };

            // Owned units
            this.ownedUnits = new Map();
            data.ownedUnits.forEach(({ id, data: unitData }) => {
                const unit = UnitInstance.fromJSON(unitData);
                this.ownedUnits.set(id, unit);
            });

            // Stats
            this.stats = { ...data.stats };

            console.log('[State] Game state loaded successfully');
            return true;
        } catch (error) {
            console.error('[State] Failed to load save data:', error);
            return false;
        }
    }

    /**
     * Save to localStorage
     */
    saveToLocalStorage(key = 'autoChessSave') {
        try {
            const saveData = JSON.stringify(this.toJSON());
            localStorage.setItem(key, saveData);
            console.log('[State] Game saved to localStorage');
            return true;
        } catch (error) {
            console.error('[State] Failed to save:', error);
            return false;
        }
    }

    /**
     * Load from localStorage
     */
    loadFromLocalStorage(key = 'autoChessSave') {
        try {
            const saveData = localStorage.getItem(key);
            if (!saveData) {
                console.log('[State] No save data found');
                return false;
            }
            return this.fromJSON(JSON.parse(saveData));
        } catch (error) {
            console.error('[State] Failed to load:', error);
            return false;
        }
    }

    /**
     * Delete save from localStorage
     */
    deleteSave(key = 'autoChessSave') {
        try {
            localStorage.removeItem(key);
            console.log('[State] Save deleted');
            return true;
        } catch (error) {
            console.error('[State] Failed to delete save:', error);
            return false;
        }
    }

    /**
     * Check if save exists
     */
    hasSave(key = 'autoChessSave') {
        return localStorage.getItem(key) !== null;
    }

    // ========================================================================
    // DEBUG/UTILITY
    // ========================================================================

    /**
     * Get state summary for debugging
     */
    getSummary() {
        return {
            player: {
                gold: this.gold,
                level: this.level,
                xp: this.xp,
                xpToNext: this.getXPToNextLevel(),
                hp: `${this.hp}/${this.maxHp}`
            },
            game: {
                round: this.round,
                phase: this.phase,
                winStreak: this.winStreak,
                loseStreak: this.loseStreak
            },
            units: {
                onBoard: this.getTeamSize(),
                maxOnBoard: this.level,
                onBench: this.getUnitsOnBench().length,
                total: this.ownedUnits.size
            },
            activeTraits: Object.keys(this.getActiveTraits())
        };
    }

    /**
     * Print state to console
     */
    debug() {
        console.log('=== Game State Debug ===');
        console.log(JSON.stringify(this.getSummary(), null, 2));
    }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

// Create global game state instance
window.gameState = new GameState();

// Also expose classes and constants for other modules
window.GameState = GameState;
window.UnitInstance = UnitInstance;
window.GAME_PHASES = GAME_PHASES;

console.log('[State] Game state module loaded');
