import "./style.css";
import {
  DEFAULTS,
  DELTA,
  approximatePeriod,
  decodeParameters,
  encodeParameters,
  logistic,
  lyapunov,
  nearbyInitial,
  orbit,
  validateParameters,
  type Parameters,
} from "./math";

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;
const rRange = $<HTMLInputElement>("#r-range");
const rNumber = $<HTMLInputElement>("#r-number");
const xRange = $<HTMLInputElement>("#x-range");
const xNumber = $<HTMLInputElement>("#x-number");
const iterations = $<HTMLSelectElement>("#iterations");
const cursorInput = $<HTMLInputElement>("#cursor");
const compareInput = $<HTMLInputElement>("#compare");
const playButton = $<HTMLButtonElement>("#play");
const exportButton = $<HTMLButtonElement>("#export");
const status = $("#status");
const timeCanvas = $<HTMLCanvasElement>("#time-series");
const cobwebCanvas = $<HTMLCanvasElement>("#cobweb");
const bifCanvas = $<HTMLCanvasElement>("#bifurcation");
const colors = {
  paper: "#fcfaf5",
  ink: "#503665",
  pink: "#b32870",
  grid: "#e7e0e7",
  label: "#726875",
};
let parameters: Parameters = decodeParameters(location.hash) ?? { ...DEFAULTS };
let cursor = parameters.iterations;
let primary: number[] = [];
let comparison: number[] = [];
let points: Float32Array | null = null;
let minR = parameters.r < 2.5 ? 0 : 2.5;
let requestId = 0;
let playing: ReturnType<typeof setInterval> | null = null;
let workerTimer: ReturnType<typeof setTimeout> | null = null;
const worker = new Worker(new URL("./bifurcation.worker.ts", import.meta.url), {
  type: "module",
});

type Plot = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  x: (x: number) => number;
  y: (y: number) => number;
};
function prepare(
  canvas: HTMLCanvasElement,
  xMin: number,
  xMax: number,
  xTicks: number[],
): Plot {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, width, height);
  const left = 41,
    top = 18,
    right = width - 20,
    bottom = height - 29;
  const x = (value: number) =>
    left + ((value - xMin) / (xMax - xMin)) * (right - left);
  const y = (value: number) => bottom - value * (bottom - top);
  ctx.font = '10px "Manrope Variable", sans-serif';
  ctx.lineWidth = 1;
  for (const value of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ctx.moveTo(left, y(value));
    ctx.lineTo(right, y(value));
    ctx.stroke();
    ctx.fillStyle = colors.label;
    ctx.textAlign = "right";
    ctx.fillText(
      value === 0 || value === 1 ? value.toFixed(1) : String(value),
      left - 9,
      y(value) + 3,
    );
  }
  for (const value of xTicks) {
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ctx.moveTo(x(value), top);
    ctx.lineTo(x(value), bottom);
    ctx.stroke();
    ctx.fillStyle = colors.label;
    ctx.textAlign = "center";
    ctx.fillText(Number(value.toFixed(2)).toString(), x(value), bottom + 18);
  }
  return { ctx, width, height, left, right, top, bottom, x, y };
}

function line(
  plot: Plot,
  values: readonly [number, number][],
  color: string,
  dashed = false,
  width = 1.4,
) {
  const { ctx, x, y } = plot;
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    plot.left - 1,
    plot.top - 1,
    plot.right - plot.left + 2,
    plot.bottom - plot.top + 2,
  );
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashed ? [4, 4] : []);
  ctx.beginPath();
  values.forEach(([a, b], i) =>
    i === 0 ? ctx.moveTo(x(a), y(b)) : ctx.lineTo(x(a), y(b)),
  );
  ctx.stroke();
  ctx.restore();
}

function drawTime() {
  const n = parameters.iterations;
  const plot = prepare(timeCanvas, 0, n, [0, n / 4, n / 2, n * 0.75, n]);
  const values = primary
    .slice(0, cursor + 1)
    .map((x, i): [number, number] => [i, x]);
  line(plot, values, colors.ink, false, 1.6);
  if (compareInput.checked)
    line(
      plot,
      comparison.slice(0, cursor + 1).map((x, i) => [i, x]),
      colors.pink,
      true,
      1.4,
    );
  const { ctx, x, y } = plot;
  ctx.fillStyle = colors.ink;
  ctx.beginPath();
  ctx.arc(x(cursor), y(primary[cursor]), 3.3, 0, Math.PI * 2);
  ctx.fill();
  if (compareInput.checked) {
    ctx.fillStyle = colors.pink;
    ctx.beginPath();
    ctx.arc(x(cursor), y(comparison[cursor]), 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCobweb() {
  const plot = prepare(cobwebCanvas, 0, 1, [0, 0.25, 0.5, 0.75, 1]);
  line(
    plot,
    [
      [0, 0],
      [1, 1],
    ],
    "#a095a7",
    true,
    1,
  );
  line(
    plot,
    Array.from({ length: 201 }, (_, i) => [
      i / 200,
      logistic(parameters.r, i / 200),
    ]),
    colors.ink,
    false,
    2,
  );
  const start = Math.max(0, cursor - 50);
  const path: [number, number][] = [
    [primary[start], start === 0 ? 0 : primary[start]],
  ];
  for (let n = start; n < cursor; n++)
    path.push([primary[n], primary[n + 1]], [primary[n + 1], primary[n + 1]]);
  line(plot, path, colors.pink, false, 1.1);
  plot.ctx.fillStyle = colors.pink;
  plot.ctx.beginPath();
  plot.ctx.arc(
    plot.x(primary[cursor]),
    plot.y(cursor === 0 ? 0 : primary[cursor]),
    3.3,
    0,
    Math.PI * 2,
  );
  plot.ctx.fill();
  $("#cob-note").textContent =
    cursor > 50
      ? `最近 50 跳 · n ${cursor - 50}–${cursor}`
      : `已显示 ${cursor} 跳`;
}

function drawBifurcation() {
  const ticks =
    minR === 0 ? [0, 1, 2, 3, 4] : [2.5, 2.75, 3, 3.25, 3.5, 3.75, 4];
  const plot = prepare(bifCanvas, minR, 4, ticks);
  if (points) {
    plot.ctx.fillStyle = "rgba(80,54,101,.20)";
    for (let n = 0; n < points.length; n += 2)
      plot.ctx.fillRect(plot.x(points[n]), plot.y(points[n + 1]), 0.85, 0.85);
  }
  if (parameters.r >= minR) {
    const px = plot.x(parameters.r);
    plot.ctx.strokeStyle = colors.pink;
    plot.ctx.lineWidth = 1.3;
    plot.ctx.beginPath();
    plot.ctx.moveTo(px, plot.top);
    plot.ctx.lineTo(px, plot.bottom);
    plot.ctx.stroke();
    const tail = orbit(parameters.r, parameters.x0, 799).slice(700);
    plot.ctx.fillStyle = colors.pink;
    for (const value of tail) {
      plot.ctx.beginPath();
      plot.ctx.arc(px, plot.y(value), 1.6, 0, Math.PI * 2);
      plot.ctx.fill();
    }
  }
  $("#selected-r").textContent = `r = ${parameters.r.toFixed(3)}`;
  $("#domain").textContent = minR === 0 ? "聚焦 2.5–4" : "显示全域 0–4";
}

function updateData() {
  const difference = Math.abs(primary[cursor] - comparison[cursor]);
  $("#separation").textContent = compareInput.checked
    ? `|Δx| = ${difference.toExponential(2)}`
    : "对照已隐藏";
  $("#cursor-value").textContent = `${cursor} / ${parameters.iterations}`;
  cursorInput.value = String(cursor);
  $<HTMLButtonElement>("#step").disabled = cursor >= parameters.iterations;
  $("#data-rows").innerHTML = primary
    .slice(Math.max(0, cursor - 11), cursor + 1)
    .map((value, i) => {
      const n = Math.max(0, cursor - 11) + i;
      return `<tr><td>${n}</td><td>${value.toFixed(9)}</td><td>${comparison[n].toFixed(9)}</td><td>${Math.abs(value - comparison[n]).toExponential(3)}</td></tr>`;
    })
    .join("");
}

function draw() {
  drawTime();
  drawCobweb();
  drawBifurcation();
  updateData();
}
function pause() {
  if (playing !== null) clearInterval(playing);
  playing = null;
  playButton.textContent = "播放";
  playButton.setAttribute("aria-pressed", "false");
}

function requestBifurcation() {
  if (workerTimer !== null) clearTimeout(workerTimer);
  const id = ++requestId;
  points = null;
  $("#bif-loading").hidden = false;
  $("#bif-loading").textContent = "计算分岔图…";
  exportButton.disabled = true;
  workerTimer = setTimeout(
    () => worker.postMessage({ id, x0: parameters.x0, minR }),
    120,
  );
}

worker.onmessage = (
  event: MessageEvent<{ id: number; points?: Float32Array; error?: string }>,
) => {
  if (event.data.id !== requestId) return;
  if (event.data.error) {
    $("#bif-loading").textContent = event.data.error;
    status.textContent = event.data.error;
    return;
  }
  points = event.data.points!;
  $("#bif-loading").hidden = true;
  exportButton.disabled = false;
  drawBifurcation();
};
worker.onerror = () => {
  $("#bif-loading").textContent = "分岔图未能加载，请刷新页面重试。";
  status.textContent = "时间序列与蛛网图仍可使用。";
};

function setParameters(next: Parameters, updateHash = true) {
  try {
    validateParameters(next);
  } catch (error) {
    status.textContent = (error as Error).message;
    return;
  }
  pause();
  const needsBifurcation =
    !primary.length || next.x0 !== parameters.x0 || next.r < minR;
  if (next.r < minR) minR = 0;
  parameters = { ...next };
  cursor = parameters.iterations;
  primary = orbit(parameters.r, parameters.x0, parameters.iterations);
  comparison = orbit(
    parameters.r,
    nearbyInitial(parameters.x0),
    parameters.iterations,
  );
  rRange.value = rNumber.value = String(parameters.r);
  xRange.value = xNumber.value = String(parameters.x0);
  $("#r-value").textContent = parameters.r.toFixed(3);
  $("#x-value").textContent = parameters.x0.toFixed(7);
  if (
    ![...iterations.options].some(
      (option) => Number(option.value) === parameters.iterations,
    )
  ) {
    const option = new Option(
      `${parameters.iterations} 步`,
      String(parameters.iterations),
    );
    iterations.add(option);
  }
  iterations.value = String(parameters.iterations);
  cursorInput.max = String(parameters.iterations);
  document
    .querySelectorAll<HTMLButtonElement>("[data-r]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.r) === parameters.r),
      ),
    );
  const estimate = lyapunov(parameters.r, parameters.x0);
  $("#lyapunov-value").textContent =
    estimate.value === -Infinity
      ? "−∞"
      : `${estimate.value >= 0 ? "+" : ""}${estimate.value.toFixed(4)}`;
  $("#lyapunov-note").textContent = estimate.zeroDerivatives
    ? `采样中 ${estimate.zeroDerivatives} 项导数为零；保留 ln(0) = −∞，不作截断。`
    : `${estimate.value > 0 ? "当前窗口平均扩张" : estimate.value < 0 ? "当前窗口平均收缩" : "当前窗口近中性"}。烧入 1,000 步 · 采样 4,000 项；不是混沌证明。`;
  const period = approximatePeriod(
    orbit(parameters.r, parameters.x0, 1128).slice(1000),
  );
  $("#period-value").textContent = period
    ? `尾段近似 ${period} 周期${period === 1 ? "（固定点）" : ""} · 容差 10⁻⁸`
    : "尾段未检出 1–16 周期 · 不等于排除所有周期";
  $("#delta-label").textContent =
    `第二起点 ${nearbyInitial(parameters.x0).toFixed(7)}，偏移 ${parameters.x0 + DELTA <= 1 ? "+" : "−"}10⁻⁷。`;
  if (updateHash) history.replaceState(null, "", encodeParameters(parameters));
  if (needsBifurcation) requestBifurcation();
  status.textContent = "参数已更新。可回到起点逐步观察。";
  draw();
}

for (const input of [rRange, rNumber])
  input.addEventListener("input", () => {
    if (input.value.trim() !== "")
      setParameters({ ...parameters, r: input.valueAsNumber });
  });
for (const input of [xRange, xNumber])
  input.addEventListener("input", () => {
    if (input.value.trim() !== "")
      setParameters({ ...parameters, x0: input.valueAsNumber });
  });
iterations.addEventListener("change", () =>
  setParameters({ ...parameters, iterations: Number(iterations.value) }),
);
compareInput.addEventListener("change", draw);
cursorInput.addEventListener("input", () => {
  pause();
  cursor = cursorInput.valueAsNumber;
  draw();
});
document
  .querySelectorAll<HTMLButtonElement>("[data-r]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      setParameters({ ...parameters, r: Number(button.dataset.r), x0: 0.2 }),
    ),
  );
$("#restart").addEventListener("click", () => {
  pause();
  cursor = 0;
  draw();
});
$("#step").addEventListener("click", () => {
  pause();
  cursor = Math.min(cursor + 1, parameters.iterations);
  draw();
});
playButton.addEventListener("click", () => {
  if (playing !== null) {
    pause();
    return;
  }
  if (cursor >= parameters.iterations) cursor = 0;
  playButton.textContent = "暂停";
  playButton.setAttribute("aria-pressed", "true");
  playing = setInterval(() => {
    cursor++;
    if (cursor >= parameters.iterations) pause();
    draw();
  }, 100);
  draw();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
$("#domain").addEventListener("click", () => {
  minR = minR === 0 ? 2.5 : 0;
  if (parameters.r < minR) setParameters({ ...parameters, r: 2.5 });
  requestBifurcation();
  drawBifurcation();
});
bifCanvas.addEventListener("click", (event) => {
  const bounds = bifCanvas.getBoundingClientRect();
  const fraction = Math.min(
    1,
    Math.max(0, (event.clientX - bounds.left - 41) / (bounds.width - 61)),
  );
  setParameters({
    ...parameters,
    r: Number((minR + (4 - minR) * fraction).toFixed(3)),
  });
});
window.addEventListener("hashchange", () => {
  const next = decodeParameters(location.hash);
  if (next) setParameters(next, false);
  else
    status.textContent = "链接参数无效；保留当前实验。可使用上方控件重新设置。";
});
$("#share").addEventListener("click", async () => {
  const url = new URL(location.href);
  url.hash = encodeParameters(parameters);
  try {
    await navigator.clipboard.writeText(url.href);
    status.textContent =
      "实验参数链接已复制。接收者会看到相同 r、初值和观察步数。";
  } catch {
    history.replaceState(null, "", encodeParameters(parameters));
    status.textContent = "剪贴板不可用；参数已写入地址栏，请手动复制网址。";
  }
});
exportButton.addEventListener("click", async () => {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1250;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4f1e9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colors.ink;
  ctx.font = 'bold 38px "Manrope Variable", "Microsoft YaHei", sans-serif';
  ctx.fillText("Chaos Atlas · 混沌图谱", 55, 66);
  ctx.font = '20px "Manrope Variable", "Microsoft YaHei", sans-serif';
  ctx.fillText(
    `r = ${parameters.r}    x₀ = ${parameters.x0}    n = ${cursor}/${parameters.iterations}`,
    55,
    108,
  );
  ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
  ctx.fillText("分岔图 · 长期落点", 55, 155);
  ctx.drawImage(bifCanvas, 45, 172, 1510, 410);
  ctx.fillText("时间序列", 55, 633);
  ctx.fillText("蛛网图", 870, 633);
  ctx.drawImage(timeCanvas, 45, 660, 790, 390);
  ctx.drawImage(cobwebCanvas, 855, 660, 700, 390);
  ctx.font = '18px "Microsoft YaHei", sans-serif';
  ctx.fillText(
    `Lyapunov 有限估计 ${$("#lyapunov-value").textContent}；烧入 1000 步，采样 4000 项；不是混沌证明。`,
    55,
    1120,
  );
  ctx.fillText(
    "分岔图：900 个参数，烧入 700 步，每列保留 100 点。轨迹使用 IEEE 754 浮点计算。",
    55,
    1155,
  );
  ctx.fillStyle = colors.label;
  ctx.font = '16px "Manrope Variable", sans-serif';
  ctx.fillText("wangchuan2003-a11y.github.io/chaos-atlas/", 55, 1205);
  canvas.toBlob((blob) => {
    if (!blob) {
      status.textContent = "图片生成失败，请重试。";
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chaos-atlas-r${parameters.r}-n${cursor}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "图谱 PNG 已导出，包含当前参数和估计边界。";
  }, "image/png");
});
setParameters(parameters, false);
if (location.hash && !decodeParameters(location.hash))
  status.textContent = "链接参数无效，已载入默认实验。";
const observer = new ResizeObserver(() => draw());
for (const canvas of [bifCanvas, timeCanvas, cobwebCanvas])
  observer.observe(canvas);
document.fonts.ready.then(draw);
