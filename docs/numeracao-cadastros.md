# Numeração de clientes e fornecedores

Clientes e fornecedores têm um campo `numero` numérico, exibido na coluna
Código como `000001`, `000002` e assim por diante. A numeração de cada tipo
é independente e recomeça em 1 para cada empresa. O preenchimento com zeros
é apenas visual: números acima de seis dígitos são exibidos integralmente.

O número é atribuído automaticamente pelo PostgreSQL em qualquer criação,
incluindo web, aplicativo, importações e WhatsApp. O contador transacional
em `numeracoes_cadastro` usa UPSERT atômico por empresa/tipo. Dois cadastros
simultâneos não calculam o mesmo MAX+1. Uma restrição única por empresa/número
e uma restrição de número positivo também protegem os registros.

Os códigos são permanentes e não editáveis. Alterações de nome preservam o
código; exclusões não reduzem o contador nem reutilizam códigos. O gatilho
também rejeita alterar número ou empresa de um cadastro existente. Uma
transação revertida não mantém o cadastro nem avança seu contador.

## Registros existentes e implantação

A migração `20261104170000_numeracao_cadastros` numera todos os registros
existentes, sem alterar IDs ou vínculos. Clientes seguem a ordem de criação,
com ID como desempate. Fornecedores antigos não têm data de criação e seguem
nome e ID. A ordenação alfabética das listas permanece como antes.

Execute `npx prisma migrate deploy` e `npx prisma generate` ao atualizar outro
ambiente. A migração foi aplicada no banco local `cardo_erp`.

O padrão zero do campo no schema é reservado à entrada: o gatilho substitui
esse valor pelo número definitivo antes da restrição de positividade. Não
remova os gatilhos ao restaurar o banco. Contadores e cadastros devem ser
incluídos juntos no backup.

## Uso e verificação

As duas listas aceitam busca por código com ou sem zeros à esquerda. A
exportação CSV de clientes inclui Código. Novos clientes mostram Automático
até serem salvos; fornecedores recebem o código no salvamento.

Verificados os 20 clientes e 4 fornecedores existentes. O script
`node --import tsx scripts/verificar-numeracao-local.ts` exige o banco local,
cria empresas de teste e as remove ao finalizar. Confere 12 clientes e 8
fornecedores simultâneos, sequências independentes, estabilidade em renomeação,
imutabilidade, não reutilização após exclusão e rollback.

TypeScript, ESLint e os 7 testes de clientes/permissões do catálogo passaram.
Exibição e busca foram verificadas em 1440 e 390 px, além do estado automático
de novo cliente e tema escuro. Capturas em `artifacts/numeracao-cadastros/`.
