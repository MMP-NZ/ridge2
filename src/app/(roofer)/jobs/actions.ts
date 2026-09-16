"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { isUniqueViolation } from "@/db/errors";
import { scheduleJob, completeJob, addJobPhoto } from "@/lib/scheduling/jobs";
import { scheduleWorkJobs } from "@/lib/jobs/schedule-work-jobs";
import { pushInvoiceForJob } from "@/lib/xero/invoicing";

export interface JobActionState {
  error?: string;
  savedAt?: string;
  /**
   * What actually happened. The screen can't infer it: by the time it
   * re-renders, the job has days either way, so a first booking would read
   * as a move.
   */
  outcome?: "booked" | "moved" | "unchanged";
}

/**
 * Books the job into the days he picked. The customer messages are queued
 * only after the transaction commits, and which message goes out is decided
 * by the outcome — a first booking confirms, a move apologises, and
 * re-confirming the same days says nothing at all.
 */
export async function scheduleJobAction(_prev: JobActionState, formData: FormData): Promise<JobActionState> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const jobId = String(formData.get("jobId") ?? "");
  const days = formData.getAll("workDate").map(String).filter(Boolean);
  if (!jobId) return { error: "Job not found." };
  if (days.length === 0) return { error: "Pick some days first." };

  let outcome: JobActionState["outcome"];
  try {
    const result = await withRooferAccess(session.tenantId, (tx) => scheduleJob(tx, session.tenantId, jobId, days));
    await scheduleWorkJobs(session.tenantId, jobId, result.days, result.outcome);
    outcome = result.outcome;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't book that in." };
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/today");
  revalidatePath("/calendar");
  return { savedAt: new Date().toISOString(), outcome };
}

export async function completeJobAction(_prev: JobActionState, formData: FormData): Promise<JobActionState> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return { error: "Job not found." };

  await withRooferAccess(session.tenantId, (tx) =>
    completeJob(tx, session.tenantId, jobId, String(formData.get("completionNotes") ?? "").trim() || undefined),
  );

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/today");
  return { savedAt: new Date().toISOString() };
}

/** One photo per call, so a flaky connection retries a single image. */
export async function uploadJobPhotoAction(formData: FormData): Promise<void> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const jobId = String(formData.get("jobId") ?? "");
  const clientPhotoId = String(formData.get("clientPhotoId") ?? "");
  const file = formData.get("photo");
  if (!jobId || !clientPhotoId || !(file instanceof File) || file.size === 0) return;

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    await withRooferAccess(session.tenantId, (tx) =>
      addJobPhoto(tx, session.tenantId, jobId, {
        clientPhotoId,
        bytes,
        contentType: file.type || "image/jpeg",
        caption: String(formData.get("caption") ?? "").trim() || undefined,
      }),
    );
  } catch (err) {
    // Two uploads of the same photo at once. postgres.js rolls the
    // transaction back and rethrows, so the constraint has to be caught out
    // here rather than inside addJobPhoto — same shape as bookVisit (M2).
    if (!isUniqueViolation(err)) throw err;
  }

  revalidatePath(`/jobs/${jobId}`);
}

export interface InvoiceActionState {
  error?: string;
  invoiceNumber?: string;
}

/** Raises the draft invoice in the roofer's Xero for a finished job. */
export async function pushInvoiceAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return { error: "Job not found." };

  const result = await withRooferAccess(session.tenantId, (tx) => pushInvoiceForJob(tx, session.tenantId, jobId));

  revalidatePath(`/jobs/${jobId}`);

  switch (result.status) {
    case "created":
    case "already_invoiced":
      return { invoiceNumber: result.invoice.invoiceNumber ?? undefined };
    case "needs_reconnect":
      return { error: "Xero needs reconnecting first — nothing's lost, the job will be waiting." };
    case "not_connected":
      return { error: "Connect Xero first and this job will invoice straight away." };
    case "job_not_done":
      return { error: "Mark the job done before invoicing it." };
  }
}
