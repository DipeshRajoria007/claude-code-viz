import { useMeta } from "../api/queries";
import { formatUsd } from "../lib/format";

/**
 * Every dollar figure in the app is an estimate computed from token counts
 * and a bundled pricing table — this badge keeps that honest.
 */
export function CostBadge(props: { usd: number | null; className?: string }) {
  const meta = useMeta();
  return (
    <span
      className={props.className}
      title={`Estimate from token counts × pricing table (as of ${meta.data?.pricingAsOf ?? "?"}). Actual billing may differ.`}
    >
      {formatUsd(props.usd)}
      <span className="ml-0.5 align-super text-[9px] text-zinc-500">est</span>
    </span>
  );
}
