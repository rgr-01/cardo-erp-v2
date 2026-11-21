# Rede Agro Mobile

App React Native (Expo Router) para consultores de campo, consumindo a API
mobile do [rede-agro](https://github.com/cwontroba/rede-agro)
(`/api/mobile/**`, autenticação por JWT Bearer — ver
`docs/app-mobile-plano.md` no repo do site para o contrato completo).

## Escopo

**v1** — relatório de visita:

- Login (e-mail/senha do sistema, mesmo usuário do site)
- Nova visita: cliente, texto, fotos (câmera ou galeria)

**v1.1** — despesas (OCR) e pedido simplificado:

- Nova despesa: ao tirar/escolher a foto da nota, a extração via IA
  (`/api/mobile/despesas/extrair`) roda automaticamente e preenche o
  formulário — o consultor só confere e ajusta antes de salvar, nunca
  salva sozinho.
- Novo pedido: cliente + produto + quantidade/valor.

Comum às duas: fila offline (toda ação é salva localmente primeiro via
`@react-native-async-storage/async-storage` e sincronizada em segundo plano
quando há conexão, via `@react-native-community/netinfo`), com listagem de
status (pendente / enviando / erro) na tela "Fila de envio".

## Rodando localmente

```bash
npm install
npx expo start
```

`EXPO_PUBLIC_API_URL` (em `.env`) aponta para a API do site — por padrão,
produção (`https://redeagro.up.railway.app`). Para testar contra o site
rodando localmente, troque para `http://localhost:3000` (funciona só no
emulador/web; em dispositivo físico use o IP da máquina na rede local).

## Estrutura

- `src/app/(auth)/login.tsx` — tela de login
- `src/app/(app)/` — telas autenticadas (guard em `_layout.tsx`, redireciona
  para login se não houver sessão)
- `src/lib/auth-context.tsx` — estado de sessão (React Context)
- `src/lib/auth-storage.ts` — token/usuário persistidos via
  `expo-secure-store` (Keychain/Keystore)
- `src/lib/api.ts` — client HTTP da API mobile (injeta `Authorization: Bearer`,
  trata 401 limpando a sessão)
- `src/lib/fila-offline.ts` — fila local de itens pendentes de envio
  (visita, despesa ou pedido — mesmo mecanismo, discriminado por `tipoItem`)
- `src/lib/arquivo.ts` — deriva um nome de arquivo estável a partir da
  `uri` do ImagePicker (evita gerar valor não-determinístico dentro de um
  event handler, que o React Compiler rejeita)

## Gerando um build instalável (EAS Build)

```bash
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

O perfil `preview` (em `eas.json`) gera um `.apk` direto — sem passar pela
Play Store —, pronto para instalar no celular via o link que o EAS
devolve ao final do build.
