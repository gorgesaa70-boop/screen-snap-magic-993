import { useState } from "react";
import { Menu, Search, X, Plus, Building2, FileSearch, Home } from "lucide-react";

const links = [
  { label: "الرئيسية", href: "/#top" },
  { label: "العقارات", href: "/#properties" },
  { label: "خريطة العقارات", href: "/map" },
  { label: "الوسطاء العقاريون", href: "/brokers" },
  { label: "اطلب عقارك", href: "/#request" },
  { label: "دخول الوسطاء", href: "/auth" },
];

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <a href="/" className="flex items-baseline gap-1.5" dir="ltr">
      <span className={`text-xl font-extrabold tracking-[0.18em] ${light ? "text-primary-foreground" : "text-primary"}`}>VALUE</span>
      <span className="text-xl font-semibold text-teal">Aqar</span>
    </a>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <Logo />
        <nav className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-semibold text-foreground/75 transition-colors hover:text-primary">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href="/#search" aria-label="البحث" className="grid size-10 place-items-center rounded-full text-primary transition-colors hover:bg-secondary">
            <Search className="size-5" />
          </a>
          <a href="/#request" className="hidden items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-navy-deep sm:inline-flex">
            <Plus className="size-4" /> أضف عقارك
          </a>
          <button onClick={() => setOpen(!open)} aria-label="القائمة" aria-expanded={open} className="grid size-10 place-items-center rounded-full text-primary hover:bg-secondary lg:hidden">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t bg-background px-4 pb-4 shadow-card lg:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block border-b py-3.5 text-base font-semibold text-foreground/80 transition active:bg-secondary hover:text-primary">
              {l.label}
            </a>
          ))}
          <a href="/#request" onClick={() => setOpen(false)} className="mt-4 flex items-center justify-center gap-1.5 rounded-full bg-primary py-3 font-bold text-primary-foreground">
            <Plus className="size-4" /> أضف عقارك
          </a>
        </nav>
      )}
    </header>
  );
}

export function MobileBar() {
  const items = [
    { label: "الرئيسية", href: "/#top", icon: Home },
    { label: "بحث", href: "/#search", icon: Search },
    { label: "الوسطاء", href: "/brokers", icon: Building2 },
    { label: "اطلب عقارك", href: "/#request", icon: FileSearch },
  ];
  return (
    <nav aria-label="تنقل سريع" className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
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
