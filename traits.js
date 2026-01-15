/**
 * Auto Chess Trait/Synergy System
 * Calculates active traits from board units and applies trait bonuses
 */

// TRAITS is loaded globally from data.js

// ============================================================================
// TRAIT THRESHOLDS
// ============================================================================

const TRAIT_THRESHOLDS = [2, 4]; // Standard breakpoints for all traits

// ============================================================================
// TRAIT SYSTEM CLASS
// ============================================================================

class TraitSystem {
    constructor() {
        // Map of trait ID to count of units with that trait
        this.traitCounts = new Map();

        // Map of trait ID to active bonus level (threshold reached)
        this.activeTraits = new Map();

        // Track which units have which traits for bonus application
        this.unitTraitMap = new Map();

        // Store elemental units for death effect tracking
        this.elementalUnits = new Set();
    }

    /**
     * Calculate trait counts from an array of units on the board
     * @param {Unit[]} units - Array of units to calculate traits from
     * @returns {Map<string, number>} Map of trait ID to unit count
     */
    calculateTraits(units) {
        // Reset counts
        this.traitCounts.clear();
        this.unitTraitMap.clear();
        this.elementalUnits.clear();

        // Filter to only alive units on the board
        const activeUnits = units.filter(unit => unit.isOnBoard && unit.isAlive);

        // Count unique units per trait (each unit contributes once per trait)
        for (const unit of activeUnits) {
            // Store unit's traits for later bonus application
            this.unitTraitMap.set(unit.id, unit.traits);

            for (const traitId of unit.traits) {
                const currentCount = this.traitCounts.get(traitId) || 0;
                this.traitCounts.set(traitId, currentCount + 1);

                // Track elemental units for AoE death effect
                if (traitId === 'elemental') {
                    this.elementalUnits.add(unit.id);
                }
            }
        }

        // Calculate which traits are active (meet threshold)
        this._calculateActiveTraits();

        return this.traitCounts;
    }

    /**
     * Determine which traits meet their activation thresholds
     * @private
     */
    _calculateActiveTraits() {
        this.activeTraits.clear();

        for (const [traitId, count] of this.traitCounts) {
            const trait = TRAITS[traitId];
            if (!trait) continue;

            // Find highest threshold met
            let activeThreshold = null;
            for (const threshold of TRAIT_THRESHOLDS) {
                if (count >= threshold && trait.bonuses[threshold]) {
                    activeThreshold = threshold;
                }
            }

            if (activeThreshold !== null) {
                this.activeTraits.set(traitId, {
                    threshold: activeThreshold,
                    count: count,
                    bonus: trait.bonuses[activeThreshold]
                });
            }
        }
    }

    /**
     * Get all currently active traits with their bonus information
     * @returns {Map<string, object>} Map of trait ID to active trait info
     */
    getActiveTraits() {
        return new Map(this.activeTraits);
    }

    /**
     * Apply trait bonuses to all units
     * @param {Unit[]} units - Array of units to apply bonuses to
     */
    applyBonuses(units) {
        // Filter to alive units on board
        const activeUnits = units.filter(unit => unit.isOnBoard && unit.isAlive);

        for (const unit of activeUnits) {
            // Reset buffs before applying new ones
            unit.resetBuffs();

            // Get unit's traits
            const unitTraits = unit.traits;

            // Apply bonuses from each active trait the unit has
            for (const traitId of unitTraits) {
                const activeTraitInfo = this.activeTraits.get(traitId);
                if (activeTraitInfo) {
                    this._applyTraitBonus(unit, traitId, activeTraitInfo.bonus);
                }
            }
        }
    }

    /**
     * Apply a specific trait bonus to a unit
     * @private
     * @param {Unit} unit - Unit to apply bonus to
     * @param {string} traitId - ID of the trait
     * @param {object} bonus - Bonus stats from the trait
     */
    _applyTraitBonus(unit, traitId, bonus) {
        // Map trait bonus keys to unit buff keys
        const bonusMapping = {
            // Warrior bonuses
            armor: 'armorBonus',
            attackBonus: 'attackBonus',

            // Mage bonuses
            spellPower: 'spellPower',
            manaRegen: 'manaRegen',

            // Assassin bonuses
            critChance: 'critChance',
            critDamage: 'critDamage',

            // Tank bonuses
            hpBonus: 'hpBonus',
            damageReduction: 'damageReduction',

            // Ranger bonuses
            attackSpeedBonus: 'attackSpeedBonus',
            // range is handled separately

            // Elemental bonuses
            magicDamage: 'magicDamage',
            magicResist: 'magicResistBonus'
        };

        for (const [bonusKey, value] of Object.entries(bonus)) {
            const buffKey = bonusMapping[bonusKey];
            if (buffKey && buffKey in unit.buffs) {
                unit.buffs[buffKey] += value;
            }

            // Handle range bonus for Rangers (4-piece)
            if (bonusKey === 'range') {
                unit.range += value;
            }
        }
    }

    /**
     * Check if a unit has the elemental trait active (for death AoE)
     * @param {string} unitId - ID of the unit
     * @returns {boolean} True if unit is an elemental with active trait
     */
    hasElementalDeathEffect(unitId) {
        if (!this.elementalUnits.has(unitId)) {
            return false;
        }
        return this.activeTraits.has('elemental');
    }

    /**
     * Get elemental death AoE damage value
     * @returns {number} Magic damage to deal on death (0 if trait not active)
     */
    getElementalDeathDamage() {
        const elementalInfo = this.activeTraits.get('elemental');
        if (!elementalInfo) {
            return 0;
        }
        // Use the magicDamage value as the death AoE damage
        return elementalInfo.bonus.magicDamage || 0;
    }

    /**
     * Get a formatted display of all traits for UI
     * @returns {Array<object>} Array of trait display objects
     */
    getTraitDisplay() {
        const display = [];

        // Get all traits that have at least one unit
        for (const [traitId, count] of this.traitCounts) {
            const trait = TRAITS[traitId];
            if (!trait) continue;

            // Get thresholds for this trait
            const thresholds = Object.keys(trait.bonuses).map(Number).sort((a, b) => a - b);

            // Find current threshold level
            const activeInfo = this.activeTraits.get(traitId);
            const isActive = activeInfo !== undefined;
            const currentThreshold = isActive ? activeInfo.threshold : 0;

            // Find next threshold
            const nextThreshold = thresholds.find(t => t > count) || thresholds[thresholds.length - 1];

            display.push({
                id: traitId,
                name: trait.name,
                description: trait.description,
                count: count,
                thresholds: thresholds,
                currentThreshold: currentThreshold,
                nextThreshold: nextThreshold,
                isActive: isActive,
                bonus: isActive ? activeInfo.bonus : null,
                // Display string like "2/4" or "4/4"
                progressString: `${count}/${nextThreshold}`,
                // Style hints for UI
                style: this._getTraitStyle(traitId, isActive, count, thresholds)
            });
        }

        // Sort: active traits first, then by count
        display.sort((a, b) => {
            if (a.isActive !== b.isActive) {
                return a.isActive ? -1 : 1;
            }
            return b.count - a.count;
        });

        return display;
    }

    /**
     * Get style hints for a trait display
     * @private
     * @param {string} traitId - Trait identifier
     * @param {boolean} isActive - Whether trait is active
     * @param {number} count - Current unit count
     * @param {number[]} thresholds - Available thresholds
     * @returns {object} Style hints
     */
    _getTraitStyle(traitId, isActive, count, thresholds) {
        // Determine tier based on highest threshold reached
        let tier = 'inactive';
        if (isActive) {
            const maxThreshold = Math.max(...thresholds);
            const activeThreshold = this.activeTraits.get(traitId).threshold;
            if (activeThreshold === maxThreshold) {
                tier = 'gold'; // Max tier reached
            } else {
                tier = 'bronze'; // First tier reached
            }
        }

        // Color hints based on trait type
        const colors = {
            warrior: '#c0392b',    // Red
            mage: '#9b59b6',       // Purple
            assassin: '#2c3e50',   // Dark gray
            tank: '#27ae60',       // Green
            ranger: '#f39c12',     // Orange
            elemental: '#3498db'   // Blue
        };

        return {
            tier: tier,
            color: colors[traitId] || '#95a5a6',
            icon: this._getTraitIcon(traitId)
        };
    }

    /**
     * Get icon/emoji for a trait
     * @private
     * @param {string} traitId - Trait identifier
     * @returns {string} Emoji icon
     */
    _getTraitIcon(traitId) {
        const icons = {
            warrior: '⚔️',
            mage: '🔮',
            assassin: '🗡️',
            tank: '🛡️',
            ranger: '🏹',
            elemental: '✨'
        };
        return icons[traitId] || '❓';
    }

    /**
     * Get a summary string for active traits
     * @returns {string} Human-readable summary
     */
    getSummary() {
        if (this.activeTraits.size === 0) {
            return 'No active synergies';
        }

        const parts = [];
        for (const [traitId, info] of this.activeTraits) {
            const trait = TRAITS[traitId];
            if (trait) {
                parts.push(`${trait.name} (${info.count})`);
            }
        }

        return parts.join(', ');
    }

    /**
     * Reset all trait calculations
     */
    reset() {
        this.traitCounts.clear();
        this.activeTraits.clear();
        this.unitTraitMap.clear();
        this.elementalUnits.clear();
    }

    /**
     * Get bonus description for a trait at a specific threshold
     * @param {string} traitId - Trait identifier
     * @param {number} threshold - Threshold level
     * @returns {string} Human-readable bonus description
     */
    getBonusDescription(traitId, threshold) {
        const trait = TRAITS[traitId];
        if (!trait || !trait.bonuses[threshold]) {
            return '';
        }

        const bonus = trait.bonuses[threshold];
        const parts = [];

        // Format each bonus
        for (const [key, value] of Object.entries(bonus)) {
            const formatted = this._formatBonusValue(key, value);
            if (formatted) {
                parts.push(formatted);
            }
        }

        return parts.join(', ');
    }

    /**
     * Format a single bonus value for display
     * @private
     * @param {string} key - Bonus key
     * @param {number} value - Bonus value
     * @returns {string} Formatted string
     */
    _formatBonusValue(key, value) {
        const formatMap = {
            armor: `+${value} Armor`,
            attackBonus: `+${value} Attack`,
            spellPower: `+${value} Spell Power`,
            manaRegen: `+${value} Mana Regen`,
            critChance: `+${value}% Crit Chance`,
            critDamage: `+${value}% Crit Damage`,
            hpBonus: `+${value} HP`,
            damageReduction: `${value}% Damage Reduction`,
            attackSpeedBonus: `+${Math.round(value * 100)}% Attack Speed`,
            range: `+${value} Range`,
            magicDamage: `+${value} Magic Damage`,
            magicResist: `+${value} Magic Resist`
        };

        return formatMap[key] || `+${value} ${key}`;
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

// Create a default trait system instance for convenience
let defaultTraitSystem = null;

/**
 * Get the default trait system instance
 * @returns {TraitSystem} The default trait system
 */
function getTraitSystem() {
    if (!defaultTraitSystem) {
        defaultTraitSystem = new TraitSystem();
    }
    return defaultTraitSystem;
}

/**
 * Create a new trait system instance
 * @returns {TraitSystem} New trait system instance
 */
function createTraitSystem() {
    return new TraitSystem();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate and apply traits in one step
 * @param {Unit[]} units - Units to process
 * @returns {TraitSystem} The trait system with calculated traits
 */
function calculateAndApplyTraits(units) {
    const system = getTraitSystem();
    system.calculateTraits(units);
    system.applyBonuses(units);
    return system;
}

/**
 * Get trait info for a specific trait
 * @param {string} traitId - Trait identifier
 * @returns {object|null} Trait definition or null if not found
 */
function getTraitInfo(traitId) {
    return TRAITS[traitId] || null;
}

/**
 * Get all available traits
 * @returns {object} All trait definitions
 */
function getAllTraits() {
    return { ...TRAITS };
}

// ============================================================================
// EXPORT
// ============================================================================

// Expose globally
window.TraitSystem = TraitSystem;
window.getTraitSystem = getTraitSystem;
window.createTraitSystem = createTraitSystem;
window.calculateAndApplyTraits = calculateAndApplyTraits;
window.getTraitInfo = getTraitInfo;
window.getAllTraits = getAllTraits;

console.log('[Traits] Trait system module loaded');
