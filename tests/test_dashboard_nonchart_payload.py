"""Actual browser applySLTP payload exercised by the isolated backend handler."""
import json
import time

from test_backend_audit import isolated  # Broker APIs and writes all redirected.
import test_dashboard_frontend as frontend


def test_apply_zero_tp_removes_tp_while_zero_sl_remains_breakeven(isolated):
    # Backend fixture patches the shared time module. Align its deterministic
    # clock to the real browser clock for this cross-process integration probe.
    # Source-age unit tests retain their independently frozen clocks.
    from datetime import datetime, timezone
    isolated.clock.now = datetime.now(timezone.utc).timestamp()
    isolated.tick.time = int(isolated.clock.now)
    frontend.DashboardFrontendTests.setUpClass()
    ui = frontend.DashboardFrontendTests('test_position_invalid_numeric_draft_never_posts')
    ui.setUp()
    try:
        ui.load()
        ui.page.locator('#sl-input-101').fill('0')
        ui.page.locator('#tp-input-101').fill('0')
        ui.page.evaluate('applySLTP(101)')
        assert len(ui.mutations) == 1
        payload = json.loads(ui.mutations[0]['body'])
        assert payload == dict(ticket=101, sl_usd=0, remove_tp=True)
        isolated.pos.ticket = 101
        isolated.pos.identifier = 101
        isolated.pos.tp = 4100.
        # Remain compatible with the parent's source-fresh mutation guard.
        isolated.tick.time = int(time.time())
        isolated.tick.time_msc = isolated.tick.time * 1000
        isolated.sym.time = isolated.tick.time
        reply = isolated.client.post('/api/modify_position?account=titan', json=payload)
        assert reply.status_code == 200, reply.text
        sent = isolated.send.call_args.args[0]
        assert sent['sl'] == isolated.pos.price_open
        assert sent['tp'] == 0.
        assert ui.errors == []
    finally:
        ui.tearDown()
        frontend.DashboardFrontendTests.tearDownClass()
