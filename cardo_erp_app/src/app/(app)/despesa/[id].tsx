import { useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { SeletorBusca } from '@/components/seletor-busca';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  AvisoDados,
  Botao,
  Campo,
  Carregando,
  Chips,
  Info,
  Secao,
  Selo,
  Vazio,
  estilosTela,
} from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useServidor } from '@/hooks/use-servidor';
import { useTheme } from '@/hooks/use-theme';
import { apiClientes, type CategoriaDespesa } from '@/lib/api';
import { nomeArquivoDeUri } from '@/lib/arquivo';
import {
  CATEGORIAS_DESPESA,
  brl,
  dataBR,
  dataHoraBR,
  isoDeDataBR,
  lerNumero,
  mensagemErro,
  normalizar,
  rotuloCategoria,
  textoNumero,
} from '@/lib/formato';
import { apagarCache, chaves, servidor, type DespesaServidor, type FotoLocal } from '@/lib/servidor';

export default function DespesaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const desp = useServidor(chaves.despesa(id), () => servidor.despesa(id));
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (desp.carregando && !desp.dados) return <Carregando />;
  const d = desp.dados;
  if (!d) return <Vazio texto={desp.erro ?? 'Despesa não encontrada.'} />;

  async function removerFoto(fotoId: string) {
    Alert.alert('Remover foto', 'A foto da nota será apagada também do site.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setOcupado('foto');
          try {
            desp.substituir(await servidor.excluirFotoDespesa(id, fotoId));
          } catch (e) {
            Alert.alert('Não foi possível remover', mensagemErro(e));
          } finally {
            setOcupado(null);
          }
        },
      },
    ]);
  }

  function excluir() {
    Alert.alert('Excluir despesa', 'A despesa e as fotos serão removidas também do site.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setOcupado('excluir');
          try {
            await servidor.excluirDespesa(id);
            await apagarCache(chaves.despesa(id));
            router.back();
          } catch (e) {
            Alert.alert('Não foi possível excluir', mensagemErro(e));
            setOcupado(null);
          }
        },
      },
    ]);
  }

  if (editando) {
    return (
      <FormDespesa
        despesa={d}
        onCancelar={() => setEditando(false)}
        onSalvo={(nova) => {
          desp.substituir(nova);
          setEditando(false);
        }}
      />
    );
  }

  const larguraFoto = width - Spacing.three * 2;

  return (
    <ThemedView style={estilosTela.container}>
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={estilosTela.scroll}
          refreshControl={
            <RefreshControl refreshing={desp.carregando} onRefresh={desp.recarregar} tintColor={theme.textSecondary} />
          }
        >
          <AvisoDados {...desp} onTentar={desp.recarregar} />

          <ThemedView style={{ gap: Spacing.one }}>
            <ThemedView style={estilosTela.linhaMeta}>
              <Selo texto={rotuloCategoria(d.categoria)} tom="destaque" />
              {d.origemOcr ? <Selo texto="Lida pela IA" /> : null}
            </ThemedView>
            <ThemedText type="subtitle" style={{ fontSize: 30, lineHeight: 38 }}>
              {brl(d.valor)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {dataBR(d.data)} · {d.consultorNome}
            </ThemedText>
          </ThemedView>

          <Secao titulo="Detalhes">
            <Info rotulo="Estabelecimento" valor={d.estabelecimento} />
            <Info rotulo="Cliente" valor={d.cliente?.nome} />
            <Info rotulo="Descrição" valor={d.descricao} />
            <Info rotulo="Safra" valor={d.safra.nome} />
          </Secao>

          {d.fotos.map((foto) => (
            <ThemedView
              key={foto.id}
              style={{ borderRadius: Radius.md, overflow: 'hidden', backgroundColor: theme.backgroundElement }}
            >
              <Image
                source={{ uri: foto.url }}
                style={{ width: larguraFoto, height: Math.round(larguraFoto * 1.2) }}
                contentFit="contain"
              />
              {d.podeEditar ? (
                <Pressable onPress={() => removerFoto(foto.id)} style={{ padding: Spacing.three }}>
                  <ThemedText type="small" themeColor="danger">
                    Remover foto
                  </ThemedText>
                </Pressable>
              ) : null}
            </ThemedView>
          ))}

          <ThemedText type="small" themeColor="textMuted">
            Atualizada em {dataHoraBR(d.atualizadoEm)}
          </ThemedText>

          {d.podeEditar ? (
            <ThemedView style={estilosTela.acoes}>
              <Botao titulo="Editar despesa" onPress={() => setEditando(true)} />
              <Botao titulo="Excluir" variante="perigo" carregando={ocupado === 'excluir'} onPress={excluir} />
            </ThemedView>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FormDespesa({
  despesa,
  onCancelar,
  onSalvo,
}: {
  despesa: DespesaServidor;
  onCancelar: () => void;
  onSalvo: (nova: DespesaServidor) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaDespesa>(despesa.categoria);
  const [valor, setValor] = useState(textoNumero(despesa.valor));
  const [data, setData] = useState(dataBR(despesa.data));
  const [estabelecimento, setEstabelecimento] = useState(despesa.estabelecimento ?? '');
  const [descricao, setDescricao] = useState(despesa.descricao ?? '');
  const [clienteId, setClienteId] = useState<string | null>(despesa.cliente?.id ?? null);
  const [buscaCliente, setBuscaCliente] = useState(despesa.cliente?.nome ?? '');
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [fotosNovas, setFotosNovas] = useState<FotoLocal[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    apiClientes().then(setClientes).catch(() => {});
  }, []);

  async function adicionarFoto(origem: 'camera' | 'galeria') {
    const permissao =
      origem === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) return;
    const resultado =
      origem === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (resultado.canceled) return;
    const asset = resultado.assets[0];
    setFotosNovas((atuais) => [
      ...atuais,
      { uri: asset.uri, nome: nomeArquivoDeUri(asset.uri, 'nota'), tipo: 'image/jpeg' },
    ]);
  }

  async function salvar() {
    const valorNumerico = lerNumero(valor);
    if (!valorNumerico || valorNumerico <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return;
    }
    const dataIso = data.trim() ? isoDeDataBR(data) : null;
    if (data.trim() && !dataIso) {
      Alert.alert('Data inválida', 'Use o formato dd/mm/aaaa.');
      return;
    }
    setSalvando(true);
    try {
      const nova = await servidor.atualizarDespesa(
        despesa.id,
        {
          categoria,
          valor: valorNumerico,
          // Data igual à original: mantém o horário que já estava gravado.
          data: dataBR(despesa.data) === data.trim() ? despesa.data : dataIso,
          clienteId,
          estabelecimento: estabelecimento.trim() || null,
          descricao: descricao.trim() || null,
        },
        fotosNovas
      );
      onSalvo(nova);
    } catch (e) {
      Alert.alert('Não foi possível salvar', mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const termo = normalizar(buscaCliente);
  const opcoesCliente = clientes
    .filter((c) => normalizar(c.nome).includes(termo))
    .map((c) => ({ id: c.id, label: c.nome }));

  return (
    <ThemedView style={estilosTela.container}>
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={estilosTela.scroll} keyboardShouldPersistTaps="handled">
          <ThemedText type="small" themeColor="textSecondary">
            Categoria
          </ThemedText>
          <Chips opcoes={CATEGORIAS_DESPESA} valor={categoria} onChange={setCategoria} />
          <Campo rotulo="Valor (R$)" value={valor} onChangeText={setValor} keyboardType="decimal-pad" />
          <Campo
            rotulo="Data"
            value={data}
            onChangeText={setData}
            placeholder="dd/mm/aaaa"
            keyboardType="numbers-and-punctuation"
          />
          <Campo rotulo="Estabelecimento" value={estabelecimento} onChangeText={setEstabelecimento} />
          <ClienteSeletor
            busca={buscaCliente}
            setBusca={(texto) => {
              setBuscaCliente(texto);
              if (!texto) setClienteId(null);
            }}
            opcoes={opcoesCliente}
            selecionadoId={clienteId}
            onSelecionar={(o) => {
              setClienteId(o.id);
              setBuscaCliente(o.label);
            }}
          />
          <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} multiline />

          <ThemedText type="small" themeColor="textSecondary">
            Adicionar foto da nota {fotosNovas.length > 0 ? `(${fotosNovas.length} nova(s))` : ''}
          </ThemedText>
          <ThemedView style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Botao titulo="Câmera" variante="secundario" onPress={() => adicionarFoto('camera')} style={{ flex: 1 }} />
            <Botao titulo="Galeria" variante="secundario" onPress={() => adicionarFoto('galeria')} style={{ flex: 1 }} />
          </ThemedView>
          {fotosNovas.map((f) => (
            <Image key={f.uri} source={{ uri: f.uri }} style={{ width: '100%', height: 160, borderRadius: Radius.sm }} contentFit="cover" />
          ))}
        </ScrollView>
        <ThemedView style={{ paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two }}>
          <Botao titulo="Salvar alterações" onPress={salvar} carregando={salvando} />
          <Botao titulo="Cancelar" variante="secundario" onPress={onCancelar} desabilitado={salvando} />
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ClienteSeletor({
  busca,
  setBusca,
  opcoes,
  selecionadoId,
  onSelecionar,
}: {
  busca: string;
  setBusca: (texto: string) => void;
  opcoes: { id: string; label: string }[];
  selecionadoId: string | null;
  onSelecionar: (o: { id: string; label: string }) => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView style={{ gap: Spacing.one }}>
      <ThemedText type="small" themeColor="textSecondary">
        Cliente (opcional)
      </ThemedText>
      <SeletorBusca
        valor={busca}
        onChangeTexto={setBusca}
        opcoes={opcoes}
        selecionadoId={selecionadoId}
        onSelecionar={onSelecionar}
        placeholder="Buscar cliente…"
        inputStyle={{
          borderRadius: Radius.sm,
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.three,
          fontSize: 16,
          color: theme.text,
          backgroundColor: theme.backgroundElement,
        }}
      />
    </ThemedView>
  );
}
