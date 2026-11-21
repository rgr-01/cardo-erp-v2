"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import { Check, Plus, Smartphone } from "lucide-react";
import {
  gerarCodigoWhatsapp,
  desvincularWhatsapp,
  salvarModoRespostaWhatsapp,
  salvarRecebimentoRelatorioMensal,
  salvarRecebimentoAlertasSeguranca,
  salvarRecebimentoAlertasMargem,
  salvarRecebimentoNotificacoesPedidos,
} from "@/app/actions/whatsapp";
import { Button } from "@/components/ui/button";

const MODOS_RESPOSTA = [
  { valor: "ESPELHAR", curto: "Igual ao meu", detalhe: "Áudio quando eu mando áudio, texto quando mando texto" },
  { valor: "AUDIO", curto: "Áudio", detalhe: "Sempre em áudio, com resumos por escrito" },
  { valor: "TEXTO", curto: "Texto", detalhe: "Só texto, nunca manda áudio" },
] as const;

export type NumeroVinculado = {
  id: string;
  waId: string;
  modoResposta: string;
  receberRelatorioMensal: boolean;
  receberAlertasSeguranca: boolean;
  receberAlertasMargem: boolean;
  receberNotificacoesPedidos: boolean;
};

// waId vem como os dígitos do número (às vezes com @s.whatsapp.net):
// 5566999998888 → +55 (66) 99999-8888.
function formatarNumero(waId: string): string {
  const d = waId.replace(/\D/g, "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
}

export function WhatsappPainel({
  numeros,
  podeVincularOutro,
  ehAdmin,
  numeroConfigurado,
  numeroDoBot,
}: {
  numeros: NumeroVinculado[];
  podeVincularOutro: boolean;
  ehAdmin: boolean;
  numeroConfigurado: boolean;
  numeroDoBot: string | null;
}) {
  const router = useRouter();
  const [codigo, setCodigo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function gerar() {
    setErro(null);
    startTransition(async () => {
      const resultado = await gerarCodigoWhatsapp();
      if (resultado.ok) setCodigo(resultado.codigo ?? null);
      else setErro(resultado.erro);
    });
  }

  if (!numeroConfigurado) {
    return (
      <div className="rounded-xl border border-surface-border bg-zinc-900 p-6">
        <h1 className="mb-2 text-xl font-bold text-white">Bot de WhatsApp</h1>
        <p className="text-sm text-secondary">
          O WhatsApp do sistema ainda não está disponível. Peça ao administrador para configurar a integração antes de vincular seu número.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Bot de WhatsApp — RedeBot</h1>
          <p className="mt-1 max-w-xl text-sm text-secondary">
            Vincule seu número para registrar relatórios de visita, consultar
            suas vendas e pesquisar informações direto pelo WhatsApp.
          </p>
          {numeroDoBot && (
            <p className="mt-2 text-sm text-zinc-300">
              Envie uma mensagem para o RedeBot no número{" "}
              <span className="font-semibold text-accent">{formatarNumero(numeroDoBot)}</span>{" "}
              para começar a vincular.
            </p>
          )}
        </div>
        {podeVincularOutro && (
          <Button variant="primary" onClick={gerar} disabled={pendente}>
            <Plus size={16} />
            {pendente
              ? "Gerando..."
              : numeros.length === 0
                ? "Vincular número"
                : "Vincular outro número"}
          </Button>
        )}
      </div>

      {codigo && (
        <div className="max-w-md rounded-xl border border-accent/40 bg-zinc-900 p-4">
          <p className="text-sm text-zinc-300">
            No WhatsApp do celular que você quer vincular, envie este código
            para o número do RedeBot{numeroDoBot && <> ({formatarNumero(numeroDoBot)})</>}:
          </p>
          <p className="mt-2 text-center text-2xl font-bold tracking-widest text-accent">
            {codigo}
          </p>
          <p className="mt-2 text-xs text-muted">
            Válido por 15 minutos. Depois de enviar, atualize esta página.
          </p>
        </div>
      )}

      {numeros.length === 0 && !codigo ? (
        <p className="text-sm text-muted">Nenhum número vinculado. Gere um código para conectar seu WhatsApp.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {numeros.map((numero) => (
            <CartaoNumero
              key={numero.id}
              numero={numero}
              ehAdmin={ehAdmin}
              onErro={setErro}
              onMudou={() => router.refresh()}
            />
          ))}
        </div>
      )}

      {!podeVincularOutro && (
        <p className="text-xs text-muted">
          Cada consultor vincula um número. Pra trocar, desvincule o atual.
        </p>
      )}

      {erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}
    </div>
  );
}

function CartaoNumero({
  numero,
  ehAdmin,
  onErro,
  onMudou,
}: {
  numero: NumeroVinculado;
  ehAdmin: boolean;
  onErro: (erro: string | null) => void;
  onMudou: () => void;
}) {
  const [modo, setModo] = useState(numero.modoResposta);
  const [recebeMensal, setRecebeMensal] = useState(numero.receberRelatorioMensal);
  const [recebeAlertas, setRecebeAlertas] = useState(numero.receberAlertasSeguranca);
  const [recebeMargem, setRecebeMargem] = useState(numero.receberAlertasMargem);
  const [recebePedidos, setRecebePedidos] = useState(numero.receberNotificacoesPedidos);
  const [pendente, startTransition] = useTransition();
  const { confirmar } = useConfirm();

  function mudarRecebimento(receber: boolean) {
    onErro(null);
    setRecebeMensal(receber);
    startTransition(async () => {
      const resultado = await salvarRecebimentoRelatorioMensal(numero.id, receber);
      if (!resultado.ok) {
        setRecebeMensal(!receber);
        onErro(resultado.erro);
      }
    });
  }

  function mudarAlertas(receber: boolean) {
    setRecebeAlertas(receber);
    startTransition(async () => {
      const resultado = await salvarRecebimentoAlertasSeguranca(numero.id, receber);
      if (!resultado.ok) { setRecebeAlertas(!receber); onErro(resultado.erro); }
    });
  }

  function mudarAlertasMargem(receber: boolean) {
    setRecebeMargem(receber);
    startTransition(async () => {
      const resultado = await salvarRecebimentoAlertasMargem(numero.id, receber);
      if (!resultado.ok) { setRecebeMargem(!receber); onErro(resultado.erro); }
    });
  }

  function mudarNotificacoesPedidos(receber: boolean) {
    setRecebePedidos(receber);
    startTransition(async () => {
      const resultado = await salvarRecebimentoNotificacoesPedidos(numero.id, receber);
      if (!resultado.ok) { setRecebePedidos(!receber); onErro(resultado.erro); }
    });
  }

  function mudarModo(novo: string) {
    onErro(null);
    const anterior = modo;
    setModo(novo);
    startTransition(async () => {
      const resultado = await salvarModoRespostaWhatsapp(numero.id, novo);
      if (!resultado.ok) {
        setModo(anterior);
        onErro(resultado.erro);
      }
    });
  }

  async function desvincular() {
    if (!(await confirmar({ mensagem: `Desvincular ${formatarNumero(numero.waId)}? O bot para de responder nesse número.`, confirmarLabel: "Desvincular", variante: "perigo" }))) return;
    onErro(null);
    startTransition(async () => {
      const resultado = await desvincularWhatsapp(numero.id);
      if (resultado.ok) onMudou();
      else onErro(resultado.erro);
    });
  }

  const detalheModo = MODOS_RESPOSTA.find((o) => o.valor === modo)?.detalhe;

  return (
    <div className="space-y-4 rounded-xl border border-surface-border bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-white">
            <Smartphone size={16} className="shrink-0 text-accent" />
            <span className="truncate">{formatarNumero(numero.waId)}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-green-300">
            <Check size={12} /> Vinculado
          </p>
        </div>
        <button
          onClick={desvincular}
          disabled={pendente}
          className="shrink-0 text-xs text-muted transition hover:text-red-400 disabled:opacity-50"
        >
          Desvincular
        </button>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-secondary">Como o bot responde</p>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-surface-border p-1">
          {MODOS_RESPOSTA.map((opcao) => (
            <button
              key={opcao.valor}
              onClick={() => mudarModo(opcao.valor)}
              disabled={pendente}
              title={opcao.detalhe}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                modo === opcao.valor
                  ? "bg-accent text-accent-foreground"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {opcao.curto}
            </button>
          ))}
        </div>
        {detalheModo && <p className="mt-1.5 text-xs text-muted">{detalheModo}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-secondary">Notificações</p>
        {ehAdmin && <>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
          <input
            type="checkbox"
            checked={recebeMensal}
            onChange={(e) => mudarRecebimento(e.target.checked)}
            disabled={pendente}
            className="accent-[var(--accent)]"
          />
          Receber o relatório mensal
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" checked={recebeAlertas} onChange={(e) => mudarAlertas(e.target.checked)} disabled={pendente} className="accent-[var(--accent)]" />
          Receber alertas de segurança
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" checked={recebeMargem} onChange={(e) => mudarAlertasMargem(e.target.checked)} disabled={pendente} className="accent-[var(--accent)]" />
          Receber alertas de margem
        </label>
        </>}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" checked={recebePedidos} onChange={(e) => mudarNotificacoesPedidos(e.target.checked)} disabled={pendente} className="accent-[var(--accent)]" />
          Receber notificações de pedidos
        </label>
        <p className="pl-6 text-xs text-muted">
          {ehAdmin
            ? "Pedidos assinados e liberados pelo financeiro de toda a equipe."
            : "Apenas seus pedidos: assinatura concluída e liberação para faturamento."}
        </p>
      </div>
    </div>
  );
}
