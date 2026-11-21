# Remodelagem do Cardo ERP — rascunho para avaliação

Data: 3 de novembro de 2026. Método: ui-humanizer.
Estado: rascunho de **operação compacta aprovado pelo usuário**. As referências
e suas aplicações visuais estão em [documento próprio](referencias-remodelagem-ui.md).
A opção A — claro integrado foi aprovada e implementada. Este documento preserva
o rascunho original; consulte o [resultado final](remodelagem-interface-2026-11-04.md).

## Brief

O Cardo ERP atende administradores e consultores que acompanham a safra,
clientes, vendas, pedidos, recebimentos e visitas. É uma ferramenta de trabalho
recorrente, com uso no computador e no celular. A prioridade proposta é localizar
o que exige ação e conseguir executar essa ação sem atravessar blocos decorativos.

Em três segundos, o painel deve responder: **como estão as vendas da safra e o
que precisa da minha atenção?** Nas outras páginas, a primeira leitura deve ser
o nome da tarefa, o período ou filtro ativo e a ação principal disponível.

Material real: marca e logotipos existentes, filtros por safra, tabelas, estados
dos documentos, agenda, mapa de clientes, fotos dos relatórios quando existirem
e dados efetivamente retornados pelo banco. A base local tem vários estados
vazios; o desenho precisa funcionar assim, sem inventar números ou fotografias.

Restrições: manter permissões e fluxos, a paleta da marca, os temas claro e
escuro, os contratos de exportação, os controles acessíveis e as correções de
foco e contraste já verificadas. Stack: Next.js, React e Tailwind existentes.

**Frase de leitura:** sistema de gestão comercial do agronegócio para
administradores e consultores, uma interface de operar com linguagem de
registro de safra e acompanhamento comercial, em Next.js/React/Tailwind.
Variação baixa, movimento baixo e densidade alta nas tabelas, média no painel.

## O que a revisão encontrou

| Severidade | Evidência | Mudança proposta |
| --- | --- | --- |
| Alto | Em 768 px, a barra lateral permanente deixa o título do dashboard em três linhas e comprime os controles; parte das ações fica cortada. Ver captura de tablet. | Navegação recolhível também no tablet e cabeçalho com ações em linha própria quando necessário. Não depender apenas da ausência de rolagem horizontal no documento. |
| Alto | `src/components/dashboard/resumo.tsx:212` e `:233`: painéis de gráfico e listas vazias ocupam áreas grandes com o mesmo peso. | Altura pelo conteúdo, resumo compacto para ausência de dados e destaque para pendências reais. Preservar acesso a cada análise. |
| Alto | `src/app/login/page.tsx:120`: rótulo promocional acima do título, brilho, grade decorativa e blocos translúcidos com ícones. | Identificação da empresa e formulário como conteúdo principal. Descrição factual curta, sem vitrine de recursos no acesso diário. |
| Médio | `src/components/ui/card.tsx:25` e `src/components/ui/kpi.tsx:13`: borda, gradiente, sombra e ring delimitam o mesmo bloco. | Superfície lisa; borda discreta para agrupamentos e sombra reservada a elementos sobrepostos. |
| Médio | `src/components/dashboard/resumo.tsx:159`: quatro alertas do mesmo tamanho, inclusive quando todos estão zerados. | Lista de pendências com quantidade e ação; estado tranquilo quando não há itens. Manter os números e a informação de falta de faturamento. |
| Médio | `src/components/assistente-chat.tsx:139`: acionador flutuante de alto contraste compete com o conteúdo e cobre área útil em telas estreitas. | Preservar o assistente, com acionador identificado e posição que não sobreponha conteúdo ou controles. |
| Médio | `src/components/nav-links.tsx:88`: `transition-all` em navegação de uso repetido. | Transições curtas apenas nas propriedades necessárias; reduzir movimento conforme a preferência do sistema. |

Capturas atuais:

- [Dashboard desktop](../artifacts/ui-humanizer-2026-11-03/desktop-dashboard-before.png).
- [Dashboard tablet](../artifacts/ui-humanizer-2026-11-03/tablet-dashboard-before.png).
- [Dashboard celular](../artifacts/ui-humanizer-2026-11-03/mobile-dashboard-before.png).
- [Login celular](../artifacts/ui-humanizer-2026-11-03/mobile-login-before.png).
- [Vendas desktop](../artifacts/ui-humanizer-2026-11-03/desktop-vendas-before.png).
- [Detector antes](../artifacts/ui-humanizer-2026-11-03/detector-antes.txt).

O detector sinalizou, entre outras ocorrências, 94 combinações de caixa alta
e tracking, 129 raios grandes/pills e 24 gradientes/glows. São candidatos à
revisão, não 247 defeitos: cabeçalhos de tabela, barras de progresso, avatares,
skeletons de carregamento e cores escolhidas no editor têm motivos legítimos.
Emojis em mensagens de WhatsApp e strings internas não equivalem a ícones na UI.

## Rascunho recomendado: operação compacta

### Dashboard no computador

```text
Navegação       Painel de vendas             Consultor | Exportar | Apresentação
Empresa/safra   Safra selecionada e filtros ativos
                -------------------------------------------------------------
Módulos         Pipeline    Meta da safra    Faturado    Carteira / fornecedores
                -------------------------------------------------------------
                Pendências da safra
                Tipo de pendência                 Quantidade      Ação
                Conferência / margem / visitas     dados reais      destino atual
                Sem pendências: mensagem curta, sem cartões de zeros repetidos

                Funil de vendas                  Culturas / consultores
                maior área se houver dados       análise secundária
                estado vazio de altura curta     altura pelo conteúdo

                Clientes                         Atividade recente
                lista ordenada                   visitas e negócios fechados
```

O que é específico deste produto: seleção de safra, conferência e margem de
pedidos, carteira comercial e acompanhamento das visitas aos clientes. Esses
conteúdos organizam o painel; não serão substituídos por um resumo genérico.

### Dashboard no celular e no tablet estreito

```text
Empresa / safra                                      Menu
Painel de vendas
Consultor / filtros        Exportar / Apresentação
Resumo da safra em duas colunas, sem colunas espremidas
Pendências em linhas com ação visível
Funil e análises em sequência
Atividade recente e clientes
```

### Listagens e financeiro

```text
Caminho / título da tarefa                       Ação principal existente
Período / safra / filtros / busca
Resumo relevante, sem uma caixa por informação
Tabela com cabeçalho claro e números alinhados
Seleção / ações de linha / paginação
```

Tabelas mantêm sua semântica. Em telas pequenas, a rolagem fica na área da tabela;
o título, os filtros e a ação principal continuam alcançáveis. Os formulários
mantêm nomes, regras de validação, mensagens e contratos atuais.

### Visitas, mapa e editores

O calendário e o mapa continuam sendo os elementos principais de suas telas.
Filtros e alternância de visualização ficam próximos deles. No editor, a folha
continua separada das ferramentas; controles essenciais e ação de salvar ficam
visíveis. Conteúdo e cores escolhidos pelo usuário não serão reformatados pela
remodelagem da interface.

### Login

```text
Marca / empresa
Acesse sua conta
E-mail
Senha                                    Mostrar senha
Entrar
Orientação para pedir acesso ou recuperar a senha
```

No desktop, a identificação da empresa pode ocupar uma coluna secundária; no
celular, o formulário entra logo após a marca, sem uma apresentação longa.

## Alternativa para avaliação: gestão analítica

Conserva o resumo da safra e coloca o funil e a evolução no centro do primeiro
viewport. As pendências ficam numa coluna lateral no desktop e vêm antes dos
gráficos no celular. É apropriada se a prioridade diária for analisar resultados
da equipe. Usa os mesmos tokens e fluxos da direção recomendada.

## Sistema visual proposto, ainda não aprovado

- Manter a fonte Space Grotesk já usada no app; números tabulares nas tabelas e
  valores monetários. Não adicionar uma fonte apenas para mudar a aparência.
- Corpo da UI em 14–15 px; títulos de página em 24–28 px, rótulos auxiliares em
  12–13 px. Tipografia do conteúdo dos relatórios permanece configurável.
- Manter azul-petróleo, verde e os tokens de texto semânticos verificados.
  Verde marca ação/seleção; as cores de status permanecem acompanhadas de texto.
- Espaços em passos de 4 px, com controles próximos dos dados que filtram.
- Raios por função: controles 6–8 px, painéis 10–12 px, diálogos 12 px;
  formas circulares continuam nos avatares e indicadores que precisam delas.
- Sem gradientes ou glow em painéis operacionais. Borda para separar grupos;
  sombra apenas em menus, popups e diálogos.
- Movimento de estado até 150 ms, sem entradas decorativas ou deslocamento
  de cards. Preservar alternativas para movimento reduzido.

## Sequência após a escolha

1. Confirmar este rascunho e receber referências opcionais do usuário.
2. Apresentar direções com referências e consolidar o sistema visual escolhido.
3. Remodelar navegação, cabeçalhos, controles compartilhados, login e dashboard.
4. Aplicar os mesmos critérios aos módulos de vendas, financeiro, visitas,
   cadastros, configurações e administração web existentes.
5. Repetir detector e checagens renderizadas nos três tamanhos; conferir os dois
   temas, foco, nomes dos controles, contraste e exportação.

A aplicação móvel em `cardo_erp_app` é um projeto separado. Este rascunho cobre
o sistema web que vinha sendo revisado nesta conversa.
