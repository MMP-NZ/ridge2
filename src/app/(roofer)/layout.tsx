import { BottomNav } from "@/components/bottom-nav";

/**
 * Phone-first shell for the roofer PWA. 390px is the baseline breakpoint
 * (CLAUDE.md: "every roofer screen must work one-handed at 390px wide") —
 * the max-w-md content column plus bottom padding for the fixed nav bar
 * apply to every screen under this route group.
 */
export default function RooferLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col pb-16">
      {children}
      <BottomNav />
    </div>
  );
}
