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
    # Preserve successful earlier conversions on subsequent idempotent builds.
    # Otherwise a no-op run would erase all accumulated savings evidence.
    manifest_path = ROOT / "static" / "stone-assets" / "optimized-assets.json"
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    by_name = {item["png"]: item for item in previous.get("files", [])}
    by_name.update({item["png"]: item for item in converted})
    for item in by_name.values():
        if not (READY / item["png"]).is_file() or not (READY / item["webp"]).is_file():
            raise FileNotFoundError(f"Optimized Stone pair missing: {item['png']}")
        with Image.open(READY / item["png"]) as original, Image.open(READY / item["webp"]) as optimized:
            if original.convert("RGBA").tobytes() != optimized.convert("RGBA").tobytes():
                raise ValueError(f"Existing WebP RGBA mismatch: {item['png']}")
    files = [by_name[name] for name in sorted(by_name)]
    manifest = {"method": "lossless WebP, exact decoded RGBA verified", "files": files,
                "original_bytes": sum(item["bytes_before"] for item in files),
                "optimized_bytes": sum(item["bytes_after"] for item in files),
                "saved_bytes": sum(item["bytes_before"] - item["bytes_after"] for item in files)}
    rendered = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    if not manifest_path.exists() or manifest_path.read_text(encoding="utf-8") != rendered:
        manifest_path.write_text(rendered, encoding="utf-8")
    print(f"Verified {len(files)} optimized images, saved {manifest['saved_bytes']:,} bytes")

if __name__ == "__main__":
    main()
