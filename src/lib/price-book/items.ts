import { and, asc, eq } from "drizzle-orm";
import { priceBookItems, type PriceBookItem, type PriceBookKind } from "@/db/schema";
import type { AppTx } from "@/db/client";

/**
 * The starting price book, from build-plan M4: roof painting, repairs,
 * re-roofing, spouting, moss and lichen treatment, plus leak repairs and
 * roof prep — the last two are what keep quote days full over winter
 * (spec section 9).
 *
 * These rates are a fictional starting point, not advice: every roofer
 * edits them to his own pricing at onboarding. They exist so a new tenant
 * can build a quote on day one instead of facing an empty list.
 */
export const DEFAULT_PRICE_BOOK: ReadonlyArray<{
  name: string;
  kind: PriceBookKind;
  unitPriceCents: number;
  unit: string;
  category: string;
}> = [
  { name: "Roof painting", kind: "per_m2", unitPriceCents: 4_850, unit: "m²", category: "Painting" },
  { name: "Roof prep — wash and prime", kind: "per_m2", unitPriceCents: 1_800, unit: "m²", category: "Painting" },
  { name: "Re-roofing", kind: "per_m2", unitPriceCents: 18_500, unit: "m²", category: "Roofing" },
  { name: "Roof repairs", kind: "fixed", unitPriceCents: 45_000, unit: "job", category: "Repairs" },
  { name: "Leak repairs", kind: "fixed", unitPriceCents: 38_000, unit: "job", category: "Repairs" },
  { name: "Spouting replacement", kind: "per_metre", unitPriceCents: 6_200, unit: "m", category: "Spouting" },
  { name: "Moss and lichen treatment", kind: "per_m2", unitPriceCents: 1_250, unit: "m²", category: "Treatment" },
];

export async function listPriceBook(tx: AppTx, tenantId: string, includeInactive = false): Promise<PriceBookItem[]> {
  const where = includeInactive
    ? eq(priceBookItems.tenantId, tenantId)
    : and(eq(priceBookItems.tenantId, tenantId), eq(priceBookItems.active, true));

  return tx
    .select()
    .from(priceBookItems)
    .where(where)
    .orderBy(asc(priceBookItems.sortOrder), asc(priceBookItems.name));
}

/**
 * Fills an empty price book with the standard list. Does nothing if the
 * roofer already has items — his own pricing is never overwritten, however
 * many times this is called.
 */
export async function seedPriceBook(tx: AppTx, tenantId: string): Promise<PriceBookItem[]> {
  const existing = await listPriceBook(tx, tenantId, true);
  if (existing.length > 0) return existing;

  return tx
    .insert(priceBookItems)
    .values(DEFAULT_PRICE_BOOK.map((item, index) => ({ ...item, tenantId, sortOrder: index })))
    .returning();
}

export async function createPriceBookItem(
  tx: AppTx,
  tenantId: string,
  input: { name: string; kind: PriceBookKind; unitPriceCents: number; unit?: string; category?: string },
): Promise<PriceBookItem> {
  const [item] = await tx
    .insert(priceBookItems)
    .values({
      tenantId,
      name: input.name,
      kind: input.kind,
      unitPriceCents: input.unitPriceCents,
      unit: input.unit,
      category: input.category,
    })
    .returning();
  return item;
}

export async function updatePriceBookItem(
  tx: AppTx,
  tenantId: string,
  itemId: string,
  input: { name?: string; unitPriceCents?: number; unit?: string | null; category?: string | null; active?: boolean },
): Promise<PriceBookItem | null> {
  const [item] = await tx
    .update(priceBookItems)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(priceBookItems.tenantId, tenantId), eq(priceBookItems.id, itemId)))
    .returning();
  return item ?? null;
}

/**
 * Retires an item rather than deleting it. Quote lines snapshot their own
 * description and rate, so a deleted item wouldn't corrupt an existing
 * quote — but a roofer who stops offering re-roofing this winter will want
 * it back next spring, and his old quotes should still make sense.
 */
export async function deactivatePriceBookItem(tx: AppTx, tenantId: string, itemId: string): Promise<void> {
  await updatePriceBookItem(tx, tenantId, itemId, { active: false });
}
