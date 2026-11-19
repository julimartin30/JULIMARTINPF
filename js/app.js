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
    const man = Datos.sumarDias(h, 1);
    if (f === h) return 'Hoy';
    if (f === man) return 'Mañana';
    return DIAS[d.getDay()].replace(/^./, (c) => c.toUpperCase()) + ' ' + fechaCorta(f);
  }
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
  /** Texto de una serie (pautada o realizada): «10 reps · 60 kg», «30 s», «5 km · Z2». */
  const textoSerie = (it, x) => {
    if (!x) return '—';
    if (it.tipo === 'km') return `${x.km != null && x.km !== '' ? Graficas.fmt(+x.km, 2) : '—'} km${x.zona ? ' · ' + x.zona : ''}`;
    const u = it.tipo === 'seg' ? ' s' : ' reps';
    return `${x.reps != null && x.reps !== '' ? x.reps : '—'}${u}${x.kg != null && x.kg !== '' ? ' · ' + x.kg + ' kg' : ''}`;
  };
  const textoObjetivo = (it) => {
    const series = it.series || [];
    if (!series.length) return '';
    if (it.tipo === 'km') {
      const total = series.reduce((t, x) => t + (Datos.num(x.km) || 0), 0);
      return series.length === 1 ? textoSerie(it, series[0]) : `${Graficas.fmt(total, 2)} km en ${series.length} tramos (${series.map((x) => x.zona || '—').join(', ')})`;
    }
    const unidad = it.tipo === 'seg' ? ' s' : '';
    const iguales = series.every((x) => x.reps === series[0].reps && x.kg === series[0].kg);
    const uno = (x) => `${x.reps || '—'}${unidad}${x.kg ? ' · ' + x.kg + ' kg' : ''}`;
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
        const [vista, id, sub, x, y] = partes;
        if (vista === 'atleta' && id) {
          if (sub === 'sesion' && x && y === 'editar') return await vistaEditor(id, 'instancia', x);
          if (sub === 'sesion' && x) return await vistaRevision(id, x);
          if (sub === 'disenar') return await vistaEditor(id, 'plantilla', x || 'nueva');
          if (sub === 'plan' || sub === 'evolucion' || sub === 'sesiones') return await vistaFicha(id, sub, x);
          return ir(`#/atleta/${id}/sesiones`);
        }
        if (vista === 'ejercicios') return vistaEjercicios();
        if (vista === 'ajustes') return vistaAjustes();
        return await vistaInicioEntrenador();
      }
      const [vista, x] = partes;
      if (vista === 's' && x) return vistaSesionAtleta(x);
      if (vista === 'microciclo') return await vistaMicrociclo(x);
      if (vista === 'evolucion') return await vistaEvolucionAtleta();
      if (vista === 'cuenta') return vistaCuentaAtleta();
      return await vistaCalendarioAtleta(vista === 'calendario' ? x : null);
    } catch (e) {
      console.error(e);
      app.replaceChildren(el('div.tarjeta', el('h2', 'No se ha podido cargar'), el('p', errorTexto(e)), el('button.btn', { type: 'button', onclick: render }, 'Reintentar')));
    }
  }
  window.addEventListener('hashchange', () => S.sesion && render());

  function pestanas(lista, activa, etiqueta) {
    return el(
      'nav.pestanas',
      { 'aria-label': etiqueta || 'Secciones' },
      lista.map(([h, t, clave]) => el('a.pestana', { href: h, 'aria-current': clave === activa ? 'page' : null }, t))
    );
  }
  const pestanasEntrenador = (activa) =>
    pestanas(
      [
        ['#/', 'Atletas', 'atletas'],
        ['#/ejercicios', 'Ejercicios', 'ejercicios'],
        ['#/ajustes', 'Ajustes', 'ajustes'],
      ],
      activa
    );

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
      const iniciales = a.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
      if (!d) return el('a.tarjeta-atleta', { href: `#/atleta/${a.id}/sesiones` }, el('b', a.nombre), el('span.ayuda', 'No se han podido leer sus datos'));
      const c = Datos.cumplimientoPeriodo(d);
      const prox = (d.sesiones || []).filter((s) => s.fecha >= h && !(d.registros[s.id] && d.registros[s.id].completada)).sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
      const ult = Object.values(d.registros || {}).map((r) => r.actualizado).filter(Boolean).sort().pop();
      return el(
        'a.tarjeta-atleta',
        { href: `#/atleta/${a.id}/sesiones` },
        el('div.atleta-cab', el('span.avatar', { 'aria-hidden': 'true' }, iniciales), el('b', a.nombre), el('span.pct.tono-' + colorPct(c.pct), c.pct == null ? '—' : c.pct + '%')),
        barra(c.pct, 'Cumplimiento de ' + a.nombre),
        el('span.ayuda', c.sesiones ? `Cumplimiento últimas 4 semanas (${c.sesiones} sesiones)` : 'Sin sesiones vencidas en las últimas 4 semanas'),
        el('span.meta', prox ? `Próxima: ${fechaBonita(prox.fecha)} · ${prox.titulo || 'Sesión'}` : 'Sin sesiones programadas'),
        el('span.meta', ult ? 'Último registro: ' + new Date(ult).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : 'Aún no ha registrado nada')
      );
    });
    app.replaceChildren(
      pestanasEntrenador('atletas'),
      avisoModo() || '',
      el('div.cabecera', el('h1', 'Atletas'), el('button.btn.btn-primario', { type: 'button', onclick: nuevoAtleta }, '+ Añadir atleta')),
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
      ir(`#/atleta/${a.id}/sesiones`);
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

  async function menuCuentaAtleta(a) {
    const r = await dialogo({
      titulo: 'Cuenta de ' + a.nombre,
      cuerpo: el('p', 'Usuario: ' + a.usuario),
      botones: [
        { texto: 'Eliminar atleta', valor: 'borrar', peligro: true },
        { texto: 'Nueva contraseña', valor: 'pass' },
        { texto: 'Cerrar', valor: null, primario: true },
      ],
    });
    if (r === 'pass') nuevaPasswordAtleta(a);
    if (r === 'borrar') borrarAtleta(a);
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
    if (!(await confirmar('Eliminar atleta', `Se borrarán las sesiones, la planificación, los registros y las mediciones de ${a.nombre}. No se puede deshacer.`, 'Eliminar', true))) return;
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

  /* ---------- Ficha del atleta: Sesiones · Planificación · Evolución ---------- */
  async function vistaFicha(id, pestana, arg) {
    const a = atletaPorId(id);
    if (!a) return ir('#/');
    cargando();
    const d = await datosAtleta(a, true);
    if (!d) throw new Error('No se han podido leer los datos de ' + a.nombre);
    d.plantillas = d.plantillas || [];
    const c = Datos.cumplimientoPeriodo(d);
    const contenido = el('div.ficha-contenido');
    app.replaceChildren(
      el('a.volver', { href: '#/' }, '← Atletas'),
      el(
        'div.cabecera.cabecera-ficha',
        el('div', el('h1', a.nombre), el('span.ayuda-blanca', c.pct == null ? 'Sin sesiones vencidas en las últimas 4 semanas' : `Cumplimiento últimas 4 semanas: ${c.pct}%`)),
        el('button.btn.btn-peq.btn-claro', { type: 'button', onclick: () => menuCuentaAtleta(a) }, 'Cuenta')
      ),
      pestanas(
        [
          [`#/atleta/${id}/sesiones`, 'Sesiones', 'sesiones'],
          [`#/atleta/${id}/plan`, 'Planificación', 'plan'],
          [`#/atleta/${id}/evolucion`, 'Evolución', 'evolucion'],
        ],
        pestana,
        'Ficha de ' + a.nombre
      ),
      contenido
    );
    if (pestana === 'sesiones') pintarSesionesDisenadas(contenido, a, d);
    else if (pestana === 'plan') pintarPlanificacion(contenido, a, d, arg);
    else
      pintarEvolucion(contenido, d, {
        guardar: async (mid, medida) => {
          S.atletas[a.id] = await Datos.guardarMedida(a.ruta, Cripto.unb64(a.dek), mid, medida);
          return S.atletas[a.id];
        },
      });
  }

  /* --- Pestaña Sesiones: las sesiones diseñadas (sin fecha) --- */
  function pintarSesionesDisenadas(contenido, a, d) {
    const h = Datos.hoy();
    const lista = d.plantillas.slice().sort((x, y) => (x.titulo || '').localeCompare(y.titulo || '', 'es'));
    const tarjeta = (p) => {
      const usos = d.sesiones.filter((s) => s.plantilla === p.id);
      const prox = usos.filter((s) => s.fecha >= h).sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
      return el(
        'div.tarjeta.plantilla',
        el('div.fila-sep', el('h2', p.titulo || 'Sesión sin título'), el('span.chip.chip-gris', `${p.items.length} ejercicios`)),
        p.notas && el('p.meta', p.notas),
        el(
          'ul.lista-ej',
          p.items.map((it) => {
            const def = defItem(it);
            return el('li', el('span.mini', Figuras.ilustracion(def, { compacto: true, estatico: true })), el('span', el('b', def.nombre), el('small', textoObjetivo(it))));
          })
        ),
        el('p.meta', usos.length ? `Programada ${usos.length} ${usos.length === 1 ? 'vez' : 'veces'}` + (prox ? ` · próxima: ${fechaBonita(prox.fecha)}` : '') : 'Aún no está programada'),
        el(
          'div.fila-botones',
          el('button.btn.btn-primario.btn-peq', { type: 'button', onclick: () => dialogoProgramar(a, d, [p.id], Datos.hoy()) }, 'Programar'),
          el('a.btn.btn-peq', { href: `#/atleta/${a.id}/disenar/${p.id}` }, 'Editar'),
          el('button.btn.btn-peq', { type: 'button', onclick: () => duplicarPlantilla(a, p) }, 'Duplicar'),
          S.sesion.datos.atletas.length > 1 && el('button.btn.btn-peq', { type: 'button', onclick: () => copiarPlantillaA(a, p) }, 'Copiar a otro atleta'),
          el('button.btn.btn-peq.btn-peligro', { type: 'button', onclick: () => borrarPlantilla(a, p, usos) }, 'Eliminar')
        )
      );
    };
    contenido.replaceChildren(
      el(
        'div.cabecera',
        el('p.ayuda-blanca', 'Diseña aquí las sesiones de este atleta. Después, en Planificación, colócalas en los días del calendario.'),
        el('a.btn.btn-primario', { href: `#/atleta/${a.id}/disenar/nueva` }, '+ Diseñar sesión')
      ),
      lista.length
        ? el('div.lista-plantillas', lista.map(tarjeta))
        : el('div.tarjeta.vacio', el('p', 'Todavía no hay sesiones diseñadas para este atleta.'), el('a.btn.btn-primario', { href: `#/atleta/${a.id}/disenar/nueva` }, '+ Diseñar la primera'))
    );
  }

  function duplicarPlantilla(a, p) {
    S.borrador = { ...JSON.parse(JSON.stringify(p)), id: null, titulo: (p.titulo || 'Sesión') + ' (copia)' };
    ir(`#/atleta/${a.id}/disenar/copia`);
  }

  async function copiarPlantillaA(a, p) {
    const otros = S.sesion.datos.atletas.filter((x) => x.id !== a.id);
    const marcados = new Set();
    const ok = await dialogo({
      titulo: 'Copiar «' + (p.titulo || 'Sesión') + '»',
      cuerpo: [
        el('p', 'Se añadirá a las sesiones diseñadas de:'),
        el('div.chips', otros.map((x) => el('label.chip-check', el('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? marcados.add(x.id) : marcados.delete(x.id)) }), x.nombre))),
      ],
      botones: [
        { texto: 'Cancelar', valor: false },
        { texto: 'Copiar', valor: true, primario: true },
      ],
    });
    if (!ok || !marcados.size) return;
    try {
      for (const idA of marcados) {
        await Datos.modificarAtleta(atletaPorId(idA), (d) => {
          d.plantillas = d.plantillas || [];
          d.plantillas.push({ ...JSON.parse(JSON.stringify(p)), id: uid() });
        });
      }
      aviso(`Copiada a ${marcados.size} atleta${marcados.size > 1 ? 's' : ''}`);
    } catch (e) {
      aviso(errorTexto(e), 'error');
    }
  }

  async function borrarPlantilla(a, p, usos) {
    const pendientes = usos.filter((s) => !tieneRegistro(S.atletas[a.id], s.id) && s.fecha >= Datos.hoy());
    const r = await dialogo({
      titulo: 'Eliminar «' + (p.titulo || 'Sesión') + '»',
      cuerpo: el('p', pendientes.length ? `Está programada en ${pendientes.length} día(s) futuros sin registrar. ¿Quitarla también del calendario?` : 'Las sesiones ya hechas se conservan en el calendario.'),
      botones: [
        { texto: 'Cancelar', valor: null },
        ...(pendientes.length ? [{ texto: 'Eliminar y quitar del calendario', valor: 'todo', peligro: true }] : []),
        { texto: pendientes.length ? 'Solo eliminar el diseño' : 'Eliminar', valor: 'solo', peligro: !pendientes.length, primario: !!pendientes.length },
      ],
    });
    if (!r) return;
    try {
      const quitar = new Set(r === 'todo' ? pendientes.map((s) => s.id) : []);
      await Datos.modificarAtleta(a, (d) => {
        d.plantillas = (d.plantillas || []).filter((x) => x.id !== p.id);
        d.sesiones = d.sesiones.filter((s) => !quitar.has(s.id));
      });
      aviso('Sesión eliminada');
      render();
    } catch (e) {
      aviso(errorTexto(e), 'error');
    }
  }

  const tieneRegistro = (d, sid) => {
    const r = d && d.registros && d.registros[sid];
    return !!(r && (r.completada || Object.values(r.items || {}).some((x) => (x.series || []).some((s) => s && (s.reps != null || s.kg != null || s.km != null || s.hecho)))));
  };

  /** Coloca una o varias sesiones diseñadas en una fecha (y opcionalmente las repite cada semana). */
  async function programar(a, ids, fecha, semanas) {
    let n = 0;
    await Datos.modificarAtleta(a, (d) => {
      for (let w = 0; w < semanas; w++) {
        const f = Datos.sumarDias(fecha, 7 * w);
        ids.forEach((pid) => {
          const p = (d.plantillas || []).find((x) => x.id === pid);
          if (!p) return;
          d.sesiones.push({ id: uid(), plantilla: p.id, fecha: f, titulo: p.titulo, notas: p.notas, items: JSON.parse(JSON.stringify(p.items)) });
          n++;
        });
      }
    });
    return n;
  }

  function selectorRepetir() {
    return el(
      'select',
      Array.from({ length: 12 }, (_, i) => el('option', { value: i + 1 }, i === 0 ? 'Solo este día' : `Repetir ${i + 1} semanas (mismo día)`))
    );
  }

  async function dialogoProgramar(a, d, idsMarcados, fecha) {
    const fechaIn = el('input', { type: 'date', value: fecha });
    const rep = selectorRepetir();
    const ok = await dialogo({
      titulo: 'Programar sesión',
      cuerpo: [el('label.campo', el('span', 'Fecha'), fechaIn), el('label.campo', el('span', 'Repetición'), rep)],
      botones: [
        { texto: 'Cancelar', valor: false },
        { texto: 'Programar', valor: true, primario: true },
      ],
    });
    if (!ok || !fechaIn.value) return;
    try {
      const n = await programar(a, idsMarcados, fechaIn.value, +rep.value);
      aviso(n === 1 ? `Programada el ${fechaCorta(fechaIn.value)}` : `${n} sesiones programadas`);
      ir(`#/atleta/${a.id}/plan/${fechaIn.value.slice(0, 7)}`);
    } catch (e) {
      aviso(errorTexto(e), 'error');
    }
  }

  /* --- Pestaña Planificación: calendario mensual --- */
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /**
   * Calendario mensual (lo usan el entrenador y el atleta).
   * op.hrefMes(mes), op.hrefSesion(s), op.alPulsarDia(fecha), op.etiquetaDia(fecha, n)
   */
  function calendarioMes(d, mes, op) {
    const h = Datos.hoy();
    const [Y, M] = mes.split('-').map(Number);
    const otroMes = (delta) => {
      const dd = new Date(Y, M - 1 + delta, 1);
      return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`;
    };
    const porDia = {};
    (d.sesiones || []).forEach((s) => (porDia[s.fecha] = porDia[s.fecha] || []).push(s));
    const celdas = [];
    let f = Datos.lunes(`${mes}-01`);
    do {
      for (let i = 0; i < 7; i++) {
        const fecha = f;
        const ses = (porDia[fecha] || []).slice().sort((x, y) => (x.titulo || '').localeCompare(y.titulo || ''));
        celdas.push(
          el(
            'div.dia' + (fecha.slice(0, 7) === mes ? '' : '.fuera') + (fecha === h ? '.hoy' : ''),
            { role: 'gridcell' },
            el(
              'button.dia-num',
              { type: 'button', 'aria-label': op.etiquetaDia(fecha, ses.length), onclick: () => op.alPulsarDia(fecha) },
              el('span', +fecha.slice(8)),
              op.mas && el('span.mas', { 'aria-hidden': 'true' }, '+')
            ),
            ses.map((s) => {
              const cs = Datos.cumplimientoSesion(s, d.registros[s.id]);
              return el(
                'a.chip-sesion.tono-borde-' + (cs.estado === 'completada' ? colorPct(cs.pct) : ESTADOS[cs.estado][1]),
                { href: op.hrefSesion(s), title: `${s.titulo || 'Sesión'} · ${ESTADOS[cs.estado][0]}`, onclick: op.alPulsarSesion },
                s.titulo || 'Sesión'
              );
            })
          )
        );
        f = Datos.sumarDias(f, 1);
      }
    } while (f.slice(0, 7) === mes);
    return [
      el(
        'div.cal-nav',
        el('a.btn.btn-peq.btn-claro', { href: op.hrefMes(otroMes(-1)), 'aria-label': 'Mes anterior' }, '‹'),
        el('h2.cal-titulo', `${MESES[M - 1]} ${Y}`.replace(/^./, (c) => c.toUpperCase())),
        el('a.btn.btn-peq.btn-claro', { href: op.hrefMes(otroMes(1)), 'aria-label': 'Mes siguiente' }, '›'),
        mes !== h.slice(0, 7) && el('a.btn.btn-peq.btn-claro', { href: op.hrefMes(h.slice(0, 7)) }, 'Hoy')
      ),
      el('div.calendario', { role: 'grid', 'aria-label': op.titulo }, ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((x) => el('div.cal-cab', { role: 'columnheader' }, x)), celdas),
      el(
        'div.leyenda.leyenda-blanca',
        el('span', el('i.tono-gris'), 'Pendiente'),
        el('span', el('i', { style: 'background:var(--acento)' }), 'Hoy'),
        el('span', el('i.tono-medio'), 'A medias'),
        el('span', el('i.tono-ok'), 'Cumplida ≥90%'),
        el('span', el('i.tono-mal'), 'No hecha / <60%')
      ),
    ];
  }
  const mesValido = (m) => (/^\d{4}-\d{2}$/.test(m || '') ? m : Datos.hoy().slice(0, 7));

  function pintarPlanificacion(contenido, a, d, mesArg) {
    contenido.replaceChildren(
      ...calendarioMes(d, mesValido(mesArg), {
        titulo: 'Calendario de ' + a.nombre,
        mas: true,
        hrefMes: (m) => `#/atleta/${a.id}/plan/${m}`,
        hrefSesion: (s) => `#/atleta/${a.id}/sesion/${s.id}`,
        alPulsarDia: (fecha) => dialogoDia(a, fecha),
        etiquetaDia: (fecha, n) => `${fechaBonita(fecha)}: ${n ? n + ' sesiones' : 'sin sesiones'}. Añadir o ver`,
      }),
      d.plantillas.length ? el('p.ayuda-blanca', 'Pulsa el número de un día para añadir sesiones diseñadas. Pulsa una sesión para ver lo que ha registrado el atleta.') : el('div.nota.nota-alerta', 'Primero diseña alguna sesión en la pestaña «Sesiones».')
    );
  }

  async function dialogoDia(a, fecha) {
    const d = S.atletas[a.id];
    const ses = d.sesiones.filter((s) => s.fecha === fecha);
    const marcados = new Set();
    const rep = selectorRepetir();
    const lista = el(
      'div.lista-dia',
      ses.map((s) => {
        const cs = Datos.cumplimientoSesion(s, d.registros[s.id]);
        return el('div.fila-dia', el('a', { href: `#/atleta/${a.id}/sesion/${s.id}`, onclick: () => cerrarDialogo() }, s.titulo || 'Sesión'), chipEstado(cs));
      })
    );
    let cerrarDialogo = () => {};
    const promesa = dialogo({
      titulo: fechaBonita(fecha),
      cuerpo: [
        ses.length ? [el('h3', 'Programadas'), lista] : el('p.meta', 'No hay sesiones este día.'),
        el('h3', 'Añadir sesiones diseñadas'),
        (d.plantillas || []).length
          ? el(
              'div.chips',
              d.plantillas.map((p) => el('label.chip-check', el('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? marcados.add(p.id) : marcados.delete(p.id)) }), p.titulo || 'Sesión'))
            )
          : el('p', 'No hay sesiones diseñadas. ', el('a', { href: `#/atleta/${a.id}/disenar/nueva`, onclick: () => cerrarDialogo() }, 'Diseña la primera')),
        (d.plantillas || []).length && el('label.campo', el('span', 'Repetición'), rep),
      ],
      botones: [
        { texto: 'Cerrar', valor: false },
        ...((d.plantillas || []).length ? [{ texto: 'Añadir', valor: true, primario: true }] : []),
      ],
    });
    cerrarDialogo = () => {
      const dl = document.querySelector('dialog.dialogo');
      if (dl) {
        dl.close();
        dl.remove();
      }
    };
    const ok = await promesa;
    if (!ok || !marcados.size) return;
    try {
      const n = await programar(a, [...marcados], fecha, +rep.value);
      aviso(n === 1 ? 'Sesión añadida' : `${n} sesiones añadidas`);
      render();
    } catch (e) {
      aviso(errorTexto(e), 'error');
    }
  }

  /* ---------- Revisión de una sesión programada (entrenador) ---------- */
  async function vistaRevision(id, sid) {
    const a = atletaPorId(id);
    if (!a) return ir('#/');
    cargando();
    const d = await datosAtleta(a, true);
    const s = d && d.sesiones.find((x) => x.id === sid);
    if (!s) return ir(`#/atleta/${id}/plan`);
    const reg = d.registros[sid];
    const cs = Datos.cumplimientoSesion(s, reg);
    const bloques = s.items.map((it) => {
      const def = defItem(it);
      const r = reg && reg.items && reg.items[it.uid];
      const filas = it.series.map((obj, i) => {
        const real = r && r.series && r.series[i];
        const pct = Math.round(Datos.cumplimientoSerie(obj, real) * 100);
        const hecho = real && (Datos.num(real.reps) != null || Datos.num(real.kg) != null || Datos.num(real.km) != null || real.hecho);
        return el('tr', el('td', i + 1), el('td', textoSerie(it, obj)), el('td', hecho ? textoSerie(it, real) : '—'), el('td', el('span.pct-mini.tono-' + colorPct(hecho ? pct : 0), hecho ? pct + '%' : '0%')));
      });
      const extra = r && r.series ? r.series.slice(it.series.length).filter((x) => x && (x.reps || x.kg || x.km)) : [];
      return el(
        'div.tarjeta.revision-ej',
        el('div.revision-cab', Figuras.ilustracion(def, { compacto: true }), el('div', el('h3', def.nombre), el('span.meta', 'Pautado: ' + textoObjetivo(it)), it.nota && el('span.meta', 'Tu indicación: ' + it.nota))),
        el('table.tabla', el('thead', el('tr', el('th', 'Serie'), el('th', 'Pautado'), el('th', 'Realizado'), el('th', ''))), el('tbody', filas)),
        extra.length > 0 && el('p.ayuda', `Hizo ${extra.length} serie(s) extra: ` + extra.map((x) => textoSerie(it, x)).join(', ')),
        r && r.nota && el('div.nota.nota-info', el('b', 'Comentario del atleta: '), r.nota)
      );
    });
    app.replaceChildren(
      el('a.volver', { href: `#/atleta/${id}/plan/${s.fecha.slice(0, 7)}` }, '← Planificación de ' + a.nombre),
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
        el('a.btn.btn-primario', { href: `#/atleta/${id}/sesion/${sid}/editar` }, 'Editar este día'),
        el('button.btn', { type: 'button', onclick: () => moverSesion(a, s) }, 'Cambiar de día'),
        el('button.btn.btn-peligro', { type: 'button', onclick: () => borrarSesion(a, s) }, 'Quitar del calendario')
      )
    );
  }

  async function moverSesion(a, s) {
    const f = el('input', { type: 'date', value: s.fecha });
    const ok = await dialogo({
      titulo: 'Cambiar de día',
      cuerpo: el('label.campo', el('span', 'Nueva fecha'), f),
      botones: [
        { texto: 'Cancelar', valor: false },
        { texto: 'Mover', valor: true, primario: true },
      ],
    });
    if (!ok || !f.value || f.value === s.fecha) return;
    try {
      await Datos.modificarAtleta(a, (d) => {
        const x = d.sesiones.find((y) => y.id === s.id);
        if (x) x.fecha = f.value;
      });
      aviso('Sesión movida al ' + fechaCorta(f.value));
      render();
    } catch (e) {
      aviso(errorTexto(e), 'error');
    }
  }

  async function borrarSesion(a, s) {
    if (!(await confirmar('Quitar del calendario', `¿Quitar «${s.titulo || 'Sesión'}» del ${fechaCorta(s.fecha)}? También se borra lo que haya registrado el atleta. El diseño de la sesión se conserva.`, 'Quitar', true))) return;
    try {
      await Datos.modificarAtleta(a, (d) => {
        d.sesiones = d.sesiones.filter((x) => x.id !== s.id);
        delete d.registros[s.id];
      });
      aviso('Sesión quitada');
      ir(`#/atleta/${a.id}/plan/${s.fecha.slice(0, 7)}`);
    } catch (e) {
      aviso(errorTexto(e), 'error');
    }
  }

  /* ---------- Editor: diseñar una sesión (plantilla) o editar un día concreto (instancia) ---------- */
  function nuevaSerie(tipo, base) {
    if (tipo === 'km') return { km: (base && base.km) || 5, zona: (base && base.zona) || 'Z2' };
    return { reps: base && base.reps != null ? base.reps : tipo === 'seg' ? 30 : 10, kg: base ? base.kg ?? null : null };
  }

  async function vistaEditor(idAtleta, modo, xid) {
    const a = atletaPorId(idAtleta);
    if (!a) return ir('#/');
    cargando();
    const d = await datosAtleta(a, true);
    let s;
    if (modo === 'plantilla' && xid === 'copia' && S.borrador) s = S.borrador;
    else if (modo === 'plantilla' && xid !== 'nueva' && xid !== 'copia') s = (d.plantillas || []).find((x) => x.id === xid);
    else if (modo === 'instancia') s = d.sesiones.find((x) => x.id === xid);
    else s = { id: null, titulo: '', notas: '', items: [] };
    if (!s) return ir(`#/atleta/${a.id}/sesiones`);
    s = JSON.parse(JSON.stringify(s));
    S.borrador = null;
    const esPlantilla = modo === 'plantilla';
    const volver = esPlantilla ? `#/atleta/${a.id}/sesiones` : `#/atleta/${a.id}/sesion/${s.id}`;
    const lista = el('div.items-editor');

    const pintarItems = () => lista.replaceChildren(...s.items.map((it, idx) => editorItem(it, idx)), s.items.length ? '' : el('p.vacio-blanco', 'Añade el primer ejercicio.'));
    const mover = (i, delta) => {
      const [x] = s.items.splice(i, 1);
      s.items.splice(i + delta, 0, x);
      pintarItems();
    };

    const editorItem = (it, idx) => {
      const def = defItem(it);
      const filas = el('div.series-editor');
      const pintarSeries = () => {
        const km = it.tipo === 'km';
        filas.replaceChildren(
          el('div.serie-ed.cab', el('span', '#'), el('span', km ? 'Km' : it.tipo === 'seg' ? 'Segundos' : 'Repeticiones'), el('span', km ? 'Intensidad' : 'Kg'), el('span')),
          ...it.series.map((se, i) =>
            el(
              'div.serie-ed',
              el('span.n', i + 1),
              km
                ? el('input', { type: 'number', inputmode: 'decimal', min: 0, step: 0.1, value: se.km ?? '', 'aria-label': `Serie ${i + 1}: kilómetros`, oninput: (e) => (se.km = Datos.num(e.target.value)) })
                : el('input', { type: 'number', inputmode: 'numeric', min: 0, value: se.reps ?? '', 'aria-label': `Serie ${i + 1}: ${it.tipo === 'seg' ? 'segundos' : 'repeticiones'}`, oninput: (e) => (se.reps = Datos.num(e.target.value)) }),
              km
                ? el('select', { 'aria-label': `Serie ${i + 1}: zona de intensidad`, onchange: (e) => (se.zona = e.target.value) }, Datos.ZONAS.map((z) => el('option', { value: z, selected: se.zona === z }, Datos.NOMBRES_ZONA[z])))
                : el('input', { type: 'number', inputmode: 'decimal', min: 0, step: 0.5, value: se.kg ?? '', placeholder: '—', 'aria-label': `Serie ${i + 1}: kilos`, oninput: (e) => (se.kg = Datos.num(e.target.value)) }),
              el('button.btn.btn-icono.btn-peq', { type: 'button', 'aria-label': 'Quitar serie ' + (i + 1), disabled: it.series.length < 2, onclick: () => (it.series.splice(i, 1), pintarSeries()) }, '✕')
            )
          ),
          el('button.btn.btn-peq', { type: 'button', onclick: () => (it.series.push(nuevaSerie(it.tipo, it.series[it.series.length - 1])), pintarSeries()) }, km ? '+ Tramo' : '+ Serie')
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
          el('div.item-ed-titulo', el('b', idx + 1 + '. ' + def.nombre), el('button.enlace', { type: 'button', onclick: () => verEjercicio(def) }, 'Ver cómo se hace')),
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
              {
                onchange: (e) => {
                  const antes = it.tipo;
                  it.tipo = e.target.value;
                  if ((antes === 'km') !== (it.tipo === 'km')) it.series = it.series.map(() => nuevaSerie(it.tipo));
                  pintarSeries();
                },
              },
              el('option', { value: 'reps', selected: it.tipo === 'reps' || !it.tipo }, 'Repeticiones'),
              el('option', { value: 'seg', selected: it.tipo === 'seg' }, 'Segundos'),
              el('option', { value: 'km', selected: it.tipo === 'km' }, 'Kilómetros')
            )
          ),
          el('label.campo', el('span', 'Descanso'), el('input', { value: it.descanso || '', placeholder: 'p. ej. 90 s', oninput: (e) => (it.descanso = e.target.value) })),
          el('label.campo.ancho', el('span', 'Indicaciones'), el('input', { value: it.nota || '', placeholder: it.tipo === 'km' ? 'p. ej. ritmo 5:30/km, terreno llano' : 'p. ej. bajar en 3 segundos', oninput: (e) => (it.nota = e.target.value) }))
        ),
        filas
      );
    };

    const asignarEjercicio = (it, id) => {
      it.ej = id;
      const p = propios().find((x) => x.id === id);
      if (p) it.def = JSON.parse(JSON.stringify(p));
      else delete it.def;
      const def = defItem(it);
      const tipo = def.tipo === 'km' || def.grupo === 'Carrera' ? 'km' : id === 'plancha' ? 'seg' : 'reps';
      if (tipo !== it.tipo) {
        it.tipo = tipo;
        it.series = tipo === 'km' ? [nuevaSerie('km')] : [nuevaSerie(tipo), nuevaSerie(tipo), nuevaSerie(tipo)];
      }
    };

    const anadir = async () => {
      const id = await elegirEjercicio();
      if (!id) return;
      const it = { uid: uid(), ej: id, tipo: '', series: [] };
      asignarEjercicio(it, id);
      s.items.push(it);
      pintarItems();
      lista.lastElementChild && lista.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const guardar = async (btn) => {
      if (esPlantilla && !(s.titulo || '').trim()) return aviso('Ponle un título a la sesión.', 'error');
      if (!esPlantilla && !s.fecha) return aviso('Pon la fecha.', 'error');
      if (!s.items.length) return aviso('Añade al menos un ejercicio.', 'error');
      btn.disabled = true;
      btn.textContent = 'Guardando…';
      const items = s.items.map((it) => ({ ...it, series: it.series.map((x) => (it.tipo === 'km' ? { km: x.km, zona: x.zona || 'Z2' } : { reps: x.reps, kg: x.kg })) }));
      const limpia = { titulo: (s.titulo || '').trim(), notas: (s.notas || '').trim(), items };
      try {
        if (esPlantilla) {
          const id = s.id || uid();
          let actualizadas = 0;
          await Datos.modificarAtleta(a, (dd) => {
            dd.plantillas = dd.plantillas || [];
            const i = dd.plantillas.findIndex((x) => x.id === id);
            const p = { id, ...limpia };
            if (i < 0) dd.plantillas.push(p);
            else dd.plantillas[i] = p;
            // Los días ya programados con esta sesión y aún sin registrar se actualizan
            dd.sesiones.forEach((x) => {
              if (x.plantilla === id && !tieneRegistro(dd, x.id)) {
                Object.assign(x, JSON.parse(JSON.stringify(limpia)));
                actualizadas++;
              }
            });
          });
          aviso(actualizadas ? `Sesión guardada. Actualizados ${actualizadas} día(s) programados sin registrar.` : 'Sesión guardada', 'ok', 4500);
        } else {
          await Datos.modificarAtleta(a, (dd) => {
            const x = dd.sesiones.find((y) => y.id === s.id);
            if (x) Object.assign(x, limpia, { fecha: s.fecha });
          });
          aviso('Cambios guardados para este día');
        }
        ir(volver);
      } catch (e) {
        aviso(errorTexto(e), 'error', 6000);
        btn.disabled = false;
        btn.textContent = 'Guardar';
      }
    };

    app.replaceChildren(
      el('a.volver', { href: volver }, '← Volver'),
      el('h1.titulo-blanco', esPlantilla ? (s.id ? 'Editar sesión' : 'Diseñar sesión') : 'Editar sesión de este día'),
      el('p.ayuda-blanca', esPlantilla ? 'Para ' + a.nombre + '. Después podrás colocarla en el calendario las veces que quieras.' : `Solo cambia la sesión del ${fechaCorta(s.fecha)}. El diseño original no se modifica.`),
      el(
        'div.tarjeta',
        el(
          'div.rejilla',
          !esPlantilla && el('label.campo', el('span', 'Fecha'), el('input', { type: 'date', value: s.fecha, required: true, onchange: (e) => (s.fecha = e.target.value) })),
          el('label.campo' + (esPlantilla ? '.ancho' : ''), el('span', 'Título'), el('input', { value: s.titulo, required: esPlantilla, placeholder: 'p. ej. Fuerza tren inferior', oninput: (e) => (s.titulo = e.target.value) })),
          el('label.campo.ancho', el('span', 'Indicaciones generales'), el('textarea', { rows: 2, placeholder: 'Calentamiento, objetivo de la sesión…', oninput: (e) => (s.notas = e.target.value) }, s.notas || ''))
        )
      ),
      lista,
      el('div.fila-botones', el('button.btn.btn-grande.btn-anadir', { type: 'button', onclick: anadir }, '+ Añadir ejercicio')),
      el('div.barra-guardar', el('a.btn', { href: volver }, 'Cancelar'), el('button.btn.btn-primario', { type: 'button', onclick: (e) => guardar(e.currentTarget) }, 'Guardar'))
    );
    pintarItems();
  }

  /* ================= EVOLUCIÓN (entrenador y atleta) ================= */
  const GRUPOS = ['Piernas', 'Cadera', 'Empuje', 'Tracción', 'Core', 'Potencia', 'Otros'];
  const NOMBRE_GRUPO = { Piernas: 'Piernas', Cadera: 'Glúteos y cadera', Empuje: 'Empuje (pecho, hombro, tríceps)', Tracción: 'Tracción (espalda, bíceps)', Core: 'Core', Potencia: 'Potencia y pliometría', Otros: 'Otros' };
  const grupoDe = (it) => {
    const g = defItem(it).grupo;
    return GRUPOS.includes(g) ? g : 'Otros';
  };

  function pintarEvolucion(contenido, datos, { guardar }) {
    const semanas = S.evoSemanas || 12;
    const metrica = S.evoMetrica || 'kg';
    const ev = Datos.evolucion(datos, semanas, grupoDe);
    const desde = ev.semanas[0];
    const etiquetas = ev.semanas.map((w) => Graficas.corta(w));
    const detalle = ev.semanas.map((w) => `Semana del ${Graficas.larga(w)}`);
    const medidas = (datos.medidas || []).slice().sort((x, y) => x.fecha.localeCompare(y.fecha));
    const enRango = medidas.filter((m) => m.fecha >= desde);

    const rango = el(
      'div.chips.chips-oscuros',
      { role: 'group', 'aria-label': 'Periodo' },
      [8, 12, 26, 52].map((n) => el('button.chip-filtro', { type: 'button', 'aria-pressed': String(n === semanas), onclick: () => ((S.evoSemanas = n), pintarEvolucion(contenido, datos, { guardar })) }, n === 52 ? '1 año' : `${n} semanas`))
    );

    const nuevaMedida = async (m) => {
      const r = await dialogoMedida(m);
      if (!r) return;
      try {
        const nuevos = await guardar(r.id, r.medida);
        if (nuevos) Object.assign(datos, nuevos);
        aviso(r.medida ? 'Medición guardada' : 'Medición eliminada');
        pintarEvolucion(contenido, datos, { guardar });
      } catch (e) {
        aviso(errorTexto(e), 'error');
      }
    };

    const vacio = (t) => el('p.vacio-grafica', t);
    const tarjetaGrafica = (titulo, sub, cuerpo, extra) => el('section.tarjeta.tarjeta-grafica', el('div.fila-sep', el('div', el('h2', titulo), sub && el('p.meta', sub)), extra || ''), cuerpo);

    // 1. Peso
    const pesos = enRango.filter((m) => Datos.num(m.peso) != null).map((m) => ({ x: m.fecha, y: Datos.num(m.peso) }));
    const gPeso = el('div');
    const difPeso = pesos.length > 1 ? Math.round((pesos[pesos.length - 1].y - pesos[0].y) * 10) / 10 : null;
    // 2. Volumen por grupo
    const seriesGrupo = GRUPOS.map((g, i) => ({ nombre: NOMBRE_GRUPO[g], color: Graficas.CATEGORICA[i], valores: ev.grupos[g] ? ev.grupos[g][metrica] : [] })).filter((x) => x.valores.some((v) => v > 0));
    const gVol = el('div');
    // 3. Km
    const seriesKm = Datos.ZONAS.map((z, i) => ({ nombre: Datos.NOMBRES_ZONA[z], color: Graficas.ORDINAL_AZUL[i], valores: ev.km[z].map((v) => Math.round(v * 10) / 10) })).filter((x) => x.valores.some((v) => v > 0));
    const gKm = el('div');
    const totalKm = Math.round(seriesKm.reduce((s, x) => s + x.valores.reduce((a, b) => a + b, 0), 0) * 10) / 10;
    // 4. Pliegues
    const pliegues = enRango.map((m) => ({ x: m.fecha, y: Datos.sumaPliegues(m) })).filter((p) => p.y != null);
    const gPl = el('div');
    const difPl = pliegues.length > 1 ? Math.round((pliegues[pliegues.length - 1].y - pliegues[0].y) * 10) / 10 : null;
    const signo = (v) => (v > 0 ? '+' : '') + Graficas.fmt(v, 1);

    contenido.replaceChildren(
      el('div.cabecera', rango, el('button.btn.btn-primario', { type: 'button', onclick: () => nuevaMedida(null) }, '+ Añadir medición')),
      tarjetaGrafica(
        'Peso corporal',
        pesos.length ? `Último: ${Graficas.fmt(pesos[pesos.length - 1].y, 1)} kg` + (difPeso != null ? ` (${signo(difPeso)} kg en el periodo)` : '') : null,
        pesos.length ? [gPeso, Graficas.tabla(['Fecha', 'Peso (kg)'], pesos.map((p) => [Graficas.larga(p.x), Graficas.fmt(p.y, 1)]))] : vacio('Sin mediciones de peso en este periodo. Pulsa «+ Añadir medición».')
      ),
      tarjetaGrafica(
        'Volumen por grupo muscular',
        metrica === 'kg' ? 'Kilos totales levantados por semana (repeticiones × kilos registrados)' : 'Series hechas por semana',
        seriesGrupo.length
          ? [Graficas.leyenda(seriesGrupo), gVol, Graficas.tabla(['Semana', ...seriesGrupo.map((x) => x.nombre)], ev.semanas.map((w, i) => [Graficas.corta(w), ...seriesGrupo.map((x) => Graficas.fmt(x.valores[i] || 0))]))]
          : vacio('Aún no hay series registradas en este periodo.'),
        el(
          'div.segmentado.segmentado-peq',
          { role: 'radiogroup', 'aria-label': 'Medida del volumen' },
          [
            ['kg', 'Kilos'],
            ['series', 'Series'],
          ].map(([v, t]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(metrica === v), onclick: () => ((S.evoMetrica = v), pintarEvolucion(contenido, datos, { guardar })) }, t))
        )
      ),
      tarjetaGrafica(
        'Kilómetros e intensidad',
        `Km registrados por semana, por zona de intensidad${totalKm ? ` · total ${Graficas.fmt(totalKm, 1)} km` : ''}`,
        seriesKm.length
          ? [
              Graficas.leyenda(seriesKm),
              gKm,
              Graficas.tabla(['Semana', ...seriesKm.map((x) => x.nombre.split(' ·')[0]), 'Pautados'], ev.semanas.map((w, i) => [Graficas.corta(w), ...seriesKm.map((x) => Graficas.fmt(x.valores[i] || 0, 1)), Graficas.fmt(ev.kmPautados[i], 1)])),
            ]
          : vacio('Aún no hay kilómetros registrados en este periodo. Añade el ejercicio «Carrera» a las sesiones.')
      ),
      tarjetaGrafica(
        'Suma de pliegues',
        pliegues.length ? `Última: ${Graficas.fmt(pliegues[pliegues.length - 1].y, 1)} mm` + (difPl != null ? ` (${signo(difPl)} mm en el periodo)` : '') + ' · 6 pliegues' : 'Suma de 6 pliegues cutáneos (mm)',
        pliegues.length ? [gPl, Graficas.tabla(['Fecha', 'Suma (mm)'], pliegues.map((p) => [Graficas.larga(p.x), Graficas.fmt(p.y, 1)]))] : vacio('Sin mediciones de pliegues en este periodo.')
      ),
      el(
        'section.tarjeta',
        el('h2', 'Mediciones'),
        medidas.length
          ? el(
              'table.tabla',
              el('thead', el('tr', el('th', 'Fecha'), el('th', 'Peso'), el('th', 'Σ pliegues'), el('th', ''))),
              el(
                'tbody',
                medidas
                  .slice()
                  .reverse()
                  .map((m) =>
                    el(
                      'tr',
                      el('td', fechaCorta(m.fecha)),
                      el('td', m.peso != null ? Graficas.fmt(m.peso, 1) + ' kg' : '—'),
                      el('td', Datos.sumaPliegues(m) != null ? Graficas.fmt(Datos.sumaPliegues(m), 1) + ' mm' : '—'),
                      el('td', el('button.btn.btn-peq', { type: 'button', onclick: () => nuevaMedida(m) }, 'Editar'))
                    )
                  )
              )
            )
          : el('p.meta', 'Todavía no hay mediciones.')
      )
    );
    if (pesos.length) Graficas.lineas(gPeso, { puntos: pesos, unidad: 'kg', decimales: 1, color: Graficas.CATEGORICA[0] });
    if (seriesGrupo.length) Graficas.barras(gVol, { categorias: etiquetas, detalle, series: seriesGrupo, unidad: metrica === 'kg' ? 'kg' : 'series' });
    if (seriesKm.length) Graficas.barras(gKm, { categorias: etiquetas, detalle, series: seriesKm, unidad: 'km', decimales: 1 });
    if (pliegues.length) Graficas.lineas(gPl, { puntos: pliegues, unidad: 'mm', decimales: 1, color: Graficas.CATEGORICA[1] });
  }

  /** Diálogo para añadir o editar una medición. Devuelve { id, medida } (medida null = borrar) o null. */
  async function dialogoMedida(m) {
    const x = m ? JSON.parse(JSON.stringify(m)) : { fecha: Datos.hoy(), peso: null, pliegues: {} };
    x.pliegues = x.pliegues || {};
    const fecha = el('input', { type: 'date', value: x.fecha });
    const peso = el('input', { type: 'number', inputmode: 'decimal', step: 0.1, min: 0, value: x.peso ?? '' });
    const total = el('output.total-pliegues');
    const entradas = Datos.PLIEGUES.map(([k, t]) => {
      const i = el('input', { type: 'number', inputmode: 'decimal', step: 0.5, min: 0, value: x.pliegues[k] ?? '', oninput: () => calc() });
      i.dataset.k = k;
      return el('label.campo', el('span', t + ' (mm)'), i);
    });
    const sumaDirecta = el('input', { type: 'number', inputmode: 'decimal', step: 0.5, min: 0, value: x.suma ?? '', placeholder: 'Solo si no tienes el desglose', oninput: () => calc() });
    const calc = () => {
      const v = entradas.map((e) => Datos.num(e.querySelector('input').value)).filter((n) => n != null);
      const s = Datos.num(sumaDirecta.value) ?? (v.length ? v.reduce((a, b) => a + b, 0) : null);
      total.textContent = s == null ? '—' : Graficas.fmt(s, 1) + ' mm';
    };
    calc();
    const r = await dialogo({
      titulo: m ? 'Editar medición' : 'Nueva medición',
      cuerpo: [
        el('div.rejilla', el('label.campo', el('span', 'Fecha'), fecha), el('label.campo', el('span', 'Peso (kg)'), peso)),
        el('h3', 'Pliegues cutáneos'),
        el('div.rejilla.rejilla-pliegues', entradas),
        el('label.campo', el('span', 'O suma total directamente (mm)'), sumaDirecta),
        el('p', el('b', 'Suma: '), total),
      ],
      botones: [...(m ? [{ texto: 'Eliminar', valor: 'borrar', peligro: true }] : []), { texto: 'Cancelar', valor: null }, { texto: 'Guardar', valor: 'guardar', primario: true }],
    });
    if (!r) return null;
    const id = (m && m.id) || uid();
    if (r === 'borrar') return (await confirmar('Eliminar medición', '¿Eliminar la medición del ' + fechaCorta(m.fecha) + '?', 'Eliminar', true)) ? { id, medida: null } : null;
    const pl = {};
    entradas.forEach((e) => {
      const inp = e.querySelector('input');
      const v = Datos.num(inp.value);
      if (v != null) pl[inp.dataset.k] = v;
    });
    const medida = { fecha: fecha.value || Datos.hoy(), peso: Datos.num(peso.value), pliegues: Object.keys(pl).length ? pl : null, suma: Datos.num(sumaDirecta.value) };
    if (medida.peso == null && !medida.pliegues && medida.suma == null) {
      aviso('Escribe el peso o algún pliegue.', 'error');
      return null;
    }
    return { id, medida };
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
      pestanasEntrenador('ejercicios'),
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
      pestanasEntrenador('ajustes'),
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
  const pestanasAtleta = (activa) =>
    pestanas(
      [
        ['#/', 'Calendario', 'calendario'],
        ['#/microciclo', 'Microciclo', 'microciclo'],
        ['#/evolucion', 'Evolución', 'evolucion'],
      ],
      activa
    );

  async function refrescarAtleta() {
    await Datos.releer(S.sesion).catch(() => (S.sesion.sinConexion = true));
    await Datos.aplicarPendientes(S.sesion);
    return S.sesion.datos;
  }

  /* --- Calendario: vista mensual (pantalla de inicio del atleta) --- */
  async function vistaCalendarioAtleta(mesArg) {
    cargando();
    const d = await refrescarAtleta();
    const h = Datos.hoy();
    const mes = mesValido(mesArg);
    const deHoy = (d.sesiones || []).filter((s) => s.fecha === h);
    const sinTerminar = (d.sesiones || []).filter((s) => s.fecha < h && s.fecha >= Datos.sumarDias(h, -7) && !Datos.cumplimientoSesion(s, d.registros[s.id]).hechas);
    const c = Datos.cumplimientoPeriodo(d);
    const boton = (s) => {
      const cs = Datos.cumplimientoSesion(s, d.registros[s.id]);
      return el('a.acceso-sesion', { href: '#/s/' + s.id, onclick: () => (S.volverAtleta = location.hash || '#/') }, el('b', s.titulo || 'Sesión'), chipEstado(cs));
    };
    app.replaceChildren(
      pestanasAtleta('calendario'),
      avisoModo() || '',
      el(
        'div.cabecera',
        el('h1', 'Hola, ' + d.atleta.nombre.split(' ')[0]),
        el('span.ayuda-blanca', c.pct == null ? '' : `Cumplimiento últimas 4 semanas: ${c.pct}%`)
      ),
      deHoy.length || sinTerminar.length
        ? el(
            'div.tarjeta.hoy-rapido',
            deHoy.length > 0 && el('div', el('b', 'Hoy'), el('div.fila-botones', deHoy.map(boton))),
            sinTerminar.length > 0 && el('div', el('b', 'Sin registrar esta semana'), el('div.fila-botones', sinTerminar.map(boton)))
          )
        : '',
      ...calendarioMes(d, mes, {
        titulo: 'Tu preparación',
        hrefMes: (m) => '#/calendario/' + m,
        hrefSesion: (s) => '#/s/' + s.id,
        alPulsarSesion: () => (S.volverAtleta = location.hash || '#/'),
        alPulsarDia: (fecha) => ir('#/microciclo/' + fecha),
        etiquetaDia: (fecha, n) => `${fechaBonita(fecha)}: ${n ? n + ' sesiones' : 'descanso'}. Ver su semana`,
      }),
      el('p.ayuda-blanca', 'Pulsa una sesión para ver los ejercicios y registrar lo que has hecho. Pulsa el número de un día para ver esa semana.'),
      el('p', el('a.enlace-blanco', { href: '#/cuenta' }, 'Mi cuenta'))
    );
  }

  /* --- Microciclo: la semana en horizontal, un día por tarjeta --- */
  async function vistaMicrociclo(arg) {
    cargando();
    const d = await refrescarAtleta();
    const h = Datos.hoy();
    const lun = Datos.lunes(/^\d{4}-\d{2}-\d{2}$/.test(arg || '') ? arg : h);
    const dom = Datos.sumarDias(lun, 6);
    const ses = (d.sesiones || []).filter((s) => s.fecha >= lun && s.fecha <= dom);
    const hechas = ses.filter((s) => d.registros[s.id] && d.registros[s.id].completada).length;
    const kmPaut = ses.reduce((t, s) => t + s.items.filter((it) => it.tipo === 'km').reduce((u, it) => u + it.series.reduce((v, x) => v + (Datos.num(x.km) || 0), 0), 0), 0);
    const [, m1, d1] = lun.split('-');
    const [, m2, d2] = dom.split('-');
    const titulo = m1 === m2 ? `${+d1}–${+d2} de ${MESES[+m1 - 1]}` : `${+d1} ${MESES[+m1 - 1].slice(0, 3)} – ${+d2} ${MESES[+m2 - 1].slice(0, 3)}`;
    const tarjetas = Array.from({ length: 7 }, (_, i) => {
      const f = Datos.sumarDias(lun, i);
      const delDia = ses.filter((s) => s.fecha === f);
      const nombre = DIAS[(i + 1) % 7];
      return el(
        'section.tarjeta-dia' + (f === h ? '.hoy' : '') + (delDia.length ? '' : '.libre'),
        { 'aria-label': `${nombre} ${fechaCorta(f)}`, id: f === h ? 'dia-hoy' : null },
        el('div.tarjeta-dia-cab', el('span.dia-nombre', nombre.replace(/^./, (c) => c.toUpperCase())), f === h && el('span.chip.chip-hoy', 'Hoy'), el('span.dia-fecha', +f.slice(8), el('small.dia-mes', ' ' + MESES[+f.slice(5, 7) - 1].slice(0, 3)))),
        delDia.length
          ? delDia.map((s) => {
              const cs = Datos.cumplimientoSesion(s, d.registros[s.id]);
              return el(
                'a.sesion-dia',
                { href: '#/s/' + s.id, onclick: () => (S.volverAtleta = location.hash) },
                el('b', s.titulo || 'Sesión'),
                chipEstado(cs),
                cs.pct != null && cs.estado !== 'pendiente' && cs.estado !== 'hoy' ? barra(cs.pct) : null,
                el('ul.mini-lista', s.items.map((it) => el('li', defItem(it).nombre, el('small', textoObjetivo(it)))))
              );
            })
          : el('p.descanso', 'Descanso')
      );
    });
    const fila = el('div.microciclo', tarjetas);
    app.replaceChildren(
      pestanasAtleta('microciclo'),
      avisoModo() || '',
      el(
        'div.cal-nav',
        el('a.btn.btn-peq.btn-claro', { href: '#/microciclo/' + Datos.sumarDias(lun, -7), 'aria-label': 'Semana anterior' }, '‹'),
        el('h2.cal-titulo', titulo),
        el('a.btn.btn-peq.btn-claro', { href: '#/microciclo/' + Datos.sumarDias(lun, 7), 'aria-label': 'Semana siguiente' }, '›'),
        lun !== Datos.lunes(h) && el('a.btn.btn-peq.btn-claro', { href: '#/microciclo' }, 'Esta semana')
      ),
      el('p.ayuda-blanca', ses.length ? `${ses.length} sesiones · ${hechas} terminadas${kmPaut ? ` · ${Graficas.fmt(kmPaut, 1)} km previstos` : ''}` : 'Sin sesiones esta semana.'),
      fila
    );
    // En el móvil, la fila arranca en el día de hoy
    const hoyEl = $('#dia-hoy', fila);
    if (hoyEl) requestAnimationFrame(() => (fila.scrollLeft = Math.max(0, hoyEl.offsetLeft - fila.offsetLeft - 8)));
  }

  async function vistaEvolucionAtleta() {
    cargando();
    const d = await refrescarAtleta();
    const contenido = el('div');
    app.replaceChildren(pestanasAtleta('evolucion'), avisoModo() || '', el('h1.titulo-blanco', 'Mi evolución'), contenido);
    pintarEvolucion(contenido, d, {
      guardar: async (mid, medida) => {
        const nuevos = await Datos.guardarMedida(S.sesion.ruta, S.sesion.dek, mid, medida);
        S.sesion.datos = nuevos;
        await Datos.aplicarPendientes(S.sesion);
        return S.sesion.datos;
      },
    });
  }

  function vistaCuentaAtleta() {
    app.replaceChildren(
      pestanasAtleta(''),
      el('a.volver', { href: '#/' }, '← Calendario'),
      el('h1.titulo-blanco', 'Mi cuenta'),
      el('div.tarjeta', el('p', el('b', 'Usuario: '), S.sesion.datos.atleta.usuario), el('button.btn', { type: 'button', onclick: () => cambiarMiPassword() }, 'Cambiar contraseña'))
    );
  }

  function vistaSesionAtleta(sid) {
    const d = S.sesion.datos;
    const s = (d.sesiones || []).find((x) => x.id === sid);
    if (!s) return ir('#/');
    const volver = S.volverAtleta || '#/';
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

    const campo = (etq, attrs) => el('label.entrada', el('small', etq), el('input', attrs));

    const tarjetaItem = (it, idx) => {
      const def = defItem(it);
      const r = (reg.items[it.uid] = reg.items[it.uid] || { series: [], nota: '' });
      const km = it.tipo === 'km';
      const unidad = it.tipo === 'seg' ? 'seg' : 'reps';
      const filas = el('div.series-atleta');
      const pintarFilas = () => {
        filas.replaceChildren(
          ...it.series.map((obj, i) => {
            const real = (r.series[i] = r.series[i] || (km ? { km: null, zona: null, hecho: false } : { reps: null, kg: null, hecho: false }));
            const fila = el('div.serie-at');
            const actualizarFila = () => {
              const c = Datos.cumplimientoSerie(obj, real);
              const algo = km ? real.km != null : real.reps != null || real.kg != null;
              fila.classList.toggle('hecha', c >= 1);
              fila.classList.toggle('parcial', c < 1 && algo);
            };
            const entradas = km
              ? [
                  campo('Km', {
                    type: 'number',
                    inputmode: 'decimal',
                    min: 0,
                    step: 0.1,
                    value: real.km ?? '',
                    placeholder: obj.km ?? '',
                    'aria-label': `Tramo ${i + 1}, kilómetros hechos (objetivo ${obj.km || 'libre'})`,
                    oninput: (e) => {
                      real.km = Datos.num(e.target.value);
                      real.hecho = real.km != null;
                      if (real.hecho && !real.zona) {
                        real.zona = obj.zona || 'Z2';
                        $('select', fila).value = real.zona;
                      }
                      actualizarFila();
                      guardar();
                    },
                  }),
                  el(
                    'label.entrada',
                    el('small', 'Zona'),
                    el(
                      'select',
                      { 'aria-label': `Tramo ${i + 1}, zona de intensidad`, onchange: (e) => ((real.zona = e.target.value || null), guardar()) },
                      el('option', { value: '' }, '—'),
                      Datos.ZONAS.map((z) => el('option', { value: z, selected: real.zona === z }, z))
                    )
                  ),
                ]
              : [
                  campo(unidad === 'seg' ? 'Segundos' : 'Reps', {
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
                  }),
                  campo('Kg', {
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
                  }),
                ];
            fila.append(
              el('span.n', { 'aria-hidden': 'true' }, i + 1),
              el('span.obj', el('small', 'Objetivo'), textoSerie(it, obj)),
              ...entradas,
              el(
                'button.btn-check',
                {
                  type: 'button',
                  'aria-label': `${km ? 'Tramo' : 'Serie'} ${i + 1} hecha tal cual`,
                  title: 'Hecha tal cual',
                  onclick: () => {
                    const yaHecha = Datos.cumplimientoSerie(obj, real) >= 1;
                    if (km) Object.assign(real, yaHecha ? { km: null, zona: null, hecho: false } : { km: obj.km, zona: obj.zona, hecho: true });
                    else Object.assign(real, yaHecha ? { reps: null, kg: null, hecho: false } : { reps: obj.reps, kg: obj.kg, hecho: true });
                    pintarFilas();
                    guardar();
                  },
                },
                '✓'
              )
            );
            actualizarFila();
            return fila;
          })
        );
      };
      pintarFilas();
      return el(
        'section.tarjeta.ej-atleta',
        { 'aria-labelledby': 'ej-' + it.uid },
        el('div.ej-cab', el('span.ej-num', idx + 1), el('div', el('h2', { id: 'ej-' + it.uid }, def.nombre), el('span.objetivo', textoObjetivo(it)), it.descanso && el('span.meta', 'Descanso: ' + it.descanso))),
        Figuras.ilustracion(def),
        it.nota && el('div.nota.nota-info', el('b', 'Indicación: '), it.nota),
        el('details.como', el('summary', 'Cómo se hace'), fichaEjercicio(def)),
        filas,
        el('label.campo', el('span', 'Comentario (opcional)'), el('input', { value: r.nota || '', placeholder: km ? 'Ritmo medio, sensaciones…' : 'Molestias, sensaciones…', oninput: (e) => ((r.nota = e.target.value), guardar()) }))
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

    const terminar = el(
      'button.btn.btn-primario.btn-grande',
      {
        type: 'button',
        onclick: async () => {
          const cs = Datos.cumplimientoSesion(s, reg);
          if (cs.hechas < cs.series && !(await confirmar('Terminar sesión', `Has registrado ${cs.hechas} de ${cs.series} series. ¿Terminar de todas formas?`, 'Terminar'))) return;
          reg.completada = reg.completada || new Date().toISOString();
          const ok = await guardar(true);
          aviso(ok ? '¡Sesión terminada! Tu entrenador ya puede verla.' : 'Sesión terminada. Se enviará cuando tengas conexión.', ok ? 'ok' : 'alerta', 4500);
          ir(volver);
        },
      },
      reg.completada ? 'Guardar cambios' : 'Terminar sesión'
    );

    app.replaceChildren(
      el('a.volver', { href: volver }, '← Volver'),
      el('div.cabecera', el('div', el('h1', s.titulo || 'Sesión'), el('span.ayuda-blanca', fechaBonita(s.fecha)))),
      s.notas && el('div.tarjeta.indicaciones', el('b', 'Indicaciones del entrenador'), el('p', s.notas)),
      el('div.tarjeta.resumen.pegajoso', resumen, estadoGuardado),
      el('p.ayuda-blanca', 'Escribe lo que has hecho en cada serie. Si la has hecho tal cual estaba, pulsa ✓.'),
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
