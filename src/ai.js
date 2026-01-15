/**
 * Auto Chess AI Opponent System
 * Generates enemy boards with scaling difficulty based on round number
 */

// UNITS, GAME_CONFIG, TRAITS are loaded globally from data.js
// Unit, createUnit are loaded globally from unit.js

// ============================================================================
// AI CONFIGURATION
// ============================================================================

const AI_CONFIG = {
    // Boss round interval
    BOSS_ROUND_INTERVAL: 5,

    // Boss stat multipliers
    BOSS_HP_MULTIPLIER: 1.5,
    BOSS_ATTACK_MULTIPLIER: 1.3,

    // Board positioning
    FRONT_ROW: 4,  // Enemy front line (row 4 from player perspective)
    BACK_ROW: 7,   // Enemy back line

    // Synergy priority weights
    SYNERGY_WEIGHT: 0.3
};

// ============================================================================
// UNIT CATEGORIZATION
// ============================================================================

/**
 * Get units organized by cost tier
 */
function getUnitsByTier() {
    const tiers = { 1: [], 2: [], 3: [] };

    for (const [id, unit] of Object.entries(UNITS)) {
        if (tiers[unit.cost]) {
            tiers[unit.cost].push(id);
        }
    }

    return tiers;
}

/**
 * Get units organized by trait
 */
function getUnitsByTrait() {
    const traitMap = {};

    for (const [id, unit] of Object.entries(UNITS)) {
        for (const trait of unit.traits) {
            if (!traitMap[trait]) {
                traitMap[trait] = [];
            }
            traitMap[trait].push(id);
        }
    }

    return traitMap;
}

// Cached lookups
const UNITS_BY_TIER = getUnitsByTier();
const UNITS_BY_TRAIT = getUnitsByTrait();

// ============================================================================
// AI CLASS
// ============================================================================

class AI {
    constructor() {
        this.ownerId = 'ai';
    }

    // ========================================================================
    // MAIN BOARD GENERATION
    // ========================================================================

    /**
     * Generate an enemy board based on the current round
     * @param {number} round - Current round number (1-based)
     * @returns {Unit[]} Array of positioned enemy units
     */
    generateBoard(round) {
        // Check for boss round
        if (this.isBossRound(round)) {
            return this.createBossRound(round);
        }

        let units;

        if (round <= 5) {
            // Early game: 1-3 tier-1 units
            units = this.generateEarlyGame(round);
        } else if (round <= 10) {
            // Mid game: tier-1 and tier-2 with synergies
            units = this.generateMidGame(round);
        } else {
            // Late game: full boards with strong synergies
            units = this.generateLateGame(round);
        }

        // Position units on the board
        this.positionUnits(units);

        // Set owner for all units
        for (const unit of units) {
            unit.ownerId = this.ownerId;
        }

        return units;
    }

    /**
     * Check if a round is a boss round
     * @param {number} round - Round number
     * @returns {boolean}
     */
    isBossRound(round) {
        return round > 0 && round % AI_CONFIG.BOSS_ROUND_INTERVAL === 0;
    }

    // ========================================================================
    // EARLY GAME (Rounds 1-5)
    // ========================================================================

    /**
     * Generate early game board with tier-1 units
     * @param {number} round - Current round
     * @returns {Unit[]} Array of units (not yet positioned)
     */
    generateEarlyGame(round) {
        // Scale unit count with round (1-3 units)
        const unitCount = Math.min(3, Math.max(1, Math.ceil(round / 2)));
        const units = [];

        // Get tier-1 units
        const tier1Units = UNITS_BY_TIER[1];

        for (let i = 0; i < unitCount; i++) {
            const templateId = this.randomChoice(tier1Units);
            const unit = createUnit(templateId, 1);
            units.push(unit);
        }

        return units;
    }

    // ========================================================================
    // MID GAME (Rounds 6-10)
    // ========================================================================

    /**
     * Generate mid game board with tier-1/2 units and synergies
     * @param {number} round - Current round
     * @returns {Unit[]} Array of units (not yet positioned)
     */
    generateMidGame(round) {
        // 3-5 units based on round
        const unitCount = Math.min(5, 3 + Math.floor((round - 6) / 2));
        const units = [];

        // Pick a primary trait to build around
        const primaryTrait = this.randomChoice(Object.keys(TRAITS));
        const traitUnits = UNITS_BY_TRAIT[primaryTrait] || [];

        // Add 2 units of the primary trait for synergy activation
        const synergyCount = Math.min(2, traitUnits.length, unitCount);
        for (let i = 0; i < synergyCount; i++) {
            const validTraitUnits = traitUnits.filter(id => {
                const cost = UNITS[id].cost;
                return cost <= 2; // Only tier 1-2 for mid game
            });

            if (validTraitUnits.length > 0) {
                const templateId = this.randomChoice(validTraitUnits);
                const starLevel = round >= 8 ? this.randomStar(1, 2) : 1;
                units.push(createUnit(templateId, starLevel));
            }
        }

        // Fill remaining slots with tier-1 and tier-2 units
        const remainingSlots = unitCount - units.length;
        const availableTiers = [...UNITS_BY_TIER[1], ...UNITS_BY_TIER[2]];

        for (let i = 0; i < remainingSlots; i++) {
            const templateId = this.randomChoice(availableTiers);
            const starLevel = round >= 9 ? this.randomStar(1, 2) : 1;
            units.push(createUnit(templateId, starLevel));
        }

        return units;
    }

    // ========================================================================
    // LATE GAME (Rounds 11+)
    // ========================================================================

    /**
     * Generate late game board with full team and strong synergies
     * @param {number} round - Current round
     * @returns {Unit[]} Array of units (not yet positioned)
     */
    generateLateGame(round) {
        // 6-9 units based on round
        const baseCount = 6;
        const bonusUnits = Math.min(3, Math.floor((round - 11) / 3));
        const unitCount = Math.min(GAME_CONFIG.MAX_TEAM_SIZE, baseCount + bonusUnits);

        const units = [];

        // Pick two synergy traits to focus on
        const traitKeys = Object.keys(TRAITS);
        const primaryTrait = this.randomChoice(traitKeys);
        const secondaryTrait = this.randomChoice(traitKeys.filter(t => t !== primaryTrait));

        // Build primary synergy (4 units if possible)
        const primaryUnits = UNITS_BY_TRAIT[primaryTrait] || [];
        const primaryCount = Math.min(4, primaryUnits.length, unitCount);

        for (let i = 0; i < primaryCount; i++) {
            const templateId = this.randomChoice(primaryUnits);
            const starLevel = this.getLateGameStarLevel(round);
            units.push(createUnit(templateId, starLevel));
        }

        // Build secondary synergy (2 units)
        const secondaryUnits = UNITS_BY_TRAIT[secondaryTrait] || [];
        const secondaryCount = Math.min(2, secondaryUnits.length, unitCount - units.length);

        for (let i = 0; i < secondaryCount; i++) {
            const templateId = this.randomChoice(secondaryUnits);
            const starLevel = this.getLateGameStarLevel(round);
            units.push(createUnit(templateId, starLevel));
        }

        // Fill remaining with high-tier units
        const remainingSlots = unitCount - units.length;
        const highTierUnits = [...UNITS_BY_TIER[2], ...UNITS_BY_TIER[3]];

        for (let i = 0; i < remainingSlots; i++) {
            // Prefer tier-3 in late late game
            const preferTier3 = round >= 15 && Math.random() < 0.5;
            const pool = preferTier3 ? UNITS_BY_TIER[3] : highTierUnits;
            const templateId = this.randomChoice(pool);
            const starLevel = this.getLateGameStarLevel(round);
            units.push(createUnit(templateId, starLevel));
        }

        return units;
    }

    /**
     * Determine star level for late game units
     * @param {number} round - Current round
     * @returns {number} Star level (1-3)
     */
    getLateGameStarLevel(round) {
        if (round >= 20) {
            // Very late game: chance for 3-star
            return this.randomStar(2, 3);
        } else if (round >= 15) {
            // Late game: mix of 1 and 2 star
            return this.randomStar(1, 2);
        } else {
            // Early late game: mostly 1 star with some 2
            return Math.random() < 0.3 ? 2 : 1;
        }
    }

    // ========================================================================
    // BOSS ROUNDS
    // ========================================================================

    /**
     * Create a boss round with buffed units
     * @param {number} round - Current round (should be divisible by 5)
     * @returns {Unit[]} Array of positioned boss units
     */
    createBossRound(round) {
        const bossLevel = Math.floor(round / AI_CONFIG.BOSS_ROUND_INTERVAL);
        const units = [];

        // Boss composition scales with level
        let composition;

        if (bossLevel === 1) {
            // Round 5: Single powerful unit + 1 minion
            composition = this.createBossComposition(1, 1);
        } else if (bossLevel === 2) {
            // Round 10: 1 boss + 3 minions
            composition = this.createBossComposition(1, 3);
        } else if (bossLevel === 3) {
            // Round 15: 2 bosses + 3 minions
            composition = this.createBossComposition(2, 3);
        } else {
            // Round 20+: 2-3 bosses + 4-5 minions
            const bossCount = Math.min(3, Math.floor(bossLevel / 2) + 1);
            const minionCount = Math.min(5, bossLevel);
            composition = this.createBossComposition(bossCount, minionCount);
        }

        // Create boss units
        for (const bossDef of composition.bosses) {
            const unit = createUnit(bossDef.templateId, bossDef.starLevel);
            this.applyBossBuffs(unit, round);
            units.push(unit);
        }

        // Create minion units
        for (const minionDef of composition.minions) {
            const unit = createUnit(minionDef.templateId, minionDef.starLevel);
            units.push(unit);
        }

        // Position units
        this.positionUnits(units);

        // Set owner
        for (const unit of units) {
            unit.ownerId = this.ownerId;
        }

        return units;
    }

    /**
     * Create boss composition definition
     * @param {number} bossCount - Number of boss units
     * @param {number} minionCount - Number of minion units
     * @returns {object} Composition with bosses and minions arrays
     */
    createBossComposition(bossCount, minionCount) {
        const bosses = [];
        const minions = [];

        // Bosses are high-tier units
        const bossCandidates = [...UNITS_BY_TIER[3], ...UNITS_BY_TIER[2]];

        for (let i = 0; i < bossCount; i++) {
            const templateId = this.randomChoice(bossCandidates);
            bosses.push({
                templateId,
                starLevel: 2  // Bosses are at least 2-star
            });
        }

        // Minions are lower-tier units
        const minionCandidates = [...UNITS_BY_TIER[1], ...UNITS_BY_TIER[2]];

        for (let i = 0; i < minionCount; i++) {
            const templateId = this.randomChoice(minionCandidates);
            minions.push({
                templateId,
                starLevel: 1
            });
        }

        return { bosses, minions };
    }

    /**
     * Apply boss-specific stat buffs to a unit
     * @param {Unit} unit - The unit to buff
     * @param {number} round - Current round for scaling
     */
    applyBossBuffs(unit, round) {
        // Scale buffs with round number
        const scaleFactor = 1 + (round / 50);

        // Apply HP multiplier
        const hpMultiplier = AI_CONFIG.BOSS_HP_MULTIPLIER * scaleFactor;
        unit.maxHp = Math.floor(unit.maxHp * hpMultiplier);
        unit.currentHp = unit.maxHp;

        // Apply attack multiplier via buff
        const attackBonus = Math.floor(unit.baseAttack * (AI_CONFIG.BOSS_ATTACK_MULTIPLIER - 1) * scaleFactor);
        unit.buffs.attackBonus += attackBonus;

        // Bosses have bonus armor and magic resist
        unit.buffs.armorBonus += Math.floor(10 * scaleFactor);
        unit.buffs.magicResistBonus += Math.floor(10 * scaleFactor);
    }

    // ========================================================================
    // UNIT POSITIONING
    // ========================================================================

    /**
     * Position units on the enemy side of the board
     * Places tanks/melee in front, ranged in back
     * @param {Unit[]} units - Array of units to position
     */
    positionUnits(units) {
        if (units.length === 0) return;

        // Separate units by role
        const frontLineUnits = [];
        const backLineUnits = [];

        for (const unit of units) {
            const template = UNITS[unit.templateId];

            // Melee units (range 1) and tanks go front
            if (template.range === 1 || template.traits.includes('tank')) {
                frontLineUnits.push(unit);
            } else {
                backLineUnits.push(unit);
            }
        }

        // If all units are one type, split them
        if (frontLineUnits.length === 0) {
            // Move some ranged to front
            const moveCount = Math.ceil(backLineUnits.length / 2);
            for (let i = 0; i < moveCount; i++) {
                frontLineUnits.push(backLineUnits.shift());
            }
        } else if (backLineUnits.length === 0 && frontLineUnits.length > 2) {
            // Move some melee to back
            const moveCount = Math.floor(frontLineUnits.length / 2);
            for (let i = 0; i < moveCount; i++) {
                backLineUnits.push(frontLineUnits.pop());
            }
        }

        // Generate positions
        const frontPositions = this.generateRowPositions(AI_CONFIG.FRONT_ROW, frontLineUnits.length);
        const backPositions = this.generateRowPositions(AI_CONFIG.BACK_ROW, backLineUnits.length);

        // Assign positions
        for (let i = 0; i < frontLineUnits.length; i++) {
            const pos = frontPositions[i];
            frontLineUnits[i].setPosition(pos.x, pos.y);
        }

        for (let i = 0; i < backLineUnits.length; i++) {
            const pos = backPositions[i];
            backLineUnits[i].setPosition(pos.x, pos.y);
        }
    }

    /**
     * Generate centered positions for a row
     * @param {number} row - Row number (y coordinate)
     * @param {number} count - Number of positions needed
     * @returns {Array<{x: number, y: number}>} Array of positions
     */
    generateRowPositions(row, count) {
        if (count === 0) return [];

        const positions = [];
        const boardWidth = GAME_CONFIG.BOARD_COLS;

        // Center the units in the row
        const startX = Math.floor((boardWidth - count) / 2);

        for (let i = 0; i < count; i++) {
            // Add some randomness to X position within bounds
            let x = startX + i;

            // Slight random offset for variety (keep within bounds)
            if (Math.random() < 0.3 && count < boardWidth - 2) {
                const offset = Math.random() < 0.5 ? -1 : 1;
                x = Math.max(0, Math.min(boardWidth - 1, x + offset));
            }

            positions.push({ x, y: row });
        }

        // Shuffle positions slightly for variety
        this.shuffleArray(positions);

        // Ensure no duplicate positions
        const usedPositions = new Set();
        const finalPositions = [];

        for (const pos of positions) {
            const key = `${pos.x},${pos.y}`;
            if (!usedPositions.has(key)) {
                usedPositions.add(key);
                finalPositions.push(pos);
            } else {
                // Find alternative position
                for (let x = 0; x < boardWidth; x++) {
                    const altKey = `${x},${pos.y}`;
                    if (!usedPositions.has(altKey)) {
                        usedPositions.add(altKey);
                        finalPositions.push({ x, y: pos.y });
                        break;
                    }
                }
            }
        }

        return finalPositions;
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Pick a random element from an array
     * @param {Array} array - Array to pick from
     * @returns {*} Random element
     */
    randomChoice(array) {
        if (!array || array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }

    /**
     * Generate a random star level within a range
     * @param {number} min - Minimum star level
     * @param {number} max - Maximum star level
     * @returns {number} Random star level
     */
    randomStar(min, max) {
        return min + Math.floor(Math.random() * (max - min + 1));
    }

    /**
     * Fisher-Yates shuffle (in-place)
     * @param {Array} array - Array to shuffle
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    /**
     * Get information about the AI's strategy for a round
     * @param {number} round - Round number
     * @returns {object} Strategy info
     */
    getStrategyInfo(round) {
        if (this.isBossRound(round)) {
            const bossLevel = Math.floor(round / AI_CONFIG.BOSS_ROUND_INTERVAL);
            return {
                type: 'boss',
                round,
                bossLevel,
                description: `Boss Round ${bossLevel}: Powerful enemies with buffed stats!`
            };
        }

        if (round <= 5) {
            return {
                type: 'early',
                round,
                unitCount: Math.min(3, Math.max(1, Math.ceil(round / 2))),
                description: 'Early Game: Build your economy and basic synergies.'
            };
        }

        if (round <= 10) {
            return {
                type: 'mid',
                round,
                unitCount: Math.min(5, 3 + Math.floor((round - 6) / 2)),
                description: 'Mid Game: Enemies are forming synergies. Upgrade your units!'
            };
        }

        return {
            type: 'late',
            round,
            unitCount: Math.min(GAME_CONFIG.MAX_TEAM_SIZE, 6 + Math.min(3, Math.floor((round - 11) / 3))),
            description: 'Late Game: Full enemy boards with strong synergies. Win or die!'
        };
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new AI opponent instance
 * @returns {AI} New AI instance
 */
function createAI() {
    return new AI();
}

// ============================================================================
// EXPORT
// ============================================================================

// Expose globally
window.AI = AI;
window.createAI = createAI;

console.log('[AI] AI opponent module loaded');
