# htown `/stt` backend guard

This guard adds one independent nftables `input` base chain. It drops only
non-loopback TCP traffic addressed to port 8055, the private SSH-tunnel upstream.
Loopback stays allowed for the reverse tunnel. The chain uses `policy accept`
and leaves the existing iptables-nft/Docker rules, public ports, and services
untouched. It is not a host-wide default-deny firewall.

Install from a reviewed `main` checkout on htown:

```sh
sudo install -o root -g root -m 0644 deploy/htown/stt-backend-guard.nft /etc/nftables/stt-backend-guard.nft
sudo install -o root -g root -m 0755 deploy/htown/stt-backend-guard.sh /usr/local/sbin/stt-backend-guard
sudo install -o root -g root -m 0644 deploy/htown/stt-backend-guard.service /etc/systemd/system/stt-backend-guard.service
sudo nft --check -f /etc/nftables/stt-backend-guard.nft
sudo systemd-analyze verify /etc/systemd/system/stt-backend-guard.service
sudo systemctl daemon-reload
sudo systemctl enable --now stt-backend-guard.service
sudo systemctl is-active stt-backend-guard.service
sudo nft list chain inet stt_backend_guard input
```

Then verify nginx and fetch `/api/runtime` through the existing SSH reverse
tunnel. To roll back, run `sudo systemctl disable --now stt-backend-guard.service`;
its `ExecStop` removes only `table inet stt_backend_guard`. Remove the three
installed files only after confirming the table is absent. Do not enable the
generic nftables service or change the base INPUT policy as part of this guard.
