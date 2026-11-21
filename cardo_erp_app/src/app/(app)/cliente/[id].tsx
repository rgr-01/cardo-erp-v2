import { useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { FazendasCliente } from '@/components/fazendas-cliente';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AvisoDados, Botao, Carregando, Info, Secao, Vazio, estilosTela } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useServidor } from '@/hooks/use-servidor';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { dataBR, mensagemErro, numero } from '@/lib/formato';
import { apagarCache, chaves, servidor } from '@/lib/servidor';

export default function ClienteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { usuario } = useAuth();
  const admin = usuario?.role === 'ADMIN';
  const cli = useServidor(chaves.cliente(id), () => servidor.cliente(id));
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (cli.carregando && !cli.dados) return <Carregando />;
  const c = cli.dados;
  if (!c) return <Vazio texto={cli.erro ?? 'Cliente não encontrado.'} />;

  const telefone = c.telefone?.replace(/\D/g, '') ?? '';
  const temLocal = c.latitude != null && c.longitude != null;
  const endereco = [c.endereco, [c.cidade, c.uf].filter(Boolean).join('/'), c.cep ? `CEP ${c.cep}` : null]
    .filter(Boolean)
    .join(' · ');

  function abrirMapa() {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${c!.latitude},${c!.longitude}`);
  }

  function whatsapp() {
    const numeroCompleto = telefone.startsWith('55') ? telefone : `55${telefone}`;
    Linking.openURL(`https://wa.me/${numeroCompleto}`);
  }

  async function usarMinhaLocalizacao() {
    Alert.alert(
      'Marcar localização',
      `Gravar a posição atual do celular como localização de ${c!.nome}? Faça isso estando na fazenda.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Gravar',
          onPress: async () => {
            setOcupado('local');
            try {
              const permissao = await Location.requestForegroundPermissionsAsync();
              if (!permissao.granted) throw new Error('Permita o acesso à localização nas configurações.');
              const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
              });
              cli.substituir(
                await servidor.atualizarLocalizacaoCliente(id, pos.coords.latitude, pos.coords.longitude)
              );
            } catch (e) {
              Alert.alert('Não foi possível gravar', mensagemErro(e));
            } finally {
              setOcupado(null);
            }
          },
        },
      ]
    );
  }

  function excluir() {
    Alert.alert('Excluir cliente', `Excluir ${c!.nome}? Só é possível se ele não tiver vendas.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setOcupado('excluir');
          try {
            await servidor.excluirCliente(id);
            await apagarCache(chaves.cliente(id));
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
      <Stack.Screen options={{ title: 'Cliente' }} />
      <SafeAreaView style={estilosTela.container} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={estilosTela.scroll}
          refreshControl={
            <RefreshControl refreshing={cli.carregando} onRefresh={cli.recarregar} tintColor={theme.textSecondary} />
          }
        >
          <AvisoDados {...cli} onTentar={cli.recarregar} />

          <ThemedView style={{ gap: Spacing.one }}>
            <ThemedText type="subtitle" style={{ fontSize: 26, lineHeight: 32 }}>
              {c.nome}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {c.consultorNome ? `Consultor: ${c.consultorNome}` : 'Sem consultor'} ·{' '}
              {c.ultimaVisita ? `última visita ${dataBR(c.ultimaVisita)}` : 'nunca visitado'}
            </ThemedText>
          </ThemedView>

          <ThemedView style={{ flexDirection: 'row', gap: Spacing.two }}>
            {telefone ? (
              <Botao titulo="Ligar" variante="secundario" onPress={() => Linking.openURL(`tel:${telefone}`)} style={{ flex: 1 }} />
            ) : null}
            {telefone ? (
              <Botao titulo="WhatsApp" variante="secundario" onPress={whatsapp} style={{ flex: 1 }} />
            ) : null}
            {temLocal ? (
              <Botao titulo="Mapa" variante="secundario" onPress={abrirMapa} style={{ flex: 1 }} />
            ) : null}
          </ThemedView>

          <Secao titulo="Cadastro">
            <Info rotulo="Razão social" valor={c.razaoSocial} />
            <Info rotulo="CPF/CNPJ" valor={c.documento} />
            <Info rotulo="Inscrição estadual" valor={c.inscricaoEstadual} />
            <Info rotulo="Telefone" valor={c.telefone} />
            <Info rotulo="E-mail" valor={c.email} />
            <Info rotulo="Endereço" valor={endereco} />
            <Info rotulo="CTV" valor={c.ctv} />
          </Secao>

          {c.areaPlantio != null || c.areaTotal != null ? (
            <Secao titulo="Área">
              <Info rotulo="Área de plantio (ha)" valor={c.areaPlantio != null ? numero(c.areaPlantio) : null} />
              <Info rotulo="Área total (ha)" valor={c.areaTotal != null ? numero(c.areaTotal) : null} />
            </Secao>
          ) : null}

          {c.totais ? (
            <Secao titulo="Histórico">
              <ThemedText type="small">
                {c.totais.relatoriosVisita} visita(s) · {c.totais.propostas} pedido(s)/proposta(s) ·{' '}
                {c.totais.vendas} venda(s) · {c.totais.despesas} despesa(s)
              </ThemedText>
              {c.totais.relatoriosVisita > 0 ? (
                <Botao
                  titulo="Ver visitas deste cliente"
                  variante="secundario"
                  onPress={() =>
                    router.push({ pathname: '/(app)/visitas', params: { clienteId: id, clienteNome: c.nome } })
                  }
                />
              ) : null}
            </Secao>
          ) : null}

          <FazendasCliente
            clienteId={id}
            fazendas={c.fazendas ?? []}
            admin={admin}
            aoMudar={cli.recarregar}
          />

          <Secao titulo="Localização">
            <ThemedText type="small" themeColor={temLocal ? 'text' : 'textSecondary'}>
              {temLocal
                ? `${c.latitude!.toFixed(5)}, ${c.longitude!.toFixed(5)}`
                : 'Localização não cadastrada.'}
            </ThemedText>
            {admin ? (
              <Botao
                titulo={temLocal ? 'Atualizar com minha localização' : 'Usar minha localização'}
                variante="secundario"
                carregando={ocupado === 'local'}
                onPress={usarMinhaLocalizacao}
              />
            ) : null}
          </Secao>

          <ThemedView style={estilosTela.acoes}>
            <Botao titulo="Editar cadastro" onPress={() => router.push(`/(app)/editar-cliente/${id}`)} />
            {admin ? (
              <Botao titulo="Excluir cliente" variante="perigo" carregando={ocupado === 'excluir'} onPress={excluir} />
            ) : null}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}
