import { useState } from 'react';
import { Alert, Linking, Pressable } from 'react-native';
import * as Location from 'expo-location';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Botao, Campo, Secao, estilosTela } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lerNumero, mensagemErro, numero } from '@/lib/formato';
import { servidor, type FazendaServidor } from '@/lib/servidor';

/**
 * Fazendas do cliente na ficha dele: ver, cadastrar, marcar a localização
 * com o GPS do celular (estando na fazenda) e, para o admin, excluir.
 * `aoMudar` recarrega a ficha depois de cada alteração.
 */
export function FazendasCliente({
  clienteId,
  fazendas,
  admin,
  aoMudar,
}: {
  clienteId: string;
  fazendas: FazendaServidor[];
  admin: boolean;
  aoMudar: () => void;
}) {
  const theme = useTheme();
  const [adicionando, setAdicionando] = useState(false);
  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [area, setArea] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function executar(chave: string, acao: () => Promise<unknown>) {
    setOcupado(chave);
    try {
      await acao();
      aoMudar();
      return true;
    } catch (e) {
      Alert.alert('Não foi possível concluir', mensagemErro(e));
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function adicionar() {
    if (!nome.trim()) {
      Alert.alert('Fazenda', 'Informe o nome da fazenda.');
      return;
    }
    const ok = await executar('nova', () =>
      servidor.criarFazenda(clienteId, {
        nome: nome.trim(),
        cidade: cidade.trim() || null,
        uf: uf.trim() || null,
        area: lerNumero(area),
      })
    );
    if (ok) {
      setNome('');
      setCidade('');
      setUf('');
      setArea('');
      setAdicionando(false);
    }
  }

  function marcarLocal(f: FazendaServidor) {
    Alert.alert(
      'Marcar localização',
      `Gravar a posição atual do celular como localização da ${f.nome}? Faça isso estando na fazenda.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Gravar',
          onPress: () =>
            executar(`local-${f.id}`, async () => {
              const permissao = await Location.requestForegroundPermissionsAsync();
              if (!permissao.granted) throw new Error('Permita o acesso à localização nas configurações.');
              const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
              await servidor.atualizarFazenda(f.id, {
                nome: f.nome,
                cidade: f.cidade ?? null,
                uf: f.uf ?? null,
                area: f.area ?? null,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              });
            }),
        },
      ]
    );
  }

  function excluir(f: FazendaServidor) {
    Alert.alert('Excluir fazenda', `Excluir ${f.nome}? Os relatórios dela ficam sem fazenda.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => executar(`excluir-${f.id}`, () => servidor.excluirFazenda(f.id)),
      },
    ]);
  }

  return (
    <Secao titulo={`Fazendas (${fazendas.length})`}>
      {fazendas.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Nenhuma fazenda cadastrada. Ela aparece na escolha do relatório de visita e na capa do PDF.
        </ThemedText>
      ) : null}

      {fazendas.map((f) => {
        const temLocal = f.latitude != null && f.longitude != null;
        const detalhes = [
          [f.cidade, f.uf].filter(Boolean).join('/'),
          f.area != null ? `${numero(f.area)} ha` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <ThemedView
            key={f.id}
            style={{
              borderRadius: Radius.sm,
              padding: Spacing.two,
              gap: Spacing.one,
              backgroundColor: theme.background,
            }}
          >
            <ThemedText type="smallBold">{f.nome}</ThemedText>
            {detalhes ? (
              <ThemedText type="small" themeColor="textSecondary">
                {detalhes}
              </ThemedText>
            ) : null}
            <ThemedView style={[estilosTela.linhaMeta, estilosTela.transparente]}>
              {temLocal ? (
                <Link
                  texto="Mapa"
                  onPress={() =>
                    Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${f.latitude},${f.longitude}`
                    )
                  }
                />
              ) : null}
              <Link
                texto={ocupado === `local-${f.id}` ? 'Gravando…' : temLocal ? 'Atualizar localização' : 'Marcar localização'}
                onPress={() => marcarLocal(f)}
              />
              {admin ? <Link texto="Excluir" perigo onPress={() => excluir(f)} /> : null}
            </ThemedView>
          </ThemedView>
        );
      })}

      {adicionando ? (
        <ThemedView style={[estilosTela.transparente, { gap: Spacing.two }]}>
          <Campo rotulo="Nome da fazenda" value={nome} onChangeText={setNome} style={{ backgroundColor: theme.background }} />
          <ThemedView style={[estilosTela.transparente, { flexDirection: 'row', gap: Spacing.two }]}>
            <ThemedView style={[estilosTela.transparente, { flex: 2 }]}>
              <Campo rotulo="Cidade" value={cidade} onChangeText={setCidade} style={{ backgroundColor: theme.background }} />
            </ThemedView>
            <ThemedView style={[estilosTela.transparente, { flex: 1 }]}>
              <Campo
                rotulo="UF"
                value={uf}
                onChangeText={(t) => setUf(t.toUpperCase())}
                maxLength={2}
                autoCapitalize="characters"
                style={{ backgroundColor: theme.background }}
              />
            </ThemedView>
          </ThemedView>
          <Campo
            rotulo="Área (ha)"
            value={area}
            onChangeText={setArea}
            keyboardType="decimal-pad"
            style={{ backgroundColor: theme.background }}
          />
          <Botao titulo="Salvar fazenda" onPress={adicionar} carregando={ocupado === 'nova'} />
          <Botao titulo="Cancelar" variante="secundario" onPress={() => setAdicionando(false)} />
        </ThemedView>
      ) : (
        <Botao titulo="+ Adicionar fazenda" variante="secundario" onPress={() => setAdicionando(true)} />
      )}
    </Secao>
  );
}

function Link({ texto, onPress, perigo }: { texto: string; onPress: () => void; perigo?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <ThemedText type="small" themeColor={perigo ? 'danger' : 'accent'}>
        {texto}
      </ThemedText>
    </Pressable>
  );
}
