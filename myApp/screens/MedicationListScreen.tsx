// screens/MedicationListScreen.tsx
// Épica 1, historia 6: ver el listado de medicamentos.
// Historia 11: marcar como tomado.

import React, { useState, useCallback } from 'react';
import { Text, FlatList, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import MedicationCard from '../components/MedicationCard';
import { getMedications, updateMedication, computeStatus } from '../storage';
import { colors, spacing, radius, fontSize } from '../theme';
import type { Medication, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'MedicationList'>;

export default function MedicationListScreen({ navigation }: Props) {
  const [medications, setMedications] = useState<Medication[]>([]);

  const loadMedications = useCallback(async () => {
    const stored = await getMedications();
    setMedications(stored.map((med) => ({ ...med, status: computeStatus(med) })));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMedications();
    }, [loadMedications])
  );

  const toggleTaken = async (id: string) => {
    const target = medications.find((med) => med.id === id);
    if (!target) return;

    const willBeTaken = target.status !== 'taken';
    await updateMedication(id, {
      status: willBeTaken ? 'taken' : 'pending',
      lastTakenAt: willBeTaken ? new Date().toISOString() : null,
      quantity: willBeTaken
        ? Math.max(0, (target.quantity || 0) - 1)
        : (target.quantity || 0) + 1,
    });
    loadMedications();
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScreenHeader
        eyebrow="Hola"
        title="Mis medicamentos"
        rightAction={
          <Pressable
            onPress={() => navigation.navigate('CaregiverView')}
            accessibilityRole="button"
            accessibilityLabel="Vista de cuidador"
            hitSlop={8}
          >
            <Text style={styles.caregiverLink}>Cuidador</Text>
          </Pressable>
        }
      />

      <FlatList
        data={medications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <MedicationCard
            medication={item}
            onPress={() => navigation.navigate('MedicationDetail', { id: item.id })}
            onToggleTaken={() => toggleTaken(item.id)}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Todavía no agregas medicamentos. Toca "Agregar medicamento" para empezar.
          </Text>
        }
      />

      <Pressable
        style={styles.addButton}
        onPress={() => navigation.navigate('AddMedication')}
        accessibilityRole="button"
      >
        <Text style={styles.addButtonText}>+  Agregar medicamento</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: 0,
  },
  emptyText: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  caregiverLink: {
    color: colors.headerText,
    fontSize: fontSize.caption,
    fontWeight: '600',
    opacity: 0.85,
    textDecorationLine: 'underline',
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.primaryText,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
});
