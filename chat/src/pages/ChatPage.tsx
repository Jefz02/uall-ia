import { useEffect, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import ChatHeader from "@/components/chat/ChatHeader";
import ChatMessage from "@/components/chat/ChatMessage";
import ChatInput from "@/components/chat/ChatInput";
import ChatSuggestions from "@/components/chat/ChatSuggestions";
import TypingIndicator from "@/components/chat/TypingIndicator";

const ChatPage = () => {
  const { messages, isTyping, sendMessage } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const showSuggestions = messages.length <= 1;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-0 md:p-6">
      <div
        className="relative flex h-dvh w-full flex-col overflow-hidden md:h-[700px] md:max-w-md md:rounded-lg"
        style={{
          border: "1px solid hsl(var(--border))",
        }}
      >
        <ChatHeader />

        <div className="relative z-0 flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {showSuggestions && <ChatSuggestions onSelect={sendMessage} />}

        <ChatInput onSend={sendMessage} disabled={isTyping} />
      </div>
    </div>
  );
};

export default ChatPage;
