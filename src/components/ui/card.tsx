import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type CardTone = "default" | "raised" | "accent" | "danger" | "quiet";
export type CardPadding = "none" | "sm" | "md" | "lg";

const TONE_CLASSES: Record<CardTone, string> = {
  default: "border-border bg-surface shadow-card",
  raised: "border-border bg-surface shadow-lift",
  accent: "border-accent/35 bg-accent-soft shadow-none",
  danger: "border-danger/45 bg-danger-soft shadow-none",
  quiet: "border-border bg-transparent shadow-none",
};

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render — `section`, `article`, `li`, `form`, … Defaults to `div`. */
  as?: ElementType;
  tone?: CardTone;
  padding?: CardPadding;
  children?: ReactNode;
}

export function Card({
  as: Tag = "div",
  tone = "default",
  padding = "md",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cx(
        "rounded-card border",
        TONE_CLASSES[tone],
        PADDING_CLASSES[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: ElementType;
  children?: ReactNode;
}

export function CardTitle({
  as: Tag = "h2",
  className,
  children,
  ...rest
}: CardTitleProps) {
  return (
    <Tag
      className={cx("text-title font-semibold tracking-[-0.01em]", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * A small-caps section label. Used above a list that isn't inside a card, so
 * the eye can find the group without a heavy heading.
 */
export function SectionHeading({
  action,
  className,
  children,
  as: Tag = "h2",
}: {
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  as?: ElementType;
}) {
  return (
    <div
      className={cx(
        "flex min-h-6 items-center justify-between gap-3",
        className,
      )}
    >
      <Tag className="text-micro font-semibold uppercase tracking-[0.09em] text-muted">
        {children}
      </Tag>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
