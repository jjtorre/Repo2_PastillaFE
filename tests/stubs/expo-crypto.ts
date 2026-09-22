// tests/stubs/expo-crypto.ts
// Doble de expo-crypto sobre el crypto de Node.
//
// Importa que devuelva UUID de verdad y no valores fijos: varias pruebas
// comprueban justamente que los identificadores dejan de colisionar al pasar
// de Date.now() a UUID.

import { randomUUID as nodeRandomUUID, randomBytes } from 'node:crypto';

export function randomUUID(): string {
  return nodeRandomUUID();
}

export function getRandomBytes(cantidad: number): Uint8Array {
  return new Uint8Array(randomBytes(cantidad));
}

export async function getRandomBytesAsync(cantidad: number): Promise<Uint8Array> {
  return getRandomBytes(cantidad);
}
