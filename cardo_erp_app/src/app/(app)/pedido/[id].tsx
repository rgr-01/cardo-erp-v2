import { useState } from 'react';
import { Alert, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AvisoDados, Botao, Carregando, Info, Secao, Selo, Vazio, estilosTela } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useServidor } from '@/hooks/use-servidor';
import { useTheme } from '@/hooks/use-theme';
import {
  STATUS_PROPOSTA,
  brl,
  dataBR,
  dataHoraBR,
  mensagemErro,
  numero,
  rotuloStatus,
  tomStatus,
} from '@/lib/formato';
import { apagarCache, chaves, compartilharPdf, servidor, type PropostaServidor } from '@/lib/servidor';

export default function PedidoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const doc = useServidor(chaves.proposta(id), () => servidor.proposta(id));
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (doc.carregando && !doc.dados) return <Carregando />;
  const p = doc.dados;
  if (!p) return <Vazio texto={doc.erro ?? 'Documento não encontrado.'} />;

  const ehPedido = p.tipo === 'PEDIDO';

  async function executar(chave: string, acao: () => Promise<PropostaServidor>) {
    setOcupado(chave);
    try {
      doc.substituir(await acao());
    } catch (e) {
      Alert.alert('Não foi possível concluir', mensagemErro(e));
    } finally {
      setOcupado(null);
    }
  }

  function mudarStatus() {
    Alert.alert('Mudar status', `Status atual: ${rotuloStatus(p!.status)}`, [
      ...STATUS_PROPOSTA.filter((s) => s.valor !== p!.status).map((s) => ({
        text: s.label,
        onPress: () => executar('status', () => servidor.alterarStatusProposta(id, s.valor)),
      })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }

  function aprovar() {
    Alert.alert('Aprovar pedido', 'O pedido vira uma proposta comercial.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aprovar', onPress: () => executar('aprovar', () => servidor.aprovarPedido(id)) },
    ]);
  }

  async function pdf() {
    setOcupado('pdf');
    try {
      await compartilharPdf(`/api/mobile/pedidos/${id}/pdf`, `${p!.codigo}.pdf`);
    } catch (e) {
      Alert.alert('Não foi possível gerar o PDF', mensagemErro(e));
    } finally {
      setOcupado(null);
    }
  }

  function excluir() {
    Alert.alert(`Excluir ${p!.codigo}`, 'O documento será removido também do site.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setOcupado('excluir');
          try {
            await servidor.excluirProposta(id);
            await apagarCache(chaves.proposta(id));
            router.back();
          } catch (e) {
            Alert.alert('Não foi possível excluir', mensagemErro(e));
            setOcupado(null);
          }
        },
      },
    ]);
  }

  return (
    <ThemedView style={estilosTela.container}>
      <Stack.Screen options={{ title: p.codigo }} />
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={estilosTela.scroll}
          refreshControl={
            <RefreshControl refreshing={doc.carregando} onRefresh={doc.recarregar} tintColor={theme.textSecondary} />
          }
        >
          <AvisoDados {...doc} onTentar={doc.recarregar} />

          <ThemedView style={{ gap: Spacing.one }}>
            <ThemedView style={estilosTela.linhaMeta}>
              <Selo texto={ehPedido ? 'Pedido' : 'Proposta'} tom="destaque" />
              <Selo texto={rotuloStatus(p.status)} tom={tomStatus(p.status)} />
            </ThemedView>
            <ThemedText type="subtitle" style={{ fontSize: 30, lineHeight: 38 }}>
              {brl(p.total)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {p.cliente.nome} · {p.consultor.nome} · safra {p.safra.nome}
            </ThemedText>
          </ThemedView>

          <Secao titulo={`Itens (${p.itens.length})`}>
            {p.itens.map((item, i) => (
              <ThemedView key={item.id ?? i} style={[estilosTela.transparente, { gap: 2 }]}>
                <ThemedView style={[estilosTela.linhaMeta, estilosTela.transparente, { justifyContent: 'space-between' }]}>
                  <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={2}>
                    {item.produtoNome}
                  </ThemedText>
                  <ThemedText type="smallBold">{brl(item.total ?? 0)}</ThemedText>
                </ThemedView>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.fornecedorNome}
                  {item.cultura ? ` · ${item.cultura}` : ''} · {numero(item.volume)} {item.unidade ?? ''} ×{' '}
                  {brl(item.valorUnitario)}
                </ThemedText>
              </ThemedView>
            ))}
            {p.desconto > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Subtotal {brl(p.subtotal)} · desconto {brl(p.desconto)}
              </ThemedText>
            ) : null}
          </Secao>

          <Secao titulo="Condições">
            <Info rotulo="Condição de pagamento" valor={p.condicaoPagamento} />
            <Info rotulo="Validade" valor={p.validade ? dataBR(p.validade) : null} />
            <Info rotulo="Previsão de entrega" valor={p.previsaoEntrega ? dataBR(p.previsaoEntrega) : null} />
            <Info rotulo="Observações" valor={p.observacoes} />
            {!p.condicaoPagamento && !p.validade && !p.previsaoEntrega && !p.observacoes ? (
              <ThemedText type="small" themeColor="textMuted">
                Nenhuma condição informada.
              </ThemedText>
            ) : null}
          </Secao>

          <ThemedText type="small" themeColor="textMuted">
            Atualizado em {dataHoraBR(p.atualizadoEm)}
          </ThemedText>

          <ThemedView style={estilosTela.acoes}>
            {p.podeEditar ? (
              <Botao titulo="Editar" onPress={() => router.push(`/(app)/editar-pedido/${id}`)} />
            ) : null}
            {ehPedido ? (
              <Botao titulo="Aprovar (virar proposta)" variante="secundario" carregando={ocupado === 'aprovar'} onPress={aprovar} />
            ) : null}
            <Botao titulo="Mudar status" variante="secundario" carregando={ocupado === 'status'} onPress={mudarStatus} />
            <Botao titulo="Compartilhar PDF" variante="secundario" carregando={ocupado === 'pdf'} onPress={pdf} />
            {p.podeEditar ? (
              <Botao titulo="Excluir" variante="perigo" carregando={ocupado === 'excluir'} onPress={excluir} />
            ) : null}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}
