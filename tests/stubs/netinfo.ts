// tests/stubs/netinfo.ts
// Doble de @react-native-community/netinfo.
//
// Se aliasa en vez de usar vi.mock porque el paquete solo esta instalado bajo
// myApp/node_modules: un vi.mock escrito en la raiz se registra con un
// identificador que no resuelve, no llega a aplicarse, y termina cargandose el
// paquete real.
//
// __net permite a cada prueba decidir si hay conexion.

export const __net = { isConnected: true };

const NetInfo = {
  async fetch() {
    return { isConnected: __net.isConnected, isInternetReachable: __net.isConnected };
  },
  addEventListener(_cb: (estado: { isConnected: boolean }) => void) {
    return () => {};
  },
};

export default NetInfo;
