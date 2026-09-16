import { SparkIcon } from "@/components/icons";
import { EmptyState, LinkButton, PageHeader, Screen } from "@/components/ui";

/**
 * A screen that exists in the nav but isn't built yet. Deliberately styled
 * like a real empty state rather than a placeholder, and it always offers
 * somewhere useful to go instead of leaving the roofer at a dead end.
 */
export function ComingSoon({
  title,
  milestone,
  description,
  nextHref = "/today",
  nextLabel = "Back to today",
}: {
  title: string;
  milestone: string;
  description?: string;
  nextHref?: string;
  nextLabel?: string;
}) {
  return (
    <Screen>
      <PageHeader title={title} />
      <EmptyState
        icon={<SparkIcon className="h-6 w-6" />}
        title="Not switched on yet"
        description={
          description ??
          `Arriving in ${milestone}. Everything else keeps working in the meantime.`
        }
        action={
          <LinkButton href={nextHref} variant="secondary" block>
            {nextLabel}
          </LinkButton>
        }
      />
    </Screen>
  );
}
