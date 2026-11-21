# Rede Agro

Sistema web de planejamento de vendas e dashboard comercial, substituindo a planilha do Google Sheets.

- **Dashboard** com meta da safra, funil de vendas, cenário comercial por status/cultura/cliente, evolução do faturamento e ranking de consultores
- **Multiusuário**: administrador vê tudo; consultor vê e edita apenas as próprias vendas
- **Tabela principal de vendas** com filtros (status, fornecedor, consultor, busca) e CRUD completo
- **Cadastros**: clientes, fornecedores/produtos, usuários e metas
- **Relatórios de visita**: texto + fotos por cliente, em `/relatorios/visitas`

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Server Actions) + TypeScript + Tailwind CSS 4
- [Prisma 7](https://prisma.io) + PostgreSQL (Railway)
- [Auth.js v5](https://authjs.dev) (login com e-mail/senha, sessão JWT)
- [Recharts](https://recharts.org) para os gráficos

## Rodando localmente

```bash
npm install
# configure DATABASE_URL e AUTH_SECRET no .env
npx prisma migrate dev
npm run dev
```

Para usar um PostgreSQL no próprio computador e criar o primeiro administrador,
consulte [Ambiente local no Windows](docs/ambiente-local.md).

## Importação da planilha original

Coloque o arquivo exportado do Google Sheets em `data/redeagro.xlsx` e rode:

```bash
npm run importar
```

O script importa clientes, fornecedores, produtos e vendas, cria os usuários
(admin + consultores) com senhas aleatórias impressas no console e define a
meta inicial da safra. Ele aborta se já houver vendas no banco.

## Deploy (Railway)

O serviço `web` roda `npm run build` (gera o Prisma Client) e `npm start`
(aplica migrações pendentes com `prisma migrate deploy` e sobe o Next).
Variáveis necessárias no serviço:

- `DATABASE_URL` → referência `${{Postgres.DATABASE_URL}}`
- `AUTH_SECRET` → segredo do Auth.js (`openssl rand -base64 32`)

O procedimento de backup, restauração testada e proteção de dados está em
[docs/operacao-backup-lgpd.md](docs/operacao-backup-lgpd.md).

## Storage de fotos (relatórios de visita)

Upload de fotos usa o Supabase Storage. Sem essas variáveis configuradas, a
tela de relatórios de visita continua funcionando normalmente, só sem opção
de anexar fotos.

- `SUPABASE_URL` → URL do projeto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` → service role key (uso só no servidor, nunca expor no client)
- `SUPABASE_FOTOS_BUCKET` → nome do bucket (padrão: `relatorios-visita`, privado; o sistema entrega links temporários assinados)

## Despesas (OCR de nota fiscal)

Extração automática dos campos de uma foto de nota/cupom usa a mesma
integração de visão da OpenAI. Sem `OPENAI_API_KEY`, o botão "Extrair da
nota" simplesmente não preenche nada (confiança "baixa"), sem quebrar o
lançamento manual.

- `OPENAI_MODEL_VISION` → modelo usado no OCR (padrão: `OPENAI_MODEL`, depois `gpt-4.1-mini`)

## API mobile

Rotas em `/api/mobile/**` usam autenticação própria via JWT Bearer
(independente da sessão de cookie do Auth.js usada no site).

- `MOBILE_JWT_SECRET` → segredo do token mobile (`openssl rand -base64 32`,
  dedicado — não reaproveitar `AUTH_SECRET`)

## Bot de WhatsApp

Integração via [Evolution API](https://github.com/EvolutionAPI/evolution-api)
por padrão (self-hosted, serviço `evolution-api` no Railway, baseado em
Baileys — não é a Meta Cloud API oficial), com o mesmo modelo de vínculo
reverso do FarmManager: o usuário logado gera um código em `/whatsapp` e
manda esse código, do próprio WhatsApp, pro número do bot — sem custo de
SMS e sem responder a números desconhecidos. `WHATSAPP_TRANSPORTE=meta`
troca pra Meta Cloud API (`src/lib/whatsapp/meta.ts`), útil se o número da
Evolution for bloqueado; a seleção fica em `src/lib/whatsapp/transporte.ts`.

O bot roda como um agente com ferramentas (`src/lib/whatsapp/agente.ts` +
`ferramentas.ts`, function calling da OpenAI) em vez de fluxo rígido por
etapas — o modelo conduz a conversa livremente e decide quando chamar cada
ferramenta:

- Buscar cliente e registrar relatório de visita (texto ou áudio
  transcrito + fotos)
- Ler nota fiscal por foto (OCR) e lançar despesa
- Resumo de vendas do consultor na safra atual e listagem dos últimos
  registros
- Pesquisa na web (via OpenAI `web_search`) para preços, cotações, notícias etc.

Variáveis necessárias no serviço `web_rede_agro`:

- `EVOLUTION_API_URL` → URL do serviço `evolution-api` (pode referenciar
  `${{evolution-api.RAILWAY_PUBLIC_DOMAIN}}` no Railway; se omitida, cai
  para a variável automática `RAILWAY_SERVICE_EVOLUTION_API_URL`)
- `EVOLUTION_API_KEY` → apikey da instância (ou a global
  `${{evolution-api.AUTHENTICATION_API_KEY}}`)
- `EVOLUTION_INSTANCE` → nome da instância criada na Evolution API
- `WHATSAPP_WEBHOOK_TOKEN` → segredo arbitrário enviado no header
  `x-webhook-token` ou na query `?token=` da URL do webhook, pra validar
  que a chamada vem da Evolution API (opcional, mas recomendado)
- `OPENAI_API_KEY`, `OPENAI_MODEL` → usados pelo agente, pela transcrição
  de áudio, pelo OCR de nota fiscal e pela pesquisa na web (padrão
  `gpt-4.1-mini`)

Configuração na Evolution API (via Manager UI em `<url-da-evolution>/manager`
ou API REST, com o header `apikey`):

1. Criar uma instância (nome = `EVOLUTION_INSTANCE`) e escanear o QR code
   com o WhatsApp que vai atuar como bot.
2. Configurar o webhook da instância apontando para
   `https://<seu-dominio>/api/whatsapp/webhook?token=<WHATSAPP_WEBHOOK_TOKEN>`,
   inscrito no evento `MESSAGES_UPSERT`.

O Postgres da Evolution API (`DATABASE_CONNECTION_URI`) é o mesmo Supabase
usado pelo app (`${{web_rede_agro.DATABASE_URL}}`) — atenção ao
`pool_size` do pooler do Supabase: uma sincronização de histórico grande
do WhatsApp pode esgotar as conexões e derrubar os dois serviços juntos.

Sem essas variáveis configuradas, a tela `/whatsapp` avisa que a integração
ainda não está disponível — o resto do site funciona normalmente.
