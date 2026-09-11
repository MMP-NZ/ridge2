import { pgTable, uuid, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { customers } from "./customers";

/**
 * An address with roof details. One customer can have many properties
 * (spec: landlords own several). Only `address` is populated at lead
 * intake in M1 — lat/lng and the roof detail columns are filled in by
 * M4's site visit capture. Declared now so M4 doesn't need a migration.
 */
export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),

    address: text("address").notNull(),
    lat: real("lat"),
    lng: real("lng"),
    roofType: text("roof_type"),
    material: text("material"),
    pitchDegrees: real("pitch_degrees"),
    areaM2: real("area_m2"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("properties_tenant_customer_idx").on(table.tenantId, table.customerId)],
);

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
