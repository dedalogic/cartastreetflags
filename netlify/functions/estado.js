// Diagnóstico: muestra si el turno de Toteat está abierto y si las credenciales funcionan.
// Uso: /.netlify/functions/estado?k=PRUEBA_KEY   (nunca muestra el token)
exports.handler = async (ev) => {
  const e = process.env, k = (ev.queryStringParameters || {}).k;
  const out = (c, o) => ({ statusCode: c, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(o, null, 1) });
  if (!e.PRUEBA_KEY || k !== e.PRUEBA_KEY) return out(401, { ok: false, error: "No autorizado." });
  const V = { xir: String(e.TOTEAT_XIR || "").trim(), xil: String(e.TOTEAT_XIL || "").trim(), xiu: String(e.TOTEAT_XIU || "").trim(), xapitoken: String(e.TOTEAT_TOKEN || "").trim() };
  const url = String(e.TOTEAT_BASE_URL || "").trim().replace(/\/+$/, "") + "/shiftstatus?" + new URLSearchParams(V);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch (_) { j = { raw: t.slice(0, 300) }; }
    return out(200, { http: r.status, toteat: j, enviado_con: { xir: V.xir, xil: V.xil, xiu: V.xiu, largoToken: V.xapitoken.length } });
  } catch (err) { return out(502, { ok: false, error: "No se pudo consultar Toteat." }); }
};
