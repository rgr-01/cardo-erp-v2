import * as LocalAuthentication from "expo-local-authentication";

export async function biometriaDisponivel(): Promise<boolean> {
  const [temHardware, temCadastro] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return temHardware && temCadastro;
}

/** Pede a digital/rosto. Retorna false se o usuário cancelar ou falhar. */
export async function autenticarBiometria(): Promise<boolean> {
  const resultado = await LocalAuthentication.authenticateAsync({
    promptMessage: "Entrar no Cardo AI",
    cancelLabel: "Cancelar",
  });
  return resultado.success;
}
