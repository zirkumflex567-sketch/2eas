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
