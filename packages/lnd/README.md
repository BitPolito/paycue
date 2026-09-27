# @paycue/lnd

LND payment provider for Paycue. The REST transport uses only `node:https`.

```ts
import { LndPaymentProvider, LndRestTransport } from "@paycue/lnd";

const provider = new LndPaymentProvider({
  transport: new LndRestTransport({
    url: "https://127.0.0.1:8080",
    macaroon: "/path/to/paycue.macaroon", // bake one: offchain:read offchain:write info:read
    tlsCert: "/path/to/tls.cert",
  }),
});
```

RPC errors are reported as uncertain, never as failures: only an explicit
`FAILED` payment status proves a payment failed.
