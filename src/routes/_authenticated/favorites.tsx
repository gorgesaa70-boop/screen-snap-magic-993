import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff, Heart, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashShell } from "@/components/dash/DashShell";
import { PropertyCard } from "@/components/site/Sections";
import { formatPrice, toProperty } from "@/components/site/data";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({ meta: [{ title: "المفضلة والتنبيهات | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const favs = useQuery({
    queryKey: ["favorites-list"],
    queryFn: async () => {
      const ids = ((await supabase.from("favorites").select("property_id").order("created_at", { ascending: false })).data ?? []).map((r) => r.property_id);
      if (!ids.length) return [];
      const { data } = await supabase.from("properties").select("*").in("id", ids).eq("review_status", "approved");
      const byId = new Map((data ?? []).map((r) => [r.id, toProperty(r)]));
      return ids.map((id) => byId.get(id)).filter((p) => !!p);
    },
  });
  const alerts = useQuery({ queryKey: ["saved-searches"], queryFn: async () => (await supabase.from("saved_searches").select("*").order("created_at", { ascending: false })).data ?? [] });

  async function toggleNotify(id: string, notify: boolean) {
    const { error } = await supabase.from("saved_searches").update({ notify }).eq("id", id);
    if (error) toast.error("تعذّر الحفظ"); else alerts.refetch();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("saved_searches").delete().eq("id", id);
    if (error) toast.error("تعذّر المسح"); else { toast.success("اتمسح التنبيه"); alerts.refetch(); }
  }

  return (
    <DashShell title="المفضلة والتنبيهات" customer>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-primary"><Heart className="size-5 text-destructive" />العقارات المحفوظة</h2>
      {favs.isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        : !favs.data?.length ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه محفظتش عقارات. دوس على ♡ في أي عقار عشان يتحفظ هنا.</p>
        : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{favs.data.map((p) => <PropertyCard key={p.id} p={p} />)}</div>}

      <h2 id="alerts" className="mt-10 mb-3 flex scroll-mt-20 items-center gap-2 text-lg font-extrabold text-primary"><Bell className="size-5 text-teal" />تنبيهات «نبّهني»</h2>
      <p className="mb-3 text-sm text-muted-foreground">أول ما ينزل عقار مطابق، بيوصلك إشعار هنا وعلى واتساب (لو مفعّل من «حسابي»). الحد الأقصى 10 تنبيهات.</p>
      {!alerts.data?.length ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش تنبيهات. استخدم زرار «نبّهني لو نزل عقار زي ده» في نتايج البحث أو في صفحة أي عقار.</p> : (
        <ul className="max-w-3xl space-y-2">
          {alerts.data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
              <div className="min-w-0">
                <p className="font-bold text-primary">{a.label || "أي عقار"}</p>
                <p className="text-xs text-muted-foreground">
                  {[a.types.length > 1 && a.types.join("، "), a.price_min && `من ${formatPrice(Number(a.price_min))}`, a.price_max && `لحد ${formatPrice(Number(a.price_max))} ج.م`].filter(Boolean).join(" · ") || "كل الأسعار"}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleNotify(a.id, !a.notify)} title={a.notify ? "إيقاف مؤقت" : "تشغيل"} aria-label={a.notify ? "إيقاف التنبيه مؤقتًا" : "تشغيل التنبيه"} className={`grid size-10 place-items-center rounded-xl border ${a.notify ? "text-teal" : "text-muted-foreground"}`}>{a.notify ? <Bell className="size-4" /> : <BellOff className="size-4" />}</button>
                <button onClick={() => remove(a.id)} title="مسح" aria-label="مسح التنبيه" className="grid size-10 place-items-center rounded-xl border text-destructive"><Trash2 className="size-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashShell>
  );
}
