import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Megaphone, MessageCircle, Pin, Video, FileImage } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { Field, inputCls, btnOutline, btnPrimary } from "@/components/site/ui";
import { formatDate, formatPrice } from "@/components/site/data";
import type { PlanRow } from "@/components/dash/ListingPlan";

type Usage = { pins: number; spotlights: number; posts: number; videos: number; whatsapp: number; booked: { day: string; title: string }[] };
const TASK_LABEL: Record<string, string> = {
  post: "بوست على صفحاتنا", video: "فيديو على صفحاتنا", whatsapp: "رسايل واتساب للعملاء", photos: "تصوير صور", video_shoot: "تصوير فيديو",
  photos_video: "تصوير صور + فيديو", extra_pin: "تثبيت إضافي (7 أيام)", extra_whatsapp: "حملة واتساب إضافية",
};
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  new: { label: "مستني الفريق", cls: "bg-secondary text-primary" }, scheduled: { label: "اتحدد ميعاده", cls: "bg-[#f2b84b]/25 text-primary" },
  done: { label: "اتعمل ✓", cls: "bg-teal-soft text-primary" }, cancelled: { label: "اتلغى", cls: "bg-destructive/10 text-destructive" },
};
const cairoDay = (offset = 0) => { const d = new Date(Date.now() + offset * 864e5); return new Date(d.toLocaleString("en-US", { timeZone: "Africa/Cairo" })).toISOString().slice(0, 10); };

/** «مميزات باقتي»: use the plan's perks on a listing (pin, «عرض للكل», posts / videos / WhatsApp) and order paid extras. */
export function PlanPerks({ plan, owner }: { plan: PlanRow; owner: boolean }) {
  const { me } = useMe();
  const brokerId = owner ? null : me?.broker?.id ?? null;
  const listings = useQuery({
    queryKey: ["perk-listings", brokerId, owner],
    queryFn: async () => {
      if (owner) { const { data } = await supabase.rpc("my_owner_listings"); return (data ?? []).filter((p) => p.review_status === "approved").map((p) => ({ id: p.id, title: p.title })); }
      if (!brokerId) return [];
      return (await supabase.from("properties").select("id, title").eq("broker_id", brokerId).eq("review_status", "approved").eq("hidden_by_plan", false).order("updated_at", { ascending: false }).limit(200)).data ?? [];
    },
  });
  const usage = useQuery({ queryKey: ["plan-usage"], queryFn: async () => { const { data } = await supabase.rpc("my_plan_usage"); return data as unknown as Usage | null; } });
  const tasks = useQuery({ queryKey: ["my-plan-tasks"], queryFn: async () => (await supabase.from("plan_tasks").select("*").order("created_at", { ascending: false }).limit(30)).data ?? [] });
  const prices = useQuery({
    queryKey: ["addon-prices"], staleTime: 10 * 60_000,
    queryFn: async () => (await supabase.from("app_settings").select("plan_addon_photos, plan_addon_video, plan_addon_photos_video, plan_addon_pin, plan_addon_whatsapp").eq("id", 1).maybeSingle()).data,
  });
  const taken = useQuery({
    queryKey: ["spotlight-taken"], enabled: plan.spotlights_per_month! > 0,
    queryFn: async () => ((await supabase.rpc("spotlight_taken_days", { _from: cairoDay(), _to: cairoDay(45) })).data ?? []) as string[],
  });
  const [pid, setPid] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const u = usage.data;
  const reload = () => { usage.refetch(); tasks.refetch(); taken.refetch(); listings.refetch(); };
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    if (!pid) { toast.error("اختار الإعلان الأول"); return; }
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success(ok); reload(); }
  };
  const ask = (kind: string, ok = "طلبك وصل لفريق فاليو عقار") => run(() => supabase.rpc("request_plan_task", { _kind: kind, _property: pid }), ok);
  const free = Array.from({ length: 31 }, (_, i) => cairoDay(i)).filter((d) => !(taken.data ?? []).includes(d));
  const chips = [
    plan.featured_slots > 0 && plan.pin_days ? { icon: Pin, label: "تثبيت على الواجهة", used: u?.pins ?? 0, max: plan.featured_slots } : null,
    plan.spotlights_per_month ? { icon: Megaphone, label: "«عرض للكل»", used: u?.spotlights ?? 0, max: plan.spotlights_per_month } : null,
    plan.posts_per_month ? { icon: FileImage, label: "بوستات", used: u?.posts ?? 0, max: plan.posts_per_month } : null,
    plan.videos_per_month ? { icon: Video, label: "فيديوهات", used: u?.videos ?? 0, max: plan.videos_per_month } : null,
    plan.whatsapp_broadcast ? { icon: MessageCircle, label: "رسايل واتساب", used: u?.whatsapp ?? 0, max: 4 } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  const p = prices.data;
  const addons = [
    ["photos", "تصوير صور", p?.plan_addon_photos ?? 500, Camera], ["video_shoot", "تصوير فيديو", p?.plan_addon_video ?? 1000, Video],
    ["photos_video", "صور + فيديو", p?.plan_addon_photos_video ?? 1300, Camera], ["extra_pin", "تثبيت إضافي 7 أيام", p?.plan_addon_pin ?? 150, Pin],
    ["extra_whatsapp", "حملة واتساب إضافية", p?.plan_addon_whatsapp ?? 200, MessageCircle],
  ] as const;

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <p className="font-extrabold text-primary">مميزات باقتي — الشهر ده</p>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map(({ icon: Icon, label, used, max }) => (
            <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${used >= max ? "bg-secondary text-muted-foreground" : "bg-teal-soft text-primary"}`}>
              <Icon className="size-3.5" />{label}: {formatPrice(used)} من {formatPrice(max)}
            </span>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">باقتك مافيهاش تثبيت ولا ترويج. تقدر تطلب الخدمات الإضافية تحت، أو باقة أعلى.</p>}

      <Field label="الإعلان">
        <select className={inputCls} value={pid} onChange={(e) => setPid(e.target.value)}>
          <option value="">اختار إعلان من إعلاناتك المنشورة</option>
          {(listings.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
      </Field>

      <div className="flex flex-wrap gap-2">
        {plan.featured_slots > 0 && !!plan.pin_days && (
          <button className={btnPrimary} disabled={busy} onClick={() => run(() => supabase.rpc("pin_listing", { _property: pid }), `اتثبّت على الواجهة ${plan.pin_days} يوم`)}><Pin className="size-4" />ثبّت على الواجهة</button>
        )}
        {!!plan.posts_per_month && <button className={btnOutline} disabled={busy} onClick={() => ask("post")}><FileImage className="size-4" />اطلب بوست</button>}
        {!!plan.videos_per_month && <button className={btnOutline} disabled={busy} onClick={() => ask("video")}><Video className="size-4" />اطلب فيديو</button>}
        {plan.whatsapp_broadcast && <button className={btnOutline} disabled={busy} onClick={() => ask("whatsapp", "هنبعته للعملاء المهتمين بالمنطقة والنوع ده")}><MessageCircle className="size-4" />ابعته للعملاء على واتساب</button>}
      </div>

      {!!plan.spotlights_per_month && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-secondary/50 p-3">
          <Field label="«عرض للكل» — اختار اليوم (يوم واحد لكل عرض)">
            <select className={`${inputCls} w-auto`} value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">اختار يوم فاضي</option>
              {free.map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}
            </select>
          </Field>
          <button className={btnPrimary} disabled={busy || !day} onClick={() => run(() => supabase.rpc("book_spotlight", { _property: pid, _day: day }), "اتحجز «عرض للكل» في اليوم ده").then(() => setDay(""))}><Megaphone className="size-4" />احجز</button>
          {(u?.booked.length ?? 0) > 0 && <p className="w-full text-xs text-muted-foreground">محجوز ليك: {u!.booked.map((b) => `${formatDate(b.day)} (${b.title})`).join(" · ")}</p>}
        </div>
      )}

      <div>
        <p className="text-sm font-bold text-primary">خدمات إضافية بسعر منفصل</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {addons.map(([kind, label, price, Icon]) => (
            <button key={kind} className={btnOutline} disabled={busy} onClick={() => ask(kind, "طلبك وصل، وفريق فاليو عقار هيكلّمك عشان الدفع والميعاد")}>
              <Icon className="size-4" />{label} · {formatPrice(Number(price))} ج.م
            </button>
          ))}
        </div>
      </div>

      {(tasks.data?.length ?? 0) > 0 && (
        <div>
          <p className="text-sm font-bold text-primary">طلباتك</p>
          <ul className="mt-1 divide-y text-sm">
            {tasks.data!.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>#{t.task_no} · {TASK_LABEL[t.kind] ?? t.kind}{Number(t.price) > 0 ? ` · ${formatPrice(Number(t.price))} ج.م` : ""}{t.scheduled_for ? ` · ${formatDate(t.scheduled_for)}` : ""}{t.team_note ? ` — ${t.team_note}` : ""}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_LABEL[t.status]?.cls ?? ""}`}>{STATUS_LABEL[t.status]?.label ?? t.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">الرئيسية بتعرض عدد محدود من الإعلانات المثبّتة في نفس الوقت، وبتتبدّل بين المشتركين في كل زيارة. رسايل الواتساب بتروح للعملاء المهتمين بس، ومحدش بيوصله أكتر من رسالتين في الأسبوع.</p>
    </div>
  );
}
