"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import {
  createPriceBookItem,
  updatePriceBookItem,
  deactivatePriceBookItem,
  seedPriceBook,
} from "@/lib/price-book/items";
import { parsePriceToCents } from "@/lib/quotes/parse";
import type { PriceBookKind } from "@/db/schema";

export interface PriceBookState {
  error?: string;
}

const KINDS: PriceBookKind[] = ["per_m2", "per_metre", "fixed"];

export async function addPriceBookItemAction(_prev: PriceBookState, formData: FormData): Promise<PriceBookState> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as PriceBookKind;
  const unit = String(formData.get("unit") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const unitPriceCents = parsePriceToCents(String(formData.get("price") ?? ""));

  if (!name) return { error: "Give the item a name." };
  if (!KINDS.includes(kind)) return { error: "Pick how the item is charged." };
  if (unitPriceCents === null) return { error: "Enter a price, like 48.50." };

  try {
    await withRooferAccess(session.tenantId, (tx) =>
      createPriceBookItem(tx, session.tenantId, {
        name,
        kind,
        unitPriceCents,
        unit: unit || undefined,
        category: category || undefined,
      }),
    );
  } catch {
    // The only constraint a roofer can trip here is UNIQUE(tenant_id, name).
    return { error: `You already have an item called "${name}".` };
  }

  revalidatePath("/price-book");
  return {};
}

export async function updatePriceAction(_prev: PriceBookState, formData: FormData): Promise<PriceBookState> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const itemId = String(formData.get("itemId") ?? "");
  const unitPriceCents = parsePriceToCents(String(formData.get("price") ?? ""));
  if (!itemId) return { error: "Item not found." };
  if (unitPriceCents === null) return { error: "Enter a price, like 48.50." };

  await withRooferAccess(session.tenantId, (tx) =>
    updatePriceBookItem(tx, session.tenantId, itemId, { unitPriceCents }),
  );

  revalidatePath("/price-book");
  return {};
}

export async function retireItemAction(formData: FormData): Promise<void> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const itemId = String(formData.get("itemId") ?? "");
  if (itemId) {
    await withRooferAccess(session.tenantId, (tx) => deactivatePriceBookItem(tx, session.tenantId, itemId));
  }

  revalidatePath("/price-book");
}

export async function restoreItemAction(formData: FormData): Promise<void> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const itemId = String(formData.get("itemId") ?? "");
  if (itemId) {
    await withRooferAccess(session.tenantId, (tx) =>
      updatePriceBookItem(tx, session.tenantId, itemId, { active: true }),
    );
  }

  revalidatePath("/price-book");
}

export async function seedPriceBookAction(): Promise<void> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  await withRooferAccess(session.tenantId, (tx) => seedPriceBook(tx, session.tenantId));

  revalidatePath("/price-book");
}
