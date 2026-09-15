import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { staffUsers } from "./staff-users";

/**
 * Which onboarding steps are done for a new roofer. Only completed steps
 * get a row — the checklist itself lives in code
 * (src/lib/staff/onboarding.ts), so adding a step doesn't need a migration
 * or a backfill for every existing client.
 */
export const onboardingSteps = pgTable(
  "onboarding_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    stepKey: text("step_key").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
  },
  (table) => [unique("onboarding_steps_tenant_key_unique").on(table.tenantId, table.stepKey)],
);

export type OnboardingStep = typeof onboardingSteps.$inferSelect;
