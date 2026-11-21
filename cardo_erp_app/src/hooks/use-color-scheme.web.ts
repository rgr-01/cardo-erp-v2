import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const nadaAObservar = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  // false na renderização estática (servidor), true já no cliente.
  const hasHydrated = useSyncExternalStore(
    nadaAObservar,
    () => true,
    () => false
  );

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
