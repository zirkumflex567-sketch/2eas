import app


def test_dashboard_shows_user_reported_open_ea_inventory_without_claiming_live_verification():
    html = app.render_dashboard_index().body.decode("utf-8")

    assert 'id="ea-inventory-summary"' in html
    assert "Offene EA-Charts: 6" in html
    assert "XAU_Titan_Pro_BasketGuard" in html
    assert "Marketplace XAUUSD 5 minute" in html
    assert "laut Nutzerangabe" in html
    assert "nicht live bestätigt" in html
