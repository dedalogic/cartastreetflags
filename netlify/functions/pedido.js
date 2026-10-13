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
    const code = (typeof CODIGOS[id] === "object" ? CODIGOS[id][String(price)] : CODIGOS[id]) || "TOTEATDVYERROR";
    lineas.push({ productCode: code, quantity: qty, name: clean(l.name, 120) + (code === "TOTEATDVYERROR" ? " [SIN CODIGO]" : ""), price });
  }
  const delivery = b.tipo === "delivery";
  const fee = delivery ? Number(b.fee) || 0 : 0;
  if (fee < 0 || fee > 20000) return json(400, { ok: false, error: "Delivery inválido." });
  if (fee > 0) lineas.push({ productCode: e.TOTEAT_DELIVERY_CODE || "TOTEATDVYCOST", quantity: 1, name: "Costo Delivery", price: fee });

  const ref = String(Date.now());
  const c = b.cliente || {};
  const total = lineas.reduce((a, l) => a + l.quantity * l.price, 0);
  const comentario = [
    b.prueba ? "*** PRUEBA - NO PREPARAR ***" : "", "Pedido web SF" + ref, delivery ? "DELIVERY" : "RETIRO EN LOCAL",
    "Cliente: " + clean(c.nombre, 80),
    delivery ? "Direccion: " + clean(c.direccion, 160) + (c.detalle ? ", " + clean(c.detalle, 80) : "") : "",
    delivery && Number.isFinite(c.lat) && Number.isFinite(c.lon) ? "Mapa: https://www.google.com/maps?q=" + c.lat.toFixed(6) + "," + c.lon.toFixed(6) : "",
    ...lineas.map(l => l.quantity + "x " + l.name),
    c.nota ? "Nota: " + clean(c.nota, 200) : "", "Total web: $" + total, "Pago: transferencia / pendiente"
  ].filter(Boolean).join(" | ").slice(0, 900);

  const hora = ahora();
  const payload = {
    restaurantId: Number(e.TOTEAT_XIR), localNumber: Number(e.TOTEAT_XIL), orderId: 0, orderReference: ref,
    status: "new", type: delivery ? "delivery" : "takeaway", channel: "webstore", vendorName: "Street Flags Carta Web",
    comment: comentario,
    document: { deliveryDate: hora, comment: comentario, payments: [], line: lineas.map(l => ({ productCode: l.productCode, quantity: l.quantity })), customer: {}, dispatcher: {} },
    operationDate: hora, modifiedDate: hora
  };
  if (b.simular) return json(200, { ok: true, simulacion: true, ref, payload });

  const V = { xir: String(e.TOTEAT_XIR).trim(), xil: String(e.TOTEAT_XIL).trim(), xiu: String(e.TOTEAT_XIU).trim(), tok: String(e.TOTEAT_TOKEN).trim() };
  const diag = { xir: V.xir, xil: V.xil, xiu: V.xiu, largoToken: V.tok.length, host: e.TOTEAT_BASE_URL.replace(/^https?:\/\//, "").split("/")[0] };
  const base = e.TOTEAT_BASE_URL.trim().replace(/\/+$/, "");
  const mk = (detail) => base + "/orders?" + new URLSearchParams(Object.assign({ xir: V.xir, xil: V.xil, xiu: V.xiu, xapitoken: V.tok }, detail ? { orderDetail: "true" } : {}));
  const lineasT = payload.document.line;
  // Variantes de formato: se prueban en orden hasta que Toteat acepte una (un pedido fallido no crea nada).
  const variantes = [
    ["completo", mk(true), payload],
    ["numerico-sin-extras", mk(false), { ...payload, orderId: undefined, orderReference: Number(ref), document: { deliveryDate: hora, comment: comentario, payments: [], line: lineasT } }],
    ["minimo-comentario-simple", mk(false), { restaurantId: payload.restaurantId, localNumber: payload.localNumber, orderReference: Number(ref), status: "new", type: payload.type, channel: "webstore", vendorName: "SFWeb", comment: "PRUEBA NO PREPARAR", document: { deliveryDate: hora, comment: "PRUEBA", payments: [], line: lineasT, customer: {}, dispatcher: {} }, operationDate: hora, modifiedDate: hora }],
    ["ids-texto", mk(false), { restaurantId: String(payload.restaurantId), localNumber: String(payload.localNumber), orderReference: ref, status: "new", type: payload.type, channel: "webstore", vendorName: "SFWeb", comment: "PRUEBA NO PREPARAR", document: { deliveryDate: hora, comment: "PRUEBA", payments: [], line: lineasT, customer: {}, dispatcher: {} }, operationDate: hora, modifiedDate: hora }],
    ["tipo-delivery", mk(false), { restaurantId: payload.restaurantId, localNumber: payload.localNumber, orderReference: Number(ref), status: "new", type: "delivery", channel: "webstore", vendorName: "SFWeb", comment: "PRUEBA NO PREPARAR", document: { deliveryDate: hora, comment: "PRUEBA", payments: [], line: lineasT, customer: { name: clean(c.nombre, 60) || "Prueba" }, dispatcher: {} }, operationDate: hora, modifiedDate: hora }]
  ];
  const intentos = [];
  for (let n = 0; n < variantes.length; n++) {
    const [nombre, url, body] = variantes[n];
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 2000);
    try {
      if (n) await new Promise(r => setTimeout(r, 1050)); // límite de Toteat: 1 pedido por segundo
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body), signal: ctl.signal });
      const raw = await r.text(); let j; try { j = JSON.parse(raw); } catch (_) { j = { raw: raw.slice(0, 300) }; }
      const ok = r.ok && j.ok !== false;
      console.log("pedido", ref, nombre, r.status, ok ? "OK" : JSON.stringify(j).slice(0, 300));
      if (ok) return json(200, { ok: true, ref, variante: nombre, status: r.status, toteat: j });
      intentos.push({ variante: nombre, status: r.status, respuesta: j });
      if (j && j.msg && /authoriz/i.test(String(j.msg.texto))) break; // credenciales mal: no sirve reintentar
    } catch (err) {
      intentos.push({ variante: nombre, error: err && err.name === "AbortError" ? "sin respuesta a tiempo" : "sin conexión" });
    } finally { clearTimeout(t); }
  }
  return json(502, { ok: false, ref, toteat: { intentos, enviado_con: diag, payload_base: payload } });
};
