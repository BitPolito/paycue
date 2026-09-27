# @payhook/kaleidoswap

Pay Liquid, Bitcoin and Arkade destinations from Lightning through a
KaleidoSwap maker's pay-through swap. Payhook pays the maker's hold invoice;
the maker sends the asset (e.g. L-USDT) to the destination and only then
settles. The address leg is operator-trusted.

```ts
import { PayThroughResolver } from "@payhook/kaleidoswap";
const resolvers = [new PayThroughResolver({ defaultAsset: "L-USDT", maxFeeBps: 300 })];
// recipient: "tlq1..." or "liquid:tlq1...?asset=L-USDT"
```

Defaults to the signet maker. `swapAuth` is kept as private resolver state and
never leaves the process.
