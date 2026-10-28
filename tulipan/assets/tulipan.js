/* Una sorpresa en forma de tulipán: TULIPÁN → PERGAMINO → CAMPO DE TULIPANES. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esperar = (ms) => new Promise((r) => setTimeout(r, reducido() ? Math.min(ms, 350) : ms));
  const NS = 'http://www.w3.org/2000/svg';
  const COLORES = ['--rosa', '--naranja', '--mostaza', '--lila', '--turquesa'];
  const azar = (a, b) => a + Math.random() * (b - a);

  function svg(tag, props = {}, ...hijos) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(props)) n.setAttribute(k, v);
    n.append(...hijos);
    return n;
  }

  let vistaActual = $('v-capullo');
  async function mostrarVista(id, alMostrar) {
    const nueva = $(id);
    vistaActual.classList.remove('visible');
    await esperar(800);
    vistaActual.hidden = true;
    nueva.hidden = false;
    alMostrar?.();
    void nueva.offsetWidth;
    nueva.classList.add('visible');
    vistaActual = nueva;
  }

  /* Margaritas flotando, flower power. */
  function margarita(color) {
    const petalos = [];
    for (let i = 0; i < 8; i++) {
      petalos.push(svg('ellipse', { cx: 50, cy: 22, rx: 11, ry: 20, transform: `rotate(${i * 45} 50 50)` }));
    }
    return svg('svg', { viewBox: '0 0 100 100' },
      svg('g', { class: 'margarita__petalos', style: `--color: var(${color})` }, ...petalos),
      svg('circle', { class: 'margarita__centro', cx: 50, cy: 50, r: 14 }));
  }
  const caja = $('margaritas');
  for (let i = 0; i < 9; i++) {
    const m = document.createElement('span');
    m.className = 'margarita';
    m.style.cssText = `--x:${azar(-4, 92).toFixed(1)}%;--y:${azar(-4, 50).toFixed(1)}%;--tam:${azar(26, 58).toFixed(0)}px;`
      + `--dx:${azar(-30, 30).toFixed(0)}px;--dy:${azar(-40, 40).toFixed(0)}px;--dur:${azar(7, 12).toFixed(1)}s;`
      + `--retraso:${(-azar(0, 10)).toFixed(1)}s;--color:var(${COLORES[i % COLORES.length]});opacity:${azar(0.55, 0.9).toFixed(2)}`;
    m.append(margarita(COLORES[i % COLORES.length]));
    caja.append(m);
  }

  /* 1 → 2: el tulipán se abre, sale el pergamino y se desenrolla. */
  $('tulipan').addEventListener('click', async () => {
    const t = $('tulipan');
    if (t.classList.contains('abierto')) return;
    t.classList.add('abierto');
    $('v-capullo').classList.add('abriendo');
    await esperar(2300);
    document.body.classList.add('leyendo');
    await mostrarVista('v-carta');
    await esperar(150);
    $('pergamino').classList.add('desenrollado');
    await esperar(1500);
    $('carta').focus({ preventScroll: true });
  });

  const carta = $('carta');
  carta.addEventListener('scroll', () => {
    if (carta.scrollTop > 40) $('pista-carta').classList.add('oculta');
  }, { passive: true });

  /* 2 → 3: el campo de tulipanes. */
  function tulipanCampo(color) {
    return svg('svg', { viewBox: '0 0 60 200', preserveAspectRatio: 'xMidYMax meet' },
      svg('path', { class: 'tallo', d: 'M30 200C29 160 32 120 30 70' }),
      svg('path', { class: 'hoja-tallo', d: 'M29 185C14 176 6 156 9 134C20 146 28 164 29 185Z', fill: 'var(--verde)' }),
      svg('g', { class: 'cabeza', style: `fill: var(${color})` },
        svg('path', { d: 'M30 22C42 34 43 62 30 74C17 62 18 34 30 22Z', opacity: '.8' }),
        svg('path', { d: 'M30 76C15 72 9 52 12 30C21 38 29 54 30 76Z' }),
        svg('path', { d: 'M30 76C45 72 51 52 48 30C39 38 31 54 30 76Z' })));
  }

  async function irAlCampo() {
    const campo = $('campo');
    campo.innerHTML = '';
    const total = window.innerWidth < 500 ? 11 : 17;
    for (let i = 0; i < total; i++) {
      const f = document.createElement('span');
      f.className = 'flor-campo';
      const x = (i + 0.5) / total * 100 + azar(-3, 3);
      const alto = azar(36, 62);
      f.style.cssText = `--x:calc(${x.toFixed(1)}% - ${(alto * 0.15).toFixed(1)}vh);--alto:${alto.toFixed(0)}vh;--ancho:${(alto * 0.3).toFixed(1)}vh;`
        + `--retraso:${(Math.abs(i - total / 2) * 0.12 + azar(0, 0.2)).toFixed(2)}s;--vaiven:${azar(3, 5).toFixed(1)}s;z-index:${Math.round(100 - alto)}`;
      f.append(tulipanCampo(COLORES[i % COLORES.length]));
      campo.append(f);
    }
    document.body.classList.remove('leyendo');
    await mostrarVista('v-campo');
  }
  $('recibir').addEventListener('click', irAlCampo);

  $('otra-vez').addEventListener('click', async () => {
    $('pista-carta').classList.remove('oculta');
    document.body.classList.add('leyendo');
    await mostrarVista('v-carta', () => { carta.scrollTop = 0; });
    carta.focus({ preventScroll: true });
  });
})();
