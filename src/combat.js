/**
 * Auto Chess Combat System
 * Handles combat simulation between two teams of units
 */

// GAME_CONFIG, TRAITS, getTraitBonus are loaded globally from data.js
// Unit, UnitState are loaded globally from unit.js

// ============================================================================
// COMBAT RESULT CLASS
// ============================================================================

/**
 * Represents the result of a combat round
 */
class CombatResult {
    constructor() {
        this.winner = null; // 'player' | 'enemy' | 'draw'
        this.damageToPlayer = 0;
        this.damageToEnemy = 0;
        this.survivingPlayerUnits = [];
        this.survivingEnemyUnits = [];
        this.totalTicks = 0;
        this.combatLog = [];
    }
}

// ============================================================================
// COMBAT CLASS
// ============================================================================

class Combat {
    /**
     * Create a new combat instance
     */
    constructor() {
        // Combat units (clones of originals to preserve state)
        this.playerUnits = [];
        this.enemyUnits = [];

        // Combat state
        this.isRunning = false;
        this.tickCount = 0;
        this.tickInterval = null;

        // Configuration
        this.tickDuration = GAME_CONFIG.COMBAT_TICK_MS; // 100ms per tick

        // Result tracking
        this.result = new CombatResult();
        this.combatLog = [];

        // Callbacks
        this.onTick = null;
        this.onCombatEnd = null;

        // Occupied positions cache
        this.occupiedPositions = new Set();
    }

    // ========================================================================
    // MAIN COMBAT METHODS
    // ========================================================================

    /**
     * Start combat between two teams
     * @param {Unit[]} playerUnits - Array of player units
     * @param {Unit[]} enemyUnits - Array of enemy units
     * @returns {Promise<CombatResult>} Promise that resolves when combat ends
     */
    start(playerUnits, enemyUnits) {
        return new Promise((resolve) => {
            // Clone units to preserve original state
            this.playerUnits = playerUnits.map(unit => unit.clone());
            this.enemyUnits = enemyUnits.map(unit => unit.clone());

            // Assign owner IDs for identification
            this.playerUnits.forEach(unit => { unit.ownerId = 'player'; });
            this.enemyUnits.forEach(unit => { unit.ownerId = 'enemy'; });

            // Reset combat state
            this.isRunning = true;
            this.tickCount = 0;
            this.combatLog = [];
            this.result = new CombatResult();

            // Initialize units for combat
            this.initializeUnits();

            // Apply trait bonuses
            this.applyTraitBonuses(this.playerUnits);
            this.applyTraitBonuses(this.enemyUnits);

            // Build occupied positions cache
            this.updateOccupiedPositions();

            // Log combat start
            this.log('combat_start', {
                playerUnitCount: this.playerUnits.length,
                enemyUnitCount: this.enemyUnits.length
            });

            // Store resolve callback
            this.onCombatEnd = resolve;

            // Start the combat loop
            this.tickInterval = setInterval(() => {
                this.tick();
            }, this.tickDuration);
        });
    }

    /**
     * Run combat synchronously (useful for AI simulation or testing)
     * @param {Unit[]} playerUnits - Array of player units
     * @param {Unit[]} enemyUnits - Array of enemy units
     * @param {number} maxTicks - Maximum ticks before forced end (default 1000)
     * @returns {CombatResult} Combat result
     */
    runSync(playerUnits, enemyUnits, maxTicks = 1000) {
        // Clone units to preserve original state
        this.playerUnits = playerUnits.map(unit => unit.clone());
        this.enemyUnits = enemyUnits.map(unit => unit.clone());

        // Assign owner IDs for identification
        this.playerUnits.forEach(unit => { unit.ownerId = 'player'; });
        this.enemyUnits.forEach(unit => { unit.ownerId = 'enemy'; });

        // Reset combat state
        this.isRunning = true;
        this.tickCount = 0;
        this.combatLog = [];
        this.result = new CombatResult();

        // Initialize units for combat
        this.initializeUnits();

        // Apply trait bonuses
        this.applyTraitBonuses(this.playerUnits);
        this.applyTraitBonuses(this.enemyUnits);

        // Build occupied positions cache
        this.updateOccupiedPositions();

        // Log combat start
        this.log('combat_start', {
            playerUnitCount: this.playerUnits.length,
            enemyUnitCount: this.enemyUnits.length
        });

        // Run ticks until combat ends or max ticks reached
        while (this.isRunning && this.tickCount < maxTicks) {
            this.tick();
        }

        // Force end if max ticks reached
        if (this.tickCount >= maxTicks && this.isRunning) {
            this.endCombat('draw');
        }

        return this.result;
    }

    /**
     * Initialize units for combat
     */
    initializeUnits() {
        // Reset all units for combat
        [...this.playerUnits, ...this.enemyUnits].forEach(unit => {
            unit.resetForCombat();
        });
    }

    /**
     * Execute a single combat tick
     */
    tick() {
        if (!this.isRunning) return;

        this.tickCount++;
        const deltaTime = this.tickDuration / 1000; // Convert to seconds

        // Get alive units
        const alivePlayerUnits = this.playerUnits.filter(u => u.isAlive);
        const aliveEnemyUnits = this.enemyUnits.filter(u => u.isAlive);

        // Check for combat end
        if (this.isOver()) {
            this.determinWinner();
            return;
        }

        // Update occupied positions
        this.updateOccupiedPositions();

        // Process each unit
        const allUnits = [...alivePlayerUnits, ...aliveEnemyUnits];

        // Shuffle unit order for fairness
        this.shuffleArray(allUnits);

        for (const unit of allUnits) {
            if (!unit.isAlive) continue;

            // Update status effects
            unit.updateStatusEffects(deltaTime);

            // Skip if stunned
            if (!unit.canAct) continue;

            // Get enemies for this unit
            const enemies = unit.ownerId === 'player' ? aliveEnemyUnits : alivePlayerUnits;

            // Find or validate target
            if (!unit.target || !unit.target.isAlive) {
                this.findTarget(unit, enemies);
            }

            if (!unit.target) continue;

            // Update attack cooldown
            if (unit.attackCooldown > 0) {
                unit.attackCooldown -= deltaTime;
            }

            // Check if in range
            const distance = unit.getDistanceTo(unit.target);
            const effectiveRange = this.getEffectiveRange(unit);

            if (distance <= effectiveRange) {
                // In range - attack if cooldown ready
                if (unit.attackCooldown <= 0) {
                    this.attack(unit, unit.target);
                    unit.attackCooldown = 1 / unit.effectiveAttackSpeed;
                    unit.state = UnitState.ATTACKING;
                } else {
                    unit.state = UnitState.IDLE;
                }
            } else {
                // Out of range - move toward target
                this.moveToward(unit, unit.target);
            }
        }

        // Call tick callback if set
        if (this.onTick) {
            this.onTick({
                tickCount: this.tickCount,
                playerUnits: this.playerUnits,
                enemyUnits: this.enemyUnits
            });
        }
    }

    /**
     * Stop the combat
     */
    stop() {
        this.isRunning = false;
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }

    // ========================================================================
    // TARGETING
    // ========================================================================

    /**
     * Find the nearest enemy target for a unit
     * @param {Unit} unit - The unit looking for a target
     * @param {Unit[]} enemies - Array of enemy units
     * @returns {Unit|null} The selected target
     */
    findTarget(unit, enemies) {
        if (!unit.isAlive || !enemies || enemies.length === 0) {
            unit.target = null;
            return null;
        }

        // Filter to alive enemies on the board
        const validEnemies = enemies.filter(e => e.isAlive && e.isOnBoard);

        if (validEnemies.length === 0) {
            unit.target = null;
            return null;
        }

        // Find closest enemy
        let closestEnemy = null;
        let closestDistance = Infinity;

        for (const enemy of validEnemies) {
            const distance = unit.getDistanceTo(enemy);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = enemy;
            }
        }

        unit.target = closestEnemy;
        return closestEnemy;
    }

    // ========================================================================
    // MOVEMENT
    // ========================================================================

    /**
     * Move a unit toward its target
     * @param {Unit} unit - The unit to move
     * @param {Unit} target - The target to move toward
     * @returns {boolean} True if the unit moved
     */
    moveToward(unit, target) {
        if (!unit.canAct || !unit.isOnBoard || !target || !target.isOnBoard) {
            return false;
        }

        // Calculate direction
        const dx = Math.sign(target.x - unit.x);
        const dy = Math.sign(target.y - unit.y);

        if (dx === 0 && dy === 0) {
            return false; // Already at target position
        }

        // Generate move options prioritizing direction toward target
        const moveOptions = this.generateMoveOptions(unit, dx, dy);

        // Try each move option
        for (const option of moveOptions) {
            const posKey = `${option.x},${option.y}`;

            if (this.isValidPosition(option.x, option.y) && !this.occupiedPositions.has(posKey)) {
                // Update occupied positions
                this.occupiedPositions.delete(`${unit.x},${unit.y}`);
                this.occupiedPositions.add(posKey);

                // Move the unit
                unit.x = option.x;
                unit.y = option.y;
                unit.state = UnitState.MOVING;

                this.log('move', {
                    unit: unit.name,
                    from: { x: unit.x - (option.x - unit.x), y: unit.y - (option.y - unit.y) },
                    to: { x: unit.x, y: unit.y }
                });

                return true;
            }
        }

        // Couldn't move
        unit.state = UnitState.IDLE;
        return false;
    }

    /**
     * Generate prioritized move options
     * @param {Unit} unit - The unit to move
     * @param {number} dx - X direction (-1, 0, 1)
     * @param {number} dy - Y direction (-1, 0, 1)
     * @returns {Array<{x: number, y: number}>} Array of position options
     */
    generateMoveOptions(unit, dx, dy) {
        const options = [];

        if (dx !== 0 && dy !== 0) {
            // Diagonal movement preferred
            options.push({ x: unit.x + dx, y: unit.y + dy }); // Diagonal
            options.push({ x: unit.x + dx, y: unit.y }); // Horizontal
            options.push({ x: unit.x, y: unit.y + dy }); // Vertical
        } else if (dx !== 0) {
            // Horizontal movement
            options.push({ x: unit.x + dx, y: unit.y }); // Direct horizontal
            options.push({ x: unit.x + dx, y: unit.y + 1 }); // Diagonal up
            options.push({ x: unit.x + dx, y: unit.y - 1 }); // Diagonal down
        } else if (dy !== 0) {
            // Vertical movement
            options.push({ x: unit.x, y: unit.y + dy }); // Direct vertical
            options.push({ x: unit.x + 1, y: unit.y + dy }); // Diagonal right
            options.push({ x: unit.x - 1, y: unit.y + dy }); // Diagonal left
        }

        return options;
    }

    // ========================================================================
    // COMBAT ACTIONS
    // ========================================================================

    /**
     * Execute an attack from attacker to defender
     * @param {Unit} attacker - The attacking unit
     * @param {Unit} defender - The defending unit
     * @returns {object} Attack result
     */
    attack(attacker, defender) {
        if (!attacker.canAct || !defender.isAlive) {
            return null;
        }

        // Calculate base damage
        let damage = attacker.attack;
        let isCrit = false;
        let damageType = 'physical';

        // Check for critical strike
        if (attacker.buffs.critChance > 0) {
            const critRoll = Math.random() * 100;
            if (critRoll < attacker.buffs.critChance) {
                isCrit = true;
                const critMultiplier = 1.5 + (attacker.buffs.critDamage / 100);
                damage = Math.floor(damage * critMultiplier);
            }
        }

        // Deal physical damage
        const physicalDamageDealt = defender.takeDamage(damage, 'physical', attacker);

        // Deal bonus magic damage if present
        let magicDamageDealt = 0;
        if (attacker.buffs.magicDamage > 0) {
            magicDamageDealt = defender.takeDamage(attacker.buffs.magicDamage, 'magic', attacker);
        }

        const totalDamage = physicalDamageDealt + magicDamageDealt;

        // Gain mana from attacking
        attacker.gainMana(GAME_CONFIG.MANA_PER_ATTACK);

        // Log the attack
        this.log('attack', {
            attacker: attacker.name,
            defender: defender.name,
            physicalDamage: physicalDamageDealt,
            magicDamage: magicDamageDealt,
            totalDamage,
            isCrit,
            defenderHp: defender.currentHp,
            defenderDied: !defender.isAlive
        });

        // Check for ability cast (when mana is full)
        if (attacker.currentMana >= attacker.maxMana && attacker.ability) {
            this.castAbility(attacker, defender);
        }

        return {
            attacker,
            defender,
            physicalDamage: physicalDamageDealt,
            magicDamage: magicDamageDealt,
            totalDamage,
            isCrit,
            defenderDied: !defender.isAlive
        };
    }

    /**
     * Cast a unit's ability
     * @param {Unit} caster - The unit casting the ability
     * @param {Unit} target - The primary target
     */
    castAbility(caster, target) {
        const ability = caster.ability;
        if (!ability) return;

        // Spend mana
        caster.currentMana = 0;
        caster.state = UnitState.CASTING;

        // Get all enemies for AoE abilities
        const enemies = caster.ownerId === 'player'
            ? this.enemyUnits.filter(u => u.isAlive)
            : this.playerUnits.filter(u => u.isAlive);

        // Calculate spell power bonus
        const spellPowerMultiplier = 1 + (caster.buffs.spellPower / 100);

        // Handle different ability types
        if (ability.damage) {
            let baseDamage = Math.floor(ability.damage * spellPowerMultiplier);

            if (ability.aoe) {
                // AoE damage to all enemies
                for (const enemy of enemies) {
                    const damageDealt = enemy.takeDamage(baseDamage, 'magic', caster);
                    this.log('ability_damage', {
                        caster: caster.name,
                        ability: ability.name,
                        target: enemy.name,
                        damage: damageDealt
                    });

                    // Apply crowd control effects
                    if (ability.stun) {
                        enemy.applyStun(ability.stun);
                    }
                    if (ability.slow) {
                        enemy.applySlow(ability.slow, ability.duration || 2);
                    }
                }
            } else {
                // Single target damage
                const damageDealt = target.takeDamage(baseDamage, 'magic', caster);
                this.log('ability_damage', {
                    caster: caster.name,
                    ability: ability.name,
                    target: target.name,
                    damage: damageDealt
                });

                // Apply crowd control effects
                if (ability.stun) {
                    target.applyStun(ability.stun);
                }
                if (ability.slow) {
                    target.applySlow(ability.slow, ability.duration || 2);
                }
            }
        }

        // Handle damage multiplier abilities (like Backstab)
        if (ability.damageMultiplier) {
            const damage = Math.floor(caster.attack * ability.damageMultiplier * spellPowerMultiplier);
            const damageDealt = target.takeDamage(damage, 'physical', caster);
            this.log('ability_damage', {
                caster: caster.name,
                ability: ability.name,
                target: target.name,
                damage: damageDealt
            });
        }

        // Handle buff abilities (like Harden, War Cry)
        if (ability.armorBonus) {
            caster.buffs.armorBonus += ability.armorBonus;
            this.log('ability_buff', {
                caster: caster.name,
                ability: ability.name,
                effect: `+${ability.armorBonus} armor`
            });
        }

        if (ability.attackBonus && ability.aoe) {
            // Buff all allies
            const allies = caster.ownerId === 'player'
                ? this.playerUnits.filter(u => u.isAlive)
                : this.enemyUnits.filter(u => u.isAlive);

            for (const ally of allies) {
                ally.buffs.attackBonus += ability.attackBonus;
            }
            this.log('ability_buff', {
                caster: caster.name,
                ability: ability.name,
                effect: `+${ability.attackBonus} attack to all allies`
            });
        }

        // Handle chain abilities (like Lightning Arrow)
        if (ability.chainTargets && ability.damage) {
            const baseDamage = Math.floor(ability.damage * spellPowerMultiplier);
            const chainCount = Math.min(ability.chainTargets, enemies.length);

            // Sort enemies by distance and chain damage
            const sortedEnemies = [...enemies].sort((a, b) =>
                caster.getDistanceTo(a) - caster.getDistanceTo(b)
            );

            for (let i = 0; i < chainCount && i < sortedEnemies.length; i++) {
                const chainTarget = sortedEnemies[i];
                const chainDamage = Math.floor(baseDamage * (1 - i * 0.2)); // 20% reduction per chain
                const damageDealt = chainTarget.takeDamage(chainDamage, 'magic', caster);
                this.log('ability_chain', {
                    caster: caster.name,
                    ability: ability.name,
                    target: chainTarget.name,
                    chainIndex: i + 1,
                    damage: damageDealt
                });
            }
        }

        // Handle multi-hit abilities (like Whirlwind)
        if (ability.hits && ability.damage && ability.aoe) {
            const baseDamage = Math.floor(ability.damage * spellPowerMultiplier);

            for (let hit = 0; hit < ability.hits; hit++) {
                for (const enemy of enemies) {
                    if (enemy.isAlive && caster.getDistanceTo(enemy) <= 1) {
                        const damageDealt = enemy.takeDamage(baseDamage, 'physical', caster);
                        this.log('ability_hit', {
                            caster: caster.name,
                            ability: ability.name,
                            target: enemy.name,
                            hitNumber: hit + 1,
                            damage: damageDealt
                        });
                    }
                }
            }
        }
    }

    // ========================================================================
    // TRAIT SYSTEM
    // ========================================================================

    /**
     * Apply trait bonuses to a team of units
     * @param {Unit[]} units - Array of units to apply bonuses to
     */
    applyTraitBonuses(units) {
        // Reset all buffs first
        units.forEach(unit => unit.resetBuffs());

        // Count traits
        const traitCounts = this.countTraits(units);

        // Apply bonuses for each active trait
        for (const [traitId, count] of Object.entries(traitCounts)) {
            const traitBonus = getTraitBonus(traitId, count);

            if (traitBonus) {
                // Apply bonus to all units with this trait
                for (const unit of units) {
                    if (unit.traits.includes(traitId) && unit.isAlive) {
                        this.applyBonusToUnit(unit, traitBonus.bonus);
                    }
                }

                this.log('trait_active', {
                    trait: TRAITS[traitId]?.name || traitId,
                    count,
                    threshold: traitBonus.threshold,
                    bonus: traitBonus.bonus
                });
            }
        }
    }

    /**
     * Count traits among units
     * @param {Unit[]} units - Array of units
     * @returns {object} Object mapping trait IDs to counts
     */
    countTraits(units) {
        const counts = {};
        const countedUnits = new Set(); // Track unique units per trait

        for (const unit of units) {
            if (!unit.isAlive) continue;

            for (const traitId of unit.traits) {
                if (!counts[traitId]) {
                    counts[traitId] = 0;
                }
                // Each unique unit counts once per trait
                const key = `${unit.id}_${traitId}`;
                if (!countedUnits.has(key)) {
                    counts[traitId]++;
                    countedUnits.add(key);
                }
            }
        }

        return counts;
    }

    /**
     * Apply a bonus object to a unit
     * @param {Unit} unit - The unit to buff
     * @param {object} bonus - The bonus stats to apply
     */
    applyBonusToUnit(unit, bonus) {
        // Map trait bonus keys to unit buff keys
        const bonusMapping = {
            armor: 'armorBonus',
            attackBonus: 'attackBonus',
            spellPower: 'spellPower',
            manaRegen: 'manaRegen',
            critChance: 'critChance',
            critDamage: 'critDamage',
            hpBonus: 'hpBonus',
            damageReduction: 'damageReduction',
            attackSpeedBonus: 'attackSpeedBonus',
            magicDamage: 'magicDamage',
            magicResist: 'magicResistBonus'
        };

        for (const [bonusKey, value] of Object.entries(bonus)) {
            const buffKey = bonusMapping[bonusKey];
            if (buffKey && buffKey in unit.buffs) {
                unit.buffs[buffKey] += value;
            }

            // Special handling for range bonus
            if (bonusKey === 'range') {
                unit.range += value;
            }
        }
    }

    // ========================================================================
    // COMBAT STATE
    // ========================================================================

    /**
     * Check if combat is over
     * @returns {boolean} True if combat should end
     */
    isOver() {
        const alivePlayerUnits = this.playerUnits.filter(u => u.isAlive);
        const aliveEnemyUnits = this.enemyUnits.filter(u => u.isAlive);

        return alivePlayerUnits.length === 0 || aliveEnemyUnits.length === 0;
    }

    /**
     * Determine the winner and finalize combat
     */
    determinWinner() {
        const alivePlayerUnits = this.playerUnits.filter(u => u.isAlive);
        const aliveEnemyUnits = this.enemyUnits.filter(u => u.isAlive);

        let winner;
        let damageToLoser = 0;

        if (alivePlayerUnits.length === 0 && aliveEnemyUnits.length === 0) {
            winner = 'draw';
        } else if (alivePlayerUnits.length === 0) {
            winner = 'enemy';
            // Calculate damage to player based on surviving enemy units
            damageToLoser = this.calculateDamage(aliveEnemyUnits);
        } else {
            winner = 'player';
            // Calculate damage to enemy based on surviving player units
            damageToLoser = this.calculateDamage(alivePlayerUnits);
        }

        this.endCombat(winner, damageToLoser);
    }

    /**
     * Calculate damage based on surviving units
     * @param {Unit[]} survivingUnits - Array of surviving units
     * @returns {number} Damage to deal to the loser
     */
    calculateDamage(survivingUnits) {
        // Base damage + damage per surviving unit based on cost/star
        let damage = 2; // Base damage for losing

        for (const unit of survivingUnits) {
            // Each unit deals damage based on their star level
            damage += unit.starLevel;
        }

        return damage;
    }

    /**
     * End combat and resolve results
     * @param {string} winner - 'player', 'enemy', or 'draw'
     * @param {number} damageToLoser - Damage dealt to the loser (optional)
     */
    endCombat(winner, damageToLoser = 0) {
        this.stop();

        // Populate result
        this.result.winner = winner;
        this.result.totalTicks = this.tickCount;
        this.result.combatLog = this.combatLog;
        this.result.survivingPlayerUnits = this.playerUnits.filter(u => u.isAlive);
        this.result.survivingEnemyUnits = this.enemyUnits.filter(u => u.isAlive);

        if (winner === 'enemy') {
            this.result.damageToPlayer = damageToLoser;
        } else if (winner === 'player') {
            this.result.damageToEnemy = damageToLoser;
        }

        this.log('combat_end', {
            winner,
            damageToLoser,
            totalTicks: this.tickCount,
            survivingPlayerUnits: this.result.survivingPlayerUnits.length,
            survivingEnemyUnits: this.result.survivingEnemyUnits.length
        });

        // Call end callback if set
        if (this.onCombatEnd) {
            this.onCombatEnd(this.result);
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Update the occupied positions cache
     */
    updateOccupiedPositions() {
        this.occupiedPositions.clear();

        for (const unit of [...this.playerUnits, ...this.enemyUnits]) {
            if (unit.isAlive && unit.isOnBoard) {
                this.occupiedPositions.add(`${unit.x},${unit.y}`);
            }
        }
    }

    /**
     * Check if a position is valid on the board
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {boolean} True if valid
     */
    isValidPosition(x, y) {
        return x >= 0 && x < GAME_CONFIG.BOARD_COLS &&
               y >= 0 && y < GAME_CONFIG.BOARD_ROWS;
    }

    /**
     * Get effective range for a unit (including trait bonuses)
     * @param {Unit} unit - The unit
     * @returns {number} Effective attack range
     */
    getEffectiveRange(unit) {
        return unit.range; // Range bonus already applied via traits
    }

    /**
     * Shuffle an array in place (Fisher-Yates)
     * @param {Array} array - Array to shuffle
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    /**
     * Add an entry to the combat log
     * @param {string} type - Log entry type
     * @param {object} data - Log entry data
     */
    log(type, data) {
        this.combatLog.push({
            tick: this.tickCount,
            type,
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Get current combat state (for UI rendering)
     * @returns {object} Current state of all units
     */
    getState() {
        return {
            isRunning: this.isRunning,
            tickCount: this.tickCount,
            playerUnits: this.playerUnits.map(u => u.toJSON()),
            enemyUnits: this.enemyUnits.map(u => u.toJSON()),
            result: this.result
        };
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new combat instance
 * @returns {Combat} New combat instance
 */
function createCombat() {
    return new Combat();
}

// ============================================================================
// EXPORT
// ============================================================================

// Expose globally
window.Combat = Combat;
window.CombatResult = CombatResult;
window.createCombat = createCombat;

console.log('[Combat] Combat system module loaded');
