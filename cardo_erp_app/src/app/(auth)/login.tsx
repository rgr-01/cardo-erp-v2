import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';

import { corSobre, LogoEmpresa } from '@/components/cardo-logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { getCredenciais } from '@/lib/auth-storage';
import { biometriaDisponivel } from '@/lib/biometria';
import { contagens } from '@/lib/registros';

// Marca padrão do sistema (Cardo AI), igual ao login do web.
const AZUL_CARDO = '#0F1F4D';
const AZUL_BOTAO = '#2447E6';

/** As mensagens cruas da API/rede não ajudam quem está no campo. */
function traduzErro(e: unknown): string {
  const msg = String(e instanceof Error ? e.message : e).toLowerCase();
  if (msg.includes('credenciais') || msg.includes('invalid')) return 'E-mail ou senha incorretos.';
  if (msg.includes('biometria')) return 'Biometria não reconhecida.';
  if (msg.includes('nenhuma conta')) return 'Nenhuma conta salva neste aparelho.';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('conectar')) {
    return 'Não foi possível conectar. Verifique o sinal e tente de novo.';
  }
  if (msg.includes('rate') || msg.includes('too many')) return 'Muitas tentativas. Aguarde um minuto.';
  return 'Não foi possível entrar. Tente de novo.';
}

export default function LoginScreen() {
  const { login, loginComBiometria, marca, esquecerMarca } = useAuth();
  // Última empresa que entrou no aparelho: o login aparece com a marca dela (igual ao web).
  const corMarca = marca?.cor ?? AZUL_CARDO;
  const destaque = marca?.destaque ?? AZUL_BOTAO;
  const sobreDestaque = corSobre(destaque);
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [mostrarBiometria, setMostrarBiometria] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    Promise.all([
      biometriaDisponivel().catch(() => false),
      getCredenciais().catch(() => null),
      contagens().catch(() => null),
    ]).then(([disponivel, credenciais, contagem]) => {
      setMostrarBiometria(disponivel && credenciais !== null);
      if (credenciais) {
        setEmail(credenciais.email);
        setSenha(credenciais.senha);
      }
      setPendentes(contagem?.pendentes ?? 0);
    });

    return NetInfo.addEventListener((estado) => setOnline(estado.isConnected !== false));
  }, []);

  async function executar(acao: () => Promise<void>) {
    setErro(null);
    setCarregando(true);
    try {
      await acao();
    } catch (e) {
      setErro(traduzErro(e));
    } finally {
      setCarregando(false);
    }
  }

  function entrar() {
    if (!online) {
      setErro('Sem conexão. O primeiro acesso precisa de internet.');
      return;
    }
    executar(() => login(email.trim().toLowerCase(), senha, lembrar));
  }

  const podeEntrar = !carregando && Boolean(email) && Boolean(senha);

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <ThemedView style={[styles.marca, { backgroundColor: corMarca }]}>
              <View style={[styles.brilho, marca && { backgroundColor: destaque }]} />
              <View style={styles.marcaTopo}>
                <LogoEmpresa marca={marca} altura={36} />
              </View>
              <View style={styles.selo}>
                <View style={[styles.seloPonto, marca && { backgroundColor: destaque }]} />
                <ThemedText style={styles.seloTexto}>{marca ? 'PORTAL DA EQUIPE' : 'GESTÃO COMERCIAL PARA O AGRONEGÓCIO'}</ThemedText>
              </View>
              <ThemedText type="subtitle" style={styles.titulo}>
                {marca ? (
                  <>
                    Tudo da equipe <ThemedText type="subtitle" style={[styles.titulo, { color: destaque }]}>{marca.nome}</ThemedText> em um só lugar.
                  </>
                ) : (
                  'Da safra planejada à visita no campo, tudo conectado.'
                )}
              </ThemedText>
            </ThemedView>

            <ThemedView style={[styles.formCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText type="smallBold" style={styles.formTitulo}>Bem-vindo de volta</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.formDescricao}>
                {marca ? `Entre com o e-mail cadastrado pela ${marca.nome}.` : 'Entre com o e-mail cadastrado pela sua empresa.'}
              </ThemedText>

            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              E-mail
            </ThemedText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="nome@empresa.com.br"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              textContentType="username"
              keyboardType="email-address"
              returnKeyType="next"
              style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
            />

            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Senha
            </ThemedText>
            <View style={[styles.campoSenha, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <TextInput
                value={senha}
                onChangeText={setSenha}
                placeholder="Sua senha"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!senhaVisivel}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={entrar}
                style={[styles.inputSenha, { color: theme.text }]}
              />
              <Pressable
                onPress={() => setSenhaVisivel((atual) => !atual)}
                hitSlop={8}
                accessibilityLabel={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  {senhaVisivel ? 'Ocultar' : 'Mostrar'}
                </ThemedText>
              </Pressable>
            </View>

            <Pressable onPress={() => setLembrar((atual) => !atual)} style={styles.lembrarLinha} hitSlop={8}>
              <ThemedView
                style={[
                  styles.checkbox,
                  { borderColor: lembrar ? destaque : theme.border },
                  lembrar && { backgroundColor: destaque },
                ]}
              >
                {lembrar && <ThemedText style={[styles.check, { color: sobreDestaque }]}>✓</ThemedText>}
              </ThemedView>
              <ThemedText type="small">Salvar login neste aparelho</ThemedText>
            </Pressable>

            {erro && (
              <ThemedView style={[styles.aviso, { backgroundColor: theme.dangerBg }]}>
                <ThemedText type="small" themeColor="danger" style={styles.avisoTexto}>
                  {erro}
                </ThemedText>
              </ThemedView>
            )}

            <Pressable
              onPress={entrar}
              disabled={!podeEntrar}
              style={[styles.botao, { backgroundColor: destaque, opacity: podeEntrar ? 1 : 0.6 }]}
            >
              {carregando ? (
                <ActivityIndicator color={sobreDestaque} />
              ) : (
                <ThemedText type="smallBold" style={{ color: sobreDestaque }}>
                  Entrar
                </ThemedText>
              )}
            </Pressable>

            {mostrarBiometria && (
              <Pressable
                onPress={() => executar(loginComBiometria)}
                disabled={carregando}
                style={[styles.botaoSecundario, { borderColor: theme.border }]}
              >
                <ThemedText type="smallBold">Entrar com biometria</ThemedText>
              </Pressable>
            )}

            </ThemedView>

            {marca ? (
              <Pressable
                onPress={() => {
                  esquecerMarca();
                  setEmail('');
                  setSenha('');
                }}
                hitSlop={8}
                style={styles.outraEmpresa}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  Não é da {marca.nome}? <ThemedText type="smallBold">Entrar por outra empresa</ThemedText>
                </ThemedText>
              </Pressable>
            ) : null}

            {(!online || pendentes > 0) && (
              <ThemedView style={[styles.aviso, { backgroundColor: theme.warningBg }]}>
                <ThemedText type="small" themeColor="warning" style={styles.avisoTexto}>
                  {online
                    ? `${pendentes} registro(s) aguardando envio`
                    : `Sem conexão${pendentes > 0 ? ` — ${pendentes} registro(s) na fila` : ''}`}
                </ThemedText>
              </ThemedView>
            )}

            <ThemedText type="small" themeColor="textMuted" style={styles.versao}>
              versão {Constants.expoConfig?.version ?? '—'}
            </ThemedText>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.four },
  marca: { borderRadius: 20, padding: Spacing.four, paddingBottom: Spacing.five, minHeight: 224, marginBottom: -Spacing.three, overflow: 'hidden' },
  brilho: { position: 'absolute', top: -120, left: -100, width: 280, height: 280, borderRadius: 140, backgroundColor: '#5b78ff', opacity: 0.22 },
  marcaTopo: { marginBottom: Spacing.four },
  selo: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: Spacing.three },
  seloPonto: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5b78ff' },
  seloTexto: { color: 'rgba(255,255,255,0.75)', fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 1.2 },
  titulo: { color: '#ffffff', fontSize: 26, lineHeight: 32, maxWidth: 320 },
  formCard: { borderRadius: 20, borderWidth: 1, padding: Spacing.four, paddingTop: Spacing.five },
  formTitulo: { fontSize: 20, lineHeight: 27 },
  formDescricao: { marginTop: Spacing.one, marginBottom: Spacing.three },
  label: { marginBottom: Spacing.one, marginTop: Spacing.two, fontWeight: '700' },
  input: { borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16, minHeight: 52 },
  campoSenha: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, paddingRight: Spacing.three, minHeight: 52 },
  inputSenha: { flex: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16 },
  lembrarLinha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  check: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  botao: { borderRadius: Radius.md, paddingVertical: Spacing.three, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.four, minHeight: 52 },
  botaoSecundario: { borderRadius: Radius.md, paddingVertical: Spacing.three, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.two, borderWidth: 1, minHeight: 50 },
  aviso: { borderRadius: Radius.md, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, marginTop: Spacing.three },
  avisoTexto: { textAlign: 'center' },
  versao: { textAlign: 'center', marginTop: Spacing.four },
  outraEmpresa: { alignSelf: 'center', marginTop: Spacing.four },
});
