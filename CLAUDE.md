# Invita

Invitaciones web interactivas para citas: un sobre que se abre, una pregunta con un botón **No** que huye y nunca se puede presionar, el plan con selección de hora y una confirmación que avisa por WhatsApp y agrega la cita al calendario.

Publicado en GitHub Pages: `https://bayronlondonoc.github.io/invita/` (repo `bayronlondonoc/invita`, rama `main`, carpeta raíz).

## Reglas del proyecto

- HTML + CSS + JavaScript puro. Sin frameworks, sin npm, sin build. Cero servicios pagos.
- Fuentes: Cormorant Garamond (títulos, itálica) y Jost (textos), desde Google Fonts.
- `assets/app.js` y `assets/styles.css` son compartidos por todas las invitaciones. Un cambio ahí afecta a todas: después de tocarlos, corre `node scripts/probar.mjs`.
- Cada invitación vive en `c/<slug>/` (`index.html` mínimo + `cita.json`). Nunca se editan a mano: se crean con `scripts/nueva-cita.mjs`.
- La raíz (`/`) y `404.html` muestran una tarjeta neutra ("Aquí no hay nada… todavía"). Nunca un listado de invitaciones.
- Todas las páginas llevan `<meta name="robots" content="noindex, nofollow">`.
- Vista previa de WhatsApp genérica e igual para todas: "Tienes una carta 💌" / "Ábrela con calma" + `og.png` (fuente en `scripts/og.html`).
- Colores solo con variables CSS; temas por clase en `<body>`: `tema-personal` (por defecto), `tema-raices`, `tema-curazaos` (valores provisionales con TODO).
- Mobile-first: casi todas se abren desde WhatsApp. Probar a 360 px.
- Textos en español de Colombia, con tuteo. Nada de "apetece" ni "coge".
- **Nunca inventes datos de una cita** (nombres, fechas, horas, lugares, números). Si falta algo obligatorio, pregúntalo.

## Datos de una cita (`cita.json`)

| Campo | Obligatorio | Notas |
|---|---|---|
| `para` | sí | Nombre como se muestra: "Para ti, {para}". El slug usa el primer nombre. |
| `pregunta` | sí | Con signos de apertura: "¿…?" |
| `plan_titulo` | sí | |
| `plan_descripcion` | sí | |
| `fecha` | sí | ISO `AAAA-MM-DD` |
| `horarios` | sí | 24 h, ej. `["18:00","19:00"]`. Se muestran en 12 h ("6:00 p. m."). |
| `de` | (default) | Sale de `config/defaults.json` si no viene. |
| `whatsapp_destino` | (default) | Celular con 57. Sale de `config/defaults.json` si no viene. |
| `duracion_horas` | no | Por defecto 3. |
| `pista`, `lugar`, `cierre` | no | Texto libre. |
| `mensaje_placeholder` | no | Pregunta que se le hace en el campo de mensaje (ej. "¿Cuál es tu lugar favorito para cenar?"). |
| `tema` | no | `personal` (defecto), `raices`, `curazaos`. |
| `frases_no` | no | Frases al esquivar el No, en orden. |
| `intentos_para_desaparecer` | no | Por defecto 7. |

## Procedimiento para una cita nueva (`/cita`)

1. **Completar datos.** Extrae los campos del mensaje. Pregunta en un solo mensaje **solo** los obligatorios que falten (`para`, `pregunta`, `plan_titulo`, `plan_descripcion`, `fecha`, `horarios`). Nunca los inventes. Si la fecha no trae año, usa el próximo año en que esa fecha aún no haya pasado y dilo. Puedes proponer redacción (signos, ortografía, tuteo) pero sin cambiar el sentido.
2. **Crear.** Escribe el JSON en el scratchpad y corre:
   `node scripts/nueva-cita.mjs <archivo.json>`
   Si el script reporta errores, corrígelos (o pregunta) y vuelve a correrlo.
3. **Probar.** `node scripts/probar.mjs <slug>` debe terminar en "✓ Todo bien".
4. **Publicar.** `git add c/<slug> && git commit -m "Nueva cita: <slug>" && git push`.
5. **Verificar el deploy.** Espera a que termine (`gh run list --repo bayronlondonoc/invita --limit 1` / `gh run watch`) y confirma con `curl -s -o /dev/null -w "%{http_code}" <link>` que responde 200 (y que `<link>cita.json` también).
6. **Entregar** el link final y un mensaje corto y misterioso para mandarlo por WhatsApp, sin revelar el plan. Ej.: "Te dejé algo. Ábrelo cuando tengas un minuto 💌".

## Comandos útiles

- Servidor local: `python3 -m http.server 8765` y abrir `http://127.0.0.1:8765/c/<slug>/`
- Pruebas headless (Chrome por CDP, sin dependencias): `node scripts/probar.mjs [slug]`
- Regenerar `og.png`: ver el comentario al inicio de `scripts/og.html`.
- Para volver a ver una invitación ya respondida en el mismo dispositivo: borrar `localStorage` (clave `invita:<slug>`).
