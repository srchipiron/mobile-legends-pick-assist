import { createContext, useContext } from 'react';
import { crearT } from './index.js';

/** El traductor del idioma elegido, para toda la app (App pone el de verdad). */
export const ContextoT = createContext(crearT('es'));
export const useT = () => useContext(ContextoT);
