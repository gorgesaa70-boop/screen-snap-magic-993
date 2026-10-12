import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Calculator } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { cleanPhone } from "@/lib/phone";
import { getAttribution } from "@/lib/attribution";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { formatPrice, FINISHING_LABEL, CITY_NAMES, areasOf, hasFinishing } from "./data";
import { MALL_UNIT_TYPES, type MallRow } from "./malls";
import { inputCls, btnPrimary, btnOutline } from "./ui";
import { FLOOR_LABEL, FLOOR_USE, FINISHING_KEYS, change3m, current, estimate, series, yieldPct, type IndexRow } from "./prices";

const money = (n: number | null | undefined) => (n ? `${formatPrice(n)} ${t("ج.م")}` : "—");
/** Numbers stay on one line; the 3-month change drops under them on phones. */
const Cell = ({ children }: { children: React.ReactNode }) => <td className="whitespace-nowrap pe-2 align-top">{children}</td>;
const RES_TYPES = ["شقة", "دوبلكس", "فيلا", "بيت", "عمارة", "استوديو", "أرض", "محل", "مكتب", "عيادة"];

function Change({ pct }: { pct: number | null }) {
  if (pct === null || pct === 0) return null;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${up ? "text-teal" : "text-destructive"}`} title={t("مقارنة بآخر 3 شهور")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}{Math.abs(pct)}%
    </span>
  );
}

/** Floors of one mall: sale and rent per m², yearly return, and the 3-month change. */
export function MallFloors({ rows, mallId, unitType }: { rows: IndexRow[]; mallId: string; unitType: string | null }) {
  const levels = [0, 1, 2, 3, 4, 5].filter((lv) => current(rows, { kind: "mall", purpose: "sale", mall_id: mallId, floor_level: lv, unit_type: unitType }) || current(rows, { kind: "mall", purpose: "rent", mall_id: mallId, floor_level: lv, unit_type: unitType }));
  if (!levels.length) return <p className="text-sm text-muted-foreground">{t("لسه مفيش وحدات كفاية هنا.")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead className="text-xs text-muted-foreground"><tr>
          <th className="py-2 text-start">{t("الدور")}</th><th className="text-start">{t("بيع / م²")}</th><th className="text-start">{t("إيجار / م² شهريًا")}</th><th className="text-start">{t("العائد السنوي")}</th>
        </tr></thead>
        <tbody>
          {levels.map((lv) => {
            const k = { kind: "mall" as const, mall_id: mallId, floor_level: lv, unit_type: unitType };
            const sale = current(rows, { ...k, purpose: "sale" }), rent = current(rows, { ...k, purpose: "rent" });
            const y = yieldPct(sale?.price_per_m2, rent?.price_per_m2);
            return (
              <tr key={lv} className="border-t">
                <td className="py-2.5 font-bold text-primary">{t(FLOOR_LABEL[lv]!)} <span className="block text-[11px] font-semibold text-muted-foreground sm:inline">({t(FLOOR_USE[lv]!)})</span></td>
                <Cell>{money(sale?.price_per_m2)}<br className="sm:hidden" /> <Change pct={change3m(series(rows, { ...k, purpose: "sale" }))} /></Cell>
                <Cell>{money(rent?.price_per_m2)}<br className="sm:hidden" /> <Change pct={change3m(series(rows, { ...k, purpose: "rent" }))} /></Cell>
                <td className="font-bold text-teal">{y ? `${y}%` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Districts of one city × finishing levels (sale price per m²). */
export function DistrictTable({ rows, city, unitType }: { rows: IndexRow[]; city: string; unitType: string }) {
  const areas = areasOf(city).filter((a) => rows.some((r) => r.kind === "residential" && r.month === null && r.area === a && r.unit_type === unitType));
  if (!areas.length) return <p className="text-sm text-muted-foreground">{t("لسه مفيش عقارات كفاية هنا.")}</p>;
  const fin = unitType === "أرض" ? [null] : [...FINISHING_KEYS, null];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-xs text-muted-foreground"><tr>
          <th className="py-2 text-start">{t("الحي")}</th>
          {fin.map((f) => <th key={f ?? "x"} className="text-start">{f ? t(FINISHING_LABEL[f]!) : unitType === "أرض" ? t("بيع / م²") : t("غير محدد")}</th>)}
          <th className="text-start">{t("إيجار / م² شهريًا")}</th>
        </tr></thead>
        <tbody>
          {areas.map((a) => {
            const k = { kind: "residential" as const, area: a, unit_type: unitType };
            const rent = rows.find((r) => r.month === null && r.kind === "residential" && r.area === a && r.unit_type === unitType && r.purpose === "rent");
            return (
              <tr key={a} className="border-t">
                <td className="py-2.5 font-bold text-primary"><a href={`/prices/areas/${encodeURIComponent(a)}`} className="hover:text-teal">{t(a)}</a></td>
                {fin.map((f) => { const r = current(rows, { ...k, purpose: "sale", finishing: f }); return <td key={f ?? "x"}>{money(r?.price_per_m2)} {r && <Change pct={change3m(series(rows, { ...k, purpose: "sale", finishing: f }))} />}</td>; })}
                <td>{money(rent?.price_per_m2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Month-by-month median price per m². */
export function TrendChart({ data }: { data: IndexRow[] }) {
  if (data.length < 2) return null;
  const points = data.map((r) => ({ m: r.month!.slice(0, 7), v: r.price_per_m2 }));
  return (
    <div className="h-48 w-full" dir="ltr">
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="m" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatPrice(v)} width={64} />
          <Tooltip formatter={(v: number) => money(v)} />
          <Line type="monotone" dataKey="v" stroke="var(--teal)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** "How much is my unit worth?" — estimate from the index, then a valuation request that reaches the team as a lead. */
export function PriceCalculator({ rows, ratios, malls, preset }: {
  rows: IndexRow[]; ratios: Record<string, number>; malls: MallRow[];
  preset?: { kind?: "mall" | "residential"; mallId?: string; area?: string };
}) {
  const [q, setQ] = useState({
    kind: preset?.kind ?? (preset?.area ? "residential" : "mall") as "mall" | "residential",
    purpose: "sale" as "sale" | "rent", mallId: preset?.mallId ?? malls[0]?.id ?? "", floor: "0", unitType: MALL_UNIT_TYPES[0]!,
    city: CITY_NAMES[0]!, area: preset?.area ?? areasOf(CITY_NAMES[0]!)[0]!, resType: "شقة", finishing: "full", size: "",
  });
  const [lead, setLead] = useState({ name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const size = Number(q.size);
  const est = useMemo(() => estimate(rows, ratios, q.kind === "mall"
    ? { kind: "mall", purpose: q.purpose, size, mall_id: q.mallId, floor_level: Number(q.floor), unit_type: q.unitType }
    : { kind: "residential", purpose: q.purpose, size, area: q.area, unit_type: q.resType, ...(hasFinishing(q.resType) ? { finishing: q.finishing } : {}) }), [rows, ratios, q, size]);
  const mallName = malls.find((m) => m.id === q.mallId)?.name ?? "";
  const what = q.kind === "mall" ? `${q.unitType} — ${mallName} — ${FLOOR_LABEL[Number(q.floor)]}` : `${q.resType} — ${q.area}${hasFinishing(q.resType) ? ` — ${FINISHING_LABEL[q.finishing]}` : ""}`;

  async function request() {
    const phone = cleanPhone(lead.phone);
    if (lead.name.trim().length < 2 || !phone) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.from("leads").insert({
      name: lead.name.trim().slice(0, 100), phone, kind: "request", purpose: q.purpose,
      property_type: q.kind === "mall" ? q.unitType : q.resType, area: q.kind === "mall" ? mallName : q.area,
      details: `طلب تقييم من حاسبة الأسعار: ${what}${size ? ` — ${size} م²` : ""}${est ? ` — التقدير ${formatPrice(est.low)}–${formatPrice(est.high)} ج.م` : ""}`.slice(0, 1000),
      original_source: "website", utm: getAttribution(),
    });
    setBusy(false);
    if (error) { toast.error(t("الطلب ماتبعتش، جرّب تاني")); return; }
    setSent(true);
  }

  const digits = (v: string) => v.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "");
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-extrabold text-primary"><Calculator className="size-5 text-teal" />{t("وحدتك بقت بكام؟")}</h2>
      <div className="mt-4 grid grid-cols-2 gap-1.5 sm:max-w-sm">
        {(["mall", "residential"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setQ({ ...q, kind: k })} aria-pressed={q.kind === k}
            className={`h-10 rounded-xl border text-sm font-bold ${q.kind === k ? "border-teal bg-teal/10 text-primary" : "text-muted-foreground"}`}>{t(k === "mall" ? "وحدة في مول" : "شقة / بيت / أرض")}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        <select aria-label={t("الغرض")} className={inputCls} value={q.purpose} onChange={(e) => setQ({ ...q, purpose: e.target.value as "sale" | "rent" })}>
          <option value="sale">{t("بيع")}</option><option value="rent">{t("إيجار شهري")}</option>
        </select>
        {q.kind === "mall" ? (<>
          <select aria-label={t("المول")} className={inputCls} value={q.mallId} onChange={(e) => setQ({ ...q, mallId: e.target.value })}>{malls.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <select aria-label={t("الدور")} className={inputCls} value={q.floor} onChange={(e) => setQ({ ...q, floor: e.target.value })}>{FLOOR_LABEL.map((f, i) => <option key={f} value={i}>{t(f)}</option>)}</select>
          <select aria-label={t("نوع الوحدة")} className={inputCls} value={q.unitType} onChange={(e) => setQ({ ...q, unitType: e.target.value })}>{MALL_UNIT_TYPES.map((u) => <option key={u} value={u}>{t(u)}</option>)}</select>
        </>) : (<>
          <select aria-label={t("المدينة")} className={inputCls} value={q.city} onChange={(e) => setQ({ ...q, city: e.target.value, area: areasOf(e.target.value)[0]! })}>{CITY_NAMES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select>
          <select aria-label={t("المنطقة")} className={inputCls} value={q.area} onChange={(e) => setQ({ ...q, area: e.target.value })}>{areasOf(q.city).map((a) => <option key={a} value={a}>{t(a)}</option>)}</select>
          <select aria-label={t("نوع العقار")} className={inputCls} value={q.resType} onChange={(e) => setQ({ ...q, resType: e.target.value })}>{RES_TYPES.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select>
          {hasFinishing(q.resType) && <select aria-label={t("حالة التشطيب")} className={inputCls} value={q.finishing} onChange={(e) => setQ({ ...q, finishing: e.target.value })}>{FINISHING_KEYS.map((f) => <option key={f} value={f}>{t(FINISHING_LABEL[f]!)}</option>)}</select>}
        </>)}
        <input aria-label={t("المساحة (م²)")} className={inputCls} inputMode="numeric" dir="ltr" placeholder={t("المساحة (م²)")} value={q.size} onChange={(e) => setQ({ ...q, size: digits(e.target.value) })} />
      </div>

      {size > 0 && (
        <div className="mt-4 rounded-xl bg-secondary p-4">
          {est ? (<>
            <p className="text-xs font-bold text-muted-foreground">{t(q.purpose === "sale" ? "القيمة التقريبية" : "الإيجار الشهري التقريبي")}</p>
            <p className="mt-1 text-2xl font-extrabold text-primary">{formatPrice(est.low)} – {formatPrice(est.high)} <span className="text-sm">{t("ج.م")}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{t("على أساس")} {formatPrice(est.ppm)} {t("ج.م للمتر")} · {est.samples} {t("وحدة")}{est.approx ? ` · ${t("تقدير من وحدات قريبة")}` : ""}</p>
          </>) : <p className="text-sm text-muted-foreground">{t("لسه مفيش وحدات كفاية نحسب منها السعر هنا — اطلب تقييم من وسيط.")}</p>}
        </div>
      )}

      {sent ? <p className="mt-4 font-bold text-teal">{t("طلبك وصل ✓ هيتواصل معاك وسيط قريب.")}</p> : (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input className={inputCls} placeholder={t("الاسم")} value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} maxLength={100} />
          <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} maxLength={20} />
          <button disabled={busy} onClick={request} className={btnPrimary}>{busy ? "..." : t("اطلب تقييم دقيق")}</button>
          <a href="/sell" className={btnOutline}>{t("اعرض وحدتك")}</a>
        </div>
      )}
    </section>
  );
}
