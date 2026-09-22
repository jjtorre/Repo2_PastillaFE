// tests/stubs/async-storage.ts
// Doble en memoria de AsyncStorage.
//
// La API real solo se diferencia en que persiste; para la logica que se prueba
// aqui —colas, migraciones, lectura y escritura— el comportamiento observable
// es el mismo.

const almacen = new Map<string, string>();

export function __reset(): void {
  almacen.clear();
}

export function __volcado(): Record<string, string> {
  return Object.fromEntries(almacen);
}

const AsyncStorage = {
  async getItem(clave: string): Promise<string | null> {
    return almacen.has(clave) ? almacen.get(clave)! : null;
  },
  async setItem(clave: string, valor: string): Promise<void> {
    almacen.set(clave, valor);
  },
  async removeItem(clave: string): Promise<void> {
    almacen.delete(clave);
  },
  async clear(): Promise<void> {
    almacen.clear();
  },
};

export default AsyncStorage;
