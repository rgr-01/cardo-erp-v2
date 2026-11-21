type ClienteParaAssinatura = {
  nome: string;
  documento: string | null;
  razaoSocial: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
};

// Regra compartilhada entre propostas e contratos: sem esses dados o PDF/D4Sign
// falha na hora de enviar pra assinatura, entao bloqueia antes, na UI.
export function clienteCompleto(cliente: ClienteParaAssinatura): boolean {
  return camposFaltantes(cliente).length === 0;
}

// Mesma regra de clienteCompleto, mas descreve o que falta — usado pelo bot
// do WhatsApp (checar_pedido_para_assinatura) pra descrever exatamente os
// campos faltando em vez de so' dizer "incompleto". E-mail e' obrigatorio
// (e' pra onde o D4Sign manda o link de assinatura eletronica) — telefone e'
// so informativo, nunca trava.
export function camposFaltantes(cliente: ClienteParaAssinatura): string[] {
  const faltando: string[] = [];
  if (!cliente.documento) faltando.push("CPF/CNPJ");
  if (!cliente.endereco) faltando.push("endereço");
  if (!cliente.cidade) faltando.push("cidade");
  if (!cliente.uf) faltando.push("UF");
  if (!cliente.cep) faltando.push("CEP");
  if (!cliente.email) faltando.push("e-mail");
  return faltando;
}
