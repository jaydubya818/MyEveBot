import { prepareAuthenticatedLocalFactoryInputV4 } from "../engineering/factory-authenticated-result.ts";
import type { LocalFactoryBindingV4 } from "../engineering/factory-receipt-store.ts";
import { QDEV_BASELINE, type QualificationProjectInput } from "../external-alpha/qualification-accounting.ts";

/**
 * Relay -> MyFactory dispatch contract. The Work admission itself comes from the
 * existing trusted request admission (workId, request, work order, run, attempt,
 * configuration); this module only proves the admitted binding is exactly the
 * approved FactoryVersion and starts from exactly the approved input commit/tree
 * (the dashboard baseline, or the preceding accepted candidate). It reuses the
 * existing V4 binding validator and creates no accounting or authority.
 */
export class FactoryDispatchRefused extends Error {
  constructor(readonly code: string) { super(code); }
}
export type StageStart = { commit: string; tree: string };

export function bindFactoryDispatch(input: {
  admitted: unknown; project: QualificationProjectInput; stage: 1 | 2 | 3; start: StageStart | null; baseline?: StageStart;
}): LocalFactoryBindingV4 {
  const expectedStart = input.stage === 1
    ? (input.baseline ?? { commit: QDEV_BASELINE.inputCommit as string, tree: QDEV_BASELINE.inputTree as string })
    : input.start;
  if (!expectedStart) throw new FactoryDispatchRefused("QDEV_DISPATCH_START_REQUIRED");
  let binding: LocalFactoryBindingV4;
  try { binding = prepareAuthenticatedLocalFactoryInputV4(input.admitted); }
  catch { throw new FactoryDispatchRefused("QDEV_DISPATCH_BINDING_INVALID"); }
  if (binding.factoryVersion !== input.project.factoryVersionSha256) throw new FactoryDispatchRefused("QDEV_DISPATCH_FACTORY_VERSION");
  if (binding.inputCommit !== expectedStart.commit || binding.inputTree !== expectedStart.tree) throw new FactoryDispatchRefused("QDEV_DISPATCH_START_MISMATCH");
  return binding;
}
