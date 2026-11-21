import { prisma } from "@/lib/prisma";
import { enviarBufferComprovante, excluirArquivo, storageConfigurado } from "@/lib/storage";
import type { CategoriaDespesa, SituacaoDespesa } from "@/generated/prisma/client";
import { CATEGORIA_POR_CONTA, CONTA_POR_CATEGORIA } from "@/lib/despesas-contas";

export async function resolverContaDespesa(opts: {
  contaId?: string | null;
  categoria?: CategoriaDespesa | null;
}): Promise<{ contaId: string | null; categoria: CategoriaDespesa }> {
  if (opts.contaId) {
    const conta = await prisma.contaDespesa.findUnique({
      where: { id: opts.contaId },
      select: { id: true, codigo: true },
    });
    if (!conta) throw new Error("Conta de despesa não encontrada.");
    return { contaId: conta.id, categoria: CATEGORIA_POR_CONTA[conta.codigo] ?? "OUTROS" };
  }
  const categoria = opts.categoria ?? "OUTROS";
  const conta = await prisma.contaDespesa.findFirst({
    where: { codigo: CONTA_POR_CATEGORIA[categoria] },
    select: { id: true },
  });
  return { contaId: conta?.id ?? null, categoria };
}

export type CamposContaPagar = {
  contaId?: string | null;
  documento?: string | null;
  vencimento?: Date | null;
  situacao?: SituacaoDespesa;
  filial?: string | null;
};

const MAX_FOTOS = 8;
const TAMANHO_MAX_BYTES = 8 * 1024 * 1024; // 8MB por foto

export type FotoEntrada = {
  buffer: Buffer;
  contentType: string;
  nomeOriginal: string;
};

export async function salvarDespesa(opts: {
  consultorId: string;
  clienteId?: string | null;
  safraId: string;
  categoria?: CategoriaDespesa;
  valor: number;
  data?: Date;
  estabelecimento?: string | null;
  descricao?: string | null;
  origemOcr?: boolean;
  fotos?: FotoEntrada[];
} & CamposContaPagar) {
  const fotos = opts.fotos ?? [];

  if (fotos.length > MAX_FOTOS) {
    throw new Error(`Máximo de ${MAX_FOTOS} fotos por despesa.`);
  }
  for (const foto of fotos) {
    if (foto.buffer.byteLength > TAMANHO_MAX_BYTES) {
      throw new Error(`A foto "${foto.nomeOriginal}" excede 8MB.`);
    }
  }
  if (fotos.length > 0 && !storageConfigurado()) {
    throw new Error("Storage de fotos ainda não configurado.");
  }

  const { contaId, categoria } = await resolverContaDespesa(opts);

  const despesa = await prisma.despesa.create({
    data: {
      consultorId: opts.consultorId,
      clienteId: opts.clienteId || null,
      safraId: opts.safraId,
      categoria,
      contaId,
      documento: opts.documento || null,
      vencimento: opts.vencimento ?? null,
      situacao: opts.situacao ?? "PAGO",
      filial: opts.filial || null,
      valor: opts.valor,
      data: opts.data ?? new Date(),
      estabelecimento: opts.estabelecimento || null,
      descricao: opts.descricao || null,
      origemOcr: opts.origemOcr ?? false,
    },
  });

  if (fotos.length > 0) {
    const enviadas = await Promise.all(
      fotos.map((f) =>
        enviarBufferComprovante(f.buffer, f.contentType, f.nomeOriginal, despesa.id)
      )
    );
    await prisma.fotoDespesa.createMany({
      data: enviadas.map((f, i) => ({
        despesaId: despesa.id,
        url: f.url,
        path: f.path,
        ordem: i,
      })),
    });
  }

  return despesa;
}

export async function atualizarDespesaPorId(
  id: string,
  opts: {
    clienteId?: string | null;
    categoria?: CategoriaDespesa;
    valor: number;
    data?: Date;
    estabelecimento?: string | null;
    descricao?: string | null;
    fotosNovas?: FotoEntrada[];
  } & CamposContaPagar
) {
  const fotosNovas = opts.fotosNovas ?? [];
  const existentes = await prisma.fotoDespesa.count({ where: { despesaId: id } });

  if (existentes + fotosNovas.length > MAX_FOTOS) {
    throw new Error(`Máximo de ${MAX_FOTOS} fotos por despesa.`);
  }
  for (const foto of fotosNovas) {
    if (foto.buffer.byteLength > TAMANHO_MAX_BYTES) {
      throw new Error(`A foto "${foto.nomeOriginal}" excede 8MB.`);
    }
  }
  if (fotosNovas.length > 0 && !storageConfigurado()) {
    throw new Error("Storage de fotos ainda não configurado.");
  }

  // Sem conta nem categoria na edição (cliente antigo do app): mantém a atual.
  const conta =
    opts.contaId || opts.categoria ? await resolverContaDespesa(opts) : null;

  const despesa = await prisma.despesa.update({
    where: { id },
    data: {
      clienteId: opts.clienteId || null,
      ...(conta ? { categoria: conta.categoria, contaId: conta.contaId } : {}),
      documento: opts.documento || null,
      vencimento: opts.vencimento ?? null,
      ...(opts.situacao ? { situacao: opts.situacao } : {}),
      filial: opts.filial || null,
      valor: opts.valor,
      data: opts.data ?? undefined,
      estabelecimento: opts.estabelecimento || null,
      descricao: opts.descricao || null,
    },
  });

  if (fotosNovas.length > 0) {
    const enviadas = await Promise.all(
      fotosNovas.map((f) =>
        enviarBufferComprovante(f.buffer, f.contentType, f.nomeOriginal, id)
      )
    );
    await prisma.fotoDespesa.createMany({
      data: enviadas.map((f, i) => ({
        despesaId: id,
        url: f.url,
        path: f.path,
        ordem: existentes + i,
      })),
    });
  }

  return despesa;
}

export async function excluirFotoDespesaPorId(fotoId: string) {
  const foto = await prisma.fotoDespesa.findUnique({ where: { id: fotoId } });
  if (!foto) throw new Error("Foto não encontrada.");

  await prisma.fotoDespesa.delete({ where: { id: fotoId } });

  if (storageConfigurado()) {
    await excluirArquivo(foto.path).catch(() => {});
  }

  return foto;
}

export async function excluirDespesaPorId(id: string) {
  const despesa = await prisma.despesa.findUnique({
    where: { id },
    include: { fotos: true },
  });
  if (!despesa) throw new Error("Despesa não encontrada.");

  await prisma.despesa.delete({ where: { id } });

  if (storageConfigurado()) {
    await Promise.all(
      despesa.fotos.map((f) => excluirArquivo(f.path).catch(() => {}))
    );
  }

  return despesa;
}
