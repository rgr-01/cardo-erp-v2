import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';

export default function AppLayout() {
  const { usuario } = useAuth();
  const theme = useTheme();

  if (!usuario) return <Redirect href="/(auth)/login" />;

  return (
    <Stack screenOptions={{ headerShown: false, headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text, headerTitleStyle: { fontWeight: '700' }, headerShadowVisible: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="visitas" options={{ headerShown: true, title: 'Visitas' }} />
      <Stack.Screen name="visita/[id]" options={{ headerShown: true, title: 'Visita' }} />
      <Stack.Screen name="editar-visita/[id]" options={{ headerShown: true, title: 'Editar relatório' }} />
      <Stack.Screen name="despesas" options={{ headerShown: true, title: 'Despesas' }} />
      <Stack.Screen name="despesa/[id]" options={{ headerShown: true, title: 'Despesa' }} />
      <Stack.Screen name="pedidos" options={{ headerShown: true, title: 'Pedidos e propostas' }} />
      <Stack.Screen name="pedido/[id]" options={{ headerShown: true, title: 'Pedido' }} />
      <Stack.Screen name="editar-pedido/[id]" options={{ headerShown: true, title: 'Editar' }} />
      <Stack.Screen name="clientes" options={{ headerShown: true, title: 'Clientes' }} />
      <Stack.Screen name="cliente/[id]" options={{ headerShown: true, title: 'Cliente' }} />
      <Stack.Screen name="editar-cliente/[id]" options={{ headerShown: true, title: 'Editar cliente' }} />
      <Stack.Screen name="nova-visita" options={{ presentation: 'modal', headerShown: true, title: 'Nova visita' }} />
      <Stack.Screen name="nova-despesa" options={{ presentation: 'modal', headerShown: true, title: 'Nova despesa' }} />
      <Stack.Screen name="novo-pedido" options={{ presentation: 'modal', headerShown: true, title: 'Novo pedido' }} />
    </Stack>
  );
}
