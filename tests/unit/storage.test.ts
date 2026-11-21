import { describe, expect, it } from "vitest";
import { validarImagem } from "@/lib/storage";

describe("validarImagem", () => {
  it("identifica JPEG pelo conteudo, independentemente do tipo informado pelo navegador", () => {
    expect(validarImagem(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toEqual({
      contentType: "image/jpeg",
      extensao: "jpg",
    });
  });

  it("rejeita arquivo que apenas se apresenta como imagem", () => {
    expect(() => validarImagem(Buffer.from("not an image"))).toThrow("JPEG, PNG ou WebP");
  });
});
