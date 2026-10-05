import { useEffect, useState } from 'react';

/**
 * Una imagen servida desde NUESTRO sitio, con hueco reservado.
 *
 * No se enlaza al CDN de Moonton: la app promete que tus datos no salen de
 * tu móvil y una imagen enlazada le cuenta tu IP a un tercero; y sin
 * cobertura una imagen enlazada no llega, que es justo cuando estás en un
 * draft. Si el fichero no está (héroe recién salido, descarga a medias) el
 * hueco se quita solo y queda el texto: una imagen rota es peor que ninguna.
 *
 * El prop se llama `className` a propósito: `comprobar/css.mjs` busca
 * literalmente `className=` para saber qué clases usa la interfaz.
 */
export function Imagen({ src, alt, className, tam }) {
  const [roto, setRoto] = useState(false);
  // Si cambia la ruta (el meta llega después del catálogo y el héroe gana su
  // id), se vuelve a intentar: antes `roto` se quedaba a true para siempre.
  // Y sin id no se pide nada: era un 404 real por cada hueco.
  useEffect(() => { setRoto(false); }, [src]);
  if (!src || roto || /\/(undefined|null)\./.test(src)) return null;
  return (
    <img
      className={className}
      src={src}
      alt=""
      aria-hidden
      title={alt}
      width={tam}
      height={tam}
      loading="lazy"
      decoding="async"
      onError={() => setRoto(true)}
    />
  );
}

// La huella del contenido de cada imagen publicada (vite.config.js, 3.41.0).
const HUELLAS = typeof __HUELLAS__ === 'undefined' ? {} : __HUELLAS__;

/**
 * La ruta de una cara o un icono con la huella de su contenido (`?v=`): la
 * caché del móvil las guarda para siempre (`CacheFirst`), así que sin ella
 * una imagen rehecha con el mismo nombre no llegaba nunca.
 */
export function rutaDeImagen(carpeta, id, ext, huellas = HUELLAS) {
  const v = huellas?.[carpeta]?.[id];
  return `./${carpeta}/${id}${ext}${v ? `?v=${v}` : ''}`;
}

/**
 * La cara de un héroe, por id (un id no cambia aunque Moonton reescriba el
 * nombre). `alt` se pasa como `title`: en los chips, donde el nombre ya está
 * escrito al lado, se pone a '' para no sacar un tooltip que no dice nada.
 */
export const Cara = ({ heroe, className, tam, alt = heroe?.name }) => <Imagen src={rutaDeImagen('heroes', heroe?.id, '.jpg')} alt={alt} className={className} tam={tam} />;

/** El icono de un objeto. */
export const Icono = ({ id, nombre }) => <Imagen src={rutaDeImagen('objetos', id, '.png')} alt={nombre} className="obj-icono" tam={28} />;
