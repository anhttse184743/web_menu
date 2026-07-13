import { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';

export default function FoodDetailModal({ item, onClose, initialQty = 0, initialNote = "", onSave }) {
  const [qty, setQty] = useState(initialQty);
  const [note, setNote] = useState(initialNote);
  const [coverBroken, setCoverBroken] = useState(false);

  if (!item) return null;

  const handleAdd = () => setQty(q => q + 1);
  const handleRemove = () => setQty(q => Math.max(0, q - 1));

  return (
    <div className="fixed inset-0 z-[70] bg-[rgba(44,32,24,0.6)] flex flex-col items-center justify-end sm:justify-center animate-fade" onClick={onClose}>
      <div 
        className="w-full sm:w-[480px] bg-white rounded-t-[24px] sm:rounded-[24px] h-[92vh] sm:h-[85vh] flex flex-col relative overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        {/* Top actions */}
        <div className="absolute top-4 left-4 right-4 flex justify-start z-10 pointer-events-none">
          <button
            className="bg-white p-[10px] rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.1)] pointer-events-auto cursor-pointer hover:bg-tint"
            onClick={onClose}
          >
            <X size={20} className="text-brown-900" strokeWidth={2.5} />
          </button>
        </div>

        {/* Info content */}
        <div className="flex-1 overflow-y-auto pb-[100px]">
          {/* Cover image */}
          <div className="h-[280px] sm:h-[320px] bg-white relative flex items-center justify-center p-6 border-b border-line">
            <img
              src={item.imageUrl && !coverBroken ? item.imageUrl : `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=random`}
              alt={item.name}
              className="w-full h-full object-contain rounded-full drop-shadow-xl"
              onError={() => setCoverBroken(true)}
            />
          </div>

          <div className="px-5 pt-5 pb-6">
            <div className="flex justify-between items-start gap-4 mb-1">
              <h2 className="text-[22px] font-bold text-brown-900 leading-tight">
                {item.name}
              </h2>
              <div className="text-[20px] font-lora font-bold text-brown-900 shrink-0">
                {item.price.toLocaleString("vi-VN")}
              </div>
            </div>
            
            {/* Category / desc */}
            <p className="text-[14px] text-muted mb-6">
              {item.desc || item.description || "Chưa có mô tả cho món ăn này."}
            </p>

            {/* Note section */}
            <div className="border-t border-line pt-5">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-[17px] font-semibold text-brown-900">Thêm lưu ý cho quán</h3>
                <span className="text-[12px] bg-tint text-brown-700 px-2 py-1 rounded-full font-medium">Không bắt buộc</span>
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Việc thực hiện yêu cầu còn tùy thuộc vào khả năng của quán."
                className="w-full border border-line rounded-[14px] p-4 text-[14px] text-brown-900 placeholder:text-muted outline-none focus:border-accent resize-none min-h-[90px]"
              />
            </div>
            
            {/* Quantity selector */}
            <div className="flex items-center justify-center gap-6 mt-8 mb-4">
              <button
                className={`w-[38px] h-[38px] rounded-full flex items-center justify-center text-brown-900 cursor-pointer active:scale-95 transition-transform ${qty === 0 ? 'bg-tint opacity-50 cursor-not-allowed' : 'bg-tint-2 hover:bg-[#e0d6cd]'}`}
                onClick={handleRemove}
                disabled={qty === 0}
              >
                <Minus size={20} strokeWidth={2.5} />
              </button>
              <span className="text-[20px] font-semibold text-brown-900 min-w-[30px] text-center">{qty}</span>
              <button
                className="w-[38px] h-[38px] rounded-full bg-tint-2 hover:bg-[#e0d6cd] flex items-center justify-center text-brown-900 cursor-pointer active:scale-95 transition-transform"
                onClick={handleAdd}
              >
                <Plus size={20} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom fixed footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-line shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
           <button
             className="w-full bg-brown-900 text-tint text-[16px] font-semibold py-[14px] rounded-[14px] cursor-pointer hover:bg-brown-800 active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50"
             onClick={() => onSave(qty, note)}
           >
             {qty > 0 
               ? `${initialQty > 0 ? 'Cập nhật' : 'Thêm vào'} giỏ hàng - ${(item.price * qty).toLocaleString("vi-VN")}`
               : (initialQty > 0 ? 'Cập nhật giỏ hàng (Xoá món)' : 'Đóng')
             }
           </button>
        </div>
      </div>
    </div>
  );
}