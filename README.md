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
- Fotos que faltan: lord-rings, crispy-chicken, meat-fries, fries-corn, flaggy-box, street-box, mac-cheese, empanadas, aros-8, bubba-6.
- Fuentes de marca (Bluetea / Comicy) si se quieren usar en lugar de Lilita One.
- Confirmar precio y descripción de The Crunchy One, y el rango de delivery.
