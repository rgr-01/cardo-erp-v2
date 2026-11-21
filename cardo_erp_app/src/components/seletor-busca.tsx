import { useState } from 'react';
import { Pressable, TextInput, TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type OpcaoBusca = { id: string; label: string };

/**
 * Campo de busca com lista de sugestões abaixo. A lista some assim que uma
 * opção é selecionada — controlado por um estado próprio (não por
 * foco/blur do TextInput, que tem uma corrida entre o blur do campo e o
 * toque no item: o blur podia disparar primeiro e fechar a lista antes do
 * onPress do item rodar, fazendo o toque "sumir" sem selecionar nada).
 */
export function SeletorBusca({
  valor,
  onChangeTexto,
  opcoes,
  selecionadoId,
  onSelecionar,
  placeholder,
  inputStyle,
  ...rest
}: {
  valor: string;
  onChangeTexto: (texto: string) => void;
  opcoes: OpcaoBusca[];
  selecionadoId: string | null;
  onSelecionar: (opcao: OpcaoBusca) => void;
  placeholder?: string;
  inputStyle: TextInputProps['style'];
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'style' | 'placeholder'>) {
  const theme = useTheme();
  const [listaAberta, setListaAberta] = useState(false);

  const mostrarLista = listaAberta && valor.length > 0;

  return (
    <ThemedView>
      <TextInput
        value={valor}
        onChangeText={(texto) => {
          setListaAberta(true);
          onChangeTexto(texto);
        }}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={inputStyle}
        {...rest}
      />
      {mostrarLista && (
        <ThemedView style={{ gap: Spacing.half, marginTop: Spacing.half }}>
          {opcoes.slice(0, 8).map((o) => (
            <Pressable
              key={o.id}
              onPress={() => {
                setListaAberta(false);
                onSelecionar(o);
              }}
              style={{
                borderRadius: Spacing.one,
                padding: Spacing.two,
                backgroundColor:
                  selecionadoId === o.id ? theme.backgroundSelected : theme.backgroundElement,
              }}
            >
              <ThemedText type="small">{o.label}</ThemedText>
            </Pressable>
          ))}
        </ThemedView>
      )}
    </ThemedView>
  );
}
