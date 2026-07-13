import { useState, useEffect } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import { fetchWithRetry } from './lib/fetchWithRetry';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const API_BASE = import.meta.env.VITE_API_GATEWAY ? `${import.meta.env.VITE_API_GATEWAY}/api` : "/api";

const MOCK_FEEDBACKS = [
  { rating: 5, tableId: 3, createdAt: "2025-06-20T10:00:00Z", comment: "Cà phê rất đậm, croissant giòn thơm. Sẽ quay lại!" },
  { rating: 4, tableId: 1, createdAt: "2025-06-21T14:30:00Z", comment: "Không gian yên tĩnh, phục vụ nhanh. Tiramisu ngon lắm." },
  { rating: 5, tableId: 7, createdAt: "2025-06-22T09:15:00Z", comment: "Bạc xỉu béo vừa phải, nhân viên dễ thương ✨" },
  { rating: 3, tableId: 2, createdAt: "2025-06-22T16:45:00Z", comment: "Đồ uống ổn nhưng hơi lâu." },
];

export default function FeedbackList() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (USE_MOCK) {
      setTimeout(() => { setFeedbacks(MOCK_FEEDBACKS); setLoading(false); }, 300);
      return;
    }
    fetchWithRetry(`${API_BASE}/feedbacks/active`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to load feedbacks");
        return res.json();
      })
      .then(data => {
        setFeedbacks(data?.slice(0, 10) || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load feedbacks", err);
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <section className="px-[18px] py-[30px] border-t border-line bg-cream">
        <h2 className="font-lora text-[21px] font-semibold text-brown-900 mb-4">Khách hàng nói gì về Tiệm Mộc</h2>
        <p className="text-center text-muted py-4 text-[14.5px]">Đang tải đánh giá...</p>
      </section>
    );
  }

  if (error || feedbacks.length === 0) {
    // If error or no feedbacks, don't show the section to keep it clean, or show a fallback.
    // We will just return null if no feedbacks to avoid cluttering the UI.
    if (feedbacks.length === 0 && !error) return null;
    
    return (
      <section className="px-[18px] py-[30px] border-t border-line bg-cream">
        <h2 className="font-lora text-[21px] font-semibold text-brown-900 mb-4">Khách hàng nói gì về Tiệm Mộc</h2>
        <p className="text-[14px] text-red-500 text-center py-4 bg-tint rounded-[16px]">
          Không tải được đánh giá.
        </p>
      </section>
    );
  }

  return (
    <section className="px-[18px] py-[30px] border-t border-line bg-cream">
      <h2 className="font-lora text-[21px] font-semibold text-brown-900 mb-[16px] flex items-center gap-2">
        <MessageSquare size={20} className="text-brown-700" />
        Khách hàng nói gì về Tiệm Mộc
      </h2>
      <div className="flex overflow-x-auto gap-[12px] pb-4 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-[18px] px-[18px]">
        {feedbacks.map((fb, idx) => (
          <div key={idx} className="snap-start shrink-0 w-[280px] bg-white border border-line rounded-[18px] p-[16px] shadow-[0_4px_12px_rgba(58,42,30,0.03)]">
            <div className="flex items-center gap-[4px] mb-[10px]">
              {[1, 2, 3, 4, 5].map(star => (
                <Star
                  key={star}
                  size={14}
                  fill={star <= fb.rating ? "#EAB308" : "transparent"}
                  color={star <= fb.rating ? "#EAB308" : "#ccc"}
                  strokeWidth={2}
                />
              ))}
            </div>
            <p className="text-[14.5px] text-brown-800 leading-[1.5] mb-[12px] line-clamp-3 min-h-[64px]">
              "{fb.comment || "Bữa ăn tuyệt vời, phục vụ chu đáo!"}"
            </p>
            <p className="text-[12px] text-muted font-medium">
              Bàn {fb.tableId} • {new Date(fb.createdAt).toLocaleDateString("vi-VN")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
