import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { SeletorBusca } from '@/components/seletor-busca';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClientes, apiProdutos, apiSafraAtual } from '@/lib/api';
import { buscarRegistro, salvarRegistro } from '@/lib/registros';

type Cliente = { id: string; nome: string };
type Produto = { id: string; nome: string; fornecedor: { nome: string } };

export default function NovoPedidoScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { editarId } = useLocalSearchParams<{ editarId?: string }>();
  const editando = Boolean(editarId);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [safraId, setSafraId] = useState<string | null>(null);
  const [carregandoBase, setCarregandoBase] = useState(true);
  const [erroBase, setErroBase] = useState<string | null>(null);

  const [clienteId, setClienteId] = useState<string | null>(null);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [buscaProduto, setBuscaProduto] = useState('');
  const [volume, setVolume] = useState('');
  const [unidade, setUnidade] = useState('');
  const [valorUnitario, setValorUnitario] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiClientes(),
      apiProdutos(),
      apiSafraAtual(),
      editarId ? buscarRegistro(editarId) : Promise.resolve(null),
    ])
      .then(([listaClientes, listaProdutos, safra, registro]) => {
        setClientes(listaClientes);
        setProdutos(listaProdutos);
        setSafraId(safra.id);
        const dados = registro?.dados;
        if (dados?.tipoItem === 'pedido') {
          setClienteId(dados.clienteId);
          setBuscaCliente(dados.clienteNome);
          setProdutoId(dados.produtoId);
          setBuscaProduto(dados.produtoNome);
          setVolume(dados.volume != null ? String(dados.volume) : '');
          setUnidade(dados.unidade ?? '');
          setValorUnitario(dados.valorUnitario != null ? String(dados.valorUnitario) : '');
          setObservacoes(dados.observacoes ?? '');
        }
      })
      .catch((e) => setErroBase(e instanceof Error ? e.message : 'Erro ao carregar dados.'))
      .finally(() => setCarregandoBase(false));
  }, [editarId]);

  const clientesFiltrados = clientes.filter((c) =>
    c.nome.toLowerCase().includes(buscaCliente.toLowerCase())
  );
  const produtosFiltrados = produtos.filter((p) =>
    `${p.nome} ${p.fornecedor.nome}`.toLowerCase().includes(buscaProduto.toLowerCase())
  );

  async function salvar() {
    if (!clienteId || !produtoId || !safraId) return;
    const cliente = clientes.find((c) => c.id === clienteId);
    const produto = produtos.find((p) => p.id === produtoId);
    if (!cliente || !produto) return;

    setSalvando(true);
    setErro(null);
    try {
      await salvarRegistro(
        {
          tipoItem: 'pedido',
          clienteId,
          clienteNome: cliente.nome,
          safraId,
          produtoId,
          produtoNome: produto.nome,
          volume: volume ? Number(volume.replace(',', '.')) : undefined,
          unidade: unidade || undefined,
          valorUnitario: valorUnitario ? Number(valorUnitario.replace(',', '.')) : undefined,
          observacoes: observacoes || undefined,
        },
        editarId
      );
      router.back();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar pedido.');
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
            }}
            placeholder="Buscar cliente..."
            inputStyle={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Produto
          </ThemedText>
          <SeletorBusca
            valor={buscaProduto}
            onChangeTexto={setBuscaProduto}
            opcoes={produtosFiltrados.map((p) => ({
              id: p.id,
              label: `${p.nome} — ${p.fornecedor.nome}`,
            }))}
            selecionadoId={produtoId}
            onSelecionar={(o) => {
              setProdutoId(o.id);
              setBuscaProduto(o.label);
            }}
            placeholder="Buscar produto..."
            inputStyle={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />

          <ThemedView style={styles.linha}>
            <ThemedView style={styles.colunaMeio}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                Quantidade
              </ThemedText>
              <TextInput
                value={volume}
                onChangeText={setVolume}
                keyboardType="decimal-pad"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
            </ThemedView>
            <ThemedView style={styles.colunaMeio}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                Unidade
              </ThemedText>
              <TextInput
                value={unidade}
                onChangeText={setUnidade}
                placeholder="sc, kg, L..."
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
            </ThemedView>
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Valor unitário (R$)
          </ThemedText>
          <TextInput
            value={valorUnitario}
            onChangeText={setValorUnitario}
            keyboardType="decimal-pad"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Observações (opcional)
          </ThemedText>
          <TextInput
            value={observacoes}
            onChangeText={setObservacoes}
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
          disabled={!clienteId || !produtoId || salvando}
          style={[
            styles.botaoSalvar,
            {
              backgroundColor: theme.accent,
              opacity: !clienteId || !produtoId || salvando ? 0.5 : 1,
            },
          ]}
        >
          {salvando ? (
            <ActivityIndicator color="#000" />
          ) : (
            <ThemedText type="smallBold" style={styles.botaoSalvarTexto}>
              {editando ? 'Salvar alterações' : 'Salvar pedido'}
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
  textoArea: { minHeight: 80, textAlignVertical: 'top' },
  linha: { flexDirection: 'row', gap: Spacing.two },
  colunaMeio: { flex: 1 },
  botaoSalvar: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  botaoSalvarTexto: { color: '#000000' },
  erroTexto: { color: '#ef4444', textAlign: 'center', paddingHorizontal: Spacing.four },
});
