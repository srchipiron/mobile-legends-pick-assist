/**
 * Encontrar la tablet en la wifi sin escribir nada (3.26.0).
 *
 * El puerto de la depuración inalámbrica cambia cada vez que se enciende, y
 * escribirlo en Termux en mitad del draft es lo que hacía inusable el botón.
 * Android lo anuncia por mDNS como `_adb-tls-connect._tcp` (es lo que hace
 * `adb mdns services`, pero el adb de Termux viene compilado SIN mDNS:
 * `ANDROID_TOOLS_ADB_ENABLE_MDNS` está apagado en nmeum/android-tools), así
 * que se pregunta aquí, con un paquete DNS de 40 bytes. Si nadie contesta
 * (hay redes que filtran multicast) y se sabe la IP de la tablet, se prueba
 * qué puertos tiene abiertos en el rango efímero de Android y luego
 * `adb connect` dice cuál es el bueno (eso vive en leer.mjs).
 *
 * SEGURIDAD: aquí solo hay sockets de red del móvil; ni adb, ni programas.
 */
import { createSocket } from 'node:dgram';
import { connect } from 'node:net';

export const SERVICIO = '_adb-tls-connect._tcp.local';
const MDNS_IP = '224.0.0.251', MDNS_PUERTO = 5353;
/** Lo que Android deja al kernel (`ip_local_port_range`): ahí caen los cuatro puertos vistos en la tablet de Javi (34205–45199). */
export const PUERTOS_EFIMEROS = [32768, 60999];

/** La pregunta mDNS por el servicio, pidiendo respuesta UNICAST (bit QU): así llega aunque el wifi filtre el multicast. */
export function preguntaMdns(servicio = SERVICIO) {
  const partes = servicio.split('.').map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p)]));
  const nombre = Buffer.concat([...partes, Buffer.from([0])]);
  const cabecera = Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  const cola = Buffer.from([0, 12, 0x80, 0x01]); // PTR, IN + unicast-response
  return Buffer.concat([cabecera, nombre, cola]);
}

/** Lee un nombre DNS con compresión. Devuelve [nombre, posición siguiente]. */
function leerNombre(b, pos) {
  const partes = [];
  let saltos = 0, siguiente = null;
  for (;;) {
    if (pos >= b.length) throw new Error('nombre cortado');
    const n = b[pos];
    if (n === 0) { pos += 1; break; }
    if ((n & 0xc0) === 0xc0) {
      if (siguiente === null) siguiente = pos + 2;
      pos = ((n & 0x3f) << 8) | b[pos + 1];
      if (++saltos > 20) throw new Error('nombre en bucle');
      continue;
    }
    partes.push(b.toString('utf8', pos + 1, pos + 1 + n));
    pos += 1 + n;
  }
  return [partes.join('.'), siguiente ?? pos];
}

/**
 * Las tablets que anuncia una respuesta mDNS: `[{ nombre, ip, puerto }]`.
 * Un registro SRV da el puerto y el nombre de la máquina; un A, su IP. Si la
 * respuesta no trae el A (lo trae siempre, pero por si acaso), vale la IP de
 * quien contesta.
 */
export function tabletsDeRespuesta(b, ipDeOrigen = null, servicio = SERVICIO) {
  if (!Buffer.isBuffer(b) || b.length < 12) return [];
  const qd = b.readUInt16BE(4), total = b.readUInt16BE(6) + b.readUInt16BE(8) + b.readUInt16BE(10);
  let pos = 12;
  const srv = [], a = new Map();
  try {
    for (let i = 0; i < qd; i++) { pos = leerNombre(b, pos)[1] + 4; }
    for (let i = 0; i < total; i++) {
      const [nombre, p] = leerNombre(b, pos);
      const tipo = b.readUInt16BE(p), largo = b.readUInt16BE(p + 8), datos = p + 10;
      if (tipo === 33 && nombre.toLowerCase().endsWith(servicio)) {
        srv.push({ nombre: nombre.slice(0, nombre.length - servicio.length - 1), puerto: b.readUInt16BE(datos + 4), maquina: leerNombre(b, datos + 6)[0] });
      } else if (tipo === 1 && largo === 4) {
        a.set(nombre.toLowerCase(), Array.from(b.subarray(datos, datos + 4)).join('.'));
      }
      pos = datos + largo;
    }
  } catch { /* una respuesta rota no es una tablet */ }
  return srv.map((s) => ({ nombre: s.nombre, ip: a.get(s.maquina.toLowerCase()) ?? ipDeOrigen, puerto: s.puerto })).filter((t) => t.ip && t.puerto);
}

/**
 * Pregunta a la wifi y devuelve las tablets con la depuración inalámbrica
 * encendida (sin repetir). Nunca lanza: sin red, o con el multicast
 * bloqueado, devuelve `[]` pasado el plazo.
 */
export function buscarPorMdns({ ms = 1500, servicio = SERVICIO } = {}) {
  return new Promise((resolver) => {
    const vistas = new Map();
    const sockets = [];
    const acabar = () => { for (const s of sockets) { try { s.close(); } catch { /* ya cerrado */ } } resolver([...vistas.values()]); };
    const reloj = setTimeout(acabar, ms);
    const recibir = (msg, rinfo) => { for (const t of tabletsDeRespuesta(msg, rinfo.address, servicio)) vistas.set(`${t.ip}:${t.puerto}`, t); };
    const pregunta = preguntaMdns(servicio);
    // Dos sockets: uno cualquiera para la respuesta unicast que pedimos, y
    // otro en el 5353 del grupo multicast por si la tablet contesta ahí.
    const abrir = (puerto, multicast) => {
      let s;
      try { s = createSocket({ type: 'udp4', reuseAddr: true }); } catch { return; }
      s.on('error', () => { /* sin wifi, o el puerto cogido: el otro socket sigue */ });
      s.on('message', recibir);
      s.bind(puerto, () => {
        try { if (multicast) s.addMembership(MDNS_IP); } catch { /* sin multicast */ }
        const enviar = () => { try { s.send(pregunta, MDNS_PUERTO, MDNS_IP); } catch { /* sin red */ } };
        enviar();
        setTimeout(enviar, Math.min(500, ms / 3)).unref?.();
      });
      sockets.push(s);
    };
    abrir(0, false);
    abrir(MDNS_PUERTO, true);
    if (!sockets.length) { clearTimeout(reloj); resolver([]); }
  });
}

/**
 * Qué puertos de `ip` aceptan una conexión, en el rango dado. Para una
 * tablet en la misma wifi un puerto cerrado contesta al momento; el plazo
 * solo pesa si la tablet duerme. Devuelve los puertos abiertos, ordenados.
 *
 * Un fallo del MÓVIL (sin descriptores libres, sin búferes) no dice nada del
 * puerto: se vuelve a probar (3.60.9). Con 1.024 conexiones a la vez, en
 * Termux (tope de 1.024 ficheros abiertos por proceso en Android) muchos
 * puertos salían «cerrados» por EMFILE y el de la tablet (40461, 21 de
 * octubre de 2026) no se encontraba. Por eso van 256 a la vez y, al primer
 * fallo del móvil, menos: las que tenía abiertas en ese momento.
 */
const FALLOS_DEL_MOVIL = new Set(['EMFILE', 'ENFILE', 'ENOBUFS', 'EAGAIN', 'EADDRNOTAVAIL', 'ENOMEM']);
const REINTENTOS_POR_PUERTO = 5;
export function escanearPuertos(ip, { desde = PUERTOS_EFIMEROS[0], hasta = PUERTOS_EFIMEROS[1], aLaVez = 256, ms = 1500, conectar = connect } = {}) {
  return new Promise((resolver) => {
    const abiertos = [];
    const pendientes = [];
    const intentos = new Map();
    let siguiente = desde, enCurso = 0, limite = aLaVez;
    const probar = (puerto) => new Promise((fin) => {
      let s;
      try { s = conectar({ host: ip, port: puerto }); } catch (e) { fin(FALLOS_DEL_MOVIL.has(e?.code) ? 'otra' : 'no'); return; }
      const cerrar = (r) => { s.destroy(); fin(r); };
      s.setTimeout(ms, () => cerrar('no'));
      s.once('connect', () => cerrar('si'));
      s.once('error', (e) => cerrar(FALLOS_DEL_MOVIL.has(e?.code) ? 'otra' : 'no'));
    });
    const quedan = () => pendientes.length || siguiente <= hasta;
    const lanzar = () => {
      while (enCurso < limite && quedan()) {
        const puerto = pendientes.length ? pendientes.shift() : siguiente++;
        enCurso += 1;
        probar(puerto).then((r) => {
          enCurso -= 1;
          if (r === 'si') abiertos.push(puerto);
          if (r === 'otra') {
            // Lo que había abierto al fallar es lo que el móvil aguanta: se baja a eso.
            limite = Math.max(8, Math.min(limite, enCurso));
            const n = (intentos.get(puerto) ?? 0) + 1;
            intentos.set(puerto, n);
            if (n < REINTENTOS_POR_PUERTO) pendientes.push(puerto);
          }
          if (!quedan() && enCurso === 0) resolver(abiertos.sort((x, y) => x - y));
          // Tras un fallo del móvil se deja respirar un momento antes de seguir.
          else if (r === 'otra') setTimeout(lanzar, 20); else lanzar();
        });
      }
    };
    if (desde > hasta) resolver([]); else lanzar();
  });
}
