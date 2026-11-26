import type Phaser from 'phaser';
import type { EnemyDef } from '../../data/enemies';
import type { CombatSystem } from '../../systems/CombatSystem';
import type { Enemy } from '../Enemy';
import { ChaserEnemy } from './ChaserEnemy';
import { ShooterEnemy } from './ShooterEnemy';
import { TankEnemy } from './TankEnemy';
import { Boss } from './Boss';

/**
 * Factory: picks the right Enemy subclass for an enemy's `behavior`.
 * To add a new behavior: write a new subclass and add one line here.
 */
export function createEnemy(scene: Phaser.Scene, x: number, y: number, def: EnemyDef, combat: CombatSystem): Enemy {
  switch (def.behavior) {
    case 'chaser':
      return new ChaserEnemy(scene, x, y, def, combat);
    case 'shooter':
      return new ShooterEnemy(scene, x, y, def, combat);
    case 'tank':
      return new TankEnemy(scene, x, y, def, combat);
    case 'boss':
      return new Boss(scene, x, y, def, combat);
  }
}
