#!/usr/bin/env python3
"""Build deployable stone/UI assets from the 50 JPGs uploaded to the repository.

Usage:
    pip install pillow numpy opencv-python-headless
    python scripts/process_stone_assets.py

IMPORTANT:
  - Does not overwrite the source JPGs.
  - Keeps ten materials and the chart surface opaque.
  - Attempts transparent cutouts ONLY on eligible artwork, never on textures.
  - Heuristic cutouts are flagged for manual review; low-confidence cutouts
    must not replace the original until visually approved.
  - Writes five contact sheets and a processing manifest.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
STONES = ROOT / "static" / "stone-assets"
SOURCE = STONES / "source"
READY = STONES / "ready"
PREVIEWS = READY / "previews"
MANIFEST = STONES / "asset-manifest.json"
REVIEW_ALL = {11, 12, 13, 17, 18, 19, 26, 35}
HOLE_IDS = {12, 13, 19}
GLOW_IDS = {21, 22, 23, 24, 29, 42, 43, 45, 46}
FLAGGED = []


def edge_seeded_mask(candidates: np.ndarray) -> np.ndarray:
    """Keep only candidate regions actually connected to the canvas perimeter."""
    candidates = np.asarray(candidates, dtype=np.uint8)
    count, labels = cv2.connectedComponents(candidates, connectivity=4)
    if count <= 1:
        return np.zeros_like(candidates, dtype=np.bool_)
    edge = np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1]))
    selected = np.unique(edge)
    selected = selected[selected != 0]
    return np.isin(labels, selected)


def get_corner_palette(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    pad = max(6, min(h, w) // 25)
    regions = [
        img[:pad, :pad], img[:pad, -pad:],
        img[-pad:, :pad], img[-pad:, -pad:]
    ]
    return np.median(np.concatenate([r.reshape(-1, 3) for r in regions]), axis=0)


def cutout(img: np.ndarray, asset_id: int):
    """Make a *conservative* foreground alpha mask from uniform corner background.

    Handles both black/grey staged JPG backgrounds and baked checkerboard JPGs.
    It never assumes a JPEG checkerboard already represents alpha.
    """
    arr = img.astype(np.float32)
    h, w = arr.shape[:2]
    bg = get_corner_palette(img).astype(np.float32)
    spread = arr.max(axis=2) - arr.min(axis=2)
    light = arr.mean(axis=2)
    is_checker = bool((bg.mean() > 130) and (bg.max()-bg.min() < 20))
    bg_difference = np.max(np.abs(arr-bg[None,None,:]), axis=2)

    if is_checker:
        # Printed white/light-grey "transparency" pixels, not alpha.
        candidates = (light > 148) & (spread < 30)
        # Some generated checkerboard squares are mid-grey.
        candidates |= (light > 124) & (spread < 9)
        mode = "baked-checkerboard"
    elif bg.mean() < 75:
        # Dark studio or black background, possibly with slight noise/vignette.
        candidates = (bg_difference < 34) | ((light < 32) & (spread < 22))
        mode = "dark-matte"
    else:
        candidates = bg_difference < 34
        mode = "solid-matte"

    background = edge_seeded_mask(candidates)
    if asset_id in HOLE_IDS:
        # Remove only low-contrast, connected dark openings in the center
        # of the chart/profile frames; never cut into bright stone margins.
        cy, cx = h//2, w//2
        center_patch = arr[max(0,cy-4):cy+5, max(0,cx-4):cx+5]
        center_color = np.median(center_patch.reshape(-1, 3), axis=0)
        center_diff = np.max(np.abs(arr-center_color[None,None,:]), axis=2)
        hole_candidates = (center_diff < 24) & (light < 98)
        labels_count, labels = cv2.connectedComponents(
            hole_candidates.astype(np.uint8), connectivity=4
        )
        if labels_count > 1:
            center_label = int(labels[cy,cx])
            if center_label:
                hole = labels == center_label
                # Reject a falsely identified tiny patch/whole canvas.
                f = float(hole.mean())
                if 0.04 < f < 0.82:
                    background |= hole

    # Conserve dense glows; use intensity as natural alpha over matte.
    if asset_id in GLOW_IDS and not is_checker:
        base_luminance = float(bg.mean())
        brightness = np.max(arr,axis=2)
        a = np.clip((brightness - base_luminance - 6) * 5.2,0,255)
        # Separate dark background even if the artifact contains black RGB.
        alpha = np.uint8(a)
        alpha[background] = 0
        # Above method is intended for emissive-only overlays.
    else:
        alpha = np.where(background,0,255).astype(np.uint8)
        # Mild 1.1 px antialias to avoid harsh JPG keying on diagonal edges.
        alpha = cv2.GaussianBlur(alpha,(0,0),1.1)

    return alpha,mode


def crop_rgba(arr: np.ndarray, alpha: np.ndarray):
    ys, xs = np.where(alpha > 9)
    if not len(xs):
        return Image.fromarray(np.dstack((arr,alpha)), "RGBA"), 1.0
    h,w=alpha.shape
    pad=max(4, int(min(h,w)*.012))
    left=max(0,int(xs.min())-pad)
    right=min(w,int(xs.max())+pad+1)
    top=max(0,int(ys.min())-pad)
    bottom=min(h,int(ys.max())+pad+1)
    return Image.fromarray(np.dstack((arr[top:bottom,left:right],
                                      alpha[top:bottom,left:right])),"RGBA"), \
           float(np.mean(alpha < 18))


def compose_contact_sheet(items, output: Path, group: int):
    """Create 2x5 image sheet (rendered on chessboard) for actual QA."""
    W,H=360,235
    sheet=Image.new("RGB",(W*2,H*5),(12,18,25))
    d=ImageDraw.Draw(sheet)
    for slot,item in enumerate(items):
        img=Image.open(item["output"]).convert("RGBA")
        thumb=img.copy()
        thumb.thumbnail((W-24,H-60),Image.Resampling.LANCZOS)
        col,row=slot%2,slot//2
        x,y=col*W,row*H
        # Synthetic checkerboard is for viewing transparency, not the asset itself.
        d.rectangle((x,y,x+W-1,y+H-1),outline=(84,107,116),width=1)
        checker=Image.new("RGB",(W-20,H-55),(36,41,48))
        cd=ImageDraw.Draw(checker)
        for yy in range(0,checker.height,16):
            for xx in range(0,checker.width,16):
                if (xx//16+yy//16)%2:
                    cd.rectangle((xx,yy,xx+15,yy+15),fill=(65,71,78))
        bx=x+10+(checker.width-thumb.width)//2
        by=y+8+(checker.height-thumb.height)//2
        sheet.paste(checker,(x+10,y+8))
        sheet.paste(thumb,(bx,by),thumb)
        d.text((x+10,y+H-41),f'{item["id"]:02d} {item["basename"][:31]}',fill=(205,222,233))
        d.text((x+10,y+H-24),f'{item["mode"]} | alpha={item["transparent_pct"]:.0f}% | {item["size"]}',fill=(120,174,193))
    output.parent.mkdir(parents=True,exist_ok=True)
    sheet.save(output,quality=86,optimize=True)


def main():
    data=json.loads(MANIFEST.read_text(encoding="utf-8"))
    if len(data["assets"]) != 50:
        raise ValueError("Expected exactly 50 mapped assets.")
    READY.mkdir(parents=True,exist_ok=True)
    PREVIEWS.mkdir(parents=True,exist_ok=True)
    processed=[]
    for entry in data["assets"]:
        idx=int(entry["id"])
        name=entry["basename"]
        src=ROOT/entry["target"]
        if not src.exists():
            raise FileNotFoundError(src)
        im=Image.open(src).convert("RGB")
        arr=np.array(im)
        if entry["background"]=="keep-opaque":
            outfile=READY/f"{name}.webp"
            im.save(outfile,"WEBP",quality=91,method=6)
            mode="opaque-webp"
            transparent=0.0
        else:
            alpha,mode=cutout(arr,idx)
            rgba,masked_fraction=crop_rgba(arr,alpha)
            outfile=READY/f"{name}.png"
            rgba.save(outfile,"PNG",optimize=True)
            transparent=float(masked_fraction*100)
            if transparent < 2 or transparent > 96:
                FLAGGED.append(f"{idx:02d} unexpected transparent fraction {transparent:.1f}%")
        processed.append({
            "id":idx,"basename":name,
            "source":entry["target"],
            "output":str(outfile.relative_to(ROOT)).replace(os.sep,"/"),
            "mode":mode,"transparent_pct":round(transparent,2),
            "size":f"{im.width}x{im.height}",
            "output_bytes":outfile.stat().st_size,
            "manual_review":idx in REVIEW_ALL,
        })
        print(f'{idx:02d} {name}: {mode}, transparency={transparent:.1f}%')

    for group in range(5):
        chunk=processed[group*10:group*10+10]
        compose_contact_sheet(chunk,PREVIEWS/f"pack_{group+1:02d}.jpg",group)

    report={
        "count":len(processed),
        "reference_file_not_transformed":data.get("reference",[]),
        "notice":"HEURISTIC BACKGROUND REMOVAL: inspect five contact sheets before production. Existing source JPGs are unchanged.",
        "automatic_warnings":FLAGGED,
        "assets":processed,
    }
    (READY/"processing-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Done:",len(processed),"processed; flags:",len(FLAGGED))


if __name__=="__main__":
    main()
