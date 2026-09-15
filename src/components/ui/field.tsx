import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ChevronDownIcon } from "@/components/icons";
import { cx } from "./cx";

/**
 * Shared control styling. `text-base` is deliberate: anything under 16px makes
 * iOS Safari zoom the page on focus, which breaks one-handed use. `min-w-0`
 * is also deliberate — flex items default to `min-width:auto` and a text input
 * has an intrinsic width, which is what caused the side-by-side field rows to
 * overflow at 375px.
 */
export const controlClasses =
  "w-full min-w-0 min-h-12 rounded-field border border-border bg-surface px-3.5 py-2.5 text-base text-foreground " +
  "shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] duration-150 " +
  "placeholder:text-muted/65 " +
  "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/25 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/25 " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-muted";

export interface FieldProps {
  /** Visible label text. Always tie it to the control with `htmlFor` + the control's `id`. */
  label: ReactNode;
  htmlFor: string;
  /** Secondary text shown beside the label — units, "optional", a format hint. */
  hint?: ReactNode;
  /** Help text under the control. */
  help?: ReactNode;
  /** Error text under the control. Rendered with `role="alert"`. */
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  hint,
  help,
  error,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-caption font-semibold text-foreground"
      >
        {label}
        {/* The {" "} is load-bearing: without it the accessible name reads
            "Aream²" rather than "Area m²". */}
        {hint ? (
          <>
            {" "}
            <span className="font-normal text-muted">{hint}</span>
          </>
        ) : null}
      </label>
      {children}
      {help && !error ? (
        <p className="text-caption text-muted">{help}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlClasses, className)} {...rest} />;
}

export function TextArea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        controlClasses,
        "min-h-28 resize-y leading-relaxed",
        className,
      )}
      {...rest}
    />
  );
}

export function SelectInput({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0">
      <select
        className={cx(controlClasses, "appearance-none pr-10", className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

/**
 * A checkbox or radio dressed as a tappable pill. The native input stays in
 * the DOM (visually hidden, not `display:none`) so it keeps its label, its
 * name/value pair and its keyboard behaviour; the pill just reflects state.
 */
export function ChoiceChip({
  type,
  name,
  value,
  defaultChecked,
  className,
  children,
}: {
  type: "checkbox" | "radio";
  name: string;
  value: string | number;
  defaultChecked?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx("inline-flex cursor-pointer", className)}>
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span
        className={cx(
          "inline-flex min-h-11 select-none items-center justify-center gap-1.5 rounded-pill border border-border-strong bg-surface px-4 text-body font-semibold text-foreground",
          "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]",
          "peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-contrast peer-checked:shadow-card",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
        )}
      >
        {children}
      </span>
    </label>
  );
}

/**
 * A full-width switch row: label and explanation on the left, native checkbox
 * on the right, the whole row tappable because the label wraps it.
 */
export function ToggleRow({
  name,
  defaultChecked,
  title,
  description,
  className,
}: {
  name: string;
  defaultChecked?: boolean;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cx(
        "flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-field px-1 py-2 transition-colors active:bg-surface-sunken",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-body font-semibold">{title}</span>
        {description ? (
          <span className="mt-0.5 block text-caption text-muted">
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="shrink-0"
      />
    </label>
  );
}
