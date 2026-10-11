import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, MapPin, FileText, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useAuth";
import { PageShell, Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { Gallery, PlaceMap } from "@/components/site/Gallery";
import { formatPrice } from "@/components/site/data";
import { DEAL_KINDS, OPP_KINDS, fetchOpportunity, investmentRange, oppNo } from "@/lib/investments";
import { pageHead, unavailableHead, breadcrumbs } from "@/lib/seo";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/investments/$id")({
  loader: ({ params, context }) => context.queryClient.ensureQueryData({ queryKey: ["opportunity", params.id], queryFn: () => fetchOpportunity(params.id) }),
  head: ({ params, loaderData: o }) => {
    const path = `/investments/${params.id}`;
    if (!o || o.review_status !== "approved") return unavailableHead(path, "الفرصة غير متاحة");
    return pageHead({
      path, title: `${o.title} — فرصة استثمارية | فاليو عقار`, description: o.teaser, image: o.images[0] ?? null,
      jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "فرص استثمارية", path: "/investments" }, { name: o.title, path }])],
    });
  },
  component: OpportunityPage,
});

function OpportunityPage() {
  useLang();
  const { id } = Route.useParams();
  const initial = Route.useLoaderData();
  const q = useQuery({ queryKey: ["opportunity", id], queryFn: () => fetchOpportunity(id), initialData: initial });
  const { user } = useSessionUser();
  const access = useQuery({
    queryKey: ["opportunity-access", id, user?.id], enabled: !!user,
    queryFn: async () => {
      const [priv, pin, req] = await Promise.all([
        supabase.rpc("opportunity_private", { _id: id }),
        supabase.rpc("opportunity_location", { _id: id }),
        supabase.from("investment_requests").select("status").eq("opportunity_id", id).maybeSingle(),
      ]);
      const details = priv.data?.[0] ?? null;
      const docs = details ? ((await supabase.storage.from("investment-docs").list(id)).data ?? []) : [];
      return { details, request: req.data, docs, pin: pin.data?.[0] ?? null };
    },
  });
  const o = q.data;
  if (!o) return <PageShell><div className="mx-auto max-w-md p-10 text-center"><h1 className="text-xl font-bold text-primary">{t("الفرصة غير متاحة")}</h1><Link to="/investments" className={`${btnOutline} mt-6`}>{t("كل الفرص")}</Link></div></PageShell>;

  const facts: [string, string][] = [
    ["نوع الفرصة", t(OPP_KINDS[o.kind] ?? o.kind)], ["النشاط", t(o.activity)], ["نوع الصفقة", t(DEAL_KINDS[o.deal_kind] ?? o.deal_kind)],
    ["حجم الاستثمار", t(investmentRange(o))],
    ...(o.land_area ? [["مساحة الأرض", `${formatPrice(Number(o.land_area))} ${t("م²")}`] as [string, string]] : []),
    ...(o.built_area ? [["المساحة المبنية", `${formatPrice(Number(o.built_area))} ${t("م²")}`] as [string, string]] : []),
    ...(o.offered_share ? [["المعروض", `${formatPrice(Number(o.offered_share))}%`] as [string, string]] : []),
    ...(o.expected_return ? [["عائد سنوي تقريبي", `${formatPrice(Number(o.expected_return))}%`] as [string, string]] : []),
  ];
  const a = access.data;
  async function openDoc(name: string) {
    const { data, error } = await supabase.storage.from("investment-docs").createSignedUrl(`${id}/${name}`, 300);
    if (error || !data) { toast.error(t("تعذّر فتح المستند")); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <PageShell>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-6 md:px-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          {o.images.length > 0 && <Gallery images={o.images} title={o.title} />}
          <p className="mt-5 text-sm font-bold text-teal" dir="ltr">{oppNo(o.opp_no)}</p>
          <h1 className="text-2xl font-extrabold text-primary md:text-3xl">{o.title}</h1>
          <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4 text-teal" />{o.area === o.city ? t(o.city) : `${t(o.area)}، ${t(o.city)}`}</p>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            {facts.map(([k, v]) => <div key={k} className="rounded-xl bg-secondary p-3"><dt className="text-xs font-bold text-muted-foreground">{t(k)}</dt><dd className="mt-0.5 font-extrabold text-primary">{v}</dd></div>)}
          </dl>
          <p className="mt-5 leading-relaxed whitespace-pre-line text-foreground/80">{o.teaser}</p>

          {a?.details ? (
            <section className="mt-6 space-y-3 rounded-2xl border-2 border-teal/40 bg-card p-5">
              <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-primary"><CheckCircle2 className="size-5 text-teal" />{t("التفاصيل الكاملة")}</h2>
              {a.details.location_note && <p className="text-sm"><b>{t("الموقع:")}</b> {a.details.location_note}</p>}
              {a.details.licenses && <p className="text-sm"><b>{t("التراخيص والموافقات:")}</b> {a.details.licenses}</p>}
              {a.details.details && <p className="whitespace-pre-line text-sm text-foreground/80">{a.details.details}</p>}
              {a.pin && <PlaceMap lat={a.pin.lat} lng={a.pin.lng} label={t("موقع الفرصة على الخريطة")} />}
              {a.docs.length > 0 && (
                <ul className="space-y-1 border-t pt-3 text-sm">
                  {a.docs.map((d) => <li key={d.name}><button onClick={() => openDoc(d.name)} className="inline-flex items-center gap-1.5 font-bold text-primary underline"><FileText className="size-4 text-teal" />{d.name.replace(/^\d+-/, "")}</button></li>)}
                </ul>
              )}
            </section>
          ) : (
            <p className="mt-6 flex items-center gap-2 rounded-2xl bg-secondary p-4 text-sm font-semibold text-primary"><Lock className="size-4 text-teal" />{t("الموقع بالتحديد والمستندات والتفاصيل المالية بتتبعت بعد ما فريق فاليو عقار يراجع طلبك.")}</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{t("* الأرقام والعوائد تقديرية ومش ضمان. اعمل الفحص القانوني والفني قبل أي تعاقد.")}</p>
        </div>
        <aside className="h-fit lg:sticky lg:top-20">
          {!user ? (
            <div className="rounded-2xl border bg-card p-5 text-center">
              <p className="font-bold text-primary">{t("مهتم بالفرصة دي؟")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("سجّل دخولك برقم موبايلك عشان تطلب التفاصيل الكاملة.")}</p>
              <Link to="/auth" className={`${btnPrimary} mt-4 w-full`}>{t("تسجيل الدخول")}</Link>
            </div>
          ) : a?.details ? null : a?.request ? (
            <div className="rounded-2xl border bg-card p-5 text-center">
              {a.request.status === "rejected"
                ? <p className="font-bold text-destructive">{t("طلبك للفرصة دي ما اتقبلش.")}</p>
                : <p className="flex items-center justify-center gap-1.5 font-bold text-primary"><Clock className="size-4 text-teal" />{t("طلبك وصل، وفريق فاليو عقار هيتواصل معاك.")}</p>}
            </div>
          ) : <RequestForm opportunityId={id} onDone={() => access.refetch()} />}
          <Link to="/investments" className="mt-3 block text-center text-sm font-bold text-primary hover:text-teal">{t("كل الفرص الاستثمارية")}</Link>
        </aside>
      </div>
    </PageShell>
  );
}

function RequestForm({ opportunityId, onDone }: { opportunityId: string; onDone: () => void }) {
  useLang();
  const [f, setF] = useState({ name: "", budget: "", message: "" });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2) { toast.error(t("اكتب اسمك")); return; }
    setBusy(true);
    const { error } = await supabase.from("investment_requests").insert({ opportunity_id: opportunityId, name: f.name.trim(), budget: f.budget ? Number(f.budget) : null, message: f.message.trim() || null });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? t("طلبت التفاصيل قبل كده") : t("تعذّر الإرسال")); return; }
    toast.success(t("طلبك وصل ✓"));
    onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 className="font-bold text-primary">{t("اطلب التفاصيل الكاملة")}</h2>
      <Field label={t("الاسم أو اسم الشركة")}><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} required /></Field>
      <Field label={t("الميزانية المتاحة (ج.م) — اختياري")}><input className={inputCls} inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/\D/g, "") })} /></Field>
      <Field label={t("رسالتك — اختياري")}><textarea className={`${inputCls} h-20 py-2`} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={1000} /></Field>
      <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : t("إرسال الطلب")}</button>
      <p className="text-xs text-muted-foreground">{t("رقم موبايلك بيتسجل مع الطلب، وفريق فاليو عقار بس هو اللي بيشوفه.")}</p>
    </form>
  );
}
