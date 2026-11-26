import Phaser from 'phaser';
import { Enemy } from '../Enemy';
import type { Entity } from '../Entity';
import type { Status } from '../../data/skills';
import { DEPTH } from '../../config';
import { hitSpark, poof, popText, ring, warningZone } from '../../systems/Effects';

type Pattern = 'charge' | 'eruption' | 'ring';

/** Tuning for each attack pattern. Phase 2 makes everything faster. */
const PATTERN = {
  charge: { windup: 0.9, recover: 0.6, speed: 560, width: 60 },
  eruption: { windup: 1.1, recover: 0.9, radius: 58 },
  ring: { windup: 0.75, recover: 0.7, bullets: 12, bulletSpeed: 190 },
} as const;
const PHASE2_SPEEDUP = 0.75; // phase 2 timings are multiplied by this

/**
 * THE BOSS (Ashen Warden, Rime Colossus...).
 * Every boss shares these patterns; what differs (helpers, colors, whether it
 * rings in phase 1...) comes from `def.boss` in data/enemies.ts.
 *
 * It uses the same flow as every Enemy (chase -> windup -> attack -> recover),
 * but picks one of three ATTACK PATTERNS each time:
 *
 *   Molten Charge  A red lane shows its path, then it rushes along it.
 *                  If it slams into a wall or pillar, it is STUNNED: chain time!
 *   Eruption       Red circles appear under every hero; lava bursts there.
 *   Flame Ring     (phase 2 only) a ring of fireballs flies outward.
 *
 * At 50% HP it enters PHASE 2: faster, more eruption zones, a double ring,
 * and it summons two Ember Wisps once.
 *
 * Armor: normal hits never interrupt it, and skills can't stun it directly.
 * Break its armor (poise) or make it crash to open a chain-skill window.
 */
export class Boss extends Enemy {
  phase = 1;
  private pattern: Pattern = 'eruption';
  private lastPattern: Pattern | null = null;
  private telegraph?: Phaser.GameObjects.Graphics;
  private chargeLength = 0;
  private zones: { x: number; y: number }[] = [];
  private zoneGfx: Phaser.GameObjects.Graphics[] = [];
  private chargeHits = new Set<Entity>();
  private resistMsgAt = 0;

  /** This boss's personality (defaults = the Ashen Warden). */
  private get style() {
    return this.def.boss ?? { title: '', summon: ['shooter', 'shooter'], fx: 0xff7a3a, enrageTint: 0xff9a80 };
  }

  // ------------------------------------------------------------------
  // Choosing what to do
  // ------------------------------------------------------------------

  protected chaseUpdate(dt: number, target: Entity, dist: number): void {
    // Lumber toward the target, but don't hug it.
    if (dist > 140) this.moveToward(target.x, target.y, this.def.speed * (this.phase === 2 ? 1.3 : 1), dt);
    else this.slowDown(dt);
    this.idleAnimation();

    const think = this.phase === 2 ? 0.45 : 0.9;
    if (this.fsm.time > think) {
      this.pattern = this.choosePattern(dist);
      this.lastPattern = this.pattern;
      this.startWindup();
    }
  }

  /** Weighted random choice; avoids repeating the same pattern twice in a row. */
  private choosePattern(dist: number): Pattern {
    const weights: [Pattern, number][] = [
      ['charge', dist > 170 ? 3 : 1],
      ['eruption', 2],
      ['ring', this.phase === 2 ? 2 : this.style.ringInPhase1 ? 1 : 0],
    ];
    const options = weights.filter(([p, w]) => w > 0 && p !== this.lastPattern);
    const total = options.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [p, w] of options) {
      r -= w;
      if (r <= 0) return p;
    }
    return options[0][0];
  }

  protected windupTime(): number {
    const t = PATTERN[this.pattern].windup;
    return this.phase === 2 ? t * PHASE2_SPEEDUP : t;
  }

  protected recoverTime(): number {
    const t = PATTERN[this.pattern].recover;
    return this.phase === 2 ? t * PHASE2_SPEEDUP : t;
  }

  // ------------------------------------------------------------------
  // Telegraphs (the warnings the player learns to read)
  // ------------------------------------------------------------------

  protected onWindupStart(): void {
    if (this.pattern === 'charge') {
      this.chargeLength = this.measureLane();
      this.telegraph = this.scene.add.graphics({ x: this.x, y: this.y }).setDepth(DEPTH.shadows);
      this.telegraph.setRotation(this.attackDir.angle());
    } else if (this.pattern === 'eruption') {
      // A zone under every hero (+ extra random ones in phase 2).
      this.zones = this.combat.opponentsOf(this).map((h) => ({ x: h.x, y: h.y }));
      if (this.phase === 2) {
        for (let i = 0; i < 3; i++) {
          const base = Phaser.Utils.Array.GetRandom(this.zones) ?? { x: this.x, y: this.y };
          this.zones.push({ x: base.x + Phaser.Math.Between(-110, 110), y: base.y + Phaser.Math.Between(-80, 80) });
        }
      }
      this.zoneGfx = this.zones.map((z) => warningZone(this.scene, z.x, z.y, PATTERN.eruption.radius, this.windupTime()));
    }
  }

  protected onWindupUpdate(progress: number): void {
    const flicker = progress > 0.7 && Math.floor(progress * 30) % 2 === 0;
    if (this.pattern === 'charge') {
      // Red lane that fills up from the boss toward the wall.
      const g = this.telegraph!;
      const w = PATTERN.charge.width;
      g.clear();
      g.fillStyle(0xff3030, 0.16).fillRect(0, -w / 2, this.chargeLength, w);
      g.lineStyle(2, 0xff4a4a, 0.85).strokeRect(0, -w / 2, this.chargeLength, w);
      g.fillStyle(0xff3030, 0.35).fillRect(0, -w / 2, this.chargeLength * progress, w);
      // Lean back, scraping the ground.
      this.visual.setScale(1 + progress * 0.12, 1 - progress * 0.08);
      this.visual.x = -this.attackDir.x * progress * 6;
    } else if (this.pattern === 'eruption') {
      // Raise up, ready to pound the ground.
      this.visual.y = this.visualBaseY - progress * 12;
      this.visual.setScale(1 - progress * 0.06, 1 + progress * 0.1);
    } else {
      // Glow hotter and swell.
      this.visual.setScale(1 + progress * 0.15);
    }
    if (flicker) this.visual.setTint(0xffb38a);
    else this.visual.clearTint();
  }

  protected onWindupEnd(): void {
    this.telegraph?.destroy();
    this.telegraph = undefined;
    // Interrupted (armor broke during the wind-up)? Remove the warnings early.
    if (this.fsm.time < this.windupTime()) {
      this.zoneGfx.forEach((g) => g.destroy());
      this.zones = [];
    }
    this.zoneGfx = [];
  }

  // ------------------------------------------------------------------
  // Attacks
  // ------------------------------------------------------------------

  protected onAttackStart(): void {
    this.resetVisual();
    if (this.pattern === 'charge') {
      this.chargeHits.clear();
      this.visual.setScale(1.15, 0.9);
    } else if (this.pattern === 'eruption') {
      this.visual.setScale(1.2, 0.85);
      for (const z of this.zones) this.erupt(z.x, z.y);
      this.zones = [];
    } else {
      const bullets = this.style.ringBullets ?? PATTERN.ring.bullets;
      const n = this.phase === 2 ? bullets + 4 : bullets;
      this.fireRing(n, 0);
      if (this.phase === 2) {
        // A second ring, rotated half a step, fills the gaps.
        this.scene.time.delayedCall(280, () => {
          if (this.active && !this.dead) this.fireRing(n, Math.PI / n);
        });
      }
    }
  }

  protected onAttackUpdate(_dt: number, time: number): boolean {
    if (this.pattern !== 'charge') return time > 0.35;

    // Keep charging in a straight line.
    const s = PATTERN.charge.speed;
    this.body.setVelocity(this.attackDir.x * s, this.attackDir.y * s);

    // Trample any hero in the way (once per hero per charge).
    for (const hero of this.combat.opponentsOf(this)) {
      if (this.chargeHits.has(hero)) continue;
      if (Phaser.Math.Distance.Between(this.x, this.y, hero.x, hero.y) < this.radius + hero.radius + 6) {
        this.chargeHits.add(hero);
        this.combat.applyHit(this, hero, { power: 1.4, knockback: 420, heavy: true });
      }
    }

    // Hit something solid?
    //  - a PILLAR (inside the arena): CRASH -> stunned. Bait it into pillars!
    //  - the outer wall: it just stops with a thud.
    const b = this.body.blocked;
    if (time > 0.08 && (b.left || b.right || b.up || b.down)) {
      if (this.nearOuterWall()) {
        this.body.setVelocity(0, 0);
        this.scene.cameras.main.shake(120, 0.005);
        return true;
      }
      this.crash();
      return false; // crash() already switched us to 'stunned'
    }
    if (time > 1.6) {
      this.body.setVelocity(0, 0);
      return true;
    }
    return false;
  }

  private crash(): void {
    this.body.setVelocity(0, 0);
    this.scene.cameras.main.shake(260, 0.012);
    poof(this.scene, this.x + this.attackDir.x * this.radius, this.y + this.attackDir.y * this.radius - 10, 0x9a8a70);
    popText(this.scene, this.x, this.y - 80, 'CRASH!', '#ff9b3d', 22);
    this.applyStatus('stun', 2.8, true);
  }

  /** Lava burst at a point (damages heroes inside the radius). */
  private erupt(x: number, y: number): void {
    const r = PATTERN.eruption.radius;
    ring(this.scene, x, y, r, this.style.fx);
    hitSpark(this.scene, x, y - 10, this.style.fx, 12);
    poof(this.scene, x, y - 6, this.style.fx);
    this.combat.circleAttack(this, x, y, r, { power: 1.2, knockback: 300, heavy: true });
    this.scene.cameras.main.shake(90, 0.004);
  }

  private fireRing(count: number, offset: number): void {
    for (let i = 0; i < count; i++) {
      const angle = offset + (i * Math.PI * 2) / count;
      this.combat.shoot(this, angle, PATTERN.ring.bulletSpeed, 520, 'bolt', this.style.fx, { power: 0.8, knockback: 150 });
    }
    ring(this.scene, this.x, this.y - 20, 50, this.style.fx);
  }

  /** True when standing right next to the room's outer wall (not a pillar). */
  private nearOuterWall(): boolean {
    const w = this.scene.physics.world.bounds;
    const edge = 64; // two tiles
    return this.x < w.x + edge || this.x > w.right - edge || this.y < w.y + edge || this.y > w.bottom - edge;
  }

  /** How far the charge can go before hitting something solid. */
  private measureLane(): number {
    let len = 0;
    while (len < 760) {
      const px = this.x + this.attackDir.x * (len + this.radius);
      const py = this.y + this.attackDir.y * (len + this.radius);
      if (this.combat.solidAt(px, py)) break;
      len += 8;
    }
    return len + this.radius;
  }

  // ------------------------------------------------------------------
  // Armor, phases, death
  // ------------------------------------------------------------------

  /**
   * Bosses ignore stuns/knockdowns from normal skills. Only forced statuses
   * (armor break, crash) start a chain; once it's stunned, chain skills can
   * keep adding statuses as usual.
   */
  applyStatus(status: Status, duration: number, force = false): void {
    if (force || this.status) {
      super.applyStatus(status, duration, force);
      return;
    }
    if (this.scene.time.now > this.resistMsgAt) {
      this.resistMsgAt = this.scene.time.now + 1500;
      popText(this.scene, this.x, this.y - 80, 'RESIST', '#bbbbbb', 14);
    }
  }

  protected onHurt(hit: Parameters<Enemy['onHurt']>[0]): void {
    super.onHurt(hit);
    if (this.phase === 1 && this.hp <= this.maxHp / 2) this.enterPhase2();
  }

  private enterPhase2(): void {
    this.phase = 2;
    popText(this.scene, this.x, this.y - 90, 'ENRAGED!', '#ff5a5a', 26);
    this.scene.cameras.main.shake(400, 0.01);
    const c = Phaser.Display.Color.IntegerToColor(this.style.fx); // flash in the boss's own color
    this.scene.cameras.main.flash(250, c.red, c.green, c.blue);
    ring(this.scene, this.x, this.y - 20, 120, 0xff5a2a);
    // Summon helpers in a circle around it (StageScene creates them).
    const ids = this.style.summon;
    this.scene.events.emit(
      'boss-summon',
      ids.map((id, i) => {
        const a = -Math.PI / 2 + (i - (ids.length - 1) / 2) * 0.9; // spread out above the boss
        return { id, x: this.x + Math.cos(a) * 150, y: this.y + Math.sin(a) * 110 };
      }),
    );
  }

  protected idleAnimation(): void {
    const t = this.scene.time.now * 0.003;
    this.visual.y = this.visualBaseY + Math.sin(t) * 2;
    this.visual.setScale(1 + Math.sin(t) * 0.02, 1 - Math.sin(t) * 0.02);
    // Phase 2: the lava cracks pulse red.
    if (this.phase === 2) {
      if (Math.floor(this.scene.time.now / 180) % 2 === 0) this.visual.setTint(this.style.enrageTint);
      else this.visual.clearTint();
    }
  }

  /** A big, slow death: flashes and explosions, then gone. */
  protected playDeath(): void {
    this.visual.setTintFill(0xffffff);
    this.scene.cameras.main.shake(900, 0.01);
    let n = 0;
    this.scene.time.addEvent({
      delay: 130,
      repeat: 7,
      callback: () => {
        n++;
        poof(this.scene, this.x + Phaser.Math.Between(-30, 30), this.y - Phaser.Math.Between(0, 50), n % 2 ? this.style.fx : 0xffffff);
        this.visual.setAlpha(n % 2 ? 0.4 : 1);
      },
    });
    this.scene.time.delayedCall(1100, () => {
      ring(this.scene, this.x, this.y - 20, 140, 0xffd23f);
      poof(this.scene, this.x, this.y - 20, 0xffd23f);
      this.destroy();
    });
  }
}
