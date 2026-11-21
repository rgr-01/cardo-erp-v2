"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { pinIcon } from "@/lib/leaflet-icon";
import { Check, Layers, Pencil, X } from "lucide-react";
import { PALETA_CONSULTOR, corDoConsultor } from "@/lib/cores-consultor";
import { SeletorCor } from "@/components/ui/seletor-cor";
import {
  FAIXAS_RECENCIA,
  corDaFaixa,
  diasDesde,
  faixaPorDias,
  type FaixaRecencia,
} from "@/lib/recencia-visita";

type CorPor = "tempo" | "consultor";
import { atualizarLocalizacaoCliente } from "@/app/actions/clientes";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { VisitasClienteModal } from "@/components/clientes/visitas-cliente-modal";

const CENTRO_BRASIL: [number, number] = [-15.78, -47.93];

export type ClienteComLocal = {
  id: string;
  nome: string;
  endereco: string | null;
  telefone: string | null;
  latitude: number | null;
  longitude: number | null;
  consultorId: string | null;
  consultorNome: string | null;
  qtdVisitas: number;
  ultimaVisita: string | null;
};

function fmtUltimaVisita(iso: string | null): string {
  if (!iso) return "Nenhuma visita registrada";
  return `Última visita: ${new Date(iso).toLocaleDateString("pt-BR")}`;
}

// Popup com cores fixas (estilo inline): o tema claro inverte as classes zinc.
function el<K extends keyof HTMLElementTagNameMap>(tag: K, estilo: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = estilo;
  if (texto != null) e.textContent = texto;
  return e;
}

function popupDoCliente(
  c: ClienteComLocal,
  opcoes: { ehAdmin: boolean; aoClicarMover: () => void; aoVerVisitas: () => void }
): HTMLElement {
  const div = el("div", "font-family:inherit;min-width:220px;max-width:260px;color:#18181b");

  const iniciais = c.nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  const cabecalho = el("div", "display:flex;align-items:center;gap:10px;padding-right:18px");
  cabecalho.appendChild(
    el("div", "flex-shrink:0;width:36px;height:36px;border-radius:10px;background:#d1fae5;color:#047857;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px", iniciais || "?")
  );
  const nomes = el("div", "min-width:0");
  nomes.appendChild(el("div", "font-weight:700;font-size:14px;line-height:1.25;color:#18181b;overflow-wrap:anywhere", c.nome));
  nomes.appendChild(el("div", "font-size:12px;color:#71717a;margin-top:2px", c.consultorNome ?? "Sem consultor"));
  cabecalho.appendChild(nomes);
  div.appendChild(cabecalho);

  const linhas = el("div", "margin-top:10px;padding-top:10px;border-top:1px solid #f4f4f5;display:grid;gap:5px;font-size:12px;color:#3f3f46");
  const linha = (icone: string, texto: string) => {
    const l = el("div", "display:flex;gap:7px;align-items:flex-start");
    l.appendChild(el("span", "width:14px;text-align:center;opacity:.7", icone));
    l.appendChild(el("span", "flex:1;min-width:0;overflow-wrap:anywhere", texto));
    linhas.appendChild(l);
  };
  if (c.endereco) linha("📍", c.endereco);
  if (c.telefone) linha("📞", c.telefone);
  linha("🗓", fmtUltimaVisita(c.ultimaVisita));
  div.appendChild(linhas);

  const acoes = el("div", "margin-top:12px;display:flex;gap:6px");
  const botao = el(
    "a",
    "flex:1;text-align:center;border-radius:8px;background:#10b981;color:#fff;padding:7px 10px;font-size:12px;font-weight:600;text-decoration:none",
    c.qtdVisitas > 0 ? `Ver visitas (${c.qtdVisitas})` : "Registrar visita"
  );
  botao.href = "#";
  botao.onclick = (e) => {
    e.preventDefault();
    opcoes.aoVerVisitas();
  };
  acoes.appendChild(botao);

  if (opcoes.ehAdmin) {
    const mover = el("button", "border:1px solid #e4e4e7;background:#fff;color:#3f3f46;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:600;cursor:pointer", "Mover pin");
    mover.type = "button";
    mover.title = "Ou segure o botão direito sobre o pin e arraste";
    mover.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      opcoes.aoClicarMover();
    };
    acoes.appendChild(mover);
  }
  div.appendChild(acoes);

  return div;
}

type Camada = "estrada" | "satelite";

// Linha do consultor na legenda: clicar no nome (ou no lápis) edita a cor; a
// cor escolhida só vale ao clicar no ✓, que já salva.
function LinhaConsultor({
  nome,
  cor,
  manual,
  editavel,
  aoSalvar,
}: {
  nome: string;
  cor: string;
  manual: boolean;
  editavel: boolean;
  aoSalvar: (cor: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(cor);

  function abrir() {
    setRascunho(cor);
    setEditando(true);
  }

  if (!editando) {
    return (
      <div className="group flex items-center gap-2 py-0.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
        {editavel ? (
          <button
            type="button"
            onClick={abrir}
            title="Clique para mudar a cor"
            className="flex-1 truncate text-left text-secondary hover:text-white"
          >
            {nome}
          </button>
        ) : (
          <span className="flex-1 truncate text-secondary">{nome}</span>
        )}
        {editavel && (
          <button
            type="button"
            onClick={abrir}
            aria-label={`Editar a cor de ${nome}`}
            title="Editar cor"
            className="rounded p-1 text-muted transition hover:bg-zinc-800 hover:text-accent"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="my-1 space-y-1.5 rounded border border-accent/40 bg-zinc-950/60 p-1.5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: rascunho }} />
        <span className="flex-1 truncate font-medium text-zinc-100">{nome}</span>
        {manual && (
          <button
            type="button"
            onClick={() => {
              aoSalvar(null);
              setEditando(false);
            }}
            className="text-[10px] text-secondary underline-offset-2 hover:text-white hover:underline"
          >
            Padrão
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <SeletorCor
            value={rascunho}
            onChange={setRascunho}
            rotulo={`Escolher a cor de ${nome}`}
            paletaExtra={{ titulo: "Cores do mapa", cores: PALETA_CONSULTOR }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            aoSalvar(rascunho);
            setEditando(false);
          }}
          aria-label="Salvar cor"
          title="Salvar"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-accent text-accent-foreground hover:brightness-110"
        >
          <Check size={14} strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          aria-label="Cancelar"
          title="Cancelar"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-surface-border text-secondary hover:bg-zinc-800 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function ClientesMapa({
  clientes,
  ehAdmin = false,
  cores,
  escolhidas = {},
  aoMudarCor,
  aoRestaurarCores,
}: {
  clientes: ClienteComLocal[];
  ehAdmin?: boolean;
  cores?: Record<string, string>;
  // Cores que o admin escolheu à mão (as demais estão no padrão).
  escolhidas?: Record<string, string>;
  aoMudarCor?: (consultorId: string, cor: string | null) => void;
  aoRestaurarCores?: () => void;
}) {
  const mapaRef = useRef<HTMLDivElement>(null);
  const mapaInstancia = useRef<L.Map | null>(null);
  const camadaMarcadores = useRef<L.LayerGroup | null>(null);
  const camadaEstrada = useRef<L.TileLayer | null>(null);
  const camadaSatelite = useRef<L.TileLayer | null>(null);
  const [camada, setCamada] = useState<Camada>("estrada");
  const [seletorAberto, setSeletorAberto] = useState(false);
  const seletorCamadasRef = useRef<HTMLDivElement>(null);

  // Fecha o seletor de camadas ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!seletorAberto) return;
    function fora(e: PointerEvent) {
      if (!seletorCamadasRef.current?.contains(e.target as Node)) setSeletorAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setSeletorAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [seletorAberto]);
  const [corPor, setCorPor] = useState<CorPor>("tempo");
  const { confirmar, avisar } = useConfirm();
  const [visitasDe, setVisitasDe] = useState<{ id: string; nome: string } | null>(null);

  const comLocalizacao = useMemo(
    () => clientes.filter((c) => c.latitude != null && c.longitude != null),
    [clientes]
  );

  const consultoresNoMapa = useMemo(() => {
    const mapa = new Map<string, { nome: string; qtd: number }>();
    for (const c of comLocalizacao) {
      const chave = c.consultorId ?? "sem-consultor";
      const nome = c.consultorNome ?? "Sem consultor";
      const atual = mapa.get(chave);
      if (atual) atual.qtd += 1;
      else mapa.set(chave, { nome, qtd: 1 });
    }
    return Array.from(mapa.entries());
  }, [comLocalizacao]);

  const faixaDoCliente = useMemo(() => {
    const agora = new Date();
    return new Map(
      comLocalizacao.map((c) => [c.id, faixaPorDias(diasDesde(c.ultimaVisita, agora))])
    );
  }, [comLocalizacao]);

  const qtdPorFaixa = useMemo(() => {
    const qtd = new Map<FaixaRecencia, number>();
    for (const faixa of faixaDoCliente.values()) qtd.set(faixa, (qtd.get(faixa) ?? 0) + 1);
    return qtd;
  }, [faixaDoCliente]);

  useEffect(() => {
    if (!mapaRef.current || mapaInstancia.current) return;

    const map = L.map(mapaRef.current).setView(CENTRO_BRASIL, 4);
    mapaInstancia.current = map;

    camadaEstrada.current = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "© OpenStreetMap", maxZoom: 19 }
    ).addTo(map);
    camadaSatelite.current = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "© Esri", maxZoom: 19, maxNativeZoom: 17 }
    );

    camadaMarcadores.current = L.layerGroup().addTo(map);

    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapaInstancia.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapaInstancia.current;
    if (!map || !camadaEstrada.current || !camadaSatelite.current) return;
    if (camada === "estrada") {
      map.removeLayer(camadaSatelite.current);
      camadaEstrada.current.addTo(map);
    } else {
      map.removeLayer(camadaEstrada.current);
      camadaSatelite.current.addTo(map);
    }
  }, [camada]);

  useEffect(() => {
    const grupo = camadaMarcadores.current;
    const map = mapaInstancia.current;
    if (!grupo || !map) return;
    grupo.clearLayers();

    for (const c of comLocalizacao) {
      const posOriginal: [number, number] = [c.latitude!, c.longitude!];
      const marcador = L.marker(posOriginal, {
        icon: pinIcon(
          corPor === "tempo"
            ? corDaFaixa(faixaDoCliente.get(c.id) ?? "nunca")
            : corDoConsultor(c.consultorId, cores)
        ),
        draggable: false,
      });

      marcador.bindPopup(
        popupDoCliente(c, {
          ehAdmin,
          aoVerVisitas: () => {
            marcador.closePopup();
            setVisitasDe({ id: c.id, nome: c.nome });
          },
          aoClicarMover: () => {
            marcador.dragging?.enable();
            marcador.closePopup();
          },
        })
      );

      // Segurar com o botão direito e arrastar move o pin; ao soltar, pede pra salvar.
      if (ehAdmin) {
        marcador.on("contextmenu", (e) => L.DomEvent.preventDefault(e.originalEvent));
        marcador.on("mousedown", (e) => {
          if (e.originalEvent.button !== 2) return;
          L.DomEvent.stop(e.originalEvent);
          map.dragging.disable();
          const container = map.getContainer();
          container.style.cursor = "grabbing";
          const mover = (ev: MouseEvent) => marcador.setLatLng(map.mouseEventToLatLng(ev));
          const bloquearMenu = (ev: MouseEvent) => ev.preventDefault();
          const soltar = () => {
            document.removeEventListener("mousemove", mover);
            document.removeEventListener("mouseup", soltar);
            setTimeout(() => document.removeEventListener("contextmenu", bloquearMenu), 0);
            container.style.cursor = "";
            map.dragging.enable();
            marcador.fire("dragend");
          };
          document.addEventListener("mousemove", mover);
          document.addEventListener("mouseup", soltar);
          document.addEventListener("contextmenu", bloquearMenu);
        });
      }

      marcador.on("dragend", async () => {
        const pos = marcador.getLatLng();
        if (pos.lat === posOriginal[0] && pos.lng === posOriginal[1]) return;
        const confirmou = await confirmar(
          { mensagem: `Salvar a nova localização de "${c.nome}"?`, confirmarLabel: "Salvar localização" }
        );
        if (!confirmou) {
          marcador.setLatLng(posOriginal);
          marcador.dragging?.disable();
          return;
        }
        const resultado = await atualizarLocalizacaoCliente(c.id, pos.lat, pos.lng);
        if (!resultado.ok) {
          await avisar(resultado.erro);
          marcador.setLatLng(posOriginal);
        }
        marcador.dragging?.disable();
      });

      grupo.addLayer(marcador);
    }
  }, [comLocalizacao, corPor, faixaDoCliente, cores, ehAdmin, confirmar, avisar]);

  // Enquadra só quando a lista muda — trocar a cor não mexe no zoom.
  useEffect(() => {
    const map = mapaInstancia.current;
    if (!map || comLocalizacao.length === 0) return;
    const bounds = L.latLngBounds(
      comLocalizacao.map((c) => [c.latitude!, c.longitude!] as [number, number])
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [comLocalizacao]);

  return (
    <div className="relative">
      <div
        ref={mapaRef}
        className="h-[calc(100vh-150px)] min-h-[420px] w-full rounded border border-surface-border md:h-[calc(100vh-92px)]"
      />

      <div ref={seletorCamadasRef} className="absolute right-4 top-4 z-[400]">
        <button
          type="button"
          onClick={() => setSeletorAberto((v) => !v)}
          aria-label="Escolher camada do mapa"
          aria-expanded={seletorAberto}
          title="Camadas do mapa"
          className={`flex h-10 w-10 items-center justify-center rounded border bg-zinc-900/95 shadow-lg transition ${
            seletorAberto
              ? "border-accent text-accent"
              : "border-surface-border text-zinc-200 hover:border-zinc-500 hover:text-white"
          }`}
        >
          <Layers size={18} />
        </button>
        {seletorAberto && (
          <div
            role="menu"
            aria-label="Camadas do mapa"
            className="absolute right-0 top-12 w-52 rounded border border-surface-border bg-zinc-900/98 p-2 shadow-2xl"
          >
            <p className="px-1.5 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Camada do mapa
            </p>
            {(
              [
                {
                  id: "estrada" as Camada,
                  nome: "Estrada",
                  detalhe: "Ruas, rodovias e cidades",
                  previa: "linear-gradient(135deg,#efece3 0 45%,#cfe0b8 45% 70%,#f1c97a 70% 74%,#efece3 74%)",
                },
                {
                  id: "satelite" as Camada,
                  nome: "Satélite",
                  detalhe: "Imagem aérea das fazendas",
                  previa: "linear-gradient(135deg,#2f4a2a 0 40%,#6b5a3a 40% 62%,#3e6a38 62% 85%,#25401f 85%)",
                },
              ]
            ).map((opcao) => {
              const ativa = camada === opcao.id;
              return (
                <button
                  key={opcao.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={ativa}
                  onClick={() => {
                    setCamada(opcao.id);
                    setSeletorAberto(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded p-1.5 text-left transition ${
                    ativa ? "bg-accent/15" : "hover:bg-zinc-800"
                  }`}
                >
                  <span
                    className={`h-11 w-11 shrink-0 rounded-sm border-2 ${
                      ativa ? "border-accent" : "border-zinc-700"
                    }`}
                    style={{ background: opcao.previa }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold ${ativa ? "text-accent" : "text-zinc-100"}`}>
                      {opcao.nome}
                    </span>
                    <span className="block truncate text-[11px] text-muted">{opcao.detalhe}</span>
                  </span>
                  {ativa && <Check size={15} className="shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {comLocalizacao.length > 0 && (
        <div className="absolute bottom-4 left-4 z-[400] w-56 max-w-[calc(100%-2rem)] rounded border border-surface-border bg-zinc-900/95 p-2.5 text-xs shadow-lg">
          <div className="mb-2 flex rounded-md border border-surface-border p-0.5">
            {(["consultor", "tempo"] as const).map((opcao) => (
              <button
                key={opcao}
                onClick={() => setCorPor(opcao)}
                title={opcao === "tempo" ? "Colorir pelo tempo desde a última visita" : "Colorir por consultor"}
                className={`flex-1 whitespace-nowrap rounded px-2 py-1 font-medium ${
                  corPor === opcao ? "bg-accent text-accent-foreground" : "text-secondary hover:text-zinc-200"
                }`}
              >
                {opcao === "tempo" ? "Última visita" : "Consultor"}
              </button>
            ))}
          </div>
          {/* Altura fixa: o card não muda de tamanho entre os modos nem com a quantidade de itens. */}
          <div className="h-44 overflow-y-auto pr-1">
          <div className="space-y-0.5">
            {corPor === "tempo"
              ? FAIXAS_RECENCIA.map((f) => (
                  <div key={f.faixa} className="flex items-center gap-2 py-0.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.cor }} />
                    <span className="flex-1 text-secondary">{f.rotulo}</span>
                    <span className="text-zinc-300">{qtdPorFaixa.get(f.faixa) ?? 0}</span>
                  </div>
                ))
              : consultoresNoMapa.map(([chave, { nome }]) => (
                  <LinhaConsultor
                    key={chave}
                    nome={nome}
                    cor={corDoConsultor(chave === "sem-consultor" ? null : chave, cores)}
                    manual={Boolean(escolhidas[chave])}
                    editavel={Boolean(ehAdmin && aoMudarCor) && chave !== "sem-consultor"}
                    aoSalvar={(cor) => aoMudarCor?.(chave, cor)}
                  />
                ))}
            {corPor === "consultor" && ehAdmin && Object.keys(escolhidas).length > 0 && aoRestaurarCores && (
              <button
                onClick={aoRestaurarCores}
                className="mt-2 w-full rounded border border-surface-border py-1 text-[11px] text-secondary hover:bg-zinc-800 hover:text-zinc-200"
              >
                Restaurar cores padrão
              </button>
            )}
          </div>
          </div>
          <p className="mt-2 border-t border-surface-border pt-2 text-muted">
            Total: <span className="text-zinc-300">{comLocalizacao.length}</span>
          </p>
        </div>
      )}

      {comLocalizacao.length === 0 && (
        <p role="status" className="absolute inset-x-2 top-16 z-[500] mx-auto w-fit max-w-[calc(100%-1rem)] rounded-lg bg-zinc-900/95 px-4 py-2 text-sm text-zinc-300 shadow-lg">
          {clientes.length === 0 ? 'Nenhum cliente cadastrado. Abra "Clientes" no menu para começar.' : 'Nenhum cliente com localização nos filtros atuais. Altere os filtros ou informe a localização em "Clientes" no menu.'}
        </p>
      )}
      {visitasDe && <VisitasClienteModal cliente={visitasDe} aoFechar={() => setVisitasDe(null)} />}
    </div>
  );
}
