import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth-context';

export default function AuthLayout() {
  const { usuario } = useAuth();

  if (usuario) return <Redirect href="/(app)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
