#!/usr/bin/env node
// Recorre una Florece completa en Chrome headless (micrófono simulado) y toma capturas.
//   node scripts/probar-florece.mjs tulipan [carpeta-capturas] [ancho alto]
// Usa privado/<nombre>/clave.txt, sirve el sitio localmente y entra con ?rapido.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const [nombre = 'tulipan', salida = path.join(tmpdir(), 'florece-capturas'), ancho = '820', alto = '1180'] = process.argv.slice(2);
const clave = (await readFile(path.join(RAIZ, 'privado', nombre, 'clave.txt'), 'utf8')).trim();
await mkdir(salida, { recursive: true });

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.enc': 'application/octet-stream', '.png': 'image/png' };
const servidor = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const cuerpo = await readFile(path.join(RAIZ, path.normalize(p)));
    res.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' });
    res.end(cuerpo);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const URL_F = `http://127.0.0.1:${servidor.address().port}/f/${nombre}/?rapido#${clave}`;

const perfil = await mkdtemp(path.join(tmpdir(), 'florece-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`,
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((ok, mal) => {
  let b = '';
  chrome.stderr.on('data', (d) => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) ok(m[1]); });
  setTimeout(() => mal(new Error('Chrome no arrancó')), 15000);
});
const objetivo = await (await fetch(`http://127.0.0.1:${new URL(wsUrl).port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pend = new Map();
const errores = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.mal(new Error(m.error.message)) : p.ok(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) errores.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errores.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
});
const cdp = (method, params = {}) => new Promise((ok, mal) => { const n = ++id; pend.set(n, { ok, mal }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const esperarA = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return true; await dormir(100); } return false; };

await cdp('Runtime.enable');
await cdp('Log.enable');
await cdp('Page.enable');
await cdp('Browser.grantPermissions', { permissions: ['audioCapture'] }).catch(() => null);
await cdp('Emulation.setDeviceMetricsOverride', { width: Number(ancho), height: Number(alto), deviceScaleFactor: 1, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const fallas = [];
const verificar = (c, m) => { if (!c) { fallas.push(m); console.log(`  ✗ ${m}`); } };
let nCaptura = 0;
async function captura(nombreCap) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true });
  const f = path.join(salida, `${String(++nCaptura).padStart(2, '0')}-${nombreCap}.jpg`);
  await writeFile(f, Buffer.from(data, 'base64'));
}
async function tocar(sel) {
  const c = await ev(`(() => { const n = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.offsetParent !== null && !x.disabled); if (!n) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (!c) throw new Error(`No encontré ${sel}`);
  await dormir(150);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
  await dormir(60);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function mantener(sel, ms) {
  const c = await ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
  await dormir(ms);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const paso = () => ev('window.__florece?.pasos[window.__florece.estado().paso]');
const visible = (sel) => `!!document.querySelector('.pantalla.visible ${sel}')`;
async function seguir() {
  await esperarA(`[...document.querySelectorAll('.pantalla.visible .btn')].some((b) => /Seguir|Entrar|quedó|Ya lo tengo/.test(b.textContent) && b.offsetParent)`, 15000);
  const antes = await paso();
  await tocar('.pantalla.visible .btn:not([hidden])');
  await esperarA(`window.__florece.pasos[window.__florece.estado().paso] !== ${JSON.stringify(antes)}`, 5000);
  await esperarA(`document.querySelectorAll('.pantalla').length === 1 && !!document.querySelector('.pantalla.visible')`, 5000);
  await dormir(400);
}

try {
  await cdp('Page.navigate', { url: URL_F });
  await esperarA('document.readyState === "complete"');
  await ev('localStorage.clear()');
  await cdp('Page.reload', {});
  verificar(await esperarA(visible('.titulo--grande'), 8000), 'no descifró / no mostró la portada');
  await dormir(800);
  await captura('portada');
  await seguir();                                             // → bosque
  await tocar('.pantalla.visible .btn');                      // Despertar (mic simulado)
  await dormir(1500);
  const conMic = await esperarA(`!document.querySelector('.pantalla.visible .btn-presionar').hidden`, 4000);
  verificar(conMic, 'no apareció el estado de escucha');
  await captura('bosque-cantando');
  if (!(await esperarA('document.body.classList.contains("despierto")', 4000))) {
    await mantener('.btn-presionar', 2500);                  // respaldo: mantener presionado
  }
  verificar(await esperarA('document.body.classList.contains("despierto")', 4000), 'el bosque no despertó');
  await dormir(600);
  await captura('bosque-despierto');
  await seguir();                                             // → espera 0
  await captura('espera');
  await dormir(3300);
  await captura('espera-florecida');
  await seguir();                                             // → pregunta 0
  await tocar('.pantalla.visible .opcion');                   // la primera es incorrecta
  await dormir(300);
  verificar(await ev(`!!document.querySelector('.opcion--mal')`), 'la opción incorrecta no reaccionó');
  await ev(`[...document.querySelectorAll('.opcion')].find((b) => /Cattleya/.test(b.textContent)).scrollIntoView()`);
  await tocar('.pantalla.visible .opcion:nth-child(2)');
  await dormir(300);
  await captura('pregunta');
  await seguir();                                             // → espera 1
  await dormir(3300);
  await seguir();                                             // → soplar
  await captura('velas');
  await tocar('.pantalla.visible .btn');                      // "Ya pedí mi deseo"
  await dormir(1200);
  if (!(await ev(`!!document.querySelector('.apagadas')`))) await mantener('.btn-presionar', 900);
  verificar(await esperarA(`!!document.querySelector('.flor.abierta')`, 4000), 'la orquídea no floreció');
  await dormir(2600);
  await captura('florecida');
  await seguir();                                             // → pétalos
  for (let i = 0; i < 5; i++) {
    const c = await ev(`(() => { const p = document.querySelector('.pieza[data-recuerdo="${i}"] .pieza__forma'); const b = p.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    await ev(`document.querySelector('.pieza[data-recuerdo="${i}"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    await dormir(500);
    if (i === 0) await captura('recuerdo');
    verificar(await ev(`!!document.querySelector('.modal img')?.complete`), `el recuerdo ${i} no mostró foto`);
    await tocar('.modal .btn');
    await dormir(450);
    void c;
  }
  await captura('petalos');
  await seguir();                                             // → espera 2
  await dormir(3300);
  await seguir();                                             // → pintar
  const lienzo = await ev(`(() => { const b = document.querySelector('.lienzo__canvas').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width }; })()`);
  for (const [ci, puntos] of [[0, [[.42, .3], [.3, .38], [.24, .44]]], [2, [[.58, .3], [.7, .38], [.76, .44]]], [7, [[.3, .9], [.45, .93], [.6, .9]]]]) {
    await ev(`document.querySelectorAll('.color')[${ci}].click()`);
    const pts = puntos.map(([x, y]) => ({ x: lienzo.l + x * lienzo.w, y: lienzo.t + y * lienzo.w }));
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
    for (let k = 1; k < pts.length; k++) {
      for (let s = 1; s <= 8; s++) {
        const x = pts[k - 1].x + (pts[k].x - pts[k - 1].x) * s / 8;
        const y = pts[k - 1].y + (pts[k].y - pts[k - 1].y) * s / 8;
        await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      }
    }
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await dormir(300);
  verificar(await ev(`!!localStorage.getItem('florece:${nombre}:pintura')`), 'la pintura no se guardó');
  await captura('pintar');
  await seguir();                                             // → pregunta 1
  await tocar('.pantalla.visible .opcion:nth-child(3)');
  await seguir();                                             // → espera 3
  await dormir(3300);
  await seguir();                                             // → menú
  await tocar('.antojo:nth-child(1)');
  await tocar('.antojo:nth-child(4)');
  await captura('menu');
  await tocar('.pantalla.visible .btn');                      // Armar mi plato
  await esperarA(visible('.arena-mini.lista'), 4000);
  await dormir(500);
  let clicsSi = 0;
  await ev(`window.__si = 0; document.querySelector('.btn-huye').addEventListener('click', () => window.__si++, true); true`);
  for (let i = 0; i < 4; i++) {
    const c = await ev(`(() => { const n = document.querySelector('.btn-huye'); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!c) break;
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c] });
    await dormir(50);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await dormir(600);
  }
  clicsSi = await ev('window.__si');
  verificar(clicsSi === 0, `el "Sí" saludable recibió ${clicsSi} clicks`);
  verificar(!(await ev(`!!document.querySelector('.btn-huye')`)), 'la ensalada no se fue');
  await captura('saludable');
  await tocar('.arena-mini .btn:not(.btn-huye)');             // No, gracias
  await esperarA(visible('.plato'), 4000);
  await captura('plato');
  await seguir();                                             // → bolsillo
  await dormir(700);
  await seguir();                                             // → pregunta 2
  await tocar('.pantalla.visible .opcion:nth-child(3)');
  await seguir();                                             // → carta
  await dormir(1200);
  await captura('carta-escribiendo');
  await tocar('.pantalla.visible .hoja');                     // saltar animación
  await esperarA(`!document.querySelector('.pantalla.visible .btn').hidden`, 8000);
  await dormir(900);
  await captura('carta');
  await seguir();                                             // → final
  verificar(await esperarA(`!!document.querySelector('.lamina')?.src`, 8000), 'no se generó la lámina');
  await dormir(1200);
  await captura('final');
  // Canción: propia (cifrada, se reproduce aquí) o enlace a YouTube.
  const propia = await ev(`!!document.querySelector('.reproductor')`);
  let cancion = '';
  if (propia) {
    verificar(await esperarA(`document.querySelector('.reproductor').src.startsWith('blob:')`, 15000), 'la canción cifrada no se descifró');
    await tocar('.ultima-mision .btn');
    await dormir(1500);
    const sonando = await ev(`(() => { const a = document.querySelector('.reproductor'); return { t: a.currentTime, pausada: a.paused, dur: a.duration }; })()`);
    verificar(!sonando.pausada && sonando.t > 0, `la canción no suena: ${JSON.stringify(sonando)}`);
    cancion = `propia, ${Math.round(sonando.dur)} s, sonando en ${sonando.t.toFixed(1)} s`;
  } else {
    cancion = await ev(`document.querySelector('.ultima-mision a.btn')?.href || ''`);
    verificar(cancion.includes('youtube.com/watch'), `botón de la canción: ${cancion}`);
  }
  verificar(await ev(`/descalza/.test(document.querySelector('.ultima-mision').textContent)`), 'falta la última misión');
  verificar(await ev(`!document.querySelector('a[href*="whatsapp"]')`), 'todavía hay un botón de WhatsApp');
  verificar(await ev(`!!document.querySelector('.acciones .btn-claro') && /Imprimir/.test(document.querySelector('.acciones').textContent)`), 'falta el botón de imprimir');
  console.log(`  Canción: ${cancion}`);
  // Reanudar tras recargar
  await cdp('Page.reload', {});
  verificar(await esperarA(visible('.lamina'), 8000), 'al recargar no volvió al final');
  // Sin clave
  await cdp('Page.navigate', { url: URL_F.replace(/#.*$/, '') });
  await esperarA('document.readyState === "complete"');
  verificar(await esperarA(`/cerrado/.test(document.body.innerText)`, 4000), 'sin clave no mostró el aviso');
} catch (e) {
  fallas.push(`Excepción: ${e.message}`);
  console.error(e);
}

verificar(errores.length === 0, `consola:\n    ${errores.join('\n    ')}`);
ws.close();
chrome.kill();
servidor.close();
await rm(perfil, { recursive: true, force: true }).catch(() => null);
console.log(`\nCapturas en ${salida}`);
console.log(fallas.length ? `✗ ${fallas.length} falla(s)` : '✓ Recorrido completo sin fallas');
process.exit(fallas.length ? 1 : 0);
