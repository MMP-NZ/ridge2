"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { withSystemTenantContext } from "@/db/client";
import { getQuotePageData } from "@/lib/quotes/public-lookup";
import { acceptQuote, declineQuote } from "@/lib/quotes/accept";

/**
 * The customer accepting. No session exists and never will — the token in
 * the URL is the only thing identifying them, exactly as the booking page
 * works (M2). Everything is re-resolved from that token server-side; no id
 * from the form is trusted.
 */
export async function acceptQuoteAction(formData: FormData): Promise<void> {
  const quoteToken = String(formData.get("quoteToken") ?? "");
  const acceptedName = String(formData.get("acceptedName") ?? "").trim();

  if (!quoteToken) redirect("/");
  if (!acceptedName) redirect(`/quote/${quoteToken}?outcome=name_required`);

  const page = await getQuotePageData(quoteToken);
  if (!page) redirect("/");

  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");

  const result = await withSystemTenantContext(page.tenantId, (tx) =>
    acceptQuote(tx, page.tenantId, page.quoteId, {
      acceptedName,
      // Evidence of who agreed and from where, for the roofer's records.
      ip: forwardedFor?.split(",")[0]?.trim() || undefined,
      userAgent: headerList.get("user-agent") ?? undefined,
    }),
  );

  redirect(`/quote/${quoteToken}?outcome=${result.status}`);
}

export async function declineQuoteAction(formData: FormData): Promise<void> {
  const quoteToken = String(formData.get("quoteToken") ?? "");
  if (!quoteToken) redirect("/");

  const page = await getQuotePageData(quoteToken);
  if (!page) redirect("/");

  const reason = String(formData.get("declineReason") ?? "").trim();

  await withSystemTenantContext(page.tenantId, (tx) =>
    declineQuote(tx, page.tenantId, page.quoteId, reason || undefined),
  );

  redirect(`/quote/${quoteToken}?outcome=declined`);
}
