// App.tsx
// Este archivo REEMPLAZA al App.tsx que genera "create-expo-app --template
// blank-typescript" (el que solo muestra "Open up App.tsx...").
//
// Navegación raíz con 5 rutas, pero solo 4 archivos de pantalla:
// "EditMedication" NO es un archivo nuevo, reutiliza AddMedicationScreen.tsx.
// RootStackParamList (en types.ts) tipa cada ruta y sus parámetros.

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { startBackgroundSync } from './lib/sync';

import MedicationListScreen from './screens/MedicationListScreen';
import AddMedicationScreen from './screens/AddMedicationScreen';
import MedicationDetailScreen from './screens/MedicationDetailScreen';
import CaregiverViewScreen from './screens/CaregiverViewScreen';
import InviteCaregiverScreen from './screens/InviteCaregiverScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  // Sincroniza al arrancar, al recuperar red y al volver del segundo plano.
  // Nada de la UI espera a esto: si no hay internet, la app funciona igual.
  useEffect(() => startBackgroundSync(), []);

  return (
    // SafeAreaProvider mide las barras del sistema y publica sus medidas por
    // contexto. Sin él, useSafeAreaInsets() devuelve ceros y todo el contenido
    // queda por debajo del reloj y de los botones de Android.
    <SafeAreaProvider>
      {/* El encabezado es verde oscuro, así que los iconos del sistema deben
          ser claros. Por defecto son oscuros y quedaban ilegibles encima. */}
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="MedicationList"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="MedicationList" component={MedicationListScreen} />
          <Stack.Screen name="AddMedication" component={AddMedicationScreen} />
          <Stack.Screen name="MedicationDetail" component={MedicationDetailScreen} />
          <Stack.Screen name="EditMedication" component={AddMedicationScreen} />
          <Stack.Screen name="CaregiverView" component={CaregiverViewScreen} />
          <Stack.Screen name="InviteCaregiver" component={InviteCaregiverScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
