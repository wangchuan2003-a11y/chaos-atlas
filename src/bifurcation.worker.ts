import { bifurcation } from "./math";
self.onmessage = (
  event: MessageEvent<{ id: number; x0: number; minR: number }>,
) => {
  const { id, x0, minR } = event.data;
  try {
    const points = bifurcation(x0, minR);
    self.postMessage({ id, points }, { transfer: [points.buffer] });
  } catch {
    self.postMessage({ id, error: "分岔图计算失败，请重试。" });
  }
};
