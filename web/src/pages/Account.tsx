// src/pages/Account.tsx
// Área privada de la cuenta: lo único de la web donde el cuidador puede
// MODIFICAR algo. El panel de monitoreo es solo lectura.
//
// Tres bloques, todos sobre tablas que ya existían sin interfaz que las
// usara: el perfil, los miembros del hogar y las invitaciones.

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  onBack: () => void;
  onSignOut: () => void;
}

interface Perfil {
  id: string;
  email: string | null;
  full_name: string | null;
}

interface Hogar {
  id: string;
  name: string;
  timezone: string;
  miRol: string;
}

interface Miembro {
  user_id: string;
  role: string;
  nombre: string;
  email: string;
}

interface Invitacion {
  code: string;
  role: string;
  expires_at: string;
  redeemed_at: string | null;
}

// Mismo alfabeto de 32 símbolos que la app móvil, sin I/O/0/1 porque el
// código se dicta por teléfono. 32 divide exacto a 256, así que "byte % 32"
// reparte sin sesgo hacia los primeros caracteres.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generarCodigo(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-HN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function Account({ onBack, onSignOut }: Props) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [hogar, setHogar] = useState<Hogar | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);

  const [nombre, setNombre] = useState('');
  const [nombreHogar, setNombreHogar] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { data: p } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (p) {
      setPerfil(p as Perfil);
      setNombre((p as Perfil).full_name ?? '');
    }

    // Se toma el primer hogar. Con varios familiares a cargo habría más de
    // uno, y esta pantalla todavía no los distingue (ver README, limitaciones).
    const { data: m } = await supabase
      .from('household_members')
      .select('household_id, role, households(id, name, timezone)')
      .limit(1)
      .maybeSingle();

    const casa = m?.households as unknown as { id: string; name: string; timezone: string } | null;
    if (casa) {
      setHogar({ ...casa, miRol: m!.role as string });
      setNombreHogar(casa.name);

      const { data: ms } = await supabase
        .from('household_members')
        .select('user_id, role, profiles(full_name, email)')
        .eq('household_id', casa.id);

      setMiembros(
        (ms ?? []).map((row) => {
          const perf = row.profiles as unknown as { full_name: string | null; email: string | null };
          return {
            user_id: row.user_id as string,
            role: row.role as string,
            nombre: perf?.full_name ?? 'Sin nombre',
            email: perf?.email ?? '',
          };
        })
      );

      const { data: inv } = await supabase
        .from('household_invites')
        .select('code, role, expires_at, redeemed_at')
        .eq('household_id', casa.id)
        .order('expires_at', { ascending: false });

      setInvitaciones((inv ?? []) as Invitacion[]);
    }

    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardarNombre = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    if (!perfil) return;

    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: nombre.trim() || null })
      .eq('id', perfil.id);

    if (err) setError(err.message);
    else setAviso('Nombre actualizado.');
  };

  const guardarHogar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    if (!hogar) return;

    const { error: err } = await supabase
      .from('households')
      .update({ name: nombreHogar.trim() })
      .eq('id', hogar.id);

    if (err) setError(err.message);
    else {
      setAviso('Nombre del hogar actualizado.');
      void cargar();
    }
  };

  const crearInvitacion = async () => {
    setError(null);
    setAviso(null);
    if (!hogar) return;

    // Igual que en la app: se reintenta ante colisión, porque el código es la
    // clave primaria de la tabla.
    for (let intento = 0; intento < 5; intento++) {
      const code = generarCodigo();
      const { error: err } = await supabase
        .from('household_invites')
        .insert({ code, household_id: hogar.id, role: 'caregiver' });

      if (!err) {
        setAviso(`Código creado: ${code}`);
        void cargar();
        return;
      }
      if (err.code !== '23505') {
        setError(err.message);
        return;
      }
    }
    setError('No se pudo generar un código. Inténtalo de nuevo.');
  };

  const revocar = async (code: string) => {
    setError(null);
    setAviso(null);
    const { error: err } = await supabase.from('household_invites').delete().eq('code', code);
    if (err) setError(err.message);
    else {
      setAviso('Invitación revocada.');
      void cargar();
    }
  };

  const pendientes = invitaciones.filter(
    (i) => !i.redeemed_at && new Date(i.expires_at) > new Date()
  );

  return (
    <>
      <header className="header">
        <div>
          <p className="eyebrow">Portal privado</p>
          <h1>Mi cuenta</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="plain" onClick={onBack}>
            Ver panel
          </button>
          <button type="button" className="plain" onClick={onSignOut}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="container">
        {error && <div className="banner banner-error">{error}</div>}
        {aviso && <div className="banner banner-ok">{aviso}</div>}

        {cargando && <p className="muted">Cargando…</p>}

        {!cargando && (
          <>
            <p className="section-title">Datos de la cuenta</p>
            <div className="card">
              <p className="muted" style={{ marginTop: 0 }}>
                Correo: <strong>{perfil?.email ?? '—'}</strong>
              </p>
              <form onSubmit={guardarNombre}>
                <label htmlFor="nombre">Tu nombre</label>
                <input
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Cómo te ven los demás miembros"
                />
                <button type="submit">Guardar nombre</button>
              </form>
            </div>

            {hogar && (
              <>
                <p className="section-title">Hogar</p>
                <div className="card">
                  <form onSubmit={guardarHogar}>
                    <label htmlFor="hogar">Nombre del hogar</label>
                    <input
                      id="hogar"
                      value={nombreHogar}
                      onChange={(e) => setNombreHogar(e.target.value)}
                      placeholder="Por ejemplo: Casa de la abuela"
                    />
                    <button type="submit">Guardar</button>
                  </form>
                  <p className="muted" style={{ marginBottom: 0 }}>
                    Zona horaria: <strong>{hogar.timezone}</strong>. De ella salen
                    las fechas de cada dosis, no del reloj de este navegador.
                  </p>
                </div>

                <p className="section-title">Quién tiene acceso</p>
                {miembros.map((m) => (
                  <div className="med-row" key={m.user_id}>
                    <div className="med-info">
                      <p className="med-name">{m.nombre}</p>
                      <p className="med-detail is-pending">{m.email}</p>
                    </div>
                    <div className="med-adherence">
                      {m.role === 'patient' ? 'Paciente' : 'Cuidador'}
                    </div>
                  </div>
                ))}

                <p className="section-title">Invitaciones pendientes</p>
                {pendientes.length === 0 && (
                  <div className="card">
                    <p className="muted" style={{ margin: 0 }}>
                      No hay códigos activos. Genera uno para que otra persona
                      pueda acompañar este hogar.
                    </p>
                  </div>
                )}
                {pendientes.map((i) => (
                  <div className="med-row" key={i.code}>
                    <div className="med-info">
                      <p className="med-name" style={{ letterSpacing: 4 }}>
                        {i.code}
                      </p>
                      <p className="med-detail is-pending">
                        Caduca el {formatearFecha(i.expires_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="link"
                      style={{ width: 'auto', padding: '8px 16px', marginTop: 0 }}
                      onClick={() => revocar(i.code)}
                    >
                      Revocar
                    </button>
                  </div>
                ))}

                <div style={{ marginTop: 20 }}>
                  <button type="button" onClick={crearInvitacion}>
                    Generar código de invitación
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
