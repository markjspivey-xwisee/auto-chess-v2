# Auto Chess V2 - Codebase Context

## Project Overview
Browser-based auto chess battler game. Built using multi-agent orchestration with vanilla HTML/CSS/JavaScript (no build tools required).

## Architecture

### Technology Stack
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Rendering**: DOM-based with CSS Grid for the board
- **Storage**: localStorage for save/load functionality
- **No dependencies**: Pure browser-native implementation

### File Structure
- src/index.html - Main entry point with game layout
- src/styles.css - All styling, animations, responsive design
- src/data.js - Unit definitions, traits, game constants
- src/state.js - Game state management (gold, HP, board, bench)
- src/unit.js - Unit class with combat logic
- src/shop.js - Shop system (buy, sell, refresh, combine)
- src/combat.js - Auto-battle simulation engine
- src/ai.js - AI opponent board generation
- src/traits.js - Synergy calculation and bonuses
- src/renderer.js - Visual rendering of board and units
- src/ui.js - User interaction handling
- src/game.js - Main game controller and orchestration

### Core Game Systems

#### 1. Data Layer (data.js)
- Unit templates with stats: hp, attack, attackSpeed, range, cost, traits
- 12+ units across 3 cost tiers (1g, 2g, 3g)
- 6 traits: Warrior, Mage, Assassin, Tank, Ranger, Elemental
- Trait bonuses at 2/4 piece thresholds
- Star level multipliers (1-star base, 2-star x1.8, 3-star x3.24)

#### 2. State Management (state.js)
- Player: gold, level (1-9), xp, hp (100 max)
- Board: 8x8 grid (player uses bottom 4 rows)
- Bench: 9 slots for reserve units
- Round tracking and phase management
- Unit pool for shop probability

#### 3. Unit System (unit.js)
- Instance creation from templates
- Combat state: currentHp, position, target, state
- Star level upgrades with stat scaling
- Combat methods: takeDamage, attack, move, findTarget

#### 4. Shop System (shop.js)
- 5 shop slots refreshed each round
- Level-based tier probabilities
- Buy: costs gold, adds to bench
- Sell: refunds (cost * star_level) gold
- Combine: 3 copies = star upgrade

#### 5. Combat System (combat.js)
- 100ms tick-based simulation
- Target selection: nearest enemy
- Movement: toward target if out of range
- Attack: damage = attack * (1 - armor_reduction)
- Combat ends when one side eliminated

#### 6. Trait System (traits.js)
- Scans board for active traits
- Applies bonuses to matching units:
  - Warrior (2/4): +15/+30 armor
  - Mage (2/4): +20/+40 percent spell damage
  - Assassin (2/4): +15/+30 percent crit chance
  - Tank (2/4): +200/+500 HP
  - Ranger (2/4): +20/+40 percent attack speed
  - Elemental (2/4): 50/100 AoE damage on death

#### 7. AI System (ai.js)
- Scales with round number
- Early (1-5): 1-3 tier-1 units
- Mid (6-10): mixed tiers, some synergies
- Late (11+): full boards, strong synergies
- Boss rounds every 5th round

#### 8. Economy
- Base income: 5 gold per round
- Interest: +1 gold per 10 saved (max +5)
- Streak bonus: +1/2/3 gold for 2/3/4+ win/lose streak
- XP cost: 4 gold for 4 XP

### Task Dependency Graph
Wave 1 (parallel, no dependencies): task-001 (HTML), task-002 (CSS), task-003 (Data)
Wave 2 (after task-003): task-004 (State), task-005 (Unit)
Wave 3 (after task-003 + task-005): task-007 (Combat), task-008 (AI), task-009 (Traits)
Wave 3 (after task-003 + task-004 + task-005): task-006 (Shop)
Wave 3 (after task-001 + task-003 + task-005): task-010 (Renderer)
Wave 3 (after task-001 + task-004 + task-006): task-011 (UI)
Wave 4 (final, after all above): task-012 (Game Controller)

### Parallelization Opportunities
- **Wave 1** (parallel): task-001, task-002, task-003
- **Wave 2** (parallel, after wave 1): task-004, task-005
- **Wave 3** (parallel, after wave 2): task-006, task-007, task-008, task-009, task-010, task-011
- **Wave 4** (final): task-012

---
*Architecture designed by Planner Agent on 2026-01-15*
