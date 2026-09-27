#!/usr/bin/env bash
# Wait for the studio node to be funded, open the demo channels, then run
# every live path against the real game server and record the results.
#   demo/infra/live-tests.sh            # waits up to 12 h for funds
#   WAIT_HOURS=0 demo/infra/live-tests.sh   # run now, don't wait
set -uo pipefail
R="$(cd "$(dirname "$0")/.." && pwd)"
B="${PAYCUE_DEMO_HOME:-$HOME/paycue-demo}"
S="${GAME_URL:-http://localhost:8090}"
OUT="$R/../docs/LIVE-TEST-RESULTS.md"
LIQUID="${LIQUID_ADDRESS:-$(curl -s localhost:8091/api/wallet | python3 -c 'import json,sys;print(json.load(sys.stdin)["liquid"]["address"])')}"
TOKEN="$(cat "$B/game/admin-token")"
studio() { "$B/bin/lncli" --lnddir="$B/lnd-studio" --network=signet --rpcserver=127.0.0.1:10009 "$@"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

deadline=$(( $(date +%s) + ${WAIT_HOURS:-12} * 3600 ))
until [ "$(studio walletbalance | json "d['confirmed_balance']")" -ge 870000 ]; do
  [ "$(date +%s)" -ge "$deadline" ] && { echo "No funds before the deadline"; exit 2; }
  sleep 60
done
echo "Funded: $(studio walletbalance | json "d['confirmed_balance']") sat"

"$R/infra/liquidity.sh" || true
for i in $(seq 1 60); do
  active=$(studio listchannels --active_only | json "len(d['channels'])")
  [ "$active" -ge 2 ] && break
  sleep 30
done
echo "Active channels: $active"

run() { # label, bot args...
  local label=$1; shift
  echo "## $label" >> "$OUT"
  echo '```' >> "$OUT"
  (cd "$R/game" && node test/bot.mjs --server "$S" "$@") >> "$OUT" 2>&1
  echo "exit $?" >> "$OUT"
  echo '```' >> "$OUT"
}
admin() { curl -s -X POST -H "x-admin-token: $TOKEN" -H 'content-type: application/json' -d "$2" "$S/api/admin/$1" >/dev/null; }

{
  echo "# Live test results"
  echo
  echo "Run $(date -Is) against $S (real mode, Mutinynet)."
  echo
  echo '```'
  studio listchannels | json "'\n'.join(f\"{c['remote_pubkey'][:16]}… cap {c['capacity']} local {c['local_balance']} active {c['active']}\" for c in d['channels'])"
  echo '```'
  echo
} > "$OUT"

run "Level 1: five coins over Lightning" --coins 5 --name ada --recipient ada@localhost:8091 --wait 90
run "Cheats are refused" --cheat --name mallory --recipient mallory@localhost:8091
run "Money glitch: replays and the per-minute cap" --glitch --coins 40 --name glitch --recipient glitch@localhost:8091 --wait 180
admin outage '{"mode":"drop-next-response"}'
run "Recovery: the studio node's answer is lost" --coins 1 --name phoenix --recipient phoenix@localhost:8091 --wait 120
admin outage '{"mode":"normal"}'
run "Level 2: round prize as L-USDT via KaleidoSwap pay-through" --coins 3 --name lia --recipient "$LIQUID" --wait 300
sleep 60
{
  echo "## Player wallet after the run"
  echo '```'
  curl -s localhost:8091/api/wallet | python3 -m json.tool
  echo '```'
} >> "$OUT"
echo "Results written to $OUT"
