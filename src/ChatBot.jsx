import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot } from "lucide-react";
import { fetchWithRetry } from "./lib/fetchWithRetry";

const API_BASE = import.meta.env.VITE_API_GATEWAY ? `${import.meta.env.VITE_API_GATEWAY}/api` : "/api";

const GREETING = "Xin chào! Mình là AI Sommelier của quán 🍵 Bạn muốn mình tư vấn món ăn hay thức uống gì không?";

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [retryMessage, setRetryMessage] = useState("");
  const scrollRef = useRef(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setRetryMessage("");
    try {
      const res = await fetchWithRetry(`${API_BASE}/ai/customer-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      }, () => setRetryMessage("Trợ lý đang khởi động, chờ mình chút nhé…"));
      if (!res.ok) throw new Error("customer-chat failed");
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "Xin lỗi, mình chưa có câu trả lời cho việc này." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Mình đang gặp sự cố kết nối, bạn thử lại sau nhé." }]);
    } finally {
      setSending(false);
      setRetryMessage("");
      sendingRef.current = false;
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      <div className="fixed bottom-[90px] left-1/2 -translate-x-1/2 w-[calc(100%-36px)] max-w-[444px] z-[46] flex justify-end pointer-events-none">
        <button
          onClick={() => setOpen(true)}
          aria-label="Mở trợ lý AI"
          className="pointer-events-auto w-[52px] h-[52px] rounded-full bg-brown-900 text-tint shadow-[0_10px_24px_rgba(58,42,30,0.34)] flex items-center justify-center active:scale-95 transition-transform"
        >
          <MessageCircle size={24} />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-[rgba(44,32,24,0.5)] flex items-end justify-center animate-fade"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[480px] h-[78vh] bg-cream rounded-t-[24px] flex flex-col overflow-hidden animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-line bg-white shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-[34px] h-[34px] rounded-full bg-brown-900 text-tint flex items-center justify-center shrink-0">
                  <Bot size={18} />
                </div>
                <div>
                  <p className="font-lora font-semibold text-brown-900 text-[15px] leading-tight">AI Sommelier</p>
                  <p className="text-[12px] text-muted leading-tight">Tư vấn món ăn &amp; thức uống</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Đóng" className="text-brown-700">
                <X size={20} />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-[18px] py-[14px] flex flex-col gap-[10px]">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[80%] px-[14px] py-[10px] rounded-[16px] text-[14px] leading-[1.45] ${
                    m.role === "user"
                      ? "self-end bg-brown-900 text-tint rounded-br-[4px]"
                      : "self-start bg-white border border-line text-brown-800 rounded-bl-[4px]"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {sending && (
                <div className="self-start bg-white border border-line text-muted px-[14px] py-[10px] rounded-[16px] rounded-bl-[4px] text-[13px]">
                  {retryMessage || "Đang trả lời…"}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 px-[14px] py-[12px] border-t border-line bg-white shrink-0">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Nhập câu hỏi của bạn…"
                className="flex-1 bg-tint rounded-[14px] px-[14px] py-[10px] text-[14px] outline-none"
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                aria-label="Gửi"
                className="w-[40px] h-[40px] rounded-full bg-brown-900 text-tint flex items-center justify-center disabled:opacity-40 shrink-0"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
