from hashlib import sha256

from chart_studio import evidence_models
from chart_studio.evidence_mfe_mae import estimate_ohlc_mfe_mae, observe_tick_mfe_mae


def _time(hour, minute, second=0):
    return f"2026-10-14T{hour:02d}:{minute:02d}:{second:02d}Z"


def _deal(ticket, entry, at, side, price, position="9001"):
    return {
        "type": "LIFECYCLE",
        "id": f"mt5_deal_{ticket}",
        "provenance": "RECORDED",
        "payload": {
            "accountId": "titan",
            "dealTicket": str(ticket),
            "dealEntry": entry,
            "dealSide": side,
            "price": str(price),
            "asOfUtc": at,
            "positionIdentifier": position,
        },
    }


def _snapshot(capture, ticket, at, bars, position="9001", account="titan"):
    digest = sha256(evidence_models.canonical_bytes(bars)).hexdigest()
    return {
        "type": "SNAPSHOT",
        "id": f"snap_{capture.lower()}_{ticket}",
        "provenance": "RECORDED",
        "payload": {
            "accountId": account,
            "dealTicket": str(ticket),
            "positionIdentifier": position,
            "captureType": capture,
            "asOfUtc": at,
            "chartView": {"symbol": "XAUUSD.pi", "timeframe": "M15"},
            "lifecycleEventIds": [{"type": "LIFECYCLE", "id": f"mt5_deal_{ticket}"}],
            "marketData": {"source": "MT5_COMPLETED_BARS", "bars": bars, "sha256": digest},
        },
    }


def _bar(hour, minute, high, low, opened=None, closed=None):
    opened = opened if opened is not None else low + 1
    closed = closed if closed is not None else low + 2
    return {
        "timeUtc": _time(hour, minute),
        "open": str(opened), "high": str(high), "low": str(low), "close": str(closed),
        "tickVolume": 100, "spread": 2, "realVolume": 0,
    }


def _records(*, entry_at=None, exit_at=None, side="BUY", entry_price="101", bars=None,
             lifecycle=None, snapshots=None):
    entry_at = entry_at or _time(10, 0)
    exit_at = exit_at or _time(10, 45)
    bars = bars if bars is not None else [
        _bar(10, 0, 102, 99, opened=100, closed=101),
        _bar(10, 15, 105, 100, opened=101, closed=104),
        _bar(10, 30, 104, 98, opened=104, closed=100),
    ]
    lifecycle = lifecycle if lifecycle is not None else [
        _deal("5001", "IN", entry_at, side, entry_price),
        _deal("5002", "OUT", exit_at, "SELL" if side == "BUY" else "BUY", "100"),
    ]
    snapshots = snapshots if snapshots is not None else [
        _snapshot("ENTRY", "5001", entry_at, [_bar(9, 45, 101, 99)]),
        _snapshot("EXIT", "5002", exit_at, bars),
    ]
    return lifecycle, snapshots


def test_long_position_reports_explicit_ohlc_price_excursions():
    lifecycle, snapshots = _records()

    result = estimate_ohlc_mfe_mae("9001", lifecycle, snapshots)

    assert result == {
        "status": "AVAILABLE",
        "reason": None,
        "quality": "OHLC_ESTIMATE",
        "coverage": "OBSERVED_BARS_ONLY",
        "source": "MT5_COMPLETED_BARS",
        "positionIdentifier": "9001",
        "symbol": "XAUUSD.pi",
        "side": "BUY",
        "entryPrice": "101",
        "entryDealTicket": "5001",
        "exitDealTicket": "5002",
        "entryTimeUtc": _time(10, 0),
        "exitTimeUtc": _time(10, 45),
        "timeframe": "M15",
        "barsUsed": 3,
        "observedFromUtc": _time(10, 0),
        "observedToUtc": _time(10, 30),
        "mfePriceDistance": "4",
        "maePriceDistance": "3",
        "intrabarOrder": "UNKNOWN",
    }


def test_short_position_reverses_favorable_and_adverse_price_extrema():
    lifecycle, snapshots = _records(side="SELL", entry_price="101")

    result = estimate_ohlc_mfe_mae("9001", lifecycle, snapshots)

    assert (result["mfePriceDistance"], result["maePriceDistance"]) == ("3", "4")
    assert result["quality"] == "OHLC_ESTIMATE"


def test_entry_and_exit_partial_candles_are_not_used():
    lifecycle, snapshots = _records(
        entry_at=_time(10, 5), exit_at=_time(10, 44),
        bars=[
            _bar(10, 0, 110, 90, opened=100, closed=101),
            _bar(10, 15, 103, 99, opened=101, closed=102),
            _bar(10, 30, 120, 80, opened=102, closed=103),
        ],
    )

    result = estimate_ohlc_mfe_mae("9001", lifecycle, snapshots)

    assert result["status"] == "AVAILABLE"
    assert result["barsUsed"] == 1
    assert (result["mfePriceDistance"], result["maePriceDistance"]) == ("2", "2")


def test_only_partial_edge_candles_yields_unavailable():
    lifecycle, snapshots = _records(
        entry_at=_time(10, 5), exit_at=_time(10, 14),
        bars=[_bar(10, 0, 110, 90)],
    )

    result = estimate_ohlc_mfe_mae("9001", lifecycle, snapshots)

    assert result["status"] == "UNAVAILABLE"
    assert result["reason"] == "NO_COMPLETE_CANDLES"


def test_multiple_entry_or_exit_deals_are_not_guessed_as_one_position():
    lifecycle, snapshots = _records()
    lifecycle.append(_deal("5003", "OUT", _time(10, 30), "SELL", "102"))

    result = estimate_ohlc_mfe_mae("9001", lifecycle, snapshots)

    assert result["status"] == "UNAVAILABLE"
    assert result["reason"] == "MULTI_LEG_POSITION_UNSUPPORTED"


def test_missing_or_mismatched_snapshot_provenance_is_unavailable():
    lifecycle, snapshots = _records()
    snapshots[1]["payload"]["lifecycleEventIds"][0]["id"] = "mt5_deal_9999"

    result = estimate_ohlc_mfe_mae("9001", lifecycle, snapshots)

    assert result["status"] == "UNAVAILABLE"
    assert result["reason"] == "SNAPSHOT_LINK_MISMATCH"


def test_market_data_digest_tampering_fails_closed():
    lifecycle, snapshots = _records()
    snapshots[1]["payload"]["marketData"]["bars"][1]["high"] = "999"

    result = estimate_ohlc_mfe_mae("9001", lifecycle, snapshots)

    assert result["status"] == "UNAVAILABLE"
    assert result["reason"] == "INVALID_SNAPSHOT_EVIDENCE"


def test_account_and_position_mismatches_fail_closed():
    lifecycle, snapshots = _records()
    snapshots[1]["payload"]["accountId"] = "xau5m_m5"

    result = estimate_ohlc_mfe_mae("9001", lifecycle, snapshots)

    assert result["status"] == "UNAVAILABLE"
    assert result["reason"] == "POSITION_SCOPE_MISMATCH"


def test_tick_observation_uses_executable_bid_for_long_and_excludes_fill_edges():
    entry_us = evidence_models.utc_microseconds(_time(10, 0))
    exit_us = evidence_models.utc_microseconds(_time(10, 0, 2))
    ticks = [
        {"time_msc": entry_us // 1000, "bid": 100, "ask": 101},
        {"time_msc": entry_us // 1000 + 1, "bid": 104, "ask": 105},
        {"time_msc": entry_us // 1000 + 2, "bid": 97, "ask": 98},
        {"time_msc": exit_us // 1000, "bid": 200, "ask": 201},
    ]

    result = observe_tick_mfe_mae("9001", "BUY", "100", entry_us, exit_us, ticks)

    assert result["status"] == "AVAILABLE"
    assert result["quality"] == "TICK_OBSERVED"
    assert result["coverage"] == "MT5_RETURNED_TICKS_ONLY"
    assert result["exact"] is False
    assert (result["mfePriceDistance"], result["maePriceDistance"]) == ("4", "3")
    assert result["ticksUsed"] == 2


def test_tick_observation_uses_executable_ask_for_short():
    entry_us = evidence_models.utc_microseconds(_time(10, 0))
    exit_us = evidence_models.utc_microseconds(_time(10, 0, 2))
    ticks = [
        {"time_msc": entry_us // 1000 + 1, "bid": 98, "ask": 99},
        {"time_msc": entry_us // 1000 + 2, "bid": 102, "ask": 103},
    ]

    result = observe_tick_mfe_mae("9001", "SELL", "100", entry_us, exit_us, ticks)

    assert (result["mfePriceDistance"], result["maePriceDistance"]) == ("1", "3")
    assert result["quoteSide"] == "ASK"


def test_tick_observation_fails_closed_on_invalid_order_quotes_or_count():
    entry_us = evidence_models.utc_microseconds(_time(10, 0))
    exit_us = evidence_models.utc_microseconds(_time(10, 0, 2))
    t0 = entry_us // 1000 + 1
    valid = {"time_msc": t0, "bid": 100, "ask": 101}

    assert observe_tick_mfe_mae("9001", "BUY", "100", entry_us, exit_us,
                                [valid, {**valid, "time_msc": t0 - 1}])["reason"] == "TICK_ORDER_INVALID"
    assert observe_tick_mfe_mae("9001", "BUY", "100", entry_us, exit_us,
                                [{**valid, "ask": 0}])["reason"] == "TICK_QUOTE_INVALID"
    assert observe_tick_mfe_mae("9001", "BUY", "100", entry_us, exit_us, [])["reason"] == "NO_INTERIOR_TICKS"


def test_tick_observation_accepts_a_large_bounded_terminal_result():
    entry_us = evidence_models.utc_microseconds(_time(10, 0))
    exit_us = evidence_models.utc_microseconds(_time(10, 1))
    row = {"time_msc": entry_us // 1000 + 1, "bid": 101, "ask": 102}

    result = observe_tick_mfe_mae("9001", "BUY", "100", entry_us, exit_us, [row] * 250_001)

    assert result["status"] == "AVAILABLE"
    assert result["ticksUsed"] == 250_001


def test_tick_observation_accepts_numpy_style_iterable_rows():
    entry_us = evidence_models.utc_microseconds(_time(10, 0))
    exit_us = evidence_models.utc_microseconds(_time(10, 0, 2))
    row = {"time_msc": entry_us // 1000 + 1, "bid": 101, "ask": 102}

    class TickArray:
        def __len__(self):
            return 1

        def __iter__(self):
            return iter((row,))

    result = observe_tick_mfe_mae("9001", "BUY", "100", entry_us, exit_us, TickArray())

    assert result["status"] == "AVAILABLE"
    assert result["mfePriceDistance"] == "1"
