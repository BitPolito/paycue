# Demo infrastructure

Everything the showcase needs besides the `@payhook` packages: two Lightning
nodes, the demo wallet, the game server, and scripts to move them between
machines with their funds.

## What runs

| Service | Unit | Listens on | Notes |
|---|---|---|---|
| Studio LND (the payer) | `payhook-lnd@studio` | REST `127.0.0.1:8080`, gRPC `127.0.0.1:10009`, P2P `:9735` | Channels to the KaleidoSwap signet maker and to the player node |
| Player LND (demo player's wallet) | `payhook-lnd@player` | REST `127.0.0.1:8081`, gRPC `127.0.0.1:10010`, P2P `:9736` | Receives Level 1 coins |
| Payout service | `payhook-payouts` | `:8089` | `@payhook/server`: the only process paying from the studio node; operator console at `/` |
| Game demo | `payhook-game` | `:8090` | Orbital Sats; a client of the payout service |
| Contribution reward demo | `payhook-contributions` | `:8092` | GitHub bounty board and webhook; a client of the payout service |
| Player wallet | `payhook-wallet` | `:8091` | Lightning Address server + Liquid testnet wallet (LWK) |

All state lives in one directory, `PAYHOOK_HOME` (default `~/payhook-demo`):

```
bin/            lnd + lncli built from lnd PR #10864 (custom signet block time)
lnd-studio/     node config, wallet, channels, macaroons, TLS, neutrino headers
lnd-player/     same for the player node
liquid-player/  the demo player's Liquid mnemonic
payout-service/ payouts.sqlite (+ archived runs), tokens.json (operator + client tokens)
contributions/  bounties.json, contributors, env (GitHub webhook secret)
game/           history from before the payout service existed
```

## VM requirements (Proxmox)

| | Minimum | Comfortable |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | 2 GB | 4 GB |
| Disk | 10 GB | 20 GB (headers grow ~1 GB/year on Mutinynet) |
| OS | Any systemd Linux, x86_64 (the bundled `lnd` is linux-amd64) | Debian 13 / Ubuntu 24.04 |
| Software | Node.js 22.5+ (24 tested), `python3`, `openssl`, `tar` | Tailscale for private access |

**Network**

- **Outbound only is enough.** Both nodes connect out: to the Mutinynet
  neutrino peer `45.79.52.207:38333` and to the maker
  `maker.signet.kaleidoswap.com:9735`. Also HTTPS to
  `maker.signet.kaleidoswap.com`, `waterfalls.liquidwebwallet.org` and
  `mutinynet.com` (fee estimates). No port forwarding needed.
- **Inbound for people:** `8090` (game), `8092` (bounty board) and `8091`
  (wallet) from wherever the audience's browser runs; `8089` (console) for
  operators only. Keep them on the tailnet or office LAN.
- **Inbound for GitHub** (real webhooks only): GitHub must reach
  `:8092/webhooks/github`. The office VM isn't public; see QUESTIONS.md #8.
- **Keep 8080/8081/10009/10010 on localhost.** They are LND's APIs.

No Docker and no root needed: everything runs as systemd **user** services.
Run `loginctl enable-linger <user>` once so they survive logout (this one may
need an admin on the VM).

## The office VM (live since 2026-09-27)

The demo runs here now: game http://192.168.1.219:8090, bounty board
:8092, wallet :8091, console :8089. konputer's copies are retired.


| | |
|---|---|
| Name / VMID | `payhook-signet` / 103 on Proxmox node `satoshi` (192.168.1.3) |
| Built from | template 9000 `debian-13-trixie` (cloud-init), full clone |
| Size | 2 vCPU, 4 GB RAM, 20 GB disk, starts on boot, tags `payhook;signet;demo` |
| Address | `192.168.1.219` (DHCP on `vmbr0`) |
| Access | `ssh payhook-signet` (user `user`, key `~/.ssh/id_ed25519_payhook-signet`); the team keys from the template are kept |
| Prepared | Node 24.14.0 in `~/.local/node`, lingering enabled. No sudo for `user`. Code in `~/payhook/demo` (no rsync on the VM: copy with `tar | ssh`). |

From konputer the office LAN is reached through the `voidops-ingress-office`
NetworkManager VPN, configured with host routes only (`192.168.1.3`, `.4`,
`.219`) because konputer's own LAN is also `192.168.1.0/24`.

## Moving the demo to another machine (funds included)

A Lightning node is not like a database you can copy around: **its state
must only ever run in one place.** If an old copy comes back with stale
channel state, the channel peer can take the channel's funds. The scripts
enforce this:

```sh
# On the old machine (stops everything, bundles, retires the old copy):
demo/infra/export.sh                     # full bundle (~1 GB), starts synced
demo/infra/export.sh --state-only        # a few MB; headers re-sync (~10 min)
PAYHOOK_BUNDLE_PASSPHRASE=… demo/infra/export.sh   # encrypted bundle

# Copy the bundle and its .sha256 over, then on the new machine:
git clone <repo> && cd <repo>
PAYHOOK_BUNDLE_PASSPHRASE=… demo/infra/import.sh payhook-infra-<host>-<stamp>.tar.gz
```

`import.sh` verifies the checksum, unpacks into `PAYHOOK_HOME`, rewrites
paths, builds the demo from `demo/vendor/*.tgz`, installs the units, starts
the nodes, waits for sync and prints the channel balance.

Moved konputer → `payhook-signet` with `--state-only` (76 MB); the VM re-synced headers in about 25 minutes, then game payouts and an L-USDT bounty settled. Earlier, tested on konputer: export → retire → import brought back the same node
identity, both channels active, 797,440 sat in channels, the unchanged
on-chain balance, the payout history and the 41.79 L-USDT in the player wallet;
new payouts settled right after.

### Local backup when the VM breaks

Plan for it as a **move back**, not a restore of an old copy:

1. **VM still reachable:** `export.sh` on the VM, `import.sh` on your laptop.
   Nothing is lost.
2. **VM dead:** Lightning channel state can't be restored from an old
   snapshot safely. Recover funds instead: every node's 24-word seed is in
   `lnd-*/seed.json` and LND keeps `lnd-*/data/chain/bitcoin/signet/channel.backup`
   up to date. Keep a copy of both off the VM (they only change when a channel
   opens or closes). Restoring them on a new node force-closes the channels and
   returns the balances on-chain within a few blocks; then re-run
   `liquidity.sh` to open new channels. The Liquid wallet only needs
   `liquid-player/mnemonic`.
3. `export.sh --snapshot` makes a copy while the services keep running. It is
   stale the moment a payment happens, and `import.sh` refuses it unless you
   confirm the source is gone for good.

## Fresh machine without a bundle

```sh
demo/infra/build-lnd.sh            # needs Go 1.25+
demo/infra/create-nodes.sh         # new wallets, no funds
demo/infra/install.sh
demo/infra/liquidity.sh            # after funding the studio node
```

## Other scripts

| Script | Purpose |
|---|---|
| `liquidity.sh` | Opens the maker and player channels once the studio node has on-chain funds. Idempotent. |
| `live-tests.sh` | Waits for funds, opens channels, plays every scene with the bot, writes `docs/LIVE-TEST-RESULTS.md`. |
