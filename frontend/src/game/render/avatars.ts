import Phaser from 'phaser';

const SUPABASE_URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\/$/, '');
/** Same shape the backend, the game server and the DB constraint accept. */
const AVATAR_PATH = /^[0-9a-f-]{36}\/[0-9a-f]{32}\.webp$/;

/** Public URL of an uploaded avatar, built from a server-provided storage path (never a URL from the wire). */
export const publicAvatarUrl = (path: string): string | null =>
  SUPABASE_URL && AVATAR_PATH.test(path) ? `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}` : null;

const pending = new Map<string, Promise<string | null>>();

/**
 * Loads a profile photo into a `size`×`size` canvas texture and resolves its key (null on failure).
 * The photo is downscaled once with smoothing: nearest-neighbour sampling of a 128px image at
 * portrait size would be noise. Center-cropped to a square.
 */
export const loadAvatarTexture = (scene: Phaser.Scene, url: string, size: number): Promise<string | null> => {
  const key = `avatar_${size}_${url}`;
  if (scene.textures.exists(key)) return Promise.resolve(key);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const p = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (scene.textures.exists(key)) return resolve(key);
      const tex = scene.textures.createCanvas(key, size, size);
      if (!tex) return resolve(null);
      const ctx = tex.context;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      tex.refresh();
      resolve(key);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  }).finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
};
