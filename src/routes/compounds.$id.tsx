import { cleanPhone } from "@/lib/phone";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MapPin, CalendarClock, Wallet, CheckCircle2, Building2 } from "lucide-react";
import { getAttribution } from "@/lib/attribution";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Avatar, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { Gallery, PlaceMap } from "@/components/site/Gallery";
import { PropertyCard } from "@/components/site/Sections";
import { formatPrice, toProperty } from "@/components/site/data";
import { UNIT_STATUS, compoundCover, compoundWhere, developerLabel, fetchCompound, isReady, type CompoundUnitRow } from "@/components/site/compounds";
import { InstallmentCalc, ShareButton } from "@/components/site/CustomerTools";
import { pageHead, unavailableHead, breadcrumbs, SITE_NAME, SITE_URL } from "@/lib/seo";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/compounds/$id")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["compound", params.id], queryFn: () => fetchCompound(params.id) }),
  head: ({ params, loaderData }) => {
    const path = `/compounds/${params.id}`;
    if (!loaderData || !loaderData.compound.is_active || loaderData.compound.review_status !== "approved") return unavailableHead(path, "الكمبوند غير متاح");
    const { compound: c, developer } = loaderData;
    const where = compoundWhere(c);
    const dev = developerLabel(c, developer);
    return pageHead({
      path,
      title: `${c.name}${where ? ` في ${where}` : ""} – الوحدات والأسعار | ${SITE_NAME}`,
      description: `${c.name}${dev ? ` من ${dev}` : ""}${where ? ` في ${where}` : ""}. ${c.delivery_date ? `الاستلام ${c.delivery_date}. ` : ""}${c.description ?? ""}`,
      image: compoundCover(c),
      jsonLd: [
        {
          "@context": "https://schema.org", "@type": "Residence", name: c.name, url: `${SITE_URL}${path}`,
          description: c.description || undefined,
          address: { "@type": "PostalAddress", addressLocality: where || undefined, addressCountry: "EG" },
        },
        breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "الكمبوندات", path: "/compounds" }, { name: c.name, path }]),
      ],
    });
  },
  component: CompoundPage,
});

function CompoundPage() {
  useLang();
  const { id } = Route.useParams();
  const initial = Route.useLoaderData();
  const q = useQuery({ queryKey: ["compound", id], queryFn: () => fetchCompound(id), initialData: initial });
  const [status, setStatus] = useState("available");
  const [type, setType] = useState("");
  const [building, setBuilding] = useState("");
  const [picked, setPicked] = useState<CompoundUnitRow | null>(null);
  const all = useMemo(() => q.data?.units ?? [], [q.data]);
  const types = useMemo(() => [...new Set(all.map((u) => u.unit_type))], [all]);
  const buildings = useMemo(() => [...new Set(all.map((u) => u.building).filter((b): b is string => !!b))], [all]);
  const units = useMemo(() => all.filter((u) => (!status || u.status === status) && (!type || u.unit_type === type) && (!building || u.building === building)), [all, status, type, building]);

  if (!q.data || !q.data.compound.is_active || q.data.compound.review_status !== "approved")
    return <PageShell><div className="mx-auto max-w-md p-10 text-center"><h1 className="text-xl font-bold text-primary">{t("الكمبوند غير متاح")}</h1><Link to="/compounds" className={`${btnOutline} mt-6`}>{t("كل الكمبوندات")}</Link></div></PageShell>;
  const { compound: c, developer, resale } = q.data;
  const images = c.images.length ? c.images : [compoundCover(c)];
  const prices = all.filter((u) => u.status === "available" && u.price != null).map((u) => Number(u.price));
  const cheapest = prices.length ? Math.min(...prices) : null;
  const count = (s: string) => all.filter((u) => u.status === s).length;
  const dev = developerLabel(c, developer);

  return (
    <PageShell>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-6 md:px-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <Gallery images={images} title={c.name} />
          <div className="mt-5 flex items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold text-primary md:text-3xl">{c.name}</h1>
            <ShareButton title={c.name} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-primary">
            {compoundWhere(c) && <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><MapPin className="size-4 text-teal" />{t(compoundWhere(c))}</span>}
            {(c.delivery_date || isReady(c)) && <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><CalendarClock className="size-4 text-teal" />{isReady(c) ? t("استلام فوري") : `${t("الاستلام:")} ${c.delivery_date}`}</span>}
            {c.down_payment_pct != null && <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><Wallet className="size-4 text-teal" />{Number(c.down_payment_pct) === 0 ? t("بدون مقدم") : `${t("مقدم")} ${Number(c.down_payment_pct)}%`}{c.installment_years ? ` · ${c.installment_years} ${t("سنين تقسيط")}` : ""}</span>}
          </div>
          {c.location && <p className="mt-2 text-sm text-muted-foreground">{c.location}</p>}
          {all.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {(["available", "reserved", "sold"] as const).map((s) => (
                <div key={s} className="rounded-xl border bg-card p-3"><p className="text-xl font-extrabold text-primary">{formatPrice(count(s))}</p><p className="text-xs font-bold text-muted-foreground">{t(UNIT_STATUS[s]!.label)}</p></div>
              ))}
            </div>
          )}
          {c.description && <p className="mt-5 leading-relaxed whitespace-pre-line text-foreground/80">{c.description}</p>}
          {c.payment_plans && (
            <div className="mt-6 rounded-2xl border bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-primary"><Wallet className="size-5 text-teal" />{t("أنظمة التقسيط")}</h2>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-foreground/80">{c.payment_plans}</p>
            </div>
          )}
          <InstallmentCalc price={picked?.price != null ? Number(picked.price) : cheapest} />
          {c.amenities.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-extrabold text-primary">{t("الخدمات")}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.amenities.map((a) => <span key={a} className="flex items-center gap-1 rounded-full bg-teal-soft px-3 py-1 text-xs font-bold text-primary"><CheckCircle2 className="size-3.5" />{t(a)}</span>)}
              </div>
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-lg font-extrabold text-primary">{t("الوحدات")}</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <select aria-label={t("حالة الوحدة")} className={`${inputCls} h-10`} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t("كل الوحدات")}</option>
                {Object.entries(UNIT_STATUS).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
              </select>
              <select aria-label={t("نوع الوحدة")} className={`${inputCls} h-10`} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">{t("كل الأنواع")}</option>{types.map((x) => <option key={x} value={x}>{t(x)}</option>)}
              </select>
              {buildings.length > 1 && (
                <select aria-label={t("العمارة")} className={`${inputCls} h-10`} value={building} onChange={(e) => setBuilding(e.target.value)}>
                  <option value="">{t("كل العمارات")}</option>{buildings.map((x) => <option key={x} value={x}>{t("عمارة")} {x}</option>)}
                </select>
              )}
            </div>
            {units.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{t("مفيش وحدات بالمواصفات دي دلوقتي.")}</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-secondary text-primary">
                    <tr>{["النوع", "العمارة / الدور", "المساحة", "الغرف", "السعر", "الحالة", ""].map((h, i) => <th key={i} className="p-3 text-start font-bold">{h && t(h)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {units.map((u) => (
                      <tr key={u.id} className="border-t">
                        <td className="p-3 font-bold text-primary">{t(u.unit_type)}{u.code && <span className="ms-1 text-xs text-muted-foreground" dir="ltr">({u.code})</span>}</td>
                        <td className="p-3">{[u.building, u.floor].filter(Boolean).join(" / ") || "—"}</td>
                        <td className="p-3">{formatPrice(Number(u.size))} {t("م²")}</td>
                        <td className="p-3">{u.rooms ?? "—"}</td>
                        <td className="p-3 font-bold text-primary">{u.price != null ? `${formatPrice(Number(u.price))} ${t("ج.م")}` : t("اسأل عن السعر")}</td>
                        <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${UNIT_STATUS[u.status]?.cls}`}>{t(UNIT_STATUS[u.status]?.label ?? u.status)}</span></td>
                        <td className="p-3">{u.status === "available" && <button type="button" onClick={() => setPicked(u)} className="text-xs font-bold text-teal hover:underline">{t("استفسر واحسب القسط")}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {resale.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-extrabold text-primary">{t("عروض إعادة البيع والإيجار في الكمبوند")}</h2>
              <p className="text-xs text-muted-foreground">{t("وحدات معروضة من الوسطاء والملاك المسجلين على فاليو عقار.")}</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">{resale.map((p) => <PropertyCard key={p.id} p={toProperty(p)} />)}</div>
            </div>
          )}
          {c.lat != null && c.lng != null && <PlaceMap lat={c.lat} lng={c.lng} label={t("موقع الكمبوند على الخريطة")} />}
        </div>
        <aside className="h-fit space-y-4 lg:sticky lg:top-20">
          {dev && (
            <div className="flex items-center gap-3 rounded-2xl border bg-card p-5">
              {developer ? <Avatar name={developer.name} url={developer.photo_url} size="size-12" /> : <span className="grid size-12 place-items-center rounded-full bg-secondary"><Building2 className="size-6 text-teal" /></span>}
              <div className="min-w-0">
                {developer ? <Link to="/brokers/$slug" params={{ slug: developer.slug }} className="block truncate font-bold text-primary hover:text-teal">{dev}</Link> : <p className="truncate font-bold text-primary">{dev}</p>}
                <span className="text-xs font-bold text-muted-foreground">{t("المطور")}</span>
              </div>
            </div>
          )}
          <CompoundInquiry compound={c.name} compoundId={c.id} unit={picked} onClearUnit={() => setPicked(null)} />
        </aside>
      </div>
    </PageShell>
  );
}

/** Inquiries go to Value Aqar as a lead linked to the compound (and unit) — the developer's contacts are not shown. */
function CompoundInquiry({ compound, compoundId, unit, onClearUnit }: { compound: string; compoundId: string; unit: CompoundUnitRow | null; onClearUnit: () => void }) {
  useLang();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || !cleanPhone(phone)) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const about = `كمبوند: ${compound}${unit ? ` — وحدة: ${unit.unit_type}${unit.code ? ` (${unit.code})` : ""}، ${unit.size} م²` : ""}`;
    const { error } = await supabase.from("leads").insert({
      name: name.trim(), phone: cleanPhone(phone)!, kind: "request", original_source: "website",
      compound_id: compoundId, compound_unit_id: unit?.id ?? null,
      property_type: unit?.unit_type ?? null, budget: unit?.price ?? null,
      details: [about, details.trim()].filter(Boolean).join("\n").slice(0, 1000), utm: getAttribution(),
    });
    setBusy(false);
    if (error) { toast.error(t("ماتبعتش، جرّب تاني")); return; }
    setDone(true);
  }
  if (done) return <div className="rounded-2xl bg-teal-soft p-5 text-center font-bold text-primary">{t("استفسارك وصل، وفريق فاليو عقار هيكلمك ✓")}</div>;
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-2xl border bg-card p-5">
      <h2 className="font-bold text-primary">{t("استفسر عن الكمبوند")}</h2>
      {unit && (
        <p className="flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-xs font-bold text-primary">
          <span>{t(unit.unit_type)} · {formatPrice(Number(unit.size))} {t("م²")}{unit.code ? ` · ${unit.code}` : ""}</span>
          <button type="button" onClick={onClearUnit} className="text-muted-foreground hover:text-destructive" aria-label={t("إلغاء اختيار الوحدة")}>✕</button>
        </p>
      )}
      <input className={inputCls} placeholder={t("الاسم")} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} required />
      <textarea className={`${inputCls} h-20 py-2`} placeholder={t("رسالتك (اختياري)")} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={600} />
      <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? t("بيتبعت...") : t("إرسال الاستفسار")}</button>
    </form>
  );
}
