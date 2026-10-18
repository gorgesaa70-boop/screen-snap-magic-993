import { supabase } from "@/integrations/supabase/client";
import { dbx } from "@/lib/dbx";
import { viaFeed } from "@/lib/feed";
import { toProperty, type Property } from "./data";
import { mallImages } from "./malls";
import { compoundCover } from "./compounds";
import { projectCover } from "./projects";

/**
 * Everything the home search looks through: residential listings, mall units, industrial listings, and the
 * compound / project price lists (those cards open the compound or project page). The unfiltered home list
 * stays residential only (fetchPublicProperties) so the mall units don't flood it.
 */
export async function fetchSearchEverything(): Promise<Property[]> {
  return viaFeed("search", querySearchEverything);
}
async function querySearchEverything(): Promise<Property[]> {
  const [props, malls, compounds, projects] = await Promise.all([
    supabase.from("properties").select("*").eq("review_status", "approved").in("category", ["residential", "mall", "industrial"])
      .order("is_featured", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("malls").select("id,name,images,logo_url").eq("is_active", true),
    supabase.from("compounds").select("id,name,city,area,images,logo_url,lat,lng,updated_at,compound_units(*)")
      .eq("is_active", true).eq("review_status", "approved"),
    dbx.from("projects").select("id,name,city,area,images,lat,lng,updated_at,project_units(*)").eq("review_status", "approved"),
  ]);
  if (props.error) throw props.error;
  const mallById = new Map((malls.data ?? []).map((m) => [m.id, m]));
  const compoundName = new Map((compounds.data ?? []).map((c) => [c.id, c.name]));

  const listings = props.data.map((r): Property => {
    const p = toProperty(r);
    if (r.category === "mall") {
      const m = r.mall_id ? mallById.get(r.mall_id) : undefined;
      // A unit without its own photo shows the mall's cover instead of the generic one.
      const cover = m ? mallImages(m)[0] : undefined;
      return { ...p, kind: "mall", place: m?.name, ...(cover && !r.images?.length && !r.image_url ? { image: cover, images: [cover] } : {}) };
    }
    if (r.category === "industrial") return { ...p, kind: "industrial" };
    return r.compound_id && compoundName.has(r.compound_id) ? { ...p, place: compoundName.get(r.compound_id) } : p;
  });

  type Unit = { id: string; unit_type: string; size: number; price: number | null; rooms: number | null; baths: number | null; status: string; finishing?: string | null; updated_at: string };
  type Parent = { id: string; name: string; city: string | null; area: string | null; lat: number | null; lng: number | null };
  const unit = (kind: "compound" | "project", parent: Parent, image: string, u: Unit): Property => ({
    id: u.id, kind, parentId: parent.id, place: parent.name,
    title: `${u.unit_type} في ${parent.name}`, description: null, image, images: [image],
    price: Number(u.price ?? 0), type: u.unit_type, city: parent.city ?? "", area: parent.area ?? parent.city ?? "",
    size: Number(u.size), rooms: u.rooms ?? undefined, baths: u.baths ?? undefined,
    lat: parent.lat ?? undefined, lng: parent.lng ?? undefined, status: "بيع", updated: u.updated_at,
    isDemo: false, featured: false, brokerId: null, finishing: u.finishing ?? undefined,
    availability: u.status === "reserved" ? "reserved" : u.status === "sold" ? "sold" : "available",
  });
  // Price-list rows: only units still on offer.
  const onOffer = (u: Unit) => u.status === "available" || u.status === "reserved";
  const compoundUnits = (compounds.data ?? []).flatMap((c) =>
    (c.compound_units as Unit[]).filter(onOffer).map((u) => unit("compound", c, compoundCover(c), u)));
  const projectUnits = ((projects.data ?? []) as (Parent & { images: string[]; project_units: Unit[] })[]).flatMap((pr) =>
    pr.project_units.filter(onOffer).map((u) => unit("project", pr, projectCover(pr), u)));

  return [...listings, ...compoundUnits, ...projectUnits];
}
