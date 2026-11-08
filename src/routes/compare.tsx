import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Scale, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { COMPARE_MAX, removeCompare, useCompareIds } from "@/lib/compare";
import { PageShell, btnOutline } from "@/components/site/ui";
import { ShareButton } from "@/components/site/CustomerTools";
import { FINISHING_LABEL, PRICE_UNIT_LABEL, PURPOSE_LABEL, formatDate, formatPrice, toProperty, type Property } from "@/components/site/data";
import { thumb } from "@/lib/images";

export const Route = createFileRoute("/compare")({
  head: () => ({ meta: [{ title: "مقارنة الوحدات | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: ComparePage,
});

const perMeter = (p: Property) => (p.status === "بيع" && p.price > 0 && p.size > 0 ? Math.round(p.price / p.size) : null);
const ID = /^[0-9a-f-]{36}$/;

type Row = { label: string; value: (p: Property) => ReactNode; best?: (list: Property[]) => string | null };

/** Which listing wins a row, only when the choice means something (2 or more values, not all equal). */
function bestBy(list: Property[], score: (p: Property) => number | null, lowest: boolean) {
  const scored = list.flatMap((p) => { const s = score(p); return s == null ? [] : [{ id: p.id, s }]; });
  if (scored.length < 2) return null;
  const values = scored.map((x) => x.s);
  const target = lowest ? Math.min(...values) : Math.max(...values);
  if (values.every((v) => v === target)) return null;
  const winners = scored.filter((x) => x.s === target);
  return winners.length === 1 ? winners[0]!.id : null;
}

function ComparePage() {
  useLang();
  const saved = useCompareIds();
  // A shared link shows exactly its listings; otherwise this device's picks.
  const [shared, setShared] = useState<string[] | null>(null);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("ids");
    if (raw) setShared(raw.split(",").filter((x) => ID.test(x)).slice(0, COMPARE_MAX));
  }, []);
  const ids = shared ?? saved;
  useEffect(() => {
    if (!ids.length) return;
    const u = new URL(window.location.href); u.searchParams.set("ids", ids.join(","));
    window.history.replaceState(window.history.state, "", u);
  }, [ids]);

  const q = useQuery({
    queryKey: ["compare", ids], enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").in("id", ids);
      if (error) throw error;
      const found = new Map(data.map((r) => [r.id, toProperty(r)]));
      return ids.flatMap((id) => { const p = found.get(id); return p ? [p] : []; });
    },
  });
  const list = q.data ?? [];
  const remove = (id: string) => { removeCompare(id); if (shared) setShared(shared.filter((x) => x !== id)); };

  const rows: Row[] = [
    { label: "السعر", value: (p) => <b className="text-base text-primary">{formatPrice(p.price)} {t("ج.م")}{p.priceUnit ? ` / ${t(PRICE_UNIT_LABEL[p.priceUnit] ?? p.priceUnit)}` : ""}</b>, best: (l) => (new Set(l.map((p) => p.status)).size === 1 ? bestBy(l, (p) => p.price, true) : null) },
    { label: "سعر المتر", value: (p) => { const v = perMeter(p); return v == null ? "—" : `${formatPrice(v)} ${t("ج.م")}`; }, best: (l) => bestBy(l, perMeter, true) },
    { label: "الغرض", value: (p) => t(PURPOSE_LABEL[p.status] ?? p.status) },
    { label: "النوع", value: (p) => t(p.type) },
    { label: "المكان", value: (p) => (p.area === p.city ? t(p.city) : `${t(p.area)}، ${t(p.city)}`) },
    { label: "المساحة", value: (p) => (p.size ? `${formatPrice(p.size)} ${t("م²")}` : "—"), best: (l) => bestBy(l, (p) => p.size || null, false) },
    { label: "الغرف", value: (p) => p.rooms || "—", best: (l) => bestBy(l, (p) => p.rooms || null, false) },
    { label: "الحمامات", value: (p) => p.baths || "—", best: (l) => bestBy(l, (p) => p.baths || null, false) },
    { label: "التشطيب", value: (p) => (p.finishing ? t(FINISHING_LABEL[p.finishing] ?? p.finishing) : "—") },
    { label: "التقسيط", value: (p) => (p.installments ? [p.installments.down != null ? `${t("مقدم")} ${formatPrice(p.installments.down)}` : null, p.installments.years ? `${p.installments.years} ${t("سنين")}` : null].filter(Boolean).join(" · ") || t("متاح") : "—") },
    { label: "متحقق منه", value: (p) => (p.verified ? <span className="inline-flex items-center gap-1 font-bold text-teal"><BadgeCheck className="size-4" />{formatDate(p.verified.at)}</span> : "—") },
    { label: "آخر تأكيد", value: (p) => (p.confirmedAt ? formatDate(p.confirmedAt) : "—") },
  ];

  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary md:text-3xl"><Scale className="size-6 text-teal" />{t("مقارنة الوحدات")}</h1>
          {list.length > 0 && <ShareButton title={t("مقارنة الوحدات")} />}
        </div>
        {ids.length === 0 || (q.isSuccess && list.length === 0) ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">{t("لسه مااخترتش وحدات. دوس على علامة الميزان في أي إعلان، وتقدر تقارن لحد {n} وحدات.", { n: COMPARE_MAX })}</p>
            <a href="/#properties" className={`${btnOutline} mt-3`}>{t("تصفّح العقارات")}</a>
          </div>
        ) : q.isLoading ? <div className="h-96 animate-pulse rounded-2xl bg-muted" /> : (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[520px] table-fixed border-collapse text-sm">
              <colgroup><col className="w-24 md:w-36" />{list.map((p) => <col key={p.id} />)}</colgroup>
              <thead>
                <tr>
                  <th className="sticky start-0 z-10 bg-card" />
                  {list.map((p) => (
                    <th key={p.id} className="p-2 text-start align-top font-normal md:p-3">
                      <div className="relative">
                        <img src={thumb(p.image)} alt={p.title} className="aspect-[4/3] w-full rounded-xl object-cover" />
                        <button type="button" aria-label={t("شيل من المقارنة")} onClick={() => remove(p.id)} className="absolute top-1.5 end-1.5 grid size-8 place-items-center rounded-full bg-background/90 text-primary shadow-card"><X className="size-4" /></button>
                      </div>
                      <Link to="/properties/$id" params={{ id: p.id }} className="mt-2 line-clamp-2 font-extrabold text-primary hover:text-teal">{p.title}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const best = r.best?.(list) ?? null;
                  return (
                    <tr key={r.label} className="border-t">
                      <th scope="row" className="sticky start-0 z-10 bg-card p-2 text-start text-xs font-bold text-muted-foreground md:p-3">{t(r.label)}</th>
                      {list.map((p) => <td key={p.id} className={`p-2 align-top md:p-3 ${best === p.id ? "bg-teal-soft font-bold" : ""}`}>{r.value(p)}</td>)}
                    </tr>
                  );
                })}
                <tr className="border-t">
                  <th className="sticky start-0 z-10 bg-card" />
                  {list.map((p) => <td key={p.id} className="p-2 md:p-3"><Link to="/properties/$id" params={{ id: p.id }} className={`${btnOutline} w-full`}>{t("التفاصيل")}</Link></td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {list.length > 0 && list.length < COMPARE_MAX && <p className="mt-3 text-sm text-muted-foreground"><a href="/#properties" className="font-bold text-primary underline">{t("ضيف وحدة تانية")}</a> · {t("الخانة الملوّنة هي الأفضل في السطر ده.")}</p>}
      </div>
    </PageShell>
  );
}
