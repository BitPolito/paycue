# @payhook/lnurl

Resolves Lightning Addresses (`name@domain`, LUD-16) through LNURL-pay into a
fresh invoice for the exact amount.

```ts
import { LightningAddressResolver } from "@payhook/lnurl";
const resolvers = [new LightningAddressResolver()];
```
