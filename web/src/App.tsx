// src/App.tsx
// Tres estados posibles, y el orden en que se comprueban importa:
//
//   sin sesión          -> Login
//   sesión sin hogar    -> JoinHousehold  (canjear código)
//   sesión con hogar    -> Dashboard
//
// El paso intermedio existe porque tener cuenta no da acceso a nada: el RLS
// exige pertenecer al hogar. Sin esta pantalla, un cuidador recién registrado
// vería un panel vacío sin entender por qué.

import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured } from './lib/supabase';
import Landing from './pages/Landing';
import Login from './pages/Login';
import JoinHousehold from './pages/JoinHousehold';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [hasHousehold, setHasHousehold] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  // Un visitante sin sesión ve la landing; el login aparece solo cuando lo
  // pide. Un formulario como página de inicio no explica qué es esto.
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!isConfigured) {
      setReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
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

  if (!ready) {
    return (
      <div className="centered">
        <p className="muted">Cargando…</p>
      </div>
    );
  }

  if (!session) {
    return showLogin ? (
      <Login onBack={() => setShowLogin(false)} />
    ) : (
      <Landing onEnter={() => setShowLogin(true)} />
    );
  }

  if (hasHousehold === null) {
    return (
      <div className="centered">
        <p className="muted">Cargando…</p>
      </div>
    );
  }

  if (!hasHousehold) {
    return (
      <JoinHousehold onJoined={() => setHasHousehold(null)} onSignOut={handleSignOut} />
    );
  }

  return <Dashboard onSignOut={handleSignOut} />;
}
