"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boxes, Building2, ChevronDown, ChevronRight, Users, ImageUp, Images, Palette, Trash2 } from "lucide-react";
import {
  enviarLogoRelatorio,
  enviarMarcaEmpresa,
  removerLogoRelatorio,
  removerMarcaEmpresa,
  salvarDadosEmpresa,
  type DadosEmpresaInput,
} from "@/app/actions/configuracoes";
import { Button } from "@/components/ui/button";

type TipoMarca = "logo" | "logo-escuro" | "icone";
type Dados = Required<{ [K in keyof DadosEmpresaInput]: string }>;

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-secondary";

const SLOTS: { tipo: TipoMarca; titulo: string; dica: string; fundo: string }[] = [
  { tipo: "logo-escuro", titulo: "Logo para fundo escuro", dica: "Menu no tema escuro. Use a versão branca.", fundo: "tema-fixo bg-zinc-950" },
  { tipo: "logo", titulo: "Logo para fundo claro", dica: "Menu no tema claro, login, PDFs e relatórios. Use a versão colorida.", fundo: "bg-white" },
  { tipo: "icone", titulo: "Ícone", dica: "Aba do navegador. Imagem quadrada.", fundo: "bg-zinc-800" },
];

function SlotImagem({
  slot,
  url,
  aoMudar,
}: {
  slot: (typeof SLOTS)[number];
  url: string | null;
  aoMudar: (r: { ok: true } | { ok: false; erro: string }) => void;
}) {
  const [pendente, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    const fd = new FormData();
    fd.set("tipo", slot.tipo);
    fd.set("arquivo", arquivo);
    startTransition(async () => aoMudar(await enviarMarcaEmpresa(fd)));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-surface-border bg-zinc-900/60 p-3">
      <div>
        <p className="text-sm font-semibold text-white">{slot.titulo}</p>
        <p className="text-xs text-muted">{slot.dica}</p>
      </div>
      <div className={`flex h-24 items-center justify-center rounded-lg ${slot.fundo} ring-1 ring-surface-border`}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- prévia da imagem enviada
          <img src={url} alt={slot.titulo} className={slot.tipo === "icone" ? "h-12 w-12 object-contain" : "max-h-14 max-w-[85%] object-contain"} />
        ) : (
          <span className="text-xs text-muted">Sem imagem</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            enviar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="primary" disabled={pendente} onClick={() => inputRef.current?.click()}>
          <ImageUp size={14} /> {pendente ? "Enviando..." : url ? "Trocar" : "Enviar"}
        </Button>
        {url && (
          <Button
            type="button"
            variant="danger"
            disabled={pendente}
            onClick={() => startTransition(async () => aoMudar(await removerMarcaEmpresa(slot.tipo)))}
          >
            <Trash2 size={14} /> Remover
          </Button>
        )}
      </div>
    </div>
  );
}

// Cartão de uma parte das Configurações: fechado mostra o resumo; "Ajustar"
// abre o conteúdo logo abaixo.
function CartaoConfig({ icone, titulo, descricao, resumo, aberto, aoAlternar, children }: { icone: React.ReactNode; titulo: string; descricao: string; resumo: React.ReactNode; aberto: boolean; aoAlternar: () => void; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border bg-zinc-900/60 transition ${aberto ? "border-accent/40" : "border-surface-border"}`}>
      <button type="button" onClick={aoAlternar} aria-expanded={aberto} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">{icone}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">{titulo}</span>
          <span className="block text-xs text-muted">{descricao}</span>
        </span>
        {!aberto && <span className="hidden sm:block">{resumo}</span>}
        <span className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${aberto ? "border-surface-border text-secondary" : "border-accent/40 text-accent"}`}>{aberto ? "Recolher" : "Editar"} <ChevronDown size={14} className={`transition ${aberto ? "rotate-180" : ""}`} /></span>
      </button>
      {aberto && <div className="space-y-3 border-t border-surface-border px-4 py-4">{children}</div>}
    </section>
  );
}

export type LogoDaBiblioteca = { id: string; nome: string; tipo: "PARCEIRO" | "PROGRAMA"; url: string | null };

function LogosRelatorio({
  logos,
  aoMudar,
}: {
  logos: LogoDaBiblioteca[];
  aoMudar: (r: { ok: true } | { ok: false; erro: string }) => void;
}) {
  const [pendente, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"PARCEIRO" | "PROGRAMA">("PARCEIRO");
  const inputRef = useRef<HTMLInputElement>(null);

  function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    const fd = new FormData();
    fd.set("nome", nome || arquivo.name.replace(/\.[^.]+$/, ""));
    fd.set("tipo", tipo);
    fd.set("arquivo", arquivo);
    startTransition(async () => {
      const r = await enviarLogoRelatorio(fd);
      if (r.ok) setNome("");
      aoMudar(r);
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs text-muted">
          No editor, clique na logo da esquerda ou da direita para escolher. A da direita sai sempre com &quot;Em parceria com&quot;.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {logos.map((logo) => (
          <div key={logo.id} className="flex flex-col gap-2 rounded-xl border border-surface-border bg-zinc-900/60 p-3">
            <div className="flex h-20 items-center justify-center rounded-lg bg-white ring-1 ring-surface-border">
              {logo.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo do storage externo
                <img src={logo.url} alt={logo.nome} className="max-h-14 max-w-[85%] object-contain" />
              ) : (
                <span className="text-xs text-muted">Sem imagem</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{logo.nome}</p>
                <p className="text-xs text-muted">{logo.tipo === "PROGRAMA" ? "Programa" : "Parceiro"}</p>
              </div>
              <Button
                type="button"
                variant="danger"
                disabled={pendente}
                aria-label={`Remover ${logo.nome}`}
                onClick={() => startTransition(async () => aoMudar(await removerLogoRelatorio(logo.id)))}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-zinc-900/60 p-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="logo-rel-nome" className={labelCls}>Nome</label>
          <input id="logo-rel-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Koppert" className={inputCls} />
        </div>
        <div>
          <label htmlFor="logo-rel-tipo" className={labelCls}>Tipo</label>
          <select id="logo-rel-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "PARCEIRO" | "PROGRAMA")} className={inputCls}>
            <option value="PARCEIRO">Parceiro</option>
            <option value="PROGRAMA">Programa da empresa</option>
          </select>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            enviar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="primary" disabled={pendente} onClick={() => inputRef.current?.click()}>
          <ImageUp size={14} /> {pendente ? "Enviando..." : "Adicionar logo"}
        </Button>
      </div>
    </section>
  );
}

export function ConfiguracoesEmpresa({
  dados,
  imagens,
  modulos,
  logosRelatorio,
  usuarios,
}: {
  dados: Dados;
  imagens: Record<TipoMarca, string | null>;
  modulos: string[];
  logosRelatorio: LogoDaBiblioteca[];
  usuarios: { ativos: number; total: number; limite: number | null };
}) {
  const router = useRouter();
  const [form, setForm] = useState(dados);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  // Uma parte aberta por vez; a tela começa toda fechada (só os resumos).
  const [aberta, setAberta] = useState<string | null>(null);
  const alternar = (id: string) => setAberta((atual) => (atual === id ? null : id));

  const campo = (nome: keyof Dados, rotulo: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`cfg-${nome}`} className={labelCls}>
        {rotulo}
      </label>
      <input
        id={`cfg-${nome}`}
        value={form[nome]}
        onChange={(e) => setForm({ ...form, [nome]: e.target.value })}
        className={inputCls}
        {...extra}
      />
    </div>
  );

  function aposImagem(r: { ok: true } | { ok: false; erro: string }) {
    setMsg(r.ok ? { ok: true, texto: "Imagem atualizada." } : { ok: false, texto: r.erro });
    if (r.ok) router.refresh();
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const r = await salvarDadosEmpresa(form);
      setMsg(r.ok ? { ok: true, texto: "Dados salvos." } : { ok: false, texto: r.erro });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-muted">Marca, logos, usuários e dados da empresa</p>
      </div>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-accent/10 text-accent" : "bg-danger/10 text-red-400"}`}>{msg.texto}</p>
      )}

      <CartaoConfig
        icone={<Palette size={18} />}
        titulo="Marca"
        descricao="Logos para fundo claro e escuro e o ícone da aba"
        // eslint-disable-next-line @next/next/no-img-element -- prévias do storage
        resumo={<div className="flex items-center gap-2">{SLOTS.map((slot) => <span key={slot.tipo} className={`flex h-8 w-16 items-center justify-center rounded ${slot.fundo} ring-1 ring-surface-border`}>{imagens[slot.tipo] ? <img src={imagens[slot.tipo]!} alt="" className="max-h-6 max-w-[90%] object-contain" /> : <span className="text-[9px] text-muted">—</span>}</span>)}</div>}
        aberto={aberta === "marca"}
        aoAlternar={() => alternar("marca")}
      >
        <div className="grid gap-3 md:grid-cols-3">
          {SLOTS.map((s) => (
            <SlotImagem key={s.tipo} slot={s} url={imagens[s.tipo]} aoMudar={aposImagem} />
          ))}
        </div>
        <p className="text-xs text-muted">PNG, JPEG ou WebP, até 8 MB. Prefira PNG com fundo transparente.</p>
      </CartaoConfig>

      <CartaoConfig
        icone={<Images size={18} />}
        titulo="Logos de relatórios"
        descricao="Parceiros e programas que aparecem na capa e no rodapé dos relatórios"
        // eslint-disable-next-line @next/next/no-img-element -- prévias do storage
        resumo={<div className="flex items-center gap-2"><span className="text-xs text-secondary">{logosRelatorio.length} logo{logosRelatorio.length === 1 ? "" : "s"}</span>{logosRelatorio.slice(0, 4).map((logo) => logo.url && <span key={logo.id} className="flex h-8 w-14 items-center justify-center rounded bg-white ring-1 ring-surface-border"><img src={logo.url} alt={logo.nome} className="max-h-6 max-w-[90%] object-contain" /></span>)}</div>}
        aberto={aberta === "logos"}
        aoAlternar={() => alternar("logos")}
      >
        <LogosRelatorio logos={logosRelatorio} aoMudar={aposImagem} />
      </CartaoConfig>

      <Link href="/usuarios" className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-border bg-zinc-900/60 px-4 py-3 transition hover:border-accent/40">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Users size={18} /></span>
        <span className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
          <span className="block text-sm font-semibold text-white">Usuários</span>
          <span className="block text-xs text-muted">Equipe que acessa o sistema: cadastrar, ativar ou desativar e trocar senha</span>
        </span>
        <span className="text-xs text-secondary">{usuarios.ativos} ativo{usuarios.ativos === 1 ? "" : "s"}{usuarios.limite ? ` de ${usuarios.limite} do plano` : ` · ${usuarios.total} no total`}</span>
        <span className="inline-flex items-center gap-1 rounded-lg border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent">Gerenciar <ChevronRight size={14} /></span>
      </Link>

      <CartaoConfig
        icone={<Building2 size={18} />}
        titulo="Dados da empresa"
        descricao="Nome, CNPJ, endereço e cor usados nos PDFs e na tela de login"
        resumo={<span className="text-xs text-secondary">{[form.nomeFantasia, form.cnpj].filter(Boolean).join(" · ")}</span>}
        aberto={aberta === "dados"}
        aoAlternar={() => alternar("dados")}
      >
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid gap-4 md:grid-cols-2">
          {campo("nomeFantasia", "Nome fantasia *", { required: true })}
          {campo("razaoSocial", "Razão social")}
          {campo("cnpj", "CNPJ")}
          {campo("regimeTributario", "Regime tributário")}
          {campo("endereco", "Endereço")}
          {campo("cidadeUfCep", "Cidade / UF / CEP")}
          <div>
            <label htmlFor="cfg-cor" className={labelCls}>
              Cor da marca
            </label>
            <div className="flex items-center gap-2">
              <input
                id="cfg-cor"
                type="color"
                value={form.corPrimaria || "#19323b"}
                onChange={(e) => setForm({ ...form, corPrimaria: e.target.value })}
                className="h-10 w-14 cursor-pointer rounded-lg border border-surface-border bg-zinc-800"
              />
              <span className="font-mono text-xs text-secondary">{form.corPrimaria || "padrão"}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Painel e botão da tela de login.</p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar dados"}
          </Button>
        </div>
      </form>
      </CartaoConfig>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-border bg-zinc-900/60 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><Boxes size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Módulos contratados</p>
          <p className="text-xs text-muted">Para mudar os módulos, fale com a Cardo AI.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {modulos.map((m) => (
            <span key={m} className="rounded-md bg-accent/10 px-2 py-1 text-xs text-accent">
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
