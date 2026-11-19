/* Interfaz de la app: acceso, panel del entrenador y panel del atleta. */
(function () {
  'use strict';
  const { $, $$, el, aviso, dialogo, confirmar, uid, fechaCorta, descargar } = U;
  const app = $('#app');

  const S = {
    sesion: null, // { rol, ruta, dek, datos, usuario }
    atletas: {}, // entrenador: datos descifrados de cada atleta, por id
    rolLogin: Datos.ls.get('rol') || 'atleta',
  };

  /* ================= Utilidades ================= */
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function fechaBonita(f) {
    if (!f) return '';
    const d = new Date(f + 'T12:00:00');
    const h = Datos.hoy();
    const man = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    if (f === h) return 'Hoy';
    if (f === man) return 'Mañana';
    return DIAS[d.getDay()].replace(/^./, (c) => c.toUpperCase()) + ' ' + fechaCorta(f);
  }
  const sumarDias = (f, n) => {
    const d = new Date((f || Datos.hoy()) + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const ESTADOS = {
    completada: ['Completada', 'ok'],
    'en-curso': ['A medias', 'medio'],
    'no-hecha': ['No registrada', 'mal'],
    hoy: ['Hoy', 'hoy'],
    pendiente: ['Pendiente', 'gris'],
  };
  const colorPct = (p) => (p == null ? 'gris' : p >= 90 ? 'ok' : p >= 60 ? 'medio' : 'mal');
  function chipEstado(c) {
    let [txt, tono] = ESTADOS[c.estado];
    if (c.estado === 'completada') tono = colorPct(c.pct);
    return el('span.chip.chip-' + tono, txt + (c.pct != null && c.estado !== 'pendiente' && c.estado !== 'hoy' ? ` · ${c.pct}%` : ''));
  }
  function barra(pct, etiqueta) {
    return el(
      'div.medidor',
      { role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct == null ? 0 : pct, 'aria-label': etiqueta || 'Cumplimiento' },
      el('div.medidor-relleno.tono-' + colorPct(pct), { style: `width:${pct || 0}%` })
    );
  }
  const textoObjetivo = (it) => {
    const series = it.series || [];
    const unidad = it.tipo === 'seg' ? ' s' : '';
    const iguales = series.every((s) => s.reps === series[0].reps && s.kg === series[0].kg);
    const uno = (s) => `${s.reps || '—'}${unidad}${s.kg ? ' · ' + s.kg + ' kg' : ''}`;
    if (!series.length) return '';
    return iguales ? `${series.length} × ${uno(series[0])}` : series.map(uno).join(' / ');
  };
  const sugerirPassword = () => {
    const a = 'abcdefghjkmnpqrstuvwxyz23456789';
    const r = Cripto.aleatorio(10);
    return Array.from(r, (b) => a[b % a.length]).join('').replace(/(.{5})/, '$1-');
  };
  const ir = (h) => (location.hash = h);
  function cargando(texto = 'Cargando…') {
    app.replaceChildren(el('div.cargando', { role: 'status' }, el('div.giro'), texto));
  }
  function errorTexto(e) {
    const m = (e && e.message) || String(e);
    if (m === 'CREDENCIALES') return 'Usuario o contraseña incorrectos.';
    if (m === 'Failed to fetch') return 'Sin conexión.';
    return m;
  }

  /* ================= Ejercicios ================= */
  const catalogo = () => Figuras.CATALOGO;
  const propios = () => (S.sesion && S.sesion.rol === 'entrenador' ? S.sesion.datos.ejercicios || [] : []);

  /** Completa un ejercicio propio con el dibujo del ejercicio base que eligió el entrenador. */
  function completarDef(d) {
    if (!d) return null;
    if (d.poses || d.imagen || !d.base) return d;
    const b = catalogo().find((x) => x.id === d.base);
    return b ? { ...d, poses: b.poses, muebles: b.muebles, accesorios: b.accesorios, ciclo: b.ciclo } : d;
  }
  function buscarEjercicio(id) {
    return catalogo().find((x) => x.id === id) || completarDef(propios().find((x) => x.id === id)) || null;
  }
  /** Definición del ejercicio de un elemento de la sesión (los propios van copiados dentro de la sesión). */
  const defItem = (it) => completarDef(it.def) || buscarEjercicio(it.ej) || { nombre: it.nombre || 'Ejercicio' };

  function fichaEjercicio(def) {
    const pasos = def.pasos && def.pasos.length ? def.pasos : null;
    return el(
      'div.ficha',
      def.musculos && el('p', el('b', 'Trabaja: '), def.musculos),
      def.material && el('p', el('b', 'Material: '), def.material),
      pasos && el('h4', 'Cómo se hace'),
      pasos && el('ol.pasos', pasos.map((p) => el('li', p))),
      def.claves && def.claves.length && el('h4', 'Claves'),
      def.claves && def.claves.length && el('ul.claves', def.claves.map((p) => el('li', p))),
      def.video && /^https?:\/\//.test(def.video) && el('p', el('a.btn.btn-peq', { href: def.video, target: '_blank', rel: 'noopener' }, '▶ Ver vídeo'))
    );
  }

  function verEjercicio(def) {
    return dialogo({
      titulo: def.nombre,
      cuerpo: el('div.ver-ejercicio', Figuras.ilustracion(def), fichaEjercicio(def)),
      botones: [{ texto: 'Cerrar', valor: null, primario: true }],
    });
  }

  /** Selector de ejercicios con dibujos. Devuelve el id elegido (o null). */
  function elegirEjercicio() {
    return new Promise((resolver) => {
      const todos = [...propios().map(completarDef), ...catalogo()];
      const grupos = ['Todos', ...new Set(todos.map((e) => e.grupo || 'Otros'))];
      let grupo = 'Todos';
      let texto = '';
      const d = el('dialog.dialogo.dialogo-ancho');
      const rejilla = el('div.rejilla-ej');
      const cerrar = (v) => {
        d.close();
        d.remove();
        resolver(v);
      };
      const pintar = () => {
        const t = texto.toLowerCase();
        rejilla.replaceChildren(
          ...todos
            .filter((e) => (grupo === 'Todos' || (e.grupo || 'Otros') === grupo) && (!t || e.nombre.toLowerCase().includes(t)))
            .map((e) =>
              el(
                'button.tarjeta-ej',
                { type: 'button', onclick: () => cerrar(e.id) },
                Figuras.ilustracion(e, { compacto: true }),
                el('span', e.nombre),
                !e.porDefecto && el('small', 'Propio')
              )
            )
        );
      };
      const chips = el(
        'div.chips',
        grupos.map((g) =>
          el('button.chip-filtro', { type: 'button', 'aria-pressed': String(g === grupo), onclick: (ev) => {
            grupo = g;
            $$('.chip-filtro', chips).forEach((c) => c.setAttribute('aria-pressed', String(c === ev.currentTarget)));
            pintar();
          } }, g)
        )
      );
      d.append(
        el('h2', 'Elige un ejercicio'),
        el('input', { type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar ejercicio', oninput: (e) => ((texto = e.target.value), pintar()) }),
        chips,
        rejilla,
        el('div.dialogo-botones', el('button.btn', { type: 'button', onclick: () => cerrar(null) }, 'Cancelar'))
      );
      d.addEventListener('cancel', (e) => (e.preventDefault(), cerrar(null)));
      document.body.append(d);
      pintar();
      d.showModal();
    });
  }

  /* ================= Acceso ================= */
  async function pantallaAcceso() {
    document.title = 'Entreno';
    pintarBarra();
    cargando();
    const hayEntrenador = await Datos.existeEntrenador().catch(() => true);
    const error = el('div.nota.nota-error', { hidden: true, role: 'alert' });
    const usuario = el('input', { name: 'usuario', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
    const pass = el('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true });
    const recordarme = el('input', { type: 'checkbox', checked: Datos.ls.get('recordarme') !== '0' });
    const roles = el(
      'div.segmentado',
      { role: 'radiogroup', 'aria-label': 'Entrar como' },
      ['atleta', 'entrenador'].map((r) =>
        el(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(S.rolLogin === r),
            onclick: (e) => {
              S.rolLogin = r;
              Datos.ls.set('rol', r);
              $$('button', roles).forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
            },
          },
          r === 'atleta' ? '🏃 Atleta' : '📋 Entrenador'
        )
      )
    );
    const form = el(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          error.hidden = true;
          const btn = $('button[type=submit]', form);
          btn.disabled = true;
          btn.textContent = 'Comprobando…';
          try {
            const s = await Datos.entrar(S.rolLogin, usuario.value, pass.value);
            s.usuario = Cripto.normalizarUsuario(usuario.value);
            Datos.ls.set('recordarme', recordarme.checked ? '1' : '0');
            if (recordarme.checked) Datos.recordar(s, s.usuario);
            await iniciar(s);
          } catch (err) {
            error.textContent = errorTexto(err);
            error.hidden = false;
            btn.disabled = false;
            btn.textContent = 'Entrar';
          }
        },
      },
      roles,
      el('label.campo', el('span', 'Usuario'), usuario),
      el('label.campo', el('span', 'Contraseña'), pass),
      el('label.check', recordarme, ' Recordarme en este dispositivo'),
      error,
      el('button.btn.btn-primario.btn-grande', { type: 'submit' }, 'Entrar')
    );
    app.replaceChildren(
      el(
        'div.acceso',
        el('div.cabecera-acceso', el('img', { src: 'assets/icono.svg', alt: '', width: 64, height: 64 }), el('h1', 'Entreno'), el('p', 'Tu planificación, ejercicio a ejercicio.')),
        el('div.tarjeta', form),
        !hayEntrenador &&
          el(
            'div.tarjeta.primera-vez',
            el('h2', '¿Primera vez?'),
            el('p', 'Todavía no hay ningún entrenador. Crea tu cuenta para empezar a planificar.'),
            el('button.btn.btn-oscuro', { type: 'button', onclick: pantallaCrearEntrenador }, 'Crear cuenta de entrenador')
          )
      )
    );
    usuario.focus();
  }

  function pantallaCrearEntrenador() {
    const error = el('div.nota.nota-error', { hidden: true, role: 'alert' });
    const nombre = el('input', { required: true, autocomplete: 'name' });
    const usuario = el('input', { required: true, autocapitalize: 'none', autocomplete: 'username', pattern: '[A-Za-z0-9._\\-]{3,}', title: 'Al menos 3 caracteres: letras, números, punto, guion' });
    const pass = el('input', { type: 'password', required: true, minlength: 10, autocomplete: 'new-password' });
    const pass2 = el('input', { type: 'password', required: true, autocomplete: 'new-password' });
    app.replaceChildren(
      el(
        'div.acceso',
        el('div.cabecera-acceso', el('h1', 'Cuenta de entrenador')),
        el(
          'div.tarjeta',
          el(
            'form',
            {
              onsubmit: async (e) => {
                e.preventDefault();
                if (pass.value !== pass2.value) {
                  error.textContent = 'Las contraseñas no coinciden.';
                  error.hidden = false;
                  return;
                }
                try {
                  const s = await Datos.crearEntrenador({ nombre: nombre.value.trim(), usuario: usuario.value, password: pass.value });
                  s.usuario = Cripto.normalizarUsuario(usuario.value);
                  Datos.recordar(s, s.usuario);
                  S.rolLogin = 'entrenador';
                  Datos.ls.set('rol', 'entrenador');
                  await iniciar(s);
                  aviso('Cuenta creada. Ahora da de alta a tus atletas.');
                } catch (err) {
                  error.textContent = errorTexto(err);
                  error.hidden = false;
                }
              },
            },
            el('label.campo', el('span', 'Tu nombre'), nombre),
            el('label.campo', el('span', 'Usuario'), usuario),
            el('label.campo', el('span', 'Contraseña (mínimo 10 caracteres)'), pass),
            el('label.campo', el('span', 'Repite la contraseña'), pass2),
            el('p.ayuda', 'La contraseña cifra todos los datos. Si la olvidas no se pueden recuperar.'),
            error,
            el('div.fila-botones', el('button.btn', { type: 'button', onclick: pantallaAcceso }, 'Volver'), el('button.btn.btn-primario', { type: 'submit' }, 'Crear cuenta'))
          )
        )
      )
    );
    nombre.focus();
  }

  async function iniciar(s) {
    S.sesion = s;
    S.atletas = {};
    if (s.rol === 'atleta') {
      await Datos.aplicarPendientes(s);
      Datos.enviarPendientes(s).then((ok) => ok && pintarBarra());
    }
    if (!location.hash) history.replaceState(null, '', '#/');
    render();
  }

  function salir() {
    Datos.olvidar();
    Datos.usarGitHub(null);
    S.sesion = null;
    S.atletas = {};
    history.replaceState(null, '', location.pathname);
    pantallaAcceso();
  }

  /* ================= Barra superior ================= */
  function pintarBarra() {
    const b = $('#barra-usuario');
    b.replaceChildren();
    if (!S.sesion) return;
    const nombre = S.sesion.rol === 'entrenador' ? S.sesion.datos.entrenador.nombre : S.sesion.datos.atleta.nombre;
    b.append(
      el('span.quien', el('small', S.sesion.rol === 'entrenador' ? 'Entrenador' : 'Atleta'), nombre),
      el('button.btn.btn-peq', { type: 'button', onclick: salir }, 'Salir')
    );
  }

  function avisoModo() {
    if (Datos.conGitHub()) return S.sesion.sinConexion ? el('div.nota.nota-alerta', 'Sin conexión: estás viendo la última copia descargada.') : null;
    if (S.sesion.rol === 'entrenador')
      return el(
        'div.nota.nota-alerta',
        el('b', 'Modo prueba. '),
        'Los datos solo se guardan en este dispositivo. Para que tus atletas entren desde su móvil, conecta la app con GitHub en ',
        el('a', { href: '#/ajustes' }, 'Ajustes'),
        '.'
      );
    return el('div.nota.nota-alerta', 'Modo prueba: los datos solo se guardan en este dispositivo.');
  }

  /* ================= Router ================= */
  async function render() {
    if (!S.sesion) return pantallaAcceso();
    pintarBarra();
    const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    window.scrollTo(0, 0);
    try {
      if (S.sesion.rol === 'entrenador') {
        const [vista, id, sub, sid] = partes;
        if (vista === 'atleta' && id && sub === 'sesion' && sid) return await vistaRevision(id, sid);
        if (vista === 'atleta' && id && sub === 'editar') return await vistaEditor(id, sid);
        if (vista === 'atleta' && id) return await vistaAtletaEntrenador(id);
        if (vista === 'nueva') return await vistaEditor(null, null);
        if (vista === 'ejercicios') return vistaEjercicios();
        if (vista === 'ajustes') return vistaAjustes();
        return await vistaInicioEntrenador();
      }
      const [vista, sid] = partes;
      if (vista === 's' && sid) return vistaSesionAtleta(sid);
      if (vista === 'cuenta') return vistaCuentaAtleta();
      return await vistaInicioAtleta();
    } catch (e) {
      console.error(e);
      app.replaceChildren(el('div.tarjeta', el('h2', 'No se ha podido cargar'), el('p', errorTexto(e)), el('button.btn', { type: 'button', onclick: render }, 'Reintentar')));
    }
  }
  window.addEventListener('hashchange', () => S.sesion && render());

  function pestanasEntrenador(activa) {
    const p = [
      ['#/', 'Atletas'],
      ['#/ejercicios', 'Ejercicios'],
      ['#/ajustes', 'Ajustes'],
    ];
    return el(
      'nav.pestanas',
      { 'aria-label': 'Secciones' },
      p.map(([h, t]) => el('a.pestana', { href: h, 'aria-current': h === activa ? 'page' : null }, t))
    );
  }

  /* ================= ENTRENADOR ================= */
  async function datosAtleta(a, forzar) {
    if (!S.atletas[a.id] || forzar) S.atletas[a.id] = await Datos.leerAtleta(a);
    return S.atletas[a.id];
  }
  const atletaPorId = (id) => S.sesion.datos.atletas.find((a) => a.id === id);

  async function vistaInicioEntrenador() {
    cargando();
    await Datos.releer(S.sesion).catch(() => {});
    pintarBarra();
    const atletas = S.sesion.datos.atletas.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const datos = await Promise.all(atletas.map((a) => datosAtleta(a, true).catch(() => null)));
    const h = Datos.hoy();
    const tarjetas = atletas.map((a, i) => {
      const d = datos[i];
      if (!d) return el('a.tarjeta-atleta', { href: '#/atleta/' + a.id }, el('b', a.nombre), el('span.ayuda', 'No se han podido leer sus datos'));
      const c = Datos.cumplimientoPeriodo(d);
      const prox = (d.sesiones || []).filter((s) => s.fecha >= h && !(d.registros[s.id] && d.registros[s.id].completada)).sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
      const ult = Object.values(d.registros || {}).map((r) => r.actualizado).filter(Boolean).sort().pop();
      return el(
        'a.tarjeta-atleta',
        { href: '#/atleta/' + a.id },
        el('div.fila-sep', el('b', a.nombre), el('span.pct.tono-' + colorPct(c.pct), c.pct == null ? '—' : c.pct + '%')),
        barra(c.pct, 'Cumplimiento de ' + a.nombre),
        el('span.ayuda', c.sesiones ? `Cumplimiento últimas 4 semanas (${c.sesiones} sesiones)` : 'Sin sesiones vencidas en las últimas 4 semanas'),
        el('span.meta', prox ? `Próxima: ${fechaBonita(prox.fecha)} · ${prox.titulo || 'Sesión'}` : 'Sin sesiones pendientes'),
        el('span.meta', ult ? 'Último registro: ' + new Date(ult).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : 'Aún no ha registrado nada')
      );
    });
    app.replaceChildren(
      pestanasEntrenador('#/'),
      avisoModo() || '',
      el(
        'div.cabecera',
        el('h1', 'Atletas'),
        el(
          'div.fila-botones',
          atletas.length > 0 && el('a.btn.btn-primario', { href: '#/nueva' }, '+ Nueva sesión'),
          el('button.btn', { type: 'button', onclick: nuevoAtleta }, '+ Añadir atleta')
        )
      ),
      atletas.length
        ? el('div.lista-atletas', tarjetas)
        : el('div.tarjeta.vacio', el('p', 'Aún no tienes atletas.'), el('button.btn.btn-primario', { type: 'button', onclick: nuevoAtleta }, '+ Añadir el primero'))
    );
  }

  async function nuevoAtleta() {
    const nombre = el('input', { required: true });
    const usuario = el('input', { required: true, autocapitalize: 'none', spellcheck: 'false' });
    const pass = el('input', { value: sugerirPassword(), required: true, minlength: 8 });
    nombre.addEventListener('input', () => {
      if (!usuario.dataset.tocado)
        usuario.value = nombre.value
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .trim()
          .replace(/\s+/g, '.')
          .replace(/[^a-z0-9._-]/g, '');
    });
    usuario.addEventListener('input', () => (usuario.dataset.tocado = '1'));
    const ok = await dialogo({
      titulo: 'Nuevo atleta',
      cuerpo: [
        el('label.campo', el('span', 'Nombre y apellidos'), nombre),
        el('label.campo', el('span', 'Usuario para entrar'), usuario),
        el('label.campo', el('span', 'Contraseña'), pass),
        el('p.ayuda', 'Apunta la contraseña: después solo podrás cambiarla por otra nueva.'),
      ],
      botones: [
        { texto: 'Cancelar', valor: false },
        { texto: 'Crear', valor: () => nombre.value.trim() && usuario.value.trim().length >= 3 && pass.value.length >= 8, primario: true },
      ],
    });
    if (ok === null || ok === false) {
      if (ok === false && nombre.value) aviso('Faltan datos: nombre, usuario (3+ letras) y contraseña (8+).', 'error');
      return;
    }
    try {
      cargando('Creando atleta…');
      const a = await Datos.crearAtleta(S.sesion, { nombre: nombre.value.trim(), usuario: usuario.value, password: pass.value });
      await mostrarCredenciales(a.nombre, a.usuario, pass.value);
      ir('#/atleta/' + a.id);
    } catch (e) {
      aviso(errorTexto(e), 'error', 6000);
      render();
    }
  }

  function mostrarCredenciales(nombre, usuario, password) {
    const url = location.origin + location.pathname;
    const texto = `Hola ${nombre.split(' ')[0]}, aquí tienes tu acceso a la app de entrenamiento:\n${url}\nEntra como «Atleta».\nUsuario: ${usuario}\nContraseña: ${password}`;
    return dialogo({
      titulo: 'Datos de acceso',
      cuerpo: [
        el('p', 'Envía estos datos a ' + nombre + ':'),
        el('pre.credenciales', texto),
        Datos.conGitHub() ? null : el('div.nota.nota-alerta', 'En modo prueba el atleta solo puede entrar desde este dispositivo.'),
      ],
      botones: [
        {
          texto: 'Copiar',
          valor: () => {
            navigator.clipboard && navigator.clipboard.writeText(texto).then(() => aviso('Copiado'));
            return true;
          },
        },
        { texto: 'Hecho', valor: true, primario: true },
      ],
    });
  }

  async function vistaAtletaEntrenador(id) {
    const a = atletaPorId(id);
    if (!a) return ir('#/');
    cargando();
    const d = await datosAtleta(a, true);
    if (!d) throw new Error('No se han podido leer los datos de ' + a.nombre);
    const h = Datos.hoy();
    const sesiones = (d.sesiones || []).slice().sort((x, y) => y.fecha.localeCompare(x.fecha));
    const proximas = sesiones.filter((s) => s.fecha >= h).reverse();
    const pasadas = sesiones.filter((s) => s.fecha < h);
    const c = Datos.cumplimientoPeriodo(d);
    const fila = (s) => {
      const reg = d.registros[s.id];
      const cs = Datos.cumplimientoSesion(s, reg);
      return el(
        'a.fila-sesion',
        { href: `#/atleta/${id}/sesion/${s.id}` },
        el('div', el('b', s.titulo || 'Sesión'), el('span.meta', `${fechaBonita(s.fecha)} · ${s.items.length} ejercicios`)),
        el('div.fila-sesion-der', chipEstado(cs), cs.pct != null && cs.estado !== 'pendiente' ? barra(cs.pct) : null)
      );
    };
    app.replaceChildren(
      pestanasEntrenador('#/'),
      el('a.volver', { href: '#/' }, '← Atletas'),
      el(
        'div.cabecera',
        el('div', el('h1', a.nombre), el('span.ayuda-blanca', 'Usuario: ' + a.usuario)),
        el('div.fila-botones', el('a.btn.btn-primario', { href: `#/atleta/${id}/editar` }, '+ Nueva sesión'))
      ),
      el(
        'div.tarjeta.resumen',
        el('div.fila-sep', el('b', 'Cumplimiento últimas 4 semanas'), el('span.pct.tono-' + colorPct(c.pct), c.pct == null ? '—' : c.pct + '%')),
        barra(c.pct),
        el('p.ayuda', 'Media de las sesiones ya vencidas: se compara lo que ha hecho (repeticiones y kilos) con lo que pautaste.')
      ),
      el('h2.titulo-seccion', 'Próximas'),
      proximas.length ? el('div.lista', proximas.map(fila)) : el('p.vacio-blanco', 'No hay sesiones programadas.'),
      el('h2.titulo-seccion', 'Anteriores'),
      pasadas.length ? el('div.lista', pasadas.map(fila)) : el('p.vacio-blanco', 'Todavía no hay sesiones anteriores.'),
      el(
        'div.tarjeta.zona-gestion',
        el('h3', 'Cuenta del atleta'),
        el(
          'div.fila-botones',
          el('button.btn', { type: 'button', onclick: () => nuevaPasswordAtleta(a) }, 'Nueva contraseña'),
          el('button.btn.btn-peligro', { type: 'button', onclick: () => borrarAtleta(a) }, 'Eliminar atleta')
        )
      )
    );
  }

  async function nuevaPasswordAtleta(a) {
    const pass = el('input', { value: sugerirPassword(), minlength: 8 });
    const ok = await dialogo({
      titulo: 'Nueva contraseña para ' + a.nombre,
      cuerpo: [el('label.campo', el('span', 'Contraseña'), pass), el('p.ayuda', 'La anterior dejará de funcionar.')],
      botones: [
        { texto: 'Cancelar', valor: false },
        { texto: 'Cambiar', valor: true, primario: true },
      ],
    });
    if (!ok || pass.value.length < 8) return;
    try {
      await Datos.reiniciarPasswordAtleta(a, pass.value);
      await mostrarCredenciales(a.nombre, a.usuario, pass.value);
    } catch (e) {
      aviso(errorTexto(e), 'error');
    }
  }

  async function borrarAtleta(a) {
    if (!(await confirmar('Eliminar atleta', `Se borrarán la planificación y los registros de ${a.nombre}. No se puede deshacer.`, 'Eliminar', true))) return;
    try {
      cargando('Eliminando…');
      await Datos.eliminarAtleta(S.sesion, a);
      delete S.atletas[a.id];
      aviso('Atleta eliminado');
      ir('#/');
    } catch (e) {
      aviso(errorTexto(e), 'error');
      render();
    }
  }

  /* ---------- Revisión de una sesión (entrenador) ---------- */
  async function vistaRevision(id, sid) {
    const a = atletaPorId(id);
    if (!a) return ir('#/');
    cargando();
    const d = await datosAtleta(a, true);
    const s = d && d.sesiones.find((x) => x.id === sid);
    if (!s) return ir('#/atleta/' + id);
    const reg = d.registros[sid];
    const cs = Datos.cumplimientoSesion(s, reg);
    const bloques = s.items.map((it) => {
      const def = defItem(it);
      const r = reg && reg.items && reg.items[it.uid];
      const unidad = it.tipo === 'seg' ? 's' : 'reps';
      const filas = it.series.map((obj, i) => {
        const real = r && r.series && r.series[i];
        const pct = Math.round(Datos.cumplimientoSerie(obj, real) * 100);
        const hecho = real && (Datos.num(real.reps) != null || Datos.num(real.kg) != null || real.hecho);
        return el(
          'tr',
          el('td', i + 1),
          el('td', `${obj.reps || '—'} ${unidad}${obj.kg ? ' · ' + obj.kg + ' kg' : ''}`),
          el('td', hecho ? `${real.reps != null && real.reps !== '' ? real.reps : '—'} ${unidad}${real.kg != null && real.kg !== '' ? ' · ' + real.kg + ' kg' : ''}` : '—'),
          el('td', el('span.pct-mini.tono-' + colorPct(hecho ? pct : 0), hecho ? pct + '%' : '0%'))
        );
      });
      const extra = r && r.series ? r.series.slice(it.series.length).filter((x) => x && (x.reps || x.kg)) : [];
      return el(
        'div.tarjeta.revision-ej',
        el('div.revision-cab', Figuras.ilustracion(def, { compacto: true }), el('div', el('h3', def.nombre), el('span.meta', 'Pautado: ' + textoObjetivo(it)), it.nota && el('span.meta', 'Tu nota: ' + it.nota))),
        el('table.tabla', el('thead', el('tr', el('th', 'Serie'), el('th', 'Pautado'), el('th', 'Realizado'), el('th', ''))), el('tbody', filas)),
        extra.length > 0 && el('p.ayuda', `Hizo ${extra.length} serie(s) extra: ` + extra.map((x) => `${x.reps || '—'}${x.kg ? '×' + x.kg + 'kg' : ''}`).join(', ')),
        r && r.nota && el('div.nota.nota-info', el('b', 'Comentario del atleta: '), r.nota)
      );
    });
    app.replaceChildren(
      pestanasEntrenador('#/'),
      el('a.volver', { href: '#/atleta/' + id }, '← ' + a.nombre),
      el('div.cabecera', el('div', el('h1', s.titulo || 'Sesión'), el('span.ayuda-blanca', fechaBonita(s.fecha) + ' · ' + a.nombre))),
      el(
        'div.tarjeta.resumen',
        el('div.fila-sep', el('b', 'Cumplimiento'), chipEstado(cs)),
        barra(cs.pct || 0),
        el('p.meta', `${cs.hechas} de ${cs.series} series registradas`),
        reg && reg.rpe && el('p', el('b', 'Esfuerzo percibido: '), reg.rpe + ' / 10'),
        reg && reg.comentario && el('div.nota.nota-info', el('b', 'Comentario: '), reg.comentario),
        reg && reg.completada && el('p.meta', 'Terminada el ' + new Date(reg.completada).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })),
        s.notas && el('p.meta', 'Indicaciones: ' + s.notas)
      ),
      ...bloques,
      el(
        'div.fila-botones.acciones-pie',
        el('a.btn.btn-primario', { href: `#/atleta/${id}/editar/${sid}` }, 'Editar'),
        el('button.btn', { type: 'button', onclick: () => duplicarSesion(a, s) }, 'Duplicar'),
        el('button.btn.btn-peligro', { type: 'button', onclick: () => borrarSesion(a, s) }, 'Eliminar')
      )
    );
  }

  async function borrarSesion(a, s) {
    if (!(await confirmar('Eliminar sesión', `¿Eliminar «${s.titulo || 'Sesión'}» del ${fechaCorta(s.fecha)}? También se borra lo que haya registrado el atleta.`, 'Eliminar', true))) return;
    try {
      await Datos.modificarAtleta(a, (d) => {
        d.sesiones = d.sesiones.filter((x) => x.id !== s.id);
        delete d.registros[s.id];
      });
      aviso('Sesión eliminada');
      ir('#/atleta/' + a.id);
    } catch (e) {
      aviso(errorTexto(e), 'error');
    }
  }

  function duplicarSesion(a, s) {
    S.borrador = { ...JSON.parse(JSON.stringify(s)), id: null, fecha: sumarDias(s.fecha < Datos.hoy() ? Datos.hoy() : s.fecha, 7), destino: [a.id] };
    ir(`#/atleta/${a.id}/editar/copia`);
  }

  /* ---------- Editor de sesión ---------- */
  async function vistaEditor(idAtleta, sid) {
    const a = idAtleta && atletaPorId(idAtleta);
    let s;
    if (sid === 'copia' && S.borrador) s = S.borrador;
    else if (sid && a) {
      cargando();
      const d = await datosAtleta(a, true);
      s = d && d.sesiones.find((x) => x.id === sid);
      if (!s) return ir('#/atleta/' + idAtleta);
      s = JSON.parse(JSON.stringify(s));
    } else {
      const unico = S.sesion.datos.atletas.length === 1 ? [S.sesion.datos.atletas[0].id] : [];
      s = { id: null, fecha: Datos.hoy(), titulo: '', notas: '', items: [], destino: a ? [a.id] : unico };
    }
    S.borrador = null;
    const editando = !!s.id;
    const destino = new Set(s.destino || (a ? [a.id] : []));
    const lista = el('div.items-editor');
    const volver = a ? (editando ? `#/atleta/${a.id}/sesion/${s.id}` : '#/atleta/' + a.id) : '#/';

    const pintarItems = () => {
      lista.replaceChildren(
        ...s.items.map((it, idx) => editorItem(it, idx)),
        s.items.length ? '' : el('p.vacio', 'Añade el primer ejercicio.')
      );
    };

    const mover = (i, delta) => {
      const [x] = s.items.splice(i, 1);
      s.items.splice(i + delta, 0, x);
      pintarItems();
    };

    const editorItem = (it, idx) => {
      const def = defItem(it);
      const filas = el('div.series-editor');
      const pintarSeries = () => {
        filas.replaceChildren(
          el('div.serie-ed.cab', el('span', '#'), el('span', it.tipo === 'seg' ? 'Segundos' : 'Repeticiones'), el('span', 'Kg'), el('span')),
          ...it.series.map((se, i) =>
            el(
              'div.serie-ed',
              el('span.n', i + 1),
              el('input', { type: 'number', inputmode: 'numeric', min: 0, value: se.reps ?? '', 'aria-label': `Serie ${i + 1}: ${it.tipo === 'seg' ? 'segundos' : 'repeticiones'}`, oninput: (e) => (se.reps = Datos.num(e.target.value)) }),
              el('input', { type: 'number', inputmode: 'decimal', min: 0, step: 0.5, value: se.kg ?? '', placeholder: '—', 'aria-label': `Serie ${i + 1}: kilos`, oninput: (e) => (se.kg = Datos.num(e.target.value)) }),
              el('button.btn.btn-icono.btn-peq', { type: 'button', 'aria-label': 'Quitar serie ' + (i + 1), disabled: it.series.length < 2, onclick: () => (it.series.splice(i, 1), pintarSeries()) }, '✕')
            )
          ),
          el('button.btn.btn-peq', { type: 'button', onclick: () => (it.series.push({ ...(it.series[it.series.length - 1] || { reps: 10, kg: null }) }), pintarSeries()) }, '+ Serie')
        );
      };
      pintarSeries();
      return el(
        'div.tarjeta.item-ed',
        el(
          'div.item-ed-cab',
          el('button.mini-ilus', { type: 'button', 'aria-label': 'Cambiar ejercicio', onclick: async () => {
            const nuevo = await elegirEjercicio();
            if (nuevo) {
              asignarEjercicio(it, nuevo);
              pintarItems();
            }
          } }, Figuras.ilustracion(def, { compacto: true })),
          el('div.item-ed-titulo', el('b', (idx + 1) + '. ' + def.nombre), el('button.enlace', { type: 'button', onclick: () => verEjercicio(def) }, 'Ver cómo se hace')),
          el(
            'div.item-ed-mover',
            el('button.btn.btn-icono.btn-peq', { type: 'button', 'aria-label': 'Subir', disabled: idx === 0, onclick: () => mover(idx, -1) }, '↑'),
            el('button.btn.btn-icono.btn-peq', { type: 'button', 'aria-label': 'Bajar', disabled: idx === s.items.length - 1, onclick: () => mover(idx, 1) }, '↓'),
            el('button.btn.btn-icono.btn-peq.btn-peligro', { type: 'button', 'aria-label': 'Quitar ejercicio', onclick: () => (s.items.splice(idx, 1), pintarItems()) }, '✕')
          )
        ),
        el(
          'div.rejilla',
          el(
            'label.campo',
            el('span', 'Se mide en'),
            el(
              'select',
              { onchange: (e) => ((it.tipo = e.target.value), pintarSeries()) },
              el('option', { value: 'reps', selected: it.tipo !== 'seg' }, 'Repeticiones'),
              el('option', { value: 'seg', selected: it.tipo === 'seg' }, 'Segundos')
            )
          ),
          el('label.campo', el('span', 'Descanso'), el('input', { value: it.descanso || '', placeholder: 'p. ej. 90 s', oninput: (e) => (it.descanso = e.target.value) })),
          el('label.campo.ancho', el('span', 'Indicaciones'), el('input', { value: it.nota || '', placeholder: 'p. ej. bajar en 3 segundos', oninput: (e) => (it.nota = e.target.value) }))
        ),
        filas
      );
    };

    const asignarEjercicio = (it, id) => {
      it.ej = id;
      const p = propios().find((x) => x.id === id);
      it.def = p ? JSON.parse(JSON.stringify(p)) : null;
      if (!it.def) delete it.def;
      if (id === 'plancha' && !it.tipo) {
        it.tipo = 'seg';
        it.series = [{ reps: 30, kg: null }, { reps: 30, kg: null }, { reps: 30, kg: null }];
      }
    };

    const anadir = async () => {
      const id = await elegirEjercicio();
      if (!id) return;
      const it = { uid: uid(), ej: id, tipo: '', series: [{ reps: 10, kg: null }, { reps: 10, kg: null }, { reps: 10, kg: null }] };
      asignarEjercicio(it, id);
      it.tipo = it.tipo || 'reps';
      s.items.push(it);
      pintarItems();
      lista.lastElementChild && lista.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const elegirAtletas = !editando
      ? el(
          'div.tarjeta.destinatarios',
          el('h2', 'Para'),
          el(
            'div.chips',
            S.sesion.datos.atletas.map((x) =>
              el('label.chip-check', el('input', { type: 'checkbox', checked: destino.has(x.id), onchange: (e) => (e.target.checked ? destino.add(x.id) : destino.delete(x.id)) }), x.nombre)
            )
          ),
          el('p.ayuda', 'Si eliges varios atletas, cada uno recibe su copia de la sesión.')
        )
      : null;

    const guardar = async (btn) => {
      if (!s.fecha) return aviso('Pon la fecha de la sesión.', 'error');
      if (!s.items.length) return aviso('Añade al menos un ejercicio.', 'error');
      if (!editando && !destino.size) return aviso('Elige al menos un atleta.', 'error');
      btn.disabled = true;
      btn.textContent = 'Guardando…';
      const limpia = { id: s.id, fecha: s.fecha, titulo: (s.titulo || '').trim(), notas: (s.notas || '').trim(), items: s.items.map((it) => ({ ...it, series: it.series.map((x) => ({ reps: x.reps, kg: x.kg })) })) };
      try {
        if (editando) {
          await Datos.modificarAtleta(a, (d) => {
            const i = d.sesiones.findIndex((x) => x.id === s.id);
            if (i < 0) d.sesiones.push(limpia);
            else d.sesiones[i] = limpia;
          });
          aviso('Sesión guardada');
          ir(`#/atleta/${a.id}/sesion/${s.id}`);
        } else {
          for (const idA of destino) {
            const at = atletaPorId(idA);
            await Datos.modificarAtleta(at, (d) => void d.sesiones.push({ ...JSON.parse(JSON.stringify(limpia)), id: uid() }));
          }
          aviso(destino.size > 1 ? `Sesión asignada a ${destino.size} atletas` : 'Sesión guardada');
          ir(destino.size === 1 ? '#/atleta/' + [...destino][0] : '#/');
        }
      } catch (e) {
        aviso(errorTexto(e), 'error', 6000);
        btn.disabled = false;
        btn.textContent = 'Guardar';
      }
    };

    app.replaceChildren(
      pestanasEntrenador('#/'),
      el('a.volver', { href: volver }, '← Volver'),
      el('h1.titulo-blanco', editando ? 'Editar sesión' : 'Nueva sesión'),
      elegirAtletas || '',
      el(
        'div.tarjeta',
        el(
          'div.rejilla',
          el('label.campo', el('span', 'Fecha'), el('input', { type: 'date', value: s.fecha, required: true, onchange: (e) => (s.fecha = e.target.value) })),
          el('label.campo', el('span', 'Título'), el('input', { value: s.titulo, placeholder: 'p. ej. Fuerza tren inferior', oninput: (e) => (s.titulo = e.target.value) })),
          el('label.campo.ancho', el('span', 'Indicaciones generales'), el('textarea', { rows: 2, placeholder: 'Calentamiento, objetivo de la sesión…', oninput: (e) => (s.notas = e.target.value) }, s.notas || ''))
        )
      ),
      lista,
      el('div.fila-botones', el('button.btn.btn-grande.btn-anadir', { type: 'button', onclick: anadir }, '+ Añadir ejercicio')),
      el(
        'div.barra-guardar',
        el('a.btn', { href: volver }, 'Cancelar'),
        el('button.btn.btn-primario', { type: 'button', onclick: (e) => guardar(e.currentTarget) }, 'Guardar')
      )
    );
    pintarItems();
  }

  /* ---------- Biblioteca de ejercicios ---------- */
  function vistaEjercicios() {
    const pr = propios();
    const tarjeta = (e, editable) =>
      el(
        'div.tarjeta-ej.estatica',
        el('button.tarjeta-ej-ver', { type: 'button', onclick: () => verEjercicio(completarDef(e)) }, Figuras.ilustracion(completarDef(e), { compacto: true }), el('span', e.nombre), el('small', e.grupo || '')),
        editable && el('button.btn.btn-peq', { type: 'button', onclick: () => editarPropio(e) }, 'Editar')
      );
    const grupos = {};
    catalogo().forEach((e) => (grupos[e.grupo] = grupos[e.grupo] || []).push(e));
    app.replaceChildren(
      pestanasEntrenador('#/ejercicios'),
      el('div.cabecera', el('h1', 'Ejercicios'), el('button.btn.btn-primario', { type: 'button', onclick: () => editarPropio(null) }, '+ Ejercicio propio')),
      el('p.ayuda-blanca', 'Pulsa un ejercicio para ver la animación y la explicación que verá el atleta. Si falta alguno, créalo: puedes reutilizar un dibujo, subir una foto o enlazar un vídeo.'),
      pr.length > 0 && el('h2.titulo-seccion', 'Tus ejercicios'),
      pr.length > 0 && el('div.rejilla-ej', pr.map((e) => tarjeta(e, true))),
      ...Object.entries(grupos).flatMap(([g, l]) => [el('h2.titulo-seccion', g), el('div.rejilla-ej', l.map((e) => tarjeta(e, false)))])
    );
  }

  function reducirImagen(fichero) {
    return new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => {
        const max = 520;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        ok(c.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => mal(new Error('No se puede leer la imagen.'));
      img.src = URL.createObjectURL(fichero);
    });
  }

  async function editarPropio(e) {
    const x = e ? JSON.parse(JSON.stringify(e)) : { id: 'p-' + uid(), nombre: '', grupo: 'Otros', material: '', musculos: '', pasos: [], claves: [], base: '', imagen: '', video: '' };
    const vista = el('div.vista-previa');
    const actualizarVista = () => vista.replaceChildren(Figuras.ilustracion(completarDef({ ...x, poses: null }) || x, { compacto: true }));
    const nombre = el('input', { value: x.nombre, required: true, oninput: (ev) => (x.nombre = ev.target.value) });
    const grupo = el('select', { onchange: (ev) => (x.grupo = ev.target.value) }, ['Piernas', 'Cadera', 'Empuje', 'Tracción', 'Core', 'Potencia', 'Carrera', 'Movilidad', 'Otros'].map((g) => el('option', { selected: x.grupo === g }, g)));
    const base = el(
      'select',
      { onchange: (ev) => ((x.base = ev.target.value), (x.imagen = ''), actualizarVista()) },
      el('option', { value: '' }, '— Sin dibujo —'),
      catalogo().map((c) => el('option', { value: c.id, selected: x.base === c.id }, c.nombre))
    );
    const foto = el('input', {
      type: 'file',
      accept: 'image/*',
      onchange: async (ev) => {
        const f = ev.target.files[0];
        if (!f) return;
        try {
          x.imagen = await reducirImagen(f);
          actualizarVista();
        } catch (err) {
          aviso(err.message, 'error');
        }
      },
    });
    actualizarVista();
    const r = await dialogo({
      titulo: e ? 'Editar ejercicio' : 'Nuevo ejercicio',
      cuerpo: [
        el('label.campo', el('span', 'Nombre'), nombre),
        el('label.campo', el('span', 'Grupo'), grupo),
        el('label.campo', el('span', 'Material'), el('input', { value: x.material, oninput: (ev) => (x.material = ev.target.value) })),
        el('label.campo', el('span', 'Músculos que trabaja'), el('input', { value: x.musculos, oninput: (ev) => (x.musculos = ev.target.value) })),
        el('label.campo', el('span', 'Cómo se hace (un paso por línea)'), el('textarea', { rows: 4, oninput: (ev) => (x.pasos = ev.target.value.split('\n').map((l) => l.trim()).filter(Boolean)) }, x.pasos.join('\n'))),
        el('label.campo', el('span', 'Claves / errores a evitar (una por línea)'), el('textarea', { rows: 3, oninput: (ev) => (x.claves = ev.target.value.split('\n').map((l) => l.trim()).filter(Boolean)) }, x.claves.join('\n'))),
        el('h3', 'Ilustración'),
        vista,
        el('label.campo', el('span', 'Usar el dibujo de'), base),
        el('label.campo', el('span', 'O sube una foto o dibujo'), foto),
        x.imagen && el('button.btn.btn-peq', { type: 'button', onclick: (ev) => ((x.imagen = ''), ev.target.remove(), actualizarVista()) }, 'Quitar foto'),
        el('label.campo', el('span', 'Enlace a un vídeo (opcional)'), el('input', { type: 'url', value: x.video, placeholder: 'https://…', oninput: (ev) => (x.video = ev.target.value.trim()) })),
      ],
      botones: [
        ...(e ? [{ texto: 'Eliminar', valor: 'borrar', peligro: true }] : []),
        { texto: 'Cancelar', valor: null },
        { texto: 'Guardar', valor: 'guardar', primario: true },
      ],
    });
    if (!r) return;
    if (r === 'guardar' && !x.nombre.trim()) return aviso('El ejercicio necesita un nombre.', 'error');
    if (r === 'borrar' && !(await confirmar('Eliminar ejercicio', 'Las sesiones ya asignadas lo conservan.', 'Eliminar', true))) return;
    try {
      await Datos.guardarEntrenador(S.sesion, (d) => {
        d.ejercicios = (d.ejercicios || []).filter((y) => y.id !== x.id);
        if (r === 'guardar') d.ejercicios.push({ ...x, nombre: x.nombre.trim(), poses: undefined });
      });
      aviso(r === 'guardar' ? 'Ejercicio guardado' : 'Ejercicio eliminado');
      vistaEjercicios();
    } catch (err) {
      aviso(errorTexto(err), 'error');
    }
  }

  /* ---------- Ajustes ---------- */
  function vistaAjustes() {
    const d = S.sesion.datos;
    const deducido = GitHub.deducir();
    const g = d.github || { owner: deducido.owner, repo: deducido.repo, branch: 'main', token: '' };
    const owner = el('input', { value: g.owner, placeholder: 'tu-usuario', autocapitalize: 'none' });
    const repo = el('input', { value: g.repo, placeholder: 'entreno', autocapitalize: 'none' });
    const branch = el('input', { value: g.branch || 'main' });
    const token = el('input', { type: 'password', value: g.token || '', placeholder: 'github_pat_…', autocomplete: 'off' });
    const estado = el('div.nota', { hidden: true, role: 'status' });
    const nombre = el('input', { value: d.entrenador.nombre });

    const activar = async (btn) => {
      const conf = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main', token: token.value.trim() };
      if (!GitHub.configurado(conf)) return aviso('Rellena usuario, repositorio y clave.', 'error');
      btn.disabled = true;
      estado.hidden = false;
      estado.className = 'nota nota-info';
      try {
        await Datos.activarGitHub(S.sesion, conf, (t) => (estado.textContent = t + '…'));
        estado.className = 'nota nota-ok';
        estado.textContent = 'Conectado. Tus atletas ya pueden entrar desde su móvil.';
        aviso('Conexión con GitHub activada');
      } catch (e) {
        estado.className = 'nota nota-error';
        estado.textContent = errorTexto(e);
      }
      btn.disabled = false;
    };

    const copia = async () => {
      const atletas = {};
      for (const a of d.atletas) atletas[a.usuario] = await Datos.leerAtleta(a).catch(() => null);
      const todo = { exportado: new Date().toISOString(), entrenador: d.entrenador, ejercicios: d.ejercicios, atletas };
      descargar(`entreno-copia-${Datos.hoy()}.json`, JSON.stringify(todo, null, 1), 'application/json');
    };

    app.replaceChildren(
      pestanasEntrenador('#/ajustes'),
      el('h1.titulo-blanco', 'Ajustes'),
      el(
        'div.tarjeta',
        el('h2', 'Tu cuenta'),
        el('label.campo', el('span', 'Nombre'), nombre),
        el(
          'div.fila-botones',
          el('button.btn', { type: 'button', onclick: async () => {
            try {
              await Datos.guardarEntrenador(S.sesion, (x) => void (x.entrenador.nombre = nombre.value.trim() || x.entrenador.nombre));
              pintarBarra();
              aviso('Guardado');
            } catch (e) {
              aviso(errorTexto(e), 'error');
            }
          } }, 'Guardar nombre'),
          el('button.btn', { type: 'button', onclick: () => cambiarMiPassword() }, 'Cambiar contraseña')
        )
      ),
      el(
        'div.tarjeta',
        el('h2', 'Conexión con GitHub'),
        Datos.conGitHub() ? el('div.nota.nota-ok', `Conectado a ${d.github.owner}/${d.github.repo}.`) : el('div.nota.nota-alerta', 'Sin conectar: modo prueba (solo este dispositivo).'),
        el('p', 'Los datos se guardan cifrados en tu repositorio. Así tus atletas ven la planificación en su móvil y tú ves lo que registran.'),
        el(
          'details',
          el('summary', 'Cómo conseguir la clave (una sola vez)'),
          el(
            'ol',
            el('li', 'En GitHub: tu foto → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.'),
            el('li', 'Repository access: «Only select repositories» y elige el repositorio de esta app.'),
            el('li', 'Permissions → Contents: «Read and write». Nada más.'),
            el('li', 'Copia la clave y pégala aquí.')
          )
        ),
        el('div.rejilla', el('label.campo', el('span', 'Usuario de GitHub'), owner), el('label.campo', el('span', 'Repositorio'), repo), el('label.campo', el('span', 'Rama'), branch), el('label.campo', el('span', 'Clave (token)'), token)),
        estado,
        el('div.fila-botones', el('button.btn.btn-primario', { type: 'button', onclick: (e) => activar(e.currentTarget) }, Datos.conGitHub() ? 'Guardar y repartir a los atletas' : 'Comprobar y activar')),
        el('p.ayuda', 'La clave viaja cifrada dentro de los ficheros de cada atleta para que su app pueda guardar sus registros. Solo da acceso a este repositorio. Si sospechas que se ha filtrado, bórrala en GitHub, crea otra y pégala aquí.')
      ),
      el(
        'div.tarjeta',
        el('h2', 'Copia de seguridad'),
        el('p', 'Descarga todos los datos (sin cifrar) en un fichero: planificaciones y registros de todos tus atletas.'),
        el('button.btn', { type: 'button', onclick: copia }, 'Descargar copia')
      )
    );
  }

  async function cambiarMiPassword() {
    const p1 = el('input', { type: 'password', minlength: 8, autocomplete: 'new-password' });
    const p2 = el('input', { type: 'password', autocomplete: 'new-password' });
    const ok = await dialogo({
      titulo: 'Cambiar contraseña',
      cuerpo: [el('label.campo', el('span', 'Nueva contraseña'), p1), el('label.campo', el('span', 'Repítela'), p2)],
      botones: [
        { texto: 'Cancelar', valor: false },
        { texto: 'Cambiar', valor: true, primario: true },
      ],
    });
    if (!ok) return;
    const min = S.sesion.rol === 'entrenador' ? 10 : 8;
    if (p1.value.length < min) return aviso(`Mínimo ${min} caracteres.`, 'error');
    if (p1.value !== p2.value) return aviso('Las contraseñas no coinciden.', 'error');
    try {
      await Datos.cambiarPassword(S.sesion, S.sesion.usuario, p1.value);
      aviso('Contraseña cambiada');
    } catch (e) {
      aviso(errorTexto(e), 'error');
    }
  }

  /* ================= ATLETA ================= */
  async function vistaInicioAtleta() {
    cargando();
    await Datos.releer(S.sesion).catch(() => (S.sesion.sinConexion = true));
    await Datos.aplicarPendientes(S.sesion);
    const d = S.sesion.datos;
    const h = Datos.hoy();
    const ses = (d.sesiones || []).slice().sort((x, y) => x.fecha.localeCompare(y.fecha));
    const fila = (s) => {
      const cs = Datos.cumplimientoSesion(s, d.registros[s.id]);
      return el(
        'a.fila-sesion' + (s.fecha === h ? '.es-hoy' : ''),
        { href: '#/s/' + s.id },
        el('div', el('b', s.titulo || 'Sesión'), el('span.meta', `${fechaBonita(s.fecha)} · ${s.items.length} ejercicios`)),
        el('div.fila-sesion-der', chipEstado(cs))
      );
    };
    const deHoy = ses.filter((s) => s.fecha === h);
    const proximas = ses.filter((s) => s.fecha > h);
    const pendientesAtras = ses.filter((s) => s.fecha < h && !(d.registros[s.id] && d.registros[s.id].completada)).reverse();
    const hechas = ses.filter((s) => s.fecha < h && d.registros[s.id] && d.registros[s.id].completada).reverse();
    const c = Datos.cumplimientoPeriodo(d);
    app.replaceChildren(
      avisoModo() || '',
      el('h1.titulo-blanco', 'Hola, ' + d.atleta.nombre.split(' ')[0]),
      el(
        'div.tarjeta.resumen',
        el('div.fila-sep', el('b', 'Tu cumplimiento (4 semanas)'), el('span.pct.tono-' + colorPct(c.pct), c.pct == null ? '—' : c.pct + '%')),
        barra(c.pct),
        el('p.ayuda', d.entrenador ? 'Planificación de ' + d.entrenador : '')
      ),
      el('h2.titulo-seccion', 'Hoy'),
      deHoy.length ? el('div.lista', deHoy.map(fila)) : el('p.vacio-blanco', 'Hoy no tienes sesión. ¡Descansa!'),
      pendientesAtras.length > 0 && el('h2.titulo-seccion', 'Sin terminar'),
      pendientesAtras.length > 0 && el('div.lista', pendientesAtras.slice(0, 10).map(fila)),
      el('h2.titulo-seccion', 'Próximas'),
      proximas.length ? el('div.lista', proximas.map(fila)) : el('p.vacio-blanco', 'No hay más sesiones programadas.'),
      hechas.length > 0 && el('details.historial', el('summary', `Sesiones terminadas (${hechas.length})`), el('div.lista', hechas.map(fila))),
      el('p', el('a.enlace-blanco', { href: '#/cuenta' }, 'Mi cuenta'))
    );
  }

  function vistaCuentaAtleta() {
    app.replaceChildren(
      el('a.volver', { href: '#/' }, '← Inicio'),
      el('h1.titulo-blanco', 'Mi cuenta'),
      el('div.tarjeta', el('p', el('b', 'Usuario: '), S.sesion.datos.atleta.usuario), el('button.btn', { type: 'button', onclick: () => cambiarMiPassword() }, 'Cambiar contraseña'))
    );
  }

  function vistaSesionAtleta(sid) {
    const d = S.sesion.datos;
    const s = (d.sesiones || []).find((x) => x.id === sid);
    if (!s) return ir('#/');
    const reg = JSON.parse(JSON.stringify(d.registros[sid] || { items: {}, rpe: null, comentario: '', completada: null }));
    reg.items = reg.items || {};
    const estadoGuardado = el('span.guardado', { role: 'status', 'aria-live': 'polite' });
    const resumen = el('div');
    let temporizador = null;

    const pintarResumen = () => {
      const cs = Datos.cumplimientoSesion(s, reg);
      resumen.replaceChildren(el('div.fila-sep', el('b', 'Llevas'), el('span.pct.tono-' + colorPct(cs.pct || 0), (cs.pct || 0) + '%')), barra(cs.pct || 0), el('p.meta', `${cs.hechas} de ${cs.series} series`));
    };

    const guardar = (inmediato) => {
      reg.actualizado = new Date().toISOString();
      estadoGuardado.textContent = 'Guardando…';
      pintarResumen();
      clearTimeout(temporizador);
      const hacer = async () => {
        const ok = await Datos.guardarRegistro(S.sesion, sid, JSON.parse(JSON.stringify(reg)));
        estadoGuardado.textContent = ok ? '✓ Guardado y enviado' : '⏳ Guardado en el móvil. Se enviará al recuperar la conexión.';
        return ok;
      };
      if (inmediato) return hacer();
      temporizador = setTimeout(hacer, 1200);
    };

    const tarjetaItem = (it, idx) => {
      const def = defItem(it);
      const r = (reg.items[it.uid] = reg.items[it.uid] || { series: [], nota: '' });
      const unidad = it.tipo === 'seg' ? 'seg' : 'reps';
      const filas = el('div.series-atleta');
      const pintarFilas = () => {
        filas.replaceChildren(
          ...it.series.map((obj, i) => {
            const real = (r.series[i] = r.series[i] || { reps: null, kg: null, hecho: false });
            const completa = Datos.cumplimientoSerie(obj, real) >= 1;
            const fila = el(
              'div.serie-at' + (completa ? '.hecha' : real.reps != null || real.kg != null ? '.parcial' : ''),
              el('span.n', { 'aria-hidden': 'true' }, i + 1),
              el('span.obj', el('small', 'Objetivo'), `${obj.reps || '—'} ${unidad}${obj.kg ? ' · ' + obj.kg + ' kg' : ''}`),
              el(
                'label.entrada',
                el('small', unidad === 'seg' ? 'Segundos' : 'Reps'),
                el('input', {
                  type: 'number',
                  inputmode: 'numeric',
                  min: 0,
                  value: real.reps ?? '',
                  placeholder: obj.reps ?? '',
                  'aria-label': `Serie ${i + 1}, ${unidad === 'seg' ? 'segundos' : 'repeticiones'} hechas (objetivo ${obj.reps || 'libre'})`,
                  oninput: (e) => {
                    real.reps = Datos.num(e.target.value);
                    real.hecho = real.reps != null;
                    if (real.hecho && real.kg == null && obj.kg) {
                      real.kg = obj.kg;
                      $('input[data-kg]', fila).value = obj.kg;
                    }
                    actualizarFila();
                    guardar();
                  },
                })
              ),
              el(
                'label.entrada',
                el('small', 'Kg'),
                el('input', {
                  type: 'number',
                  inputmode: 'decimal',
                  min: 0,
                  step: 0.5,
                  'data-kg': '',
                  value: real.kg ?? '',
                  placeholder: obj.kg ?? '—',
                  'aria-label': `Serie ${i + 1}, kilos usados (objetivo ${obj.kg || 'sin peso'})`,
                  oninput: (e) => {
                    real.kg = Datos.num(e.target.value);
                    actualizarFila();
                    guardar();
                  },
                })
              ),
              el(
                'button.btn-check',
                {
                  type: 'button',
                  'aria-label': `Serie ${i + 1} hecha tal cual`,
                  title: 'Hecha tal cual',
                  onclick: () => {
                    const yaHecha = Datos.cumplimientoSerie(obj, real) >= 1 && real.reps === obj.reps;
                    if (yaHecha) Object.assign(real, { reps: null, kg: null, hecho: false });
                    else Object.assign(real, { reps: obj.reps, kg: obj.kg, hecho: true });
                    pintarFilas();
                    guardar();
                  },
                },
                '✓'
              )
            );
            const actualizarFila = () => {
              const c = Datos.cumplimientoSerie(obj, real);
              fila.classList.toggle('hecha', c >= 1);
              fila.classList.toggle('parcial', c < 1 && (real.reps != null || real.kg != null));
            };
            return fila;
          })
        );
      };
      pintarFilas();
      const ficha = el('details.como', el('summary', 'Cómo se hace'), fichaEjercicio(def));
      return el(
        'section.tarjeta.ej-atleta',
        { 'aria-labelledby': 'ej-' + it.uid },
        el('div.ej-cab', el('span.ej-num', idx + 1), el('div', el('h2', { id: 'ej-' + it.uid }, def.nombre), el('span.objetivo', textoObjetivo(it)), it.descanso && el('span.meta', 'Descanso: ' + it.descanso))),
        Figuras.ilustracion(def),
        it.nota && el('div.nota.nota-info', el('b', 'Indicación: '), it.nota),
        ficha,
        filas,
        el('label.campo', el('span', 'Comentario (opcional)'), el('input', { value: r.nota || '', placeholder: 'Molestias, sensaciones…', oninput: (e) => ((r.nota = e.target.value), guardar()) }))
      );
    };

    const rpe = el(
      'select',
      { onchange: (e) => ((reg.rpe = Datos.num(e.target.value)), guardar()) },
      el('option', { value: '' }, '—'),
      Array.from({ length: 10 }, (_, i) =>
        el('option', { value: i + 1, selected: reg.rpe === i + 1 }, `${i + 1} · ${['Muy suave', 'Suave', 'Suave', 'Moderado', 'Moderado', 'Algo duro', 'Duro', 'Muy duro', 'Durísimo', 'Máximo'][i]}`)
      )
    );

    const terminar = el('button.btn.btn-primario.btn-grande', {
      type: 'button',
      onclick: async () => {
        const cs = Datos.cumplimientoSesion(s, reg);
        if (cs.hechas < cs.series && !(await confirmar('Terminar sesión', `Has registrado ${cs.hechas} de ${cs.series} series. ¿Terminar de todas formas?`, 'Terminar'))) return;
        reg.completada = new Date().toISOString();
        const ok = await guardar(true);
        aviso(ok ? '¡Sesión terminada! Tu entrenador ya puede verla.' : 'Sesión terminada. Se enviará cuando tengas conexión.', ok ? 'ok' : 'alerta', 4500);
        ir('#/');
      },
    }, reg.completada ? 'Guardar cambios' : 'Terminar sesión');

    app.replaceChildren(
      el('a.volver', { href: '#/' }, '← Mis sesiones'),
      el('div.cabecera', el('div', el('h1', s.titulo || 'Sesión'), el('span.ayuda-blanca', fechaBonita(s.fecha)))),
      s.notas && el('div.tarjeta.indicaciones', el('b', 'Indicaciones del entrenador'), el('p', s.notas)),
      el('div.tarjeta.resumen.pegajoso', resumen, estadoGuardado),
      el('p.ayuda-blanca', 'Escribe las repeticiones y los kilos que has hecho en cada serie. Si la has hecho tal cual estaba, pulsa ✓.'),
      ...s.items.map(tarjetaItem),
      el(
        'div.tarjeta',
        el('h2', 'Al terminar'),
        el('label.campo', el('span', '¿Cómo de dura ha sido? (esfuerzo percibido)'), rpe),
        el('label.campo', el('span', 'Comentario para tu entrenador'), el('textarea', { rows: 3, oninput: (e) => ((reg.comentario = e.target.value), guardar()) }, reg.comentario || '')),
        terminar
      )
    );
    pintarResumen();
  }

  window.addEventListener('online', () => {
    if (S.sesion && S.sesion.rol === 'atleta') Datos.enviarPendientes(S.sesion).then((ok) => ok && aviso('Registros enviados'));
  });

  /* ================= Arranque ================= */
  (async function arrancar() {
    try {
      const s = await Datos.recuperar();
      if (s) return iniciar(s);
    } catch (e) {
      aviso('Sin conexión. Vuelve a intentarlo cuando tengas cobertura.', 'error', 6000);
    }
    pantallaAcceso();
  })();
})();
