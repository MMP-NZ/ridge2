/**
 * Inline SVG icon set. No icon library — these are the only glyphs the app
 * uses, and inlining them keeps the PWA payload small and the stroke weight
 * consistent with the type.
 *
 * All icons are drawn on a 24px grid, inherit `currentColor`, and are
 * decorative by default (`aria-hidden`), so the surrounding label carries the
 * meaning for screen readers.
 */
import type { SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function Icon({
  className = "h-6 w-6",
  strokeWidth = 1.75,
  ...rest
}: IconProps & { strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    />
  );
}

export function TodayIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9.5h13V10" />
      <path d="M9 19.5v-5h6v5" />
    </Icon>
  );
}

export function LeadsIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M3 13.5V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6.5" />
      <path d="M3 13.5h4.5l1.5 2.5h6l1.5-2.5H21V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 4.5v-1" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <rect x="3.25" y="5" width="17.5" height="15.5" rx="2.5" />
      <path d="M3.25 9.75h17.5" />
      <path d="M8 3.5V6M16 3.5V6" />
      <path d="M7.75 13.5h2.5M13.75 13.5h2.5M7.75 17h2.5" />
    </Icon>
  );
}

export function QuotesIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h7.5L19 9v11.5H6z" />
      <path d="M13.25 3.5V9H19" />
      <path d="M9 13h7M9 16.5h4.5" />
    </Icon>
  );
}

export function MoreIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M4 7.5h16M4 12h16M4 16.5h10" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="m9 5 7 7-7 7" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="m15 5-7 7 7 7" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="m5 9 7 7 7-7" />
    </Icon>
  );
}

export function PinIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.75" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Icon>
  );
}

export function CameraIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M3.5 8.5h3.2l1.6-2.5h7.4l1.6 2.5h3.2v11h-17z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M12 4.5 21 20H3z" />
      <path d="M12 10v4.5M12 17.4v.1" />
    </Icon>
  );
}

export function PhoneIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 5.7 2 2 0 0 1 6 3.5z" />
    </Icon>
  );
}

export function PriceBookIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z" />
      <path d="M5 16.5a3 3 0 0 1 3-3h11" />
      <path d="M9 8.5h6" />
    </Icon>
  );
}

export function MegaphoneIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M4 10.5v3a2 2 0 0 0 2 2h1.5L18 20V4L7.5 8.5H6a2 2 0 0 0-2 2z" />
      <path d="M8 15.5V20h3" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2.25" />
      <circle cx="8" cy="17" r="2.25" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 19 6v6c0 4.2-2.9 7.3-7 8.5-4.1-1.2-7-4.3-7-8.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function InboxIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M4 5.5h16v13H4z" />
      <path d="M4 12.5h4l1.5 2.5h5l1.5-2.5h4" />
    </Icon>
  );
}

export function LogoutIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M14 5.5H6.5v13H14" />
      <path d="M11 12h9M17 8.5l3.5 3.5L17 15.5" />
    </Icon>
  );
}

export function SparkIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9z" />
    </Icon>
  );
}

export function CloudOffIcon(props: IconProps & { strokeWidth?: number }) {
  return (
    <Icon {...props}>
      <path d="M17.5 17.5H7a4 4 0 0 1-.7-7.94" />
      <path d="M8.5 6.2A5.5 5.5 0 0 1 18 9.5a3.8 3.8 0 0 1 2.9 5.1" />
      <path d="m3.5 3.5 17 17" />
    </Icon>
  );
}
