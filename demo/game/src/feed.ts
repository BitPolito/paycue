/**
 * How a payout reads in the game's live feed. A payout whose answer was lost
 * (provider `unknown`, or the runtime's `recovered`/`resend` steps) and that
 * then settled is shown as RECOVERED, so the stage can see exactly-once work.
 */

type Evidence = { actor: string; kind: string; detail?: Record<string, unknown> };

export type FeedStatus = {
  /** The chip shown in the feed: the payout state, or `recovered` / `checking`. */
  chip: string;
  note: string | null;
};

export const RECOVERED_NOTE = "Answer lost · confirmed with the node · paid once";
export const CHECKING_NOTE = "Confirming with the node";

/** True once the payout went through an uncertain step: answer lost, recovered or resent. */
export function wasUncertain(evidence: readonly Evidence[]): boolean {
  return evidence.some((e) =>
    (e.actor.startsWith("provider:") && e.kind === "unknown")
    || (e.actor === "runtime" && (e.kind === "recovered" || e.kind === "resend")));
}

function lastReason(evidence: readonly Evidence[]): string | null {
  for (const item of [...evidence].reverse()) {
    const reason = item.detail?.reason;
    if (typeof reason === "string") return reason;
  }
  return null;
}

export function feedStatus(payout: { state: string; evidence: readonly Evidence[] }): FeedStatus {
  if (payout.state === "settled" && wasUncertain(payout.evidence)) return { chip: "recovered", note: RECOVERED_NOTE };
  if (payout.state === "unknown") return { chip: "checking", note: CHECKING_NOTE };
  return { chip: payout.state, note: lastReason(payout.evidence) };
}
