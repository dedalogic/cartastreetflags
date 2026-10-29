# Street Flags · Carta online

Carta digital de un solo archivo (`index.html`). Sin dependencias ni proceso de build.

## Publicar
- **GitHub + Netlify:** sube todos los archivos de este zip a la raíz del repositorio y conecta el repo en Netlify (sin comando de build, carpeta de publicación: raíz).
- **GitHub Pages:** sube los archivos y activa Pages sobre la rama principal.

## Archivos
- `index.html`: la carta completa (diseño, lógica y datos).
- `logo.png`, `isotipo.png` (Flaggy), `LilitaOne.woff2`: marca y tipografía de títulos.
- `*.jpg`: fotos de productos. El nombre es el id del producto (ej. `cheese-burger.jpg`).

## Qué editar
Al inicio del script de `index.html` está `CONFIG` (WhatsApp, delivery, transferencia, nombres de logo y fuente) y debajo `MENU` (categorías, productos, precios, descripciones, extras y salsas).

## Pendiente
- Fotos: ya están todas las de comida.
- Fuentes de marca (Bluetea / Comicy) si se quieren usar en lugar de Lilita One.
- Confirmar precio y descripción de The Crunchy One, y el rango de delivery.

## Delivery por zonas (Iquique)
En `index.html` (o `data.js`), busca `ZONAS_DELIVERY`, `DELIVERY_GEO` y `SECTORES_DELIVERY`.
- **Zonas automáticas:** son franjas de norte a sur entre tres calles reales (Tadeo Haenke, Ramón Pérez Opazo y Proyectada). Los puntos de cada calle vienen de OpenStreetMap. Sobre una calle exacta se cobra la zona de arriba, que es la más barata.
- **Límites exteriores provisorios (`norte`, `sur`, `este`):** norte sobre Zofri, sur unos 300 m después de La Portada y este en el borde del cerro. Confirma estos tres valores; fuera de ellos la carta dice "Dirección fuera de cobertura".
- **Casa, depto o referencia:** campo opcional bajo la dirección; va en el mensaje de WhatsApp. Si Google no reconoce un condominio, el cliente puede marcar su ubicación en el mapa.
- La dirección se busca con OpenStreetMap (Nominatim) o Google Places, y el mapa para marcar la casa usa Leaflet. Alto Hospicio se rechaza por comuna.
- Los pedidos por WhatsApp llevan el desglose, "Pago: transferencia" y un enlace a la ubicación.
- Tarifas: cambia el `precio` de cada zona en `ZONAS_DELIVERY`.

## Google Places (sugerencias al escribir la dirección)
1. En Google Cloud (console.cloud.google.com) crea un proyecto y activa **Maps JavaScript API** y **Places API (New)**. Hay que registrar una tarjeta; el uso normal de un restaurante suele quedar dentro del cupo gratuito mensual.
2. Crea una **clave API** y restríngela: en "Restricciones de aplicación" elige sitios web y agrega `streetflags.cl/*` y `*.netlify.app/*`; en "Restricciones de API" deja solo las dos APIs anteriores. Define también un límite de gasto diario en Facturación.
3. Pega la clave en `googleKey` dentro de `CONFIG` en `index.html`.
Si la clave queda vacía o Google falla, la carta usa OpenStreetMap con el botón Buscar.

## Toteat (modo prueba de pedidos)
La carpeta `netlify/functions/` tiene tres archivos: `productos.js` (lista los productos de Toteat), `pedido.js` (crea el pedido en Toteat) y `codigos.js` (código de Toteat de cada plato). El token vive solo en Netlify.
**Variables en Netlify** (Site configuration → Environment variables): `TOTEAT_BASE_URL` = `https://toteatglobal.appspot.com/mw/or/1.0`, `TOTEAT_XIR` (ID Restaurant), `TOTEAT_XIL` (ID Local), `TOTEAT_XIU` (ID usuario de la API), `TOTEAT_TOKEN`, `ADMIN_KEY` (clave para ver productos) y `PRUEBA_KEY` (clave del modo prueba). Después de cambiar variables: Deploys → Trigger deploy → Deploy site.
- **Ver productos:** `https://TU-SITIO/.netlify/functions/productos?k=ADMIN_KEY`
- **Modo prueba:** entra a `https://TU-SITIO/?prueba=PRUEBA_KEY`. Aparece una barra rosada arriba y el botón final envía el pedido a Toteat en vez de abrir WhatsApp. Con `&simular=1` solo muestra lo que se enviaría, sin enviar nada. El público no ve esto: sin la clave la carta sigue usando WhatsApp.
- El pedido va como "sin pagar" (el pago se confirma en caja). El costo de delivery va con el código `TOTEATDVYCOST`.
- Los platos sin código en `codigos.js` se envían con el id de la carta; Toteat los recibe igual como `TOTEATDVYERROR` con su nombre y precio.
- Importante: los precios los manda la carta. Antes de abrir esto al público, la función debe validar precios por su cuenta.


## v16
- Teléfono obligatorio en el checkout (va en WhatsApp y a Toteat).
- Bebidas se mapean por nombre a su código Toteat (pedido.js). Sin código: Jugo de Naranja y minis de jugo/agua.
- Extras con código: Cole Slaw (90), Pollo Crispy (300), Papas Fritas (230). Resto de extras pendientes.
- `estado.js`: consulta turno (`/.netlify/functions/estado?k=PRUEBA_KEY`).


## Zonas de delivery (v17)
Cortes por latitud fija en `DELIVERY_GEO` (data.js): Tadeo Haenke -20.23811, Pérez Opazo -20.25499, Proyectada -20.27500. Cobertura: norte -20.19378, sur -20.29526, oeste -70.16217, este -70.121148. Para ajustar una calle, cambia su latitud (menos negativo = más al norte).


## v18: modificadores de Toteat
- `toteat-data.js` se generó de los CSV de Toteat (extras y grupos). Si cambias extras en Toteat, hay que regenerarlo.
- Acompañamiento (papas / mac & cheese) y salsa incluida salen como modificadores (+Con Papas Fritas…). Extras van después del último plato que los acepta.
- Salsas incluidas con precio distinto de $0 en Toteat (Street $690, BBQ $1.290 en el grupo BA.070) van como observación, para no cobrarlas dos veces.
- Sin código: Onion Crunch, Jugo de Naranja, bebidas 225 ml de jugo/agua.

## v19 (28-oct)
- Inicio con Carta Local / Carta Online (`?modo=local` o `?modo=online` saltan el inicio).
- Carta nueva: Combos arriba (Combo Picky, Combo Familiar: precios sugeridos, por definir), hamburguesas y pollo actualizados, sin Boxes ni Corn/Meat Fries.
- Bebida Mini $990 (1 por cada burger; aviso en el carrito y tope).
- Slider de novedades arriba: sube `slide-1.jpg`, `slide-2.jpg`, `slide-3.jpg` (3:1, ej. 1500×500) y reemplazan el diseño automático. Se configuran en `SLIDES` (data.js).
- Subir también: `foto-pronto.jpg`, `banner-burger.jpg`, `netlify/functions/pedido.js` (bebida mini y combos).

## v24 (28-oct) · diseño claro
- Tema claro y tarjetas horizontales activos (en `data.js`: `tarjetas: true`, `tema: "claro"`; pon `tema: ""` para volver al oscuro).
- Inicio con imagen vertical (`home-bg.jpg`) y horizontal para PC (`home-bg-pc.jpg`).
- Popup de la bebida al entrar a Carta Local (`popup-bebida.png`).
- Ficha de producto al tocar la foto. Títulos de sección con Comicy (`Comicy.ttf`).
- Bebidas: Bebida Mini = 225 ml ($1.690); la de $990 solo con burger desde el carrito. Refill $3.990 solo en Carta Local.
- Subir: `index.html`, `Comicy.ttf`, `home-bg.jpg`, `home-bg-pc.jpg`, `popup-bebida.png`, `home-face.png`.
