export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Render free tier "ngủ" sau ~15 phút không có traffic: request đầu tiên bị
// 429 (hibernate-rate-limited) rồi 502 trong lúc khởi động lại, mất tới ~30-45s.
// Tự thử lại thay vì báo lỗi ngay; onRetry cho phép UI báo khách đang chờ.
const COLD_START_DELAYS = [3000, 5000, 8000, 8000, 8000];

export async function fetchWithRetry(url, options, onRetry) {
  for (let attempt = 0; attempt <= COLD_START_DELAYS.length; attempt++) {
    const isLastAttempt = attempt === COLD_START_DELAYS.length;
    try {
      const res = await fetch(url, options);
      const isColdStart = res.status === 429 || res.status === 502 || res.status === 503;
      if (isColdStart && !isLastAttempt) {
        onRetry?.(attempt + 1);
        await sleep(COLD_START_DELAYS[attempt]);
        continue;
      }
      return res;
    } catch (err) {
      if (isLastAttempt) throw err;
      onRetry?.(attempt + 1);
      await sleep(COLD_START_DELAYS[attempt]);
    }
  }
}
