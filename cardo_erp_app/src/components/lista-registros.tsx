import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  duplicarRegistro,
  excluirRegistro,
  listarPorTipo,
  sincronizarUm,
  type Registro,
  type StatusRegistro,
  type TipoRegistro,
} from '@/lib/registros';

const STATUS_TEXTO: Record<StatusRegistro, string> = {
  rascunho: 'Não enviado',
  enviando: 'Enviando…',
  enviado: 'Enviado',
  erro: 'Falhou',
};

export function formatarQuando(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoje.toDateString()) return `Hoje ${hora}`;

  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `Ontem ${hora}`;

  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * Registros criados neste aparelho que ainda não chegaram ao servidor
 * (rascunho ou falha). Depois de enviados eles aparecem na lista do servidor,
 * então somem daqui. `aoMudar` avisa a tela quando um envio deu certo, pra
 * ela recarregar a lista do servidor.
 */
export function PendentesLocais({
  tipo,
  rotaNovo,
  aoMudar,
}: {
  tipo: TipoRegistro;
  rotaNovo: string;
  aoMudar?: () => void;
}) {
  const router = useRouter();
  const [itens, setItens] = useState<Registro[]>([]);

  const carregar = useCallback(async () => {
    const todos = await listarPorTipo(tipo);
    setItens(todos.filter((r) => r.status !== 'enviado'));
  }, [tipo]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  function abrirMenu(registro: Registro) {
    Alert.alert(registro.titulo, registro.erro ?? undefined, [
      {
        text: 'Editar',
        onPress: () =>
          router.push({ pathname: rotaNovo as never, params: { editarId: registro.id } }),
      },
      {
        text: 'Enviar agora',
        onPress: async () => {
          try {
            await sincronizarUm(registro.id);
            aoMudar?.();
          } catch (e) {
            Alert.alert('Não foi possível enviar', e instanceof Error ? e.message : 'Tente de novo.');
          }
          carregar();
        },
      },
      {
        text: 'Duplicar',
        onPress: async () => {
          const id = await duplicarRegistro(registro.id);
          router.push({ pathname: rotaNovo as never, params: { editarId: id } });
        },
      },
      {
        text: 'Excluir',
        style: 'destructive' as const,
        onPress: () =>
          Alert.alert('Excluir rascunho', 'Essa ação não pode ser desfeita.', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Excluir',
              style: 'destructive',
              onPress: async () => {
                await excluirRegistro(registro.id);
                carregar();
              },
            },
          ]),
      },
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }

  if (itens.length === 0) return null;

  return (
    <ThemedView style={styles.bloco}>
      <ThemedText type="small" themeColor="textSecondary">
        Neste aparelho — não enviados ({itens.length})
      </ThemedText>
      {itens.map((registro) => (
        <LinhaRegistro key={registro.id} registro={registro} onMenu={() => abrirMenu(registro)} />
      ))}
    </ThemedView>
  );
}

function LinhaRegistro({ registro, onMenu }: { registro: Registro; onMenu: () => void }) {
  const theme = useTheme();
  const falhou = registro.status === 'erro';

  return (
    <Pressable
      onPress={onMenu}
      style={[styles.linha, { backgroundColor: falhou ? theme.dangerBg : theme.warningBg }]}
    >
      <ThemedText type="smallBold" numberOfLines={1} style={styles.transparente}>
        {registro.titulo}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.transparente}>
        {registro.subtitulo}
      </ThemedText>
      <ThemedView style={[styles.metaLinha, styles.transparente]}>
        <ThemedText type="small" themeColor="textMuted">
          {formatarQuando(registro.atualizadoEm)}
        </ThemedText>
        {registro.fotos > 0 && (
          <ThemedText type="small" themeColor="textMuted">
            {registro.fotos} foto(s)
          </ThemedText>
        )}
        {registro.valor != null && (
          <ThemedText type="small" themeColor="textMuted">
            {registro.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </ThemedText>
        )}
        <ThemedText type="small" style={{ color: falhou ? theme.danger : theme.warning }}>
          {STATUS_TEXTO[registro.status]}
        </ThemedText>
      </ThemedView>
      {falhou && registro.erro && (
        <ThemedText type="small" themeColor="danger" numberOfLines={2} style={styles.transparente}>
          {registro.erro}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bloco: { gap: Spacing.two },
  linha: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.one },
  transparente: { backgroundColor: 'transparent' },
  metaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.one,
    flexWrap: 'wrap',
  },
});
