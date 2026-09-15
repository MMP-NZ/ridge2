import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * An empty list is never a dead end — every empty state names the thing that
 * is missing and offers the one action that fills it.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong bg-surface/60 px-5 py-8 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-accent-soft text-accent">
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-title font-semibold tracking-[-0.01em]">{title}</p>
        {description ? (
          <p className="text-body text-muted text-pretty">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1 w-full max-w-64">{action}</div> : null}
    </div>
  );
}
