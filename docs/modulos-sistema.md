# Módulos do sistema

| Módulo | Conteúdo | Identificador interno |
| --- | --- | --- |
| Cadastros | Clientes, localização, propriedades e fornecedores | `CADASTROS` |
| Estoque | Catálogo de produtos, embalagens, custos, preços e dados fiscais | `ESTOQUE` |
| Gestão comercial | Plano de vendas, metas, orçamentos, pedidos e aprovações | `VENDAS` |
| Financeiro | Visão geral, carteira, faturamento, notas, boletos, contas a pagar e receber e despesas | `ERP` |
| Gestão de visitas | Relatórios de visita e geração de demanda | `VISITAS` |

O módulo Estoque organiza o catálogo existente. Saldo, entradas, saídas e
inventário físico ainda não são funcionalidades implementadas.

## Troca de área

O botão Módulos no topo da barra lateral abre um menu visual com blocos e ícones
grandes, seguindo a referência de ERP fornecida pelo usuário. A grade mostra
somente áreas com funções acessíveis. O módulo atual recebe fundo verde e o
texto Atual; os demais usam azul-petróleo da marca. Selecionar uma área abre sua primeira tela e exibe apenas
seus atalhos. A seleção acompanha a URL, inclusive em links diretos, recarga e
histórico do navegador. Despesas permanece dentro do menu Financeiro, mesmo
quando é a única função financeira liberada ao consultor.

O botão Início fica disponível em todos os módulos e abre `/inicio`, com o
painel de vendas, filtros e exportação. A raiz do sistema e o login sem destino
explícito também abrem esse painel. Destinos explícitos de login são preservados.
O endereço `/dashboard` continua compatível e também destaca Início no menu.
Usuários sem acesso a Vendas mantêm o redirecionamento para uma área permitida. Configurações,
perfil e tema ficam no rodapé da barra lateral. No celular, escolher outra área
fecha o menu ao concluir a navegação.

A página inicial e o seletor usam a mesma definição de navegação e as permissões
existentes. Não armazenam uma preferência global de módulo entre usuários.
Verificadas as cinco trocas, links diretos, recarga, perfil no rodapé e temas
claro/escuro em 1440 × 900, 768 × 1024 e 390 × 844. Capturas em
`artifacts/seletor-modulos/`. Os 31 testes específicos de navegação, módulos,
catálogo e autenticação mobile passaram, além de TypeScript e ESLint.

A grade visual foi verificada em desktop, tablet e celular, incluindo tema
escuro, Escape, retorno de foco ao acionador e fechamento após escolher um
módulo. O diálogo nativo mantém o foco e isola o conteúdo de fundo. No celular,
os blocos usam duas colunas; em telas médias, três; em telas grandes, cinco.
Capturas da grade em `artifacts/menu-modulos/`. Início continua mostrando o
painel de vendas.

Fornecedores tem tela própria em `/fornecedores`, separada de `/produtos`.
Clientes e fornecedores recebem códigos numéricos automáticos por empresa,
com busca nas listas. Ver [numeração dos cadastros](numeracao-cadastros.md).
Clientes e Localização também são entradas independentes no menu de Cadastros:
`/clientes` abre o cadastro em tabela e `/localizacao` abre o mapa. As antigas
abas internas foram removidas. A busca por links `/clientes?busca=...` permanece
disponível e a ação Abrir no mapa do dashboard aponta para `/localizacao`.
Ambas as telas usam a mesma consulta, com as permissões de Cadastros e o filtro
de carteira do consultor preservados. Alterações cadastrais revalidam as duas rotas.

Separação verificada em 1440 e 390 px: títulos e destaque corretos no menu,
tabela, mapa com marcadores, busca por link e ausência de erros de runtime.
TypeScript, ESLint e os 21 testes existentes de navegação/módulos passaram.
Capturas em `artifacts/clientes-localizacao/`.

A ação Ver produtos abre o catálogo filtrado pelo fornecedor. O cadastro de
fornecedores permanece administrativo; clientes continuam seguindo as regras
de carteira do consultor. Produtos e financeiro administrativo preservam as
restrições de papel existentes. Despesas aparece dentro de Financeiro e
continua com bloqueio independente por usuário (`DESPESAS`).

## Permissões e compatibilidade

Os cinco módulos podem ser selecionados no painel de empresas. A tela de
usuários permite restringir módulos contratados para cada consultor. Cadastros
e Estoque são independentes de Gestão comercial. Os identificadores anteriores
`VENDAS`, `ERP` e `VISITAS` foram preservados para compatibilidade.

Leituras de clientes/propriedades no aplicativo e no fluxo de visitas continuam
compartilhadas para alimentar seletores. Alterações cadastrais pelo aplicativo
exigem Cadastros. O catálogo mobile pode ser lido por Estoque ou Gestão comercial,
pois também alimenta a criação de pedidos. Completar os dados do cliente dentro
do pedido continua autorizado pelo módulo comercial. As ferramentas de alteração
de fornecedores/produtos no WhatsApp seguem os novos módulos.

## Migração

`20261104150000_modulos_cadastros_estoque` adiciona Cadastros às empresas
existentes (clientes já eram compartilhados) e Estoque às que tinham Vendas.
Bloqueios de Vendas existentes recebem também o bloqueio de Estoque. Não remove
módulos, dados, usuários ou vínculos e não recria registros do catálogo.

O padrão de novas empresas passa a incluir os cinco módulos. Em ambientes
existentes, execute `npx prisma migrate deploy` e `npx prisma generate` antes
de iniciar a versão atualizada. A migração já foi aplicada no banco local.

## Verificação local em 4 de novembro de 2026

Navegação autenticada verificada em clientes, fornecedores, produtos,
financeiro, dashboard e relatórios de visita. Os cinco grupos do menu aparecem
e apenas o link atual fica selecionado. Verificados busca de fornecedor,
navegação para produtos filtrados e formulário de novo fornecedor no celular,
sem gravar dados de teste. Capturas em `artifacts/modulos/`.

TypeScript e ESLint nos arquivos alterados passaram. Testes de módulos,
autorização do catálogo e autenticação mobile cobrem as novas separações.
A suíte completa apresentou duas falhas no arquivo não alterado
`tests/unit/relatorio-conteudo.test.ts`: seleção de foto de capa e limite de
margem superior. Esses problemas do editor de relatórios não foram alterados
nesta reorganização.
