import { useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { Botao, Campo, Carregando, Vazio, estilosTela } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { lerNumero, mensagemErro, textoNumero } from '@/lib/formato';
import { apagarCache, chaves, gravarCache, servidor, type ClienteServidor } from '@/lib/servidor';

// Campos de texto editáveis no app (os percentuais por cultura e o consultor
// responsável continuam sendo ajustados pelo site).
const CAMPOS = [
  { chave: 'nome', rotulo: 'Nome *' },
  { chave: 'razaoSocial', rotulo: 'Razão social' },
  { chave: 'documento', rotulo: 'CPF/CNPJ', teclado: 'numbers-and-punctuation' },
  { chave: 'inscricaoEstadual', rotulo: 'Inscrição estadual' },
  { chave: 'telefone', rotulo: 'Telefone', teclado: 'phone-pad' },
  { chave: 'email', rotulo: 'E-mail', teclado: 'email-address' },
  { chave: 'endereco', rotulo: 'Endereço' },
  { chave: 'cidade', rotulo: 'Cidade' },
  { chave: 'uf', rotulo: 'UF' },
  { chave: 'cep', rotulo: 'CEP', teclado: 'numbers-and-punctuation' },
  { chave: 'ctv', rotulo: 'CTV' },
] as const;

type ChaveTexto = (typeof CAMPOS)[number]['chave'];

export default function EditarClienteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const novo = id === 'novo';
  const router = useRouter();

  const [original, setOriginal] = useState<ClienteServidor | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<ChaveTexto, string>>(
    () => Object.fromEntries(CAMPOS.map((c) => [c.chave, ''])) as Record<ChaveTexto, string>
  );
  const [areaPlantio, setAreaPlantio] = useState('');
  const [areaTotal, setAreaTotal] = useState('');
  const [salvando, setSalvando] = useState(false);

  function aplicar(c: ClienteServidor) {
    setOriginal(c);
    setValores(
      Object.fromEntries(CAMPOS.map((campo) => [campo.chave, c[campo.chave] ?? ''])) as Record<
        ChaveTexto,
        string
      >
    );
    setAreaPlantio(textoNumero(c.areaPlantio));
    setAreaTotal(textoNumero(c.areaTotal));
  }

  function falhar(e: unknown) {
    setErroCarga(mensagemErro(e, 'Não foi possível abrir o cliente.'));
  }

  function carregar() {
    setErroCarga(null);
    servidor.cliente(id).then(aplicar, falhar);
  }

  useEffect(() => {
    if (!novo) servidor.cliente(id).then(aplicar, falhar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function salvar() {
    if (!valores.nome.trim()) {
      Alert.alert('Nome', 'Informe o nome do cliente.');
      return;
    }
    setSalvando(true);
    try {
      // O servidor substitui o cadastro inteiro: o que o app não edita
      // (percentuais por cultura, consultor, localização) vai como estava.
      const dados: Partial<ClienteServidor> = {
        ...(original ?? {}),
        ...Object.fromEntries(CAMPOS.map((c) => [c.chave, valores[c.chave].trim() || null])),
        areaPlantio: lerNumero(areaPlantio),
        areaTotal: lerNumero(areaTotal),
      };
      for (const extra of ['id', 'consultorNome', 'ultimaVisita', 'totais', 'fazendas', 'criadoEm', 'atualizadoEm'] as const) {
        delete (dados as Record<string, unknown>)[extra];
      }

      if (novo) {
        const criado = await servidor.criarCliente(dados);
        await apagarCache(chaves.clientes);
        router.replace(`/(app)/cliente/${criado.id}`);
      } else {
        await gravarCache(chaves.cliente(id), await servidor.atualizarCliente(id, dados));
        router.back();
      }
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
  if (!novo && !original) return <Carregando />;

  return (
    <ThemedView style={estilosTela.container}>
      <Stack.Screen options={{ title: novo ? 'Novo cliente' : 'Editar cliente' }} />
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={estilosTela.scroll} keyboardShouldPersistTaps="handled">
          {CAMPOS.map((campo) => (
            <Campo
              key={campo.chave}
              rotulo={campo.rotulo}
              value={valores[campo.chave]}
              onChangeText={(texto) => setValores((atuais) => ({ ...atuais, [campo.chave]: texto }))}
              keyboardType={'teclado' in campo ? campo.teclado : 'default'}
              autoCapitalize={campo.chave === 'email' ? 'none' : campo.chave === 'uf' ? 'characters' : 'sentences'}
              maxLength={campo.chave === 'uf' ? 2 : undefined}
            />
          ))}
          <ThemedView style={{ flexDirection: 'row', gap: Spacing.two }}>
            <ThemedView style={{ flex: 1 }}>
              <Campo rotulo="Área de plantio (ha)" value={areaPlantio} onChangeText={setAreaPlantio} keyboardType="decimal-pad" />
            </ThemedView>
            <ThemedView style={{ flex: 1 }}>
              <Campo rotulo="Área total (ha)" value={areaTotal} onChangeText={setAreaTotal} keyboardType="decimal-pad" />
            </ThemedView>
          </ThemedView>
        </ScrollView>
        <ThemedView style={{ paddingHorizontal: Spacing.three, paddingBottom: Spacing.two }}>
          <Botao titulo={novo ? 'Cadastrar cliente' : 'Salvar alterações'} onPress={salvar} carregando={salvando} />
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}
