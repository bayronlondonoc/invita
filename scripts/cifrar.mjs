#!/usr/bin/env node
// Cifra el contenido privado de una "Florece" y lo deja listo para publicar.
//   node scripts/cifrar.mjs tulipan
//
// Lee  privado/<nombre>/contenido.json + las fotos que menciona   (privado/ nunca se sube)
// Crea f/<nombre>/datos.enc   = IV (12 bytes) + AES-GCM(contenido con fotos incrustadas)
//      f/<nombre>/cancion.enc = igual, con el audio de cancion.archivo (si hay), aparte para no demorar la entrada
//      f/<nombre>/index.html  (si no existe)
// La clave vive en privado/<nombre>/clave.txt y se reutiliza: el QR impreso sigue sirviendo
// aunque cambies textos o fotos. Solo viaja en el #fragmento del link, que nunca llega al servidor.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { randomBytes, createCipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nombre = process.argv[2];
if (!nombre || !/^[a-z0-9-]+$/.test(nombre)) {
  console.error('Uso: node scripts/cifrar.mjs <nombre>   (ej. tulipan)');
  process.exit(2);
}
const privado = path.join(RAIZ, 'privado', nombre);
const publico = path.join(RAIZ, 'f', nombre);
const existe = (p) => access(p).then(() => true, () => false);

const contenido = JSON.parse(await readFile(path.join(privado, 'contenido.json'), 'utf8'));
const defaults = JSON.parse(await readFile(path.join(RAIZ, 'config', 'defaults.json'), 'utf8'));

// Incrusta cada "fotos/x.jpg" como data URL.
async function incrustar(valor) {
  if (typeof valor === 'string' && /\.(jpe?g|png|webp)$/i.test(valor)) {
    const tipo = /\.png$/i.test(valor) ? 'image/png' : /\.webp$/i.test(valor) ? 'image/webp' : 'image/jpeg';
    const bytes = await readFile(path.join(privado, valor));
    return `data:${tipo};base64,${bytes.toString('base64')}`;
  }
  if (Array.isArray(valor)) return Promise.all(valor.map(incrustar));
  if (valor && typeof valor === 'object') {
    const salida = {};
    for (const [k, v] of Object.entries(valor)) salida[k] = await incrustar(v);
    return salida;
  }
  return valor;
}

const faltan = ['para', 'de', 'petalos', 'carta'].filter((k) => !contenido[k]);
if (faltan.length) {
  console.error(`✗ Faltan en contenido.json: ${faltan.join(', ')}`);
  process.exit(1);
}

const archivoClave = path.join(privado, 'clave.txt');
let clave;
if (await existe(archivoClave)) {
  clave = Buffer.from((await readFile(archivoClave, 'utf8')).trim(), 'base64url');
} else {
  clave = randomBytes(16);   // AES-128: 22 caracteres en el link, igual de imposible de adivinar
  await writeFile(archivoClave, `${clave.toString('base64url')}\n`);
}

function cifrar(bytes) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv(clave.length === 16 ? 'aes-128-gcm' : 'aes-256-gcm', clave, iv);
  return Buffer.concat([iv, cifrador.update(bytes), cifrador.final(), cifrador.getAuthTag()]);
}

await mkdir(publico, { recursive: true });
const publicable = { ...contenido };
if (contenido.cancion?.archivo) {
  const audio = await readFile(path.join(privado, contenido.cancion.archivo));
  const tipo = /\.mp3$/i.test(contenido.cancion.archivo) ? 'audio/mpeg' : 'audio/mp4';
  await writeFile(path.join(publico, 'cancion.enc'), cifrar(audio));
  const { archivo, ...resto } = contenido.cancion;
  publicable.cancion = { ...resto, cifrada: 'cancion.enc', tipo };
  console.log(`✓ f/${nombre}/cancion.enc (${(audio.length / 1024).toFixed(0)} KB de audio cifrados)`);
}
const cifrado = cifrar(Buffer.from(JSON.stringify(await incrustar(publicable))));
await writeFile(path.join(publico, 'datos.enc'), cifrado);
if (!(await existe(path.join(publico, 'index.html')))) {
  await writeFile(path.join(publico, 'index.html'), `<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>Florece 🌸</title>
  <meta name="description" content="Este bosque está dormido.">
  <meta property="og:title" content="Florece 🌸">
  <meta property="og:description" content="Este bosque está dormido.">
  <meta property="og:image" content="${defaults.base_url.replace(/\/+$/, '')}/og.png">
  <meta name="theme-color" content="#0E1A14">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🌸%3C/text%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,400;1,500;1,600&family=Jost:wght@300;400;500&display=swap">
  <link rel="stylesheet" href="../../assets/florece.css">
  <script src="../../assets/florece.js" defer></script>
</head>
<body>
  <div id="bosque" class="bosque" aria-hidden="true"></div>
  <main id="app" class="escena"></main>
  <noscript><p style="color:#fff;text-align:center;padding:2rem">Este bosque necesita JavaScript.</p></noscript>
</body>
</html>
`);
}

const link = `${defaults.base_url.replace(/\/+$/, '')}/f/${nombre}/#${clave.toString('base64url')}`;
await writeFile(path.join(privado, 'link.txt'), `${link}\n`);
console.log(`✓ f/${nombre}/datos.enc (${(cifrado.length / 1024).toFixed(0)} KB cifrados)`);
console.log(`  Link con clave (NO lo publiques; va en el QR): privado/${nombre}/link.txt`);
