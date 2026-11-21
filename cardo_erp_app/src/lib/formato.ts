// Formatação e leitura de valores/datas nas telas (pt-BR).

import type { CategoriaDespesa } from '@/lib/api';
import type { StatusProposta } from '@/lib/servidor';

export function brl(valor: number | null | undefined): string {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function numero(valor: number | null | undefined): string {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** "22/09/2026" → ISO ao meio-dia (evita a data "voltar um dia" por fuso). */
export function isoDeDataBR(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia), 12, 0, 0);
  if (d.getDate() !== Number(dia) || d.getMonth() !== Number(mes) - 1) return null;
  return d.toISOString();
}

/** Aceita "1.234,56", "1234,56" ou "1234.56". Vazio → null. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export function textoNumero(valor: number | null | undefined): string {
  if (valor == null) return '';
  return String(valor).replace('.', ',');
}

export const CATEGORIAS_DESPESA: { valor: CategoriaDespesa; label: string }[] = [
  { valor: 'COMBUSTIVEL', label: 'Combustível' },
  { valor: 'ALIMENTACAO', label: 'Alimentação' },
  { valor: 'HOSPEDAGEM', label: 'Hospedagem' },
  { valor: 'MANUTENCAO_VEICULO', label: 'Manutenção de veículo' },
  { valor: 'PEDAGIO', label: 'Pedágio' },
  { valor: 'MATERIAL_ESCRITORIO', label: 'Material de escritório' },
  { valor: 'OUTROS', label: 'Outros' },
];

export function rotuloCategoria(categoria: CategoriaDespesa): string {
  return CATEGORIAS_DESPESA.find((c) => c.valor === categoria)?.label ?? categoria;
}

export const STATUS_PROPOSTA: { valor: StatusProposta; label: string }[] = [
  { valor: 'RASCUNHO', label: 'Rascunho' },
  { valor: 'ENVIADA', label: 'Enviada' },
  { valor: 'ACEITA', label: 'Aceita' },
  { valor: 'RECUSADA', label: 'Recusada' },
  { valor: 'CANCELADA', label: 'Cancelada' },
];

export function rotuloStatus(status: StatusProposta): string {
  return STATUS_PROPOSTA.find((s) => s.valor === status)?.label ?? status;
}

export function tomStatus(status: StatusProposta) {
  if (status === 'ACEITA') return 'sucesso' as const;
  if (status === 'RECUSADA' || status === 'CANCELADA') return 'perigo' as const;
  if (status === 'ENVIADA') return 'destaque' as const;
  return 'neutro' as const;
}

/** Busca sem acento e sem diferenciar maiúsculas. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function mensagemErro(e: unknown, padrao = 'Algo deu errado. Tente de novo.'): string {
  return e instanceof Error ? e.message : padrao;
}
