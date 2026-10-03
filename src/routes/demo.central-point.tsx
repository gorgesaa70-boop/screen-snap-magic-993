import { createFileRoute } from "@tanstack/react-router";
import { Store, Maximize, MapPin, ExternalLink, FlaskConical } from "lucide-react";
import { Logo } from "@/components/site/Navbar";

/**
 * بطاقة تجريبية لاختبار عرض عقار واحد قادم من ENGAZ CRM.
 * مستقلة تمامًا عن بقية الموقع — بدون قاعدة بيانات أو ربط تلقائي.
 * ضع هنا رابط العقار الأصلي في ENGAZ CRM ليعمل زر "عرض التفاصيل من المصدر":
 */
const ENGAZ_LISTING_URL = "https://valuegroup.engazcrm.net/consumer/unit/10/title";

export const Route = createFileRoute("/demo/central-point")({
  head: () => ({
    meta: [
      { title: "بطاقة تجريبية — محل تجاري Central Point | فاليو عقار" },
      { name: "description", content: "بطاقة تجريبية لعرض عقار واحد من نظام ENGAZ CRM داخل موقع فاليو عقار." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DemoCentralPoint,
});

function DemoCentralPoint() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          <Logo />
          <span className="flex items-center gap-1.5 rounded-full bg-teal-soft px-3 py-1.5 text-xs font-bold text-primary">
            <FlaskConical className="size-3.5" /> اختبار ENGAZ CRM
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-10 md:py-16">
        <article className="overflow-hidden rounded-2xl border bg-card shadow-card">
          <div className="relative grid aspect-[4/3] place-items-center bg-secondary">
            <span className="grid size-20 place-items-center rounded-2xl bg-teal-soft">
              <Store className="size-10 text-primary" />
            </span>
            <span className="absolute top-3 right-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">محل تجاري</span>
            <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">بطاقة تجريبية</span>
          </div>

          <div className="flex flex-col p-4 md:p-5">
            <p className="text-2xl font-extrabold text-primary">
              2,450,000 <span className="text-sm font-semibold text-muted-foreground">ج.م</span>
            </p>
            <h1 className="mt-1 text-lg font-bold text-foreground">محل تجاري — Central Point</h1>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-primary"><MapPin className="size-3.5 shrink-0 text-teal" />برج العرب الجديدة، الإسكندرية</span>
              <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-primary"><Maximize className="size-3.5 shrink-0 text-teal" />35 م² (مساحة مبنية)</span>
            </div>

            <div className="mt-auto pt-5">
              {ENGAZ_LISTING_URL ? (
                <a href={ENGAZ_LISTING_URL} target="_blank" rel="noreferrer"
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-teal text-sm font-bold text-accent-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.98]">
                  <ExternalLink className="size-4 shrink-0" /> عرض التفاصيل من المصدر
                </a>
              ) : (
                <button disabled
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal text-sm font-bold text-accent-foreground opacity-60">
                  <ExternalLink className="size-4 shrink-0" /> عرض التفاصيل من المصدر
                </button>
              )}
              {!ENGAZ_LISTING_URL && (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">في انتظار رابط العقار في ENGAZ CRM</p>
              )}
            </div>
          </div>
        </article>

        <p className="mt-5 rounded-xl bg-teal-soft px-4 py-3 text-center text-xs leading-relaxed text-primary">
          بطاقة تجريبية لاختبار عرض عقار واحد من نظام ENGAZ CRM — لا يوجد ربط تلقائي بين النظامين بعد.
        </p>
      </main>
    </div>
  );
}
