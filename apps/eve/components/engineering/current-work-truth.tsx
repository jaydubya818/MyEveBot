import type { EngineeringWorkerProjection } from "@/lib/engineering/worker-projection";
import { currentTruthLines } from "@/lib/engineering/current-truth-lines";

export function CurrentWorkTruth({projection}:{projection:EngineeringWorkerProjection}) {
  return <section aria-label="Current Work truth" className="mt-3 grid gap-2 text-xs text-kumo-subtle">
    {currentTruthLines(projection).map((line,index)=><p key={index} className="break-words">{line}</p>)}
  </section>;
}
