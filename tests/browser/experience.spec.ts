import { test, expect } from "@playwright/test";

test("linked plots, worker, presets, and timeline are operable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "一点不同",
  );
  await expect(page.locator("#bif-loading")).toBeHidden();
  await page.getByRole("button", { name: "两个落点" }).click();
  await expect(page.locator("#r-value")).toHaveText("3.200");
  await expect(page.locator("#period-value")).toContainText("近似 2 周期");
  await page.getByRole("button", { name: "回到起点" }).click();
  await expect(page.locator("#cursor-value")).toHaveText("0 / 80");
  await page.getByRole("button", { name: "单步 +1", exact: true }).click();
  await expect(page.locator("#cursor-value")).toHaveText("1 / 80");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.locator("#compare").uncheck();
  await expect(page.locator("#separation")).toHaveText("对照已隐藏");
  const sizes = await page
    .locator("canvas")
    .evaluateAll((canvases) =>
      canvases.map((canvas) => ({
        width: (canvas as HTMLCanvasElement).width,
        height: (canvas as HTMLCanvasElement).height,
      })),
    );
  expect(sizes).toHaveLength(3);
  expect(
    sizes.every((size) => size.width > 100 && size.height > 100),
  ).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test("URL reload, keyboard, endpoint cases, and PNG export", async ({
  page,
}) => {
  await page.goto("./#r=2&x=0.5&n=40");
  await expect(page.locator("#bif-loading")).toBeHidden();
  await expect(page.locator("#lyapunov-value")).toHaveText("−∞");
  await expect(page.locator("#lyapunov-note")).toContainText("导数为零");
  await page.locator("#r-range").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#r-value")).toHaveText("2.001");
  await page.getByLabel("初值精确值").fill("1");
  await expect(page.locator("#period-value")).toContainText("固定点");
  await expect(page.locator("#delta-label")).toContainText("−10⁻⁷");
  await page.reload();
  await expect(page.getByLabel("初值精确值")).toHaveValue("1");
  await expect(page.locator("#bif-loading")).toBeHidden();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出图谱 PNG" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^chaos-atlas-r.*\.png$/,
  );
  await page.getByText("查看当前轨迹数据与计算说明").click();
  await expect(page.locator("#data-rows tr")).toHaveCount(12);
  await page.goto("./#r=99&x=0.2&n=80");
  await expect(page.locator("#status")).toContainText("链接参数无效");
});
