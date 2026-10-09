"""Cross-workstream tests exercise production HTML with broker-free fixtures."""
import copy
from test_dashboard_frontend import DashboardFrontendTests, journal
from playwright.sync_api import expect

class DashboardIntegrationTests(DashboardFrontendTests):
    # Avoid rediscovering inherited test cases as duplicates.
    pass

# Only these integration tracer bullets run on this class.
for _name in list(vars(DashboardFrontendTests)):
    if _name.startswith('test_'):
        setattr(DashboardIntegrationTests,_name,None)

def _unknown_entry_and_net_never_crash_or_look_like_zero(self):
    self.load()
    payload=journal('titan')
    payload['journal'][0].update(open_price=None,profit_usd=None,net_profit_usd=None,net_complete=False,points=None,type=None)
    self.page.evaluate('(p)=>{journalEntriesByAccount={titan:p.journal,goldm15:[]};journalFilter="titan";journalLoadedMode="titan";journalErrors=[];renderJournal();}',payload)
    expect(self.page.locator('#journal-total-pnl')).to_contain_text('—')
    expect(self.page.locator('#journal-list')).to_contain_text('unbekannt')
    self.assertEqual(self.errors,[])

def _status_uses_light_payload_contract(self):
    self.load()
    status_requests=[u for u in self.requests if '/api/status' in u]
    self.assertTrue(status_requests)
    self.assertTrue(all('include_journal=false' in u for u in status_requests))

def _asset_override_is_installed_before_readability_layer(self):
    self.load()
    sheets=self.page.evaluate('Array.from(document.querySelectorAll("link[rel=stylesheet]")).map(e=>e.getAttribute("href"))')
    self.assertIn('static/stone-ui-assets.css',sheets)
    self.assertLess(sheets.index('static/stone-ui-assets.css'),sheets.index('static/dashboard-accessibility.css'))

DashboardIntegrationTests.test_unknown_entry_and_net_never_crash_or_look_like_zero=_unknown_entry_and_net_never_crash_or_look_like_zero
DashboardIntegrationTests.test_status_uses_light_payload_contract=_status_uses_light_payload_contract
DashboardIntegrationTests.test_asset_override_is_installed_before_readability_layer=_asset_override_is_installed_before_readability_layer
def _journal_recording_label_is_dated_and_not_today(self):
    self.load()
    self.assertNotIn('Heute 20:00',self.page.locator('#journal-recording-start').inner_text())
    self.assertIn('08.10.2026',self.page.locator('#journal-recording-start').inner_text())

DashboardIntegrationTests.test_journal_recording_label_is_dated_and_not_today=_journal_recording_label_is_dated_and_not_today
# Do not expose imported base class as another collected suite.
del DashboardFrontendTests
