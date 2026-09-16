import { eq } from "drizzle-orm";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { calendarRules as calendarRulesTable } from "@/db/schema";
import { PageHeader, Screen } from "@/components/ui";
import { CalendarSettingsForm } from "./settings-form";

export default async function CalendarSettingsPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const rows = await withRooferAccess(session.tenantId, (tx) =>
    tx
      .select()
      .from(calendarRulesTable)
      .where(eq(calendarRulesTable.tenantId, session.tenantId)),
  );

  return (
    <Screen>
      <PageHeader
        backHref="/calendar"
        backLabel="Calendar"
        title="Quote day settings"
        description="This is what customers see when they book themselves in. Everything else is a work day."
      />
      <CalendarSettingsForm existing={rows[0] ?? null} />
    </Screen>
  );
}
