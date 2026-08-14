import { useQuery } from "@tanstack/react-query";
import { fetchConnections, type WAConnection } from "@/lib/adminApi";

const POLL_ACTIVE_MS = 2500;
const POLL_IDLE_MS = 10_000;

/** Retorna a lista de todas as conexões WhatsApp com polling adaptativo. */
export function useConnections(enabled: boolean) {
  return useQuery<WAConnection[], Error>({
    queryKey: ["admin", "wa-connections"],
    queryFn: fetchConnections,
    enabled,
    refetchInterval: (query) => {
      const connections = query.state.data ?? [];
      // Faz polling rápido enquanto alguma conexão estiver em transição
      const hasActive = connections.some(
        (c) => c.status === "connecting" || c.status === "qr"
      );
      return hasActive ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    },
    retry: (failureCount, error) => {
      if (error.message === "UNAUTHORIZED") return false;
      return failureCount < 2;
    },
  });
}
