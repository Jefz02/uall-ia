import { useState, useCallback, useEffect } from "react";
import { socket } from "@/lib/socket";
import { toast } from "@/components/ui/sonner";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Oi! Aqui é o assistente da **U-all Solutions** 🚀\n\nPosso te ajudar a entender nossa plataforma de Wi-Fi Marketing e te conectar com o time certo. Pra começar: vocês são um provedor/ISP, um estabelecimento ou um integrador/parceiro?",
  timestamp: new Date(),
};

const SESSION_ID = `web_${crypto.randomUUID()}`;

function getOrCreateSessionId(): string {
  return SESSION_ID;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const sessionId = getOrCreateSessionId();

    // Register in the server room so webhook events reach this client
    function joinRoom() {
      socket.emit("join", { sessionId });
    }

    function onTyping({ isTyping }: { isTyping: boolean }) {
      setIsTyping(isTyping);
    }

    function onReceiveMessage({ response }: { response: string }) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response,
          timestamp: new Date(),
        },
      ]);
    }

    function onError({ message }: { message: string }) {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: message,
          timestamp: new Date(),
        },
      ]);
    }

    function onToast({
      type,
      message,
    }: {
      type: "lead" | "escalation";
      message: string;
    }) {
      if (type === "escalation") {
        toast.error(message, { duration: 6000 });
      } else {
        toast.success(message, { duration: 8000 });
      }
    }

    // Join immediately if already connected, and on every future reconnect
    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);

    socket.on("typing", onTyping);
    socket.on("receive_message", onReceiveMessage);
    socket.on("error", onError);
    socket.on("toast", onToast);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("typing", onTyping);
      socket.off("receive_message", onReceiveMessage);
      socket.off("error", onError);
      socket.off("toast", onToast);
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);

    socket.emit("send_message", {
      sessionId: getOrCreateSessionId(),
      message: content,
    });
  }, []);

  return { messages, isTyping, sendMessage };
}
