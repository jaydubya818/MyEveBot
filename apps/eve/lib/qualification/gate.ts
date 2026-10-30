import type { QualificationAccounting, QualificationPurpose } from "../external-alpha/qualification-accounting.ts";

type Admission = Parameters<QualificationAccounting["bind"]>[0];

/** Thrown by a provider adapter ONLY when it can prove the request never left
 * the process (e.g. rejected locally before any network write). Anything else
 * thrown after dispatch is ambiguous exposure. */
export class ProviderNotSent extends Error {}
/** A provider result whose usage is measured and final. */
export type KnownOutcome<T> = { known: true; value: T };
/** A provider result whose usage cannot be proven: stays charged and fences. */
export type UnknownOutcome<T> = { known: false; value?: T };

export class QualificationGateRefused extends Error {
  constructor(readonly code: string) { super(code); }
}

/**
 * The single wrapper every charged child (Sofie, coding, Factory, verifier)
 * must pass through. The provider is invoked only after the database accepted
 * the dispatch (exact parent/source binding, ceiling, sequencing) and recorded
 * RUNNING. There is no retry: a refusal or failure never re-sends.
 */
export class QualificationGate {
  constructor(private readonly accounting: QualificationAccounting) {}

  async run<T>(input: {
    admission: Admission; allowanceId: string; operationKey: string;
    purpose: QualificationPurpose; reserveMicrousd: number;
    send: () => Promise<KnownOutcome<T> | UnknownOutcome<T>>;
  }): Promise<T> {
    const { admission: a, allowanceId, operationKey } = input;
    // 1. Admission. Any refusal here means the provider was never contacted.
    try {
      await this.accounting.dispatch(a, allowanceId, operationKey, input.purpose, input.reserveMicrousd);
      await this.accounting.running(a, allowanceId, operationKey);
    } catch (error) {
      const code = /QDEV_[A-Z_]+/.exec(error instanceof Error ? error.message : "")?.[0] ?? "QDEV_UNAVAILABLE";
      // A failure AFTER dispatch was recorded but before running is acknowledged
      // is ambiguous only to the ledger, not the provider (never sent): tombstone it.
      await this.accounting.cancelUnsent(a, allowanceId, operationKey).catch(() => undefined);
      throw new QualificationGateRefused(code);
    }
    // 2. Send exactly once.
    let outcome: KnownOutcome<T> | UnknownOutcome<T>;
    try {
      outcome = await input.send();
    } catch (error) {
      if (error instanceof ProviderNotSent) {
        await this.accounting.cancelUnsent(a, allowanceId, operationKey);
        throw new QualificationGateRefused("QDEV_PROVIDER_NOT_SENT");
      }
      await this.accounting.fence(a);
      throw new QualificationGateRefused("QDEV_EXPOSURE_UNKNOWN");
    }
    // 3. Only proven, measured usage settles. Doubt fences; nothing is refunded.
    if (outcome.known !== true) {
      await this.accounting.fence(a);
      throw new QualificationGateRefused("QDEV_EXPOSURE_UNKNOWN");
    }
    await this.accounting.settle(a, allowanceId, operationKey);
    return outcome.value;
  }

  /** Restart repair: any operation left DISPATCHED/RUNNING has unknown
   * exposure. Fencing is idempotent and never clears or refunds anything. */
  async recoverInterrupted(admission: Admission) { return this.accounting.fence(admission); }
}
