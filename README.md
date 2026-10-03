# Paycue

**An embeddable runtime for durable, policy-controlled Lightning payouts.**

Paycue turns application events into explainable, recoverable Lightning payout
obligations. The host application supplies events and business rules; Paycue
persists the obligation, enforces payment safety, and recovers from duplicate
events, process crashes, and uncertain provider responses.

The core settles over Lightning only and knows nothing about specific nodes,
networks or assets. Everything else is a module:

```
trigger -> hook -> proposal -> policy -> resolver -> invoice -> provider -> evidence
 (github,   (host    (msat,     (rules,   (bolt11,   (checked   (lnd, ...)
  game...)   rules)   key)       reasons)  lnurl,      by core)
                                           kaleidoswap)
```

Built by [BitPolito](https://bitpolito.it), Politecnico di Torino's Bitcoin
student team, and first shown at bitcoin++ Berlin 2026, payments edition.
The talk's slides are in [`demo/landing/public/slides.pdf`](demo/landing/public/slides.pdf).

## Packages

| Package | What it does |
|---|---|
| `@paycue/core` | State machine, runtime, policy rules, events, storage contract. Zero dependencies. |
| `@paycue/sqlite` | Durable storage on Node's built-in `node:sqlite` (Node 22.5+). |
| `@paycue/lnd` | LND payment provider with a fetch-free REST transport (`node:https` only). |
| `@paycue/lnurl` | Lightning Address / LNURL-pay resolver. |
| `@paycue/kaleidoswap` | KaleidoSwap pay-through resolver: pay Liquid, Bitcoin and Arkade destinations. |
| `@paycue/github` | GitHub webhook adapter and merged-PR reward hook. |
| `@paycue/server` | Run Paycue as a service: HTTP API, live events, operator console, `PaycueClient`. |

Modules declare `@paycue/core` as a peer dependency, so an application always
has exactly one runtime. `npm run pack` builds every package into an
installable tarball under `demo/vendor/`.

## Core concepts

- **Obligation key.** The business identity of a payout. A delivery or an
  obligation seen twice never creates a second payout, and both are recorded
  in one transaction.
- **Resolver.** Turns a recipient into an invoice for exactly the authorized
  amount. The runtime decodes and checks every invoice itself, so a resolver
  cannot change the amount. The resolver is chosen once and never switched.
- **Provider.** Pays a BOLT11 invoice and reports what it knows. An uncertain
  payment is only ever re-sent with the same invoice, never a new one.
- **Policy.** An ordered list of rules. Each allows, denies with a reason, or
  holds. `defaultPolicy()` gives a pause switch, a per-payout cap, a
  per-recipient window and a total budget; spread it and add your own
  functions. Uncertain payouts count against limits.
- **Several apps, one service.** `forClient("game", rule)` applies a rule to
  one client's payouts and counts only that client's payouts, so the game's
  coins never use up a contributor's bounty allowance. Unwrapped rules, like
  the budget and the pause switch, are shared.
- **Who sets a limit.** Your rules are the *operator's*. Routes also report
  the limits imposed by the *network*, the *receiver* and any *provider* on
  the route, so every refusal can say who refused.
- **Evidence.** Every decision is recorded with who made it: policy, runtime,
  resolver or provider. `publicPayout()` strips private resolver state (such
  as swap credentials) from anything that leaves the process.
- **Events.** `runtime.on()` streams every change; `consoleLogger()` is the
  default log adapter.
- **Worker.** `processPending()` drives open payouts; `startWorker()` calls it
  on an interval. Run one executor per storage.

```ts
import { PaycueRuntime, defaultPolicy } from "@paycue/core";
import { SQLiteStorage } from "@paycue/sqlite";
import { LndPaymentProvider, LndRestTransport } from "@paycue/lnd";
import { LightningAddressResolver } from "@paycue/lnurl";
import { PayThroughResolver } from "@paycue/kaleidoswap";

const runtime = new PaycueRuntime({
  storage: new SQLiteStorage("payouts.sqlite"),
  provider: new LndPaymentProvider({
    transport: new LndRestTransport({ url, macaroon, tlsCert }),
  }),
  resolvers: [new LightningAddressResolver(), new PayThroughResolver({ defaultAsset: "L-USDT" })],
  policy: defaultPolicy({ budgetMsat: 5_000_000_000n }),
});
runtime.startWorker();
runtime.submit(event, { obligationKey, recipient, amountMsat, reason, policyVersion });
```

## Repository layout

- `packages/`: the library, one npm package each.
- `examples/github-webhook`: a GitHub webhook receiver on the fake provider.
- `demo/`: the showcase, a separate project that installs the packed
  `@paycue` tarballs exactly as a user would:
  - `demo/payout-service`: the shared Paycue both demos pay through, with the operator console
  - `demo/game`: Orbital Sats, the game demo
  - `demo/contributions`: the bounty board, the contribution reward demo
  - `demo/landing`: the overview page
  - `demo/player-wallet`: the demo player's Lightning Address and Liquid wallet
  - `demo/infra`: nodes, services, moving between machines

## Development

Requires Node.js 22.5 or newer (24 tested).

```sh
npm install
npm test        # builds and tests the library
npm run pack    # packs every package into demo/vendor/
cd demo && npm install && npm test   # the demo, on the packed packages
```

## Run the demos yourself

### On your laptop, in fake mode (five minutes, no node)

Fake mode runs the real stack, with the real runtime, SQLite storage, policy,
webhook checks and evidence. Only the last step is swapped: `FakePaymentProvider` from
`@paycue/core` stands in for the Lightning node and reports every invoice as
paid, so no money moves and no node is needed.

```sh
cd demo
npm install
npm run build

export PAYCUE_DEMO_HOME=$PWD/.demo-home PAYCUE_MODE=fake
node payout-service/dist/server.js &   # :8089, operator console; writes the tokens first
sleep 2
npm start -w game &                     # :8090, Orbital Sats
node contributions/dist/server.js &     # :8092, bounty board
node landing/dist/server.js &           # :8088, overview
```

Open <http://localhost:8088>. The operator console at <http://localhost:8089>
asks for the `admin` token from `$PAYCUE_DEMO_HOME/payout-service/tokens.json`.

Each demo has a **Try to break it** control that sends forged, replayed and
oversized requests, so you can watch them refused.

- **Game:** pilot `ada`, **Use the demo Lightning wallet**, **Launch**. Tick
  **Money glitch** to watch replays get ignored and the per-recipient rule
  deny payouts. Set `GAME_PER_MINUTE=8` on the payout service to hit the
  limit sooner.
- **Bounty board:** start it with `GITHUB_WEBHOOK_SECRET=s3cret`, then rehearse
  a merge with the same signed webhooks GitHub would send:

  ```sh
  GITHUB_WEBHOOK_SECRET=s3cret node contributions/test/simulate.mjs \
    --issue 12 --sats 60000 --login ada --address ada@localhost:8091
  ```

The player wallet (`:8091`) needs a real LND node, so it is not part of fake
mode.

### On signet, with real nodes

Two LND nodes on Mutinynet, the KaleidoSwap signet maker for Liquid payouts,
and systemd user services for everything above. Machine requirements, setup
scripts and moving the stack between machines are in
[demo/infra/README.md](demo/infra/README.md); the on-stage runbook is
[docs/DEMO.md](docs/DEMO.md).

## Further reading

- [docs/DEMO.md](docs/DEMO.md): the demo runbook
- [docs/PLAN.md](docs/PLAN.md): the plan
- [docs/QUESTIONS.md](docs/QUESTIONS.md): open decisions
- [docs/talk/ARTICLE.md](docs/talk/ARTICLE.md): the article draft

## License

MIT, Copyright (c) 2026 BitPolito. See [LICENSE](LICENSE).
