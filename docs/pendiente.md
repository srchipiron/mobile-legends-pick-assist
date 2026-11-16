# Pendiente

Solo lo abierto: lo hecho está en el CHANGELOG y en git.

- **La fila de baneos de la tablet** está rota desde el parche del 11-11-2026 (sale «?» en las diez casillas). Hace falta una captura de la pantalla del draft (baneos y picks) para medir su sitio nuevo. Mientras, el draft se abre por los picks y los baneos casi no se leen; sin fila tampoco hay capturas para aprender. Desde 4.0.1 la tablet sube SOLA esa captura: al cerrarse un draft sin la fila, la cabecera (franja de arriba, 15 % del alto, 1200 px) de una captura de sus picks, `tipo: 'cabecera'` en `recortes` con la clave del lector, una al día; con ella se vuelve a medir `BANEOS` (leer.mjs).
- **Las victorias dudosas** del 26-10 al 10-11-2026: Javi las confirma o cambia en «Tus partidas».
- **Seguridad, decisiones suyas** (revisión del 11-11): proteger `main` con PR o confirmar las actualizaciones de la APK; HMAC por petición en vez del código en claro por la wifi; topes globales y quitar a `anon` `partes_recientes`/`recortes_recientes`; `LECTOR_FIRMA_CLAVE` de 32 caracteres o más.
- **Dos cambios de Supabase sin aplicar** (de 3.83.1): `recortes_recientes` sin las miniaturas del final y `mis_recortes` sin contarlas en sus 50. Los pega Javi en el SQL Editor.
- **El origen compartido** `srchipiron.github.io` con otra app suya: cualquier página de ese origen lee el token. Dominio propio o mover la otra app.
- **Sin medir en la tablet**: los FPS del juego con la grabación; la pantalla de carga contra el minimapa; si la burbuja molesta.
- **Caras que esperan un segundo draft**: Barats y su Floryn rosa.
- **Un héroe nuevo**: la deducción de etiquetas lo cubre; `derivar-tags.mjs` regenera las tablas y su `kit` se actualiza al revisar sus etiquetas.
