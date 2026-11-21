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

import { CampoVoz } from '@/components/campo-voz';
import { SeletorBusca } from '@/components/seletor-busca';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Chips } from '@/components/ui';
import { apiClientes, apiSafraAtual, type ClienteOpcao } from '@/lib/api';
import { nomeArquivoDeUri } from '@/lib/arquivo';
import { reassociarNotas } from '@/lib/notas-voz';
import { buscarRegistro, salvarRegistro } from '@/lib/registros';

type FotoEscolhida = { uri: string; nome: string; tipo: string };

const MAX_FOTOS = 8;

export default function NovaVisitaScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { editarId } = useLocalSearchParams<{ editarId?: string }>();
  const editando = Boolean(editarId);

  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [safraId, setSafraId] = useState<string | null>(null);
  const [carregandoBase, setCarregandoBase] = useState(true);
  const [erroBase, setErroBase] = useState<string | null>(null);

  const [clienteId, setClienteId] = useState<string | null>(null);
  const [buscaCliente, setBuscaCliente] = useState('');
  // '' = sem fazenda (o cliente pode não ter, ou a visita não é de uma só).
  const [fazendaId, setFazendaId] = useState('');
  const [texto, setTexto] = useState('');
  const [fotos, setFotos] = useState<FotoEscolhida[]>([]);
  const [salvando, setSalvando] = useState(false);

  // As notas de voz precisam de um dono antes do registro existir de fato;
  // num registro novo elas ficam sob um id provisório e migram ao salvar.
  // useState com inicializador (não useMemo) porque Date.now() é impuro e
  // só pode rodar uma vez, na montagem — não a cada render.
  const [idProvisorio] = useState(() => `rascunho-${Date.now().toString(36)}`);
  const idRascunho = editarId ?? idProvisorio;

  useEffect(() => {
    Promise.all([
      apiClientes(),
      apiSafraAtual(),
      editarId ? buscarRegistro(editarId) : Promise.resolve(null),
    ])
      .then(([listaClientes, safra, registro]) => {
        setClientes(listaClientes);
        setSafraId(safra.id);
        if (registro?.dados.tipoItem === 'visita') {
          setClienteId(registro.dados.clienteId);
          setBuscaCliente(registro.dados.clienteNome);
          setFazendaId(registro.dados.fazendaId ?? '');
          setTexto(registro.dados.texto);
          setFotos(registro.dados.fotos);
        }
      })
      .catch((e) => setErroBase(e instanceof Error ? e.message : 'Erro ao carregar dados.'))
      .finally(() => setCarregandoBase(false));
  }, [editarId]);

  const fazendasDoCliente = clientes.find((c) => c.id === clienteId)?.fazendas ?? [];

  const clientesFiltrados = clientes.filter((c) =>
    c.nome.toLowerCase().includes(buscaCliente.toLowerCase())
  );

  async function tirarFoto() {
    if (fotos.length >= MAX_FOTOS) return;
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) return;

    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (resultado.canceled) return;

    const asset = resultado.assets[0];
    setFotos((atual) => [
      ...atual,
      { uri: asset.uri, nome: nomeArquivoDeUri(asset.uri, 'visita'), tipo: 'image/jpeg' },
    ]);
  }

  async function escolherDaGaleria() {
    if (fotos.length >= MAX_FOTOS) return;
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) return;

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: MAX_FOTOS - fotos.length,
    });
    if (resultado.canceled) return;

    const novas = resultado.assets.map((asset) => ({
      uri: asset.uri,
      nome: nomeArquivoDeUri(asset.uri, 'visita'),
      tipo: 'image/jpeg',
    }));
    setFotos((atual) => [...atual, ...novas]);
  }

  function removerFoto(uri: string) {
    setFotos((atual) => atual.filter((f) => f.uri !== uri));
  }

  async function salvar() {
    if (!clienteId || !safraId || !texto.trim()) return;
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) return;

    setSalvando(true);
    try {
      const id = await salvarRegistro(
        {
          tipoItem: 'visita',
          clienteId,
          clienteNome: cliente.nome,
          fazendaId: fazendaId || undefined,
          fazendaNome: fazendasDoCliente.find((f) => f.id === fazendaId)?.nome,
          safraId,
          texto: texto.trim(),
          dataVisita: new Date().toISOString(),
          fotos,
        },
        editarId
      );

      // O registro fica salvo no aparelho; o envio acontece quando o
      // usuário tocar em "Sincronizar" na tela inicial.
      if (id !== idRascunho) await reassociarNotas(idRascunho, id);
      router.back();
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
            Cliente
          </ThemedText>
          <SeletorBusca
            valor={buscaCliente}
            onChangeTexto={setBuscaCliente}
            opcoes={clientesFiltrados.map((c) => ({ id: c.id, label: c.nome }))}
            selecionadoId={clienteId}
            onSelecionar={(o) => {
              setClienteId(o.id);
              setBuscaCliente(o.label);
              setFazendaId('');
            }}
            placeholder="Buscar cliente..."
            inputStyle={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />

          {fazendasDoCliente.length > 0 ? (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                Fazenda
              </ThemedText>
              <Chips
                opcoes={[
                  { valor: '', label: 'Não informar' },
                  ...fazendasDoCliente.map((f) => ({ valor: f.id, label: f.nome })),
                ]}
                valor={fazendaId}
                onChange={setFazendaId}
              />
            </>
          ) : null}

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Relato da visita
          </ThemedText>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="O que foi observado, combinado ou recomendado..."
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={5}
            style={[
              styles.input,
              styles.textoArea,
              { color: theme.text, backgroundColor: theme.backgroundElement },
            ]}
          />

          <CampoVoz registroId={idRascunho} />

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Fotos ({fotos.length}/{MAX_FOTOS})
          </ThemedText>
          <ThemedView style={styles.fotosRow}>
            {fotos.map((f) => (
              <Pressable key={f.uri} onPress={() => removerFoto(f.uri)}>
                <Image source={{ uri: f.uri }} style={styles.foto} />
              </Pressable>
            ))}
          </ThemedView>
          <ThemedView style={styles.botoesFoto}>
            <Pressable
              onPress={tirarFoto}
              style={[styles.botaoSecundario, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="small">Câmera</ThemedText>
            </Pressable>
            <Pressable
              onPress={escolherDaGaleria}
              style={[styles.botaoSecundario, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="small">Galeria</ThemedText>
            </Pressable>
          </ThemedView>
        </ScrollView>

        <Pressable
          onPress={salvar}
          disabled={!clienteId || !texto.trim() || salvando}
          style={[
            styles.botaoSalvar,
            {
              backgroundColor: theme.accent,
              opacity: !clienteId || !texto.trim() || salvando ? 0.5 : 1,
            },
          ]}
        >
          {salvando ? (
            <ActivityIndicator color="#000" />
          ) : (
            <ThemedText type="smallBold" style={styles.botaoSalvarTexto}>
              {editando ? 'Salvar alterações' : 'Salvar visita'}
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
  textoArea: { minHeight: 120, textAlignVertical: 'top' },
  fotosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  foto: { width: 72, height: 72, borderRadius: Spacing.one },
  botoesFoto: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  botaoSecundario: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  botaoSalvar: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  botaoSalvarTexto: { color: '#000000' },
  erroTexto: { color: '#ef4444', textAlign: 'center', paddingHorizontal: Spacing.four },
});
