// screens/CaregiverViewScreen.tsx
// Historia 7, adaptada: como la app vive en un solo teléfono compartido
// por la familia (sin login ni backend), esta pantalla muestra el mismo
// storage local que MedicationListScreen, destacando lo atrasado primero.

import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import { getMedications, computeStatus } from '../storage';
import { colors, spacing, radius, fontSize } from '../theme';
import type { Medication, MedicationStatus, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CaregiverView'>;

const STATUS_ORDER: Record<MedicationStatus, number> = { late: 0, pending: 1, taken: 2 };

export default function CaregiverViewScreen({ navigation }: Props) {
  const [medications, setMedications] = useState<Medication[]>([]);

  const loadMedications = useCallback(async () => {
    const stored = await getMedications();
    const withStatus = stored.map((med) => ({ ...med, status: computeStatus(med) }));
    withStatus.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    setMedications(withStatus);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMedications();
    }, [loadMedications])
  );

  const lateOnes = medications.filter((m) => m.status === 'late');

  return (
    <SafeAreaView style={styles.screen}>
      <ScreenHeader eyebrow="Vista de cuidador" title="Estado del día" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        {lateOnes.length > 0 && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertText}>
              ⚠ {lateOnes.length === 1
                ? `${lateOnes[0].name} sin marcar`
                : `${lateOnes.length} medicamentos sin marcar`}
            </Text>
          </View>
        )}

        <FlatList
          data={medications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isLate = item.status === 'late';
            const isTaken = item.status === 'taken';
            const detail = isTaken
              ? `Tomado · ${item.time}`
              : isLate
              ? `No tomado · ${item.time}`
              : `Pendiente · ${item.time}`;
            return (
              <View style={styles.row}>
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: isLate ? colors.warningBg : isTaken ? colors.successBg : colors.divider },
                  ]}
                >
                  <Text style={{ color: isLate ? colors.warning : isTaken ? colors.success : colors.textSecondary }}>
                    {isLate ? '!' : isTaken ? '✓' : '·'}
                  </Text>
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text
                    style={[
                      styles.rowDetail,
                      { color: isLate ? colors.warning : isTaken ? colors.success : colors.textSecondary },
                    ]}
                  >
                    {detail}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No hay medicamentos registrados todavía.</Text>
          }
        />

        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.navigate('MedicationList')}
          accessibilityRole="button"
        >
          <Text style={styles.linkButtonText}>Ver lista completa de recetas</Text>
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
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  alertBanner: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  alertText: {
    color: colors.warning,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.md,
    padding: spacing.md - 1,
    marginBottom: spacing.sm + 2,
    gap: spacing.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  rowDetail: {
    fontSize: fontSize.caption,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  linkButton: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  linkButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
});
