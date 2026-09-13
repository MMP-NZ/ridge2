import type { MetaLeadField } from "./graph";

export const ADDRESS_NOT_PROVIDED_PLACEHOLDER = "Address not yet provided";

export interface ParsedMetaLead {
  name: string;
  email?: string;
  phone?: string;
  address: string;
}

function findField(fieldData: MetaLeadField[], ...names: string[]): string | undefined {
  for (const wanted of names) {
    const field = fieldData.find((f) => f.name.toLowerCase() === wanted);
    if (field?.values?.[0]) return field.values[0];
  }
  return undefined;
}

/**
 * Meta's standard lead form field names for full_name/email/phone_number
 * are well-known; a property address is not guaranteed to be collected at
 * all (unlike M2's website intake form, which always asks for one), so
 * this falls back to a placeholder rather than fabricating one — see
 * docs/decisions.md.
 */
export function parseMetaLeadFields(fieldData: MetaLeadField[]): ParsedMetaLead {
  const firstName = findField(fieldData, "first_name");
  const lastName = findField(fieldData, "last_name");
  const fullName = findField(fieldData, "full_name") ?? [firstName, lastName].filter(Boolean).join(" ").trim();

  const address =
    findField(fieldData, "street_address", "address", "property_address") ??
    fieldData.find((f) => f.name.toLowerCase().includes("address"))?.values?.[0];

  return {
    name: fullName || "Facebook lead",
    email: findField(fieldData, "email"),
    phone: findField(fieldData, "phone_number", "phone"),
    address: address ?? ADDRESS_NOT_PROVIDED_PLACEHOLDER,
  };
}
