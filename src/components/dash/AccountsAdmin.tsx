import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, CheckCircle2, ChevronDown, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { deleteAccountAsAdmin, setAccountBlocked } from "@/lib/admin.functions";
import { ACCOUNT_LABEL, formatDate } from "@/components/site/data";
import { inputCls, btnOutline } from "@/components/site/ui";

type Account = Database["public"]["Functions"]["admin_accounts"]["Returns"][number];

/** One word for what the account is, from its roles and what's linked to it. */
function kindOf(a: Account): { id: string; label: string } {
  if (a.roles.includes("admin")) return { id: "admin", label: "أدمن" };
  if (a.roles.includes("staff")) return { id: "staff", label: "فريق فاليو عقار" };
  if (a.broker_id) return { id: a.account_type === "developer" ? "developer" : "broker", label: ACCOUNT_LABEL[a.account_type ?? ""] ?? "وسيط" };
  if (a.member_of) return { id: "member", label: `موظف في ${a.member_of}` };
  if (a.provider_id) return { id: "provider", label: "مقدم خدمة" };
  if (a.owner_listings > 0) return { id: "owner", label: "مالك عقار" };
  return { id: "customer", label: "عميل" };
}
const KINDS: [string, string][] = [["", "الكل"], ["broker", "وسطاء وشركات"], ["developer", "مطورين"], ["owner", "ملاك"], ["provider", "مقدمين خدمة"], ["customer", "عملاء"], ["member", "موظفين شركات"], ["staff", "فريق فاليو عقار"], ["admin", "أدمن"]];
const blocked = (a: Account) => !!a.banned_until && new Date(a.banned_until).getTime() > Date.now();
const when = (d: string | null) => (d ? formatDate(d) : "—");

/** «كل الحسابات»: every login with its details; the admin can stop it or delete it (two confirmations). */
export function AccountsAdmin() {
  const q = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: async () => { const { data, error } = await supabase.rpc("admin_accounts"); if (error) throw error; return data; },
  });
  const block = useServerFn(setAccountBlocked);
  const remove = useServerFn(deleteAccountAsAdmin);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; step: 1 | 2 } | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase().replace(/^\+/, "");
    return (q.data ?? []).filter((a) => (!kind || kindOf(a).id === kind)
      && (!s || [a.email, a.phone, a.full_name, a.broker_name, a.provider_name].some((v) => v?.toLowerCase().includes(s))));
  }, [q.data, search, kind]);

  if (q.error) return <p className="rounded-2xl border bg-card p-6 text-sm text-destructive">تعذّر تحميل الحسابات — اتأكد إن تحديث الداتابيز 26 اتطبق.</p>;
  if (!q.data) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;

  async function setBlocked(a: Account, value: boolean) {
    setBusy(true);
    const r = await block({ data: { userId: a.user_id, blocked: value } }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(value ? "الحساب اتوقف ومش هيقدر يدخل" : "الحساب اتفعّل"); q.refetch();
  }
  async function doDelete(a: Account) {
    setBusy(true);
    const r = await remove({ data: { userId: a.user_id } }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setBusy(false); setConfirm(null);
    if (!r.ok) { toast.error(r.error); return; }
    // A broker / company / developer account goes too (kept only for money records), so it leaves «الحسابات والشركات».
    if (a.broker_id) {
      const { error } = await supabase.rpc("admin_delete_broker", { _id: a.broker_id });
      if (error && error.code !== "PGRST202") toast.error(error.message);
    }
    toast.success("الحساب اتمسح — الإيميل والموبايل بقوا متاحين لتسجيل جديد"); setOpen(null); q.refetch();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className={`${inputCls} min-w-60 flex-1`} placeholder="ابحث بالإيميل أو الموبايل أو الاسم" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={`${inputCls} w-auto`} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="نوع الحساب">
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">{list.length} حساب{list.length !== q.data.length ? ` من ${q.data.length}` : ""}</p>
      {list.length === 0 && <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">مفيش حسابات بالبحث ده.</p>}
      {list.slice(0, 300).map((a) => {
        const k = kindOf(a);
        const isOpen = open === a.user_id;
        const protectedAcc = k.id === "admin";
        const listings = a.listings + a.owner_listings;
        return (
          <div key={a.user_id} className="rounded-2xl border bg-card">
            <button type="button" onClick={() => setOpen(isOpen ? null : a.user_id)} aria-expanded={isOpen}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-start">
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">{k.label}</span>
              {blocked(a) && <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-bold text-destructive">موقوف</span>}
              <span className="min-w-0 flex-1 truncate font-bold text-primary">{a.broker_name ?? a.provider_name ?? a.full_name ?? a.email ?? (a.phone ? `+${a.phone}` : "بدون اسم")}</span>
              <span className="text-xs text-muted-foreground" dir="ltr">{a.email ?? (a.phone ? `+${a.phone}` : "")}</span>
              <ChevronDown className={`size-4 text-muted-foreground transition ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="space-y-3 border-t p-3 text-sm">
                <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {([
                    ["إيميل الدخول", a.email ? <span dir="ltr">{a.email}</span> : "—"],
                    ["الموبايل", a.phone ? <span dir="ltr">+{a.phone}</span> : "—"],
                    ["الاسم", a.full_name ?? "—"],
                    ["الصلاحيات", a.roles.length ? a.roles.join("، ") : "عميل"],
                    ["اتعمل يوم", when(a.created_at)],
                    ["آخر دخول", when(a.last_sign_in_at)],
                    ...(a.broker_id ? [["الحساب التجاري", `${a.broker_name ?? ""} (${ACCOUNT_LABEL[a.account_type ?? ""] ?? "وسيط"}) — ${a.broker_active ? "ظاهر" : "مش ظاهر"}`]] : []),
                    ...(a.member_of ? [["موظف في", a.member_of]] : []),
                    ...(a.provider_id ? [["مقدم خدمة", `${a.provider_name ?? ""} — ${a.provider_status ?? ""}`]] : []),
                    ["الإعلانات", String(listings)],
                    ["طلباته كعميل", String(a.requests)],
                    ["المفضلة", String(a.favorites)],
                  ] as [string, React.ReactNode][]).map(([l, v]) => (
                    <div key={l} className="flex gap-2"><dt className="shrink-0 font-bold text-muted-foreground">{l}:</dt><dd className="min-w-0 break-words text-foreground">{v}</dd></div>
                  ))}
                </dl>
                {protectedAcc ? (
                  <p className="text-xs text-muted-foreground">حساب أدمن: مينفعش يتوقف أو يتمسح من هنا.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {blocked(a)
                      ? <button disabled={busy} className={btnOutline} onClick={() => setBlocked(a, false)}><CheckCircle2 className="size-4" />تفعيل الحساب</button>
                      : <button disabled={busy} className={btnOutline} onClick={() => setBlocked(a, true)}><Ban className="size-4" />إيقاف الحساب</button>}
                    {confirm?.id !== a.user_id && (
                      <button disabled={busy} onClick={() => setConfirm({ id: a.user_id, step: 1 })}
                        className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-destructive/40 px-4 text-sm font-bold text-destructive hover:bg-destructive/5"><Trash2 className="size-4" />حذف الحساب</button>
                    )}
                  </div>
                )}
                {confirm?.id === a.user_id && (
                  <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                    {confirm.step === 1 ? (
                      <>
                        <p className="font-bold text-destructive">متأكد إنك عايز تمسح حساب «{a.broker_name ?? a.full_name ?? a.email ?? a.phone}»؟</p>
                        <p className="text-xs text-foreground/80">
                          الدخول والإيميل والموبايل هيتمسحوا، وصاحبه يقدر يسجل تاني بنفس الإيميل كحساب جديد.
                          {listings > 0 && ` إعلاناته (${listings}) هتتمسح من الموقع، واللي عليه عملاء أو صفقات هيستخبى ويفضل في السجلات.`}
                          {" "}مفيش رجوع في الخطوة دي.
                        </p>
                        <div className="flex gap-2">
                          <button className="h-10 rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground" onClick={() => setConfirm({ id: a.user_id, step: 2 })}>أيوه، كمّل</button>
                          <button className="h-10 px-3 text-sm font-bold text-muted-foreground" onClick={() => setConfirm(null)}>إلغاء</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-destructive">تأكيد أخير: الحذف نهائي.</p>
                        <div className="flex gap-2">
                          <button disabled={busy} className="h-10 rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground" onClick={() => doDelete(a)}>{busy ? "بيتمسح..." : "حذف نهائي"}</button>
                          <button className="h-10 px-3 text-sm font-bold text-muted-foreground" onClick={() => setConfirm(null)}>إلغاء</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {list.length > 300 && <p className="text-center text-xs text-muted-foreground">ظاهر أول 300 — دوّر بالإيميل أو الموبايل للباقي.</p>}
    </div>
  );
}
