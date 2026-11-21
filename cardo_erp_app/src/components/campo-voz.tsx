import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  editarTranscricao,
  excluirNota,
  formatarDuracao,
  listarNotas,
  salvarNota,
  sincronizarTranscricoes,
  type NotaVoz,
  type StatusTranscricao,
} from '@/lib/notas-voz';

const STATUS_TEXTO: Record<StatusTranscricao, string> = {
  pendente: 'Salvo no aparelho',
  transcrevendo: 'Transcrevendo…',
  pronta: 'Transcrito',
  erro: 'Não transcrito',
};

/** Gravações de menos de um segundo costumam ser toques acidentais. */
const DURACAO_MINIMA_MS = 800;

export function CampoVoz({ registroId }: { registroId: string }) {
  const theme = useTheme();
  const gravador = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const estado = useAudioRecorderState(gravador);
  const [notas, setNotas] = useState<NotaVoz[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [permitido, setPermitido] = useState(false);
  const inicioRef = useRef(0);

  const recarregar = useCallback(async () => {
    setNotas(await listarNotas(registroId));
  }, [registroId]);

  useEffect(() => {
    (async () => {
      const permissao = await AudioModule.requestRecordingPermissionsAsync();
      setPermitido(permissao.granted);
      if (!permissao.granted) return;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recarregar();
    })().catch(() => {});
  }, [recarregar]);

  async function iniciar() {
    if (!permitido) {
      Alert.alert('Microfone bloqueado', 'Libere o microfone nas configurações para ditar.');
      return;
    }
    await gravador.prepareToRecordAsync();
    inicioRef.current = Date.now();
    gravador.record();
  }

  async function parar() {
    await gravador.stop();
    const uri = gravador.uri;
    if (!uri) return;

    const duracao = Date.now() - inicioRef.current;
    if (duracao < DURACAO_MINIMA_MS) {
      Alert.alert('Gravação muito curta', 'Segure o botão e fale por pelo menos um segundo.');
      return;
    }

    setOcupado(true);
    try {
      await salvarNota(registroId, uri, duracao);
      await recarregar();
      // A transcrição é oportunista: se não houver rede agora, o áudio
      // continua salvo e a fila tenta de novo depois.
      sincronizarTranscricoes().then(recarregar).catch(() => {});
    } finally {
      setOcupado(false);
    }
  }

  async function tentarTranscrever() {
    setOcupado(true);
    try {
      await sincronizarTranscricoes();
      await recarregar();
    } finally {
      setOcupado(false);
    }
  }

  function confirmarExclusao(nota: NotaVoz) {
    Alert.alert('Excluir gravação', 'O áudio e a transcrição serão removidos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await excluirNota(nota.id);
          await recarregar();
        },
      },
    ]);
  }

  const gravando = estado.isRecording;

  return (
    <ThemedView>
      <Pressable
        onPressIn={iniciar}
        onPressOut={parar}
        disabled={ocupado}
        style={[
          styles.microfone,
          { borderColor: gravando ? theme.danger : theme.border },
          { backgroundColor: gravando ? theme.dangerBg : theme.backgroundElement },
        ]}
        accessibilityLabel="Segure para gravar o relato"
      >
        {ocupado ? (
          <ActivityIndicator color={theme.textSecondary} />
        ) : (
          <ThemedText type="smallBold" themeColor={gravando ? 'danger' : 'text'}>
            {gravando
              ? `Gravando ${formatarDuracao(estado.durationMillis ?? 0)} — solte para parar`
              : '🎙  Segure para ditar'}
          </ThemedText>
        )}
      </Pressable>

      {notas.map((nota) => (
        <ThemedView
          key={nota.id}
          style={[styles.nota, { backgroundColor: theme.backgroundElement }]}
        >
          <ThemedView style={[styles.notaTopo, styles.transparente]}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatarDuracao(nota.duracaoMs)}
            </ThemedText>
            <ThemedText
              type="small"
              themeColor={
                nota.status === 'pronta'
                  ? 'success'
                  : nota.status === 'erro'
                    ? 'warning'
                    : 'textSecondary'
              }
              style={styles.notaStatus}
            >
              {STATUS_TEXTO[nota.status]}
            </ThemedText>
            <Pressable onPress={() => confirmarExclusao(nota)} hitSlop={10}>
              <ThemedText type="small" themeColor="textMuted">
                Excluir
              </ThemedText>
            </Pressable>
          </ThemedView>

          <Reproduzir uri={nota.arquivo} />

          {nota.transcricao != null && (
            <TextInput
              multiline
              defaultValue={nota.transcricao}
              onEndEditing={(e) =>
                editarTranscricao(nota.id, e.nativeEvent.text).then(recarregar)
              }
              style={[styles.transcricao, { color: theme.text }]}
            />
          )}

          {nota.status === 'erro' && (
            <ThemedView style={[styles.notaErro, styles.transparente]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.notaErroTexto}>
                O áudio está salvo. Você pode ouvir e digitar o relato.
              </ThemedText>
              <Pressable onPress={tentarTranscrever} hitSlop={8}>
                <ThemedText type="small" themeColor="accent">
                  Tentar de novo
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}
        </ThemedView>
      ))}
    </ThemedView>
  );
}

function Reproduzir({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  return (
    <Pressable
      onPress={() => (player.playing ? player.pause() : player.play())}
      style={styles.reproduzir}
      hitSlop={8}
    >
      <ThemedText type="small" themeColor="accent">
        {player.playing ? '⏸  Pausar' : '▶  Ouvir gravação'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  microfone: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
    minHeight: 48,
  },
  nota: {
    borderRadius: Radius.sm,
    padding: Spacing.three,
    marginTop: Spacing.two,
    gap: Spacing.one,
  },
  notaTopo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  notaStatus: { flex: 1 },
  transparente: { backgroundColor: 'transparent' },
  reproduzir: { paddingVertical: Spacing.one },
  transcricao: {
    fontSize: 14,
    lineHeight: 20,
    padding: 0,
    marginTop: Spacing.one,
    textAlignVertical: 'top',
  },
  notaErro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  notaErroTexto: { flex: 1 },
});
