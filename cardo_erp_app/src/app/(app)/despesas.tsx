import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { PendentesLocais } from '@/components/lista-registros';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AvisoDados, BarraBusca, Botao, Carregando, Vazio, estilosTela } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useServidor } from '@/hooks/use-servidor';
import { useTheme } from '@/hooks/use-theme';
import { brl, dataBR, normalizar, rotuloCategoria } from '@/lib/formato';
import { chaves, servidor, type DespesaServidor } from '@/lib/servidor';

export default function DespesasScreen() {
  const router = useRouter();
  const theme = useTheme();
  const lista = useServidor(chaves.despesas, servidor.despesas);
  const [busca, setBusca] = useState('');

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return (lista.dados ?? []).filter(
      (d) =>
        !termo ||
        normalizar(
          `${rotuloCategoria(d.categoria)} ${d.estabelecimento ?? ''} ${d.descricao ?? ''} ${d.cliente?.nome ?? ''} ${d.consultorNome}`
        ).includes(termo)
    );
  }, [lista.dados, busca]);

  const total = visiveis.reduce((soma, d) => soma + d.valor, 0);

  if (lista.carregando && !lista.dados) return <Carregando />;

  return (
    <ThemedView style={estilosTela.container}>
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <FlatList
          data={visiveis}
          keyExtractor={(d) => d.id}
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
              <Botao titulo="+ Nova despesa" onPress={() => router.push('/(app)/nova-despesa')} />
              <AvisoDados {...lista} onTentar={lista.recarregar} />
              <PendentesLocais tipo="despesa" rotaNovo="/(app)/nova-despesa" aoMudar={lista.recarregar} />
              <BarraBusca valor={busca} onChange={setBusca} placeholder="Buscar categoria, local, cliente…" />
              {visiveis.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {visiveis.length} despesa(s) · total {brl(total)}
                </ThemedText>
              ) : null}
            </ThemedView>
          }
          ListEmptyComponent={
            <Vazio texto={busca ? 'Nenhuma despesa encontrada.' : 'Nenhuma despesa registrada ainda.'} />
          }
          renderItem={({ item }) => (
            <LinhaDespesa item={item} onPress={() => router.push(`/(app)/despesa/${item.id}`)} />
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function LinhaDespesa({ item, onPress }: { item: DespesaServidor; onPress: () => void }) {
  const theme = useTheme();
  const foto = item.fotos[0]?.url;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        estilosTela.linha,
        {
          backgroundColor: theme.backgroundElement,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.three,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {foto ? (
        <Image source={{ uri: foto }} style={{ width: 52, height: 52, borderRadius: Radius.sm }} contentFit="cover" />
      ) : null}
      <ThemedView style={[estilosTela.transparente, { flex: 1, gap: 2 }]}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {rotuloCategoria(item.categoria)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {item.estabelecimento || item.descricao || 'Sem estabelecimento'}
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
          {dataBR(item.data)}
          {item.cliente ? ` · ${item.cliente.nome}` : ''} · {item.consultorNome}
        </ThemedText>
      </ThemedView>
      <ThemedText type="smallBold">{brl(item.valor)}</ThemedText>
    </Pressable>
  );
}
