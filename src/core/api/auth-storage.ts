import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
// New key intentionally requires reauthentication instead of migrating plaintext tokens.
export const authStorage =
  Platform.OS === 'web'
    ? undefined
    : {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) =>
          SecureStore.setItemAsync(key, value, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          }),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      };
