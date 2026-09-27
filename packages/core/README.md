# @payhook/core

Durable, policy-controlled Lightning payouts. Zero dependencies.

Payhook turns application events into payout obligations that survive
duplicate events, crashes and uncertain provider responses. The core pays
BOLT11 invoices only; destinations, nodes and storage are modules.

```ts
import { PayhookRuntime, MemoryStorage, defaultPolicy } from "@payhook/core";

const runtime = new PayhookRuntime({ storage, provider, resolvers, policy: defaultPolicy() });
runtime.startWorker();
runtime.submit(event, { obligationKey, recipient, amountMsat, reason, policyVersion });
```

- **Obligation keys**: a delivery or obligation seen twice never pays twice.
- **Resolvers** turn a recipient into an invoice; the runtime checks the amount itself.
- **Providers** pay invoices; uncertain payments are only re-sent with the same invoice.
- **Policy**: ordered rules that allow, deny with a reason, or hold.
- **Evidence** on every payout; `publicPayout()` strips private resolver state.

Run one executor per storage. Node 22.5+.
