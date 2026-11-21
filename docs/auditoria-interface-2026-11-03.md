# Auditoria técnica da interface web

Data: 3 de novembro de 2026. Método: `impeccable audit`.

## Atualização após ui-humanizer — 4 de novembro de 2026

Implementada a direção **operação compacta, A — claro integrado**, aprovada
pelo usuário. Login direto, navegação clara, pendências em linhas, painéis sem
glow/gradiente, tabelas e estados vazios mais compactos. O tema escuro permanece.

A07 foi corrigido nos tamanhos verificados: o calendário reorganiza as ações
em telas pequenas e o menu não comprime o conteúdo do tablet. A09 foi corrigido:
o login carrega duas fontes, 45.428 bytes, em vez das nove antecipadas anteriormente.
O tratamento universal de duração 0,01 ms de A10 foi removido; movimento reduzido
foi conferido no novo menu e kit operacional. A08 recebeu controles compartilhados
maiores e botões móveis do calendário de 44 px, sem nova medição exaustiva de
todos os alvos personalizados da aplicação.

Passaram 64 cenários de interface, oito cenários preenchidos isolados, 15
verificações de integração e 45 de componentes; PDF real validado. A nota
histórica abaixo não foi recalculada. Consulte o [relatório da remodelagem](remodelagem-interface-2026-11-04.md)
para capturas, detector antes/depois, evidências e limites da verificação.

## Atualização após colorize

Os achados **A01 e A02 foram corrigidos nos cenários verificados**. A marca
mantém o azul-petróleo e o verde; o tema claro usa um verde mais profundo
(`#006d2e`) para ações e seleções. Textos de apoio passaram a usar cores
semânticas por superfície, sem depender da escala de fundos.

Também foram ajustados calendário, avisos do dashboard, contadores dos filtros
financeiros, seleção, cursor de texto, barras de rolagem e foco de teclado.
Selos com cores próprias preservam o indicador colorido e usam texto legível
nos dois temas. As cores da prévia de exportação acompanham o tema claro.

Verificação dirigida com axe-core 4.12.1 no Edge local:

- Login e 24 páginas, cada página nos temas claro e escuro: 49 cenários.
- Oito cenários móveis: login, erro de credenciais, dashboard, calendário e
  modal de usuário com foco, a 390 × 844.
- Seis cenários com os componentes reais: selos, botões e campos em repouso,
  hover e foco, nos dois temas. Incluem 13 cores próprias nos selos.
- Capturas do dashboard com simulação de deuteranopia, protanopia, tritanopia
  e acromatopsia nos dois temas; textos continuam explicando os estados.

Os resultados automatizados desta etapa medem contraste de texto. Casos
marcados como inconclusivos pelo axe, gráficos sem dados na base local e
cores escolhidas livremente no conteúdo dos relatórios não constituem
aprovação automática. Não houve nova auditoria integral nem recálculo da nota.

Evidências:

- [Contraste nas páginas](../artifacts/colorize-ui-2026-11-03/results.json).
- [Estados móveis](../artifacts/colorize-ui-2026-11-03/state-results.json).
- [Componentes reais](../artifacts/colorize-ui-2026-11-03/component-results.json).
- [Dashboard claro](../artifacts/colorize-ui-2026-11-03/light_dashboard.png) e
  [escuro](../artifacts/colorize-ui-2026-11-03/dark_dashboard.png).
- [Cadastro móvel com foco](../artifacts/colorize-ui-2026-11-03/mobile-light-usuarios.png).

TypeScript e ESLint nos componentes com alterações estruturais passaram.
Permanecem A07 e A08 (calendário e alvos de toque), A09 (fontes) e A10
(movimento reduzido), conforme a linha de base abaixo.

## Atualização após harden

Foram corrigidos **seis achados desta linha de base**. As seções seguintes
preservam o diagnóstico original; a nota de 10/20 não foi recalculada nesta
verificação dirigida.

| Achado | Correção e verificação |
| --- | --- |
| A03 — modais | Base nativa de diálogo compartilhada, foco isolado, Escape, retorno ao acionador e janelas sobrepostas. Confirmações simultâneas entram em fila e começam na ação segura. |
| A04 — conteúdo oculto | Menu fechado e cópia de exportação inertes. Tab não percorre links fora da tela; o menu devolve o foco ao fechar. |
| A05 — seleção e autocomplete | Nomes nas seleções de vendas, estados e relações ARIA no autocomplete, teclado, busca vazia e posicionamento com nomes longos. |
| A06 — pouca altura | Diálogos limitados ao viewport, com conteúdo rolável. Cadastro real verificado a 390 × 480. |
| A11 — gestos interrompidos | Limpeza por cancelamento, perda de captura, perda de foco e desmontagem. Um ponteiro controla o gesto; anotações canceladas não criam formas. A logo também aceita ajuste por teclado. |
| A12 — ícones do calendário | Ícones decorativos ocultos da árvore de acessibilidade, preservando os nomes dos botões. |

Também foram adaptados os popups de data e cor para permanecerem no diálogo
ativo. O primeiro bloco do editor passou a usar um identificador estável entre
servidor e navegador, eliminando a divergência de hidratação reproduzida no teste.

Validação: TypeScript e ESLint nos componentes alterados; 45 verificações na
página isolada de componentes e 35 registros de integração, incluindo as 23
páginas da empresa. Os testes dirigidos de `aria-hidden-focus`, `label` e
`role-img-alt` passaram nas páginas onde os achados foram reproduzidos.
Esses resultados não representam aprovação integral de acessibilidade.

Evidências desta etapa:

- [Verificações dos componentes](../artifacts/harden-ui-2026-11-03/checks.json).
- [Integração nas páginas reais](../artifacts/harden-ui-2026-11-03/app-checks.json).
- [Interrupção de gestos e hidratação](../artifacts/harden-ui-2026-11-03/gesture-checks.json).
- [Exportação PDF validada](../artifacts/harden-ui-2026-11-03/pdf-check.json): HTTP 200, `application/pdf`, assinatura `%PDF` e 205.522 bytes recebidos no navegador.
- [Cadastro em altura reduzida](../artifacts/harden-ui-2026-11-03/usuario-short.png).
- [Regressão repetível dos componentes](../artifacts/harden-ui-2026-11-03/verify.cjs).

Os gestos foram sintetizados no Chrome; não houve ensaio em aparelho físico.
Ao final do harden, permaneciam A01 e A02 (contraste), A07 e A08 (calendário e
alvos de toque), A09 (fontes) e A10 (movimento reduzido). O contraste recebeu
as correções descritas na atualização de colorize acima.

## Veredito de integridade da implementação

**Não aprovada para publicação sem corrigir os problemas P1.** O sistema tem
identidade consistente, componentes reutilizáveis e fluxos próprios de um ERP.
As falhas concentram-se em componentes compartilhados: modais, navegação
oculta, campos e tokens de cor. Isso amplia seu impacto entre módulos.

O detector do Impeccable não executou: o motor 0.1.18 não está instalado e
o launcher não conseguiu criar seu cache. Não atribuo achados a esse detector.
As conclusões abaixo vêm de axe-core 4.12.1, inspeção do código, capturas de
tela, navegação por teclado e eventos de toque sintetizados no Chrome local.

## Resumo e pontuação

| Dimensão | Nota / 4 | Principal evidência |
| --- | ---: | --- |
| Acessibilidade | 1 | Contraste insuficiente e foco fora de modais ou em conteúdo oculto. |
| Desempenho | 3* | Carregamento dinâmico em módulos pesados; fontes do editor antecipadas no login. |
| Temas | 2 | Tokens presentes, mas contraste insuficiente no tema claro. |
| Responsividade | 2 | Páginas funcionam em celular; modal corta conteúdo em altura reduzida e calendário extrapola o cartão. |
| Integridade da implementação | 2 | Padrões semânticos incompletos repetidos nos componentes compartilhados. |
| **Total** | **10/20*** | **Aceitável na escala do skill, com trabalho significativo pendente.** |

*Pontuação heurística, não certificação de conformidade. Desempenho avaliado
por implementação e recursos carregados em desenvolvimento; sem benchmark de
produção, Lighthouse ou medições de campo de Core Web Vitals.

**12 problemas consolidados: 0 P0, 6 P1, 6 P2 e 0 P3.** As ocorrências
repetidas entre páginas e temas foram agrupadas por causa. Não são 12 telas
com problemas independentes.

Prioridade: corrigir foco e semântica compartilhados, ajustar contraste nos
dois temas e garantir uso de modais em telas de pouca altura. Em seguida,
tratar controles de toque, fontes e movimento.

## Escopo e método

- Login e 23 páginas autenticadas da empresa: vendas, clientes, produtos,
  orçamentos, pedidos, carteira, aprovações, financeiro, despesas, visitas,
  trabalhos, WhatsApp, usuários, metas, histórico e configurações.
- 41 cenários automatizados, incluindo cinco páginas com o tema claro aplicado
  por `data-theme`, sete páginas a 390 × 844, visitas a 320 × 740, modal a
  390 × 480 e configurações a 720 × 450 com DPR 2 como aproximação de reflow
  de uma tela de 1440 px ampliada a 200%.
- Formulário de usuário, plano de contas e editor de relatório.
- Testes de Tab, Escape, toque para abrir o menu e sequência
  `touchStart → touchMove → touchCancel` para redimensionar uma logo.
- Leitura dos componentes comuns e das telas de gestão de empresas. A área
  master não foi aberta com privilégios de superadministrador.
- Nenhum cadastro, pagamento, emissão fiscal ou relatório foi salvo no banco.
  Os testes do editor usaram somente o rascunho do perfil temporário do navegador.

O axe registrou 337 ocorrências nos 41 cenários: 320 de contraste, três de
`aria-hidden-focus`, três de `label`, oito de `role-img-alt` e três de
`scrollable-region-focusable`. Esses totais repetem elementos em cenários
diferentes e incluem candidatos que exigiram análise manual.

## P1 — corrigir antes de publicar

### A01. Texto secundário com contraste insuficiente

- **Categoria:** acessibilidade.
- **Localização:** `src/app/globals.css:46`, `src/app/login/page.tsx:169`,
  `src/app/(app)/dashboard/page.tsx:58` e textos com `text-zinc-500` em tabelas.
- **Evidência:** `#67818a` sobre `#10232a` mede **3,92:1**; a instrução do
  login com a mesma cor sobre branco mede **4,13:1**. São textos de 12–14 px.
- **Impacto:** instruções, cabeçalhos e estados vazios ficam difíceis de ler,
  especialmente com baixa visão ou iluminação desfavorável.
- **Referência:** [WCAG 1.4.3 — contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
  com 4,5:1 para texto comum e 3:1 para texto grande.
- **Recomendação:** separar tokens de texto secundário por superfície clara
  e escura, medir novamente e preservar contraste nos estados de interação.
- **Comando sugerido:** `$impeccable colorize`.

### A02. A cor de ação do tema claro não sustenta o contraste necessário

- **Categoria:** temas / acessibilidade.
- **Localização:** `src/app/globals.css:360`,
  `src/components/ui/button.tsx:9`, `src/components/dashboard/resumo.tsx`.
- **Evidência:** texto branco sobre `#00a63e` em “Nova venda” mede **3,21:1**;
  texto verde sobre `#f1f5f6` mede **2,93:1**. Medições repetidas após 600 ms
  de estabilização do tema.
- **Impacto:** botões primários e links de ação perdem legibilidade no tema claro.
- **Referência:** WCAG 1.4.3, conforme a fonte do item A01.
- **Recomendação:** definir cores distintas para fundo de botão e texto de
  ação, com seus respectivos pares de contraste. Conferir também as superfícies
  `.bg-white`, que restauram parte da escala escura por CSS.
- **Comando sugerido:** `$impeccable colorize`.

### A03. Modais não controlam foco nem anunciam corretamente o diálogo

- **Categoria:** acessibilidade / integridade da implementação.
- **Localização:** `src/components/ui/modal.tsx:24` e
  `src/components/ui/confirm-dialog.tsx:89`.
- **Evidência:** ao abrir “Novo usuário”, não há elemento com `role="dialog"`,
  `role="alertdialog"` ou `<dialog>`. O foco permanece no botão de abertura;
  Tab percorre controles de usuários ao fundo e depois o assistente.
  Escape não fecha o modal. O componente de confirmação tem a mesma lacuna
  estrutural; Escape só é tratado no seu campo de prompt.
- **Impacto:** teclado e leitores de tela podem operar a página ao fundo
  sem perceber o contexto do diálogo, inclusive em confirmações importantes.
- **Referência:** [padrão de diálogo modal do W3C](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- **Recomendação:** centralizar semântica, nome acessível, foco inicial,
  contenção e restauração do foco, fechamento por Escape e fundo inerte
  em um componente comum.
- **Comando sugerido:** `$impeccable harden`.

### A04. Conteúdo visualmente oculto permanece na sequência de teclado

- **Categoria:** acessibilidade.
- **Localização:** `src/components/app-shell.tsx:121` e
  `src/app/(app)/dashboard/page.tsx:77`.
- **Evidência:** com o menu fechado a 390 px, o terceiro Tab chega ao logo
  lateral em `x = -236`; os Tabs seguintes percorrem safra, perfil e links
  fora da tela. A cópia do painel para PDF tem `aria-hidden` e posição em
  `left: -10000px`, mas contém links focáveis, confirmados pelo axe.
- **Impacto:** o foco desaparece visualmente e percorre conteúdo que não está
  disponível à percepção do usuário.
- **Referência:** WCAG 2.4.3 e 2.4.7; `aria-hidden` não remove elementos do teclado.
- **Recomendação:** aplicar `inert` ao menu fechado e à cópia de exportação,
  ou montar apenas o conteúdo necessário. Preservar a renderização do PDF.
- **Comando sugerido:** `$impeccable harden`.

### A05. Seleção de vendas e autocompletes têm semântica incompleta

- **Categoria:** acessibilidade.
- **Localização:** `src/components/vendas/vendas-table.tsx:860` e
  `src/components/ui/combo-box.tsx:113`.
- **Evidência:** o checkbox do cabeçalho de vendas não tem nome acessível.
  O autocomplete implementa setas e Escape, mas não expõe papel de combobox,
  expansão, relação com a lista ou opção ativa.
- **Impacto:** não fica claro o que a seleção fará, nem qual opção está ativa
  para quem usa leitor de tela.
- **Referência:** WCAG 1.3.1 e 4.1.2;
  [padrão de combobox do W3C](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
- **Recomendação:** nomear a seleção em massa e completar os estados e as
  relações ARIA do componente comum, preservando seu teclado existente.
- **Comando sugerido:** `$impeccable harden`.

### A06. Modal de usuário corta conteúdo quando a altura disponível diminui

- **Categoria:** responsividade.
- **Localização:** `src/components/ui/modal.tsx:29`.
- **Evidência:** a 390 × 480, o cartão ocupa de **y = -20 até y = 500**.
  O modal não tem limite de altura nem rolagem interna. A captura mostra
  cabeçalho e ações parcialmente cortados.
- **Impacto:** telas em paisagem ou com pouca altura disponível dificultam
  o preenchimento e o acesso às ações do formulário.
- **Referência:** WCAG 1.4.10 como critério de reflow; o ensaio foi de viewport
  reduzido, sem teclado virtual físico.
- **Recomendação:** limitar a altura ao viewport dinâmico, permitir rolagem
  do conteúdo e manter fechamento e ações alcançáveis.
- **Comando sugerido:** `$impeccable adapt`.

## P2 — próxima rodada

### A07. Barra do calendário ultrapassa seu cartão a 320 px

- **Categoria:** responsividade.
- **Localização:** `src/components/visitas/calendario-visitas.tsx:325` e
  `src/app/globals.css:232`.
- **Evidência:** a borda direita do cartão está em **304 px**, enquanto
  o botão “Dia” alcança **319,22 px**. O título quebra em duas linhas.
  Não foi detectada interseção entre título e botões.
- **Impacto:** controles ficam visualmente fora do agrupamento que os contém.
- **Padrão:** adaptação a largura estreita; sem afirmar falha de reflow global.
- **Recomendação:** reorganizar título, navegação e seleção de visualização
  em linhas próprias no breakpoint estreito.
- **Comando sugerido:** `$impeccable adapt`.

### A08. Ações compactas oferecem alvos de toque pequenos

- **Categoria:** responsividade / acessibilidade.
- **Localização:** `src/components/safra-seletor.tsx:114`,
  `src/components/dashboard/botao-exportar-card.tsx:36` e
  `src/components/visitas/novo-relatorio-editor.tsx:1305`.
- **Evidência:** safra com 20 px de altura, exportação de cartões em
  21 × 21 px e puxador de logo em 20 × 20 px.
- **Impacto:** maior chance de toque incorreto e dificuldade motora.
- **Padrão:** 44 × 44 px é a meta ergonômica usada nesta revisão.
  [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
  usa 24 × 24 px com exceções, inclusive espaçamento. Não classifico todos
  os controles menores que 44 px como violações AA.
- **Recomendação:** ampliar a área clicável sem necessariamente ampliar o
  ícone e verificar espaçamento real dos controles adjacentes.
- **Comando sugerido:** `$impeccable adapt`.

### A09. Fontes de edição são carregadas já no login

- **Categoria:** desempenho.
- **Localização:** `src/app/layout.tsx:18` e `src/app/layout.tsx:39`.
- **Evidência:** nove arquivos WOFF2, somando **444.656 bytes de corpo
  decodificado**, foram carregados no login. O layout raiz declara sete
  famílias, incluindo as usadas na edição de relatórios.
- **Impacto:** custo inicial de rede e processamento para fontes sem uso
  imediato nessa tela, especialmente em conexão móvel.
- **Padrão:** eficiência de carregamento; sem violação WCAG atribuída.
- **Recomendação:** manter a fonte principal no layout raiz e carregar as
  famílias opcionais no editor, com preload seletivo. Comparar o resultado
  em build de produção antes de definir metas de tempo.
- **Comando sugerido:** `$impeccable optimize`.

### A10. Movimento reduzido usa um desligamento global de 0,01 ms

- **Categoria:** acessibilidade / integridade da implementação.
- **Localização:** `src/app/globals.css:156`.
- **Evidência:** a regra de `prefers-reduced-motion` força todas as animações
  e transições a 0,01 ms, com uma única repetição.
- **Impacto:** não há alternativa por componente que preserve intencionalmente
  feedback e mudanças de estado. O risco é sistêmico; não foi demonstrado
  bloqueio de tarefa causado por essa regra.
- **Padrão:** requisito de movimento reduzido do playbook de auditoria;
  não é, isoladamente, declaração de falha WCAG.
- **Recomendação:** remover movimento espacial desnecessário e manter sinais
  estáticos ou mudanças breves de estado para carregamento, expansão e seleção.
- **Comando sugerido:** `$impeccable animate`.

### A11. Cancelamento de toque deixa o indicador de arraste ativo

- **Categoria:** responsividade / interação.
- **Localização:** `src/components/visitas/novo-relatorio-editor.tsx:1309`.
- **Evidência:** no Chrome, eventos sintetizados `touchStart`, `touchMove` e
  `touchCancel` alteraram a logo para 115%. Após o cancelamento, o indicador
  “115%” e a classe de arraste ativo permaneceram. Há tratamento de
  `onPointerUp`, mas não de cancelamento ou perda de captura nesse controle.
- **Impacto:** a interface mantém feedback de gesto em andamento depois de
  uma interrupção, confundindo o estado do editor.
- **Padrão:** limpeza do ciclo de interação por ponteiro; sem teste em aparelho físico.
- **Recomendação:** limpar a referência e o estado em `pointercancel`,
  `lostpointercapture` e na desmontagem, e oferecer ajuste por teclado.
- **Comando sugerido:** `$impeccable harden`.

### A12. Ícones decorativos do calendário são anunciados como imagens sem nome

- **Categoria:** acessibilidade.
- **Localização:** `src/components/visitas/calendario-visitas.tsx:320`,
  integração com FullCalendar.
- **Evidência:** os spans `.fc-icon-chevron-left` e `.fc-icon-chevron-right`
  têm `role="img"` sem nome; axe registra `role-img-alt`. Os botões que os
  contêm já têm identificação, portanto não é ausência total de nome da ação.
- **Impacto:** representação redundante ou incompleta para tecnologias assistivas.
- **Referência:** WCAG 1.1.1 para tratamento de conteúdo decorativo.
- **Recomendação:** manter o nome nos botões e ocultar os ícones decorativos
  da árvore de acessibilidade, pela configuração compatível com a biblioteca.
- **Comando sugerido:** `$impeccable harden`.

## Verificações descartadas ou ainda inconclusivas

- **Transições de tema:** a primeira leitura imediata capturou cores
  intermediárias. Esses resultados foram substituídos pelas medições após
  600 ms. Não se usa o contraste transitório de 2,29:1 como achado.
- **Miniaturas do editor:** cópias reduzidas continham controles de poucos
  pixels, mas estão sob `inert` e `aria-hidden`. Foram excluídas da avaliação
  de alvos interativos; não são falhas de toque.
- **Regiões roláveis em Despesas:** axe apontou três regiões. O Chrome
  permitiu foco programático nas três, então não foi concluído bloqueio de
  teclado. Falta validar Tab e rolagem em Firefox, Safari e teclado físico.
- **Calendário:** não foi confirmada sobreposição geométrica do título com
  os botões. O achado confirmado é a extrapolação do cartão a 320 px.

## Padrões recorrentes e pontos a preservar

As correções de foco devem começar nos componentes comuns, pois hoje cada
overlay resolve apenas aparência e clique. Contraste também deve ser tratado
na origem dos tokens, com atenção às superfícies que redefinem a escala.

Funcionam bem: idioma `pt-BR`, rótulos explícitos no login e no cadastro de
usuário, regras de senha apresentadas antes do envio, erros com `role="alert"`,
estados vazios que indicam próximos passos, ocultação inerte das miniaturas,
carregamento dinâmico de mapa/calendário/importação e ausência de rolagem
horizontal global nos viewports registrados. Tabelas roláveis intencionais
não foram tratadas como falha apenas por possuírem largura mínima.

## Ordem recomendada

1. **P1 — `$impeccable harden`:** A03, A04 e A05; depois A11 e A12.
2. **P1 — `$impeccable colorize`:** A01 e A02, medindo os dois temas.
3. **P1/P2 — `$impeccable adapt`:** A06, A07 e A08.
4. **P2 — `$impeccable optimize`:** A09, seguido de medição em produção.
5. **P2 — `$impeccable animate`:** A10.
6. **Verificação — `$impeccable audit`:** repetir os mesmos cenários e os testes manuais.
7. **Acabamento — `$impeccable polish`:** após as correções e a nova auditoria.

## Evidências e reprodução

- [Resultados brutos do axe e layout](../artifacts/audit-ui-2026-11-03/results.json).
- [Sequência de teclado com menu fechado](../artifacts/audit-ui-2026-11-03/mobile-keyboard.json).
- [Foco, Escape e limites do modal](../artifacts/audit-ui-2026-11-03/modal-keyboard.json).
- [Gesto de toque cancelado](../artifacts/audit-ui-2026-11-03/touch-cancel.json).
- [Fontes carregadas](../artifacts/audit-ui-2026-11-03/fonts.json).
- [Tema claro](../artifacts/audit-ui-2026-11-03/light_dashboard.png).
- [Modal em viewport curto](../artifacts/audit-ui-2026-11-03/modal-short-viewport.png).
- [Calendário a 320 px](../artifacts/audit-ui-2026-11-03/mobile320_relatorios_visitas.png).
- [Coletor local](../artifacts/audit-ui-2026-11-03/audit.cjs): executar na pasta
  do projeto com o servidor local e o banco disponíveis. Usa as dependências
  existentes e a conta local de teste já configurada.

Limites: modo de desenvolvimento, conta administradora com base local quase
vazia, Chrome headless e toque emulado. Sem leitor de tela real, aparelho
físico, produção, transações financeiras, emissão fiscal, revisão visual
autenticada do master ou aplicativo React Native. A emulação de reflow não
substitui o teste de zoom nativo e teclado virtual em dispositivos reais.
