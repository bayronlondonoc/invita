/* Invita — lógica compartida de todas las invitaciones. Sin dependencias.
   Flujo: SOBRE → PREGUNTA → PLAN → CONFIRMADO, una pantalla a la vez. */
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
  const FRASE_FINAL = 'El No se rindió. Solo queda una opción 💛';
  const RISAS = ['jaja', '😜'];
  const TEMAS = ['personal', 'raices', 'curazaos'];
  const ZONA = 'America/Bogota';

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

  const primerNombre = (s = '') => s.trim().split(/\s+/)[0] || '';
  const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const slugificar = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  // "2026-10-08" → "jueves 8 de octubre" (sin coma, como se dice en Colombia)
  function fechaLarga(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const formato = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const p = Object.fromEntries(formato.formatToParts(new Date(Date.UTC(y, m - 1, d, 12))).map((x) => [x.type, x.value]));
    return `${p.weekday} ${p.day} de ${p.month}`;
  }

  // "18:00" → "6:00 p. m."
  function hora12(hhmm) {
    const [hh, mm] = hhmm.split(':').map(Number);
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
    return {
      ...c,
      horarios: Array.isArray(c.horarios) ? c.horarios : [],
      duracion_horas: Number(c.duracion_horas) > 0 ? Number(c.duracion_horas) : 3,
      tema: TEMAS.includes(c.tema) ? c.tema : 'personal',
      frases_no: Array.isArray(c.frases_no) && c.frases_no.length ? c.frases_no : FRASES_NO,
      intentos_para_desaparecer: Number.isInteger(c.intentos_para_desaparecer) && c.intentos_para_desaparecer > 0
        ? c.intentos_para_desaparecer : 7,
    };
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
    const inicial = (c.de || '').trim().charAt(0).toUpperCase() || '♥';
    const mitad = (lado) => h('span', { class: `sello__mitad sello__mitad--${lado}` },
      h('span', { class: 'sello__letra', text: inicial }));
    const sobre = h('button', { class: 'sobre', type: 'button', 'aria-label': 'Abrir la carta' },
      h('span', { class: 'sobre__interior' }),
      h('span', { class: 'sobre__carta', text: 'Para ti' }),
      h('span', { class: 'sobre__bolsillo' }, h('span', { class: 'sobre__destino', text: primerNombre(c.para) })),
      h('span', { class: 'sobre__solapa-wrap' }, h('span', { class: 'sobre__solapa' })),
      h('span', { class: 'sello', 'aria-hidden': 'true' }, mitad('izq'), mitad('der')));
    const pantalla = h('section', { class: 'pantalla pantalla--sobre' },
      sobre, h('p', { class: 'sobre__hint', text: 'Toca la carta' }));

    let abierto = false;
    sobre.addEventListener('click', async () => {
      if (abierto) return;
      abierto = true;
      sobre.classList.add('abierto');
      pantalla.classList.add('abriendo');
      await esperar(1950);
      mostrarPregunta(c);
    });
    return pantalla;
  }

  /* ---------- 2. Pregunta ---------- */

  function mostrarPregunta(c) {
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
      no.textContent = RISAS[(st.intentos - 1) % RISAS.length];
      no.classList.add('riendo');
      clearTimeout(st.risa);
      st.risa = setTimeout(() => {
        no.textContent = 'No';
        no.classList.remove('riendo');
      }, 700);
    }

    function vibrar() {
      if (!navigator.vibrate || navigator.userActivation?.hasBeenActive === false) return;
      try { navigator.vibrate(25); } catch { /* sin vibración */ }
    }

    function rendirse() {
      st.rendido = true;
      clearTimeout(st.risa);
      if (document.activeElement === no) si.focus({ preventScroll: true });
      no.tabIndex = -1;
      no.setAttribute('aria-hidden', 'true');
      no.classList.add('se-rinde');
      mostrarFrase(frase, FRASE_FINAL, true);
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
      terminar() {
        control.abort();
        observador.disconnect();
        clearTimeout(st.risa);
        return st.intentos;
      },
    };
  }

  async function celebrar(si, tarjeta, frase) {
    si.classList.add('elegido');
    tarjeta.classList.add('celebra');
    mostrarFrase(frase, 'Sabía que dirías que sí 💛', true);
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

  function mostrarPlan(c, intentos) {
    const confirmar = h('button', { class: 'btn btn-si btn-bloque', type: 'button', disabled: true, text: 'Confirmar' });
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

    const tarjeta = h('article', { class: 'tarjeta tarjeta--plan' },
      h('p', { class: 'eyebrow', text: 'El plan' }),
      h('h2', { class: 'titulo', tabindex: '-1', 'data-foco': true, text: c.plan_titulo }),
      h('p', { class: 'descripcion', text: c.plan_descripcion }),
      h('dl', { class: 'detalles' },
        h('div', {}, h('dt', { text: 'Cuándo' }), h('dd', { class: 'plan-fecha', text: capitalizar(fechaLarga(c.fecha)) })),
        c.lugar && h('div', {}, h('dt', { text: 'Dónde' }), h('dd', { text: c.lugar }))),
      c.pista && h('p', { class: 'pista' }, h('span', { class: 'etiqueta', text: 'Pista' }), c.pista),
      h('fieldset', { class: 'horarios' },
        h('legend', { class: 'etiqueta', text: c.horarios.length > 1 ? 'Escoge la hora' : 'Confirma la hora' }),
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

    mostrar(h('section', { class: 'pantalla pantalla--plan' }, tarjeta));
  }

  /* ---------- 4. Confirmado ---------- */

  function mensajeWhatsApp(c, r) {
    const n = r.intentos || 0;
    const intentos = n === 0
      ? 'Ni intenté decir que no 😌'
      : `Intenté decir que no ${n} ${n === 1 ? 'vez' : 'veces'} 😂`;
    // "6:00 p. m." ya termina en punto: no se agrega otro.
    const hora = hora12(r.hora).replace(/\.$/, '');
    let m = `¡Sí! 💛 Nos vemos el ${fechaLarga(c.fecha)} a las ${hora}. ${intentos}`;
    if (r.mensaje) m += `\n\n${r.mensaje}`;
    return m;
  }
  // Directo a api.whatsapp.com: el redireccionamiento de wa.me convierte los emojis en "�".
  const enlaceWhatsApp = (c, r) => `https://api.whatsapp.com/send?phone=${c.whatsapp_destino}&text=${encodeURIComponent(mensajeWhatsApp(c, r))}`;

  const tituloEvento = (c) => (c.de ? `${c.plan_titulo} con ${primerNombre(c.de)}` : c.plan_titulo);
  const detallesEvento = (c) => [c.plan_descripcion, c.pista && `Pista: ${c.pista}`, c.cierre].filter(Boolean).join('\n\n');

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
      h('p', { class: 'eyebrow', text: 'Es una cita' }),
      h('h2', { class: 'titulo', tabindex: '-1', 'data-foco': true, text: `Nos vemos, ${primerNombre(c.para)}` }),
      h('p', { class: 'resumen' },
        h('span', { class: 'resumen__fecha', text: capitalizar(fechaLarga(c.fecha)) }),
        h('span', { class: 'resumen__hora', text: hora12(r.hora) })),
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
      cita = normalizar(await r.json());
    } catch {
      mostrar(pantallaVacia('Esta carta no se pudo abrir. Intenta de nuevo en un momento.'));
      return;
    }
    TEMAS.forEach((t) => document.body.classList.remove(`tema-${t}`));
    document.body.classList.add(`tema-${cita.tema}`);

    // Gancho de solo lectura para las pruebas automáticas (scripts/probar.mjs).
    window.__invita = {
      cita,
      generarICS: (r) => generarICS(cita, r || guardado.leer()),
      mensajeWhatsApp: (r) => mensajeWhatsApp(cita, r || guardado.leer()),
    };

    const previa = guardado.leer();
    if (previa?.hora && cita.horarios.includes(previa.hora)) mostrarConfirmado(cita, previa);
    else mostrar(pantallaSobre(cita));
  }

  iniciar();
})();
