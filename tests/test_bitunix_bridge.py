import unittest
from unittest.mock import patch, MagicMock
from bitunix_client import BitunixClient
from bitunix_bridge import BitunixBridge, load_config, DEFAULT_CONFIG

class BitunixBridgeTests(unittest.TestCase):
    def setUp(self):
        self.client = BitunixClient(api_key="test_key", secret_key="test_secret")
        self.bridge = BitunixBridge(config={
            **DEFAULT_CONFIG,
            "api_key": "test_key",
            "secret_key": "test_secret",
            "enabled": True,
            "fixed_qty": 0.01,
            "min_qty": 0.002
        })

    def test_signature_deterministic(self):
        sig1 = self.client._generate_signature(
            nonce="nonce123",
            timestamp="1700000000000",
            query_params="symbol=XAUUSDT",
            body=""
        )
        sig2 = self.client._generate_signature(
            nonce="nonce123",
            timestamp="1700000000000",
            query_params="symbol=XAUUSDT",
            body=""
        )
        self.assertEqual(sig1, sig2)
        self.assertEqual(len(sig1), 64)

    def test_eligible_ea_detection(self):
        # Market EA magic
        pos_market = MagicMock()
        pos_market.magic = 1609493055
        pos_market.comment = "XAUUSD 5 Minute"
        eligible, name = self.bridge.is_eligible_ea(pos_market)
        self.assertTrue(eligible)
        self.assertEqual(name, "Market_XAU5M")

        # Titan EA magic
        pos_titan = MagicMock()
        pos_titan.magic = 881122
        pos_titan.comment = "Titan_guter5_Dyn05"
        eligible, name = self.bridge.is_eligible_ea(pos_titan)
        self.assertTrue(eligible)
        self.assertEqual(name, "Titan_Pro")

    def test_qty_computation_enforces_minimum(self):
        # Minimum qty is 0.002
        qty = self.bridge.compute_qty(0.0001)
        self.assertGreaterEqual(qty, 0.002)

        self.bridge.config["sizing_mode"] = "fixed_qty"
        self.bridge.config["fixed_qty"] = 0.05
        self.assertEqual(self.bridge.compute_qty(0.01), 0.05)

    @patch("requests.post")
    def test_place_order_payload(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"code": 0, "msg": "Success", "data": {"orderId": "12345"}}
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        res = self.client.place_order(
            symbol="XAUUSDT",
            side="BUY",
            trade_side="OPEN",
            qty=0.01,
            sl_price=4050.0,
            tp_price=4150.0,
            client_id="mt5_123"
        )
        self.assertEqual(res["code"], 0)
        self.assertTrue(mock_post.called)
        call_kwargs = mock_post.call_args[1]
        self.assertIn("data", call_kwargs)
        self.assertIn("XAUUSDT", call_kwargs["data"])
        self.assertIn("4050.0", call_kwargs["data"])

if __name__ == "__main__":
    unittest.main()
