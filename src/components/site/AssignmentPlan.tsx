import { BadgeCheck, FileText } from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import { DEV_APPROVAL_LABEL, feeAmount, totalCost } from "@/lib/assignment";
import { formatDate, formatPrice, type Property } from "./data";

/** «تفاصيل التنازل» on a listing page: the contract numbers and what the buyer pays in total. */
export function AssignmentPlan({ p }: { p: Property }) {
  useLang();
  const a = p.assignment!;
  const fee = feeAmount(a);
  const money = (v: number | undefined) => (v == null ? "—" : `${formatPrice(v)} ${t("ج.م")}`);
  const rows: [string, string][] = [
    [t("المطور"), a.developer ?? "—"],
    [t("سعر العقد الأصلي"), money(a.contractPrice)],
    [t("اللي اتدفع لحد دلوقتي"), money(a.paid)],
    [t("مبلغ التنازل (تدفعه للبايع دلوقتي)"), money(p.price)],
    [t("الباقي على العقد"), a.remaining != null ? `${money(a.remaining)}${a.months ? ` — ${t("على {n} شهر", { n: formatPrice(a.months) })}` : ""}` : "—"],
    [t("القسط الشهري"), money(a.monthly)],
    [t("رسوم التنازل عند المطور"), a.fee == null ? "—" : a.feeKind === "pct" ? `${a.fee}%${fee != null ? ` (${money(fee)})` : ""}` : money(a.fee)],
    [t("الاستلام"), a.delivery ?? "—"],
    [t("موافقة المطور"), a.devApproval ? t(DEV_APPROVAL_LABEL[a.devApproval]) : "—"],
  ];
  return (
    <div className="mt-4 rounded-2xl border-2 border-[#e76f51]/40 bg-card p-4">
      <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-primary"><FileText className="size-5 text-[#e76f51]" />{t("تفاصيل التنازل")}</h2>
      {a.checkedAt && <p className="mt-1 flex items-center gap-1 text-xs font-bold text-teal"><BadgeCheck className="size-4" />{t("العقد متراجع من فاليو عقار")} · {formatDate(a.checkedAt)}</p>}
      <dl className="mt-3 divide-y text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-3 py-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-end font-bold text-primary">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 rounded-xl bg-secondary p-3 text-center">
        <p className="text-xs font-semibold text-muted-foreground">{t("إجمالي اللي هتدفعه فعلًا")}</p>
        <p className="text-xl font-extrabold text-primary">{formatPrice(totalCost(p.price, a))} {t("ج.م")}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("مبلغ التنازل + الباقي على العقد + رسوم المطور")}</p>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("* الأرقام من صاحب الإعلان، وفريق فاليو عقار بيتأكد منها مع المطور قبل أي اتفاق.")}</p>
    </div>
  );
}
