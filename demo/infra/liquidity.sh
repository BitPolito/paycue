#!/usr/bin/env bash
# Open the demo's channels once the studio node has on-chain funds.
# Safe to re-run: it skips channels that already exist or are pending.
set -euo pipefail

B="${PAYHOOK_DEMO_HOME:-$HOME/payhook-demo}"
# The signet maker's node has no public channels and its invoices carry no
# route hints, so the studio needs a direct channel to it.
MAKER_NODE="03999c0815494050cabec922e9357567e16f6a43ce702ac07b87a82f1539cb9fbf"
MAKER_ADDR="maker.signet.kaleidoswap.com:9735"
MAKER_CHANNEL_SAT="${MAKER_CHANNEL_SAT:-600000}"
PLAYER_CHANNEL_SAT="${PLAYER_CHANNEL_SAT:-250000}"

studio() { "$B/bin/lncli" --lnddir="$B/lnd-studio" --network=signet --rpcserver=127.0.0.1:10009 "$@"; }
player() { "$B/bin/lncli" --lnddir="$B/lnd-player" --network=signet --rpcserver=127.0.0.1:10010 "$@"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

PLAYER_NODE=$(player getinfo | json "d['identity_pubkey']")
confirmed=$(studio walletbalance | json "d['confirmed_balance']")
echo "studio confirmed on-chain balance: ${confirmed} sat"

has_channel() {
  local peer=$1
  local open pending
  open=$(studio listchannels --peer "$peer" | json "len(d['channels'])")
  pending=$(studio pendingchannels | json "sum(1 for c in d['pending_open_channels'] if c['channel']['remote_node_pub']=='$peer')")
  [ "$open" -gt 0 ] || [ "$pending" -gt 0 ]
}

open_channel() {
  local peer=$1 host=$2 amount=$3 label=$4
  if has_channel "$peer"; then echo "$label: channel exists or is pending"; return; fi
  studio connect "$peer@$host" >/dev/null 2>&1 || true
  echo "$label: opening ${amount} sat channel"
  studio openchannel --node_key "$peer" --local_amt "$amount" --sat_per_vbyte 2 --min_confs 0 | json "d['funding_txid']"
}

needed=$((MAKER_CHANNEL_SAT + PLAYER_CHANNEL_SAT + 20000))
if [ "$confirmed" -lt "$needed" ]; then
  echo "Need at least ${needed} sat confirmed. Fund this address, wait one block (~30 s), then re-run:"
  studio newaddress p2tr | json "d['address']"
  exit 1
fi

open_channel "$MAKER_NODE" "$MAKER_ADDR" "$MAKER_CHANNEL_SAT" "maker (Level 2 swaps via KaleidoSwap)"
open_channel "$PLAYER_NODE" "127.0.0.1:9736" "$PLAYER_CHANNEL_SAT" "player (Level 1)"
echo "Channels confirm after one Mutinynet block (~30 s). Check with: studio listchannels"
