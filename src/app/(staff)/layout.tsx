import Link from "next/link";
import { getCurrentStaffSession } from "@/lib/auth/current-session";

/**
 * The Juno Logic staff shell — a different surface from the roofer app on
 * purpose. Same phone-first column, its own navigation, and no bottom tab
 * bar, so it's never ambiguous which side of the platform you're on.
 *
 * The auth gate is deliberately *not* here. The login page lives under this
 * group too, and a layout that redirects unauthenticated requests would
 * bounce the login page to itself forever. Each staff page calls
 * requireStaffSession() instead, which is explicit and can't loop.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentStaffSession();

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      {session ? (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <Link href="/staff" className="text-body font-semibold tracking-[-0.01em]">
            Juno Logic
          </Link>
          <nav className="flex items-center gap-3 text-caption" aria-label="Staff">
            <Link href="/staff/billing" className="text-muted">
              Billing
            </Link>
            <Link href="/staff/access-log" className="text-muted">
              Access
            </Link>
            <form action="/logout" method="post">
              <button type="submit" className="text-muted underline">
                Sign out
              </button>
            </form>
          </nav>
        </header>
      ) : null}
      {children}
    </div>
  );
}
