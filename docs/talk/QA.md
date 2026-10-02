# Likely questions and answers

For the 5-minute Q&A. Each answer is grounded in the v0.2 code (file named
where useful). No open uncertainties after the lead's 3 Oct review; if a
question goes beyond these, say "I'll check" rather than guess. Backup slides B1–B3 in `SLIDES.md` support answers 1, 3 and 9.

## 1. Does Paycue hold my funds?

No. Paycue is a library in your process; it tells your node or provider to
pay an invoice and records what happened. The money sits wherever your
provider keeps it, today your own LND, with a macaroon that can only pay and
read payments.

## 2. What about compliance and KYC?

That comes from the provider you pick, not from Paycue. A compliant,
custodial provider such as ZBD would bring its own KYC; a non-custodial one
such as Breez needs none. Both are provider modules still to be built; v0.2
ships LND only.

## 3. How do you stop double payments?

Four layers. Each payout has an **obligation key** (its business identity),
so a re-sent webhook or the same event under a new ID never creates a second
payout. The attempt is **saved before paying**, an uncertain payment is only
ever **re-sent with the same invoice** (a node won't pay one hash twice), and
**uncertain is not failed**: Paycue asks the node's record before deciding
(`packages/core/src/runtime.ts`).

## 4. What do I trust in the KaleidoSwap pay-through?

Paycue pays the maker's hold invoice over Lightning; the maker broadcasts the
Liquid payout and only then settles the invoice, so if it never sends, the
Lightning payment doesn't complete. But the address leg is trusted: there is
no hash lock tying the Liquid transaction to the invoice, so you trust the
maker to send the right amount to the right address. The console shows this
as a provider limit ("no hash lock on the address leg").

## 5. Is it ready for mainnet?

Not yet. It's v0.2, tested on signet with real Lightning payments and real
swaps, not on mainnet; we want an independent review first. (If pressed: our
own review, focused only on payment safety, found five problems, each fixed
with a regression test.)

## 6. Why not just LND and a webhook handler?

That's what we kept writing, and it breaks in the four ways from slide 6:
the webhook arrives twice, the process dies mid-payment, the node's answer
is lost, two payouts race past a limit. Paycue is that glue written once,
with a state machine, policy with reasons and an audit trail, so you don't
rediscover each bug in production.

## 7. What does it cost in fees?

Paycue itself charges nothing; it's MIT. The budget sums payout amounts only
(`committed()` in `packages/core/src/runtime.ts`). Lightning routing fees
come on top, capped per payment by `@paycue/lnd` (default 1%, minimum
10 sat). Swap fees come out of what the recipient receives: the maker's
invoice is for exactly the approved amount, its fee is 0.5% plus miner fees
on signet, and the resolver refuses quotes above 3% (operator-set).

## 8. What if my node is down?

The payout waits; it is never marked failed just because the node didn't
answer. A dispatch that errors becomes `unknown`; lookups are retried by the
worker until the node answers. If the node then has no record, Paycue
re-sends the same invoice (up to 3 sends); if the invoice expired unpaid, the
payout fails; otherwise it is marked `stuck` for a human.

## 9. How do I add a provider?

Implement `PaymentProvider` (`packages/core/src/provider.ts`): three methods,
`decode(invoice)`, `pay(invoice, paymentHash, options)` and
`lookup(paymentHash)`, plus a name, a version and a flag saying whether
re-sending the same invoice is safe. Without that flag Paycue never re-sends;
an unclear payment goes to `stuck` instead.

## 10. What do you know about recipients? Is it private?

Paycue stores the recipient (a Lightning Address or Liquid address), the
amount and the reason in your own database, and `publicPayout()` strips
private resolver state, such as swap credentials, from anything it serves.
Whoever resolves the payment sees what it needs: the Lightning Address
server, or the swap maker, which sees the destination address. In the
bounty demo a `Payout: <address>` line in a PR description is public on
GitHub; contributors can register an address instead.

## 11. Can't players cheat the game?

The client never pays. The game server owns the coin schedule and checks
every reported hit (position, timing, bullet travel) before proposing a
payout, and duplicate hits are ignored by obligation key. Policy then bounds
what any cheat could get: at most 100 sat per payout and 60 payouts per
player per minute, inside a shared 600,000 sat budget.

## 12. What's next?

Batching small payouts until a route's minimum is reached, RGB and Spark
routes, ZBD and Breez providers, and an approval rule: the core already has
an `awaiting_approval` state, but no rule uses it yet. No dates.
