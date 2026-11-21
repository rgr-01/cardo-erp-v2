"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { Bot, Info, Send, Trash2, X } from "lucide-react";
import { perguntarAssistente } from "@/app/actions/assistente";
import { PreviaPdfModal } from "@/components/ui/previa-pdf-modal";

type Mensagem = { papel: "usuario" | "assistente"; texto: string; erro?: boolean };

type AbrirPdf = (url: string, titulo: string) => void;

// Markdown mínimo: **negrito**, [links](/caminho) e, em outras funções, listas e tabelas.
function Inline({ texto, abrirPdf }: { texto: string; abrirPdf?: AbrirPdf }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*|!?\[[^\]]*\]\(\/[^)\s]*\))/g).map((parte, i) => {
        if (parte.startsWith("**") && parte.endsWith("**")) {
          return <b key={i} className="font-semibold text-white">{parte.slice(2, -2)}</b>;
        }
        const imagem = parte.match(/^!\[([^\]]*)\]\((\/[^)\s]*)\)$/);
        if (imagem) {
          return (
            <a key={i} href={imagem[2]} target="_blank" rel="noreferrer" className="my-1 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagem[2]} alt={imagem[1]} className="max-h-64 w-full rounded-lg bg-white object-contain" />
              {imagem[1] && <span className="mt-0.5 block text-[11px] text-secondary">{imagem[1]}</span>}
            </a>
          );
        }
        const link = parte.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
        if (link) {
          const [, rotulo, url] = link;
          const ehPdf = /(\/pdf|\.pdf)$/.test(url);
          return (
            <a
              key={i}
              href={url}
              onClick={ehPdf && abrirPdf ? (e) => { e.preventDefault(); abrirPdf(url, rotulo); } : undefined}
              target={ehPdf ? undefined : "_self"}
              className="font-semibold text-accent underline underline-offset-2 hover:brightness-125"
            >
              {ehPdf ? "📄 " : ""}{rotulo}
            </a>
          );
        }
        return <Fragment key={i}>{parte}</Fragment>;
      })}
    </>
  );
}

function Texto({ texto, abrirPdf }: { texto: string; abrirPdf: AbrirPdf }) {
  const linhas = texto.split("\n");
  const blocos: React.ReactNode[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (linha.trim().startsWith("|")) {
      const tabela: string[] = [];
      while (i < linhas.length && linhas[i].trim().startsWith("|")) tabela.push(linhas[i++]);
      i--;
      const celulas = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const [cab, , ...corpo] = tabela;
      blocos.push(
        <div key={i} className="my-1 overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-xs">
            <thead className="bg-zinc-900/60 text-left text-secondary">
              <tr>{celulas(cab).map((c, j) => <th key={j} className="px-2 py-1 font-semibold"><Inline texto={c} abrirPdf={abrirPdf} /></th>)}</tr>
            </thead>
            <tbody>
              {corpo.map((l, k) => (
                <tr key={k} className="border-t border-surface-border/60">
                  {celulas(l).map((c, j) => <td key={j} className="px-2 py-1"><Inline texto={c} abrirPdf={abrirPdf} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^\s*[-•]\s+/.test(linha)) {
      blocos.push(
        <p key={i} className="flex gap-1.5 pl-1">
          <span className="text-accent">•</span>
          <span><Inline texto={linha.replace(/^\s*[-•]\s+/, "")} abrirPdf={abrirPdf} /></span>
        </p>,
      );
    } else if (linha.trim() === "") {
      blocos.push(<div key={i} className="h-1.5" />);
    } else {
      blocos.push(<p key={i}><Inline texto={linha} abrirPdf={abrirPdf} /></p>);
    }
  }
  return <div className="space-y-0.5 break-words">{blocos}</div>;
}

export function AssistenteChat() {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [historico, setHistorico] = useState<unknown[][]>([]);
  const [texto, setTexto] = useState("");
  const [ajuda, setAjuda] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; titulo: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, pendente, aberto]);

  function enviar(conteudo: string) {
    const pergunta = conteudo.trim();
    if (!pergunta || pendente) return;
    setTexto("");
    setMensagens((m) => [...m, { papel: "usuario", texto: pergunta }]);
    iniciar(async () => {
      const r = await perguntarAssistente(pergunta, historico);
      if (r.ok) {
        setHistorico(r.historico);
        setMensagens((m) => [...m, { papel: "assistente", texto: r.resposta }]);
      } else {
        setMensagens((m) => [...m, { papel: "assistente", texto: r.erro, erro: true }]);
      }
    });
  }

  function novaConversa() {
    setMensagens([]);
    setHistorico([]);
  }

  return (
    <>
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          aria-label="Abrir assistente"
          title="Assistente IA"
          className="ml-auto mt-6 flex min-h-11 w-fit items-center justify-center gap-2 rounded-lg border border-control bg-zinc-900 px-3 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-zinc-800 hover:text-white"
        >
          <Bot size={18} aria-hidden /><span>Assistente</span>
        </button>
      )}

      {aberto && (
        <div className="fixed bottom-4 right-4 z-40 flex h-[min(38rem,calc(100dvh-2rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-surface-border bg-zinc-900 shadow-2xl shadow-black/60">
          <div className="flex items-center gap-2 border-b border-surface-border bg-zinc-800/60 px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent"><Bot size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">Assistente</p>
              <p className="text-[11px] text-muted">Faz só o que você pedir</p>
            </div>
            <button
              onClick={() => setAjuda((v) => !v)}
              aria-label="O que o assistente faz"
              aria-expanded={ajuda}
              title="O que o assistente faz"
              className={`rounded-md p-1.5 transition hover:bg-zinc-700 hover:text-white ${ajuda ? "bg-zinc-700 text-white" : "text-secondary"}`}
            >
              <Info size={16} />
            </button>
            {mensagens.length > 0 && (
              <button onClick={novaConversa} disabled={pendente} title="Nova conversa" aria-label="Nova conversa" className="rounded-md p-1.5 text-secondary transition hover:bg-zinc-700 hover:text-white disabled:opacity-50">
                <Trash2 size={15} />
              </button>
            )}
            <button onClick={() => setAberto(false)} aria-label="Fechar assistente" className="rounded-md p-1.5 text-secondary transition hover:bg-zinc-700 hover:text-white">
              <X size={17} />
            </button>
          </div>

          {ajuda && (
            <>
              <button
                type="button"
                aria-label="Fechar explicação"
                onClick={() => setAjuda(false)}
                className="absolute inset-0 z-10 cursor-default"
              />
              <div
                role="dialog"
                aria-label="O que o assistente faz"
                className="absolute right-3 top-14 z-20 w-[min(20rem,calc(100%-1.5rem))] space-y-2 rounded-xl border border-surface-border bg-zinc-800 p-4 text-xs leading-relaxed text-zinc-300 shadow-2xl shadow-black/60"
              >
                <p className="text-sm font-bold text-white">O que o assistente faz</p>
                <p>Responde e executa no sistema só o que você pedir, usando as suas permissões: o consultor vê o que é dele e o gestor vê a equipe.</p>
                <ul className="space-y-1">
                  <li>• <b className="text-white">Consulta:</b> clientes, orçamentos, pedidos, vendas, produtos e preços, despesas, visitas, cotações.</li>
                  <li>• <b className="text-white">Documentos:</b> PDF de orçamento, pedido, relatório de visita, despesas e gerencial; nota fiscal e boleto; gráficos.</li>
                  <li>• <b className="text-white">Ações:</b> criar orçamento, fechar pedido, lançar despesa, registrar visita. Sempre mostra um resumo e só executa depois do seu &ldquo;sim&rdquo;.</li>
                  <li>• <b className="text-white">Gestor:</b> aprovar ou recusar margem, cadastrar produto e fornecedor.</li>
                </ul>
                <p className="text-muted">Ainda não funciona aqui: ler foto de nota fiscal ou de embalagem e anexar foto em relatório (só pelo WhatsApp).</p>
              </div>
            </>
          )}
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {mensagens.length === 0 && (
              <div className="flex h-full items-center justify-center text-zinc-700">
                <Bot size={32} aria-hidden />
              </div>
            )}
            {mensagens.map((m, i) => (
              <div key={i} className={m.papel === "usuario" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[88%] rounded-xl px-3 py-2 ${
                    m.papel === "usuario"
                      ? "bg-accent text-accent-foreground"
                      : m.erro
                        ? "border border-red-500/40 bg-red-500/10 text-red-300"
                        : "bg-zinc-800 text-zinc-200"
                  }`}
                >
                  {m.papel === "usuario" ? <p className="whitespace-pre-wrap break-words">{m.texto}</p> : <Texto texto={m.texto} abrirPdf={(url, titulo) => setPdf({ url, titulo })} />}
                </div>
              </div>
            ))}
            {pendente && (
              <div className="flex justify-start">
                <div role="status" className="rounded-xl bg-zinc-800 px-3 py-3 text-xs text-secondary">Preparando resposta...</div>
              </div>
            )}
            <div ref={fimRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
            className="flex items-end gap-2 border-t border-surface-border p-3"
          >
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar(texto);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Pergunte ou peça algo..."
              aria-label="Mensagem para o assistente"
              className="max-h-28 min-h-[2.25rem] flex-1 resize-none rounded-xl border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={pendente || !texto.trim()}
              aria-label="Enviar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition hover:brightness-110 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
      {pdf && <PreviaPdfModal url={pdf.url} titulo={pdf.titulo} aoFechar={() => setPdf(null)} />}
    </>
  );
}
