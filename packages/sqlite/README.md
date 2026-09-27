# @paycue/sqlite

Durable Paycue storage on Node's built-in `node:sqlite` (Node 22.5+).
Delivery and payout are recorded in one transaction.

```ts
import { SQLiteStorage } from "@paycue/sqlite";
const storage = new SQLiteStorage("payouts.sqlite");
```
