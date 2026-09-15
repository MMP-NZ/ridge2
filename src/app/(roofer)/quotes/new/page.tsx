import { redirect } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { createQuoteForVisit } from "@/lib/quotes/quotes";

/**
 * Not a screen — the step between "Build the quote" and the builder. It
 * creates the draft and forwards straight into it, so the roofer never sees
 * an empty page asking him to press another button.
 */
export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ visitId?: string }>;
}) {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const { visitId } = await searchParams;
  if (!visitId) redirect("/quotes");

  const quote = await withRooferAccess(session.tenantId, (tx) =>
    createQuoteForVisit(tx, session.tenantId, visitId),
  );

  redirect(`/quotes/${quote.id}`);
}
