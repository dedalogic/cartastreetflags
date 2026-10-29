// Recibe un pedido de la carta y lo crea en Toteat (se imprime la comanda en el local).
// SOLO MODO PRUEBA: exige PRUEBA_KEY. El token de Toteat nunca sale de este archivo.
// Variables en Netlify: TOTEAT_BASE_URL, TOTEAT_XIR, TOTEAT_XIL, TOTEAT_XIU, TOTEAT_TOKEN, PRUEBA_KEY
const CODIGOS = require("./codigos.js");
const DATA = require("./toteat-data.js"); // extras por grupo y grupos que ofrece cada producto (CSV de Toteat)
const MODIF = new Set(["e-notmeat", "e-notchicken", "e-smash", "e-chicken", "e-cheddar", "e-lettuce", "e-tomato", "e-jalapeno", "e-pickle", "e-slaw", "e-bacon", "e-crispy-onion"]);
const AUTO = { "picky-chicken": "BA.300", "picky-meat": "BA.300" }; // incluyen papas sin elegir
const norm = s => String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const SALSAS = [[/honey/, /honey/], [/street/, /street/], [/chipotle/, /chipotle/], [/chick/, /chick/], [/bbq/, /bbq/], [/cheddar/, /cheddar/], [/ranch|jalape/, /jalape/], [/alioli/, /alioli/]];
// Modificador de Toteat que corresponde a lo que eligió el cliente. Solo si el producto ofrece ese grupo y cuesta $0 (incluido en el plato).
function modificador(code, tipo, pick) {
  const grupos = DATA.grupos[code] || [], libre = g => (DATA.extras[g] || []).filter(x => x.price === 0);
  if (tipo === "side") {
    const rx = /mac/.test(norm(pick)) ? /mac/ : /papas/;
    for (const g of ["BA.060", "BA.040"]) if (grupos.includes(g)) { const m = libre(g).find(x => rx.test(norm(x.name))); if (m) return m; }
  } else if (tipo === "sauce") {
    const par = SALSAS.find(x => x[0].test(norm(pick)));
    if (par && grupos.includes("BA.070")) return libre("BA.070").find(x => par[1].test(norm(x.name))) || null;
  } else if (tipo === "auto" && grupos.includes("BA.300")) return libre("BA.300")[0] || null;
  return null;
}
const json = (code, obj) => ({ statusCode: code, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(obj) });
// Bebidas: en la carta es un solo producto con selector; en Toteat cada bebida tiene su código.
const BEBIDAS = {
  "drink-350": [[/con gas/i, "850"], [/agua/i, "1400"], [/zero/i, "1310"], [/coca/i, "1300"], [/sprite/i, "1330"], [/fanta/i, "1320"], [/durazno/i, "JD1"]],
  "drink-225": [[/zero/i, "L021"], [/coca/i, "L02"], [/sprite/i, "L023"], [/fanta/i, "L022"]],
  // Bebida Mini: Sprite Zero y Fanta Zero aún no tienen código en Toteat (van como observación)
  "drink-mini": [[/coca.*zero|zero.*coca/i, "L021"], [/coca/i, "L02"], [/sprite(?!.*zero)/i, "L023"], [/fanta(?!.*zero)/i, "L022"]]
};
const codigoBebida = (id, name) => { const t = BEBIDAS[id]; if (!t) return null; const m = t.find(x => x[0].test(String(name))); return m ? m[1] : null; };
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
  const principales = [], extrasQ = [];
  for (const l of L) {
    const qty = Number(l.qty), price = Number(l.price);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20 || !Number.isFinite(price) || price < 0 || price > 200000) return json(400, { ok: false, error: "Línea inválida: " + clean(l.name, 40) });
    const id = clean(l.id, 60), pick = clean(l.pick, 60), tipo = l.pickKind === "side" ? "side" : (l.pickKind === "sauce" ? "sauce" : "");
    const code = (typeof CODIGOS[id] === "object" ? CODIGOS[id][String(price)] : CODIGOS[id]) || codigoBebida(id, l.name) || "TOTEATDVYERROR";
    const nombre = clean(l.name, 260) + (code === "TOTEATDVYERROR" ? " [SIN CODIGO]" : "");
    if (MODIF.has(id) && code !== "TOTEATDVYERROR") { extrasQ.push({ productCode: code, quantity: qty, name: nombre, price, comment: "" }); continue; }
    const base = { productCode: code, quantity: qty, name: nombre, price, comment: code === "TOTEATDVYERROR" ? nombre : "" }, mods = [];
    const m = DATA.grupos[code] ? (tipo ? modificador(code, tipo, pick) : (AUTO[id] ? modificador(code, "auto") : null)) : null;
    if (m) mods.push({ productCode: m.code, quantity: qty, name: m.name, price: 0, comment: "" });
    else if (tipo) base.comment = (tipo === "side" ? "con " : "salsa ") + pick; // sin modificador en Toteat: va como observación
    principales.push({ base, mods, ofreceExtras: (DATA.grupos[code] || []).includes("BA.010"), plano: clean(l.name, 260) });
  }
  // los extras van justo después del último plato que los acepta (Toteat los asocia al producto anterior)
  let destino = -1; principales.forEach((p, k) => { if (p.ofreceExtras) destino = k; });
  const lineas = [], lineasPlano = [];
  principales.forEach((p, k) => { lineas.push(p.base, ...p.mods); if (k === destino) lineas.push(...extrasQ); lineasPlano.push({ ...p.base, comment: p.plano }); });
  if (destino < 0) lineas.push(...extrasQ);
  lineasPlano.push(...extrasQ);
  const delivery = b.tipo === "delivery";
  const fee = delivery ? Number(b.fee) || 0 : 0;
  if (fee < 0 || fee > 20000) return json(400, { ok: false, error: "Delivery inválido." });
  if (fee > 0) { const f = { productCode: e.TOTEAT_DELIVERY_CODE || "TOTEATDVYCOST", quantity: 1, name: "Costo Delivery", price: fee, comment: "" }; lineas.push(f); lineasPlano.push(f); }

  const ref = String(Date.now());
  const c = b.cliente || {};
  const total = lineas.reduce((a, l) => a + l.quantity * l.price, 0);
  const comentario = [
    b.prueba ? "*** PRUEBA - NO PREPARAR ***" : "", "Pedido web SF" + ref, c.telefono ? "Tel: +" + String(c.telefono).replace(/\D/g, "") : "", delivery ? "DELIVERY" : "RETIRO EN LOCAL",
    delivery ? "Direccion: " + clean(c.direccion, 160) + (c.detalle ? ", " + clean(c.detalle, 80) : "") : "",
    delivery && Number.isFinite(c.lat) && Number.isFinite(c.lon) ? "Mapa: https://www.google.com/maps?q=" + c.lat.toFixed(6) + "," + c.lon.toFixed(6) : "",
    c.nota ? "Nota: " + clean(c.nota, 200) : "", "Pago: transferencia pendiente"
  ].filter(Boolean).join(" | ").slice(0, 900);

  const hora = ahora();
  const r2 = n => Math.round(n * 100) / 100;
  const aT = arr => arr.map((l, i) => { // formato de línea según la documentación de Toteat (IVA 19% incluido en el precio)
    const despues = l.price * l.quantity, antes = r2(despues / 1.19);
    return { lineNumber: i + 1, quantity: l.quantity, comment: l.comment || "", amountBeforeTax: antes, tax: [{ name: "IVA", value: r2(despues - antes) }], amountAfterTax: despues, productCode: l.productCode, productName: l.name.replace(/ \[SIN CODIGO\]$/, ""), category: "Carta web", discount: 0 };
  });
  const lineasT = aT(lineas), lineasPlanoT = aT(lineasPlano);
  const pago = [{ id: Number(ref), ref: Number(ref.slice(-6)), amount: total, amountPaid: total, tip: 0, commission: [], paymentType: 9001, operationDate: hora, discount: [], pending: true }];
  const cliente = { name: clean(c.nombre, 80) || "Cliente web" };
  const tel = Number(String(c.telefono || "").replace(/\D/g, ""));
  if (tel > 0 && tel < 1e13) cliente.phoneNumber = tel;
  if (delivery) cliente.delivery = { address: clean(c.direccion, 160) + (c.detalle ? ", " + clean(c.detalle, 80) : ""), city: "Iquique", country: "Chile" };
  const armar = (pagos, refv, lt = lineasT) => ({
    restaurantId: Number(e.TOTEAT_XIR), localNumber: Number(e.TOTEAT_XIL), orderId: 0, orderReference: refv,
    status: "new", type: delivery ? "delivery" : "takeaway", channel: "webstore", vendorName: "Street Flags Carta Web",
    comment: comentario,
    document: { deliveryDate: hora, comment: comentario, payments: pagos, line: lt, customer: cliente, dispatcher: {} },
    operationDate: hora, modifiedDate: hora
  });
  const payload = armar(pago, ref);
  if (b.simular) return json(200, { ok: true, simulacion: true, ref, payload });

  const V = { xir: String(e.TOTEAT_XIR).trim(), xil: String(e.TOTEAT_XIL).trim(), xiu: String(e.TOTEAT_XIU).trim(), tok: String(e.TOTEAT_TOKEN).trim() };
  const diag = { xir: V.xir, xil: V.xil, xiu: V.xiu, largoToken: V.tok.length, host: e.TOTEAT_BASE_URL.replace(/^https?:\/\//, "").split("/")[0] };
  const base = e.TOTEAT_BASE_URL.trim().replace(/\/+$/, "");
  const mk = (detail) => base + "/orders?" + new URLSearchParams(Object.assign({ xir: V.xir, xil: V.xil, xiu: V.xiu, xapitoken: V.tok }, detail ? { orderDetail: "true" } : {}));
  const variantes = [
    ["con-pago-pendiente", mk(true), payload],
    ["sin-pago", mk(true), armar([], ref)],
    ["ref-numerico-sin-pago", mk(false), armar([], Number(ref))],
    ["sin-modificadores", mk(true), armar(pago, ref, lineasPlanoT)]
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
      intentos.push(nombre + ": " + String((j.msg && j.msg.texto) || j.raw || "?") + " / " + String((j.errors && j.errors[0]) || "").slice(0, 60));
      if (j && j.msg && /authoriz/i.test(String(j.msg.texto))) break; // credenciales mal: no sirve reintentar
    } catch (err) {
      intentos.push(nombre + ": " + (err && err.name === "AbortError" ? "sin respuesta a tiempo" : "sin conexión"));
    } finally { clearTimeout(t); }
  }
  return json(502, { ok: false, ref, toteat: { intentos } });
};
