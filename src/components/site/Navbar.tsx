import { useState } from "react";
import { Menu, Search, X, Plus, Building2, FileSearch, Home } from "lucide-react";
import { NotificationBell } from "@/components/site/NotificationBell";
import { t, useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

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
  const links = [
    { label: t("الرئيسية"), href: "/#top" },
    { label: t("العقارات"), href: "/#properties" },
    { label: t("خريطة العقارات"), href: "/map" },
    { label: t("المصانع والأراضي الصناعية"), href: "/industrial" },
    { label: t("المولات"), href: "/malls" },
    { label: t("الوسطاء العقاريون"), href: "/brokers" },
    { label: t("اطلب عقارك"), href: "/#request" },
    { label: t("دخول الوسطاء"), href: "/auth" },
  ];
  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <Logo />
        <nav className="hidden items-center gap-4 xl:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-semibold text-foreground/75 transition-colors hover:text-primary">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LangToggle />
          <NotificationBell />
          <a href="/#search" aria-label={t("البحث")} className="grid size-10 place-items-center rounded-full text-primary transition-colors hover:bg-secondary">
            <Search className="size-5" />
          </a>
          <a href="/#request" className="hidden items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-navy-deep sm:inline-flex">
            <Plus className="size-4" /> {t("أضف عقارك")}
          </a>
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label={t("القائمة")} aria-expanded={open} className="grid size-10 place-items-center rounded-full text-primary hover:bg-secondary xl:hidden">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <nav className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t bg-background px-4 pb-4 shadow-card xl:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block border-b py-3.5 text-base font-semibold text-foreground/80 transition active:bg-secondary hover:text-primary">
              {l.label}
            </a>
          ))}
          <a href="/#request" onClick={() => setOpen(false)} className="mt-4 flex items-center justify-center gap-1.5 rounded-full bg-primary py-3 font-bold text-primary-foreground">
            <Plus className="size-4" /> {t("أضف عقارك")}
          </a>
        </nav>
      )}
    </header>
  );
}

export function MobileBar() {
  useLang();
  const items = [
    { label: t("الرئيسية"), href: "/#top", icon: Home },
    { label: t("بحث"), href: "/#search", icon: Search },
    { label: t("الوسطاء"), href: "/brokers", icon: Building2 },
    { label: t("اطلب عقارك"), href: "/#request", icon: FileSearch },
  ];
  return (
    <nav aria-label={t("تنقل سريع")} className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="grid grid-cols-4">
        {items.map(({ label, href, icon: Icon }) => (
          <a key={href} href={href} className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold text-foreground/70 transition hover:text-primary active:bg-secondary">
            <Icon className="size-5 shrink-0" />{label}
          </a>
        ))}
      </div>
    </nav>
  );
}
