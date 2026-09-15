import type { ReactNode } from "react";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { cx } from "./cx";

export type MessageTone = "error" | "success" | "info";

const TONE_CLASSES: Record<MessageTone, string> = {
  error: "border-danger/45 bg-danger-soft text-danger",
  success: "border-accent/35 bg-accent-soft text-accent",
  info: "border-border bg-surface text-foreground",
};

/**
 * Inline form feedback. Errors get `role="alert"` so they're announced, and
 * they're a tinted block rather than a stray line of red text — on a bright
 * screen a single red sentence is easy to miss.
 */
export function FormMessage({
  tone = "error",
  className,
  children,
}: {
  tone?: MessageTone;
  className?: string;
  children: ReactNode;
}) {
  const Glyph = tone === "success" ? CheckIcon : AlertIcon;

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-2 rounded-field border px-3.5 py-2.5 text-caption font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {tone === "info" ? null : (
        <Glyph className="mt-px h-4 w-4 shrink-0" strokeWidth={2.25} />
      )}
      <span className="min-w-0">{children}</span>
    </p>
  );
}
