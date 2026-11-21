# App mobile (React Native / Expo) — plano

Anotado em 2026-08-28, atualizado em 2026-09-01. O backend (API mobile +
módulo de Despesas) já está implementado no rede-agro; o app Expo em si
(repositório separado) ainda não foi iniciado.

## Por que um app separado (não só o site responsivo)

- **Uso offline no campo**: fazenda sem sinal — precisa registrar a visita
  (texto + fotos) sem internet e sincronizar quando voltar a ter conexão.
- **Ícone na tela / sensação de app nativo**: instalável, sem abrir navegador.
- **Notificações push**: avisar o consultor (meta, proposta pendente etc.)
  mesmo com o app fechado.
- **Câmera/GPS mais avançado**: localização da visita, múltiplas fotos com
  mais controle e qualidade do que o `<input type="file">` do navegador.

## Caminho técnico escolhido

React Native + Expo, projeto novo (repositório separado), consumindo a API
do Rede Agro. Não é PWA — decisão já tomada por causa do offline-first e
push, que PWA resolve mal.

## O que mudou no backend (rede-agro) — já implementado

Toda a lógica de negócio rodava só em **Server Actions** do Next.js,
dependentes de sessão via cookie (Auth.js/next-auth), que um app Expo não
consegue chamar. Foi criada uma API HTTP dedicada com autenticação própria,
cobrindo três domínios: relatório de visita, despesas (com OCR) e pedido
simplificado.

1. **Autenticação por JWT** (`src/lib/mobile-auth.ts`), independente da
   sessão de cookie do site:
   - `POST /api/mobile/auth/login` — recebe `{email, senha}`, reaproveita
     `validarCredenciais()` (extraída de `src/auth.ts` para
     `src/lib/auth-credenciais.ts`, usada também pelo Auth.js), devolve
     `{token, usuario}`. Token via `jose`, claims `sub`/`role`/`nome`,
     expira em 7 dias. Secret dedicado: `MOBILE_JWT_SECRET` (não é o
     `AUTH_SECRET` do site).
   - Demais rotas exigem header `Authorization: Bearer <token>`, validado
     por `exigirSessaoMobile()` — 401 se ausente/inválido/expirado.
2. **`safraId` sem cookie**: `GET /api/mobile/safra-atual` usa
   `getSafraMaisRecente()` (extraída de `src/lib/safra-atual.ts`, sem a
   parte de `cookies()`); o app manda o `safraId` explícito nas chamadas de
   criação.
3. **Rotas de leitura**: `GET /api/mobile/clientes`, `GET /api/mobile/produtos`.
4. **Relatório de visita**: `POST /api/mobile/relatorios-visita`
   (`multipart/form-data`), chama `salvarRelatorioVisita()` direto — mesma
   lib já compartilhada com o bot de WhatsApp, o app é o terceiro
   consumidor.
5. **Despesas**: `POST /api/mobile/despesas/extrair` (OCR, ver seção
   abaixo) e `POST /api/mobile/despesas` (`multipart/form-data`), via
   `src/lib/despesas.ts`.
6. **Pedido simplificado**: `POST /api/mobile/pedidos` (JSON), via nova lib
   `src/lib/pedidos.ts` (`criarPedidoParaConsultor`), extraída de
   `criarDocumento` em `src/app/actions/propostas.ts` — recebe a sessão já
   resolvida, não chama `revalidatePath` (só a Server Action web faz isso).
7. **Upload de foto**: mesma pipeline do Supabase Storage, generalizada em
   `src/lib/storage.ts` (função interna comum + `enviarBufferFotoVisita` e
   `enviarBufferComprovante` como wrappers finos).

## OCR de despesas

`src/lib/ocr-despesa.ts` (`extrairDadosNotaFiscal`) usa o mesmo padrão de
function-calling com visão da OpenAI já usado no NLU do WhatsApp
(`src/lib/whatsapp/nlu.ts`): `POST /v1/responses` com `input_image` em
base64 e `tool_choice` forçado. Extrai `valor`, `data`, `estabelecimento`,
`categoria` e uma `confianca` (`alta`/`media`/`baixa`).

- Falha ou baixa confiança nunca lança exceção — sempre retorna um
  resultado (fallback com tudo `null` e confiança "baixa").
- **Confirmação humana obrigatória**: a extração só preenche o formulário
  (web em `/despesas`, ou os campos no app), nunca salva sozinha.
- Variável `OPENAI_MODEL_VISION` permite apontar o OCR para um modelo de
  visão diferente do `OPENAI_MODEL` usado no NLU de texto do WhatsApp, caso
  necessário — fallback em cascata: `OPENAI_MODEL_VISION` → `OPENAI_MODEL`
  → `"gpt-4.1-mini"`.
- Rota mobile equivalente: `POST /api/mobile/despesas/extrair`.

## Escopo do app Expo

**v1 — relatório de visita isolado** (já tem toda a base pronta e testada
via WhatsApp; é o fluxo mais simples e menos arriscado para validar
login/fila offline/upload primeiro):

- Login
- Criar relatório de visita: cliente, texto, fotos (câmera ou galeria)
- Fila local (SQLite/AsyncStorage) quando offline, sincroniza sozinho
  quando a conexão volta
- Listagem dos relatórios já enviados

**v1.1 — despesas (OCR) + pedido simplificado**, lançada logo em seguida,
mesma API/auth da v1:

- Nova despesa: foto → `POST /despesas/extrair` → revisão do consultor →
  `POST /despesas`
- Novo pedido simplificado: cliente + produto + quantidade/valor →
  `POST /pedidos`
- Listagens de despesas e pedidos enviados

Separado em duas versões porque o fluxo de OCR depende de qualidade de
foto em campo (mais risco) — melhor validar o fluxo simples (visita) antes.

## Fora do escopo da v1/v1.1 (mencionado, decidir depois)

- Notificações push (Expo Push) — depende de decidir quais eventos
  disparam notificação
- GPS automático na visita
- Publicação nas lojas (precisa de conta de desenvolvedor Apple/Google)
