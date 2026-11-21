# Padrão dos cards — Financeiro e Gestão de visitas

Revisão de 4 de novembro de 2026. O padrão visual do painel de vendas foi
centralizado em `components/ui/kpi.tsx`, `card.tsx` e `padroes-painel.ts`.

Indicadores usam superfície neutra, borda simples, ícone de 16 px no canto,
rótulo de 12 px, valor semibold com números tabulares e detalhe de 11 px.
O título dos painéis tem 14 px. O espaçamento interno é de 16 px, passando
a 20 px em telas maiores. Os temas claro/escuro continuam usando os tokens
existentes. Não foram acrescentadas sombras ou fundos decorativos.

Valores financeiros não são truncados ou arredondados por este padrão.
A fonte se adapta à largura efetiva do card por consultas de contêiner,
incluindo o cenário de sidebar aberta em 1024 px. Ícones e valores em alerta
mantêm o significado de vencimento, saldo negativo ou pendência.

## Áreas abrangidas

- Financeiro: visão geral, faturamento, contas a pagar, contas a receber,
  despesas e indicadores de Em carteira. Painéis avulsos usam o Card compartilhado.
- Gestão de visitas: resumo de período, cards de relatórios, calendário,
  recência, diagnóstico da carteira e geração de demanda.
- Vendas: os indicadores passaram a usar o mesmo componente, evitando novas
  divergências entre módulos. O componente compartilhado também atende o painel
  master, sem mudar seus dados ou permissões.

O resumo financeiro de faturamento passou a reutilizar o gráfico de área
do painel de vendas. Os cálculos, filtros, datas, ações e dados foram mantidos.
O editor e o conteúdo dos documentos de visita não foram remodelados.

## Verificação

TypeScript e ESLint dos arquivos alterados passaram. Foram abertas oito telas
autenticadas no Chrome de teste: visão geral, faturamento, contas a pagar,
contas a receber, Em carteira, despesas, visitas e geração de demanda. Verificados
os temas claro/escuro, desktop e celular; visões principais também em 768 px.

O ajuste final de valores longos foi verificado em 390 e 1024 px sem quebra
de linhas dentro da quantia. Não houve rolagem horizontal na página nem erros
de JavaScript durante a revisão. Tabelas extensas continuam com rolagem própria.
Verificadas lista e calendário das visitas, abertura dos cards pela opção Mostrar,
diagnóstico e estado vazio de geração de demanda, sem gravar dados de teste.

Capturas em `artifacts/cards-modulos/`, incluindo `card-relatorio-mobile.png`.
