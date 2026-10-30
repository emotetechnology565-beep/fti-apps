import { useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { Button, Field, Txt } from '@shared/ui';
import { driverPhone } from '../model/driver-details';

export function DriverFields({
  name,
  phone,
  onName,
  onPhone,
}: {
  name: string;
  phone: string;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
}) {
  return (
    <>
      <Field
        label="Driver name (optional)"
        value={name}
        onChangeText={onName}
        placeholder="Driver's full name"
      />
      <Field
        label="Driver phone number (optional)"
        value={phone}
        onChangeText={onPhone}
        placeholder="e.g. +91 98765 43210"
        keyboardType="phone-pad"
      />
      <Txt>
        Driver details will be visible to the customer for delivery
        coordination.
      </Txt>
    </>
  );
}

export function DriverDetails({
  name,
  phone,
}: {
  name?: string | null;
  phone?: string | null;
}) {
  const [error, setError] = useState('');
  if (!name && !phone) return null;
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontWeight: '700' }}>Driver details</Txt>
      {name ? <Txt>Driver: {name}</Txt> : null}
      {phone ? (
        <>
          <Txt selectable>Phone: {phone}</Txt>
          <Button
            secondary
            onPress={() => {
              setError('');
              void Linking.openURL(`tel:${driverPhone(phone)}`).catch(() =>
                setError(
                  'Unable to open the phone app. Please dial the driver’s number manually.',
                ),
              );
            }}
          >
            Call driver
          </Button>
        </>
      ) : null}
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
    </View>
  );
}
