/*
 * Lectura y escritura de los ficheros de datos en el repositorio de GitHub (API de contenidos).
 * Así la planificación del entrenador y los registros de los atletas se comparten sin servidor propio.
 */
(function (global) {
  'use strict';

  const API = (() => {
    try {
      return localStorage.getItem('entreno:github-api') || 'https://api.github.com';
    } catch {
      return 'https://api.github.com';
    }
  })();

  function aBase64(texto) {
    const bytes = new TextEncoder().encode(texto);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function deBase64(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /** Deduce usuario y repositorio de la dirección de GitHub Pages (usuario.github.io/REPO/). */
  function deducir() {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    const repo = location.pathname.split('/').filter(Boolean)[0];
    return m && repo ? { owner: m[1], repo, branch: 'main' } : { owner: '', repo: '', branch: 'main' };
  }

  const configurado = (c) => !!(c && c.token && c.owner && c.repo);

  class ErrorGitHub extends Error {
    constructor(mensaje, estado) {
      super(mensaje);
      this.estado = estado;
    }
  }

  async function peticion(c, metodo, ruta, cuerpo) {
    let r;
    try {
      r = await fetch(`${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}${ruta}`, {
        method: metodo,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + c.token,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
    } catch (e) {
      throw new ErrorGitHub('Sin conexión con GitHub.', 0);
    }
    if (r.ok) return r.status === 204 ? null : r.json();
    let msg = '';
    try {
      msg = (await r.json()).message || '';
    } catch {}
    const textos = {
      401: 'La clave de GitHub no es válida o ha caducado.',
      403: 'La clave de GitHub no tiene permiso de escritura en el repositorio.',
      404: 'No se encuentra el repositorio o el archivo (revisa usuario, repositorio y permisos de la clave).',
      409: 'Conflicto: otro cambio se guardó al mismo tiempo.',
      422: 'Conflicto: otro cambio se guardó al mismo tiempo.',
    };
    throw new ErrorGitHub(textos[r.status] || `Error de GitHub (${r.status}) ${msg}`.trim(), r.status);
  }

  /** Lee un JSON del repositorio. Devuelve { datos, sha } (sha null si no existe). */
  async function leer(c, ruta) {
    try {
      const r = await peticion(c, 'GET', `/contents/${ruta}?ref=${encodeURIComponent(c.branch || 'main')}&t=${Date.now()}`);
      let texto;
      if (r.content && r.encoding === 'base64') texto = deBase64(r.content);
      else {
        // Archivos de más de 1 MB: la API no incluye el contenido, se descarga aparte
        const b = await peticion(c, 'GET', `/git/blobs/${r.sha}`);
        texto = deBase64(b.content);
      }
      return { datos: JSON.parse(texto), sha: r.sha };
    } catch (e) {
      if (e.estado === 404) return { datos: null, sha: null };
      throw e;
    }
  }

  async function escribir(c, ruta, datos, sha, mensaje) {
    const r = await peticion(c, 'PUT', `/contents/${ruta}`, {
      message: mensaje,
      content: aBase64(JSON.stringify(datos, null, 1)),
      branch: c.branch || 'main',
      ...(sha ? { sha } : {}),
    });
    return r && r.content ? r.content.sha : null;
  }

  /**
   * Lee el archivo, aplica el cambio y lo guarda. Si otro dispositivo guardó a la vez,
   * vuelve a leer y aplica el cambio sobre la versión nueva (hasta 6 intentos).
   * `cambiar(datos)` puede devolver false para no guardar nada.
   */
  async function actualizar(c, ruta, cambiar, mensaje) {
    let ultimo;
    for (let intento = 0; intento < 6; intento++) {
      const { datos, sha } = await leer(c, ruta);
      const resultado = await cambiar(datos);
      if (resultado === false) return { datos, sha, sinCambios: true };
      const nuevo = resultado && typeof resultado === 'object' && resultado !== true ? resultado : datos;
      try {
        const nsha = await escribir(c, ruta, nuevo, sha, mensaje);
        return { datos: nuevo, sha: nsha };
      } catch (e) {
        ultimo = e;
        if (e.estado !== 409 && e.estado !== 422) throw e;
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 900 * (intento + 1)));
      }
    }
    throw ultimo;
  }

  /** Comprueba que la clave puede escribir en el repositorio. */
  async function comprobar(c) {
    const r = await peticion(c, 'GET', '');
    if (r.permissions && r.permissions.push === false) throw new ErrorGitHub('La clave de GitHub solo tiene permiso de lectura.', 403);
    return r;
  }

  global.GitHub = { deducir, configurado, leer, escribir, actualizar, comprobar, API };
})(window);
