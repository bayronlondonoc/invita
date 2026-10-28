#!/usr/bin/env python3
"""Convierte las fotos de la carta a WebP y actualiza la lista HOJAS de assets/carta.js.

    python3 scripts/convertir.py

- Lee fotos-originales/ (jpg, jpeg, png, webp), en orden alfabético: hoja-01, hoja-02…
- Endereza según la orientación del celular y quita los metadatos (ubicación, fecha, equipo).
- hojas/<nombre>.webp: máximo 2400 px de ancho, calidad 85 (nítida al hacer zoom).
- hojas/mini/<nombre>.webp: 900 px de ancho, para la mesa.
"""
import pathlib
import re
import sys

from PIL import Image, ImageOps

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'fotos-originales'
DESTINO = RAIZ / 'hojas'
MINI = DESTINO / 'mini'
JS = RAIZ / 'assets' / 'carta.js'
EXTENSIONES = {'.jpg', '.jpeg', '.png', '.webp'}


def reducir(img, ancho_max):
    if img.width <= ancho_max:
        return img
    alto = round(img.height * ancho_max / img.width)
    return img.resize((ancho_max, alto), Image.LANCZOS)


def main():
    fotos = sorted(p for p in ORIGEN.iterdir() if p.suffix.lower() in EXTENSIONES)
    if not fotos:
        sys.exit(f'No hay fotos en {ORIGEN}')
    MINI.mkdir(parents=True, exist_ok=True)
    for viejo in [*DESTINO.glob('*.webp'), *MINI.glob('*.webp')]:
        viejo.unlink()

    nombres = []
    for foto in fotos:
        nombre = f'{foto.stem}.webp'
        with Image.open(foto) as original:
            img = ImageOps.exif_transpose(original).convert('RGB')   # sin EXIF: no viaja la ubicación
        grande = reducir(img, 2400)
        grande.save(DESTINO / nombre, 'WEBP', quality=85, method=6)
        reducir(img, 900).save(MINI / nombre, 'WEBP', quality=80, method=6)
        peso = (DESTINO / nombre).stat().st_size / 1024
        print(f'✓ {foto.name} → hojas/{nombre}  {grande.width}×{grande.height}  {peso:.0f} KB')
        nombres.append(nombre)

    lista = ''.join(f"  '{n}',\n" for n in nombres)
    texto = JS.read_text(encoding='utf-8')
    nuevo, cambios = re.subn(r'const HOJAS = \[\n.*?\];', f'const HOJAS = [\n{lista}];', texto, count=1, flags=re.S)
    if not cambios:
        sys.exit('No encontré "const HOJAS = [" en assets/carta.js')
    JS.write_text(nuevo, encoding='utf-8')
    print(f'✓ assets/carta.js: {len(nombres)} hojas')


if __name__ == '__main__':
    main()
