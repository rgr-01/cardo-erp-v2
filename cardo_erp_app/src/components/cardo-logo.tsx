import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, SvgUri } from 'react-native-svg';

import type { MarcaEmpresa } from '@/lib/api';

/** Marca do sistema (Cardo AI): duas setas » + nome, igual ao logo do web. */
export function CardoLogo({ size = 26, color = '#ffffff' }: { size?: number; color?: string }) {
  const altura = size * 0.9;
  return (
    <View style={styles.linha}>
      <Svg viewBox="0 0 30 24" width={altura * 1.25} height={altura}>
        <Path d="M3 3l9 9-9 9" fill="none" stroke="#2447E6" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M15 3l9 9-9 9" fill="none" stroke="#2447E6" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
      </Svg>
      <Text style={[styles.nome, { fontSize: size, color }]}>Cardo AI</Text>
    </View>
  );
}

/**
 * Logo da empresa logada sobre fundo escuro (como no web): a logo para fundo
 * escuro; sem logo (ou se ela não carregar, ex.: sem sinal) mostra o nome.
 * Sem empresa (Cardo AI), mostra a marca Cardo AI.
 */
export function LogoEmpresa({ marca, altura = 30 }: { marca: MarcaEmpresa | null; altura?: number }) {
  const [falhou, setFalhou] = useState(false);
  if (!marca) return <CardoLogo size={altura * 0.7} />;

  const url = marca.logoEscuro;
  if (!url || falhou) {
    return <Text style={[styles.nomeEmpresa, { fontSize: altura * 0.7 }]} numberOfLines={1}>{marca.nome}</Text>;
  }
  const largura = altura * 6;
  if (url.split('?')[0].toLowerCase().endsWith('.svg')) {
    return (
      <View style={{ height: altura, width: largura }}>
        <SvgUri uri={url} height={altura} width={largura} preserveAspectRatio="xMinYMid meet" onError={() => setFalhou(true)} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url }}
      style={{ height: altura, width: largura }}
      resizeMode="contain"
      onError={() => setFalhou(true)}
      accessibilityLabel={marca.nome}
    />
  );
}

/** Texto sobre a cor de destaque: escuro em cores claras (verde da Rede Agro), branco nas demais. */
export function corSobre(fundo: string): string {
  const hex = fundo.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0F1F4D' : '#ffffff';
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nome: { fontWeight: '500', letterSpacing: -0.5 },
  nomeEmpresa: { color: '#ffffff', fontWeight: '700', letterSpacing: -0.3 },
});
