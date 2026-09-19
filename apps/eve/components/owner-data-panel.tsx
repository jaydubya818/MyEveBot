"use client";

import { Badge, Button, Loader } from "@cloudflare/kumo";
import {
  ArchiveIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  ShieldCheckIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { WhatMyEveKnowsPanel } from "@/components/what-myeve-knows-panel";

interface InventoryItem {
  id: string;
  name: string;
  description: string;
  recordCount: number;
  approximateBytes: number;
  completeness: "complete" | "partial" | "metadata_only" | "referenced_only" | "unavailable";
  portability: "fully_restorable" | "restorable_with_reconnection" | "partially_restorable" | "non_restorable" | "reference_only" | "unavailable";
  ownerScope: "owner_scoped" | "single_owner_legacy";
  notes: string[];
}

interface DataOperation {
  id: string;
  type: string;
  status: "running" | "completed" | "partially_completed" | "failed";
  archiveVersion: number | null;
  recordCount: number | null;
  errorSummary: string | null;
  createdAt: string;
}

interface InventoryResponse {
  generatedAt: string;
  inventory: InventoryItem[];
  exclusions: string[];
  retention: Array<{ dataClass: string; policy: string }>;
  history: DataOperation[];
}

interface ArchiveValidation {
  valid: true;
  exportedAt: string;
  version: number;
  fileCount: number;
  recordCount: number;
  uncompressedBytes: number;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function OwnerDataNavigation({ view, onChange }: { view: "knowledge" | "backup"; onChange: (view: "knowledge" | "backup") => void }) {
  return (
    <nav className="flex gap-1 rounded-xl border border-kumo-hairline bg-kumo-elevated p-1" aria-label="Owner Data Center">
      <button type="button" className={view === "knowledge" ? "rounded-lg bg-kumo-tint px-3 py-2 text-sm font-medium" : "rounded-lg px-3 py-2 text-sm text-kumo-subtle hover:text-kumo-default"} onClick={() => onChange("knowledge")}>What MyEve Knows</button>
      <button type="button" className={view === "backup" ? "rounded-lg bg-kumo-tint px-3 py-2 text-sm font-medium" : "rounded-lg px-3 py-2 text-sm text-kumo-subtle hover:text-kumo-default"} onClick={() => onChange("backup")}>Backup & recovery</button>
    </nav>
  );
}

export function OwnerDataBackupErrorState({ message, onNavigate, onRetry }: { message: string; onNavigate: (view: "knowledge" | "backup") => void; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <OwnerDataNavigation view="backup" onChange={onNavigate} />
      <section className="flex items-start gap-3 rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 p-4 text-sm" aria-live="polite">
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-kumo-danger text-[10px] font-bold text-kumo-danger" aria-hidden>!</span>
        <div className="flex-1">
          <h3 className="font-medium">Unable to load backup data</h3>
          <p className="mt-1 text-kumo-subtle">{message}</p>
          <button type="button" className="mt-3 rounded-lg border border-kumo-hairline bg-kumo-elevated px-3 py-1.5 text-sm font-medium hover:bg-kumo-tint" onClick={onRetry}>Retry</button>
        </div>
      </section>
    </div>
  );
}

export function OwnerDataPanel() {
  const [view, setView] = useState<"knowledge" | "backup">("knowledge");
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ArchiveValidation | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadInventory = useCallback(async () => {
    setLoadingInventory(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/owner-data", { cache: "no-store" });
      if (!response.ok) throw new Error("Your data inventory could not be loaded.");
      setInventory((await response.json()) as InventoryResponse);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Your data inventory could not be loaded.");
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  useEffect(() => {
    if (view === "backup" && inventory === null && loadError === null && !loadingInventory) {
      void loadInventory();
    }
  }, [inventory, loadError, loadInventory, loadingInventory, view]);

  async function downloadArchive() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch("/api/owner-data?download=1", { cache: "no-store" });
      if (!response.ok) throw new Error("Your archive could not be prepared. Please retry.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "myeve-backup.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Your archive could not be prepared.");
    } finally {
      setDownloading(false);
    }
  }

  async function verifyArchive(file: File) {
    setValidating(true);
    setValidation(null);
    setValidationError(null);
    const form = new FormData();
    form.set("archive", file);
    try {
      const response = await fetch("/api/owner-data", { method: "POST", body: form });
      const body = (await response.json()) as { validation?: ArchiveValidation; error?: { message?: string } };
      if (!response.ok || !body.validation) throw new Error(body.error?.message ?? "The archive could not be verified.");
      setValidation(body.validation);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "The archive could not be verified.");
    } finally {
      setValidating(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const navigation = <OwnerDataNavigation view={view} onChange={setView} />;

  if (view === "knowledge") return <div className="flex flex-col gap-5">{navigation}<WhatMyEveKnowsPanel /></div>;

  if (loadError) {
    return <OwnerDataBackupErrorState message={loadError} onNavigate={setView} onRetry={() => void loadInventory()} />;
  }
  if (!inventory) return <div className="flex flex-col gap-5">{navigation}<div className="flex justify-center py-8"><Loader size={18} /></div></div>;

  const totalRecords = inventory.inventory.reduce((total, item) => total + item.recordCount, 0);
  const totalBytes = inventory.inventory.reduce((total, item) => total + item.approximateBytes, 0);

  return (
    <div className="flex flex-col gap-6">
      {navigation}
      <section className="rounded-xl border border-kumo-hairline bg-kumo-tint p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-kumo-recessed">
              <ArchiveIcon className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="text-sm font-semibold">Portable owner archive</h3>
              <p className="mt-1 max-w-xl text-sm text-kumo-subtle">
                Create a verified, provider-neutral backup of your MyEve data with explicit coverage for files and connected apps.
              </p>
              <p className="mt-2 text-xs text-kumo-subtle">{totalRecords.toLocaleString()} records · approximately {formatBytes(totalBytes)}</p>
            </div>
          </div>
          <Button size="sm" icon={DownloadSimpleIcon} loading={downloading} onClick={() => void downloadArchive()}>
            Download archive
          </Button>
        </div>
        {downloadError && <p className="mt-3 flex items-center gap-1.5 text-sm text-kumo-danger"><WarningCircleIcon className="size-4" aria-hidden />{downloadError}</p>}
      </section>

      <section>
        <h3 className="text-sm font-semibold">Included data</h3>
        {inventory.inventory.length === 0 ? (
          <p className="mt-2 rounded-xl border border-kumo-hairline py-6 text-center text-sm text-kumo-subtle">No exportable data was found.</p>
        ) : <ul className="mt-2 divide-y divide-kumo-hairline rounded-xl border border-kumo-hairline px-3">
          {inventory.inventory.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{item.name}</p>
                  <Badge variant={item.completeness === "complete" ? "success" : item.completeness === "unavailable" ? "destructive" : "secondary"}>
                    {statusLabel(item.completeness)}
                  </Badge>
                  {item.ownerScope === "single_owner_legacy" && <Badge variant="secondary">Single-owner legacy</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-kumo-subtle">{item.description}</p>
                <p className="mt-1 text-xs text-kumo-subtle">{statusLabel(item.portability)}</p>
                {item.notes.map((note) => <p key={note} className="mt-1 text-xs text-kumo-subtle">{note}</p>)}
              </div>
              <div className="text-right text-xs tabular-nums text-kumo-subtle">
                <p>{item.recordCount.toLocaleString()} records</p>
                <p>{formatBytes(item.approximateBytes)}</p>
              </div>
            </li>
          ))}
        </ul>}
      </section>

      <section>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Verify a backup</h3>
          <Badge variant="secondary">Read-only</Badge>
        </div>
        <p className="mt-1 text-sm text-kumo-subtle">
          Check the archive format and every file checksum. Verification never changes your current MyEve data.
        </p>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept=".zip,application/zip"
          aria-label="Choose a MyEve archive to verify"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void verifyArchive(file);
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" icon={UploadSimpleIcon} loading={validating} onClick={() => inputRef.current?.click()}>
            Choose archive
          </Button>
          {validation && (
            <span className="flex items-center gap-1.5 text-sm text-kumo-success">
              <CheckCircleIcon className="size-4" weight="fill" aria-hidden />
              Verified {validation.recordCount.toLocaleString()} records from {new Date(validation.exportedAt).toLocaleDateString()}
            </span>
          )}
          {validationError && (
            <span className="flex items-center gap-1.5 text-sm text-kumo-danger">
              <WarningCircleIcon className="size-4" aria-hidden />
              {validationError}
            </span>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-kumo-hairline p-4">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-kumo-success" aria-hidden />
            <h3 className="text-sm font-semibold">Sensitive data excluded</h3>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-kumo-subtle">
            {inventory.exclusions.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
        <div className="rounded-xl border border-kumo-hairline p-4">
          <h3 className="text-sm font-semibold">Retention</h3>
          <dl className="mt-3 space-y-3">
            {inventory.retention.map((item) => (
              <div key={item.dataClass}>
                <dt className="text-xs font-medium">{item.dataClass}</dt>
                <dd className="mt-0.5 text-xs text-kumo-subtle">{item.policy}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold">History</h3>
        {inventory.history.length === 0 ? (
          <p className="mt-2 rounded-xl border border-kumo-hairline py-6 text-center text-sm text-kumo-subtle">No Data Center operations yet.</p>
        ) : (
          <ol className="mt-2 divide-y divide-kumo-hairline rounded-xl border border-kumo-hairline px-3">
            {inventory.history.map((operation) => (
              <li key={operation.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize">{operation.type.replaceAll("_", " ")}</p>
                  <p className="mt-0.5 text-xs text-kumo-subtle">{new Date(operation.createdAt).toLocaleString()}</p>
                </div>
                {operation.recordCount !== null && <span className="text-xs tabular-nums text-kumo-subtle">{operation.recordCount.toLocaleString()} records</span>}
                <Badge variant={operation.status === "completed" ? "success" : operation.status === "failed" ? "destructive" : "secondary"}>{operation.status}</Badge>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-xs text-kumo-subtle">
        Import is intentionally disabled until merge-versus-replace behavior and rollback are approved. The current recovery step proves that a downloaded archive is complete and unmodified.
      </p>
    </div>
  );
}
