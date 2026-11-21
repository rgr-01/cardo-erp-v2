"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
  LabelList,
} from "recharts";
import {
  STATUS_LABELS,
  STATUS_CORES,
  STATUS_ORDEM,
  corCultura,
  fmtBRL,
  fmtBRLCompacto,
  fmtPct,
  type Status,
} from "@/lib/format";
import type { LinhaCliente } from "@/lib/dashboard";

const TOOLTIP_STYLE = {
  backgroundColor: "#19323b",
  border: "1px solid #34525d",
  borderRadius: 8,
  color: "#ecf1f3",
} as const;

// Sem itemStyle fixo: o nome de cada série aparece na cor da legenda
const TOOLTIP_PROPS = {
  contentStyle: TOOLTIP_STYLE,
  labelStyle: { color: "#8ea3ab" },
} as const;

function tooltipBRL(value: unknown) {
  return fmtBRL(Number(value ?? 0));
}

export function GraficoMeta({
  meta,
  faturado,
  emAndamento,
}: {
  meta: number;
  faturado: number;
  emAndamento: number;
}) {
  const restante = Math.max(meta - faturado - emAndamento, 0);
  const data = [
    { name: "Faturado", value: faturado, cor: "#00dc4d" },
    { name: "Pipeline em aberto", value: emAndamento, cor: "#3b82f6" },
    { name: "Potencial restante", value: restante, cor: "#eab308" },
  ].filter((d) => d.value > 0);
  const pctAtingida = meta > 0 ? faturado / meta : 0;

  return (
    <div className="relative h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={3}
            cornerRadius={6}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.cor} />
            ))}
          </Pie>
          <Tooltip {...TOOLTIP_PROPS} formatter={tooltipBRL} />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: "#8ea3ab" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
        <span className="text-lg font-bold text-white">
          {fmtPct(pctAtingida)}
        </span>
        <span className="text-xs text-muted">da meta atingida</span>
      </div>
    </div>
  );
}

export function GraficoPizza({
  data,
  modo,
}: {
  data: { name: string; value: number; status?: Status }[];
  modo: "status" | "cultura";
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            outerRadius="68%"
            paddingAngle={1}
            cornerRadius={3}
            stroke="#19323b"
            strokeWidth={1}
            label={({ percent }) =>
              (percent ?? 0) >= 0.05 ? fmtPct(percent ?? 0) : ""
            }
            labelLine={false}
            fontSize={11}
          >
            {data.map((d) => (
              <Cell
                key={d.name}
                fill={
                  modo === "status" && d.status
                    ? STATUS_CORES[d.status]
                    : corCultura(d.name)
                }
              />
            ))}
          </Pie>
          <Tooltip {...TOOLTIP_PROPS} formatter={tooltipBRL} />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: "#8ea3ab" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoFunil({
  data,
}: {
  data: { status: Status; label: string; total: number; qtd: number }[];
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 16, right: 64 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#24434e" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={fmtBRLCompacto}
            tick={{ fill: "#8ea3ab", fontSize: 11 }}
            stroke="#34525d"
          />
          <YAxis
            type="category"
            dataKey="label"
            width={90}
            tick={{ fill: "#8ea3ab", fontSize: 12 }}
            stroke="#34525d"
          />
          <Tooltip
            {...TOOLTIP_PROPS}
            itemStyle={{ color: "#ecf1f3" }}
            formatter={(value: unknown, _name: unknown, item: unknown) => {
              const qtd =
                (item as { payload?: { qtd?: number } })?.payload?.qtd ?? 0;
              return [`${fmtBRL(Number(value ?? 0))} (${qtd} itens)`, "Total"];
            }}
            cursor={{ fill: "#24434e" }}
          />
          <Bar dataKey="total" radius={[0, 6, 6, 0]}>
            {data.map((d) => (
              <Cell key={d.status} fill={STATUS_CORES[d.status]} />
            ))}
            <LabelList
              dataKey="total"
              position="right"
              formatter={(v: unknown) => fmtBRLCompacto(Number(v ?? 0))}
              fill="#d6dfe2"
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoEvolucao({
  data,
}: {
  data: { mes: string; total: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted">
        Sem faturamento com data de fechamento registrada.
      </div>
    );
  }
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 16, right: 24, top: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#24434e" />
          <XAxis
            dataKey="mes"
            tick={{ fill: "#8ea3ab", fontSize: 11 }}
            stroke="#34525d"
          />
          <YAxis
            tickFormatter={fmtBRLCompacto}
            tick={{ fill: "#8ea3ab", fontSize: 11 }}
            stroke="#34525d"
          />
          <Tooltip {...TOOLTIP_PROPS} formatter={tooltipBRL} />
          <Line
            type="monotone"
            dataKey="total"
            name="Faturado"
            stroke="#00dc4d"
            strokeWidth={2}
            dot={{ fill: "#00dc4d" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoClientes({ data }: { data: LinhaCliente[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-muted">
        Nenhuma venda registrada.
      </div>
    );
  }
  const largura = Math.max(1200, data.length * 32);
  return (
    <div className="overflow-x-auto pb-1">
      <div style={{ width: largura }} className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} stackOffset="expand" margin={{ top: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#24434e" vertical={false} />
            <XAxis
              dataKey="cliente"
              interval={0}
              angle={-90}
              textAnchor="end"
              height={130}
              tick={{ fill: "#8ea3ab", fontSize: 9 }}
              tickFormatter={(nome: string) =>
                nome.length > 16 ? `${nome.slice(0, 16)}…` : nome
              }
              stroke="#34525d"
            />
            <YAxis
              tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tick={{ fill: "#8ea3ab", fontSize: 11 }}
              stroke="#34525d"
            />
            <Tooltip
              {...TOOLTIP_PROPS}
              formatter={tooltipBRL}
              cursor={{ fill: "#24434e" }}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 12, color: "#8ea3ab" }}
            />
            {STATUS_ORDEM.map((status) => (
              <Bar
                key={status}
                dataKey={status}
                name={STATUS_LABELS[status]}
                stackId="vendas"
                fill={STATUS_CORES[status]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function GraficoRanking({
  data,
}: {
  data: { consultor: string; total: number; faturado: number }[];
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 16, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#24434e" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={fmtBRLCompacto}
            tick={{ fill: "#8ea3ab", fontSize: 11 }}
            stroke="#34525d"
          />
          <YAxis
            type="category"
            dataKey="consultor"
            width={90}
            tick={{ fill: "#8ea3ab", fontSize: 12 }}
            stroke="#34525d"
          />
          <Tooltip
            {...TOOLTIP_PROPS}
            formatter={tooltipBRL}
            cursor={{ fill: "#24434e" }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: "#8ea3ab" }}
          />
          <Bar dataKey="total" name="Pipeline" fill="#eab308" radius={[0, 6, 6, 0]} />
          <Bar dataKey="faturado" name="Faturado" fill="#00dc4d" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
