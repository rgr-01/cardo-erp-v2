import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Histórico" };

const VARIANT_ACAO: Record<string, "success" | "info" | "danger" | "warning"> = {
  Criou: "success",
  Atualizou: "info",
  Excluiu: "danger",
  Importou: "warning",
};

export default async function HistoricoPage() {
  const session = await auth();
  if (session!.user.role !== "ADMIN") redirect("/dashboard");

  const registros = await prisma.historico.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Histórico</h1>
        <p className="text-sm text-muted">
          Últimas {registros.length} alterações registradas
        </p>
      </div>

      <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
              <th className="px-3 py-2.5">Data/hora</th>
              <th className="px-3 py-2.5">Usuário</th>
              <th className="px-3 py-2.5">Ação</th>
              <th className="px-3 py-2.5">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id} className="border-b border-surface-border/50">
                <td className="whitespace-nowrap px-3 py-2 text-secondary">
                  {r.createdAt.toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-3 py-2 font-medium text-white">
                  {r.usuarioNome}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={VARIANT_ACAO[r.acao] ?? "neutral"}>
                    {r.acao}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-zinc-300">{r.detalhes}</td>
              </tr>
            ))}
            {registros.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted">
                  Nenhuma alteração registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
