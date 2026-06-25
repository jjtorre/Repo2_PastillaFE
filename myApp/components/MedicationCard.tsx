// components/MedicationCard.tsx
// Tarjeta usada en la lista principal de medicamentos (Épica 1, historia 6).
// El círculo a la derecha indica si la dosis ya fue marcada como tomada.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import type { Medication } from '../types';

interface MedicationCardProps {
  medication: Medication;
  onPress: () => void;
  onToggleTaken: () => void;
}

export default function MedicationCard({ medication, onPress, onToggleTaken }: MedicationCardProps) {
  const { name, time, status } = medication;

  const barColor = status === 'late' ? colors.warning : colors.primary;
  const timeColor = status === 'late' ? colors.warning : colors.textSecondary;
  const timeLabel =
    status === 'late' ? `${time} · atrasado` : status === 'taken' ? `${time} · tomado` : time;

  return (
    <Pressable
      onPress={onPress}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${timeLabel}`}
    >
      <View style={[styles.bar, { backgroundColor: barColor }]} />
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={[styles.time, { color: timeColor }]}>{timeLabel}</Text>
      </View>
      <Pressable
        onPress={onToggleTaken}
        style={[
          styles.checkCircle,
          status === 'taken'
            ? { backgroundColor: colors.primary, borderColor: colors.primary }
            : { borderColor: status === 'late' ? colors.warning : colors.inputBorder },
        ]}
        accessibilityRole="button"
        accessibilityLabel={status === 'taken' ? 'Marcado como tomado' : 'Marcar como tomado'}
      >
        {status === 'taken' && <Text style={styles.checkMark}>✓</Text>}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
    gap: spacing.md,
  },
  bar: {
    width: 6,
    height: 44,
    borderRadius: 3,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: fontSize.bodyLg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  time: {
    fontSize: fontSize.body,
    fontWeight: '500',
  },
  checkCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: colors.primaryText,
    fontSize: 16,
    fontWeight: '700',
  },
});
