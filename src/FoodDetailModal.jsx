import { useState, useEffect } from 'react';
import { X, Star, Plus, Minus, ShoppingBag } from 'lucide-react';
import { fetchWithRetry } from './lib/fetchWithRetry';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const API_BASE = import.meta.env.VITE_API_GATEWAY ? `${import.meta.env.VITE_API_GATEWAY}/api` : "/api";

const MOCK_FEEDBACKS = [
  { rating: 5, tableId: 3, createdAt: "2025-06-20T10:00:00Z", comment: "Cà phê rất đậm, croissant giòn thơm. Sẽ quay lại!" },
  { rating: 4, tableId: 1, createdAt: "2025-06-21T14:30:00Z", comment: "Không gian yên tĩnh, phục vụ nhanh. Tiramisu ngon lắm." },
  { rating: 5, tableId: 7, createdAt: "2025-06-22T09:15:00Z", comment: "Bạc xỉu béo vừa phải, nhân viên dễ thương ✨" },
  { rating: 3, tableId: 2, createdAt: "2025-06-22T16:45:00Z", comment: "Đồ uống ổn nhưng hơi lâu." },
];

export default function FoodDetailModal({ item, onClose, qty = 0, onAdd, onRemove }) {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);

  useEffect(() => {
    if (!item) return;
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
  }, [item]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-[rgba(44,32,24,0.6)] flex items-end sm:items-center justify-center animate-fade" onClick={onClose}>
      <div 
        className="w-full sm:w-[480px] bg-white rounded-t-[24px] sm:rounded-[24px] h-[85vh] sm:h-[80vh] flex flex-col relative overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        {/* Cover image */}
        <div className="h-[250px] bg-tint-2 relative shrink-0">
          <img
            src={item.imageUrl && !coverBroken ? item.imageUrl : `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=random`}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={() => setCoverBroken(true)}
          />
          <button 
            className="absolute top-4 right-4 bg-white/80 p-2 rounded-full cursor-pointer hover:bg-white"
            onClick={onClose}
          >
            <X size={20} className="text-brown-900" />
          </button>
        </div>

        {/* Info content */}
        <div className="flex-1 overflow-y-auto p-5 pb-4">
          <h2 className="text-[24px] font-bold text-brown-900 mb-2">{item.name}</h2>
          <div className="text-[20px] font-lora font-bold text-accent mb-4">
            {item.price.toLocaleString("vi-VN")}đ
          </div>
          <p className="text-[15px] text-brown-600 leading-[1.6] mb-8">
            {item.desc || item.description || "Chưa có mô tả cho món ăn này."}
          </p>

          {/* Feedback section */}
          <div className="pt-6 border-t border-line">
            <h3 className="text-[18px] font-semibold text-brown-900 mb-4">Đánh giá nổi bật</h3>

            {loading ? (
              <p className="text-center text-muted py-4">Đang tải đánh giá...</p>
            ) : error ? (
              <p className="text-[14px] text-red-500 text-center py-4 bg-tint rounded-[16px]">
                Không tải được đánh giá. Vui lòng thử lại sau.
              </p>
            ) : feedbacks.length > 0 ? (
              <div className="space-y-4">
                {feedbacks.map((fb, idx) => (
                  <div key={idx} className="bg-tint rounded-[16px] p-4">
                    <div className="flex items-center gap-1 mb-2">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          size={14}
                          fill={star <= fb.rating ? "#EAB308" : "transparent"}
                          color={star <= fb.rating ? "#EAB308" : "#ccc"}
                        />
                      ))}
                      <span className="text-[12px] text-muted ml-2">
                        Bàn {fb.tableId} • {new Date(fb.createdAt).toLocaleDateString("vi-VN")}
                      </span>
                    </div>
                    <p className="text-[14px] text-brown-800">
                      {fb.comment || "Không có nội dung đánh giá."}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-muted text-center py-4 bg-tint rounded-[16px]">
                Chưa có đánh giá nào.
              </p>
            )}
          </div>
        </div>

        {/* Footer: add to cart */}
        <div className="px-5 py-4 bg-white border-t border-line flex items-center justify-between gap-3">
          <span className="font-lora text-[22px] font-bold text-brown-900">
            {item.price.toLocaleString("vi-VN")}đ
          </span>
          {qty === 0 ? (
            <button
              className="flex items-center gap-2 bg-brown-900 text-tint text-[15px] font-semibold px-5 py-3 rounded-[14px] hover:bg-brown-700 active:scale-[0.97] transition-all cursor-pointer"
              onClick={onAdd}
            >
              <ShoppingBag size={18} strokeWidth={2.2} /> Thêm vào giỏ
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-brown-900 rounded-[14px] p-[5px]">
              <button
                className="w-9 h-9 rounded-[10px] grid place-items-center text-tint hover:bg-white/14 transition-colors cursor-pointer"
                onClick={onRemove}
                aria-label="Bớt"
              >
                <Minus size={17} strokeWidth={2.6} />
              </button>
              <span className="min-w-[28px] text-center font-semibold text-[15px] text-tint">{qty}</span>
              <button
                className="w-9 h-9 rounded-[10px] grid place-items-center text-tint hover:bg-white/14 transition-colors cursor-pointer"
                onClick={onAdd}
                aria-label="Thêm"
              >
                <Plus size={17} strokeWidth={2.6} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}