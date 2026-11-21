import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Secao } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { numero } from '@/lib/formato';
import type { BlocoGrafico } from '@/lib/servidor';

const CORES = ['#00dc4d', '#38bdf8', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c'];
const LARGURA = 320;
const ALTURA = 220;
const ESQUERDA = 34;
const DIREITA = 10;
const TOPO = 12;
const BASE = 37;
const AREA_W = LARGURA - ESQUERDA - DIREITA;
const AREA_H = ALTURA - TOPO - BASE;

function valorNumerico(valor: number | null | undefined): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function caminhoPizza(cx: number, cy: number, raio: number, inicio: number, fim: number) {
  const ponto = (angulo: number) => ({
    x: cx + raio * Math.cos(angulo),
    y: cy + raio * Math.sin(angulo),
  });
  const a = ponto(inicio);
  const b = ponto(fim);
  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${raio} ${raio} 0 ${fim - inicio > Math.PI ? 1 : 0} 1 ${b.x} ${b.y} Z`;
}

export function GraficoRelatorio({ bloco }: { bloco: BlocoGrafico }) {
  const theme = useTheme();
  const series = bloco.series ?? [];
  const linhas = bloco.linhas ?? [];
  const valores = linhas.flatMap((linha) => linha.valores.map(valorNumerico)).filter((n): n is number => n !== null);
  const temDados = series.length > 0 && linhas.length > 0 && valores.length > 0;
  const minimo = Math.min(0, ...valores);
  const maximo = Math.max(0, ...valores);
  const amplitude = maximo === minimo ? 1 : maximo - minimo;
  const y = (valor: number) => TOPO + AREA_H * (maximo - valor) / amplitude;
  const centro = (indice: number) => ESQUERDA + AREA_W * (indice + 0.5) / linhas.length;
  const tamanhoGrupo = AREA_W / Math.max(1, linhas.length);
  const barraW = Math.max(2, Math.min(30, (tamanhoGrupo - 8) / Math.max(1, series.length)));
  const somaPizza = linhas.reduce((soma, linha) => soma + Math.max(0, valorNumerico(linha.valores[0]) ?? 0), 0);

  return (
    <Secao titulo={bloco.titulo || 'Gráfico'}>
      {!temDados ? (
        <ThemedText type="small" themeColor="textSecondary">Gráfico sem dados ainda.</ThemedText>
      ) : (
        <>
          <Svg width="100%" height={ALTURA} viewBox={`0 0 ${LARGURA} ${ALTURA}`} accessibilityLabel={bloco.titulo || 'Gráfico do relatório'}>
            {bloco.formato === 'pizza' ? (() => {
              let angulo = -Math.PI / 2;
              return linhas.map((linha, indice) => {
                const valor = Math.max(0, valorNumerico(linha.valores[0]) ?? 0);
                if (!valor || !somaPizza) return null;
                const inicio = angulo;
                angulo += 2 * Math.PI * valor / somaPizza;
                return <Path key={indice} d={caminhoPizza(160, 108, 86, inicio, Math.min(angulo, inicio + 2 * Math.PI - 0.0001))} fill={CORES[indice % CORES.length]} />;
              });
            })() : (
              <>
                {[0, 1, 2, 3, 4].map((indice) => {
                  const valor = minimo + amplitude * indice / 4;
                  const pos = y(valor);
                  return (
                    <G key={indice}>
                      <Line x1={ESQUERDA} y1={pos} x2={LARGURA - DIREITA} y2={pos} stroke={theme.border} strokeDasharray="3 3" />
                      <SvgText x={ESQUERDA - 5} y={pos + 4} textAnchor="end" fontSize="10" fill={theme.textMuted}>{numero(valor)}</SvgText>
                    </G>
                  );
                })}
                {bloco.formato === 'linha'
                  ? series.flatMap((serie, serieIndex) => linhas.map((linha, indice) => {
                    const atual = valorNumerico(linha.valores[serieIndex]);
                    const anterior = indice > 0 ? valorNumerico(linhas[indice - 1].valores[serieIndex]) : null;
                    return (
                      <G key={`${serieIndex}-${indice}`}>
                        {atual !== null && anterior !== null ? (
                          <Line x1={centro(indice - 1)} y1={y(anterior)} x2={centro(indice)} y2={y(atual)} stroke={CORES[serieIndex % CORES.length]} strokeWidth="2.5" />
                        ) : null}
                        {atual !== null ? <Circle cx={centro(indice)} cy={y(atual)} r="3.5" fill={CORES[serieIndex % CORES.length]} /> : null}
                      </G>
                    );
                  }))
                  : linhas.flatMap((linha, indice) => series.map((serie, serieIndex) => {
                    const valor = valorNumerico(linha.valores[serieIndex]);
                    if (valor === null) return null;
                    const pos = centro(indice) - (series.length * barraW) / 2 + serieIndex * barraW;
                    return (
                      <Rect key={`${indice}-${serieIndex}`} x={pos} y={Math.min(y(0), y(valor))} width={Math.max(1, barraW - 2)} height={Math.max(1, Math.abs(y(0) - y(valor)))} fill={CORES[serieIndex % CORES.length]} />
                    );
                  }))}
                {linhas.map((linha, indice) => (
                  <SvgText key={indice} x={centro(indice)} y={ALTURA - 12} textAnchor="middle" fontSize="10" fill={theme.textMuted}>
                    {(linha.rotulo || `Linha ${indice + 1}`).slice(0, 10)}
                  </SvgText>
                ))}
              </>
            )}
          </Svg>
          <ThemedView style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
            {(bloco.formato === 'pizza' ? linhas.map((linha) => linha.rotulo) : series).map((nome, indice) => (
              <ThemedView key={indice} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <ThemedView style={{ width: 10, height: 10, backgroundColor: CORES[indice % CORES.length] }} />
                <ThemedText type="small" themeColor="textSecondary">{nome || `Série ${indice + 1}`}</ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
          {linhas.map((linha, indice) => (
            <ThemedView key={indice} style={{ gap: 2 }}>
              <ThemedText type="smallBold">{linha.rotulo || `Linha ${indice + 1}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {series.map((serie, j) => `${serie}: ${linha.valores[j] != null ? numero(linha.valores[j]) : '—'}`).join('  ·  ')}
              </ThemedText>
            </ThemedView>
          ))}
        </>
      )}
    </Secao>
  );
}
