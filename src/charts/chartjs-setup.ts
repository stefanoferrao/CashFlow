/**
 * Registro mínimo do Chart.js (tree-shaking): só os controladores/elementos usados pelo app.
 * Carregado sob demanda por charts.ts.
 */
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

Chart.register(LineController, BarController, DoughnutController, LineElement, BarElement, PointElement, ArcElement, LinearScale, CategoryScale, Filler, Tooltip);

export { Chart };
