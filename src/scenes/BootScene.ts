import Phaser from 'phaser';
import { COLORS, TILE } from '../config';
import { HEROES } from '../data/heroes';
import { HUB_NPCS } from '../data/hub';
import { ENEMIES } from '../data/enemies';

/**
 * BootScene runs first. It creates every placeholder texture with code,
 * so the game needs no image files yet.
 *
 * When you have real art later, load it in PreloadScene with the SAME keys
 * (e.g. 'hero-rook', 'tiles') and delete the matching drawing code here.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.makeTiles();
    for (const npc of HUB_NPCS) this.makeNpc('npc-' + npc.id, npc.color);
    for (const hero of HEROES) this.makeHero(`hero-${hero.id}`, hero.color, hero.accent);
    for (const enemy of ENEMIES) {
      const key = `enemy-${enemy.id}`;
      if (enemy.shape === 'wisp') this.makeWisp(key, enemy.color, enemy.accent, enemy.radius);
      else if (enemy.shape === 'shell') this.makeShell(key, enemy.color, enemy.accent, enemy.radius);
      else if (enemy.shape === 'golem') this.makeGolem(key, enemy.color, enemy.accent);
      else this.makeBlob(key, enemy.color, enemy.accent, enemy.radius);
    }
    this.makeShadow();
    this.makeFacingArrow();
    this.makeDust();
    this.makeCombatFx();
    this.makeProps();

    this.scene.start('Preload');
  }

  /** A horizontal strip of 32x32 tiles. Order must match TILE_INDEX in RoomBuilder. */
  private makeTiles(): void {
    const frames = 5;
    const tex = this.textures.createCanvas('tiles', TILE * frames, TILE)!;
    const ctx = tex.getContext();
    const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

    const floor = (ox: number, base: number) => {
      ctx.fillStyle = hex(base);
      ctx.fillRect(ox, 0, TILE, TILE);
      // Faint tile grout lines make the floor readable while moving.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(ox, TILE - 1, TILE, 1);
      ctx.fillRect(ox + TILE - 1, 0, 1, TILE);
      // A few specks for texture.
      ctx.fillStyle = hex(COLORS.floorSpeck);
      ctx.fillRect(ox + 7, 9, 2, 2);
      ctx.fillRect(ox + 21, 19, 2, 2);
      ctx.fillRect(ox + 13, 26, 1, 1);
    };

    // 0: floor A, 1: floor B
    floor(0, COLORS.floorA);
    floor(TILE, COLORS.floorB);

    // 2: wall top (seen from above)
    let ox = TILE * 2;
    ctx.fillStyle = hex(COLORS.wallTop);
    ctx.fillRect(ox, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(ox + 2, 2, TILE - 4, TILE - 4);

    // 3: wall with visible front face (top strip + darker brick face)
    ox = TILE * 3;
    ctx.fillStyle = hex(COLORS.wallTop);
    ctx.fillRect(ox, 0, TILE, 10);
    ctx.fillStyle = hex(COLORS.wallEdge);
    ctx.fillRect(ox, 9, TILE, 2);
    ctx.fillStyle = hex(COLORS.wallFace);
    ctx.fillRect(ox, 11, TILE, TILE - 11);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; // brick lines
    ctx.fillRect(ox, 20, TILE, 1);
    ctx.fillRect(ox + 10, 11, 1, 9);
    ctx.fillRect(ox + 24, 21, 1, 11);

    // 4: floor with shadow cast by the wall above it
    ox = TILE * 4;
    floor(ox, COLORS.floorA);
    const grad = ctx.createLinearGradient(0, 0, 0, 14);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(ox, 0, TILE, 14);

    tex.refresh();
  }

  /**
   * A cute "chibi" placeholder: round head, small body, eyes looking right.
   * The sprite is flipped horizontally when the hero faces left.
   */
  private makeHero(key: string, color: number, accent: number): void {
    const g = this.add.graphics();
    const o = COLORS.outline;
    // Body
    g.fillStyle(o).fillRoundedRect(7, 17, 18, 17, 6);
    g.fillStyle(color).fillRoundedRect(9, 19, 14, 13, 5);
    // Head
    g.fillStyle(o).fillCircle(16, 13, 11);
    g.fillStyle(0xffe2c6).fillCircle(16, 13, 9);
    // Hair / hat on top
    g.fillStyle(accent).fillEllipse(15, 7, 18, 9);
    // Eyes (looking right)
    g.fillStyle(o).fillRect(18, 12, 2, 4).fillRect(22, 12, 2, 4);
    // Cheek
    g.fillStyle(0xff9a9a, 0.7).fillRect(13, 17, 3, 2);
    g.generateTexture(key, 32, 36);
    g.destroy();
  }

  /** Town NPC: a hooded robe with a face peeking out. */
  private makeNpc(key: string, color: number): void {
    const g = this.add.graphics();
    const o = COLORS.outline;
    g.fillStyle(o).fillTriangle(16, 4, 3, 36, 29, 36);
    g.fillStyle(color).fillTriangle(16, 7, 6, 34, 26, 34);
    g.fillStyle(o).fillCircle(16, 14, 8);
    g.fillStyle(0xffe2c6).fillCircle(16, 15, 6);
    g.fillStyle(color).fillEllipse(16, 9, 16, 7);
    g.fillStyle(o).fillRect(17, 14, 2, 3).fillRect(21, 14, 2, 3);
    g.generateTexture(key, 32, 36);
    g.destroy();
  }

  private makeShadow(): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillEllipse(14, 5, 28, 10);
    g.generateTexture('shadow', 28, 10);
    g.destroy();
  }

  /** Small triangle that points in the facing direction (useful for aiming attacks). */
  private makeFacingArrow(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.9).fillTriangle(0, 0, 10, 5, 0, 10);
    g.generateTexture('facing', 10, 10);
    g.destroy();
  }

  private makeDust(): void {
    const g = this.add.graphics();
    g.fillStyle(0xd8cde8, 1).fillCircle(4, 4, 4);
    g.generateTexture('dust', 8, 8);
    g.destroy();
  }

  /** A jelly blob enemy with big eyes (looking right). Size depends on radius. */
  private makeBlob(key: string, color: number, accent: number, radius: number): void {
    const w = radius * 2 + 8;
    const h = Math.round(radius * 2.2) + 6;
    const cx = w / 2;
    const g = this.add.graphics();
    // Outline + body (a dome shape: ellipse with a flat-ish bottom)
    g.fillStyle(COLORS.outline).fillEllipse(cx, h * 0.58, radius * 2 + 4, radius * 1.9 + 4);
    g.fillStyle(color).fillEllipse(cx, h * 0.58, radius * 2, radius * 1.9);
    // Shine
    g.fillStyle(accent, 0.9).fillEllipse(cx - radius * 0.4, h * 0.38, radius * 0.6, radius * 0.4);
    // Eyes
    const ey = h * 0.55;
    g.fillStyle(0xffffff).fillCircle(cx + 1, ey, 3.5).fillCircle(cx + radius * 0.6, ey, 3.5);
    g.fillStyle(COLORS.outline).fillCircle(cx + 2, ey, 1.8).fillCircle(cx + radius * 0.6 + 1, ey, 1.8);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  /** Puzzle pieces and collectibles (Step 5). All 32x32 unless noted. */
  private makeProps(): void {
    const O = COLORS.outline;
    const draw = (key: string, w: number, h: number, fn: (g: Phaser.GameObjects.Graphics) => void) => {
      const g = this.add.graphics();
      fn(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    // Door: iron bars in a frame.
    draw('door', 32, 32, (g) => {
      g.fillStyle(0x2a2236).fillRect(0, 0, 32, 32);
      g.fillStyle(0x8a7a9e).fillRect(0, 0, 32, 4).fillRect(0, 28, 32, 4);
      for (let x = 3; x < 32; x += 7) g.fillStyle(O).fillRect(x, 4, 4, 24).fillStyle(0xb8a8cc).fillRect(x + 1, 4, 2, 24);
    });
    // Locked door: wooden with a keyhole plate.
    draw('lockDoor', 32, 32, (g) => {
      g.fillStyle(O).fillRect(0, 0, 32, 32);
      g.fillStyle(0x8a5a2e).fillRect(1, 1, 30, 30);
      g.fillStyle(0x6e4522).fillRect(1, 10, 30, 2).fillRect(1, 21, 30, 2);
      g.fillStyle(0x9fd8ff).fillRoundedRect(10, 9, 12, 14, 3);
      g.fillStyle(O).fillCircle(16, 14, 2.5).fillRect(15, 15, 2, 5);
    });
    // Cracked wall: like a wall face, with visible cracks (a subtle hint!).
    draw('crackedWall', 32, 32, (g) => {
      g.fillStyle(COLORS.wallTop).fillRect(0, 0, 32, 10);
      g.fillStyle(COLORS.wallEdge).fillRect(0, 9, 32, 2);
      g.fillStyle(COLORS.wallFace).fillRect(0, 11, 32, 21);
      g.lineStyle(2, 0x120e18, 0.9);
      g.beginPath().moveTo(8, 12).lineTo(14, 19).lineTo(11, 25).lineTo(17, 31).strokePath();
      g.beginPath().moveTo(14, 19).lineTo(22, 17).lineTo(26, 23).strokePath();
    });
    // Push block: chunky stone with an arrow-ish rune.
    draw('block', 32, 32, (g) => {
      g.fillStyle(O).fillRoundedRect(0, 0, 32, 32, 4);
      g.fillStyle(0x9a8a70).fillRoundedRect(2, 2, 28, 28, 3);
      g.fillStyle(0xbcae92).fillRect(4, 4, 24, 6);
      g.fillStyle(0x6e624e).fillRect(4, 24, 24, 4);
      g.lineStyle(2, 0x6e624e, 1).strokeRect(10, 12, 12, 9);
    });
    // Pressure plate (up / pressed).
    draw('plate', 32, 32, (g) => {
      g.fillStyle(O).fillRoundedRect(3, 5, 26, 24, 4);
      g.fillStyle(0x7a6a8a).fillRoundedRect(5, 5, 22, 20, 3);
      g.fillStyle(0xff7a5a).fillCircle(16, 15, 4);
    });
    draw('platePressed', 32, 32, (g) => {
      g.fillStyle(O).fillRoundedRect(3, 9, 26, 20, 4);
      g.fillStyle(0x5a4c6a).fillRoundedRect(5, 10, 22, 17, 3);
      g.fillStyle(0x7dff8a).fillCircle(16, 18, 4);
    });
    // Crystal (white, tinted per color at runtime).
    draw('crystal', 24, 34, (g) => {
      g.fillStyle(O).fillTriangle(12, 0, 24, 14, 12, 34).fillTriangle(12, 0, 0, 14, 12, 34);
      g.fillStyle(0xffffff).fillTriangle(12, 3, 21, 14, 12, 30).fillTriangle(12, 3, 3, 14, 12, 30);
      g.fillStyle(0xffffff, 0.5).fillTriangle(12, 3, 7, 14, 12, 14);
    });
    // Small gem used in the hint runes.
    draw('gem', 14, 14, (g) => {
      g.fillStyle(O).fillTriangle(7, 0, 14, 7, 7, 14).fillTriangle(7, 0, 0, 7, 7, 14);
      g.fillStyle(0xffffff).fillTriangle(7, 2, 12, 7, 7, 12).fillTriangle(7, 2, 2, 7, 7, 12);
    });
    // Bush.
    draw('bush', 32, 28, (g) => {
      g.fillStyle(O).fillCircle(9, 16, 9).fillCircle(23, 16, 9).fillCircle(16, 10, 10);
      g.fillStyle(0x3f8a3a).fillCircle(9, 16, 7).fillCircle(23, 16, 7).fillCircle(16, 10, 8);
      g.fillStyle(0x6cc060).fillCircle(13, 8, 3).fillCircle(21, 13, 2.5);
    });
    // Coin, star, key (pickups).
    draw('coin', 14, 14, (g) => {
      g.fillStyle(O).fillCircle(7, 7, 7);
      g.fillStyle(0xffd23f).fillCircle(7, 7, 5.5);
      g.fillStyle(0xfff3a0).fillRect(5, 3, 2, 7);
    });
    draw('star', 22, 22, (g) => {
      const pts = (r1: number, r2: number) => {
        const p: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? r1 : r2;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          p.push(new Phaser.Math.Vector2(11 + Math.cos(a) * r, 11 + Math.sin(a) * r));
        }
        return p;
      };
      g.fillStyle(O).fillPoints(pts(11, 5), true);
      g.fillStyle(0xfff27a).fillPoints(pts(9, 4), true);
    });
    draw('key', 22, 12, (g) => {
      g.fillStyle(O).fillCircle(5, 6, 5).fillRect(8, 4, 14, 4).fillRect(16, 7, 3, 5).fillRect(20, 7, 2, 4);
      g.fillStyle(0x9fd8ff).fillCircle(5, 6, 3.5).fillRect(9, 5, 12, 2);
      g.fillStyle(O).fillCircle(5, 6, 1.5);
    });
    // Checkpoint statue.
    draw('checkpoint', 28, 44, (g) => {
      g.fillStyle(O).fillRect(2, 34, 24, 10).fillRect(7, 6, 14, 30);
      g.fillStyle(0x8a8aa0).fillRect(3, 35, 22, 8).fillRect(8, 7, 12, 28);
      g.fillStyle(O).fillTriangle(14, 0, 22, 8, 6, 8);
      g.fillStyle(0xd8f8ff).fillCircle(14, 18, 4);
    });
    // Goal portal.
    draw('portal', 56, 56, (g) => {
      g.lineStyle(5, 0xc07aff, 1).strokeCircle(28, 28, 24);
      g.lineStyle(3, 0x7ad8ff, 0.9).strokeCircle(28, 28, 16);
      g.fillStyle(0xffffff, 0.35).fillCircle(28, 28, 10);
      g.fillStyle(0xffffff).fillRect(26, 4, 4, 8).fillRect(26, 44, 4, 8);
    });
  }

  /** The boss: a hulking rock golem with glowing lava cracks, horns and eyes. 80x84. */
  private makeGolem(key: string, color: number, accent: number): void {
    const O = COLORS.outline;
    const g = this.add.graphics();
    // Horns
    g.fillStyle(O).fillTriangle(14, 26, 26, 22, 8, 2).fillTriangle(66, 26, 54, 22, 72, 2);
    g.fillStyle(0xd8c8b0).fillTriangle(16, 24, 25, 22, 11, 6).fillTriangle(64, 24, 55, 22, 69, 6);
    // Arms (fists)
    g.fillStyle(O).fillCircle(10, 56, 12).fillCircle(70, 56, 12);
    g.fillStyle(color).fillCircle(10, 56, 9.5).fillCircle(70, 56, 9.5);
    // Body
    g.fillStyle(O).fillRoundedRect(14, 18, 52, 62, 14);
    g.fillStyle(color).fillRoundedRect(17, 21, 46, 56, 12);
    g.fillStyle(0x8a5244).fillRoundedRect(20, 24, 40, 14, 6); // brow / head plate
    // Lava cracks
    g.lineStyle(3, accent, 1);
    g.beginPath().moveTo(24, 46).lineTo(32, 54).lineTo(28, 64).lineTo(36, 74).strokePath();
    g.beginPath().moveTo(56, 44).lineTo(48, 56).lineTo(54, 66).strokePath();
    g.beginPath().moveTo(40, 58).lineTo(42, 70).strokePath();
    g.fillStyle(accent).fillCircle(9, 54, 2.5).fillCircle(71, 54, 2.5);
    // Glowing eyes (looking right)
    g.fillStyle(0xfff2a0).fillRect(40, 31, 6, 5).fillRect(51, 31, 6, 5);
    g.fillStyle(accent).fillRect(42, 32, 3, 3).fillRect(53, 32, 3, 3);
    // Feet
    g.fillStyle(O).fillRoundedRect(20, 74, 16, 10, 3).fillRoundedRect(44, 74, 16, 10, 3);
    g.generateTexture(key, 80, 84);
    g.destroy();
  }

  /** A floating flame: round body with flickering tips on top. */
  private makeWisp(key: string, color: number, accent: number, radius: number): void {
    const w = radius * 2 + 8;
    const h = radius * 3 + 6;
    const cx = w / 2;
    const cy = h - radius - 4;
    const g = this.add.graphics();
    // Flame tips (outline then fill)
    g.fillStyle(COLORS.outline).fillTriangle(cx - radius - 2, cy, cx + radius + 2, cy, cx, 0);
    g.fillStyle(color).fillTriangle(cx - radius + 1, cy, cx + radius - 1, cy, cx, 4);
    g.fillStyle(accent).fillTriangle(cx - radius * 0.4, cy, cx + radius * 0.4, cy, cx + 2, cy - radius * 1.4);
    // Body
    g.fillStyle(COLORS.outline).fillCircle(cx, cy, radius + 2);
    g.fillStyle(color).fillCircle(cx, cy, radius);
    g.fillStyle(accent, 0.8).fillCircle(cx - 2, cy + 2, radius * 0.55);
    // Eyes (looking right)
    g.fillStyle(COLORS.outline).fillRect(cx + 1, cy - 2, 2, 4).fillRect(cx + 5, cy - 2, 2, 4);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  /** A sturdy shell: wide dome with plates and little spikes. */
  private makeShell(key: string, color: number, accent: number, radius: number): void {
    const w = radius * 2 + 10;
    const h = Math.round(radius * 1.8) + 8;
    const cx = w / 2;
    const g = this.add.graphics();
    // Spikes
    for (let i = -2; i <= 2; i++) {
      const sx = cx + i * radius * 0.42;
      g.fillStyle(COLORS.outline).fillTriangle(sx - 5, 12, sx + 5, 12, sx, 0);
      g.fillStyle(accent).fillTriangle(sx - 3, 12, sx + 3, 12, sx, 3);
    }
    // Dome
    g.fillStyle(COLORS.outline).fillEllipse(cx, h * 0.6, radius * 2 + 6, radius * 1.6 + 6);
    g.fillStyle(color).fillEllipse(cx, h * 0.6, radius * 2, radius * 1.6);
    // Plates
    g.lineStyle(2, COLORS.outline, 0.6);
    g.strokeEllipse(cx, h * 0.6, radius * 1.2, radius * 0.9);
    g.fillStyle(accent, 0.5).fillEllipse(cx - radius * 0.35, h * 0.45, radius * 0.6, radius * 0.35);
    // Face peeking out (looking right)
    g.fillStyle(0xffffff).fillCircle(cx + radius * 0.55, h * 0.68, 3.5);
    g.fillStyle(COLORS.outline).fillCircle(cx + radius * 0.6, h * 0.68, 1.8);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  /** Textures for attacks: sword slash crescent, spark, and an area ring. */
  private makeCombatFx(): void {
    // Slash: a crescent facing right (angle 0), so we can rotate it to any direction.
    let g = this.add.graphics();
    g.lineStyle(7, 0xffffff, 1).beginPath().arc(20, 32, 24, -1.15, 1.15).strokePath();
    g.lineStyle(3, 0xffffff, 0.6).beginPath().arc(14, 32, 28, -0.9, 0.9).strokePath();
    g.generateTexture('slash', 48, 64);
    g.destroy();

    g = this.add.graphics();
    g.fillStyle(0xffffff).fillRect(0, 0, 6, 6);
    g.generateTexture('spark', 6, 6);
    g.destroy();

    g = this.add.graphics();
    g.lineStyle(5, 0xffffff, 1).strokeCircle(32, 32, 29);
    g.lineStyle(2, 0xffffff, 0.5).strokeCircle(32, 32, 22);
    g.generateTexture('ring', 64, 64);
    g.destroy();

    // Projectiles all point RIGHT (angle 0) and are tinted at runtime.
    g = this.add.graphics();
    g.fillStyle(COLORS.outline).fillRect(0, 2, 14, 4).fillTriangle(12, 0, 18, 4, 12, 8);
    g.fillStyle(0xffffff).fillRect(1, 3, 12, 2).fillTriangle(13, 1, 17, 4, 13, 7);
    g.generateTexture('arrow', 18, 8);
    g.destroy();

    g = this.add.graphics();
    g.fillStyle(COLORS.outline).fillRect(0, 3, 24, 6).fillTriangle(20, 0, 30, 6, 20, 12);
    g.fillStyle(0xffffff).fillRect(1, 4, 22, 4).fillTriangle(21, 1, 28, 6, 21, 11);
    g.fillStyle(0xffffff, 0.4).fillRect(0, 0, 8, 12);
    g.generateTexture('bigArrow', 30, 12);
    g.destroy();

    g = this.add.graphics();
    g.fillStyle(0xffffff, 0.35).fillCircle(8, 8, 8);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 4.5);
    g.generateTexture('bolt', 16, 16);
    g.destroy();

    // Mouse crosshair (drawn by UIScene in place of the OS cursor).
    g = this.add.graphics();
    g.lineStyle(4, COLORS.outline, 0.8).strokeCircle(11, 11, 7);
    g.lineStyle(2, 0xffffff, 1).strokeCircle(11, 11, 7);
    g.fillStyle(0xffffff).fillRect(10, 0, 2, 5).fillRect(10, 17, 2, 5).fillRect(0, 10, 5, 2).fillRect(17, 10, 5, 2);
    g.fillStyle(0xffd23f).fillRect(10, 10, 2, 2);
    g.generateTexture('crosshair', 22, 22);
    g.destroy();
  }
}
