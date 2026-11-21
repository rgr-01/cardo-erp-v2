"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import {
  importarVendas,
  type LinhaImportacao,
} from "@/app/actions/vendas";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

const NOME_ABA = "Planejamento_vendas";

/**
 * Remove acentos, deixa minúsculo e tira tudo que não é letra/número (espaço,
 * parênteses, underscore, barra, ponto...). Assim "VOLUME(DS_kg)", "Volume
 * (ds/kg/l)" e "volume" viram todos "volume...", batendo no mesmo prefixo,
 * não importa a pontuação ou maiúscula/minúscula usada na planilha.
 */
function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const COLUNAS: { chave: keyof LinhaImportacao; prefixos: string[] }[] = [
  { chave: "cliente", prefixos: ["cliente"] },
  { chave: "fornecedor", prefixos: ["fornecedor"] },
  { chave: "produto", prefixos: ["produto"] },
  { chave: "cultura", prefixos: ["cultura"] },
  { chave: "volume", prefixos: ["volume"] },
  { chave: "valorUnitario", prefixos: ["valorunit", "vlrunit"] },
  { chave: "status", prefixos: ["status"] },
  {
    chave: "dataFechamento",
    prefixos: ["datafechamento", "datadefechamento", "fechamento"],
  },
  {
    chave: "previsaoEntrega",
    prefixos: ["previsaodeentrega", "previsaoentrega", "previsao", "entrega"],
  },
  { chave: "observacoes", prefixos: ["observ", "obs"] },
  { chave: "consultor", prefixos: ["consultor"] },
];

function normalizarNomeAba(nome: string): string {
  return nome.trim().toLowerCase().replace(/[\s_]+/g, "");
}

const COLUNAS_OBRIGATORIAS = ["cliente", "fornecedor", "produto"] as const;

/**
 * Procura, entre as primeiras linhas da aba, a que contém o cabeçalho de
 * verdade — a planilha pode ter uma linha de título (ex: "Rede Agro - SAFRA
 * 24/25") antes das colunas, então não dá pra assumir que é sempre a linha 0.
 */
function acharCabecalho(
  linhas: unknown[][]
): { indiceLinha: number; indice: Map<keyof LinhaImportacao, number> } | null {
  const limite = Math.min(linhas.length, 15);
  for (let l = 0; l < limite; l++) {
    const cabecalho = linhas[l].map((c) => normalizarTexto(String(c ?? "")));
    const indice = new Map<keyof LinhaImportacao, number>();
    for (const col of COLUNAS) {
      const i = cabecalho.findIndex((c) =>
        col.prefixos.some((p) => c.startsWith(p))
      );
      if (i >= 0) indice.set(col.chave, i);
    }
    if (COLUNAS_OBRIGATORIAS.every((chave) => indice.has(chave))) {
      return { indiceLinha: l, indice };
    }
  }
  return null;
}

function baixarModelo() {
  const cabecalho = [
    "Cliente",
    "Fornecedor",
    "Produto",
    "Cultura",
    "Volume",
    "Valor unitário",
    "Status",
    "Data fechamento",
    "Previsão de entrega",
    "Observações",
  ];
  const exemplo = [
    "FAZENDA EXEMPLO LTDA",
    "Koppert",
    "RIZOKOP LIQ",
    "Soja",
    1000,
    1.5,
    "Prospecção",
    "",
    "15/09/2026",
    "",
  ];
  const planilha = XLSX.utils.aoa_to_sheet([cabecalho, exemplo]);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, NOME_ABA);
  XLSX.writeFile(livro, "modelo-vendas.xlsx");
}

export function ImportarModal({
  aoFechar,
  ehAdmin,
  consultores,
}: {
  aoFechar: () => void;
  ehAdmin: boolean;
  consultores: { id: string; nome: string }[];
}) {
  const [linhas, setLinhas] = useState<LinhaImportacao[] | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [consultorId, setConsultorId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    criadas: number;
    atualizadas: number;
    erros: string[];
  } | null>(null);
  const [pendente, startTransition] = useTransition();

  function lerArquivo(arquivo: File) {
    setErro(null);
    setResultado(null);
    setNomeArquivo(arquivo.name);
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const buffer = leitor.result as ArrayBuffer;
        const livro = XLSX.read(buffer, { type: "array", cellDates: true });

        const nomeAba = livro.SheetNames.find(
          (n) => normalizarNomeAba(n) === normalizarNomeAba(NOME_ABA)
        );
        if (!nomeAba) {
          throw new Error(
            `A planilha precisa ter uma aba chamada "${NOME_ABA}". Abas encontradas: ${livro.SheetNames.join(", ")}.`
          );
        }

        const aba = livro.Sheets[nomeAba];
        const celulas = XLSX.utils.sheet_to_json<unknown[]>(aba, {
          header: 1,
          raw: true,
          defval: "",
        });
        const linhasComDados = celulas.filter((linha) =>
          linha.some((c) => String(c ?? "").trim() !== "")
        );
        if (linhasComDados.length < 2)
          throw new Error(`Aba "${nomeAba}" vazia ou sem linhas de dados.`);

        const cabecalhoEncontrado = acharCabecalho(linhasComDados);
        if (!cabecalhoEncontrado) {
          throw new Error(
            `Não encontrei uma linha de cabeçalho com as colunas "Cliente", "Fornecedor" e "Produto" nas primeiras linhas da aba "${nomeAba}". Baixe o modelo para ver o formato.`
          );
        }
        const { indiceLinha, indice } = cabecalhoEncontrado;
        const idxCliente = indice.get("cliente")!;
        const idxFornecedor = indice.get("fornecedor")!;
        const idxProduto = indice.get("produto")!;

        // Planilhas do Excel costumam ter formatação/fórmulas arrastadas bem
        // além dos dados reais (ex: a coluna de total calculando "0" em
        // centenas de linhas vazias) — o filtro de "linha em branco" lá em
        // cima não pega isso. Aqui só contam como dado real as linhas que
        // têm cliente, fornecedor ou produto preenchido.
        const linhasDeDados = linhasComDados
          .slice(indiceLinha + 1)
          .filter((linha) => {
            const cliente = String(linha[idxCliente] ?? "").trim();
            const fornecedor = String(linha[idxFornecedor] ?? "").trim();
            const produto = String(linha[idxProduto] ?? "").trim();
            return cliente !== "" || fornecedor !== "" || produto !== "";
          });

        const dados: LinhaImportacao[] = linhasDeDados.map((linha) => {
          const obj = {} as LinhaImportacao;
          for (const [chave, i] of indice) {
            const valor = linha[i];
            if (valor instanceof Date) {
              (obj as Record<string, unknown>)[chave] = valor;
            } else if (typeof valor === "number") {
              (obj as Record<string, unknown>)[chave] = valor;
            } else {
              (obj as Record<string, unknown>)[chave] = String(valor ?? "").trim();
            }
          }
          return obj;
        });
        setLinhas(dados);
      } catch (e) {
        setLinhas(null);
        setErro(e instanceof Error ? e.message : "Não foi possível ler a planilha. Confira o arquivo e selecione-o novamente.");
      }
    };
    leitor.readAsArrayBuffer(arquivo);
  }

  function importar() {
    if (!linhas) return;
    if (ehAdmin && !consultorId) {
      setErro("Selecione para qual consultor importar antes de continuar.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const r = await importarVendas(
        linhas,
        ehAdmin && consultorId !== "eu-mesmo" ? consultorId : undefined
      );
      if (r.ok) {
        setResultado({
          criadas: r.criadas,
          atualizadas: r.atualizadas,
          erros: r.erros,
        });
        setLinhas(null);
      } else {
        setErro(r.erro);
      }
    });
  }

  return (
    <Modal open onClose={aoFechar} title="Importar vendas (Excel)" maxWidth="max-w-lg">
      <p className="mb-4 text-xs text-muted">
        O arquivo precisa ter uma aba chamada &quot;{NOME_ABA}&quot; com as
        colunas Cliente, Fornecedor e Produto (obrigatórias). Clientes e
        produtos que não existirem serão criados automaticamente. Uma linha
        só atualiza uma venda já existente se TODOS os campos forem
        idênticos (cliente, fornecedor, produto, cultura, volume, valor,
        status, datas, observações) — qualquer diferença em algum campo vira
        venda nova em vez de sobrescrever. O arquivo é lido só no seu
        navegador e descartado depois de importar — nada dele fica salvo no
        sistema.{" "}
        <button
          onClick={baixarModelo}
          className="text-accent underline hover:brightness-110"
        >
          Baixar modelo
        </button>
      </p>

      <label className="block cursor-pointer rounded-lg border border-dashed border-zinc-600 p-6 text-center text-sm text-secondary hover:border-accent hover:text-zinc-300">
        {nomeArquivo || "Clique para escolher o arquivo .xlsx"}
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) lerArquivo(f);
          }}
        />
      </label>

      {ehAdmin && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-secondary">
            Importar para qual consultor?
          </label>
          <Select
            value={consultorId}
            onChange={(e) => setConsultorId(e.target.value)}
          >
            <option value="">Selecione um consultor...</option>
            <option value="eu-mesmo">Eu mesmo (Administrador)</option>
            {consultores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-[11px] text-muted">
            Linhas com a coluna &quot;Consultor&quot; preenchida na planilha
            usam o nome indicado nela, ignorando essa escolha.
          </p>
        </div>
      )}

      {linhas && (
        <p className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-green-400">
          {linhas.length} linha(s) prontas para importar.
        </p>
      )}

      {erro && (
        <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">
          {erro}
        </p>
      )}

      {resultado && (
        <div className="mt-3 space-y-2">
          <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-green-400">
            {resultado.criadas} venda(s) criada(s), {resultado.atualizadas}{" "}
            atualizada(s).
          </p>
          {resultado.erros.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg bg-danger/10 px-3 py-2 text-xs text-red-400">
              <p className="mb-1 font-semibold">
                {resultado.erros.length} linha(s) com problema:
              </p>
              {resultado.erros.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant={resultado ? "secondary" : "danger"} onClick={aoFechar}>
          {resultado ? "Fechar" : "Cancelar"}
        </Button>
        {linhas && (
          <Button variant="primary" onClick={importar} disabled={pendente}>
            {pendente ? "Importando..." : `Importar ${linhas.length} linha(s)`}
          </Button>
        )}
      </div>
    </Modal>
  );
}
