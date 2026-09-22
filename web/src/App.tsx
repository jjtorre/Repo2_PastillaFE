// src/App.tsx
// Dos rutas, y solo una de ellas es pública:
//
//   /        Landing. Cualquiera puede verla.
//   /panel   Portal privado. Exige sesión y, además, pertenecer a un hogar.
//
// Dentro de /panel la pantalla depende de cuánto ha avanzado el cuidador:
//
//   sin sesión          -> Login
//   sesión sin hogar    -> JoinHousehold  (canjear código)
//   sesión con hogar    -> Dashboard
//
// Ese paso intermedio existe porque tener cuenta no da acceso a nada: el RLS
// exige pertenecer al hogar. Sin esta pantalla, un cuidador recién registrado
// vería un panel vacío sin entender por qué.
//
// Que /panel sea una URL de verdad y no un estado interno importa: es la
// dirección que se puede compartir, guardar en marcadores o entregar como
// «portal privado» sin que muestre la landing a quien la abra.

import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured } from './lib/supabase';
import { useRoute } from './lib/useRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import JoinHousehold from './pages/JoinHousehold';
import Dashboard from './pages/Dashboard';
import Account from './pages/Account';

const RUTA_PANEL = '/panel';
const RUTA_CUENTA = '/panel/cuenta';

// Marca visible para el servidor de que hay sesión.
//
// Supabase guarda la sesión en localStorage, que el borde no puede leer, así
// que sin esto middleware.ts no podría distinguir a nadie y /panel se
// serviría a cualquiera.
//
// NO es una credencial: no autoriza nada. Quien la falsifique recibe la
// aplicación vacía, porque los datos los sigue filtrando la seguridad por fila
// de la base. Por eso no lleva información alguna, solo un "1".
const COOKIE_SESION = 'pastilla_sesion';

function marcarSesion(activa: boolean) {
  if (activa) {
    // 30 días: más que la vida del token, para que un refresco de sesión no
    // deje la marca caducada y provoque un 401 a alguien que sí tiene sesión.
    document.cookie = `${COOKIE_SESION}=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  } else {
    document.cookie = `${COOKIE_SESION}=; path=/; max-age=0; SameSite=Lax`;
  }
}

function Cargando() {
  return (
    <div className="centered">
      <p className="muted">Cargando…</p>
    </div>
  );
}

export default function App() {
  const { path, navigate } = useRoute();
  const [session, setSession] = useState<Session | null>(null);
  const [hasHousehold, setHasHousehold] = useState<boolean | null>(null);
  // Sin credenciales no hay sesión que consultar, así que ya está listo desde
  // el primer render. Derivarlo aquí evita un setState dentro del efecto.
  const [ready, setReady] = useState(!isConfigured);

  useEffect(() => {
    if (!isConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      marcarSesion(data.session !== null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      marcarSesion(next !== null);
      // Al cambiar de usuario hay que volver a preguntar por el hogar: el
      // anterior no dice nada del nuevo.
      setHasHousehold(null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const checkHousehold = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('household_members').select('household_id').limit(1);
    setHasHousehold((data?.length ?? 0) > 0);
  }, [session]);

  useEffect(() => {
    if (session && hasHousehold === null) void checkHousehold();
  }, [session, hasHousehold, checkHousehold]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setHasHousehold(null);
    navigate('/');
  };

  if (!isConfigured) {
    return (
      <div className="centered">
        <h2>Falta configurar la conexión</h2>
        <div className="banner banner-error">
          No se encontraron <code>VITE_SUPABASE_URL</code> ni{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>.
        </div>
        <p className="muted">
          Copia <code>.env.example</code> como <code>.env.local</code>, rellena
          los dos valores y reinicia el servidor de desarrollo.
        </p>
      </div>
    );
  }

  // Cualquier ruta que no sea el panel cae en la landing. Con solo dos rutas,
  // una pantalla de 404 sería más ruido que ayuda.
  if (!path.startsWith(RUTA_PANEL)) {
    return <Landing onEnter={() => navigate(RUTA_PANEL)} />;
  }

  // A partir de aquí estamos dentro del portal privado.
  if (!ready) return <Cargando />;

  if (!session) return <Login onBack={() => navigate('/')} />;

  if (hasHousehold === null) return <Cargando />;

  if (!hasHousehold) {
    return (
      <JoinHousehold onJoined={() => setHasHousehold(null)} onSignOut={handleSignOut} />
    );
  }

  // /panel/cuenta entra por el mismo portón: startsWith('/panel') ya exigió
  // sesión y pertenencia al hogar antes de llegar aquí.
  if (path.startsWith(RUTA_CUENTA)) {
    return <Account onBack={() => navigate(RUTA_PANEL)} onSignOut={handleSignOut} />;
  }

  return (
    <Dashboard onSignOut={handleSignOut} onAccount={() => navigate(RUTA_CUENTA)} />
  );
}
