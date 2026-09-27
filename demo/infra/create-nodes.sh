#!/usr/bin/env bash
# Create brand-new studio and player nodes on Mutinynet (new wallets, no
# funds). Only for a fresh setup; to move existing funds use export/import.
#   demo/infra/build-lnd.sh && demo/infra/create-nodes.sh && demo/infra/install.sh
set -euo pipefail
PAYCUE_HOME="${PAYCUE_HOME:-$HOME/paycue-demo}"
umask 077

make_node() {
  local name=$1 rpc=$2 rest=$3 p2p=$4 d="$PAYCUE_HOME/lnd-$1"
  [ -e "$d" ] && { echo "$d exists; refusing to overwrite a node" >&2; exit 1; }
  mkdir -p "$d"
  cat > "$d/lnd.conf" <<EOF
[Application Options]
alias=paycue-$name
lnddir=$d
rpclisten=127.0.0.1:$rpc
restlisten=127.0.0.1:$rest
listen=0.0.0.0:$p2p
debuglevel=info
maxpendingchannels=5
accept-keysend=true
wallet-unlock-password-file=$d/wallet-password
wallet-unlock-allow-create=true
feeurl=https://mutinynet.com/api/v1/fees/recommended

[Bitcoin]
bitcoin.signet=true
bitcoin.node=neutrino
bitcoin.signetchallenge=512102f7561d208dd9ae99bf497273e16f389bdbd6c4742ddb8e6b216e64fa2928ad8f51ae
bitcoin.signetblocktime=30s
bitcoin.defaultchanconfs=1

[neutrino]
neutrino.addpeer=45.79.52.207:38333

[protocol]
protocol.wumbo-channels=true
EOF
  head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$d/wallet-password"
}

init_wallet() {
  local name=$1 rest=$2 rpc=$3 d="$PAYCUE_HOME/lnd-$1"
  "$PAYCUE_HOME/bin/lnd" --configfile="$d/lnd.conf" > "$d/first-run.log" 2>&1 &
  local pid=$!
  for _ in $(seq 1 60); do curl -sk -m 2 "https://127.0.0.1:$rest/v1/genseed" >/dev/null 2>&1 && break; sleep 1; done
  curl -sk "https://127.0.0.1:$rest/v1/genseed" > "$d/seed.json"
  python3 - "$d" "$rest" <<'PY'
import base64, json, ssl, sys, urllib.request
d, port = sys.argv[1], sys.argv[2]
seed = json.load(open(f"{d}/seed.json"))["cipher_seed_mnemonic"]
password = open(f"{d}/wallet-password").read().strip().encode()
body = json.dumps({"wallet_password": base64.b64encode(password).decode(), "cipher_seed_mnemonic": seed}).encode()
urllib.request.urlopen(urllib.request.Request(f"https://127.0.0.1:{port}/v1/initwallet", data=body, method="POST"), context=ssl._create_unverified_context())
PY
  sleep 5
  local cli="$PAYCUE_HOME/bin/lncli --lnddir=$d --network=signet --rpcserver=127.0.0.1:$rpc"
  if [ "$name" = studio ]; then
    $cli bakemacaroon --save_to="$d/paycue.macaroon" offchain:read offchain:write info:read onchain:read invoices:read >/dev/null
  else
    $cli bakemacaroon --save_to="$d/wallet.macaroon" invoices:read invoices:write info:read offchain:read onchain:read >/dev/null
  fi
  kill "$pid"; wait "$pid" 2>/dev/null || true
  echo "$name: created ($(python3 -c "import json;print(len(json.load(open('$d/seed.json'))['cipher_seed_mnemonic']))")-word seed in $d/seed.json)"
}

[ -x "$PAYCUE_HOME/bin/lnd" ] || { echo "Run build-lnd.sh first" >&2; exit 1; }
make_node studio 10009 8080 9735
make_node player 10010 8081 9736
init_wallet studio 8080 10009
init_wallet player 8081 10010
echo "Next: demo/infra/install.sh, start the services, fund the studio node, then demo/infra/liquidity.sh"
