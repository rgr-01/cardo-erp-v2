# Referências e direção visual do Cardo ERP

Data: 3 de novembro de 2026. A estrutura de **operação compacta** foi aprovada
pelo usuário. Este documento apresenta a aplicação visual dessa estrutura;
a opção **A — claro integrado foi aprovada e implementada**. As prévias abaixo
ficam como histórico; o [relatório final](remodelagem-interface-2026-11-04.md)
contém as capturas reais e a validação.

## Prévias originais para avaliação

- [A — claro integrado](../artifacts/ui-humanizer-2026-11-03/proposta-claro.png).
- [B — navegação em azul-petróleo](../artifacts/ui-humanizer-2026-11-03/proposta-petrol.png).
- [Composição no celular](../artifacts/ui-humanizer-2026-11-03/proposta-mobile.png).
- [HTML da prévia](../artifacts/ui-humanizer-2026-11-03/preview-direcoes.html).

As prévias são estáticas, identificadas como estudo visual. Os valores representam
um estado vazio ilustrativo. Não são a interface implementada nem uma conexão
ao banco. O menu mostra módulos representativos; a aplicação continuará
respeitando todos os módulos e permissões existentes.

## Referências trazidas pelo usuário

### 1. Productivity Dashboard Design — Budiarti R. / Orely

Fonte: https://dribbble.com/shots/16579956-Productivity-Dashboard-Design

[Captura da imagem pública](../artifacts/ui-humanizer-2026-11-03/ref-orely-detail.png).

- Layout: área principal branca, navegação estreita e coluna de apoio distinta;
  listas de atividade têm mais peso que pequenas informações secundárias.
- Tipografia: sans, títulos com contraste de tamanho e dados agrupados em linhas.
  A família da referência não foi confirmada; o projeto mantém Space Grotesk.
- Cor: brancos, verdes e verde profundo; a página publica sua própria paleta.
  A paleta do Cardo continua sendo a da marca, não a cópia desses valores.
- Imagem: ilustração ampla de cidade e avatar desenhado na coluna secundária.
- Detalhe útil: divisão clara entre trabalho e contexto; essa divisão inspira
  a separação entre pendências, análises e atividade recente.
- Não transportar: ilustração decorativa, colunas muito estreitas só com ícones,
  várias faixas saturadas, botões pill e efeitos de apresentação inclinada.

A página do shot apresentou carregamento instável no navegador. A imagem foi
inspecionada pelo endereço público do CDN vinculado à própria página.

### 2. Dashboard financeiro compartilhado no Pinterest

Fonte enviada: https://pin.it/T8JlFzRgz

Destino observado: https://br.pinterest.com/pin/703828248013910947/

[Captura do pin](../artifacts/ui-humanizer-2026-11-03/ref-pinterest.png) e
[imagem vista no navegador](../artifacts/ui-humanizer-2026-11-03/ref-pinterest-detail.png).

- Layout: fundo claro, superfícies brancas, resumo financeiro no topo, tabela
  de transações como conteúdo principal e análise em coluna de apoio.
- Tipografia: sans compacta, valores maiores e descrições menores.
- Cor: verde nas ações e contraste com um fundo cinza muito claro.
- Imagem: interface bancária conceitual; não é uma fonte de dados do ERP.
- Detalhe útil: transações e valores reais seriam o conteúdo dominante, sem
  transformar cada descrição em uma caixa independente.
- Não transportar: publicidade dentro do painel, marcas de bancos, valores
  de exemplo, excessos de badges ou os gráficos meramente decorativos.

O pin foi compartilhado por Duncan Hopkins; isso não confirma a autoria original
da interface, que não é atribuída a ele neste estudo.

## Complementos de interação e densidade

### 3. Linear — My Issues

Fonte: https://linear.app/docs/my-issues

[Captura da interface documentada](../artifacts/ui-humanizer-2026-11-03/ref-linear-detail.png).

Layout de lista agrupada, filtros junto do conteúdo, navegação textual e divisores
discretos. Sans compacta, superfície escura e estados acompanhados de texto.
O principal aproveitamento é ordenar pendências por assunto e relevância, em vez
de dar um card grande a cada contador. Não copiar o preto da marca, siglas de
engenharia ou a imagem promocional com gradiente em volta do screenshot.

### 4. Atlassian — Dynamic table

Fonte: https://atlassian.design/components/dynamic-table/examples

[Página inspecionada](../artifacts/ui-humanizer-2026-11-03/ref-atlassian.png).

Referência funcional para ordenação, paginação e identificação das linhas. Sua
documentação distingue seleção, ação e estado. Não copiar o azul, a navegação
do site de documentação nem presumir que a cor de seleção precise ser a marca.
A captura registra a documentação, não uma tela final de produto nem uma tabela
do Cardo. Seu uso nesta proposta é de comportamento, não de composição global.

### 5. Carbon — Data table

Fonte: https://www.carbondesignsystem.com/building-blocks/core/components/data-table/code

[Página inspecionada](../artifacts/ui-humanizer-2026-11-03/ref-carbon.png).

Referência para organização tabular e previsibilidade de controles de dados.
Separação clara entre título, ferramentas e conteúdo, com contraste e estados
próprios. Não transportar o azul, a tipografia da documentação, o estilo quadrado
de toda a biblioteca ou instalar uma segunda biblioteca de componentes no ERP.

### 6. Asana — Filter and save views

Fonte: https://help.asana.com/s/article/filter-and-save-views

[Página inspecionada](../artifacts/ui-humanizer-2026-11-03/ref-asana.png).

Referência de comportamento para alternar lista, agenda e outras visualizações
da mesma informação. A página acessível não apresentou screenshot do produto;
portanto não foi usada para inferir fonte, paleta ou desenho de componentes.
O princípio aproveitado é manter os filtros próximos das visualizações existentes
de visitas, sem acrescentar novas funções ao escopo da remodelagem.

## Duas aplicações visuais da operação compacta

### A — claro integrado · recomendada

Referências principais: Pinterest para o contraste entre fundo e conteúdo;
Orely para a hierarquia das áreas; Carbon para a disciplina das tabelas.

1. Sidebar e painéis claros, fundo `#f1f5f6`, texto azul-petróleo e verde de
   ação `#006d2e`. A navegação ativa usa fundo verde suave e texto, sem glow.
2. Space Grotesk existente, corpo de 14–15 px e títulos de página de 24–28 px.
   Valores tabulares; rótulos em caixa de frase.
3. Pendências em linhas; análises com alturas proporcionais ao conteúdo;
   atividade recente separada por espaço e divisores, sem caixas altas vazias.

É a mais próxima do Pinterest enviado e deixa as cores de estado e os valores
mais visíveis. Não depende de novas fotografias ou ilustrações.

### B — navegação em azul-petróleo

Referências principais: Orely para distinguir trabalho e contexto; Linear para
a lista de trabalho e navegação; Atlassian para os controles de dados.

1. Mesmo conteúdo da opção A, com sidebar `#19323b` e texto claro. A área de
   trabalho permanece clara; a navegação fica mais separada visualmente.
2. Mesma tipografia e escala, sem adicionar decoração para distinguir a opção.
3. Mesmas listas, densidade e ordem de tarefas. No tablet estreito e no celular,
   a sidebar dá lugar ao menu recolhível nas duas opções.

Essa opção aproxima mais a navegação da identidade escura atual do ERP.
Também não requer mídia nova.

## O que fica igual nas duas

As variantes comparam a navegação no **tema claro**. O tema escuro existente
continua disponível; não será removido nem trocado por esta apresentação.
No escuro, a implementação terá superfícies próprias e os tokens de contraste
já ajustados. Os arquivos de prévia ainda não são validação dessa implementação.

Permanecem todos os fluxos e permissões, exportação, calendário, mapa, editor,
campos e diálogos acessíveis. Sem alteração de conteúdo salvo dos relatórios.
Não serão incluídos dados, gráficos, fotografias ou números das referências.

## Decisão registrada

O usuário escolheu A — claro integrado. A implementação, os tokens no
`DESIGN.md`, o detector e as verificações de regressão foram concluídos em
4 de novembro de 2026.
