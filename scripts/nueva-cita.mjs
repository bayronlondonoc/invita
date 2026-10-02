#!/usr/bin/env node
// Crea una invitación nueva en c/<slug>/ a partir de un JSON. Sin dependencias.
//
//   node scripts/nueva-cita.mjs datos.json
//   echo '{"para": "...", ...}' | node scripts/nueva-cita.mjs
//
// Valida los campos, completa "de" y "whatsapp_destino" desde config/defaults.json,
// genera el slug (nombre + 4 caracteres) y escribe c/<slug>/index.html y cita.json.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMAS = ['personal', 'raices', 'curazaos'];
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';   // sin 0/o/1/l/i para que no se confundan

// Orden en que se escribe cita.json.
const CAMPOS = [
  'para', 'de', 'pregunta', 'plan_titulo', 'plan_descripcion', 'fecha', 'horarios', 'duracion_horas',
  'pista', 'lugar', 'cierre', 'mensaje_placeholder', 'whatsapp_destino', 'tema', 'frases_no',
  'intentos_para_desaparecer',
];
const OBLIGATORIOS = ['para', 'de', 'pregunta', 'plan_titulo', 'plan_descripcion', 'fecha', 'horarios', 'whatsapp_destino'];
const TEXTOS_OPCIONALES = ['pista', 'lugar', 'cierre', 'mensaje_placeholder'];

const slugificar = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function leerEntrada() {
  const archivo = process.argv[2];
  if (archivo && archivo !== '-') return readFile(path.resolve(archivo), 'utf8');
  if (process.stdin.isTTY) {
    console.error('Uso: node scripts/nueva-cita.mjs datos.json   (o pasa el JSON por stdin)');
    process.exit(2);
  }
  let texto = '';
  for await (const trozo of process.stdin) texto += trozo;
  return texto;
}

function validar(entrada, defaults) {
  const errores = [];
  const avisos = [];
  const c = {};

  for (const k of Object.keys(entrada)) {
    if (!CAMPOS.includes(k)) errores.push(`Campo desconocido: "${k}"`);
  }

  const texto = (v) => (typeof v === 'string' ? v.trim() : v);
  for (const k of CAMPOS) {
    const v = texto(entrada[k]);
    if (v !== undefined && v !== null && v !== '') c[k] = v;
  }
  c.de ??= defaults.de;
  c.whatsapp_destino ??= defaults.whatsapp_destino;

  for (const k of OBLIGATORIOS) {
    if (c[k] === undefined) errores.push(`Falta el campo obligatorio "${k}"`);
  }
  for (const k of ['para', 'de', 'pregunta', 'plan_titulo', 'plan_descripcion', ...TEXTOS_OPCIONALES]) {
    if (c[k] !== undefined && typeof c[k] !== 'string') errores.push(`"${k}" debe ser texto`);
  }

  if (c.fecha !== undefined) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.fecha);
    const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (!m || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
      errores.push(`"fecha" debe ser una fecha ISO válida (AAAA-MM-DD), llegó "${c.fecha}"`);
    } else {
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      if (c.fecha < hoy) avisos.push(`La fecha ${c.fecha} ya pasó.`);
    }
  }

  if (c.horarios !== undefined) {
    if (!Array.isArray(c.horarios) || c.horarios.length === 0) {
      errores.push('"horarios" debe ser una lista con al menos una hora, ej. ["18:00","19:00"]');
    } else {
      const malas = c.horarios.filter((x) => typeof x !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x));
      if (malas.length) errores.push(`Horarios inválidos (usa HH:MM en 24 h): ${JSON.stringify(malas)}`);
      else c.horarios = [...new Set(c.horarios)].sort();
    }
  }

  if (c.whatsapp_destino !== undefined) {
    let n = String(c.whatsapp_destino).replace(/\D/g, '');
    if (/^3\d{9}$/.test(n)) n = `57${n}`;
    if (!/^57\d{10}$/.test(n)) errores.push(`"whatsapp_destino" debe ser un celular colombiano con 57 (12 dígitos), llegó "${c.whatsapp_destino}"`);
    else c.whatsapp_destino = n;
  }

  c.duracion_horas ??= 3;
  if (typeof c.duracion_horas !== 'number' || !(c.duracion_horas > 0 && c.duracion_horas <= 24)) {
    errores.push('"duracion_horas" debe ser un número entre 0 y 24');
  }

  c.tema ??= 'personal';
  if (!TEMAS.includes(c.tema)) errores.push(`"tema" debe ser uno de: ${TEMAS.join(', ')}`);

  if (c.frases_no !== undefined) {
    if (!Array.isArray(c.frases_no) || !c.frases_no.length || c.frases_no.some((f) => typeof f !== 'string' || !f.trim())) {
      errores.push('"frases_no" debe ser una lista de frases (texto)');
    }
  }

  c.intentos_para_desaparecer ??= 7;
  if (!Number.isInteger(c.intentos_para_desaparecer) || c.intentos_para_desaparecer < 1 || c.intentos_para_desaparecer > 20) {
    errores.push('"intentos_para_desaparecer" debe ser un entero entre 1 y 20');
  }

  if (c.mensaje_placeholder && c.mensaje_placeholder.length > 80) avisos.push('"mensaje_placeholder" es largo; mejor una pregunta corta.');

  const ordenado = Object.fromEntries(CAMPOS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));
  return { cita: ordenado, errores, avisos };
}

function generarSlug(para) {
  const base = slugificar(para.split(/\s+/)[0]) || 'cita';
  for (;;) {
    let sufijo = '';
    for (let i = 0; i < 4; i++) sufijo += ALFABETO[randomInt(ALFABETO.length)];
    const slug = `${base}-${sufijo}`;
    if (!existsSync(path.join(RAIZ, 'c', slug))) return slug;
  }
}

function plantilla(baseUrl, tema) {
  return `<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <title>Tienes una carta 💌</title>
  <meta name="description" content="Ábrela con calma">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Tienes una carta 💌">
  <meta property="og:description" content="Ábrela con calma">
  <meta property="og:image" content="${baseUrl}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Un sobre cerrado con sello de lacre">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#E7DACA">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E💌%3C/text%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,400;1,500;1,600&family=Jost:wght@300;400;500&display=swap">
  <link rel="stylesheet" href="../../assets/styles.css">
  <script src="../../assets/app.js" defer></script>
</head>
<body class="tema-${tema}">
  <main id="app" class="escena"></main>
  <noscript><p style="text-align:center;padding:2rem">Para abrir esta carta necesitas activar JavaScript.</p></noscript>
</body>
</html>
`;
}

const defaults = JSON.parse(await readFile(path.join(RAIZ, 'config', 'defaults.json'), 'utf8'));
let entrada;
try {
  entrada = JSON.parse(await leerEntrada());
} catch (e) {
  console.error(`✗ El JSON no es válido: ${e.message}`);
  process.exit(1);
}
if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
  console.error('✗ Se esperaba un objeto JSON con los datos de la cita.');
  process.exit(1);
}

const { cita, errores, avisos } = validar(entrada, defaults);
for (const a of avisos) console.error(`⚠ ${a}`);
if (errores.length) {
  console.error(`✗ No se creó la cita:\n${errores.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}

const slug = generarSlug(cita.para);
const carpeta = path.join(RAIZ, 'c', slug);
await mkdir(carpeta, { recursive: true });
await writeFile(path.join(carpeta, 'cita.json'), `${JSON.stringify(cita, null, 2)}\n`);
await writeFile(path.join(carpeta, 'index.html'), plantilla(defaults.base_url.replace(/\/+$/, ''), cita.tema));

console.log(`✓ Cita creada en c/${slug}/`);
console.log(`  Link: ${defaults.base_url.replace(/\/+$/, '')}/c/${slug}/`);
