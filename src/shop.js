/**
 * Auto Chess Shop System
 * Handles shop generation, unit purchasing, selling, and unit combination upgrades
 */

// UNITS, GAME_CONFIG, SHOP_ODDS, UNIT_POOL_SIZE are loaded globally from data.js
// Unit, createUnit are loaded globally from unit.js

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all unit IDs of a specific cost tier
 * @param {number} cost - Unit cost (1, 2, or 3)
 * @returns {string[]} Array of unit template IDs
 */
function getUnitIdsByCost(cost) {
    return Object.keys(UNITS).filter(id => UNITS[id].cost === cost);
}

/**
 * Select a random element from an array
 * @param {Array} array - Array to select from
 * @returns {*} Random element
 */
function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Select a cost tier based on player level probabilities
 * @param {number} level - Player level (1-9)
 * @returns {number} Selected cost tier (1, 2, or 3)
 */
function rollCostTier(level) {
    const odds = SHOP_ODDS[level] || SHOP_ODDS[1];
    const roll = Math.random() * 100;

    let cumulative = 0;
    for (let tier = 0; tier < odds.length; tier++) {
        cumulative += odds[tier];
        if (roll < cumulative) {
            return tier + 1; // Tiers are 1-indexed
        }
    }

    return 1; // Default to 1-cost
}

// ============================================================================
// SHOP CLASS
// ============================================================================

class Shop {
    /**
     * Create a new shop instance
     * @param {GameState} gameState - Reference to the game state
     */
    constructor(gameState) {
        this.gameState = gameState;
        this.offers = new Array(GAME_CONFIG.SHOP_SIZE).fill(null);
        this.locked = false;
    }

    // ========================================================================
    // SHOP GENERATION
    // ========================================================================

    /**
     * Generate 5 random shop offers based on player level
     * Considers unit pool availability
     * @returns {Array} Array of shop offers (unit template IDs or null)
     */
    generateShop() {
        // Don't regenerate if shop is locked
        if (this.locked) {
            console.log('[Shop] Shop is locked, keeping current offers');
            return this.offers;
        }

        const level = this.gameState.level;
        const newOffers = [];

        for (let i = 0; i < GAME_CONFIG.SHOP_SIZE; i++) {
            const offer = this.generateSingleOffer(level);
            newOffers.push(offer);
        }

        this.offers = newOffers;

        // Sync with game state
        this.gameState.setShop(this.offers.map(o => o ? o.templateId : null));

        console.log(`[Shop] Generated shop for level ${level}:`,
            this.offers.map(o => o ? `${o.name} ($${o.cost})` : 'empty'));

        return this.offers;
    }

    /**
     * Generate a single shop offer
     * @param {number} level - Player level
     * @returns {object|null} Unit template data or null if pool exhausted
     */
    generateSingleOffer(level) {
        // Try multiple times to find an available unit
        const maxAttempts = 20;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Roll for cost tier
            const costTier = rollCostTier(level);

            // Get available units of this tier
            const unitIds = getUnitIdsByCost(costTier);

            // Filter to units still available in the pool
            const availableUnitIds = unitIds.filter(id =>
                this.gameState.getPoolCount(id) > 0
            );

            if (availableUnitIds.length > 0) {
                // Select a random available unit, weighted by pool count
                const unitId = this.selectWeightedUnit(availableUnitIds);
                return UNITS[unitId];
            }
        }

        // If we couldn't find any unit after all attempts, return null
        console.log('[Shop] Warning: Could not generate offer, pools may be exhausted');
        return null;
    }

    /**
     * Select a unit weighted by remaining pool count
     * Units with more copies in the pool are more likely to appear
     * @param {string[]} unitIds - Array of unit template IDs
     * @returns {string} Selected unit ID
     */
    selectWeightedUnit(unitIds) {
        // Calculate total weight
        let totalWeight = 0;
        const weights = unitIds.map(id => {
            const weight = this.gameState.getPoolCount(id);
            totalWeight += weight;
            return weight;
        });

        // Roll for selection
        let roll = Math.random() * totalWeight;

        for (let i = 0; i < unitIds.length; i++) {
            roll -= weights[i];
            if (roll <= 0) {
                return unitIds[i];
            }
        }

        // Fallback to random selection
        return randomElement(unitIds);
    }

    // ========================================================================
    // PURCHASING
    // ========================================================================

    /**
     * Buy a unit from the shop
     * @param {number} index - Shop slot index (0-4)
     * @returns {object} Result object with success status and unit/error
     */
    buyUnit(index) {
        // Validate index
        if (index < 0 || index >= GAME_CONFIG.SHOP_SIZE) {
            return { success: false, error: 'Invalid shop slot' };
        }

        // Check if slot has an offer
        const offer = this.offers[index];
        if (!offer) {
            return { success: false, error: 'Shop slot is empty' };
        }

        // Check if player has enough gold
        if (this.gameState.gold < offer.cost) {
            return { success: false, error: 'Not enough gold' };
        }

        // Check if bench has space
        if (!this.gameState.hasBenchSpace()) {
            return { success: false, error: 'Bench is full' };
        }

        // Check if unit is available in pool
        if (this.gameState.getPoolCount(offer.id) <= 0) {
            return { success: false, error: 'Unit no longer available in pool' };
        }

        // Perform the purchase
        // 1. Spend gold
        this.gameState.spendGold(offer.cost, `buy ${offer.name}`);

        // 2. Create the unit and add to bench
        const unit = this.gameState.createUnit(offer.id, true);

        if (!unit) {
            // Refund if unit creation failed
            this.gameState.addGold(offer.cost, 'refund - failed purchase');
            return { success: false, error: 'Failed to create unit' };
        }

        // 3. Clear the shop slot
        this.offers[index] = null;
        this.gameState.clearShopSlot(index);

        // 4. Check for unit combinations
        const upgraded = this.checkCombine(offer.id);

        console.log(`[Shop] Bought ${offer.name} for ${offer.cost} gold`);

        return {
            success: true,
            unit,
            upgraded,
            unitId: offer.id
        };
    }

    // ========================================================================
    // SELLING
    // ========================================================================

    /**
     * Sell a unit back (delegates to GameState)
     * Refunds gold based on unit cost and star level
     * @param {UnitInstance} unit - The unit to sell
     * @returns {object} Result object with success status and gold refunded
     */
    sellUnit(unit) {
        if (!unit) {
            return { success: false, error: 'No unit provided' };
        }

        // Get base unit data for sell value calculation
        const baseData = unit.getBaseData();
        if (!baseData) {
            return { success: false, error: 'Invalid unit' };
        }

        // Calculate sell value
        // 1-star: cost * 1 = cost
        // 2-star: cost * 3 (3 units combined)
        // 3-star: cost * 9 (9 units combined)
        const starMultiplier = Math.pow(GAME_CONFIG.COPIES_TO_UPGRADE, unit.starLevel - 1);
        const sellValue = Math.floor(baseData.cost * starMultiplier * GAME_CONFIG.SELL_REFUND_RATE);

        // Perform the sale through game state
        const success = this.gameState.sellUnit(unit);

        if (success) {
            console.log(`[Shop] Sold ${baseData.name} (${unit.starLevel} star) for ${sellValue} gold`);
            return { success: true, goldRefunded: sellValue };
        }

        return { success: false, error: 'Failed to sell unit' };
    }

    // ========================================================================
    // REFRESH
    // ========================================================================

    /**
     * Refresh the shop (costs 2 gold)
     * @param {boolean} free - If true, refresh is free (round start)
     * @returns {object} Result object with success status
     */
    refresh(free = false) {
        // If shop is locked and this isn't a forced refresh, don't refresh
        if (this.locked && !free) {
            return { success: false, error: 'Shop is locked' };
        }

        // Check and spend gold if not free
        if (!free) {
            if (this.gameState.gold < GAME_CONFIG.REROLL_COST) {
                return { success: false, error: 'Not enough gold for refresh' };
            }

            this.gameState.spendGold(GAME_CONFIG.REROLL_COST, 'shop refresh');
        }

        // Generate new shop
        this.locked = false; // Unlock before generating
        this.generateShop();

        console.log(`[Shop] Shop refreshed${free ? ' (free)' : ` (cost: ${GAME_CONFIG.REROLL_COST}g)`}`);

        return { success: true, offers: this.offers };
    }

    /**
     * Automatic refresh at round start
     * Called when a new round begins
     */
    onRoundStart() {
        // Only refresh if not locked
        if (!this.locked) {
            this.refresh(true);
        }
        console.log('[Shop] Round start - shop updated');
    }

    // ========================================================================
    // SHOP LOCK
    // ========================================================================

    /**
     * Toggle shop lock status
     * @returns {boolean} New lock status
     */
    toggleLock() {
        this.locked = !this.locked;
        this.gameState.shopLocked = this.locked;
        console.log(`[Shop] Shop ${this.locked ? 'locked' : 'unlocked'}`);
        return this.locked;
    }

    /**
     * Set shop lock status
     * @param {boolean} locked - Whether to lock the shop
     */
    setLocked(locked) {
        this.locked = locked;
        this.gameState.shopLocked = locked;
    }

    // ========================================================================
    // UNIT COMBINATION
    // ========================================================================

    /**
     * Check for and perform unit combinations
     * 3 same units = 1 star upgrade
     * @param {string} unitId - The unit template ID to check for combinations
     * @returns {boolean} True if an upgrade occurred
     */
    checkCombine(unitId) {
        // Delegate to game state's upgrade check
        const upgraded = this.gameState.checkForUpgrades(unitId);

        if (upgraded) {
            console.log(`[Shop] Unit combination: ${UNITS[unitId]?.name || unitId} upgraded!`);
        }

        return upgraded;
    }

    /**
     * Check all owned units for possible combinations
     * Useful after loading a save or complex operations
     * @returns {object} Object with upgraded unit IDs
     */
    checkAllCombinations() {
        const upgrades = {};
        const checkedTypes = new Set();

        // Get all owned units
        for (const [id, unit] of this.gameState.ownedUnits) {
            if (!checkedTypes.has(unit.unitId)) {
                checkedTypes.add(unit.unitId);
                if (this.checkCombine(unit.unitId)) {
                    upgrades[unit.unitId] = true;
                }
            }
        }

        return upgrades;
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Get current shop offers
     * @returns {Array} Array of unit template data or null for empty slots
     */
    getOffers() {
        return this.offers;
    }

    /**
     * Get shop offer at specific index
     * @param {number} index - Shop slot index
     * @returns {object|null} Unit template data or null
     */
    getOffer(index) {
        if (index < 0 || index >= this.offers.length) {
            return null;
        }
        return this.offers[index];
    }

    /**
     * Check if a specific shop slot has an offer
     * @param {number} index - Shop slot index
     * @returns {boolean} True if slot has an offer
     */
    hasOffer(index) {
        return this.offers[index] !== null;
    }

    /**
     * Get the refresh cost
     * @returns {number} Gold cost to refresh
     */
    getRefreshCost() {
        return GAME_CONFIG.REROLL_COST;
    }

    /**
     * Check if player can afford to refresh
     * @returns {boolean} True if player has enough gold
     */
    canAffordRefresh() {
        return this.gameState.gold >= GAME_CONFIG.REROLL_COST;
    }

    /**
     * Check if player can afford a specific unit
     * @param {number} index - Shop slot index
     * @returns {boolean} True if player can afford the unit
     */
    canAffordUnit(index) {
        const offer = this.offers[index];
        if (!offer) return false;
        return this.gameState.gold >= offer.cost;
    }

    /**
     * Get shop odds for current level
     * @returns {number[]} Array of percentages for each cost tier
     */
    getCurrentOdds() {
        return SHOP_ODDS[this.gameState.level] || SHOP_ODDS[1];
    }

    /**
     * Get shop state summary for debugging
     * @returns {object} Shop state summary
     */
    getSummary() {
        return {
            locked: this.locked,
            offers: this.offers.map((o, i) => ({
                slot: i,
                unit: o ? o.name : null,
                cost: o ? o.cost : null,
                canAfford: this.canAffordUnit(i)
            })),
            canRefresh: this.canAffordRefresh(),
            refreshCost: GAME_CONFIG.REROLL_COST,
            odds: this.getCurrentOdds()
        };
    }

    /**
     * Serialize shop state
     * @returns {object} Serialized shop data
     */
    toJSON() {
        return {
            offers: this.offers.map(o => o ? o.id : null),
            locked: this.locked
        };
    }

    /**
     * Load shop state from saved data
     * @param {object} data - Saved shop data
     */
    fromJSON(data) {
        if (!data) return;

        this.locked = data.locked || false;
        this.offers = (data.offers || []).map(id => id ? UNITS[id] : null);

        // Pad offers array to correct size
        while (this.offers.length < GAME_CONFIG.SHOP_SIZE) {
            this.offers.push(null);
        }
    }

    /**
     * Print shop state to console for debugging
     */
    debug() {
        console.log('=== Shop Debug ===');
        console.log(JSON.stringify(this.getSummary(), null, 2));
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new shop instance
 * @param {GameState} gameState - Reference to the game state
 * @returns {Shop} New shop instance
 */
function createShop(gameState) {
    const shop = new Shop(gameState);
    shop.generateShop();
    return shop;
}

// ============================================================================
// EXPORT
// ============================================================================

// Expose globally
window.Shop = Shop;
window.createShop = createShop;

console.log('[Shop] Shop module loaded');
