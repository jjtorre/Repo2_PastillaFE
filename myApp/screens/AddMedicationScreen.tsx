// screens/AddMedicationScreen.tsx
// Épica 1, historias 3, 4, 5: agregar medicamento, horario y vencimiento.
// Historia 9: esta misma pantalla sirve para editar (ruta "EditMedication"),
// cuando viene route.params.id precarga los datos existentes.

import React, { useState, useEffect } from 'react';
import {
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import { addMedication, updateMedication, getMedicationById } from '../storage';
import { colors, spacing, radius, fontSize } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AddMedication' | 'EditMedication'>;

function timeStringToDate(timeStr: string): Date {
  const date = new Date();
  if (!timeStr) return date;
  const [hours, minutes] = timeStr.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function dateToTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function AddMedicationScreen({ navigation, route }: Props) {
  const editingId = route.params && 'id' in route.params ? route.params.id : null;
  const isEditing = Boolean(editingId);

  const [name, setName] = useState('');
  const [time, setTime] = useState(new Date());
  const [expirationDate, setExpirationDate] = useState(new Date());
  const [quantity, setQuantity] = useState('');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!isEditing);

  useEffect(() => {
    if (!editingId) return;
    (async () => {
      const existing = await getMedicationById(editingId);
      if (existing) {
        setName(existing.name);
        setTime(timeStringToDate(existing.time));
        setExpirationDate(new Date(existing.expirationDate));
        setQuantity(String(existing.quantity ?? ''));
      }
      setLoaded(true);
    })();
  }, [editingId]);

  const formattedTime = time.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
  const formattedDate = expirationDate.toLocaleDateString('es-HN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Escribe el nombre del medicamento.');
      return;
    }
    if (!quantity.trim() || isNaN(Number(quantity))) {
      setError('Escribe la cantidad disponible en número.');
      return;
    }
    setError('');

    const payload = {
      name: name.trim(),
      time: dateToTimeString(time),
      expirationDate: expirationDate.toISOString(),
      quantity: Number(quantity),
    };

    if (editingId) {
      await updateMedication(editingId, payload);
    } else {
      await addMedication(payload);
    }

    navigation.goBack();
  };

  if (!loaded) return null;

  return (
    <SafeAreaView style={styles.screen}>
      <ScreenHeader
        title={isEditing ? 'Editar receta' : 'Nuevo medicamento'}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.label}>Nombre del medicamento</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Ej. Losartan 50mg"
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel="Nombre del medicamento"
        />

        <Text style={styles.label}>Hora de la dosis</Text>
        <Pressable
          style={styles.input}
          onPress={() => setShowTimePicker(true)}
          accessibilityRole="button"
          accessibilityLabel={`Hora de la dosis, seleccionada ${formattedTime}`}
        >
          <Text style={styles.inputValue}>{formattedTime}</Text>
        </Pressable>
        {showTimePicker && (
          <DateTimePicker
            value={time}
            mode="time"
            is24Hour={false}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event: DateTimePickerEvent, selected?: Date) => {
              setShowTimePicker(Platform.OS === 'ios');
              if (selected) setTime(selected);
            }}
          />
        )}

        <Text style={styles.label}>Vencimiento de la receta</Text>
        <Pressable
          style={styles.input}
          onPress={() => setShowDatePicker(true)}
          accessibilityRole="button"
          accessibilityLabel={`Fecha de vencimiento, seleccionada ${formattedDate}`}
        >
          <Text style={styles.inputValue}>{formattedDate}</Text>
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={expirationDate}
            mode="date"
            minimumDate={new Date()}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event: DateTimePickerEvent, selected?: Date) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (selected) setExpirationDate(selected);
            }}
          />
        )}

        <Text style={styles.label}>Cantidad disponible</Text>
        <TextInput
          style={styles.input}
          value={quantity}
          onChangeText={setQuantity}
          placeholder="Ej. 30"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          accessibilityLabel="Cantidad disponible de pastillas"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.saveButton} onPress={handleSave} accessibilityRole="button">
          <Text style={styles.saveButtonText}>
            {isEditing ? 'Guardar cambios' : 'Guardar medicamento'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  form: {
    padding: spacing.lg,
  },
  label: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    minHeight: 48,
    justifyContent: 'center',
  },
  inputValue: {
    fontSize: fontSize.bodyLg,
    color: colors.textPrimary,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.body,
    marginTop: spacing.md,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  saveButtonText: {
    color: colors.primaryText,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
});
