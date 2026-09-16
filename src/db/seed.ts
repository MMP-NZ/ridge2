import { config } from "dotenv";
config({ path: ".env.local" });
config();

import * as schema from "./schema";
import { hashPassword } from "@/lib/auth/password";
import { generateIntakeKey } from "@/lib/crm/intake";
import { DEFAULT_PRICE_BOOK } from "@/lib/price-book/items";
import { withSetupContext } from "./setup-context";

/**
 * One fictional demo tenant, per CLAUDE.md's build-plan M0 requirement and
 * its "seed data is fictional" non-negotiable. Run with: pnpm db:seed
 *
 * Writes through ridge_app in staff context (see src/db/setup-context.ts),
 * so it works on a hosted database whose owner isn't a superuser.
 */
async function main() {
  const intakeKey = generateIntakeKey();

  await withSetupContext(async (db) => {
    const [tenant] = await db
      .insert(schema.tenants)
      .values({
        businessName: "Demo Roofing Co (fictional)",
        plan: "basic",
        freeMonthEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        publicIntakeKey: intakeKey,
      })
      .returning();

    await db.insert(schema.rooferUsers).values({
      tenantId: tenant.id,
      email: "demo.roofer@example.com",
      phone: "+64210000000",
      passwordHash: await hashPassword("demo-password-not-for-real-use"),
    });

    // Tue/Thu 8am-4pm quote days, so the booking flow is testable out of the box (M2).
    await db.insert(schema.calendarRules).values({
      tenantId: tenant.id,
      quoteDaysOfWeek: [2, 4],
      quoteHoursStartMin: 480,
      quoteHoursEndMin: 960,
      visitLengthMinutes: 45,
      travelBufferMinutes: 15,
    });

    // The standard price book, so a quote can be built the moment the demo
    // roofer finishes a site visit (M4).
    await db
      .insert(schema.priceBookItems)
      .values(DEFAULT_PRICE_BOOK.map((item, index) => ({ ...item, tenantId: tenant.id, sortOrder: index })));

    // A Juno Logic staff login for the admin console (M7). Idempotent, so
    // re-seeding to get another demo roofer doesn't fail on the email.
    await db
      .insert(schema.staffUsers)
      .values({
        email: "staff@junologic.example",
        name: "Juno Staffer",
        passwordHash: await hashPassword("staff-password-not-for-real-use"),
      })
      .onConflictDoNothing();

    console.log(`Seeded demo tenant ${tenant.id} (${tenant.businessName})`);
    console.log("Demo roofer login: demo.roofer@example.com / demo-password-not-for-real-use");
    console.log(`Website intake URL: POST /api/public/leads/${intakeKey}`);
    console.log("Juno Logic staff login: staff@junologic.example / staff-password-not-for-real-use");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
