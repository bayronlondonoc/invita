/* Florece — regalo interactivo: bosque que despierta con la voz, orquídea que florece
   al soplar, pétalos con recuerdos, pintura, antojos, carta y canción.
   El contenido personal llega cifrado (datos.enc); la clave viaja en el #fragmento del QR. */
(() => {
  'use strict';

  const app = document.getElementById('app');
  const capaBosque = document.getElementById('bosque');
  const params = new URLSearchParams(location.search);
  const RAPIDO = params.has('rapido');                 // para probar sin esperar
  const ESPERA_MS = RAPIDO ? 3000 : 30000;
  const VOZ_MS = RAPIDO ? 1500 : 6500;                  // tiempo cantando para despertar el bosque
  const SOPLO_MS = 450;
  const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  const PASOS = ['portada', 'bosque', 'espera:0', 'pregunta:0', 'espera:1', 'soplar', 'petalos',
    'espera:2', 'pintar', 'pregunta:1', 'espera:3', 'menu', 'bolsillo', 'pregunta:2', 'carta', 'final'];

  const MISIONES = [
    'Cierra los ojos y piensa en el mejor momento de tu año. Quédate ahí un ratico.',
    'Piensa en un deseo para tus próximos 365 días. Guárdalo bien: lo vas a necesitar para soplar.',
    'Busca a tu alrededor algo del color que le pondrías a tu orquídea.',
    'Tararea bajito la primera canción que se te venga a la cabeza.',
  ];
  const PREGUNTAS = [
    { texto: '¿Cuál es la flor nacional de Colombia?',
      opciones: ['El girasol', 'La orquídea Cattleya trianae', 'La rosa roja'], correcta: 1,
      dato: 'Lleva el nombre del botánico colombiano José Jerónimo Triana.' },
    { texto: '¿Qué sabor famoso sale de una orquídea?',
      opciones: ['El chocolate', 'La canela', 'La vainilla'], correcta: 2,
      dato: 'La vainilla es el fruto de una orquídea trepadora.' },
    { texto: '¿Cuántas especies de orquídeas hay en Colombia, más o menos?',
      opciones: ['Unas 40', 'Unas 400', 'Más de 4000'], correcta: 2,
      dato: 'Colombia es uno de los países con más orquídeas del mundo.' },
  ];
  const ANTOJOS = [
    { id: 'salchipapas', nombre: 'Salchipapas', icono: '🍟' },
    { id: 'chicharron', nombre: 'Chicharrón', icono: '🥓' },
    { id: 'madurito', nombre: 'Madurito', icono: '🍌' },
    { id: 'ceviche', nombre: 'Ceviche de camarón', icono: '🦐' },
  ];
  const COLORES = ['#D46A9F', '#F2B9D6', '#A77BCA', '#7A1F2B', '#E9B949', '#E8836B', '#7FA36B', '#3F6B4A', '#2F4B6E'];

  /* ---------- Utilidades ---------- */

  function h(tag, props = {}, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;              // solo para SVG generado aquí
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of hijos.flat()) if (c != null && c !== false && c !== '') n.append(c);
    return n;
  }
  const lista = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

  const slug = (location.pathname.match(/\/f\/([^/]+)/) || [])[1] || 'florece';
  const CLAVE = `florece:${slug}`;
  const memoria = {
    leer(k = CLAVE) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    escribir(v, k = CLAVE) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio o privado */ } },
    borrar() { try { localStorage.removeItem(CLAVE); localStorage.removeItem(`${CLAVE}:pintura`); } catch { /* nada */ } },
  };
  let estado = { paso: 0, menu: [], abiertos: [] };
  const guardar = () => memoria.escribir(estado);

  let datos = null;

  /* ---------- Orquídea (SVG) ---------- */

  const SEPALO = 'M200 190 C178 150 172 92 200 60 C228 92 222 150 200 190 Z';
  const PETALO = 'M200 190 C170 150 98 118 66 148 C38 176 60 232 112 228 C152 224 182 206 200 190 Z';
  const VENA_SEPALO = 'M200 184 C198 150 198 110 200 78';
  const VENA_PETALO = 'M196 188 C168 172 126 160 86 170';
  const LABELO = 'M200 196 C182 204 174 230 186 250 C193 262 207 262 214 250 C226 230 218 204 200 196 Z';
  const LOBULOS = 'M190 206 C172 198 160 212 174 224 M210 206 C228 198 240 212 226 224';
  // id, forma, transformación, índice del recuerdo
  const PIEZAS = [
    ['dorsal', SEPALO, VENA_SEPALO, '', 0],
    ['sepalo-izq', SEPALO, VENA_SEPALO, 'rotate(-140 200 190)', 3],
    ['sepalo-der', SEPALO, VENA_SEPALO, 'rotate(140 200 190)', 4],
    ['petalo-izq', PETALO, VENA_PETALO, '', 1],
    ['petalo-der', PETALO, VENA_PETALO, 'translate(400 0) scale(-1 1)', 2],
  ];
  const TALLO = `
    <path d="M200 258 C206 300 190 336 198 388" />
    <path d="M199 312 C226 300 246 280 258 256" />
    <path d="M258 256 C252 236 262 220 276 214 C282 230 276 248 258 256 Z" />
    <path d="M196 376 C150 360 96 366 64 394 C116 404 168 396 198 384 Z" />
    <path d="M150 380 C130 382 108 386 90 392" />
    <path d="M200 380 C238 352 300 350 334 368 C292 392 234 396 200 386 Z" />
    <path d="M250 372 C272 366 292 366 312 368" />`;

  // modo 'linea': dibujo para colorear; el relleno de papel tapa las líneas que quedan detrás.
  function orquidea({ modo = 'color', tallo = false, ancho, alto, papel = '#FBF7F1' } = {}) {
    const linea = modo === 'linea';
    const vista = tallo ? '30 40 340 370' : '40 40 320 240';
    const tam = ancho ? ` width="${ancho}" height="${alto}"` : '';
    const piezas = PIEZAS.map(([id, forma, vena, tr, i], n) => {
      const relleno = linea ? papel : id.startsWith('petalo') ? 'url(#fl-petalo)' : 'url(#fl-sepalo)';
      return `<g class="pieza pieza--${id}" data-recuerdo="${i}" style="--i:${n}">
        <g${tr ? ` transform="${tr}"` : ''}>
          <path class="pieza__forma" d="${forma}" fill="${relleno}" />
          <path class="pieza__vena" d="${vena}" fill="none" />
        </g></g>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vista}"${tam} class="orquidea orquidea--${modo}" role="img" aria-label="Orquídea">
      <defs>
        <radialGradient id="fl-petalo" cx="200" cy="190" r="150" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#FFF8FB"/><stop offset=".55" stop-color="#F6CDE2"/><stop offset="1" stop-color="#D46A9F"/>
        </radialGradient>
        <radialGradient id="fl-sepalo" cx="200" cy="190" r="140" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#F8DDEB"/><stop offset="1" stop-color="#E39BC1"/>
        </radialGradient>
        <linearGradient id="fl-labelo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#B23A6B"/><stop offset="1" stop-color="#7A1F2B"/>
        </linearGradient>
      </defs>
      <g fill="none" stroke="${linea ? '#3B3633' : 'rgba(122,31,43,.35)'}" stroke-width="${linea ? 2.2 : 1.3}" stroke-linecap="round" stroke-linejoin="round">
        ${tallo ? `<g class="tallo" fill="${papel}">${TALLO}</g>` : ''}
        ${linea ? '' : '<ellipse class="boton" cx="200" cy="188" rx="22" ry="30" fill="url(#fl-sepalo)" />'}
        ${piezas}
        <g class="pieza pieza--centro" style="--i:5">
          <path d="${LABELO}" fill="${linea ? papel : 'url(#fl-labelo)'}" />
          <path d="${LOBULOS}" />
          <ellipse cx="200" cy="186" rx="9" ry="12" fill="${linea ? papel : '#FFF1C9'}" />
        </g>
      </g>
    </svg>`;
  }
  window.FloreceOrquidea = orquidea;   // la usa scripts/imprimible.html

  /* ---------- Bosque de fondo ---------- */

  function montarBosque() {
    if (!capaBosque) return;
    const pino = (x, base, alto, ancho) => `M${x} ${base - alto} L${x + ancho / 2} ${base} L${x - ancho / 2} ${base} Z`;
    const capa = (n, y, alto, color, sem) => {
      let d = '';
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (1000 / n) + Math.sin(i * sem) * 30;
        const a = alto * (0.75 + 0.35 * Math.abs(Math.sin(i * sem * 1.7)));
        d += pino(x, y, a, a * 0.42);
      }
      return `<path d="${d}" fill="${color}" />`;
    };
    capaBosque.innerHTML = `
      <div class="bosque__cielo"></div>
      <div class="bosque__amanecer"></div>
      <svg class="bosque__arboles" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMax slice">
        <g class="arboles arboles--lejos">${capa(16, 600, 330, 'var(--arbol-3)', 1.3)}</g>
        <g class="arboles arboles--medio">${capa(11, 600, 260, 'var(--arbol-2)', 2.1)}</g>
        <g class="arboles arboles--cerca">${capa(7, 610, 200, 'var(--arbol-1)', 3.7)}</g>
      </svg>
      <div class="bosque__flores"></div>
      <div class="bosque__luciernagas"></div>`;
    for (let i = 0; i < 6; i++) luciernaga(true);
  }

  function luciernaga(tenue = false) {
    const cont = capaBosque?.querySelector('.bosque__luciernagas');
    if (!cont || cont.childElementCount > 70) return;
    const l = h('span', { class: `luciernaga${tenue ? ' luciernaga--tenue' : ''}` });
    l.style.left = `${Math.random() * 100}%`;
    l.style.top = `${30 + Math.random() * 65}%`;
    l.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    l.style.setProperty('--dy', `${-20 - Math.random() * 90}px`);
    l.style.setProperty('--dur', `${6 + Math.random() * 8}s`);
    l.style.setProperty('--retraso', `${-Math.random() * 8}s`);
    cont.append(l);
  }

  function florecita() {
    const cont = capaBosque?.querySelector('.bosque__flores');
    if (!cont || cont.childElementCount > 40) return;
    const f = h('span', { class: 'florecita', text: ['✿', '❀', '✾'][Math.floor(Math.random() * 3)] });
    f.style.left = `${Math.random() * 100}%`;
    f.style.setProperty('--tam', `${14 + Math.random() * 18}px`);
    f.style.setProperty('--tono', `${Math.floor(Math.random() * 4)}`);
    cont.append(f);
  }

  function despertarBosque() {
    document.body.classList.add('despierto');
    for (let i = 0; i < 24; i++) luciernaga();
    for (let i = 0; i < 18; i++) florecita();
  }

  /* ---------- Micrófono ---------- */

  const Mic = {
    ctx: null, an: null, stream: null, buf: null, umbral: 0.03,
    async abrir() {
      if (this.an) return true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = this.ctx || new AC();             // se crea dentro del toque (iOS)
        this.ctx.resume();
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        await this.ctx.resume();
        const fuente = this.ctx.createMediaStreamSource(this.stream);
        this.an = this.ctx.createAnalyser();
        this.an.fftSize = 1024;
        fuente.connect(this.an);
        this.buf = new Float32Array(this.an.fftSize);
        let suma = 0;
        for (let i = 0; i < 8; i++) { await esperar(60); suma += this.nivel(); }
        this.umbral = Math.min(0.08, Math.max(0.018, (suma / 8) * 3));
        return true;
      } catch {
        this.cerrar();
        return false;
      }
    },
    nivel() {
      if (!this.an) return 0;
      this.an.getFloatTimeDomainData(this.buf);
      let s = 0;
      for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
      return Math.sqrt(s / this.buf.length);
    },
    cerrar() {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.ctx?.close().catch(() => {});
      this.ctx = this.an = this.stream = null;
    },
  };

  // Botón "mantener presionado" como alternativa al micrófono.
  function botonPresionar(texto) {
    const b = h('button', { class: 'btn btn-claro btn-presionar', type: 'button', text: texto });
    b.activo = false;
    const on = (e) => { e.preventDefault(); b.activo = true; b.classList.add('presionado'); };
    const off = () => { b.activo = false; b.classList.remove('presionado'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('touchstart', on, { passive: false });
    ['pointerup', 'pointercancel', 'pointerleave', 'touchend', 'touchcancel'].forEach((ev) => b.addEventListener(ev, off));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  /* ---------- Navegación ---------- */

  let actual = null;
  let enTransicion = false;
  async function mostrar(nueva, alMontar) {
    if (actual) {
      actual.classList.remove('visible');
      await esperar(reducido() ? 150 : 420);
      actual.remove();
    }
    app.append(nueva);
    actual = nueva;
    alMontar?.(nueva);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => requestAnimationFrame(() => nueva.classList.add('visible')));
  }

  async function avanzar() {
    if (enTransicion) return;
    enTransicion = true;
    estado.paso = Math.min(estado.paso + 1, PASOS.length - 1);
    guardar();
    await irAlPaso();
    enTransicion = false;
  }

  function irAlPaso() {
    const [tipo, n] = PASOS[estado.paso].split(':');
    const pantallas = { portada, bosque, espera, pregunta, soplar, petalos, pintar, menu, bolsillo, carta, final };
    return pantallas[tipo](Number(n));
  }

  const hoja = (clase, ...hijos) => h('section', { class: 'pantalla' }, h('article', { class: `hoja ${clase || ''}` }, ...hijos));
  const seguir = (texto = 'Seguir', extra = {}) => h('button', { class: 'btn', type: 'button', text: texto, onclick: avanzar, ...extra });

  /* ---------- Pantallas ---------- */

  function portada() {
    return mostrar(hoja('hoja--portada',
      h('p', { class: 'eyebrow', text: `Para ${datos.para}` }),
      h('h1', { class: 'titulo titulo--grande', text: 'Florece' }),
      h('p', { class: 'texto', text: 'Este regalo tiene su propio tiempo. Busca un rincón tranquilo, sube el brillo y no tengas afán.' }),
      h('p', { class: 'texto texto--suave', text: 'Vas a necesitar tu voz. 🎤' }),
      seguir('Entrar al bosque'),
      h('p', { class: 'firma', text: `— ${datos.de}` })));
  }

  function bosque() {
    const progreso = h('div', { class: 'progreso' }, h('span', { class: 'progreso__barra' }));
    const estadoTxt = h('p', { class: 'texto texto--suave', text: 'Cuando estés lista, toca el botón y canta lo que quieras.' });
    const presionar = botonPresionar('Prefiero no usar el micrófono: mantén presionado aquí');
    presionar.hidden = true;
    const listo = seguir('Seguir', { hidden: true });
    let acumulado = 0;
    let terminado = false;

    const empezar = h('button', { class: 'btn', type: 'button', text: 'Despertar el bosque 🎤' });
    empezar.addEventListener('click', async () => {
      empezar.disabled = true;
      estadoTxt.textContent = 'Escuchando…';
      const ok = await Mic.abrir();
      empezar.hidden = true;
      presionar.hidden = false;
      estadoTxt.textContent = ok ? 'Canta… el bosque te está escuchando. 🌿' : 'No pude usar el micrófono. Mantén presionado el botón mientras cantas.';
      let previo = performance.now();
      const ciclo = (t) => {
        if (terminado || !progreso.isConnected) return;
        const dt = t - previo;
        previo = t;
        const nivel = Mic.nivel();
        const cantando = presionar.activo || nivel > Mic.umbral;
        if (cantando) {
          acumulado += dt;
          if (Math.random() < 0.12) luciernaga();
          if (Math.random() < 0.06) florecita();
        }
        const p = Math.min(1, acumulado / VOZ_MS);
        progreso.style.setProperty('--p', p);
        document.body.style.setProperty('--luz', p.toFixed(3));
        if (p >= 1) {
          terminado = true;
          despertarBosque();
          estadoTxt.textContent = '¡Lo despertaste! Escucha cómo brilla. ✨';
          presionar.hidden = true;
          listo.hidden = false;
          return;
        }
        requestAnimationFrame(ciclo);
      };
      requestAnimationFrame(ciclo);
    });

    return mostrar(hoja('',
      h('p', { class: 'eyebrow', text: 'Primer paso' }),
      h('h2', { class: 'titulo', text: 'Este bosque está dormido' }),
      h('p', { class: 'texto', text: 'Solo despierta con tu voz. Cántale lo que quieras, como tú sabes.' }),
      progreso, estadoTxt, empezar, presionar, listo));
  }

  function espera(n) {
    const listo = seguir('Seguir', { hidden: true });
    const semilla = h('div', { class: 'semilla', style: `--dur:${ESPERA_MS}ms`, html: `
      <svg viewBox="0 0 120 170" aria-hidden="true">
        <ellipse cx="60" cy="158" rx="40" ry="8" class="semilla__tierra"/>
        <path class="semilla__tallo" d="M60 156 C58 130 64 110 60 86 C57 66 62 52 60 40" pathLength="1"/>
        <path class="semilla__hoja semilla__hoja--1" d="M60 118 C44 112 34 98 36 88 C50 90 60 102 60 118 Z"/>
        <path class="semilla__hoja semilla__hoja--2" d="M60 98 C76 92 86 78 84 68 C70 70 60 82 60 98 Z"/>
        <g class="semilla__flor">
          <circle cx="60" cy="30" r="9"/><circle cx="48" cy="38" r="9"/><circle cx="72" cy="38" r="9"/>
          <circle cx="52" cy="50" r="8"/><circle cx="68" cy="50" r="8"/><circle cx="60" cy="41" r="5" class="semilla__centro"/>
        </g>
      </svg>` });
    const pantalla = hoja('hoja--espera',
      h('p', { class: 'eyebrow', text: 'El bosque tiene su propio tiempo' }),
      semilla,
      h('p', { class: 'mision', text: MISIONES[n] }),
      h('p', { class: 'texto texto--suave nota-espera', text: 'Cuando la flor se abra, puedes seguir.' }),
      listo);
    return mostrar(pantalla, () => {
      setTimeout(() => {
        if (!pantalla.isConnected) return;
        listo.hidden = false;
        pantalla.querySelector('.nota-espera').textContent = 'Ya floreció. 🌸';
      }, ESPERA_MS);
    });
  }

  function pregunta(n) {
    const p = PREGUNTAS[n];
    const dato = h('p', { class: 'dato', hidden: true });
    const listo = seguir('Seguir', { hidden: true });
    const reaccion = h('p', { class: 'texto texto--suave reaccion', 'aria-live': 'polite' });
    const opciones = p.opciones.map((o, i) => h('button', {
      class: 'opcion', type: 'button', text: o,
      onclick: (e) => {
        const b = e.currentTarget;
        if (listo.hidden === false) return;
        if (i === p.correcta) {
          b.classList.add('opcion--bien');
          reaccion.textContent = '¡Eso! 🌸';
          dato.textContent = p.dato;
          dato.hidden = false;
          listo.hidden = false;
        } else {
          b.classList.add('opcion--mal');
          b.disabled = true;
          reaccion.textContent = 'Jaja, casi 😜 Investiga y vuelve a intentar.';
        }
      },
    }));
    return mostrar(hoja('',
      h('p', { class: 'eyebrow', text: `Investigación ${n + 1} de 3` }),
      h('h2', { class: 'titulo', text: p.texto }),
      h('p', { class: 'texto texto--suave', text: 'Puedes buscar en internet. No es trampa: es parte del juego.' }),
      h('div', { class: 'opciones' }, opciones), reaccion, dato, listo));
  }

  function soplar() {
    const flor = h('div', { class: 'flor-velas' },
      h('div', { class: 'flor cerrada', html: orquidea({ modo: 'color' }) }),
      h('span', { class: 'vela vela--1' }), h('span', { class: 'vela vela--2' }), h('span', { class: 'vela vela--3' }));
    const estadoTxt = h('p', { class: 'texto texto--suave', text: 'Cierra los ojos, pide tu deseo… y sopla fuerte. 🌬️' });
    const presionar = botonPresionar('Sin micrófono: mantén presionado para soplar');
    presionar.hidden = true;
    const listo = seguir('Seguir', { hidden: true });
    let soplado = 0;
    let terminado = false;

    const empezar = h('button', { class: 'btn', type: 'button', text: 'Ya pedí mi deseo' });
    empezar.addEventListener('click', async () => {
      empezar.disabled = true;
      const ok = await Mic.abrir();
      empezar.hidden = true;
      presionar.hidden = false;
      if (!ok) estadoTxt.textContent = 'No pude usar el micrófono. Mantén presionado el botón para soplar.';
      let previo = performance.now();
      const ciclo = (t) => {
        if (terminado || !flor.isConnected) return;
        const dt = t - previo;
        previo = t;
        const nivel = Mic.nivel();
        const fuerza = Math.min(1, nivel / Math.max(0.05, Mic.umbral * 2.5));
        flor.style.setProperty('--viento', presionar.activo ? 1 : fuerza.toFixed(2));
        if (presionar.activo || nivel > Math.max(0.06, Mic.umbral * 2)) soplado += dt;
        if (soplado >= SOPLO_MS) {
          terminado = true;
          Mic.cerrar();
          flor.classList.add('apagadas');
          presionar.hidden = true;
          setTimeout(() => flor.querySelector('.flor').classList.replace('cerrada', 'abierta'), 500);
          estadoTxt.textContent = '';
          setTimeout(() => {
            estadoTxt.textContent = `¡Feliz cumpleaños, ${datos.para}! 🌸`;
            estadoTxt.classList.add('felicidades');
            for (let i = 0; i < 10; i++) luciernaga();
            listo.hidden = false;
          }, 2200);
          return;
        }
        requestAnimationFrame(ciclo);
      };
      requestAnimationFrame(ciclo);
    });

    return mostrar(hoja('',
      h('p', { class: 'eyebrow', text: 'Las velas' }),
      h('h2', { class: 'titulo', text: 'Pide un deseo' }),
      flor, estadoTxt, empezar, presionar, listo));
  }

  function petalos() {
    const flor = h('div', { class: 'flor abierta flor--interactiva', html: orquidea({ modo: 'color' }) });
    const faltan = h('p', { class: 'texto texto--suave' });
    const listo = seguir('Seguir', { hidden: true });
    const total = Math.min(datos.petalos.length, 5);
    const actualizar = () => {
      const n = total - estado.abiertos.length;
      faltan.textContent = n > 0 ? `Toca cada pétalo. Te ${n === 1 ? 'falta 1' : `faltan ${n}`}.` : 'Los abriste todos. 💐';
      listo.hidden = n > 0;
      flor.querySelectorAll('.pieza[data-recuerdo]').forEach((p) => {
        p.classList.toggle('pieza--vista', estado.abiertos.includes(Number(p.dataset.recuerdo)));
      });
    };
    flor.querySelectorAll('.pieza[data-recuerdo]').forEach((p) => {
      const i = Number(p.dataset.recuerdo);
      if (i >= total) return;
      p.setAttribute('tabindex', '0');
      p.setAttribute('role', 'button');
      p.setAttribute('aria-label', `Pétalo ${i + 1}`);
      const abrir = () => {
        recuerdo(datos.petalos[i]);
        if (!estado.abiertos.includes(i)) { estado.abiertos.push(i); guardar(); }
        actualizar();
      };
      p.addEventListener('click', abrir);
      p.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
    });
    actualizar();
    return mostrar(hoja('',
      h('p', { class: 'eyebrow', text: 'Cinco pétalos' }),
      h('h2', { class: 'titulo', text: 'Cada pétalo guarda algo' }),
      flor, faltan, listo));
  }

  function recuerdo({ foto, texto }) {
    const cerrar = () => { capa.classList.remove('visible'); setTimeout(() => capa.remove(), 350); };
    const capa = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === capa) cerrar(); } },
      h('figure', { class: 'polaroid' },
        h('img', { src: foto, alt: '' }),
        h('figcaption', { text: texto })),
      h('button', { class: 'btn btn-claro', type: 'button', text: 'Cerrar', onclick: cerrar }));
    document.body.append(capa);
    requestAnimationFrame(() => requestAnimationFrame(() => capa.classList.add('visible')));
    capa.querySelector('button').focus({ preventScroll: true });
  }

  /* ---------- Pintura ---------- */

  function pintar() {
    const lienzo = h('canvas', { class: 'lienzo__canvas', 'aria-label': 'Lienzo para pintar la orquídea' });
    const linea = h('div', { class: 'lienzo__linea', html: orquidea({ modo: 'linea', tallo: true }) });
    const marco = h('div', { class: 'lienzo' }, linea, lienzo);
    let color = COLORES[0];
    let tamano = 26;
    const paleta = h('div', { class: 'paleta', role: 'radiogroup', 'aria-label': 'Colores' },
      COLORES.map((c, i) => h('button', {
        class: `color${i === 0 ? ' activo' : ''}`, type: 'button', style: `--c:${c}`, 'aria-label': `Color ${i + 1}`,
        onclick: (e) => { color = c; paleta.querySelectorAll('.color').forEach((b) => b.classList.toggle('activo', b === e.currentTarget)); },
      })));
    const pinceles = h('div', { class: 'pinceles' },
      [['Fino', 12], ['Medio', 26], ['Grueso', 48]].map(([n, t]) => h('button', {
        class: `pincel${t === 26 ? ' activo' : ''}`, type: 'button', text: n,
        onclick: (e) => { tamano = t; pinceles.querySelectorAll('.pincel').forEach((b) => b.classList.toggle('activo', b === e.currentTarget)); },
      })),
      h('button', { class: 'pincel', type: 'button', text: 'Deshacer', onclick: () => deshacer() }),
      h('button', { class: 'pincel', type: 'button', text: 'Borrar', onclick: () => { guardarPaso(); limpiar(); } }));

    const ctx = lienzo.getContext('2d');
    let lado = 0;
    let dpr = 1;
    const historia = [];
    function limpiar() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, lienzo.width, lienzo.height);
      ctx.restore();
    }
    function guardarPaso() {
      historia.push(ctx.getImageData(0, 0, lienzo.width, lienzo.height));
      if (historia.length > 15) historia.shift();
    }
    function deshacer() { const p = historia.pop(); if (p) ctx.putImageData(p, 0, 0); }
    function dimensionar() {
      const previo = lienzo.width ? lienzo.toDataURL() : memoria.leer(`${CLAVE}:pintura`);
      lado = marco.clientWidth;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      lienzo.width = lienzo.height = Math.round(lado * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      limpiar();
      if (previo) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, lado, lado);
        img.src = previo;
      }
    }

    function sello(x, y, presion) {
      const r = tamano * (0.55 + presion * 0.9);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `${color}38`);
      g.addColorStop(0.6, `${color}22`);
      g.addColorStop(1, `${color}00`);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2, r, 0, Math.PI * 2);
      ctx.fill();
      return r;
    }
    let ultimo = null;
    const punto = (e) => {
      const r = lienzo.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pointerType === 'pen' && e.pressure ? e.pressure : 0.5 };
    };
    lienzo.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      lienzo.setPointerCapture(e.pointerId);
      guardarPaso();
      ultimo = punto(e);
      sello(ultimo.x, ultimo.y, ultimo.p);
    });
    lienzo.addEventListener('pointermove', (e) => {
      if (!ultimo) return;
      const eventos = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of eventos) {
        const p = punto(ev);
        const dist = Math.hypot(p.x - ultimo.x, p.y - ultimo.y);
        const paso = Math.max(2, tamano * 0.18);
        for (let d = paso; d <= dist; d += paso) {
          const t = d / dist;
          sello(ultimo.x + (p.x - ultimo.x) * t, ultimo.y + (p.y - ultimo.y) * t, ultimo.p + (p.p - ultimo.p) * t);
        }
        if (dist >= paso) ultimo = p;
      }
    });
    const soltar = () => {
      if (!ultimo) return;
      ultimo = null;
      memoria.escribir(lienzo.toDataURL('image/png'), `${CLAVE}:pintura`);
    };
    ['pointerup', 'pointercancel'].forEach((ev) => lienzo.addEventListener(ev, soltar));

    const pantalla = hoja('hoja--pintar',
      h('p', { class: 'eyebrow', text: 'Tu turno' }),
      h('h2', { class: 'titulo', text: 'Pinta tu orquídea' }),
      h('p', { class: 'texto texto--suave', text: 'Con el dedo o con tu lápiz. Al final te la llevas como lámina.' }),
      marco, paleta, pinceles,
      seguir('Ya quedó hermosa'));
    return mostrar(pantalla, () => {
      dimensionar();
      new ResizeObserver(() => { if (Math.abs(marco.clientWidth - lado) > 4) dimensionar(); }).observe(marco);
    });
  }

  /* ---------- Antojos ---------- */

  function menu() {
    const elegidos = new Set(estado.menu);
    const armar = h('button', { class: 'btn', type: 'button', text: 'Armar mi plato', disabled: elegidos.size === 0 });
    const tarjetas = ANTOJOS.map((a) => h('button', {
      class: `antojo${elegidos.has(a.id) ? ' elegido' : ''}`, type: 'button', 'aria-pressed': String(elegidos.has(a.id)),
      onclick: (e) => {
        elegidos.has(a.id) ? elegidos.delete(a.id) : elegidos.add(a.id);
        e.currentTarget.classList.toggle('elegido', elegidos.has(a.id));
        e.currentTarget.setAttribute('aria-pressed', String(elegidos.has(a.id)));
        armar.disabled = elegidos.size === 0;
      },
    }, h('span', { class: 'antojo__icono', text: a.icono }), h('span', { class: 'antojo__nombre', text: a.nombre })));

    armar.addEventListener('click', () => {
      estado.menu = ANTOJOS.filter((a) => elegidos.has(a.id)).map((a) => a.id);
      guardar();
      saludable();
    });

    return mostrar(hoja('',
      h('p', { class: 'eyebrow', text: 'Menú de cumpleaños' }),
      h('h2', { class: 'titulo', text: 'Arma tu plato de antojos' }),
      h('p', { class: 'texto texto--suave', text: 'Escoge todo lo que quieras. Hoy no se cuentan calorías.' }),
      h('div', { class: 'antojos' }, tarjetas), armar));
  }

  function saludable() {
    const no = h('button', { class: 'btn', type: 'button', text: 'No, gracias 😌' });
    const si = h('button', { class: 'btn btn-claro btn-huye', type: 'button', text: 'Sí' });
    const arena = h('div', { class: 'arena-mini' }, si, no);
    const frase = h('p', { class: 'texto texto--suave reaccion', 'aria-live': 'polite' });
    const frases = ['La ensalada se asustó 🥗', 'Jaja, ni la ensalada se lo cree', 'La ensalada salió corriendo 🥗💨'];
    let intentos = 0;
    let ultima = 0;
    const huir = (e) => {
      if (e) e.preventDefault();
      const ahora = performance.now();
      if (ahora - ultima < 450 || !si.isConnected) return;
      ultima = ahora;
      intentos += 1;
      frase.textContent = frases[Math.min(intentos, frases.length) - 1];
      if (intentos >= frases.length) {
        si.classList.add('se-va');
        setTimeout(() => si.remove(), 400);
        return;
      }
      const W = arena.clientWidth - si.offsetWidth;
      const H = arena.clientHeight - si.offsetHeight;
      const rNo = { l: no.offsetLeft - 16, r: no.offsetLeft + no.offsetWidth + 16, t: no.offsetTop - 16, b: no.offsetTop + no.offsetHeight + 16 };
      for (let k = 0; k < 60; k++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const cruza = x < rNo.r && x + si.offsetWidth > rNo.l && y < rNo.b && y + si.offsetHeight > rNo.t;
        if (!cruza && Math.hypot(x - si.offsetLeft, y - si.offsetTop) > 70) {
          si.style.left = `${x}px`;
          si.style.top = `${y}px`;
          return;
        }
      }
    };
    si.addEventListener('touchstart', huir, { passive: false });
    si.addEventListener('pointerdown', huir);
    si.addEventListener('click', (e) => { e.preventDefault(); huir(); });
    si.addEventListener('focus', () => { huir(); no.focus(); });
    arena.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !si.isConnected) return;
      const r = si.getBoundingClientRect();
      if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < 80) huir();
    });
    no.addEventListener('click', () => mostrarPlato());

    function mostrarPlato() {
      const nombres = estado.menu.map((id) => ANTOJOS.find((a) => a.id === id));
      mostrar(hoja('',
        h('p', { class: 'eyebrow', text: 'Tu plato de cumpleaños' }),
        h('p', { class: 'plato', text: nombres.map((a) => a.icono).join(' ') }),
        h('h2', { class: 'titulo', text: lista(nombres.map((a) => a.nombre.toLowerCase())) }),
        h('p', { class: 'texto texto--suave', text: 'Anotado. Este pedido ya quedó en manos del chef. 👨‍🍳' }),
        seguir()));
    }

    return mostrar(hoja('',
      h('p', { class: 'eyebrow', text: 'Una pregunta del chef' }),
      h('h2', { class: 'titulo', text: '¿Le agregamos algo saludable? 🥗' }),
      arena, frase), () => {
      requestAnimationFrame(() => {
        si.style.left = `${arena.clientWidth * 0.18}px`;
        si.style.top = `${(arena.clientHeight - si.offsetHeight) / 2}px`;
        no.style.left = `${arena.clientWidth * 0.82 - no.offsetWidth}px`;
        no.style.top = `${(arena.clientHeight - no.offsetHeight) / 2}px`;
        arena.classList.add('lista');
      });
    });
  }

  function bolsillo() {
    const listo = seguir('Ya lo tengo 💌', { hidden: true });
    const pantalla = hoja('',
      h('p', { class: 'eyebrow', text: 'Misión en persona' }),
      h('p', { class: 'plato', text: '🧥' }),
      h('h2', { class: 'titulo', text: `Pídele a ${datos.de} lo que tiene guardado en el bolsillo` }),
      h('p', { class: 'texto texto--suave', text: 'Sin trampa: tiene que entregártelo en la mano.' }),
      listo);
    return mostrar(pantalla, () => setTimeout(() => { listo.hidden = false; }, RAPIDO ? 500 : 8000));
  }

  function carta() {
    const texto = h('div', { class: 'carta__texto' });
    const listo = seguir('Seguir', { hidden: true });
    const fotos = (datos.carta.fotos || []).map((src, i) => h('img', { class: `carta__foto carta__foto--${i + 1}`, src, alt: '' }));
    const partes = [datos.carta.saludo, ...datos.carta.parrafos];
    const pantalla = hoja('hoja--carta',
      h('div', { class: 'carta__fotos' }, fotos),
      texto,
      h('p', { class: 'carta__firma', text: `— ${datos.carta.firma}` }),
      listo);
    let saltar = false;
    pantalla.addEventListener('click', () => { saltar = true; });
    return mostrar(pantalla, async () => {
      for (const [i, parte] of partes.entries()) {
        const p = h('p', { class: i === 0 ? 'carta__saludo' : '' });
        texto.append(p);
        for (const ch of parte) {
          p.textContent += ch;
          if (!saltar && !reducido()) await esperar(ch === '.' || ch === ',' ? 160 : 34);
        }
        if (!saltar) await esperar(350);
      }
      pantalla.querySelector('.carta__firma').classList.add('visible');
      listo.hidden = false;
    });
  }

  /* ---------- Final: lámina, canción, WhatsApp ---------- */

  async function componerLamina() {
    const W = 1200;
    const H = 1560;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#F4ECE1';
    x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(176,141,87,.55)';
    x.lineWidth = 2;
    x.strokeRect(36, 36, W - 72, H - 72);
    try { await document.fonts.load('italic 500 80px "Cormorant Garamond"'); await document.fonts.load('400 30px Jost'); } catch { /* fuentes del sistema */ }
    x.fillStyle = '#7A1F2B';
    x.textAlign = 'center';
    x.font = 'italic 500 92px "Cormorant Garamond", Georgia, serif';
    x.fillText('Florece', W / 2, 170);
    const pintura = memoria.leer(`${CLAVE}:pintura`);
    const cargar = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
    const L = 1000;
    const y0 = 220;
    x.fillStyle = '#FBF7F1';
    x.fillRect((W - L) / 2, y0, L, L);
    const linea = await cargar(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(orquidea({ modo: 'linea', tallo: true, ancho: L, alto: L }))}`);
    if (linea) x.drawImage(linea, (W - L) / 2, y0, L, L);
    if (pintura) {
      const img = await cargar(pintura);
      x.globalCompositeOperation = 'multiply';
      if (img) x.drawImage(img, (W - L) / 2, y0, L, L);
      x.globalCompositeOperation = 'source-over';
    }
    const hoy = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    x.fillStyle = '#2E2622';
    x.font = 'italic 500 64px "Cormorant Garamond", Georgia, serif';
    x.fillText(`Pintada por ${datos.para}`, W / 2, y0 + L + 110);
    x.font = '400 28px Jost, sans-serif';
    x.fillStyle = 'rgba(46,38,34,.65)';
    x.fillText(`${hoy.toUpperCase()}  ·  CANTADA EN EL BOSQUE`.split('').join(' '), W / 2, y0 + L + 170);
    return new Promise((ok) => c.toBlob(ok, 'image/png'));
  }

  function final() {
    let blob = null;
    const vista = h('img', { class: 'lamina', alt: 'Tu orquídea pintada' });
    const guardarBtn = h('button', { class: 'btn', type: 'button', text: 'Guardar mi lámina', disabled: true });
    componerLamina().then((b) => {
      blob = b;
      if (!b) return;
      vista.src = URL.createObjectURL(b);
      guardarBtn.disabled = false;
    });
    guardarBtn.addEventListener('click', async () => {
      if (!blob) return;
      const archivo = new File([blob], 'mi-orquidea.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [archivo] })) {
        try { await navigator.share({ files: [archivo], title: 'Mi orquídea' }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = h('a', { href: URL.createObjectURL(blob), download: 'mi-orquidea.png' });
      document.body.append(a);
      a.click();
      a.remove();
    });

    const nombres = estado.menu.map((id) => ANTOJOS.find((a) => a.id === id)?.nombre.toLowerCase()).filter(Boolean);
    const mensaje = `🌸 Ya desperté el bosque, soplé las velas y pinté mi orquídea.\n\nMi plato de cumpleaños: ${lista(nombres) || 'sorpréndeme'}. 😋`;
    const c = datos.cancion;
    return mostrar(hoja('hoja--final',
      h('p', { class: 'eyebrow', text: 'Florecida' }),
      datos.portada && h('img', { class: 'final__foto', src: datos.portada, alt: '' }),
      h('h2', { class: 'titulo', text: `Feliz cumpleaños, ${datos.para}` }),
      vista,
      h('div', { class: 'acciones' },
        guardarBtn,
        c && h('a', { class: 'btn btn-claro', href: c.url, target: '_blank', rel: 'noopener', text: `Escuchar "${c.titulo}" 🎶` }),
        datos.whatsapp && h('a', {
          class: 'btn btn-claro', target: '_blank', rel: 'noopener',
          href: `https://api.whatsapp.com/send?phone=${datos.whatsapp}&text=${encodeURIComponent(mensaje)}`,
          text: `Mandarle mi pedido a ${datos.de}`,
        })),
      c && h('p', { class: 'credito', text: `Canción: "${c.titulo}", de ${c.artista}${c.nota ? ` (${c.nota})` : ''}. Todos los derechos son de su autor; aquí solo la enlazamos.` }),
      h('button', {
        class: 'enlace', type: 'button', text: 'Volver a empezar',
        onclick: () => { if (confirm('¿Empezar el bosque desde el principio?')) { memoria.borrar(); location.reload(); } },
      })));
  }

  /* ---------- Arranque ---------- */

  function aviso(titulo, texto) {
    return mostrar(hoja('', h('p', { class: 'eyebrow', text: 'Florece' }), h('h2', { class: 'titulo', text: titulo }), h('p', { class: 'texto', text: texto })));
  }

  function carpeta() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    if (!u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/[^/]*$/, (m) => (m.includes('.') ? '' : `${m}/`));
    return u;
  }

  async function descifrar(claveB64) {
    const b64 = claveB64.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const clave = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
    const r = await fetch(new URL('datos.enc', carpeta()), { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = await r.arrayBuffer();
    const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, clave, buf.slice(12));
    return JSON.parse(new TextDecoder().decode(plano));
  }

  async function iniciar() {
    montarBosque();
    const fragmento = location.hash.slice(1);
    const k = new URLSearchParams(fragmento).get('k') || (/^[\w-]{16,}$/.test(fragmento) ? fragmento : null);
    if (!k) return aviso('Este bosque está cerrado', 'Solo se abre con su tarjeta. 🌿');
    try {
      datos = await descifrar(k);
    } catch {
      return aviso('No pude abrir el bosque', 'Revisa la conexión y vuelve a escanear la tarjeta.');
    }
    window.__florece = { datos: { para: datos.para, petalos: datos.petalos.length }, pasos: PASOS, estado: () => estado };
    estado = { ...estado, ...(memoria.leer() || {}) };
    if (PASOS.indexOf('bosque') < estado.paso) despertarBosque();
    if (navigator.wakeLock) {
      const pedir = () => navigator.wakeLock.request('screen').catch(() => {});
      pedir();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pedir(); });
    }
    irAlPaso();
  }

  if (app) iniciar();
})();
