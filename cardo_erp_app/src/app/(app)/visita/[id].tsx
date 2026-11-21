import { Fragment, useState } from 'react';
import { Alert, RefreshControl, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { GraficoRelatorio } from '@/components/grafico-relatorio';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AvisoDados, Botao, Carregando, Info, Secao, Selo, Vazio, estilosTela } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useServidor } from '@/hooks/use-servidor';
import { useTheme } from '@/hooks/use-theme';
import { dataBR, dataHoraBR, mensagemErro, numero } from '@/lib/formato';
import {
  apagarCache,
  chaves,
  compartilharPdf,
  servidor,
  type Bloco,
} from '@/lib/servidor';

export default function VisitaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const rel = useServidor(chaves.relatorio(id), () => servidor.relatorio(id));
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (rel.carregando && !rel.dados) return <Carregando />;
  const r = rel.dados;
  if (!r) return <Vazio texto={rel.erro ?? 'Relatório não encontrado.'} />;

  const tecnico = r.tipo === 'TECNICO';
  const fotoCapa = tecnico ? r.blocos.find((b) => b.tipo === 'foto') : null;
  const rast = r.rastreamento;
  const temRastreio = rast.horaChegada || rast.kmChegada != null || rast.finalidade;

  async function pdf() {
    setGerandoPdf(true);
    try {
      await compartilharPdf(
        `/api/mobile/relatorios-visita/${id}/pdf`,
        `relatorio-${r!.cliente.nome}.pdf`
      );
    } catch (e) {
      Alert.alert('Não foi possível gerar o PDF', mensagemErro(e));
    } finally {
      setGerandoPdf(false);
    }
  }

  function excluir() {
    Alert.alert('Excluir relatório', 'O relatório e as fotos serão removidos também do site.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setExcluindo(true);
          try {
            await servidor.excluirRelatorio(id);
            await apagarCache(chaves.relatorio(id));
            router.back();
          } catch (e) {
            Alert.alert('Não foi possível excluir', mensagemErro(e));
          } finally {
            setExcluindo(false);
          }
        },
      },
    ]);
  }

  return (
    <ThemedView style={estilosTela.container}>
      <Stack.Screen options={{ title: tecnico ? 'Relatório técnico' : 'Visita' }} />
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={estilosTela.scroll}
          refreshControl={
            <RefreshControl
              refreshing={rel.carregando}
              onRefresh={rel.recarregar}
              tintColor={theme.textSecondary}
            />
          }
        >
          <AvisoDados {...rel} onTentar={rel.recarregar} />

          {fotoCapa?.tipo === 'foto' ? (
            <ThemedView style={{ borderRadius: Radius.md, overflow: 'hidden', backgroundColor: theme.backgroundElement }}>
              <ThemedView style={{ padding: Spacing.three, gap: Spacing.one }}>
                <Selo texto="Dossiê técnico" tom="destaque" />
                <ThemedText type="subtitle" style={{ fontSize: 28 }}>{r.titulo || 'Relatório técnico'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {r.cliente.nome}{r.fazenda ? ` · ${r.fazenda.nome}` : ''}
                </ThemedText>
              </ThemedView>
              <Image source={{ uri: fotoCapa.url }} style={{ width: '100%', height: 200 }} contentFit="cover" />
              <ThemedText type="small" style={{ padding: Spacing.three }}>
                {dataBR(r.dataVisita)} · {r.consultorNome} · Safra {r.safra.nome}
              </ThemedText>
            </ThemedView>
          ) : (
          <ThemedView style={{ gap: Spacing.one }}>
            <ThemedView style={estilosTela.linhaMeta}>
              <Selo texto={tecnico ? 'Relatório técnico' : 'Visita de rotina'} tom={tecnico ? 'destaque' : 'neutro'} />
              {r.status === 'ABERTA' ? <Selo texto="Em andamento" tom="aviso" /> : null}
            </ThemedView>
            <ThemedText type="subtitle" style={{ fontSize: 26, lineHeight: 32 }}>
              {r.titulo || r.cliente.nome}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {r.cliente.nome}
              {r.fazenda ? ` · ${r.fazenda.nome}` : ''} · {dataBR(r.dataVisita)} · {r.consultorNome}
            </ThemedText>
          </ThemedView>

          )}

          {temRastreio ? (
            <Secao titulo="Check-in">
              <Info rotulo="Finalidade" valor={rast.finalidade} />
              <Info rotulo="Chegada" valor={rast.horaChegada ? dataHoraBR(rast.horaChegada) : null} />
              <Info rotulo="Saída" valor={rast.horaSaida ? dataHoraBR(rast.horaSaida) : null} />
              <Info
                rotulo="KM"
                valor={
                  rast.kmChegada != null
                    ? `${numero(rast.kmChegada)}${rast.kmSaida != null ? ` → ${numero(rast.kmSaida)}` : ''}`
                    : null
                }
              />
            </Secao>
          ) : null}

          {r.blocos.map((bloco, indice) => {
            const secao = bloco.tipo === 'texto' ? bloco.secao ?? (indice === 0 ? 'sintese' : null) :
              bloco.tipo === 'foto' ? 'fotos' : 'graficos';
            const anterior = r.blocos[indice - 1];
            const secaoAnterior = anterior?.tipo === 'texto' ? anterior.secao ?? (indice === 1 ? 'sintese' : null) :
              anterior?.tipo === 'foto' ? 'fotos' : anterior?.tipo === 'grafico' ? 'graficos' : null;
            const titulos = {
              sintese: tecnico ? 'Síntese da avaliação' : 'Relato da visita',
              observacoes: 'Observações por área', analise: 'Análise e indicadores',
              encaminhamentos: 'Encaminhamentos', fotos: 'Evidências fotográficas',
              graficos: 'Análises e indicadores',
            };
            return (
              <Fragment key={bloco.id}>
                {secao && secao !== secaoAnterior ? (
                  <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                    {titulos[secao]}
                  </ThemedText>
                ) : null}
                <BlocoLeitura bloco={bloco} />
              </Fragment>
            );
          })}

          <ThemedText type="small" themeColor="textMuted">
            Safra {r.safra.nome} · atualizado em {dataHoraBR(r.atualizadoEm)}
          </ThemedText>

          <ThemedView style={estilosTela.acoes}>
            {r.podeEditar ? (
              <Botao titulo="Editar relatório" onPress={() => router.push(`/(app)/editar-visita/${id}`)} />
            ) : null}
            <Botao titulo="Compartilhar PDF" variante="secundario" carregando={gerandoPdf} onPress={pdf} />
            {r.podeEditar ? (
              <Botao titulo="Excluir" variante="perigo" carregando={excluindo} onPress={excluir} />
            ) : null}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function BlocoLeitura({ bloco }: { bloco: Bloco }) {
  const { width } = useWindowDimensions();
  const theme = useTheme();

  if (bloco.tipo === 'texto') {
    if (!bloco.texto.trim()) return null;
    return (
      <ThemedView style={{ gap: Spacing.one }}>
        {bloco.titulo ? (
          <ThemedText type="smallBold" themeColor="textSecondary">
            {bloco.titulo}
          </ThemedText>
        ) : null}
        <ThemedText style={{ fontSize: 16, lineHeight: 24 }}>{bloco.texto}</ThemedText>
      </ThemedView>
    );
  }

  if (bloco.tipo === 'foto') {
    return (
      <ThemedView
        style={{ borderRadius: Radius.md, overflow: 'hidden', backgroundColor: theme.backgroundElement }}
      >
        <Image
          source={{ uri: bloco.url }}
          style={{ width: '100%', height: Math.round((width - Spacing.three * 2) * 0.75) }}
          contentFit="cover"
          transition={150}
        />
        {bloco.legenda ? (
          <ThemedText type="small" themeColor="textSecondary" style={{ padding: Spacing.three }}>
            {bloco.legenda}
          </ThemedText>
        ) : null}
      </ThemedView>
    );
  }

  return <GraficoRelatorio bloco={bloco} />;
}
