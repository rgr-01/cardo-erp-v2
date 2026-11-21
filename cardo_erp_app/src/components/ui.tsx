// Peças visuais comuns às telas de consulta/edição dos dados do servidor.

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dataHoraBR } from '@/lib/formato';

type Tom = 'neutro' | 'sucesso' | 'aviso' | 'perigo' | 'destaque';

export function Selo({ texto, tom = 'neutro' }: { texto: string; tom?: Tom }) {
  const theme = useTheme();
  const cores: Record<Tom, [string, string]> = {
    neutro: [theme.backgroundSelected, theme.textSecondary],
    sucesso: [theme.successBg, theme.success],
    aviso: [theme.warningBg, theme.warning],
    perigo: [theme.dangerBg, theme.danger],
    destaque: [theme.accentBg, theme.accent],
  };
  const [fundo, cor] = cores[tom];
  return (
    <ThemedView style={[styles.selo, { backgroundColor: fundo }]}>
      <ThemedText type="small" style={{ color: cor, fontSize: 12, lineHeight: 16 }}>
        {texto}
      </ThemedText>
    </ThemedView>
  );
}

export function Botao({
  titulo,
  onPress,
  variante = 'primario',
  carregando = false,
  desabilitado = false,
  style,
}: {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario' | 'perigo';
  carregando?: boolean;
  desabilitado?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const fundo =
    variante === 'primario'
      ? theme.accent
      : variante === 'perigo'
        ? theme.dangerBg
        : theme.backgroundElement;
  const cor =
    variante === 'primario' ? theme.onAccent : variante === 'perigo' ? theme.danger : theme.text;
  const inativo = desabilitado || carregando;
  return (
    <Pressable
      onPress={onPress}
      disabled={inativo}
      style={({ pressed }) => [
        styles.botao,
        { backgroundColor: fundo, opacity: inativo ? 0.5 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={cor} />
      ) : (
        <ThemedText type="smallBold" style={{ color: cor }}>
          {titulo}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function Campo({
  rotulo,
  multiline,
  style,
  ...props
}: { rotulo: string } & TextInputProps) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.campo}>
      <ThemedText type="small" themeColor="textSecondary">
        {rotulo}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textMuted}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.inputMultilinha,
          { color: theme.text, backgroundColor: theme.backgroundElement },
          style,
        ]}
        {...props}
      />
    </ThemedView>
  );
}

export function BarraBusca({
  valor,
  onChange,
  placeholder = 'Buscar…',
}: {
  valor: string;
  onChange: (texto: string) => void;
  placeholder?: string;
}) {
  const theme = useTheme();
  return (
    <TextInput
      value={valor}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      clearButtonMode="while-editing"
      autoCorrect={false}
      style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
    />
  );
}

export function Chips<T extends string>({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: { valor: T; label: string }[];
  valor: T;
  onChange: (valor: T) => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.chips}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            onPress={() => onChange(o.valor)}
            style={[
              styles.chip,
              { backgroundColor: ativo ? theme.accent : theme.backgroundElement },
            ]}
          >
            <ThemedText type="small" style={{ color: ativo ? theme.onAccent : theme.text }}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <ThemedView style={[styles.secao, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.secaoTitulo}>
        {titulo.toUpperCase()}
      </ThemedText>
      {children}
    </ThemedView>
  );
}

export function Info({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  if (valor == null || valor === '' || valor === '—') return null;
  return (
    <ThemedView style={styles.info}>
      <ThemedText type="small" themeColor="textMuted" style={styles.transparente}>
        {rotulo}
      </ThemedText>
      <ThemedText type="small" style={[styles.infoValor, styles.transparente]}>
        {valor}
      </ThemedText>
    </ThemedView>
  );
}

/** Faixa avisando que a tela mostra a cópia salva (sem sinal) ou que atualizar falhou. */
export function AvisoDados({
  doCache,
  erro,
  atualizadoEm,
  onTentar,
}: {
  doCache: boolean;
  erro: string | null;
  atualizadoEm: string | null;
  onTentar: () => void;
}) {
  const theme = useTheme();
  if (!doCache || !erro) return null;
  return (
    <Pressable
      onPress={onTentar}
      style={[styles.aviso, { backgroundColor: theme.warningBg }]}
    >
      <ThemedText type="small" style={{ color: theme.warning }}>
        {atualizadoEm
          ? `Sem conexão — mostrando dados salvos de ${dataHoraBR(atualizadoEm)}. Toque para tentar de novo.`
          : `${erro} Toque para tentar de novo.`}
      </ThemedText>
    </Pressable>
  );
}

export function Carregando() {
  const theme = useTheme();
  return (
    <ThemedView style={styles.centro}>
      <ActivityIndicator color={theme.accent} />
    </ThemedView>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return (
    <ThemedView style={styles.vazio}>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        {texto}
      </ThemedText>
    </ThemedView>
  );
}

export const estilosTela = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  lista: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  topoLista: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.two },
  linha: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.one },
  linhaMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  acoes: { gap: Spacing.two },
  transparente: { backgroundColor: 'transparent' },
});

const styles = StyleSheet.create({
  selo: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  botao: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  campo: { gap: Spacing.one },
  input: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  inputMultilinha: { minHeight: 110, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  secao: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth },
  secaoTitulo: { fontSize: 12, letterSpacing: 0.8, backgroundColor: 'transparent' },
  info: { gap: 2, backgroundColor: 'transparent' },
  infoValor: { fontSize: 15 },
  transparente: { backgroundColor: 'transparent' },
  aviso: { borderRadius: Radius.sm, padding: Spacing.three },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  vazio: { paddingVertical: Spacing.six, paddingHorizontal: Spacing.four },
});
