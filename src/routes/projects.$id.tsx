import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MapPin, CalendarClock, Wallet, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Avatar, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { Gallery, PlaceMap } from "@/components/site/Gallery";
import { formatPrice } from "@/components/site/data";
import { UNIT_STATUS, fetchProject, projectCover, type UnitRow } from "@/components/site/projects";
import { pageHead, unavailableHead, breadcrumbs, SITE_NAME, SITE_URL } from "@/lib/seo";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/projects/$id")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["project", params.id], queryFn: () => fetchProject(params.id) }),
  head: ({ params, loaderData }) => {
    const path = `/projects/${params.id}`;
    if (!loaderData || loaderData.project.review_status !== "approved") return unavailableHead(path, "المشروع غير متاح");
    const { project: p, developer } = loaderData;
    const where = p.area === p.city ? p.city : `${p.area}، ${p.city}`;
    return pageHead({
      path,
      title: `${p.name} في ${where} – الوحدات والأسعار | ${SITE_NAME}`,
      description: `${p.name}${developer ? ` من ${developer.name}` : ""} في ${where}. ${p.delivery_date ? `التسليم ${p.delivery_date}. ` : ""}${p.description ?? ""}`,
      image: projectCover(p),
      jsonLd: [
        {
          "@context": "https://schema.org", "@type": "Residence", name: p.name, url: `${SITE_URL}${path}`,
          description: p.description || undefined,
          address: { "@type": "PostalAddress", addressLocality: where, addressCountry: "EG" },
        },
        breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "المشروعات", path: "/projects" }, { name: p.name, path }]),
      ],
    });
  },
  component: ProjectPage,
});

function ProjectPage() {
  useLang();
  const { id } = Route.useParams();
  const initial = Route.useLoaderData();
  const q = useQuery({ queryKey: ["project", id], queryFn: () => fetchProject(id), initialData: initial });
  const [status, setStatus] = useState("available");
  const [picked, setPicked] = useState<UnitRow | null>(null);
  const units = useMemo(() => (q.data?.units ?? []).filter((u) => !status || u.status === status), [q.data, status]);

  if (!q.data) return <PageShell><div className="mx-auto max-w-md p-10 text-center"><h1 className="text-xl font-bold text-primary">{t("المشروع غير متاح")}</h1><Link to="/projects" className={`${btnOutline} mt-6`}>{t("كل المشروعات")}</Link></div></PageShell>;
  const { project: p, developer } = q.data;
  const images = p.images.length ? p.images : [projectCover(p)];

  return (
    <PageShell>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-6 md:px-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <Gallery images={images} title={p.name} />
          <h1 className="mt-5 text-2xl font-extrabold text-primary md:text-3xl">{p.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-primary">
            <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><MapPin className="size-4 text-teal" />{p.area === p.city ? t(p.city) : `${t(p.area)} / ${t(p.city)}`}</span>
            {p.delivery_date && <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><CalendarClock className="size-4 text-teal" />{t("التسليم:")} {p.delivery_date}</span>}
          </div>
          {p.address && <p className="mt-2 text-sm text-muted-foreground">{p.address}</p>}
          {p.description && <p className="mt-5 leading-relaxed whitespace-pre-line text-foreground/80">{p.description}</p>}
          {p.payment_plans && (
            <div className="mt-6 rounded-2xl border bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-primary"><Wallet className="size-5 text-teal" />{t("أنظمة التقسيط")}</h2>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-foreground/80">{p.payment_plans}</p>
            </div>
          )}
          {p.amenities.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-extrabold text-primary">{t("الخدمات")}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.amenities.map((a) => <span key={a} className="flex items-center gap-1 rounded-full bg-teal-soft px-3 py-1 text-xs font-bold text-primary"><CheckCircle2 className="size-3.5" />{t(a)}</span>)}
              </div>
            </div>
          )}

          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-primary">{t("الوحدات")}</h2>
              <select aria-label={t("حالة الوحدة")} className={`${inputCls} h-10 w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t("كل الوحدات")}</option>
                {Object.entries(UNIT_STATUS).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
              </select>
            </div>
            {units.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{t("لا توجد وحدات بهذه الحالة حاليًا.")}</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-secondary text-primary">
                    <tr>{["النوع", "المساحة", "الغرف", "الدور", "السعر", "الحالة", ""].map((h, i) => <th key={i} className="p-3 text-start font-bold">{h && t(h)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {units.map((u) => (
                      <tr key={u.id} className="border-t">
                        <td className="p-3 font-bold text-primary">{t(u.unit_type)}{u.code && <span className="ms-1 text-xs text-muted-foreground" dir="ltr">({u.code})</span>}</td>
                        <td className="p-3">{formatPrice(Number(u.size))} {t("م²")}</td>
                        <td className="p-3">{u.rooms ?? "—"}</td>
                        <td className="p-3">{u.floor ?? "—"}</td>
                        <td className="p-3 font-bold text-primary">{u.price != null ? `${formatPrice(Number(u.price))} ${t("ج.م")}` : t("اسأل عن السعر")}</td>
                        <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${UNIT_STATUS[u.status]?.cls}`}>{t(UNIT_STATUS[u.status]?.label ?? u.status)}</span></td>
                        <td className="p-3">{u.status === "available" && <button type="button" onClick={() => setPicked(u)} className="text-xs font-bold text-teal hover:underline">{t("استفسر")}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {p.lat != null && p.lng != null && <PlaceMap lat={p.lat} lng={p.lng} label={t("موقع المشروع على الخريطة")} />}
        </div>
        <aside className="h-fit space-y-4 lg:sticky lg:top-20">
          {developer && (
            <div className="flex items-center gap-3 rounded-2xl border bg-card p-5">
              <Avatar name={developer.name} url={developer.photo_url} size="size-12" />
              <div className="min-w-0"><p className="truncate font-bold text-primary">{developer.name}</p><span className="text-xs font-bold text-muted-foreground">{t("شركة تطوير")}</span></div>
            </div>
          )}
          <ProjectInquiry project={p.name} unit={picked} onClearUnit={() => setPicked(null)} />
        </aside>
      </div>
    </PageShell>
  );
}

/** Inquiries go to Value Aqar as a lead — the developer's contact details are not shown. */
function ProjectInquiry({ project, unit, onClearUnit }: { project: string; unit: UnitRow | null; onClearUnit: () => void }) {
  useLang();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || !/^[0-9+\s]{8,20}$/.test(phone.trim())) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const about = `مشروع: ${project}${unit ? ` — وحدة: ${unit.unit_type}${unit.code ? ` (${unit.code})` : ""}، ${unit.size} م²` : ""}`;
    const { error } = await supabase.from("leads").insert({
      name: name.trim(), phone: phone.trim(), kind: "request",
      property_type: unit?.unit_type ?? null, budget: unit?.price ?? null,
      details: [about, details.trim()].filter(Boolean).join("\n").slice(0, 1000),
    });
    setBusy(false);
    if (error) { toast.error(t("تعذّر الإرسال")); return; }
    setDone(true);
  }
  if (done) return <div className="rounded-2xl bg-teal-soft p-5 text-center font-bold text-primary">{t("تم إرسال استفسارك، وفريق فاليو عقار هيتواصل معاك ✓")}</div>;
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-2xl border bg-card p-5">
      <h2 className="font-bold text-primary">{t("استفسر عن المشروع")}</h2>
      {unit && (
        <p className="flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-xs font-bold text-primary">
          <span>{t(unit.unit_type)} · {formatPrice(Number(unit.size))} {t("م²")}{unit.code ? ` · ${unit.code}` : ""}</span>
          <button type="button" onClick={onClearUnit} className="text-muted-foreground hover:text-destructive" aria-label={t("إلغاء اختيار الوحدة")}>✕</button>
        </p>
      )}
      <input className={inputCls} placeholder={t("الاسم")} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} required />
      <textarea className={`${inputCls} h-20 py-2`} placeholder={t("رسالتك (اختياري)")} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={600} />
      <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? t("جارٍ الإرسال...") : t("إرسال الاستفسار")}</button>
    </form>
  );
}
