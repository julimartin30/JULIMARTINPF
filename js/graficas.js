/*
 * Gráficas en SVG sin librerías (funcionan sin conexión).
 *  - lineas(contenedor, { puntos: [{ x: 'AAAA-MM-DD', y }], unidad, decimales })
 *  - barras(contenedor, { categorias: [texto], detalle: [texto largo], series: [{ nombre, color, valores: [] }], unidad, decimales })
 * Se dibujan al ancho real del contenedor y se redibujan al cambiar de tamaño.
 * Cada gráfica lleva tooltip al pasar el dedo o el ratón y una tabla con los datos.
 */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const T = { tinta: '#1d2433', suave: '#556074', rejilla: '#e6e9ef', eje: '#c9ced8', superficie: '#ffffff' };

  /** Paleta categórica (orden fijo, validada) y escala ordinal azul para zonas de intensidad. */
  const CATEGORICA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
  const ORDINAL_AZUL = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];

  function n(tag, attrs, padre) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (padre) padre.append(e);
    return e;
  }
  const fmt = (v, dec = 0) => (v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: dec, minimumFractionDigits: 0 }));

  /** Marcas "redondas" para el eje Y. */
  function escalaY(min, max, marcas = 4) {
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const paso0 = (max - min) / marcas;
    const mag = Math.pow(10, Math.floor(Math.log10(paso0)));
    const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= paso0);
    const a = Math.floor(min / paso) * paso;
    const b = Math.ceil(max / paso) * paso;
    const ticks = [];
    for (let v = a; v <= b + paso / 2; v += paso) ticks.push(+v.toFixed(6));
    return { min: a, max: b, ticks };
  }

  function montar(contenedor, dibujar) {
    contenedor.classList.add('grafica');
    const pintar = () => {
      const ancho = Math.max(contenedor.classList.contains('compacta') ? 80 : 260, contenedor.clientWidth || 600);
      contenedor.replaceChildren();
      dibujar(ancho, contenedor.clientHeight);
    };
    pintar();
    if (global.ResizeObserver) {
      let ultimo = contenedor.clientWidth;
      const ro = new ResizeObserver(() => {
        if (!contenedor.isConnected) return ro.disconnect();
        if (Math.abs(contenedor.clientWidth - ultimo) > 4) {
          ultimo = contenedor.clientWidth;
          pintar();
        }
      });
      ro.observe(contenedor);
    }
  }

  function tooltip(contenedor) {
    const t = document.createElement('div');
    t.className = 'tooltip';
    t.hidden = true;
    t.setAttribute('role', 'status');
    contenedor.append(t);
    return {
      mostrar(html, x, y, ancho) {
        t.innerHTML = html;
        t.hidden = false;
        const w = t.offsetWidth;
        let left = x + 12;
        if (left + w > ancho - 4) left = x - w - 12;
        t.style.left = Math.max(4, left) + 'px';
        t.style.top = Math.max(0, y - 10) + 'px';
      },
      ocultar() {
        t.hidden = true;
      },
    };
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* ---------- Línea temporal (una serie) ---------- */
  function lineas(contenedor, { puntos, unidad = '', decimales = 1, color = CATEGORICA[0], compacto = false }) {
    const ps = puntos.filter((p) => p.y != null).sort((a, b) => a.x.localeCompare(b.x));
    if (compacto) contenedor.classList.add('compacta');
    montar(contenedor, (ancho, altoCaja) => {
      if (compacto) return lineaCompacta(contenedor, ps, ancho, Math.max(60, altoCaja || 90), color);
      const alto = 210;
      const m = { i: 44, d: 66, s: 14, b: 28 };
      const svg = n('svg', { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, 'aria-hidden': 'true' }, contenedor);
      const tt = tooltip(contenedor);
      const ys = ps.map((p) => p.y);
      const ey = escalaY(Math.min(...ys), Math.max(...ys));
      const t0 = new Date(ps[0].x).getTime();
      const t1 = ps.length > 1 ? new Date(ps[ps.length - 1].x).getTime() : t0 + 864e5;
      const X = (x) => m.i + ((new Date(x).getTime() - t0) / (t1 - t0 || 1)) * (ancho - m.i - m.d) + (ps.length === 1 ? (ancho - m.i - m.d) / 2 : 0);
      const Y = (y) => m.s + (1 - (y - ey.min) / (ey.max - ey.min)) * (alto - m.s - m.b);
      ey.ticks.forEach((v) => {
        n('line', { x1: m.i, x2: ancho - m.d + 10, y1: Y(v), y2: Y(v), stroke: T.rejilla, 'stroke-width': 1 }, svg);
        n('text', { x: m.i - 8, y: Y(v) + 4, 'text-anchor': 'end', fill: T.suave, 'font-size': 11 }, svg).textContent = fmt(v, decimales);
      });
      // Etiquetas de fecha: primera, última y alguna intermedia sin solaparse
      const maxEtq = Math.max(2, Math.floor((ancho - m.i - m.d) / 70));
      const pasoE = Math.max(1, Math.ceil(ps.length / maxEtq));
      ps.forEach((p, i) => {
        if (i % pasoE && i !== ps.length - 1) return;
        if (i !== ps.length - 1 && ps.length - 1 - i < pasoE / 2) return;
        n('text', { x: X(p.x), y: alto - 8, 'text-anchor': 'middle', fill: T.suave, 'font-size': 11 }, svg).textContent = corta(p.x);
      });
      if (ps.length > 1) n('path', { d: 'M' + ps.map((p) => `${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('L'), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      ps.forEach((p) => n('circle', { cx: X(p.x), cy: Y(p.y), r: 4, fill: color, stroke: T.superficie, 'stroke-width': 2 }, svg));
      const ult = ps[ps.length - 1];
      n('text', { x: X(ult.x) + 8, y: Y(ult.y) + 4, fill: T.tinta, 'font-size': 12, 'font-weight': 700 }, svg).textContent = fmt(ult.y, decimales) + (unidad ? ' ' + unidad : '');
      // Capa de interacción: punto más cercano
      const guia = n('line', { y1: m.s, y2: alto - m.b, stroke: T.eje, 'stroke-width': 1, visibility: 'hidden' }, svg);
      const foco = n('circle', { r: 6, fill: color, stroke: T.superficie, 'stroke-width': 2, visibility: 'hidden' }, svg);
      const capa = n('rect', { x: m.i, y: 0, width: ancho - m.i - m.d + 10, height: alto, fill: 'transparent' }, svg);
      const mover = (ev) => {
        const r = svg.getBoundingClientRect();
        const px = ev.clientX - r.left;
        let mejor = ps[0];
        ps.forEach((p) => Math.abs(X(p.x) - px) < Math.abs(X(mejor.x) - px) && (mejor = p));
        guia.setAttribute('x1', X(mejor.x));
        guia.setAttribute('x2', X(mejor.x));
        foco.setAttribute('cx', X(mejor.x));
        foco.setAttribute('cy', Y(mejor.y));
        guia.setAttribute('visibility', 'visible');
        foco.setAttribute('visibility', 'visible');
        tt.mostrar(`<b>${fmt(mejor.y, decimales)} ${esc(unidad)}</b><br>${esc(larga(mejor.x))}`, X(mejor.x), Y(mejor.y), ancho);
      };
      capa.addEventListener('pointermove', mover);
      capa.addEventListener('pointerdown', mover);
      capa.addEventListener('pointerleave', () => {
        guia.setAttribute('visibility', 'hidden');
        foco.setAttribute('visibility', 'hidden');
        tt.ocultar();
      });
    });
  }

  /* ---------- Barras apiladas por categoría (semanas) ---------- */
  function barras(contenedor, { categorias, detalle, series, unidad = '', decimales = 0, compacto = false }) {
    if (compacto) contenedor.classList.add('compacta');
    montar(contenedor, (ancho, altoCaja) => {
      if (compacto) return barrasCompactas(contenedor, categorias, series, ancho, Math.max(60, altoCaja || 90));
      const alto = 220;
      const m = { i: 48, d: 10, s: 14, b: 28 };
      const svg = n('svg', { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, 'aria-hidden': 'true' }, contenedor);
      const tt = tooltip(contenedor);
      const totales = categorias.map((_, i) => series.reduce((s, se) => s + (se.valores[i] || 0), 0));
      const ey = escalaY(0, Math.max(...totales, 1));
      const Y = (v) => m.s + (1 - v / ey.max) * (alto - m.s - m.b);
      ey.ticks.forEach((v) => {
        n('line', { x1: m.i, x2: ancho - m.d, y1: Y(v), y2: Y(v), stroke: v === 0 ? T.eje : T.rejilla, 'stroke-width': 1 }, svg);
        n('text', { x: m.i - 8, y: Y(v) + 4, 'text-anchor': 'end', fill: T.suave, 'font-size': 11 }, svg).textContent = fmt(v, 0);
      });
      const banda = (ancho - m.i - m.d) / categorias.length;
      const bw = Math.min(36, banda * 0.62);
      const maxEtq = Math.max(2, Math.floor((ancho - m.i - m.d) / 58));
      const pasoE = Math.max(1, Math.ceil(categorias.length / maxEtq));
      categorias.forEach((c, i) => {
        const cx = m.i + banda * i + banda / 2;
        if (i % pasoE === 0 || i === categorias.length - 1)
          if (!(i !== categorias.length - 1 && categorias.length - 1 - i < pasoE / 2))
            n('text', { x: cx, y: alto - 8, 'text-anchor': 'middle', fill: T.suave, 'font-size': 11 }, svg).textContent = c;
        // Segmentos: de abajo arriba, con 2px de separación; el de arriba con esquinas de 4px
        let base = 0;
        const visibles = series.map((se, k) => ({ se, k, v: se.valores[i] || 0 })).filter((x) => x.v > 0);
        visibles.forEach((x, j) => {
          const y0 = Y(base);
          const y1 = Y(base + x.v);
          const h = Math.max(1, y0 - y1 - (j > 0 ? 2 : 0));
          const top = y0 - (j > 0 ? 2 : 0) - h;
          const ultimo = j === visibles.length - 1;
          const r = ultimo ? Math.min(4, h, bw / 2) : 0;
          const x0 = cx - bw / 2;
          const d = `M${x0} ${top + h}V${top + r}${r ? `Q${x0} ${top} ${x0 + r} ${top}` : ''}H${x0 + bw - r}${r ? `Q${x0 + bw} ${top} ${x0 + bw} ${top + r}` : ''}V${top + h}Z`;
          n('path', { d, fill: x.se.color }, svg);
          base += x.v;
        });
        const capa = n('rect', { x: m.i + banda * i, y: 0, width: banda, height: alto - m.b, fill: 'transparent' }, svg);
        const ver = () => {
          const filas = series
            .map((se) => ({ se, v: se.valores[i] || 0 }))
            .filter((x) => x.v > 0)
            .reverse()
            .map((x) => `<span class="tt-fila"><i style="background:${x.se.color}"></i>${esc(x.se.nombre)}<b>${fmt(x.v, decimales)}</b></span>`)
            .join('');
          tt.mostrar(`<b>${esc((detalle && detalle[i]) || c)}</b>${filas || '<br>Sin datos'}<span class="tt-fila tt-total">Total<b>${fmt(totales[i], decimales)} ${esc(unidad)}</b></span>`, cx, Y(totales[i]), ancho);
        };
        capa.addEventListener('pointermove', ver);
        capa.addEventListener('pointerdown', ver);
        capa.addEventListener('pointerleave', () => tt.ocultar());
      });
    });
  }

  /* ---------- Versiones compactas (tarjetas): sin ejes, sin textos, sin interacción ---------- */
  function lineaCompacta(contenedor, ps, ancho, alto, color) {
    const svg = n('svg', { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, 'aria-hidden': 'true' }, contenedor);
    const ys = ps.map((p) => p.y);
    let min = Math.min(...ys);
    let max = Math.max(...ys);
    if (min === max) (min -= 1), (max += 1);
    const pad = 7;
    const t0 = new Date(ps[0].x).getTime();
    const t1 = new Date(ps[ps.length - 1].x).getTime();
    const X = (x) => (ps.length === 1 ? ancho / 2 : pad + ((new Date(x).getTime() - t0) / (t1 - t0 || 1)) * (ancho - 2 * pad));
    const Y = (y) => pad + (1 - (y - min) / (max - min)) * (alto - 2 * pad);
    n('line', { x1: 0, x2: ancho, y1: alto - 1, y2: alto - 1, stroke: T.rejilla, 'stroke-width': 1 }, svg);
    if (ps.length > 1) {
      const d = ps.map((p) => `${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('L');
      n('path', { d: `M${X(ps[0].x)} ${alto}L${d}L${X(ps[ps.length - 1].x)} ${alto}Z`, fill: color, 'fill-opacity': 0.1 }, svg);
      n('path', { d: 'M' + d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    }
    const u = ps[ps.length - 1];
    n('circle', { cx: X(u.x), cy: Y(u.y), r: 4, fill: color, stroke: T.superficie, 'stroke-width': 2 }, svg);
  }

  function barrasCompactas(contenedor, categorias, series, ancho, alto) {
    const svg = n('svg', { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, 'aria-hidden': 'true' }, contenedor);
    const totales = categorias.map((_, i) => series.reduce((t, se) => t + (se.valores[i] || 0), 0));
    const max = Math.max(...totales, 1);
    const banda = ancho / categorias.length;
    const bw = Math.max(3, Math.min(18, banda * 0.66));
    const Y = (v) => (v / max) * (alto - 4);
    n('line', { x1: 0, x2: ancho, y1: alto - 0.5, y2: alto - 0.5, stroke: T.eje, 'stroke-width': 1 }, svg);
    categorias.forEach((_, i) => {
      let base = 0;
      const x = banda * i + (banda - bw) / 2;
      const vis = series.filter((se) => (se.valores[i] || 0) > 0);
      vis.forEach((se, j) => {
        const h = Y(se.valores[i]);
        const gap = j > 0 ? 1.5 : 0;
        const r = j === vis.length - 1 ? Math.min(3, h / 2, bw / 2) : 0;
        const top = alto - base - h;
        const hh = Math.max(1, h - gap);
        n('path', { d: `M${x} ${top + hh}V${top + r}${r ? `Q${x} ${top} ${x + r} ${top}` : ''}H${x + bw - r}${r ? `Q${x + bw} ${top} ${x + bw} ${top + r}` : ''}V${top + hh}Z`, fill: se.color, transform: `translate(0 ${-gap})` }, svg);
        base += h;
      });
    });
  }

  function leyenda(series) {
    const d = document.createElement('div');
    d.className = 'leyenda';
    series.forEach((s) => {
      const e = document.createElement('span');
      e.innerHTML = `<i style="background:${s.color}"></i>${esc(s.nombre)}`;
      d.append(e);
    });
    return d;
  }

  /** Tabla accesible con los mismos datos. */
  function tabla(cabeceras, filas) {
    const det = document.createElement('details');
    det.className = 'tabla-datos';
    det.innerHTML = '<summary>Ver datos en tabla</summary>';
    const t = document.createElement('table');
    t.className = 'tabla';
    t.innerHTML = '<thead><tr>' + cabeceras.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>' + filas.map((f) => '<tr>' + f.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') + '</tbody>';
    det.append(t);
    return det;
  }

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const corta = (f) => {
    const [, mm, dd] = f.split('-');
    return `${+dd} ${MESES[+mm - 1]}`;
  };
  const larga = (f) => {
    const [y, mm, dd] = f.split('-');
    return `${+dd} ${MESES[+mm - 1]} ${y}`;
  };

  global.Graficas = { lineas, barras, leyenda, tabla, CATEGORICA, ORDINAL_AZUL, corta, larga, fmt };
})(window);
