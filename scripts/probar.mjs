#!/usr/bin/env node
// Prueba una invitación en Chrome headless (protocolo DevTools), sin dependencias.
//   node scripts/probar.mjs [slug]
// Simula toques reales a 390×844 y 360×740, ratón, teclado, cambio de tamaño y
// movimiento reducido. Verifica que el No nunca reciba un click, nunca salga de la
// tarjeta ni tape el Sí, y revisa el mensaje de WhatsApp, el .ics y la consola.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const slug = process.argv[2] || (await readdir(path.join(RAIZ, 'c'))).find((d) => !d.startsWith('.'));
if (!slug) { console.error('No hay invitaciones en c/'); process.exit(1); }
const cita = JSON.parse(await readFile(path.join(RAIZ, 'c', slug, 'cita.json'), 'utf8'));
const limite = cita.intentos_para_desaparecer ?? 7;

/* ---------- Servidor estático ---------- */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const servidor = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const cuerpo = await readFile(path.join(RAIZ, path.normalize(p)));
    res.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' });
    res.end(cuerpo);
  } catch {
    res.writeHead(404); res.end('404');
  }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const URL_CITA = `http://127.0.0.1:${servidor.address().port}/c/${slug}/`;

/* ---------- Chrome + CDP ---------- */
const perfil = await mkdtemp(path.join(tmpdir(), 'invita-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsNavegador = await new Promise((resolve, reject) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  setTimeout(() => reject(new Error('Chrome no arrancó')), 15000);
});
const puerto = new URL(wsNavegador).port;
const objetivo = await (await fetch(`http://127.0.0.1:${puerto}/json/new?about:blank`, { method: 'PUT' })).json();

const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pendientes = new Map();
const oyentes = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendientes.has(m.id)) {
    const { resolve, reject } = pendientes.get(m.id);
    pendientes.delete(m.id);
    m.error ? reject(new Error(`${m.error.message}`)) : resolve(m.result);
  } else if (m.method) oyentes.forEach((f) => f(m));
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  pendientes.set(n, { resolve, reject });
  ws.send(JSON.stringify({ id: n, method, params }));
});
async function ev(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`${expr}\n→ ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}

const erroresConsola = [];
let nombreDescarga = null;
oyentes.push((m) => { if (m.method === 'Browser.downloadWillBegin' || m.method === 'Page.downloadWillBegin') nombreDescarga = m.params.suggestedFilename; });
oyentes.push((m) => {
  if (m.method === 'Runtime.exceptionThrown') erroresConsola.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type)) {
    erroresConsola.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
  if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
    erroresConsola.push(`${m.params.entry.source}: ${m.params.entry.text} ${m.params.entry.url || ''}`);
  }
});
await cdp('Runtime.enable');
await cdp('Log.enable');
await cdp('Page.enable');

/* ---------- Resultados ---------- */
const fallas = [];
let chequeos = 0;
function verificar(cond, msg) {
  chequeos++;
  if (!cond) { fallas.push(msg); console.log(`  ✗ ${msg}`); }
}
const ok = (msg) => console.log(`  ✓ ${msg}`);

/* ---------- Ayudas de página ---------- */
async function esperarA(expr, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(expr).catch(() => false)) return true;
    await dormir(80);
  }
  return false;
}

async function ventana({ ancho, alto, movil }) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: movil ? 3 : 1, mobile: movil });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: movil, maxTouchPoints: movil ? 5 : 1 });
}

async function abrirLimpio() {
  await cdp('Page.navigate', { url: URL_CITA });
  await esperarA('document.readyState === "complete"');
  await ev('localStorage.clear()');
  await cdp('Page.reload', { ignoreCache: true });
  await esperarA('document.readyState === "complete" && !!document.querySelector(".pantalla.visible .sobre")');
}

const GEOMETRIA = `(() => {
  const r = (s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; };
  const si = r('.arena .btn-si');
  const enSi = si ? document.elementFromPoint(si.cx, si.cy) : null;
  return { no: r('.arena .btn-no'), si, arena: r('.arena'), tarjeta: r('.pantalla--pregunta .tarjeta'),
    frase: document.querySelector('.frase')?.textContent || '', textoNo: document.querySelector('.arena .btn-no')?.textContent,
    siArriba: !!enSi && !!enSi.closest('.btn-si'), clicksNo: window.__t?.clicksNo ?? -1 };
})()`;
const geo = () => ev(GEOMETRIA);
const dentroDe = (a, b, tol = 0.75) => a.l >= b.l - tol && a.t >= b.t - tol && a.r <= b.r + tol && a.b <= b.b + tol;
const cruzan = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

async function tocar(x, y, duracion = 70) {
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await dormir(duracion);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function tocarSelector(sel) {
  const c = await ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await dormir(120);
  await tocar(c.x, c.y);
}
async function clicRaton(x, y) {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await dormir(40);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function irAPregunta(conToque) {
  const s = await ev('(() => { const b = document.querySelector(".sobre").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()');
  if (conToque) await tocar(s.x, s.y); else await clicRaton(s.x, s.y);
  const llego = await esperarA('!!document.querySelector(".pantalla--pregunta.visible .arena.lista")', 6000);
  await dormir(700);
  await ev(`window.__t = { clicksNo: 0, clicksSi: 0 };
    document.addEventListener('click', (e) => {
      if (e.target.closest?.('.btn-no')) __t.clicksNo++;
      if (e.target.closest?.('.btn-si')) __t.clicksSi++;
    }, true); true`);
  return llego;
}

function revisarGeometria(g, etiqueta) {
  if (g.no) {
    verificar(dentroDe(g.no, g.arena), `${etiqueta}: el No se salió de la arena ${JSON.stringify(g.no)} vs ${JSON.stringify(g.arena)}`);
    verificar(dentroDe(g.no, g.tarjeta), `${etiqueta}: el No se salió de la tarjeta`);
    verificar(!cruzan(g.no, g.si), `${etiqueta}: el No tapa el Sí`);
  }
  verificar(g.siArriba, `${etiqueta}: el centro del Sí no es clickeable (algo lo tapa)`);
  verificar(dentroDe(g.si, g.tarjeta), `${etiqueta}: el Sí se salió de la tarjeta`);
  verificar(g.clicksNo === 0, `${etiqueta}: el No recibió ${g.clicksNo} click(s)`);
}

/* ---------- Escenario 1: celular, toques ---------- */
async function escenarioToques({ ancho, alto, completo }) {
  console.log(`\n▶ Celular ${ancho}×${alto} — toques`);
  await ventana({ ancho, alto, movil: true });
  await abrirLimpio();
  verificar(await irAPregunta(true), 'el toque al sobre no llevó a la pregunta');
  let g = await geo();
  revisarGeometria(g, 'inicio');
  verificar(g.arena.b - g.arena.t >= 180, `la arena mide ${g.arena.b - g.arena.t}px (< 180)`);

  const frases = cita.frases_no?.length ? cita.frases_no : [
    'Uy, casi 😏', 'Ese botón es más rápido que tú, jajaja', 'Inténtalo otra vez… él no quiere',
    'El botón ya decidió por ti', 'Jajaja, ya se está cansando de huir', 'Última oportunidad… mentira, tampoco'];

  for (let n = 1; n <= limite; n++) {
    g = await geo();
    const antes = g.no;
    // Toque directo al centro del No, y un segundo toque rápido donde estaba.
    await tocar(antes.cx, antes.cy);
    await dormir(40);
    await tocar(antes.cx, antes.cy, 40);
    // Muestras en pleno vuelo
    for (const t of [60, 150]) {
      await dormir(t === 60 ? 20 : 90);
      const m = await geo();
      if (m.no) verificar(dentroDe(m.no, m.tarjeta), `intento ${n} (vuelo ${t}ms): el No se asomó fuera de la tarjeta`);
      verificar(m.siArriba, `intento ${n} (vuelo ${t}ms): algo tapó el Sí`);
      if (n < limite && t === 60) verificar(['jaja', '😜'].includes(m.textoNo), `intento ${n}: el No no se rió (dice "${m.textoNo}")`);
    }
    await dormir(n === limite ? 700 : 400);
    g = await geo();
    revisarGeometria(g, `intento ${n}`);
    if (n < limite) {
      verificar(Math.hypot(g.no.cx - antes.cx, g.no.cy - antes.cy) > 40, `intento ${n}: el No no se movió`);
      verificar(g.frase === frases[Math.min(n, frases.length) - 1], `intento ${n}: frase "${g.frase}"`);
    } else {
      verificar(g.no === null, `intento ${n}: el No debía desaparecer`);
      verificar(g.frase === 'El No se rindió. Solo queda una opción 💛', `frase final: "${g.frase}"`);
    }
  }
  await dormir(800);
  g = await geo();
  verificar(g.textoNo === undefined, 'el No sigue en el DOM');
  verificar(Math.abs(g.si.cx - (g.arena.l + g.arena.r) / 2) < 2, 'el Sí no quedó centrado al final');
  ok(`${limite} toques al No: 0 clicks, siempre dentro, nunca encima del Sí`);

  if (!completo) return;

  // Sí → plan
  await tocarSelector('.arena .btn-si');
  verificar(await esperarA('!!document.querySelector(".pantalla--plan.visible")', 5000), 'el Sí no llevó al plan');
  verificar((await ev('__t.clicksSi')) === 1, 'el toque al Sí no generó exactamente un click (control positivo)');
  const fechaPlan = await ev('document.querySelector(".plan-fecha").textContent');
  ok(`plan: fecha "${fechaPlan}"`);
  verificar(await ev('document.querySelector(".pantalla--plan .btn-si").disabled'), 'Confirmar debería empezar deshabilitado');
  verificar((await ev('[...document.querySelectorAll(".chip span")].map(s => s.textContent).join("|")')) ===
    cita.horarios.map(h12).join('|'), 'los chips no están en formato 12 h');
  await tocarSelector('.chip span');
  verificar(!(await ev('document.querySelector(".pantalla--plan .btn-si").disabled')), 'Confirmar no se habilitó al escoger la hora');
  await tocarSelector('#mensaje');
  await cdp('Input.insertText', { text: 'Mi lugar favorito es Crepes & Waffles; ¿vale?' });
  await tocarSelector('.pantalla--plan .btn-si');
  verificar(await esperarA('!!document.querySelector(".pantalla--confirmado.visible")', 5000), 'Confirmar no llevó a la confirmación');

  // WhatsApp
  const href = await ev('document.querySelector(".btn-whatsapp").href');
  const u = new URL(href);
  const esperado = `¡Sí! 💛 Nos vemos el ${fechaES(cita.fecha)} a las ${h12(cita.horarios[0]).replace(/\.$/, '')}. Intenté decir que no ${limite} ${limite === 1 ? 'vez' : 'veces'} 😂\n\nMi lugar favorito es Crepes & Waffles; ¿vale?`;
  verificar(u.origin + u.pathname === `https://wa.me/${cita.whatsapp_destino}`, `destino de WhatsApp: ${u.origin + u.pathname}`);
  verificar(u.searchParams.get('text') === esperado, `mensaje de WhatsApp:\n${u.searchParams.get('text')}\n≠\n${esperado}`);
  console.log(`  ✓ WhatsApp → ${u.origin + u.pathname}\n    «${u.searchParams.get('text').replace(/\n/g, '⏎')}»`);

  // ICS
  const ics = await ev('__invita.generarICS()');
  const [y, m, d] = cita.fecha.split('-');
  const [hh, mm] = cita.horarios[0].split(':').map(Number);
  const fin = new Date(Date.UTC(+y, m - 1, +d, hh, mm) + (cita.duracion_horas ?? 3) * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '');
  const desplegado = ics.replace(/\r\n /g, '');
  verificar(ics.includes('\r\n') && !/[^\r]\n/.test(ics), 'el .ics no usa CRLF');
  verificar(desplegado.includes(`DTSTART;TZID=America/Bogota:${y}${m}${d}T${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}00`), 'DTSTART incorrecto');
  verificar(desplegado.includes(`DTEND;TZID=America/Bogota:${fin}`), 'DTEND incorrecto');
  verificar(desplegado.includes('TZID:America/Bogota') && desplegado.includes('TZOFFSETTO:-0500'), 'falta VTIMEZONE de Bogotá');
  if (cita.lugar) verificar(desplegado.includes(`LOCATION:${cita.lugar.replace(/([,;])/g, '\\$1')}`), 'LOCATION incorrecto');
  verificar(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'hay líneas del .ics de más de 75 octetos');
  console.log('  ✓ .ics:\n' + desplegado.split('\r\n').filter((l) => /^(DTSTART|DTEND|SUMMARY|LOCATION|DESCRIPTION)/.test(l)).map((l) => `      ${l}`).join('\n'));

  // Descarga real del .ics
  const carpetaDescargas = await mkdtemp(path.join(tmpdir(), 'invita-ics-'));
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: carpetaDescargas, eventsEnabled: true }).catch(() => null);
  await tocarSelector('.pantalla--confirmado .btn-borde');
  await dormir(1200);
  const archivos = await readdir(carpetaDescargas);
  verificar(archivos.some((f) => f.endsWith('.ics')), `no se descargó el .ics (${archivos.join(', ') || 'vacío'})`);
  if (archivos[0]) ok(`descargado: ${nombreDescarga || archivos[0]}`);
  await rm(carpetaDescargas, { recursive: true, force: true });

  const google = await ev('document.querySelector(".enlace").href');
  verificar(google.includes('ctz=America%2FBogota') && google.includes(`dates=${y}${m}${d}T`), 'enlace de Google Calendar incorrecto');

  // Reabrir: debe ir directo a la confirmación
  await cdp('Page.reload', {});
  verificar(await esperarA('!!document.querySelector(".pantalla--confirmado.visible")', 5000), 'al reabrir no mostró la confirmación');
  verificar(!(await ev('!!document.querySelector(".sobre")')), 'al reabrir mostró el sobre');
  ok('al reabrir el link muestra directamente la confirmación');
}

/* ---------- Escenario 2: escritorio, ratón y teclado ---------- */
async function escenarioRaton() {
  console.log('\n▶ Escritorio 1280×800 — ratón y teclado');
  await ventana({ ancho: 1280, alto: 800, movil: false });
  await abrirLimpio();
  verificar(await irAPregunta(false), 'el click al sobre no llevó a la pregunta');

  // Acercarse lentamente desde la izquierda hacia el No
  let g = await geo();
  const objetivoNo = { x: g.no.cx, y: g.no.cy };
  let minDist = Infinity;
  for (let i = 0; i <= 30; i++) {
    const x = 40 + (objetivoNo.x - 40) * (i / 30);
    const y = objetivoNo.y;
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await dormir(25);
    const m = await geo();
    if (m.no) minDist = Math.min(minDist, Math.hypot(m.no.cx - x, m.no.cy - y));
  }
  await dormir(400);
  g = await geo();
  verificar(g.frase !== '', 'acercar el ratón no hizo huir al No');
  ok(`al acercar el ratón el No huye (frase: "${g.frase}")`);
  revisarGeometria(g, 'ratón');

  // Teletransportar el ratón encima y hacer click
  await dormir(350);
  g = await geo();
  if (g.no) {
    await clicRaton(g.no.cx, g.no.cy);
    await dormir(450);
    revisarGeometria(await geo(), 'click directo con ratón');
    ok('click directo con ratón sobre el No: 0 clicks');
  }

  // Teclado: Tab desde el Sí llega al No → huye y el foco vuelve al Sí
  g = await geo();
  if (g.no) {
    await dormir(350);
    await ev('document.querySelector(".arena .btn-si").focus(); true');
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await dormir(250);
    const foco = await ev('document.activeElement.className');
    verificar(!foco.includes('btn-no'), `el No se quedó con el foco (${foco})`);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await dormir(300);
    g = await geo();
    revisarGeometria(g, 'teclado');
    ok(`Tab al No: huye y el foco vuelve al Sí (${foco})`);
  }
}

/* ---------- Escenario 3: cambio de tamaño ---------- */
async function escenarioTamano() {
  console.log('\n▶ Cambio de tamaño 390 → 320 → 390 (rotación)');
  await ventana({ ancho: 390, alto: 844, movil: true });
  await abrirLimpio();
  await irAPregunta(true);
  for (let i = 0; i < 2; i++) {
    const g = await geo();
    await tocar(g.no.cx, g.no.cy);
    await dormir(450);
  }
  for (const [w, hgt] of [[320, 640], [844, 390], [390, 844]]) {
    await ventana({ ancho: w, alto: hgt, movil: true });
    await dormir(500);
    revisarGeometria(await geo(), `ventana ${w}×${hgt}`);
  }
  ok('tras cambiar de tamaño el No sigue dentro y lejos del Sí');
}

/* ---------- Escenario 4: movimiento reducido ---------- */
async function escenarioReducido() {
  console.log('\n▶ prefers-reduced-motion: reduce');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await ventana({ ancho: 390, alto: 844, movil: true });
  await abrirLimpio();
  verificar(await irAPregunta(true), 'con movimiento reducido no abrió');
  const transicion = await ev('getComputedStyle(document.querySelector(".arena .btn-no")).transitionProperty');
  verificar(!transicion.includes('transform') && transicion !== 'all', `con movimiento reducido el No aún anima transform (${transicion})`);
  for (let i = 0; i < 3; i++) {
    const g = await geo();
    await tocar(g.no.cx, g.no.cy);
    await dormir(400);
    revisarGeometria(await geo(), `reducido ${i + 1}`);
  }
  ok('sin rebotes, solo fades; 0 clicks');
  await cdp('Emulation.setEmulatedMedia', { features: [] });
}

/* ---------- Escenario 5: ráfaga de toques (dedo nervioso) ---------- */
async function escenarioRafaga() {
  console.log('\n▶ Ráfaga: 40 toques rápidos donde esté el No (360×740)');
  await ventana({ ancho: 360, alto: 740, movil: true });
  await abrirLimpio();
  await irAPregunta(true);
  for (let i = 0; i < 40; i++) {
    const g = await geo();
    if (!g.no) break;
    await tocar(g.no.cx, g.no.cy, 30);
    await dormir(60 + Math.random() * 200);
    const m = await geo();
    verificar(m.clicksNo === 0, `ráfaga ${i}: click en el No`);
    verificar(m.siArriba, `ráfaga ${i}: algo tapa el Sí`);
    if (m.no) verificar(dentroDe(m.no, m.tarjeta), `ráfaga ${i}: el No fuera de la tarjeta`);
  }
  await dormir(800);
  revisarGeometria(await geo(), 'tras la ráfaga');
  ok('ráfaga sin un solo click en el No');
}

function fechaES(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .formatToParts(new Date(Date.UTC(y, m - 1, d, 12))).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} de ${p.month}`;
}
function h12(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`;
}

/* ---------- Ejecutar ---------- */
console.log(`Probando ${URL_CITA}  (No desaparece a los ${limite} intentos)`);
try {
  await escenarioToques({ ancho: 390, alto: 844, completo: true });
  await escenarioToques({ ancho: 360, alto: 740, completo: false });
  await escenarioRaton();
  await escenarioTamano();
  await escenarioReducido();
  await escenarioRafaga();
  // Raíz neutra
  await cdp('Page.navigate', { url: URL_CITA.replace(/c\/.*$/, '') });
  await esperarA('document.readyState === "complete"');
  verificar((await ev('document.body.innerText')).includes('Aquí no hay nada… todavía'), 'la raíz no muestra la tarjeta neutra');
  verificar(await ev('document.querySelector(\'meta[name="robots"]\')?.content === "noindex, nofollow"'), 'la raíz no tiene noindex');
} catch (e) {
  fallas.push(`Excepción: ${e.message}`);
  console.error(e);
}

console.log('\n▶ Consola');
verificar(erroresConsola.length === 0, `errores/avisos de consola:\n    ${erroresConsola.join('\n    ')}`);
if (!erroresConsola.length) ok('sin errores ni avisos de consola');

ws.close();
chrome.kill();
servidor.close();
await rm(perfil, { recursive: true, force: true }).catch(() => null);

console.log(`\n${fallas.length ? `✗ ${fallas.length} falla(s)` : '✓ Todo bien'} — ${chequeos} chequeos`);
process.exit(fallas.length ? 1 : 0);
