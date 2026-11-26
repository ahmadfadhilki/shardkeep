import Phaser from 'phaser';
import { Sfx } from '../systems/Sfx';
import { COLORS, DEPTH } from '../config';
import { getRoomDef, getStageDef, oppositeSide, type RoomDef, type Side, type StageDef } from '../data/stages';
import type { Enemy } from '../entities/Enemy';
import { createEnemy } from '../entities/enemies/createEnemy';
import { Boss } from '../entities/enemies/Boss';
import { ENEMIES } from '../data/enemies';
import { ChainSystem } from '../systems/ChainSystem';
import { Controls } from '../systems/Controls';
import { CombatSystem } from '../systems/CombatSystem';
import { PartyManager } from '../systems/PartyManager';
import { buildRoom, entryPoint, type BuiltRoom } from '../systems/RoomBuilder';
import { RoomController } from '../systems/RoomController';
import { STARS_PER_STAGE, StageRun } from '../systems/StageRun';
import { popText, ring } from '../systems/Effects';
import type { Hero } from '../entities/Hero';
import { getSave, grantXp, heroLevel, heroSave, saveGame, stageSave, getParty } from '../systems/SaveData';
import { POTIONS, STAGE_CLEAR_XP, type PotionKind } from '../data/progression';
import type { ResultsData } from './ResultsScene';
import type { PauseData } from './PauseScene';
import { flushCloudSave } from '../services/saveService';

/**
 * Data passed to this scene by scene.start / scene.restart.
 * Moving to another room = restarting this scene with the same `run`
 * and a different `roomId`. The run remembers everything between rooms.
 */
export interface StageSceneData {
  stageId: string;
  run?: StageRun;
  roomId?: string;
  /** Where the party appears: the stage start, a side of the room, or the checkpoint. */
  entry?: Side | 'start' | 'checkpoint';
}


/**
 * StageScene is where the dungeon gameplay happens. It shows ONE room at a time.
 *
 *   create()  builds the room, the party, the enemies and the props.
 *   update()  runs the game loop and watches for the party leaving the room.
 *
 * The HUD is drawn by UIScene on top; it reads `party`, `chain` and `run` from here.
 */
export class StageScene extends Phaser.Scene {
  stage!: StageDef;
  run!: StageRun;
  roomDef!: RoomDef;
  party!: PartyManager;
  enemies: Enemy[] = [];
  combat!: CombatSystem;
  chain!: ChainSystem;
  /** The boss in this room (if any). UIScene shows its big HP bar while bossBarVisible. */
  boss: Boss | null = null;
  bossBarVisible = false;

  private controls!: Controls;
  private built!: BuiltRoom;
  private room!: RoomController;
  private entry: StageSceneData['entry'] = 'start';
  /** True while fading to another room / restarting (stops double triggers). */
  private leaving = false;
  /** True during the boss intro: the party can't act. */
  private cutscene = false;
  private enemyGroup!: Phaser.GameObjects.Group;

  constructor() {
    super('Stage');
  }

  init(data: StageSceneData): void {
    this.stage = getStageDef(data.stageId ?? 'ember-hollow');
    if (data.run) {
      this.run = data.run;
    } else {
      // A brand-new run: remember everyone's XP so Results can show what was gained.
      this.run = new StageRun(this.stage.id);
      for (const id of getParty()) this.run.xpBefore[id] = heroSave(id).xp;
    }
    this.roomDef = getRoomDef(this.stage, data.roomId ?? this.stage.startRoom);
    this.entry = data.entry ?? 'start';
    // init() runs again on every restart, so reset per-room state here.
    this.enemies = [];
    this.leaving = false;
    this.cutscene = false;
    this.boss = null;
    this.bossBarVisible = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.controls = new Controls(this);
    this.combat = new CombatSystem(this);
    this.chain = new ChainSystem(this);
    const progress = this.run.room(this.roomDef.id);

    // 1. Build the room from its ASCII layout.
    this.built = buildRoom(this, this.roomDef);
    this.physics.world.setBounds(0, 0, this.built.widthPx, this.built.heightPx);

    // 2. Props + puzzles (doors, blocks, crystals, pickups...).
    this.room = new RoomController(this, this.combat, this.run, this.roomDef, this.built, {
      onCollect: (kind) => this.onCollect(kind),
      onCheckpoint: (x, y) => this.onCheckpoint(x, y),
      onGoal: () => this.onGoal(),
      onSolved: () => {
        this.showBanner('A door opened!', 1200);
        Sfx.play('door');
      },
    });
    this.combat.solidAt = (x, y) => this.room.solidAt(x, y);

    // 3. The party, at the right entrance, with HP carried over from the last room.
    const spawn = this.spawnPoint();
    this.party = new PartyManager(this, this.combat, spawn.x, spawn.y, getParty(), this.run.heroHp, this.run.leaderIndex, this.run.heroMana);
    this.physics.add.collider(this.party.heroes, this.built.layer);
    this.physics.add.collider(this.party.heroes, this.room.solids);

    // 4. Enemies that haven't been defeated yet.
    const enemyGroup = (this.enemyGroup = this.add.group());
    for (const spawnDef of this.built.enemySpawns) {
      if (progress.defeated.includes(spawnDef.index)) continue;
      const enemy = createEnemy(this, spawnDef.x, spawnDef.y, spawnDef.def, this.combat);
      enemy.spawnIndex = spawnDef.index;
      this.enemies.push(enemy);
      this.combat.enemies.push(enemy);
      enemyGroup.add(enemy);
      if (enemy instanceof Boss) this.boss = enemy;
    }
    this.physics.add.collider(enemyGroup, this.built.layer);
    this.physics.add.collider(enemyGroup, this.room.solids);
    this.physics.add.collider(enemyGroup, enemyGroup);
    this.events.on('enemy-died', (enemy: Enemy) => {
      Sfx.play(enemy === this.boss ? 'explosion' : 'enemyDie');
      progress.defeated.push(enemy.spawnIndex);
      this.awardXp(enemy);
      this.room.dropCoins(enemy.x, enemy.y, Math.ceil(enemy.def.coins / 3));
      if (enemy === this.boss) this.onBossDefeated();
    });
    // Phase 2: the boss calls helpers.
    this.events.on('boss-summon', (list: { id: string; x: number; y: number }[]) => {
      for (const s of list) {
        const def = ENEMIES.find((e) => e.id === s.id);
        if (!def) continue;
        const helper = createEnemy(this, s.x, s.y, def, this.combat);
        this.enemies.push(helper);
        this.combat.enemies.push(helper);
        this.enemyGroup.add(helper);
      }
    });

    // 5. Camera: stay inside the room. (PartyManager tells it whom to follow.)
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.built.widthPx, this.built.heightPx);
    cam.fadeIn(250, 0, 0, 0);

    // 6. HUD overlay, crosshair cursor.
    this.scene.launch('UI');
    this.input.setDefaultCursor('none');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop('UI');
      this.input.setDefaultCursor('default');
      this.events.off('enemy-died');
      this.events.off('boss-summon');
    });

    // 7. Room name, plus a hint the first time you visit.
    this.showBanner(this.roomDef.name, 1200);
    if (!progress.visited && this.roomDef.hint) this.showHint(this.roomDef.hint);
    progress.visited = true;
    if (this.boss) this.bossIntro(this.boss);

    // R: reset this room (re-enter it). Handy when a block gets stuck.
    this.input.keyboard!.on('keydown-R', () => this.resetRoom());
  }

  update(_time: number, deltaMs: number): void {
    // Clamp dt so a lag spike (e.g. switching tabs) doesn't teleport things.
    const dt = Math.min(deltaMs / 1000, 1 / 20);

    // Hit-stop: while frozen, skip the whole simulation for a few ms.
    // We also DON'T read input while frozen: presses stay queued and are used
    // right after the freeze, so a quick F or click during hit-stop is never lost.
    if (this.combat.freezeTime > 0) {
      this.combat.freezeTime -= dt;
      this.physics.world.isPaused = true;
      return;
    }
    this.physics.world.isPaused = false;
    if (this.leaving) return;

    this.run.elapsed += dt;
    if (this.cutscene) {
      // Keep animating enemies (they stand still in idle) but ignore input.
      this.party.heroes.forEach((h) => h.body.setVelocity(0, 0));
      return;
    }
    const input = this.controls.read();
    if (input.pause) {
      this.openPause();
      return;
    }

    this.party.update(dt, input);
    for (const enemy of this.enemies) enemy.tick(dt);
    this.combat.update(dt);

    // Chain skills: find opportunities, fire one when F is pressed.
    this.chain.update(dt, this.party, this.enemies);
    if (input.chain) this.chain.trigger();
    if (input.potionHealth) this.usePotion('health');
    if (input.potionMana) this.usePotion('mana');

    // Remove destroyed enemies from our lists.
    this.enemies = this.enemies.filter((e) => e.active);
    this.combat.enemies = this.combat.enemies.filter((e) => e.active && !e.dead);

    // Puzzles, pickups, doors.
    const alive = this.enemies.filter((e) => !e.dead).length;
    this.room.update(dt, this.party.leader, this.party.heroes, input.move, alive);

    this.checkExits();
    if (this.party.allDead) this.onDefeat();
  }

  // -------------------------------------------------------------------------
  // Moving between rooms
  // -------------------------------------------------------------------------

  /** Re-enter the current room (R key, or "Reset room" in the pause menu). */
  resetRoom(): void {
    this.changeRoom(this.roomDef.id, this.entry ?? 'start');
  }

  /** Esc: freeze this scene and the HUD, and show the pause menu on top. */
  private openPause(): void {
    this.party.heroes.forEach((h) => h.body.setVelocity(0, 0));
    this.scene.pause();
    this.scene.pause('UI');
    this.scene.launch('Pause', { from: 'Stage', stageId: this.stage.id } satisfies PauseData);
  }

  /** Where the party appears in this room. */
  private spawnPoint(): Phaser.Math.Vector2 {
    const e = this.entry;
    if (e === 'checkpoint' && this.run.checkpoint) return new Phaser.Math.Vector2(this.run.checkpoint.x, this.run.checkpoint.y);
    if (e && e !== 'start' && e !== 'checkpoint') return entryPoint(this.built, e);
    if (this.built.playerSpawn) return this.built.playerSpawn;
    return new Phaser.Math.Vector2(this.built.widthPx / 2, this.built.heightPx / 2);
  }

  /** If the leader walked out through an exit gap, go to the connected room. */
  private checkExits(): void {
    const l = this.party.leader;
    const margin = 4;
    let side: Side | null = null;
    if (l.x < margin) side = 'west';
    else if (l.x > this.built.widthPx - margin) side = 'east';
    else if (l.y < margin) side = 'north';
    else if (l.y > this.built.heightPx - margin) side = 'south';
    if (!side) return;

    const target = this.roomDef.exits[side];
    if (!target) return;
    this.changeRoom(target, oppositeSide(side));
  }

  /** Fade out, remember the party's HP, and rebuild the scene for the new room. */
  private changeRoom(roomId: string, entry: StageSceneData['entry']): void {
    if (this.leaving) return;
    this.leaving = true;
    this.run.heroHp = this.party.heroes.map((h) => h.hp);
    this.run.heroMana = this.party.heroes.map((h) => h.mana);
    this.run.leaderIndex = this.party.leaderSlot;
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.restart({ stageId: this.stage.id, run: this.run, roomId, entry } satisfies StageSceneData),
    );
  }

  // -------------------------------------------------------------------------
  // Room events
  // -------------------------------------------------------------------------

  private onCollect(kind: 'coin' | 'star' | 'key'): void {
    const l = this.party.leader;
    Sfx.play(kind);
    if (kind === 'star') {
      this.showBanner(`Star found!  ${this.run.stars.length} / ${STARS_PER_STAGE}`, 1400);
      this.cameras.main.flash(200, 255, 240, 150);
    }
    if (kind === 'key') popText(this, l.x, l.y - 50, 'Got the key!', '#9fd8ff', 18);
  }

  private onCheckpoint(x: number, y: number): void {
    this.run.checkpoint = { roomId: this.roomDef.id, x, y };
    // Full heal for everyone standing. Fallen heroes get back up when you
    // enter the next room (heroHp = null means "everyone at full HP").
    for (const h of this.party.heroes) {
      if (h.dead) continue;
      this.combat.heal(h, h.maxHp);
      h.mana = h.maxMana;
    }
    this.run.heroHp = null;
    this.run.heroMana = null;
  }

  /**
   * The party stepped into the portal: the stage is cleared!
   * Bank the rewards in the save file, then show the Results screen.
   */
  private onGoal(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.party.heroes.forEach((h) => h.body.setVelocity(0, 0));

    const save = getSave();
    const record = stageSave(this.stage.id);
    const time = this.run.elapsed;
    const firstClear = !record.cleared;
    const newBest = record.bestTime === 0 || time < record.bestTime;
    record.cleared = true;
    if (newBest) record.bestTime = time;
    for (const star of this.run.stars) if (!record.stars.includes(star)) record.stars.push(star);
    save.coins += this.run.coins; // coins only reach the bank when you clear
    for (const id of getParty()) grantXp(id, STAGE_CLEAR_XP);
    saveGame();
    void flushCloudSave(); // auto-save to the cloud after each stage (does nothing for guests)

    const results: ResultsData = {
      stageId: this.stage.id,
      time,
      coins: this.run.coins,
      stars: this.run.stars.length,
      xpBefore: this.run.xpBefore,
      xpGained: this.run.xpGained,
      clearXp: STAGE_CLEAR_XP,
      newBest,
      firstClear,
    };
    this.titleCard('STAGE CLEAR!', this.stage.name);
    Sfx.play('clear');
    this.time.delayedCall(1800, () => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Results', results));
    });
  }

  // -------------------------------------------------------------------------
  // XP, level ups, potions
  // -------------------------------------------------------------------------

  /** Every hero in the party gets the enemy's XP (even fallen ones, so nobody falls behind). */
  private awardXp(enemy: Enemy): void {
    const xp = enemy.def.xp;
    if (xp <= 0) return;
    this.run.xpGained += xp;
    popText(this, enemy.x, enemy.y - 34, `+${xp} XP`, '#b8f27a', 13);

    const leveled: Hero[] = [];
    for (const hero of this.party.heroes) {
      if (grantXp(hero.def.id, xp) > 0) leveled.push(hero);
    }
    saveGame(); // XP is kept even if you lose or quit later
    if (leveled.length === 0) return;

    for (const hero of leveled) {
      hero.setLevel(heroLevel(hero.def.id));
      ring(this, hero.x, hero.y - 10, 46, 0xffd23f);
      Sfx.play('levelUp');
      popText(this, hero.x, hero.y - 56, 'LEVEL UP!', '#ffd23f', 18);
    }
    this.showBanner(`LEVEL UP!  ${leveled.map((h) => `${h.def.name} Lv.${h.level}`).join('   ')}`, 1400, 118); // lower, so it never covers other banners
  }

  /** Z / X: drink a potion on the hero you control. Potions are bought in town. */
  private usePotion(kind: PotionKind): void {
    const hero = this.party.leader;
    if (hero.dead) return;
    const save = getSave();
    const def = POTIONS.find((p) => p.kind === kind)!;
    const say = (text: string, color = '#ffffff') => popText(this, hero.x, hero.y - 48, text, color, 13);

    if (save.potions[kind] <= 0) return say(`No ${def.name}s left`);
    if (kind === 'health' && hero.hp >= hero.maxHp) return say('HP is already full');
    if (kind === 'mana' && hero.mana >= hero.maxMana) return say('Mana is already full');

    save.potions[kind]--;
    saveGame();
    if (kind === 'health') {
      this.combat.heal(hero, Math.round(hero.maxHp * def.amount));
    } else {
      hero.gainMana(def.amount);
      say('+MANA', '#7fb8ff');
    }
    ring(this, hero.x, hero.y - 10, 34, kind === 'health' ? 0x7dff8a : 0x7fb8ff);
    Sfx.play('potion');
  }

  private onDefeat(): void {
    if (this.leaving) return;
    this.leaving = true;
    const cp = this.run.checkpoint;
    this.showBanner(cp ? 'Defeated... back to the checkpoint' : 'Party defeated... restarting', 1600);
    Sfx.play('defeat');
    this.time.delayedCall(2000, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        if (cp) {
          // Respawn at the checkpoint with full HP; everything else is kept.
          this.run.heroHp = null;
          this.run.heroMana = null;
          this.scene.restart({ stageId: this.stage.id, run: this.run, roomId: cp.roomId, entry: 'checkpoint' } satisfies StageSceneData);
        } else {
          this.scene.restart({ stageId: this.stage.id } satisfies StageSceneData);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // Boss
  // -------------------------------------------------------------------------

  /**
   * Boss intro: the camera glides to the boss, its name appears, it roars,
   * and the camera returns to your hero. The first time only; later visits
   * (e.g. after a defeat) get a quick roar so you're not kept waiting.
   */
  private bossIntro(boss: Boss): void {
    const cam = this.cameras.main;
    const roar = () => {
      cam.shake(500, 0.008);
      popText(this, boss.x, boss.y - 90, 'ROAAAR!', '#ff9b3d', 24);
      Sfx.play('roar');
      this.bossBarVisible = true;
    };
    if (this.run.bossIntroSeen) {
      this.time.delayedCall(400, roar);
      return;
    }
    this.run.bossIntroSeen = true;
    this.cutscene = true;
    cam.stopFollow();
    cam.pan(boss.x, boss.y, 700, 'Sine.easeInOut');
    this.time.delayedCall(800, () => {
      roar();
      this.titleCard(boss.def.name.toUpperCase(), 'Keeper of the Ember Throne');
    });
    this.time.delayedCall(2700, () => cam.pan(this.party.leader.x, this.party.leader.y, 500, 'Sine.easeInOut'));
    this.time.delayedCall(3250, () => {
      cam.startFollow(this.party.leader, true, 0.1, 0.1);
      this.cutscene = false;
    });
  }

  private onBossDefeated(): void {
    this.bossBarVisible = false;
    // Its helpers flee (vanish) with it, so the doors can open.
    for (const e of this.enemies) {
      if (e !== this.boss && !e.dead) {
        e.hp = 1;
        e.takeDamage({ attacker: this.party.leader, damage: 1, dirX: 0, dirY: 0, heavy: false });
      }
    }
    this.cameras.main.flash(400, 255, 230, 180);
    this.time.delayedCall(1200, () => this.titleCard(`${this.boss!.def.name.toUpperCase()} DEFEATED!`, 'Step into the portal'));
  }

  /** Big centered title text (boss name, victory...). */
  private titleCard(title: string, subtitle: string): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2 - 60;
    const t = this.add
      .text(cx, cy, title, { fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold', color: '#ff9b3d', stroke: '#1a1422', strokeThickness: 8 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ui).setAlpha(0).setScale(1.6);
    const sub = this.add
      .text(cx, cy + 40, subtitle, { fontFamily: 'monospace', fontSize: '16px', color: COLORS.uiText, stroke: '#1a1422', strokeThickness: 4 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ui).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, delay: 250, duration: 300 });
    this.tweens.add({ targets: [t, sub], alpha: 0, delay: 1900, duration: 400, onComplete: () => { t.destroy(); sub.destroy(); } });
  }

  // -------------------------------------------------------------------------
  // Text helpers
  // -------------------------------------------------------------------------

  /** A banner that slides in at the top, then fades out. */
  showBanner(text: string, hold = 1800, y = 70): void {
    const banner = this.add
      .text(this.scale.width / 2, y, text, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: COLORS.uiAccent,
        backgroundColor: '#00000088',
        padding: { x: 14, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui)
      .setAlpha(0);
    this.tweens.chain({
      targets: banner,
      tweens: [
        { alpha: 1, y: y + 10, duration: 400, ease: 'Back.easeOut' },
        { alpha: 0, delay: hold, duration: 500 },
      ],
      onComplete: () => banner.destroy(),
    });
  }

  /** A hint line at the bottom of the screen (first visit only). */
  private showHint(text: string): void {
    const hint = this.add
      .text(this.scale.width / 2, this.scale.height - 120, text, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui)
      .setAlpha(0);
    this.tweens.chain({
      targets: hint,
      tweens: [
        { alpha: 1, delay: 600, duration: 300 },
        { alpha: 0, delay: 4000, duration: 600 },
      ],
      onComplete: () => hint.destroy(),
    });
  }
}
