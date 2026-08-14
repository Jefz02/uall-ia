import { useState, useRef, useEffect } from "react";
import {
  Wifi, WifiOff, Loader2, Phone, LogOut,
  Lock, LockOpen, MessageSquare, Send, Users, Target,
  Plus, Pencil, Trash2, Check, X,
} from "lucide-react";

const BRAND_NAME = import.meta.env.VITE_BRAND_NAME as string ?? "";
import QRCode from "react-qr-code";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { useAdminAuth, AdminAuthProvider } from "@/hooks/useAdminAuth";
import { useConnections } from "@/hooks/useConnections";
import {
  createWAConnection,
  updateWAConnectionLabel,
  deleteWAConnection,
  connectWAConnection,
  disconnectWAConnection,
  fetchContacts,
  fetchMessages,
  sendAdminMessage,
  unlockConversation,
  lockConversation,
  fetchLeads,
  updateLeadStatus,
  type WAConnection,
  type Contact,
  type ChatMessage,
  type Lead,
} from "@/lib/adminApi";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  disconnected: { label: "Desconectado",       color: "#ef4444", Icon: WifiOff,  spin: false },
  connecting:   { label: "Conectando…",        color: "#f59e0b", Icon: Loader2,  spin: true  },
  qr:           { label: "Aguardando QR Code", color: "#f59e0b", Icon: Wifi,     spin: false },
  connected:    { label: "Conectado",          color: "#22c55e", Icon: Wifi,     spin: false },
} as const;

// ─── Connection Card ──────────────────────────────────────────────────────────

function ConnectionCard({
  conn,
  onUnauthorized,
  onDeleted,
}: {
  conn: WAConnection;
  onUnauthorized: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(conn.label);
  const [actionLoading, setActionLoading] = useState(false);

  const { label: statusLabel, color, Icon, spin } = STATUS_CONFIG[conn.status];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "wa-connections"] });

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      await connectWAConnection(conn.id);
      invalidate();
      toast.success(`Iniciando conexão "${conn.label}"…`);
    } catch (err) {
      if ((err as Error).message === "UNAUTHORIZED") onUnauthorized();
      else toast.error((err as Error).message ?? "Erro ao conectar");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    try {
      await disconnectWAConnection(conn.id);
      invalidate();
      toast.success(`"${conn.label}" desconectado`);
    } catch (err) {
      if ((err as Error).message === "UNAUTHORIZED") onUnauthorized();
      else toast.error((err as Error).message ?? "Erro ao desconectar");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remover a conexão "${conn.label}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteWAConnection(conn.id);
      invalidate();
      onDeleted();
      toast.success(`Conexão "${conn.label}" removida`);
    } catch (err) {
      if ((err as Error).message === "UNAUTHORIZED") onUnauthorized();
      else toast.error((err as Error).message ?? "Erro ao remover");
    }
  };

  const handleSaveLabel = async () => {
    const trimmed = labelDraft.trim();
    if (!trimmed || trimmed === conn.label) { setEditing(false); return; }
    try {
      await updateWAConnectionLabel(conn.id, trimmed);
      invalidate();
      setEditing(false);
    } catch (err) {
      if ((err as Error).message === "UNAUTHORIZED") onUnauthorized();
      else toast.error((err as Error).message ?? "Erro ao renomear");
    }
  };

  const canConnect = conn.status === "disconnected";
  const canDisconnect = conn.status !== "disconnected";

  return (
    <div
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 10,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header: label + delete */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {editing ? (
          <>
            <input
              autoFocus
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveLabel();
                if (e.key === "Escape") { setLabelDraft(conn.label); setEditing(false); }
              }}
              style={{
                flex: 1, padding: "4px 8px", borderRadius: 6, fontSize: 13,
                background: "hsl(var(--background))", color: "hsl(var(--foreground))",
                border: "1px solid hsl(var(--ring))", outline: "none", fontWeight: 700,
              }}
            />
            <button onClick={handleSaveLabel} title="Salvar" style={iconBtnStyle("#22c55e")}>
              <Check size={13} />
            </button>
            <button onClick={() => { setLabelDraft(conn.label); setEditing(false); }} title="Cancelar" style={iconBtnStyle("#6b7280")}>
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))" }}>
              {conn.label}
            </span>
            <button onClick={() => { setLabelDraft(conn.label); setEditing(true); }} title="Renomear" style={iconBtnStyle("#6b7280")}>
              <Pencil size={12} />
            </button>
            <button onClick={handleDelete} title="Remover conexão" style={iconBtnStyle("#ef4444")}>
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>

      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon
          size={13}
          style={{ color, animation: spin ? "spin 1s linear infinite" : undefined, flexShrink: 0 }}
        />
        <span style={{ fontSize: 12, color, fontWeight: 600 }}>{statusLabel}</span>
        {conn.status === "connected" && conn.phone && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            <Phone size={10} style={{ color: "#22c55e" }} />
            +{conn.phone}
          </span>
        )}
      </div>

      {/* QR Code */}
      {conn.status === "qr" && conn.qr && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", textAlign: "center", margin: 0 }}>
            Abra o WhatsApp e escaneie o QR Code
          </p>
          <div style={{ background: "#fff", padding: 10, borderRadius: 8, display: "inline-block" }}>
            <QRCode value={conn.qr} size={160} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleConnect}
          disabled={actionLoading || !canConnect}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 7, fontSize: 12, fontWeight: 700,
            background: canConnect ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.1)",
            color: canConnect ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
            border: "none", cursor: canConnect ? "pointer" : "not-allowed",
            opacity: actionLoading || !canConnect ? 0.45 : 1,
          }}
        >
          Conectar
        </button>
        <button
          onClick={handleDisconnect}
          disabled={actionLoading || !canDisconnect}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 7, fontSize: 12, fontWeight: 700,
            background: canDisconnect ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.04)",
            color: canDisconnect ? "#ef4444" : "#6b7280",
            border: `1px solid ${canDisconnect ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.1)"}`,
            cursor: canDisconnect ? "pointer" : "not-allowed",
            opacity: actionLoading || !canDisconnect ? 0.45 : 1,
          }}
        >
          Desconectar
        </button>
      </div>
    </div>
  );
}

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 24, height: 24, borderRadius: 6, flexShrink: 0,
    background: "transparent", border: "none", cursor: "pointer", color,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function contactDisplayName(c: Contact): string {
  if (c.name) return c.name;
  if (c.phone) return `+${c.phone}`;
  return `#${c.session_id.slice(-6)}`;
}

function contactInitial(c: Contact): string {
  return contactDisplayName(c)[0].toUpperCase();
}

function isWA(c: Contact): boolean {
  return c.session_id.startsWith("wa_");
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const PERFIL_LABEL: Record<string, string> = {
  provedor_isp: "Provedor/ISP",
  estabelecimento: "Estabelecimento",
  integrador_parceiro: "Integrador/Parceiro",
};

const PLANO_LABEL: Record<string, string> = {
  connect: "Connect",
  marketing: "Marketing",
  experience: "Experience",
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type Tab = "whatsapp" | "conversas" | "leads";

function Sidebar({
  activeTab,
  onTabChange,
  onLogout,
}: {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  onLogout: () => void;
}) {
  const navItem = (tab: Tab, Icon: React.ElementType, label: string) => {
    const active = activeTab === tab;
    return (
      <button
        key={tab}
        onClick={() => onTabChange(tab)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 10px",
          borderRadius: 6,
          fontSize: 12,
          color: active ? "hsl(var(--sidebar-primary-foreground))" : "hsl(var(--sidebar-foreground))",
          background: active ? "hsl(var(--sidebar-primary))" : "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "hsl(var(--sidebar-accent-foreground))"; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "hsl(var(--sidebar-foreground))"; }}
      >
        <Icon size={13} />
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        width: 120,
        minWidth: 120,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid hsl(var(--border))",
        background: "hsl(var(--sidebar))",
      }}
    >
      {/* Brand */}
      <div style={{ padding: "16px 12px 12px", borderBottom: "1px solid hsl(var(--sidebar-border))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              color: "hsl(var(--sidebar-primary))",
              textTransform: "uppercase",
              letterSpacing: 1,
              fontWeight: 700,
            }}
          >
            Admin
          </span>
        </div>
        {BRAND_NAME && (
          <p style={{ fontSize: 9, color: "hsl(var(--sidebar-foreground))", fontStyle: "italic", marginTop: 3 }}>
            {BRAND_NAME}
          </p>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: "8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItem("whatsapp", Wifi, "WhatsApp")}
        {navItem("conversas", MessageSquare, "Conversas")}
        {navItem("leads", Target, "Leads")}
      </div>

      {/* Logout */}
      <div style={{ padding: "12px 8px", borderTop: "1px solid hsl(var(--sidebar-border))" }}>
        <button
          onClick={onLogout}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            width: "100%", padding: "6px 10px",
            borderRadius: 6, fontSize: 11,
            color: "hsl(var(--sidebar-foreground))", background: "transparent", border: "none",
            cursor: "pointer", transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "hsl(var(--destructive))"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "hsl(var(--sidebar-foreground))"; }}
        >
          <LogOut size={12} />
          Sair
        </button>
      </div>
    </div>
  );
}

// ─── Connections Panel ────────────────────────────────────────────────────────

function ConnectionsPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const queryClient = useQueryClient();
  const { data: connections = [], isLoading, error } = useConnections(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  if (error?.message === "UNAUTHORIZED") { onUnauthorized(); return null; }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "wa-connections"] });

  const handleCreate = async () => {
    const label = newLabel.trim() || "Nova Conexão";
    try {
      await createWAConnection(label);
      invalidate();
      setNewLabel("");
      setCreating(false);
      toast.success(`Conexão "${label}" criada`);
    } catch (err) {
      if ((err as Error).message === "UNAUTHORIZED") onUnauthorized();
      else toast.error((err as Error).message ?? "Erro ao criar conexão");
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid hsl(var(--border))",
          display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        }}
      >
        <Wifi size={13} style={{ color: "hsl(var(--muted-foreground))" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Conexões WhatsApp
        </span>
        {isLoading && (
          <Loader2 size={10} style={{ marginLeft: 4, color: "hsl(var(--muted-foreground))", animation: "spin 1s linear infinite" }} />
        )}
        <button
          onClick={() => { setCreating(true); setNewLabel(""); }}
          title="Nova conexão"
          style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
            border: "none", cursor: "pointer",
          }}
        >
          <Plus size={12} />
          Nova
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Formulário de criação */}
        {creating && (
          <div
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--primary) / 0.4)",
              borderRadius: 10, padding: "12px 14px",
              display: "flex", flexDirection: "column", gap: 8,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Nova Conexão
            </span>
            <input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setCreating(false);
              }}
              placeholder="Nome da conexão (ex: Comercial SP)"
              style={{
                padding: "7px 10px", borderRadius: 6, fontSize: 12,
                background: "hsl(var(--background))", color: "hsl(var(--foreground))",
                border: "1px solid hsl(var(--border))", outline: "none",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "hsl(var(--ring))"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "hsl(var(--border))"; }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleCreate}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
                  border: "none", cursor: "pointer",
                }}
              >
                Criar
              </button>
              <button
                onClick={() => setCreating(false)}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))",
                  border: "none", cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista de conexões */}
        {!isLoading && connections.length === 0 && !creating && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "hsl(var(--muted-foreground))", padding: 40 }}>
            <Wifi size={32} style={{ opacity: 0.2 }} />
            <p style={{ fontSize: 12, textAlign: "center", margin: 0 }}>
              Nenhuma conexão configurada.
              <br />
              Clique em <strong>Nova</strong> para adicionar um número.
            </p>
          </div>
        )}

        {(connections as WAConnection[]).map((conn) => (
          <ConnectionCard
            key={conn.id}
            conn={conn}
            onUnauthorized={onUnauthorized}
            onDeleted={invalidate}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Contacts List ────────────────────────────────────────────────────────────

function ContactsList({
  selected,
  onSelect,
  onUnauthorized,
}: {
  selected: Contact | null;
  onSelect: (c: Contact) => void;
  onUnauthorized: () => void;
}) {
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["admin", "contacts"],
    queryFn: fetchContacts,
    refetchInterval: 8000,
    retry: (count, err) => (err as Error).message !== "UNAUTHORIZED" && count < 2,
  });

  return (
    <div
      style={{
        width: 200,
        minWidth: 200,
        borderRight: "1px solid hsl(var(--border))",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid hsl(var(--border))",
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <Users size={13} style={{ color: "hsl(var(--muted-foreground))" }} />
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Contatos
        </span>
        {isLoading && <Loader2 size={10} style={{ marginLeft: "auto", color: "hsl(var(--muted-foreground))", animation: "spin 1s linear infinite" }} />}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!isLoading && (contacts as Contact[]).length === 0 && (
          <div style={{ padding: 16, fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>
            Nenhum contato ainda
          </div>
        )}

        {(contacts as Contact[]).map((c) => {
          const isSelected = selected?.session_id === c.session_id;
          const name = contactDisplayName(c);
          const initial = contactInitial(c);
          const wa = isWA(c);

          return (
            <button
              key={c.session_id}
              onClick={() => onSelect(c)}
              style={{
                width: "100%",
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px",
                background: isSelected ? "hsl(var(--primary) / 0.12)" : "transparent",
                border: "none",
                borderLeftStyle: "solid",
                borderLeftWidth: 2,
                borderLeftColor: isSelected ? "hsl(var(--primary))" : "transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.12s",
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "hsl(var(--muted))"; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700,
                  background: wa
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted))",
                  color: "hsl(var(--foreground))",
                }}
              >
                {initial}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "hsl(var(--foreground))", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name}
                  </span>
                  {c.is_locked && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
                  )}
                </div>
                {c.phone && (
                  <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                    +{c.phone}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView({
  contact,
  onUnauthorized,
}: {
  contact: Contact | null;
  onUnauthorized: () => void;
}) {
  const queryClient = useQueryClient();
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ["admin", "messages", contact?.session_id],
    queryFn: () => fetchMessages(contact!.session_id),
    enabled: !!contact,
    refetchInterval: 3000,
    retry: (count, err) => (err as Error).message !== "UNAUTHORIZED" && count < 2,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: () => sendAdminMessage(contact!.session_id, inputText.trim()),
    onSuccess: () => {
      setInputText("");
      queryClient.invalidateQueries({ queryKey: ["admin", "messages", contact?.session_id] });
    },
    onError: (err) => {
      if ((err as Error).message === "UNAUTHORIZED") onUnauthorized();
      else toast.error((err as Error).message ?? "Erro ao enviar");
    },
  });

  const unlockMutation = useMutation({
    mutationFn: () => unlockConversation(contact!.session_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "messages", contact?.session_id] });
      toast.success("Sessão desbloqueada — agente liberado");
    },
    onError: (err) => {
      if ((err as Error).message === "UNAUTHORIZED") onUnauthorized();
      else toast.error((err as Error).message ?? "Erro ao desbloquear");
    },
  });

  const lockMutation = useMutation({
    mutationFn: () => lockConversation(contact!.session_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "contacts"] });
      toast.success("Conversa bloqueada — agente pausado");
    },
    onError: (err) => {
      if ((err as Error).message === "UNAUTHORIZED") onUnauthorized();
      else toast.error((err as Error).message ?? "Erro ao bloquear");
    },
  });

  const handleSend = () => {
    if (!inputText.trim() || sendMutation.isPending) return;
    sendMutation.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Empty state
  if (!contact) {
    return (
      <div
        style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 10,
          color: "hsl(var(--muted-foreground))",
        }}
      >
        <MessageSquare size={32} style={{ opacity: 0.3 }} />
        <p style={{ fontSize: 12 }}>
          Selecione um contato para ver o chat
        </p>
      </div>
    );
  }

  const name = contactDisplayName(contact);
  const wa = isWA(contact);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid hsl(var(--border))",
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: wa
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))", flexShrink: 0,
          }}
        >
          {contactInitial(contact)}
        </div>

        {/* Name + phone */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))", margin: 0 }}>
            {name}
          </p>
          {contact.phone && (
            <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: 0 }}>+{contact.phone}</p>
          )}
        </div>

        {/* Lock / Unlock buttons */}
        {contact.is_locked ? (
          <button
            onClick={() => unlockMutation.mutate()}
            disabled={unlockMutation.isPending}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 6, fontSize: 11,
              fontWeight: 700,
              background: "rgba(34,197,94,0.12)", color: "#22c55e",
              border: "1px solid rgba(34,197,94,0.3)", cursor: "pointer",
              opacity: unlockMutation.isPending ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <LockOpen size={11} />
            Desbloquear
          </button>
        ) : (
          <button
            onClick={() => lockMutation.mutate()}
            disabled={lockMutation.isPending}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 6, fontSize: 11,
              fontWeight: 700,
              background: "rgba(239,68,68,0.1)", color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer",
              opacity: lockMutation.isPending ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <Lock size={11} />
            Bloquear
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1, overflowY: "auto",
          padding: "12px 16px",
          display: "flex", flexDirection: "column", gap: 6,
        }}
      >
        {msgsLoading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
            <Loader2 size={16} style={{ color: "hsl(var(--muted-foreground))", animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {!msgsLoading && (messages as ChatMessage[]).length === 0 && (
          <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "center", margin: "auto 0" }}>
            Nenhuma mensagem ainda
          </p>
        )}

        {(messages as ChatMessage[]).map((msg, i) => {
          // Admin view: "user" (customer) = incoming/left, "assistant" (AI/attendant) = outgoing/right
          const isOutgoing = msg.role === "assistant";
          return (
            <div key={i} style={{ display: "flex", justifyContent: isOutgoing ? "flex-end" : "flex-start" }}>
              <div
                style={{
                  maxWidth: "72%",
                  padding: "8px 12px",
                  borderRadius: isOutgoing ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: isOutgoing ? "hsl(var(--primary))" : "hsl(var(--background))",
                  border: isOutgoing ? "none" : "1px solid hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                }}
              >
                <p style={{ fontSize: 12, margin: 0, wordBreak: "break-word", lineHeight: 1.4 }}>
                  {msg.content}
                </p>
                <p style={{ fontSize: 10, textAlign: "right", opacity: 0.55, margin: "3px 0 0" }}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — só para sessões WA */}
      {wa ? (
        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid hsl(var(--border))",
            display: "flex", gap: 8, flexShrink: 0,
          }}
        >
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem…"
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 12,
              background: "hsl(var(--background))", color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))",
              outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "hsl(var(--ring))"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "hsl(var(--border))"; }}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sendMutation.isPending}
            style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: inputText.trim()
                ? "hsl(var(--primary))"
                : "hsl(var(--primary) / 0.1)",
              border: "none", cursor: inputText.trim() ? "pointer" : "not-allowed",
              opacity: sendMutation.isPending ? 0.5 : 1,
            }}
          >
            <Send size={14} color="hsl(var(--primary-foreground))" />
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: "8px 12px",
            borderTop: "1px solid hsl(var(--border))",
            flexShrink: 0,
          }}
        >
          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", textAlign: "center", margin: 0 }}>
            Sessão web — envio de mensagem não disponível
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Conversas Panel ──────────────────────────────────────────────────────────

function ConversasPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["admin", "contacts"],
    queryFn: fetchContacts,
    refetchInterval: 8000,
    retry: (count, err) => (err as Error).message !== "UNAUTHORIZED" && count < 2,
  });

  // Deriva o contato do cache — atualiza automaticamente após lock/unlock/refetch
  const selectedContact = (contacts as Contact[]).find(c => c.session_id === selectedId) ?? null;

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <ContactsList
        selected={selectedContact}
        onSelect={(c) => setSelectedId(c.session_id)}
        onUnauthorized={onUnauthorized}
      />
      <ChatView contact={selectedContact} onUnauthorized={onUnauthorized} />
    </div>
  );
}

// ─── Leads Panel ──────────────────────────────────────────────────────────────

const LEAD_STATUS: { id: string; label: string; color: string }[] = [
  { id: "qualificado", label: "Qualificado", color: "#60a5fa" },
  { id: "contatado",   label: "Contatado",   color: "#fbbf24" },
  { id: "ganho",       label: "Ganho",       color: "#4ade80" },
  { id: "perdido",     label: "Perdido",     color: "#ef4444" },
];

function statusColor(status: string): string {
  return LEAD_STATUS.find((s) => s.id === status)?.color ?? "hsl(var(--muted-foreground))";
}

function LeadsPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading, refetch } = useQuery({
    queryKey: ["admin", "leads"],
    queryFn: fetchLeads,
    refetchInterval: 15000,
    retry: (count, err) => (err as Error).message !== "UNAUTHORIZED" && count < 2,
    meta: { onError: (err: Error) => { if (err.message === "UNAUTHORIZED") onUnauthorized(); } },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateLeadStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "leads"] }),
    onError: (err) => {
      if ((err as Error).message === "UNAUTHORIZED") onUnauthorized();
      else toast.error("Erro ao atualizar status do lead");
    },
  });

  const all = leads as Lead[];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <Target size={15} style={{ color: "hsl(var(--muted-foreground))" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Leads
        </span>
        {!isLoading && (
          <span style={{ fontSize: 10, background: "hsl(var(--primary) / 0.18)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary) / 0.4)", borderRadius: 10, padding: "1px 7px" }}>
            {all.length} registrados
          </span>
        )}
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))", cursor: "pointer", flexShrink: 0 }}
        >
          <Loader2 size={12} style={{ animation: isLoading ? "spin 1s linear infinite" : "none" }} />
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <Loader2 size={22} style={{ color: "hsl(var(--muted-foreground))", animation: "spin 1s linear infinite" }} />
          </div>
        ) : all.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "hsl(var(--muted-foreground))" }}>
            <Target size={32} style={{ opacity: 0.2 }} />
            <p style={{ fontSize: 12 }}>Nenhum lead registrado ainda</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "hsl(var(--muted-foreground))", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                <th style={{ padding: "6px 10px" }}>Nome / Empresa</th>
                <th style={{ padding: "6px 10px" }}>Perfil</th>
                <th style={{ padding: "6px 10px" }}>Segmento</th>
                <th style={{ padding: "6px 10px" }}>Dor principal</th>
                <th style={{ padding: "6px 10px" }}>Plano</th>
                <th style={{ padding: "6px 10px" }}>Contato</th>
                <th style={{ padding: "6px 10px" }}>Recebido</th>
                <th style={{ padding: "6px 10px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {all.map((lead) => (
                <tr key={lead.id} style={{ borderTop: "1px solid hsl(var(--border))" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: "hsl(var(--foreground))" }}>
                    {lead.nome}
                    {lead.empresa && (
                      <div style={{ fontWeight: 400, fontSize: 10, color: "hsl(var(--muted-foreground))" }}>{lead.empresa}</div>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", color: "hsl(var(--muted-foreground))" }}>
                    {PERFIL_LABEL[lead.perfil] ?? lead.perfil}
                  </td>
                  <td style={{ padding: "8px 10px", color: "hsl(var(--muted-foreground))" }}>{lead.segmento ?? "—"}</td>
                  <td style={{ padding: "8px 10px", color: "hsl(var(--muted-foreground))", maxWidth: 200 }}>{lead.dor_principal ?? "—"}</td>
                  <td style={{ padding: "8px 10px", color: "hsl(var(--muted-foreground))" }}>
                    {lead.plano_interesse ? (PLANO_LABEL[lead.plano_interesse] ?? lead.plano_interesse) : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", color: "hsl(var(--muted-foreground))" }}>
                    {lead.email && <div>{lead.email}</div>}
                    {lead.telefone && <div>+{lead.telefone}</div>}
                    {!lead.email && !lead.telefone && "—"}
                  </td>
                  <td style={{ padding: "8px 10px", color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>
                    {formatDateTime(lead.created_at)}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <select
                      value={lead.status}
                      onChange={(e) => statusMutation.mutate({ id: lead.id, status: e.target.value })}
                      disabled={statusMutation.isPending}
                      style={{
                        padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: `${statusColor(lead.status)}18`,
                        color: statusColor(lead.status),
                        border: `1px solid ${statusColor(lead.status)}44`,
                        cursor: "pointer",
                      }}
                    >
                      {LEAD_STATUS.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────

function AdminPanel() {
  const { logout } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<Tab>("whatsapp");

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100dvh",
        background: "hsl(var(--background))",
        overflow: "hidden",
      }}
    >
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onLogout={logout} />

      {activeTab === "whatsapp" && <ConnectionsPanel onUnauthorized={logout} />}
      {activeTab === "conversas" && <ConversasPanel onUnauthorized={logout} />}
      {activeTab === "leads" && <LeadsPanel onUnauthorized={logout} />}
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function AdminLogin() {
  const [password, setPassword] = useState("");
  const { login, error, isLoading } = useAdminAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password) login(password);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div
        className="w-full max-w-sm rounded-lg p-6 space-y-6"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="text-center">
            {BRAND_NAME && (
              <h1 className="font-sans text-sm font-bold uppercase tracking-widest text-primary">{BRAND_NAME}</h1>
            )}
            <p className="text-xs italic mt-0.5 text-muted-foreground">Painel de Administração</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="Senha de acesso"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full rounded-md px-3 py-2.5 text-sm focus:outline-none"
            style={{
              background: "hsl(var(--background))", color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "hsl(var(--ring))"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "hsl(var(--border))"; }}
          />
          {error && <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}
          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full flex items-center justify-center rounded-md py-2.5 text-sm font-bold transition-all disabled:opacity-40 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
            }}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Page entry ───────────────────────────────────────────────────────────────

const AdminPageInner = () => {
  const { isAuthenticated } = useAdminAuth();
  return isAuthenticated ? <AdminPanel /> : <AdminLogin />;
};

const AdminPage = () => (
  <AdminAuthProvider>
    <AdminPageInner />
  </AdminAuthProvider>
);

export default AdminPage;
