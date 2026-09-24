"""Asset pipeline step for the Higgsfield backdrops (docs/ASSETS.md §10).

Takes the raw 2048x1152 generations in assets-raw/higgsfield/, reduces them to the game's
native resolution (plus the parallax margin of the layer) and quantizes them to the master
palette with a 2x2 ordered dither (the only dither the art bible allows, and only on far
backgrounds). Output: indexed PNGs in frontend/src/assets/backdrops/.

    python tools/process_backdrops.py        # needs Pillow (already in backend/requirements.txt)
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets-raw" / "higgsfield"
OUT = ROOT / "frontend" / "src" / "assets" / "backdrops"

# Keep in sync with frontend/src/game/render/palette.ts (team ramps are for fighters only).
PALETTE = [
    0x1A1422,
    0x2E3450, 0x4A5578, 0x7D8AA8, 0xB7C2D6, 0xEEF2F7,
    0x6B3F2A, 0xA8683A, 0xD9A24E, 0xF2D27A,
    0x3B2420, 0x5E3A2B, 0x8A5A3C, 0xB5825A,
    0x6E3B33, 0xA8634E, 0xD99A7A, 0xF2C8A4,
    0x2A2733, 0x403C4C, 0x5B5668, 0x7B7588, 0xA29CAB,
    0x1F3328, 0x2F4F35, 0x4D7040, 0x7A9A4F,
    0x3A2518, 0x5C3A22, 0x86582F, 0xB07D45,
    0x1F1B3A, 0x332A5C, 0x5A3F7A, 0x8F5B8C, 0xCC7A86, 0xEEA57E, 0xFCD49A,
    0x5A1A10, 0xB8361E, 0xEE6A26, 0xFBB03B, 0xFFF1A8,
    0x1A3552, 0x2F6FA0, 0x5FB4DE, 0xA8E4F5, 0xEAFCFF,
    0x3B2A7A, 0x6A5AE0, 0xA8A0FF, 0xE8E4FF, 0xFFFBE0,
    0xFFFFFF,
]
RGB = [((c >> 16) & 255, (c >> 8) & 255, c & 255) for c in PALETTE]

VIEW_W, VIEW_H = 640, 360
PAN_X, PAN_Y = 110, 90  # castleCourtyardArt.ts


def margins(sf: float) -> tuple[int, int]:
    """Same as `margins()` in castleCourtyardArt.ts."""
    return math.ceil(PAN_X * sf) + 8, math.ceil(PAN_Y * sf) + 8


# output name -> (raw file, parallax scroll factor; 0 = fixed full screen)
JOBS = {
    "castle_courtyard": ("castelo.png", 0.05),
    "enchanted_forest": ("elder_forest.png", 0.05),
    "frozen_fortress": ("ice_castle.png", 0.05),
    "wizard_tower": ("dark_reign.png", 0.05),
    "ancient_ruins": ("old_ruins.png", 0.05),
    "volcanic_keep": ("vulcan.png", 0.05),
    "title": ("wizard_tower.png", 0),
}

BAYER = [[0, 2], [3, 1]]
DITHER_STRENGTH = 10  # rgb units; small, so only near-ties between two ramp colors dither


def nearest(rgb: tuple[int, int, int], cache: dict) -> int:
    hit = cache.get(rgb)
    if hit is None:
        r, g, b = rgb
        # weighted distance (eye is most sensitive to green)
        hit = min(range(len(RGB)), key=lambda i: 2 * (RGB[i][0] - r) ** 2 + 4 * (RGB[i][1] - g) ** 2 + 3 * (RGB[i][2] - b) ** 2)
        cache[rgb] = hit
    return hit


def process(src: Path, w: int, h: int) -> Image.Image:
    im = Image.open(src).convert("RGB")
    scale = max(w / im.width, h / im.height)
    rw, rh = round(im.width * scale), round(im.height * scale)
    im = im.resize((rw, rh), Image.Resampling.BOX)
    left, top = (rw - w) // 2, (rh - h) // 2
    im = im.crop((left, top, left + w, top + h))

    px = im.load()
    out = Image.new("P", (w, h))
    flat = []
    for c in RGB:
        flat.extend(c)
    out.putpalette(flat)
    opx = out.load()
    cache: dict = {}
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            d = (BAYER[y & 1][x & 1] / 3 - 0.5) * DITHER_STRENGTH
            q = lambda v: max(0, min(255, int(v + d)))
            opx[x, y] = nearest((q(r), q(g), q(b)), cache)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (raw, sf) in JOBS.items():
        mx, my = margins(sf) if sf else (0, 0)
        img = process(RAW / raw, VIEW_W + 2 * mx, VIEW_H + 2 * my)
        dst = OUT / f"{name}.png"
        img.save(dst, optimize=True)
        print(f"{raw:>18} -> {dst.relative_to(ROOT)} {img.size} {dst.stat().st_size // 1024} KiB")


if __name__ == "__main__":
    main()
