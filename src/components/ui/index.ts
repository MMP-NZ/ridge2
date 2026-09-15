/**
 * The shared UI primitives. Every screen is built from these — if a screen
 * needs a card, a button or a field, it imports it from here rather than
 * re-typing the class list, so a change to the look lands everywhere at once.
 */
export { cx } from "./cx";
export { formatNzTime, formatNzDayLabel, formatNzWeekdayDate } from "./format";

export { Button, LinkButton, Spinner, buttonClasses } from "./button";
export type {
  ButtonProps,
  LinkButtonProps,
  ButtonVariant,
  ButtonSize,
} from "./button";

export { Card, CardTitle, SectionHeading } from "./card";
export type { CardProps, CardTone, CardPadding } from "./card";

export { Screen } from "./screen";
export { PageHeader } from "./page-header";
export type { PageHeaderProps } from "./page-header";

export { Badge, CountBadge } from "./badge";
export type { BadgeTone } from "./badge";

export {
  Field,
  TextInput,
  TextArea,
  SelectInput,
  ChoiceChip,
  ToggleRow,
  controlClasses,
} from "./field";
export type { FieldProps } from "./field";

export { EmptyState } from "./empty-state";
export { StatTile } from "./stat-tile";
export type { StatTileProps, StatTone } from "./stat-tile";
export { NavRow } from "./nav-row";
export { FormMessage } from "./form-message";
export type { MessageTone } from "./form-message";
