#!/usr/bin/env bash
set -euo pipefail

nft=/usr/sbin/nft
rules=/etc/nftables/stt-backend-guard.nft

if "$nft" list table inet stt_backend_guard >/dev/null 2>&1; then
    current=$("$nft" list table inet stt_backend_guard)
    rule_count=$(printf '%s\n' "$current" | grep -Ec '^[[:space:]]+iifname ' || true)
    if [[ "$rule_count" -ne 1 ]] || ! printf '%s\n' "$current" | grep -Eq 'iifname != "lo" tcp dport 8055 counter.* drop'; then
        echo 'Refusing to replace an unexpected inet stt_backend_guard table.' >&2
        exit 1
    fi
    exit 0
fi

"$nft" --check -f "$rules"
"$nft" -f "$rules"
