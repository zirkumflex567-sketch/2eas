"""Bounded computation cache. Never caches account/risk/guard/quote snapshots."""
from collections import OrderedDict
from copy import deepcopy
import hashlib
import json
import numpy as np


class ClosedBarMetricsCache:
    def __init__(self, capacity=8):
        self.capacity = capacity
        self.entries = OrderedDict()

    def get(self, account, symbol, timeframe, closed_time, closes, params, compute):
        closed = np.asarray(closes, dtype='<f8')[:-1]
        fingerprint = hashlib.sha256(closed.tobytes()).digest()
        preset = json.dumps(params, sort_keys=True, allow_nan=False)
        key = (account['id'], account['login'], account['server'], account['terminal'],
               symbol, timeframe, int(closed_time), fingerprint, preset)
        if key not in self.entries:
            self.entries[key] = deepcopy(compute(closes, params))
            while len(self.entries)>self.capacity:
                self.entries.popitem(last=False)
        self.entries.move_to_end(key)
        return deepcopy(self.entries[key])
