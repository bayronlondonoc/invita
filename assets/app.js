/* Invita — lógica compartida de todas las invitaciones. Sin dependencias.
   Flujo: SOBRE → (LARGADA) → PREGUNTA → PLAN → CONFIRMADO, una pantalla a la vez. */
(() => {
  'use strict';

  const FRASES_NO = [
    'Uy, casi 😏',
    'Ese botón es más rápido que tú, jajaja',
    'Inténtalo otra vez… él no quiere',
    'El botón ya decidió por ti',
    'Jajaja, ya se está cansando de huir',
    'Última oportunidad… mentira, tampoco',
  ];
  const TEMAS = ['personal', 'raices', 'curazaos', 'rayo'];
  const ZONA = 'America/Bogota';

  /* Textos y efectos por tema: ESTILO_BASE vale para todos y cada tema cambia solo lo suyo. */
  const ESTILO_BASE = {
    sello: '',                  // texto del sello; vacío = inicial de quien invita
    hint: 'Toca la carta',
    grito: '',
    risas: ['jaja', '😜'],
    frasesNo: FRASES_NO,
    fraseFinal: 'El No se rindió. Solo queda una opción 💛',
    siAntes: 'Uy, ¿tan rápido? 😏 Primero intenta con el No',   // con "no_obligatorio"
    celebracion: 'Sabía que dirías que sí 💛',
    eyebrowPlan: 'El plan',
    etiquetaLugar: 'Dónde',
    escogeHora: 'Escoge la hora',
    confirmaHora: 'Confirma la hora',
    confirmar: 'Confirmar',
    eyebrowConfirmado: 'Es una cita',
    saludo: 'Nos vemos, {nombre}',
    inicioWhatsApp: '¡Sí! 💛',
    largada: false,             // semáforo de largada entre el sobre y la pregunta
    carretera: false,           // el No es un carro que baja por una vía sin fin hasta la meta del Sí
    carreteraHint: '',
    velocimetro: null,          // { desde, hasta, texto } en el plan
    carro: false,               // carro estacionado en la confirmación
    motor: false,               // pitos y motor con Web Audio, sin archivos
  };
  const ESTILOS = {
    rayo: {
      sello: '95',
      hint: 'Toca para arrancar',
      grito: '¡Ka-chow!',
      risas: ['💨', 'jaja'],
      frasesNo: [
        'Uy, casi 😏 Este No corre más que tú',
        'Ni a 200 km/h lo alcanzas 🏎️',
        'Ese No ya entró a pits',
        'Mate dice que mejor le des al Sí',
        'Ya me tienes derrapando por ti 😅',
        'Soy velocidad… pero contigo voy despacio 💛',
      ],
      fraseFinal: 'El No se fue a pits y no volvió 🏁 Solo queda el Sí',
      celebracion: '¡Ka-chow! Sabía que dirías que sí 😎',
      eyebrowPlan: 'Hoja de carrera',
      etiquetaLugar: 'Circuito',
      escogeHora: 'Escoge la hora de largada',
      confirmaHora: 'Hora de largada',
      confirmar: '¡Arrancamos!',
      eyebrowConfirmado: 'Bandera a cuadros',
      saludo: 'Nos vemos en la pista, {nombre}',
      inicioWhatsApp: '¡Ka-chow! ⚡',
      carreteraHint: 'Atrapa el No… si puedes 😏',
      largada: true,
      carretera: true,
      velocimetro: { desde: 200, hasta: 20, texto: 'Modo tranqui activado' },
      carro: true,
      motor: true,
    },
  };
  let estilo = ESTILO_BASE;

  const app = document.getElementById('app');
  const consultaMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducido = () => consultaMovimiento.matches;
  const esperar = (ms) => new Promise((r) => setTimeout(r, reducido() ? Math.min(ms, 320) : ms));

  /* ---------- Utilidades ---------- */

  function h(tag, props = {}, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of hijos.flat()) if (c != null && c !== false && c !== '') n.append(c);
    return n;
  }

  // Igual que h(), pero para dibujos SVG.
  function svg(tag, props = {}, ...hijos) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(props)) if (v != null) n.setAttribute(k, v);
    for (const c of hijos.flat()) if (c != null && c !== false) n.append(c);
    return n;
  }

  const primerNombre = (s = '') => s.trim().split(/\s+/)[0] || '';
  const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const minuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const slugificar = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  // "2026-10-08" → "jueves 8 de octubre" (sin coma, como se dice en Colombia)
  function fechaLarga(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const formato = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const p = Object.fromEntries(formato.formatToParts(new Date(Date.UTC(y, m - 1, d, 12))).map((x) => [x.type, x.value]));
    return `${p.weekday} ${p.day} de ${p.month}`;
  }

  // "18:00" → "6:00 p. m."; mediodía en punto → "12:00 m." (como se escribe en Colombia)
  function hora12(hhmm) {
    const [hh, mm] = hhmm.split(':').map(Number);
    if (hh === 12 && mm === 0) return '12:00 m.';
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`;
  }

  function carpeta() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    if (!u.pathname.endsWith('/')) {
      const ultimo = u.pathname.split('/').pop();
      u.pathname = ultimo.includes('.') ? u.pathname.slice(0, -ultimo.length) : `${u.pathname}/`;
    }
    return u;
  }

  const slug = decodeURIComponent((location.pathname.match(/\/c\/([^/]+)/) || [])[1] || 'cita');
  const CLAVE = `invita:${slug}`;
  const guardado = {
    leer() { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; } },
    escribir(v) { try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch { /* modo privado */ } },
  };

  function normalizar(c) {
    const tema = TEMAS.includes(c.tema) ? c.tema : 'personal';
    const e = { ...ESTILO_BASE, ...ESTILOS[tema] };
    const cita = {
      ...c,
      tema,
      horarios: Array.isArray(c.horarios) ? c.horarios : [],
      duracion_horas: Number(c.duracion_horas) > 0 ? Number(c.duracion_horas) : 3,
      frases_no: Array.isArray(c.frases_no) && c.frases_no.length ? c.frases_no : e.frasesNo,
      recorrido: Array.isArray(c.recorrido) ? c.recorrido.filter((p) => typeof p === 'string' && p.trim()) : [],
      frase_final: typeof c.frase_final === 'string' && c.frase_final.trim() ? c.frase_final : e.fraseFinal,
      no_obligatorio: c.no_obligatorio === true,
      intentos_para_desaparecer: Number.isInteger(c.intentos_para_desaparecer) && c.intentos_para_desaparecer > 0
        ? c.intentos_para_desaparecer : 7,
    };
    return { cita, estilo: e };
  }

  function vibrar(patron = 25) {
    if (!navigator.vibrate || navigator.userActivation?.hasBeenActive === false) return;
    try { navigator.vibrate(patron); } catch { /* sin vibración */ }
  }

  /* Pitos del semáforo y rugido de motor, sintetizados. Solo suenan si el tema lo pide
     y después del primer toque (los navegadores no dejan sonar nada antes). */
  const sonido = (() => {
    let ctx = null;
    function tono(frec, dur, vol, tipo = 'sine') {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = tipo;
      o.frequency.setValueAtTime(frec, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    return {
      preparar() {
        if (ctx) return;
        try {
          // iPhone: que suene como un video aunque el celular esté en silencio.
          if (navigator.audioSession) navigator.audioSession.type = 'playback';
          const Contexto = window.AudioContext || window.webkitAudioContext;
          if (!Contexto) return;
          ctx = new Contexto();
          // Desbloqueo de iOS: un sonido vacío dentro del mismo toque.
          const vacio = ctx.createBufferSource();
          vacio.buffer = ctx.createBuffer(1, 1, 22050);
          vacio.connect(ctx.destination);
          vacio.start(0);
          ctx.resume?.().catch(() => {});
        } catch { ctx = null; }
      },
      reanudar() {
        if (ctx && ctx.state !== 'running') ctx.resume?.().catch(() => {});
      },
      pito(frec, dur = 0.16) {
        if (!ctx) return;
        try { tono(frec, dur, 0.06); } catch { /* sin sonido */ }
      },
      llegada() {
        [660, 880, 1320].forEach((f, i) => setTimeout(() => this.pito(f, i === 2 ? 0.45 : 0.14), i * 130));
      },
      // Llanta que chilla: ruido filtrado más un silbido con vibrato.
      chirrido(dur = 0.45) {
        if (!ctx) return;
        try {
          const t = ctx.currentTime;
          const n = Math.floor(ctx.sampleRate * dur);
          const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
          const datos = buffer.getChannelData(0);
          for (let i = 0; i < n; i++) datos[i] = Math.random() * 2 - 1;
          const ruido = ctx.createBufferSource();
          const banda = ctx.createBiquadFilter();
          const g = ctx.createGain();
          ruido.buffer = buffer;
          banda.type = 'bandpass';
          banda.Q.value = 8;
          banda.frequency.setValueAtTime(2700, t);
          banda.frequency.linearRampToValueAtTime(1900, t + dur);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          ruido.connect(banda).connect(g).connect(ctx.destination);
          ruido.start(t);
          const o = ctx.createOscillator();
          const go = ctx.createGain();
          const lfo = ctx.createOscillator();
          const prof = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(1300, t);
          o.frequency.linearRampToValueAtTime(950, t + dur);
          lfo.frequency.value = 36;
          prof.gain.value = 70;
          lfo.connect(prof).connect(o.frequency);
          go.gain.setValueAtTime(0.0001, t);
          go.gain.exponentialRampToValueAtTime(0.035, t + 0.03);
          go.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(go).connect(ctx.destination);
          o.start(t);
          lfo.start(t);
          o.stop(t + dur + 0.05);
          lfo.stop(t + dur + 0.05);
        } catch { /* sin sonido */ }
      },
      motor(dur = 1.4) {
        if (!ctx) return;
        try {
          const t = ctx.currentTime;
          const filtro = ctx.createBiquadFilter();
          const g = ctx.createGain();
          filtro.type = 'lowpass';
          filtro.frequency.setValueAtTime(380, t);
          filtro.frequency.linearRampToValueAtTime(1500, t + dur * 0.5);
          filtro.frequency.linearRampToValueAtTime(600, t + dur);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.07, t + 0.09);
          g.gain.setValueAtTime(0.07, t + dur * 0.55);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          for (const [tipo, mult, vol] of [['sawtooth', 1, 1], ['square', 0.5, 0.45]]) {
            const o = ctx.createOscillator();
            const v = ctx.createGain();
            o.type = tipo;
            o.frequency.setValueAtTime(46 * mult, t);
            o.frequency.exponentialRampToValueAtTime(185 * mult, t + dur * 0.5);
            o.frequency.exponentialRampToValueAtTime(110 * mult, t + dur);
            v.gain.value = vol;
            o.connect(v).connect(filtro);
            o.start(t);
            o.stop(t + dur + 0.05);
          }
          // Vibrato rápido: el "tra-tra-tra" del motor.
          const lfo = ctx.createOscillator();
          const profundidad = ctx.createGain();
          lfo.frequency.setValueAtTime(16, t);
          lfo.frequency.linearRampToValueAtTime(44, t + dur * 0.5);
          profundidad.gain.value = 0.03;
          lfo.connect(profundidad).connect(g.gain);
          lfo.start(t);
          lfo.stop(t + dur + 0.05);
          filtro.connect(g).connect(ctx.destination);
        } catch { /* sin sonido */ }
      },
    };
  })();

  /* Carro de carreras rojo con el 95 y el rayo, dibujado aquí mismo (sin imágenes). */
  function carro() {
    const rueda = (cx) => svg('g', { class: 'carro__rueda' },
      svg('circle', { class: 'carro__llanta', cx, cy: 78, r: 17 }),
      svg('circle', { class: 'carro__rin', cx, cy: 78, r: 9.5 }),
      svg('path', { class: 'carro__rayos', d: `M${cx - 9} 78h18M${cx} 69v18` }),
      svg('circle', { class: 'carro__centro', cx, cy: 78, r: 3 }));
    const guardabarro = (cx) => svg('path', { class: 'carro__guardabarro', d: `M${cx - 21} 78a21 21 0 0 1 42 0z` });
    return svg('svg', { class: 'carro', viewBox: '0 0 240 100', 'aria-hidden': 'true', focusable: 'false' },
      svg('ellipse', { class: 'carro__sombra', cx: 126, cy: 95, rx: 106, ry: 5 }),
      svg('path', { class: 'carro__aleron', d: 'M8 36h32v6H8zM19 41h6v10h-6z' }),
      svg('path', {
        class: 'carro__cuerpo',
        d: 'M20 78L16 60C16 52 22 49 30 48L66 45C84 30 100 25 120 24L140 24C156 24 166 32 176 42L212 50C226 53 232 58 232 66L230 78Z',
      }),
      svg('path', { class: 'carro__brillo', d: 'M32 51L66 48C84 34 100 29 120 28L138 28' }),
      svg('path', { class: 'carro__ventana', d: 'M78 46C92 35 105 31 120 31L134 31L132 44Z' }),
      svg('path', { class: 'carro__rayo', d: 'M30 67L98 55L91 62L154 50L145 60L206 55L143 70L150 63L86 74L93 66Z' }),
      svg('text', { class: 'carro__numero', x: 120, y: 69, 'text-anchor': 'middle' }, '95'),
      svg('ellipse', { class: 'carro__ojo', cx: 155, cy: 38, rx: 10.5, ry: 7.5, transform: 'rotate(26 155 38)' }),
      svg('circle', { class: 'carro__iris', cx: 159, cy: 39.5, r: 4.6 }),
      svg('circle', { class: 'carro__pupila', cx: 160, cy: 39.5, r: 2.2 }),
      svg('circle', { class: 'carro__luz-ojo', cx: 161.3, cy: 38, r: 1.1 }),
      svg('ellipse', { class: 'carro__faro', cx: 221, cy: 57, rx: 5, ry: 3 }),
      svg('path', { class: 'carro__boca', d: 'M201 66C209 72.5 222 72.5 230 64.5' }),
      guardabarro(62), guardabarro(192),
      rueda(62), rueda(192));
  }

  /* El mismo carro visto desde arriba, con la trompa hacia abajo: es el No de la carretera. */
  function carroArriba() {
    const rueda = (x, y) => svg('rect', { class: 'carro__llanta', x, y, width: 8, height: 19, rx: 2.5 });
    const ojo = (cx) => [
      svg('ellipse', { class: 'carro__ojo', cx, cy: 67, rx: 6.5, ry: 5.5 }),
      svg('circle', { class: 'carro__iris', cx, cy: 69, r: 3.4 }),
      svg('circle', { class: 'carro__pupila', cx, cy: 69.6, r: 1.6 }),
      svg('circle', { class: 'carro__luz-ojo', cx: cx + 1.1, cy: 68.2, r: 0.8 }),
    ];
    return svg('svg', { class: 'carro carro--arriba', viewBox: '0 0 60 104', 'aria-hidden': 'true', focusable: 'false' },
      svg('ellipse', { class: 'carro__sombra', cx: 33, cy: 56, rx: 28, ry: 50 }),
      rueda(0, 15), rueda(52, 15), rueda(0, 72), rueda(52, 72),
      svg('path', {
        class: 'carro__cuerpo',
        d: 'M15 6C15 3 45 3 45 6L52 14C56 32 56 72 53 90C51 98 43 101 30 101C17 101 9 98 7 90C4 72 4 32 8 14Z',
      }),
      svg('rect', { class: 'carro__aleron', x: 3, y: 1, width: 54, height: 7, rx: 2.5 }),
      svg('path', { class: 'carro__ventana', d: 'M17 21H43L46 33H14Z' }),
      svg('text', { class: 'carro__numero carro__numero--techo', x: 30, y: 52, 'text-anchor': 'middle' }, '95'),
      svg('path', { class: 'carro__parabrisas', d: 'M12 59H48L45 75H15Z' }),
      ojo(22), ojo(38),
      svg('path', { class: 'carro__rayo', d: 'M7 34L12 45L9 45L13 58L6 47L9 47ZM53 34L48 45L51 45L47 58L54 47L51 47Z' }),
      svg('path', { class: 'carro__rayo', d: 'M33 77L25 88H30L27 98L37 85H32L35 77Z' }),
      svg('ellipse', { class: 'carro__faro', cx: 14, cy: 92, rx: 3.2, ry: 2.2 }),
      svg('ellipse', { class: 'carro__faro', cx: 46, cy: 92, rx: 3.2, ry: 2.2 }),
      svg('path', { class: 'carro__boca', d: 'M22 96.5Q30 100.5 38 96.5' }));
  }

  /* ---------- Transiciones entre pantallas ---------- */

  let actual = null;
  async function mostrar(nueva, alMontar) {
    if (actual) {
      actual.classList.remove('visible');
      actual.classList.add('saliendo');
      await esperar(420);
      actual.remove();
    }
    app.append(nueva);
    actual = nueva;
    alMontar?.(nueva);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => requestAnimationFrame(() => nueva.classList.add('visible')));
    nueva.querySelector('[data-foco]')?.focus({ preventScroll: true });
  }

  function mostrarFrase(nodo, texto, final = false) {
    nodo.classList.remove('entra');
    void nodo.offsetWidth;
    nodo.textContent = texto;
    nodo.classList.toggle('final', final);
    nodo.classList.add('entra');
  }

  /* ---------- 1. Sobre ---------- */

  function pantallaSobre(c) {
    const inicial = estilo.sello || (c.de || '').trim().charAt(0).toUpperCase() || '♥';
    const mitad = (lado) => h('span', { class: `sello__mitad sello__mitad--${lado}` },
      h('span', { class: 'sello__letra', text: inicial }));
    const sobre = h('button', { class: 'sobre', type: 'button', 'aria-label': 'Abrir la carta' },
      h('span', { class: 'sobre__interior' }),
      h('span', { class: 'sobre__carta', text: 'Para ti' }),
      h('span', { class: 'sobre__bolsillo' }, h('span', { class: 'sobre__destino', text: primerNombre(c.para) })),
      h('span', { class: 'sobre__solapa-wrap' }, h('span', { class: 'sobre__solapa' })),
      h('span', { class: 'sello', 'aria-hidden': 'true' }, mitad('izq'), mitad('der')));
    const pantalla = h('section', { class: 'pantalla pantalla--sobre' },
      sobre, h('p', { class: 'sobre__hint', text: estilo.hint }));

    let abierto = false;
    sobre.addEventListener('click', async () => {
      if (abierto) return;
      abierto = true;
      if (estilo.motor) sonido.preparar();
      sobre.classList.add('abierto');
      pantalla.classList.add('abriendo');
      await esperar(1950);
      if (estilo.largada) mostrarLargada(c);
      else mostrarPregunta(c);
    });
    return pantalla;
  }

  /* ---------- 1b. Largada: semáforo, grito y el carro que arranca ---------- */

  async function mostrarLargada(c) {
    const luces = [0, 1, 2].map(() => h('span', { class: 'luz' }));
    const grito = h('p', { class: 'largada__grito', 'aria-live': 'polite' });
    const pantalla = h('section', { class: 'pantalla pantalla--largada' },
      h('div', { class: 'semaforo', role: 'img', 'aria-label': 'Semáforo de largada' }, luces),
      grito,
      h('div', { class: 'largada__pista', 'aria-hidden': 'true' }, h('div', { class: 'largada__carro' }, carro())));
    await mostrar(pantalla);
    await esperar(600);
    for (const luz of luces) {
      luz.classList.add('roja');
      sonido.pito(520);
      await esperar(560);
    }
    luces.forEach((l) => l.classList.replace('roja', 'verde'));
    sonido.pito(880, 0.42);
    sonido.motor();
    vibrar([40, 30, 40, 30, 120]);
    mostrarFrase(grito, estilo.grito);
    pantalla.classList.add('arranca');
    await esperar(1500);
    mostrarPregunta(c);
  }

  /* ---------- 2. Pregunta ---------- */

  function mostrarPregunta(c) {
    if (estilo.carretera) {
      mostrarCarretera(c);
      return;
    }
    const si = h('button', { class: 'btn btn-si', type: 'button', text: 'Sí' });
    const no = h('button', { class: 'btn btn-no', type: 'button', 'aria-label': 'No', text: 'No' });
    const arena = h('div', { class: 'arena' }, si, no);
    const frase = h('p', { class: 'frase', 'aria-live': 'polite' });
    const tarjeta = h('article', { class: 'tarjeta' },
      h('p', { class: 'eyebrow', text: `Para ti, ${c.para}` }),
      h('h1', { class: 'pregunta', tabindex: '-1', 'data-foco': true, text: c.pregunta }),
      arena,
      frase,
      c.de && h('p', { class: 'firma', text: `— ${c.de}` }));

    let juego;
    mostrar(h('section', { class: 'pantalla pantalla--pregunta' }, tarjeta), () => {
      juego = montarArena({ arena, si, no, frase, cita: c });
    });

    let aceptado = false;
    si.addEventListener('click', async () => {
      if (aceptado || !juego) return;
      // Con "no_obligatorio" el Sí solo vale cuando el No ya se rindió.
      if (c.no_obligatorio && !juego.rendido()) {
        juego.frenarSi();
        return;
      }
      aceptado = true;
      const intentos = juego.terminar();
      await celebrar(si, tarjeta, frase);
      mostrarPlan(c, intentos);
    });
  }

  /* La mecánica del No. Coordenadas en px relativas a la arena; cada botón se
     posiciona por su centro y se mueve solo con transform. */
  function montarArena({ arena, si, no, frase, cita }) {
    const limite = cita.intentos_para_desaparecer;
    const frases = cita.frases_no;
    const PAD = 8;             // aire contra el borde de la arena
    const SEPARACION = 12;     // aire mínimo entre el No y el Sí
    const RADIO_RATON = 90;
    const RADIO_DEDO = 70;
    const LEJOS = 120;         // distancia mínima al puntero tras huir
    const PAUSA = 300;         // una huida por gesto (pointerdown + touchstart)
    const LECTURA = 1200;      // tiempo mínimo entre intentos contados: que cada frase se alcance a leer
    const VUELO = 480;         // lo que dura el salto (ver .arena .btn en styles.css)

    const st = { intentos: 0, rendido: false, ultima: -Infinity, ultimoConteo: -Infinity, W: 0, H: 0,
      si: { x: 0, y: 0 }, no: { x: 0, y: 0 }, risa: 0, bloqueo: 0 };
    const control = new AbortController();
    const opc = { signal: control.signal };

    const escNo = () => Math.max(0.45, 1 - 0.1 * st.intentos);
    const escSi = () => Math.min(1.6, 1 + 0.08 * st.intentos);
    const limitar = (v, a, b) => (a > b ? (a + b) / 2 : Math.min(b, Math.max(a, v)));
    const caja = (x, y, w, alto, m = 0) => ({ l: x - w / 2 - m, r: x + w / 2 + m, t: y - alto / 2 - m, b: y + alto / 2 + m });
    const cruza = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    const cajaSi = (m = 0) => caja(st.si.x, st.si.y, si.offsetWidth * escSi(), si.offsetHeight * escSi(), m);
    const cajaNo = (x, y) => caja(x, y, no.offsetWidth * escNo(), no.offsetHeight * escNo());
    const valida = (x, y) => {
      const b = cajaNo(x, y);
      return b.l >= PAD - 0.5 && b.t >= PAD - 0.5 && b.r <= st.W - PAD + 0.5 && b.b <= st.H - PAD + 0.5
        && !cruza(b, cajaSi(SEPARACION));
    };
    const aArena = (cx, cy) => {
      const r = arena.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    };
    const cercaDelNo = (cx, cy, margen) => {
      const r = no.getBoundingClientRect();
      return cx >= r.left - margen && cx <= r.right + margen && cy >= r.top - margen && cy <= r.bottom + margen;
    };

    function aplicar(boton, x, y, s) {
      boton.style.transform = `translate(${x - boton.offsetWidth / 2}px, ${y - boton.offsetHeight / 2}px) scale(${s})`;
    }
    function sinTransicion(boton, fn) {
      boton.style.transition = 'none';
      fn();
      void boton.offsetWidth;
      boton.style.transition = '';
    }

    function colocarSi(animar = true) {
      const s = escSi();
      const w = si.offsetWidth * s;
      const alto = si.offsetHeight * s;
      st.si.x = limitar(st.rendido ? st.W / 2 : st.W * 0.3, w / 2 + PAD, st.W - w / 2 - PAD);
      st.si.y = limitar(st.H / 2, alto / 2 + PAD, st.H - alto / 2 - PAD);
      const fn = () => aplicar(si, st.si.x, st.si.y, s);
      if (animar) fn(); else sinTransicion(si, fn);
    }

    function buscarPosicion(desde) {
      const s = escNo();
      const w = no.offsetWidth * s;
      const alto = no.offsetHeight * s;
      const x0 = w / 2 + PAD;
      const x1 = Math.max(x0, st.W - w / 2 - PAD);
      const y0 = alto / 2 + PAD;
      const y1 = Math.max(y0, st.H - alto / 2 - PAD);
      const evitar = cajaSi(SEPARACION);
      let mejor = null;
      let puntaje = -Infinity;
      for (let i = 0; i < 400; i++) {
        const x = x0 + Math.random() * (x1 - x0);
        const y = y0 + Math.random() * (y1 - y0);
        if (cruza(cajaNo(x, y), evitar)) continue;
        const dPuntero = desde ? Math.hypot(x - desde.x, y - desde.y) : Infinity;
        const dAntes = Math.hypot(x - st.no.x, y - st.no.y);
        if (dPuntero >= LEJOS && dAntes >= 60) return { x, y };
        const p = Math.min(dPuntero, LEJOS) * 2 + Math.min(dAntes, 60);
        if (p > puntaje) { puntaje = p; mejor = { x, y }; }
      }
      return mejor || { x: x1, y: y0 };
    }

    function moverNo(x, y, animar) {
      st.no = { x, y };
      const fn = () => aplicar(no, x, y, escNo());
      if (!animar) return sinTransicion(no, fn);
      if (reducido()) {
        no.classList.add('parpadeo');
        setTimeout(() => { sinTransicion(no, fn); no.classList.remove('parpadeo'); }, 130);
        return undefined;
      }
      return fn();
    }

    function reir() {
      no.textContent = estilo.risas[(st.intentos - 1) % estilo.risas.length];
      no.classList.add('riendo');
      clearTimeout(st.risa);
      st.risa = setTimeout(() => {
        no.textContent = 'No';
        no.classList.remove('riendo');
      }, 700);
    }

    // El No deja de existir para el usuario: sin foco, sin toques y desvaneciéndose.
    function apagarNo() {
      clearTimeout(st.risa);
      clearTimeout(st.bloqueo);
      if (document.activeElement === no) si.focus({ preventScroll: true });
      no.style.pointerEvents = 'none';
      no.tabIndex = -1;
      no.setAttribute('aria-hidden', 'true');
      no.classList.add('se-rinde');
    }

    function rendirse() {
      st.rendido = true;
      apagarNo();
      mostrarFrase(frase, cita.frase_final, true);
      setTimeout(() => {
        no.remove();
        colocarSi();
      }, reducido() ? 200 : 450);
    }

    function huir(desde) {
      if (st.rendido) return;
      const ahora = performance.now();
      if (ahora - st.ultima < PAUSA) return;
      st.ultima = ahora;
      // Mientras vuela no recibe toques: si el dedo sigue ahí, el evento cae en la arena.
      no.style.pointerEvents = 'none';
      clearTimeout(st.bloqueo);
      st.bloqueo = setTimeout(() => { no.style.pointerEvents = ''; }, VUELO);
      // Si la frase anterior aún se está leyendo, el No igual se escapa pero no cuenta intento.
      if (ahora - st.ultimoConteo < LECTURA) {
        const p = buscarPosicion(desde || st.no);
        moverNo(p.x, p.y, true);
        return;
      }
      st.ultimoConteo = ahora;
      st.intentos += 1;
      vibrar();
      if (st.intentos >= limite) {
        rendirse();
        return;
      }
      colocarSi();
      const p = buscarPosicion(desde || st.no);
      moverNo(p.x, p.y, true);
      reir();
      mostrarFrase(frase, frases[Math.min(st.intentos, frases.length) - 1]);
    }

    function medir() {
      st.W = arena.clientWidth;
      st.H = arena.clientHeight;
    }

    // Tras un cambio de tamaño: recalcula límites sin contar intento.
    function acomodar() {
      if (control.signal.aborted) return;
      medir();
      colocarSi(false);
      if (st.rendido) return;
      if (!valida(st.no.x, st.no.y)) {
        const p = buscarPosicion(null);
        moverNo(p.x, p.y, false);
      }
    }

    // Posición inicial: Sí a la izquierda, No a la derecha.
    medir();
    colocarSi(false);
    const w0 = no.offsetWidth;
    st.no = { x: limitar(st.W * 0.72, w0 / 2 + PAD, st.W - w0 / 2 - PAD), y: st.H / 2 };
    if (!valida(st.no.x, st.no.y)) st.no = buscarPosicion(null);
    moverNo(st.no.x, st.no.y, false);
    arena.classList.add('lista');

    /* Celular: el touchstart cancela el click sintético antes de que exista. */
    arena.addEventListener('touchstart', (e) => {
      if (st.rendido) return;
      const t = e.changedTouches[0];
      if (!t || si.contains(e.target)) return;
      if (no.contains(e.target) || cercaDelNo(t.clientX, t.clientY, 24)) {
        e.preventDefault();
        huir(aArena(t.clientX, t.clientY));
      }
    }, { passive: false, signal: control.signal });

    /* Respaldo para cualquier puntero (y ratón que llega muy rápido). */
    arena.addEventListener('pointerdown', (e) => {
      if (st.rendido || si.contains(e.target)) return;
      if (no.contains(e.target) || cercaDelNo(e.clientX, e.clientY, e.pointerType === 'mouse' ? 0 : 24)) {
        e.preventDefault();
        huir(aArena(e.clientX, e.clientY));
      }
    }, opc);

    /* Escritorio (y dedo arrastrando dentro de la arena): huye por cercanía. */
    document.addEventListener('pointermove', (e) => {
      if (st.rendido) return;
      const r = no.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (d < (e.pointerType === 'mouse' ? RADIO_RATON : RADIO_DEDO)) huir(aArena(e.clientX, e.clientY));
    }, { passive: true, signal: control.signal });

    /* Si aun así llegara un click, no hace nada más que huir. */
    no.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      huir(st.no);
    }, opc);

    /* Teclado: con foco o Enter también huye, y el foco salta al Sí. */
    no.addEventListener('focus', () => {
      huir(st.no);
      requestAnimationFrame(() => si.focus({ preventScroll: true }));
    }, opc);
    no.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        huir(st.no);
        si.focus({ preventScroll: true });
      }
    }, opc);
    no.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); }, opc);

    const observador = new ResizeObserver(acomodar);
    observador.observe(arena);
    window.addEventListener('resize', acomodar, opc);
    document.fonts?.ready.then(acomodar);

    return {
      rendido: () => st.rendido,
      frenarSi() {
        si.classList.remove('frena');
        void si.offsetWidth;
        si.classList.add('frena');
        mostrarFrase(frase, estilo.siAntes);
      },
      terminar() {
        control.abort();
        observador.disconnect();
        // Ya dijo que sí: durante la celebración el No no se puede tocar.
        apagarNo();
        return st.intentos;
      },
    };
  }

  /* ---------- 2b. Carretera: el No es el carro y la meta es el Sí ---------- */

  function mostrarCarretera(c) {
    const frase = h('p', { class: 'frase', 'aria-live': 'polite' });
    const lienzo = h('canvas', { class: 'carretera__lienzo', 'aria-hidden': 'true' });
    const placa = h('span', { class: 'carro-no__placa', 'aria-hidden': 'true', text: 'No' });
    const no = h('button', { class: 'btn-no carro-no', type: 'button', 'aria-label': 'No' }, carroArriba(), placa);
    const si = h('button', { class: 'btn btn-si carretera__si', type: 'button', hidden: true, text: 'Sí' });
    const via = h('div', { class: 'carretera' }, lienzo, no, si);
    const tarjeta = h('article', { class: 'tarjeta tarjeta--carretera' },
      h('p', { class: 'eyebrow', text: `Para ti, ${c.para}` }),
      h('h1', { class: 'pregunta', tabindex: '-1', 'data-foco': true, text: c.pregunta }),
      frase,
      via);

    let juego;
    mostrar(h('section', { class: 'pantalla pantalla--carretera' }, tarjeta), () => {
      juego = montarCarretera({ via, lienzo, no, placa, si, frase, cita: c });
    });

    let aceptado = false;
    si.addEventListener('click', async () => {
      if (aceptado || !juego?.enMeta()) return;
      aceptado = true;
      const intentos = juego.terminar();
      await celebrar(si, tarjeta, frase);
      mostrarPlan(c, intentos);
    });
  }

  /* La vía baja sin fin (la cámara avanza y el dibujo sube) con curvas suaves. El carro
     va a un tercio de la pantalla; cada intento de tocarlo lo hace cambiar de carril con
     derrape, chirrido y huellas en el asfalto. Al rendirse suelta la placa del No y la
     vía llega a la línea de meta, donde aparece el Sí. */
  function montarCarretera({ via, lienzo, no, placa, si, frase, cita }) {
    const limite = cita.intentos_para_desaparecer;
    const frases = cita.frases_no;
    const PAUSA = 300;         // una huida por gesto (pointerdown + touchstart)
    const LECTURA = 1200;      // tiempo mínimo entre intentos contados
    const VIRAJE = 520;        // lo que dura cada cambio de carril
    const CRUCERO = 150;       // px por segundo
    const RADIO_RATON = 90;
    const RADIO_DEDO = 70;
    const CELDA = 64;          // cada cuánto puede haber un árbol o flores al lado de la vía

    const css = getComputedStyle(via);
    const color = (n) => css.getPropertyValue(n).trim();
    const C = {
      terreno: color('--c-terreno'), arbol: color('--c-arbol'), arbolLuz: color('--c-arbol-luz'),
      flor: color('--c-acento'), flor2: color('--c-lacre'), via: color('--c-via'), raya: color('--c-raya'),
      borde: color('--c-papel'), piano: color('--c-acento'), huella: color('--c-huella-via'),
      polvo: color('--c-polvo'), cuadro: color('--c-cuadro'),
    };
    const g = lienzo.getContext('2d');
    const st = { W: 0, H: 0, ancho: 0, A: 0, camara: 0, vel: 0, antes: 0,
      lado: 0, desde: 0, hacia: 0, t0: -Infinity, rastro: null, huellas: [], polvo: [],
      intentos: 0, rendido: false, meta: null, enMeta: false, ultima: -Infinity, ultimoConteo: -Infinity,
      risa: 0, bloqueo: 0, x: 0, y: 0 };
    const control = new AbortController();
    const opc = { signal: control.signal };

    const centro = (wy) => st.W / 2 + st.A * (0.7 * Math.sin(wy / 190 + 0.6) + 0.3 * Math.sin(wy / 83 + 2.1));
    const pendiente = (wy) => st.A * ((0.7 / 190) * Math.cos(wy / 190 + 0.6) + (0.3 / 83) * Math.cos(wy / 83 + 2.1));
    const maxLado = () => Math.max(0, st.ancho / 2 - no.offsetWidth / 2 - 8);
    const carroY = () => Math.round(st.H * 0.3);
    const carril = () => (st.hacia > 0 ? 'derecho' : st.hacia < 0 ? 'izquierdo' : 'centro');
    const azar = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const cerca = (cx, cy, margen) => {
      const r = no.getBoundingClientRect();
      return cx >= r.left - margen && cx <= r.right + margen && cy >= r.top - margen && cy <= r.bottom + margen;
    };

    function medir() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      st.W = via.clientWidth;
      st.H = via.clientHeight;
      lienzo.width = Math.round(st.W * dpr);
      lienzo.height = Math.round(st.H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.ancho = Math.min(180, Math.max(124, st.W * 0.46));
      st.A = Math.max(0, (st.W - st.ancho) / 2 - 18);
      const lado = (st.rendido ? 0 : Math.sign(st.hacia || 1) * maxLado());
      st.lado = st.desde = st.hacia = lado;
      no.dataset.carril = carril();
    }

    // Punto del carro (coordenadas locales, trompa hacia abajo) llevado al mundo.
    function aMundo(lx, ly, grados) {
      const a = (grados * Math.PI) / 180;
      return [st.x + lx * Math.cos(a) - ly * Math.sin(a), st.camara + st.y + lx * Math.sin(a) + ly * Math.cos(a)];
    }

    function virar(ahora, haciaCentro = false) {
      st.desde = st.lado;
      st.hacia = haciaCentro ? 0 : (st.lado > 0 ? -maxLado() : maxLado());
      st.t0 = ahora;
      no.dataset.carril = carril();
      if (haciaCentro || reducido()) { st.rastro = null; return; }
      st.rastro = { llantas: [[], []], nacio: ahora };
      st.huellas.push(st.rastro);
      for (let i = 0; i < 7; i++) {
        const [wx, wy] = aMundo((i % 2 ? 1 : -1) * no.offsetWidth * 0.38, -no.offsetHeight * 0.3, 0);
        st.polvo.push({ wx, wy, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 40, nacio: ahora, r: 3 + Math.random() * 3 });
      }
      sonido.chirrido();
      sonido.motor(0.7);
    }

    function dibujar(ahora) {
      const { W, H, camara } = st;
      g.fillStyle = C.terreno;
      g.fillRect(0, 0, W, H);

      // Árboles y flores (las silletas de Santa Elena) a los lados, siempre en el mismo lugar del mundo.
      for (let i = Math.floor((camara - 30) / CELDA); i <= Math.ceil((camara + H + 30) / CELDA); i++) {
        for (const k of [0, 1]) {
          const n = i * 2 + k;
          if (azar(n) < 0.3) continue;
          const wy = i * CELDA + azar(n + 0.5) * CELDA;
          const borde = centro(wy) + (k ? 1 : -1) * (st.ancho / 2 + 14);
          const espacio = k ? W - borde - 8 : borde - 8;
          if (espacio < 12) continue;
          const x = k ? borde + azar(n + 0.7) * espacio : 8 + azar(n + 0.7) * espacio;
          const y = wy - camara;
          if (azar(n + 0.9) < 0.45) {
            const r = 7 + azar(n + 0.3) * 7;
            g.fillStyle = C.arbol;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
            g.fillStyle = C.arbolLuz;
            g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); g.fill();
          } else {
            for (let f = 0; f < 4; f++) {
              g.fillStyle = f % 2 ? C.flor2 : C.flor;
              g.beginPath(); g.arc(x + (azar(n + f) - 0.5) * 16, y + (azar(n + f + 0.2) - 0.5) * 12, 2.4, 0, Math.PI * 2); g.fill();
            }
          }
        }
      }

      // La vía: pianos rojo y blanco, asfalto y raya del centro.
      // Se dibuja más allá de los bordes: en curva, el corte recto del trazo quedaría a la vista.
      const fuera = st.ancho;
      g.beginPath();
      for (let sy = -fuera; sy <= H + fuera; sy += 8) {
        const x = centro(camara + sy);
        if (sy === -fuera) g.moveTo(x, sy); else g.lineTo(x, sy);
      }
      g.lineJoin = 'round';
      g.lineCap = 'butt';
      g.setLineDash([]);
      g.lineWidth = st.ancho + 12;
      g.strokeStyle = C.borde;
      g.stroke();
      g.setLineDash([12, 12]);
      g.lineDashOffset = camara;
      g.strokeStyle = C.piano;
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = st.ancho;
      g.strokeStyle = C.via;
      g.stroke();
      g.setLineDash([18, 16]);
      g.lineDashOffset = camara;
      g.lineWidth = 3;
      g.strokeStyle = C.raya;
      g.stroke();
      g.setLineDash([]);

      // Línea de meta a cuadros.
      if (st.meta != null) {
        const y = st.meta - camara;
        const x0 = centro(st.meta) - st.ancho / 2;
        const lado = 9;
        for (let fila = 0; fila < 2; fila++) {
          for (let col = 0; col * lado < st.ancho; col++) {
            g.fillStyle = (fila + col) % 2 ? C.cuadro : C.borde;
            g.fillRect(x0 + col * lado, y + fila * lado, Math.min(lado, st.ancho - col * lado), lado);
          }
        }
      }

      // Huellas de llanta que se van borrando.
      g.lineWidth = 5;
      g.setLineDash([3, 2]);
      g.strokeStyle = C.huella;
      st.huellas = st.huellas.filter((hu) => ahora - hu.nacio < 4500);
      for (const hu of st.huellas) {
        g.globalAlpha = Math.max(0, 1 - (ahora - hu.nacio) / 4500);
        for (const pts of hu.llantas) {
          if (pts.length < 2) continue;
          g.beginPath();
          pts.forEach(([wx, wy], i) => (i ? g.lineTo(wx, wy - camara) : g.moveTo(wx, wy - camara)));
          g.stroke();
        }
      }
      g.setLineDash([]);

      // Polvo del derrape.
      g.fillStyle = C.polvo;
      st.polvo = st.polvo.filter((p) => ahora - p.nacio < 750);
      for (const p of st.polvo) {
        const t = (ahora - p.nacio) / 750;
        g.globalAlpha = 0.85 * (1 - t);
        g.beginPath();
        g.arc(p.wx + p.vx * t, p.wy + p.vy * t - camara, p.r * (1 + t * 1.8), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    function cuadro(ahora) {
      if (control.signal.aborted) return;
      const dt = st.antes ? Math.min(0.05, (ahora - st.antes) / 1000) : 0;
      st.antes = ahora;

      if (!st.enMeta) {
        let objetivo = reducido() ? 0 : CRUCERO * (ahora - st.t0 < 700 ? 1.5 : 1);
        if (st.meta != null) {
          const falta = st.meta - (st.camara + carroY() + no.offsetHeight / 2) - 6;
          if (falta <= 0.5) llegar();
          else objetivo = Math.min(objetivo || CRUCERO, Math.max(14, falta * 2.4));
        }
        st.vel += (objetivo - st.vel) * Math.min(1, dt * 3);
        if (!st.enMeta) st.camara += st.vel * dt;
      }

      const dur = reducido() ? 1 : VIRAJE;
      const p = Math.min(1, (ahora - st.t0) / dur);
      st.lado = st.desde + (st.hacia - st.desde) * p * p * (3 - 2 * p);
      const wy = st.camara + carroY();
      st.x = centro(wy) + st.lado;
      st.y = carroY();
      const giro = (-Math.atan(pendiente(wy)) * 180) / Math.PI;
      const derrape = p < 1 && !reducido() ? -Math.sign(st.hacia - st.desde) * 22 * Math.sin(Math.PI * p) : 0;
      const angulo = Math.max(-45, Math.min(45, giro + derrape));
      no.style.transform = `translate(${(st.x - no.offsetWidth / 2).toFixed(1)}px, ${(st.y - no.offsetHeight / 2).toFixed(1)}px) rotate(${angulo.toFixed(2)}deg)`;

      if (st.rastro && p < 1) {
        [-1, 1].forEach((k, i) => st.rastro.llantas[i].push(aMundo(k * no.offsetWidth * 0.38, -no.offsetHeight * 0.3, angulo)));
      }
      if (st.enMeta) ponerSi();
      dibujar(ahora);
      requestAnimationFrame(cuadro);
    }

    function ponerSi() {
      const y = st.meta - st.camara + 18 + si.offsetHeight / 2;
      si.style.transform = `translate(${(centro(st.meta) - si.offsetWidth / 2).toFixed(1)}px, ${(y - si.offsetHeight / 2).toFixed(1)}px)`;
    }

    function llegar() {
      st.enMeta = true;
      st.vel = 0;
      si.hidden = false;
      ponerSi();
      si.classList.add('llega');
      sonido.llegada();
      vibrar([20, 40, 20]);
      si.focus({ preventScroll: true });
    }

    function reir() {
      placa.textContent = estilo.risas[(st.intentos - 1) % estilo.risas.length];
      clearTimeout(st.risa);
      st.risa = setTimeout(() => { placa.textContent = 'No'; }, 700);
    }

    function rendirse() {
      st.rendido = true;
      clearTimeout(st.risa);
      clearTimeout(st.bloqueo);
      placa.textContent = 'No';
      placa.classList.add('vuela');
      no.classList.add('rendido');
      no.style.pointerEvents = 'none';
      no.tabIndex = -1;
      no.setAttribute('aria-hidden', 'true');
      mostrarFrase(frase, cita.frase_final, true);
      // Ya sin la placa vuelve al centro de la vía, y la meta aparece adelante.
      setTimeout(() => virar(performance.now(), true), VIRAJE + 60);
      st.meta = reducido()
        ? st.camara + carroY() + no.offsetHeight / 2 + 6
        : st.camara + carroY() + st.H * 0.75;
    }

    function huir() {
      if (st.rendido) return;
      const ahora = performance.now();
      if (ahora - st.ultima < PAUSA) return;
      st.ultima = ahora;
      // Mientras vira no recibe toques: si el dedo sigue ahí, el evento cae en la vía.
      no.style.pointerEvents = 'none';
      clearTimeout(st.bloqueo);
      st.bloqueo = setTimeout(() => { if (!st.rendido) no.style.pointerEvents = ''; }, VIRAJE);
      if (reducido()) {
        no.classList.add('parpadeo');
        setTimeout(() => no.classList.remove('parpadeo'), 160);
      }
      virar(ahora);
      vibrar();
      // Si la frase anterior aún se está leyendo, el carro igual esquiva pero no cuenta intento.
      if (ahora - st.ultimoConteo < LECTURA) return;
      st.ultimoConteo = ahora;
      st.intentos += 1;
      if (st.intentos >= limite) {
        rendirse();
        return;
      }
      reir();
      mostrarFrase(frase, frases[Math.min(st.intentos, frases.length) - 1]);
    }

    medir();
    mostrarFrase(frase, estilo.carreteraHint);
    requestAnimationFrame((t) => {
      cuadro(t);
      via.classList.add('lista');
    });

    /* Celular: el touchstart cancela el click sintético antes de que exista. */
    via.addEventListener('touchstart', (e) => {
      sonido.reanudar();
      if (st.rendido) return;
      const t = e.changedTouches[0];
      if (!t || si.contains(e.target)) return;
      if (no.contains(e.target) || cerca(t.clientX, t.clientY, 24)) {
        e.preventDefault();
        huir();
      }
    }, { passive: false, signal: control.signal });

    via.addEventListener('pointerdown', (e) => {
      sonido.reanudar();
      if (st.rendido || si.contains(e.target)) return;
      if (no.contains(e.target) || cerca(e.clientX, e.clientY, e.pointerType === 'mouse' ? 0 : 24)) {
        e.preventDefault();
        huir();
      }
    }, opc);

    document.addEventListener('pointermove', (e) => {
      if (st.rendido) return;
      const r = no.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (d < (e.pointerType === 'mouse' ? RADIO_RATON : RADIO_DEDO)) huir();
    }, { passive: true, signal: control.signal });

    no.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      huir();
    }, opc);

    /* Teclado: el carro es el único control hasta la meta; Enter o espacio lo hacen esquivar. */
    no.addEventListener('focus', huir, opc);
    no.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        huir();
      }
    }, opc);
    no.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); }, opc);

    const observador = new ResizeObserver(() => { if (!control.signal.aborted) medir(); });
    observador.observe(via);

    return {
      enMeta: () => st.enMeta,
      terminar() {
        control.abort();
        observador.disconnect();
        clearTimeout(st.risa);
        clearTimeout(st.bloqueo);
        return st.intentos;
      },
    };
  }

  async function celebrar(si, tarjeta, frase) {
    si.classList.remove('frena', 'llega');
    si.classList.add('elegido');
    tarjeta.classList.add('celebra');
    mostrarFrase(frase, estilo.celebracion, true);
    sonido.motor(1.1);
    if (estilo.motor) vibrar([30, 40, 70]);
    if (!reducido()) {
      const rs = si.getBoundingClientRect();
      const rt = tarjeta.getBoundingClientRect();
      const x = rs.left - rt.left + rs.width / 2;
      const y = rs.top - rt.top + rs.height / 2;
      const capa = h('div', { class: 'destellos', 'aria-hidden': 'true' });
      const total = 16;
      for (let i = 0; i < total; i++) {
        const angulo = (i / total) * Math.PI * 2 + Math.random() * 0.3;
        const distancia = 56 + Math.random() * 64;
        const d = h('span', { class: 'destello' });
        d.style.left = `${x}px`;
        d.style.top = `${y}px`;
        d.style.setProperty('--dx', `${Math.cos(angulo) * distancia}px`);
        d.style.setProperty('--dy', `${Math.sin(angulo) * distancia - 18}px`);
        d.style.animationDelay = `${Math.random() * 140}ms`;
        capa.append(d);
      }
      tarjeta.append(capa);
    }
    await esperar(1500);
  }

  /* ---------- 3. Plan ---------- */

  // Velocímetro que baja de "desde" a "hasta": el plan va sin afán.
  function velocimetro({ desde, hasta, texto }) {
    const tope = Math.max(20, Math.ceil(Math.max(desde, hasta) / 20) * 20);
    const CX = 100;
    const CY = 100;
    const R = 80;
    const punto = (v, r) => {
      const a = Math.PI * (1 - v / tope);
      return { x: (CX + r * Math.cos(a)).toFixed(1), y: (CY - r * Math.sin(a)).toFixed(1) };
    };
    const marcas = [];
    for (let i = 0; i <= 20; i++) {
      const v = (tope / 20) * i;
      const a = punto(v, R - (i % 2 ? 6 : 11));
      const b = punto(v, R);
      marcas.push(svg('line', { class: i % 2 ? 'vel__marca' : 'vel__marca vel__marca--mayor', x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    }
    const numeros = [0, tope / 2, tope].map((v) => {
      const p = punto(v, R - 24);
      return svg('text', { class: 'vel__numero', x: p.x, y: p.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, String(v));
    });
    const zona = punto(tope * 0.8, R);
    const aguja = svg('g', { class: 'vel__aguja' },
      svg('line', { x1: CX, y1: CY, x2: CX - R + 16, y2: CY }),
      svg('circle', { cx: CX, cy: CY, r: 6 }));
    const angulo = (v) => `rotate(${(v / tope) * 180}deg)`;
    aguja.style.transform = angulo(desde);
    const lectura = h('span', { class: 'vel__lectura', text: String(desde) });
    const nodo = h('figure', { class: 'velocimetro', role: 'img', 'aria-label': `Velocímetro: baja de ${desde} a ${hasta} km/h. ${texto}` },
      svg('svg', { viewBox: '0 0 200 110', 'aria-hidden': 'true', focusable: 'false' },
        svg('path', { class: 'vel__arco', d: `M${CX - R} ${CY}A${R} ${R} 0 0 1 ${CX + R} ${CY}` }),
        svg('path', { class: 'vel__zona', d: `M${zona.x} ${zona.y}A${R} ${R} 0 0 1 ${CX + R} ${CY}` }),
        marcas, numeros, aguja),
      h('p', { class: 'vel__cifra', 'aria-hidden': 'true' }, lectura, h('span', { text: 'km/h' })),
      h('figcaption', { class: 'vel__texto', 'aria-hidden': 'true', text: texto }));

    async function animar() {
      await esperar(500);
      const dur = reducido() ? 0 : 1900;
      aguja.style.transition = dur ? `transform ${dur}ms cubic-bezier(.25, .8, .25, 1)` : 'none';
      aguja.style.transform = angulo(hasta);
      const t0 = performance.now();
      (function paso() {
        const p = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
        lectura.textContent = String(Math.round(desde + (hasta - desde) * (1 - (1 - p) ** 3)));
        if (p < 1) requestAnimationFrame(paso);
        else nodo.classList.add('listo');
      }());
    }
    return { nodo, animar };
  }

  // "Pits: cafés por descubrir" → etiqueta "Pits" + texto.
  function recorrido(pasos) {
    return h('div', { class: 'recorrido' },
      h('p', { class: 'etiqueta', text: 'El recorrido' }),
      h('ol', {}, pasos.map((p) => {
        const m = /^([^:]{1,24}):\s+(.+)$/.exec(p.trim());
        return h('li', {}, m ? [h('b', { text: m[1] }), h('span', { text: capitalizar(m[2]) })] : h('span', { text: p.trim() }));
      })));
  }

  function mostrarPlan(c, intentos) {
    const confirmar = h('button', { class: 'btn btn-si btn-bloque', type: 'button', disabled: true, text: estilo.confirmar });
    let hora = null;
    const chips = c.horarios.map((hh) => {
      const input = h('input', { type: 'radio', name: 'hora', value: hh });
      input.addEventListener('change', () => {
        hora = hh;
        confirmar.disabled = false;
      });
      return h('label', { class: 'chip' }, input, h('span', { text: hora12(hh) }));
    });

    const contador = h('span', { class: 'contador', 'aria-hidden': 'true', text: '0/200' });
    const area = h('textarea', {
      id: 'mensaje', maxlength: '200', rows: '3',
      placeholder: c.mensaje_placeholder ? 'Escríbelo aquí (opcional)' : 'Opcional',
    });
    area.addEventListener('input', () => { contador.textContent = `${area.value.length}/200`; });

    const vel = estilo.velocimetro && velocimetro(estilo.velocimetro);
    const tarjeta = h('article', { class: 'tarjeta tarjeta--plan' },
      h('p', { class: 'eyebrow', text: estilo.eyebrowPlan }),
      h('h2', { class: 'titulo', tabindex: '-1', 'data-foco': true, text: c.plan_titulo }),
      vel && vel.nodo,
      h('p', { class: 'descripcion', text: c.plan_descripcion }),
      h('dl', { class: 'detalles' },
        h('div', {}, h('dt', { text: 'Cuándo' }), h('dd', { class: 'plan-fecha', text: capitalizar(fechaLarga(c.fecha)) })),
        c.lugar && h('div', {}, h('dt', { text: estilo.etiquetaLugar }), h('dd', { text: c.lugar }))),
      c.recorrido.length ? recorrido(c.recorrido) : null,
      c.pista && h('p', { class: 'pista' }, h('span', { class: 'etiqueta', text: 'Pista' }), c.pista),
      h('fieldset', { class: 'horarios' },
        h('legend', { class: 'etiqueta', text: c.horarios.length > 1 ? estilo.escogeHora : estilo.confirmaHora }),
        h('div', { class: 'chips' }, chips)),
      h('div', { class: 'campo' },
        h('label', { class: 'campo__label', for: 'mensaje', text: c.mensaje_placeholder || '¿Algo que quieras decirme?' }),
        area, contador),
      confirmar);

    let enviado = false;
    confirmar.addEventListener('click', () => {
      if (!hora || enviado) return;
      enviado = true;
      const respuesta = { hora, mensaje: area.value.trim().slice(0, 200), intentos, respondida: new Date().toISOString() };
      guardado.escribir(respuesta);
      mostrarConfirmado(c, respuesta);
    });

    mostrar(h('section', { class: 'pantalla pantalla--plan' }, tarjeta), () => vel && vel.animar());
  }

  /* ---------- 4. Confirmado ---------- */

  function mensajeWhatsApp(c, r) {
    const n = r.intentos || 0;
    const intentos = n === 0
      ? 'Ni intenté decir que no 😌'
      : `Intenté decir que no ${n} ${n === 1 ? 'vez' : 'veces'} 😂`;
    // "6:00 p. m." ya termina en punto: al final de la frase no se agrega otro.
    const cuando = c.momento ? `${hora12(r.hora)}, ${minuscula(c.momento)}` : hora12(r.hora);
    let m = `${estilo.inicioWhatsApp} Nos vemos el ${fechaLarga(c.fecha)} a las ${cuando.replace(/\.$/, '')}. ${intentos}`;
    if (r.mensaje) m += `\n\n${r.mensaje}`;
    return m;
  }
  // Directo a api.whatsapp.com: el redireccionamiento de wa.me convierte los emojis en "�".
  const enlaceWhatsApp = (c, r) => `https://api.whatsapp.com/send?phone=${c.whatsapp_destino}&text=${encodeURIComponent(mensajeWhatsApp(c, r))}`;

  const tituloEvento = (c) => (c.de ? `${c.plan_titulo} con ${primerNombre(c.de)}` : c.plan_titulo);
  const detallesEvento = (c) => [
    c.plan_descripcion,
    c.momento,
    c.recorrido.map((p) => `• ${p}`).join('\n'),
    c.pista && `Pista: ${c.pista}`,
    c.cierre,
  ].filter(Boolean).join('\n\n');

  // Hora de pared en Bogotá → "20261008T180000" (se calcula en UTC solo para sumar sin desfases).
  function marcas(c, hora) {
    const [y, m, d] = c.fecha.split('-').map(Number);
    const [hh, mm] = hora.split(':').map(Number);
    const inicio = Date.UTC(y, m - 1, d, hh, mm);
    const fin = inicio + c.duracion_horas * 3600e3;
    const f = (t) => new Date(t).toISOString().slice(0, 19).replace(/[-:]/g, '');
    return { inicio: f(inicio), fin: f(fin) };
  }

  const escICS = (s) => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

  // Pliega a 73 octetos sin partir caracteres UTF-8 (RFC 5545 §3.1).
  function plegar(linea) {
    const cod = new TextEncoder();
    let salida = '';
    let tramo = '';
    let octetos = 0;
    for (const ch of linea) {
      const n = cod.encode(ch).length;
      if (octetos + n > 73) {
        salida += `${tramo}\r\n `;
        tramo = '';
        octetos = 1;
      }
      tramo += ch;
      octetos += n;
    }
    return salida + tramo;
  }

  function generarICS(c, r) {
    const { inicio, fin } = marcas(c, r.hora);
    const ahora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Invita//Invitaciones//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE', `TZID:${ZONA}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
      'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0500', 'TZNAME:-05', 'END:STANDARD', 'END:VTIMEZONE',
      'BEGIN:VEVENT',
      `UID:${slug}-${c.fecha}-${r.hora.replace(':', '')}@invita`,
      `DTSTAMP:${ahora}`,
      `DTSTART;TZID=${ZONA}:${inicio}`,
      `DTEND;TZID=${ZONA}:${fin}`,
      `SUMMARY:${escICS(tituloEvento(c))}`,
      `DESCRIPTION:${escICS(detallesEvento(c))}`,
      c.lugar && `LOCATION:${escICS(c.lugar)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Recordatorio', 'TRIGGER:-PT2H', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).map(plegar).join('\r\n') + '\r\n';
  }

  function descargarICS(c, r) {
    const url = URL.createObjectURL(new Blob([generarICS(c, r)], { type: 'text/calendar;charset=utf-8' }));
    const esIOS = /iP(hone|ad|od)/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (esIOS) {
      // iOS abre el .ics directamente en Calendario en vez de "descargarlo".
      location.href = url;
    } else {
      const a = h('a', { href: url, download: `${slugificar(c.plan_titulo) || 'cita'}.ics` });
      document.body.append(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function enlaceGoogle(c, r) {
    const { inicio, fin } = marcas(c, r.hora);
    const p = new URLSearchParams({
      action: 'TEMPLATE', text: tituloEvento(c), dates: `${inicio}/${fin}`, ctz: ZONA, details: detallesEvento(c),
    });
    if (c.lugar) p.set('location', c.lugar);
    return `https://calendar.google.com/calendar/render?${p}`;
  }

  function mostrarConfirmado(c, r) {
    const calendario = h('button', { class: 'btn btn-borde btn-bloque', type: 'button', text: 'Añadir a mi calendario' });
    calendario.addEventListener('click', () => descargarICS(c, r));
    const tarjeta = h('article', { class: 'tarjeta tarjeta--confirmado' },
      estilo.carro && h('div', { class: 'confirmado__carro', 'aria-hidden': 'true' }, carro()),
      h('p', { class: 'eyebrow', text: estilo.eyebrowConfirmado }),
      h('h2', { class: 'titulo', tabindex: '-1', 'data-foco': true, text: estilo.saludo.replace('{nombre}', primerNombre(c.para)) }),
      h('p', { class: 'resumen' },
        h('span', { class: 'resumen__fecha', text: capitalizar(fechaLarga(c.fecha)) }),
        h('span', { class: 'resumen__hora', text: hora12(r.hora) }),
        c.momento && h('span', { class: 'resumen__momento', text: c.momento })),
      c.lugar && h('p', { class: 'resumen__lugar', text: c.lugar }),
      c.cierre && h('p', { class: 'cierre', text: c.cierre }),
      c.de && h('p', { class: 'firma', text: `— ${c.de}` }),
      h('div', { class: 'acciones' },
        c.whatsapp_destino && h('a', {
          class: 'btn btn-si btn-bloque btn-whatsapp', href: enlaceWhatsApp(c, r), target: '_blank', rel: 'noopener',
        }, 'Avisarle por WhatsApp'),
        calendario,
        h('a', { class: 'enlace', href: enlaceGoogle(c, r), target: '_blank', rel: 'noopener', text: 'o agrégala a Google Calendar' })));
    mostrar(h('section', { class: 'pantalla pantalla--confirmado' }, tarjeta));
  }

  /* ---------- Arranque ---------- */

  function pantallaVacia(texto) {
    return h('section', { class: 'pantalla' },
      h('article', { class: 'tarjeta tarjeta--vacia' },
        h('span', { class: 'sello-mini', 'aria-hidden': 'true' }),
        h('p', { class: 'vacia', text: texto })));
  }

  async function iniciar() {
    let cita;
    try {
      const r = await fetch(new URL('cita.json', carpeta()), { cache: 'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
      ({ cita, estilo } = normalizar(await r.json()));
    } catch {
      mostrar(pantallaVacia('Esta carta no se pudo abrir. Intenta de nuevo en un momento.'));
      return;
    }
    TEMAS.forEach((t) => document.body.classList.remove(`tema-${t}`));
    document.body.classList.add(`tema-${cita.tema}`);

    // Gancho de solo lectura para las pruebas automáticas (scripts/probar.mjs).
    window.__invita = {
      cita,
      estilo,
      generarICS: (r) => generarICS(cita, r || guardado.leer()),
      mensajeWhatsApp: (r) => mensajeWhatsApp(cita, r || guardado.leer()),
    };

    const previa = guardado.leer();
    if (previa?.hora && cita.horarios.includes(previa.hora)) mostrarConfirmado(cita, previa);
    else mostrar(pantallaSobre(cita));
  }

  iniciar();
})();
