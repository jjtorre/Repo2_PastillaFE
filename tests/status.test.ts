import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  computeStatus,
  toLocalDateString,
  localToday,
} from '../myApp/lib/status';
import type { Medication } from '../myApp/types';

function medicamento(parcial: Partial<Medication> = {}): Medication {
  return {
    id: 'med-1',
    name: 'Paracetamol',
    time: '08:00',
    expirationDate: '2030-01-01T00:00:00.000Z',
    quantity: 30,
    status: 'pending',
    lastTakenAt: null,
    ...parcial,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('computeStatus', () => {
  it('sigue "taken" si la toma fue hoy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));

    const med = medicamento({
      status: 'taken',
      lastTakenAt: new Date(2026, 0, 15, 8, 5, 0).toISOString(),
    });

    expect(computeStatus(med)).toBe('taken');
  });

  // El motivo de que computeStatus exista: sin esto, la dosis de ayer
  // seguiria apareciendo como tomada y el paciente se la saltaria.
  it('deja de ser "taken" si la toma fue ayer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));

    const med = medicamento({
      status: 'taken',
      lastTakenAt: new Date(2026, 0, 14, 8, 5, 0).toISOString(),
    });

    expect(computeStatus(med)).toBe('late');
  });

  it('es "late" cuando ya paso la hora y no se ha marcado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 9, 30, 0));

    expect(computeStatus(medicamento({ time: '08:00' }))).toBe('late');
  });

  it('es "pending" cuando aun no llega la hora', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 7, 0, 0));

    expect(computeStatus(medicamento({ time: '08:00' }))).toBe('pending');
  });

  it('trata "taken" sin lastTakenAt como no tomado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 7, 0, 0));

    const med = medicamento({ status: 'taken', lastTakenAt: null });
    expect(computeStatus(med)).toBe('pending');
  });

  it('distingue el mismo dia de hace exactamente un ano', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));

    const med = medicamento({
      status: 'taken',
      lastTakenAt: new Date(2025, 0, 15, 8, 0, 0).toISOString(),
    });

    expect(computeStatus(med)).toBe('late');
  });
});

describe('toLocalDateString', () => {
  it('usa los componentes locales, no UTC', () => {
    // Las 18:30 del 15 de enero en una zona al oeste de Greenwich caen ya en
    // el dia 16 en UTC. Este es EXACTAMENTE el fallo que se arreglo: cortar
    // un toISOString() habria devuelto el dia siguiente y la dosis de la
    // cena se habria contado como del dia equivocado.
    const fecha = new Date(2026, 0, 15, 18, 30, 0);
    expect(toLocalDateString(fecha)).toBe('2026-01-15');
  });

  it('rellena mes y dia con cero a la izquierda', () => {
    expect(toLocalDateString(new Date(2026, 2, 5))).toBe('2026-03-05');
  });

  it('acierta en el ultimo instante del ano', () => {
    expect(toLocalDateString(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });

  it('acierta en el primer instante del ano', () => {
    expect(toLocalDateString(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
  });
});

describe('localToday', () => {
  it('coincide con toLocalDateString aplicado a la fecha actual', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 9, 22, 45, 0));

    expect(localToday()).toBe('2026-06-09');
  });
});
