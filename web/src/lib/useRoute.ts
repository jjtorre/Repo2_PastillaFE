// src/lib/useRoute.ts
// Enrutado mínimo para dos rutas: la landing pública y el portal privado.
//
// No se usa react-router porque con dos rutas su API no aporta nada que estas
// veinte líneas no cubran, y sí añade peso al bundle.
//
// Lo que sí hace falta cubrir, y aquí está cubierto: el botón «atrás» del
// navegador. Sin escuchar `popstate`, volver atrás cambiaría la URL pero
// dejaría la pantalla congelada, que es el fallo clásico de enrutar a mano.

import { useState, useEffect, useCallback } from 'react';

export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to === window.location.pathname) return;
    window.history.pushState({}, '', to);
    setPath(to);
  }, []);

  return { path, navigate };
}
