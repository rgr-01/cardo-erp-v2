// Unidades de medida padronizadas pra item de orçamento/pedido — usado no
// formulário Web (OrcamentoWizard) e pelo bot do WhatsApp (criar_orcamento em
// lib/whatsapp/ferramentas.ts), e mandado como unidade_comercial/
// unidade_tributavel pra Focus NFe (ver lib/servicos/financeiro.ts).
// Abreviações fixas evitam variação ("litro"/"L"/"Lts") de pedido pra pedido.
export const UNIDADES_ITEM = ["Lt", "ml", "Kg", "g", "Ton", "Sc", "Cx", "Un", "Dose"] as const;

export type UnidadeItem = (typeof UNIDADES_ITEM)[number];
