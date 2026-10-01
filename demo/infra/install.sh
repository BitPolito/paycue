#!/usr/bin/env bash
# Install the demo services for the current user on this machine.
#
#   demo/infra/install.sh                 # uses ~/paycue-demo
#   PAYCUE_HOME=/srv/paycue demo/infra/install.sh
#
# Expects PAYCUE_HOME to contain bin/lnd, bin/lncli and the lnd-studio,
# lnd-player directories (from import.sh, or a fresh setup). Rewrites the
# absolute paths in lnd.conf so a moved state directory works in place.
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PAYCUE_HOME="${PAYCUE_HOME:-$HOME/paycue-demo}"
WALLET_DOMAIN="${WALLET_DOMAIN:-localhost:8091}"
WALLET_PUBLIC_URL="${WALLET_PUBLIC_URL:-http://$(hostname):8091}"
NODE="$(command -v node || true)"
UNITS="$HOME/.config/systemd/user"

fail() { echo "install: $*" >&2; exit 1; }

[ -n "$NODE" ] || fail "Node.js 22.5+ is required (node not found)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=5)?0:1)' \
  || fail "Node.js 22.5+ is required (found $(node --version))"
[ -x "$PAYCUE_HOME/bin/lnd" ] || fail "$PAYCUE_HOME/bin/lnd missing: run import.sh, or build-lnd.sh for a fresh node"
for node_dir in lnd-studio lnd-player; do
  [ -f "$PAYCUE_HOME/$node_dir/lnd.conf" ] || fail "$PAYCUE_HOME/$node_dir/lnd.conf missing"
done

echo "Pointing lnd.conf at $PAYCUE_HOME"
for node_dir in lnd-studio lnd-player; do
  conf="$PAYCUE_HOME/$node_dir/lnd.conf"
  sed -i -E "s#^lnddir=.*#lnddir=$PAYCUE_HOME/$node_dir#; s#^wallet-unlock-password-file=.*#wallet-unlock-password-file=$PAYCUE_HOME/$node_dir/wallet-password#" "$conf"
done

echo "Building the demo from the vendored @paycue packages"
(cd "$DEMO_DIR" && npm install --no-audit --no-fund >/dev/null && npm run build >/dev/null)

echo "Installing systemd user units into $UNITS"
mkdir -p "$UNITS"
for template in "$DEMO_DIR"/infra/units/*.service.in; do
  name="$(basename "$template" .in)"
  sed -e "s#@PAYCUE_HOME@#$PAYCUE_HOME#g" -e "s#@DEMO_DIR@#$DEMO_DIR#g" -e "s#@NODE@#$NODE#g" \
      -e "s#@WALLET_DOMAIN@#$WALLET_DOMAIN#g" -e "s#@WALLET_PUBLIC_URL@#$WALLET_PUBLIC_URL#g" \
      "$template" > "$UNITS/$name"
done
systemctl --user daemon-reload
mkdir -p "$PAYCUE_HOME/contributions"
if [ ! -f "$PAYCUE_HOME/contributions/env" ]; then
  (umask 077; echo "GITHUB_WEBHOOK_SECRET=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')" > "$PAYCUE_HOME/contributions/env")
fi
systemctl --user enable paycue-lnd@studio paycue-lnd@player paycue-payouts paycue-wallet paycue-game paycue-contributions paycue-landing >/dev/null

if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
  echo "Note: run 'loginctl enable-linger $USER' so the services keep running after you log out."
fi
echo "Installed. Start with: systemctl --user start paycue-lnd@studio paycue-lnd@player paycue-payouts paycue-wallet paycue-game paycue-contributions paycue-landing"
