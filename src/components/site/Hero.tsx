import { Search } from "lucide-react";
import hero from "@/assets/hero.jpg";

const field = "w-full rounded-xl border bg-background px-3.5 py-3 text-sm font-medium text-foreground outline-none focus:border-teal focus:ring-2 focus:ring-teal/30";

export function Hero() {
  return (
    <section id="top" className="relative">
      <div className="relative min-h-[600px] overflow-hidden md:min-h-[640px]">
        <img src={hero} alt="مجمع سكني حديث في برج العرب الجديدة" width={1920} height={1088} className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-hero-overlay" />
        <div className="relative mx-auto max-w-7xl px-4 pt-20 pb-48 md:px-6 md:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-4 py-1.5 text-xs font-semibold text-primary-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-teal" /> برج العرب الجديدة
          </span>
          <h1 className="mt-5 max-w-2xl text-4xl leading-tight font-extrabold text-primary-foreground md:text-6xl md:leading-[1.15]">
            عقارك المناسب، <span className="text-teal">أقرب</span> مما تتخيل
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-primary-foreground/85 md:text-lg">
            اكتشف العقارات المتاحة في برج العرب، وقارن الخيارات، وتواصل مع الوسيط المناسب بكل سهولة.
          </p>
        </div>
      </div>

      <div id="search" className="relative z-10 mx-auto -mt-40 max-w-6xl scroll-mt-24 px-4 md:-mt-32 md:px-6">
        <form onSubmit={(e) => { e.preventDefault(); document.getElementById("properties")?.scrollIntoView({ behavior: "smooth" }); }}
          className="grid grid-cols-2 gap-3 rounded-2xl bg-card p-4 shadow-float md:grid-cols-6 md:p-5">
          <label className="col-span-1 md:col-span-1">
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground">نوع العقار</span>
            <select className={field}>
              {["شقة", "فيلا", "أرض", "محل", "مكتب", "دوبلكس"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground">الغرض</span>
            <select className={field}><option>بيع</option><option>إيجار</option></select>
          </label>
          <label className="col-span-2 md:col-span-1">
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground">المنطقة</span>
            <select className={field}>
              {["كل المناطق", "الحي الأول", "الحي الثاني", "الحي الثالث", "الحي الرابع", "الحي الخامس"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground">السعر من</span>
            <input type="number" inputMode="numeric" placeholder="جنيه" className={field} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground">إلى</span>
            <input type="number" inputMode="numeric" placeholder="جنيه" className={field} />
          </label>
          <button type="submit" className="col-span-2 mt-1 flex items-center justify-center gap-2 self-end rounded-xl bg-teal py-3 font-bold text-accent-foreground transition hover:brightness-95 md:col-span-1 md:mt-0">
            <Search className="size-4" /> ابحث عن عقار
          </button>
        </form>
      </div>
    </section>
  );
}
