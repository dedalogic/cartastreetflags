// Lista los productos de Toteat (id, nombre, precio, categoría, extras) para mapear la carta.
// Solo lectura. Protegida con ADMIN_KEY. El token de Toteat nunca sale de este archivo.
// Variables en Netlify: TOTEAT_BASE_URL, TOTEAT_XIR, TOTEAT_XIL, TOTEAT_XIU, TOTEAT_TOKEN, ADMIN_KEY
const txt = (code, body) => ({ statusCode: code, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }, body });

exports.handler = async (event) => {
  const e = process.env, q = event.queryStringParameters || {};
  if (!e.ADMIN_KEY || q.k !== e.ADMIN_KEY) return txt(401, "No autorizado. Agrega ?k=TU_ADMIN_KEY al final de la dirección.");
  const falta = ["TOTEAT_BASE_URL", "TOTEAT_XIR", "TOTEAT_XIL", "TOTEAT_XIU", "TOTEAT_TOKEN"].filter(k => !e[k]);
  if (falta.length) return txt(500, "Faltan variables en Netlify: " + falta.join(", "));
  const url = e.TOTEAT_BASE_URL.replace(/\/+$/, "") + "/products?" + new URLSearchParams({
    xir: e.TOTEAT_XIR, xil: e.TOTEAT_XIL, xiu: e.TOTEAT_XIU, xapitoken: e.TOTEAT_TOKEN, activeProducts: q.todos === "1" ? "false" : "true"
  });
  try {
    const r = await fetch(url), raw = await r.text();
    if (!r.ok) return txt(502, "Toteat respondió " + r.status + ": " + raw.slice(0, 400));
    let j; try { j = JSON.parse(raw); } catch (_) { return txt(502, "Respuesta no válida de Toteat: " + raw.slice(0, 300)); }
    if (!j.ok) return txt(502, "Toteat dice: " + JSON.stringify(j.msg || j).slice(0, 400));
    const L = (j.data || []).slice().sort((a, b) => String(a.sorting || "").localeCompare(String(b.sorting || "")));
    const fila = p => [p.id, p.localCode || "", p.name, p.price, p.category || "", p.isModifier ? "EXTRA" : "", (p.modifiers || []).map(m => m.name).join(" / ")].join(" | ");
    return txt(200, "id | código local | nombre | precio | categoría | tipo | categorías de extras\n" + L.map(fila).join("\n") + "\n\nTotal: " + L.length);
  } catch (err) { return txt(502, "No se pudo conectar con Toteat: " + (err && err.message)); }
};
