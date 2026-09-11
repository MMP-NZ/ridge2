"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { customers } from "@/db/schema";

export async function setConsentAction(formData: FormData): Promise<void> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const customerId = String(formData.get("customerId") ?? "");
  const commercialConsent = formData.get("commercialConsent") === "on";
  if (!customerId) return;

  await withRooferAccess(session.tenantId, (tx) =>
    tx
      .update(customers)
      .set({ commercialConsent })
      .where(and(eq(customers.tenantId, session.tenantId), eq(customers.id, customerId))),
  );

  revalidatePath(`/customers/${customerId}`);
}
