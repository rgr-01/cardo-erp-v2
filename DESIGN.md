# Cardo ERP — contexto visual do sistema web

## Estado deste documento

O usuário aprovou **operação compacta, opção A — claro integrado**.
Implementação concluída em 4 de novembro de 2026. Este documento registra
as decisões do sistema web; as propostas anteriores são histórico.

## Produto e público

ERP comercial do agronegócio para administradores e consultores. Organiza
clientes, safra, vendas, pedidos, financeiro e visitas. A área logada tem intenção
de operar: navegação reconhecível, tarefas recorrentes e dados reais.

## Verdade visual existente

```design-tokens
fonts: Space Grotesk, Geist Mono
colors: #19323b, #00dc4d, #10232a, #142a32, #ecf1f3, #006d2e, #f1f5f6, #ffffff, #34525d, #a3b8c1, #4a626d, #76929c, #6f8790, #101713, #19231d, #131d17, #34483d, #edf4ef, #bfcec3, #afc1b5, #7e9687
radii: 0, 4px, 8px, 10px, 12px, 9999px
```

O código em `src/app/globals.css` define os valores e as exceções efetivos.
Azul-petróleo e verde vêm da marca existente. Acento verde vivo no tema escuro
e verde profundo no claro; cores de texto separadas das cores de superfície.
Há identidade própria de cada empresa no login. As fontes adicionais presentes
no layout pertencem às opções do editor de relatório, não ao kit geral da UI.

Logotipos, dados de safra, categorias e fotos de relatório existentes são o
material real. Não inventar números, clientes ou imagens para preencher vazios.

## Restrições duráveis

Preservar permissões, tarefas, validações, exportações, uso por teclado e os
temas claro/escuro. Diálogos nativos compartilham isolamento e retorno de foco;
popups pertencem ao diálogo ativo. Não reintroduzir controles ocultos no Tab.
As prévias brancas de documentos usam texto escuro mesmo dentro de editores
escuros. Não aplicar tokens do painel ao conteúdo editável dos relatórios.

## Composição e componentes

- Navegação dividida em Cadastros (clientes/fornecedores), Estoque (produtos),
  Gestão comercial, Financeiro (incluindo carteira e faturamento) e Gestão de
  visitas. O botão Módulos no topo da barra lateral abre uma grade visual de
  blocos com ícones grandes, inspirada na referência fornecida pelo usuário.
  Blocos usam azul-petróleo e texto branco; o módulo atual usa verde e a indicação
  Atual. Só áreas acessíveis aparecem. A barra lateral exibe apenas o menu do módulo
  atual. Início é fixo e abre o painel de vendas, com filtros e exportação.
  A troca de área usa o seletor. Configurações, perfil e tema ficam no rodapé. Fornecedores e produtos
  têm telas separadas, respeitando os módulos e papéis existentes.
  Ver [módulos do sistema](docs/modulos-sistema.md).
- Cadastros tem entradas separadas para Clientes, Localização e Fornecedores.
  `/clientes` abre a tabela e `/localizacao` abre o mapa, sem abas internas
  alternando essas duas funções. Os filtros e as regras de carteira são comuns.

- Operar, com variação baixa e movimento baixo. Densidade alta em tabelas e
  média no dashboard. O conteúdo define a altura dos blocos.
- Claro integrado: navegação branca, fundo claro e verde nas ações/seleções.
  É o padrão sem cookie de preferência. `escuro` continua respeitado.
- Dark com verde: canvas `#101713`, painéis `#19231d`, navegação `#131d17`,
  borda `#34483d` e ação/foco `#00dc4d`. É uma paleta própria, não a inversão
  do claro. Texto principal `#edf4ef`, secundário `#bfcec3` e apoio `#afc1b5`.
  Controles usam borda `#7e9687`. O verde em botões recebe texto `#102b1b`.
- Login acompanha a preferência do aparelho e mantém o verde na ação principal.
  A troca fica no cabeçalho do login/celular e no rodapé da navegação desktop.
  O componente compartilhado usa a ação de tema existente, salva em cookie
  e atualiza a árvore React inteira; não trocar só o atributo do HTML.
- Sidebar de 256 px a partir de 1024 px. Abaixo disso, menu recolhível com
  foco, Escape e isolamento do conteúdo ao abrir. Os nomes completos dos
  módulos têm prioridade sobre uma sidebar menor só com ícones.
- Dashboard inspirado na referência Shoppers fornecida pelo usuário: quatro
  indicadores separados, evolução do faturamento em destaque e tabela de clientes
  na coluna principal. Coluna lateral com vendas por etapa, meta em semicírculo
  e culturas; consultores, pendências e atividade recente abaixo. Faturamento
  aparece também na visão da equipe. A curva preenche meses intermediários sem
  faturamento com zero. A área sob a curva representa volume, sem gradiente decorativo.
  Grades respondem à largura do contêiner, inclusive na composição clara do
  PDF; no celular os blocos seguem em uma coluna. Todos os valores e destinos
  existentes continuam disponíveis. Ver [revisão pela referência](docs/dashboard-referencia-2026-11-04.md).
- Títulos da UI entre 24 e 28 px; corpo em 14 px, apoio em 12–13 px. Valores
  e tabelas com números tabulares. Rótulos operacionais em caixa de frase.
- Controles com raio de 8 px; painéis e KPIs com 10 px; diálogos com 12 px.
  Sem gradiente, glow ou sombra em painéis. Sombra fica nos elementos sobrepostos.
- Indicadores de vendas, Financeiro e Gestão de visitas compartilham `Kpi`:
  rótulo em 12 px, ícone sem fundo no canto, valor semibold com números tabulares
  e detalhe em 11 px. Valores longos ajustam a fonte à largura do card e mantêm
  a quantia completa. Cores de alerta só indicam pendências reais. Painéis usam
  título em 14 px e padding de 16/20 px, definidos em `ui/padroes-painel.ts`.
  Aplicado também a despesas, Em carteira, resumo/diagnóstico de visitas e geração
  de demanda. Cards de relatório preservam categorias, fotos e ações, com padding
  e hierarquia consistentes. Ver [verificação dos cards](docs/cards-modulos-2026-11-04.md).
- Borda de controle `#6f8790` no claro e `#7e9687` no dark. Não substituir
  cores de erro, foco ou seleção por uma borda neutra.
- Transições de estado curtas, até 150 ms no kit. Movimento reduzido desativa
  as transições da área operacional e o pulso dos skeletons. Spinners que
  informam carregamento não foram apagados por uma regra universal.
- Assistente no fluxo ao final da área de trabalho, com nome visível, sem
  cobrir tabelas e calendário. A janela da conversa permanece acessível pelo acionador.
- Login privilegia identificação e formulário. Sem apresentação de recursos,
  grade decorativa, brilho ou conteúdo promocional antes dos campos no celular.
- Fontes adicionais do editor continuam disponíveis, com `preload: false`.
  Não antecipar fontes de documento no login.

## Exceções intencionais ao detector

O detector é heurístico e não é uma especificação automática de estilo.

- Avatares e indicadores de progresso mantêm círculos; selos de estado seguem
  a semântica de sua família. Não transformar todos em retângulos por contagem.
- Skeletons comunicam carregamento e são estáticos com movimento reduzido.
- Gradientes em seletores de cor e na rosca de culturas codificam cor/dados;
  grades no modo avançado do editor orientam alinhamento. Não são atmosfera.
- Rótulos de tabela, categorias de relatório e opções do editor não são
  eyebrows promocionais. Conteúdo e formatação dos documentos foram preservados.
- Sparkles nas ações explicitamente chamadas “Revisar com IA” identificam uma
  função real. O acionador geral do assistente usa ícone de robô e texto.
- Roxo permanece em categorias, cores de avatar e opções escolhidas no editor;
  não é o acento da marca. Emojis de mensagens de WhatsApp não são ícones da UI.
- Fundos translúcidos de ferramentas/hover e o fundo do recorte de foto não
  definem cards de vidro no painel. A foto do relatório é um link para ampliar;
  seu tratamento pertence ao conteúdo de leitura, não aos cards operacionais.

## Referências e verificação

Consultar [brief, diagnóstico e rascunhos](docs/proposta-remodelagem-ui.md).
Consultar [referências e prévias](docs/referencias-remodelagem-ui.md):
A foi escolhida pelo usuário. A lógica vem das referências de Orely/Pinterest,
complementada por exemplos de listas e tabelas; a marca e os dados são do Cardo.
Resultados e capturas em [relatório de implementação](docs/remodelagem-interface-2026-11-04.md).

## Registro de decisões

- 2026-11-03: contexto existente e restrições registrados. A proposta de
  remodelagem ainda não constitui uma decisão visual aprovada.
- 2026-11-03: usuário aprovou o rascunho de operação compacta e forneceu
  referências de dashboard da Orely e Pinterest. A composição orientada a
  tarefas está aprovada; aplicação visual A/B pendente.
- 2026-11-04: usuário aprovou a aplicação A, claro integrado. Tokens, componentes
  e composição implementados, incluindo o tema escuro, sem mudar permissões
  ou gravar dados de demonstração no banco.
- 2026-11-04: usuário pediu versão dark mantendo o verde. Paleta grafite/verde,
  login temático e troca visível implementados. Preferência persistida; PDF
  permanece claro. [Verificação do dark](docs/tema-dark-2026-11-04.md).
