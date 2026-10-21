import app as dashboard


def test_native_v5_preview_is_off_by_default_and_bundle_stays_lazy(monkeypatch):
    monkeypatch.delenv("CHART_STUDIO_V5_PREVIEW_ENABLED", raising=False)
    html = dashboard.render_dashboard_index().body.decode("utf-8")

    assert "window.CHART_STUDIO_V5_PREVIEW_ENABLED = false;" in html
    assert 'id="chart-v5-preview-btn"' in html
    assert 'id="chart-v5-preview-btn" aria-controls="chart-v5-preview-panel"' in html
    assert 'id="chart-v5-trend-btn" aria-pressed="false" disabled' in html
    assert 'id="chart-v5-ray-btn" aria-pressed="false" disabled' in html
    assert 'id="chart-v5-drawing-status" role="status" aria-live="polite"' in html
    assert "<script src=\"static/chart-studio-v5.js\"" not in html
    assert "https://www.tradingview.com/" in html


def test_native_v5_preview_requires_exact_private_opt_in(monkeypatch):
    monkeypatch.setenv("CHART_STUDIO_V5_PREVIEW_ENABLED", "1")
    assert "window.CHART_STUDIO_V5_PREVIEW_ENABLED = true;" in dashboard.render_dashboard_index().body.decode("utf-8")

    monkeypatch.setenv("CHART_STUDIO_V5_PREVIEW_ENABLED", "true")
    assert "window.CHART_STUDIO_V5_PREVIEW_ENABLED = false;" in dashboard.render_dashboard_index().body.decode("utf-8")


def test_bundled_v5_asset_has_pinned_license_and_dependency_notices():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    bundle = (root / "static/chart-studio-v5.js").read_text(encoding="utf-8")
    notice = (root / "static/chart-studio-v5-NOTICE.txt").read_text(encoding="utf-8")
    license_text = (root / "static/chart-studio-v5-LICENSE.txt").read_text(encoding="utf-8")
    dependency_text = (root / "static/chart-studio-v5-THIRD-PARTY-LICENSES.txt").read_text(encoding="utf-8")

    assert "ChartStudioV5" in bundle
    assert "TradingView Lightweight Charts™" in notice
    assert "Copyright 2023 TradingView, Inc." in license_text
    assert "fancy-canvas 2.1.0 — MIT License" in dependency_text
    assert "tslib portions — BSD Zero Clause License" in dependency_text
