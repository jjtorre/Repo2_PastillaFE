// screens/InviteCaregiverScreen.tsx
// El paciente genera aquí el código con el que su cuidador entrará a la web.
//
// Es el eslabón que une las dos mitades del sistema: sin este código, el
// cuidador no pertenece a ningún hogar y el RLS no le deja ver absolutamente
// nada. Por eso la pantalla insiste en fallar de forma visible y explicada,
// en vez de quedarse en blanco.

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import { createInviteCode, type InviteResult } from '../lib/session';
import { colors, spacing, radius, fontSize } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'InviteCaregiver'>;

// Mensajes por motivo de fallo. Cada uno dice qué hacer, no solo qué pasó:
// "algo salió mal" no ayuda a nadie a resolverlo.
const ERROR_MESSAGES: Record<
  Extract<InviteResult, { ok: false }>['reason'],
  string
> = {
  'sin-configurar':
    'La app todavía no está conectada al servidor, así que no se puede invitar a nadie.',
  'sin-red':
    'Necesitas internet para generar el código. Conéctate y vuelve a intentarlo.',
  error:
    'No se pudo generar el código. Revisa tu conexión y vuelve a intentarlo.',
};

export default function InviteCaregiverScreen({ navigation }: Props) {
  const [result, setResult] = useState<InviteResult | null>(null);
  const [loading, setLoading] = useState(false);

  // El código se genera con un toque explícito, no al abrir la pantalla:
  // cada llamada inserta una fila, y entrar a mirar no debería crear
  // invitaciones sueltas.
  const handleGenerate = async () => {
    setLoading(true);
    setResult(await createInviteCode());
    setLoading(false);
  };

  const handleShare = async () => {
    if (!result?.ok) return;
    await Share.share({
      message:
        `Código para ver mis medicamentos: ${result.code}\n\n` +
        `Entra a la página del cuidador y escríbelo. Caduca en 7 días.`,
    });
  };

  const formattedExpiry = result?.ok
    ? new Date(result.expiresAt).toLocaleDateString('es-HN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Cuidador"
        title="Invitar a un cuidador"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.content}>
        <Text style={styles.intro}>
          Comparte este código con la persona que te cuida. Con él podrá ver
          desde su computadora si ya tomaste tus medicamentos.
        </Text>

        {result?.ok && (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>Tu código</Text>
            <Text
              style={styles.code}
              accessibilityLabel={`Código: ${result.code.split('').join(' ')}`}
              selectable
            >
              {result.code}
            </Text>
            {formattedExpiry && (
              <Text style={styles.expiry}>Válido hasta el {formattedExpiry}</Text>
            )}
          </View>
        )}

        {result && !result.ok && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{ERROR_MESSAGES[result.reason]}</Text>
          </View>
        )}

        <View style={styles.spacer} />

        {result?.ok && (
          <Pressable
            style={styles.primaryButton}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Compartir el código"
          >
            <Text style={styles.primaryButtonText}>Compartir código</Text>
          </Pressable>
        )}

        <Pressable
          style={[
            result?.ok ? styles.linkButton : styles.primaryButton,
            loading && styles.buttonDisabled,
          ]}
          onPress={handleGenerate}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={result?.ok ? 'Generar un código nuevo' : 'Generar código'}
        >
          {loading ? (
            <ActivityIndicator color={result?.ok ? colors.textPrimary : colors.primaryText} />
          ) : (
            <Text style={result?.ok ? styles.linkButtonText : styles.primaryButtonText}>
              {result?.ok ? 'Generar uno nuevo' : 'Generar código'}
            </Text>
          )}
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
  intro: {
    fontSize: fontSize.bodyLg,
    color: colors.textPrimary,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  codeCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  code: {
    // Muy por encima de fontSize.titleLg (19) a propósito: este texto se lee
    // en voz alta por teléfono o se copia a mano, así que prima el tamaño.
    fontSize: 40,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 6,
  },
  expiry: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  errorCard: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    fontSize: fontSize.body,
    color: colors.danger,
    lineHeight: 22,
  },
  spacer: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    color: colors.primaryText,
    fontSize: fontSize.title,
    fontWeight: '600',
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
  buttonDisabled: {
    opacity: 0.6,
  },
});
