import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Gift, Camera, Pin, Megaphone, BarChart3 } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { pageHead, breadcrumbs } from "@/lib/seo";
import { useSessionUser } from "@/hooks/useAuth";
import { useIsNativeApp } from "@/lib/native";
import { PageShell, btnOutline, btnPrimary } from "@/components/site/ui";
import { PLAN_AUDIENCES } from "@/components/site/data";
import { PlanCards, TermPicker, usePlanSettings, usePlans } from "@/components/dash/ListingPlan";

export const Route = createFileRoute("/plans")({
  head: () => pageHead({
    path: "/plans",
    title: "باقات الإعلان على فاليو عقار — أول شهر مجانًا | فاليو عقار",
    description: "باقات للمالك والمسوّق وشركات البروكر والتسويق والمطورين في برج العرب والساحل الشمالي: تثبيت على الواجهة، علامة متحقق، رسايل واتساب، بوستات وفيديوهات، وإحصائيات. أول شهر مجانًا، وخصم لحد 30% على المدد الأطول.",
    jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "الباقات", path: "/plans" }])],
  }),
  component: PlansPage,
});

type Audience = (typeof PLAN_AUDIENCES)[number]["id"];

/** Public price list: 3 plans per kind of account, a term chooser with the discounts, and the paid extras. */
function PlansPage() {
  useLang();
  const native = useIsNativeApp();
  const { user } = useSessionUser();
  const [who, setWho] = useState<Audience>("owner");
  const [months, setMonths] = useState(1);
  const plans = usePlans(who);
  const settings = usePlanSettings();
  const discounts = settings.data?.discounts ?? { 1: 0, 3: 10, 6: 20, 12: 30 };
  const trial = settings.data?.trialDays ?? 30;
  const start = who.startsWith("owner") ? (user ? "/my-listings" : "/sell") : user ? "/dashboard" : "/auth";

  return (
    <PageShell>
      <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <div className="text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-3 py-1 text-sm font-bold text-primary"><Gift className="size-4" />أول {trial === 30 ? "شهر" : `${trial} يوم`} مجانًا للكل</p>
          <h1 className="mt-3 text-3xl font-extrabold text-primary md:text-4xl">باقات الإعلان على فاليو عقار</h1>
          <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">اختار نوع حسابك ومدة الاشتراك. كل ما المدة تطول، الخصم بيزيد. بعد الشهر المجاني بتختار باقتك، ولو ماختارتش إعلاناتك بتستخبى بس (مش بتتمسح) لحد ما تشترك.</p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2" role="tablist" aria-label="نوع الحساب">
          {PLAN_AUDIENCES.map((a) => (
            <button key={a.id} role="tab" aria-selected={who === a.id} onClick={() => setWho(a.id)}
              className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition ${who === a.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-primary"}`}>{a.label}</button>
          ))}
        </div>
        <div className="mt-4 flex justify-center"><TermPicker months={months} onChange={setMonths} discounts={discounts} /></div>

        <div className="mt-8">
          {plans.isLoading ? <div className="h-72 animate-pulse rounded-2xl bg-muted" /> : (
            <PlanCards plans={plans.data ?? []} months={months} discounts={discounts}
              action={native ? undefined : (p) => (
                <Link to={start} className={`${p.tier === 2 ? btnPrimary : btnOutline} mt-4 justify-center`}>{p.tier === 2 ? "ابدأ الشهر المجاني" : "ابدأ"}</Link>
              )} />
          )}
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-4">
          {[
            { icon: Pin, title: "تثبيت على الواجهة", text: "إعلانك يظهر أول الصفحة الرئيسية ونتايج منطقته. الأماكن محدودة وبتتبدّل بالعدل بين المشتركين." },
            { icon: Megaphone, title: "عرض للكل", text: "إعلانك في الشريط اللي بيشوفه كل زوار الموقع. يوم واحد لكل عرض، بيتحجز بالدور." },
            { icon: BarChart3, title: "إحصائيات", text: "كام مرة إعلانك ظهر، وكام واحد فتحه، وكام واحد طلب التواصل، وكام طلب وصلك." },
            { icon: Camera, title: "تصوير احترافي", text: "صور 500 ج.م · فيديو 1,000 ج.م · الاتنين 1,300 ج.م — لأي حد، بسعر منفصل." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border bg-card p-4">
              <Icon className="size-6 text-teal" />
              <p className="mt-2 font-bold text-primary">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">الأسعار بالجنيه المصري. الدفع أونلاين قريب؛ لحد كده بعد ما تطلب الباقة من لوحتك، فريق فاليو عقار بيكلّمك ويفعّلها.</p>
      </section>
    </PageShell>
  );
}
