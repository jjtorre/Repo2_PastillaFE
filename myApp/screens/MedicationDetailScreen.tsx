// screens/MedicationDetailScreen.tsx
// Épica 1, historias 8, 9, 11: eliminar, editar y marcar como tomado.

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import { getMedicationById, updateMedication, deleteMedication } from '../storage';
import { colors, spacing, radius, fontSize } from '../theme';
import type { Medication, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'MedicationDetail'>;

interface RowProps {
  label: string;
  value: string;
  last?: boolean;
}

function Row({ label, value, last }: RowProps) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function MedicationDetailScreen({ navigation, route }: Props) {
  const { id } = route.params;
  const [medication, setMedication] = useState<Medication | null>(null);

  const loadMedication = useCallback(async () => {
    const found = await getMedicationById(id);
    setMedication(found);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadMedication();
    }, [loadMedication])
  );

  if (!medication) return null;

  const formattedExpiration = new Date(medication.expirationDate).toLocaleDateString('es-HN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const taken = medication.status === 'taken';

  const handleMarkTaken = async () => {
    await updateMedication(id, {
      status: 'taken',
      lastTakenAt: new Date().toISOString(),
      quantity: Math.max(0, (medication.quantity || 0) - 1),
    });
    loadMedication();
  };

  const handleDelete = () => {
    Alert.alert(
      'Eliminar medicamento',
      `¿Seguro que quieres eliminar ${medication.name}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteMedication(id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScreenHeader
        title={medication.name}
        onBack={() => navigation.goBack()}
        rightAction={
          <Pressable
            onPress={() => navigation.navigate('EditMedication', { id })}
            accessibilityRole="button"
            accessibilityLabel="Editar receta"
            hitSlop={8}
          >
            <Text style={styles.editIcon}>✎</Text>
          </Pressable>
        }
      />

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Row label="Hora" value={medication.time} />
          <Row label="Vence" value={formattedExpiration} />
          <Row label="Inventario" value={`${medication.quantity} pastillas`} last />
        </View>

        <Pressable
          style={[styles.primaryButton, taken && styles.primaryButtonDisabled]}
          onPress={handleMarkTaken}
          disabled={taken}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>
            {taken ? '✓  Marcado como tomado' : 'Marcar como tomado'}
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('EditMedication', { id })}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Editar receta</Text>
        </Pressable>

        <Pressable style={styles.dangerButton} onPress={handleDelete} accessibilityRole="button">
          <Text style={styles.dangerButtonText}>Eliminar medicamento</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  editIcon: {
    color: colors.headerText,
    fontSize: 18,
    opacity: 0.85,
  },
  content: {
    padding: spacing.lg,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLabel: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },
  rowValue: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 1,
    alignItems: 'center',
    marginBottom: spacing.sm + 2,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.primaryText,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 1,
    alignItems: 'center',
    marginBottom: spacing.sm + 2,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  dangerButton: {
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 1,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: colors.danger,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
});
