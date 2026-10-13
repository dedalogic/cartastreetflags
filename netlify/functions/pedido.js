// Recibe un pedido de la carta y lo crea en Toteat (se imprime la comanda en el local).
// SOLO MODO PRUEBA: exige PRUEBA_KEY. El token de Toteat nunca sale de este archivo.
// Variables en Netlify: TOTEAT_BASE_URL, TOTEAT_XIR, TOTEAT_XIL, TOTEAT_XIU, TOTEAT_TOKEN, PRUEBA_KEY
const CODIGOS = require("./codigos.js");
const json = (code, obj) => ({ statusCode: code, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(obj) });
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);
const ahora = () => { // hora de Chile, formato 2026-10-12T17:30:00
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute + ":" + p.second;
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Solo POST." });
  const e = process.env;
  let b; try { b = JSON.parse(event.body || "{}"); } catch (_) { return json(400, { ok: false, error: "JSON inválido." }); }
  if (!e.PRUEBA_KEY || b.k !== e.PRUEBA_KEY) return json(401, { ok: false, error: "No autorizado. Clave en Netlify: " + (e.PRUEBA_KEY ? e.PRUEBA_KEY.length + " caracteres" : "NO EXISTE (variable vacía o sin deploy)") + ". Clave recibida: " + String(b.k || "").length + " caracteres." });
  const falta = ["TOTEAT_BASE_URL", "TOTEAT_XIR", "TOTEAT_XIL", "TOTEAT_XIU", "TOTEAT_TOKEN"].filter(k => !e[k]);
  if (falta.length) return json(500, { ok: false, error: "Faltan variables en Netlify: " + falta.join(", ") });

  // validación del pedido
  const L = Array.isArray(b.lineas) ? b.lineas : [];
  if (!L.length || L.length > 40) return json(400, { ok: false, error: "Pedido vacío o demasiado grande." });
  const lineas = [];
  for (const l of L) {
    const qty = Number(l.qty), price = Number(l.price);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20 || !Number.isFinite(price) || price < 0 || price > 200000) return json(400, { ok: false, error: "Línea inválida: " + clean(l.name, 40) });
    const id = clean(l.id, 60);
    lineas.push({ productCode: (typeof CODIGOS[id] === "object" ? CODIGOS[id][String(price)] : CODIGOS[id]) || id, quantity: qty, name: clean(l.name, 120), price });
  }
  const delivery = b.tipo === "delivery";
  const fee = delivery ? Number(b.fee) || 0 : 0;
  if (fee < 0 || fee > 20000) return json(400, { ok: false, error: "Delivery inválido." });
  if (fee > 0) lineas.push({ productCode: e.TOTEAT_DELIVERY_CODE || "TOTEATDVYCOST", quantity: 1, name: "Costo Delivery", price: fee });

  const ref = "SF" + Date.now().toString(36).toUpperCase();
  const c = b.cliente || {};
  const total = lineas.reduce((a, l) => a + l.quantity * l.price, 0);
  const comentario = [
    b.prueba ? "*** PRUEBA - NO PREPARAR ***" : "", "Pedido web " + ref, delivery ? "DELIVERY" : "RETIRO EN LOCAL",
    "Cliente: " + clean(c.nombre, 80),
    delivery ? "Direccion: " + clean(c.direccion, 160) + (c.detalle ? ", " + clean(c.detalle, 80) : "") : "",
    delivery && Number.isFinite(c.lat) && Number.isFinite(c.lon) ? "Mapa: https://www.google.com/maps?q=" + c.lat.toFixed(6) + "," + c.lon.toFixed(6) : "",
    ...lineas.map(l => l.quantity + "x " + l.name),
    c.nota ? "Nota: " + clean(c.nota, 200) : "", "Total web: $" + total, "Pago: transferencia / pendiente"
  ].filter(Boolean).join(" | ").slice(0, 900);

  const hora = ahora();
  const payload = {
    restaurantId: Number(e.TOTEAT_XIR), localNumber: Number(e.TOTEAT_XIL), orderReference: ref,
    status: "new", type: delivery ? "delivery" : "takeaway", channel: "webstore", vendorName: "Street Flags Carta Web",
    comment: comentario,
    document: { deliveryDate: hora, comment: comentario, payments: [], line: lineas },
    operationDate: hora, modifiedDate: hora
  };
  if (b.simular) return json(200, { ok: true, simulacion: true, ref, payload });

  const url = e.TOTEAT_BASE_URL.replace(/\/+$/, "") + "/orders?" + new URLSearchParams({ xir: e.TOTEAT_XIR, xil: e.TOTEAT_XIL, xiu: e.TOTEAT_XIU, xapitoken: e.TOTEAT_TOKEN, orderDetail: "true" });
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(payload), signal: ctl.signal });
    const raw = await r.text(); let j; try { j = JSON.parse(raw); } catch (_) { j = { raw: raw.slice(0, 500) }; }
    const ok = r.ok && j.ok !== false;
    console.log("pedido", ref, r.status, ok ? "OK" : JSON.stringify(j).slice(0, 500));
    return json(ok ? 200 : 502, { ok, ref, status: r.status, toteat: j });
  } catch (err) {
    return json(502, { ok: false, ref, error: err && err.name === "AbortError" ? "Toteat no respondió a tiempo." : "No se pudo conectar con Toteat." });
  } finally { clearTimeout(t); }
};
