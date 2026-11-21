import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Botao, Campo, Carregando, Chips, Secao, Vazio, estilosTela } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClientes } from '@/lib/api';
import { nomeArquivoDeUri } from '@/lib/arquivo';
import { dataBR, isoDeDataBR, mensagemErro } from '@/lib/formato';
import {
  chaves,
  gravarCache,
  larguraDoBloco,
  servidor,
  type Bloco,
  type RelatorioDetalhe,
} from '@/lib/servidor';

const novoId = () => `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function EditarVisitaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();

  // O editor parte sempre da versão atual do servidor (nunca da cópia
  // salva): editar em cima de dado velho sobrescreveria o que mudou no site.
  const [original, setOriginal] = useState<RelatorioDetalhe | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState('');
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [fazendaId, setFazendaId] = useState('');
  const [fazendas, setFazendas] = useState<{ id: string; nome: string }[]>([]);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function aplicar(r: RelatorioDetalhe) {
    setOriginal(r);
    setTitulo(r.titulo ?? '');
    setData(dataBR(r.dataVisita));
    setBlocos(r.blocos);
    setFazendaId(r.fazenda?.id ?? '');
    // Fazendas do cliente pra escolha (lista guardada, funciona sem sinal).
    apiClientes()
      .then((lista) => setFazendas(lista.find((c) => c.id === r.cliente.id)?.fazendas ?? []))
      .catch(() => {});
  }

  function falhar(e: unknown) {
    setErroCarga(mensagemErro(e, 'Não foi possível abrir o relatório.'));
  }

  function carregar() {
    setErroCarga(null);
    servidor.relatorio(id).then(aplicar, falhar);
  }

  useEffect(() => {
    servidor.relatorio(id).then(aplicar, falhar);
  }, [id]);

  function mudar(idBloco: string, parcial: Partial<Bloco>) {
    setBlocos((atuais) =>
      atuais.map((b) => (b.id === idBloco ? ({ ...b, ...parcial } as Bloco) : b))
    );
  }

  function remover(idBloco: string) {
    setBlocos((atuais) => atuais.filter((b) => b.id !== idBloco));
  }

  // Troca o bloco de lugar com o vizinho: é nessa ordem que o site e o PDF
  // montam o relatório.
  function mover(idBloco: string, direcao: -1 | 1) {
    setBlocos((atuais) => {
      const i = atuais.findIndex((b) => b.id === idBloco);
      const alvo = i + direcao;
      if (i === -1 || alvo < 0 || alvo >= atuais.length) return atuais;
      const copia = [...atuais];
      [copia[i], copia[alvo]] = [copia[alvo], copia[i]];
      return copia;
    });
  }

  function alternarLargura(bloco: Extract<Bloco, { tipo: 'foto' | 'grafico' }>) {
    mudar(bloco.id, { largura: larguraDoBloco(bloco) === 'inteira' ? 'metade' : 'inteira' });
  }

  function adicionarTexto(secao?: 'sintese' | 'observacoes' | 'analise' | 'encaminhamentos') {
    setBlocos((atuais) => [...atuais, { id: novoId(), tipo: 'texto', texto: '', secao }]);
  }

  // Página nova em branco no fim: no PDF, tudo daqui pra baixo começa numa
  // página nova. O texto dela é opcional.
  function adicionarNovaPagina() {
    setBlocos((atuais) => [...atuais, { id: novoId(), tipo: 'texto', texto: '', novaPagina: true }]);
  }

  function tirarNovaPagina(bloco: Bloco) {
    if (bloco.tipo === 'texto' && !bloco.texto.trim()) remover(bloco.id);
    else mudar(bloco.id, { novaPagina: false });
  }

  // Pede a imagem (câmera/galeria) e sobe pro relatório.
  async function enviarImagem(origem: 'camera' | 'galeria') {
    const permissao =
      origem === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) return null;

    const resultado =
      origem === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (resultado.canceled) return null;

    const asset = resultado.assets[0];
    return servidor.enviarFotoRelatorio(id, {
      uri: asset.uri,
      nome: nomeArquivoDeUri(asset.uri, 'foto'),
      tipo: 'image/jpeg',
    });
  }

  async function adicionarFoto(origem: 'camera' | 'galeria') {
    setEnviandoFoto(true);
    try {
      const enviado = await enviarImagem(origem);
      if (!enviado) return;
      setBlocos((atuais) => [
        ...atuais,
        { id: novoId(), tipo: 'foto', url: enviado.url, path: enviado.path, legenda: null },
      ]);
    } catch (e) {
      Alert.alert('Não foi possível enviar a foto', mensagemErro(e));
    } finally {
      setEnviandoFoto(false);
    }
  }

  // Troca a imagem de uma foto mantendo legenda, lugar e tamanho.
  function trocarFoto(idBloco: string) {
    const executar = async (origem: 'camera' | 'galeria') => {
      setEnviandoFoto(true);
      try {
        const enviado = await enviarImagem(origem);
        if (enviado) mudar(idBloco, { url: enviado.url, path: enviado.path });
      } catch (e) {
        Alert.alert('Não foi possível enviar a foto', mensagemErro(e));
      } finally {
        setEnviandoFoto(false);
      }
    };
    Alert.alert('Trocar foto', undefined, [
      { text: 'Câmera', onPress: () => executar('camera') },
      { text: 'Galeria', onPress: () => executar('galeria') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function salvar() {
    const dataIso = data.trim() ? isoDeDataBR(data) : null;
    if (data.trim() && !dataIso) {
      Alert.alert('Data inválida', 'Use o formato dd/mm/aaaa.');
      return;
    }
    setSalvando(true);
    try {
      // Data igual à original: mantém o horário que já estava gravado.
      const dataVisita =
        original && dataBR(original.dataVisita) === data.trim() ? original.dataVisita : dataIso;
      const atualizado = await servidor.atualizarRelatorio(id, {
        titulo: titulo.trim() || null,
        dataVisita,
        fazendaId: fazendaId || null,
        conteudo: blocos,
      });
      await gravarCache(chaves.relatorio(id), atualizado);
      router.back();
    } catch (e) {
      Alert.alert('Não foi possível salvar', mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (erroCarga) {
    return (
      <ThemedView style={[estilosTela.container, { padding: Spacing.three, gap: Spacing.three }]}>
        <Vazio texto={`${erroCarga}\n\nPara editar é preciso estar online.`} />
        <Botao titulo="Tentar de novo" onPress={carregar} />
      </ThemedView>
    );
  }
  if (!original) return <Carregando />;

  return (
    <ThemedView style={estilosTela.container}>
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={estilosTela.scroll} keyboardShouldPersistTaps="handled">
          <ThemedText type="small" themeColor="textSecondary">
            {original.cliente.nome}
          </ThemedText>
          <Campo rotulo="Título" value={titulo} onChangeText={setTitulo} placeholder={original.cliente.nome} />
          <Campo
            rotulo="Data da visita"
            value={data}
            onChangeText={setData}
            placeholder="dd/mm/aaaa"
            keyboardType="numbers-and-punctuation"
          />
          {fazendas.length > 0 ? (
            <ThemedView style={{ gap: Spacing.one }}>
              <ThemedText type="small" themeColor="textSecondary">
                Fazenda
              </ThemedText>
              <Chips
                opcoes={[
                  { valor: '', label: 'Sem fazenda' },
                  ...fazendas.map((f) => ({ valor: f.id, label: f.nome })),
                ]}
                valor={fazendaId}
                onChange={setFazendaId}
              />
            </ThemedView>
          ) : null}

          <ThemedText type="small" themeColor="textMuted">
            Use ↑ ↓ pra mudar a ordem dos blocos: o site e o PDF seguem essa ordem.
          </ThemedText>

          {blocos.map((bloco, indice) => {
            const barra = (
              <BarraBloco
                primeiro={indice === 0}
                ultimo={indice === blocos.length - 1}
                onMover={(direcao) => mover(bloco.id, direcao)}
                onRemover={() => remover(bloco.id)}
                largura={bloco.tipo === 'texto' ? undefined : larguraDoBloco(bloco)}
                onLargura={bloco.tipo === 'texto' ? undefined : () => alternarLargura(bloco)}
                onTrocar={bloco.tipo === 'foto' ? () => trocarFoto(bloco.id) : undefined}
              />
            );
            const separador = bloco.novaPagina ? (
              <SeparadorPagina onRemover={() => tirarNovaPagina(bloco)} />
            ) : null;
            if (bloco.tipo === 'texto') {
              return (
                <ThemedView key={bloco.id} style={{ gap: Spacing.one }}>
                  {separador}
                  {original.tipo === 'TECNICO' && !bloco.novaPagina ? (
                    <Chips
                      opcoes={[
                        { valor: 'sintese', label: 'Síntese' },
                        { valor: 'observacoes', label: 'Observações' },
                        { valor: 'analise', label: 'Análise' },
                        { valor: 'encaminhamentos', label: 'Encaminhamentos' },
                      ]}
                      valor={bloco.secao ?? 'sintese'}
                      onChange={(secao) => mudar(bloco.id, { secao: secao as typeof bloco.secao })}
                    />
                  ) : null}
                  {bloco.secao === 'observacoes' ? (
                    <Campo rotulo="Área, talhão ou experimento" value={bloco.titulo ?? ''}
                      onChangeText={(titulo) => mudar(bloco.id, { titulo })} />
                  ) : null}
                  <Campo
                    rotulo={bloco.titulo || 'Texto'}
                    value={bloco.texto}
                    onChangeText={(texto) => mudar(bloco.id, { texto })}
                    multiline
                    placeholder={
                      bloco.novaPagina
                        ? 'Texto da página nova (opcional) — fotos adicionadas depois entram nela'
                        : 'Escreva o relato…'
                    }
                  />
                  {barra}
                </ThemedView>
              );
            }
            if (bloco.tipo === 'foto') {
              return (
                <ThemedView key={bloco.id} style={{ gap: Spacing.one }}>
                  {separador}
                  <ThemedView
                    style={{
                      borderRadius: Radius.md,
                      overflow: 'hidden',
                      backgroundColor: theme.backgroundElement,
                    }}
                  >
                    <Image
                      source={{ uri: bloco.url }}
                      style={{ width: '100%', height: Math.round((width - Spacing.three * 2) * 0.6) }}
                      contentFit="cover"
                    />
                    <ThemedView style={[estilosTela.transparente, { padding: Spacing.three, gap: Spacing.two }]}>
                      <Campo
                        rotulo="Legenda"
                        value={bloco.legenda ?? ''}
                        onChangeText={(legenda) => mudar(bloco.id, { legenda: legenda || null })}
                        placeholder="Ex.: lavoura em V4, talhão 3"
                        style={{ backgroundColor: theme.background }}
                      />
                      {barra}
                    </ThemedView>
                  </ThemedView>
                </ThemedView>
              );
            }
            return (
              <ThemedView key={bloco.id} style={{ gap: Spacing.one }}>
                {separador}
                <Secao titulo={bloco.titulo || 'Gráfico'}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Os dados do gráfico são editados pelo site; aqui dá pra mudar a posição e o tamanho.
                  </ThemedText>
                  {barra}
                </Secao>
              </ThemedView>
            );
          })}

          <ThemedView style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Botao titulo="+ Texto" variante="secundario" onPress={() => adicionarTexto()} style={{ flex: 1 }} />
            <Botao
              titulo="+ Câmera"
              variante="secundario"
              onPress={() => adicionarFoto('camera')}
              desabilitado={enviandoFoto}
              style={{ flex: 1 }}
            />
            <Botao
              titulo="+ Galeria"
              variante="secundario"
              onPress={() => adicionarFoto('galeria')}
              desabilitado={enviandoFoto}
              style={{ flex: 1 }}
            />
          </ThemedView>
          <Botao titulo="+ Nova página" variante="secundario" onPress={adicionarNovaPagina} />
          {original.tipo === 'TECNICO' ? (
            <ThemedView style={{ gap: Spacing.one }}>
              <Botao titulo="+ Observação por área" variante="secundario" onPress={() => adicionarTexto('observacoes')} />
              <Botao titulo="+ Análise" variante="secundario" onPress={() => adicionarTexto('analise')} />
              <Botao titulo="+ Encaminhamento" variante="secundario" onPress={() => adicionarTexto('encaminhamentos')} />
            </ThemedView>
          ) : null}
          {enviandoFoto ? (
            <ThemedView style={[estilosTela.linhaMeta, { justifyContent: 'center' }]}>
              <ActivityIndicator color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary">
                Enviando foto…
              </ThemedText>
            </ThemedView>
          ) : null}
        </ScrollView>

        <ThemedView style={{ paddingHorizontal: Spacing.three, paddingBottom: Spacing.two }}>
          <Botao
            titulo="Salvar alterações"
            onPress={salvar}
            carregando={salvando}
            desabilitado={enviandoFoto}
          />
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

// Controles de cada bloco: ordem (↑ ↓), largura (foto/gráfico), trocar a
// imagem (foto) e remover.
function BarraBloco({
  primeiro,
  ultimo,
  onMover,
  onRemover,
  largura,
  onLargura,
  onTrocar,
}: {
  primeiro: boolean;
  ultimo: boolean;
  onMover: (direcao: -1 | 1) => void;
  onRemover: () => void;
  largura?: 'metade' | 'inteira';
  onLargura?: () => void;
  onTrocar?: () => void;
}) {
  return (
    <ThemedView style={[estilosTela.linhaMeta, estilosTela.transparente, { justifyContent: 'flex-end' }]}>

      <AcaoBloco texto="↑" onPress={() => onMover(-1)} desabilitado={primeiro} />
      <AcaoBloco texto="↓" onPress={() => onMover(1)} desabilitado={ultimo} />
      {onLargura ? (
        <AcaoBloco texto={largura === 'inteira' ? 'Largura inteira' : 'Meia largura'} onPress={onLargura} />
      ) : null}
      {onTrocar ? <AcaoBloco texto="Trocar foto" onPress={onTrocar} /> : null}
      <AcaoBloco texto="Remover" onPress={onRemover} perigo />
    </ThemedView>
  );
}

// Separador da página nova: no PDF, daqui pra baixo começa numa página nova.
function SeparadorPagina({ onRemover }: { onRemover: () => void }) {
  const theme = useTheme();
  return (
    <ThemedView style={[estilosTela.linhaMeta, estilosTela.transparente, { marginTop: Spacing.two }]}>
      <ThemedView style={{ flex: 1, borderTopWidth: 2, borderStyle: 'dashed', borderColor: theme.accent }} />
      <ThemedText type="smallBold" themeColor="accent">
        NOVA PÁGINA
      </ThemedText>
      <ThemedView style={{ flex: 1, borderTopWidth: 2, borderStyle: 'dashed', borderColor: theme.accent }} />
      <AcaoBloco texto="Remover página" onPress={onRemover} perigo />
    </ThemedView>
  );
}

function AcaoBloco({
  texto,
  onPress,
  desabilitado,
  perigo,
}: {
  texto: string;
  onPress: () => void;
  desabilitado?: boolean;
  perigo?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      hitSlop={6}
      style={{
        borderRadius: Radius.sm,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        backgroundColor: theme.backgroundSelected,
        opacity: desabilitado ? 0.35 : 1,
      }}
    >
      <ThemedText type="small" themeColor={perigo ? 'danger' : 'text'}>
        {texto}
      </ThemedText>
    </Pressable>
  );
}
