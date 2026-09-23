import Phaser from 'phaser';
import './style.css';
import { initServices } from './game/services';
import { BootScene } from './game/scenes/BootScene';
import { TitleScene } from './game/scenes/TitleScene';
import { MatchScene } from './game/scenes/MatchScene';
import { ResultsScene } from './game/scenes/ResultsScene';

const BASE_W = 640;
const BASE_H = 360;

initServices();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: BASE_W,
  height: BASE_H,
  backgroundColor: '#1a1422',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  // Gameplay input goes through our InputManager (device-agnostic); Phaser only handles pointer.
  input: { keyboard: false, gamepad: false, mouse: true, touch: true },
  // Audio is our own WebAudio bus system (game/audio).
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.NONE, width: BASE_W, height: BASE_H, zoom: 1 },
  banner: __DEV_TOOLS__,
  scene: [BootScene, TitleScene, MatchScene, ResultsScene],
});

/** Integer scaling only (Art Bible §1): 1 art pixel = N screen pixels, letterboxed. */
const fit = () => {
  const k = Math.max(1, Math.floor(Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H)));
  game.scale.setZoom(k);
};
window.addEventListener('resize', fit);
fit();

if (__DEV_TOOLS__) {
  // DEV-only handle for manual debugging and browser smoke tests. Not in production builds.
  (window as unknown as { __MAGICLASH_DEV__: unknown }).__MAGICLASH_DEV__ = { game };
}
