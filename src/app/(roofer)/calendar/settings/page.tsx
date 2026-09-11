import { eq } from "drizzle-orm";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { calendarRules as calendarRulesTable } from "@/db/schema";
import { CalendarSettingsForm } from "./settings-form";

export default async function CalendarSettingsPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const rows = await withRooferAccess(session.tenantId, (tx) =>
    tx.select().from(calendarRulesTable).where(eq(calendarRulesTable.tenantId, session.tenantId)),
  );

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Quote day settings</h1>
      <CalendarSettingsForm existing={rows[0] ?? null} />
    </main>
  );
}
