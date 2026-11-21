import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test, mock } from "node:test";

test("recuperação D4Sign e webhook", async (t) => {
  process.env.D4SIGN_TOKEN_API = "teste";
  process.env.D4SIGN_WEBHOOK_HMAC_SECRET = "segredo-teste";
  process.env.SUPABASE_URL = "https://storage.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "teste";
  const delegate = () => ({ findUnique: async () => null, updateMany: async () => ({ count: 0 }) });
  const prisma = { proposta: delegate(), contrato: delegate() };
  // Substitui o cliente antes de carregar o serviço; nenhuma conexão real.
  Object.assign(globalThis, { prisma });
  const { sincronizarAssinatura } = await import("../src/lib/assinaturas");
  const { POST } = await import("../src/app/api/webhooks/d4sign/route");
  const uuid = "documento-teste";
  const dataOriginal = new Date("2026-09-24T12:00:00Z");
  const registroInicial = () => ({ id: "p1", statusAssinatura: "AGUARDANDO_ASSINATURA", assinadaEm: null as Date | null, pdfAssinadoUrl: null as string | null });
  let registro = registroInicial();
  let statusApi = "4";
  let falhaPdf = false;
  let contrato = false;
  let consultas = 0;
  let gravacoes = 0;
  const preparar = () => {
    registro = registroInicial(); statusApi = "4"; falhaPdf = false; contrato = false; consultas = 0; gravacoes = 0;
  };
  mock.method(prisma.proposta, "findUnique", async () => contrato ? null : { ...registro });
  mock.method(prisma.contrato, "findUnique", async () => contrato ? { ...registro } : null);
  const atualizar = async ({ data }: { data: Partial<typeof registro> }) => {
    gravacoes++;
    Object.assign(registro, data);
    return { count: 1 };
  };
  mock.method(prisma.proposta, "updateMany", atualizar);
  mock.method(prisma.contrato, "updateMany", atualizar);
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("storage.example.test")) return Response.json({ Key: "arquivo.pdf" });
    if (url.includes("/download")) {
      if (falhaPdf) return new Response("indisponível", { status: 503 });
      return Response.json({ url: "https://pdf.example.test/assinado.pdf" });
    }
    if (url.includes("pdf.example.test")) return new Response("%PDF-1.7 teste");
    consultas++;
    return Response.json([{ uuidDoc: uuid, statusId: statusApi }]);
  });
  const request = (tipo = "1", autenticado = true) => new Request("https://app.example.test/api/webhooks/d4sign", {
    method: "POST",
    headers: autenticado ? { "Content-Hmac": "sha256=" + crypto.createHmac("sha256", "segredo-teste").update(uuid).digest("hex") } : {},
    body: new URLSearchParams({ uuid, type_post: tipo }),
  });
  try {
    await t.test("recupera finalizado sem webhook e ignora repetição", async () => {
      preparar();
      assert.equal(await sincronizarAssinatura(uuid), "ASSINADA");
      assert.equal(registro.statusAssinatura, "ASSINADA");
      assert.ok(registro.pdfAssinadoUrl);
      const quantidade = gravacoes;
      assert.equal(await sincronizarAssinatura(uuid), "ASSINADA");
      assert.equal(gravacoes, quantidade);
      assert.equal(consultas, 1);
    });
    await t.test("webhook precoce pede nova tentativa sem marcar assinado", async () => {
      preparar(); statusApi = "3";
      assert.equal((await POST(request())).status, 503);
      assert.equal(gravacoes, 0);
    });
    await t.test("falha no PDF mantém assinatura e permite recuperar o arquivo", async () => {
      preparar(); falhaPdf = true;
      assert.equal((await POST(request())).status, 503);
      assert.equal(registro.statusAssinatura, "ASSINADA");
      assert.equal(registro.pdfAssinadoUrl, null);
      registro.assinadaEm = dataOriginal;
      falhaPdf = false;
      assert.equal((await POST(request())).status, 200);
      assert.ok(registro.pdfAssinadoUrl);
      assert.equal(registro.assinadaEm, dataOriginal);
    });
    await t.test("cancelamento depende da confirmação na API", async () => {
      preparar(); statusApi = "3";
      assert.equal((await POST(request("3"))).status, 503);
      assert.equal(gravacoes, 0);
      statusApi = "6";
      assert.equal((await POST(request("3"))).status, 200);
      assert.equal(registro.statusAssinatura, "RECUSADA");
    });
    await t.test("contratos também recuperam a assinatura", async () => {
      preparar(); contrato = true;
      assert.equal(await sincronizarAssinatura(uuid), "ASSINADA");
      assert.ok(registro.pdfAssinadoUrl);
    });
    await t.test("rejeita evento sem autenticação e ignora assinatura individual", async () => {
      preparar();
      assert.equal((await POST(request("1", false))).status, 401);
      assert.equal((await POST(request("4"))).status, 200);
      assert.equal(consultas, 0);
      assert.equal(gravacoes, 0);
    });
  } finally {
    mock.restoreAll();
  }
});
