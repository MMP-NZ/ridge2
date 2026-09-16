import { redirect } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { OfflineSync } from "@/components/offline-sync";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { getCurrentRooferSession } from "@/lib/auth/current-session";

/**
 * Phone-first shell for the roofer PWA. 390px is the baseline breakpoint
 * (CLAUDE.md: "every roofer screen must work one-handed at 390px wide") —
 * the max-w-md content column plus bottom padding for the fixed nav bar
 * apply to every screen under this route group.
 *
 * Also the auth gate for every roofer screen: no valid session, no access.
 */
export default async function RooferLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
      {children}
      {/* Both are app-wide on purpose: a visit written up on a roof must
          sync as soon as he has reception, whether or not he happens to
          reopen that visit. */}
      <ServiceWorkerRegister />
      <OfflineSync />
      <BottomNav />
    </div>
  );
}
