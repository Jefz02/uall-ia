import { useState, useCallback, createContext, useContext, ReactNode, createElement } from "react";
import { adminLogin } from "@/lib/adminApi";

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !!sessionStorage.getItem("admin_token")
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = useCallback(async (password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { token } = await adminLogin(password);
      sessionStorage.setItem("admin_token", token);
      setIsAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem("admin_token");
    setIsAuthenticated(false);
    setError(null);
  }, []);

  return createElement(AuthContext.Provider, {
    value: { isAuthenticated, isLoading, error, login, logout },
    children,
  });
}

export function useAdminAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return ctx;
}
