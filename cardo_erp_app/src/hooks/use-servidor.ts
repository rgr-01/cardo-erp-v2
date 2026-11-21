import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { SessaoExpiradaError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { gravarCache, lerCache } from '@/lib/servidor';

export type EstadoServidor<T> = {
  dados: T | null;
  carregando: boolean;
  /** Erro da última busca (ex.: sem sinal). Com cache, a tela continua mostrando os dados salvos. */
  erro: string | null;
  /** Quando os dados exibidos vieram do servidor pela última vez. */
  atualizadoEm: string | null;
  /** true quando o que está na tela é a cópia salva, não a resposta de agora. */
  doCache: boolean;
  recarregar: () => Promise<void>;
  /** Troca os dados exibidos (e o cache) pela resposta de uma edição. */
  substituir: (dados: T) => void;
};

/**
 * Lê um recurso do servidor com cache local: mostra na hora o que foi salvo
 * da última vez e atualiza em seguida. Sem sinal, fica com a cópia salva.
 * Rebusca toda vez que a tela volta ao foco (ex.: depois de editar).
 */
export function useServidor<T>(chave: string | null, buscar: () => Promise<T>): EstadoServidor<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [doCache, setDoCache] = useState(false);
  const { sessaoExpirada } = useAuth();

  // `buscar` costuma ser uma arrow nova a cada render; guardamos a última
  // pra não refazer o efeito a cada render.
  const buscarRef = useRef(buscar);
  useEffect(() => {
    buscarRef.current = buscar;
  });

  const recarregar = useCallback(async () => {
    if (!chave) return;
    setCarregando(true);
    setErro(null);
    try {
      const novos = await buscarRef.current();
      setDados(novos);
      setDoCache(false);
      setAtualizadoEm(await gravarCache(chave, novos));
    } catch (e) {
      if (e instanceof SessaoExpiradaError) {
        sessaoExpirada();
        return;
      }
      setErro(e instanceof Error ? e.message : 'Não foi possível atualizar.');
      setDoCache(true);
    } finally {
      setCarregando(false);
    }
  }, [chave, sessaoExpirada]);

  useFocusEffect(
    useCallback(() => {
      if (!chave) return;
      let ativo = true;
      lerCache<T>(chave).then((salvo) => {
        if (!ativo || !salvo) return;
        // Só usa o cache se a busca ainda não respondeu.
        setDados((atual) => atual ?? salvo.dados);
        setAtualizadoEm((atual) => atual ?? salvo.atualizadoEm);
      });
      recarregar().catch(() => {});
      return () => {
        ativo = false;
      };
    }, [chave, recarregar])
  );

  const substituir = useCallback(
    (novos: T) => {
      setDados(novos);
      setDoCache(false);
      if (chave) gravarCache(chave, novos).then(setAtualizadoEm);
    },
    [chave]
  );

  return { dados, carregando, erro, atualizadoEm, doCache, recarregar, substituir };
}
