/**
 * Auto Chess Unit Class
 * Represents a single unit instance with stats, combat state, and behavior
 */

// UNITS, STAR_MULTIPLIERS, GAME_CONFIG are loaded globally from data.js

// ============================================================================
// UNIQUE ID GENERATOR
// ============================================================================

let nextUnitId = 1;

function generateUnitId() {
    return `unit_${nextUnitId++}`;
}

/**
 * Reset the unit ID counter (useful for testing)
 */
function resetUnitIdCounter() {
    nextUnitId = 1;
}

// ============================================================================
// UNIT STATES
// ============================================================================

const UnitState = {
    IDLE: 'idle',
    MOVING: 'moving',
    ATTACKING: 'attacking',
    CASTING: 'casting',
    DEAD: 'dead'
};

// ============================================================================
// UNIT CLASS
// ============================================================================

class Unit {
    /**
     * Create a new unit instance from a template
     * @param {string} templateId - The ID of the unit template from UNITS
     * @param {number} starLevel - Star level (1-3), defaults to 1
     */
    constructor(templateId, starLevel = 1) {
        const template = UNITS[templateId];
        if (!template) {
            throw new Error(`Unknown unit template: ${templateId}`);
        }

        // Validate star level
        if (starLevel < 1 || starLevel > 3) {
            throw new Error(`Invalid star level: ${starLevel}. Must be 1-3.`);
        }

        // Unique identifier
        this.id = generateUnitId();
        this.templateId = templateId;

        // Base template info (immutable)
        this.name = template.name;
        this.emoji = template.emoji;
        this.cost = template.cost;
        this.traits = [...template.traits];
        this.ability = template.ability ? { ...template.ability } : null;

        // Star level
        this.starLevel = starLevel;
        const multiplier = STAR_MULTIPLIERS[starLevel];

        // Scaled stats based on star level
        this.maxHp = Math.floor(template.hp * multiplier.hp);
        this.baseAttack = Math.floor(template.attack * multiplier.attack);
        this.attackSpeed = template.attackSpeed;
        this.range = template.range;
        this.armor = template.armor;
        this.magicResist = template.magicResist;

        // Current combat stats
        this.currentHp = this.maxHp;
        this.currentMana = 0;
        this.maxMana = GAME_CONFIG.MAX_MANA;

        // Position on the board (null if on bench or in shop)
        this.x = null;
        this.y = null;

        // Combat state
        this.state = UnitState.IDLE;
        this.target = null; // Reference to target unit
        this.attackCooldown = 0; // Time until next attack

        // Buffs and debuffs (applied by traits/abilities)
        this.buffs = {
            attackBonus: 0,
            armorBonus: 0,
            magicResistBonus: 0,
            attackSpeedBonus: 0,
            hpBonus: 0,
            spellPower: 0,
            critChance: 0,
            critDamage: 0,
            damageReduction: 0,
            magicDamage: 0,
            manaRegen: 0
        };

        // Status effects
        this.statusEffects = {
            stunned: false,
            stunDuration: 0,
            slowed: false,
            slowAmount: 0,
            slowDuration: 0
        };

        // Owner reference (player ID)
        this.ownerId = null;
    }

    // ========================================================================
    // COMPUTED PROPERTIES
    // ========================================================================

    /**
     * Get effective attack damage including buffs
     */
    get attack() {
        return this.baseAttack + this.buffs.attackBonus;
    }

    /**
     * Get effective armor including buffs
     */
    get effectiveArmor() {
        return this.armor + this.buffs.armorBonus;
    }

    /**
     * Get effective magic resist including buffs
     */
    get effectiveMagicResist() {
        return this.magicResist + this.buffs.magicResistBonus;
    }

    /**
     * Get effective attack speed including buffs and slows
     */
    get effectiveAttackSpeed() {
        let speed = this.attackSpeed + this.buffs.attackSpeedBonus;
        if (this.statusEffects.slowed) {
            speed *= (1 - this.statusEffects.slowAmount);
        }
        return Math.max(0.1, speed); // Minimum attack speed
    }

    /**
     * Get effective max HP including buffs
     */
    get effectiveMaxHp() {
        return this.maxHp + this.buffs.hpBonus;
    }

    /**
     * Check if unit is alive
     */
    get isAlive() {
        return this.currentHp > 0 && this.state !== UnitState.DEAD;
    }

    /**
     * Check if unit is on the board
     */
    get isOnBoard() {
        return this.x !== null && this.y !== null;
    }

    /**
     * Check if unit can act (not stunned or dead)
     */
    get canAct() {
        return this.isAlive && !this.statusEffects.stunned;
    }

    /**
     * Get HP percentage (0-1)
     */
    get hpPercent() {
        return this.currentHp / this.effectiveMaxHp;
    }

    /**
     * Get mana percentage (0-1)
     */
    get manaPercent() {
        return this.currentMana / this.maxMana;
    }

    // ========================================================================
    // COMBAT METHODS
    // ========================================================================

    /**
     * Take damage from an attack or ability
     * @param {number} amount - Raw damage amount
     * @param {string} type - 'physical' or 'magic'
     * @param {Unit} source - The unit dealing damage (optional)
     * @returns {number} Actual damage taken after mitigation
     */
    takeDamage(amount, type = 'physical', source = null) {
        if (!this.isAlive) return 0;

        let actualDamage = amount;

        // Apply damage reduction from armor or magic resist
        if (type === 'physical') {
            const reduction = this.effectiveArmor / (this.effectiveArmor + 100);
            actualDamage = Math.floor(amount * (1 - reduction));
        } else if (type === 'magic') {
            const reduction = this.effectiveMagicResist / (this.effectiveMagicResist + 100);
            actualDamage = Math.floor(amount * (1 - reduction));
        }

        // Apply flat damage reduction from buffs
        if (this.buffs.damageReduction > 0) {
            actualDamage = Math.floor(actualDamage * (1 - this.buffs.damageReduction / 100));
        }

        // Ensure minimum 1 damage
        actualDamage = Math.max(1, actualDamage);

        // Apply damage
        this.currentHp = Math.max(0, this.currentHp - actualDamage);

        // Gain mana from taking damage
        this.gainMana(GAME_CONFIG.MANA_PER_DAMAGE_TAKEN);

        // Check for death
        if (this.currentHp <= 0) {
            this.die();
        }

        return actualDamage;
    }

    /**
     * Heal the unit
     * @param {number} amount - Amount to heal
     * @returns {number} Actual amount healed
     */
    heal(amount) {
        if (!this.isAlive) return 0;

        const maxHeal = this.effectiveMaxHp - this.currentHp;
        const actualHeal = Math.min(amount, maxHeal);
        this.currentHp += actualHeal;

        return actualHeal;
    }

    /**
     * Gain mana
     * @param {number} amount - Amount of mana to gain
     */
    gainMana(amount) {
        if (!this.isAlive) return;
        const totalGain = amount + this.buffs.manaRegen;
        this.currentMana = Math.min(this.maxMana, this.currentMana + totalGain);
    }

    /**
     * Perform an attack on the current target
     * @returns {object|null} Attack result with damage info, or null if can't attack
     */
    attack() {
        if (!this.canAct || !this.target || !this.target.isAlive) {
            return null;
        }

        // Check if in range
        const distance = this.getDistanceTo(this.target);
        if (distance > this.range) {
            return null;
        }

        // Calculate damage
        let damage = this.attack;
        let isCrit = false;

        // Check for critical strike
        if (this.buffs.critChance > 0) {
            const critRoll = Math.random() * 100;
            if (critRoll < this.buffs.critChance) {
                isCrit = true;
                const critMultiplier = 1.5 + (this.buffs.critDamage / 100);
                damage = Math.floor(damage * critMultiplier);
            }
        }

        // Add bonus magic damage if present
        let magicDamage = 0;
        if (this.buffs.magicDamage > 0) {
            magicDamage = this.buffs.magicDamage;
        }

        // Deal damage
        const physicalDamageDealt = this.target.takeDamage(damage, 'physical', this);
        let magicDamageDealt = 0;
        if (magicDamage > 0) {
            magicDamageDealt = this.target.takeDamage(magicDamage, 'magic', this);
        }

        // Gain mana from attacking
        this.gainMana(GAME_CONFIG.MANA_PER_ATTACK);

        return {
            attacker: this,
            target: this.target,
            physicalDamage: physicalDamageDealt,
            magicDamage: magicDamageDealt,
            totalDamage: physicalDamageDealt + magicDamageDealt,
            isCrit,
            targetDied: !this.target.isAlive
        };
    }

    /**
     * Find a target from enemy units
     * @param {Unit[]} enemies - Array of enemy units to target
     * @returns {Unit|null} The selected target or null if none found
     */
    findTarget(enemies) {
        if (!this.isAlive || !enemies || enemies.length === 0) {
            this.target = null;
            return null;
        }

        // Filter to alive enemies
        const aliveEnemies = enemies.filter(e => e.isAlive && e.isOnBoard);
        if (aliveEnemies.length === 0) {
            this.target = null;
            return null;
        }

        // Find closest enemy
        let closestEnemy = null;
        let closestDistance = Infinity;

        for (const enemy of aliveEnemies) {
            const distance = this.getDistanceTo(enemy);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = enemy;
            }
        }

        this.target = closestEnemy;
        return closestEnemy;
    }

    /**
     * Move towards the target position
     * @param {number} targetX - Target X coordinate
     * @param {number} targetY - Target Y coordinate
     * @param {Set<string>} occupiedPositions - Set of "x,y" strings for occupied cells
     * @returns {boolean} True if moved, false if stayed in place
     */
    move(targetX, targetY, occupiedPositions = new Set()) {
        if (!this.canAct || !this.isOnBoard) {
            return false;
        }

        // Calculate direction
        const dx = Math.sign(targetX - this.x);
        const dy = Math.sign(targetY - this.y);

        if (dx === 0 && dy === 0) {
            return false; // Already at target
        }

        // Try to move in primary direction first, then diagonally, then secondary
        const moveOptions = [];

        // Prioritize moves
        if (dx !== 0 && dy !== 0) {
            // Diagonal movement available
            moveOptions.push({ x: this.x + dx, y: this.y + dy }); // Diagonal
            moveOptions.push({ x: this.x + dx, y: this.y }); // Horizontal
            moveOptions.push({ x: this.x, y: this.y + dy }); // Vertical
        } else if (dx !== 0) {
            moveOptions.push({ x: this.x + dx, y: this.y }); // Horizontal
            moveOptions.push({ x: this.x + dx, y: this.y + 1 }); // Diagonal up
            moveOptions.push({ x: this.x + dx, y: this.y - 1 }); // Diagonal down
        } else {
            moveOptions.push({ x: this.x, y: this.y + dy }); // Vertical
            moveOptions.push({ x: this.x + 1, y: this.y + dy }); // Diagonal right
            moveOptions.push({ x: this.x - 1, y: this.y + dy }); // Diagonal left
        }

        // Find first valid move
        for (const option of moveOptions) {
            const posKey = `${option.x},${option.y}`;
            if (this.isValidPosition(option.x, option.y) && !occupiedPositions.has(posKey)) {
                // Update occupied positions
                occupiedPositions.delete(`${this.x},${this.y}`);
                occupiedPositions.add(posKey);

                // Move unit
                this.x = option.x;
                this.y = option.y;
                this.state = UnitState.MOVING;
                return true;
            }
        }

        return false; // Couldn't move
    }

    /**
     * Move towards the current target
     * @param {Set<string>} occupiedPositions - Set of "x,y" strings for occupied cells
     * @returns {boolean} True if moved
     */
    moveTowardsTarget(occupiedPositions = new Set()) {
        if (!this.target || !this.target.isOnBoard) {
            return false;
        }
        return this.move(this.target.x, this.target.y, occupiedPositions);
    }

    // ========================================================================
    // STATE MANAGEMENT
    // ========================================================================

    /**
     * Set the unit's position on the board
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }

    /**
     * Remove the unit from the board
     */
    removeFromBoard() {
        this.x = null;
        this.y = null;
        this.target = null;
    }

    /**
     * Handle unit death
     */
    die() {
        this.currentHp = 0;
        this.state = UnitState.DEAD;
        this.target = null;
    }

    /**
     * Reset combat state for a new round
     */
    resetForCombat() {
        this.currentHp = this.effectiveMaxHp;
        this.currentMana = 0;
        this.state = UnitState.IDLE;
        this.target = null;
        this.attackCooldown = 0;
        this.statusEffects = {
            stunned: false,
            stunDuration: 0,
            slowed: false,
            slowAmount: 0,
            slowDuration: 0
        };
    }

    /**
     * Apply a stun effect
     * @param {number} duration - Stun duration in seconds
     */
    applyStun(duration) {
        if (!this.isAlive) return;
        this.statusEffects.stunned = true;
        this.statusEffects.stunDuration = Math.max(this.statusEffects.stunDuration, duration);
    }

    /**
     * Apply a slow effect
     * @param {number} amount - Slow percentage (0-1)
     * @param {number} duration - Slow duration in seconds
     */
    applySlow(amount, duration) {
        if (!this.isAlive) return;
        this.statusEffects.slowed = true;
        this.statusEffects.slowAmount = Math.max(this.statusEffects.slowAmount, amount);
        this.statusEffects.slowDuration = Math.max(this.statusEffects.slowDuration, duration);
    }

    /**
     * Update status effect timers
     * @param {number} deltaTime - Time elapsed in seconds
     */
    updateStatusEffects(deltaTime) {
        // Update stun
        if (this.statusEffects.stunned) {
            this.statusEffects.stunDuration -= deltaTime;
            if (this.statusEffects.stunDuration <= 0) {
                this.statusEffects.stunned = false;
                this.statusEffects.stunDuration = 0;
            }
        }

        // Update slow
        if (this.statusEffects.slowed) {
            this.statusEffects.slowDuration -= deltaTime;
            if (this.statusEffects.slowDuration <= 0) {
                this.statusEffects.slowed = false;
                this.statusEffects.slowAmount = 0;
                this.statusEffects.slowDuration = 0;
            }
        }
    }

    /**
     * Apply trait bonuses to this unit
     * @param {object} bonuses - Object with bonus stat values
     */
    applyTraitBonuses(bonuses) {
        for (const [key, value] of Object.entries(bonuses)) {
            if (key in this.buffs) {
                this.buffs[key] += value;
            }
        }
    }

    /**
     * Reset all buffs (called before reapplying trait bonuses)
     */
    resetBuffs() {
        for (const key of Object.keys(this.buffs)) {
            this.buffs[key] = 0;
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Calculate distance to another unit (Chebyshev distance for grid)
     * @param {Unit} other - The other unit
     * @returns {number} Distance in grid cells
     */
    getDistanceTo(other) {
        if (!this.isOnBoard || !other.isOnBoard) {
            return Infinity;
        }
        return Math.max(Math.abs(this.x - other.x), Math.abs(this.y - other.y));
    }

    /**
     * Check if a position is within board bounds
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {boolean} True if valid
     */
    isValidPosition(x, y) {
        return x >= 0 && x < GAME_CONFIG.BOARD_COLS &&
               y >= 0 && y < GAME_CONFIG.BOARD_ROWS;
    }

    /**
     * Check if target is in attack range
     * @returns {boolean} True if target is in range
     */
    isTargetInRange() {
        if (!this.target) return false;
        return this.getDistanceTo(this.target) <= this.range;
    }

    /**
     * Upgrade this unit to the next star level
     * @returns {boolean} True if upgraded, false if already max level
     */
    upgrade() {
        if (this.starLevel >= 3) {
            return false;
        }

        this.starLevel++;
        const multiplier = STAR_MULTIPLIERS[this.starLevel];
        const template = UNITS[this.templateId];

        // Recalculate base stats
        this.maxHp = Math.floor(template.hp * multiplier.hp);
        this.baseAttack = Math.floor(template.attack * multiplier.attack);

        // Heal to new max HP
        this.currentHp = this.effectiveMaxHp;

        return true;
    }

    /**
     * Create a deep clone of this unit (for combat simulation)
     * @returns {Unit} A new unit instance with the same stats
     */
    clone() {
        const cloned = new Unit(this.templateId, this.starLevel);

        // Copy state
        cloned.currentHp = this.currentHp;
        cloned.currentMana = this.currentMana;
        cloned.x = this.x;
        cloned.y = this.y;
        cloned.state = this.state;
        cloned.ownerId = this.ownerId;

        // Copy buffs (deep copy)
        cloned.buffs = { ...this.buffs };

        // Copy status effects (deep copy)
        cloned.statusEffects = { ...this.statusEffects };

        return cloned;
    }

    /**
     * Get a serializable representation of this unit
     * @returns {object} Plain object with unit data
     */
    toJSON() {
        return {
            id: this.id,
            templateId: this.templateId,
            name: this.name,
            emoji: this.emoji,
            cost: this.cost,
            starLevel: this.starLevel,
            traits: this.traits,
            maxHp: this.maxHp,
            currentHp: this.currentHp,
            attack: this.attack,
            attackSpeed: this.attackSpeed,
            range: this.range,
            armor: this.effectiveArmor,
            magicResist: this.effectiveMagicResist,
            currentMana: this.currentMana,
            maxMana: this.maxMana,
            x: this.x,
            y: this.y,
            state: this.state,
            ownerId: this.ownerId
        };
    }

    /**
     * Get a display string for this unit
     * @returns {string} Human-readable unit info
     */
    toString() {
        const stars = '★'.repeat(this.starLevel);
        return `${this.emoji} ${this.name} ${stars} (${this.currentHp}/${this.effectiveMaxHp} HP)`;
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new unit from a template ID
 * @param {string} templateId - The unit template ID
 * @param {number} starLevel - Star level (1-3)
 * @returns {Unit} New unit instance
 */
function createUnit(templateId, starLevel = 1) {
    return new Unit(templateId, starLevel);
}

/**
 * Create multiple units from template IDs
 * @param {Array<{templateId: string, starLevel?: number}>} unitDefs - Array of unit definitions
 * @returns {Unit[]} Array of new unit instances
 */
function createUnits(unitDefs) {
    return unitDefs.map(def => createUnit(def.templateId, def.starLevel || 1));
}

// ============================================================================
// EXPORT
// ============================================================================

// Expose globally
window.Unit = Unit;
window.UnitState = UnitState;
window.createUnit = createUnit;
window.createUnits = createUnits;
window.resetUnitIdCounter = resetUnitIdCounter;

console.log('[Unit] Unit module loaded');
