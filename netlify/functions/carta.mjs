// Estado en vivo de la carta: productos apagados, precios y descripciones editadas desde /admin, con historial.
// GET  /api/carta  -> público (la carta lo lee).
// POST /api/carta  -> solo con la clave (ADMIN_PIN, o ADMIN_KEY si no hay ADMIN_PIN en Netlify).
import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

const J = (c, o) => new Response(JSON.stringify(o), { status: c, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const ID = /^[a-z0-9][a-z0-9-]{0,60}$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const money = n => "$" + Number(n).toLocaleString("es-CL");

const vacio = () => ({ off: [], offOpt: {}, prices: {}, descs: {}, t: 0 });
const publico = s => ({ disabledProducts: s.off, disabledOptions: s.offOpt, prices: s.prices, descs: s.descs || {}, t: s.t });

export async function handle(req, store, env) {
  if (req.method === "GET") {
    const s = (await store.get("estado", { type: "json" })) || vacio();
    return J(200, publico(s));
  }
  if (req.method !== "POST") return J(405, { ok: false, error: "Método no permitido." });
  const pinOk = env.ADMIN_PIN || env.ADMIN_KEY;
  if (!pinOk) return J(503, { ok: false, error: "Falta ADMIN_PIN en Netlify (Site configuration > Environment variables)." });
  let b; try { b = await req.json(); } catch (_) { return J(400, { ok: false, error: "Datos inválidos." }); }
  if (!b || typeof b.pin !== "string" || !same(b.pin, pinOk)) { await sleep(700); return J(401, { ok: false, error: "Clave incorrecta." }); }
  if (b.op === "login") return J(200, { ok: true });
  if (b.op === "log") return J(200, { ok: true, log: ((await store.get("log", { type: "json" })) || []).slice(0, 300) });

  const s = (await store.get("estado", { type: "json" })) || vacio();
  s.off = Array.isArray(s.off) ? s.off : []; s.offOpt = s.offOpt || {}; s.prices = s.prices || {}; s.descs = s.descs || {};
  const ids = b.op === "offMany" ? b.ids : [b.id];
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 80 || !ids.every(i => typeof i === "string" && ID.test(i))) return J(400, { ok: false, error: "Producto inválido." });
  const opt = b.opt === undefined || b.opt === null ? null : b.opt;
  if (opt !== null && !(Number.isInteger(opt) && opt >= 0 && opt <= 9)) return J(400, { ok: false, error: "Opción inválida." });
  const label = clean(b.label, 90) || ids[0];
  let text = "", from = null, to = null;

  if (b.op === "off" || b.op === "offMany") {
    const set = new Set(s.off);
    ids.forEach(i => (b.off ? set.add(i) : set.delete(i)));
    s.off = [...set];
    text = (b.off ? "Apagó " : "Encendió ") + label;
  } else if (b.op === "offOpt") {
    if (opt === null) return J(400, { ok: false, error: "Falta la opción." });
    const id = ids[0], set = new Set((s.offOpt[id] || []).map(String));
    b.off ? set.add(String(opt)) : set.delete(String(opt));
    if (set.size) s.offOpt[id] = [...set]; else delete s.offOpt[id];
    text = (b.off ? "Apagó " : "Encendió ") + label;
  } else if (b.op === "price") {
    const optsL = Array.isArray(b.opts) && b.opts.length > 0 && b.opts.length <= 6 && b.opts.every(o => Number.isInteger(o) && o >= 0 && o <= 9) ? b.opts : null;
    const keys = optsL ? optsL.map(o => ids[0] + "|" + o) : [opt === null ? ids[0] : ids[0] + "|" + opt], prev = Number.isFinite(b.from) ? b.from : null;
    if (b.price === null) { keys.forEach(k => delete s.prices[k]); text = "Restauró el precio de " + label + (prev !== null ? " (era " + money(prev) + ")" : ""); }
    else if (Number.isInteger(b.price) && b.price >= 0 && b.price <= 200000) { keys.forEach(k => { s.prices[k] = b.price; }); text = "Cambió el precio de " + label + (prev !== null ? ": " + money(prev) + " → " : ": ") + money(b.price); }
    else return J(400, { ok: false, error: "Precio inválido." });
  } else if (b.op === "desc") {
    const id = ids[0], nuevo = b.text === null ? null : clean(b.text, 400);
    if (b.text !== null && !nuevo) return J(400, { ok: false, error: "La descripción no puede quedar vacía." });
    from = clean(b.from, 400); to = nuevo;
    if (nuevo === null) { delete s.descs[id]; text = "Restauró la descripción de " + label; }
    else { s.descs[id] = nuevo; text = "Editó la descripción de " + label; }
  } else return J(400, { ok: false, error: "Operación desconocida." });

  s.t = Date.now();
  await store.setJSON("estado", s);
  const log = (await store.get("log", { type: "json" })) || [];
  const e = { t: s.t, who: clean(b.who, 30) || "Sin nombre", text };
  if (from !== null || to !== null) { e.from = from; e.to = to; }
  log.unshift(e);
  await store.setJSON("log", log.slice(0, 500));
  return J(200, { ok: true, state: publico(s) });
}

export default async (req) => handle(req, getStore({ name: "carta", consistency: "strong" }), process.env);
export const config = { path: "/api/carta" };
