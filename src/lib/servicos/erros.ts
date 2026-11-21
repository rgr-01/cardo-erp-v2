// Erros com significado próprio, lançados pelos serviços compartilhados entre
// as server actions do web e a API do app. As actions só repassam a mensagem;
// a API do app converte cada um no status HTTP certo (ver respostaDeErro).

export class ErroAutenticacao extends Error {}

export class ErroPermissao extends Error {}

export class ErroNaoEncontrado extends Error {}
