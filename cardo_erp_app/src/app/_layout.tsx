import { useCallback, useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, useColorScheme, View } from 'react-native';

import NetInfo from '@react-native-community/netinfo';

import { Abertura } from '@/components/abertura';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { sincronizarTranscricoes } from '@/lib/notas-voz';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { carregando } = useAuth();
  const [abrindo, setAbrindo] = useState(true);
  const terminarAbertura = useCallback(() => setAbrindo(false), []);

  // O envio dos registros é manual (botão "Sincronizar"), mas as transcrições
  // pendentes rodam sozinhas assim que houver rede — o usuário não precisa
  // saber que elas existem.
  useEffect(() => {
    sincronizarTranscricoes().catch(() => {});
    return NetInfo.addEventListener((estado) => {
      if (estado.isConnected) sincronizarTranscricoes().catch(() => {});
    });
  }, []);

  return (
    <View style={styles.raiz}>
      {!carregando && (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      )}
      {/* A abertura cobre a tela enquanto a sessão carrega por baixo. */}
      {abrindo && <Abertura aoTerminar={terminarAbertura} />}
    </View>
  );
}

const styles = StyleSheet.create({ raiz: { flex: 1, backgroundColor: '#0F1F4D' } });

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
