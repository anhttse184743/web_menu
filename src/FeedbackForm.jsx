import React, { useState } from 'react';
import { Star, Check, Loader2 } from 'lucide-react';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const API_BASE = import.meta.env.VITE_API_GATEWAY ? `${import.meta.env.VITE_API_GATEWAY}/api` : "/api";

export default function FeedbackForm({ orderId, tableId, onSubmitSuccess }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 700));
      } else {
        const res = await fetch(`${API_BASE}/feedbacks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: parseInt(orderId),
            tableId: parseInt(tableId),
            rating,
            comment,
          }),
        });
        if (!res.ok) throw new Error("Gửi đánh giá thất bại");
      }
      setSubmitted(true);
      if (onSubmitSuccess) {
        setTimeout(() => onSubmitSuccess(), 2000);
      }
    } catch (err) {
      console.error(err);
      alert("Có lỗi xảy ra, vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-white rounded-[20px] p-6 text-center border border-line shadow-sm">
        <div className="w-[50px] h-[50px] bg-[#E8F5E9] rounded-full flex items-center justify-center mx-auto mb-4 text-[#2E7D32]">
          <Check size={24} strokeWidth={3} />
        </div>
        <h3 className="text-[18px] font-bold text-brown-900 mb-2">Cảm ơn bạn!</h3>
        <p className="text-[14px] text-muted">Đánh giá của bạn đã được ghi nhận.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[20px] p-5 sm:p-6 border border-line shadow-sm mt-4">
      <h3 className="text-[18px] font-bold text-brown-900 mb-2 text-center">Đánh giá bữa ăn</h3>
      <p className="text-[14px] text-muted text-center mb-5">Bạn cảm thấy món ăn và dịch vụ như thế nào?</p>
      
      <div className="flex justify-center gap-2 mb-6">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => setRating(star)}
            className="p-1 transition-transform hover:scale-110"
          >
            <Star 
              size={32} 
              fill={star <= rating ? "#EAB308" : "transparent"} 
              color={star <= rating ? "#EAB308" : "#D1D5DB"} 
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>

      <textarea
        className="w-full bg-tint rounded-[14px] p-4 text-[14.5px] text-brown-900 placeholder:text-muted outline-none border border-transparent focus:border-accent resize-none min-h-[100px] mb-4"
        placeholder="Chia sẻ thêm cảm nhận của bạn (không bắt buộc)..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-accent text-white font-semibold text-[15.5px] rounded-[14px] h-[48px] flex items-center justify-center cursor-pointer transition-all active:scale-[0.98] disabled:opacity-70"
      >
        {loading ? <Loader2 className="animate-spin" size={20} /> : "Gửi đánh giá"}
      </button>
    </div>
  );
}