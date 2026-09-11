import { and, eq, or } from "drizzle-orm";
import { customers, properties, type Customer, type Property } from "@/db/schema";
import type { AppTx } from "@/db/client";

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  commercialConsent?: boolean;
}

/**
 * Matches an existing customer by normalized phone OR email within the
 * tenant; creates one if nothing matches. Phone/email are stored in their
 * normalized form so this comparison stays a plain equality lookup rather
 * than a fragile per-call LOWER()/regexp comparison in SQL.
 *
 * build-plan M1 done-when: "Duplicate enquiries from the same phone or
 * email attach to the existing customer."
 */
export async function findOrCreateCustomer(tx: AppTx, tenantId: string, input: CustomerInput): Promise<Customer> {
  const phone = input.phone?.trim() ? normalizePhone(input.phone) : undefined;
  const email = input.email?.trim() ? normalizeEmail(input.email) : undefined;
  if (!phone && !email) {
    throw new Error("A customer needs a phone or an email");
  }

  const matchConditions = [phone ? eq(customers.phone, phone) : undefined, email ? eq(customers.email, email) : undefined].filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );

  const [existing] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), or(...matchConditions)))
    .limit(1);
  if (existing) return existing;

  const [created] = await tx
    .insert(customers)
    .values({ tenantId, name: input.name, phone, email, commercialConsent: input.commercialConsent ?? false })
    .returning();
  return created;
}

/**
 * Matches an existing property for this customer by normalized address;
 * creates one if nothing matches. Fetches the customer's (typically few)
 * properties and compares in JS rather than a SQL LOWER()/TRIM() predicate
 * — simpler to keep in sync with normalizeAddress and cheap at this scale.
 */
export async function findOrCreateProperty(
  tx: AppTx,
  tenantId: string,
  customerId: string,
  address: string,
): Promise<Property> {
  const normalized = normalizeAddress(address);
  const existingForCustomer = await tx
    .select()
    .from(properties)
    .where(and(eq(properties.tenantId, tenantId), eq(properties.customerId, customerId)));

  const match = existingForCustomer.find((property) => normalizeAddress(property.address) === normalized);
  if (match) return match;

  const [created] = await tx.insert(properties).values({ tenantId, customerId, address: address.trim() }).returning();
  return created;
}
