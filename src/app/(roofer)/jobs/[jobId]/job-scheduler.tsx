"use client";

import { useActionState, useState, type FormEvent } from "react";
import { CameraIcon, CheckIcon } from "@/components/icons";
import { Button, Card, CardTitle, Field, FormMessage, TextArea } from "@/components/ui";
import type { WorkDate } from "@/lib/scheduling/work-days";
import { scheduleJobAction, completeJobAction, uploadJobPhotoAction, type JobActionState } from "../actions";
import { describeWorkDays, formatWorkDate } from "../format-days";

const initialState: JobActionState = {};

export function JobScheduler({
  jobId,
  status,
  currentDays,
  suggestions,
  photos,
}: {
  jobId: string;
  status: string;
  currentDays: WorkDate[];
  suggestions: WorkDate[][];
  photos: Array<{ id: string; caption: string | null }>;
}) {
  const [scheduleState, scheduleAction, scheduling] = useActionState(scheduleJobAction, initialState);
  const [completeState, completeAction, completing] = useActionState(completeJobAction, initialState);
  const [picked, setPicked] = useState<WorkDate[] | null>(null);
  const [uploading, setUploading] = useState(false);

  const booked = currentDays.length > 0;
  const finished = status === "done";

  async function onPhotoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("jobId", jobId);
    data.set("clientPhotoId", crypto.randomUUID());

    setUploading(true);
    try {
      await uploadJobPhotoAction(data);
      form.reset();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {!finished ? (
        <section className="flex flex-col gap-3">
          <CardTitle>{booked ? "Move it to" : "When suits?"}</CardTitle>
          <p className="text-caption text-muted">
            {booked
              ? "Pick a new run of days. We'll let the customer know once."
              : "Your work days, skipping quote days and anything already booked."}
          </p>

          {suggestions.length === 0 ? (
            <Card tone="quiet">
              <p className="text-caption text-muted">
                No free runs of {currentDays.length || 1} days coming up. Finish or move something else first.
              </p>
            </Card>
          ) : null}

          <form action={scheduleAction} className="flex flex-col gap-3">
            <input type="hidden" name="jobId" value={jobId} />
            {(picked ?? []).map((day) => (
              <input key={day} type="hidden" name="workDate" value={day} />
            ))}

            <div className="flex flex-col gap-2">
              {suggestions.map((run) => {
                const key = run.join("|");
                const selected = picked !== null && picked.join("|") === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPicked(run)}
                    aria-pressed={selected}
                    className={`flex min-h-14 items-center justify-between gap-3 rounded-field border px-4 text-left transition-colors ${
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border-strong bg-surface hover:bg-surface-sunken"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-body font-semibold">{formatWorkDate(run[0])}</span>
                      {run.length > 1 ? (
                        <span className="block text-caption text-muted">{describeWorkDays(run)}</span>
                      ) : null}
                    </span>
                    {selected ? <CheckIcon className="h-5 w-5 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>

            {scheduleState.error ? <FormMessage>{scheduleState.error}</FormMessage> : null}
            {scheduleState.savedAt && !scheduleState.error ? (
              <FormMessage tone={scheduleState.outcome === "unchanged" ? "info" : "success"}>
                {scheduleState.outcome === "unchanged"
                  ? "Same days as before — nothing sent."
                  : scheduleState.outcome === "moved"
                    ? "Moved — the customer's been told once."
                    : "Booked in — the customer's been told."}
              </FormMessage>
            ) : null}

            <Button
              type="submit"
              size="lg"
              block
              pending={scheduling}
              pendingLabel="Booking…"
              disabled={picked === null}
            >
              {booked ? "Move the job" : "Book it in"}
            </Button>
          </form>
        </section>
      ) : null}

      {booked && !finished ? (
        <form action={completeAction} className="flex flex-col gap-3">
          <input type="hidden" name="jobId" value={jobId} />
          <Card className="flex flex-col gap-3">
            <CardTitle>All finished?</CardTitle>
            <Field label="Anything worth noting" hint="optional" htmlFor="completionNotes">
              <TextArea
                id="completionNotes"
                name="completionNotes"
                rows={3}
                placeholder="Replaced two sheets of flashing while we were up there."
              />
            </Field>
            {completeState.error ? <FormMessage>{completeState.error}</FormMessage> : null}
            <Button type="submit" variant="secondary" block pending={completing} pendingLabel="Saving…">
              Mark the job done
            </Button>
          </Card>
        </form>
      ) : null}

      {booked ? (
        <Card className="flex flex-col gap-3">
          <CardTitle>
            Completion photos{" "}
            {photos.length > 0 ? <span className="text-muted">({photos.length})</span> : null}
          </CardTitle>

          {photos.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <li key={photo.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/job-photos/${photo.id}`}
                    alt={photo.caption ?? "Completed work"}
                    className="aspect-square w-full rounded-field border border-border object-cover"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-field border border-dashed border-border-strong px-4 py-5 text-center text-caption text-muted">
              Photos of the finished job. Worth having before the invoice goes out.
            </p>
          )}

          <form onSubmit={onPhotoSubmit} className="flex flex-col gap-3">
            <input
              type="file"
              name="photo"
              accept="image/*"
              capture="environment"
              required
              aria-label="Choose a completion photo"
              className="w-full min-w-0 text-caption text-muted file:mr-3 file:min-h-11 file:rounded-pill file:border-0 file:bg-accent-soft file:px-4 file:text-caption file:font-semibold file:text-accent"
            />
            <Button
              type="submit"
              variant="secondary"
              block
              pending={uploading}
              pendingLabel="Uploading…"
              icon={<CameraIcon className="h-4 w-4" />}
            >
              Add photo
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
