export function nomeArquivoDeUri(uri: string, prefixo: string): string {
  const base = uri.split('/').pop() ?? uri;
  const semQuery = base.split('?')[0];
  const temExtensao = /\.\w{2,4}$/.test(semQuery);
  return temExtensao ? `${prefixo}-${semQuery}` : `${prefixo}-${semQuery}.jpg`;
}
