/*
 * Ilustraciones animadas de los ejercicios.
 *
 * Cada ejercicio se dibuja con una figura articulada vista de lado (mirando a la derecha).
 * Una postura se describe con:
 *   cadera: [x, y]           posición de la cadera
 *   t: ángulo del tronco     (grados; 0 = derecha, 90 = arriba)
 *   c: ángulo de la cabeza   (por defecto, el del tronco)
 *   Piernas: tob1 / tob2 = [x, y] posición del tobillo (se calcula la rodilla), o m1/p1 ángulos muslo/pierna
 *   Brazos:  mano1 / mano2 = [x, y] posición de la mano, o b1/a1 ángulos brazo/antebrazo
 *   f1 / f2: ángulo del pie
 * El "1" es el lado cercano (oscuro) y el "2" el lejano (claro). Si falta el 2, copia el 1.
 * La animación interpola entre posturas, así las extremidades nunca cambian de longitud.
 */
(function (global) {
  'use strict';

  const SUELO = 150;
  const L = { tronco: 46, cuello: 6, cabeza: 8, brazo: 26, antebrazo: 24, muslo: 34, pierna: 33, pie: 11 };
  const RAD = Math.PI / 180;
  const NS = 'http://www.w3.org/2000/svg';

  const dir = (a, l) => [Math.cos(a * RAD) * l, -Math.sin(a * RAD) * l];
  const mas = (p, v) => [p[0] + v[0], p[1] + v[1]];
  const angulo = (p, q) => Math.atan2(-(q[1] - p[1]), q[0] - p[0]) / RAD;

  /** Dos segmentos desde `raiz` hasta `objetivo`. `lado` = 1 dobla en un sentido, -1 en el otro. */
  function ik(raiz, objetivo, l1, l2, lado) {
    const dx = objetivo[0] - raiz[0];
    const dy = objetivo[1] - raiz[1];
    let d = Math.hypot(dx, dy);
    const max = l1 + l2 - 0.01;
    const min = Math.abs(l1 - l2) + 0.01;
    d = Math.min(Math.max(d, min), max);
    const base = Math.atan2(-dy, dx) / RAD;
    const alfa = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)) / RAD;
    const a1 = base + lado * alfa;
    const codo = mas(raiz, dir(a1, l1));
    const fin = mas(codo, dir(angulo(codo, objetivo), l2));
    return [codo, fin];
  }

  function esqueleto(p) {
    const cadera = p.cadera || [100, 81];
    const t = p.t == null ? 90 : p.t;
    const hombro = mas(cadera, dir(t, L.tronco));
    const cuello = mas(hombro, dir(p.c == null ? t : p.c, L.cuello));
    const cabeza = mas(cuello, dir(p.c == null ? t : p.c, L.cabeza));
    const ojo = mas(cabeza, dir((p.c == null ? t : p.c) - 90, 4.2));

    const pierna = (n) => {
      const tob = p['tob' + n] || p.tob1;
      let rodilla, tobillo;
      if (tob) {
        [rodilla, tobillo] = ik(cadera, tob, L.muslo, L.pierna, p['dr' + n] || p.dr1 || 1);
      } else {
        const m = p['m' + n] != null ? p['m' + n] : p.m1 != null ? p.m1 : 270;
        const pp = p['p' + n] != null ? p['p' + n] : p.p1 != null ? p.p1 : 270;
        rodilla = mas(cadera, dir(m, L.muslo));
        tobillo = mas(rodilla, dir(pp, L.pierna));
      }
      const f = p['f' + n] != null ? p['f' + n] : p.f1 != null ? p.f1 : 0;
      return { rodilla, tobillo, punta: mas(tobillo, dir(f, L.pie)) };
    };
    const brazo = (n) => {
      const mano = p['mano' + n] || p.mano1;
      if (mano) {
        const [codo, m] = ik(hombro, mano, L.brazo, L.antebrazo, p['db' + n] || p.db1 || -1);
        return { codo, mano: m };
      }
      const b = p['b' + n] != null ? p['b' + n] : p.b1 != null ? p.b1 : 270;
      const a = p['a' + n] != null ? p['a' + n] : p.a1 != null ? p.a1 : 270;
      const codo = mas(hombro, dir(b, L.brazo));
      return { codo, mano: mas(codo, dir(a, L.antebrazo)) };
    };
    return { cadera, hombro, cuello, cabeza, ojo, p1: pierna(1), p2: pierna(2), b1: brazo(1), b2: brazo(2) };
  }

  /* Interpolación de posturas: mezcla números y pares [x, y]; si una clave falta en una de las dos, se usa la otra. */
  function mezclar(a, b, k) {
    const r = {};
    const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const c of claves) {
      const va = a[c] != null ? a[c] : b[c];
      const vb = b[c] != null ? b[c] : a[c];
      if (Array.isArray(va)) r[c] = [va[0] + (vb[0] - va[0]) * k, va[1] + (vb[1] - va[1]) * k];
      else if (typeof va === 'number') r[c] = va + (vb - va) * k;
      else r[c] = k < 0.5 ? va : vb;
    }
    return r;
  }

  /* ---------- Dibujo ---------- */
  const COLOR = { cerca: '#1d2433', lejos: '#9aa3b5', piel: '#1d2433', disco: '#d6452f', barra: '#4b5363', mueble: '#c9ced8', mueble2: '#a9b0bd' };

  function nodo(tag, attrs, padre) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (padre) padre.append(n);
    return n;
  }
  const linea = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');

  function dibujarAccesorio(g, acc, esq) {
    const sitio = (s) => (s === 'mano2' ? esq.b2.mano : s === 'hombro' ? esq.hombro : esq.b1.mano);
    if (acc.tipo === 'barra') {
      const [x, y] = sitio(acc.en);
      const r = acc.r || 13;
      nodo('circle', { cx: x, cy: y, r, fill: COLOR.disco, stroke: '#a3311f', 'stroke-width': 2 }, g);
      nodo('circle', { cx: x, cy: y, r: r * 0.45, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.5, 'stroke-width': 1.5 }, g);
      nodo('circle', { cx: x, cy: y, r: 2.6, fill: COLOR.barra }, g);
    } else if (acc.tipo === 'mancuerna') {
      for (const s of acc.ambas ? ['mano2', 'mano1'] : [acc.en || 'mano1']) {
        const [x, y] = sitio(s);
        const lejos = s === 'mano2';
        nodo('rect', { x: x - 8, y: y - 2, width: 16, height: 4, rx: 1.5, fill: lejos ? COLOR.lejos : COLOR.barra }, g);
        nodo('rect', { x: x - 10, y: y - 6, width: 5, height: 12, rx: 1.5, fill: lejos ? '#e9a397' : COLOR.disco }, g);
        nodo('rect', { x: x + 5, y: y - 6, width: 5, height: 12, rx: 1.5, fill: lejos ? '#e9a397' : COLOR.disco }, g);
      }
    } else if (acc.tipo === 'pesa_rusa') {
      const [x, y] = sitio(acc.en);
      nodo('path', { d: `M${x - 5} ${y + 3} Q${x} ${y - 7} ${x + 5} ${y + 3}`, fill: 'none', stroke: COLOR.barra, 'stroke-width': 3 }, g);
      nodo('circle', { cx: x, cy: y + 11, r: 9, fill: COLOR.barra }, g);
      nodo('rect', { x: x - 6, y: y + 18, width: 12, height: 3, rx: 1, fill: COLOR.barra }, g);
    }
  }

  function dibujarMueble(g, m) {
    if (m.tipo === 'banco') {
      nodo('rect', { x: m.x, y: m.y, width: m.w, height: 7, rx: 3, fill: COLOR.mueble2 }, g);
      nodo('rect', { x: m.x + 6, y: m.y + 7, width: 5, height: SUELO - m.y - 7, fill: COLOR.mueble }, g);
      nodo('rect', { x: m.x + m.w - 11, y: m.y + 7, width: 5, height: SUELO - m.y - 7, fill: COLOR.mueble }, g);
    } else if (m.tipo === 'cajon') {
      nodo('rect', { x: m.x, y: m.y, width: m.w, height: SUELO - m.y, rx: 3, fill: COLOR.mueble, stroke: COLOR.mueble2, 'stroke-width': 2 }, g);
    } else if (m.tipo === 'barra_fija') {
      nodo('line', { x1: m.x1, y1: m.y, x2: m.x2, y2: m.y, stroke: COLOR.barra, 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
      nodo('line', { x1: m.x1, y1: m.y, x2: m.x1, y2: SUELO, stroke: COLOR.mueble, 'stroke-width': 4 }, g);
      nodo('line', { x1: m.x2, y1: m.y, x2: m.x2, y2: SUELO, stroke: COLOR.mueble, 'stroke-width': 4 }, g);
    }
  }

  function pintar(svg, def, postura) {
    const esq = esqueleto(postura);
    svg.textContent = '';
    nodo('line', { x1: 4, y1: SUELO + 1.5, x2: 196, y2: SUELO + 1.5, stroke: '#c9ced8', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
    const g = nodo('g', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, svg);
    const trazo = (pts, color, ancho) => nodo('path', { d: linea(pts), stroke: color, 'stroke-width': ancho }, g);

    // Lado lejano
    trazo([esq.cadera, esq.p2.rodilla, esq.p2.tobillo, esq.p2.punta], COLOR.lejos, 7);
    trazo([esq.hombro, esq.b2.codo, esq.b2.mano], COLOR.lejos, 6);
    (def.muebles || []).forEach((m) => dibujarMueble(g, m));
    (def.accesorios || []).forEach((a) => dibujarAccesorio(g, a, esq));
    // Tronco y cabeza
    trazo([esq.cadera, esq.hombro], COLOR.cerca, 11);
    trazo([esq.hombro, esq.cuello], COLOR.cerca, 6);
    nodo('circle', { cx: esq.cabeza[0], cy: esq.cabeza[1], r: L.cabeza, fill: COLOR.cerca }, g);
    nodo('circle', { cx: esq.ojo[0], cy: esq.ojo[1], r: 1.3, fill: '#fff' }, g);
    // Lado cercano
    trazo([esq.cadera, esq.p1.rodilla, esq.p1.tobillo, esq.p1.punta], COLOR.cerca, 8);
    trazo([esq.hombro, esq.b1.codo, esq.b1.mano], COLOR.cerca, 7);
    nodo('circle', { cx: esq.b1.mano[0], cy: esq.b1.mano[1], r: 3.6, fill: COLOR.cerca }, g);
    (def.flechas || []).forEach((f) => {
      nodo('path', { d: f, stroke: '#2a7de1', 'stroke-width': 2.2, 'stroke-dasharray': '4 3', fill: 'none', 'marker-end': 'url(#flecha)' }, g);
    });
  }

  /* ---------- Catálogo ---------- */
  const DE_PIE = { cadera: [98, 81], t: 90, tob1: [101, 147], tob2: [97, 147], b1: 268, a1: 270, b2: 272, a2: 272 };
  const con = (base, extra) => Object.assign({}, base, extra);

  const CATALOGO = [
    {
      id: 'sentadilla', nombre: 'Sentadilla con barra', grupo: 'Piernas', material: 'Barra y discos',
      musculos: 'Cuádriceps, glúteos, aductores y zona lumbar',
      pasos: [
        'Coloca la barra sobre la parte alta de la espalda (no sobre el cuello) y agárrala un poco más ancho que los hombros.',
        'Pies a la anchura de los hombros, puntas ligeramente hacia fuera.',
        'Coge aire, aprieta el abdomen y baja llevando la cadera atrás y abajo, como si fueras a sentarte.',
        'Baja hasta que los muslos queden al menos paralelos al suelo.',
        'Sube empujando el suelo con todo el pie, sin despegar los talones.',
      ],
      claves: ['Rodillas en la dirección de las puntas de los pies, sin cerrarse hacia dentro.', 'Espalda neutra: el pecho mira al frente, no te dobles.', 'El peso, repartido en todo el pie.'],
      poses: [
        con(DE_PIE, { cadera: [96, 81], t: 88, tob1: [104, 147], tob2: [100, 147], mano1: [87, 33], mano2: [89, 34], db1: 1 }),
        con(DE_PIE, { cadera: [80, 113], t: 52, tob1: [104, 147], tob2: [100, 147], mano1: [99, 75], mano2: [101, 76], db1: 1 }),
      ],
      accesorios: [{ tipo: 'barra', en: 'mano1' }],
    },
    {
      id: 'goblet', nombre: 'Sentadilla goblet', grupo: 'Piernas', material: 'Mancuerna o pesa rusa',
      musculos: 'Cuádriceps, glúteos y abdomen',
      pasos: [
        'Sujeta la pesa con las dos manos pegada al pecho, codos hacia abajo.',
        'Pies algo más abiertos que los hombros.',
        'Baja llevando la cadera atrás y abajo, con el pecho erguido.',
        'Los codos pasan por dentro de las rodillas al llegar abajo.',
        'Sube empujando el suelo hasta quedar de pie.',
      ],
      claves: ['Es la mejor forma de aprender a hacer sentadilla.', 'No dejes que la pesa se separe del pecho.', 'Talones siempre en el suelo.'],
      poses: [
        con(DE_PIE, { mano1: [111, 53], mano2: [111, 54], db1: -1 }),
        con(DE_PIE, { cadera: [80, 113], t: 66, tob1: [104, 147], tob2: [100, 147], mano1: [113, 78], mano2: [113, 79] }),
      ],
      accesorios: [{ tipo: 'pesa_rusa', en: 'mano1' }],
    },
    {
      id: 'peso_muerto', nombre: 'Peso muerto', grupo: 'Cadera', material: 'Barra y discos',
      musculos: 'Glúteos, isquiotibiales, espalda y agarre',
      pasos: [
        'Pies a la anchura de la cadera, con la barra sobre la mitad del pie.',
        'Agarra la barra justo por fuera de las piernas, con los brazos estirados.',
        'Baja la cadera hasta que las espinillas toquen la barra; pecho arriba y espalda recta.',
        'Empuja el suelo con las piernas y lleva la barra pegada al cuerpo mientras te pones de pie.',
        'Arriba, termina apretando glúteos, sin echarte hacia atrás. Baja con el mismo recorrido.',
      ],
      claves: ['La espalda no se redondea en ningún momento.', 'La barra sube rozando las piernas.', 'Hombros ligeramente por delante de la barra al empezar.'],
      poses: [
        con(DE_PIE, { cadera: [80, 106], t: 27, tob1: [104, 147], tob2: [100, 147], mano1: [120, 137], mano2: [118, 137] }),
        con(DE_PIE, { cadera: [98, 81], t: 90, tob1: [104, 147], tob2: [100, 147], mano1: [101, 108], mano2: [100, 108] }),
      ],
      accesorios: [{ tipo: 'barra', en: 'mano1' }],
    },
    {
      id: 'rumano', nombre: 'Peso muerto rumano', grupo: 'Cadera', material: 'Barra o mancuernas',
      musculos: 'Isquiotibiales y glúteos',
      pasos: [
        'De pie, con la barra en las manos a la altura de los muslos y las rodillas un poco flexionadas.',
        'Lleva la cadera hacia atrás, como si quisieras cerrar una puerta con el culo.',
        'La barra baja pegada a las piernas hasta media espinilla o hasta notar tensión detrás del muslo.',
        'Vuelve arriba empujando la cadera hacia delante.',
      ],
      claves: ['Las rodillas casi no cambian de ángulo durante todo el movimiento.', 'Espalda recta: el movimiento es de cadera, no de espalda.'],
      poses: [
        con(DE_PIE, { cadera: [98, 81], t: 90, tob1: [104, 147], tob2: [100, 147], mano1: [101, 108], mano2: [100, 108] }),
        con(DE_PIE, { cadera: [84, 84], t: 14, tob1: [104, 147], tob2: [100, 147], mano1: [126, 120], mano2: [124, 120] }),
      ],
      accesorios: [{ tipo: 'barra', en: 'mano1' }],
    },
    {
      id: 'zancada', nombre: 'Zancada', grupo: 'Piernas', material: 'Peso corporal o mancuernas',
      musculos: 'Cuádriceps y glúteos',
      pasos: [
        'Da un paso largo hacia delante; el pie de atrás queda apoyado en la punta.',
        'Con el tronco recto, baja hasta que la rodilla de atrás casi toque el suelo.',
        'La rodilla de delante queda encima del tobillo, formando un ángulo recto.',
        'Sube empujando con el pie de delante. Repite con la otra pierna.',
      ],
      claves: ['El tronco, vertical.', 'Que la rodilla de delante no se vaya hacia dentro.', 'Baja recto, como en un ascensor.'],
      poses: [
        con(DE_PIE, { cadera: [96, 85], t: 90, tob1: [122, 147], tob2: [70, 140], f2: 300, dr2: 1, b1: 268, a1: 270 }),
        con(DE_PIE, { cadera: [94, 112], t: 88, tob1: [122, 147], tob2: [70, 140], f2: 300, dr2: 1, b1: 268, a1: 270 }),
      ],
      accesorios: [{ tipo: 'mancuerna', en: 'mano1' }],
    },
    {
      id: 'step_up', nombre: 'Subida al cajón (step-up)', grupo: 'Piernas', material: 'Cajón o banco',
      musculos: 'Cuádriceps y glúteos',
      pasos: [
        'Coloca un pie entero encima del cajón.',
        'Inclina un poco el tronco hacia delante y sube empujando con la pierna de arriba.',
        'Termina de pie sobre el cajón y baja despacio con la misma pierna de trabajo.',
      ],
      claves: ['El impulso lo hace la pierna de arriba, no la de abajo.', 'Rodilla alineada con el pie.'],
      muebles: [{ tipo: 'cajon', x: 112, y: 114, w: 56 }],
      poses: [
        con(DE_PIE, { cadera: [100, 82], t: 84, tob1: [128, 112], tob2: [92, 147] }),
        con(DE_PIE, { cadera: [126, 46], t: 90, tob1: [128, 112], tob2: [122, 104], f2: 330 }),
      ],
    },
    {
      id: 'hip_thrust', nombre: 'Hip thrust', grupo: 'Cadera', material: 'Banco y barra',
      musculos: 'Glúteos',
      pasos: [
        'Siéntate en el suelo con la parte alta de la espalda apoyada en el borde de un banco.',
        'Coloca la barra (con protección) sobre la cadera y los pies apoyados, a la anchura de la cadera.',
        'Empuja con los talones y sube la cadera hasta que el tronco quede horizontal.',
        'Aprieta los glúteos un segundo arriba y baja controlando.',
      ],
      claves: ['Arriba, las rodillas forman un ángulo recto.', 'Mira al frente, con la barbilla algo metida.', 'No arquees la zona lumbar: sube con los glúteos.'],
      muebles: [{ tipo: 'banco', x: 34, y: 118, w: 52 }],
      poses: [
        { cadera: [118, 138], t: 148, c: 150, tob1: [146, 147], tob2: [143, 147], dr1: 1, dr2: 1, mano1: [116, 131], mano2: [115, 131], db1: 1, db2: 1 },
        { cadera: [126, 111], t: 180, c: 170, tob1: [146, 147], tob2: [143, 147], dr1: 1, dr2: 1, mano1: [124, 104], mano2: [123, 104], db1: 1, db2: 1 },
      ],
      accesorios: [{ tipo: 'barra', en: 'mano1', r: 11 }],
    },
    {
      id: 'puente', nombre: 'Puente de glúteo', grupo: 'Cadera', material: 'Esterilla',
      musculos: 'Glúteos e isquiotibiales',
      pasos: [
        'Túmbate boca arriba con las rodillas dobladas y los pies apoyados cerca del culo.',
        'Brazos estirados en el suelo, a los lados del cuerpo.',
        'Empuja con los talones y sube la cadera hasta alinear rodillas, cadera y hombros.',
        'Mantén un segundo arriba y baja despacio.',
      ],
      claves: ['Aprieta los glúteos arriba.', 'Que la zona lumbar no se arquee.'],
      poses: [
        { cadera: [104, 141], t: 180, c: 180, tob1: [132, 146], tob2: [129, 146], dr1: 1, dr2: 1, mano1: [100, 147], mano2: [98, 147], db1: 1, db2: 1 },
        { cadera: [108, 117], t: 152, c: 165, tob1: [132, 146], tob2: [129, 146], dr1: 1, dr2: 1, mano1: [100, 147], mano2: [98, 147], db1: 1, db2: 1 },
      ],
    },
    {
      id: 'gemelos', nombre: 'Elevación de gemelos', grupo: 'Piernas', material: 'Peso corporal o mancuernas',
      musculos: 'Gemelos y sóleo',
      pasos: [
        'De pie, con los pies a la anchura de la cadera.',
        'Sube sobre las puntas de los pies todo lo que puedas.',
        'Mantén un segundo arriba y baja despacio hasta apoyar los talones.',
      ],
      claves: ['Sube y baja en línea recta, sin balancearte.', 'Puedes apoyar una mano en la pared para no perder el equilibrio.'],
      poses: [con(DE_PIE, {}), con(DE_PIE, { cadera: [98, 72], tob1: [101, 138], tob2: [97, 138], f1: 305, f2: 305 })],
    },
    {
      id: 'press_banca', nombre: 'Press de banca', grupo: 'Empuje', material: 'Banco, barra y discos',
      musculos: 'Pectoral, tríceps y hombro anterior',
      pasos: [
        'Túmbate en el banco con los ojos debajo de la barra y los pies firmes en el suelo.',
        'Agarra la barra algo más ancho que los hombros y sácala del soporte con los brazos estirados.',
        'Baja la barra controlando hasta tocar la parte baja del pecho.',
        'Empuja hacia arriba hasta estirar los brazos.',
      ],
      claves: ['Junta las escápulas y mantén los glúteos en el banco.', 'Codos a unos 45° del cuerpo, no totalmente abiertos.', 'Con cargas altas, usa siempre a alguien que te ayude.'],
      muebles: [{ tipo: 'banco', x: 36, y: 114, w: 96 }],
      poses: [
        { cadera: [118, 108], t: 180, c: 180, tob1: [150, 147], tob2: [146, 147], dr1: 1, dr2: 1, mano1: [80, 59], mano2: [79, 60], db1: -1 },
        { cadera: [118, 108], t: 180, c: 180, tob1: [150, 147], tob2: [146, 147], dr1: 1, dr2: 1, mano1: [82, 96], mano2: [81, 97], db1: -1 },
      ],
      accesorios: [{ tipo: 'barra', en: 'mano1' }],
    },
    {
      id: 'flexiones', nombre: 'Flexiones', grupo: 'Empuje', material: 'Peso corporal',
      musculos: 'Pectoral, tríceps y abdomen',
      pasos: [
        'Apoya las manos en el suelo algo más abiertas que los hombros y estira las piernas atrás.',
        'El cuerpo forma una línea recta desde la cabeza hasta los talones.',
        'Dobla los codos y baja el pecho hasta casi tocar el suelo.',
        'Empuja el suelo para volver arriba.',
      ],
      claves: ['No dejes caer la cadera ni la subas.', 'Codos hacia atrás, no abiertos en cruz.', 'Si cuesta mucho, apoya las rodillas.'],
      poses: [
        { cadera: [98, 116], t: 24.6, c: 30, tob1: [37, 144], tob2: [37, 144], f1: 290, f2: 290, mano1: [140, 147], mano2: [138, 147], db1: -1, db2: -1 },
        { cadera: [104, 138], t: 5, c: 15, tob1: [37, 144], tob2: [37, 144], f1: 290, f2: 290, mano1: [140, 147], mano2: [138, 147], db1: -1, db2: -1 },
      ],
    },
    {
      id: 'press_militar', nombre: 'Press militar', grupo: 'Empuje', material: 'Barra o mancuernas',
      musculos: 'Hombros y tríceps',
      pasos: [
        'De pie, con la barra apoyada delante de los hombros y las manos algo más abiertas que ellos.',
        'Aprieta glúteos y abdomen.',
        'Empuja la barra hacia arriba, apartando un poco la cabeza para dejarla pasar.',
        'Termina con los brazos estirados y la barra encima de la cabeza. Baja controlando.',
      ],
      claves: ['No arquees la espalda para empujar.', 'La barra sube en línea recta.'],
      poses: [
        con(DE_PIE, { mano1: [108, 37], mano2: [107, 38], db1: -1, db2: -1 }),
        con(DE_PIE, { mano1: [100, -14], mano2: [99, -13], db1: -1, db2: -1, c: 95 }),
      ],
      accesorios: [{ tipo: 'barra', en: 'mano1' }],
    },
    {
      id: 'fondos_banco', nombre: 'Fondos en banco', grupo: 'Empuje', material: 'Banco o silla',
      musculos: 'Tríceps y pectoral',
      pasos: [
        'Siéntate en el borde de un banco y apoya las manos a los lados de la cadera.',
        'Adelanta los pies y saca la cadera del banco.',
        'Dobla los codos hacia atrás y baja hasta que formen un ángulo recto.',
        'Empuja con las manos hasta estirar los brazos.',
      ],
      claves: ['Espalda cerca del banco.', 'Codos hacia atrás, no hacia los lados.', 'Más fácil con las rodillas dobladas; más difícil con las piernas estiradas.'],
      muebles: [{ tipo: 'banco', x: 24, y: 108, w: 58 }],
      poses: [
        { cadera: [86, 104], t: 92, c: 85, tob1: [140, 147], tob2: [136, 147], dr1: 1, dr2: 1, mano1: [78, 107], mano2: [76, 107], db1: -1, db2: -1 },
        { cadera: [89, 128], t: 95, c: 85, tob1: [140, 147], tob2: [136, 147], dr1: 1, dr2: 1, mano1: [78, 107], mano2: [76, 107], db1: -1, db2: -1 },
      ],
    },
    {
      id: 'remo_barra', nombre: 'Remo con barra', grupo: 'Tracción', material: 'Barra y discos',
      musculos: 'Dorsales, espalda media y bíceps',
      pasos: [
        'Con la barra en las manos, flexiona un poco las rodillas e inclina el tronco hacia delante.',
        'Espalda recta y brazos estirados colgando.',
        'Tira de la barra hacia el ombligo llevando los codos atrás.',
        'Junta las escápulas arriba y baja controlando.',
      ],
      claves: ['El tronco no se mueve: solo trabajan los brazos y la espalda.', 'No des tirones.'],
      poses: [
        con(DE_PIE, { cadera: [84, 90], t: 28, tob1: [104, 147], tob2: [100, 147], mano1: [124, 116], mano2: [122, 116] }),
        con(DE_PIE, { cadera: [84, 90], t: 28, tob1: [104, 147], tob2: [100, 147], mano1: [106, 94], mano2: [104, 94] }),
      ],
      accesorios: [{ tipo: 'barra', en: 'mano1' }],
    },
    {
      id: 'dominadas', nombre: 'Dominadas', grupo: 'Tracción', material: 'Barra fija',
      musculos: 'Dorsales, bíceps y antebrazo',
      pasos: [
        'Cuélgate de la barra con las manos algo más abiertas que los hombros.',
        'Baja los hombros, alejándolos de las orejas, y aprieta el abdomen.',
        'Tira de ti hacia arriba hasta que la barbilla supere la barra.',
        'Baja despacio hasta estirar los brazos del todo.',
      ],
      claves: ['Sin balanceos ni patadas.', 'Si aún no puedes, usa una goma elástica o haz solo la bajada lenta.'],
      muebles: [{ tipo: 'barra_fija', x1: 60, x2: 150, y: -16 }],
      poses: [
        { cadera: [98, 82], t: 90, c: 88, tob1: [92, 142], tob2: [90, 141], dr1: 1, dr2: 1, f1: 330, f2: 330, mano1: [102, -16], mano2: [100, -16] },
        { cadera: [98, 52], t: 90, c: 92, tob1: [92, 112], tob2: [90, 111], dr1: 1, dr2: 1, f1: 330, f2: 330, mano1: [102, -16], mano2: [100, -16], db1: -1 },
      ],
    },
    {
      id: 'curl', nombre: 'Curl de bíceps', grupo: 'Tracción', material: 'Mancuernas',
      musculos: 'Bíceps',
      pasos: [
        'De pie, con una mancuerna en cada mano y los brazos estirados junto al cuerpo.',
        'Sin mover los codos, dobla los brazos y sube las mancuernas hacia los hombros.',
        'Baja despacio hasta estirar los brazos.',
      ],
      claves: ['Los codos se quedan pegados al cuerpo.', 'No balancees el tronco para subir el peso.'],
      poses: [con(DE_PIE, { b1: 266, a1: 268, b2: 268, a2: 270 }), con(DE_PIE, { b1: 266, a1: 80, b2: 268, a2: 82 })],
      accesorios: [{ tipo: 'mancuerna', ambas: true }],
    },
    {
      id: 'plancha', nombre: 'Plancha', grupo: 'Core', material: 'Esterilla',
      musculos: 'Abdomen y zona media',
      pasos: [
        'Apoya los antebrazos en el suelo, con los codos debajo de los hombros.',
        'Estira las piernas atrás y apóyate en las puntas de los pies.',
        'Mantén el cuerpo recto como una tabla durante el tiempo indicado, respirando con normalidad.',
      ],
      claves: ['Ni culo arriba ni cadera caída.', 'Aprieta glúteos y abdomen.', 'En «repeticiones» anota los segundos que aguantas.'],
      poses: [
        { cadera: [95, 130], t: 11.7, c: 15, tob1: [29, 144], tob2: [29, 144], f1: 290, f2: 290, b1: 270, a1: 0, b2: 270, a2: 0 },
        { cadera: [95, 129], t: 12.5, c: 18, tob1: [29, 144], tob2: [29, 144], f1: 290, f2: 290, b1: 270, a1: 0, b2: 270, a2: 0 },
      ],
    },
    {
      id: 'crunch', nombre: 'Abdominales (crunch)', grupo: 'Core', material: 'Esterilla',
      musculos: 'Recto abdominal',
      pasos: [
        'Túmbate boca arriba con las rodillas dobladas y los pies apoyados.',
        'Cruza los brazos sobre el pecho.',
        'Despega los hombros del suelo acercando las costillas a la cadera.',
        'Baja despacio sin llegar a relajarte del todo.',
      ],
      claves: ['No tires del cuello.', 'La zona lumbar se queda en el suelo.'],
      poses: [
        { cadera: [102, 142], t: 178, c: 178, tob1: [132, 146], tob2: [129, 146], dr1: 1, dr2: 1, mano1: [70, 133], mano2: [72, 133] },
        { cadera: [102, 142], t: 145, c: 125, tob1: [132, 146], tob2: [129, 146], dr1: 1, dr2: 1, mano1: [74, 118], mano2: [76, 118] },
      ],
    },
    {
      id: 'escaladores', nombre: 'Escaladores', grupo: 'Core', material: 'Peso corporal',
      musculos: 'Abdomen, hombros y resistencia',
      pasos: [
        'Colócate en posición de flexión, con los brazos estirados.',
        'Lleva una rodilla hacia el pecho y devuélvela atrás.',
        'Alterna las piernas a buen ritmo, como si corrieras.',
      ],
      claves: ['La cadera no sube ni baja.', 'Manos firmes debajo de los hombros.'],
      poses: [
        { cadera: [104, 118], t: 26, c: 30, tob1: [112, 144], tob2: [40, 144], f1: 300, f2: 290, mano1: [148, 147], mano2: [146, 147] },
        { cadera: [104, 118], t: 26, c: 30, tob1: [40, 144], tob2: [112, 144], f1: 290, f2: 300, mano1: [148, 147], mano2: [146, 147] },
      ],
    },
    {
      id: 'salto_cajon', nombre: 'Salto al cajón', grupo: 'Potencia', material: 'Cajón', ciclo: true,
      musculos: 'Piernas y potencia',
      pasos: [
        'Colócate de pie a un paso del cajón.',
        'Flexiona cadera y rodillas y lleva los brazos atrás.',
        'Salta lanzando los brazos hacia delante y arriba.',
        'Aterriza con los dos pies encima del cajón, con las rodillas dobladas, y ponte de pie.',
        'Baja del cajón andando, no saltando.',
      ],
      claves: ['Aterriza suave y en silencio.', 'Empieza con un cajón bajo.'],
      muebles: [{ tipo: 'cajon', x: 112, y: 104, w: 56 }],
      poses: [
        con(DE_PIE, { cadera: [62, 81], tob1: [65, 147], tob2: [61, 147] }),
        con(DE_PIE, { cadera: [50, 110], t: 50, tob1: [68, 147], tob2: [64, 147], b1: 215, a1: 220, b2: 218, a2: 222 }),
        con(DE_PIE, { cadera: [98, 52], t: 72, tob1: [112, 94], tob2: [108, 94], f1: 330, f2: 330, b1: 60, a1: 70, b2: 62, a2: 72 }),
        con(DE_PIE, { cadera: [120, 78], t: 58, tob1: [140, 102], tob2: [136, 102], b1: 330, a1: 0, b2: 332, a2: 2 }),
        con(DE_PIE, { cadera: [138, 37], tob1: [141, 102], tob2: [137, 102] }),
      ],
    },
    {
      id: 'sentadilla_salto', nombre: 'Sentadilla con salto', grupo: 'Potencia', material: 'Peso corporal',
      musculos: 'Piernas y potencia',
      pasos: [
        'Baja a sentadilla con los brazos atrás.',
        'Salta lo más alto posible lanzando los brazos arriba.',
        'Aterriza suave, flexionando las rodillas, y enlaza con la siguiente.',
      ],
      claves: ['Rodillas alineadas con los pies al caer.', 'Aterriza sobre la parte delantera del pie y baja el talón.'],
      poses: [
        con(DE_PIE, { cadera: [82, 112], t: 52, tob1: [104, 147], tob2: [100, 147], b1: 215, a1: 220, b2: 218, a2: 222 }),
        con(DE_PIE, { cadera: [100, 60], t: 90, tob1: [103, 126], tob2: [99, 126], f1: 310, f2: 310, b1: 80, a1: 85, b2: 82, a2: 87 }),
      ],
    },
    {
      id: 'swing', nombre: 'Swing con pesa rusa', grupo: 'Potencia', material: 'Pesa rusa',
      musculos: 'Glúteos, isquiotibiales y espalda',
      pasos: [
        'Pies algo más abiertos que los hombros, con la pesa agarrada con las dos manos.',
        'Lleva la pesa entre las piernas echando la cadera atrás, con la espalda recta.',
        'Empuja la cadera hacia delante con fuerza: la pesa sube sola hasta la altura del pecho.',
        'Deja que caiga y repite el movimiento enlazando.',
      ],
      claves: ['La fuerza sale de la cadera, no de los brazos.', 'No es una sentadilla: las rodillas se doblan poco.'],
      poses: [
        con(DE_PIE, { cadera: [80, 88], t: 30, tob1: [104, 147], tob2: [100, 147], mano1: [98, 118], mano2: [97, 118] }),
        con(DE_PIE, { cadera: [98, 81], t: 90, tob1: [104, 147], tob2: [100, 147], mano1: [146, 40], mano2: [145, 41] }),
      ],
      accesorios: [{ tipo: 'pesa_rusa', en: 'mano1' }],
    },
    {
      id: 'burpee', nombre: 'Burpee', grupo: 'Potencia', material: 'Peso corporal', ciclo: true,
      musculos: 'Todo el cuerpo y resistencia',
      pasos: [
        'De pie, baja a cuclillas y apoya las manos en el suelo.',
        'Lleva los pies atrás de un salto hasta quedar en posición de flexión.',
        'Recoge los pies de nuevo hacia las manos.',
        'Salta hacia arriba estirando los brazos.',
      ],
      claves: ['Mantén el abdomen firme al ir atrás.', 'Si es demasiado, lleva los pies atrás andando en vez de saltando.'],
      poses: [
        con(DE_PIE, { cadera: [100, 81], tob1: [103, 147], tob2: [99, 147] }),
        con(DE_PIE, { cadera: [86, 118], t: 40, tob1: [103, 147], tob2: [99, 147], mano1: [128, 147], mano2: [126, 147] }),
        { cadera: [92, 120], t: 24, c: 30, tob1: [32, 145], tob2: [32, 145], f1: 290, f2: 290, mano1: [134, 147], mano2: [132, 147], db1: 1 },
        con(DE_PIE, { cadera: [86, 118], t: 40, tob1: [103, 147], tob2: [99, 147], mano1: [128, 147], mano2: [126, 147] }),
        con(DE_PIE, { cadera: [100, 64], tob1: [103, 130], tob2: [99, 130], f1: 310, f2: 310, b1: 85, a1: 88, b2: 87, a2: 90 }),
      ],
    },
    {
      id: 'carrera', nombre: 'Carrera', grupo: 'Carrera', material: 'Zapatillas', tipo: 'km', ciclo: true, mov: 230, pausa: 0,
      musculos: 'Resistencia cardiovascular y piernas',
      pasos: [
        'Corre la distancia indicada a la intensidad (zona) que te marque el entrenador.',
        'Z1 regenerativo: puedes hablar sin esfuerzo. Z2 aeróbico suave: conversación cómoda.',
        'Z3 tempo: frases cortas. Z4 umbral: solo palabras sueltas. Z5 máximo: no puedes hablar.',
        'Anota los kilómetros que hayas hecho y la zona en la que has ido la mayor parte del tiempo.',
      ],
      claves: ['Calienta 10 minutos suave antes de ir a zonas altas.', 'Tronco erguido, mirada al frente, brazos a 90° moviéndose hacia delante y atrás.', 'Pisa debajo de la cadera, no muy por delante.'],
      poses: [
        { cadera: [100, 79], t: 82, c: 85, tob1: [122, 146], tob2: [78, 138], f1: 10, f2: 300, b1: 235, a1: 300, b2: 305, a2: 40 },
        { cadera: [100, 76], t: 82, c: 85, tob1: [103, 146], tob2: [84, 112], f1: 0, f2: 280, b1: 262, a1: 350, b2: 278, a2: 5 },
        { cadera: [100, 79], t: 82, c: 85, tob1: [78, 138], tob2: [122, 146], f1: 300, f2: 10, b1: 305, a1: 40, b2: 235, a2: 300 },
        { cadera: [100, 76], t: 82, c: 85, tob1: [84, 112], tob2: [103, 146], f1: 280, f2: 0, b1: 278, a1: 5, b2: 262, a2: 350 },
      ],
    },
  ];
  CATALOGO.forEach((e) => (e.porDefecto = true));

  /* ---------- Componente animado ---------- */
  const reducido = () => global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const suave = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  /** Devuelve la postura en el instante `ms` de la animación. */
  function posturaEn(def, ms) {
    const poses = def.poses;
    if (poses.length < 2) return poses[0];
    const MOV = def.mov || 900;
    const PAUSA = def.pausa != null ? def.pausa : 450;
    const tramo = MOV + PAUSA;
    if (def.ciclo) {
      const n = poses.length;
      const total = n * tramo;
      const t = ms % total;
      const i = Math.floor(t / tramo);
      const dentro = t - i * tramo;
      const k = dentro < PAUSA ? 0 : suave((dentro - PAUSA) / MOV);
      const sig = (i + 1) % n;
      return sig === 0 ? (k > 0 ? poses[0] : poses[i]) : mezclar(poses[i], poses[sig], k);
    }
    const secuencia = poses.concat(poses.slice(1, -1).reverse());
    const n = secuencia.length;
    const t = ms % (n * tramo);
    const i = Math.floor(t / tramo);
    const dentro = t - i * tramo;
    const k = dentro < PAUSA ? 0 : suave((dentro - PAUSA) / MOV);
    return mezclar(secuencia[i], secuencia[(i + 1) % n], k);
  }

  const activos = new Set();
  let bucle = null;
  function tic(ahora) {
    activos.forEach((a) => {
      if (!a.visible || a.pausado) return;
      pintar(a.svg, a.def, posturaEn(a.def, ahora - a.inicio));
    });
    bucle = activos.size ? requestAnimationFrame(tic) : null;
  }
  const visor = 'IntersectionObserver' in global
    ? new IntersectionObserver((entradas) => entradas.forEach((e) => e.target._anim && (e.target._anim.visible = e.isIntersecting)))
    : null;

  /**
   * Crea la ilustración de un ejercicio. Devuelve un elemento <figure>.
   * opciones.compacto: sin botón de pausa (para listados).
   */
  function ilustracion(def, opciones = {}) {
    const fig = document.createElement('figure');
    fig.className = 'ilustracion';
    if (def.imagen) {
      const img = document.createElement('img');
      img.src = def.imagen;
      img.alt = 'Cómo se hace: ' + def.nombre;
      img.loading = 'lazy';
      fig.append(img);
      return fig;
    }
    if (!def.poses) {
      fig.classList.add('sin-dibujo');
      fig.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="14" r="7" fill="#9aa3b5"/><path d="M32 22v20M32 42l-9 16M32 42l9 16M18 30l14-4 14 4" stroke="#9aa3b5" stroke-width="5" stroke-linecap="round" fill="none"/></svg>';
      return fig;
    }
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 -30 200 186');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Ilustración animada: ' + def.nombre);
    fig.append(svg);
    const anim = { svg, def, inicio: performance.now(), visible: !visor, pausado: reducido() };
    svg._anim = anim;
    pintar(svg, def, def.poses[0]);
    if (def.poses.length > 1 && !opciones.estatico) {
      activos.add(anim);
      if (visor) visor.observe(svg);
      if (!bucle) bucle = requestAnimationFrame(tic);
      if (!opciones.compacto) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-anim';
        const rotulo = () => {
          btn.textContent = anim.pausado ? '▶ Ver movimiento' : '❚❚ Pausa';
          btn.setAttribute('aria-pressed', String(!anim.pausado));
        };
        btn.onclick = () => {
          anim.pausado = !anim.pausado;
          if (!anim.pausado) anim.inicio = performance.now();
          rotulo();
        };
        rotulo();
        fig.append(btn);
      }
      // Libera la animación cuando el elemento sale del documento
      const limpiar = new MutationObserver(() => {
        if (!fig.isConnected) {
          activos.delete(anim);
          if (visor) visor.unobserve(svg);
          limpiar.disconnect();
        }
      });
      requestAnimationFrame(() => fig.isConnected && limpiar.observe(document.body, { childList: true, subtree: true }));
    }
    return fig;
  }

  global.Figuras = { CATALOGO, ilustracion, posturaEn, pintar, esqueleto };
})(window);
