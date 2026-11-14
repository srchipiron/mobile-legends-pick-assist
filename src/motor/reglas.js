/**
 * Reglas escritas a mano: son DATOS (tablas) y por eso llevan los nombres de campo
 * en inglés, como el resto del esquema. Con la matriz de cruces completa solo
 * deciden algo con un héroe tan nuevo que la API no publica ni un cruce suyo, y se
 * dicen como lo que son. `why` es una CLAVE de i18n (los dos idiomas o la prueba
 * de traducción falla). [M] `medir-reglas.mjs`: siete de las once miden más héroes
 * de los que daría el azar, pero todas miden UN solo eje (dash y dive a r = 0,93).
 * Cada regla nueva es deuda.
 */

/** «Si el enemigo tiene X, quien tiene Y gana valor». Peso en −1..1. */
export const COUNTER_RULES = [
  // La relación más decisiva del juego: contra Fanny o Ling, quien le corta
  // el dash gana. Va contra 'dash', no contra 'mobile': esa etiqueta servía
  // a la vez para asesinos de blink y para héroes que solo rotan bien.
  { enemyTag: 'dash', roamTag: 'anti_mobility', weight: 0.95, why: 'regla.antiDash' },
  { enemyTag: 'dive', roamTag: 'peel', weight: 0.9, why: 'regla.peel' },
  { enemyTag: 'dive', roamTag: 'anti_dive', weight: 0.55, why: 'regla.antiDive' },
  { enemyTag: 'heal', roamTag: 'antiheal', weight: 1.0, why: 'regla.antiheal' },
  // Casi toda composición tiene un carry lento: si pesara mucho, cualquiera
  // con «engage» ganaría contra cualquier enemigo.
  { enemyTag: 'immobile', roamTag: 'engage', weight: 0.35, why: 'regla.engageInmovil' },
  { enemyTag: 'hypercarry', roamTag: 'engage', weight: 0.3, why: 'regla.engageHypercarry' },
  { enemyTag: 'poke', roamTag: 'shield', weight: 0.6, why: 'regla.escudoPoke' },
  // Penalización: un héroe lento sufre contra poke.
  { enemyTag: 'poke', roamTag: 'immobile', weight: -0.7, why: 'regla.sufrePoke' },
  { enemyTag: 'burst', roamTag: 'sustain', weight: 0.5, why: 'regla.sustainBurst' },
  { enemyTag: 'assassin_late', roamTag: 'vision', weight: 0.7, why: 'regla.visionAssassin' },
  // Movilidad general (rotar, esquivar zonas), sin dashes de por medio.
  { enemyTag: 'mobile', roamTag: 'anti_mobility', weight: 0.4, why: 'regla.estorbaRotaciones' },
  { enemyTag: 'zone', roamTag: 'mobile', weight: 0.4, why: 'regla.esquivaZonas' },
];

/** Necesidades de composición: se DICEN, no puntúan ([M] 0,00 ± 0,07 por hueco en 902 pro). El peso lo usa ajustar-modelo. */
export const TEAM_NEEDS = [
  { tag: 'engage', weight: 1.0 },
  { tag: 'cc_hard', weight: 0.9 },
  { tag: 'peel', weight: 0.8 },
  { tag: 'tanky', weight: 0.9 },
  { tag: 'sustain', weight: 0.4 },
  { tag: 'vision', weight: 0.3 },
];

/** Etiquetas que cubren la misma necesidad: encadenar control vale como control duro. */
export const SATISFIES = {
  cc_hard: ['cc_hard', 'cc_chain'],
  peel: ['peel', 'shield', 'anti_dive'],
  sustain: ['sustain', 'heal'],
  engage: ['engage'],
  tanky: ['tanky'],
  vision: ['vision'],
};

/** ¿El héroe cubre la necesidad (directamente o con una etiqueta equivalente)? */
export const cubre = (heroe, necesidad) => (SATISFIES[necesidad] ?? [necesidad]).some((t) => (heroe?.tags ?? []).includes(t));

/**
 * Etiquetas por defecto según el rol, para héroes que la API conoce y el
 * catálogo todavía no. Grosero, pero deja que un héroe recién salido cuente
 * en los cruces desde el primer día en vez de ser invisible.
 */
export const ROLE_DEFAULTS = {
  tank: ['tanky', 'engage', 'cc_hard'],
  support: ['peel', 'sustain'],
  fighter: ['dive', 'burst'],
  assassin: ['mobile', 'dive', 'burst'],
  mage: ['poke', 'burst'],
  marksman: ['hypercarry', 'immobile'],
};

/**
 * Etiquetas de Moonton («speciality») traducidas a las nuestras. NO están
 * escritas a ojo: las deriva `scripts/derivar-tags.mjs` del propio catálogo
 * (medido dejando cada héroe fuera: rol solo F1 49,1%; rol + speciality +
 * veto 59,0%). Reejecútalo cuando crezca el catálogo o cambien las etiquetas.
 */
export const SPECIALITY_TAGS = {
  'Guard': ['peel', 'sustain'],
  'Crowd Control': ['engage', 'cc_chain', 'tanky'],
  'Initiator': ['engage', 'cc_chain', 'tanky'],
  'Regen': ['tanky', 'heal'],
  'Chase': ['mobile', 'dash', 'dive'],
  'Poke': ['immobile', 'poke'],
  'Charge': ['dive'],
};

/**
 * Etiquetas que NUNCA le corresponden a un rol, según el propio catálogo:
 * sin esto una maga con control salía `tanky`. Solo filtra lo que añade la
 * speciality; las de por rol pasan siempre.
 */
export const ROLE_VETO = {
  'tank': ['assassin_late', 'dash', 'vision'],
  'fighter': ['anti_dive', 'antiheal', 'assassin_late', 'sustain'],
  'assassin': ['anti_dive', 'anti_mobility', 'antiheal', 'immobile', 'peel', 'sustain', 'tanky', 'zone'],
  'mage': ['anti_dive', 'anti_mobility', 'antiheal', 'assassin_late', 'engage', 'sustain', 'tanky'],
  'marksman': ['anti_mobility', 'antiheal', 'engage', 'sustain', 'tanky', 'vision'],
};

/**
 * Qué hace peligroso a un enemigo contra TU equipo, SIN dato del cruce. Con
 * dato manda el cruce (baneos.js). `soloSiFragil`: un tanque también lleva
 * `immobile`, y sin esto se proponía banear a quien le saltara encima al
 * tanque, que es lo que el tanque quiere (el 12,1% de los disparos, medido).
 */
export const DANGER_RULES = [
  { allyTag: 'immobile', enemyTag: 'dive', weight: 1.0, why: 'peligro.saltaEncima', soloSiFragil: true },
  { allyTag: 'immobile', enemyTag: 'burst', weight: 0.9, why: 'peligro.revienta', soloSiFragil: true },
  { allyTag: 'hypercarry', enemyTag: 'assassin_late', weight: 0.9, why: 'peligro.cazaLate' },
  { allyTag: 'heal', enemyTag: 'antiheal', weight: 0.8, why: 'peligro.anulaCuracion' },
  { allyTag: 'sustain', enemyTag: 'antiheal', weight: 0.8, why: 'peligro.anulaCuracion' },
  { allyTag: 'mobile', enemyTag: 'anti_mobility', weight: 0.7, why: 'peligro.bloqueaDashes' },
  { allyTag: 'poke', enemyTag: 'dive', weight: 0.6, why: 'peligro.noDejaPokear' },
  { allyTag: 'engage', enemyTag: 'zone', weight: 0.5, why: 'peligro.cortaInicios' },
];
