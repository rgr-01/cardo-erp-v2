// Busca de cliente por nome tolerante a erro: o nome chega digitado às
// pressas ou transcrito de áudio ("zé claudio", "santa ritta", "joao silva"
// pra "João da Silva"), e a busca por trecho exato voltava vazia.

export function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Palavras que não ajudam a distinguir um nome do outro.
const IRRELEVANTES = new Set([
  "da", "de", "do", "das", "dos", "e", "a", "o",
  "seu", "sr", "sra", "dona", "dna",
  "fazenda", "faz", "sitio", "chacara", "estancia", "agro", "agropecuaria", "ltda", "me",
]);

function palavras(texto: string): string[] {
  return normalizarNome(texto)
    .split(" ")
    .filter((p) => p && !IRRELEVANTES.has(p));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
    }
    anterior = atual;
  }
  return anterior[b.length];
}

// Apelidos que o consultor usa no lugar do nome de registro.
const APELIDOS: Record<string, string[]> = {
  ze: ["jose"], zeca: ["jose"], juca: ["jose"],
  chico: ["francisco"], chiquinho: ["francisco"],
  tiao: ["sebastiao"], bastiao: ["sebastiao"],
  toninho: ["antonio"], tonho: ["antonio"], tone: ["antonio"],
  quinzinho: ["joaquim"], quim: ["joaquim"],
  duda: ["eduardo"], dudu: ["eduardo"],
  beto: ["roberto", "alberto", "humberto", "gilberto"],
  zinho: ["jose"], guto: ["augusto", "gustavo"], gu: ["gustavo"],
  nando: ["fernando"], fernandinho: ["fernando"],
  lu: ["luiz", "luis", "lucas", "luciano"], carlinhos: ["carlos"], cacau: ["claudio"],
  paulinho: ["paulo"], pedrinho: ["pedro"], joaozinho: ["joao"], manel: ["manoel", "manuel"],
  mane: ["manoel", "manuel"], ditinho: ["benedito"], dito: ["benedito"],
  vado: ["osvaldo", "valdomiro"], neco: ["manoel"],
};

// 0 a 1: quanto uma palavra digitada parece uma palavra do nome.
function semelhancaPalavra(digitada: string, doNome: string): number {
  if (digitada === doNome) return 1;
  if (APELIDOS[digitada]?.includes(doNome)) return 0.95;
  // Começo de palavra ("zé" → "zeca", "joao" → "joaozinho") conta bastante.
  if (digitada.length >= 2 && doNome.startsWith(digitada)) return 0.9;
  if (doNome.length >= 3 && digitada.startsWith(doNome)) return 0.8;
  const maior = Math.max(digitada.length, doNome.length);
  return 1 - levenshtein(digitada, doNome) / maior;
}

// Nota do nome pro termo: média, pra cada palavra digitada, da palavra mais
// parecida do nome — a ordem não importa ("silva joao" acha "João da Silva").
// Também compara tudo junto, sem espaço ("zeclaudio" x "ze claudio").
export function semelhancaNome(termo: string, nome: string): number {
  const doTermo = palavras(termo);
  const doNome = palavras(nome);
  if (doTermo.length === 0 || doNome.length === 0) return 0;

  const porPalavra =
    doTermo.reduce(
      (soma, p) => soma + Math.max(...doNome.map((n) => semelhancaPalavra(p, n))),
      0
    ) / doTermo.length;

  const juntoTermo = doTermo.join("");
  const juntoNome = doNome.join("");
  const junto = 1 - levenshtein(juntoTermo, juntoNome) / Math.max(juntoTermo.length, juntoNome.length);

  return Math.max(porPalavra, junto);
}

// Termo aparece como está, ou todas as palavras dele aparecem no nome.
export function contemNome(termo: string, nome: string): boolean {
  const t = normalizarNome(termo);
  const n = normalizarNome(nome);
  if (!t) return false;
  // Trecho no meio da palavra só com termo mais longo: "ze" não pode achar
  // "Fazenda Santa Rita".
  if (t.length >= 4 && n.includes(t)) return true;
  const doTermo = palavras(termo);
  return (
    doTermo.length > 0 &&
    doTermo.every((p) =>
      n.split(" ").some((w) => w.startsWith(p) || APELIDOS[p]?.includes(w))
    )
  );
}

// Abaixo disso, o nome não é sugerido.
export const SEMELHANCA_MINIMA = 0.6;
