import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Building2, MapPin, CalendarClock } from "lucide-react";
import { PageShell, inputCls } from "@/components/site/ui";
import { CITY_NAMES, formatPrice } from "@/components/site/data";
import { fetchProjects, projectCover } from "@/components/site/projects";
import { pageHead } from "@/lib/seo";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/projects/")({
  head: () => pageHead({
    path: "/projects",
    title: "المشروعات والكمبوندات | فاليو عقار",
    description: "مشروعات شركات التطوير العقاري في برج العرب والساحل الشمالي: الوحدات المتاحة، أنظمة التقسيط، ومواعيد التسليم.",
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  useLang();
  const q = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const [city, setCity] = useState("");
  const rows = useMemo(() => (q.data ?? []).filter((p) => !city || p.city === city), [q.data, city]);
  return (
    <PageShell>
      <section className="bg-primary px-4 py-8 text-primary-foreground md:px-6 md:py-12">
        <div className="mx-auto max-w-6xl">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold md:text-4xl"><Building2 className="size-7 text-teal md:size-9" />{t("المشروعات")}</h1>
          <p className="mt-2 text-sm text-primary-foreground/80 md:text-base">{t("مشروعات شركات التطوير العقاري والوحدات المتاحة فيها.")}</p>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 pt-5 md:px-6">
        <select aria-label={t("المدينة")} className={`${inputCls} sm:w-64`} value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">{t("كل المدن")}</option>
          {CITY_NAMES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
        </select>
        {!q.isLoading && rows.length === 0 && <p className="mt-4 rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">{t("لا توجد مشروعات بعد.")}</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.isLoading && [1, 2, 3].map((i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-muted" />)}
          {rows.map((p) => {
            const available = p.project_units.filter((u) => u.status === "available").length;
            return (
              <Link key={p.id} to="/projects/$id" params={{ id: p.id }} className="overflow-hidden rounded-2xl border bg-card shadow-card transition hover:-translate-y-0.5">
                <div className="relative aspect-[4/3] bg-muted">
                  <img src={projectCover(p)} alt={p.name} loading="lazy" className="size-full object-cover" />
                  {p.is_featured && <span className="absolute top-3 right-3 rounded-full bg-teal px-3 py-1 text-xs font-bold text-accent-foreground">{t("مميز")}</span>}
                </div>
                <div className="p-4">
                  <h2 className="font-extrabold text-primary">{p.name}</h2>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4 text-teal" />{p.area === p.city ? t(p.city) : `${t(p.area)} / ${t(p.city)}`}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-primary">
                    <span className="rounded-lg bg-secondary px-2 py-1">{formatPrice(available)} {t("وحدة متاحة")}</span>
                    {p.delivery_date && <span className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-1"><CalendarClock className="size-3.5" />{t("التسليم:")} {p.delivery_date}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
