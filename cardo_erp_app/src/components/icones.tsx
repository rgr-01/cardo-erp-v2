import Svg, { Circle, Path, Rect } from 'react-native-svg';

// Ícones em traço (mesmo desenho do lucide usado no web).
type Props = { size?: number; color: string; strokeWidth?: number };

function Base({ size = 22, color, strokeWidth = 1.8, children }: Props & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export const IconeVisitas = (p: Props) => (
  <Base {...p}>
    <Path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx="12" cy="10" r="3" />
  </Base>
);

export const IconeDespesas = (p: Props) => (
  <Base {...p}>
    <Path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
    <Path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
    <Path d="M12 17.5v-11" />
  </Base>
);

export const IconePedidos = (p: Props) => (
  <Base {...p}>
    <Rect x="8" y="2" width="8" height="4" rx="1" />
    <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <Path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
  </Base>
);

export const IconeClientes = (p: Props) => (
  <Base {...p}>
    <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <Circle cx="9" cy="7" r="4" />
    <Path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Base>
);

export const IconeSincronizar = (p: Props) => (
  <Base {...p}>
    <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <Path d="M21 3v5h-5" />
    <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <Path d="M8 16H3v5" />
  </Base>
);

export const IconeSair = (p: Props) => (
  <Base {...p}>
    <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <Path d="m16 17 5-5-5-5M21 12H9" />
  </Base>
);

export const IconeInfo = (p: Props) => (
  <Base {...p}>
    <Path d="M12 16v-4M12 8h.01" />
  </Base>
);

export const IconeSeta =(p: Props) => (
  <Base {...p}>
    <Path d="m9 18 6-6-6-6" />
  </Base>
);
