// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoute } from '../web/src/lib/useRoute';

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

describe('enrutado por ruta', () => {
  it('arranca en la ruta actual del navegador', () => {
    window.history.pushState({}, '', '/panel');
    const { result } = renderHook(() => useRoute());

    expect(result.current.path).toBe('/panel');
  });

  it('navegar cambia la URL y el estado', () => {
    const { result } = renderHook(() => useRoute());

    act(() => result.current.navigate('/panel/cuenta'));

    expect(window.location.pathname).toBe('/panel/cuenta');
    expect(result.current.path).toBe('/panel/cuenta');
  });

  it('navegar a la ruta actual no apila otra entrada', () => {
    window.history.pushState({}, '', '/panel');
    const { result } = renderHook(() => useRoute());
    const largoAntes = window.history.length;

    act(() => result.current.navigate('/panel'));

    expect(window.history.length).toBe(largoAntes);
  });

  // El fallo clasico de enrutar a mano: sin escuchar popstate, el boton
  // "atras" del navegador cambia la URL y deja la pantalla congelada.
  it('responde al boton atras del navegador', () => {
    const { result } = renderHook(() => useRoute());

    act(() => result.current.navigate('/panel'));
    expect(result.current.path).toBe('/panel');

    act(() => {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.path).toBe('/');
  });

  it('deja de escuchar al desmontarse', () => {
    const { result, unmount } = renderHook(() => useRoute());
    unmount();

    window.history.pushState({}, '', '/otra');
    window.dispatchEvent(new PopStateEvent('popstate'));

    // Sigue con el valor que tenia: ya no hay suscripcion activa.
    expect(result.current.path).toBe('/');
  });
});
