#!/usr/bin/env python3
"""Optimize only CSS-referenced PNG assets with pixel-identical lossless WebP.

The generated WebP must decode into the exact same RGBA bytes as its source.
Never deletes or edits the source PNG.
"""
from __future__ import annotations
import json
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
READY = ROOT / "static" / "stone-assets" / "ready"
STYLES = [ROOT / "static" / "stone-asset-skin.css", ROOT / "static" / "stone-cockpit.css"]

def main():
    content = {file: file.read_text(encoding="utf-8") for file in STYLES}
    names = sorted({name for css in content.values() for name in
                    re.findall(r"stone-assets/ready/([0-9]{2}_[\w-]+\.png)", css)})
    converted = []
    before = after = 0
    for name in names:
        source = READY / name
        if not source.is_file():
            raise FileNotFoundError(f"CSS references missing asset: {source}")
        result = source.with_suffix(".webp")
        with Image.open(source) as png:
            rgba = png.convert("RGBA")
            rgba.save(result, "WEBP", lossless=True, exact=True, method=4)
            with Image.open(result) as candidate:
                if candidate.size != rgba.size or candidate.convert("RGBA").tobytes() != rgba.tobytes():
                    result.unlink(missing_ok=True)
                    raise ValueError("Lossless pixel/alpha mismatch: " + name)
        size0, size1 = source.stat().st_size, result.stat().st_size
        if size1 >= size0 * .95:
            result.unlink()
            continue
        before += size0
        after += size1
        converted.append({"png": name, "webp": result.name, "bytes_before": size0, "bytes_after": size1})
        for file in STYLES:
            content[file] = content[file].replace("stone-assets/ready/" + name,
                                                  "stone-assets/ready/" + result.name)
    for file, css in content.items():
        file.write_text(css, encoding="utf-8")
    manifest = {"method": "lossless WebP, exact decoded RGBA verified", "files": converted,
                "original_bytes": before, "optimized_bytes": after, "saved_bytes": before - after}
    (ROOT / "static" / "stone-assets" / "optimized-assets.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {len(converted)} optimized images, saved {before-after:,} bytes")

if __name__ == "__main__":
    main()
