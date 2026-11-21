import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sessao: vi.fn(), admin: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  produto: { create: mocks.create, update: mocks.update, delete: mocks.delete },
  fornecedor: { create: mocks.create, update: mocks.update, delete: mocks.delete },
} }));
vi.mock("@/app/actions/helpers", () => ({
  exigirSessao: mocks.sessao, exigirAdmin: mocks.admin,
  comErro: (error: Error) => ({ ok: false, erro: error.message }),
}));
import { criarProduto, criarFornecedor, excluirProduto, excluirFornecedor, atualizarCustoProduto } from "@/app/actions/produtos";

describe("permissões do catálogo separado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessao.mockRejectedValue(new Error("Módulo indisponível"));
    mocks.admin.mockRejectedValue(new Error("Módulo indisponível"));
  });
  it.each([
    { nome: "criar fornecedor", acao: () => criarFornecedor("Fornecedor teste"), guarda: mocks.admin, modulo: "CADASTROS" },
    { nome: "excluir fornecedor", acao: () => excluirFornecedor("fornecedor-1"), guarda: mocks.admin, modulo: "CADASTROS" },
    { nome: "criar produto", acao: () => criarProduto("Produto teste", "fornecedor-1"), guarda: mocks.sessao, modulo: "ESTOQUE" },
    { nome: "excluir produto", acao: () => excluirProduto("produto-1"), guarda: mocks.admin, modulo: "ESTOQUE" },
    { nome: "alterar custo", acao: () => atualizarCustoProduto("produto-1", 100, 110, 70), guarda: mocks.admin, modulo: "ESTOQUE" },
  ])("bloqueia $nome antes de escrever no banco", async ({ acao, guarda, modulo }) => {
    expect(await acao()).toEqual({ ok: false, erro: "Módulo indisponível" });
    expect(guarda).toHaveBeenCalledWith(modulo);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
