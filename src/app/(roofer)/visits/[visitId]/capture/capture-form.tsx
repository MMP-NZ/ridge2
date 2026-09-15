"use client";

import { useActionState, useState, type FormEvent } from "react";
import { CameraIcon } from "@/components/icons";
import {
  Button,
  Card,
  CardTitle,
  ChoiceChip,
  Field,
  FormMessage,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  saveCaptureAction,
  uploadVisitPhotoAction,
  type CaptureState,
} from "./actions";

const initialState: CaptureState = {};

const CONDITIONS = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
  { value: "urgent", label: "Urgent" },
];

export interface CaptureInitial {
  roofType: string;
  material: string;
  pitchDegrees: number | null;
  areaM2: number | null;
  condition: string | null;
  siteNotes: string;
}

export function CaptureForm({
  visitId,
  alreadyCaptured,
  initial,
  photos,
}: {
  visitId: string;
  alreadyCaptured: boolean;
  initial: CaptureInitial;
  photos: Array<{ id: string; caption: string | null }>;
}) {
  const [state, formAction, pending] = useActionState(
    saveCaptureAction,
    initialState,
  );

  // Generated once and reused for every retry of this capture. It is the
  // idempotency key the database checks, so it must not change between
  // attempts — that is what makes a resubmitted capture a no-op rather
  // than a second write.
  const [clientCaptureId] = useState(() => crypto.randomUUID());
  const [uploading, setUploading] = useState(false);

  async function onPhotoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("visitId", visitId);
    data.set("clientPhotoId", crypto.randomUUID());

    setUploading(true);
    try {
      await uploadVisitPhotoAction(data);
      form.reset();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="visitId" value={visitId} />
        <input type="hidden" name="clientCaptureId" value={clientCaptureId} />
        <input
          type="hidden"
          name="capturedAt"
          value={new Date().toISOString()}
        />

        <Card className="flex flex-col gap-4">
          <CardTitle>The roof</CardTitle>

          <div className="flex gap-3">
            <Field label="Roof type" htmlFor="roofType" className="flex-1">
              <TextInput
                id="roofType"
                name="roofType"
                defaultValue={initial.roofType}
                placeholder="Gable"
              />
            </Field>
            <Field label="Material" htmlFor="material" className="flex-1">
              <TextInput
                id="material"
                name="material"
                defaultValue={initial.material}
                placeholder="Corrugated steel"
              />
            </Field>
          </div>

          <div className="flex gap-3">
            <Field label="Area" hint="m²" htmlFor="areaM2" className="flex-1">
              <TextInput
                id="areaM2"
                name="areaM2"
                inputMode="decimal"
                defaultValue={initial.areaM2 ?? ""}
                placeholder="148.5"
              />
            </Field>
            <Field
              label="Pitch"
              hint="°"
              htmlFor="pitchDegrees"
              className="flex-1"
            >
              <TextInput
                id="pitchDegrees"
                name="pitchDegrees"
                inputMode="decimal"
                defaultValue={initial.pitchDegrees ?? ""}
                placeholder="25"
              />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-caption font-semibold">
              Condition
            </legend>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((option) => (
                <ChoiceChip
                  key={option.value}
                  type="radio"
                  name="condition"
                  value={option.value}
                  defaultChecked={initial.condition === option.value}
                >
                  {option.label}
                </ChoiceChip>
              ))}
            </div>
          </fieldset>

          <Field label="Notes" htmlFor="siteNotes">
            <TextArea
              id="siteNotes"
              name="siteNotes"
              rows={4}
              defaultValue={initial.siteNotes}
              placeholder="Rust around the flashing on the north face."
            />
          </Field>
        </Card>

        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
        {state.savedAt && !state.error ? (
          <FormMessage tone="success">Saved.</FormMessage>
        ) : null}

        <Button
          type="submit"
          size="lg"
          block
          pending={pending}
          pendingLabel="Saving…"
        >
          {alreadyCaptured ? "Update the visit" : "Save the visit"}
        </Button>
      </form>

      <Card className="flex flex-col gap-3">
        <CardTitle>
          Photos{" "}
          {photos.length > 0 ? (
            <span className="text-muted">({photos.length})</span>
          ) : null}
        </CardTitle>

        {photos.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <li key={photo.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photos/${photo.id}`}
                  alt={photo.caption ?? "Site photo"}
                  className="aspect-square w-full rounded-field border border-border object-cover"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-field border border-dashed border-border-strong px-4 py-5 text-center text-caption text-muted">
            No photos yet. Shots of the problem areas make the quote easier to
            write up later.
          </p>
        )}

        <form onSubmit={onPhotoSubmit} className="flex flex-col gap-3">
          <input
            type="file"
            name="photo"
            accept="image/*"
            capture="environment"
            required
            aria-label="Choose a site photo"
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
    </div>
  );
}
