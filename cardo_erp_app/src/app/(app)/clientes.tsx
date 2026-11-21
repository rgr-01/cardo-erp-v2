import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AvisoDados, BarraBusca, Botao, Carregando, Vazio, estilosTela } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useServidor } from '@/hooks/use-servidor';
import { useTheme } from '@/hooks/use-theme';
import { dataBR, normalizar } from '@/lib/formato';
import { chaves, servidor, type ClienteServidor } from '@/lib/servidor';

export default function ClientesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const lista = useServidor(chaves.clientes, servidor.clientes);
  const [busca, setBusca] = useState('');

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return (lista.dados ?? []).filter(
      (c) =>
        !termo ||
        normalizar(
          `${c.nome} ${c.razaoSocial ?? ''} ${c.documento ?? ''} ${c.cidade ?? ''} ${c.consultorNome ?? ''}`
        ).includes(termo)
    );
  }, [lista.dados, busca]);

  if (lista.carregando && !lista.dados) return <Carregando />;

  return (
    <ThemedView style={estilosTela.container}>
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <FlatList
          data={visiveis}
          keyExtractor={(c) => c.id}
          contentContainerStyle={estilosTela.lista}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          refreshControl={
            <RefreshControl
              refreshing={lista.carregando && Boolean(lista.dados)}
              onRefresh={lista.recarregar}
              tintColor={theme.textSecondary}
            />
          }
          ListHeaderComponent={
            <ThemedView style={{ gap: Spacing.two, paddingTop: Spacing.three, paddingBottom: Spacing.two }}>
              <Botao titulo="+ Novo cliente" onPress={() => router.push('/(app)/editar-cliente/novo')} />
              <AvisoDados {...lista} onTentar={lista.recarregar} />
              <BarraBusca valor={busca} onChange={setBusca} placeholder="Buscar nome, CPF/CNPJ, cidade…" />
              {lista.dados ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {visiveis.length} cliente(s)
                </ThemedText>
              ) : null}
            </ThemedView>
          }
          ListEmptyComponent={<Vazio texto="Nenhum cliente encontrado." />}
          renderItem={({ item }) => (
            <LinhaCliente item={item} onPress={() => router.push(`/(app)/cliente/${item.id}`)} />
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function LinhaCliente({ item, onPress }: { item: ClienteServidor; onPress: () => void }) {
  const theme = useTheme();
  const local = [item.cidade, item.uf].filter(Boolean).join('/');
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        estilosTela.linha,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <ThemedText type="smallBold" numberOfLines={1}>
        {item.nome}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {[local, item.consultorNome].filter(Boolean).join(' · ') || 'Sem cidade cadastrada'}
      </ThemedText>
      <ThemedText type="small" themeColor="textMuted">
        {item.ultimaVisita ? `Última visita ${dataBR(item.ultimaVisita)}` : 'Nunca visitado'}
      </ThemedText>
    </Pressable>
  );
}
