"use client";

import { useState } from "react";
import { fmtBRL } from "@/lib/format";
import { MESES_NOME } from "@/lib/despesas-contas";

export type BarraMes = {
  y: number;
  m: number;
  futuro: boolean;
  atual: boolean;
  // total por grupo, na ordem de `grupos`
  porGrupo: number[];
  total: number;
  orcado: number | null;
};

const W = 1000;
const H = 300;
const L = 64;
const R = 12;
const T = 14;
const B = 30;

export function GraficoMensal({
  barras,
  grupos,
  selecionado,
  aoSelecionar,
}: {
  barras: BarraMes[];
  grupos: { nome: string; cor: string }[];
  selecionado: { y: number; m: number };
  aoSelecionar: (y: number, m: number) => void;
}) {
  const [dica, setDica] = useState<{ i: number; x: number; y: number } | null>(null);

  const temOrcado = barras.some((b) => b.orcado != null);
  const mx = Math.max(1, ...barras.map((b) => Math.max(b.total, b.orcado ?? 0))) * 1.08;
  const ch = H - T - B;
  const yOf = (v: number) => T + ch - (v / mx) * ch;
  const bw = (W - L - R) / barras.length;
  const barW = Math.min(46, bw * 0.56);
  const step = Math.pow(10, Math.floor(Math.log10(mx / 4)));
  const tick = Math.ceil(mx / 4 / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= mx; v += tick) ticks.push(v);

  const linhaOrcamento = temOrcado
    ? barras.map((b, i) => `${L + i * bw + bw / 2},${yOf(b.orcado ?? 0)}`).join(" ")
    : null;
  const dicaBarra = dica ? barras[dica.i] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary">
        {grupos.map((g) => (
          <span key={g.nome} className="flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: g.cor }} />
            {g.nome}
          </span>
        ))}
        {temOrcado && (
          <span className="flex items-center gap-1.5">
            <svg width="18" height="4" aria-hidden="true">
              <line x1="0" x2="18" y1="2" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" />
            </svg>
            Orçamento
          </span>
        )}
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ minWidth: 640 }}
          className="block h-auto w-full"
          role="img"
          aria-label="Despesas mensais por grupo de contas"
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={yOf(v)} y2={yOf(v)} stroke="rgba(150,200,200,.13)" />
              <text x={L - 8} y={yOf(v) + 4} textAnchor="end" fontSize="11" fill="#8ea3ab" fontFamily="monospace">
                {v ? `${Math.round(v / 1000)} mil` : "0"}
              </text>
            </g>
          ))}

          {barras.map((b, i) => {
            const cx = L + i * bw + bw / 2;
            const sel = b.y === selecionado.y && b.m === selecionado.m;
            let acc = 0;
            const ultimo = b.porGrupo.findLastIndex((x) => x > 0);
            return (
              <g key={`${b.y}-${b.m}`}>
                {sel && (
                  <rect x={L + i * bw + 2} y={T} width={bw - 4} height={ch} rx="6" fill="rgba(0,220,77,.10)" />
                )}
                {b.porGrupo.map((v, j) => {
                  if (!v) return null;
                  const h = (v / mx) * ch;
                  const top = yOf(acc + v);
                  acc += v;
                  return (
                    <rect
                      key={j}
                      x={cx - barW / 2}
                      y={top}
                      width={barW}
                      height={Math.max(h - 2, 0.5)}
                      rx={j === ultimo ? 4 : 0}
                      fill={grupos[j].cor}
                    />
                  );
                })}
                {b.futuro && b.orcado != null && (
                  <rect
                    x={cx - barW / 2}
                    y={yOf(b.orcado)}
                    width={barW}
                    height={yOf(0) - yOf(b.orcado)}
                    rx="4"
                    fill="none"
                    stroke="#4a6670"
                    strokeDasharray="4 3"
                  />
                )}
                <text
                  x={cx}
                  y={H - 10}
                  textAnchor="middle"
                  fontSize="12"
                  fill={sel ? "#ecf1f3" : "#8ea3ab"}
                  fontWeight={sel ? 600 : 400}
                >
                  {MESES_NOME[b.m].slice(0, 3)}/{String(b.y).slice(2)}
                </text>
              </g>
            );
          })}

          {linhaOrcamento && (
            <polyline
              points={linhaOrcamento}
              fill="none"
              stroke="#ecf1f3"
              strokeWidth="2"
              strokeDasharray="6 4"
              opacity=".75"
            />
          )}

          {barras.map((b, i) => (
            <rect
              key={`hit-${b.y}-${b.m}`}
              x={L + i * bw}
              y={T}
              width={bw}
              height={ch + B}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseMove={(e) => {
                const box = e.currentTarget.ownerSVGElement!.parentElement!.getBoundingClientRect();
                setDica({ i, x: e.clientX - box.left, y: e.clientY - box.top });
              }}
              onMouseLeave={() => setDica(null)}
              onClick={() => !b.futuro && aoSelecionar(b.y, b.m)}
            />
          ))}
        </svg>

        {dica && dicaBarra && (
          <div
            className="pointer-events-none absolute z-10 min-w-56 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.max(0, dica.x + 14), top: Math.max(0, dica.y - 40) }}
          >
            <div className="mb-1 font-semibold text-white">
              {MESES_NOME[dicaBarra.m]} de {dicaBarra.y}
              {dicaBarra.futuro ? " · sem lançamentos" : dicaBarra.atual ? " · até hoje" : ""}
            </div>
            {grupos.map((g, j) => (
              <div key={g.nome} className="flex justify-between gap-3">
                <span className="flex items-center gap-1.5 text-secondary">
                  <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: g.cor }} />
                  {g.nome}
                </span>
                <span>{fmtBRL(dicaBarra.porGrupo[j])}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between gap-3 border-t border-zinc-700 pt-1">
              <span className="text-secondary">Total</span>
              <b className="text-white">{fmtBRL(dicaBarra.total)}</b>
            </div>
            {dicaBarra.orcado != null && (
              <div className="flex justify-between gap-3">
                <span className="text-secondary">Orçamento</span>
                <span>{fmtBRL(dicaBarra.orcado)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
