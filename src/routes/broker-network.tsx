import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Handshake, Percent, ShieldCheck, Store, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { useMe } from "@/hooks/useAuth";
import { pageHead, breadcrumbs } from "@/lib/seo";
import { PageShell, inputCls, btnPrimary, btnOutline, btnTeal } from "@/components/site/ui";
import { ALL_AREAS, formatPrice, useLocations } from "@/components/site/data";
import { thumb } from "@/lib/images";

export const Route = createFileRoute("/broker-network")({
  head: () => pageHead({
    path: "/broker-network",
    title: "سوق الوسطاء: بيع واشتري من وحدات الوسطاء والمطورين التانيين | فاليو عقار",
    description: "عندك مشتري ومعندكش الوحدة؟ شوف الوحدات اللي الوسطاء والمطورين فاتحينها للقسمة في برج العرب، وابعت مشتريك بضغطة، وعمولتك محفوظة بضمان فاليو عقار.",
    jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "سوق الوسطاء", path: "/broker-network" }])],
  }),
  component: BrokerNetwork,
});

const POINTS = [
  { icon: Store, title: "وحدات أكتر لعملائك", text: "وحدات الوسطاء والشركات والمطورين اللي فاتحينها للقسمة، وبيانات أصحابها محمية." },
  { icon: Percent, title: "النسبة واضحة من الأول", text: "كل بايع بيحدد نسبة الوسيط اللي يجيب المشتري، وبتبان على الوحدة قبل ما تبعت." },
  { icon: Handshake, title: "مشتريك محفوظ باسمك 90 يوم", text: "أول ما البايع يقبل، العميل بيتسجل باسمك. أي وحدة يشتريها من نفس البايع في المدة دي ليك نصيب منها." },
  { icon: ShieldCheck, title: "النصيب بيتحسب لوحده", text: "بعد ما الإدارة تأكد البيع: (إجمالي العمولة − نسبة فاليو عقار) × نسبة القسمة. وكل خطوة متسجلة." },
] as const;

const KIND: Record<string, string> = { property: "عقار", compound: "كمبوند", project: "مشروع" };

/** Broker-to-broker market: units opened for referrals (brokers only), and how it works for everyone else. */
function BrokerNetwork() {
  useLang();
  const { me, loading } = useMe();
  const isBroker = !!me?.broker?.is_active;
  return (
    <PageShell>
      <section className="bg-primary">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
          <h1 className="text-2xl font-extrabold text-primary-foreground md:text-4xl">{t("سوق الوسطاء")}</h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/80 md:text-base">{t("عندك مشتري ومعندكش الوحدة؟ شوف الوحدات اللي الوسطاء والمطورين فاتحينها للقسمة، ودوس «عندي مشتري». البايع بيرد خلال 24 ساعة، وعمولتك محفوظة بضمان فاليو عقار.")}</p>
          {!loading && !isBroker && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/auth" className={btnTeal}>{t("سجّل دخول كوسيط")}</Link>
              <Link to="/join" className="inline-flex h-11 items-center rounded-xl border border-primary-foreground/30 px-4 text-sm font-bold text-primary-foreground hover:bg-primary-foreground/10">{t("انضم كوسيط أو شركة")}</Link>
            </div>
          )}
        </div>
      </section>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
        {isBroker && <Market />}
        <ul className="grid gap-3 sm:grid-cols-2">
          {POINTS.map((p) => (
            <li key={p.title} className="flex items-start gap-3 rounded-2xl border bg-card p-4">
              <p.icon className="mt-0.5 size-5 shrink-0 text-teal" />
              <div><p className="font-bold text-primary">{t(p.title)}</p><p className="mt-0.5 text-sm text-muted-foreground">{t(p.text)}</p></div>
            </li>
          ))}
        </ul>
        {isBroker && <p className="text-sm text-muted-foreground">{t("عايز وحداتك تظهر هنا؟ حط «قسمة الوسطاء» على العقار من «عقاراتي»، أو على الكمبوند والمشروع من لوحتك.")}</p>}
      </div>
    </PageShell>
  );
}

function Market() {
  useLocations();
  const [kind, setKind] = useState("");
  const [area, setArea] = useState("");
  const q = useQuery({ queryKey: ["co-broke-market"], queryFn: async () => (await supabase.rpc("co_broke_market")).data ?? [] });
  const list = (q.data ?? []).filter((x) => (!kind || x.target_kind === kind) && (!area || x.area === area));
  const href = (x: { target_kind: string; id: string }) => (x.target_kind === "compound" ? `/compounds/${x.id}` : x.target_kind === "project" ? `/projects/${x.id}` : `/properties/${x.id}`);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-extrabold text-primary">{t("الوحدات المفتوحة للوسطاء")}</h2>
        <select aria-label={t("النوع")} className={`${inputCls} h-10 w-auto`} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t("الكل")}</option><option value="property">{t("عقارات")}</option><option value="compound">{t("كمبوندات")}</option><option value="project">{t("مشروعات")}</option>
        </select>
        <select aria-label={t("المنطقة")} className={`${inputCls} h-10 w-auto`} value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">{t("كل المناطق")}</option>{ALL_AREAS.map((a) => <option key={a} value={a}>{t(a)}</option>)}
        </select>
        <Link to="/dashboard" className={`${btnOutline} ms-auto`}>{t("إحالاتي")}</Link>
      </div>
      {q.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />)}</div>
        : list.length === 0 ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{t("لسه مفيش وحدات مفتوحة للوسطاء في الاختيار ده.")}</p>
        : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((x) => (
              <a key={`${x.target_kind}-${x.id}`} href={href(x)} className="flex flex-col overflow-hidden rounded-2xl border bg-card transition hover:border-teal hover:shadow-card">
                <img src={thumb(x.image_url) || "/demo/p1.jpg"} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">{t(KIND[x.target_kind] ?? "")}</span>
                    <span className="rounded-full bg-teal px-2.5 py-0.5 text-xs font-extrabold text-accent-foreground">{t("نصيبك {n}%", { n: x.share_pct })}</span>
                  </div>
                  <p className="truncate font-bold text-primary">{x.title}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">{x.area && <><MapPin className="size-3.5" />{t(x.area)} · </>}{x.seller_name}</p>
                  {x.price != null && Number(x.price) > 0 && <p className="text-sm font-bold text-teal">{formatPrice(Number(x.price))} ج.م</p>}
                  <span className={`${btnPrimary} mt-auto`}>{t("عندي مشتري")}</span>
                </div>
              </a>
            ))}
          </div>
        )}
    </section>
  );
}
