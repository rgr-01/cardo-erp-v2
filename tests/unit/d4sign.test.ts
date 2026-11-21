import { describe, expect, it } from "vitest";
import { extrairSignatarios } from "@/lib/d4sign";

describe("extrairSignatarios", () => {
  it("le o link presencial do retorno do createlist", () => {
    const resposta = {
      message: [
        {
          key_signer: "abc",
          email: "cliente@x.com",
          assinatura_presencial: "1",
          assinatura_presencial_link: "https://secure.d4sign.com.br/presencial/abc",
        },
        { key_signer: "def", email: "extra@x.com", assinatura_presencial_link: "" },
      ],
    };
    expect(extrairSignatarios(resposta)).toEqual([
      { email: "cliente@x.com", keySigner: "abc", link: "https://secure.d4sign.com.br/presencial/abc" },
      { email: "extra@x.com", keySigner: "def", link: null },
    ]);
  });

  it("acha signatarios aninhados no retorno do /list", () => {
    const resposta = [{ uuidDoc: "u1", list: [{ email: "c@x.com", key_signer: "k1" }] }];
    expect(extrairSignatarios(resposta)).toEqual([{ email: "c@x.com", keySigner: "k1", link: null }]);
  });

  it("ignora resposta vazia ou sem signatario", () => {
    expect(extrairSignatarios(null)).toEqual([]);
    expect(extrairSignatarios({ message: "ok" })).toEqual([]);
  });
});
