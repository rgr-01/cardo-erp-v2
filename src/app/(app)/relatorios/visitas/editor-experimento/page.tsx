import { EditorExperimento } from "@/components/visitas/editor-experimento";

export const metadata = { title: "Proposta de editor" };

// Esta rota é deliberadamente só uma maquete interativa. Não lê nem grava
// relatórios: ela existe para aprovar o comportamento do novo editor antes da
// migração do fluxo de produção.
export default function EditorExperimentoPage() {
  return <EditorExperimento />;
}
