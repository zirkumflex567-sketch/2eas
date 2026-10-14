import pytest
from fastapi.testclient import TestClient
from app import app
from mobile_views import MOBILE_HTML, ASCII_HTML

client = TestClient(app)

def test_mobile_views_content_not_empty():
    assert len(MOBILE_HTML) > 1000
    assert len(ASCII_HTML) > 1000
    assert "viewport" in MOBILE_HTML
    assert "viewport" in ASCII_HTML

def test_mobile_endpoint():
    response = client.get("/mobile")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Titan Mobile Cockpit" in response.text
    assert "viewport" in response.text
    assert "positions-list" in response.text

def test_light_endpoint_alias():
    response = client.get("/light")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Titan Mobile Cockpit" in response.text

def test_ascii_endpoint():
    response = client.get("/ascii")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "terminal-screen" in response.text
    assert "terminal-container" in response.text
    assert "align-items: center" in response.text
    assert "const W = 96" in response.text
    assert "TITAN ASCII TERMINAL" in response.text
    assert "EMA9-ZIEL" in response.text
    assert "GESAMT (ALLE KONTEN)" in response.text
    assert "setJournalScope" in response.text
    assert "togglePosDetail" in response.text
    assert "ascii-sound-btn" in response.text
    assert "toggleAsciiAudio" in response.text

def test_terminal_endpoint_alias():
    response = client.get("/terminal")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "terminal-screen" in response.text

def test_index_has_mobile_and_ascii_links():
    response = client.get("/")
    assert response.status_code == 200
    assert 'href="/mobile"' in response.text
    assert 'href="/ascii"' in response.text

def test_mobile_has_sltp_partial_close_and_sound():
    response = client.get("/mobile")
    assert response.status_code == 200
    html = response.text
    assert "mob-sound-btn" in html
    assert "toggleMobAudio" in html
    assert "ArcadeAudio" in html
    assert "pos-sl-tp" in html
    assert "saveMobSLTP" in html
    assert "closePosPct" in html
    assert "closePosCustom" in html
    assert "mob-lot-" in html
    assert "25%" in html
    assert "50%" in html
    assert "75%" in html
    assert "100%" in html

def test_mobile_mutations_use_control_session_and_csrf():
    html = client.get('/mobile').text
    assert "'/api/control_session'" in html
    assert "'X-Dashboard-CSRF': session.csrf_token" in html
    assert "controlledPost('/api/modify_position'" in html
    assert "controlledPost('/api/close_position'" in html

def test_ascii_mutations_use_control_session_and_csrf():
    html = client.get('/ascii').text
    assert "'/api/control_session'" in html
    assert "'X-Dashboard-CSRF': session.csrf_token" in html
    assert "controlledPost('/api/modify_position'" in html
    assert "controlledPost('/api/close_position'" in html

def test_ascii_has_compact_responsive_terminal():
    html = client.get('/ascii').text
    assert 'renderCompactAscii' in html
    assert 'window.matchMedia' in html
    assert 'terminal-screen.compact' in html

def test_ascii_has_sltp_partial_close_and_sound():
    response = client.get("/ascii")
    assert response.status_code == 200
    html = response.text
    assert "promptEditSLTP" in html
    assert "promptCloseLots" in html
    assert "closePosPct" in html
    assert "TEILSCHLIESSEN" in html
    assert "25%" in html
    assert "50%" in html
    assert "75%" in html
    assert "100%" in html

def test_desktop_has_sltp_and_partial_close():
    response = client.get("/")
    assert response.status_code == 200
    html = response.text
    assert "data-position-sl-val" in html
    assert "data-position-tp-val" in html
    assert "closePosPct" in html
    assert "closePosCustom" in html
    assert "close-lot-" in html
    assert "Teilschließen" in html

def test_close_position_request_schema():
    from app import ClosePositionRequest
    from pydantic import ValidationError

    req1 = ClosePositionRequest(ticket=123)
    assert req1.ticket == 123
    assert req1.volume is None

    req2 = ClosePositionRequest(ticket=123, volume=0.01)
    assert req2.volume == 0.01

    with pytest.raises(ValidationError):
        ClosePositionRequest(ticket=123, volume=0)

    with pytest.raises(ValidationError):
        ClosePositionRequest(ticket=123, volume=-0.05)
