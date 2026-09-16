"use client";

import { useActionState } from "react";
import { Badge, Button, Card, CardTitle, FormMessage, LinkButton } from "@/components/ui";
import { formatNzd } from "@/lib/money";
import { pushInvoiceAction, type InvoiceActionState } from "../actions";

const initialState: InvoiceActionState = {};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft in Xero",
  submitted: "Awaiting approval",
  authorised: "Approved",
  paid: "Paid",
  voided: "Voided",
  deleted: "Deleted",
};

export interface InvoiceSummary {
  invoiceNumber: string | null;
  status: string;
  totalIncGstCents: number;
  netPaidExGstCents: number;
  totalExGstCents: number;
}

/**
 * Where a finished job stands with the money. Only shown once the job is
 * done — invoicing work that isn't finished isn't a thing.
 */
export function InvoiceCard({
  jobId,
  invoice,
  connectionState,
}: {
  jobId: string;
  invoice: InvoiceSummary | null;
  connectionState: "connected" | "needs_reconnect" | "not_connected";
}) {
  const [state, formAction, pending] = useActionState(pushInvoiceAction, initialState);

  if (invoice) {
    const owing = invoice.totalExGstCents - invoice.netPaidExGstCents;
    return (
      <Card className="flex flex-col gap-2">
        <CardTitle>
          Invoice{" "}
          <Badge tone={invoice.status === "paid" ? "accent" : "outline"}>
            {STATUS_LABELS[invoice.status] ?? invoice.status}
          </Badge>
        </CardTitle>
        {invoice.invoiceNumber ? <p className="text-body font-semibold">{invoice.invoiceNumber}</p> : null}
        <p className="text-caption text-muted">
          {formatNzd(invoice.totalIncGstCents)} including GST
          {invoice.netPaidExGstCents > 0 ? ` · ${formatNzd(invoice.netPaidExGstCents)} received` : ""}
          {owing > 0 && invoice.netPaidExGstCents > 0 ? ` · ${formatNzd(owing)} to go` : ""}
        </p>
        {invoice.status === "draft" ? (
          <p className="text-caption text-muted">
            It&apos;s sitting in your Xero as a draft — check it over and approve it there to send it.
          </p>
        ) : null}
      </Card>
    );
  }

  if (connectionState !== "connected") {
    return (
      <Card tone="quiet" className="flex flex-col gap-3">
        <CardTitle>Invoice</CardTitle>
        <p className="text-caption text-muted">
          {connectionState === "needs_reconnect"
            ? "Xero needs reconnecting before this job can be invoiced. Nothing's lost — it'll be waiting."
            : "Connect Xero and finished jobs turn into draft invoices automatically."}
        </p>
        <LinkButton href="/more/xero" variant="secondary" block>
          {connectionState === "needs_reconnect" ? "Reconnect Xero" : "Connect Xero"}
        </LinkButton>
      </Card>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <Card className="flex flex-col gap-3">
        <CardTitle>Invoice</CardTitle>
        <p className="text-caption text-muted">
          Creates a draft in your Xero from the quote your customer accepted. It stays a draft until you approve it.
        </p>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
        <Button type="submit" block pending={pending} pendingLabel="Sending to Xero…">
          Send to Xero
        </Button>
      </Card>
    </form>
  );
}
