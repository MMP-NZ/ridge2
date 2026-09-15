import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Every size clears the 44px minimum touch target (CLAUDE.md: one-handed at
 * 390px). `sm` is the smallest we allow and is still 44px tall — it is only
 * "small" in its horizontal padding and label size.
 */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3.5 text-caption",
  md: "min-h-12 px-4 text-body",
  lg: "min-h-14 px-5 text-title",
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-contrast shadow-card hover:bg-accent-strong active:bg-accent-strong active:shadow-none",
  secondary:
    "border border-border-strong bg-surface text-foreground shadow-card hover:bg-surface-sunken active:bg-surface-sunken active:shadow-none",
  danger:
    "bg-danger text-danger-contrast shadow-card hover:bg-danger-strong active:bg-danger-strong active:shadow-none",
  ghost: "text-accent hover:bg-accent-soft active:bg-accent-soft",
};

const BASE_CLASSES =
  "inline-flex select-none items-center justify-center gap-2 rounded-field font-semibold tracking-[-0.01em] " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}): string {
  return cx(
    BASE_CLASSES,
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    block && "w-full",
    className,
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("animate-spin", className)}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner and disables the button. Wire it to `useActionState`'s pending flag. */
  pending?: boolean;
  /** Label swapped in while `pending` — e.g. "Saving…". Falls back to `children`. */
  pendingLabel?: ReactNode;
  /** Optional leading glyph. */
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  pending = false,
  pendingLabel,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled ?? pending}
      aria-busy={pending || undefined}
      className={buttonClasses({ variant, size, block, className })}
    >
      {pending ? <Spinner /> : icon}
      <span>
        {pending && pendingLabel !== undefined ? pendingLabel : children}
      </span>
    </button>
  );
}

export interface LinkButtonProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
  /** Renders a plain <a> instead of next/link — for route handlers and outbound links. */
  external?: boolean;
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  block = false,
  icon,
  external = false,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  const classes = buttonClasses({ variant, size, block, className });
  const content = (
    <>
      {icon}
      <span>{children}</span>
    </>
  );

  if (external) {
    return (
      <a href={href} className={classes} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {content}
    </Link>
  );
}
