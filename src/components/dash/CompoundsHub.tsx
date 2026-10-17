import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, Store, ArrowLeft, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/components/site/data";
import { COMPOUND_ROLE_LABEL, compoundCover, compoundWhere } from "@/components/site/compounds";
import { btnPrimary } from "@/components/site/ui";
import { CompoundForm } from "@/components/dash/CompoundForm";
import { MallPhotosForDeveloper, mallImages } from "@/components/dash/MallPhotos";
import { thumb } from "@/lib/images";

/** The compounds the signed-in person works on (and, for a developer, their malls). Each opens its dashboard. */
export function CompoundsHub({ developerId, canAdd }: { developerId?: string | null; canAdd?: boolean }) {
  const nav = useNavigate();
  const [adding, setAdding] = useState(false);
  const [photosFor, setPhotosFor] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["my-compounds", developerId],
    queryFn: async () => {
      const mine = (await supabase.rpc("my_compounds")).data ?? [];
      if (!mine.length) return [];
      const { data, error } = await supabase.from("compounds").select("*, compound_units(status)").in("id", mine.map((m) => m.compound_id)).order("updated_at", { ascending: false });
      if (error) throw error;
      const roleOf = new Map(mine.map((m) => [m.compound_id, m.role]));
      return data.map((c) => ({ ...c, role: roleOf.get(c.id) ?? "sales" }));
    },
  });
  const malls = useQuery({
    queryKey: ["my-malls", developerId], enabled: !!developerId,
    queryFn: async () => {
      // "*" so the list still loads before the gallery column (release 29) exists.
      const { data } = await supabase.from("malls").select("*").eq("developer_id", developerId!).order("name");
      if (!data?.length) return [];
      const units = (await supabase.from("properties").select("mall_id").in("mall_id", data.map((m) => m.id)).eq("review_status", "approved")).data ?? [];
      return data.map((m) => ({ ...m, units: units.filter((u) => u.mall_id === m.id).length }));
    },
  });

  if (adding && developerId) return <CompoundForm developerId={developerId} onCancel={() => setAdding(false)} onDone={(id) => { setAdding(false); q.refetch(); nav({ to: "/my-compounds/$id", params: { id } }); }} />;
  const list = q.data ?? [];
  return (
    <div className="space-y-4">
      {canAdd && developerId && <button onClick={() => setAdding(true)} className={btnPrimary}><Plus className="size-4" />إضافة كمبوند</button>}
      {!q.isLoading && list.length === 0 && (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {canAdd ? "لسه ما ضفتش أي كمبوند. ضيف أول كمبوند، وبعدها وحداته وفريقه." : "لسه مش متعين على أي كمبوند."}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((c) => {
          const u = c.compound_units;
          const cnt = (s: string) => u.filter((x) => x.status === s).length;
          return (
            <Link key={c.id} to="/my-compounds/$id" params={{ id: c.id }} className="group flex gap-3 rounded-2xl border bg-card p-3 transition hover:border-teal">
              <img src={thumb(compoundCover(c))} alt="" loading="lazy" className="size-24 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-bold text-primary">{COMPOUND_ROLE_LABEL[c.role]}</span>
                  {!(c.is_active && c.review_status === "approved") && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">{c.review_status === "rejected" ? "مخفي من الإدارة" : "مش ظاهر"}</span>}
                </div>
                <p className="mt-1 truncate font-extrabold text-primary group-hover:text-teal">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">{compoundWhere(c)}</p>
                <p className="mt-1 text-xs font-bold text-primary">{formatPrice(u.length)} وحدة · {formatPrice(cnt("available"))} متاحة · {formatPrice(cnt("reserved"))} محجوزة · {formatPrice(cnt("sold"))} مباعة</p>
              </div>
              <ArrowLeft className="size-5 shrink-0 self-center text-muted-foreground group-hover:text-teal" />
            </Link>
          );
        })}
      </div>
      {(malls.data?.length ?? 0) > 0 && (
        <div>
          <p className="mb-2 font-extrabold text-primary">مولاتي</p>
          <div className="grid gap-3 md:grid-cols-2">
            {malls.data!.map((m) => photosFor === m.id ? (
              <div key={m.id} className="md:col-span-2"><MallPhotosForDeveloper mall={m} onSaved={() => void malls.refetch()} onClose={() => setPhotosFor(null)} /></div>
            ) : (
              <div key={m.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3 hover:border-teal">
                <Link to="/malls/$id" params={{ id: m.id }} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary">{m.logo_url ? <img src={thumb(m.logo_url)} alt="" className="size-full object-cover" /> : <Store className="size-6 text-teal" />}</span>
                  <div className="min-w-0"><p className="truncate font-bold text-primary">{m.name}</p><p className="text-xs text-muted-foreground">{formatPrice(m.units)} وحدة معروضة{m.location ? ` · ${m.location}` : ""} · {mallImages(m).length} صورة</p></div>
                </Link>
                {canAdd && <button onClick={() => setPhotosFor(m.id)} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border px-3 text-xs font-bold text-primary hover:border-teal"><ImagePlus className="size-4" />صور المول</button>}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">المولات بتربطها إدارة فاليو عقار بحسابك، ووحداتها بتتعرض من الوسطاء والملاك.</p>
        </div>
      )}
    </div>
  );
}
