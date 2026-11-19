/*
 * Cifrado de los datos.
 *
 * - Cada fichero (el del entrenador y el de cada atleta) se cifra con una clave aleatoria (DEK).
 * - Esa clave se "envuelve" con una clave derivada de la contraseña del usuario
 *   (PBKDF2-SHA256). Sin un usuario y contraseña válidos no se puede leer nada.
 */
(function (global) {
  'use strict';
  const subtle = global.crypto.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const ITER_USUARIO = 310000;

  function b64(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function unb64(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function hex(buf) {
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const aleatorio = (n) => global.crypto.getRandomValues(new Uint8Array(n));

  async function sha256Hex(texto) {
    return hex(await subtle.digest('SHA-256', enc.encode(texto)));
  }

  async function derivar(password, sal, iter, usos) {
    const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: sal, iterations: iter, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      usos
    );
  }

  async function cifrar(clave, bytes) {
    const iv = aleatorio(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, clave, bytes);
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function descifrar(clave, caja) {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(caja.iv) }, clave, unb64(caja.ct));
    return new Uint8Array(pt);
  }

  const importarDek = (raw) =>
    subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

  const normalizarUsuario = (u) => String(u || '').trim().toLowerCase();

  /** Identificador opaco del usuario dentro del fichero (no revela el nombre de usuario). */
  const idUsuario = (usuario) => sha256Hex('entreno|' + normalizarUsuario(usuario));

  /** Envuelve la DEK para un usuario con su contraseña. */
  async function llaveParaUsuario(dekRaw, usuario, password) {
    const sal = aleatorio(16);
    const k = await derivar(password, sal, ITER_USUARIO, ['encrypt']);
    const caja = await cifrar(k, dekRaw);
    return { id: await idUsuario(usuario), llave: { sal: b64(sal), iter: ITER_USUARIO, ...caja } };
  }

  /** Recupera la DEK con usuario + contraseña. Lanza error si no son válidos. */
  async function abrirLlave(fichero, usuario, password) {
    const id = await idUsuario(usuario);
    const llave = fichero.llaves && fichero.llaves[id];
    if (!llave) throw new Error('CREDENCIALES');
    try {
      const k = await derivar(password, unb64(llave.sal), llave.iter || ITER_USUARIO, ['decrypt']);
      return await descifrar(k, llave);
    } catch (e) {
      throw new Error('CREDENCIALES');
    }
  }

  async function sellarDatos(dekRaw, datos) {
    const k = await importarDek(dekRaw);
    return cifrar(k, enc.encode(JSON.stringify(datos)));
  }
  async function abrirDatos(dekRaw, caja) {
    const k = await importarDek(dekRaw);
    return JSON.parse(dec.decode(await descifrar(k, caja)));
  }

  global.Cripto = {
    aleatorio,
    b64,
    unb64,
    sha256Hex,
    idUsuario,
    normalizarUsuario,
    llaveParaUsuario,
    abrirLlave,
    sellarDatos,
    abrirDatos,
  };
})(typeof window !== 'undefined' ? window : globalThis);
