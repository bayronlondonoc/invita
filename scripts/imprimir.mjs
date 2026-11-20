#!/usr/bin/env node
// Genera la hoja imprimible (PDF tamaño carta) de una Florece, con el QR que lleva la clave.
//   node scripts/imprimir.mjs tulipan
// Salida: privado/<nombre>/imprimible.pdf y privado/<nombre>/imprimible.png (vista previa).
// Todo queda en privado/ porque el QR contiene la clave.

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const nombre = process.argv[2];
if (!nombre) { console.error('Uso: node scripts/imprimir.mjs <nombre>'); process.exit(2); }

const privado = path.join(RAIZ, 'privado', nombre);
const contenido = JSON.parse(await readFile(path.join(privado, 'contenido.json'), 'utf8'));
const url = (await readFile(path.join(privado, 'link.txt'), 'utf8')).trim();
if (!contenido.vales?.length) { console.error('✗ contenido.json no tiene "vales"'); process.exit(1); }

const datos = { url, para: contenido.para, de: contenido.de, vales: contenido.vales.slice(0, 5) };
const pagina = `${pathToFileURL(path.join(RAIZ, 'scripts', 'imprimible.html'))}#${encodeURIComponent(JSON.stringify(datos))}`;
const comun = ['--headless=new', '--hide-scrollbars', '--virtual-time-budget=8000', '--allow-file-access-from-files'];

execFileSync(CHROME, [...comun, '--no-pdf-header-footer', `--print-to-pdf=${path.join(privado, 'imprimible.pdf')}`, pagina], { stdio: 'ignore' });
execFileSync(CHROME, [...comun, '--window-size=816,1056', '--force-device-scale-factor=2', `--screenshot=${path.join(privado, 'imprimible.png')}`, pagina], { stdio: 'ignore' });
console.log(`✓ privado/${nombre}/imprimible.pdf  (+ imprimible.png de vista previa)`);
