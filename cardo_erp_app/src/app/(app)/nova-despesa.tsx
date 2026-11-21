import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { SeletorBusca } from '@/components/seletor-busca';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClientes, apiExtrairDespesa, apiSafraAtual, type CategoriaDespesa } from '@/lib/api';
import { nomeArquivoDeUri } from '@/lib/arquivo';
import { buscarRegistro, salvarRegistro } from '@/lib/registros';

type Cliente = { id: string; nome: string };
type FotoEscolhida = { uri: string; nome: string; tipo: string };

const CATEGORIAS: { valor: CategoriaDespesa; label: string }[] = [
  { valor: 'COMBUSTIVEL', label: 'Combustível' },
  { valor: 'ALIMENTACAO', label: 'Alimentação' },
  { valor: 'HOSPEDAGEM', label: 'Hospedagem' },
  { valor: 'MANUTENCAO_VEICULO', label: 'Manutenção de veículo' },
  { valor: 'PEDAGIO', label: 'Pedágio' },
  { valor: 'MATERIAL_ESCRITORIO', label: 'Material de escritório' },
  { valor: 'OUTROS', label: 'Outros' },
];

export default function NovaDespesaScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { editarId } = useLocalSearchParams<{ editarId?: string }>();
  const editando = Boolean(editarId);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [safraId, setSafraId] = useState<string | null>(null);
  const [carregandoBase, setCarregandoBase] = useState(true);
  const [erroBase, setErroBase] = useState<string | null>(null);

  const [foto, setFoto] = useState<FotoEscolhida | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [origemOcr, setOrigemOcr] = useState(false);
  const [avisoConfianca, setAvisoConfianca] = useState<string | null>(null);

  const [categoria, setCategoria] = useState<CategoriaDespesa>('OUTROS');
  const [valor, setValor] = useState('');
  const [estabelecimento, setEstabelecimento] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiClientes(),
      apiSafraAtual(),
      editarId ? buscarRegistro(editarId) : Promise.resolve(null),
    ])
      .then(([listaClientes, safra, registro]) => {
        setClientes(listaClientes);
        setSafraId(safra.id);
        const dados = registro?.dados;
        if (dados?.tipoItem === 'despesa') {
          setCategoria(dados.categoria);
          setValor(String(dados.valor));
          setEstabelecimento(dados.estabelecimento ?? '');
          setClienteId(dados.clienteId ?? null);
          setBuscaCliente(dados.clienteNome ?? '');
          setDescricao(dados.descricao ?? '');
          setOrigemOcr(dados.origemOcr ?? false);
          setFoto(dados.fotos[0] ?? null);
        }
      })
      .catch((e) => setErroBase(e instanceof Error ? e.message : 'Erro ao carregar dados.'))
      .finally(() => setCarregandoBase(false));
  }, [editarId]);

  const clientesFiltrados = clientes.filter((c) =>
    c.nome.toLowerCase().includes(buscaCliente.toLowerCase())
  );

  async function escolherFoto(origem: 'camera' | 'galeria') {
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
    const novaFoto: FotoEscolhida = {
      uri: asset.uri,
      nome: nomeArquivoDeUri(asset.uri, 'nota'),
      tipo: 'image/jpeg',
    };
    setFoto(novaFoto);
    setOrigemOcr(false);
    setAvisoConfianca(null);
    extrairDaNota(novaFoto);
  }

  async function extrairDaNota(fotoParaExtrair: FotoEscolhida) {
    setErro(null);
    setExtraindo(true);
    try {
      const extraido = await apiExtrairDespesa(fotoParaExtrair);
      if (extraido.valor != null) setValor(String(extraido.valor));
      if (extraido.estabelecimento) setEstabelecimento(extraido.estabelecimento);
      if (extraido.categoria) setCategoria(extraido.categoria);
      setOrigemOcr(true);
      if (extraido.confianca === 'baixa') {
        setAvisoConfianca('Extração com baixa confiança — confira os campos antes de salvar.');
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao extrair dados da nota.');
    } finally {
      setExtraindo(false);
    }
  }

  async function salvar() {
    const valorNumerico = Number(valor.replace(',', '.'));
    if (!safraId || !valorNumerico || valorNumerico <= 0) return;

    setSalvando(true);
    setErro(null);
    try {
      const cliente = clientes.find((c) => c.id === clienteId);
      await salvarRegistro(
        {
          tipoItem: 'despesa',
          categoria,
          categoriaLabel: CATEGORIAS.find((c) => c.valor === categoria)?.label ?? categoria,
          valor: valorNumerico,
          safraId,
          clienteId: clienteId ?? undefined,
          clienteNome: cliente?.nome,
          estabelecimento: estabelecimento || undefined,
          descricao: descricao || undefined,
          origemOcr,
          fotos: foto ? [foto] : [],
        },
        editarId
      );
      router.back();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar despesa.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregandoBase) {
    return (
      <ThemedView style={styles.centro}>
        <ActivityIndicator color={theme.accent} />
      </ThemedView>
    );
  }

  if (erroBase) {
    return (
      <ThemedView style={styles.centro}>
        <ThemedText type="small" style={styles.erroTexto}>
          {erroBase}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="small" themeColor="textSecondary">
            Foto da nota
          </ThemedText>
          {foto && <Image source={{ uri: foto.uri }} style={styles.fotoPreview} />}
          <ThemedView style={styles.botoesFoto}>
            <Pressable
              onPress={() => escolherFoto('camera')}
              style={[styles.botaoSecundario, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="small">Câmera</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => escolherFoto('galeria')}
              style={[styles.botaoSecundario, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="small">Galeria</ThemedText>
            </Pressable>
          </ThemedView>
          {extraindo && (
            <ThemedView style={styles.statusExtracao}>
              <ActivityIndicator color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary">
                Lendo a nota...
              </ThemedText>
            </ThemedView>
          )}
          {!extraindo && foto && erro && (
            <Pressable
              onPress={() => extrairDaNota(foto)}
              style={[styles.botaoSecundario, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="small" style={{ color: theme.accent }}>
                Tentar ler a nota de novo
              </ThemedText>
            </Pressable>
          )}
          {avisoConfianca && (
            <ThemedText type="small" style={styles.aviso}>
              {avisoConfianca}
            </ThemedText>
          )}

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Categoria
          </ThemedText>
          <ThemedView style={styles.categorias}>
            {CATEGORIAS.map((c) => (
              <Pressable
                key={c.valor}
                onPress={() => setCategoria(c.valor)}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      categoria === c.valor ? theme.accent : theme.backgroundElement,
                  },
                ]}
              >
                <ThemedText
                  type="small"
                  style={categoria === c.valor ? { color: '#000000' } : undefined}
                >
                  {c.label}
                </ThemedText>
              </Pressable>
            ))}
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Valor (R$)
          </ThemedText>
          <TextInput
            value={valor}
            onChangeText={setValor}
            placeholder="0,00"
            placeholderTextColor={theme.textSecondary}
            keyboardType="decimal-pad"
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Estabelecimento
          </ThemedText>
          <TextInput
            value={estabelecimento}
            onChangeText={setEstabelecimento}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Cliente (opcional)
          </ThemedText>
          <SeletorBusca
            valor={buscaCliente}
            onChangeTexto={setBuscaCliente}
            opcoes={clientesFiltrados.map((c) => ({ id: c.id, label: c.nome }))}
            selecionadoId={clienteId}
            onSelecionar={(o) => {
              setClienteId(o.id);
              setBuscaCliente(o.label);
            }}
            placeholder="Buscar cliente..."
            inputStyle={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Descrição (opcional)
          </ThemedText>
          <TextInput
            value={descricao}
            onChangeText={setDescricao}
            multiline
            numberOfLines={3}
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              styles.textoArea,
              { color: theme.text, backgroundColor: theme.backgroundElement },
            ]}
          />

          {erro && (
            <ThemedText type="small" style={styles.erroTexto}>
              {erro}
            </ThemedText>
          )}
        </ScrollView>

        <Pressable
          onPress={salvar}
          disabled={!valor || salvando}
          style={[
            styles.botaoSalvar,
            { backgroundColor: theme.accent, opacity: !valor || salvando ? 0.5 : 1 },
          ]}
        >
          {salvando ? (
            <ActivityIndicator color="#000" />
          ) : (
            <ThemedText type="smallBold" style={styles.botaoSalvarTexto}>
              {editando ? 'Salvar alterações' : 'Salvar despesa'}
            </ThemedText>
          )}
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  scroll: { gap: Spacing.two, paddingBottom: Spacing.four },
  label: { marginTop: Spacing.three },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  textoArea: { minHeight: 90, textAlignVertical: 'top' },
  fotoPreview: { width: '100%', height: 180, borderRadius: Spacing.two },
  botoesFoto: { flexDirection: 'row', gap: Spacing.two },
  botaoSecundario: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  statusExtracao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
  },
  aviso: { color: '#eab308' },
  categorias: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: Spacing.four, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  botaoSalvar: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  botaoSalvarTexto: { color: '#000000' },
  erroTexto: { color: '#ef4444', textAlign: 'center', paddingHorizontal: Spacing.four },
});
