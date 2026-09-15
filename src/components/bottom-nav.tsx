"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  CalendarIcon,
  type IconProps,
  LeadsIcon,
  MoreIcon,
  QuotesIcon,
  TodayIcon,
} from "@/components/icons";

interface Tab {
  href: string;
  label: string;
  Icon: ComponentType<IconProps & { strokeWidth?: number }>;
  /** Extra path prefixes that belong to this tab, so deep screens keep it lit. */
  owns?: string[];
}

const TABS: Tab[] = [
  { href: "/today", label: "Today", Icon: TodayIcon, owns: ["/visits"] },
  { href: "/leads", label: "Leads", Icon: LeadsIcon, owns: ["/customers"] },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/quotes", label: "Quotes", Icon: QuotesIcon },
  { href: "/more", label: "More", Icon: MoreIcon, owns: ["/price-book"] },
];

function isActive(pathname: string, tab: Tab): boolean {
  const roots = [tab.href, ...(tab.owns ?? [])];
  return roots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 shadow-nav backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          const { Icon } = tab;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="group flex min-h-14 flex-col items-center justify-center gap-1 px-1 pb-1.5 pt-2 transition-transform duration-150 active:scale-95"
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-pill transition-colors duration-150 ${
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-muted group-active:bg-surface-sunken"
                  }`}
                >
                  <Icon
                    className="h-[22px] w-[22px]"
                    strokeWidth={active ? 2.1 : 1.7}
                  />
                </span>
                <span
                  className={`text-micro font-semibold tracking-[0.01em] ${active ? "text-accent" : "text-muted"}`}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
