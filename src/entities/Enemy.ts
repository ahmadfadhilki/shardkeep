import Phaser from 'phaser';
import { Entity, type Hit } from './Entity';
import type { EnemyDef } from '../data/enemies';
import type { Status } from '../data/skills';
import type { CombatSystem } from '../systems/CombatSystem';
import { StateMachine } from '../systems/StateMachine';
import { poof, popText } from '../systems/Effects';

export type EnemyState =
  | 'idle'
  | 'chase'
  | 'windup'
  | 'attack'
  | 'recover'
  | 'hurt'
  | 'stunned'
  | 'downed'
  | 'dead';

const ELEMENT_DOT = { fire: 0xff7a5a, water: 0x6ab8ff, earth: 0x8fd16a } as const;

/**
 * Enemy: the BASE class for all enemies. It owns the shared state machine:
 *
 *   idle --(hero near)--> chase --(subclass decides)--> windup --> attack --> recover --+
 *    ^                      ^                                                           |
 *    +---(hero far away)----+-----------------------------------------------------------+
 *
 *   Got hit ---------> hurt    (skipped while armor/poise holds)
 *   Status 'stun' ---> stunned (dizzy stars)       } chain-skill opportunities!
 *   Status 'down' ---> downed  (lying on the floor) }
 *
 * Subclasses (ChaserEnemy, ShooterEnemy, TankEnemy) only fill in the
 * "how do I approach / telegraph / attack" hooks below. This is the
 * Template Method pattern: the base class owns the flow, subclasses fill in steps.
 */
export class Enemy extends Entity {
  readonly def: EnemyDef;
  /** Index in the room layout (StageRun remembers which ones were defeated). */
  spawnIndex = -1;
  protected fsm: StateMachine<EnemyState>;
  protected combat: CombatSystem;
  protected target: Entity | null = null;
  /** Direction of the current attack (locked in when the wind-up starts). */
  protected attackDir = new Phaser.Math.Vector2();
  protected home: Phaser.Math.Vector2;

  private hpBar: Phaser.GameObjects.Graphics;
  private stars: Phaser.GameObjects.Container;
  /** Current armor left (see EnemyDef.poise). Read by the boss HP bar. */
  poise: number;
  private statusDuration = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, def: EnemyDef, combat: CombatSystem) {
    super(scene, x, y, `enemy-${def.id}`, 'enemy', def, def.radius);
    this.def = def;
    this.combat = combat;
    this.element = def.element;
    this.knockbackResist = def.knockbackResist ?? 0;
    this.poise = def.poise ?? 0;
    this.home = new Phaser.Math.Vector2(x, y);
    // Enemies may not walk out of the room through an exit gap.
    this.body.setCollideWorldBounds(true);

    // Small HP bar above the head, hidden until the enemy is first hit.
    this.hpBar = scene.add.graphics().setVisible(false);
    // Dizzy stars that circle the head while stunned.
    this.stars = scene.add.container(0, this.visualBaseY - this.visual.height / 2 - 6).setVisible(false);
    for (let i = 0; i < 3; i++) this.stars.add(scene.add.image(0, 0, 'spark').setTint(0xffe066).setScale(0.8));
    this.add([this.hpBar, this.stars]);

    this.fsm = new StateMachine<EnemyState>('idle', {
      idle: {
        update: (dt) => {
          this.slowDown(dt);
          this.idleAnimation();
          const hero = this.findTarget(this.def.aggroRange);
          if (hero) {
            this.target = hero;
            popText(this.scene, this.x, this.y - this.visual.height - 14, '!', '#ff5a5a', 22);
            this.fsm.set('chase');
          }
        },
      },

      chase: {
        update: (dt) => {
          const t = this.target;
          if (!t || t.dead) {
            this.target = this.findTarget(this.def.aggroRange);
            if (!this.target) this.fsm.set('idle');
            return;
          }
          const dist = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);
          if (dist > this.def.aggroRange * 1.8) {
            this.target = null;
            this.fsm.set('idle');
            return;
          }
          this.chaseUpdate(dt, t, dist); // subclass: move, and call startWindup() when ready
        },
      },

      windup: {
        enter: () => {
          this.body.setVelocity(0, 0);
          const t = this.target!;
          this.attackDir.set(t.x - this.x, t.y - this.y).normalize();
          this.onWindupStart();
        },
        update: (dt) => {
          this.slowDown(dt);
          this.onWindupUpdate(Math.min(1, this.fsm.time / this.windupTime()));
          if (this.fsm.time >= this.windupTime()) this.fsm.set('attack');
        },
        exit: () => {
          this.visual.clearTint();
          this.visual.x = 0;
          this.onWindupEnd();
        },
      },

      attack: {
        enter: () => this.onAttackStart(),
        update: (dt) => {
          if (this.onAttackUpdate(dt, this.fsm.time)) this.fsm.set('recover');
        },
      },

      recover: {
        enter: () => this.resetVisual(),
        update: (dt) => {
          this.slowDown(dt);
          this.idleAnimation();
          if (this.fsm.time >= this.recoverTime()) this.fsm.set('chase');
        },
      },

      hurt: {
        enter: () => {
          this.resetVisual();
          this.visual.setScale(1.2, 0.8);
        },
        update: () => {
          this.visual.setScale(
            Phaser.Math.Linear(this.visual.scaleX, 1, 0.2),
            Phaser.Math.Linear(this.visual.scaleY, 1, 0.2),
          );
          if (!this.isStaggered && this.fsm.time > 0.25) this.fsm.set('chase');
        },
      },

      stunned: {
        enter: () => {
          this.resetVisual();
          this.stars.setVisible(true);
        },
        update: (dt) => {
          this.slowDown(dt);
          // Stars orbit the head; the body sways.
          const t = this.fsm.time;
          this.stars.each((star: Phaser.GameObjects.Image, i: number) => {
            const a = t * 6 + (i * Math.PI * 2) / 3;
            star.setPosition(Math.cos(a) * 12, Math.sin(a) * 4);
          });
          this.visual.setAngle(Math.sin(t * 8) * 8);
          if (t >= this.statusDuration) this.fsm.set('chase');
        },
        exit: () => {
          this.stars.setVisible(false);
          this.resetVisual();
        },
      },

      downed: {
        enter: () => {
          this.resetVisual();
          // Fall over onto its side.
          this.scene.tweens.add({ targets: this.visual, angle: 90, y: this.visualBaseY + this.visual.height * 0.3, duration: 180, ease: 'Bounce.easeOut' });
        },
        update: (dt) => {
          this.slowDown(dt);
          if (this.fsm.time >= this.statusDuration) this.fsm.set('chase');
        },
        exit: () => this.resetVisual(),
      },

      dead: {
        terminal: true,
        enter: () => {
          this.body.enable = false;
          this.hpBar.setVisible(false);
          this.stars.setVisible(false);
          this.scene.tweens.killTweensOf(this.visual);
          this.playDeath();
        },
      },
    });
  }

  // ------------------------------------------------------------------
  // Hooks for subclasses. The defaults here do nothing special.

  /** How long the telegraph lasts (bosses vary it per attack). */
  protected windupTime(): number {
    return this.def.windup;
  }
  /** How long to rest after attacking. */
  protected recoverTime(): number {
    return this.def.attackCooldown;
  }
  /** Death animation. Must destroy() the enemy when done. */
  protected playDeath(): void {
    this.visual.setTintFill(0xffffff);
    // Squash flat, then vanish in a puff.
    this.scene.tweens.add({
      targets: this.visual,
      scaleX: 1.5,
      scaleY: 0.3,
      duration: 160,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        poof(this.scene, this.x, this.y - 8, this.def.color);
        this.destroy();
      },
    });
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 160 });
  }
  // ------------------------------------------------------------------

  /** Move toward/around the target. Call this.startWindup() when it's time to attack. */
  protected chaseUpdate(dt: number, target: Entity, dist: number): void {
    this.moveToward(target.x, target.y, this.def.speed, dt);
    if (dist < this.def.attackRange) this.startWindup();
  }
  /** Telegraph begins: show the player an attack is coming. */
  protected onWindupStart(): void {}
  /** Telegraph animation; `progress` goes 0 -> 1 over the wind-up. */
  protected onWindupUpdate(_progress: number): void {}
  /** Telegraph ends (interrupted or finished): clean up visuals. */
  protected onWindupEnd(): void {}
  /** The attack happens. */
  protected onAttackStart(): void {}
  /** Return true when the attack is finished. */
  protected onAttackUpdate(_dt: number, time: number): boolean {
    return time > 0.2;
  }
  /** Animation while idle/recovering. */
  protected idleAnimation(): void {
    const t = this.scene.time.now * 0.005 + this.home.x;
    this.visual.setScale(1 + Math.sin(t) * 0.05, 1 - Math.sin(t) * 0.05);
  }

  // ------------------------------------------------------------------

  get stateName(): EnemyState {
    return this.fsm.state;
  }

  /** Current chain-able status, if any. */
  get status(): Status | null {
    if (this.fsm.state === 'stunned') return 'stun';
    if (this.fsm.state === 'downed') return 'down';
    return null;
  }

  /** Who this enemy is going after (companions read this to know when to dodge). */
  get currentTarget(): Entity | null {
    return this.target;
  }

  tick(dt: number): void {
    if (!this.active) return;
    this.tickBase(dt);
    this.fsm.update(dt);
    // Face the target.
    if (this.target && !this.dead && this.fsm.state !== 'downed') this.visual.setFlipX(this.target.x < this.x);
    this.updateDepth();
  }

  protected startWindup(): void {
    this.fsm.set('windup');
  }

  /** Stun / knock down this enemy (opens a chain-skill window). */
  applyStatus(status: Status, duration: number, _force = false): void {
    if (this.dead) return;
    this.statusDuration = duration;
    this.fsm.set(status === 'stun' ? 'stunned' : 'downed', true);
    popText(this.scene, this.x, this.y - this.visual.height - 16, status === 'stun' ? 'STUN' : 'DOWN', '#ffe066', 16);
  }

  clearStatus(): void {
    if (this.status && !this.dead) this.fsm.set('hurt', true);
  }

  protected onHurt(hit: Hit): void {
    this.drawHpBar();
    this.target = hit.attacker;

    // Already stunned/downed: stay that way (don't waste the chain window).
    if (this.status) return;

    // Armored enemies keep going until their poise breaks.
    if (this.def.poise) {
      this.poise -= hit.heavy ? 1 : 1 / 3;
      if (this.poise <= 0) {
        this.poise = this.def.poise;
        popText(this.scene, this.x, this.y - this.visual.height - 30, 'BREAK!', '#ff9b3d', 20);
        this.applyStatus('stun', 2.4, true);
      }
      return;
    }

    // Being hit interrupts whatever we were doing (including a wind-up!).
    this.fsm.set('hurt', true);
  }

  protected onDeath(_hit: Hit): void {
    this.fsm.set('dead');
    // Tell the scene (it records the kill and drops coins).
    this.scene.events.emit('enemy-died', this);
  }

  /** Closest living hero within `range`, or null. */
  protected findTarget(range: number): Entity | null {
    let best: Entity | null = null;
    let bestDist = range;
    for (const h of this.combat.opponentsOf(this)) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, h.x, h.y);
      if (d < bestDist) {
        best = h;
        bestDist = d;
      }
    }
    return best;
  }

  protected moveToward(x: number, y: number, speed: number, dt: number): void {
    if (this.isStaggered) return;
    const dir = new Phaser.Math.Vector2(x - this.x, y - this.y).normalize();
    this.steer(dir.x * speed, dir.y * speed, dt);
  }

  /** Smoothly change velocity toward (vx, vy). */
  protected steer(vx: number, vy: number, dt: number): void {
    if (this.isStaggered) return;
    const t = 1 - Math.exp(-8 * dt);
    const v = this.body.velocity;
    this.body.setVelocity(v.x + (vx - v.x) * t, v.y + (vy - v.y) * t);
  }

  protected slowDown(dt: number): void {
    if (this.isStaggered) return;
    this.body.velocity.scale(Math.exp(-10 * dt));
  }

  protected resetVisual(): void {
    this.scene.tweens.killTweensOf(this.visual);
    this.visual.clearTint();
    this.visual.setAngle(0).setScale(1).setPosition(0, this.visualBaseY);
  }

  private drawHpBar(): void {
    const w = Math.max(28, this.def.radius * 2.4);
    const y = this.visualBaseY - this.visual.height / 2 - 8;
    const g = this.hpBar.setVisible(true).clear();
    g.fillStyle(0x1a1422).fillRect(-w / 2 - 1, y - 1, w + 2, 5);
    g.fillStyle(0xff5a5a).fillRect(-w / 2, y, w * (this.hp / this.maxHp), 3);
    // Element dot on the left of the bar.
    g.fillStyle(0x1a1422).fillCircle(-w / 2 - 6, y + 1.5, 4);
    g.fillStyle(ELEMENT_DOT[this.def.element]).fillCircle(-w / 2 - 6, y + 1.5, 3);
  }
}
