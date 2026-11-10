# Caja NP6

Caja en efectivo estilo NP6 para cobrar con tax de NJ cuando no hay cajas, y llevar el registro para pasarlo al sistema después.

- `caja-madrugada.html` — código de la caja (el mismo que la versión en Claude).
- `menu/` — un archivo JSON por producto (precios, tamaños, combos, desactivados).
- `build-ipad.py` — genera `ipad/index.html` con el menú incluido.
- `ipad/index.html` — la versión para iPad que publica Cloudflare Pages (carpeta de salida `ipad`, sin comando de build).

Después de cambiar el código o el menú:

```bash
python build-ipad.py
git add -A && git commit -m "..." && git push
```

Las ventas viven solo en el iPad (almacenamiento del navegador); exportarlas desde Manager → Registro.
