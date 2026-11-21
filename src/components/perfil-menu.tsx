"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { SeletorTema } from "@/components/seletor-tema";
import type { Tema } from "@/lib/tema";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowLeft, History, Settings, LogOut, MessageCircle, Pencil, Target, Trash2, Upload } from "lucide-react";
import { enviarFotoPerfil, removerFotoPerfil } from "@/app/actions/perfil";
import { aplicarDesenho, canvasParaBlob, fotoParaCanvas } from "@/lib/desenho-foto";
import { BONECOS, BonecoSvg, bonecoParaBlob, type Boneco } from "@/components/avatares";

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

function Avatar({ nome, fotoUrl, className }: { nome: string; fotoUrl: string | null; className: string }) {
  return fotoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={fotoUrl} alt={nome} className={`${className} object-cover`} />
  ) : (
    <span className={`${className} flex items-center justify-center bg-emerald-700 font-semibold text-white`}>
      {iniciais(nome)}
    </span>
  );
}

type Rascunho = { original: HTMLCanvasElement; desenho: HTMLCanvasElement; urlOriginal: string; urlDesenho: string };

const rotuloClasse = "px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted";

const itemClasse = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700";

export function PerfilMenu({
  nome,
  fotoUrl,
  role,
  tema = "escuro",
  sair,
  posicao = "abaixo",
}: {
  nome: string;
  fotoUrl: string | null;
  role: "ADMIN" | "CONSULTOR";
  tema?: Tema;
  sair: () => Promise<void>;
  posicao?: "acima" | "abaixo";
}) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [estilo, setEstilo] = useState<"original" | "desenho">("desenho");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const raizRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  function fechar() {
    setAberto(false);
    setEditando(false);
    setRascunho(null);
    setErro(null);
  }

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (painelRef.current?.contains(alvo)) return;
      if (raizRef.current && !raizRef.current.contains(alvo)) fechar();
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, []);

  function aoEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro(null);
    iniciar(async () => {
      try {
        const original = await fotoParaCanvas(arquivo);
        const desenho = aplicarDesenho(original);
        setRascunho({
          original,
          desenho,
          urlOriginal: original.toDataURL("image/jpeg", 0.8),
          urlDesenho: desenho.toDataURL("image/jpeg", 0.8),
        });
        setEstilo("desenho");
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Não foi possível abrir a foto. Selecione o arquivo novamente.");
      }
    });
  }

  async function enviar(imagem: Blob, nomeArquivo: string) {
    const dados = new FormData();
    dados.append("foto", new File([imagem], nomeArquivo, { type: "image/jpeg" }));
    const r = await enviarFotoPerfil(dados);
    if (!r.ok) setErro(r.erro);
    else fechar();
  }

  function salvarRascunho() {
    if (!rascunho) return;
    setErro(null);
    iniciar(async () => {
      try {
        await enviar(await canvasParaBlob(estilo === "desenho" ? rascunho.desenho : rascunho.original), "perfil.jpg");
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Não foi possível salvar a foto. Tente novamente.");
      }
    });
  }

  function aoEscolherBoneco(b: Boneco) {
    setErro(null);
    iniciar(async () => {
      try {
        await enviar(await bonecoParaBlob(b), "avatar.jpg");
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Não foi possível salvar o avatar. Tente novamente.");
      }
    });
  }

  function aoRemoverFoto() {
    setErro(null);
    iniciar(async () => {
      const r = await removerFotoPerfil();
      if (!r.ok) setErro(r.erro);
      else fechar();
    });
  }

  const painelFoto = (
    <div className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => (rascunho ? setRascunho(null) : setEditando(false))}
          disabled={pendente}
          aria-label="Voltar"
          className="rounded-md p-1 text-secondary transition hover:bg-zinc-700 hover:text-white"
        >
          <ArrowLeft size={16} />
        </button>
        <p className="text-base font-semibold text-white">{rascunho ? "Como quer sua foto?" : "Editar foto"}</p>
      </div>

      {rascunho ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(["original", "desenho"] as const).map((op) => (
              <button
                key={op}
                onClick={() => setEstilo(op)}
                disabled={pendente}
                className={`overflow-hidden rounded-xl border-2 transition ${
                  estilo === op ? "border-accent" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={op === "original" ? rascunho.urlOriginal : rascunho.urlDesenho}
                  alt={op === "original" ? "Foto original" : "Foto em desenho"}
                  className="aspect-square w-full object-cover"
                />
                <span className="block bg-zinc-900/60 py-1 text-center text-xs text-zinc-300">
                  {op === "original" ? "Foto" : "Desenho"}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={salvarRascunho}
            disabled={pendente}
            className="w-full rounded-lg bg-accent py-2 text-sm font-bold text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {pendente ? "Salvando..." : "Salvar foto"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar nome={nome} fotoUrl={fotoUrl} className="h-14 w-14 shrink-0 rounded-full text-base" />
            <div className="flex min-w-0 flex-col items-start gap-1.5">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={pendente}
                className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-zinc-200 transition hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <Upload size={13} /> {pendente ? "Abrindo..." : "Enviar minha foto"}
              </button>
              {fotoUrl && (
                <button
                  onClick={aoRemoverFoto}
                  disabled={pendente}
                  className="flex items-center gap-1.5 text-xs text-secondary transition hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 size={12} /> Remover foto
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] leading-snug text-muted">
            Ao enviar uma foto, você pode deixá-la em estilo desenho.
          </p>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Ou escolha um bonequinho
            </p>
            <div className="grid grid-cols-4 gap-2.5">
              {BONECOS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => aoEscolherBoneco(b)}
                  disabled={pendente}
                  aria-label={`Usar avatar ${b.id}`}
                  className="aspect-square overflow-hidden rounded-full ring-2 ring-transparent transition-colors duration-150 hover:ring-accent disabled:opacity-50"
                >
                  <BonecoSvg boneco={b} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="mt-2 text-xs text-red-400">{erro}</p>}
    </div>
  );

  return (
    <div ref={raizRef} className="relative">
      <button
        onClick={() => (aberto ? fechar() : setAberto(true))}
        aria-label="Menu do perfil"
        aria-expanded={aberto}
        title={nome}
        className="block rounded-full ring-2 ring-transparent transition hover:ring-emerald-500/60 focus-visible:ring-emerald-500"
      >
        <Avatar nome={nome} fotoUrl={fotoUrl} className="h-9 w-9 rounded-full text-xs" />
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={aoEscolherFoto}
      />

      {aberto && editando &&
        createPortal(
          <DialogFrame onClose={() => { if (!pendente) fechar(); }} label={"Editar foto do perfil"} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-md">
            <div
              ref={painelRef}
              className="w-full max-w-sm overflow-hidden rounded-xl border border-surface-border bg-zinc-800 shadow-2xl shadow-black/60"
            >
              {painelFoto}
            </div>
          </DialogFrame>,
          document.body,
        )}

      {aberto && !editando && (
        <div className={`absolute z-50 w-60 overflow-hidden rounded-lg border border-surface-border bg-zinc-800 shadow-xl ${posicao === "acima" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2"}`}>
          {(
            <>
              <div className="flex items-center gap-3 border-b border-zinc-600 bg-zinc-900/40 p-3">
                <button
                  onClick={() => {
                    setErro(null);
                    setEditando(true);
                  }}
                  aria-label="Editar foto de perfil"
                  title="Editar foto"
                  className="group relative shrink-0 rounded-full"
                >
                  <Avatar nome={nome} fotoUrl={fotoUrl} className="h-12 w-12 rounded-full text-sm" />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-800 bg-accent text-accent-foreground">
                    <Pencil size={10} strokeWidth={3} />
                  </span>
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{nome}</p>
                  <p className="text-xs text-secondary">{role === "ADMIN" ? "Administrador" : "Consultor"}</p>
                </div>
              </div>

              <p className={rotuloClasse}>Configurações</p>
              <ul className="pb-1">
                <li>
                  <Link href="/whatsapp" onClick={fechar} className={itemClasse}>
                    <MessageCircle size={14} className="shrink-0" /> WhatsApp
                  </Link>
                </li>
                {role === "ADMIN" && (
                  <>
                    <li>
                      <Link href="/configuracoes" onClick={fechar} className={itemClasse}>
                        <Settings size={14} className="shrink-0" /> Empresa e usuários
                      </Link>
                    </li>
                    <li>
                      <Link href="/metas" onClick={fechar} className={itemClasse}>
                        <Target size={14} className="shrink-0" /> Metas
                      </Link>
                    </li>
                    <li>
                      <Link href="/historico" onClick={fechar} className={itemClasse}>
                        <History size={14} className="shrink-0" /> Histórico
                      </Link>
                    </li>
                  </>
                )}
              </ul>

              <div className="border-t border-zinc-600 py-1">
                <SeletorTema tema={tema} aparencia="menu" />
              </div>

              <form action={sair} className="border-t border-zinc-600 py-1">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-red-500/10 hover:text-red-500"
                >
                  <LogOut size={14} className="shrink-0" /> Sair
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
