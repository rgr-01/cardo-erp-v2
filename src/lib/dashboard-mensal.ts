const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Chaves internas usam mês UTC de 0 a 11, como Date.getUTCMonth().
// Meses sem vendas entre o primeiro e o último registro têm faturamento zero.
export function serieMensalFaturamento(totais: ReadonlyMap<string, number>): { mes: string; total: number }[] {
  const chaves = [...totais.keys()].sort();
  if (!chaves.length) return [];
  const indice = (chave: string) => {
    const [ano, mes] = chave.split("-").map(Number);
    return ano * 12 + mes;
  };
  const serie = [];
  for (let i = indice(chaves[0]); i <= indice(chaves[chaves.length - 1]); i++) {
    const ano = Math.floor(i / 12);
    const mes = i % 12;
    serie.push({ mes: `${MESES[mes]}/${String(ano).slice(-2)}`, total: totais.get(`${ano}-${String(mes).padStart(2, "0")}`) ?? 0 });
  }
  return serie;
}
