/* Carta — una sola página, sin scroll: CARTEL → SOBRE → MESA (+ VISOR) → FINAL. */

/* Las hojas, en orden. Cada una vive en hojas/<nombre> (2400 px) y hojas/mini/<nombre> (900 px).
   Para agregar o quitar hojas: corre scripts/convertir.py y deja aquí sus nombres. */
const HOJAS = [
  'hoja-01.webp',
  'hoja-02.webp',
  'hoja-03.webp',
];

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducido = () => movimientoReducido.matches;
  const esperar = (ms) => new Promise((r) => setTimeout(r, reducido() ? Math.min(ms, 400) : ms));
  const N = HOJAS.length;
  const grande = (i) => `hojas/${HOJAS[i]}`;
  const mini = (i) => `hojas/mini/${HOJAS[i]}`;
  const GIROS = [-2.2, 1.6, -1.1, 2.4, -1.7, 1.1, -2.6, 1.9];   // cada hoja, levemente torcida como papel real

  /* ---------- Vistas ---------- */

  let vistaActual = null;
  async function mostrarVista(id) {
    const nueva = $(id);
    if (vistaActual) {
      const vieja = vistaActual;
      vieja.classList.remove('visible');
      await esperar(900);
      vieja.hidden = true;
    }
    nueva.hidden = false;
    vistaActual = nueva;
    void nueva.offsetWidth;
    nueva.classList.add('visible');
  }

  /* ---------- 1. Cartel ---------- */

  $('entregarme').addEventListener('click', async () => {
    $('entregarme').disabled = true;
    $('cartel').classList.add('cae');
    await esperar(1250);
    await mostrarVista('v-sobre');
    $('lacre').focus({ preventScroll: true });
  });

  /* ---------- 2. Sobre ---------- */

  $('lacre').addEventListener('click', async () => {
    const lacre = $('lacre');
    if (lacre.classList.contains('roto')) return;
    lacre.classList.add('roto');
    $('sobre').classList.add('abierto');
    $('v-sobre').classList.add('abriendo');
    await esperar(2700);
    $('sobre').classList.add('se-va');
    await esperar(500);
    await abrirMesa(true);
  });

  /* ---------- 3. Mesa ---------- */

  let actual = 0;
  let vioUltima = false;
  const contenedor = $('hojas');
  const hojas = HOJAS.map((nombre, i) => {
    const img = new Image();
    img.alt = `Hoja ${i + 1} de la carta`;
    img.decoding = 'async';
    img.src = mini(i);
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'hoja';
    boton.style.setProperty('--giro', `${GIROS[i % GIROS.length]}deg`);
    boton.append(img);
    img.addEventListener('load', () => boton.style.setProperty('--proporcion', `${img.naturalWidth} / ${img.naturalHeight}`), { once: true });
    contenedor.append(boton);
    return boton;
  });

  if (!N) {
    contenedor.innerHTML = '<p class="mesa__vacia">Las hojas vienen en camino.</p>';
    $('ayuda').hidden = true;
    document.querySelector('.mesa__pie').hidden = true;
  }

  function acomodarMesa() {
    const ancho = hojas[0]?.offsetWidth || 0;
    hojas.forEach((h, i) => {
      const d = i - actual;
      const a = Math.abs(d);
      h.style.setProperty('--x', `${d * ancho * 0.84}px`);
      h.style.setProperty('--escala', a === 0 ? 1 : 0.86);
      h.style.zIndex = String(20 - a);
      h.classList.toggle('lado', a === 1);
      h.classList.toggle('lejos', a > 1);
      h.tabIndex = a === 0 ? 0 : -1;
      h.setAttribute('aria-label', `Hoja ${i + 1} de ${N}. Abrir`);
      h.setAttribute('aria-hidden', a === 0 ? 'false' : 'true');
    });
    $('indicador').textContent = N ? `Hoja ${actual + 1} de ${N}` : '';
    $('mesa-ant').disabled = actual === 0;
    $('mesa-sig').disabled = actual >= N - 1;
    if (actual === N - 1) vioUltima = true;
    $('cerrar-carta').hidden = !vioUltima;
  }

  function irA(i) {
    actual = Math.max(0, Math.min(N - 1, i));
    acomodarMesa();
  }

  async function abrirMesa(conLlegada) {
    if (conLlegada && N) contenedor.classList.add('llegando');
    await mostrarVista('v-mesa');
    acomodarMesa();
    if (conLlegada && N) {
      // Las hojas caen sobre la mesa una tras otra.
      hojas.forEach((h, i) => { h.style.transitionDelay = `${Math.abs(i - actual) * 140}ms`; });
      void contenedor.offsetWidth;
      contenedor.classList.remove('llegando');
      setTimeout(() => hojas.forEach((h) => { h.style.transitionDelay = ''; }), 1600);
    }
    hojas[actual]?.focus({ preventScroll: true });
  }

  // Deslizar la mesa para cambiar de hoja; tocar la de enfrente para leerla.
  let toque = null;
  contenedor.addEventListener('pointerdown', (e) => { toque = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  contenedor.addEventListener('pointerup', (e) => {
    if (!toque) return;
    const dx = e.clientX - toque.x;
    const dy = e.clientY - toque.y;
    toque = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      irA(actual + (dx < 0 ? 1 : -1));
      return;
    }
    if (Math.hypot(dx, dy) > 10) return;
    const tocada = hojas.indexOf(e.target.closest('.hoja'));
    if (tocada < 0) return;
    if (tocada === actual) abrirVisor(actual);
    else irA(tocada);
  });
  contenedor.addEventListener('pointercancel', () => { toque = null; });
  // Teclado y lectores de pantalla (click sin puntero: detail 0); el toque ya lo maneja pointerup.
  hojas.forEach((h, i) => h.addEventListener('click', (e) => {
    if (e.detail === 0 && i === actual) abrirVisor(i);
  }));
  $('mesa-ant').addEventListener('click', () => irA(actual - 1));
  $('mesa-sig').addEventListener('click', () => irA(actual + 1));
  window.addEventListener('resize', () => { if (vistaActual === $('v-mesa')) acomodarMesa(); });

  $('cerrar-carta').addEventListener('click', irAlFinal);

  /* ---------- 4. Visor: zoom con pellizco y doble toque, deslizar entre hojas ---------- */

  const visor = $('visor');
  const marco = $('marco');
  const foto = $('visor-img');
  const MAX_ZOOM = 4;
  const z = { s: 1, X: 0, Y: 0, base: { x: 0, y: 0, w: 0, h: 0 } };
  let abierto = false;
  let enVisor = 0;
  let pidiendo = 0;
  const precargadas = new Map();

  function precargar(i) {
    if (i < 0 || i >= N || precargadas.has(i)) return;
    const img = new Image();
    img.src = grande(i);
    precargadas.set(i, img);
  }

  function aplicar(animar = false) {
    foto.classList.toggle('anima', animar);
    foto.style.transform = `translate(${z.X}px, ${z.Y}px) scale(${z.s})`;
  }

  // Encaja la hoja completa en pantalla (escala 1) dejando aire para los botones.
  function encajar() {
    const W = marco.clientWidth;
    const H = marco.clientHeight;
    const nw = foto.naturalWidth || 3;
    const nh = foto.naturalHeight || 4;
    const margenX = W < 600 ? 12 : 72;
    const margenY = 64;
    const k = Math.min((W - margenX * 2) / nw, (H - margenY * 2) / nh);
    z.base = { w: nw * k, h: nh * k, x: (W - nw * k) / 2, y: (H - nh * k) / 2 };
    foto.style.width = `${z.base.w}px`;
    foto.style.height = `${z.base.h}px`;
    z.s = 1;
    z.X = z.base.x;
    z.Y = z.base.y;
  }

  // Con zoom, la hoja no deja huecos; sin zoom, queda centrada.
  function limitar() {
    const W = marco.clientWidth;
    const H = marco.clientHeight;
    const w = z.base.w * z.s;
    const h = z.base.h * z.s;
    z.X = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, z.X));
    z.Y = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, z.Y));
  }

  function zoomEn(px, py, s, animar) {
    const nueva = Math.max(1, Math.min(MAX_ZOOM, s));
    z.X = px - (px - z.X) * (nueva / z.s);
    z.Y = py - (py - z.Y) * (nueva / z.s);
    z.s = nueva;
    if (nueva === 1) { z.X = z.base.x; z.Y = z.base.y; }
    limitar();
    aplicar(animar);
  }

  function cargarEnVisor(i) {
    enVisor = i;
    const turno = ++pidiendo;
    foto.alt = `Hoja ${i + 1} de la carta`;
    // Primero la miniatura (ya está en caché) y luego la grande, sin saltos.
    foto.src = mini(i);
    const listo = () => { if (turno === pidiendo) { encajar(); aplicar(); } };
    if (foto.complete) listo(); else foto.addEventListener('load', listo, { once: true });
    const g = precargadas.get(i) || new Image();
    if (!precargadas.has(i)) { g.src = grande(i); precargadas.set(i, g); }
    const ponerGrande = () => {
      if (turno !== pidiendo) return;
      const { s, X, Y } = z;
      foto.src = g.src;
      foto.addEventListener('load', () => { if (turno === pidiendo) { Object.assign(z, { s, X, Y }); aplicar(); } }, { once: true });
    };
    if (g.complete && g.naturalWidth) ponerGrande(); else g.addEventListener('load', ponerGrande, { once: true });
    precargar(i + 1);
    precargar(i - 1);

    $('visor-contador').textContent = `Hoja ${i + 1} de ${N}`;
    $('visor-ant').disabled = i === 0;
    $('visor-sig').disabled = i >= N - 1;
    if (i === N - 1) vioUltima = true;
    $('visor-fin').hidden = i !== N - 1;
  }

  async function pasar(paso) {
    const i = enVisor + paso;
    if (i < 0 || i >= N) { z.X = z.base.x; aplicar(true); return; }
    const W = marco.clientWidth;
    z.X = z.base.x - paso * W;
    aplicar(true);
    foto.style.opacity = '0';
    await esperar(260);
    cargarEnVisor(i);
    z.X = z.base.x + paso * W * 0.4;
    aplicar(false);
    void foto.offsetWidth;
    foto.style.opacity = '';
    z.X = z.base.x;
    aplicar(true);
  }

  const frenarGesto = (e) => e.preventDefault();
  function abrirVisor(i) {
    if (!N) return;
    abierto = true;
    document.body.classList.add('bloqueado');
    document.addEventListener('gesturestart', frenarGesto);
    visor.hidden = false;
    cargarEnVisor(i);
    void visor.offsetWidth;
    visor.classList.add('visible');
    $('visor-cerrar').focus({ preventScroll: true });
  }

  async function cerrarVisor() {
    if (!abierto) return;
    abierto = false;
    visor.classList.remove('visible');
    await esperar(450);
    visor.hidden = true;
    document.body.classList.remove('bloqueado');
    document.removeEventListener('gesturestart', frenarGesto);
    irA(enVisor);
    hojas[enVisor]?.focus({ preventScroll: true });
  }

  const punteros = new Map();
  let gesto = null;
  let ultimoToque = { t: 0, x: 0, y: 0 };
  const enMarco = (e) => { const r = marco.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function empezarGesto() {
    const p = [...punteros.values()];
    if (p.length >= 2) {
      gesto = {
        tipo: 'pellizco', s0: z.s, X0: z.X, Y0: z.Y,
        d0: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1,
        m0: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 },
      };
    } else if (p.length === 1) {
      gesto = { tipo: z.s > 1.01 ? 'mover' : 'deslizar', x0: p[0].x, y0: p[0].y, X0: z.X, Y0: z.Y, t0: performance.now(), movio: false };
    }
  }

  marco.addEventListener('pointerdown', (e) => {
    marco.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, enMarco(e));
    empezarGesto();
  });

  marco.addEventListener('pointermove', (e) => {
    if (!punteros.has(e.pointerId) || !gesto) return;
    punteros.set(e.pointerId, enMarco(e));
    const p = [...punteros.values()];
    if (gesto.tipo === 'pellizco' && p.length >= 2) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const m = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      const s = Math.max(0.85, Math.min(MAX_ZOOM * 1.1, gesto.s0 * (d / gesto.d0)));
      z.X = m.x - (gesto.m0.x - gesto.X0) * (s / gesto.s0);
      z.Y = m.y - (gesto.m0.y - gesto.Y0) * (s / gesto.s0);
      z.s = s;
      aplicar();
      return;
    }
    const dx = p[0].x - gesto.x0;
    const dy = p[0].y - gesto.y0;
    if (Math.hypot(dx, dy) > 8) gesto.movio = true;
    if (gesto.tipo === 'mover') {
      z.X = gesto.X0 + dx;
      z.Y = gesto.Y0 + dy;
      limitar();
      aplicar();
    } else if (gesto.tipo === 'deslizar' && Math.abs(dx) > Math.abs(dy)) {
      z.X = z.base.x + dx;
      aplicar();
    }
  });

  function soltar(e) {
    if (!punteros.has(e.pointerId)) return;
    const pos = punteros.get(e.pointerId);
    punteros.delete(e.pointerId);
    const g = gesto;
    if (g?.tipo === 'pellizco') {
      if (punteros.size === 0) { zoomEn(marco.clientWidth / 2, marco.clientHeight / 2, z.s, true); gesto = null; }
      else { limitar(); aplicar(); empezarGesto(); }
      return;
    }
    gesto = null;
    if (!g) return;
    const dx = pos.x - g.x0;
    const dy = pos.y - g.y0;
    if (!g.movio && performance.now() - g.t0 < 300) {
      // Doble toque: amplía donde tocó, o vuelve a la hoja completa.
      const ahora = performance.now();
      if (ahora - ultimoToque.t < 320 && Math.hypot(pos.x - ultimoToque.x, pos.y - ultimoToque.y) < 40) {
        zoomEn(pos.x, pos.y, z.s > 1.01 ? 1 : 2.5, true);
        ultimoToque.t = 0;
      } else {
        ultimoToque = { t: ahora, x: pos.x, y: pos.y };
      }
      return;
    }
    if (g.tipo === 'deslizar') {
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) pasar(dx < 0 ? 1 : -1);
      else { z.X = z.base.x; aplicar(true); }
    }
  }
  marco.addEventListener('pointerup', soltar);
  marco.addEventListener('pointercancel', soltar);

  marco.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = enMarco(e);
    zoomEn(p.x, p.y, z.s * Math.exp(-e.deltaY * 0.0022), false);
  }, { passive: false });

  $('visor-cerrar').addEventListener('click', cerrarVisor);
  $('visor-ant').addEventListener('click', () => pasar(-1));
  $('visor-sig').addEventListener('click', () => pasar(1));
  $('visor-fin').addEventListener('click', async () => {
    await cerrarVisor();
    irAlFinal();
  });
  window.addEventListener('resize', () => { if (abierto) { encajar(); aplicar(); } });

  document.addEventListener('keydown', (e) => {
    if (abierto) {
      if (e.key === 'Escape') cerrarVisor();
      else if (e.key === 'ArrowRight') pasar(1);
      else if (e.key === 'ArrowLeft') pasar(-1);
      else if (e.key === 'Tab') {
        // El foco no sale del visor.
        const controles = [...visor.querySelectorAll('button')].filter((b) => !b.hidden && !b.disabled && b.offsetParent);
        const k = controles.indexOf(document.activeElement);
        e.preventDefault();
        controles[(k + (e.shiftKey ? -1 : 1) + controles.length) % controles.length]?.focus();
      }
      return;
    }
    if (vistaActual === $('v-mesa')) {
      if (e.key === 'ArrowRight') irA(actual + 1);
      else if (e.key === 'ArrowLeft') irA(actual - 1);
    }
  });

  /* ---------- 5. Final ---------- */

  async function irAlFinal() {
    const caja = $('petalos');
    caja.innerHTML = '';
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('span');
      p.className = 'petalo';
      const dur = 16 + Math.random() * 12;
      p.style.cssText = `--x:${(Math.random() * 100).toFixed(1)}%;--dur:${dur.toFixed(1)}s;--retraso:${(-Math.random() * dur).toFixed(1)}s;`
        + `--tam:${(9 + Math.random() * 8).toFixed(1)}px;--opacidad:${(0.22 + Math.random() * 0.3).toFixed(2)};--giro:${Math.round(Math.random() * 540 - 270)}deg`;
      caja.append(p);
    }
    await mostrarVista('v-final');
    $('leer-de-nuevo').focus({ preventScroll: true });
  }

  $('leer-de-nuevo').addEventListener('click', () => {
    actual = 0;
    abrirMesa(true);
  });

  /* ---------- Arranque ---------- */

  precargar(0);
  mostrarVista('v-cartel');
})();
