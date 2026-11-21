# Linguagem da interface

Aplicação: interface web, incluindo a área da empresa e o painel de gestão
de empresas. Os textos ajudam administradores e consultores a concluir tarefas.

## Termos consistentes

| Termo | Uso |
| --- | --- |
| Painel de vendas | Resumo comercial da safra, na rota `/dashboard`. |
| Plano de vendas | Lançamentos de vendas, na rota `/vendas`. |
| Orçamento | Documento anterior ao pedido, na rota `/pedidos`. |
| Pedido | Documento gerado a partir de um orçamento, na rota `/propostas`. |
| Gerar pedido | Ação que transforma um orçamento em pedido. |
| Em carteira | Pedidos após a aprovação do financeiro. |
| Relatório de visita | Registro de uma visita; usar “Relatórios de visita” para a lista. |
| Despesa | Lançamento de gastos, com situação “Pago” ou “A pagar”. |
| Registrar pagamento / recebimento | Confirmar uma movimentação já realizada. |
| Excluir / cancelar | Preservar a distinção implementada em cada fluxo. |

Os nomes de rotas e os valores internos de status não são alterados por
esta convenção. Termos do domínio, como safra, faturamento, margem, geração
de demanda, pipeline e siglas fiscais, mantêm seu significado.

## Critérios para novos textos

- Usar maiúscula no início do rótulo e em nomes próprios ou siglas.
- Identificar ação e objeto: “Excluir cliente”, “Salvar meta”, “Cancelar boleto”.
- Diferenciar ausência de cadastro de ausência de resultados nos filtros.
- Nos erros, informar o que não foi concluído e a próxima ação possível,
  sem inventar uma causa ou prometer um prazo de solução.
- Explicar o efeito antes de desativar acesso, cancelar ou substituir conteúdo.
- Distinguir rascunho salvo no navegador de relatório salvo no servidor.
- Usar linguagem de trabalho nos avisos: “envio de fotos” e “administrador”,
  em lugar de detalhes de infraestrutura como storage ou deploy.
- Anunciar erros com `role="alert"` e confirmações de sucesso com
  `role="status"`, sem depender apenas da cor.
- Conferir que o texto cabe em celular e permanece legível com ampliação.
