"use client";

import { Loader } from "@cloudflare/kumo";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { AGENT_NAME } from "@/lib/identity";

interface FinanceReceipt {
  id: number;
  merchant: string;
  total: number;
  currency: string;
  category: string;
  purchasedAt: string;
  notes: string | null;
}

interface FinanceData {
  receipts: FinanceReceipt[];
  totals: { currency: string; total: number; count: number }[];
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function FinancePanel() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/finance")
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | (FinanceData & { error?: string })
          | { error?: string }
          | null;
        if (!response.ok) throw new Error(body?.error ?? "Finance data could not be loaded.");
        return body as FinanceData;
      })
      .then(setData)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Finance data could not be loaded.");
      });
  }, []);

  if (error !== null) {
    return (
      <div className="flex gap-3 rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 p-4 text-sm">
        <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-kumo-danger" aria-hidden />
        <p>{error}</p>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader size={18} />
      </div>
    );
  }
  if (data.receipts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-kumo-subtle">
        No receipts recorded yet. Share a receipt in chat and ask {AGENT_NAME} to log it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {data.totals.map((total) => (
          <div key={total.currency} className="rounded-xl border border-kumo-hairline p-4">
            <p className="text-xs text-kumo-subtle">Shown receipts total · {total.currency}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {formatMoney(total.total, total.currency)}
            </p>
            <p className="mt-1 text-xs text-kumo-subtle">
              {total.count} {total.count === 1 ? "receipt" : "receipts"} shown
            </p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold">Recent receipts</h3>
        <p className="mt-0.5 text-xs text-kumo-subtle">
          A record of receipts {AGENT_NAME} logged—not a bank or card balance.
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-kumo-hairline">
          <table className="hidden w-full text-sm sm:table">
            <thead className="bg-kumo-tint text-xs text-kumo-subtle">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">Merchant</th>
                <th className="px-4 py-2.5 text-start font-medium">Category</th>
                <th className="px-4 py-2.5 text-start font-medium">Date</th>
                <th className="px-4 py-2.5 text-end font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.receipts.map((receipt) => (
                <tr key={receipt.id} className="border-t border-kumo-hairline">
                  <td className="max-w-64 px-4 py-3">
                    <p className="truncate font-medium">{receipt.merchant}</p>
                    {receipt.notes && (
                      <p className="truncate text-xs text-kumo-subtle">{receipt.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize text-kumo-subtle">{receipt.category}</td>
                  <td className="px-4 py-3 text-kumo-subtle">
                    {new Date(receipt.purchasedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-end font-medium tabular-nums">
                    {formatMoney(receipt.total, receipt.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-kumo-hairline sm:hidden">
            {data.receipts.map((receipt) => (
              <li key={receipt.id} className="flex items-start justify-between gap-4 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{receipt.merchant}</p>
                  <p className="mt-1 text-xs text-kumo-subtle capitalize">
                    {receipt.category} · {new Date(receipt.purchasedAt).toLocaleDateString()}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">
                  {formatMoney(receipt.total, receipt.currency)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
