#!/usr/bin/env bash
# Build lnd and lncli with custom-signet block time support (lnd PR #10864),
# needed for neutrino on Mutinynet's 30-second blocks. Only needed on a fresh
# machine without a bundle: export.sh bundles the binaries.
set -euo pipefail
PAYCUE_HOME="${PAYCUE_HOME:-$HOME/paycue-demo}"
SRC="$PAYCUE_HOME/src/lnd"
TAGS="signrpc walletrpc routerrpc invoicesrpc peersrpc neutrinorpc"
command -v go >/dev/null || { echo "Go 1.25+ is required (e.g. 'mise use go@1.25')" >&2; exit 1; }
mkdir -p "$PAYCUE_HOME/bin" "$(dirname "$SRC")"
[ -d "$SRC" ] || git clone --filter=blob:none https://github.com/lightningnetwork/lnd.git "$SRC"
cd "$SRC"
git fetch origin pull/10864/head:signetblocktime
git checkout signetblocktime
go build -tags="$TAGS" -ldflags "-s -w" -o "$PAYCUE_HOME/bin/lnd" ./cmd/lnd
go build -tags="$TAGS" -ldflags "-s -w" -o "$PAYCUE_HOME/bin/lncli" ./cmd/lncli
"$PAYCUE_HOME/bin/lnd" --version
