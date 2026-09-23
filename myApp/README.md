# myApp — Épica 1 (TypeScript, Expo SDK 54)

App de gestión de recetas para el proyecto de Ozman Carias. Sin login,
sin backend: todo se guarda en el teléfono con `AsyncStorage` (decisión
validada con el PO, ya que la familia comparte un solo dispositivo).
LEARN-CAP-C366ADC1
## Paso 1 — Crear el proyecto base

```bash
npx create-expo-app myApp --template blank-typescript
cd myApp
```


Esto genera `App.tsx`, `package.json`, `tsconfig.json`, `app.json` y la
carpeta `assets/` con los íconos por defecto.

## Paso 2 — Copiar estos archivos encima

Copia **todo excepto la carpeta `assets/`** de este proyecto sobre el
que acabas de generar, sobrescribiendo cuando te lo pida:

```
App.tsx            ← sobrescribe el de blank-typescript
package.json        ← sobrescribe el de blank-typescript
tsconfig.json        ← sobrescribe el de blank-typescript
app.json            ← sobrescribe el de blank-typescript
theme.ts
storage.ts
types.ts
components/
screens/
```

**No copies `assets/`** — deja los íconos que ya generó `create-expo-app`.

## Paso 3 — Instalar dependencias con expo install

Importante: usa `npx expo install`, **no** `npm install` a secas. Esto
evita el problema que tuviste antes (versiones incompatibles con SDK 54,
como `@react-native-async-storage/async-storage` 3.x, que no funciona en
SDK 54+).

```bash
npx expo install @react-navigation/native @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context
npx expo install @react-native-async-storage/async-storage
npx expo install @react-native-community/datetimepicker
```

## Paso 4 — Verificar antes de correr

```bash
npx expo-doctor
```

Si marca algo desalineado, corrige lo que indique antes de seguir.

## Paso 5 — Correr la app

```bash
npx expo start
```

Escanea el QR con la cámara del iPhone (te manda a Expo Go). Si tenías
una instalación previa con errores, limpia caché primero:

```bash
npx expo start --clear
```

## Qué verás al abrir la app

Entra directo a **"Mis medicamentos"** (no hay pantalla de login). Si
es la primera vez, verás el mensaje de lista vacía invitándote a agregar
un medicamento.

## Pantallas incluidas

| Pantalla | Archivo | Historias cubiertas |
|---|---|---|
| Lista de medicamentos (inicial) | `screens/MedicationListScreen.tsx` | 6, 11 |
| Agregar / editar medicamento | `screens/AddMedicationScreen.tsx` | 3, 4, 5, 9 |
| Detalle / eliminar | `screens/MedicationDetailScreen.tsx` | 8, 9, 11 |
| Vista de cuidador (resumen del día) | `screens/CaregiverViewScreen.tsx` | 7 (adaptada) |

`EditMedication` reutiliza `AddMedicationScreen` — cuando
`route.params.id` viene presente, precarga los datos existentes y
cambia el botón a "Guardar cambios".

## Estructura de archivos final

```
myApp/
├── App.tsx
├── theme.ts
├── storage.ts
├── types.ts
├── package.json
├── tsconfig.json
├── app.json
├── assets/                          ← generado por create-expo-app, no se toca
├── components/
│   ├── MedicationCard.tsx
│   └── ScreenHeader.tsx
└── screens/
    ├── MedicationListScreen.tsx
    ├── AddMedicationScreen.tsx
    ├── MedicationDetailScreen.tsx
    └── CaregiverViewScreen.tsx
```

## Notas de diseño

- Paleta y tipografía centralizadas en `theme.ts` — alto contraste,
  texto grande, pensado para que la usuaria principal (adulta mayor)
  pueda usarlo sin dificultad.
- El color comunica estado, no decora: naranja = atrasado/pendiente,
  verde = hecho, rojo = acción destructiva o alerta.
- `types.ts` tipa `RootStackParamList`, así que
  `navigation.navigate('MedicationDetail', { id })` tiene autocompletado
  y TypeScript marca error si falta el `id`.

---

## Compilar para instalarlo en un teléfono

Expo Go sirve para desarrollar, pero muestra **su propio icono**: para ver el
de la app hace falta compilar un APK.

```bash
eas login

# Las credenciales NO viajan solas: .env.local esta gitignorado y EAS sube el
# proyecto segun git, asi que sin esto se compila una app que no sincroniza.
eas env:create --scope project --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://TU-PROYECTO.supabase.co" \
  --environment preview --environment production \
  --visibility plaintext --non-interactive

eas env:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "TU_CLAVE_ANON" \
  --environment preview --environment production \
  --visibility plaintext --non-interactive

eas build --platform android --profile preview
```

Al terminar, EAS da una URL: ábrela desde el navegador del teléfono, descarga
el APK e instálalo.

### Por qué la configuración es como es

Estas notas van aquí y no dentro de los archivos porque **JSON no admite
comentarios**, y tanto el esquema de EAS como el de Vercel rechazan cualquier
propiedad que no reconozcan: una clave inventada invalida el archivo entero.

- **`buildType: apk`** en el perfil `preview`. El formato por defecto es AAB,
  que solo sirve para subir a Google Play y no se puede instalar tocándolo.
- **`android.package`** es obligatorio para compilar. Se usa el dominio al
  revés, que es la convención.
- **Fondo verde** en el splash y en el icono adaptativo. Ambas imágenes traen
  su propio fondo verde; con un fondo claro se vería un cuadrado flotando, y
  el margen que deja Android al recortar enmarcaría el icono en otro color.
- **`visibility: plaintext`** en las variables. Las que empiezan por
  `EXPO_PUBLIC_` se incrustan en el paquete de la app, así que declararlas
  como secretas sugeriría una protección que no existe.
