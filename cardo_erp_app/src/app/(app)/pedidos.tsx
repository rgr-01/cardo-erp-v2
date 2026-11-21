import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { PendentesLocais } from '@/components/lista-registros';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AvisoDados, BarraBusca, Botao, Carregando, Chips, Selo, Vazio, estilosTela } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useServidor } from '@/hooks/use-servidor';
import { useTheme } from '@/hooks/use-theme';
import { brl, dataBR, normalizar, rotuloStatus, tomStatus } from '@/lib/formato';
import { chaves, servidor, type PropostaServidor } from '@/lib/servidor';

type Aba = 'PEDIDO' | 'PROPOSTA';

export default function PedidosScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [aba, setAba] = useState<Aba>('PEDIDO');
  const pedidos = useServidor(chaves.propostas('PEDIDO'), () => servidor.propostas('PEDIDO'));
  const propostas = useServidor(chaves.propostas('PROPOSTA'), () => servidor.propostas('PROPOSTA'));
  const lista = aba === 'PEDIDO' ? pedidos : propostas;
  const [busca, setBusca] = useState('');

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return (lista.dados ?? []).filter(
      (p) =>
        !termo ||
        normalizar(
          `${p.codigo} ${p.cliente.nome} ${p.consultor.nome} ${p.itens.map((i) => i.produtoNome).join(' ')}`
        ).includes(termo)
    );
  }, [lista.dados, busca]);

  function recarregarTudo() {
    pedidos.recarregar();
    propostas.recarregar();
  }

  if (lista.carregando && !lista.dados) return <Carregando />;

  return (
    <ThemedView style={estilosTela.container}>
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <FlatList
          data={visiveis}
          keyExtractor={(p) => p.id}
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
              <Botao titulo="+ Novo pedido" onPress={() => router.push('/(app)/novo-pedido')} />
              <Chips
                opcoes={[
                  { valor: 'PEDIDO', label: `Pedidos${pedidos.dados ? ` (${pedidos.dados.length})` : ''}` },
                  { valor: 'PROPOSTA', label: `Propostas${propostas.dados ? ` (${propostas.dados.length})` : ''}` },
                ]}
                valor={aba}
                onChange={setAba}
              />
              <AvisoDados {...lista} onTentar={lista.recarregar} />
              {aba === 'PEDIDO' ? (
                <PendentesLocais tipo="pedido" rotaNovo="/(app)/novo-pedido" aoMudar={recarregarTudo} />
              ) : null}
              <BarraBusca valor={busca} onChange={setBusca} placeholder="Buscar número, cliente, produto…" />
            </ThemedView>
          }
          ListEmptyComponent={
            <Vazio
              texto={
                busca
                  ? 'Nada encontrado.'
                  : aba === 'PEDIDO'
                    ? 'Nenhum pedido ainda.'
                    : 'Nenhuma proposta ainda. Pedidos aprovados viram propostas.'
              }
            />
          }
          renderItem={({ item }) => (
            <LinhaProposta item={item} onPress={() => router.push(`/(app)/pedido/${item.id}`)} />
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function LinhaProposta({ item, onPress }: { item: PropostaServidor; onPress: () => void }) {
  const theme = useTheme();
  const produtos = item.itens.map((i) => i.produtoNome).join(', ');
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        estilosTela.linha,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <ThemedView style={[estilosTela.linhaMeta, estilosTela.transparente, { justifyContent: 'space-between' }]}>
        <ThemedText type="smallBold">{item.codigo}</ThemedText>
        <ThemedText type="smallBold">{brl(item.total)}</ThemedText>
      </ThemedView>
      <ThemedText type="small" numberOfLines={1}>
        {item.cliente.nome}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {produtos || 'Sem itens'}
      </ThemedText>
      <ThemedView style={[estilosTela.linhaMeta, estilosTela.transparente]}>
        <Selo texto={rotuloStatus(item.status)} tom={tomStatus(item.status)} />
        <ThemedText type="small" themeColor="textMuted">
          {dataBR(item.atualizadoEm)} · {item.consultor.nome}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}
