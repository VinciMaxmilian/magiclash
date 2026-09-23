"""Avatar upload validation (docs/SECURITY.md).

Nothing the client sends is trusted: size limit, extension allow-list, magic bytes, a real
decode by Pillow (with a pixel bomb guard), dimension limits, and finally a RE-ENCODE to a
fresh WebP. The stored file is always our own encoding — metadata, polyglot payloads or
scripts embedded in the upload never survive. The name is random, never the user's.
"""

from __future__ import annotations

import io
import uuid
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

MAX_BYTES = 512 * 1024
MAX_SIDE = 1024
OUTPUT_SIZE = 128
ALLOWED_EXTENSIONS = {".png", ".webp"}

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class AvatarError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ProcessedAvatar:
    data: bytes
    content_type: str
    filename: str


def sniff_format(data: bytes) -> str | None:
    if data.startswith(PNG_MAGIC):
        return "png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def process_avatar(data: bytes, original_name: str | None) -> ProcessedAvatar:
    if len(data) == 0:
        raise AvatarError("empty_file")
    if len(data) > MAX_BYTES:
        raise AvatarError("file_too_large")

    name = (original_name or "").lower()
    ext = name[name.rfind(".") :] if "." in name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise AvatarError("bad_extension")

    fmt = sniff_format(data)
    if fmt is None or f".{fmt}" != ext:
        raise AvatarError("bad_content")

    Image.MAX_IMAGE_PIXELS = MAX_SIDE * MAX_SIDE  # decompression-bomb guard
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(data)) as img:
            if img.format is None or img.format.lower() != fmt:
                raise AvatarError("bad_content")
            w, h = img.size
            if w < 16 or h < 16 or w > MAX_SIDE or h > MAX_SIDE:
                raise AvatarError("bad_dimensions")
            img = img.convert("RGBA")
            # Center-crop to square, then nearest-neighbour resize (keeps pixel art crisp).
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            img = img.crop((left, top, left + side, top + side)).resize(
                (OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.NEAREST
            )
            out = io.BytesIO()
            img.save(out, format="WEBP", lossless=True)
    except AvatarError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError, ValueError):
        raise AvatarError("bad_content") from None

    return ProcessedAvatar(data=out.getvalue(), content_type="image/webp", filename=f"{uuid.uuid4().hex}.webp")
