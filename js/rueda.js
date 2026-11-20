/*
 * Rueda giratoria para elegir una cantidad (p. ej. pasos).
 * Girar en el sentido de las agujas del reloj suma `paso` por cada muesca; al revés, resta.
 * Una vuelta completa = 60 muescas (con paso 100, 6.000 pasos).
 * Accesible con teclado: flechas ±1 muesca, RePág/AvPág ±10 muescas, Inicio = mínimo.
 */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const MUESCAS = 60;
  const GRADOS = 360 / MUESCAS;

  function nodo(tag, attrs, padre) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (padre) padre.append(n);
    return n;
  }
  const fmt = (v) => v.toLocaleString('es-ES', { useGrouping: 'always' });

  /**
   * opciones: { valor, paso = 100, min = 0, max = 100000, etiqueta, unidad, onChange(valor) }
   * Devuelve { el, get valor(), set(valor) }.
   */
  function crear({ valor = 0, paso = 100, min = 0, max = 100000, etiqueta = 'Cantidad', unidad = '', onChange } = {}) {
    let v = Math.min(max, Math.max(min, Math.round(valor / paso) * paso));
    const caja = document.createElement('div');
    caja.className = 'rueda';
    const dial = document.createElement('div');
    dial.className = 'rueda-dial';
    dial.tabIndex = 0;
    dial.setAttribute('role', 'slider');
    dial.setAttribute('aria-label', etiqueta);
    dial.setAttribute('aria-valuemin', min);
    dial.setAttribute('aria-valuemax', max);

    const svg = nodo('svg', { viewBox: '0 0 200 200', 'aria-hidden': 'true' });
    nodo('circle', { cx: 100, cy: 100, r: 96, class: 'rueda-aro' }, svg);
    const giro = nodo('g', {}, svg);
    for (let i = 0; i < MUESCAS; i++) {
      const larga = i % 5 === 0;
      nodo('line', { x1: 100, y1: 10, x2: 100, y2: larga ? 26 : 20, class: larga ? 'rueda-muesca larga' : 'rueda-muesca', transform: `rotate(${i * GRADOS} 100 100)` }, giro);
    }
    nodo('circle', { cx: 100, cy: 36, r: 7, class: 'rueda-tirador' }, giro);
    nodo('circle', { cx: 100, cy: 100, r: 58, class: 'rueda-centro' }, svg);
    const marca = nodo('path', { d: 'M100 2 L106 12 L94 12 Z', class: 'rueda-indicador' }, svg);
    marca.setAttribute('aria-hidden', 'true');
    dial.append(svg);

    const texto = document.createElement('div');
    texto.className = 'rueda-valor';
    const num = document.createElement('b');
    const uni = document.createElement('small');
    uni.textContent = unidad;
    texto.append(num, uni);
    dial.append(texto);

    const botones = document.createElement('div');
    botones.className = 'rueda-botones';
    const boton = (t, delta, aria) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-peq';
      b.textContent = t;
      b.setAttribute('aria-label', aria);
      b.onclick = () => cambiar(v + delta, true);
      return b;
    };
    botones.append(boton('−1.000', -10 * paso, 'Restar 1.000'), boton('−100', -paso, 'Restar 100'), boton('+100', paso, 'Sumar 100'), boton('+1.000', 10 * paso, 'Sumar 1.000'));
    const ayuda = document.createElement('p');
    ayuda.className = 'rueda-ayuda';
    ayuda.textContent = 'Gira a la derecha para sumar y a la izquierda para restar (100 por muesca).';
    caja.append(dial, ayuda, botones);

    const pintar = () => {
      num.textContent = fmt(v);
      giro.setAttribute('transform', `rotate(${((v / paso) * GRADOS) % 360} 100 100)`);
      dial.setAttribute('aria-valuenow', v);
      dial.setAttribute('aria-valuetext', `${fmt(v)} ${unidad}`.trim());
    };
    function cambiar(nuevo, avisar) {
      nuevo = Math.min(max, Math.max(min, Math.round(nuevo / paso) * paso));
      if (nuevo === v) return;
      v = nuevo;
      pintar();
      if (avisar && onChange) onChange(v);
    }

    // Arrastre circular: se acumula el ángulo girado y cada muesca suma o resta un paso
    let ultimo = null;
    let acumulado = 0;
    const angulo = (ev) => {
      const r = dial.getBoundingClientRect();
      return (Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    };
    dial.addEventListener('pointerdown', (ev) => {
      ultimo = angulo(ev);
      acumulado = 0;
      dial.setPointerCapture(ev.pointerId);
      dial.classList.add('girando');
      ev.preventDefault();
    });
    dial.addEventListener('pointermove', (ev) => {
      if (ultimo == null) return;
      const a = angulo(ev);
      let d = a - ultimo;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      ultimo = a;
      acumulado += d;
      const muescas = Math.trunc(acumulado / GRADOS);
      if (muescas) {
        acumulado -= muescas * GRADOS;
        const antes = v;
        cambiar(v + muescas * paso, true);
        if (v !== antes && navigator.vibrate) navigator.vibrate(4);
      }
    });
    const soltar = () => {
      ultimo = null;
      dial.classList.remove('girando');
    };
    dial.addEventListener('pointerup', soltar);
    dial.addEventListener('pointercancel', soltar);
    // Rueda del ratón
    dial.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        cambiar(v + (ev.deltaY < 0 ? paso : -paso), true);
      },
      { passive: false }
    );
    dial.addEventListener('keydown', (ev) => {
      const k = ev.key;
      const d = k === 'ArrowUp' || k === 'ArrowRight' ? 1 : k === 'ArrowDown' || k === 'ArrowLeft' ? -1 : k === 'PageUp' ? 10 : k === 'PageDown' ? -10 : 0;
      if (d) {
        ev.preventDefault();
        cambiar(v + d * paso, true);
      } else if (k === 'Home') {
        ev.preventDefault();
        cambiar(min, true);
      }
    });
    pintar();

    return {
      el: caja,
      get valor() {
        return v;
      },
      set(nuevo) {
        cambiar(Number(nuevo) || 0, false);
        pintar();
      },
    };
  }

  global.Rueda = { crear };
})(window);
