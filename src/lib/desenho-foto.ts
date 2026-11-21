// Efeito de "desenho" na foto de perfil, feito no navegador (sem IA e sem envio
// da foto original para terceiros): suaviza, reduz as cores e contorna as bordas.

export const LADO_FOTO = 256;

// Recorta ao centro em quadrado e reduz, para a foto de perfil ficar leve.
export async function fotoParaCanvas(arquivo: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(arquivo);
  const lado = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = LADO_FOTO;
  canvas.height = LADO_FOTO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
  bitmap.close();
  return canvas;
}

export function canvasParaBlob(canvas: HTMLCanvasElement, qualidade = 0.88): Promise<Blob> {
  return new Promise((ok, erro) =>
    canvas.toBlob((b) => (b ? ok(b) : erro(new Error("Falha ao processar a imagem."))), "image/jpeg", qualidade),
  );
}

// Filtro de Kuwahara: em cada pixel escolhe, entre 4 quadrantes vizinhos, o de
// menor variação e usa a média dele. Alisa pele e fundo mas mantém as bordas
// (olhos, barba, contornos) nítidas, com aspecto de pintura.
function pintura(origem: Uint8ClampedArray, lado: number, raio: number): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(origem.length);
  const lum = (i: number) => 0.299 * origem[i] + 0.587 * origem[i + 1] + 0.114 * origem[i + 2];
  const quadrantes: [number, number][] = [[-raio, -raio], [0, -raio], [-raio, 0], [0, 0]];
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let melhor = Infinity;
      let mr = 0, mg = 0, mb = 0;
      for (const [ox, oy] of quadrantes) {
        let r = 0, g = 0, b = 0, soma = 0, soma2 = 0, n = 0;
        for (let dy = 0; dy <= raio; dy++) {
          for (let dx = 0; dx <= raio; dx++) {
            const xx = Math.min(lado - 1, Math.max(0, x + ox + dx));
            const yy = Math.min(lado - 1, Math.max(0, y + oy + dy));
            const i = (yy * lado + xx) * 4;
            const l = lum(i);
            r += origem[i]; g += origem[i + 1]; b += origem[i + 2];
            soma += l; soma2 += l * l; n++;
          }
        }
        const variancia = soma2 / n - (soma / n) ** 2;
        if (variancia < melhor) {
          melhor = variancia;
          mr = r / n; mg = g / n; mb = b / n;
        }
      }
      const o = (y * lado + x) * 4;
      saida[o] = mr; saida[o + 1] = mg; saida[o + 2] = mb; saida[o + 3] = 255;
    }
  }
  return saida;
}

export function aplicarDesenho(origem: HTMLCanvasElement): HTMLCanvasElement {
  const lado = origem.width;
  const saida = document.createElement("canvas");
  saida.width = lado;
  saida.height = lado;
  const ctx = saida.getContext("2d")!;
  ctx.drawImage(origem, 0, 0);
  const imagem = ctx.getImageData(0, 0, lado, lado);

  // Duas passadas dão o aspecto de pintura sem borrar o rosto.
  const pintada = pintura(pintura(imagem.data, lado, 3), lado, 2);
  const dados = imagem.data;
  dados.set(pintada);

  const lum = new Float32Array(lado * lado);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = 0.299 * dados[i * 4] + 0.587 * dados[i * 4 + 1] + 0.114 * dados[i * 4 + 2];
  }

  // Cores um pouco mais vivas e em degraus suaves (14 tons por canal).
  const NIVEIS = 14;
  for (let i = 0; i < lum.length; i++) {
    const cinza = lum[i];
    for (let c = 0; c < 3; c++) {
      const vivo = cinza + (dados[i * 4 + c] - cinza) * 1.12;
      const nivel = Math.round((Math.min(255, Math.max(0, vivo)) / 255) * (NIVEIS - 1));
      dados[i * 4 + c] = (nivel / (NIVEIS - 1)) * 255;
    }
  }

  // Contorno fino e discreto, só nas bordas realmente fortes.
  for (let y = 1; y < lado - 1; y++) {
    for (let x = 1; x < lado - 1; x++) {
      const l = (dx: number, dy: number) => lum[(y + dy) * lado + (x + dx)];
      const gx = -l(-1, -1) - 2 * l(-1, 0) - l(-1, 1) + l(1, -1) + 2 * l(1, 0) + l(1, 1);
      const gy = -l(-1, -1) - 2 * l(0, -1) - l(1, -1) + l(-1, 1) + 2 * l(0, 1) + l(1, 1);
      const forca = Math.min(1, Math.max(0, (Math.hypot(gx, gy) - 110) / 160)) * 0.55;
      if (forca > 0) {
        const i = (y * lado + x) * 4;
        for (let c = 0; c < 3; c++) dados[i + c] = dados[i + c] * (1 - forca) + 30 * forca;
      }
    }
  }

  ctx.putImageData(imagem, 0, 0);
  return saida;
}
