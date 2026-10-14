"""Isolated Nonchart decoration budget. Run directly: no pytest/root hooks."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
BUDGET = 3 * 1024 * 1024


class StoneUiAssets(unittest.TestCase):
    def test_unique_nonchart_payload_is_at_most_three_mib(self):
        manifest_path = ROOT / 'static/stone-assets/ui/manifest.json'
        if manifest_path.exists():
            records = json.loads(manifest_path.read_text())['assets']
            payload = sum((ROOT / row['output']).stat().st_size for row in records)
        else:
            # Real ready files backing only known nonchart UI consumers. No #12,
            #13, #23 or #41-44 chart/volume visualization assets in this budget.
            ids = {1, 2, 3, 7, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20,
                   21, 22, 25, 27, 29, 31, 32, 36, 37, 38, 45, 46, 47, 48, 49}
            files = [p for p in (ROOT / 'static/stone-assets/ready').glob('*.webp')
                     if int(p.name[:2]) in ids]
            self.assertEqual(len(files), len(ids))
            payload = sum(p.stat().st_size for p in files)
        self.assertLessEqual(payload, BUDGET,
                             f'Nonchart UI decoration: {payload:,} > {BUDGET:,} bytes')


    def test_manifest_decodes_preserves_full_geometry_and_alpha(self):
        from hashlib import sha256
        from PIL import Image, ImageChops, ImageStat
        manifest = json.loads((ROOT / 'static/stone-assets/ui/manifest.json').read_text())
        self.assertEqual(len(manifest['assets']), 29)
        self.assertEqual(set(p.name for p in (ROOT / 'static/stone-assets/ui').glob('*.webp')),
                         {Path(r['output']).name for r in manifest['assets']})
        for r in manifest['assets']:
            with self.subTest(asset=r['id']):
                path = ROOT / r['output']
                self.assertEqual(sha256(path.read_bytes()).hexdigest(), r['sha256'])
                self.assertEqual(path.stat().st_size, r['bytes'])
                self.assertLessEqual(r['bytes'], 260000)
                self.assertLess(r['bytes'], r['original_bytes'])
                with Image.open(ROOT / r['source']) as source, Image.open(path) as decoded:
                    decoded.load()
                    self.assertEqual(decoded.format, 'WEBP')
                    self.assertEqual(list(decoded.size), r['size'])
                    self.assertLessEqual(decoded.width, source.width)
                    self.assertEqual(decoded.height, round(source.height * decoded.width/source.width))
                    reference = source.resize(decoded.size, Image.Resampling.LANCZOS).convert('RGBA')
                    result = decoded.convert('RGBA')
                    self.assertIsNone(ImageChops.difference(reference.getchannel('A'), result.getchannel('A')).getbbox(),
                                      'Lossless alpha and unchanged resized silhouette')
                    for color in ((11,20,25,255), (255,255,255,255)):
                        base = Image.new('RGBA', result.size, color)
                        a = Image.alpha_composite(base, reference).convert('RGB')
                        b = Image.alpha_composite(base, result).convert('RGB')
                        rms = ImageStat.Stat(ImageChops.difference(a,b)).rms
                        self.assertLessEqual(max(rms), 5.0, (r['id'], rms))
        sizes = {r['id']:r['size'] for r in manifest['assets']}
        self.assertEqual(sizes[25], [84,84])
        self.assertEqual(sizes[11][0], 224)

    def test_all_originals_unchanged_and_css_is_url_only_positive_allowlist(self):
        from hashlib import sha256
        manifest = json.loads((ROOT / 'static/stone-assets/ui/manifest.json').read_text())
        # Guard immutable source images, not application/CSS evolved by other
        # verified workstreams. Browser test guards excluded chart computed styles.
        for path, digest in manifest['original_sha256'].items():
            if not path.startswith('static/stone-assets/ready/'):
                continue
            with self.subTest(original=path):
                self.assertEqual(sha256((ROOT/path).read_bytes()).hexdigest(), digest)
        css = (ROOT/'static/stone-ui-assets.css').read_text()
        self.assertNotIn('stone-assets/ready/', css)
        blocks = re.findall(r'([^{}]+)\{([^{}]+)\}', re.sub(r'/\*.*?\*/','',css,flags=re.S))
        self.assertTrue(blocks)
        for selector, body in blocks:
            self.assertTrue(selector.strip().startswith('body.theme-stone'))
            self.assertIsNone(re.search(r'(?:\.stone-chart|\.chart-|#tv-chart|\.cs-|#cs-|--chart|--volume|#vp-|\.stone-side|\.stone-mini)', selector))
            for prop in re.findall(r'([\w-]+)\s*:', body):
                self.assertIn(prop, ('background-image','background-size','border-image-source','border-image-slice'))
        names = set(re.findall(r'stone-assets/ui/([\w.]+)',css))
        self.assertEqual(names, {Path(r['output']).name for r in manifest['assets']})
        self.assertNotIn(12, {r['id'] for r in manifest['assets']})
        for r in manifest['assets']:
            self.assertTrue(r['uses'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
