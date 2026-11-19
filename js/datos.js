/*
 * Datos de la app: ficheros cifrados en el repositorio (o en este dispositivo en modo prueba).
 *
 *   data/entrenador.json        Entrenador: lista de atletas (con la clave de cada uno), ejercicios propios, conexión a GitHub.
 *   data/atletas/<id>.json      Un fichero por atleta: su planificación (sesiones) y lo que ha registrado.
 *
 * Cada fichero: { formato, version, llaves: { idUsuario: clave envuelta con su contraseña }, datos: {iv, ct} }.
 * El entrenador guarda la clave de cada atleta dentro de sus propios datos cifrados, así puede leer y
 * escribir la planificación de todos sin conocer sus contraseñas.
 */
(function (global) {
  'use strict';

  const RUTA_ENTRENADOR = 'data/entrenador.json';
  const PREF = 'entreno:';

  const ls = {
    get(k) {
      try {
        return localStorage.getItem(PREF + k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(PREF + k, v);
        return true;
      } catch {
        return false;
      }
    },
    del(k) {
      try {
        localStorage.removeItem(PREF + k);
      } catch {}
    },
  };

  /* ---------- Dónde están los ficheros ---------- */
  let gh = null; // { owner, repo, branch, token } cuando hay conexión con GitHub

  const usarGitHub = (c) => (gh = c && GitHub.configurado(c) ? c : null);
  const conGitHub = () => !!gh;
  /** Modo prueba: los ficheros viven solo en este navegador. */
  const modoLocal = () => !gh && !!ls.get('fs:' + RUTA_ENTRENADOR);

  async function leerFichero(ruta) {
    if (gh) {
      try {
        const { datos } = await GitHub.leer(gh, ruta);
        if (datos) ls.set('cache:' + ruta, JSON.stringify(datos));
        return datos;
      } catch (e) {
        if (e.estado === 0) {
          const c = ls.get('cache:' + ruta);
          if (c) return Object.assign(JSON.parse(c), { _sinConexion: true });
        }
        throw e;
      }
    }
    const local = ls.get('fs:' + ruta);
    if (local) return JSON.parse(local);
    try {
      const r = await fetch(ruta + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const datos = await r.json();
      ls.set('cache:' + ruta, JSON.stringify(datos));
      return datos;
    } catch (e) {
      const c = ls.get('cache:' + ruta);
      if (c) return Object.assign(JSON.parse(c), { _sinConexion: true });
      throw e;
    }
  }

  /** Lee, aplica `cambiar(fichero)` (que devuelve el fichero nuevo, o false) y guarda. Reintenta si hay conflicto. */
  async function actualizarFichero(ruta, cambiar, mensaje) {
    if (gh) {
      const r = await GitHub.actualizar(gh, ruta, cambiar, mensaje);
      if (r.datos) ls.set('cache:' + ruta, JSON.stringify(r.datos));
      return r.datos;
    }
    const actual = await leerFichero(ruta).catch(() => null);
    const nuevo = await cambiar(actual);
    if (nuevo === false) return actual;
    if (!ls.set('fs:' + ruta, JSON.stringify(nuevo))) throw new Error('No queda espacio en este dispositivo.');
    return nuevo;
  }

  async function borrarFichero(ruta) {
    if (gh) {
      // La API de contenidos necesita el sha para borrar; se deja el fichero vacío de llaves (nadie puede abrirlo).
      await GitHub.actualizar(gh, ruta, () => ({ formato: 'entreno-borrado', borrado: new Date().toISOString() }), 'Atleta eliminado');
      return;
    }
    ls.del('fs:' + ruta);
  }

  /* ---------- Ficheros cifrados ---------- */
  async function sellar(formato, dekRaw, llaves, datos) {
    return { formato, version: 1, actualizado: new Date().toISOString(), llaves, datos: await Cripto.sellarDatos(dekRaw, datos) };
  }
  const abrir = (dekRaw, fichero) => Cripto.abrirDatos(dekRaw, fichero.datos);

  /** Actualiza los datos descifrados de un fichero cifrado con `dekRaw`. `cambiar(datos)` los modifica en el sitio. */
  async function actualizarCifrado(ruta, dekRaw, cambiar, mensaje) {
    let resultado;
    await actualizarFichero(
      ruta,
      async (fichero) => {
        if (!fichero || !fichero.datos) throw new Error('El fichero ya no existe.');
        const datos = await abrir(dekRaw, fichero);
        const r = await cambiar(datos);
        if (r === false) return false;
        resultado = datos;
        datos.actualizado = new Date().toISOString();
        return { ...fichero, actualizado: datos.actualizado, datos: await Cripto.sellarDatos(dekRaw, datos) };
      },
      mensaje
    );
    return resultado;
  }

  const rutaAtleta = async (usuario) => 'data/atletas/' + (await Cripto.idUsuario(usuario)).slice(0, 24) + '.json';

  /* ---------- Acceso ---------- */
  async function existeEntrenador() {
    const f = await leerFichero(RUTA_ENTRENADOR).catch(() => null);
    return !!(f && f.formato === 'entreno-entrenador');
  }

  async function crearEntrenador({ nombre, usuario, password }) {
    if (await existeEntrenador()) throw new Error('Ya existe una cuenta de entrenador.');
    const dek = Cripto.aleatorio(32);
    const { id, llave } = await Cripto.llaveParaUsuario(dek, usuario, password);
    const datos = {
      entrenador: { nombre, usuario: Cripto.normalizarUsuario(usuario) },
      github: null,
      atletas: [],
      ejercicios: [],
    };
    const f = await sellar('entreno-entrenador', dek, { [id]: llave }, datos);
    ls.set('fs:' + RUTA_ENTRENADOR, JSON.stringify(f));
    return { rol: 'entrenador', ruta: RUTA_ENTRENADOR, dek, datos };
  }

  /** Entra como `rol` ('entrenador' | 'atleta'). Devuelve { rol, ruta, dek, datos }. */
  async function entrar(rol, usuario, password) {
    const ruta = rol === 'entrenador' ? RUTA_ENTRENADOR : await rutaAtleta(usuario);
    let fichero = await leerFichero(ruta).catch((e) => {
      throw new Error(e.message === 'Failed to fetch' ? 'Sin conexión.' : e.message);
    });
    if (!fichero || !fichero.llaves) throw new Error('CREDENCIALES');
    const dek = await Cripto.abrirLlave(fichero, usuario, password);
    let datos = await abrir(dek, fichero);
    // Con GitHub configurado, se vuelve a leer por la API (la web publicada tarda unos minutos en actualizarse)
    if (datos.github && GitHub.configurado(datos.github) && !gh) {
      usarGitHub(datos.github);
      try {
        const fresco = await leerFichero(ruta);
        if (fresco && fresco.datos) datos = await abrir(dek, fresco);
      } catch {}
    }
    return { rol, ruta, dek, datos };
  }

  async function releer(sesion) {
    const f = await leerFichero(sesion.ruta);
    if (!f || !f.datos) throw new Error('Tu cuenta ya no existe.');
    sesion.datos = await abrir(sesion.dek, f);
    sesion.sinConexion = !!f._sinConexion;
    return sesion.datos;
  }

  async function cambiarPassword(sesion, usuario, nueva) {
    const { id, llave } = await Cripto.llaveParaUsuario(sesion.dek, usuario, nueva);
    await actualizarFichero(sesion.ruta, (f) => ({ ...f, llaves: { [id]: llave } }), 'Cambio de contraseña');
  }

  /* ---------- Recordar sesión en el dispositivo ---------- */
  function recordar(sesion, usuario) {
    ls.set('recordar', JSON.stringify({ rol: sesion.rol, ruta: sesion.ruta, dek: Cripto.b64(sesion.dek), usuario }));
  }
  function olvidar() {
    ls.del('recordar');
  }
  async function recuperar() {
    const r = ls.get('recordar');
    if (!r) return null;
    try {
      const x = JSON.parse(r);
      const s = { rol: x.rol, ruta: x.ruta, dek: Cripto.unb64(x.dek), usuario: x.usuario };
      const f = await leerFichero(s.ruta);
      if (!f || !f.datos) throw new Error('fuera');
      s.datos = await abrir(s.dek, f);
      if (s.datos.github && GitHub.configurado(s.datos.github) && !gh) {
        usarGitHub(s.datos.github);
        await releer(s).catch(() => {});
      }
      return s;
    } catch (e) {
      if (e.estado === 0 || e.message === 'Failed to fetch') throw new Error('SIN_CONEXION');
      olvidar();
      return null;
    }
  }

  /* ---------- Entrenador ---------- */
  const guardarEntrenador = (sesion, cambiar, mensaje) =>
    actualizarCifrado(sesion.ruta, sesion.dek, cambiar, mensaje || 'Entrenador: cambios').then((d) => d && (sesion.datos = d));

  async function crearAtleta(sesion, { nombre, usuario, password }) {
    usuario = Cripto.normalizarUsuario(usuario);
    if (sesion.datos.atletas.some((a) => a.usuario === usuario) || usuario === sesion.datos.entrenador.usuario)
      throw new Error('Ya hay alguien con ese usuario.');
    const ruta = await rutaAtleta(usuario);
    const dek = Cripto.aleatorio(32);
    const { id, llave } = await Cripto.llaveParaUsuario(dek, usuario, password);
    const atleta = { id: U.uid(), nombre, usuario, ruta, dek: Cripto.b64(dek), alta: new Date().toISOString() };
    const datos = { atleta: { id: atleta.id, nombre, usuario }, entrenador: sesion.datos.entrenador.nombre, github: sesion.datos.github, sesiones: [], registros: {} };
    const fichero = await sellar('entreno-atleta', dek, { [id]: llave }, datos);
    await actualizarFichero(
      ruta,
      (actual) => {
        if (actual && actual.llaves) throw new Error('Ya existe un atleta con ese usuario.');
        return fichero;
      },
      'Nuevo atleta'
    );
    await guardarEntrenador(sesion, (d) => void d.atletas.push(atleta), 'Nuevo atleta');
    return atleta;
  }

  const dekAtleta = (a) => Cripto.unb64(a.dek);

  async function leerAtleta(a) {
    const f = await leerFichero(a.ruta);
    if (!f || !f.datos) return null;
    return abrir(dekAtleta(a), f);
  }

  const modificarAtleta = (a, cambiar, mensaje) => actualizarCifrado(a.ruta, dekAtleta(a), cambiar, mensaje || 'Planificación: ' + a.nombre);

  async function reiniciarPasswordAtleta(a, nueva) {
    const { id, llave } = await Cripto.llaveParaUsuario(dekAtleta(a), a.usuario, nueva);
    await actualizarFichero(a.ruta, (f) => ({ ...f, llaves: { [id]: llave } }), 'Contraseña de atleta');
  }

  async function eliminarAtleta(sesion, a) {
    await borrarFichero(a.ruta);
    await guardarEntrenador(sesion, (d) => void (d.atletas = d.atletas.filter((x) => x.id !== a.id)), 'Atleta eliminado');
  }

  /** Activa GitHub: sube todos los ficheros (si estaban solo en el dispositivo) y reparte la conexión a los atletas. */
  async function activarGitHub(sesion, conf, progreso) {
    await GitHub.comprobar(conf);
    const antes = gh;
    const locales = [RUTA_ENTRENADOR, ...sesion.datos.atletas.map((a) => a.ruta)].map((r) => [r, ls.get('fs:' + r)]);
    usarGitHub(conf);
    try {
      for (const [ruta, crudo] of locales) {
        if (!crudo) continue;
        progreso && progreso('Subiendo ' + ruta);
        await GitHub.actualizar(conf, ruta, () => JSON.parse(crudo), 'Datos iniciales');
      }
      await guardarEntrenador(sesion, (d) => void (d.github = conf), 'Conexión con GitHub');
      for (const a of sesion.datos.atletas) {
        progreso && progreso('Atleta: ' + a.nombre);
        await modificarAtleta(a, (d) => void (d.github = conf), 'Conexión con GitHub');
      }
      locales.forEach(([r]) => ls.del('fs:' + r));
    } catch (e) {
      usarGitHub(antes);
      throw e;
    }
  }

  /* ---------- Atleta: registros con cola sin conexión ---------- */
  const clavePendiente = (sesion) => 'pendiente:' + sesion.ruta;

  async function pendientes(sesion) {
    const c = ls.get(clavePendiente(sesion));
    if (!c) return {};
    try {
      return await Cripto.abrirDatos(sesion.dek, JSON.parse(c));
    } catch {
      return {};
    }
  }

  /** Guarda el registro de una sesión. Si no hay conexión, queda en cola y se envía después. */
  async function guardarRegistro(sesion, idSesion, registro) {
    sesion.datos.registros[idSesion] = registro;
    const cola = await pendientes(sesion);
    cola[idSesion] = registro;
    ls.set(clavePendiente(sesion), JSON.stringify(await Cripto.sellarDatos(sesion.dek, cola)));
    return enviarPendientes(sesion);
  }

  let enviando = null;
  function enviarPendientes(sesion) {
    if (enviando) return enviando.then(() => enviarPendientes(sesion));
    enviando = (async () => {
      const cola = await pendientes(sesion);
      const ids = Object.keys(cola);
      if (!ids.length) return true;
      try {
        await actualizarCifrado(
          sesion.ruta,
          sesion.dek,
          (d) => {
            d.registros = d.registros || {};
            ids.forEach((id) => (d.registros[id] = cola[id]));
          },
          'Registro de entrenamiento'
        );
        // Solo se quita de la cola lo que no ha cambiado mientras se enviaba
        const ahora = await pendientes(sesion);
        ids.forEach((id) => {
          if (JSON.stringify(ahora[id]) === JSON.stringify(cola[id])) delete ahora[id];
        });
        if (Object.keys(ahora).length) ls.set(clavePendiente(sesion), JSON.stringify(await Cripto.sellarDatos(sesion.dek, ahora)));
        else ls.del(clavePendiente(sesion));
        return true;
      } catch (e) {
        return false;
      }
    })().finally(() => (enviando = null));
    return enviando;
  }

  /** Lo que el atleta tiene en cola se superpone a lo leído del servidor. */
  async function aplicarPendientes(sesion) {
    const cola = await pendientes(sesion);
    Object.assign((sesion.datos.registros = sesion.datos.registros || {}), cola);
    return Object.keys(cola).length;
  }

  /* ---------- Cumplimiento ---------- */
  const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const num = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);

  /** Cumplimiento de una serie, de 0 a 1. Las repeticiones y el peso cuentan por igual si los dos están pautados. */
  function cumplimientoSerie(obj, real) {
    if (!real) return 0;
    const reps = num(real.reps);
    const kg = num(real.kg);
    if (reps == null && kg == null) return real.hecho ? 1 : 0;
    const oR = num(obj.reps);
    const oK = num(obj.kg);
    const fR = oR ? Math.min(1, (reps || 0) / oR) : 1;
    const fK = oK ? Math.min(1, (kg == null ? oK : kg) / oK) : 1;
    return fR * fK;
  }

  /** { pct (0-100 o null), series, hechas, estado } de una sesión planificada con su registro. */
  function cumplimientoSesion(s, reg) {
    let total = 0;
    let suma = 0;
    let hechas = 0;
    (s.items || []).forEach((it) => {
      const r = reg && reg.items && reg.items[it.uid];
      (it.series || []).forEach((obj, i) => {
        total++;
        const c = cumplimientoSerie(obj, r && r.series && r.series[i]);
        suma += c;
        if (c > 0) hechas++;
      });
    });
    const pct = total ? Math.round((suma / total) * 100) : null;
    let estado;
    if (reg && reg.completada) estado = 'completada';
    else if (hechas) estado = 'en-curso';
    else if (s.fecha < hoy()) estado = 'no-hecha';
    else if (s.fecha === hoy()) estado = 'hoy';
    else estado = 'pendiente';
    return { pct: reg || s.fecha < hoy() ? pct || 0 : null, series: total, hechas, estado };
  }

  /** Media de cumplimiento de las sesiones ya vencidas (o registradas) de los últimos `dias` días. */
  function cumplimientoPeriodo(datos, dias = 28) {
    const desde = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
    const h = hoy();
    const lista = (datos.sesiones || []).filter((s) => s.fecha >= desde && (s.fecha < h || (datos.registros || {})[s.id]));
    if (!lista.length) return { pct: null, sesiones: 0 };
    const pcts = lista.map((s) => cumplimientoSesion(s, (datos.registros || {})[s.id]).pct || 0);
    return { pct: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length), sesiones: lista.length };
  }

  global.Datos = {
    RUTA_ENTRENADOR,
    ls,
    usarGitHub,
    conGitHub,
    modoLocal,
    existeEntrenador,
    crearEntrenador,
    entrar,
    releer,
    cambiarPassword,
    recordar,
    olvidar,
    recuperar,
    guardarEntrenador,
    crearAtleta,
    leerAtleta,
    modificarAtleta,
    reiniciarPasswordAtleta,
    eliminarAtleta,
    activarGitHub,
    guardarRegistro,
    enviarPendientes,
    aplicarPendientes,
    pendientes,
    hoy,
    num,
    cumplimientoSerie,
    cumplimientoSesion,
    cumplimientoPeriodo,
  };
})(window);
