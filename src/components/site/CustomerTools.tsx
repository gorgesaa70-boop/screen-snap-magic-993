import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Bell, Calculator, Heart, Link2, MessageCircle, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useAuth";
import { formatPrice, formatDate } from "./data";
import { GROUP_LABELS, TYPE_GROUPS, type Filters } from "./search";
import { inputCls } from "./ui";
import { t, useLang } from "@/lib/i18n";
import { SITE_URL } from "@/lib/seo";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";

/** Favourites of the signed-in user (ids only), shared by every heart on the page. */
export function useFavorites() {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["favorites", user?.id], enabled: !!user,
    queryFn: async () => new Set(((await supabase.from("favorites").select("property_id")).data ?? []).map((r) => r.property_id)),
  });
  async function toggle(id: string) {
    if (!user) { askToSignIn(t("سجّل دخولك عشان تحفظ العقارات في المفضلة")); return; }
    const on = q.data?.has(id);
    const { error } = on
      ? await supabase.from("favorites").delete().eq("property_id", id)
      : await supabase.from("favorites").insert({ property_id: id });
    if (error) { toast.error(t("تعذّر الحفظ")); return; }
    toast.success(on ? t("اتشال من المفضلة") : t("اتحفظ في المفضلة ♥"));
    qc.invalidateQueries({ queryKey: ["favorites"] });
  }
  return { ids: q.data ?? new Set<string>(), toggle };
}

function askToSignIn(msg: string) {
  toast(msg, { action: { label: t("تسجيل الدخول"), onClick: () => { window.location.href = `/auth?next=${encodeURIComponent(window.location.pathname)}`; } } });
}

export function FavoriteButton({ id, className = "" }: { id: string; className?: string }) {
  useLang();
  const { ids, toggle } = useFavorites();
  const on = ids.has(id);
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(id); }} aria-pressed={on}
      aria-label={on ? t("شيل من المفضلة") : t("احفظ في المفضلة")} title={on ? t("شيل من المفضلة") : t("احفظ في المفضلة")}
      className={`grid size-10 place-items-center rounded-full bg-background/90 shadow-card transition hover:scale-105 active:scale-95 ${className}`}>
      <Heart className={`size-5 ${on ? "fill-destructive text-destructive" : "text-primary"}`} />
    </button>
  );
}

/** Native share sheet on phones; WhatsApp + copy link elsewhere. */
export function ShareButton({ title }: { title: string }) {
  useLang();
  const [open, setOpen] = useState(false);
  // Always the public domain, even when the page is opened from a preview or editor address.
  const url = typeof window === "undefined" ? "" : `${SITE_URL}${window.location.pathname}${window.location.search}`;
  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title, url }); } catch { /* cancelled */ }
      return;
    }
    setOpen(!open);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast.success(t("اتنسخ الرابط ✓")); } catch { toast.error(t("تعذّر نسخ الرابط")); }
    setOpen(false);
  }
  return (
    <div className="relative">
      <button type="button" onClick={share} aria-label={t("مشاركة")} title={t("مشاركة")} aria-expanded={open}
        className="grid size-10 place-items-center rounded-full border bg-card text-primary transition hover:border-teal">
        <Share2 className="size-5" />
      </button>
      {open && (
        <div className="absolute end-0 top-12 z-20 w-48 overflow-hidden rounded-xl border bg-card text-sm font-bold text-primary shadow-card">
          <a href={`https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-3 hover:bg-secondary"><MessageCircle className="size-4 text-whatsapp" />{t("واتساب")}</a>
          <button type="button" onClick={copy} className="flex w-full items-center gap-2 border-t px-4 py-3 hover:bg-secondary"><Link2 className="size-4 text-teal" />{t("نسخ الرابط")}</button>
        </div>
      )}
    </div>
  );
}

export function VerifiedBadge({ at, note }: { at: string; note?: string | null | undefined }) {
  useLang();
  return (
    <div className="mt-3 flex items-start gap-2 rounded-2xl border border-teal/40 bg-teal-soft p-3">
      <BadgeCheck className="mt-0.5 size-5 shrink-0 text-teal" />
      <div>
        <p className="text-sm font-extrabold text-primary">{t("متحقق منه — عاينه فريق فاليو عقار")}</p>
        <p className="text-xs text-muted-foreground">{note ? `${note} · ` : ""}{t("تاريخ المعاينة:")} {formatDate(at)}</p>
      </div>
    </div>
  );
}

/** A filter set as a saved-search row (empty = any). Group filters expand to their property types. */
export function filtersToAlert(f: Partial<Filters>) {
  const types = f.type ? [f.type] : f.group ? TYPE_GROUPS[f.group] ?? [] : [];
  const n = (v?: string) => (v ? Number(v) : null);
  // Stored in Arabic (canonical values); pages translate it when shown.
  const label = [f.status, f.type || (f.group ? GROUP_LABELS[f.group] : ""), f.area || f.city].filter(Boolean).join(" · ");
  return { status: f.status || null, types, city: f.city || null, area: f.area || null, price_min: n(f.min), price_max: n(f.max), label: label.slice(0, 120) || null };
}

/** "Notify me when a property like this is listed" — saves a search; the database sends the notifications. */
export function AlertButton({ filters, className = "" }: { filters: Partial<Filters>; className?: string }) {
  useLang();
  const { user } = useSessionUser();
  const [done, setDone] = useState(false);
  async function save() {
    if (!user) { askToSignIn(t("سجّل دخولك عشان نبعتلك أول ما ينزل عقار زي ده")); return; }
    const { error } = await supabase.from("saved_searches").insert(filtersToAlert(filters));
    if (error) { toast.error(error.message.includes("10") ? t("وصلت للحد الأقصى (10 تنبيهات). امسح تنبيه قديم من «المفضلة».") : t("تعذّر الحفظ")); return; }
    setDone(true);
    toast.success(t("تمام ✓ هنبعتلك إشعار أول ما ينزل عقار مطابق"));
  }
  return (
    <button type="button" onClick={save} disabled={done}
      className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-teal bg-card px-4 text-sm font-bold text-primary transition hover:bg-teal-soft disabled:opacity-60 ${className}`}>
      <Bell className="size-4 text-teal" />{done ? t("هنبلغك ✓") : t("نبّهني لو نزل عقار زي ده")}
    </button>
  );
}

/**
 * Installment estimate for developer projects: down payment % and years → monthly / quarterly amounts.
 * Plain division (no interest), like most developer plans; the developer's actual plan is what counts.
 */
export function InstallmentCalc({ price: initial }: { price?: number | null | undefined }) {
  useLang();
  const [price, setPrice] = useState(initial ? String(initial) : "");
  const [down, setDown] = useState("10");
  const [years, setYears] = useState("5");
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) { setLastInitial(initial); if (initial) setPrice(String(initial)); }
  const r = useMemo(() => {
    const p = Number(price), d = Math.min(Math.max(Number(down), 0), 100), y = Math.min(Math.max(Number(years), 0), 15);
    if (!p || !y) return null;
    const downAmount = Math.round((p * d) / 100);
    const rest = p - downAmount;
    return { downAmount, monthly: Math.round(rest / (y * 12)), quarterly: Math.round(rest / (y * 4)) };
  }, [price, down, years]);
  return (
    <div className="mt-6 rounded-2xl border bg-card p-4">
      <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-primary"><Calculator className="size-5 text-teal" />{t("احسب القسط")}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block"><span className="mb-1 block text-xs font-bold text-primary">{t("سعر الوحدة (ج.م)")}</span>
          <input className={inputCls} inputMode="numeric" dir="ltr" value={price} onChange={(e) => setPrice(e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "").slice(0, 12))} /></label>
        <label className="block"><span className="mb-1 block text-xs font-bold text-primary">{t("المقدم %")}</span>
          <input className={inputCls} inputMode="numeric" dir="ltr" value={down} onChange={(e) => setDown(e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "").slice(0, 3))} /></label>
        <label className="block"><span className="mb-1 block text-xs font-bold text-primary">{t("عدد السنين")}</span>
          <input className={inputCls} inputMode="numeric" dir="ltr" value={years} onChange={(e) => setYears(e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "").slice(0, 2))} /></label>
      </div>
      {r ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {([["المقدم", r.downAmount], ["القسط الشهري", r.monthly], ["القسط ربع السنوي", r.quarterly]] as const).map(([l, v]) => (
            <div key={l} className="rounded-xl bg-secondary p-3">
              <p className="text-base font-extrabold text-primary md:text-lg">{formatPrice(v)}</p>
              <p className="text-[11px] font-semibold text-muted-foreground">{t(l)} ({t("ج.م")})</p>
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-muted-foreground">{t("اكتب السعر وعدد السنين.")}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">{t("* حساب تقريبي من غير فوايد. نظام السداد الفعلي بيحدده المطوّر.")}</p>
    </div>
  );
}
