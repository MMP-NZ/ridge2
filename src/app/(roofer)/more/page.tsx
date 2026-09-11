import { PRODUCT_NAME } from "@/lib/config";

export default function MorePage() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">More</h1>
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        <p>{PRODUCT_NAME}</p>
        <p className="mt-1">Settings, price book and account details land in later milestones.</p>
      </div>
    </main>
  );
}
