import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { corSobre, LogoEmpresa } from '@/components/cardo-logo';
import {
  IconeClientes,
  IconeDespesas,
  IconeInfo,
  IconePedidos,
  IconeSair,
  IconeSeta,
  IconeSincronizar,
  IconeVisitas,
} from '@/components/icones';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useServidor } from '@/hooks/use-servidor';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { sincronizarTranscricoes } from '@/lib/notas-voz';
import { dataBR } from '@/lib/formato';
import { contagens, sincronizarTudo } from '@/lib/registros';
import { chaves, servidor } from '@/lib/servidor';

// Marca padrão do sistema (Cardo AI), igual ao web.
const AZUL_CARDO = '#0F1F4D';
const AZUL = '#2447E6';
const AZUL_CLARO = '#5b78ff';

type Acao = { rota: string; Icone: typeof IconeVisitas; titulo: string; resumo: string; itens: string[] };

// O cartão mostra só o nome; o (i) abre o que cada ferramenta faz.
const ACOES: Acao[] = [
  {
    rota: '/(app)/visitas',
    Icone: IconeVisitas,
    titulo: 'Gestor de Visitas',
    resumo: 'Registre as visitas técnicas no campo, mesmo sem sinal.',
    itens: [
      'Relato da visita com fotos, áudio e localização',
      'Relatório em PDF pronto para enviar ao cliente',
      'Funciona offline e envia quando houver conexão',
    ],
  },
  {
    rota: '/(app)/despesas',
    Icone: IconeDespesas,
    titulo: 'Despesas',
    resumo: 'Lance gastos de viagem e de campo direto pela foto da nota.',
    itens: [
      'Foto da nota fiscal ou cupom',
      'Leitura automática de valor, data e fornecedor por IA',
      'Quilometragem e acompanhamento do reembolso',
    ],
  },
  {
    rota: '/(app)/pedidos',
    Icone: IconePedidos,
    titulo: 'Orçamentos e pedidos',
    resumo: 'Monte propostas para o cliente e acompanhe até virar pedido.',
    itens: [
      'Orçamentos com produtos, preços e condições',
      'Aprovação e assinatura digital',
      'Acompanhamento do status de cada pedido',
    ],
  },
  {
    rota: '/(app)/clientes',
    Icone: IconeClientes,
    titulo: 'Clientes',
    resumo: 'Sua carteira de clientes sempre à mão.',
    itens: [
      'Cadastro e contatos de cada cliente',
      'Fazendas e localização no mapa',
      'Histórico de visitas e pedidos',
    ],
  },
];

export default function MenuScreen() {
  const { usuario, logout, marca } = useAuth();
  // Cabeçalho e botão com a cor da empresa logada (igual ao web); Cardo AI no padrão.
  const corMarca = marca?.cor ?? AZUL_CARDO;
  const destaque = marca?.destaque ?? AZUL;
  const sobreDestaque = corSobre(destaque);
  const theme = useTheme();
  const router = useRouter();
  const escuro = useColorScheme() === 'dark';
  const azulTexto = escuro ? AZUL_CLARO : AZUL;
  const azulFundo = escuro ? 'rgba(91,120,255,0.18)' : '#eef1fd';
  const [info, setInfo] = useState<Acao | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  // Os números e as últimas visitas vêm do servidor (com cópia salva pra
  // abrir sem sinal); os pendentes são o que ainda está só no aparelho.
  const relatorios = useServidor(chaves.relatorios, servidor.relatorios);
  const despesas = useServidor(chaves.despesas, servidor.despesas);
  const pedidos = useServidor(chaves.propostas('PEDIDO'), () => servidor.propostas('PEDIDO'));

  const carregar = useCallback(async () => {
    setPendentes((await contagens()).pendentes);
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  async function sincronizar() {
    setSincronizando(true);
    try {
      const { enviados, falharam } = await sincronizarTudo();
      // As transcrições pendentes aproveitam a mesma janela de conexão.
      await sincronizarTranscricoes().catch(() => {});

      if (enviados === 0 && falharam === 0) {
        Alert.alert('Tudo em dia', 'Nenhum registro pendente para enviar.');
      } else if (falharam === 0) {
        Alert.alert('Sincronizado', `${enviados} registro(s) enviado(s).`);
      } else {
        Alert.alert(
          'Sincronização parcial',
          `${enviados} enviado(s), ${falharam} com erro. Abra a lista para ver o motivo.`
        );
      }
    } catch (e) {
      Alert.alert('Não foi possível sincronizar', e instanceof Error ? e.message : 'Tente de novo.');
    } finally {
      setSincronizando(false);
      carregar();
      relatorios.recarregar();
      despesas.recarregar();
      pedidos.recarregar();
    }
  }

  const iniciais =
    (usuario?.nome ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((parte) => parte[0]?.toUpperCase() ?? '')
      .join('') || '?';

  const recentes = (relatorios.dados ?? []).slice(0, 5);
  const cartao = { backgroundColor: theme.backgroundElement, borderColor: theme.border };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Cabeçalho da marca */}
          <View style={[styles.hero, { backgroundColor: corMarca }]}>
            <View style={[styles.brilho, { backgroundColor: marca ? destaque : AZUL_CLARO }]} />
            <View style={styles.heroTopo}>
              <LogoEmpresa marca={marca} altura={30} />
              <Pressable onPress={logout} hitSlop={12} accessibilityRole="button" accessibilityLabel="Sair da conta" style={styles.sair}>
                <IconeSair size={18} color="rgba(255,255,255,0.75)" />
              </Pressable>
            </View>

            <View style={styles.heroLinha}>
              <View style={styles.avatar}>
                <ThemedText type="smallBold" style={styles.avatarTexto}>{iniciais}</ThemedText>
              </View>
              <View style={styles.heroTextos}>
                <ThemedText style={styles.heroTitulo} numberOfLines={1}>
                  Olá, {usuario?.nome?.split(' ')[0] || 'bem-vindo'}
                </ThemedText>
                <ThemedText type="small" style={styles.heroSub} numberOfLines={1}>
                  {usuario?.nome}
                </ThemedText>
              </View>
            </View>

            <Pressable
              onPress={sincronizar}
              disabled={sincronizando}
              accessibilityRole="button"
              accessibilityLabel={pendentes ? `Sincronizar ${pendentes} registros pendentes` : 'Sincronizar registros'}
              style={({ pressed }) => [styles.sync, { backgroundColor: destaque, opacity: sincronizando ? 0.7 : pressed ? 0.85 : 1 }]}
            >
              {sincronizando ? <ActivityIndicator size="small" color={sobreDestaque} /> : <IconeSincronizar size={17} color={sobreDestaque} />}
              <ThemedText type="smallBold" style={{ color: sobreDestaque }}>
                {sincronizando ? 'Sincronizando…' : 'Sincronizar'}
              </ThemedText>
              {pendentes > 0 && !sincronizando ? (
                <View style={[styles.syncBadge, { backgroundColor: sobreDestaque }]}>
                  <ThemedText style={[styles.syncBadgeTexto, { color: destaque }]}>{pendentes}</ThemedText>
                </View>
              ) : null}
            </Pressable>
          </View>

          {/* Números */}
          <View style={styles.metricas}>
            <Metrica label="Visitas" valor={relatorios.dados?.length} />
            <Metrica label="Despesas" valor={despesas.dados?.length} />
            <Metrica label="Pedidos" valor={pedidos.dados?.length} />
          </View>
          {pendentes > 0 ? (
            <View style={[styles.aviso, { backgroundColor: theme.warningBg }]}>
              <ThemedText type="small" themeColor="warning">
                {pendentes} registro{pendentes === 1 ? '' : 's'} salvo{pendentes === 1 ? '' : 's'} no aparelho aguardando envio.
              </ThemedText>
            </View>
          ) : null}

          {/* Módulos */}
          <ThemedText type="smallBold" style={styles.secao}>Módulos</ThemedText>
          <View style={styles.grid}>
            {ACOES.map((acao) => (
              <Pressable
                key={acao.rota}
                onPress={() => router.push(acao.rota as never)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.modulo, cartao, pressed && styles.pressed]}
              >
                <View style={styles.moduloTopo}>
                  <View style={[styles.moduloIcone, { backgroundColor: azulFundo }]}>
                    <acao.Icone size={22} color={azulTexto} />
                  </View>
                  <Pressable
                    onPress={() => setInfo(acao)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Sobre ${acao.titulo}`}
                    style={styles.infoBotao}
                  >
                    <IconeInfo size={16} color="#92400e" strokeWidth={2.6} />
                  </Pressable>
                </View>
                <ThemedText type="smallBold" style={styles.moduloTitulo}>{acao.titulo}</ThemedText>
              </Pressable>
            ))}
          </View>

          <Modal visible={info !== null} transparent animationType="fade" onRequestClose={() => setInfo(null)}>
            <Pressable style={styles.modalFundo} onPress={() => setInfo(null)}>
              {info ? (
                <Pressable style={[styles.modalCaixa, { backgroundColor: theme.background }]} onPress={() => {}}>
                  <View style={[styles.modalIcone, { backgroundColor: azulFundo }]}>
                    <info.Icone size={26} color={azulTexto} />
                  </View>
                  <ThemedText style={styles.modalTitulo}>{info.titulo}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.modalResumo}>{info.resumo}</ThemedText>
                  <View style={styles.modalItens}>
                    {info.itens.map((item) => (
                      <View key={item} style={styles.modalItem}>
                        <View style={[styles.modalPonto, { backgroundColor: azulTexto }]} />
                        <ThemedText type="small" style={styles.modalItemTexto}>{item}</ThemedText>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    onPress={() => {
                      const rota = info.rota;
                      setInfo(null);
                      router.push(rota as never);
                    }}
                    style={({ pressed }) => [styles.modalAbrir, { backgroundColor: destaque }, pressed && styles.pressed]}
                  >
                    <ThemedText type="smallBold" style={{ color: sobreDestaque }}>Abrir {info.titulo}</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setInfo(null)} hitSlop={8} style={styles.modalFechar}>
                    <ThemedText type="small" themeColor="textSecondary">Fechar</ThemedText>
                  </Pressable>
                </Pressable>
              ) : null}
            </Pressable>
          </Modal>

          {/* Últimas visitas */}
          <View style={styles.secaoLinha}>
            <ThemedText type="smallBold" style={styles.secao}>Últimas visitas</ThemedText>
            {recentes.length > 0 ? (
              <Pressable onPress={() => router.push('/(app)/visitas' as never)} hitSlop={8}>
                <ThemedText type="small" style={{ color: escuro ? AZUL_CLARO : AZUL, fontWeight: '600' }}>Ver todas</ThemedText>
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.lista, cartao]}>
            {recentes.length === 0 ? (
              <View style={styles.vazio}>
                <ThemedText type="small">{relatorios.carregando ? 'Carregando…' : 'Nenhuma visita ainda'}</ThemedText>
                {!relatorios.carregando ? (
                  <ThemedText type="small" themeColor="textSecondary">Comece registrando a primeira visita.</ThemedText>
                ) : null}
              </View>
            ) : (
              recentes.map((visita, i) => (
                <Pressable
                  key={visita.id}
                  onPress={() => router.push(`/(app)/visita/${visita.id}`)}
                  style={({ pressed }) => [
                    styles.linha,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.linhaIcone, { backgroundColor: escuro ? 'rgba(91,120,255,0.18)' : '#eef1fd' }]}>
                    <IconeVisitas size={16} color={escuro ? AZUL_CLARO : AZUL} />
                  </View>
                  <View style={styles.linhaTextos}>
                    <ThemedText type="smallBold" numberOfLines={1}>{visita.clienteNome}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {dataBR(visita.dataVisita)} · {visita.titulo || visita.resumo}
                    </ThemedText>
                  </View>
                  <IconeSeta size={18} color={theme.textMuted} />
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Metrica({ label, valor }: { label: string; valor: number | undefined }) {
  const theme = useTheme();
  return (
    <View style={[styles.metrica, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText style={styles.metricaValor}>{valor ?? '–'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.six },
  hero: { backgroundColor: AZUL_CARDO, borderRadius: 22, padding: Spacing.four, paddingBottom: Spacing.five + Spacing.three, overflow: 'hidden' },
  brilho: { position: 'absolute', top: -110, right: -90, width: 260, height: 260, borderRadius: 130, backgroundColor: AZUL_CLARO, opacity: 0.2 },
  heroTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.four },
  sair: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  heroLinha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  avatarTexto: { color: '#fff' },
  heroTextos: { flex: 1, minWidth: 0 },
  heroTitulo: { color: '#fff', fontSize: 24, lineHeight: 30, fontWeight: '600' },
  heroSub: { color: 'rgba(255,255,255,0.65)' },
  sync: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, backgroundColor: AZUL, borderRadius: Radius.md, minHeight: 46, marginTop: Spacing.four },
  syncBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  syncBadgeTexto: { color: AZUL, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  metricas: { flexDirection: 'row', gap: Spacing.two, marginTop: -Spacing.five, paddingHorizontal: Spacing.two },
  metrica: { flex: 1, borderRadius: Radius.md, borderWidth: 1, paddingVertical: Spacing.three, alignItems: 'center', gap: 2, elevation: 3, shadowColor: '#0F1F4D', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  metricaValor: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  aviso: { borderRadius: Radius.md, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, marginTop: Spacing.three },
  secaoLinha: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  secao: { fontSize: 17, marginTop: Spacing.four, marginBottom: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  modulo: { width: '48.8%', borderRadius: 16, borderWidth: 1, padding: Spacing.three, minHeight: 120, justifyContent: 'space-between' },
  moduloTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.three },
  moduloIcone: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  infoBotao: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fcd34d' },
  modalFundo: { flex: 1, backgroundColor: 'rgba(8,15,40,0.55)', justifyContent: 'center', padding: Spacing.four },
  modalCaixa: { borderRadius: 22, padding: Spacing.four },
  modalIcone: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.three },
  modalTitulo: { fontSize: 21, lineHeight: 27, fontWeight: '700' },
  modalResumo: { marginTop: Spacing.one },
  modalItens: { marginTop: Spacing.three, gap: Spacing.two },
  modalItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  modalPonto: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  modalItemTexto: { flex: 1 },
  modalAbrir: { backgroundColor: AZUL, borderRadius: Radius.md, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.four },
  modalFechar: { alignSelf: 'center', marginTop: Spacing.three },
  moduloTitulo: { fontSize: 16 },
  pressed: { opacity: 0.7 },
  lista: { borderRadius: 16, borderWidth: 1, paddingHorizontal: Spacing.three },
  linha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  linhaIcone: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linhaTextos: { flex: 1, minWidth: 0, gap: 2 },
  vazio: { alignItems: 'center', paddingVertical: Spacing.four, gap: 2 },
});
