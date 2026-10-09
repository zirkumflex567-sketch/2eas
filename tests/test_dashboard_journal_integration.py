"""Parent integration regressions using isolated backend fixtures."""
from test_backend_audit import isolated
import app

def test_current_open_positions_are_not_hidden_by_historical_recording_cutoff(isolated):
    isolated.pos.time=1  # The existing real trade predates the historical cutoff.
    result=isolated.client.get('/api/journal_summary?account=titan')
    assert result.status_code==200
    assert [j['ticket'] for j in result.json()['journal'] if j['status']=='OPEN']==[11]
