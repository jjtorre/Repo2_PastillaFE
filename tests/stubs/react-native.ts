// tests/stubs/react-native.ts
// Doble mínimo de react-native.
//
// Se aliasa en vez de usar vi.mock porque el paquete real trae fuentes con
// anotaciones de Flow que Node no sabe parsear: al intentar resolverlo, la
// suite entera revienta con un error de sintaxis antes de ejecutar un solo
// test.
//
// Solo se incluye lo que los módulos bajo prueba usan de verdad.

export const AppState = {
  addEventListener: (_evento: string, _cb: (estado: string) => void) => ({
    remove: () => {},
  }),
  currentState: 'active' as const,
};

export const Platform = {
  OS: 'android' as const,
  select: <T,>(opciones: { android?: T; ios?: T; default?: T }): T | undefined =>
    opciones.android ?? opciones.default,
};
