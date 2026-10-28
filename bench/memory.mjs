// Memory & CPU benchmark: runs each scenario in a fresh Chrome and reports
//  - JS heap min/max while animating (the gap is per-frame garbage) and after a forced GC
//  - canvas backing store size
//  - physical footprint of the renderer and GPU processes, minus a blank-page baseline
//  - CPU time of the renderer and GPU processes (% of one core), minus the baseline
//
// Each scenario runs ITERATIONS times next to a fresh blank-page baseline; medians are reported.
//
// Usage: node bench/memory.mjs [seconds=8] [iterations=3] [name-filter]
// Requires a local Google Chrome (driven through playwright-core).
import { execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const SECONDS = Number(process.argv[2] ?? 8);
const ITERATIONS = Number(process.argv[3] ?? 3);
/** Only run scenarios whose name contains this (the blank baseline always runs). */
const FILTER = process.argv[4] ?? '';
const VIEWPORT = { width: 1920, height: 1080 };
const DPR = 2;

const BLANK = { name: 'blank page', off: true };
const scenarios = [
  BLANK,
  { name: 'floor @ 30 fps', floor: 30 },
  { name: 'floor @ 60 fps', floor: 60 },
  { name: 'topo canvas2d', engine: { renderer: 'canvas2d' } },
  { name: 'topo canvas2d + pointer', engine: { renderer: 'canvas2d' }, pointer: true },
  { name: 'topo webgl', engine: { renderer: 'webgl' } },
  { name: 'topo webgl + pointer', engine: { renderer: 'webgl' }, pointer: true },
  { name: 'dots canvas2d', style: 'dots', engine: { renderer: 'canvas2d' } },
  { name: 'dots canvas2d + pointer', style: 'dots', engine: { renderer: 'canvas2d' }, pointer: true },
  { name: 'dots webgl', style: 'dots', engine: { renderer: 'webgl' } },
  { name: 'dots webgl + pointer', style: 'dots', engine: { renderer: 'webgl' }, pointer: true },
  { name: 'plus canvas2d', style: 'plus', engine: { renderer: 'canvas2d' } },
  { name: 'plus canvas2d + pointer', style: 'plus', engine: { renderer: 'canvas2d' }, pointer: true },
  { name: 'plus webgl', style: 'plus', engine: { renderer: 'webgl' } },
  { name: 'plus webgl + pointer', style: 'plus', engine: { renderer: 'webgl' }, pointer: true },
];

const MB = (b) => (b / 1024 / 1024).toFixed(1);

/**
 * Physical footprint of the Chrome renderer and GPU processes. Unlike RSS this
 * includes GPU-backed memory (IOSurface / IOAccelerator), which is where an
 * accelerated canvas lives. macOS only (uses `footprint`).
 */
function processFootprint(rootPid) {
  const rows = execSync('ps -A -o pid=,ppid=,time=,command=')
    .toString()
    .trim()
    .split('\n')
    .map((l) => {
      const [pid, ppid, time, ...cmd] = l.trim().split(/\s+/);
      return { pid: +pid, ppid: +ppid, cpu: parseCpuTime(time), cmd: cmd.join(' ') };
    });
  const children = new Map();
  for (const r of rows) children.set(r.ppid, [...(children.get(r.ppid) ?? []), r]);
  const kinds = new Map();
  let cpu = 0;
  const stack = rows.filter((r) => r.pid === rootPid);
  while (stack.length) {
    const r = stack.pop();
    if (r.cmd.includes('--type=renderer')) kinds.set(r.pid, 'renderer');
    else if (r.cmd.includes('--type=gpu-process')) kinds.set(r.pid, 'gpu');
    if (kinds.has(r.pid)) cpu += r.cpu;
    stack.push(...(children.get(r.pid) ?? []));
  }
  const out = { renderer: 0, gpu: 0, cpu };
  if (!kinds.size) return out;
  const text = execSync(`footprint ${[...kinds.keys()].join(' ')} 2>/dev/null`).toString();
  const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
  for (const m of text.matchAll(/\[(\d+)\]:.*?Footprint: ([\d.]+) (B|KB|MB|GB)/g)) {
    const kind = kinds.get(+m[1]);
    if (kind) out[kind] += +m[2] * units[m[3]];
  }
  return out;
}

/** `ps` cumulative CPU time ("[[hh:]mm:]ss.cc") in seconds. */
function parseCpuTime(text) {
  return text.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

async function run(url, scenario) {
  const server = await chromium.launchServer({ channel: 'chrome', headless: true });
  const browser = await chromium.connect(server.wsEndpoint());
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');

  const query =
    (scenario.floor
      ? `floor=${scenario.floor}`
      : scenario.off
        ? 'off=1'
        : `style=${scenario.style ?? 'topo'}` +
          `&opts=${encodeURIComponent(JSON.stringify(scenario.opts ?? {}))}` +
          `&engine=${encodeURIComponent(JSON.stringify(scenario.engine ?? {}))}`);
  await page.goto(`${url}bench/memory.html?${query}`);
  await page.waitForFunction(() => window.__ready);
  await page.waitForTimeout(2000);

  const heap = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((m) => m.name === 'JSHeapUsedSize').value;
  };

  let a = 0;
  let min = Infinity;
  let max = 0;
  const peak = { renderer: 0, gpu: 0 };
  let lastPs = 0;
  const cpuStart = processFootprint(server.process().pid).cpu;
  const end = Date.now() + SECONDS * 1000;
  while (Date.now() < end) {
    if (scenario.pointer) {
      a += 0.05;
      await page.mouse.move(960 + Math.cos(a) * 400, 540 + Math.sin(a) * 250);
    }
    const h = await heap();
    min = Math.min(min, h);
    max = Math.max(max, h);
    if (Date.now() - lastPs > 1000) {
      lastPs = Date.now();
      const rss = processFootprint(server.process().pid);
      peak.renderer = Math.max(peak.renderer, rss.renderer);
      peak.gpu = Math.max(peak.gpu, rss.gpu);
    }
    await page.waitForTimeout(16);
  }
  const cpuPercent = ((processFootprint(server.process().pid).cpu - cpuStart) / SECONDS) * 100;
  await cdp.send('HeapProfiler.collectGarbage');
  const afterGc = await heap();
  const canvasBytes = await page.evaluate(() => window.__canvasBytes());

  await browser.close();
  await server.close();
  return { min, max, afterGc, peak, canvasBytes, cpuPercent };
}

const server = await createServer({ server: { port: 5199 }, logLevel: 'silent' });
await server.listen();
const url = server.resolvedUrls.local[0];

console.log(`${VIEWPORT.width}×${VIEWPORT.height} @ dpr ${DPR}, ${SECONDS}s per scenario, ${ITERATIONS} iterations\n`);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const runs = new Map(scenarios.map((s) => [s.name, []]));
for (let i = 0; i < ITERATIONS; i++) {
  let blank = null;
  for (const s of scenarios) {
    if (s !== BLANK && !s.name.includes(FILTER)) continue;
    const r = await run(url, s);
    if (s === BLANK) blank = r;
    runs.get(s.name).push({
      ...r,
      renderer: r.peak.renderer - blank.peak.renderer,
      gpu: r.peak.gpu - blank.peak.gpu,
      cpu: r.cpuPercent - blank.cpuPercent,
    });
  }
}

console.log('scenario'.padEnd(26), 'heap max', 'after GC', ' canvas', ' renderer Δ', '  GPU Δ', ' total Δ', '  CPU Δ   (MB / % of a core, medians vs blank page)');
for (const s of scenarios.slice(1).filter((s) => s.name.includes(FILTER))) {
  const r = runs.get(s.name);
  const m = (f) => MB(median(r.map(f)));
  console.log(
    s.name.padEnd(26),
    m((x) => x.max).padStart(8),
    m((x) => x.afterGc).padStart(8),
    m((x) => x.canvasBytes).padStart(7),
    m((x) => x.renderer).padStart(11),
    m((x) => x.gpu).padStart(7),
    m((x) => x.renderer + x.gpu).padStart(8),
    `${median(r.map((x) => x.cpu)).toFixed(1)}%`.padStart(7),
    `   [totals: ${r.map((x) => MB(x.renderer + x.gpu)).join(', ')}]`,
  );
}
await server.close();
