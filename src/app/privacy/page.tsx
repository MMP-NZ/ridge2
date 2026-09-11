import { PRODUCT_NAME } from "@/lib/config";

/**
 * Placeholder only — CLAUDE.md/spec section 11: "Not legal advice. Have a
 * lawyer review the client contract and privacy terms before the first
 * paying client." Linked from every public form/booking page per the
 * same section's non-negotiable, but the real wording needs legal review
 * before this goes anywhere near a real customer.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Privacy</h1>
      <p className="text-sm text-muted">
        {PRODUCT_NAME} holds your contact details and property information on behalf of the roofing business you
        enquired with, to arrange your quote visit and job. Your details are not sold or used for anything else.
      </p>
      <p className="text-sm text-muted">
        This is placeholder text — the real privacy statement needs legal review before going live with real
        customers.
      </p>
    </main>
  );
}
