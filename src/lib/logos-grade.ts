// Logos da biblioteca (Configurações › Logos) numa imagem só, pro consultor
// escolher pelo número no WhatsApp (listar_logos em lib/whatsapp/ferramentas.ts).
import { createCanvas, loadImage } from "canvas";

export async function gerarGradeDeLogos(logos: { nome: string; url: string | null }[]): Promise<Buffer> {
  const colunas = Math.min(3, Math.max(1, logos.length));
  const linhas = Math.ceil(logos.length / colunas);
  const celula = { w: 420, h: 240 };
  const margem = 24;
  const canvas = createCanvas(margem * 2 + colunas * celula.w, margem * 2 + linhas * celula.h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const [i, logo] of logos.entries()) {
    const x = margem + (i % colunas) * celula.w;
    const y = margem + Math.floor(i / colunas) * celula.h;
    ctx.strokeStyle = "#dde4e7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + 8, y + 8, celula.w - 16, celula.h - 16, 14);
    ctx.stroke();

    if (logo.url) {
      try {
        const img = await loadImage(Buffer.from(await (await fetch(logo.url)).arrayBuffer()));
        const caixa = { w: celula.w - 80, h: celula.h - 110 };
        const escala = Math.min(caixa.w / img.width, caixa.h / img.height);
        const [w, h] = [img.width * escala, img.height * escala];
        ctx.drawImage(img, x + (celula.w - w) / 2, y + 40 + (caixa.h - h) / 2, w, h);
      } catch {
        // logo que não abre fica só com o nome
      }
    }
    ctx.fillStyle = "#e11d48";
    ctx.beginPath();
    ctx.arc(x + 34, y + 34, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), x + 34, y + 35);
    ctx.fillStyle = "#19323b";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(logo.nome.slice(0, 36), x + celula.w / 2, y + celula.h - 36);
  }
  return canvas.toBuffer("image/png");
}
