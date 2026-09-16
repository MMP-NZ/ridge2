import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { cx } from "./cx";

export interface PageHeaderProps {
  title: ReactNode;
  /** Small label above the title — a parent screen, a customer name, a status. */
  eyebrow?: ReactNode;
  /** One line of plain-English context under the title. */
  description?: ReactNode;
  /** Right-aligned control, level with the title. Keep it to one button. */
  action?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  action,
  backHref,
  backLabel = "Back",
  className,
}: PageHeaderProps) {
  return (
    <header className={cx("flex flex-col gap-1.5", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="-ml-1.5 -mt-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-field pr-2 pl-1 text-caption font-semibold text-muted transition-colors hover:text-foreground active:text-foreground"
        >
          <ChevronLeftIcon className="h-4 w-4" strokeWidth={2.25} />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="mb-0.5 text-micro font-semibold uppercase tracking-[0.09em] text-muted">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-display font-semibold tracking-[-0.022em] text-balance">
            {title}
          </h1>
        </div>
        {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
      </div>

      {description ? (
        <p className="text-body text-muted text-pretty">{description}</p>
      ) : null}
    </header>
  );
}
