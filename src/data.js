/**
 * Auto Chess Game Data Module
 * Contains all unit definitions, traits, and game configuration
 */

// ============================================================================
// GAME CONFIGURATION
// ============================================================================

const GAME_CONFIG = {
    // Board dimensions
    BOARD_COLS: 8,
    BOARD_ROWS: 8,
    PLAYER_ROWS: 4, // Rows available for unit placement per player

    // Economy
    STARTING_GOLD: 10,
    PASSIVE_INCOME: 5,
    WIN_STREAK_BONUS: [0, 1, 1, 2, 2, 3], // Index = streak count
    LOSE_STREAK_BONUS: [0, 1, 1, 2, 2, 3],
    INTEREST_RATE: 0.1, // 10% of gold, max 5
    MAX_INTEREST: 5,
    SELL_REFUND_RATE: 1.0, // Full refund for same-star units

    // Player
    STARTING_HP: 100,
    BENCH_SIZE: 9,
    MAX_TEAM_SIZE: 9,

    // Shop
    SHOP_SIZE: 5,
    REROLL_COST: 2,

    // XP and Leveling
    XP_PER_ROUND: 2,
    XP_PURCHASE_COST: 4,
    XP_PER_PURCHASE: 4,

    // Star upgrades (3 copies to upgrade)
    COPIES_TO_UPGRADE: 3,

    // Combat
    COMBAT_TICK_MS: 100,
    MANA_PER_ATTACK: 10,
    MANA_PER_DAMAGE_TAKEN: 5,
    MAX_MANA: 100
};

// ============================================================================
// LEVEL UP XP THRESHOLDS
// ============================================================================

const LEVEL_XP = {
    1: 0,    // Start at level 1
    2: 2,
    3: 6,
    4: 10,
    5: 20,
    6: 36,
    7: 56,
    8: 80,
    9: 100
};

// ============================================================================
// SHOP ODDS BY LEVEL (percentage chance for each cost tier)
// ============================================================================

const SHOP_ODDS = {
    // Level: [1-cost%, 2-cost%, 3-cost%]
    1: [100, 0, 0],
    2: [100, 0, 0],
    3: [75, 25, 0],
    4: [55, 30, 15],
    5: [45, 33, 22],
    6: [30, 40, 30],
    7: [20, 35, 45],
    8: [15, 25, 60],
    9: [10, 20, 70]
};

// ============================================================================
// STAR LEVEL MULTIPLIERS
// ============================================================================

const STAR_MULTIPLIERS = {
    1: { hp: 1.0, attack: 1.0 },
    2: { hp: 1.8, attack: 1.8 },
    3: { hp: 3.2, attack: 3.2 }
};

// ============================================================================
// TRAIT DEFINITIONS
// ============================================================================

const TRAITS = {
    warrior: {
        name: 'Warrior',
        description: 'Warriors gain bonus armor',
        bonuses: {
            2: { armor: 25 },
            4: { armor: 55, attackBonus: 15 }
        }
    },
    mage: {
        name: 'Mage',
        description: 'Mages gain spell power and mana regen',
        bonuses: {
            2: { spellPower: 20, manaRegen: 10 },
            4: { spellPower: 50, manaRegen: 25 }
        }
    },
    assassin: {
        name: 'Assassin',
        description: 'Assassins gain critical strike chance and damage',
        bonuses: {
            2: { critChance: 15, critDamage: 25 },
            4: { critChance: 35, critDamage: 50 }
        }
    },
    tank: {
        name: 'Tank',
        description: 'Tanks gain bonus HP and damage reduction',
        bonuses: {
            2: { hpBonus: 200, damageReduction: 10 },
            4: { hpBonus: 500, damageReduction: 25 }
        }
    },
    ranger: {
        name: 'Ranger',
        description: 'Rangers gain attack speed',
        bonuses: {
            2: { attackSpeedBonus: 0.2 },
            4: { attackSpeedBonus: 0.5, range: 1 }
        }
    },
    elemental: {
        name: 'Elemental',
        description: 'Elementals deal bonus magic damage and resist magic',
        bonuses: {
            2: { magicDamage: 20, magicResist: 20 },
            4: { magicDamage: 45, magicResist: 45 }
        }
    }
};

// ============================================================================
// UNIT DEFINITIONS
// ============================================================================

const UNITS = {
    // ========== 1-COST UNITS ==========
    squire: {
        id: 'squire',
        name: 'Squire',
        emoji: '⚔️',
        cost: 1,
        hp: 550,
        attack: 50,
        attackSpeed: 0.7,
        range: 1,
        armor: 20,
        magicResist: 10,
        traits: ['warrior'],
        ability: null
    },
    apprentice: {
        id: 'apprentice',
        name: 'Apprentice',
        emoji: '🔮',
        cost: 1,
        hp: 400,
        attack: 40,
        attackSpeed: 0.6,
        range: 3,
        armor: 10,
        magicResist: 20,
        traits: ['mage'],
        ability: {
            name: 'Arcane Bolt',
            damage: 150,
            manaCost: 60
        }
    },
    scout: {
        id: 'scout',
        name: 'Scout',
        emoji: '🏹',
        cost: 1,
        hp: 450,
        attack: 55,
        attackSpeed: 0.8,
        range: 3,
        armor: 10,
        magicResist: 10,
        traits: ['ranger'],
        ability: null
    },
    cutthroat: {
        id: 'cutthroat',
        name: 'Cutthroat',
        emoji: '🗡️',
        cost: 1,
        hp: 480,
        attack: 60,
        attackSpeed: 0.9,
        range: 1,
        armor: 10,
        magicResist: 10,
        traits: ['assassin'],
        ability: null
    },

    // ========== 2-COST UNITS ==========
    knight: {
        id: 'knight',
        name: 'Knight',
        emoji: '🛡️',
        cost: 2,
        hp: 750,
        attack: 55,
        attackSpeed: 0.6,
        range: 1,
        armor: 40,
        magicResist: 20,
        traits: ['warrior', 'tank'],
        ability: {
            name: 'Shield Bash',
            damage: 100,
            stun: 1.0,
            manaCost: 70
        }
    },
    pyromancer: {
        id: 'pyromancer',
        name: 'Pyromancer',
        emoji: '🔥',
        cost: 2,
        hp: 500,
        attack: 45,
        attackSpeed: 0.6,
        range: 3,
        armor: 10,
        magicResist: 25,
        traits: ['mage', 'elemental'],
        ability: {
            name: 'Fireball',
            damage: 250,
            aoe: true,
            manaCost: 80
        }
    },
    shadowBlade: {
        id: 'shadowBlade',
        name: 'Shadow Blade',
        emoji: '⚫',
        cost: 2,
        hp: 550,
        attack: 75,
        attackSpeed: 1.0,
        range: 1,
        armor: 15,
        magicResist: 15,
        traits: ['assassin'],
        ability: {
            name: 'Backstab',
            damageMultiplier: 2.5,
            manaCost: 50
        }
    },
    marksman: {
        id: 'marksman',
        name: 'Marksman',
        emoji: '🎯',
        cost: 2,
        hp: 520,
        attack: 70,
        attackSpeed: 0.85,
        range: 4,
        armor: 10,
        magicResist: 10,
        traits: ['ranger'],
        ability: {
            name: 'Piercing Shot',
            damage: 200,
            manaCost: 70
        }
    },
    stoneGolem: {
        id: 'stoneGolem',
        name: 'Stone Golem',
        emoji: '🗿',
        cost: 2,
        hp: 900,
        attack: 45,
        attackSpeed: 0.4,
        range: 1,
        armor: 50,
        magicResist: 30,
        traits: ['tank', 'elemental'],
        ability: {
            name: 'Harden',
            armorBonus: 50,
            duration: 3,
            manaCost: 60
        }
    },

    // ========== 3-COST UNITS ==========
    warlord: {
        id: 'warlord',
        name: 'Warlord',
        emoji: '👑',
        cost: 3,
        hp: 900,
        attack: 80,
        attackSpeed: 0.7,
        range: 1,
        armor: 45,
        magicResist: 25,
        traits: ['warrior', 'tank'],
        ability: {
            name: 'War Cry',
            attackBonus: 30,
            duration: 4,
            aoe: true,
            manaCost: 90
        }
    },
    archmage: {
        id: 'archmage',
        name: 'Archmage',
        emoji: '✨',
        cost: 3,
        hp: 600,
        attack: 50,
        attackSpeed: 0.55,
        range: 4,
        armor: 10,
        magicResist: 40,
        traits: ['mage'],
        ability: {
            name: 'Meteor Strike',
            damage: 400,
            aoe: true,
            manaCost: 100
        }
    },
    phantomStriker: {
        id: 'phantomStriker',
        name: 'Phantom Striker',
        emoji: '👻',
        cost: 3,
        hp: 650,
        attack: 95,
        attackSpeed: 1.1,
        range: 1,
        armor: 20,
        magicResist: 30,
        traits: ['assassin', 'elemental'],
        ability: {
            name: 'Phase Strike',
            damage: 300,
            teleport: true,
            manaCost: 70
        }
    },
    stormArcher: {
        id: 'stormArcher',
        name: 'Storm Archer',
        emoji: '⚡',
        cost: 3,
        hp: 620,
        attack: 85,
        attackSpeed: 0.9,
        range: 4,
        armor: 15,
        magicResist: 25,
        traits: ['ranger', 'elemental'],
        ability: {
            name: 'Lightning Arrow',
            damage: 250,
            chainTargets: 3,
            manaCost: 80
        }
    },
    frostGuardian: {
        id: 'frostGuardian',
        name: 'Frost Guardian',
        emoji: '❄️',
        cost: 3,
        hp: 1100,
        attack: 60,
        attackSpeed: 0.5,
        range: 1,
        armor: 55,
        magicResist: 45,
        traits: ['tank', 'elemental', 'mage'],
        ability: {
            name: 'Frost Nova',
            damage: 150,
            slow: 0.3,
            duration: 3,
            aoe: true,
            manaCost: 85
        }
    },
    bladeMaster: {
        id: 'bladeMaster',
        name: 'Blade Master',
        emoji: '🌀',
        cost: 3,
        hp: 800,
        attack: 90,
        attackSpeed: 0.85,
        range: 1,
        armor: 30,
        magicResist: 20,
        traits: ['warrior', 'assassin'],
        ability: {
            name: 'Whirlwind',
            damage: 200,
            hits: 3,
            aoe: true,
            manaCost: 75
        }
    }
};

// ============================================================================
// UNIT POOL SIZE (for shop)
// ============================================================================

const UNIT_POOL_SIZE = {
    1: 29, // 29 copies of each 1-cost unit
    2: 22, // 22 copies of each 2-cost unit
    3: 16  // 16 copies of each 3-cost unit
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all units of a specific cost tier
 */
function getUnitsByCost(cost) {
    return Object.values(UNITS).filter(unit => unit.cost === cost);
}

/**
 * Get all units that have a specific trait
 */
function getUnitsByTrait(traitId) {
    return Object.values(UNITS).filter(unit => unit.traits.includes(traitId));
}

/**
 * Get trait bonus for a given count of trait units
 */
function getTraitBonus(traitId, count) {
    const trait = TRAITS[traitId];
    if (!trait) return null;

    // Find the highest applicable bonus threshold
    const thresholds = Object.keys(trait.bonuses).map(Number).sort((a, b) => b - a);
    for (const threshold of thresholds) {
        if (count >= threshold) {
            return { threshold, bonus: trait.bonuses[threshold] };
        }
    }
    return null;
}

/**
 * Calculate unit stats at a given star level
 */
function getUnitStatsAtStar(unitId, starLevel) {
    const baseUnit = UNITS[unitId];
    if (!baseUnit) return null;

    const multiplier = STAR_MULTIPLIERS[starLevel] || STAR_MULTIPLIERS[1];

    return {
        ...baseUnit,
        starLevel,
        hp: Math.floor(baseUnit.hp * multiplier.hp),
        attack: Math.floor(baseUnit.attack * multiplier.attack)
    };
}

/**
 * Get XP required for next level
 */
function getXPForLevel(level) {
    return LEVEL_XP[level] || null;
}

/**
 * Get shop odds for a given level
 */
function getShopOddsForLevel(level) {
    return SHOP_ODDS[level] || SHOP_ODDS[1];
}

// ============================================================================
// EXPORT CHECK (for debugging)
// ============================================================================

console.log('[Data] Game data module loaded');
console.log(`[Data] ${Object.keys(UNITS).length} units defined`);
console.log(`[Data] ${Object.keys(TRAITS).length} traits defined`);
