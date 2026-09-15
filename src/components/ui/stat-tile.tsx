import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";
import { cx } from "./cx";

export type StatTone = "default" | "accent" | "danger";

const VALUE_TONE: Record<StatTone, string> = {
  default: "text-foreground",
  accent: "text-accent",
  danger: "text-danger",
};

const SHELL_TONE: Record<StatTone, string> = {
  default: "border-border bg-surface",
  accent: "border-accent/35 bg-accent-soft",
  danger: "border-danger/45 bg-danger-soft",
};

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  /** One line under the number — a trend, a warning, a unit. */
  hint?: ReactNode;
  tone?: StatTone;
  /** Emphasis of the number itself. `lg` for a hero figure, `md` in a grid. */
  size?: "md" | "lg";
  /** Makes the whole tile a tap target with a chevron. */
  href?: string;
  className?: string;
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  size = "md",
  href,
  className,
}: StatTileProps) {
  const body = (
    <>
      <p className="text-micro font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <p
        className={cx(
          "mt-1 font-semibold tabular-nums tracking-[-0.02em]",
          size === "lg" ? "text-figure" : "text-heading",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p
          className={cx(
            "mt-1 text-caption",
            tone === "danger" ? "text-danger" : "text-muted",
          )}
        >
          {hint}
        </p>
      ) : null}
    </>
  );

  const shell = cx(
    "rounded-card border p-4 shadow-card",
    SHELL_TONE[tone],
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cx(
          shell,
          "flex items-center justify-between gap-3 transition-[transform,box-shadow] duration-150 active:scale-[0.99] active:shadow-none",
        )}
      >
        <div className="min-w-0">{body}</div>
        <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
