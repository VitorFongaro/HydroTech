import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://dugcncoovouahoobsrbm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_th-tu9bzeZmsvKxlAzfASg_fUAdoG2j";

const REFRESH_INTERVAL_MS = 5000;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const COST_PER_LITER = 0.0064;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  readings: [],
  charts: {},
  firstLoad: true,
  lastRealtimeAt: null,
};

const els = {
  loader: document.querySelector("#loader"),
  totalLiters: document.querySelector("#totalLiters"),
  totalCost: document.querySelector("#totalCost"),
  currentFlow: document.querySelector("#currentFlow"),
  uptime: document.querySelector("#uptime"),
  systemStatus: document.querySelector("#systemStatus"),
  statusDot: document.querySelector("#statusDot"),
  clock: document.querySelector("#clock"),
  dateLabel: document.querySelector("#dateLabel"),
  peakHour: document.querySelector("#peakHour"),
  peakHourDetail: document.querySelector("#peakHourDetail"),
  highestCostDay: document.querySelector("#highestCostDay"),
  highestCostDetail: document.querySelector("#highestCostDetail"),
  historyBody: document.querySelector("#historyBody"),
  emptyState: document.querySelector("#emptyState"),
  lastUpdate: document.querySelector("#lastUpdate"),
  refreshButton: document.querySelector("#refreshButton"),
  toastContainer: document.querySelector("#toastContainer"),
};

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

// Conversoes defensivas mantem o painel estavel mesmo quando o sensor envia algum campo vazio.
function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatLiters(value) {
  return `${numberFormatter.format(toNumber(value))} L`;
}

function formatFlow(value) {
  return `${numberFormatter.format(toNumber(value))} L/min`;
}

function getReadingCost(reading) {
  const storedCost = toNumber(reading?.custo_reais);
  return storedCost > 0 ? storedCost : toNumber(reading?.litros) * COST_PER_LITER;
}

function formatDuration(totalSeconds) {
  let remaining = Math.max(0, Math.floor(toNumber(totalSeconds)));
  const days = Math.floor(remaining / 86400);
  remaining %= 86400;
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || hours || days) parts.push(`${minutes}min`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localHourKey(date) {
  return `${localDateKey(date)}T${String(date.getHours()).padStart(2, "0")}`;
}

function showLoader(visible) {
  els.loader.classList.toggle("hidden", !visible);
}

function showToast(title, message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  els.toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    window.setTimeout(() => toast.remove(), 240);
  }, 3600);
}

function startClock() {
  const updateClock = () => {
    const now = new Date();
    els.clock.textContent = now.toLocaleTimeString("pt-BR");
    els.dateLabel.textContent = now.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  updateClock();
  window.setInterval(updateClock, 1000);
}

function createGradient(ctx, colorStart, colorEnd) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, colorStart);
  gradient.addColorStop(1, colorEnd);
  return gradient;
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(6, 17, 31, 0.96)",
        borderColor: "rgba(38, 217, 255, 0.25)",
        borderWidth: 1,
        padding: 12,
        titleColor: "#eef7ff",
        bodyColor: "#bdeeff",
        callbacks: {
          label: (context) => ` ${formatLiters(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: "rgba(139, 203, 255, 0.08)",
        },
        ticks: {
          color: "#8ea7bd",
          maxRotation: 0,
          autoSkip: true,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(139, 203, 255, 0.1)",
        },
        ticks: {
          color: "#8ea7bd",
          callback: (value) => `${numberFormatter.format(value)} L`,
        },
      },
    },
  };
}

function initCharts() {
  const chart24hCtx = document.querySelector("#chart24h").getContext("2d");
  const chart7dCtx = document.querySelector("#chart7d").getContext("2d");
  const chart30dCtx = document.querySelector("#chart30d").getContext("2d");

  state.charts.day = new Chart(chart24hCtx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: "#26d9ff",
        backgroundColor: createGradient(chart24hCtx, "rgba(38, 217, 255, 0.28)", "rgba(38, 217, 255, 0.02)"),
        borderWidth: 3,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.42,
        fill: true,
      }],
    },
    options: baseChartOptions(),
  });

  state.charts.week = new Chart(chart7dCtx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderRadius: 8,
        backgroundColor: createGradient(chart7dCtx, "rgba(55, 230, 161, 0.9)", "rgba(38, 217, 255, 0.45)"),
        hoverBackgroundColor: "rgba(55, 230, 161, 1)",
      }],
    },
    options: baseChartOptions(),
  });

  state.charts.month = new Chart(chart30dCtx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: "#5b8cff",
        backgroundColor: createGradient(chart30dCtx, "rgba(91, 140, 255, 0.3)", "rgba(91, 140, 255, 0.02)"),
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.36,
        fill: true,
      }],
    },
    options: baseChartOptions(),
  });
}

// Agregacoes locais evitam que o fuso UTC desloque leituras para outro dia no Brasil.
function updateChart(chart, labels, values) {
  chart.data.labels = labels;
  chart.data.datasets[0].data = values;
  chart.update("none");
}

function groupByHour(readings, hoursBack = 24) {
  const now = new Date();
  const buckets = new Map();

  for (let index = hoursBack - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setMinutes(0, 0, 0);
    date.setHours(now.getHours() - index);
    const key = localHourKey(date);
    buckets.set(key, {
      label: `${String(date.getHours()).padStart(2, "0")}h`,
      total: 0,
    });
  }

  readings.forEach((reading) => {
    const date = parseDate(reading.criado_em);
    if (now - date > hoursBack * 60 * 60 * 1000) return;
    date.setMinutes(0, 0, 0);
    const key = localHourKey(date);
    if (buckets.has(key)) {
      buckets.get(key).total += toNumber(reading.litros);
    }
  });

  return Array.from(buckets.values());
}

function groupByDay(readings, daysBack) {
  const now = new Date();
  const buckets = new Map();

  for (let index = daysBack - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(now.getDate() - index);
    const key = localDateKey(date);
    buckets.set(key, {
      date,
      label: dayFormatter.format(date),
      litros: 0,
      custo: 0,
    });
  }

  readings.forEach((reading) => {
    const date = parseDate(reading.criado_em);
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    if (now - normalized > daysBack * 24 * 60 * 60 * 1000) return;
    const key = localDateKey(normalized);
    if (buckets.has(key)) {
      buckets.get(key).litros += toNumber(reading.litros);
      buckets.get(key).custo += getReadingCost(reading);
    }
  });

  return Array.from(buckets.values());
}

function calculatePeakHour(readings) {
  const totals = new Map();

  readings.forEach((reading) => {
    const hour = parseDate(reading.criado_em).getHours();
    totals.set(hour, (totals.get(hour) || 0) + toNumber(reading.litros));
  });

  const peak = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])[0];
  if (!peak) return null;

  return {
    hour: `${String(peak[0]).padStart(2, "0")}:00`,
    liters: peak[1],
  };
}

function calculateHighestCostDay(readings) {
  const totals = new Map();

  readings.forEach((reading) => {
    const date = parseDate(reading.criado_em);
    const key = localDateKey(date);
    const current = totals.get(key) || {
      date,
      cost: 0,
      liters: 0,
    };
    current.cost += getReadingCost(reading);
    current.liters += toNumber(reading.litros);
    totals.set(key, current);
  });

  return Array.from(totals.values()).sort((a, b) => b.cost - a.cost)[0] || null;
}

function renderMetrics(readings) {
  const totals = readings.reduce((acc, reading) => {
    acc.liters += toNumber(reading.litros);
    acc.cost += getReadingCost(reading);
    return acc;
  }, { liters: 0, cost: 0 });

  const latest = readings[0];

  els.totalLiters.textContent = formatLiters(totals.liters);
  els.totalCost.textContent = currencyFormatter.format(totals.cost);
  els.currentFlow.textContent = formatFlow(latest?.fluxo_litros_min || 0);
  els.uptime.textContent = formatDuration(latest?.tempo_ligado_segundos || 0);
}

function renderStatus(readings) {
  const latest = readings[0];
  const latestDate = latest ? parseDate(latest.criado_em) : null;
  const recentlyUpdated = latestDate && Date.now() - latestDate.getTime() <= ONLINE_WINDOW_MS;
  const isOnline = Boolean(recentlyUpdated);

  els.systemStatus.textContent = isOnline ? "ONLINE" : "OFFLINE";
  els.statusDot.classList.toggle("online", isOnline);
  els.statusDot.classList.toggle("offline", !isOnline);
}

function renderCharts(readings) {
  const last24h = groupByHour(readings, 24);
  const last7d = groupByDay(readings, 7);
  const last30d = groupByDay(readings, 30);

  updateChart(state.charts.day, last24h.map((item) => item.label), last24h.map((item) => item.total));
  updateChart(state.charts.week, last7d.map((item) => item.label), last7d.map((item) => item.litros));
  updateChart(state.charts.month, last30d.map((item) => item.label), last30d.map((item) => item.litros));
}

function renderInsights(readings) {
  const peakHour = calculatePeakHour(readings);
  const highestCostDay = calculateHighestCostDay(readings);

  if (peakHour) {
    els.peakHour.textContent = peakHour.hour;
    els.peakHourDetail.textContent = `${formatLiters(peakHour.liters)} concentrados neste horário.`;
  } else {
    els.peakHour.textContent = "Sem dados";
    els.peakHourDetail.textContent = "Aguardando leituras do sensor.";
  }

  if (highestCostDay) {
    els.highestCostDay.textContent = highestCostDay.date.toLocaleDateString("pt-BR");
    els.highestCostDetail.textContent = `${currencyFormatter.format(highestCostDay.cost)} em ${formatLiters(highestCostDay.liters)} consumidos.`;
  } else {
    els.highestCostDay.textContent = "Sem dados";
    els.highestCostDetail.textContent = "Os custos serão calculados automaticamente.";
  }
}

function renderHistory(readings) {
  els.historyBody.innerHTML = "";
  els.emptyState.classList.toggle("hidden", readings.length > 0);

  readings.slice(0, 50).forEach((reading) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${dateFormatter.format(parseDate(reading.criado_em))}</td>
      <td>${formatLiters(reading.litros)}</td>
      <td>${currencyFormatter.format(toNumber(reading.custo_reais))}</td>
      <td>${formatFlow(reading.fluxo_litros_min)}</td>
      <td>${formatDuration(reading.tempo_ligado_segundos)}</td>
    `;
    els.historyBody.appendChild(row);
  });
}

function renderDashboard() {
  const { readings } = state;
  renderMetrics(readings);
  renderStatus(readings);
  renderCharts(readings);
  renderInsights(readings);
  renderHistory(readings);
  els.lastUpdate.textContent = `Atualizado ${new Date().toLocaleTimeString("pt-BR")}`;
}

async function carregarDados({ silent = false } = {}) {
  if (state.firstLoad && !silent) showLoader(true);

  try {
    const { data, error } = await supabase
      .from("consumo_agua")
      .select("*")
      .order("criado_em", { ascending: false });

    if (error) throw error;

    state.readings = Array.isArray(data) ? data : [];
    renderDashboard();

    if (state.firstLoad) {
      showToast("Dashboard conectado", "Dados sincronizados com o Supabase.", "success");
    }
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    renderStatus(state.readings);
    showToast("Erro ao carregar dados", error.message || "Verifique a conexão com o Supabase.", "error");
  } finally {
    state.firstLoad = false;
    showLoader(false);
  }
}

// Realtime dispara uma recarga imediata quando o ESP32 insere uma nova leitura.
function subscribeToRealtime() {
  supabase
    .channel("consumo")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "consumo_agua",
      },
      () => {
        state.lastRealtimeAt = Date.now();
        showToast("Nova leitura recebida", "O painel foi atualizado em tempo real.", "success");
        carregarDados({ silent: true });
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        renderStatus(state.readings);
      }
    });
}

function bindEvents() {
  els.refreshButton.addEventListener("click", () => {
    carregarDados({ silent: true });
    showToast("Atualizacao solicitada", "Buscando os registros mais recentes.", "success");
  });
}

function startAutoRefresh() {
  window.setInterval(() => {
    carregarDados({ silent: true });
  }, REFRESH_INTERVAL_MS);

  window.setInterval(() => {
    renderStatus(state.readings);
  }, 15000);
}

function boot() {
  startClock();
  initCharts();
  bindEvents();
  subscribeToRealtime();
  carregarDados();
  startAutoRefresh();
}

boot();
