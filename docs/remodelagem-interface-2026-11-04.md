# Remodelagem da interface — claro integrado

Concluída em 4 de novembro de 2026, com a skill ui-humanizer. Rascunho de
operação compacta e direção visual A aprovados pelo usuário antes da implementação.

## Resultado

Navegação clara, painéis com superfície lisa, pendências em linhas e conteúdo
com altura proporcional aos dados. O login ficou centrado na entrada da equipe.
O tema claro é o padrão para aparelhos sem preferência; o tema escuro continua
disponível. As preferências já salvas são respeitadas.

Os componentes compartilhados foram aplicados aos módulos de clientes,
produtos, vendas, pedidos, financeiro, despesas, visitas, usuários e configurações.
O kit também atende os componentes da administração. Sidebar recolhível em
tablet, calendário compacto no celular e acionador do assistente fora da
sobreposição corrigem os problemas observados nas capturas iniciais.

Não foram alterados contratos de ações, permissões ou conteúdo salvo de
relatórios. A aplicação móvel separada em `cardo_erp_app` não integra este escopo.

## Capturas reais

- [Dashboard claro](../artifacts/ui-humanizer-2026-11-03/after-light_dashboard.png).
- [Dashboard escuro](../artifacts/ui-humanizer-2026-11-03/after-dark_dashboard.png).
- [Dashboard no tablet](../artifacts/ui-humanizer-2026-11-03/after-tablet_dashboard.png).
- [Login no celular](../artifacts/ui-humanizer-2026-11-03/after-login-mobile.png).
- [Calendário em 320 px](../artifacts/ui-humanizer-2026-11-03/after-small_relatorios_visitas.png).
- [Vendas](../artifacts/ui-humanizer-2026-11-03/after-light_vendas.png).
- [Modal em altura reduzida](../artifacts/ui-humanizer-2026-11-03/after-usuario-modal.png).

As pastas de evidência mantêm a data de início do trabalho, 3 de novembro.

## Detector antes e depois

| Sinal heurístico | Antes | Depois |
| --- | ---: | ---: |
| A1 — caixa alta e tracking | 94 | 66 |
| A5 — borda lateral pintada | 3 | 2 |
| A13 — escala/deslocamento no hover | 6 | 1 |
| B5 — pills e raios grandes | 129 | 92 |
| B6 — gradientes e glow | 24 | 10 |
| E2 — salto/scroll cue | 1 | 0 |
| E6 — grades decorativas | 2 | 1 |

Essas contagens são sinais no código, não defeitos independentes nem nota de
qualidade. Os remanescentes incluem controles do editor, dados gráficos, fotos
clicáveis, avatares, estilos de relatório e strings de WhatsApp. As exceções
estão registradas no [DESIGN.md](../DESIGN.md).

[Saída anterior](../artifacts/ui-humanizer-2026-11-03/detector-antes.txt) e
[saída posterior](../artifacts/ui-humanizer-2026-11-03/detector-depois.txt).

## Validação

- TypeScript e ESLint nos arquivos alterados: passaram.
- 64 cenários reais: login, erro de senha, 24 páginas nos dois temas, tablet
  a 768 px, celular a 390 px, largura de 320 px e modal a 390 × 480. Sem
  violações detectadas nas regras WCAG 2 A/AA, 2.1 AA e 2.2 AA executadas pelo axe.
- 15 verificações de integração: padrão de tema, foco fora do menu fechado,
  retorno do foco, modal, assistente sem sobreposição, movimento reduzido e
  ausência de erros de JavaScript nas páginas percorridas.
- 45 verificações dos componentes reais: diálogo, confirmações em fila,
  seletores de data/cor, teclado, busca longa, cancelamento de gestos e uso local sem rede.
- Oito cenários preenchidos com dados sintéticos: quatro larguras nos dois temas,
  valores altos, nomes longos e documentos sem espaços. Sem transbordamento ou
  falhas de contraste detectadas; expansão dos oito clientes também conferida.
- PDF gerado pela ação real: HTTP 200, `application/pdf`, assinatura `%PDF` e
  184.485 bytes recebidos no navegador.

O teste preenchido foi isolado e **não gravou dados no banco**.

Evidências: [páginas](../artifacts/ui-humanizer-2026-11-03/redesign-results.json),
[integração](../artifacts/ui-humanizer-2026-11-03/interaction-checks.json),
[componentes](../artifacts/ui-humanizer-2026-11-03/checks.json),
[dados sintéticos](../artifacts/ui-humanizer-2026-11-03/populated-results.json) e
[PDF](../artifacts/ui-humanizer-2026-11-03/pdf-check.json).

## Fontes

No login, o pré-carregamento caiu de nove arquivos, com 444.656 bytes na linha
de base, para dois arquivos, com 45.428 bytes nesta verificação. As fontes de
documento carregam sob demanda quando utilizadas; não foram removidas do editor.
[Medição posterior](../artifacts/ui-humanizer-2026-11-03/fonts-after.json).

## Limites da verificação

O navegador foi o Edge local, com entradas de toque sintetizadas. Os fluxos
reais utilizaram o administrador local; não foi feita nova matriz de autorização
por perfil nem ensaio em aparelho físico. O painel master recebeu o kit, mas não
foi percorrido com uma sessão de superadministrador. Não houve nova nota global
de auditoria ou declaração integral de conformidade; resultados inconclusivos
do axe e cores livres do conteúdo de relatórios exigem avaliação contextual.
