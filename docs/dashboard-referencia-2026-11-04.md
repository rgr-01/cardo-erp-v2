# Painel inspirado na referência — 4 de novembro de 2026

Direção: interface operacional com densidade média, movimento baixo e hierarquia
semelhante à imagem Shoppers fornecida pelo usuário. A marca, os temas, a navegação
por módulos e os dados do Cardo foram mantidos. Não há comparações percentuais
de crescimento sem um período anterior disponível.

## Distribuição

- Quatro indicadores: pipeline, faturado, em carteira e clientes ativos.
- Coluna principal: evolução mensal com valores no hover e tabela de maiores
  clientes, com valor e participação no pipeline sem cancelados.
- Coluna lateral: barras por etapa, progresso da meta e distribuição por cultura.
- Abaixo: comparação de pipeline/faturado dos consultores, pendências, visitas
  recentes e últimos negócios fechados.

A série de faturamento agora aparece também para o administrador vendo a equipe.
Meses sem vendas faturadas entre o primeiro e o último registro recebem zero,
evitando que o eixo avance diretamente de julho para setembro. Essa alteração
não muda a soma faturada. Não foram gerados novos dados no banco.

Os gráficos novos não usam animação de entrada, garantindo estabilidade na
captura e com movimento reduzido. A série mensal inclui tabela acessível; etapas
e culturas mantêm rótulos e valores explícitos além das cores. O semicírculo limita
a representação visual a 100%, mas continua mostrando o percentual real acima da
meta no texto. Valores e meta indefinida têm estados vazios explícitos.

## Verificação

Capturas autenticadas nos temas claro e escuro em 1440 × 1000, 768 × 1024 e
390 × 844, sem rolagem horizontal ou erros de runtime. Validado filtro individual,
ocultação do ranking nesse filtro, abertura da lista completa de 20 clientes e
retorno aos cinco primeiros. A composição clara usada pelo relatório foi
inspecionada; os tokens de superfície e texto foram explicitados para evitar
texto claro sobre fundo branco quando a tela está no tema escuro.

TypeScript e ESLint dos arquivos alterados passaram. Os três testes da série
mensal cobrem lacunas, virada do ano e série vazia. A geração do PDF completo não
foi executada nesta revisão. Capturas em `artifacts/dashboard-referencia/`.
