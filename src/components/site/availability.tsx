import { t } from "@/lib/i18n";

/** A listing / mall unit: available, reserved or sold (release 30). Older rows without the column count as available. */
export type Availability = "available" | "reserved" | "sold";
export const AVAILABILITY: Record<Availability, { label: string; cls: string }> = {
  available: { label: "متاحة", cls: "bg-teal-soft text-primary" },
  reserved: { label: "محجوزة", cls: "bg-amber-100 text-amber-900" },
  sold: { label: "مباعة", cls: "bg-destructive text-destructive-foreground" },
};
export const availabilityOf = (p: { availability?: string | null | undefined }): Availability =>
  p.availability === "reserved" || p.availability === "sold" ? p.availability : "available";
export const isAvailable = (p: { availability?: string | null | undefined }) => availabilityOf(p) === "available";
/** Available first, then reserved, then sold (stable for the rest). */
export const byAvailability = <T extends { availability?: string | null | undefined }>(a: T, b: T) =>
  ["available", "reserved", "sold"].indexOf(availabilityOf(a)) - ["available", "reserved", "sold"].indexOf(availabilityOf(b));

/** «محجوزة» / «مباعة» badge on cards and pages; nothing for available listings. */
export function AvailabilityBadge({ p, className = "" }: { p: { availability?: string | null | undefined }; className?: string }) {
  const a = availabilityOf(p);
  if (a === "available") return null;
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${AVAILABILITY[a].cls} ${className}`}>{t(AVAILABILITY[a].label)}</span>;
}
