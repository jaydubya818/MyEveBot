import type { EngineeringWorkerProjection } from "@/lib/engineering/worker-projection";
import { currentTruthLines } from "@/lib/engineering/current-truth-lines";

export function CurrentWorkTruth({projection}:{projection:EngineeringWorkerProjection}) {
  return <section aria-label="Current Work truth" className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-xs text-kumo-subtle">
    {currentTruthLines(projection).map((line,index)=><p key={index} className="min-w-0 [overflow-wrap:anywhere]">{line}</p>)}
  </section>;
}
