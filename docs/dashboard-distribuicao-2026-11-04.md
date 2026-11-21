# Distribuição do dashboard — 4 de novembro de 2026

Revisão da área principal do painel de vendas, com intenção de operar,
variação e movimento baixos e densidade média. Mantidos os temas, os dados,
as permissões, os destinos das ações e a identidade visual existente.

## Diagnóstico e solução

A lista de pendências ocupava toda a largura antes dos gráficos. No desktop
de 1440 × 900, o título do funil começava a 699 px do topo. O funil ficava
ao lado de dois cards empilhados, enquanto os maiores clientes dividiam
espaço com duas listas de atividade, de natureza diferente.

A nova ordem é: indicadores; funil e pendências; análises de cultura,
consultores/evolução e clientes; visitas e negócios recentes. O funil passou
a usar linhas compactas com divisores. As pendências mantêm ações visíveis,
sem exigir uma terceira coluna dentro de um painel estreito. As listas finais
têm mais largura e os links de acesso ficam alinhados ao final do grupo.

As grades usam consultas de contêiner: duas colunas a partir de 672 px;
quatro indicadores e três análises a partir de 896 px. A composição clara de
1280 px usada pelo PDF mantém sua distribuição mesmo em telas estreitas.
Os cards não têm alturas fixas, permitindo crescimento por conteúdo.

## Verificação

Capturas autenticadas com a base fictícia local, usando Chrome headless em
perfil de teste isolado. Nenhuma preferência do navegador do usuário foi alterada.

| Viewport | Altura anterior do dashboard | Altura final | Rolagem horizontal |
| --- | ---: | ---: | --- |
| 1440 × 900 | 1628 px | 1480 px | Não |
| 768 × 1024 | 2947 px | 1917 px | Não |
| 390 × 844 | 3125 px | 2979 px | Não |

No desktop, funil e pendências começam juntos a 310 px do topo. No tablet,
as análises usam duas colunas e maiores clientes ocupa a largura disponível.
No celular, a sequência é linear, sem alterar a ordem de leitura ou foco.

Tema escuro e composição clara do relatório foram inspecionados. O filtro
de consultor confirmou a substituição do ranking pela evolução do faturamento.
TypeScript e ESLint nos quatro arquivos alterados passaram. A geração do
arquivo PDF completo não foi executada; foi revisada sua composição de origem.

O carregador e detector Impeccable não estavam instalados e o Python local
não estava disponível para o detector UI Humanizer. A revisão de hierarquia,
densidade, extremos de largura e alinhamento foi feita nas capturas e no código.
As cores por status, barras quantitativas e a rosca continuam por codificarem
dados do sistema, sem decoração adicional.

Capturas em `artifacts/dashboard-layout/`: `antes-1440.png`, `antes-768.png`,
`antes-390.png`, `final-1440.png`, `final-768.png`, `final-390.png`,
`final-escuro.png`, `final-filtrado.png` e `final-exportacao.png`.
