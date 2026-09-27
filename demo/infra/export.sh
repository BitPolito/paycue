#!/usr/bin/env bash
# Package the demo's nodes, wallets and payout database so another machine can
# take over, funds and channels included.
#
#   demo/infra/export.sh                      # move: stop, bundle, retire this copy
#   demo/infra/export.sh --state-only         # smaller bundle; target re-syncs headers (~10 min)
#   demo/infra/export.sh --snapshot           # backup copy; services restart here afterwards
#   PAYHOOK_BUNDLE_PASSPHRASE=… demo/infra/export.sh   # encrypt the bundle
#
# A Lightning node's state must never run in two places. A move retires the
# source directory so it cannot be started by accident. A snapshot keeps this
# copy running, which makes the snapshot stale the moment a payment happens:
# only restore it if this machine is gone for good.
set -euo pipefail

PAYHOOK_HOME="${PAYHOOK_HOME:-$HOME/payhook-demo}"
MODE=move
STATE_ONLY=0
OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --snapshot) MODE=snapshot ;;
    --state-only) STATE_ONLY=1 ;;
    --out) OUT="$2"; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
  shift
done
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${OUT:-$PWD/payhook-infra-$(hostname)-$STAMP.tar.gz}"
[ -d "$PAYHOOK_HOME/lnd-studio" ] || { echo "No demo state in $PAYHOOK_HOME" >&2; exit 1; }

SERVICES=(payhook-contributions payhook-game payhook-payouts payhook-wallet payhook-lnd@studio payhook-lnd@player payhook-lnd-studio payhook-lnd-player)
echo "Stopping services"
systemctl --user stop "${SERVICES[@]}" 2>/dev/null || true
for _ in $(seq 1 30); do
  pgrep -f "$PAYHOOK_HOME/lnd-(studio|player)/lnd.conf" >/dev/null || break
  sleep 1
done
if pgrep -f "$PAYHOOK_HOME/lnd-(studio|player)/lnd.conf" >/dev/null; then
  echo "LND is still running; refusing to copy a live channel database" >&2
  exit 1
fi

EXCLUDES=(--exclude="./src" --exclude="./lnd-*/logs")
if [ "$STATE_ONLY" = 1 ]; then
  for f in block_headers.bin reg_filter_headers.bin neutrino.db; do
    EXCLUDES+=(--exclude="./lnd-*/data/chain/bitcoin/signet/$f")
  done
fi

cat > "$PAYHOOK_HOME/BUNDLE-INFO" <<EOF
source_host=$(hostname)
created=$(date -Is)
mode=$MODE
state_only=$STATE_ONLY
EOF

echo "Writing $OUT"
tar -C "$PAYHOOK_HOME" "${EXCLUDES[@]}" -czf "$OUT" .
if [ -n "${PAYHOOK_BUNDLE_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:PAYHOOK_BUNDLE_PASSPHRASE -in "$OUT" -out "$OUT.enc"
  rm "$OUT"
  OUT="$OUT.enc"
fi
sha256sum "$OUT" > "$OUT.sha256"
chmod 600 "$OUT" "$OUT.sha256"
echo "Bundle: $OUT ($(du -h "$OUT" | cut -f1))"

if [ "$MODE" = snapshot ]; then
  systemctl --user start payhook-lnd@studio payhook-lnd@player payhook-payouts payhook-wallet payhook-game payhook-contributions
  echo "Snapshot taken; services restarted here. Restore it only if this machine is gone for good."
else
  systemctl --user disable "${SERVICES[@]}" >/dev/null 2>&1 || true
  mv "$PAYHOOK_HOME" "$PAYHOOK_HOME.retired-$STAMP"
  echo "This copy is retired: $PAYHOOK_HOME.retired-$STAMP"
  echo "Import the bundle on the target with: demo/infra/import.sh $(basename "$OUT")"
fi
