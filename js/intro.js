/*
 * Introducción interactiva de la pantalla de acceso.
 * Pista del logo → al deslizar, el lema «REPEAT IT, CONSISTENTLY.» → al seguir, el formulario de acceso.
 * Un corredor da vueltas a la pista; el desplazamiento le hace avanzar más deprisa.
 */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const W = 400;
  const H = 140;
  const CALLES = 6;
  const MARGEN = 13;
  const PASO = 8.6;

  const nodo = (tag, attrs, padre) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (padre) padre.append(n);
    return n;
  };
  /** Rectángulo de esquinas redondas como trazado (para poder recorrerlo con el corredor). */
  function trazadoCalle(ins) {
    const x = ins;
    const y = ins;
    const w = W - 2 * ins;
    const h = H - 2 * ins;
    const r = h / 2;
    // Empieza en el centro de la recta de abajo y gira en sentido antihorario (como en una pista real)
    return `M${x + w / 2} ${y + h} H${x + w - r} A${r} ${r} 0 0 0 ${x + w - r} ${y} H${x + r} A${r} ${r} 0 0 0 ${x + r} ${y + h} Z`;
  }

  function pista() {
    const svg = nodo('svg', { viewBox: `0 0 ${W} ${H}`, class: 'intro-pista', 'aria-hidden': 'true' });
    nodo('rect', { x: 0, y: 0, width: W, height: H, rx: H / 2, fill: '#c90100' }, svg);
    const calles = [];
    for (let i = 0; i < CALLES; i++) {
      calles.push(nodo('path', { d: trazadoCalle(MARGEN + i * PASO), class: 'intro-calle', pathLength: 1, style: `animation-delay:${i * 0.12}s` }, svg));
    }
    nodo('rect', { x: W / 2 - 1.4, y: 0, width: 2.8, height: H, fill: '#c90100' }, svg);
    // El corredor va por la calle central (entre la 3ª y la 4ª línea)
    const guia = nodo('path', { d: trazadoCalle(MARGEN + 2.5 * PASO), fill: 'none', stroke: 'none' }, svg);
    const estela = nodo('circle', { r: 9, class: 'intro-estela' }, svg);
    const corredor = nodo('circle', { r: 5.2, class: 'intro-corredor' }, svg);
    return { svg, guia, corredor, estela };
  }

  const tramo = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));

  /**
   * Crea la introducción. `irAlAcceso()` se llama al pulsar «Ir al acceso».
   * Devuelve el elemento (se limpia solo cuando sale del documento).
   */
  function crear({ irAlAcceso } = {}) {
    const reducido = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const p = pista();
    const palabra1 = el('span.intro-palabra.intro-palabra-1', 'FITNESS');
    const palabra2 = el('span.intro-palabra.intro-palabra-2', 'TRACKME');
    const firma = el('span.intro-firma', 'by Julimartin');
    const cajaPista = el('div.intro-pista-caja', p.svg);
    const logo = el('div.intro-logo', palabra1, cajaPista, palabra2, firma);
    const lema = el('p.intro-lema', el('span', 'REPEAT IT,'), el('span.rojo', 'CONSISTENTLY.'));
    const aviso = el('div.intro-desliza', { 'aria-hidden': 'true' }, el('span', 'Desliza'), el('span.intro-flecha'));
    const saltar = el('button.intro-saltar', { type: 'button', onclick: () => irAlAcceso && irAlAcceso() }, 'Ir al acceso ↓');
    const escena = el('div.intro-escena', logo, lema, aviso, saltar);
    const caja = el('section.intro' + (reducido ? '.intro-estatica' : ''), { 'aria-label': 'TRACKME Fitness by Julimartin. Repeat it, consistently.' }, escena);

    let progreso = 0;
    let vueltas = 0;
    let ultimo = performance.now();
    let activo = true;

    const aplicar = () => {
      const q = progreso;
      const fuera = tramo(q, 0.04, 0.3);
      palabra1.style.opacity = palabra2.style.opacity = firma.style.opacity = String(1 - fuera);
      palabra1.style.transform = `translateY(${-50 * fuera}px)`;
      palabra2.style.transform = firma.style.transform = `translateY(${50 * fuera}px)`;
      const acerca = tramo(q, 0.04, 0.36);
      const sube = tramo(q, 0.24, 0.5);
      const desvanece = tramo(q, 0.74, 0.98);
      cajaPista.style.transform = `translateY(${-9 * sube}vh) scale(${1 + (innerWidth < 600 ? 0.06 : 0.18) * acerca - 0.25 * desvanece})`;
      cajaPista.style.opacity = String(1 - 0.9 * desvanece);
      const entra = tramo(q, 0.3, 0.5);
      const sale = tramo(q, 0.7, 0.9);
      lema.style.opacity = String(entra * (1 - sale));
      lema.style.transform = `translateY(${24 * (1 - entra) - 30 * sale}px) scale(${0.94 + 0.06 * entra})`;
      aviso.style.opacity = String(1 - tramo(q, 0, 0.08));
      saltar.style.opacity = String(1 - tramo(q, 0.8, 0.95));
    };

    const medir = () => {
      const r = caja.getBoundingClientRect();
      const total = caja.offsetHeight - global.innerHeight;
      progreso = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
    };

    let progresoAnterior = 0;
    const bucle = (ahora) => {
      if (!caja.isConnected) {
        activo = false;
        global.removeEventListener('scroll', alDesplazar);
        global.removeEventListener('resize', alDesplazar);
        return;
      }
      const dt = Math.min(100, ahora - ultimo);
      ultimo = ahora;
      // Una vuelta cada 9 s y, además, 3 vueltas a lo largo de todo el desplazamiento
      vueltas += dt / 9000 + (progreso - progresoAnterior) * 3;
      progresoAnterior = progreso;
      const L = p.guia.getTotalLength();
      const f = ((vueltas % 1) + 1) % 1;
      const pt = p.guia.getPointAtLength(f * L);
      const atras = p.guia.getPointAtLength(((f - 0.012 + 1) % 1) * L);
      p.corredor.setAttribute('cx', pt.x);
      p.corredor.setAttribute('cy', pt.y);
      p.estela.setAttribute('cx', atras.x);
      p.estela.setAttribute('cy', atras.y);
      if (activo) requestAnimationFrame(bucle);
    };

    const alDesplazar = () => {
      medir();
      aplicar();
    };

    if (!reducido) {
      global.addEventListener('scroll', alDesplazar, { passive: true });
      global.addEventListener('resize', alDesplazar);
      requestAnimationFrame(() => {
        alDesplazar();
        requestAnimationFrame(bucle);
      });
    } else {
      // Sin movimiento: corredor quieto en la recta de abajo
      requestAnimationFrame(() => {
        const pt = p.guia.getPointAtLength(0);
        p.corredor.setAttribute('cx', pt.x);
        p.corredor.setAttribute('cy', pt.y);
        p.estela.setAttribute('r', 0);
      });
    }
    return caja;
  }

  const el = (...a) => U.el(...a);
  global.Intro = { crear };
})(window);
