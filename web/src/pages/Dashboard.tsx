// src/pages/Dashboard.tsx
// Lo que el cuidador realmente viene a ver: si su familiar tomó lo de hoy.
//
// Lee las VISTAS, no las tablas. v_medication_today ya deriva el estado en la
// zona horaria del hogar, así que el navegador del cuidador no calcula fechas
// — importa si el paciente se la tomó a las 8 de SU mañana, no de la nuestra.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { MedicationToday, Adherence } from '../lib/types';

interface Props {
  onSignOut: () => void;
}

const STATUS_ORDER: Record<MedicationToday['status'], number> = {
  late: 0,
  pending: 1,
  taken: 2,
};

function detailText(med: MedicationToday): string {
  const time = med.scheduled_time.slice(0, 5);
  if (med.status === 'taken') return `Tomado · ${time}`;
  if (med.status === 'late') return `No tomado · ${time}`;
  return `Pendiente · ${time}`;
}

export default function Dashboard({ onSignOut }: Props) {
  const [meds, setMeds] = useState<MedicationToday[]>([]);
  const [adherence, setAdherence] = useState<Adherence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [todayRes, adherenceRes] = await Promise.all([
      supabase.from('v_medication_today').select('*'),
      supabase.from('v_adherence_30d').select('*'),
    ]);

    if (todayRes.error) {
      setError(todayRes.error.message);
    } else {
      const rows = (todayRes.data ?? []) as MedicationToday[];
      // Lo atrasado primero: es la razón por la que el cuidador abre esto.
      rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
      setMeds(rows);
      setError(null);
    }

    if (!adherenceRes.error) {
      setAdherence((adherenceRes.data ?? []) as Adherence[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();

    // Realtime: cuando el paciente marca una dosis en su teléfono, esta
    // pantalla se actualiza sola. Sin esto el cuidador tendría que recargar
    // para saber si pasó algo, que es justo la fricción que hace que la gente
    // deje de mirar el panel.
    const channel = supabase
      .channel('cuidador')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dose_events' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medications' }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const lateOnes = meds.filter((m) => m.status === 'late');
  const adherenceById = new Map(adherence.map((a) => [a.medication_id, a]));

  return (
    <>
      <header className="header">
        <div>
          <p className="eyebrow">Vista de cuidador</p>
          <h1>Estado del día</h1>
        </div>
        <button type="button" className="plain" onClick={onSignOut}>
          Cerrar sesión
        </button>
      </header>

      <div className="container">
        {error && <div className="banner banner-error">{error}</div>}

        {lateOnes.length > 0 && (
          <div className="banner banner-warning">
            ⚠{' '}
            {lateOnes.length === 1
              ? `${lateOnes[0].name} sin marcar`
              : `${lateOnes.length} medicamentos sin marcar`}
          </div>
        )}

        {loading && <p className="muted">Cargando…</p>}

        {!loading && meds.length === 0 && !error && (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              Todavía no hay medicamentos registrados en este hogar. Aparecerán
              aquí en cuanto tu familiar los agregue desde la app.
            </p>
          </div>
        )}

        {meds.map((med) => {
          const a = adherenceById.get(med.id);
          return (
            <div className="med-row" key={med.id}>
              <div className={`med-bar bar-${med.status}`} />
              <div className="med-info">
                <p className="med-name">{med.name}</p>
                <p className={`med-detail is-${med.status}`}>{detailText(med)}</p>
              </div>
              {a && (
                <div className="med-adherence">
                  {a.adherence_pct}%<br />
                  <span style={{ fontSize: 12 }}>30 días</span>
                </div>
              )}
            </div>
          );
        })}

        {meds.length > 0 && (
          <>
            <p className="section-title">Inventario</p>
            {meds.map((med) => (
              <div className="med-row" key={`stock-${med.id}`}>
                <div className="med-info">
                  <p className="med-name">{med.name}</p>
                  <p className="med-detail is-pending">
                    {med.quantity} {med.quantity === 1 ? 'pastilla' : 'pastillas'} · vence el{' '}
                    {new Date(`${med.expiration_date}T00:00:00`).toLocaleDateString('es-HN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
