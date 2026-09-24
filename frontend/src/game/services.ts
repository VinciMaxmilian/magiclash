import { AudioManager } from './audio/AudioManager';
import { GamepadSource, InputManager, KeyboardSource, type InputSource } from './input/InputManager';
import { TouchSource, hasTouch } from './input/TouchSource';
import { loadSettings, saveSettings, type Settings } from '../ui/settings';

/** Long-lived singletons shared by all scenes (created once in main.ts). */
export interface Services {
  input: InputManager;
  audio: AudioManager;
  settings: Settings;
  saveSettings(): void;
}

let services: Services | null = null;

export const initServices = (): Services => {
  const settings = loadSettings();
  const audio = new AudioManager();
  audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);
  services = {
    input: new InputManager([
      new KeyboardSource(window),
      new GamepadSource(),
      ...(hasTouch() ? [new TouchSource(document.body) as InputSource] : []),
    ]),
    audio,
    settings,
    saveSettings() {
      saveSettings(settings);
      audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);
    },
  };
  return services;
};

export const svc = (): Services => {
  if (!services) throw new Error('services not initialised');
  return services;
};
