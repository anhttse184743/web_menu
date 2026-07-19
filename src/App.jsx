import { useState, useRef, useEffect, useCallback, useMemo, useDeferredValue } from "react";
import {
  Search, Plus, Minus, ShoppingBag, X, Check, Star,
  ChevronRight, Loader2, ClipboardList, RefreshCw,
} from "lucide-react";
import FoodDetailModal from "./FoodDetailModal";
import FeedbackForm from "./FeedbackForm";
import FeedbackList from "./FeedbackList";
import ChatBot from "./ChatBot";
import { sleep, fetchWithRetry } from "./lib/fetchWithRetry";

// ── Config ────────────────────────────────────────────────────────────────────
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const API_BASE = import.meta.env.VITE_API_GATEWAY ? `${import.meta.env.VITE_API_GATEWAY}/api` : "/api";

// ── Order status ──────────────────────────────────────────────────────────────
const ORDER_STATUS = {
  1: { label: "Chờ xác nhận", dot: "bg-accent"    },
  2: { label: "Đang pha chế", dot: "bg-brown-500" },
  3: { label: "Đang phục vụ", dot: "bg-brown-700" },
  4: { label: "Hoàn thành",   dot: "bg-accent"    },
  5: { label: "Đã huỷ",       dot: "bg-muted"     },
};

// ── Mock state ────────────────────────────────────────────────────────────────
let _mockOrder = null;

// ── API layer ─────────────────────────────────────────────────────────────────

/**
 * Normalise một Order response về camelCase thống nhất.
 * C# Newtonsoft.Json mặc định trả PascalCase; System.Text.Json mặc định trả camelCase.
 * Dùng ?? để đọc cả hai — bên nào có giá trị thì dùng.
 */
function normalizeOrder(raw) {
  if (!raw) return null;
  const o = raw;
  return {
    orderId:     o.orderId     ?? o.OrderId,
    tableId:     o.tableId     ?? o.TableId,
    status:      o.status      ?? o.Status,
    statusLabel: o.statusLabel ?? o.StatusLabel ?? "",
    totalAmount: o.totalAmount ?? o.TotalAmount ?? 0,
    note:        o.note        ?? o.Note        ?? "",
    createdAt:   o.createdAt   ?? o.CreatedAt   ?? null,
    publicToken: o.publicToken ?? o.PublicToken ?? null,
    items: (o.items ?? o.Items ?? []).map((item) => ({
      orderItemId:  item.orderItemId  ?? item.OrderItemId,
      menuItemId:   item.menuItemId   ?? item.MenuItemId,
      menuItemName: item.menuItemName ?? item.MenuItemName ?? "",
      quantity:     item.quantity     ?? item.Quantity     ?? 0,
      unitPrice:    item.unitPrice    ?? item.UnitPrice    ?? 0,
      note:         item.note         ?? item.Note         ?? "",
      createdAt:    item.createdAt    ?? item.CreatedAt    ?? null,
      statusLabel:  item.statusLabel  ?? item.StatusLabel  ?? "",
    })),
  };
}

const api = {
  async getMenu(onRetry) {
    if (USE_MOCK) { await sleep(300); return null; } // null → dùng STATIC_MENU
    const res = await fetchWithRetry(`${API_BASE}/menu`, undefined, onRetry);
    if (!res.ok) throw new Error("Không tải được thực đơn");
    // returns: [{ menuItemId, name, price, category, imageUrl, isAvailable }]
    return res.json();
  },

  async getOrderByTable(tableId, onRetry) {
    if (USE_MOCK) { await sleep(200); return _mockOrder; }
    const res = await fetchWithRetry(`${API_BASE}/orders/table/${tableId}`, undefined, onRetry);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Không tải được đơn");
    const data = await res.json();
    const list = Array.isArray(data) ? data : [data];
    return list.length > 0 ? normalizeOrder(list[0]) : null;
  },

  // Endpoint nhẹ, tra theo orderId + token riêng của đơn (không lọc theo status
  // như getOrderByTable) — dùng để poll phát hiện lúc đơn chuyển Hoàn thành sau
  // khi thanh toán. token bắt buộc — không có/sai token thì BE trả 404.
  async getOrderStatus(orderId, token, onRetry) {
    if (USE_MOCK) {
      await sleep(150);
      return _mockOrder && _mockOrder.orderId === orderId
        ? { orderId, status: _mockOrder.status, statusLabel: _mockOrder.statusLabel }
        : null;
    }
    if (!token) return null;
    const res = await fetchWithRetry(`${API_BASE}/orders/${orderId}/status?token=${encodeURIComponent(token)}`, undefined, onRetry);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Không tải được trạng thái đơn");
    const o = await res.json();
    return {
      orderId:     o.orderId     ?? o.OrderId,
      status:      o.status      ?? o.Status,
      statusLabel: o.statusLabel ?? o.StatusLabel ?? "",
    };
  },

  async placeOrder(tableId, items, note, onRetry) {
    if (USE_MOCK) {
      await sleep(900);
      const id = Math.floor(Math.random() * 9000) + 1000;
      _mockOrder = {
        orderId: id, tableId: Number(tableId), status: 1, statusLabel: "Chờ xác nhận",
        note, totalAmount: items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
        items: items.map((i) => ({
          ...i,
          orderItemId: Math.random(),
          menuItemName: STATIC_MENU.find((m) => m.id === i.menuItemId)?.name ?? "",
        })),
      };
      return _mockOrder;
    }
    const res = await fetchWithRetry(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId, note, items }),
    }, onRetry);
    if (!res.ok) throw new Error("Đặt món thất bại, thử lại nhé");
    return normalizeOrder(await res.json());
  },

  async addItems(orderId, token, items, note, onRetry) {
    if (USE_MOCK) {
      await sleep(700);
      if (_mockOrder) {
        const newItems = items.map((i) => ({
          ...i,
          orderItemId: Math.random(),
          menuItemName: STATIC_MENU.find((m) => m.id === i.menuItemId)?.name ?? "",
        }));
        _mockOrder.items = [...(_mockOrder.items ?? []), ...newItems];
        _mockOrder.totalAmount = _mockOrder.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      }
      return _mockOrder;
    }
    const res = await fetchWithRetry(`${API_BASE}/orders/${orderId}/items?token=${encodeURIComponent(token ?? "")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, items }),
    }, onRetry);
    if (!res.ok) throw new Error("Gọi thêm thất bại, thử lại nhé");
    return normalizeOrder(await res.json());
  },
};

// ── Static fallback data (dùng khi USE_MOCK = true hoặc API lỗi) ──────────────
const STATIC_CATEGORIES = [
  { id: "ca-phe",    label: "Cà phê" },
  { id: "do-uong",   label: "Đồ uống khác" },
  { id: "banh-ngot", label: "Bánh ngọt" },
  { id: "banh-kem",  label: "Bánh kem" },
  { id: "combo",     label: "Combo" },
];

const STATIC_MENU = [
  { id: 1,  cat: "ca-phe",    name: "Cà phê đen đá",       desc: "Phin truyền thống, đậm đắng, đá mát lạnh",          price: 25000, emoji: "☕", popular: true },
  { id: 2,  cat: "ca-phe",    name: "Cà phê sữa đá",       desc: "Cà phê phin hoà sữa đặc, ngọt béo đậm đà",          price: 29000, emoji: "☕", popular: true },
  { id: 3,  cat: "ca-phe",    name: "Bạc xỉu",             desc: "Nhiều sữa, ít cà phê, êm dịu dễ uống",              price: 32000, emoji: "🥛" },
  { id: 4,  cat: "ca-phe",    name: "Cappuccino",           desc: "Espresso phủ lớp bọt sữa mịn, rắc bột cacao",       price: 45000, emoji: "☕" },
  { id: 5,  cat: "ca-phe",    name: "Latte nóng",           desc: "Espresso và sữa nóng, vị tròn nhẹ nhàng",           price: 45000, emoji: "🥛" },
  { id: 6,  cat: "ca-phe",    name: "Cà phê cốt dừa",      desc: "Cà phê đá xay cùng cốt dừa béo thơm",               price: 39000, emoji: "🥥" },
  { id: 7,  cat: "do-uong",   name: "Matcha latte",         desc: "Bột trà xanh Nhật đánh sữa, thanh nhẹ",             price: 49000, emoji: "🍵", popular: true },
  { id: 8,  cat: "do-uong",   name: "Cacao nóng",           desc: "Socola nguyên chất đánh nóng, ấm bụng",             price: 42000, emoji: "🍫" },
  { id: 9,  cat: "do-uong",   name: "Trà đào cam sả",      desc: "Trà đào, cam tươi, sả thơm, mát lạnh",              price: 39000, emoji: "🍑" },
  { id: 10, cat: "do-uong",   name: "Chocolate đá xay",    desc: "Socola xay đá, kem tươi phủ trên cùng",             price: 52000, emoji: "🥤" },
  { id: 11, cat: "banh-ngot", name: "Croissant bơ",         desc: "Vỏ ngàn lớp, thơm bơ, giòn rụm",                   price: 32000, emoji: "🥐", popular: true },
  { id: 12, cat: "banh-ngot", name: "Sừng bò socola",       desc: "Croissant nhân socola đậm vị",                      price: 38000, emoji: "🥐" },
  { id: 13, cat: "banh-ngot", name: "Muffin việt quất",     desc: "Bánh muffin mềm xốp, việt quất mọng",               price: 35000, emoji: "🧁" },
  { id: 14, cat: "banh-ngot", name: "Cookie socola chip",   desc: "Giòn rìa, mềm giữa, chip socola tan chảy",          price: 25000, emoji: "🍪" },
  { id: 15, cat: "banh-ngot", name: "Donut phủ đường",      desc: "Bánh vòng mềm, lớp đường ngọt nhẹ",                price: 22000, emoji: "🍩" },
  { id: 16, cat: "banh-kem",  name: "Tiramisu",             desc: "Lớp mascarpone, cà phê, rắc cacao đắng",            price: 45000, emoji: "🍰", popular: true },
  { id: 17, cat: "banh-kem",  name: "Cheesecake việt quất", desc: "Phô mai béo mịn, sốt việt quất chua ngọt",          price: 49000, emoji: "🍰" },
  { id: 18, cat: "banh-kem",  name: "Red velvet",           desc: "Cốt bánh đỏ mềm, kem phô mai mịn màng",            price: 45000, emoji: "🍰" },
  { id: 19, cat: "banh-kem",  name: "Bánh kem socola",      desc: "Cốt socola ẩm, phủ ganache đậm đà",                price: 42000, emoji: "🎂" },
  { id: 20, cat: "banh-kem",  name: "Mousse chanh dây",     desc: "Mousse mịn, chua ngọt chanh dây tươi mát",          price: 48000, emoji: "🍮" },
  { id: 21, cat: "combo",     name: "Combo Sáng",           desc: "Cà phê sữa đá + Croissant bơ · tiết kiệm 6.000đ",  price: 55000, emoji: "☕", popular: true },
  { id: 22, cat: "combo",     name: "Combo Thư giãn",       desc: "Latte nóng + Tiramisu · tiết kiệm 11.000đ",         price: 79000, emoji: "🍰" },
  { id: 23, cat: "combo",     name: "Combo Chiều",          desc: "Trà đào cam sả + Cookie socola · tiết kiệm 9.000đ", price: 55000, emoji: "🍵" },
];

/**
 * Chuyển đổi dữ liệu từ GET /api/menu sang định dạng UI.
 * API trả về: [{ menuItemId, name, price, category, imageUrl, isAvailable }]
 * UI cần:    [{ id, cat, name, desc, price, imageUrl|emoji, popular, isAvailable }]
 */
// Map enum MenuCategory (BE C# trả số) sang nhãn tiếng Việt
const CATEGORY_LABELS = {
  1: "Món ăn",
  2: "Đồ uống",
  3: "Tráng miệng",
  4: "Combo",
  5: "Khác",
};

function transformApiMenu(apiItems) {
  const seenCats = [];
  const catSet = new Set();
  apiItems.forEach((item) => {
    if (!catSet.has(item.category)) {
      catSet.add(item.category);
      seenCats.push({ id: item.category, label: CATEGORY_LABELS[item.category] ?? `Loại ${item.category}` });
    }
  });

  const menu = apiItems.map((item) => ({
    id:          item.menuItemId,
    cat:         item.category,
    name:        item.name,
    desc:        item.description ?? "",
    price:       item.price,
    imageUrl:    item.imageUrl ?? null,
    emoji:       null,          // không dùng emoji khi có imageUrl từ API
    popular:     false,         // API không có popular flag
    isAvailable: item.isAvailable,
  }));

  return { menu, categories: seenCats };
}

const formatVND = (n) => n.toLocaleString("vi-VN") + "đ";

// Khoá localStorage riêng theo bàn — tránh khách bàn khác dùng chung máy/tab bị dính đơn lạ.
// Lưu cả orderId lẫn publicToken (cần token để gọi getOrderStatus).
const orderStorageKey = (tableId) => `order:${tableId}`;
const saveOrderRef = (tableId, orderId, token) => {
  localStorage.setItem(orderStorageKey(tableId), JSON.stringify({ orderId, token }));
};
const loadOrderRef = (tableId) => {
  try {
    const raw = localStorage.getItem(orderStorageKey(tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.orderId && parsed.token ? parsed : null;
  } catch {
    return null;
  }
};

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedFood, setSelectedFood] = useState(null);
  const [cart, setCart]           = useState({});
  const [cartNotes, setCartNotes] = useState({}); // ghi chú riêng từng món: { [menuItemId]: string }
  const [cartOpen, setCartOpen]   = useState(false);
  const [query, setQuery]         = useState("");
  const [activeCat, setActiveCat] = useState(STATIC_CATEGORIES[0].id);
  const [note, setNote]           = useState("");   // ghi chú chung cho cả đơn
  const [placed, setPlaced]       = useState(false);

  const [tableId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tableId") ?? "?";
  });
  const [orderId, setOrderId]               = useState(null);
  const [orderToken, setOrderToken]         = useState(null);
  const [orderStatus, setOrderStatus]       = useState(null);
  const [currentOrder, setCurrentOrder]     = useState(null);
  const [submitting, setSubmitting]         = useState(false);
  const [submitMessage, setSubmitMessage]   = useState("");
  const [orderError, setOrderError]         = useState("");
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [statusLoading, setStatusLoading]   = useState(false);
  const [wasReorder, setWasReorder]         = useState(false);

  // Nguồn dữ liệu menu: null = chưa có, có giá trị = từ API thật.
  // STATIC_MENU chỉ dùng khi USE_MOCK=true — id của nó không khớp với
  // menuItemId thật trên backend nên tuyệt đối không dùng làm fallback
  // lúc gọi API thật, kẻo gửi nhầm món khi /menu load lỗi.
  const [apiMenu, setApiMenu]     = useState(null);
  const [apiCats, setApiCats]     = useState(null);
  const [menuError, setMenuError] = useState(false);

  // Menu và categories đang hoạt động
  const activeMenu = apiMenu ?? (USE_MOCK ? STATIC_MENU : []);
  const activeCategories = useMemo(
    () => apiCats ?? (USE_MOCK ? STATIC_CATEGORIES : []),
    [apiCats]
  );
  const menuReady = USE_MOCK || apiMenu !== null;

  // Set các id không available (dùng Set để lookup O(1))
  const unavailableIds = apiMenu
    ? new Set(apiMenu.filter((i) => i.isAvailable === false).map((i) => i.id))
    : new Set();

  const sectionRefs     = useRef({});
  const tabsRef         = useRef(null);
  const tabRefs         = useRef({});
  const isRefreshingRef = useRef(false);

  const loadMenu = useCallback(() => {
    api.getMenu().then((items) => {
      if (!items) return; // mock mode: dùng STATIC_MENU
      const { menu, categories } = transformApiMenu(items);
      setApiMenu(menu);
      setApiCats(categories);
      setMenuError(false);
      if (categories.length > 0) setActiveCat(categories[0].id);
    }).catch(() => setMenuError(true));
  }, []);

  const retryLoadMenu = () => { setMenuError(false); loadMenu(); };

  // ── On mount ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tableId !== "?") {
      const savedRef = loadOrderRef(tableId);
      if (savedRef) {
        // Đơn do chính máy này đặt trên bàn này — tra thẳng theo orderId+token
        // (không lọc theo status như getOrderByTable) để khôi phục đúng kể cả
        // khi reload trang sau khi đơn đã chuyển Hoàn thành.
        api.getOrderStatus(savedRef.orderId, savedRef.token).then((status) => {
          if (!status) return; // đơn không còn tồn tại / token sai → coi như chưa có đơn
          setOrderId(status.orderId);
          setOrderToken(savedRef.token);
          setOrderStatus(status.status);
          if (status.status < 4) {
            // đơn còn active — lấy đầy đủ items qua getOrderByTable như cũ.
            // getOrderByTable trả đơn MỚI NHẤT của cả bàn (không khoá theo
            // orderId) — chỉ nhận nếu đúng là đơn của mình, tránh hiện nhầm
            // đơn của khách khác đang active cùng bàn.
            api.getOrderByTable(tableId).then((order) => {
              if (order && order.orderId === status.orderId) setCurrentOrder(order);
            }).catch(() => {});
          } else {
            setCurrentOrder({
              orderId: status.orderId, tableId: Number(tableId),
              status: status.status, statusLabel: status.statusLabel,
              items: [], totalAmount: 0,
            });
          }
        }).catch(() => {});
      } else {
        api.getOrderByTable(tableId).then((order) => {
          // Bàn có thể đã được khách trước dùng; chỉ nhận đơn còn hoạt động
          // (status < 4 = chưa Hoàn thành/Đã huỷ), tránh "thừa kế" đơn cũ.
          if (order && order.status < 4) {
            setOrderId(order.orderId);
            setOrderToken(order.publicToken);
            setOrderStatus(order.status);
            setCurrentOrder(order);
          }
        }).catch(() => {});
      }
    }

    loadMenu();
  }, [tableId, loadMenu]);

  const add = useCallback((id) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 })), []);
  const remove = useCallback((id) =>
    setCart((c) => {
      const q = (c[id] || 0) - 1;
      const next = { ...c };
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    }), []);

  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = Object.entries(cart).reduce((sum, [id, q]) => {
    const item = activeMenu.find((m) => m.id === Number(id));
    return sum + (item ? item.price * q : 0);
  }, 0);

  // useDeferredValue: ô input luôn hiện ký tự ngay lập tức, còn việc lọc +
  // render lại cả danh sách món (tốn hơn) được React trì hoãn vài mili giây
  // để không làm giật lúc gõ nhanh.
  const deferredQuery = useDeferredValue(query);
  const filtered = deferredQuery.trim()
    ? activeMenu.filter((m) => m.name.toLowerCase().includes(deferredQuery.trim().toLowerCase()))
    : null;

  useEffect(() => {
    if (filtered) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveCat(visible[0].target.dataset.cat);
      },
      { rootMargin: "-70px 0px -62% 0px", threshold: 0 }
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
    // activeCategories cần có trong deps: các section chỉ thực sự tồn tại
    // trong DOM sau khi menu thật tải xong (trước đó activeCategories rỗng,
    // không có gì để observe) — phải chạy lại effect khi danh sách đổi.
  }, [filtered, activeCategories]);

  useEffect(() => {
    const tab = tabRefs.current[activeCat];
    if (tab) tab.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeCat]);

  const goToCat = (id) => {
    setActiveCat(id);
    const el = sectionRefs.current[id];
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 66;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  const refreshOrderStatus = useCallback(async () => {
    if (!orderId) return;
    if (isRefreshingRef.current) return; // request trước chưa xong (vd. đang retry cold-start) → bỏ qua lượt này
    isRefreshingRef.current = true;
    setStatusLoading(true);
    try {
      // Ưu tiên getOrderByTable — trả full data (items/totalAmount) trong lúc
      // đơn còn active (Status < 4), giữ sheet luôn đồng bộ nếu có người khác
      // cùng bàn gọi thêm món song song. getOrderByTable trả đơn MỚI NHẤT của cả
      // bàn (không khoá theo orderId) — nếu bàn có khách khác vừa đặt đơn mới,
      // phải bỏ qua kết quả đó (không phải đơn của mình) để tránh hiện nhầm
      // món/tổng tiền của khách khác.
      const order = await api.getOrderByTable(tableId);
      if (order && order.orderId === orderId) {
        setOrderStatus(order.status);
        setCurrentOrder(order);
        return;
      }
      // getOrderByTable trả rỗng (đơn vừa Hoàn thành nên bị lọc mất Status < 4)
      // hoặc trả đơn của khách khác cùng bàn — tra thẳng theo orderId+token của
      // chính mình để luôn đúng, không bị ảnh hưởng bởi đơn khác trên cùng bàn.
      const status = await api.getOrderStatus(orderId, orderToken);
      if (status) {
        setOrderStatus(status.status);
        setCurrentOrder((prev) => prev
          ? { ...prev, status: status.status, statusLabel: status.statusLabel }
          : prev);
      }
    } catch {
      // silently ignore
    } finally {
      setStatusLoading(false);
      isRefreshingRef.current = false;
    }
  }, [orderId, orderToken, tableId]);

  // Tự động cập nhật trạng thái đơn (khách không cần bấm refresh liên tục để
  // bắt lúc chuyển "Hoàn thành" sau thanh toán). Dừng hẳn khi đơn đã kết thúc
  // (status 4 = Hoàn thành, 5 = Đã huỷ) để không tốn request vô ích.
  useEffect(() => {
    if (!orderId || orderStatus === null || orderStatus >= 4) return;
    const interval = setInterval(() => {
      if (document.hidden) return; // tab bị ẩn → bỏ qua lượt poll này
      refreshOrderStatus();
    }, 7000);
    return () => clearInterval(interval);
  }, [orderId, orderStatus, refreshOrderStatus]);

  const placeOrder = async () => {
    if (submitting) return;
    setWasReorder(!!orderId);
    setOrderError("");
    setSubmitMessage("");
    setSubmitting(true);
    try {
      const items = Object.entries(cart).map(([id, q]) => {
        const numId = Number(id);
        const item  = activeMenu.find((m) => m.id === numId);
        return {
          menuItemId: numId,
          quantity:   q,
          unitPrice:  item.price,
          note:       cartNotes[numId] || "",
        };
      });

      // Đơn cũ đã Hoàn thành/Đã huỷ (status >= 4) không thể gọi thêm món nữa —
      // phải tạo đơn mới, dù orderId cũ vẫn còn trong state.
      const canAddToExisting = orderId && orderStatus < 4;
      const onRetry = () => setSubmitMessage("Máy chủ đang khởi động lại, vui lòng đợi trong giây lát…");
      const result = canAddToExisting
        ? await api.addItems(orderId, orderToken, items, note, onRetry)
        : await api.placeOrder(tableId, items, note, onRetry);

      setOrderId(result.orderId);
      setOrderToken(result.publicToken);
      setOrderStatus(result.status);
      setCurrentOrder(result);
      if (tableId !== "?") saveOrderRef(tableId, result.orderId, result.publicToken);
      setPlaced(true);
      setCart({});
      setCartNotes({});
      setNote("");
      setTimeout(() => { setPlaced(false); setCartOpen(false); }, 2600);
    } catch (err) {
      setOrderError(err.message);
    } finally {
      setSubmitting(false);
      setSubmitMessage("");
    }
  };

  const isReorder = !!orderId && orderStatus < 4;

  return (
    <div className="font-vietnam text-text-main bg-cream max-w-[480px] mx-auto min-h-screen relative shadow-[0_0_60px_rgba(58,42,30,0.06)]">

      {/* Header */}
      <header className="bg-white px-[18px] pt-[18px] pb-[14px] border-b border-line">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[11px] tracking-[0.13em] uppercase text-accent font-semibold mb-[3px]">
              Bánh ngọt & Cà phê · Gọi món tại bàn
            </p>
            <h1 className="font-lora text-[30px] font-bold text-brown-900 leading-none tracking-[-0.01em]">
              Tiệm Mộc
            </h1>
          </div>
          <div className="flex flex-col items-center gap-px bg-brown-900 text-tint rounded-[13px] py-[7px] px-[14px] min-w-[54px]">
            <span className="text-[10px] tracking-[0.12em] uppercase opacity-75">Bàn</span>
            <span className="font-lora text-[21px] font-bold leading-none">{tableId}</span>
          </div>
        </div>

        <div className="flex items-center gap-[9px] mt-[14px] bg-cream border border-line rounded-[13px] px-[14px] py-[11px] text-brown-500">
          <Search size={18} strokeWidth={2.2} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm bánh, cà phê…"
            aria-label="Tìm món"
            className="flex-1 bg-transparent outline-none text-[15px] text-text-main font-vietnam min-w-0 placeholder:text-muted"
          />
          {query && (
            <button
              className="grid place-items-center text-muted w-[22px] h-[22px] rounded-full bg-tint-2 shrink-0"
              onClick={() => setQuery("")}
              aria-label="Xoá tìm kiếm"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Category tabs */}
      {!filtered && menuReady && activeCategories.length > 0 && (
        <nav
          className="sticky top-0 z-20 flex gap-2 overflow-x-auto px-[18px] py-[11px] bg-cream border-b border-line shadow-[0_4px_12px_rgba(58,42,30,0.05)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          ref={tabsRef}
          aria-label="Danh mục món"
        >
          {activeCategories.map((c) => (
            <button
              key={c.id}
              ref={(el) => (tabRefs.current[c.id] = el)}
              className={`shrink-0 px-4 py-2 rounded-full text-[14px] font-semibold whitespace-nowrap border transition-all duration-200 cursor-pointer ${
                activeCat === c.id
                  ? "bg-brown-900 text-tint border-brown-900"
                  : "text-brown-700 bg-white border-line"
              }`}
              onClick={() => goToCat(c.id)}
            >
              {c.label}
            </button>
          ))}
        </nav>
      )}

      {/* Menu sections */}
      <main className="px-[18px] pt-2 pb-[130px]">
        {!menuReady ? (
          <section className="pt-[70px] pb-[70px] text-center">
            {menuError ? (
              <>
                <p className="text-[14.5px] text-brown-700 mb-4 leading-[1.55]">
                  Không tải được thực đơn.<br />Vui lòng kiểm tra kết nối và thử lại.
                </p>
                <button
                  className="bg-brown-900 text-tint text-[14.5px] font-semibold py-3 px-[22px] rounded-[12px] cursor-pointer"
                  onClick={retryLoadMenu}
                >
                  Thử lại
                </button>
              </>
            ) : (
              <p className="text-[14.5px] text-muted flex items-center justify-center gap-2">
                <Loader2 size={18} strokeWidth={2.4} className="animate-spin" /> Đang tải thực đơn…
              </p>
            )}
          </section>
        ) : filtered ? (
          <section className="pt-[18px]">
            <h2 className="font-lora text-[21px] font-semibold text-brown-900 mb-[13px]">
              Kết quả tìm kiếm{" "}
              <span className="text-muted font-medium text-[16px]">({filtered.length})</span>
            </h2>
            {filtered.length === 0 ? (
              <p className="text-muted text-[15px] pt-2 pb-[30px]">
                Không tìm thấy món nào. Thử từ khoá khác nhé.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.map((item) => (
                  <ItemCard key={item.id} item={item} qty={cart[item.id] || 0} onAdd={add} onRemove={remove} unavailable={unavailableIds.has(item.id)} onSelect={() => setSelectedFood(item)} />
                ))}
              </div>
            )}
          </section>
        ) : (
          activeCategories.map((c) => (
            <section
              key={c.id}
              className="pt-[18px] scroll-mt-[66px]"
              data-cat={c.id}
              ref={(el) => (sectionRefs.current[c.id] = el)}
            >
              <h2 className="font-lora text-[21px] font-semibold text-brown-900 mb-[13px]">{c.label}</h2>
              <div className="flex flex-col gap-3">
                {activeMenu.filter((m) => m.cat === c.id).map((item) => (
                  <ItemCard key={item.id} item={item} qty={cart[item.id] || 0} onAdd={add} onRemove={remove} unavailable={unavailableIds.has(item.id)} onSelect={() => setSelectedFood(item)} />
                ))}
              </div>
            </section>
          ))
        )}
        
        <div className="mt-8 -mx-[18px]">
          <FeedbackList />
        </div>

        <p className="text-center text-[12px] text-muted mt-7 leading-[1.6]">
          Tiệm Mộc · Nhà văn hóa sinh viên · Mở cửa 7:00 – 22:00
        </p>
      </main>

      {/* Floating cart bar */}
      {count > 0 && !cartOpen && (
        <button
          className="fixed bottom-[18px] left-1/2 -translate-x-1/2 w-[calc(100%-36px)] max-w-[444px] z-[45] flex items-center justify-between bg-brown-900 text-tint px-4 py-[14px] rounded-[16px] shadow-[0_12px_30px_rgba(58,42,30,0.34)] animate-slide-up font-vietnam cursor-pointer"
          onClick={() => setCartOpen(true)}
        >
          <span className="flex items-center gap-[11px] text-[15px] font-semibold">
            <span className="relative grid place-items-center">
              <ShoppingBag size={18} strokeWidth={2.2} />
              <span className="absolute -top-[7px] -right-[9px] bg-accent text-white text-[11px] font-bold min-w-[18px] h-[18px] px-1 rounded-full grid place-items-center">
                {count}
              </span>
            </span>
            {isReorder ? "Gọi thêm món" : "Xem giỏ hàng"}
          </span>
          <span className="font-lora text-[17px] font-bold">{formatVND(total)}</span>
        </button>
      )}

      {/* Order status bar (hiện khi đã đặt và giỏ trống) */}
      {orderId && count === 0 && !cartOpen && !orderSheetOpen && (
        <button
          className="fixed bottom-[18px] left-1/2 -translate-x-1/2 w-[calc(100%-36px)] max-w-[444px] z-[45] flex items-center justify-between bg-brown-900 text-tint px-4 py-[13px] rounded-[16px] shadow-[0_12px_30px_rgba(58,42,30,0.34)] font-vietnam cursor-pointer"
          onClick={() => { setOrderSheetOpen(true); refreshOrderStatus(); }}
        >
          <span className="flex items-center gap-3">
            <span className="relative grid place-items-center shrink-0">
              <ClipboardList size={18} strokeWidth={2.2} />
              <span className={`absolute -top-[5px] -right-[6px] w-[9px] h-[9px] rounded-full ring-[1.5px] ring-brown-900 ${ORDER_STATUS[orderStatus]?.dot ?? "bg-accent"}`} />
            </span>
            <span className="text-left">
              <span className="text-[11px] opacity-70 block leading-none mb-[2px]">Bàn {tableId}</span>
              <span className="text-[14.5px] font-semibold leading-none">
                {ORDER_STATUS[orderStatus]?.label ?? "Đơn của bạn"}
              </span>
            </span>
          </span>
          <ChevronRight size={18} strokeWidth={2.4} className="opacity-70" />
        </button>
      )}

      {/* Cart bottom sheet */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-[60] bg-[rgba(44,32,24,0.5)] flex items-end justify-center animate-fade"
          onClick={() => !placed && !submitting && setCartOpen(false)}
        >
          <div
            className="w-full max-w-[480px] bg-cream rounded-t-[24px] max-h-[88vh] flex flex-col animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Giỏ hàng"
          >
            {placed ? (
              <div className="px-[30px] pt-[46px] pb-[56px] text-center">
                <div className="w-[72px] h-[72px] rounded-full bg-accent text-white grid place-items-center mx-auto mb-[18px] animate-pop">
                  <Check size={34} strokeWidth={3} />
                </div>
                <h3 className="font-lora text-[23px] text-brown-900 mb-2">
                  {wasReorder ? "Đã gọi thêm thành công!" : "Đã gửi đơn tới quầy!"}
                </h3>
                <p className="text-[14.5px] text-brown-700 leading-[1.55]">
                  Món của bạn ở <strong>Bàn {tableId}</strong> đang được chuẩn bị. Cảm ơn bạn ✨
                </p>
              </div>
            ) : (
              <>
                <div className="w-[38px] h-1 rounded-full bg-tint-2 mx-auto mt-[10px] mb-1" />
                <div className="flex items-center justify-between px-[18px] pt-2 pb-[14px]">
                  <h3 className="font-lora text-[21px] font-semibold text-brown-900">
                    {isReorder ? "Gọi thêm món" : "Giỏ hàng của bạn"}
                  </h3>
                  <button
                    className="w-[34px] h-[34px] rounded-full bg-white border border-line grid place-items-center text-brown-700 cursor-pointer"
                    onClick={() => setCartOpen(false)}
                    aria-label="Đóng"
                  >
                    <X size={20} />
                  </button>
                </div>

                {count === 0 ? (
                  <div className="px-[30px] pt-[30px] pb-[46px] text-center">
                    <div className="w-16 h-16 rounded-full bg-tint text-brown-500 grid place-items-center mx-auto mb-[14px]">
                      <ShoppingBag size={30} strokeWidth={1.8} />
                    </div>
                    <p className="font-lora text-[18px] text-brown-900 mb-1">Giỏ hàng đang trống</p>
                    <p className="text-[13.5px] text-muted mb-[18px]">Thêm bánh hoặc cà phê để bắt đầu nhé</p>
                    <button
                      className="bg-brown-900 text-tint text-[14.5px] font-semibold py-3 px-[22px] rounded-[12px] cursor-pointer"
                      onClick={() => setCartOpen(false)}
                    >
                      Tiếp tục chọn món
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="overflow-y-auto px-[18px] flex-1">
                      {Object.entries(cart).map(([id, q]) => {
                        const numId = Number(id);
                        const item  = activeMenu.find((m) => m.id === numId);
                        if (!item) return null;
                        return (
                          <div className="flex items-start gap-3 py-3 border-b border-line" key={id}>
                            <div className="shrink-0 mt-[3px] w-[46px] h-[46px] rounded-[12px] bg-gradient-to-br from-tint to-tint-2 grid place-items-center text-[24px] overflow-hidden">
                              <ItemThumbnail item={item} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14.5px] font-semibold text-brown-900">{item.name}</p>
                              <p className="text-[13px] text-accent font-semibold mt-[2px]">{formatVND(item.price)}</p>
                              <input
                                value={cartNotes[numId] || ""}
                                onChange={(e) => setCartNotes((n) => ({ ...n, [numId]: e.target.value }))}
                                placeholder="ít đường, không đá, thêm sữa…"
                                className="w-full text-[12.5px] text-text-main bg-transparent outline-none placeholder:text-muted/60 mt-[5px] border-b border-transparent focus:border-line pb-[2px] transition-colors duration-150"
                              />
                            </div>
                            <div className="shrink-0 mt-[3px]">
                              <Stepper qty={q} onAdd={() => add(item.id)} onRemove={() => remove(item.id)} small />
                            </div>
                          </div>
                        );
                      })}

                      <label className="block mt-4 mb-[6px]">
                        <span className="text-[13px] font-semibold text-brown-700 block mb-[6px]">Ghi chú chung cho quầy</span>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Ví dụ: mang lên tầng 2, cần thêm dĩa, giao trước 14:00…"
                          rows={2}
                          className="w-full border border-line rounded-[12px] p-[11px_12px] font-vietnam text-[14px] text-text-main bg-white resize-none outline-none focus:border-accent placeholder:text-muted"
                        />
                      </label>

                      {submitMessage && !orderError && (
                        <p className="text-[13px] text-brown-700 mt-2 text-center">{submitMessage}</p>
                      )}
                      {orderError && (
                        <p className="text-[13px] text-red-500 mt-2 text-center">{orderError}</p>
                      )}
                    </div>

                    <div className="px-[18px] pt-[14px] pb-[18px] bg-white border-t border-line">
                      <div className="flex justify-between items-baseline mb-3">
                        <span className="text-[15px] text-brown-700">Tổng cộng</span>
                        <strong className="font-lora text-[24px] font-bold text-brown-900">{formatVND(total)}</strong>
                      </div>
                      <button
                        disabled={submitting}
                        className="w-full flex items-center justify-center gap-[6px] bg-brown-900 text-tint text-[16px] font-semibold py-[15px] rounded-[14px] transition-[background,transform] duration-200 hover:bg-brown-700 active:scale-[0.985] disabled:opacity-70 cursor-pointer"
                        onClick={placeOrder}
                      >
                        {submitting ? (
                          <Loader2 size={20} strokeWidth={2.4} className="animate-spin" />
                        ) : (
                          <>
                            {isReorder ? "Gọi thêm" : "Đặt món"} · {count} món
                            <ChevronRight size={20} strokeWidth={2.4} />
                          </>
                        )}
                      </button>
                      <p className="text-center text-[12px] text-muted mt-[9px]">Thanh toán tại quầy sau khi dùng bữa</p>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Order status sheet */}
      {orderSheetOpen && (
        <OrderSheet
          tableId={tableId}
          order={currentOrder}
          orderStatus={orderStatus}
          statusLoading={statusLoading}
          menuData={activeMenu}
          onClose={() => setOrderSheetOpen(false)}
          onRefresh={refreshOrderStatus}
          onAddMore={() => setOrderSheetOpen(false)}
        />
      )}

      {/* Food detail modal */}
      {selectedFood && (
        <FoodDetailModal
          key={selectedFood.id}
          item={selectedFood}
          onClose={() => setSelectedFood(null)}
          initialQty={cart[selectedFood.id] || 0}
          initialNote={cartNotes[selectedFood.id] || ""}
          onSave={(qty, note) => {
            setCart(prev => {
              const next = { ...prev };
              if (qty <= 0) delete next[selectedFood.id];
              else next[selectedFood.id] = qty;
              return next;
            });
            setCartNotes(prev => {
              const next = { ...prev };
              if (note.trim() === "") delete next[selectedFood.id];
              else next[selectedFood.id] = note;
              return next;
            });
            setSelectedFood(null);
          }}
        />
      )}

      <ChatBot />
    </div>
  );
}

// ── ItemThumbnail: render ảnh từ imageUrl nếu có, fallback về emoji ────────────
// Một số món từ BE trả imageUrl là đường dẫn cache nội bộ của app Android
// (vd "/data/user/0/.../IMG_....jpg"), trình duyệt không tải được — phải có
// fallback thay vì ẩn hẳn img để lại ô trống.
function ItemThumbnail({ item, className = "w-full h-full object-cover" }) {
  const [broken, setBroken] = useState(false);
  if (item.imageUrl && !broken) {
    return (
      <img
        src={item.imageUrl}
        alt={item.name}
        className={className}
        onError={() => setBroken(true)}
      />
    );
  }
  return <span>{item.emoji ?? "🍽️"}</span>;
}

// ── ItemCard ──────────────────────────────────────────────────────────────────
function ItemCard({ item, qty, onAdd, onRemove, unavailable, onSelect }) {
  return (
    <article 
      onClick={() => onSelect && onSelect(item)}
      className={`flex gap-[13px] bg-white border border-line rounded-[18px] p-3 transition-[box-shadow] duration-200 cursor-pointer hover:shadow-[0_8px_24px_rgba(58,42,30,0.07)] ${unavailable ? "opacity-60" : ""}`}
    >
      {/* outer div: relative + sized, badge anchors here — NO overflow-hidden */}
      <div className="relative shrink-0 w-[84px] h-[84px]">
        {/* inner div: overflow-hidden chỉ để clip ảnh tròn góc */}
        <div className="w-full h-full rounded-[14px] bg-gradient-to-br from-tint to-tint-2 grid place-items-center text-[40px] overflow-hidden">
          <ItemThumbnail item={item} className="w-full h-full object-cover" />
        </div>
        {unavailable ? (
          <span className="absolute -top-[7px] -left-[5px] text-[10px] font-semibold bg-muted text-white px-[7px] py-[3px] rounded-full">
            Hết món
          </span>
        ) : item.popular ? (
          <span className="absolute -top-[7px] -left-[5px] inline-flex items-center gap-[3px] bg-accent text-white text-[10px] font-semibold px-[7px] py-[3px] rounded-full shadow-[0_3px_8px_rgba(185,127,61,0.32)]">
            <Star size={11} strokeWidth={2.6} fill="currentColor" /> Bán chạy
          </span>
        ) : null}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <h3 className="text-[15.5px] font-semibold text-brown-900 leading-[1.25]">{item.name}</h3>
        {item.desc && (
          <p className="text-[12.5px] text-muted leading-[1.45] mt-[3px] line-clamp-2">{item.desc}</p>
        )}
        <div className="flex items-center justify-between mt-auto pt-[9px]">
          <span className="font-lora text-[17px] font-bold text-brown-900">{formatVND(item.price)}</span>
          {unavailable ? null : qty === 0 ? (
            <button
              className="inline-flex items-center gap-1 bg-brown-900 text-tint text-[13.5px] font-semibold px-[14px] py-2 rounded-[11px] transition-[background] duration-200 hover:bg-brown-700 active:scale-95 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onAdd(item.id); }}
              aria-label={"Thêm " + item.name}
            >
              <Plus size={17} strokeWidth={2.6} /> Thêm
            </button>
          ) : (
            <Stepper qty={qty} onAdd={() => onAdd(item.id)} onRemove={() => onRemove(item.id)} />
          )}
        </div>
      </div>
    </article>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ qty, onAdd, onRemove, small }) {
  const base = `inline-flex items-center gap-[2px] rounded-[11px] p-[3px] ${small ? "bg-tint" : "bg-brown-900"}`;
  const btn  = small
    ? "w-[26px] h-[26px] text-brown-900 hover:bg-tint-2"
    : "w-7 h-7 text-tint hover:bg-white/14";
  const lbl  = small ? "text-brown-900" : "text-tint";

  return (
    <div className={base} onClick={e => e.stopPropagation()}>
      <button className={`rounded-[8px] grid place-items-center transition-colors duration-150 cursor-pointer ${btn}`} onClick={(e) => { e.stopPropagation(); onRemove(e); }} aria-label="Bớt">
        <Minus size={small ? 14 : 16} strokeWidth={2.6} />
      </button>
      <span className={`min-w-[22px] text-center font-semibold text-[14px] ${lbl}`}>{qty}</span>
      <button className={`rounded-[8px] grid place-items-center transition-colors duration-150 cursor-pointer ${btn}`} onClick={(e) => { e.stopPropagation(); onAdd(e); }} aria-label="Thêm">
        <Plus size={small ? 14 : 16} strokeWidth={2.6} />
      </button>
    </div>
  );
}

// ── OrderSheet ────────────────────────────────────────────────────────────────
function OrderSheet({ tableId, order, orderStatus, statusLoading, menuData, onClose, onRefresh, onAddMore }) {
  const status  = ORDER_STATUS[orderStatus] ?? { label: "Không rõ", dot: "bg-muted" };
  const items   = order?.items ?? [];
  const total   = order?.totalAmount ?? 0;
  const isPulse = orderStatus !== null && orderStatus < 4;

  return (
    <div
      className="fixed inset-0 z-[60] bg-[rgba(44,32,24,0.5)] flex items-end justify-center animate-fade"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-cream rounded-t-[24px] max-h-[88vh] flex flex-col animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Đơn của bạn"
      >
        <div className="w-[38px] h-1 rounded-full bg-tint-2 mx-auto mt-[10px] mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between px-[18px] pt-2 pb-[14px]">
          <div>
            <p className="text-[11px] text-muted uppercase tracking-[0.1em]">Bàn {tableId}</p>
            <h3 className="font-lora text-[21px] font-semibold text-brown-900">Đơn của bạn</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="w-[34px] h-[34px] rounded-full bg-white border border-line grid place-items-center text-brown-700 cursor-pointer"
              onClick={onRefresh}
              aria-label="Làm mới"
            >
              <RefreshCw size={16} strokeWidth={2.2} className={statusLoading ? "animate-spin" : ""} />
            </button>
            <button
              className="w-[34px] h-[34px] rounded-full bg-white border border-line grid place-items-center text-brown-700 cursor-pointer"
              onClick={onClose}
              aria-label="Đóng"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Status card */}
        <div className="mx-[18px] mb-[14px] bg-white border border-line rounded-[16px] px-[16px] py-[14px]">
          <div className="flex items-center gap-[10px] mb-[10px]">
            <span className={`w-[10px] h-[10px] rounded-full shrink-0 ${status.dot} ${isPulse ? "animate-pulse" : ""}`} />
            <span className="text-[15px] font-semibold text-brown-900">{status.label}</span>
          </div>
          <div className="flex gap-[4px]">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`flex-1 h-[3px] rounded-full transition-colors duration-500 ${
                  orderStatus >= step && orderStatus < 5 ? "bg-accent" : "bg-line"
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-[6px]">
            {["Xác nhận", "Pha chế", "Phục vụ", "Xong"].map((label) => (
              <span key={label} className="text-[10px] text-muted">{label}</span>
            ))}
          </div>
        </div>

        {/* Items */}
        <div className="overflow-y-auto flex-1 px-[18px]">
          {items.length === 0 ? (
            <p className="text-center text-[14px] text-muted py-6">Chưa có món nào</p>
          ) : (
            items.map((orderItem, i) => {
              // menuItemName có sẵn từ API response; menuData dùng để lấy thumbnail
              const menuItem   = menuData.find((m) => m.id === orderItem.menuItemId);
              const displayName = orderItem.menuItemName || menuItem?.name || `Món #${orderItem.menuItemId}`;
              return (
                <div key={i} className="flex items-start gap-3 py-[11px] border-b border-line last:border-0">
                  <div className="shrink-0 mt-[2px] w-[40px] h-[40px] rounded-[10px] bg-gradient-to-br from-tint to-tint-2 grid place-items-center text-[20px] overflow-hidden">
                    {menuItem
                      ? <ItemThumbnail item={menuItem} className="w-full h-full object-cover" />
                      : <span>🍽️</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[6px] flex-wrap">
                      <p className="text-[14px] font-semibold text-brown-900 truncate">{displayName}</p>
                      {orderItem.statusLabel && (
                        <span className="shrink-0 text-[10.5px] font-medium text-brown-700 bg-tint px-[7px] py-[1px] rounded-full">
                          {orderItem.statusLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-[12.5px] text-muted">
                      {formatVND(orderItem.unitPrice)} × {orderItem.quantity}
                    </p>
                    {orderItem.note && (
                      <p className="text-[11.5px] text-brown-500 mt-[2px] italic">"{orderItem.note}"</p>
                    )}
                  </div>
                  <span className="text-[13.5px] font-semibold text-brown-900 shrink-0 mt-[2px]">
                    {formatVND(orderItem.unitPrice * orderItem.quantity)}
                  </span>
                </div>
              );
            })
          )}

          {orderStatus === 4 && (
            <FeedbackForm
              orderId={order?.orderId}
              tableId={tableId}
              onSubmitSuccess={onClose}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-[18px] pt-[14px] pb-[18px] bg-white border-t border-line">
          {total > 0 && (
            <div className="flex justify-between items-baseline mb-3">
              <span className="text-[15px] text-brown-700">Tổng cộng</span>
              <strong className="font-lora text-[22px] font-bold text-brown-900">{formatVND(total)}</strong>
            </div>
          )}
          <button
            className="w-full flex items-center justify-center gap-[6px] bg-brown-900 text-tint text-[15.5px] font-semibold py-[14px] rounded-[14px] transition-[background] duration-200 hover:bg-brown-700 cursor-pointer"
            onClick={onAddMore}
          >
            <Plus size={18} strokeWidth={2.4} /> Gọi thêm món
          </button>
          <p className="text-center text-[12px] text-muted mt-[9px]">Thanh toán tại quầy sau khi dùng bữa</p>
        </div>
      </div>
    </div>
  );
}
