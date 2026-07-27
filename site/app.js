let cache = null;

function getBuildVersion() {
  return document
    .querySelector('meta[name="build-version"]')
    ?.getAttribute("content")
    ?.trim() || "dev";
}

function withBuildVersion(path) {
  const version = encodeURIComponent(getBuildVersion());
  return `${path}?v=${version}`;
}

async function loadRows() {
  if (cache) return cache;

  const candidates = [withBuildVersion("score.txt"), withBuildVersion("../score.txt")];
  let text = "";
  let ok = false;

  for (const path of candidates) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (res.ok) {
        text = await res.text();
        ok = true;
        break;
      }
    } catch (_error) {
      // Try next candidate path.
    }
  }

  if (!ok) {
    throw new Error("score.txt를 불러오지 못했습니다.");
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split("\t");
    if (cols.length < 4) continue;
    rows.push({
      name: cols[0].trim(),
      contest: cols[1].trim(),
      course: cols[2].trim(),
      stroke: Number(cols[3].trim()),
    });
  }

  cache = rows.filter((row) => !Number.isNaN(row.stroke));
  return cache;
}

function uniqueSorted(list) {
  return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, "ko"));
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function makeLinkList(element, values, urlKey, pagePath) {
  element.innerHTML = "";
  for (const value of values) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `${pagePath}?${urlKey}=${encodeURIComponent(value)}`;
    a.textContent = value;
    li.appendChild(a);
    element.appendChild(li);
  }
}

function filterContains(values, keyword) {
  const q = keyword.trim().toLowerCase();
  if (!q) return values;
  return values.filter((value) => value.toLowerCase().includes(q));
}

function renderLineChart(container, chartData) {
  container.innerHTML = "";

  if (chartData.length === 0) {
    container.innerHTML = '<p class="muted">표시할 대회 데이터가 없습니다.</p>';
    return;
  }

  const width = 720;
  const height = 260;
  const padding = { top: 20, right: 24, bottom: 56, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = chartData.map((item) => item.total);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(maxValue - minValue, 1);

  const points = chartData.map((item, index) => {
    const x =
      chartData.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + (plotWidth * index) / (chartData.length - 1);
    const normalized = (item.total - minValue) / range;
    const y = padding.top + plotHeight - normalized * plotHeight;
    return { ...item, x, y };
  });

  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const ticks = [0, 0.5, 1].map((ratio) => {
    const value = Math.round(maxValue - ratio * range);
    const y = padding.top + plotHeight * ratio;
    return { value, y };
  });

  const labels = points
    .map(
      (point) => `
        <g class="chart-point-group">
          <circle cx="${point.x}" cy="${point.y}" r="5" class="line-chart-point"></circle>
          <text x="${point.x}" y="${point.y - 12}" text-anchor="middle" class="line-chart-value">${point.total}</text>
          <text x="${point.x}" y="${height - 20}" text-anchor="middle" class="line-chart-label">${point.contest}</text>
        </g>`,
    )
    .join("");

  const grid = ticks
    .map(
      (tick) => `
        <g>
          <line
            x1="${padding.left}"
            y1="${tick.y}"
            x2="${width - padding.right}"
            y2="${tick.y}"
            class="line-chart-grid"
          ></line>
        </g>`,
    )
    .join("");

  container.innerHTML = `
    <div class="line-chart-card">
      <svg viewBox="0 0 ${width} ${height}" class="line-chart" role="img" aria-label="대회별 스트로크 추이 그래프">
        ${grid}
        <polyline points="${polylinePoints}" class="line-chart-path"></polyline>
        ${labels}
      </svg>
    </div>
  `;
}

async function renderHome() {
  const rows = await loadRows();
  const contests = uniqueSorted(rows.map((r) => r.contest));
  const names = uniqueSorted(rows.map((r) => r.name));

  const contestSearch = document.querySelector("#contestSearch");
  const personSearch = document.querySelector("#personSearch");
  const contestList = document.querySelector("#contestList");
  const personList = document.querySelector("#personList");

  const draw = () => {
    makeLinkList(
      contestList,
      filterContains(contests, contestSearch.value),
      "contest",
      "contest.html",
    );
    makeLinkList(
      personList,
      filterContains(names, personSearch.value),
      "name",
      "person.html",
    );
  };

  contestSearch.addEventListener("input", draw);
  personSearch.addEventListener("input", draw);
  draw();
}

async function renderContest() {
  const rows = await loadRows();
  const contests = uniqueSorted(rows.map((r) => r.contest));
  const select = document.querySelector("#contestSelect");
  const body = document.querySelector("#contestTableBody");
  const title = document.querySelector("#contestTitle");
  const courseInfo = document.querySelector("#contestCourse");
  const queryContest = getParam("contest");

  for (const c of contests) {
    const option = document.createElement("option");
    option.value = c;
    option.textContent = c;
    if (queryContest && c === queryContest) option.selected = true;
    select.appendChild(option);
  }

  if (!select.value && contests.length > 0) {
    select.value = contests[0];
  }

  const draw = () => {
    const contest = select.value;
    title.textContent = `${contest} 스코어`;
    const target = rows.filter((r) => r.contest === contest);
    const course = target[0]?.course || "-";
    courseInfo.textContent = `코스: ${course}`;

    const byName = new Map();
    for (const row of target) {
      if (!byName.has(row.name)) byName.set(row.name, []);
      byName.get(row.name).push(row);
    }

    const ranked = Array.from(byName.entries())
      .map(([name, items]) => ({
        name,
        total: items.reduce((sum, item) => sum + item.stroke, 0),
      }))
      .sort((a, b) => a.total - b.total);

    body.innerHTML = "";
    ranked.forEach((item, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><a href="person.html?name=${encodeURIComponent(item.name)}">${item.name}</a></td>
        <td>${item.total}</td>
      `;
      body.appendChild(tr);
    });

    const url = new URL(window.location.href);
    url.searchParams.set("contest", contest);
    window.history.replaceState({}, "", url);
  };

  select.addEventListener("change", draw);
  draw();
}

async function renderPerson() {
  const rows = await loadRows();
  const names = uniqueSorted(rows.map((r) => r.name));
  const select = document.querySelector("#personSelect");
  const body = document.querySelector("#personTableBody");
  const title = document.querySelector("#personTitle");
  const chart = document.querySelector("#personContestChart");
  const queryName = getParam("name");

  for (const n of names) {
    const option = document.createElement("option");
    option.value = n;
    option.textContent = n;
    if (queryName && n === queryName) option.selected = true;
    select.appendChild(option);
  }

  if (!select.value && names.length > 0) {
    select.value = names[0];
  }

  const draw = () => {
    const name = select.value;
    title.textContent = `${name} 대회별 차트`;

    const target = rows
      .filter((r) => r.name === name)
      .sort((a, b) => a.contest.localeCompare(b.contest, "ko"));

    const contestTotals = new Map();
    for (const item of target) {
      const prev = contestTotals.get(item.contest) || 0;
      contestTotals.set(item.contest, prev + item.stroke);
    }

    const chartData = Array.from(contestTotals.entries())
      .map(([contest, total]) => ({ contest, total }))
      .sort((a, b) => a.contest.localeCompare(b.contest, "ko"));
    renderLineChart(chart, chartData);

    body.innerHTML = "";
    for (const item of target) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><a href="contest.html?contest=${encodeURIComponent(item.contest)}">${item.contest}</a></td>
        <td>${item.course}</td>
        <td>${item.stroke}</td>
      `;
      body.appendChild(tr);
    }

    const url = new URL(window.location.href);
    url.searchParams.set("name", name);
    window.history.replaceState({}, "", url);
  };

  select.addEventListener("change", draw);
  draw();
}

async function bootstrap() {
  const page = document.body.dataset.page;
  if (page === "home") return renderHome();
  if (page === "contest") return renderContest();
  if (page === "person") return renderPerson();
  return null;
}

bootstrap().catch((error) => {
  console.error(error);
  const main = document.querySelector("main");
  if (main) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "데이터를 불러오는 중 오류가 발생했습니다.";
    main.appendChild(p);
  }
});
