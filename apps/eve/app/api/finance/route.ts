import { db, RECEIPT_CATEGORIES, RECEIPT_PROJECTION, type ReceiptRow } from "@/agent/lib/receipts-db";
import { apiError } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import { requireWebAuth } from "@/lib/web-auth";

interface FinanceReceipt {
  id: number;
  merchant: string;
  total: number;
  currency: string;
  category: string;
  purchasedAt: string;
  notes: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;

  if (capabilityMap().finance.state !== "ready") {
    return apiError(request, 503, "finance_not_configured", "Finance is not configured.");
  }

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 50;
  const category = url.searchParams.get("category");
  if (category !== null && !RECEIPT_CATEGORIES.includes(category as (typeof RECEIPT_CATEGORIES)[number])) {
    return Response.json({ error: "Unknown receipt category." }, { status: 400 });
  }

  try {
    const sql = db();
    const rows = category === null
      ? await sql.query(`SELECT ${RECEIPT_PROJECTION} FROM receipts ORDER BY purchased_at DESC, id DESC LIMIT $1`, [limit])
      : await sql.query(`SELECT ${RECEIPT_PROJECTION} FROM receipts WHERE category = $1 ORDER BY purchased_at DESC, id DESC LIMIT $2`, [category, limit]);

    const receipts = (rows as ReceiptRow[]).map<FinanceReceipt>((receipt) => ({
      id: receipt.id,
      merchant: receipt.merchant,
      total: receipt.total,
      currency: receipt.currency.toUpperCase(),
      category: receipt.category,
      purchasedAt: receipt.purchased_at,
      notes: receipt.notes,
    }));

    const totals = new Map<string, { currency: string; total: number; count: number }>();
    const categoryTotals = new Map<string, { currency: string; category: string; total: number; count: number }>();
    for (const receipt of receipts) {
      const total = totals.get(receipt.currency) ?? { currency: receipt.currency, total: 0, count: 0 };
      total.total += receipt.total;
      total.count += 1;
      totals.set(receipt.currency, total);

      const categoryKey = `${receipt.currency}:${receipt.category}`;
      const categoryTotal = categoryTotals.get(categoryKey) ?? {
        currency: receipt.currency,
        category: receipt.category,
        total: 0,
        count: 0,
      };
      categoryTotal.total += receipt.total;
      categoryTotal.count += 1;
      categoryTotals.set(categoryKey, categoryTotal);
    }

    return Response.json({
      receipts,
      totals: [...totals.values()].map((total) => ({ ...total, total: Number(total.total.toFixed(2)) })),
      categoryTotals: [...categoryTotals.values()]
        .map((total) => ({ ...total, total: Number(total.total.toFixed(2)) }))
        .sort((a, b) => b.total - a.total),
    });
  } catch (error) {
    console.error("Finance query failed", error);
    return apiError(
      request,
      503,
      "finance_unavailable",
      "Finance data is unavailable. Check the database and receipt migration.",
    );
  }
}
