import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Las pruebas viven en la raiz, no dentro de myApp/ ni de web/, porque cubren
// modulos de los dos: la logica del telefono y la funcion de la API comparten
// criterios (fechas locales, idempotencia) que conviene verificar juntos.
export default defineConfig({
  resolve: {
    // Hay dos instalaciones de React: la de web/node_modules y la de la raiz.
    // Sin deduplicar, el hook bajo prueba resuelve una y la libreria de
    // pruebas la otra, y React se queda en null al no compartir el
    // despachador de hooks.
    dedupe: ['react', 'react-dom'],
    alias: {
      // La app movil importa modulos nativos que no existen en Node. Se
      // sustituyen por dobles en memoria para poder probar la logica que hay
      // ALREDEDOR de ellos, que es lo que se rompe de verdad.
      '@react-native-async-storage/async-storage': resolve(
        __dirname,
        'tests/stubs/async-storage.ts'
      ),
      'expo-crypto': resolve(__dirname, 'tests/stubs/expo-crypto.ts'),
      'react-native': resolve(__dirname, 'tests/stubs/react-native.ts'),
      '@react-native-community/netinfo': resolve(__dirname, 'tests/stubs/netinfo.ts'),
    },
  },
  // Sin esto, al transformar un archivo de myApp/ Vite busca el tsconfig mas
  // cercano y encuentra myApp/tsconfig.json, que hace extends de
  // "expo/tsconfig.base". En CI solo se instalan las dependencias de la raiz,
  // asi que Expo no esta y la resolucion falla tumbando la suite entera.
  //
  // Las pruebas solo necesitan transpilar TypeScript, no la configuracion de
  // Expo. Al dar un tsconfigRaw explicito, esbuild deja de buscarlo en disco.
  // Se pasa como CADENA, no como objeto: con un objeto Vite sigue leyendo el
  // tsconfig del disco para fusionar opciones, y vuelve a fallar. Solo la
  // forma de cadena le hace saltarse la busqueda por completo.
  esbuild: {
    tsconfigRaw: '{"compilerOptions":{"target":"es2022","useDefineForClassFields":true}}',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      // Istanbul, no v8: es el formato que pide el informe, y json-summary
      // produce el coverage-summary.json que se versiona.
      provider: 'istanbul',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary', 'lcov'],

      // El denominador son los modulos de LOGICA. Las pantallas y componentes
      // quedan fuera a proposito: probarlos exige montar React Native o un
      // navegador, y su valor es visual, no algoritmico. Lo que se mide aqui
      // es lo que puede fallar en silencio — fechas, colas, idempotencia.
      include: [
        'myApp/lib/**/*.ts',
        'myApp/storage.ts',
        'web/src/lib/**/*.ts',
        'web/api/**/*.ts',
      ],
      exclude: [
        // Clientes que solo construyen un objeto de configuracion: no hay
        // logica que verificar y arrastran efectos de red al importarlos.
        'myApp/lib/supabase.ts',
        'web/src/lib/supabase.ts',
        // Solo declaraciones de tipos.
        'web/src/lib/types.ts',
      ],
    },
  },
})
