import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';

// Abertura do app: sempre a marca Cardo AI, seja qual for a empresa do usuário.
// Três versões testadas (A, B, C); a escolhida foi a C (Arrancada).
type Variante = 'A' | 'B' | 'C';
const VARIANTE: Variante | 'comparar' = 'C';

const AZUL_CARDO = '#0F1F4D';
const AZUL = '#2447E6';
const AZUL_CLARO = '#5b78ff';
const SETA = 'M3 3l9 9-9 9';
const TAMANHO_SETA = 25.5; // comprimento do traço da seta, para o efeito de desenhar

const PathAnimado = Animated.createAnimatedComponent(Path);

function Nome({ progresso, estilo }: { progresso: { value: number }; estilo?: 'subir' | 'abrir' }) {
  const anim = useAnimatedStyle(() =>
    estilo === 'abrir'
      ? { opacity: progresso.value, transform: [{ scaleX: 0.85 + progresso.value * 0.15 }], letterSpacing: 0 }
      : { opacity: progresso.value, transform: [{ translateY: (1 - progresso.value) * 18 }] }
  );
  return (
    <Animated.View style={anim}>
      <Text style={styles.nome}>Cardo AI</Text>
      <Text style={styles.produto}>GESTÃO COMERCIAL AGRO</Text>
    </Animated.View>
  );
}

/** A — Giro 3D: as setas viram de lado, uma após a outra, e o conjunto se endireita. */
function VersaoA({ aoTerminar }: { aoTerminar: () => void }) {
  const giro1 = useSharedValue(-90);
  const giro2 = useSharedValue(-90);
  const inclinacao = useSharedValue(30);
  const nome = useSharedValue(0);

  useEffect(() => {
    const suave = { duration: 700, easing: Easing.out(Easing.cubic) };
    giro1.value = withTiming(0, suave);
    giro2.value = withDelay(180, withTiming(0, suave));
    inclinacao.value = withDelay(200, withSpring(0, { damping: 9, stiffness: 70 }));
    nome.value = withDelay(650, withTiming(1, { duration: 500 }, (fim) => fim && runOnJS(aoTerminar)()));
  }, [aoTerminar, giro1, giro2, inclinacao, nome]);

  const marca = useAnimatedStyle(() => ({ transform: [{ perspective: 700 }, { rotateX: `${inclinacao.value}deg` }] }));
  const s1 = useAnimatedStyle(() => ({ opacity: 1 - Math.abs(giro1.value) / 90, transform: [{ perspective: 600 }, { rotateY: `${giro1.value}deg` }] }));
  const s2 = useAnimatedStyle(() => ({ opacity: 1 - Math.abs(giro2.value) / 90, transform: [{ perspective: 600 }, { rotateY: `${giro2.value}deg` }] }));

  return (
    <Animated.View style={[styles.marca, marca]}>
      <View style={styles.setas}>
        <Animated.View style={s1}><SetaFixa opacidade={1} /></Animated.View>
        <Animated.View style={[styles.seta2, s2]}><SetaFixa opacidade={0.6} /></Animated.View>
      </View>
      <Nome progresso={nome} />
    </Animated.View>
  );
}

/** B — Traço: as setas se desenham na tela, como uma caneta, e o nome aparece abrindo. */
function VersaoB({ aoTerminar }: { aoTerminar: () => void }) {
  const traco1 = useSharedValue(0);
  const traco2 = useSharedValue(0);
  const nome = useSharedValue(0);

  useEffect(() => {
    const desenho = { duration: 650, easing: Easing.inOut(Easing.cubic) };
    traco1.value = withTiming(1, desenho);
    traco2.value = withDelay(260, withTiming(1, desenho));
    nome.value = withDelay(800, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }, (fim) => fim && runOnJS(aoTerminar)()));
  }, [aoTerminar, nome, traco1, traco2]);

  const p1 = useAnimatedProps(() => ({ strokeDashoffset: TAMANHO_SETA * (1 - traco1.value) }));
  const p2 = useAnimatedProps(() => ({ strokeDashoffset: TAMANHO_SETA * (1 - traco2.value) }));

  return (
    <View style={styles.marca}>
      <View style={styles.setas}>
        <Svg viewBox="0 0 30 24" width={100} height={80}>
          <PathAnimado d={SETA} fill="none" stroke={AZUL} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={TAMANHO_SETA} animatedProps={p1} />
          <PathAnimado d="M15 3l9 9-9 9" fill="none" stroke={AZUL} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} strokeDasharray={TAMANHO_SETA} animatedProps={p2} />
        </Svg>
      </View>
      <Nome progresso={nome} estilo="abrir" />
    </View>
  );
}

/** C — Arrancada: as setas entram em velocidade pela esquerda, com rastro, e travam no lugar. */
function VersaoC({ aoTerminar }: { aoTerminar: () => void }) {
  const corrida = useSharedValue(0);
  const nome = useSharedValue(0);
  const linha = useSharedValue(0);

  useEffect(() => {
    corrida.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.exp) });
    linha.value = withDelay(550, withSequence(withTiming(1, { duration: 380 }), withTiming(1, { duration: 1 })));
    nome.value = withDelay(700, withTiming(1, { duration: 450 }, (fim) => fim && runOnJS(aoTerminar)()));
  }, [aoTerminar, corrida, linha, nome]);

  const rastro = (atraso: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => {
      const p = Math.max(0, Math.min(1, corrida.value - atraso));
      return {
        opacity: atraso === 0 ? Math.min(1, corrida.value * 2) : (1 - corrida.value) * 0.5,
        transform: [{ translateX: (1 - p) * -260 }, { skewX: `${(1 - corrida.value) * -18}deg` }],
      };
    });
  const principal = rastro(0);
  const eco1 = rastro(0.12);
  const eco2 = rastro(0.24);
  const sublinhado = useAnimatedStyle(() => ({ transform: [{ scaleX: linha.value }], opacity: linha.value }));

  return (
    <View style={styles.marca}>
      <View style={styles.setasCorrida}>
        <Animated.View style={[styles.absoluto, eco2]}><Setas /></Animated.View>
        <Animated.View style={[styles.absoluto, eco1]}><Setas /></Animated.View>
        <Animated.View style={principal}><Setas /></Animated.View>
      </View>
      <Nome progresso={nome} />
      <Animated.View style={[styles.sublinhado, sublinhado]} />
    </View>
  );
}

function SetaFixa({ opacidade }: { opacidade: number }) {
  return (
    <Svg viewBox="0 0 15 24" width={42} height={68}>
      <Path d={SETA} fill="none" stroke={AZUL} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" opacity={opacidade} />
    </Svg>
  );
}

function Setas() {
  return (
    <Svg viewBox="0 0 30 24" width={100} height={80}>
      <Path d={SETA} fill="none" stroke={AZUL} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 3l9 9-9 9" fill="none" stroke={AZUL} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
    </Svg>
  );
}

const VERSOES = { A: VersaoA, B: VersaoB, C: VersaoC };

export function Abertura({ aoTerminar }: { aoTerminar: () => void }) {
  const fila: Variante[] = VARIANTE === 'comparar' ? ['A', 'B', 'C'] : [VARIANTE];
  const [indice, setIndice] = useState(0);
  const saida = useSharedValue(1);
  const atual = fila[indice];
  const Versao = VERSOES[atual];

  // Cada versão avisa quando terminou; segura a marca um instante e segue.
  function terminouVersao() {
    setTimeout(() => {
      if (indice < fila.length - 1) {
        setIndice(indice + 1);
        return;
      }
      saida.value = withTiming(0, { duration: 380 }, (fim) => fim && runOnJS(aoTerminar)());
    }, VARIANTE === 'comparar' ? 1200 : 700);
  }

  const fundo = useAnimatedStyle(() => ({ opacity: saida.value }));

  return (
    // A splash nativa só sai quando a abertura já está desenhada: sem piscar tela preta no meio.
    <Animated.View style={[StyleSheet.absoluteFill, styles.fundo, fundo]} pointerEvents="none" onLayout={() => SplashScreen.hideAsync()}>
      <Versao key={atual} aoTerminar={terminouVersao} />
      {VARIANTE === 'comparar' ? <Text style={styles.etiqueta}>Opção {atual}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fundo: { backgroundColor: AZUL_CARDO, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  marca: { alignItems: 'center' },
  setas: { flexDirection: 'row', marginBottom: 18, height: 80, alignItems: 'center' },
  seta2: { marginLeft: -6 },
  setasCorrida: { height: 80, width: 100, marginBottom: 18 },
  absoluto: { position: 'absolute' },
  nome: { color: '#ffffff', fontSize: 36, fontWeight: '600', letterSpacing: -0.8, textAlign: 'center' },
  produto: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', letterSpacing: 2.4, textAlign: 'center', marginTop: 6 },
  sublinhado: { width: 120, height: 3, borderRadius: 2, backgroundColor: AZUL_CLARO, marginTop: 14 },
  etiqueta: { position: 'absolute', top: 70, color: '#fcd34d', fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
});
