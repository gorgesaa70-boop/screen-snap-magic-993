import { useState } from "react";
import { Menu, Search, X, Plus } from "lucide-react";

const links = [
  { label: "الرئيسية", href: "#top" },
  { label: "العقارات", href: "#properties" },
  { label: "الوسطاء", href: "#brokers" },
  { label: "اطلب عقارك", href: "#request" },
  { label: "خدمات الوسطاء", href: "#broker-services" },
];

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <a href="#top" className="flex items-baseline gap-1.5" dir="ltr">
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
          <a href="#search" aria-label="البحث" className="grid size-10 place-items-center rounded-full text-primary transition-colors hover:bg-secondary">
            <Search className="size-5" />
          </a>
          <a href="#request" className="hidden items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-navy-deep sm:inline-flex">
            <Plus className="size-4" /> أضف عقارك
          </a>
          <button onClick={() => setOpen(!open)} aria-label="القائمة" className="grid size-10 place-items-center rounded-full text-primary hover:bg-secondary lg:hidden">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t bg-background px-4 pb-4 lg:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block border-b py-3.5 font-semibold text-foreground/80">
              {l.label}
            </a>
          ))}
          <a href="#request" onClick={() => setOpen(false)} className="mt-4 flex items-center justify-center gap-1.5 rounded-full bg-primary py-3 font-bold text-primary-foreground">
            <Plus className="size-4" /> أضف عقارك
          </a>
        </nav>
      )}
    </header>
  );
}
