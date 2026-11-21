import { Image } from 'react-native';

/** Marca do app: nós conectados formando uma planta estilizada. */
export function BrandMark({ size = 64 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/images/icon.png')}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
    />
  );
}
