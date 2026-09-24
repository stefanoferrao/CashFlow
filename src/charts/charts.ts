/**
 * Gráficos (Chart.js, MIT) — carregado sob demanda (lazy) e com tree-shaking.
 * Especificações de marca (skill dataviz): linhas 2px, barras ≤ 24px com ponta arredondada de 4px,
 * área com lavagem ~10%, grade em linha fina sólida e discreta, tooltip com crosshair.
 * Cores: paleta categórica validada (tokens --series-N), texto sempre com tokens de texto.
 */
import type { Chart, ChartConfiguration, ChartDataset, TooltipItem } from 'chart.js';
import { formatMoney, formatMoneyCompact, formatPercent } from '../utils/format';

type ChartLib = typeof import('./chartjs-setup');
let libPromise: Promise<ChartLib> | null = null;

function loadLib(): Promise<ChartLib> {
  if (!libPromise) libPromise = import('./chartjs-setup');
  return libPromise;
}

export interface ChartTheme {
  text: string;
  text2: string;
  muted: string;
  grid: string;
  axis: string;
  surface: string;
  inverse: string;
  inverseText: string;
  series: string[];
  font: string;
}

export function readTheme(): ChartTheme {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    text: v('--text'),
    text2: v('--text-2'),
    muted: v('--chart-muted'),
    grid: v('--chart-grid'),
    axis: v('--chart-axis'),
    surface: v('--surface'),
    inverse: v('--surface-inverse'),
    inverseText: v('--text-inverse'),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--series-${i}`)),
    font: v('--font'),
  };
}

/** Cor com transparência (hex #rrggbb → rgba). */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

type Builder = (t: ChartTheme) => ChartConfiguration;
const live = new Map<HTMLCanvasElement, { chart: Chart; build: Builder }>();

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function mountChart(canvas: HTMLCanvasElement, build: Builder): Promise<Chart | null> {
  const m = await loadLib();
  if (!canvas.isConnected) return null;
  const existing = live.get(canvas);
  existing?.chart.destroy();
  const cfg = build(readTheme());
  const chart = new m.Chart(canvas, cfg);
  live.set(canvas, { chart, build });
  return chart;
}

/** Destrói gráficos cujo canvas saiu do DOM (ou dentro de `root`). */
export function destroyCharts(root?: Element): void {
  for (const [canvas, { chart }] of live) {
    if (!canvas.isConnected || (root && root.contains(canvas))) {
      chart.destroy();
      live.delete(canvas);
    }
  }
}

/** Reaplica o tema (claro/escuro) sem recriar a página. */
export function rethemeCharts(): void {
  const t = readTheme();
  for (const [canvas, entry] of live) {
    if (!canvas.isConnected) {
      entry.chart.destroy();
      live.delete(canvas);
      continue;
    }
    const cfg = entry.build(t);
    entry.chart.options = cfg.options ?? {};
    entry.chart.data = cfg.data;
    entry.chart.update('none');
  }
}

export function resizeCharts(): void {
  for (const [canvas, { chart }] of live) if (canvas.isConnected) chart.resize();
}

// ------------------------------------------------------------------ opções base

type ValueFormat = 'money' | 'percent';

function fmt(v: number, f: ValueFormat, compact = false): string {
  if (f === 'percent') return formatPercent(v);
  return compact ? formatMoneyCompact(v) : formatMoney(v);
}

function baseOptions(t: ChartTheme, opts: { yFormat?: ValueFormat; stacked?: boolean; horizontal?: boolean; beginAtZero?: boolean; maxTicksX?: number }) {
  const yFormat = opts.yFormat ?? 'money';
  const valueAxis = {
    beginAtZero: opts.beginAtZero ?? true,
    stacked: !!opts.stacked,
    border: { display: false },
    grid: { color: t.grid, lineWidth: 1, drawTicks: false },
    ticks: {
      color: t.muted,
      padding: 8,
      font: { family: t.font, size: 11 },
      maxTicksLimit: 6,
      callback: (v: string | number) => fmt(Number(v), yFormat, true),
    },
  };
  const categoryAxis = {
    stacked: !!opts.stacked,
    border: { display: true, color: t.axis },
    grid: { display: false },
    ticks: {
      color: t.muted,
      padding: 6,
      font: { family: t.font, size: 11 },
      maxRotation: 0,
      autoSkip: true,
      autoSkipPadding: 12,
      maxTicksLimit: opts.maxTicksX ?? 12,
    },
  };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion() ? (false as const) : { duration: 550, easing: 'easeOutCubic' as const },
    indexAxis: opts.horizontal ? ('y' as const) : ('x' as const),
    interaction: { mode: 'index' as const, intersect: false },
    layout: { padding: { top: 6, right: 6, bottom: 0, left: 0 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: t.inverse,
        titleColor: t.inverseText,
        bodyColor: t.inverseText,
        borderWidth: 0,
        cornerRadius: 10,
        padding: 10,
        boxPadding: 4,
        usePointStyle: true,
        titleFont: { family: t.font, size: 12, weight: 600 as const },
        bodyFont: { family: t.font, size: 12 },
        callbacks: {
          label: (ctx: TooltipItem<'line' | 'bar'>) => {
            const raw = opts.horizontal ? ctx.parsed.x : ctx.parsed.y;
            if (raw === null || raw === undefined || Number.isNaN(raw)) return '';
            return ` ${ctx.dataset.label ?? ''}: ${fmt(Number(raw), yFormat)}`;
          },
        },
      },
    },
    scales: opts.horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
  };
}

// ------------------------------------------------------------------ construtores

export interface LineSeries {
  label: string;
  data: Array<number | null>;
  /** Índice 1..8 da paleta categórica. */
  colorIndex: number;
  fill?: boolean;
  /** Tracejado — reservado para PROJEÇÕES. */
  projection?: boolean;
  /** Mostra os pontos (valores registrados em datas esparsas) e liga os pontos pulando os vazios. */
  points?: boolean;
}

export function lineChart(labels: string[], series: LineSeries[], opts: { yFormat?: ValueFormat; beginAtZero?: boolean; maxTicksX?: number; zeroLine?: boolean } = {}): Builder {
  return (t) => {
    const datasets: ChartDataset<'line'>[] = series.map((s) => {
      const color = t.series[s.colorIndex - 1] ?? t.series[0]!;
      return {
        label: s.label,
        data: s.data,
        borderColor: color,
        backgroundColor: s.fill ? alpha(color, 0.1) : color,
        fill: s.fill ? 'origin' : false,
        borderWidth: 2,
        borderDash: s.projection ? [5, 5] : [],
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        tension: 0.32,
        pointRadius: s.points ? 3 : 0,
        pointBackgroundColor: color,
        pointBorderColor: t.surface,
        pointBorderWidth: s.points ? 1.5 : 0,
        pointHoverRadius: 5,
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: t.surface,
        pointHoverBackgroundColor: color,
        spanGaps: !!s.points,
      };
    });
    const base = baseOptions(t, { yFormat: opts.yFormat, beginAtZero: opts.beginAtZero ?? false, maxTicksX: opts.maxTicksX });
    if (opts.zeroLine) {
      (base.scales.y as { grid: Record<string, unknown> }).grid = {
        color: (ctx: { tick?: { value: number } }) => (ctx.tick?.value === 0 ? t.axis : t.grid),
        lineWidth: 1,
        drawTicks: false,
      };
    }
    return { type: 'line', data: { labels, datasets }, options: base } as ChartConfiguration;
  };
}

export interface BarSeries {
  label: string;
  data: number[];
  colorIndex: number;
  /** Série de linha sobreposta (mesmo eixo, mesma unidade). */
  asLine?: boolean;
}

export function barChart(labels: string[], series: BarSeries[], opts: { yFormat?: ValueFormat; stacked?: boolean; horizontal?: boolean; maxTicksX?: number } = {}): Builder {
  return (t) => {
    const datasets = series.map((s) => {
      const color = t.series[s.colorIndex - 1] ?? t.series[0]!;
      if (s.asLine) {
        return {
          type: 'line' as const,
          label: s.label,
          data: s.data,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: color,
          pointBorderColor: t.surface,
          pointBorderWidth: 2,
          pointHoverRadius: 5,
          order: 0,
        };
      }
      return {
        type: 'bar' as const,
        label: s.label,
        data: s.data,
        backgroundColor: color,
        hoverBackgroundColor: color,
        borderRadius: opts.stacked ? 4 : ({ topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } as const),
        borderSkipped: 'start' as const,
        maxBarThickness: 24,
        categoryPercentage: 0.7,
        barPercentage: 0.9,
        borderColor: t.surface,
        borderWidth: opts.stacked ? { top: 2 } : 0,
        order: 1,
      };
    });
    if (opts.horizontal) {
      for (const d of datasets) {
        if (d.type === 'bar') (d as { borderRadius: unknown }).borderRadius = { topRight: 4, bottomRight: 4, topLeft: 0, bottomLeft: 0 };
      }
    }
    return {
      type: 'bar',
      data: { labels, datasets },
      options: baseOptions(t, { yFormat: opts.yFormat, stacked: opts.stacked, horizontal: opts.horizontal, maxTicksX: opts.maxTicksX }),
    } as unknown as ChartConfiguration;
  };
}

export function doughnutChart(labels: string[], values: number[], colorIndexes: number[], opts: { yFormat?: ValueFormat } = {}): Builder {
  return (t) => ({
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colorIndexes.map((i) => t.series[i - 1] ?? t.muted),
          hoverBackgroundColor: colorIndexes.map((i) => t.series[i - 1] ?? t.muted),
          borderColor: t.surface,
          borderWidth: 2,
          hoverOffset: 4,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      animation: reduceMotion() ? false : { duration: 600, easing: 'easeOutCubic' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.inverse,
          titleColor: t.inverseText,
          bodyColor: t.inverseText,
          cornerRadius: 10,
          padding: 10,
          bodyFont: { family: t.font, size: 12 },
          callbacks: {
            label: (ctx: TooltipItem<'doughnut'>) => {
              const total = (ctx.dataset.data as number[]).reduce((s, x) => s + x, 0);
              const v = Number(ctx.raw);
              return ` ${ctx.label}: ${fmt(v, opts.yFormat ?? 'money')} (${formatPercent(total ? v / total : 0)})`;
            },
          },
        },
      },
    },
  } as ChartConfiguration);
}
