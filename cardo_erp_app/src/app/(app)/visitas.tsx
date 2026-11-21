import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { PendentesLocais } from '@/components/lista-registros';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AvisoDados, BarraBusca, Botao, Carregando, Selo, Vazio, estilosTela } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useServidor } from '@/hooks/use-servidor';
import { useTheme } from '@/hooks/use-theme';
import { dataBR, normalizar } from '@/lib/formato';
import { chaves, servidor, type RelatorioResumo } from '@/lib/servidor';

export default function VisitasScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { clienteId, clienteNome } = useLocalSearchParams<{ clienteId?: string; clienteNome?: string }>();
  const lista = useServidor(chaves.relatorios, servidor.relatorios);
  const [busca, setBusca] = useState('');

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return (lista.dados ?? []).filter(
      (r) =>
        (!clienteId || r.clienteId === clienteId) &&
        (!termo ||
          normalizar(
            `${r.clienteNome} ${r.fazendaNome ?? ''} ${r.titulo ?? ''} ${r.resumo} ${r.consultorNome}`
          ).includes(termo))
    );
  }, [lista.dados, busca, clienteId]);

  if (lista.carregando && !lista.dados) return <Carregando />;

  return (
    <ThemedView style={estilosTela.container}>
      {clienteNome ? <Stack.Screen options={{ title: `Visitas · ${clienteNome}` }} /> : null}
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <FlatList
          data={visiveis}
          keyExtractor={(r) => r.id}
          contentContainerStyle={estilosTela.lista}
          refreshControl={
            <RefreshControl
              refreshing={lista.carregando && Boolean(lista.dados)}
              onRefresh={lista.recarregar}
              tintColor={theme.textSecondary}
            />
          }
          ListHeaderComponent={
            <ThemedView style={{ gap: Spacing.two, paddingTop: Spacing.three, paddingBottom: Spacing.two }}>
              <Botao titulo="+ Nova visita" onPress={() => router.push('/(app)/nova-visita')} />
              <AvisoDados {...lista} onTentar={lista.recarregar} />
              <PendentesLocais tipo="visita" rotaNovo="/(app)/nova-visita" aoMudar={lista.recarregar} />
              <BarraBusca valor={busca} onChange={setBusca} placeholder="Buscar cliente, título, relato…" />
            </ThemedView>
          }
          ListEmptyComponent={
            <Vazio texto={busca ? 'Nenhuma visita encontrada.' : 'Nenhuma visita registrada ainda.'} />
          }
          renderItem={({ item }) => (
            <LinhaVisita item={item} onPress={() => router.push(`/(app)/visita/${item.id}`)} />
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function LinhaVisita({ item, onPress }: { item: RelatorioResumo; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        estilosTela.linha,
        {
          backgroundColor: theme.backgroundElement,
          flexDirection: 'row',
          gap: Spacing.three,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {item.capaUrl ? (
        <Image
          source={{ uri: item.capaUrl }}
          style={{ width: 64, height: 64, borderRadius: Radius.sm }}
          contentFit="cover"
        />
      ) : null}
      <ThemedView style={[estilosTela.transparente, { flex: 1, gap: 2 }]}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {item.clienteNome}
          {item.fazendaNome ? ` · ${item.fazendaNome}` : ''}
        </ThemedText>
        {item.titulo && item.titulo !== item.clienteNome ? (
          <ThemedText type="small" numberOfLines={1}>
            {item.titulo}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {item.resumo}
        </ThemedText>
        <ThemedView style={[estilosTela.linhaMeta, estilosTela.transparente]}>
          <ThemedText type="small" themeColor="textMuted">
            {dataBR(item.dataVisita)}
          </ThemedText>
          <Selo
            texto={item.tipo === 'TECNICO' ? 'Técnico' : 'Visita'}
            tom={item.tipo === 'TECNICO' ? 'destaque' : 'neutro'}
          />
          {item.status === 'ABERTA' ? <Selo texto="Em andamento" tom="aviso" /> : null}
          {item.fotos > 0 ? (
            <ThemedText type="small" themeColor="textMuted">
              {item.fotos} foto(s)
            </ThemedText>
          ) : null}
        </ThemedView>
        <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
          {item.consultorNome}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}
