import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "accent-soft"
  | "danger"
  | "danger-soft"
  | "warning"
  | "outline";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-muted",
  accent: "bg-accent text-accent-contrast",
  "accent-soft": "bg-accent-soft text-accent",
  danger: "bg-danger text-danger-contrast",
  "danger-soft": "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  outline: "border border-border-strong text-muted",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-micro font-semibold uppercase tracking-[0.05em]",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A count in a pill — big enough to read at arm's length, still 1 line tall. */
export function CountBadge({
  value,
  tone = "accent",
  className,
}: {
  value: number;
  tone?: Extract<BadgeTone, "accent" | "danger" | "neutral">;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex min-w-8 items-center justify-center rounded-pill px-2.5 py-1 text-title font-semibold tabular-nums",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {value}
    </span>
  );
}
