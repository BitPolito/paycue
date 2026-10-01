#!/usr/bin/env bash
# Take over the demo on this machine from a bundle made by export.sh.
#
#   demo/infra/import.sh paycue-infra-<host>-<stamp>.tar.gz[.enc]
#
# Make sure the source copy is stopped and retired first (export.sh does this
# for a move). Running the same node state in two places can lose channel funds.
set -euo pipefail

BUNDLE="${1:?usage: import.sh BUNDLE}"
PAYCUE_HOME="${PAYCUE_HOME:-$HOME/paycue-demo}"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -e "$PAYCUE_HOME" ] && { echo "$PAYCUE_HOME already exists; move it away first" >&2; exit 1; }
if [ -f "$BUNDLE.sha256" ]; then
  (cd "$(dirname "$BUNDLE")" && sha256sum -c "$(basename "$BUNDLE").sha256") || { echo "Checksum mismatch" >&2; exit 1; }
fi

mkdir -p "$PAYCUE_HOME"
chmod 700 "$PAYCUE_HOME"
if [[ "$BUNDLE" == *.enc ]]; then
  : "${PAYCUE_BUNDLE_PASSPHRASE:?set PAYCUE_BUNDLE_PASSPHRASE to decrypt}"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:PAYCUE_BUNDLE_PASSPHRASE -in "$BUNDLE" | tar -C "$PAYCUE_HOME" -xzf -
else
  tar -C "$PAYCUE_HOME" -xzf "$BUNDLE"
fi
cat "$PAYCUE_HOME/BUNDLE-INFO"
if grep -q '^mode=snapshot' "$PAYCUE_HOME/BUNDLE-INFO" && [ "${I_KNOW_THE_SOURCE_IS_GONE:-}" != yes ]; then
  echo "This is a snapshot, not a move. If the source machine kept running, its channel state is newer" >&2
  echo "and restoring this can lose funds. Re-run with I_KNOW_THE_SOURCE_IS_GONE=yes to continue." >&2
  mv "$PAYCUE_HOME" "$PAYCUE_HOME.refused-$(date +%s)"
  exit 1
fi

PAYCUE_HOME="$PAYCUE_HOME" "$HERE/install.sh"
systemctl --user start paycue-lnd@studio paycue-lnd@player
echo "Waiting for the studio node to unlock and sync"
L="$PAYCUE_HOME/bin/lncli --lnddir=$PAYCUE_HOME/lnd-studio --network=signet --rpcserver=127.0.0.1:10009"
for _ in $(seq 1 120); do
  synced=$($L getinfo 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["synced_to_chain"])' 2>/dev/null || echo False)
  [ "$synced" = True ] && break
  sleep 10
done
systemctl --user start paycue-payouts paycue-wallet paycue-game paycue-contributions paycue-landing
$L getinfo | python3 -c 'import json,sys; d=json.load(sys.stdin); print("studio", d["identity_pubkey"][:16], "height", d["block_height"], "synced", d["synced_to_chain"], "active channels", d["num_active_channels"])'
$L channelbalance | python3 -c 'import json,sys; d=json.load(sys.stdin); print("channel balance", d["local_balance"]["sat"], "sat")'
echo "Game: http://$(hostname):8090  ·  wallet: http://$(hostname):8091"
