"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { leads } from "@/db/schema";
import { bookVisit } from "@/lib/booking/book";

/**
 * Only the booking token and the chosen time come from the client — the
 * lead/tenant are re-resolved from the token server-side (not trusted from
 * a hidden field), same reasoning as src/lib/booking/public-lookup.ts.
 */
export async function submitBookingAction(formData: FormData): Promise<void> {
  const bookingToken = String(formData.get("bookingToken") ?? "");
  const startAtIso = String(formData.get("startAt") ?? "");
  if (!bookingToken || !startAtIso) return;

  const [lead] = await authDb().select().from(leads).where(eq(leads.bookingToken, bookingToken)).limit(1);
  if (!lead) redirect(`/book/${bookingToken}?outcome=unavailable`);

  const result = await bookVisit(lead.tenantId, lead.id, new Date(startAtIso));
  const outcome = result.status === "booked" ? "booked" : result.status === "slot_taken" ? "taken" : "unavailable";
  redirect(`/book/${bookingToken}?outcome=${outcome}`);
}
