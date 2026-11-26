import Phaser from 'phaser';
import { Hero, type HeroIntent } from '../entities/Hero';
import { getHeroDef } from '../data/heroes';
import type { CombatSystem } from './CombatSystem';
import type { PlayerInput } from './Controls';
import { CompanionAI } from './CompanionAI';
import { popText, ring } from './Effects';
import { heroLevel, heroSave } from './SaveData';

/**
 * PartyManager owns the three heroes.
 *  - One of them is the "leader": driven by the player's input.
 *  - The others are driven by a CompanionAI each.
 *  - Q / 1 / 2 / 3 switches which hero is the leader.
 *  - If the leader falls, control jumps to the next living hero.
 */
/** Touch auto-aim only locks on to enemies this close (px). */
const AUTO_AIM_RANGE = 320;

export class PartyManager {
  readonly heroes: Hero[] = [];
  private readonly ai = new Map<Hero, CompanionAI>();
  private leaderIndex = 0;
  private autoSwitchTimer = 0;

  /** Intent built from the player's input, reused every frame. */
  private readonly playerIntent: HeroIntent = {
    move: new Phaser.Math.Vector2(),
    aim: new Phaser.Math.Vector2(),
    attack: false,
    attackHeld: false,
    skill: false,
    dodge: false,
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly combat: CombatSystem,
    x: number,
    y: number,
    heroIds: string[],
    /** HP carried over from the previous room (null = full HP). */
    heroHp: number[] | null = null,
    leaderIndex = 0,
    /** Mana carried over from the previous room (null = full mana). */
    heroMana: number[] | null = null,
  ) {
    heroIds.forEach((id, index) => {
      // Spawn in a small triangle around the start point.
      const offsets = [
        [0, 0],
        [-34, 26],
        [34, 26],
      ];
      const [ox, oy] = offsets[index] ?? [0, 0];
      // Level and weapon upgrades come from the save file.
      const hero = new Hero(scene, x + ox, y + oy, getHeroDef(id), combat, heroLevel(id), heroSave(id).weapon);
      this.heroes.push(hero);
      combat.heroes.push(hero);
      this.ai.set(hero, new CompanionAI(hero, combat, index % 2 === 0 ? 1 : -1));
      if (heroHp) {
        if (heroHp[index] <= 0) hero.forceKO();
        else hero.hp = Math.min(hero.maxHp, heroHp[index]);
      }
      if (heroMana) hero.mana = Math.min(hero.maxMana, heroMana[index] ?? hero.maxMana);
    });
    // Keep the same leader as before (or the next living hero).
    this.leaderIndex = leaderIndex;
    if (this.leader.dead) this.leaderIndex = Math.max(0, this.heroes.findIndex((h) => !h.dead));
    combat.isPlayer = (e) => e === this.leader;
    this.applyLeader(false);
  }

  get leader(): Hero {
    return this.heroes[this.leaderIndex];
  }

  get leaderSlot(): number {
    return this.leaderIndex;
  }

  get allDead(): boolean {
    return this.heroes.every((h) => h.dead);
  }

  /** Make hero #index the leader. Returns false if not possible (dead / already leader). */
  switchTo(index: number): boolean {
    const target = this.heroes[index];
    if (!target || target.dead || index === this.leaderIndex) return false;
    this.leaderIndex = index;
    this.applyLeader(true);
    return true;
  }

  /** Switch to the next living hero (wraps around). */
  switchNext(): boolean {
    for (let step = 1; step < this.heroes.length; step++) {
      if (this.switchTo((this.leaderIndex + step) % this.heroes.length)) return true;
    }
    return false;
  }

  /** Called every frame by StageScene. */
  update(dt: number, input: PlayerInput): void {
    // --- Switching ---
    if (input.switchNext) this.switchNext();
    if (input.select >= 0) this.switchTo(input.select);

    // Leader died: hand control to the next living hero after a short beat.
    if (this.leader.dead && !this.allDead) {
      this.autoSwitchTimer += dt;
      if (this.autoSwitchTimer > 0.6) {
        this.autoSwitchTimer = 0;
        this.switchNext();
      }
    }

    // --- Build the player's intent from raw input ---
    const leader = this.leader;
    const pi = this.playerIntent;
    pi.move.copy(input.move);
    if (input.autoAim) this.autoAim(leader, input);
    // Aim from the hero's body (not feet) toward the mouse.
    else pi.aim.set(input.aimWorld.x - leader.x, input.aimWorld.y - (leader.y - 12)).normalize();
    pi.attack = input.attack;
    pi.attackHeld = input.attackHeld;
    pi.skill = input.skill;
    pi.dodge = input.dodge;

    // --- Tick every hero with its intent ---
    for (const hero of this.heroes) {
      const intent = hero === leader ? pi : this.ai.get(hero)!.think(dt, leader);
      hero.tick(dt, intent);
    }
  }

  /**
   * Touch play has no mouse, so we aim for the player: at the nearest enemy
   * in range, otherwise the way you're walking, otherwise keep facing the same way.
   */
  private autoAim(leader: Hero, input: PlayerInput): void {
    const aim = this.playerIntent.aim;
    let best: { x: number; y: number } | null = null;
    let bestDist = AUTO_AIM_RANGE;
    for (const e of this.combat.opponentsOf(leader)) {
      const d = Phaser.Math.Distance.Between(leader.x, leader.y, e.x, e.y);
      if (d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
    if (best) aim.set(best.x - leader.x, best.y - leader.y).normalize();
    else if (input.move.lengthSq() > 0) aim.copy(input.move);
    else aim.set(0, 0); // zero = keep the current facing
  }

  /** Update `controlled` flags and point the camera at the leader. */
  private applyLeader(withEffects: boolean): void {
    this.heroes.forEach((h, i) => (h.controlled = i === this.leaderIndex));
    const leader = this.leader;
    // The camera's lerp makes it glide over to the new hero instead of snapping.
    this.scene.cameras.main.startFollow(leader, true, 0.1, 0.1);

    if (withEffects) {
      leader.invulnTimer = Math.max(leader.invulnTimer, 0.3); // a little safety on swap
      ring(this.scene, leader.x, leader.y - 10, 40, 0xffd23f);
      popText(this.scene, leader.x, leader.y - 46, leader.def.name, '#ffd23f', 16);
    }
  }
}
