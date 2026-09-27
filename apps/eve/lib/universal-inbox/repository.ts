import type { AttentionItem, Evidence, InboxQuery, OwnerResponse } from "./contracts.ts";

/** All operations MUST be scoped to ownerId, including foreign-key checks. */
export interface AttentionTransaction {
  getItem(ownerId: string, id: string): Promise<AttentionItem | null>;
  saveItem(item: AttentionItem): Promise<void>;
  getEvidence(ownerId: string, id: string): Promise<Evidence | null>;
  saveEvidence(evidence: Evidence): Promise<void>;
  getResponse(ownerId: string, id: string): Promise<OwnerResponse | null>;
  saveResponse(response: OwnerResponse): Promise<void>;
}
export interface AttentionRepository {
  /** Atomic, serialized per item; rollback on throw. Never call a provider inside this callback. */
  transaction<T>(run: (tx: AttentionTransaction) => Promise<T>): Promise<T>;
  get(ownerId: string, id: string): Promise<AttentionItem | null>;
  list(ownerId: string, query: InboxQuery, now: string): Promise<{ items: AttentionItem[]; nextCursor: string | null }>;
  evidence(ownerId: string, itemId: string, afterId?: string): Promise<Evidence[]>;
  pending(ownerId: string, limit: number): Promise<OwnerResponse[]>;
  metrics(ownerId: string): Promise<{ necessaryInterventions: number; avoidableCoordinationRequests: number }>;
}
