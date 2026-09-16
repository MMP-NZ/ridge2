import { cx } from "@/components/ui/cx";

/**
 * The product mark — a roofline. Used on the login screen and the public
 * booking page, the two surfaces where somebody is deciding whether this
 * looks like a real business. Never paired with the codename in text: the
 * name always comes from PRODUCT_NAME.
 */
export function BrandMark({
  className,
  size = 44,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-[28%] bg-accent text-accent-contrast shadow-lift",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 32 32"
        width={size * 0.6}
        height={size * 0.6}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M3 16 16 5l13 11" />
        <path d="M7 14.5V27h18V14.5" />
        <path d="M13 27v-7h6v7" />
      </svg>
    </span>
  );
}
