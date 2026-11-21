import { z } from "zod";

const textoOpcional = (limite: number) => z.string().trim().max(limite).nullish()
  .transform((texto) => texto || null);

// Dígitos exatos (não só limite de tamanho) — "3808" ou "5.10" passariam no
// textoOpcional acima mas a SEFAZ rejeita NCM/CFOP fora do formato completo.
const codigoNumerico = (digitos: number, nomeCampo: string) =>
  z.string().trim().nullish()
    .transform((texto) => texto || null)
    .refine(
      (texto) => texto === null || new RegExp(`^\\d{${digitos}}$`).test(texto),
      { message: `${nomeCampo} deve ter exatamente ${digitos} dígitos numéricos.` }
    );

export const detalhesProdutoSchema = z.object({
  ingredienteAtivo: textoOpcional(2000),
  embalagem: textoOpcional(300),
  recomendacao: textoOpcional(4000),
  // NCM (8 dígitos) e CFOP (4 dígitos) — exigidos pela SEFAZ pra emitir NF-e
  // via Focus NFe (ver lib/servicos/financeiro.ts); sem eles a emissão
  // automática desse produto fica bloqueada, mas o cadastro em si não exige.
  ncm: codigoNumerico(8, "NCM"),
  cfop: codigoNumerico(4, "CFOP"),
});

export type DetalhesProdutoInput = z.input<typeof detalhesProdutoSchema>;

export const editarProdutoSchema = detalhesProdutoSchema.extend({
  nome: z.string().trim().min(1, "Informe o nome do produto.").max(300),
  fornecedorId: z.string().min(1, "Selecione o fornecedor."),
  custoAvista: z.number().nonnegative().nullable(),
  custoAprazo: z.number().nonnegative().nullable(),
});
export type EditarProdutoInput = z.input<typeof editarProdutoSchema>;
