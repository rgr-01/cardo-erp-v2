"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { pinIcon } from "@/lib/leaflet-icon";
import { extrairPontoKml } from "@/lib/kml";

const CENTRO_BRASIL: [number, number] = [-15.78, -47.93];

type Camada = "mapa" | "satelite";

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";

export function LocalizacaoModal({
  latInicial,
  lonInicial,
  onSalvar,
  onFechar,
}: {
  latInicial: number | null;
  lonInicial: number | null;
  onSalvar: (lat: number | null, lon: number | null) => void;
  onFechar: () => void;
}) {
  const mapaRef = useRef<HTMLDivElement>(null);
  const mapaInstancia = useRef<L.Map | null>(null);
  const marcadorRef = useRef<L.Marker | null>(null);
  const camadaMapa = useRef<L.TileLayer | null>(null);
  const camadaSatelite = useRef<L.TileLayer | null>(null);
  const [lat, setLat] = useState(latInicial);
  const [lon, setLon] = useState(lonInicial);
  const [erroKml, setErroKml] = useState<string | null>(null);
  const [camada, setCamada] = useState<Camada>("mapa");
  const [seletorAberto, setSeletorAberto] = useState(false);
  const seletorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!seletorAberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (seletorRef.current && !seletorRef.current.contains(e.target as Node)) {
        setSeletorAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [seletorAberto]);

  useEffect(() => {
    if (!mapaRef.current || mapaInstancia.current) return;

    const centro: [number, number] =
      lat != null && lon != null ? [lat, lon] : CENTRO_BRASIL;
    const map = L.map(mapaRef.current).setView(centro, lat != null ? 15 : 4);
    mapaInstancia.current = map;

    camadaMapa.current = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "© OpenStreetMap", maxZoom: 19 }
    ).addTo(map);
    camadaSatelite.current = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "© Esri", maxZoom: 19, maxNativeZoom: 17 }
    );

    if (lat != null && lon != null) {
      marcadorRef.current = L.marker([lat, lon], {
        icon: pinIcon("#00dc4d"),
        draggable: true,
      }).addTo(map);
      marcadorRef.current.on("dragend", (e) => {
        const pos = (e.target as L.Marker).getLatLng();
        setLat(pos.lat);
        setLon(pos.lng);
      });
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      setLat(e.latlng.lat);
      setLon(e.latlng.lng);
    });

    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapaInstancia.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inicializa só uma vez
  }, []);

  useEffect(() => {
    const map = mapaInstancia.current;
    if (!map || !camadaMapa.current || !camadaSatelite.current) return;
    if (camada === "mapa") {
      map.removeLayer(camadaSatelite.current);
      camadaMapa.current.addTo(map);
    } else {
      map.removeLayer(camadaMapa.current);
      camadaSatelite.current.addTo(map);
    }
  }, [camada]);

  // Mantém o marcador sincronizado quando lat/lon muda (clique no mapa,
  // digitação manual ou importação de KML).
  useEffect(() => {
    const map = mapaInstancia.current;
    if (!map) return;
    if (lat == null || lon == null) {
      marcadorRef.current?.remove();
      marcadorRef.current = null;
      return;
    }
    if (!marcadorRef.current) {
      marcadorRef.current = L.marker([lat, lon], {
        icon: pinIcon("#00dc4d"),
        draggable: true,
      }).addTo(map);
      marcadorRef.current.on("dragend", (e) => {
        const pos = (e.target as L.Marker).getLatLng();
        setLat(pos.lat);
        setLon(pos.lng);
      });
    } else {
      marcadorRef.current.setLatLng([lat, lon]);
    }
    map.setView([lat, lon], Math.max(map.getZoom(), 14));
  }, [lat, lon]);

  function importarKml(arquivo: File) {
    setErroKml(null);
    const leitor = new FileReader();
    leitor.onload = () => {
      const ponto = extrairPontoKml(String(leitor.result ?? ""));
      if (!ponto) {
        setErroKml("O arquivo KML não contém um ponto com coordenadas. Escolha outro arquivo ou informe a localização no mapa.");
        return;
      }
      setLat(ponto.lat);
      setLon(ponto.lon);
    };
    leitor.onerror = () => setErroKml("Não foi possível ler o arquivo. Selecione-o novamente ou escolha outro KML.");
    leitor.readAsText(arquivo);
  }

  return (
    <DialogFrame onClose={onFechar} label={"Localização do cliente"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 lg:pl-64">
      <div className="w-full max-w-[95vw] rounded-xl border border-surface-border bg-zinc-900 p-5 lg:max-w-5xl">
        <h2 className="mb-3 text-lg font-bold text-white">Localização do cliente</h2>
        <p className="mb-3 text-xs text-muted">
          Clique no mapa pra marcar o ponto (ou arraste o pin), digite as
          coordenadas manualmente, ou importe um KML.
        </p>

        <div className="relative mb-3">
          <div
            ref={mapaRef}
            className="h-[65vh] w-full rounded-lg border border-surface-border"
          />

          <div ref={seletorRef} className="absolute right-3 top-3 z-[400]">
            <button
              type="button"
              onClick={() => setSeletorAberto((a) => !a)}
              className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-zinc-900/95 px-2.5 py-1.5 text-xs font-medium text-zinc-200 shadow-lg hover:bg-zinc-800"
            >
              <Layers size={14} />
              {camada === "mapa" ? "Mapa" : "Satélite"}
            </button>

            {seletorAberto && (
              <div className="absolute right-0 top-full mt-1 overflow-hidden rounded-lg border border-surface-border bg-zinc-900/95 shadow-lg">
                {(["mapa", "satelite"] as const).map((opcao) => (
                  <button
                    key={opcao}
                    type="button"
                    onClick={() => {
                      setCamada(opcao);
                      setSeletorAberto(false);
                    }}
                    className={`block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs font-medium ${
                      camada === opcao
                        ? "bg-accent text-accent-foreground"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {opcao === "mapa" ? "Mapa" : "Satélite"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">
              Latitude
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={lat ?? ""}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                setLat(v.trim() ? Number(v) : null);
              }}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">
              Longitude
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={lon ?? ""}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                setLon(v.trim() ? Number(v) : null);
              }}
              className={inputCls}
            />
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-surface-border px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            Importar KML
            <input
              type="file"
              accept=".kml"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                e.target.value = "";
                if (arquivo) importarKml(arquivo);
              }}
            />
          </label>
          {lat != null && lon != null && (
            <button
              type="button"
              onClick={() => {
                setLat(null);
                setLon(null);
              }}
              className="rounded-lg px-3 py-2 text-sm text-secondary hover:bg-zinc-800 hover:text-red-400"
            >
              Remover localização
            </button>
          )}
          {erroKml && <span className="text-xs text-red-400">{erroKml}</span>}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger-ink hover:bg-danger/20"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSalvar(lat, lon)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110"
          >
            Salvar localização
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
