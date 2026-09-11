import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { generateIntakeKey } from "@/lib/crm/intake";

/** Inserts a tenant with the required fields tests don't usually care about (e.g. publicIntakeKey), so fixtures stay one-liners. */
export async function makeTenant(db: PostgresJsDatabase<typeof schema>, businessName: string) {
  const [tenant] = await db
    .insert(schema.tenants)
    .values({ businessName, publicIntakeKey: generateIntakeKey() })
    .returning();
  return tenant;
}
