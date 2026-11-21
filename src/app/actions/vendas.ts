"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSafraAtualId } from "@/lib/safra-atual";
import { STATUS_LABELS, STATUS_EDITAVEL_MANUAL, fmtBRL, type Status } from "@/lib/format";
import { numeroDecimal } from "@/lib/dinheiro";
import {
  exigirSessao,
  exigirAdmin,
  comErro,
  type Sessao,
  type ResultadoAcao,
} from "@/app/actions/helpers";

const vendaSchema = z.object({
  clienteId: z.string().min(1, "Cliente é obrigatório"),
  produtoId: z.string().min(1, "Produto é obrigatório"),
  consultorId: z.string().optional(),
  cultura: z.string().nullish(),
  volume: z.coerce.number().nonnegative().nullish(),
  valorUnitario: z.coerce.number().nonnegative().nullish(),
  condicaoPagamentoTipo: z.enum(["AVISTA", "APRAZO"]).default("AVISTA"),
  status: z.enum([
    "PROSPECCAO",
    "NEGOCIACAO",
    "FECHADO",
    "EM_CARTEIRA",
    "FATURADO",
    "CANCELADO",
  ]),
  dataFechamento: z.string().nullish(),
  previsaoEntrega: z.string().nullish(),
  observacoes: z.string().nullish(),
});

export type VendaInput = z.input<typeof vendaSchema>;

function paraData(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function montarDados(
  dados: z.output<typeof vendaSchema>,
  consultorId: string,
  safraId: string
) {
  const volume = dados.volume ?? null;
  const valorUnitario = dados.valorUnitario ?? null;
  return {
    clienteId: dados.clienteId,
    produtoId: dados.produtoId,
    consultorId,
    cultura: dados.cultura || null,
    volume,
    condicaoPagamentoTipo: dados.condicaoPagamentoTipo,
    valorUnitario,
    valorTotal: (volume ?? 0) * (valorUnitario ?? 0),
    status: dados.status,
    dataFechamento: paraData(dados.dataFechamento),
    previsaoEntrega: paraData(dados.previsaoEntrega),
    observacoes: dados.observacoes || null,
    safraId,
  };
}

function revalidar() {
  revalidatePath("/vendas");
  revalidatePath("/dashboard");
  revalidatePath("/historico");
}

async function registrar(sessao: Sessao, acao: string, detalhes: string) {
  await prisma.historico.create({
    data: {
      usuarioNome: sessao.nome,
      acao,
      entidade: "VENDA",
      detalhes,
    },
  });
}

const VENDA_INCLUDE = {
  cliente: { select: { nome: true } },
  produto: { select: { nome: true } },
} as const;

function fmtDataLog(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

export async function criarVenda(input: VendaInput): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    const dados = vendaSchema.parse(input);
    const consultorId =
      sessao.role === "ADMIN" && dados.consultorId
        ? dados.consultorId
        : sessao.id;
    const safraId = await getSafraAtualId();
    const venda = await prisma.venda.create({
      data: montarDados(dados, consultorId, safraId),
      include: VENDA_INCLUDE,
    });
    await registrar(
      sessao,
      "Criou",
      `${venda.cliente.nome} — ${venda.produto.nome} (${fmtBRL(numeroDecimal(venda.valorTotal))}, ${STATUS_LABELS[venda.status as Status]})`
    );
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarVenda(
  id: string,
  input: VendaInput
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    const existente = await prisma.venda.findUniqueOrThrow({
      where: { id },
      include: VENDA_INCLUDE,
    });
    if (sessao.role !== "ADMIN" && existente.consultorId !== sessao.id) {
      throw new Error("Você só pode editar suas próprias vendas.");
    }
    if (existente.status === "EM_CARTEIRA" || existente.status === "FATURADO") {
      throw new Error(
        `Venda "${STATUS_LABELS[existente.status as Status]}" já foi finalizada e não pode mais ser editada.`
      );
    }
    const dados = vendaSchema.parse(input);
    // Fechado/Em carteira/Faturado so' pelos fluxos automaticos (fechar
    // negocio, conferencia final, Financeiro) — nunca editando a venda direto,
    // senao da pra pular etapas do processo (ver STATUS_EDITAVEL_MANUAL).
    if (dados.status !== existente.status && !STATUS_EDITAVEL_MANUAL.includes(dados.status)) {
      throw new Error(
        `Status "${STATUS_LABELS[dados.status]}" só é atingido automaticamente pelo fluxo do pedido, não editando a venda direto.`
      );
    }
    const consultorId =
      sessao.role === "ADMIN" && dados.consultorId
        ? dados.consultorId
        : existente.consultorId;
    const nova = await prisma.venda.update({
      where: { id },
      data: montarDados(dados, consultorId, existente.safraId),
      include: VENDA_INCLUDE,
    });

    const mudancas: string[] = [];
    if (existente.status !== nova.status)
      mudancas.push(
        `status: ${STATUS_LABELS[existente.status as Status]} → ${STATUS_LABELS[nova.status as Status]}`
      );
    if (existente.clienteId !== nova.clienteId)
      mudancas.push(`cliente: ${existente.cliente.nome} → ${nova.cliente.nome}`);
    if (existente.produtoId !== nova.produtoId)
      mudancas.push(`produto: ${existente.produto.nome} → ${nova.produto.nome}`);
    if ((existente.volume ?? null) !== (nova.volume ?? null))
      mudancas.push(`volume: ${existente.volume ?? "—"} → ${nova.volume ?? "—"}`);
    if ((existente.valorUnitario ?? null) !== (nova.valorUnitario ?? null))
      mudancas.push(
        `valor unit.: ${existente.valorUnitario ?? "—"} → ${nova.valorUnitario ?? "—"}`
      );
    if ((existente.cultura ?? "") !== (nova.cultura ?? ""))
      mudancas.push(`cultura: ${existente.cultura ?? "—"} → ${nova.cultura ?? "—"}`);
    if (existente.dataFechamento?.getTime() !== nova.dataFechamento?.getTime())
      mudancas.push(
        `fechamento: ${fmtDataLog(existente.dataFechamento)} → ${fmtDataLog(nova.dataFechamento)}`
      );
    if (existente.previsaoEntrega?.getTime() !== nova.previsaoEntrega?.getTime())
      mudancas.push(
        `entrega: ${fmtDataLog(existente.previsaoEntrega)} → ${fmtDataLog(nova.previsaoEntrega)}`
      );
    if ((existente.observacoes ?? "") !== (nova.observacoes ?? ""))
      mudancas.push("observações alteradas");

    await registrar(
      sessao,
      "Atualizou",
      `${nova.cliente.nome} — ${nova.produto.nome}: ${
        mudancas.length > 0 ? mudancas.join("; ") : "sem alterações de campos"
      }`
    );
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirVenda(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    const existente = await prisma.venda.findUniqueOrThrow({
      where: { id },
      include: VENDA_INCLUDE,
    });
    if (sessao.role !== "ADMIN" && existente.consultorId !== sessao.id) {
      throw new Error("Você só pode excluir suas próprias vendas.");
    }
    // Em carteira/Faturado nunca somem: viram Cancelado e ficam no historico.
    const finalizada = existente.status === "EM_CARTEIRA" || existente.status === "FATURADO";
    if (sessao.role === "ADMIN" && !finalizada) {
      await prisma.venda.delete({ where: { id } });
      await registrar(
        sessao,
        "Excluiu",
        `${existente.cliente.nome} — ${existente.produto.nome} (${fmtBRL(numeroDecimal(existente.valorTotal))})`
      );
    } else {
      await prisma.venda.update({ where: { id }, data: { status: "CANCELADO" } });
      await registrar(
        sessao,
        "Cancelou",
        `${existente.cliente.nome} — ${existente.produto.nome} (${fmtBRL(numeroDecimal(existente.valorTotal))})`
      );
    }
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// ---------------- Ações em massa (seleção de linhas) ----------------

async function vendasSelecionadas(sessao: Sessao, ids: string[]) {
  if (ids.length === 0) throw new Error("Nenhuma venda selecionada.");
  const vendas = await prisma.venda.findMany({
    where: { id: { in: ids } },
    include: VENDA_INCLUDE,
  });
  if (sessao.role !== "ADMIN") {
    const alheia = vendas.some((v) => v.consultorId !== sessao.id);
    if (alheia) throw new Error("Você só pode alterar suas próprias vendas.");
  }
  return vendas;
}

export async function duplicarVendas(ids: string[]): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    const vendas = await vendasSelecionadas(sessao, ids);
    await prisma.$transaction(
      vendas.map((v) =>
        prisma.venda.create({
          data: {
            clienteId: v.clienteId,
            produtoId: v.produtoId,
            consultorId: v.consultorId,
            cultura: v.cultura,
            volume: v.volume,
            valorUnitario: v.valorUnitario,
            valorTotal: v.valorTotal,
            status: v.status,
            dataFechamento: v.dataFechamento,
            previsaoEntrega: v.previsaoEntrega,
            observacoes: v.observacoes,
            safraId: v.safraId,
          },
        })
      )
    );
    await registrar(sessao, "Duplicou", `${vendas.length} venda(s)`);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirVendas(ids: string[]): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    const vendas = await vendasSelecionadas(sessao, ids);
    // Em carteira/Faturado nunca sao excluidas: viram Cancelado (historico).
    const finalizadas = vendas
      .filter((v) => v.status === "EM_CARTEIRA" || v.status === "FATURADO")
      .map((v) => v.id);
    const excluiveis = sessao.role === "ADMIN" ? ids.filter((id) => !finalizadas.includes(id)) : [];
    const aCancelar = ids.filter((id) => !excluiveis.includes(id));
    if (excluiveis.length > 0) {
      await prisma.venda.deleteMany({ where: { id: { in: excluiveis } } });
      await registrar(sessao, "Excluiu", `${excluiveis.length} venda(s)`);
    }
    if (aCancelar.length > 0) {
      await prisma.venda.updateMany({
        where: { id: { in: aCancelar } },
        data: { status: "CANCELADO" },
      });
      await registrar(sessao, "Cancelou", `${aCancelar.length} venda(s)`);
    }
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function transferirSafraVendas(
  ids: string[],
  safraId: string
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    if (!safraId) throw new Error("Informe a safra de destino.");
    const vendas = await vendasSelecionadas(sessao, ids);
    const safra = await prisma.safra.findUniqueOrThrow({
      where: { id: safraId },
    });
    await prisma.venda.updateMany({
      where: { id: { in: ids } },
      data: { safraId },
    });
    await registrar(
      sessao,
      "Transferiu safra",
      `${vendas.length} venda(s) → safra ${safra.nome}`
    );
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function transferirConsultorVendas(
  ids: string[],
  consultorId: string
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirAdmin("VENDAS");
    const vendas = await vendasSelecionadas(sessao, ids);
    const consultor = await prisma.user.findUniqueOrThrow({
      where: { id: consultorId },
    });
    await prisma.venda.updateMany({
      where: { id: { in: ids } },
      data: { consultorId },
    });
    await registrar(
      sessao,
      "Transferiu consultor",
      `${vendas.length} venda(s) → ${consultor.nome}`
    );
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function transferirStatusVendas(
  ids: string[],
  status: Status
): Promise<ResultadoAcao> {
  try {
    if (!STATUS_EDITAVEL_MANUAL.includes(status)) {
      throw new Error(
        `Status "${STATUS_LABELS[status]}" só é atingido automaticamente pelo fluxo do pedido, não transferindo vendas em massa.`
      );
    }
    const sessao = await exigirSessao("VENDAS");
    const vendas = await vendasSelecionadas(sessao, ids);
    await prisma.venda.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    await registrar(
      sessao,
      "Transferiu status",
      `${vendas.length} venda(s) → ${STATUS_LABELS[status]}`
    );
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// ---------------- Importação em massa (Excel) ----------------

const STATUS_POR_LABEL: Record<string, Status> = {
  "prospecção": "PROSPECCAO",
  prospeccao: "PROSPECCAO",
  "negociação": "NEGOCIACAO",
  negociacao: "NEGOCIACAO",
  fechado: "FECHADO",
  "aguardando conferência": "FECHADO",
  "aguardando conferencia": "FECHADO",
  "em carteira": "EM_CARTEIRA",
  faturado: "FATURADO",
  cancelado: "CANCELADO",
};

export type LinhaImportacao = {
  cliente: string;
  fornecedor: string;
  produto: string;
  cultura?: string;
  volume?: string | number;
  valorUnitario?: string | number;
  status?: string;
  dataFechamento?: string | Date;
  previsaoEntrega?: string | Date;
  observacoes?: string;
  consultor?: string;
};

export type ResultadoImportacao =
  | { ok: true; criadas: number; atualizadas: number; erros: string[] }
  | { ok: false; erro: string };

function numBR(v: string | number | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const limpo = v.trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? null : n;
}

function dataBR(v: string | Date | undefined): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const t = v.trim();
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const ano = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    return new Date(Date.UTC(ano, Number(br[2]) - 1, Number(br[1])));
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

export async function importarVendas(
  linhas: LinhaImportacao[],
  consultorPadraoId?: string
): Promise<ResultadoImportacao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    if (linhas.length === 0) throw new Error("Nenhuma linha para importar.");
    if (linhas.length > 2000)
      throw new Error("Máximo de 2000 linhas por importação.");

    const erros: string[] = [];
    let criadas = 0;
    let atualizadas = 0;
    const safraId = await getSafraAtualId();

    const consultores =
      sessao.role === "ADMIN"
        ? await prisma.user.findMany({ select: { id: true, nome: true } })
        : [];

    let consultorPadrao = sessao.id;
    if (sessao.role === "ADMIN" && consultorPadraoId) {
      const existe = consultores.some((c) => c.id === consultorPadraoId);
      if (!existe) throw new Error("Consultor padrão selecionado não encontrado.");
      consultorPadrao = consultorPadraoId;
    }

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const num = i + 2; // +cabeçalho, 1-based
      try {
        const clienteNome = linha.cliente?.trim();
        const fornecedorNome = linha.fornecedor?.trim();
        const produtoNome = linha.produto?.trim();
        if (!clienteNome || !fornecedorNome || !produtoNome) {
          erros.push(`Linha ${num}: cliente, fornecedor e produto são obrigatórios.`);
          continue;
        }

        const cliente =
          (await prisma.cliente.findFirst({
            where: { nome: { equals: clienteNome, mode: "insensitive" } },
          })) ??
          (await prisma.cliente.create({ data: { nome: clienteNome } }));

        const fornecedor =
          (await prisma.fornecedor.findFirst({
            where: { nome: { equals: fornecedorNome, mode: "insensitive" } },
          })) ??
          (await prisma.fornecedor.create({ data: { nome: fornecedorNome } }));

        const produto =
          (await prisma.produto.findFirst({
            where: {
              nome: { equals: produtoNome, mode: "insensitive" },
              fornecedorId: fornecedor.id,
            },
          })) ??
          (await prisma.produto.create({
            data: { nome: produtoNome, fornecedorId: fornecedor.id },
          }));

        let consultorId = consultorPadrao;
        if (sessao.role === "ADMIN" && linha.consultor?.trim()) {
          const c = consultores.find(
            (u) => u.nome.toLowerCase() === linha.consultor!.trim().toLowerCase()
          );
          if (!c) {
            erros.push(`Linha ${num}: consultor "${linha.consultor}" não encontrado.`);
            continue;
          }
          consultorId = c.id;
        }

        const statusBruto = linha.status?.trim().toLowerCase();
        const status = statusBruto
          ? STATUS_POR_LABEL[statusBruto]
          : "PROSPECCAO";
        if (statusBruto && !status) {
          erros.push(`Linha ${num}: status "${linha.status}" inválido.`);
          continue;
        }

        const volume = numBR(linha.volume);
        const valorUnitario = numBR(linha.valorUnitario);
        const dados = {
          cultura: linha.cultura?.trim() || null,
          volume,
          valorUnitario,
          valorTotal: (volume ?? 0) * (valorUnitario ?? 0),
          status: status ?? "PROSPECCAO",
          dataFechamento: dataBR(linha.dataFechamento),
          previsaoEntrega: dataBR(linha.previsaoEntrega),
          observacoes: linha.observacoes?.trim() || null,
        };

        // Só conta como "a mesma venda" (atualiza) se TODOS os campos forem
        // idênticos a uma venda já existente do mesmo cliente + produto na
        // safra atual. Qualquer diferença (volume, valor, status, datas,
        // cultura, observações) vira venda nova em vez de sobrescrever.
        const candidatas = await prisma.venda.findMany({
          where: { clienteId: cliente.id, produtoId: produto.id, safraId },
        });
        const existente = candidatas.find(
          (v) =>
            (v.cultura ?? null) === dados.cultura &&
            (v.volume ?? null) === dados.volume &&
            (v.valorUnitario ?? null) === dados.valorUnitario &&
            v.status === dados.status &&
            (v.dataFechamento?.getTime() ?? null) ===
              (dados.dataFechamento?.getTime() ?? null) &&
            (v.previsaoEntrega?.getTime() ?? null) ===
              (dados.previsaoEntrega?.getTime() ?? null) &&
            (v.observacoes ?? null) === dados.observacoes
        );

        if (existente) {
          if (sessao.role !== "ADMIN" && existente.consultorId !== sessao.id) {
            erros.push(
              `Linha ${num}: já existe uma venda idêntica de ${produtoNome} para ${clienteNome} de outro consultor; não foi possível atualizar.`
            );
            continue;
          }
          await prisma.venda.update({ where: { id: existente.id }, data: dados });
          atualizadas++;
        } else {
          await prisma.venda.create({
            data: { clienteId: cliente.id, produtoId: produto.id, consultorId, safraId, ...dados },
          });
          criadas++;
        }
      } catch (e) {
        erros.push(
          `Linha ${num}: ${e instanceof Error ? e.message : "erro inesperado"}`
        );
      }
    }

    await registrar(
      sessao,
      "Importou",
      `${criadas} venda(s) criada(s), ${atualizadas} atualizada(s) via Excel${erros.length > 0 ? ` (${erros.length} linha(s) com erro)` : ""}`
    );
    revalidar();
    revalidatePath("/clientes");
    revalidatePath("/localizacao");
    revalidatePath("/produtos");
    return { ok: true, criadas, atualizadas, erros };
  } catch (error) {
    const r = comErro(error);
    return { ok: false, erro: r.ok ? "" : r.erro };
  }
}
