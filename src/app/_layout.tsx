import { AppProviders } from '@core/providers/AppProviders';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F5F7FB' },
          animation: 'none',
        }}
      />
    </AppProviders>
  );
}
