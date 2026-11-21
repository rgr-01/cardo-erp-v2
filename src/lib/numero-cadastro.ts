export function formatarNumeroCadastro(numero: number): string {
  return String(numero).padStart(6, "0");
}
