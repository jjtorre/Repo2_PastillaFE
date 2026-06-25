// components/ScreenHeader.tsx
// Encabezado oscuro reutilizable. Si se pasa onBack, muestra flecha de regreso.

import React, { type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '../theme';

interface ScreenHeaderProps {
  title: string;
  eyebrow?: string;
  onBack?: () => void;
  rightAction?: ReactNode;
}

export default function ScreenHeader({ title, eyebrow, onBack, rightAction }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {onBack && (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Regresar" hitSlop={8}>
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
        )}
        <View>
          {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
      {rightAction}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.header,
    paddingHorizontal: spacing.lg + 2,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  backArrow: {
    color: colors.headerText,
    fontSize: 28,
    marginTop: -2,
  },
  eyebrow: {
    color: colors.headerText,
    fontSize: fontSize.caption,
    opacity: 0.7,
    marginBottom: 2,
  },
  title: {
    color: colors.headerText,
    fontSize: fontSize.titleLg,
    fontWeight: '600',
  },
});
