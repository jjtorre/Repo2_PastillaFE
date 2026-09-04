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
import { startBackgroundSync } from './lib/sync';

import MedicationListScreen from './screens/MedicationListScreen';
import AddMedicationScreen from './screens/AddMedicationScreen';
import MedicationDetailScreen from './screens/MedicationDetailScreen';
import CaregiverViewScreen from './screens/CaregiverViewScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  // Sincroniza al arrancar, al recuperar red y al volver del segundo plano.
  // Nada de la UI espera a esto: si no hay internet, la app funciona igual.
  useEffect(() => startBackgroundSync(), []);

  return (
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
