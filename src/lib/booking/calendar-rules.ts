import { eq } from "drizzle-orm";
import { calendarRules, type CalendarRules, type NewCalendarRules } from "@/db/schema";
import type { AppTx } from "@/db/client";

export async function getCalendarRules(tx: AppTx, tenantId: string): Promise<CalendarRules | null> {
  const [rules] = await tx.select().from(calendarRules).where(eq(calendarRules.tenantId, tenantId));
  return rules ?? null;
}

export type CalendarRulesInput = Omit<NewCalendarRules, "id" | "tenantId" | "createdAt" | "updatedAt">;

/** Roofer-facing settings form (src/app/(roofer)/calendar/settings) creates or updates the one rules row for their tenant. */
export async function upsertCalendarRules(tx: AppTx, tenantId: string, input: CalendarRulesInput): Promise<CalendarRules> {
  const existing = await getCalendarRules(tx, tenantId);

  if (existing) {
    const [updated] = await tx
      .update(calendarRules)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(calendarRules.tenantId, tenantId))
      .returning();
    return updated;
  }

  const [created] = await tx.insert(calendarRules).values({ tenantId, ...input }).returning();
  return created;
}
