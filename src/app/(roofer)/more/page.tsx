import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/config";

export default function MorePage() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">More</h1>
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        <p>{PRODUCT_NAME}</p>
        <p className="mt-1">Settings, price book and account details land in later milestones.</p>
      </div>

      <nav className="flex flex-col gap-2">
        <Link href="/calendar/settings" className="rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium">
          Quote day settings
        </Link>
        <Link href="/more/ads" className="rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium">
          Advertising
        </Link>
      </nav>

      <form action="/logout" method="post">
        <button type="submit" className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium">
          Log out
        </button>
      </form>
    </main>
  );
}
