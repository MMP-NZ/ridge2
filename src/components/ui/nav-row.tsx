import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";
import { cx } from "./cx";

/**
 * A tappable row that goes somewhere. Used for settings menus and any list
 * where the whole card is one destination.
 */
export function NavRow({
  href,
  icon,
  title,
  description,
  trailing,
  external = false,
  className,
}: {
  href: string;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Replaces the chevron — a count badge, a status pill. */
  trailing?: ReactNode;
  external?: boolean;
  className?: string;
}) {
  const classes = cx(
    "flex min-h-14 items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-card",
    "transition-[transform,background-color,box-shadow] duration-150 active:scale-[0.99] active:bg-surface-sunken active:shadow-none",
    className,
  );

  const content = (
    <>
      {icon ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-accent-soft text-accent">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold">{title}</span>
        {description ? (
          <span className="mt-0.5 block text-caption text-muted">
            {description}
          </span>
        ) : null}
      </span>
      {trailing ?? <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />}
    </>
  );

  if (external) {
    return (
      <a href={href} className={classes}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
