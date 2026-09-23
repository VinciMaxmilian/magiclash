import Phaser from 'phaser';
import { CHARACTERS, validateCharacter } from '@magiclash/shared';
import { registerAllTextures } from '../render/textures';

/** Loading: generates all placeholder textures, validates game data in DEV, then Title. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const g = this.add.graphics();
    g.fillStyle(0x2e3450, 1).fillRect(220, 176, 200, 8);
    g.fillStyle(0xd9a24e, 1).fillRect(222, 178, 40, 4);

    // Next frame so the bar is drawn before the (short) generation work.
    this.time.delayedCall(16, () => {
      if (__DEV_TOOLS__) {
        for (const c of Object.values(CHARACTERS)) {
          const errors = validateCharacter(c);
          if (errors.length) console.error('Invalid character data', errors);
        }
      }
      registerAllTextures(this);
      g.fillStyle(0xd9a24e, 1).fillRect(222, 178, 196, 4);
      this.scene.start('Title');
    });
  }
}
