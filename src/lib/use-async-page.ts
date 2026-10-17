import { useEffect, useState, useCallback, useRef } from "react";

export function useAsyncPage<T>(
  loader: () => Promise<T>,
  deps: unknown[] = []
): {
  data: T | null;
  loading: boolean;
  erro: Error | null;
  recarregar: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<Error | null>(null);
  const ativoRef = useRef(true);

  const executar = useCallback(async (mostrarLoading = false) => {
    if (mostrarLoading) setLoading(true);
    setErro(null);
    try {
      const res = await loader();
      if (ativoRef.current) {
        setData(res);
        setLoading(false);
      }
    } catch (e) {
      if (ativoRef.current) {
        console.error("[useAsyncPage]", e);
        setErro(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    ativoRef.current = true;
    executar(true);

    const aoAtualizar = () => {
      executar(false);
    };

    window.addEventListener("oliveira:refresh", aoAtualizar);
    window.addEventListener("oliveira:empresa", aoAtualizar);

    return () => {
      ativoRef.current = false;
      window.removeEventListener("oliveira:refresh", aoAtualizar);
      window.removeEventListener("oliveira:empresa", aoAtualizar);
    };
  }, [executar]);

  return { data, loading, erro, recarregar: () => executar(true) };
}
