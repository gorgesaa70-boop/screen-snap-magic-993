import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Menu, Search, X, Plus, Building2, FileSearch, Home, UserRound } from "lucide-react";
import { NotificationBell } from "@/components/site/NotificationBell";
import { t, useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/hooks/useAuth";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <a href="/" className="flex items-baseline gap-1.5" dir="ltr">
      <span className={`text-xl font-extrabold tracking-[0.18em] ${light ? "text-primary-foreground" : "text-primary"}`}>VALUE</span>
      <span className="text-xl font-semibold text-teal">Aqar</span>
    </a>
  );
}

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <Button variant="outline"
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
      title={lang === "ar" ? "English" : "العربية"}
      className="grid h-10 min-w-10 place-items-center rounded-full border border-primary/25 px-2 text-xs font-extrabold text-primary transition-colors hover:bg-secondary"
    >
      {lang === "ar" ? "EN" : "ع"}
    </Button>
  );
}

export function Navbar() {
  useLang();
  const [open, setOpen] = useState(false);
  const { user } = useSessionUser();
  const links = [
    { label: t("الرئيسية"), href: "/#top" },
    { label: t("سكني"), href: "/?cat=residential#properties" },
    { label: t("تجاري"), href: "/?cat=commercial#properties" },
    { label: t("إداري"), href: "/?cat=office#properties" },
    { label: t("أراضي"), href: "/?cat=land#properties" },
    { label: t("صناعي"), href: "/industrial" },
    { label: t("الوسطاء"), href: "/brokers" },
  ];
  const account = user ? { href: "/dashboard", label: t("حسابي") } : { href: "/auth", label: t("دخول الوسطاء") };
  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <Logo />
        <nav className="hidden items-center gap-5 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-semibold text-foreground/75 transition-colors hover:text-primary">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LangToggle />
          <NotificationBell />
          <a href={account.href} aria-label={account.label} title={account.label} className="grid size-10 place-items-center rounded-full text-primary transition-colors hover:bg-secondary">
            <UserRound className="size-5" />
          </a>
          <a href="/sell" className="hidden items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-navy-deep sm:inline-flex">
            <Plus className="size-4" /> {t("بيع عقارك")}
          </a>
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label={t("القائمة")} aria-expanded={open} className="grid size-10 place-items-center rounded-full text-primary hover:bg-secondary lg:hidden">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <nav className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t bg-background px-4 pb-4 shadow-card lg:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block border-b py-3.5 text-base font-semibold text-foreground/80 transition active:bg-secondary hover:text-primary">
              {l.label}
            </a>
          ))}
          <a href={account.href} onClick={() => setOpen(false)} className="flex items-center gap-2 border-b py-3.5 text-base font-semibold text-foreground/80 transition active:bg-secondary hover:text-primary">
            <UserRound className="size-4" /> {account.label}
          </a>
          <a href="/sell" onClick={() => setOpen(false)} className="mt-4 flex items-center justify-center gap-1.5 rounded-full bg-primary py-3 font-bold text-primary-foreground">
            <Plus className="size-4" /> {t("بيع عقارك")}
          </a>
        </nav>
      )}
    </header>
  );
}

export function MobileBar() {
  useLang();
  const { pathname, hash } = useRouterState({ select: (s) => s.location });
  const items = [
    { id: "home", label: t("الرئيسية"), href: "/#top", icon: Home },
    { id: "search", label: t("بحث"), href: "/#search", icon: Search },
    { id: "sell", label: t("بيع عقارك"), href: "/sell", icon: Plus },
    { id: "brokers", label: t("الوسطاء"), href: "/brokers", icon: Building2 },
    { id: "request", label: t("اطلب عقارك"), href: "/#request", icon: FileSearch },
  ];
  const active =
    pathname === "/sell" ? "sell"
    : pathname.startsWith("/brokers") ? "brokers"
    : pathname === "/" ? (hash === "search" || hash === "request" ? hash : "home")
    : null;
  return (
    <nav aria-label={t("تنقل سريع")} className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="grid grid-cols-5">
        {items.map(({ id, label, href, icon: Icon }) =>
          id === "sell" ? (
            <a key={id} href={href} aria-current={active === id ? "page" : undefined} className="flex h-16 flex-col items-center justify-end gap-1 pb-2 text-[11px] font-extrabold text-primary">
              <span className="-mt-7 grid size-14 place-items-center rounded-full border-4 border-background bg-teal text-accent-foreground shadow-float transition active:scale-95">
                <Icon className="size-6" strokeWidth={2.5} />
              </span>
              {label}
            </a>
          ) : (
            <a key={id} href={href} aria-current={active === id ? "page" : undefined}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold transition hover:text-primary active:bg-secondary ${active === id ? "text-primary" : "text-foreground/60"}`}>
              <Icon className="size-5 shrink-0" strokeWidth={active === id ? 2.5 : 2} />{label}
            </a>
          ),
        )}
      </div>
    </nav>
  );
}
