import type { ReactNode } from "react";
import { Navbar, MobileBar } from "./Navbar";
import { Footer } from "./Sections";

export const inputCls =
  "h-11 w-full rounded-xl border bg-card px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-teal focus:ring-2 focus:ring-teal/30 disabled:opacity-60";
export const btnPrimary =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-navy-deep focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.98] disabled:opacity-60";
export const btnOutline =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-primary px-5 text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.98] disabled:opacity-60";
export const btnTeal =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-teal px-5 text-sm font-bold text-accent-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.98] disabled:opacity-60";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pb-6">{children}</main>
      <Footer />
      <MobileBar />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-primary">{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string | undefined }) {
  return (
    <div className="rounded-2xl border bg-card p-4 md:p-5">
      <p className="text-xs font-bold text-muted-foreground md:text-sm">{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold text-primary md:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0">
      <div className="inline-flex gap-1 rounded-2xl bg-secondary p-1">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => onChange(t.id)}
            className={`h-10 shrink-0 rounded-xl px-4 text-sm font-bold whitespace-nowrap transition ${value === t.id ? "bg-card text-primary shadow-card" : "text-foreground/70 hover:text-primary"}`}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Avatar({ name, url, size = "size-14" }: { name: string; url?: string | null; size?: string }) {
  return url ? (
    <img src={url} alt={name} loading="lazy" className={`${size} shrink-0 rounded-2xl object-cover`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center rounded-2xl bg-primary text-lg font-extrabold text-teal`}>
      {name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
    </span>
  );
}
