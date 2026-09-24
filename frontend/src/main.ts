import Phaser from 'phaser';
import './style.css';
import { initServices } from './game/services';
import { BootScene } from './game/scenes/BootScene';
import { TitleScene } from './game/scenes/TitleScene';
import { MatchScene } from './game/scenes/MatchScene';
import { ResultsScene } from './game/scenes/ResultsScene';
import { SelectScene } from './game/scenes/SelectScene';
import { AuthScene } from './game/scenes/AuthScene';
import { ProfileScene } from './game/scenes/ProfileScene';
import { OnlineScene } from './game/scenes/OnlineScene';
import { LobbyScene } from './game/scenes/LobbyScene';
import { account } from './services/account';

const BASE_W = 640;
const BASE_H = 360;

initServices();
void account.init(); // restores a saved session (non-blocking)

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
  // Fill the browser window (keeping 16:9). Pixels stay crisp (nearest neighbour); at
  // non-integer scales some art pixels are 1 screen pixel wider — accepted for full-window play.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: BASE_W,
    height: BASE_H,
    fullscreenTarget: 'game',
  },
  banner: __DEV_TOOLS__,
  // HTML inputs (login/profile forms) live in Phaser's DOM layer, scaled with the canvas.
  dom: { createContainer: true },
  scene: [BootScene, TitleScene, SelectScene, MatchScene, ResultsScene, AuthScene, ProfileScene, OnlineScene, LobbyScene],
});

/** F toggles browser fullscreen (must come from a user gesture, so it's a key handler). */
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyF' || e.repeat) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  if (game.scale.isFullscreen) game.scale.stopFullscreen();
  else game.scale.startFullscreen();
});

if (__DEV_TOOLS__) {
  // DEV-only handle for manual debugging and browser smoke tests. Not in production builds.
  (window as unknown as { __MAGICLASH_DEV__: unknown }).__MAGICLASH_DEV__ = { game };
}
