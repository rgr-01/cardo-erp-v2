import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const banco = vi.hoisted(() => ({ findUnique: vi.fn() }));
const permissoes = vi.hoisted(() => ({ modulosDoUsuario: vi.fn() }));
vi.mock("@/lib/modulos-servidor", () => permissoes);

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: banco.findUnique } },
}));
import { emitirTokenMobile, exigirSessaoMobile, verificarTokenMobile } from "@/lib/mobile-auth";

const secretOriginal = process.env.MOBILE_JWT_SECRET;

describe("autenticação móvel", () => {
  beforeEach(() => {
    permissoes.modulosDoUsuario.mockResolvedValue(["CADASTROS", "ESTOQUE", "VENDAS", "ERP", "VISITAS", "DESPESAS"]);
    process.env.MOBILE_JWT_SECRET = "segredo-de-teste-com-tamanho-suficiente";
    banco.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({
        nome: where.id === "admin-1" ? "Carlos" : "Ana",
        role: where.id === "admin-1" ? "ADMIN" : "CONSULTOR",
        ativo: true,
        versaoSessao: 0,
      })
    );
  });

  afterEach(() => {
    banco.findUnique.mockReset();
    if (secretOriginal === undefined) delete process.env.MOBILE_JWT_SECRET;
    else process.env.MOBILE_JWT_SECRET = secretOriginal;
  });

  it("emite e valida um token com a identidade e papel do usuário", async () => {
    const token = await emitirTokenMobile({ id: "usuario-1", nome: "Ana", role: "CONSULTOR" });

    await expect(verificarTokenMobile(token)).resolves.toEqual({
      id: "usuario-1",
      nome: "Ana",
      role: "CONSULTOR",
    });
  });

  it("rejeita token inválido e cabeçalho ausente", async () => {
    await expect(verificarTokenMobile("token-inválido")).resolves.toBeNull();
    await expect(exigirSessaoMobile(new Request("https://redeagro.test/api/mobile/clientes"))).rejects.toThrow(
      "Não autenticado"
    );
  });

  it("invalida o token quando a sessão do usuário é revogada", async () => {
    const token = await emitirTokenMobile({ id: "usuario-1", nome: "Ana", role: "CONSULTOR" });
    banco.findUnique.mockResolvedValueOnce({
      nome: "Ana",
      role: "CONSULTOR",
      ativo: true,
      versaoSessao: 1,
    });

    await expect(verificarTokenMobile(token)).resolves.toBeNull();
  });

  it("aceita apenas o esquema Bearer", async () => {
    const token = await emitirTokenMobile({ id: "admin-1", nome: "Carlos", role: "ADMIN" });
    const request = new Request("https://redeagro.test/api/mobile/clientes", {
      headers: { Authorization: `Bearer ${token}` },
    });

    await expect(exigirSessaoMobile(request)).resolves.toEqual({
      id: "admin-1",
      nome: "Carlos",
      role: "ADMIN",
    });
  });

  it("permite consultar o catálogo com Estoque ou Gestão comercial e recusa outros módulos", async () => {
    const token = await emitirTokenMobile({ id: "admin-1", nome: "Carlos", role: "ADMIN" });
    const request = new Request("https://redeagro.test/api/mobile/produtos", { headers: { Authorization: `Bearer ${token}` } });
    permissoes.modulosDoUsuario.mockResolvedValue(["ESTOQUE"]);
    await expect(exigirSessaoMobile(request)).resolves.toMatchObject({ id: "admin-1" });
    permissoes.modulosDoUsuario.mockResolvedValue(["VENDAS"]);
    await expect(exigirSessaoMobile(request)).resolves.toMatchObject({ id: "admin-1" });
    permissoes.modulosDoUsuario.mockResolvedValue(["VISITAS"]);
    await expect(exigirSessaoMobile(request)).rejects.toThrow("módulo");
  });

  it("compartilha seletores de clientes mas protege alterações pelo módulo Cadastros", async () => {
    const token = await emitirTokenMobile({ id: "admin-1", nome: "Carlos", role: "ADMIN" });
    const headers = { Authorization: `Bearer ${token}` };
    permissoes.modulosDoUsuario.mockResolvedValue(["VISITAS"]);
    await expect(exigirSessaoMobile(new Request("https://redeagro.test/api/mobile/clientes", { headers }))).resolves.toMatchObject({ id: "admin-1" });
    await expect(exigirSessaoMobile(new Request("https://redeagro.test/api/mobile/clientes", { headers, method: "POST" }))).rejects.toThrow("módulo");
    permissoes.modulosDoUsuario.mockResolvedValue(["CADASTROS"]);
    await expect(exigirSessaoMobile(new Request("https://redeagro.test/api/mobile/clientes", { headers, method: "POST" }))).resolves.toMatchObject({ id: "admin-1" });
  });
});
