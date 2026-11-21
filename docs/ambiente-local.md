# Ambiente local no Windows

O sistema usa Node.js 24, npm e PostgreSQL 17. Execute os comandos na pasta
que contém `package.json`. No PowerShell, `npm.cmd` evita bloqueios do script
`npm.ps1` pela política de execução.

## Configuração

O arquivo `.env` contém a conexão com `127.0.0.1:5432/cardo_erp`, os segredos
de autenticação e as credenciais do administrador local. Não compartilhe esse
arquivo. `DATABASE_URL` e `DIRECT_URL` apontam para o mesmo banco local.

Deixe `AUTH_URL` e `NEXTAUTH_URL` sem definição neste ambiente. O login usa
o endereço acessado no navegador, mantendo a sessão tanto em `localhost`
quanto em `127.0.0.1` sem trocar de host no redirecionamento.

Para preparar as tabelas e o primeiro acesso após criar o banco:

```powershell
npm.cmd ci
npx.cmd prisma generate
npx.cmd prisma migrate deploy
npm.cmd run db:local
```

O comando `db:local` cria a empresa Cardo Local, a safra 26/27 e o
administrador definido em `LOCAL_ADMIN_EMAIL` e `LOCAL_ADMIN_PASSWORD`.
Só aceita o banco `cardo_erp` em localhost e preserva um usuário já existente,
sem redefinir sua senha.

## Dados fictícios

Após inicializar o administrador, execute `npm.cmd run db:demo` para preencher
a empresa local e a safra 26/27 com clientes, consultores, produtos, vendas,
pedidos, visitas, despesas e contas financeiras demonstrativas.

O comando só aceita o banco `cardo_erp` em localhost. Pode ser repetido sem
duplicar os registros ou sobrescrever edições existentes. Os registros são
identificados por nomes Demo, observações ou IDs `demo_local_`. Notas e boletos
são registros fictícios; nenhuma integração externa é acionada. As credenciais
do administrador permanecem iguais. Para consultar os totais sem inserir dados,
use `npm.cmd run db:demo -- --verificar`.

## Iniciar o sistema

Com o serviço do PostgreSQL em execução:

```powershell
npm.cmd run dev
```

Acesse <http://localhost:3000>. As credenciais do primeiro acesso estão nas
variáveis `LOCAL_ADMIN_EMAIL` e `LOCAL_ADMIN_PASSWORD` do `.env`.
Encerre o servidor web com Ctrl+C. O PostgreSQL roda como serviço do Windows.

Este ambiente tem dados próprios. Não contém os registros do sistema em
produção. Fotos no Supabase, IA, WhatsApp, emissão fiscal e assinaturas
dependem de suas respectivas integrações. Chrome ou Edge instalado é usado
na renderização dos relatórios em PDF.
