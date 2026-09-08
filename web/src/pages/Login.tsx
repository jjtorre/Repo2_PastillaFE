// src/pages/Login.tsx
// El cuidador SÍ tiene cuenta real, a diferencia del paciente, que entra con
// sesión anónima desde el móvil. Es lo que hace recuperable el sistema: si el
// paciente pierde el teléfono, su cuenta anónima muere pero el cuidador
// conserva el acceso al hogar y puede volver a invitarlo.

import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const { data, error: authError } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (authError) {
      setError(authError.message);
    } else if (mode === 'signup' && !data.session) {
      // Con confirmación de correo activada, signUp no devuelve sesión. Sin
      // este aviso la pantalla parecería colgada tras registrarse.
      setNotice('Revisa tu correo y confirma la cuenta para poder entrar.');
    }

    setLoading(false);
  };

  return (
    <div className="centered">
      <h2>Panel del cuidador</h2>
      <p className="muted" style={{ marginBottom: 28 }}>
        Entra para ver si tu familiar ya tomó sus medicamentos hoy.
      </p>

      {error && <div className="banner banner-error">{error}</div>}
      {notice && <div className="banner banner-ok">{notice}</div>}

      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Correo electrónico</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          minLength={6}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Un momento…' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>

      <button
        type="button"
        className="link"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
          setNotice(null);
        }}
      >
        {mode === 'signin' ? 'No tengo cuenta todavía' : 'Ya tengo cuenta'}
      </button>
    </div>
  );
}
