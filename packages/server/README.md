# @payhook/server

Run Payhook as a service. Several applications submit payouts over HTTP to
one runtime, so one executor decides every payout from a node and budgets and
limits see all of them. Includes a neutral operator console at `/`.

```ts
import { createServer } from "node:http";
import { createPayhookServer } from "@payhook/server";

const server = createPayhookServer({
  runtime, storage, pause,
  adminToken: process.env.PAYHOOK_ADMIN_TOKEN,
  clients: [{ id: "game", token: process.env.GAME_TOKEN, label: "Game demo" }],
});
createServer(server.handler).listen(8089);
```

| Route | Who | |
|---|---|---|
| `POST /v1/payouts` | client | `{deliveryId, obligationKey, recipient, amountSat, reason}`; obligation keys are namespaced per client |
| `GET /v1/payouts`, `/v1/payouts/:id` | client (own) / operator (all) | public projections only |
| `GET /v1/events` | client (own) / operator (all) | server-sent events; `?token=` for EventSource |
| `GET /v1/policy` | any token | operator rules plus each route's limits and who sets them |
| `GET /v1/admin/status`, `POST /v1/admin/pause`, `/resume`, `/actions/:name` | operator | |
