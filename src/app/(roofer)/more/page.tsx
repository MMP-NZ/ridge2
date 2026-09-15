import { PRODUCT_NAME } from "@/lib/config";
import {
  LogoutIcon,
  MegaphoneIcon,
  PriceBookIcon,
  SettingsIcon,
  ShieldIcon,
} from "@/components/icons";
import {
  Button,
  Card,
  NavRow,
  PageHeader,
  Screen,
  SectionHeading,
} from "@/components/ui";

export default function MorePage() {
  return (
    <Screen>
      <PageHeader title="More" />

      <Card tone="accent" className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-accent text-accent-contrast">
          <ShieldIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-body font-semibold">{PRODUCT_NAME}</p>
          <p className="text-caption text-muted">
            Account details land in a later milestone.
          </p>
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionHeading>Your setup</SectionHeading>
        <nav className="flex flex-col gap-2.5" aria-label="Settings">
          <NavRow
            href="/price-book"
            icon={<PriceBookIcon className="h-5 w-5" />}
            title="Price book"
            description="The rates your quotes are built from"
          />
          <NavRow
            href="/calendar/settings"
            icon={<SettingsIcon className="h-5 w-5" />}
            title="Quote day settings"
            description="When customers can book you in"
          />
          <NavRow
            href="/more/ads"
            icon={<MegaphoneIcon className="h-5 w-5" />}
            title="Advertising"
            description="Ad balance, spend and leads"
          />
        </nav>
      </section>

      <form action="/logout" method="post" className="mt-2">
        <Button
          type="submit"
          variant="secondary"
          block
          icon={<LogoutIcon className="h-4 w-4" />}
        >
          Log out
        </Button>
      </form>
    </Screen>
  );
}
