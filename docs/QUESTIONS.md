# Open questions and decisions taken

Everything here was decided with a default so work could continue. The
**Needs you** items are the ones I could not do myself.

## Needs you

### 1. ~~Fund the studio node~~ Done

Funded with 1,000,000 sats; both channels are open and every live scene passed
(see LIVE-TEST-RESULTS.md). Original instructions kept for re-funding.

#### How to fund

The Mutinynet faucet only pays out to a GitHub-logged-in browser session, and
I had no browser. Either:

- **Option A (quickest):** open https://faucet.mutinynet.com, log in with
  GitHub, and send on-chain sats to the studio node:

  ```
  tb1pvxnjl5vd9q98jj6v3lslu77sdcfc9xp6cj033s648gwyzgpzvmps36f86p
  ```

  Ask for as much as the faucet allows; 1,000,000 sats covers the whole demo
  with room for rehearsals. Then run `scripts/demo-liquidity.sh`.
- **Option B:** after logging in, run `localStorage.getItem("token")` in the
  browser console on the faucet page and give me the token. I can then
  request funds and channels myself.

Why this amount: every Level 2 swap is at least 50,000 sats (the maker's
minimum). The studio opens a 600,000 sat channel **directly to the signet
maker's node** (`03999c08…9fbf` at `maker.signet.kaleidoswap.com:9735`) and a
250,000 sat channel to the player node for Level 1. The maker node is not in
the public graph and its invoices carry no route hints, so a direct channel is
the only route.

### 2. ~~Will the signet maker node accept a channel from us?~~ Yes

The maker accepted a 600,000 sat channel and a live pay-through swap delivered
L-USDT. Notes below kept for reference.

#### Original question

It accepted a peer connection from the studio node. Whether it accepts an
inbound 600,000 sat channel is only testable once funded. If it refuses,
someone on the KaleidoSwap team needs to allow it, or open a channel to the
studio node (`02fd4b32c51e86dc0dbaf9c02cbff78523d6f14c4e6f023a7399abc8da80109b89`),
or add route hints to maker invoices.

### 3. Sign the commits

Your Git config signs commits with GPG through a pinentry prompt, which I
can't answer. All work is on branch `demo/showcase`, staged but uncommitted.
Commit it yourself, or tell me to commit unsigned so you can re-sign later
with `git rebase --exec 'git commit --amend --no-edit -S' master`.

### 4. Keep services running after you log out

The nodes and demo apps run as systemd *user* services. Your account has
`Linger=no`, so they stop when your last session on konputer ends. For the
demo day run once:

```
loginctl enable-linger mo_
```

### 5. Where do the packages get published?

The packages are ready to publish (`npm run pack` builds the tarballs) but I
left out a `repository` field: the git remote is the private
`gl.moaki.net` GitLab. Decide the public home and the npm scope (`@payhook`
may be taken or not yours), and add a `LICENSE` file: the manifests say
Apache-2.0 but the repo has no license text.

### 6. Delete the retired infra copies on konputer

`~/payhook-demo.retired-20260927-151156` (before the local move test) and
`~/payhook-demo.retired-20260927-175122` (before the move to the VM) are
stale and must never be started. The demo now runs on `payhook-signet`.
Delete both when you're happy with the VM.

### 7. Office VM housekeeping

- **DHCP reservation** for `payhook-signet` (MAC `bc:24:11:81:dc:0d`, now
  `192.168.1.219`), or a static address, so the IP doesn't move.
- `user` has no passwordless sudo, so the QEMU guest agent isn't installed
  (Proxmox can't show the VM's IP). Nothing in the demo needs root.
- `192.168.1.4` didn't answer over the VPN; only `satoshi` (192.168.1.3) and
  `finney` via the cluster were visible.

### 8. GitHub for the contribution reward demo

The demo works today with signed rehearsal webhooks (`simulate.mjs`). For a
real merge on stage it needs:

- **A repository**: which one? A small public repo is easiest (bounty sync
  needs no token). I can create one with `gh` if you say so.
- **A way for GitHub to reach the webhook** on a machine that isn't public.
  Options: a relay like smee.io (GitHub's documented dev relay; payloads pass
  through it, signatures are still checked here), Tailscale Funnel (needs
  tailnet admin), or port forwarding on the office firewall.

## Decided with a default (tell me if you want otherwise)

| # | Question | Default taken | Why |
|---|---|---|---|
| 4 | Council agent on penguin | Ran Codex `gpt-6-astra` locally on konputer, read-only | Copying the repo to penguin was blocked as data exfiltration by the permission classifier |
| 5 | Lightning node on Mutinynet | LND built from lnd PR #10864 (`bitcoin.signetblocktime`), neutrino, no local bitcoind | Stock LND can't follow Mutinynet's 30 s blocks over neutrino; a full bitcoind sync takes hours; Docker needs root here |
| 6 | Level 2 swap route | KaleidoSwap **pay-through** (`POST /v2/swap/pay`) to a Liquid testnet address, asset L-USDT | Enabled on the signet maker; the maker pays the address itself, so the studio needs no Liquid wallet or L-BTC for fees. Trade-off: the address leg is operator-trusted |
| 7 | Level 2 prize size | 50,000 sats per round, paid as L-USDT (about 41 test USDT) | The maker's minimum per swap is 50,000 sats |
| 8 | Level 1 player wallet | A second LND node on konputer acting as the player's wallet, with a Lightning Address served by the demo wallet app | Ordinary mobile wallets don't support Mutinynet |
| 9 | Level 2 player wallet | A Liquid testnet wallet (LWK) held by the demo wallet app, showing the confidential L-USDT balance | Shows the receipt on stage without an external wallet |
| 10 | Generic `@payhook/webhook` package | Deferred | The game server calls the runtime in-process; Codex suggested cutting it |
| 11 | Bitcoin / Arkade pay-through destinations | Accepted by the resolver, not shown in the demo | Keep the stage story to Liquid |
| 12 | Default policy numbers | 10,000 sat per payout, 20 payouts or 50,000 sat per recipient per hour, 1,000,000 sat total, pause switch | Conservative; the demo overrides them per scene |
| 13 | GitHub demo from the old `src/demo.ts` | Moved to `apps/github-demo.ts`, not ported yet | The space shooter replaces it as the showcase |
| 14 | Module dependency on core | `peerDependencies` | One runtime per app, so `instanceof ResolutionError` works across modules |
| 15 | Demo consumes the library | From packed tarballs in `demo/vendor/`, not the workspace | Same as a user installing from npm |
| 16 | Liquid scanning backend | Waterfalls (`waterfalls.liquidwebwallet.org`) | Blockstream's Esplora rate-limited the wallet's rescans |
| 17 | Infra layout on a VM | systemd user services, no Docker, no root | Matches konputer; moving is a tarball |
| 18 | `create-nodes.sh` (fresh nodes) | Written, **not run**: it needs the ports the live nodes use | Test it on the VM before relying on it |
| 19 | Office VM | `payhook-signet`, VMID 103 on `satoshi`, 2 vCPU / 4 GB / 20 GB, key `id_ed25519_payhook-signet` | Follows the cluster's short-name style and your key naming |
| 20 | VPN on konputer | Imported `voidops-ingress-office` into NetworkManager with host routes only, no default route, no DNS | konputer's LAN is also 192.168.1.0/24; a full subnet route would break local networking |
| 21 | Per-recipient cap | 60 payouts a minute (was 25) | Hard mode has 38–40 coins a round; 25 denied honest play |
| 22 | Shared payout service | `@payhook/server` package (HTTP API, events, neutral console, `forClient` rules, `PayhookClient`) run by `demo/payout-service` | One executor per node; both demos are clients |
| 23 | Route split | Game: Lightning only. Contributions: Liquid L-USDT via KaleidoSwap, or Lightning | Your call; bounties sit naturally inside the maker's 50,000 sat minimum |
| 24 | Per-demo rules | game: 100 sat per payout, 60 per recipient per minute. contributions: 150,000 sat per payout, 5 per recipient per hour. Shared: 600,000 sat budget, pause | Different payout sizes, one wallet |
| 25 | Limit layers shown | operator, provider, network, receiver | Each route reports its own limits; the maker's are read live |
