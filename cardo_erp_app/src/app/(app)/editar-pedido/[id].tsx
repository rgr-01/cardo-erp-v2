import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { SeletorBusca } from '@/components/seletor-busca';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Botao, Campo, Carregando, Vazio, estilosTela } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClientes } from '@/lib/api';
import {
  brl,
  dataBR,
  isoDeDataBR,
  lerNumero,
  mensagemErro,
  normalizar,
  textoNumero,
} from '@/lib/formato';
import { chaves, gravarCache, servidor, type Produto, type PropostaServidor } from '@/lib/servidor';

type ItemForm = {
  chave: string;
  produtoId: string | null;
  produtoBusca: string;
  vendaId: string | null;
  cultura: string;
  volume: string;
  unidade: string;
  valorUnitario: string;
};

const novaChave = () => Math.random().toString(36).slice(2, 10);

export default function EditarPedidoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const [original, setOriginal] = useState<PropostaServidor | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);

  const [clienteId, setClienteId] = useState<string | null>(null);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [desconto, setDesconto] = useState('');
  const [condicao, setCondicao] = useState('');
  const [validade, setValidade] = useState('');
  const [entrega, setEntrega] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Sempre a versão atual do servidor — nunca editar em cima do cache.
  const buscar = () => Promise.all([servidor.proposta(id), apiClientes(), servidor.produtos()]);

  function aplicar([p, listaClientes, listaProdutos]: Awaited<ReturnType<typeof buscar>>) {
    setOriginal(p);
    setClientes(listaClientes);
    setProdutos(listaProdutos);
    setClienteId(p.cliente.id);
    setBuscaCliente(p.cliente.nome);
    setItens(
      p.itens.map((i) => ({
        chave: novaChave(),
        produtoId: i.produtoId,
        produtoBusca: i.produtoNome,
        vendaId: i.vendaId,
        cultura: i.cultura ?? '',
        volume: textoNumero(i.volume),
        unidade: i.unidade ?? '',
        valorUnitario: textoNumero(i.valorUnitario),
      }))
    );
    setDesconto(p.desconto ? textoNumero(p.desconto) : '');
    setCondicao(p.condicaoPagamento ?? '');
    setValidade(p.validade ? dataBR(p.validade) : '');
    setEntrega(p.previsaoEntrega ? dataBR(p.previsaoEntrega) : '');
    setObservacoes(p.observacoes ?? '');
  }

  function falhar(e: unknown) {
    setErroCarga(mensagemErro(e, 'Não foi possível abrir o documento.'));
  }

  function carregar() {
    setErroCarga(null);
    buscar().then(aplicar, falhar);
  }

  useEffect(() => {
    buscar().then(aplicar, falhar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function mudarItem(chave: string, parcial: Partial<ItemForm>) {
    setItens((atuais) => atuais.map((i) => (i.chave === chave ? { ...i, ...parcial } : i)));
  }

  const subtotal = itens.reduce(
    (soma, i) => soma + (lerNumero(i.volume) ?? 0) * (lerNumero(i.valorUnitario) ?? 0),
    0
  );
  const total = Math.max(0, subtotal - (lerNumero(desconto) ?? 0));

  function dataOuErro(texto: string, rotulo: string): string | null | false {
    if (!texto.trim()) return null;
    const iso = isoDeDataBR(texto);
    if (!iso) {
      Alert.alert('Data inválida', `${rotulo}: use o formato dd/mm/aaaa.`);
      return false;
    }
    return iso;
  }

  async function salvar() {
    if (!clienteId) {
      Alert.alert('Cliente', 'Selecione o cliente.');
      return;
    }
    if (itens.length === 0 || itens.some((i) => !i.produtoId)) {
      Alert.alert('Itens', 'Cada item precisa de um produto selecionado da lista.');
      return;
    }
    const validadeIso = dataOuErro(validade, 'Validade');
    const entregaIso = dataOuErro(entrega, 'Previsão de entrega');
    if (validadeIso === false || entregaIso === false) return;

    setSalvando(true);
    try {
      const atualizado = await servidor.atualizarProposta(id, {
        clienteId,
        validade: validadeIso,
        previsaoEntrega: entregaIso,
        condicaoPagamento: condicao.trim() || null,
        observacoes: observacoes.trim() || null,
        desconto: lerNumero(desconto) ?? 0,
        itens: itens.map((i) => ({
          produtoId: i.produtoId!,
          vendaId: i.vendaId,
          cultura: i.cultura.trim() || null,
          volume: lerNumero(i.volume),
          unidade: i.unidade.trim() || null,
          valorUnitario: lerNumero(i.valorUnitario),
        })),
      });
      await gravarCache(chaves.proposta(id), atualizado);
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

  const estiloInput = {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    color: theme.text,
    backgroundColor: theme.backgroundElement,
  };

  const termoCliente = normalizar(buscaCliente);

  return (
    <ThemedView style={estilosTela.container}>
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={estilosTela.scroll} keyboardShouldPersistTaps="handled">
          <ThemedText type="smallBold">{original.codigo}</ThemedText>

          <ThemedView style={{ gap: Spacing.one }}>
            <ThemedText type="small" themeColor="textSecondary">
              Cliente
            </ThemedText>
            <SeletorBusca
              valor={buscaCliente}
              onChangeTexto={(texto) => {
                setBuscaCliente(texto);
                setClienteId(null);
              }}
              opcoes={clientes
                .filter((c) => normalizar(c.nome).includes(termoCliente))
                .map((c) => ({ id: c.id, label: c.nome }))}
              selecionadoId={clienteId}
              onSelecionar={(o) => {
                setClienteId(o.id);
                setBuscaCliente(o.label);
              }}
              placeholder="Buscar cliente…"
              inputStyle={estiloInput}
            />
          </ThemedView>

          {itens.map((item, indice) => {
            const termo = normalizar(item.produtoBusca);
            return (
              <ThemedView
                key={item.chave}
                style={{
                  borderRadius: Radius.md,
                  padding: Spacing.three,
                  gap: Spacing.two,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <ThemedView style={[estilosTela.linhaMeta, { justifyContent: 'space-between' }]}>
                  <ThemedText type="smallBold">Item {indice + 1}</ThemedText>
                  <Pressable
                    hitSlop={8}
                    onPress={() => setItens((atuais) => atuais.filter((i) => i.chave !== item.chave))}
                  >
                    <ThemedText type="small" themeColor="danger">
                      Remover
                    </ThemedText>
                  </Pressable>
                </ThemedView>
                <SeletorBusca
                  valor={item.produtoBusca}
                  onChangeTexto={(texto) =>
                    // Trocar o produto desfaz o vínculo com a venda de origem.
                    mudarItem(item.chave, { produtoBusca: texto, produtoId: null, vendaId: null })
                  }
                  opcoes={produtos
                    .filter((p) => normalizar(`${p.nome} ${p.fornecedor.nome}`).includes(termo))
                    .map((p) => ({ id: p.id, label: `${p.nome} — ${p.fornecedor.nome}` }))}
                  selecionadoId={item.produtoId}
                  onSelecionar={(o) =>
                    mudarItem(item.chave, { produtoId: o.id, produtoBusca: o.label.split(' — ')[0] })
                  }
                  placeholder="Buscar produto…"
                  inputStyle={estiloInput}
                />
                <Campo rotulo="Cultura" value={item.cultura} onChangeText={(cultura) => mudarItem(item.chave, { cultura })} />
                <ThemedView style={{ flexDirection: 'row', gap: Spacing.two }}>
                  <ThemedView style={{ flex: 2 }}>
                    <Campo
                      rotulo="Volume"
                      value={item.volume}
                      onChangeText={(volume) => mudarItem(item.chave, { volume })}
                      keyboardType="decimal-pad"
                    />
                  </ThemedView>
                  <ThemedView style={{ flex: 1 }}>
                    <Campo
                      rotulo="Unidade"
                      value={item.unidade}
                      onChangeText={(unidade) => mudarItem(item.chave, { unidade })}
                      placeholder="L, kg…"
                    />
                  </ThemedView>
                </ThemedView>
                <Campo
                  rotulo="Valor unitário (R$)"
                  value={item.valorUnitario}
                  onChangeText={(valorUnitario) => mudarItem(item.chave, { valorUnitario })}
                  keyboardType="decimal-pad"
                />
                <ThemedText type="small" themeColor="textSecondary">
                  Total do item: {brl((lerNumero(item.volume) ?? 0) * (lerNumero(item.valorUnitario) ?? 0))}
                </ThemedText>
              </ThemedView>
            );
          })}

          <Botao
            titulo="+ Adicionar item"
            variante="secundario"
            onPress={() =>
              setItens((atuais) => [
                ...atuais,
                {
                  chave: novaChave(),
                  produtoId: null,
                  produtoBusca: '',
                  vendaId: null,
                  cultura: '',
                  volume: '',
                  unidade: '',
                  valorUnitario: '',
                },
              ])
            }
          />

          <Campo rotulo="Desconto (R$)" value={desconto} onChangeText={setDesconto} keyboardType="decimal-pad" />
          <Campo rotulo="Condição de pagamento" value={condicao} onChangeText={setCondicao} placeholder="Ex.: 30/60/90" />
          <ThemedView style={{ flexDirection: 'row', gap: Spacing.two }}>
            <ThemedView style={{ flex: 1 }}>
              <Campo
                rotulo="Validade"
                value={validade}
                onChangeText={setValidade}
                placeholder="dd/mm/aaaa"
                keyboardType="numbers-and-punctuation"
              />
            </ThemedView>
            <ThemedView style={{ flex: 1 }}>
              <Campo
                rotulo="Previsão de entrega"
                value={entrega}
                onChangeText={setEntrega}
                placeholder="dd/mm/aaaa"
                keyboardType="numbers-and-punctuation"
              />
            </ThemedView>
          </ThemedView>
          <Campo rotulo="Observações" value={observacoes} onChangeText={setObservacoes} multiline />
        </ScrollView>

        <ThemedView style={{ paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.one }}>
          <ThemedText type="smallBold" style={{ textAlign: 'center' }}>
            Total {brl(total)}
          </ThemedText>
          <Botao titulo="Salvar alterações" onPress={salvar} carregando={salvando} />
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}
