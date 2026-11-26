import Phaser from 'phaser';
import { Sfx } from '../systems/Sfx';
import { Entity, type Hit } from './Entity';
import type { HeroDef } from '../data/heroes';
import { CHAIN_BONUS_PER_STEP, COMBOS, SKILLS, type ComboHit, type SkillDef } from '../data/skills';
import type { CombatSystem } from '../systems/CombatSystem';
import { StateMachine } from '../systems/StateMachine';
import { DEPTH } from '../config';
import { afterimage, popText, ring, slash } from '../systems/Effects';
import { heroAtk, heroMaxHp, MANA, skillCooldownAt, skillManaAt } from '../data/progression';

type HeroState = 'idle' | 'move' | 'attack' | 'skill' | 'dodge' | 'chain' | 'hurt' | 'dead';

/** Chain skill timing: dash to the target, strike, then recover. */
const CHAIN = { dash: 0.14, total: 0.55 };

/**
 * HeroIntent = "what this hero wants to do this frame".
 *
 * The player's input (PartyManager) and the companion AI (CompanionAI) both
 * produce an intent. The Hero class doesn't care who is driving it, which is
 * why switching heroes is as simple as swapping who writes the intent.
 */
export interface HeroIntent {
  /** Movement direction (length 0 or 1). */
  move: Phaser.Math.Vector2;
  /** Direction to aim/face (unit vector; zero = keep current facing). */
  aim: Phaser.Math.Vector2;
  attack: boolean;
  /** Holding attack keeps the combo going. */
  attackHeld: boolean;
  skill: boolean;
  dodge: boolean;
}

/** Time after a hit in which attacking again continues the combo (s). */
const COMBO_WINDOW = 0.35;
/** Moment inside a swing when the hit actually lands (s). Gives a tiny wind-up. */
const HIT_FRAME = 0.05;
const DODGE = { duration: 0.28, speed: 440, invuln: 0.32, cooldown: 0.45 };
const HURT_INVULN = 0.8;

/** Projectile looks per attack kind. */
const SHOT_TEXTURE = { arrow: 'arrow', bolt: 'bolt', slash: 'arrow' } as const;

/**
 * A playable hero. The same class is used for the hero you control and for
 * the AI companions; only the source of the HeroIntent differs.
 * What the attacks do depends on the hero's role (see data/skills.ts).
 */
export class Hero extends Entity {
  readonly def: HeroDef;
  readonly combo: ComboHit[];
  readonly skillDef: SkillDef;
  /** Level from the save file. Changes max HP, skill cooldown and mana cost. */
  level: number;

  /** Mana: skills (E) cost mana. Refills over time and when your hits land. */
  mana: number = MANA.max;
  readonly maxMana = MANA.max;
  private noManaTimer = 0;

  /** Direction the hero faces (unit vector). Attacks go this way. */
  readonly facing = new Phaser.Math.Vector2(0, 1);

  /** Seconds until the skill / dodge can be used again (the UI reads these). */
  skillCooldown = 0;
  dodgeCooldown = 0;
  readonly dodgeCooldownMax = DODGE.cooldown;

  /** True for the hero the player is controlling (set by PartyManager). */
  controlled = false;
  /** Multiplier on walk speed. Companions use > 1 to catch up with the leader. */
  speedBoost = 1;

  private fsm: StateMachine<HeroState>;
  private combat: CombatSystem;
  private intent!: HeroIntent;
  private arrow: Phaser.GameObjects.Image;
  private leaderRing: Phaser.GameObjects.Image;

  // Combo bookkeeping
  private comboStep = 0; // which hit of the combo we're on (0, 1, 2)
  private comboWindow = 0; // > 0 means the next attack continues the chain
  private attackQueued = false;
  private hitDone = false;

  // Chain skill bookkeeping
  private chainTarget: Entity | null = null;
  private chainStep = 0;
  private chainFrom = new Phaser.Math.Vector2();
  private chainTo = new Phaser.Math.Vector2();

  private dodgeDir = new Phaser.Math.Vector2();
  private ghostTimer = 0;
  private walkTime = 0;
  private dustTimer = 0;

  /** How quickly the hero reaches full speed / stops (higher = snappier). */
  private static readonly ACCEL = 16;
  private static readonly DECEL = 20;

  constructor(scene: Phaser.Scene, x: number, y: number, def: HeroDef, combat: CombatSystem, level = 1, weaponLevel = 0) {
    // Level and weapon upgrades decide the real HP / ATK (see data/progression.ts).
    const stats = { hp: heroMaxHp(def, level), atk: heroAtk(def, weaponLevel), def: def.base.def };
    super(scene, x, y, `hero-${def.id}`, 'hero', stats, 12);
    this.def = def;
    this.level = level;
    this.combat = combat;
    this.combo = COMBOS[def.role];
    // The role decides what the skill does; the hero gives it its own name.
    this.skillDef = { ...SKILLS[def.role], name: def.skillName };
    this.element = def.element;

    // Golden ring on the ground under the hero you control.
    this.leaderRing = scene.add.image(0, 0, 'ring').setScale(0.5, 0.22).setTint(0xffd23f).setAlpha(0.7);
    this.arrow = scene.add.image(0, 0, 'facing').setAlpha(0.8);
    this.addAt(this.leaderRing, 0);
    this.addAt(this.arrow, 2); // between shadow and sprite

    // ----- The hero's state machine. Read each state top to bottom. -----
    this.fsm = new StateMachine<HeroState>('idle', {
      idle: {
        enter: () => this.resetVisual(),
        update: (dt) => {
          this.applyMovement(dt, 0);
          this.visual.setScale(1, 1 + Math.sin(this.scene.time.now * 0.004) * 0.025); // breathing
          if (this.tryActions()) return;
          if (this.intent.move.lengthSq() > 0) this.fsm.set('move');
        },
      },

      move: {
        enter: () => (this.walkTime = 0),
        update: (dt) => {
          this.applyMovement(dt, this.def.base.speed * this.speedBoost);
          this.animateWalk(dt);
          if (this.tryActions()) return;
          if (this.intent.move.lengthSq() === 0) this.fsm.set('idle');
        },
      },

      attack: {
        enter: () => {
          const hit = this.combo[this.comboStep];
          this.attackQueued = false;
          this.hitDone = false;
          if (this.intent.aim.lengthSq() > 0) this.facing.copy(this.intent.aim);
          if (hit.kind === 'slash') this.aimAssist();
          this.body.setVelocity(this.facing.x * hit.lunge, this.facing.y * hit.lunge);
          this.visual.setScale(1.15, 0.9); // punchy squash
        },
        update: (dt) => {
          const hit = this.combo[this.comboStep];
          this.body.velocity.scale(Math.exp(-12 * dt)); // lunge slows down quickly
          this.visual.setScale(
            Phaser.Math.Linear(this.visual.scaleX, 1, 0.3),
            Phaser.Math.Linear(this.visual.scaleY, 1, 0.3),
          );

          // The hit lands slightly after the swing starts.
          if (!this.hitDone && this.fsm.time >= HIT_FRAME) {
            this.hitDone = true;
            this.performHit(hit);
          }

          // Buffer the next click (or a held button) so attacking feels responsive.
          if (this.intent.attack || (this.intent.attackHeld && this.fsm.time > hit.duration * 0.5)) {
            this.attackQueued = true;
          }
          // You can cancel the end of an attack into a dodge.
          if (this.hitDone && this.intent.dodge && this.dodgeCooldown <= 0) {
            this.fsm.set('dodge');
            return;
          }

          if (this.fsm.time >= hit.duration) {
            const next = (this.comboStep + 1) % this.combo.length;
            this.comboStep = next;
            if (this.attackQueued && next !== 0) {
              this.fsm.set('attack', true); // force re-enter the same state
            } else {
              this.comboWindow = next === 0 ? 0 : COMBO_WINDOW;
              this.fsm.set('idle');
            }
          }
        },
      },

      skill: {
        enter: () => {
          this.skillCooldown = this.skillCooldownMax;
          this.mana -= this.skillManaCost;
          Sfx.play('skill');
          this.body.setVelocity(0, 0);
          this.hitDone = false;
          if (this.intent.aim.lengthSq() > 0) this.facing.copy(this.intent.aim);
          this.startSkillAnimation();
        },
        update: () => {
          if (!this.hitDone && this.fsm.time >= 0.08) {
            this.hitDone = true;
            this.performSkill();
          }
          if (this.fsm.time >= this.skillDef.duration) this.fsm.set('idle');
        },
        exit: () => this.resetVisual(),
      },

      dodge: {
        enter: () => {
          // Roll toward the movement keys, or toward the aim if standing still.
          const dir = this.intent.move.lengthSq() > 0 ? this.intent.move : this.facing;
          this.dodgeDir.copy(dir);
          this.invulnTimer = Math.max(this.invulnTimer, DODGE.invuln);
          this.dodgeCooldown = DODGE.cooldown;
          if (this.controlled) Sfx.play('dodge');
          this.ghostTimer = 0;
          const spin = this.dodgeDir.x < 0 ? -360 : 360;
          this.scene.tweens.add({ targets: this.visual, angle: spin, duration: DODGE.duration * 1000 });
        },
        update: (dt) => {
          // Fast at the start, slowing toward the end (ease-out).
          const t = this.fsm.time / DODGE.duration;
          const speed = DODGE.speed * (1 - t * t);
          this.body.setVelocity(this.dodgeDir.x * speed, this.dodgeDir.y * speed);

          this.ghostTimer -= dt;
          if (this.ghostTimer <= 0) {
            this.ghostTimer = 0.04;
            afterimage(this.scene, this.visual, this.x, this.y + this.visual.y, this.depth);
          }
          if (t >= 1) this.fsm.set(this.intent.move.lengthSq() > 0 ? 'move' : 'idle');
        },
        exit: () => this.resetVisual(),
      },

      chain: {
        enter: () => {
          this.resetVisual();
          this.invulnTimer = Math.max(this.invulnTimer, 1);
          this.staggerTimer = 0;
          this.hitDone = false;
          this.ghostTimer = 0;
          // Dash to the side of the target that faces us.
          const t = this.chainTarget!;
          const away = new Phaser.Math.Vector2(this.x - t.x, this.y - t.y);
          if (away.lengthSq() === 0) away.set(-1, 0);
          away.normalize();
          this.chainFrom.set(this.x, this.y);
          this.chainTo.set(t.x + away.x * (t.radius + 16), t.y + away.y * (t.radius + 16));
          this.facing.set(-away.x, -away.y);
        },
        update: (dt) => {
          const time = this.fsm.time;
          if (time < CHAIN.dash) {
            const p = Phaser.Math.Easing.Cubic.Out(time / CHAIN.dash);
            this.body.reset(
              Phaser.Math.Linear(this.chainFrom.x, this.chainTo.x, p),
              Phaser.Math.Linear(this.chainFrom.y, this.chainTo.y, p),
            );
            this.ghostTimer -= dt;
            if (this.ghostTimer <= 0) {
              this.ghostTimer = 0.02;
              afterimage(this.scene, this.visual, this.x, this.y + this.visual.y, this.depth);
            }
          } else if (!this.hitDone) {
            this.hitDone = true;
            this.body.reset(this.chainTo.x, this.chainTo.y);
            this.performChainHit();
          }
          if (time >= CHAIN.total) this.fsm.set('idle');
        },
        exit: () => this.resetVisual(),
      },

      hurt: {
        enter: () => this.resetVisual(),
        update: () => {
          // Wait until the knockback ends, then recover.
          if (!this.isStaggered && this.fsm.time > 0.2) this.fsm.set('idle');
        },
      },

      dead: {
        terminal: true,
        enter: () => {
          this.body.setVelocity(0, 0);
          this.body.enable = false;
          this.arrow.setVisible(false);
          this.leaderRing.setVisible(false);
          this.visual.setTint(0x777777);
          this.scene.tweens.add({ targets: this.visual, angle: 90, y: -6, duration: 300, ease: 'Bounce.easeOut' });
        },
      },
    });
  }

  /** Skill cooldown at this hero's level (seconds). */
  get skillCooldownMax(): number {
    return skillCooldownAt(this.def, this.skillDef, this.level);
  }

  /** Skill mana cost at this hero's level. */
  get skillManaCost(): number {
    return skillManaAt(this.def, this.skillDef, this.level);
  }

  /** Off cooldown AND enough mana. The AI checks this too. */
  get canUseSkill(): boolean {
    return this.skillCooldown <= 0 && this.mana >= this.skillManaCost;
  }

  gainMana(amount: number): void {
    this.mana = Math.min(this.maxMana, this.mana + amount);
  }

  /** Called by CombatSystem whenever one of our attacks lands: attacking feeds mana. */
  onDealtHit(): void {
    this.gainMana(MANA.perHit);
  }

  /**
   * Level up in the middle of a stage. Max HP grows and the hero gains
   * that much HP right away, so a level up mid-fight feels like a reward.
   */
  setLevel(level: number): void {
    const oldMax = this.maxHp;
    this.level = level;
    this.maxHp = heroMaxHp(this.def, level);
    if (!this.dead) this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - oldMax));
  }

  get stateName(): HeroState {
    return this.fsm.state;
  }

  /** Called every frame by PartyManager. `dt` is seconds since the last frame. */
  tick(dt: number, intent: HeroIntent): void {
    this.intent = intent;
    this.tickBase(dt);
    this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    this.noManaTimer = Math.max(0, this.noManaTimer - dt);
    if (!this.dead) this.gainMana(MANA.regen * dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);

    // Only turn while walking/standing, so attacks keep their direction.
    const canTurn = this.fsm.state === 'idle' || this.fsm.state === 'move';
    if (canTurn && intent.aim.lengthSq() > 0) this.facing.copy(intent.aim);

    this.fsm.update(dt);

    // Blink while invincible after being hurt (not during dodges).
    const blinking = this.invulnTimer > 0 && this.fsm.state !== 'dodge' && !this.dead;
    this.visual.setAlpha(blinking ? (Math.floor(this.scene.time.now / 60) % 2 ? 0.35 : 1) : 1);

    // Only the controlled hero shows the aim arrow and the gold ring.
    this.arrow.setVisible(this.controlled && !this.dead);
    this.leaderRing.setVisible(this.controlled && !this.dead);

    this.updateFacingVisuals();
    this.updateDepth();
  }

  /** Check attack / skill / dodge. Returns true if we switched state. */
  private tryActions(): boolean {
    const i = this.intent;
    if (i.dodge && this.dodgeCooldown <= 0) {
      this.fsm.set('dodge');
      return true;
    }
    if (i.skill && this.canUseSkill) {
      this.fsm.set('skill');
      return true;
    }
    // Tell the player why the skill didn't fire (only once in a while, not every frame).
    if (i.skill && this.controlled && this.skillCooldown <= 0 && this.noManaTimer <= 0) {
      this.noManaTimer = 1;
      popText(this.scene, this.x, this.y - 44, 'Not enough mana', '#7fb8ff', 13);
    }
    if (i.attack || i.attackHeld) {
      if (this.comboWindow <= 0) this.comboStep = 0; // too slow: restart the combo
      this.fsm.set('attack');
      return true;
    }
    return false;
  }

  /** The actual hit of one combo step: a sword slash or a projectile. */
  private performHit(hit: ComboHit): void {
    const angle = this.facing.angle();
    const opts = { power: hit.power, knockback: hit.knock, heavy: hit.heavy, juice: this.controlled };

    if (hit.kind === 'slash') {
      const fx = this.x + this.facing.x * 20;
      const fy = this.y - 10 + this.facing.y * 16;
      slash(this.scene, fx, fy, angle, hit.heavy ? 1.4 : 1, this.comboStep === 1, hit.heavy ? 0xffd23f : 0xffffff);
      if (this.controlled) Sfx.play('swing');
      this.combat.arcAttack(this, angle, hit.range, hit.arc ?? 120, opts);
    } else {
      const tint = hit.heavy ? 0xffd23f : this.def.accent;
      if (this.controlled) Sfx.play('shoot');
      this.combat.shoot(this, angle, hit.speed ?? 500, hit.range, SHOT_TEXTURE[hit.kind], tint, opts, hit.pierce);
    }
  }

  private startSkillAnimation(): void {
    if (this.skillDef.kind === 'spin') {
      this.scene.tweens.add({ targets: this.visual, angle: 360, duration: 300, ease: 'Cubic.easeOut' });
    } else {
      // Charge-up pose: grow a bit, then release.
      this.scene.tweens.add({ targets: this.visual, scaleX: 1.2, scaleY: 1.2, duration: 80, yoyo: true });
    }
  }

  /** What the weapon skill does, by role. */
  private performSkill(): void {
    const s = this.skillDef;
    const juice = this.controlled;
    switch (s.kind) {
      case 'spin':
        ring(this.scene, this.x, this.y - 10, s.radius, this.def.accent);
        this.combat.circleAttack(this, this.x, this.y, s.radius, {
          power: s.power,
          knockback: s.knock,
          heavy: true,
          juice,
          inflict: s.inflict,
        });
        break;
      case 'pierceShot':
        this.body.setVelocity(-this.facing.x * 160, -this.facing.y * 160); // recoil
        this.combat.shoot(this, this.facing.angle(), 820, s.radius, 'bigArrow', this.def.accent,
          { power: s.power, knockback: s.knock, heavy: true, juice, inflict: s.inflict }, true);
        break;
      case 'healCircle':
        ring(this.scene, this.x, this.y - 10, s.radius, 0x7dff8a);
        for (const ally of this.combat.alliesOf(this)) {
          if (Phaser.Math.Distance.Between(this.x, this.y, ally.x, ally.y) <= s.radius) {
            this.combat.heal(ally, Math.round(ally.maxHp * (s.healPct ?? 0.3)));
          }
        }
        break;
    }
  }

  /**
   * Aim assist for melee: if an enemy is close and roughly where you aimed,
   * turn toward it. The mouse is precise, so the assist cone is narrow.
   */
  private aimAssist(): void {
    let best: Entity | null = null;
    let bestDist = 80;
    for (const e of this.combat.opponentsOf(this)) {
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const dist = Math.hypot(dx, dy);
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - this.facing.angle()));
      if (dist < bestDist && diff < Phaser.Math.DegToRad(40)) {
        best = e;
        bestDist = dist;
      }
    }
    if (best) this.facing.set(best.x - this.x, best.y - this.y).normalize();
  }

  /**
   * Start this hero's chain skill on `target`. Called by ChainSystem when the
   * player presses F. `step` is how many chain hits came before (for bonus damage).
   */
  performChain(target: Entity, step: number): boolean {
    if (this.dead || this.fsm.state === 'chain') return false;
    this.chainTarget = target;
    this.chainStep = step;
    this.fsm.set('chain');
    return true;
  }

  /** Start already knocked out (used when entering a room with a fallen hero). */
  forceKO(): void {
    this.hp = 0;
    this.dead = true;
    this.fsm.set('dead');
  }

  get isChaining(): boolean {
    return this.fsm.state === 'chain';
  }

  /** True while dashing in, before the chain hit has landed. */
  get isChainDashing(): boolean {
    return this.fsm.state === 'chain' && !this.hitDone;
  }

  private performChainHit(): void {
    const c = this.def.chain;
    const t = this.chainTarget!;
    const power = c.power * (1 + CHAIN_BONUS_PER_STEP * this.chainStep);

    ring(this.scene, t.x, t.y - 10, c.radius + 20, this.def.accent);
    slash(this.scene, t.x, t.y - 12, this.facing.angle(), 1.8, false, this.def.accent);
    this.visual.setScale(1.3, 0.8);

    this.combat.applyHit(this, t, {
      power,
      knockback: 200,
      heavy: true,
      juice: true,
      chain: true,
      inflict: c.causes ?? undefined,
    });
    // A finisher (causes nothing) ends the target's status.
    if (!c.causes) t.clearStatus();

    // Splash damage to other enemies around the target.
    for (const e of this.combat.opponentsOf(this)) {
      if (e === t) continue;
      if (Phaser.Math.Distance.Between(t.x, t.y, e.x, e.y) <= c.radius + e.radius) {
        this.combat.applyHit(this, e, { power: power * 0.4, knockback: 180 });
      }
    }
    if (c.healPct) {
      for (const ally of this.combat.alliesOf(this)) this.combat.heal(ally, Math.round(ally.maxHp * c.healPct));
    }

    // Drama: a slightly longer freeze and a quick camera zoom punch.
    this.combat.freeze(0.12);
    const cam = this.scene.cameras.main;
    cam.zoomTo(1.12, 70);
    this.scene.time.delayedCall(140, () => cam.zoomTo(1, 220));
  }

  protected onHurt(_hit: Hit): void {
    this.invulnTimer = HURT_INVULN;
    this.comboStep = 0;
    this.fsm.set('hurt');
  }

  protected onDeath(_hit: Hit): void {
    this.fsm.set('dead');
  }

  /**
   * Smoothly blend the current velocity toward the target velocity.
   * `1 - exp(-k * dt)` gives the same feel at 30 fps or 144 fps.
   */
  private applyMovement(dt: number, speed: number): void {
    if (this.isStaggered) return; // knockback is in control
    const targetX = this.intent.move.x * speed;
    const targetY = this.intent.move.y * speed;
    const k = speed > 0 ? Hero.ACCEL : Hero.DECEL;
    const t = 1 - Math.exp(-k * dt);
    const v = this.body.velocity;
    this.body.setVelocity(v.x + (targetX - v.x) * t, v.y + (targetY - v.y) * t);
  }

  /** Little hop + squash while walking, plus dust puffs. Pure visual polish. */
  private animateWalk(dt: number): void {
    this.walkTime += dt;
    const hop = Math.abs(Math.sin(this.walkTime * 14));
    this.visual.y = this.visualBaseY - hop * 3;
    this.visual.setScale(1 + (1 - hop) * 0.05, 1 - (1 - hop) * 0.05);

    this.dustTimer -= dt;
    if (this.dustTimer <= 0) {
      this.dustTimer = 0.16;
      this.spawnDust();
    }
  }

  private spawnDust(): void {
    const puff = this.scene.add
      .image(this.x + Phaser.Math.Between(-4, 4), this.y + 2, 'dust')
      .setDepth(DEPTH.shadows)
      .setAlpha(0.5)
      .setScale(0.6);
    this.scene.tweens.add({
      targets: puff,
      y: puff.y - 6,
      alpha: 0,
      scale: 1.2,
      duration: 350,
      onComplete: () => puff.destroy(),
    });
  }

  private resetVisual(): void {
    this.scene.tweens.killTweensOf(this.visual);
    this.visual.setAngle(0).setScale(1).setY(this.visualBaseY);
  }

  /** Flip the sprite left/right and rotate the arrow toward the facing direction. */
  private updateFacingVisuals(): void {
    if (Math.abs(this.facing.x) > 0.05) this.visual.setFlipX(this.facing.x < 0);
    const angle = this.facing.angle();
    this.arrow.setPosition(Math.cos(angle) * 20, Math.sin(angle) * 14 - 2);
    this.arrow.setRotation(angle);
  }
}
