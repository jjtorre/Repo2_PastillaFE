// src/pages/JoinHousehold.tsx
// Canje del código que el paciente genera en la app.
//
// Hasta que esto ocurre, el cuidador no pertenece a ningún hogar y el RLS le
// devuelve cero filas en todas las tablas: no es que la web esté vacía, es
// que no tiene derecho a ver nada todavía.

import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  onJoined: () => void;
  onSignOut: () => void;
}

export default function JoinHousehold({ onJoined, onSignOut }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // redeem_invite es idempotente: si ya eras miembro de ese hogar, devuelve
    // el hogar sin error. Por eso reintentar tras un fallo de red, o recargar
    // esta página, es seguro.
    const { error: rpcError } = await supabase.rpc('redeem_invite', {
      p_code: code.trim().toUpperCase(),
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    onJoined();
  };

  return (
    <div className="centered">
      <h2>Escribe el código</h2>
      <p className="muted" style={{ marginBottom: 28 }}>
        Pídele a tu familiar que abra la app, entre en «Vista de cuidador» y
        toque «Invitar a un cuidador». Te dará un código de 6 caracteres.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <label htmlFor="code">Código de invitación</label>
        <input
          id="code"
          className="input-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          minLength={6}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
        />

        <button type="submit" disabled={loading || code.trim().length !== 6}>
          {loading ? 'Comprobando…' : 'Unirme'}
        </button>
      </form>

      <button type="button" className="link" onClick={onSignOut}>
        Cerrar sesión
      </button>
    </div>
  );
}
