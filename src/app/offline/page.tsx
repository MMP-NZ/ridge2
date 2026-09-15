import { CloudOffIcon } from "@/components/icons";
import { Card, PageHeader, Screen } from "@/components/ui";

/**
 * Served by the service worker when a page is requested with no reception
 * and nothing cached for it. Static by necessity — it has to render
 * without reaching the server at all.
 */
export default function OfflinePage() {
  return (
    <Screen>
      <PageHeader title="No reception" eyebrow="Offline" />

      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-muted">
          <CloudOffIcon className="h-6 w-6" />
        </span>
        <p className="text-body font-semibold">This page needs a connection</p>
        <p className="max-w-xs text-caption text-muted">
          Anything you&apos;ve already written up is safe on your phone and will send itself as soon as you&apos;re back
          in range.
        </p>
      </Card>
    </Screen>
  );
}
