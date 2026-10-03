import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Factory, MapPin, Maximize, Search, X } from "lucide-react";
import { PageShell, inputCls, btnOutline } from "@/components/site/ui";
import { formatPrice } from "@/components/site/data";
import { IND_TYPES, applyInd, emptyInd, fetchActivities, fetchIndustrialProperties, fetchZones, type IndFilters } from "@/components/site/industrial";

export const Route = createFileRoute("/industrial/")({
  head: () => ({
    meta: [
      { title: "المصانع والأراضي الصناعية | فاليو عقار" },
      { name: "description", content: "ابحث عن أراضٍ صناعية ومصانع للبيع والإيجار حسب المنطقة الصناعية والنشاط والمساحة والسعر." },
      { property: "og:title", content: "المصانع والأراضي الصناعية | فاليو عقار" },
      { property: "og:description", content: "أراضٍ صناعية ومصانع ومبانٍ صناعية للبيع والإيجار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IndustrialPage,
});

function IndustrialPage() {
  const list = useQuery({ queryKey: ["industrial-properties"], queryFn: fetchIndustrialProperties });
  const zones = useQuery({ queryKey: ["ind-zones"], queryFn: () => fetchZones() });
  const acts = useQuery({ queryKey: ["ind-acts"], queryFn: () => fetchActivities() });
  const [f, setF] = useState<IndFilters>(emptyInd);
  const rows = useMemo(() => applyInd(list.data ?? [], f), [list.data, f]);
  const actName = (id: string | null) => acts.data?.find((a) => a.id === id)?.name;
  const set = (k: keyof IndFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: k.startsWith("min") || k.startsWith("max") ? e.target.value.replace(/\D/g, "") : e.target.value });
  const dirty = Object.values(f).some((v) => v !== "");

  return (
    <PageShell>
      <section className="bg-primary px-4 py-8 text-primary-foreground md:px-6 md:py-12">
        <div className="mx-auto max-w-6xl">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold md:text-4xl"><Factory className="size-7 text-teal md:size-9" />المصانع والأراضي الصناعية</h1>
          <p className="mt-2 text-sm text-primary-foreground/80 md:text-base">أراضٍ صناعية ومصانع ومبانٍ صناعية للبيع والإيجار في المناطق الصناعية.</p>
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input aria-label="بحث سريع" className={`${inputCls} pr-9`} placeholder="بحث سريع بالاسم أو الموقع..." value={f.q} onChange={set("q")} />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 pt-5 md:px-6">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3 md:grid-cols-4">
          <select aria-label="نوع العقار" className={`${inputCls} col-span-2 md:col-span-1`} value={f.type} onChange={set("type")}><option value="">كل الأنواع</option>{IND_TYPES.map((t) => <option key={t.value}>{t.value}</option>)}</select>
          <select aria-label="المنطقة الصناعية" className={inputCls} value={f.zone} onChange={set("zone")}><option value="">كل المناطق</option>{zones.data?.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
          <select aria-label="النشاط" className={inputCls} value={f.activity} onChange={set("activity")}><option value="">كل الأنشطة</option>{acts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select aria-label="الحالة" className={inputCls} value={f.status} onChange={set("status")}><option value="">بيع وإيجار</option><option value="بيع">للبيع</option><option value="إيجار">للإيجار</option></select>
          <input aria-label="أقل مساحة" className={inputCls} inputMode="numeric" placeholder="أقل مساحة م²" value={f.minSize} onChange={set("minSize")} />
          <input aria-label="أكبر مساحة" className={inputCls} inputMode="numeric" placeholder="أكبر مساحة م²" value={f.maxSize} onChange={set("maxSize")} />
          <input aria-label="أقل سعر" className={inputCls} inputMode="numeric" placeholder="أقل سعر" value={f.minPrice} onChange={set("minPrice")} />
          <input aria-label="أعلى سعر" className={inputCls} inputMode="numeric" placeholder="أعلى سعر" value={f.maxPrice} onChange={set("maxPrice")} />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <p className="font-bold text-primary">{list.isLoading ? "جارٍ التحميل..." : `${rows.length} عقار`}</p>
          {dirty && <button onClick={() => setF(emptyInd)} className="flex items-center gap-1 font-bold text-teal"><X className="size-4" />مسح الفلاتر</button>}
        </div>
        {list.isError && <p className="mt-4 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">تعذّر تحميل العقارات.</p>}
        {!list.isLoading && rows.length === 0 && (
          <div className="mt-4 rounded-2xl border border-dashed bg-card p-10 text-center">
            <Factory className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 font-bold text-primary">{dirty ? "لا توجد نتائج مطابقة" : "لا توجد عقارات صناعية منشورة بعد"}</p>
            {dirty && <button onClick={() => setF(emptyInd)} className={`${btnOutline} mt-4`}>مسح الفلاتر</button>}
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <Link key={p.id} to="/industrial/$id" params={{ id: p.id }} className="group overflow-hidden rounded-2xl border bg-card shadow-card transition hover:-translate-y-0.5">
              <div className="relative aspect-[4/3] bg-muted">
                {p.image_url ? <img src={p.image_url} alt={p.title} loading="lazy" className="size-full object-cover" /> : <div className="grid size-full place-items-center"><Factory className="size-12 text-muted-foreground" /></div>}
                <span className="absolute top-3 right-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">لل{p.status}</span>
                {p.is_featured && <span className="absolute top-3 left-3 rounded-full bg-teal px-2.5 py-1 text-[11px] font-bold text-accent-foreground">مميز</span>}
              </div>
              <div className="p-4">
                <p className="text-xs font-bold text-teal">{p.type}{actName(p.activity_id) ? ` · ${actName(p.activity_id)}` : ""}</p>
                <h2 className="mt-1 truncate font-extrabold text-primary">{p.title}</h2>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4 text-teal" />{p.area}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-primary">
                  {p.land_size != null && <span className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-1"><Maximize className="size-3.5" />أرض {formatPrice(Number(p.land_size))} م²</span>}
                  {p.built_size != null && <span className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-1"><Maximize className="size-3.5" />مباني {formatPrice(Number(p.built_size))} م²</span>}
                </div>
                <p className="mt-3 text-lg font-extrabold text-primary">{formatPrice(Number(p.price))} <span className="text-xs text-muted-foreground">ج.م</span></p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
