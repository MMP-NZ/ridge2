import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

/**
 * The single content column every screen sits in — roofer screens and the
 * public pages alike. Centring and the phone-width cap are repeated here (not
 * only in the roofer layout) so the customer-facing booking and login pages
 * get the same rhythm without copying padding values around.
 */
export function Screen({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <main
      className={cx(
        "mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-8 pt-5",
        className,
      )}
      {...rest}
    >
      {children}
    </main>
  );
}
