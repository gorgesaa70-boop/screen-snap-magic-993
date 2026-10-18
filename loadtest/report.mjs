// Merges result-*.json from every runner into one report (markdown to stdout, full data to combined.json).
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] || ".";
const files = fs.readdirSync(dir, { recursive: true }).filter((f) => /result-\d+\.json$/.test(f));
const runs = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

const ep = {};
for (const r of runs) for (const [k, s] of Object.entries(r.stats)) {
  const e = (ep[k] ??= { lat: [], ok: 0, err: 0, codes: {} });
  e.lat.push(...s.lat); e.ok += s.ok; e.err += s.err;
  for (const [c, n] of Object.entries(s.codes)) e.codes[c] = (e.codes[c] || 0) + n;
}
const tl = [];
for (const r of runs) r.timeline.forEach((row, i) => {
  const t = (tl[i] ??= { t: row.t, vus: 0, ok: 0, err: 0, p95: 0 });
  t.vus += row.vus; t.ok += row.ok; t.err += row.err; t.p95 = Math.max(t.p95, row.p95);
});

const out = [];
out.push(`## Load test — ${runs.length} runners`);
out.push(`Stopped runners: ${runs.filter((r) => r.stopReason).map((r) => r.stopReason).join("; ") || "none"}\n`);
out.push("| t (s) | users | req/s | errors % | worst p95 ms |", "|---|---|---|---|---|");
for (const t of tl) { const n = t.ok + t.err; out.push(`| ${t.t} | ${t.vus} | ${(n / 15).toFixed(0)} | ${n ? ((t.err / n) * 100).toFixed(1) : 0} | ${t.p95} |`); }
out.push("\n| endpoint | requests | errors % | p50 ms | p95 ms | codes |", "|---|---|---|---|---|---|");
for (const [k, e] of Object.entries(ep)) {
  const n = e.ok + e.err;
  out.push(`| ${k} | ${n} | ${((e.err / n) * 100).toFixed(1)} | ${pct(e.lat, 0.5)} | ${pct(e.lat, 0.95)} | ${JSON.stringify(e.codes)} |`);
}
console.log(out.join("\n"));
fs.writeFileSync(path.join(dir, "combined.json"), JSON.stringify({ timeline: tl, endpoints: Object.fromEntries(Object.entries(ep).map(([k, e]) => [k, { n: e.ok + e.err, err: e.err, p50: pct(e.lat, 0.5), p95: pct(e.lat, 0.95), codes: e.codes }])), stops: runs.map((r) => r.stopReason) }, null, 2));
