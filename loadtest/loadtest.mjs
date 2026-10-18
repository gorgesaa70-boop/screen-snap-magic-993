// Read-only load test for valueaqar.com, run on several GitHub runners at once (see .github/workflows/loadtest.yml).
// Env: SB_URL, SB_KEY (secrets), MAX_VUS (users on this runner), START_AT (epoch ms, so all runners ramp together), OUT.
import fs from "node:fs";

const SB = process.env.SB_URL, KEY = process.env.SB_KEY;
const MAX = Number(process.env.MAX_VUS || 100), START_AT = Number(process.env.START_AT || Date.now());
const SITE = "https://valueaqar.com";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const UA = "Mozilla/5.0 (Linux; Android 14) ValueAqarLoadTest";

// Stages as a share of MAX: [share, seconds]
const STAGES = [[0.05, 90], [0.2, 150], [0.5, 180], [1, 240], [1, 60], [0, 30]];
const STOP_ERR_RATE = 0.25;

const stats = {};
const timeline = [];
let win = { ok: 0, err: 0, lat: [] };
let stopReason = null;

async function hit(name, url, opts = {}) {
  const s = (stats[name] ??= { lat: [], ok: 0, err: 0, codes: {} });
  const t = performance.now();
  let code = "ERR";
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000), headers: { "user-agent": UA, ...(opts.headers || {}) } });
    code = r.status;
    await r.arrayBuffer();
  } catch (e) { code = e.name === "TimeoutError" ? "TIMEOUT" : "NETERR"; }
  const ms = Math.round(performance.now() - t);
  const good = typeof code === "number" && code < 400;
  s.lat.push(ms); s.codes[code] = (s.codes[code] || 0) + 1; good ? s.ok++ : s.err++;
  good ? win.ok++ : win.err++; win.lat.push(ms);
}
const rest = (q) => `${SB}/rest/v1/${q}`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(2000 + Math.random() * 4000);

const getJson = async (q) => { const j = await (await fetch(rest(q), { headers: H })).json(); return Array.isArray(j) ? j : (console.log("seed error", q, j?.code), []); };
const props = await getJson("properties?select=id,category,broker_id&review_status=eq.approved&category=in.(residential,mall,industrial)&limit=500");
const malls = await getJson("malls?select=id&is_active=eq.true&limit=50");
const brokers = await getJson("brokers?select=id,slug&is_active=eq.true&limit=100");
const compounds = await getJson("compounds?select=id&is_active=eq.true&review_status=eq.approved&limit=50");
const services = await getJson("rpc/service_directory");
const byCat = props.reduce((m, p) => ({ ...m, [p.category]: (m[p.category] || 0) + 1 }), {});
console.log(`seed: props=${JSON.stringify(byCat)} malls=${malls.length} brokers=${brokers.length} compounds=${compounds.length} services=${services.length}`);
const BROKER_COLS = "id,slug,name,specialty,bio,photo_url,areas,facebook,is_demo,account_type,show_contact";
const api = (name, q) => hit(name, rest(q), { headers: H });
const contacts = (ids) => hit("api broker_contacts(rpc)", rest("rpc/broker_contacts"), { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ _ids: ids }) });
const page = (p, label = p) => hit("page " + label, SITE + p);

const scenarios = [
  [25, async function home() {
    await page("/");
    await Promise.all([
      api("api home properties", "properties?select=*&review_status=eq.approved&category=eq.residential&order=is_featured.desc,created_at.desc"),
      api("api home mall units", "properties?select=*&category=eq.mall&review_status=eq.approved&order=id&offset=0&limit=1000"),
      api("api locations", "locations?select=city,area,city_en,area_en,sort&status=eq.approved&order=sort,city,area"),
      api("api brokers(list)", `brokers?select=${BROKER_COLS}&is_active=eq.true&order=created_at`),
    ]);
    if (brokers.length) await contacts(brokers.slice(0, 12).map((b) => b.id));
  }],
  [20, async function searchEverything() {
    await Promise.all([
      api("api search properties", "properties?select=*&review_status=eq.approved&category=in.(residential,mall,industrial)&order=is_featured.desc,created_at.desc"),
      api("api search malls", "malls?select=id,name,images,logo_url&is_active=eq.true"),
      api("api search compounds", "compounds?select=id,name,city,area,images,logo_url,lat,lng,updated_at,compound_units(*)&is_active=eq.true&review_status=eq.approved"),
      api("api search projects", "projects?select=id,name,city,area,images,lat,lng,updated_at,project_units(*)&review_status=eq.approved"),
    ]);
  }],
  [18, async function property() {
    if (!props.length) return;
    // Pick a type first so residential, mall units and industrial all get visits, not just the largest group
    const cats = Object.keys(byCat), cat = pick(cats), p = pick(props.filter((x) => x.category === cat));
    if (cat === "industrial") { await page(`/industrial/${p.id}`, "/industrial/:id"); await api("api industrial(one)", `properties?select=*,industrial_activities(name)&id=eq.${p.id}`); }
    else { await page(`/properties/${p.id}`, `/properties/:id (${cat})`); await api(`api property(one) ${cat}`, `properties?select=*&id=eq.${p.id}`); }
    if (p.broker_id) { await api("api property broker", `brokers?select=${BROKER_COLS}&id=eq.${p.broker_id}`); await contacts([p.broker_id]); }
    await api("api similar", "properties?select=*&review_status=eq.approved&category=eq.residential&limit=6");
  }],
  [10, async function mall() {
    await page("/malls");
    await api("api malls(list)", "malls?select=*&order=sort_order,name");
    if (!malls.length) return;
    const id = pick(malls).id;
    await page(`/malls/${id}`, "/malls/:id");
    await Promise.all([api("api mall(one)", `malls?select=*&id=eq.${id}`),
      api("api mall units", `properties?select=*&category=eq.mall&mall_id=eq.${id}&review_status=eq.approved&order=is_featured.desc,created_at.desc`)]);
  }],
  [8, async function compound() {
    await page("/compounds");
    await api("api compounds(list)", "compounds?select=*&order=sort_order,name");
    if (!compounds.length) return;
    const id = pick(compounds).id;
    await page(`/compounds/${id}`, "/compounds/:id");
    await Promise.all([api("api compound(one)", `compounds?select=*&id=eq.${id}`),
      api("api compound units", `compound_units?select=*&compound_id=eq.${id}&order=building,unit_type,price`)]);
  }],
  [6, async function broker() {
    await page("/brokers");
    if (!brokers.length) return;
    const b = pick(brokers);
    await page(`/brokers/${b.slug}`, "/brokers/:slug");
    await api("api broker(one)", `brokers?select=${BROKER_COLS}&slug=eq.${encodeURIComponent(b.slug)}&is_active=eq.true`);
    await contacts([b.id]);
  }],
  [6, async function service() {
    await page("/services");
    await hit("api services(list)", rest("rpc/service_directory"), { method: "POST", headers: { ...H, "content-type": "application/json" }, body: "{}" });
    if (!services.length) return;
    const id = pick(services).id;
    await page(`/services/${id}`, "/services/:id");
    await hit("api service profile", rest("rpc/service_provider_profile"), { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ _id: id }) });
  }],
  [4, async function investments() {
    await page("/investments");
    await api("api investments(list)", "investment_opportunities?select=id,opp_no,title,kind,city,area,images,is_featured,created_at&review_status=eq.approved&order=is_featured.desc,created_at.desc");
  }],
  [5, async function otherPages() { await page(pick(["/projects", "/prices", "/industrial", "/map", "/sell", "/shared-housing"])); }],
  [5, async function login() {
    await page("/auth");
    await hit("api auth settings", `${SB}/auth/v1/settings`, { headers: H });
  }],
];
if (process.env.SMOKE) {
  for (let i = 0; i < 3; i++) for (const [, f] of scenarios) await f();
  for (const [k, s] of Object.entries(stats)) console.log(k.padEnd(36), JSON.stringify(s.codes));
  process.exit(Object.values(stats).some((s) => s.err) ? 1 : 0);
}
const total = scenarios.reduce((a, [w]) => a + w, 0);
const choose = () => { let r = Math.random() * total; for (const [w, f] of scenarios) if ((r -= w) < 0) return f; };

let target = 0, active = 0;
async function vu(id) {
  active++;
  await sleep(Math.random() * 1000);
  while (!stopReason && id < target) { await choose()(); await think(); }
  active--;
}

const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
if (START_AT > Date.now()) await sleep(START_AT - Date.now());
const t0 = Date.now();
const ticker = setInterval(() => {
  const n = win.ok + win.err, er = n ? win.err / n : 0;
  const row = { t: Math.round((Date.now() - t0) / 1000), vus: active, ok: win.ok, err: win.err, p50: pct(win.lat, 0.5), p95: pct(win.lat, 0.95) };
  timeline.push(row); console.log(JSON.stringify(row));
  if (n > 50 && er > STOP_ERR_RATE) stopReason = `error rate ${(er * 100).toFixed(1)}% at ${active} users on this runner`;
  win = { ok: 0, err: 0, lat: [] };
}, 15000);

let spawned = 0;
for (const [share, secs] of STAGES) {
  if (stopReason) break;
  const from = target, to = Math.round(share * MAX);
  for (let s = 1; s <= secs && !stopReason; s++) {
    target = Math.round(from + ((to - from) * s) / secs);
    while (spawned < target) vu(spawned++);
    if (spawned > target) spawned = target;
    await sleep(1000);
  }
}
target = 0;
while (active > 0) await sleep(500);
clearInterval(ticker);
fs.writeFileSync(process.env.OUT || "result.json", JSON.stringify({ stopReason, timeline, stats }));
console.log("DONE", stopReason || "completed all stages");
