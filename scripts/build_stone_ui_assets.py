"""Build only nonchart copies; never touch ready/source or original CSS.
Run: python scripts/build_stone_ui_assets.py (Pillow 12.1.1).
"""
from hashlib import sha256
import json
from pathlib import Path


from PIL import Image, ImageChops, ImageStat, __version__ as pillow_version

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'static/stone-assets/ui'
# Width caps follow CSS usage. Whole images resize proportionally, never crop.
WIDTHS = {1:768, 2:768, 3:640, 7:768, 9:768, 10:768,
          11:224, 14:1024, 15:1369, 16:768, 17:1024, 18:1024,
          19:1024, 20:1024, 21:264, 22:316, 25:84, 27:196,
          29:216, 31:640, 32:640, 36:512, 37:768, 38:768,
          45:640, 46:640, 47:1024, 48:768, 49:768}
N = 'body.theme-stone '
# Positive allowlist: no broad glass-card/button selector can match the plot.
CARD = N + '.glass-card:where(nav.stone-asset-nav, header.stone-asset-header, ' + ', '.join(
    '.stone-asset-panel--' + n for n in ('diagnostic','matrix','guard','positions','journal')) + ', #dd-reset-modal .glass-card)'
PANEL = N + '.stone-asset-panel:where(.stone-asset-panel--diagnostic, .stone-asset-panel--matrix, .stone-asset-panel--guard, .stone-asset-panel--positions, .stone-asset-panel--journal)'


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def originals():
    paths = list((ROOT / 'static/stone-assets/ready').glob('*'))
    paths += list((ROOT / 'static/stone-assets/source').glob('*'))
    paths += list((ROOT / 'static').glob('stone*.css'))
    paths += [ROOT / 'app.py']
    return {p.relative_to(ROOT).as_posix(): digest(p) for p in sorted(paths)
            if p.is_file() and p.name != 'stone-ui-assets.css'}


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / 'manifest.json'
    baseline = originals()
    if manifest_path.exists():
        saved = json.loads(manifest_path.read_text())['original_sha256']
        if saved != baseline:
            raise RuntimeError('Original hashes changed: refusing to bless new baseline')
    records, rules = {}, []
    ready = ROOT / 'static/stone-assets/ready'
    for asset_id, width in WIDTHS.items():
        source, = ready.glob(f'{asset_id:02d}_*.webp')
        with Image.open(source) as original:
            width = min(width, original.width)
            size = (width, round(original.height * width / original.width))
            reference = original.resize(size, Image.Resampling.LANCZOS)
            output = OUT / source.name
            # High quality is adaptive by size/use, alpha is losslessly encoded.
            quality = 95 if asset_id in (11,25,27,29) else (85 if asset_id in (1,2,3,7,9,10) else 92)
            reference.save(output, 'WEBP', quality=quality, method=6, exact=True,
                           lossless=asset_id in (11,25))
            with Image.open(output) as decoded:
                decoded.load()
                rms = ImageStat.Stat(ImageChops.difference(
                    reference.convert('RGBA'), decoded.convert('RGBA'))).rms
            records[asset_id] = {'id':asset_id, 'source':source.relative_to(ROOT).as_posix(),
                'output':output.relative_to(ROOT).as_posix(), 'original_bytes':source.stat().st_size,
                'bytes':output.stat().st_size, 'original_size':list(original.size),
                'size':list(size), 'mode':reference.mode, 'quality':quality,
                'lossless':asset_id in (11,25),
                'sha256':digest(output), 'rgba_rms':rms, 'uses':[]}

    def url(i):
        return f'url("stone-assets/ui/{Path(records[i]["output"]).name}")'

    def add(selector, property_name, value, ids=()):
        rules.append(f'{selector} {{\n  {property_name}: {value} !important;\n}}')
        for i in ids:
            records[i]['uses'].append({'selector':selector,'property':property_name})

    def background(selector, value, ids):
        add(selector, 'background-image', value, ids)

    def border(selector, i, slices):
        # Numeral nine-slice coordinates must scale with the image, not CSS widths.
        # Percentages avoid Chromium rounding fractional numeric slices to pixels.
        dimensions = records[i]['original_size']
        scaled = [v * 100 / dimensions[1 if j % 2 == 0 else 0] for j,v in enumerate(slices)]
        add(selector, 'border-image-source', url(i), (i,))
        add(selector, 'border-image-slice', ' '.join(f'{v:.8f}%' for v in scaled))

    background('body.theme-stone', 'radial-gradient(ellipse 88% 72% at 49% -19%, rgba(24, 133, 166, .27), transparent 77%), linear-gradient(90deg, rgba(1, 4, 7, .85) 0, rgba(5, 9, 13, .35) 13%, rgba(4, 9, 13, .20) 82%, rgba(1, 4, 7, .9)), ' + url(1), (1,))
    background('body.theme-stone::before',url(10),(10,))
    background(CARD, 'linear-gradient(175deg, rgba(38, 56, 63, .85), rgba(7, 15, 21, .93) 31%, rgba(7, 13, 19, .94) 78%, rgba(29, 39, 42, .93)), ' + url(2),(2,))
    background(CARD+'::before',url(27)+', '+url(27),(27,))
    background(N+'nav.stone-asset-nav','linear-gradient(95deg, rgba(8, 21, 27, .91), rgba(16, 26, 32, .96) 51%, rgba(8, 17, 23, .94)), '+url(7),(7,))
    border(N+'nav.stone-asset-nav',15,[130,160,130,160])
    background(N+'header.stone-asset-header','linear-gradient(95deg, rgba(5,19,28,.89), rgba(15,25,30,.96) 52%, rgba(40,28,21,.90)), '+url(9),(9,))
    border(N+'header.stone-asset-header',15,[135,165,130,165])
    background(N+'header.stone-asset-header .stone-cockpit-crest',url(25),(25,))
    border(N+'nav.stone-asset-nav .account-tab',37,[75,75,75,75])
    add(N+'nav.stone-asset-nav .account-tab','border-image-slice',f'{75/542*100:.8f}% {75/1296*100:.8f}% {75/542*100:.8f}% {75/1296*100:.8f}% fill')
    border(N+'nav.stone-asset-nav .account-tab[aria-pressed="true"]',38,[75,75,75,75])
    # Selected artwork has a different aspect ratio, so preserve all four slices.
    add(N+'nav.stone-asset-nav .account-tab[aria-pressed="true"]','border-image-slice',f'{75/420*100:.8f}% {75/1356*100:.8f}% {75/420*100:.8f}% {75/1356*100:.8f}% fill')
    background(N+'header.stone-asset-header .ticker-bg','linear-gradient(180deg, rgba(4,12,18,.9), rgba(17,28,34,.97)), '+url(7),(7,))
    background(N+'nav.stone-asset-nav .ticker-bg','linear-gradient(180deg, rgba(4,12,18,.9), rgba(17,28,34,.97)), '+url(7),(7,))
    background(PANEL+' .ticker-bg','linear-gradient(180deg, rgba(4,12,18,.9), rgba(17,28,34,.97)), '+url(7),(7,))
    background(N+'#dd-reset-modal .ticker-bg','linear-gradient(180deg, rgba(4,12,18,.9), rgba(17,28,34,.97)), '+url(7),(7,))
    diagnostic=N+'.stone-asset-panel--diagnostic'
    background(diagnostic,'linear-gradient(rgba(9,17,22,.87),rgba(9,17,22,.94)), '+url(9),(9,))
    border(diagnostic,16,[125,140,125,140])
    background(diagnostic+' .stone-edge-light',url(29),(29,))
    background(diagnostic+'::before',url(11),(11,))
    border(N+'.stone-asset-panel--matrix',19,[150,180,155,180])
    background(N+'.stone-asset-panel--matrix','linear-gradient(180deg, rgba(3,12,18,.96), rgba(8,19,24,.96)), '+url(3),(3,))
    for name,i,slices in [('guard',20,[100,120,100,120]),('positions',17,[155,140,150,140]),('journal',18,[135,160,130,160])]:
        border(N+'.stone-asset-panel--'+name,i,slices)
    background(diagnostic+' #sell-bar',url(45),(45,))
    background(diagnostic+' #buy-bar',url(46),(46,))
    background(N+'.stone-asset-panel--positions input[type=number]',url(36),(36,))
    background(N+'#dd-reset-modal #dd-reset-input',url(36),(36,))
    background(PANEL+' button:not([disabled])','linear-gradient(rgba(7,17,23,.22),rgba(7,17,23,.22)), '+url(31),(31,))
    background(N+'header.stone-asset-header .stone-theme-dock button','linear-gradient(rgba(7,17,23,.22),rgba(7,17,23,.22)), '+url(31),(31,))
    background(N+'nav.stone-asset-nav .stone-theme-dock button','linear-gradient(rgba(7,17,23,.22),rgba(7,17,23,.22)), '+url(31),(31,))
    background(N+'header.stone-asset-header #dd-reset-button','linear-gradient(rgba(7,17,23,.22),rgba(7,17,23,.22)), '+url(31),(31,))
    background(PANEL+' button.bg-blue-600',url(32),(32,))
    background(N+'header.stone-asset-header .stone-theme-dock button[aria-pressed="true"]',url(32),(32,))
    background(N+'nav.stone-asset-nav .stone-theme-dock button[aria-pressed="true"]',url(32),(32,))
    # The source button uses its active texture at intrinsic 1255x542 CSS px.
    # The downscaled copy must keep that scale or its crop shifts visibly.
    add(N+'header.stone-asset-header .stone-theme-dock button[aria-pressed="true"]','background-size','1255px 542px')
    add(N+'nav.stone-asset-nav .stone-theme-dock button[aria-pressed="true"]','background-size','1255px 542px')
    border(N+'#dd-reset-modal .glass-card',49,[145]*4)
    background(N+'#dd-reset-modal .glass-card','linear-gradient(rgba(10,18,25,.97),rgba(6,14,19,.97)), '+url(2),(2,))
    background(N+'#stone-rails .left',url(21),(21,))
    background(N+'#stone-rails .right',url(22),(22,))
    border(N+'header.stone-asset-header .stone-theme-dock',15,[130,160,130,160])
    border(N+'nav.stone-asset-nav .stone-theme-dock',15,[130,160,130,160])
    gradients=[('.53','.85','.88','.56'),('.53','.87','.90','.54'),('.57','.89','.89','.57'),('.52','.87','.89','.55'),('.53','.87','.9','.57')]
    for row,(i,(a,b,c,d)) in enumerate(zip((47,48,17,14,20),gradients)):
        background(N+f'.stone-asset-panel--matrix #matrix-tbody tr.stone-target-row--{row}',f'linear-gradient(90deg,rgba(2,10,17,{a}),rgba(3,11,18,{b}) 17%,rgba(3,11,18,{c}) 79%,rgba(2,10,17,{d})), '+url(i),(i,))
    css='/* GENERATED by scripts/build_stone_ui_assets.py. Load AFTER stone-asset-skin.css.\n * URL layers and proportional nine-slice coordinates only; positive nonchart allowlist.\n * Original textures may remain requested by independent visualization consumers. */\n'+ '\n'.join(rules)+'\n'
    (ROOT/'static/stone-ui-assets.css').write_text(css,encoding='utf-8')
    manifest={'schema':1,'pillow':pillow_version,'budget_bytes':3*1024*1024,
        'resize':'full-image proportional LANCZOS; no cropping; no upscaling',
        'original_sha256':baseline,'assets':list(records.values()),
        'original_unique_bytes':sum(r['original_bytes'] for r in records.values()),
        'optimized_unique_bytes':sum(r['bytes'] for r in records.values())}
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:manifest[k] for k in ('original_unique_bytes','optimized_unique_bytes','budget_bytes')},indent=2))


if __name__ == '__main__':
    build()
