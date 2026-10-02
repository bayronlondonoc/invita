---
description: Crea y publica una invitación nueva a partir de datos en lenguaje natural
argument-hint: datos de la cita (para, pregunta, plan, fecha, horarios, pista, lugar, cierre…)
---

Crea una invitación nueva de Invita con estos datos:

$ARGUMENTS

Sigue al pie de la letra el "Procedimiento para una cita nueva" de CLAUDE.md:

1. Extrae los campos. Si falta alguno obligatorio (`para`, `pregunta`, `plan_titulo`, `plan_descripcion`, `fecha`, `horarios`), pregúntamelos todos en un solo mensaje y espera. Nunca inventes datos. Los opcionales que no vengan se omiten (`de` y `whatsapp_destino` salen de `config/defaults.json`).
2. Muéstrame en una lista corta cómo quedará la cita (con la redacción ajustada: signos "¿?", tuteo, español de Colombia) y corre `node scripts/nueva-cita.mjs` con el JSON.
3. Corre `node scripts/probar.mjs <slug>`; debe terminar en "✓ Todo bien".
4. Haz commit y push a `main`.
5. Espera el deploy de GitHub Pages y verifica con curl que el link responde 200.
6. Entrégame el link final y un mensaje corto y misterioso para mandárselo por WhatsApp.
