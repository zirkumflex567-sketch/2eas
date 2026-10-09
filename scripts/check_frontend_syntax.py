#!/usr/bin/env python3
"""Syntax-validate embedded application JavaScript without starting MT5."""
import ast
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
tree = ast.parse((ROOT / "app.py").read_text(encoding="utf-8"))
html = None
for node in tree.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "HTML_CONTENT" for t in node.targets):
        html = ast.literal_eval(node.value)
        break
if html is None:
    raise SystemExit("HTML_CONTENT not found")
blocks = [b for b in re.findall(r"<script\b[^>]*>([\s\S]*?)</script>", html, re.I) if b.strip()]
if not blocks:
    raise SystemExit("No inline JS blocks found")
for idx, block in enumerate(blocks):
    with tempfile.TemporaryDirectory() as directory:
        target = Path(directory) / f"app_inline_{idx}.js"
        target.write_text(block, encoding="utf-8")
        subprocess.run(["node", "--check", str(target)], check=True)
print(f"Inline JavaScript syntax OK ({len(blocks)} blocks)")
