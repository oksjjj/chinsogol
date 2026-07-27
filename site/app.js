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

function parseContestValue(contest) {
  const match = contest.match(/(\d+)년\s*(\d+)월/);
  if (!match) return Number.NEGATIVE_INFINITY;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year * 100 + month;
}

function sortContestsLatestFirst(list) {
  return Array.from(new Set(list)).sort((a, b) => {
    const diff = parseContestValue(b) - parseContestValue(a);
    return diff !== 0 ? diff : b.localeCompare(a, "ko");
  });
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

function renderLineChart(container, chartData) {
  container.innerHTML = "";

  if (chartData.length === 0) {
    container.innerHTML = '<p class="muted">표시할 대회 데이터가 없습니다.</p>';
    return;
  }

  const count = chartData.length;
  const needsScroll = count > 8;
  const isMobile = window.matchMedia("(max-width: 700px)").matches;
  const pointGap = count >= 20 ? 64 : 56;
  const width = needsScroll ? Math.max(720, (count - 1) * pointGap + 140) : 720;
  const labelBudget = isMobile ? 96 : 56;
  const provisionalPlotWidth = width - 80;
  const needsTilt =
    count > 1 &&
    (needsScroll ||
      (isMobile && count >= 3) ||
      count * labelBudget > provisionalPlotWidth);
  const height = needsTilt ? 380 : 360;
  const padding = needsTilt
    ? { top: 40, right: 48, bottom: 140, left: 84 }
    : { top: 40, right: 64, bottom: 118, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = chartData.map((item) => item.total);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(maxValue - minValue, 1);
  const labelStep = Math.max(1, Math.ceil(count / 10));

  const points = chartData.map((item, index) => {
    const x =
      count === 1
        ? padding.left + plotWidth / 2
        : padding.left + (plotWidth * index) / (count - 1);
    const normalized = (item.total - minValue) / range;
    const y = padding.top + plotHeight - normalized * plotHeight;
    const showLabel =
      count <= 8 ||
      index === 0 ||
      index === count - 1 ||
      index % labelStep === 0;
    return { ...item, x, y, showLabel };
  });

  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const ticks = [0, 0.5, 1].map((ratio) => {
    const y = padding.top + plotHeight * ratio;
    return { y };
  });

  const labels = points
    .map((point) => {
      const axisLabel = !point.showLabel
        ? ""
        : needsTilt
          ? `<text
              x="${point.x}"
              y="${height - 24}"
              text-anchor="end"
              transform="rotate(-40 ${point.x} ${height - 24})"
              class="line-chart-label"
            >${point.contest}</text>`
          : `<text
              x="${point.x}"
              y="${height - 36}"
              text-anchor="middle"
              class="line-chart-label"
            >${point.contest}</text>`;

      return `
        <g class="chart-point-group">
          <circle cx="${point.x}" cy="${point.y}" r="6" class="line-chart-point"></circle>
          <text x="${point.x}" y="${point.y - 14}" text-anchor="middle" class="line-chart-value">${point.total}</text>
          ${axisLabel}
        </g>`;
    })
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

  const svgSizeAttrs = needsScroll
    ? `width="${width}"`
    : `width="100%" preserveAspectRatio="xMidYMid meet"`;

  container.innerHTML = `
    <div class="line-chart-card">
      <div class="line-chart-scroll${needsScroll ? " is-scrollable" : ""}">
        <svg
          viewBox="0 0 ${width} ${height}"
          ${svgSizeAttrs}
          class="line-chart"
          role="img"
          aria-label="대회별 스트로크 추이 그래프"
        >
          ${grid}
          <polyline points="${polylinePoints}" class="line-chart-path"></polyline>
          ${labels}
        </svg>
      </div>
    </div>
  `;
}

async function renderHome() {
  const rows = await loadRows();
  const contests = sortContestsLatestFirst(rows.map((r) => r.contest));
  const names = uniqueSorted(rows.map((r) => r.name));

  makeLinkList(
    document.querySelector("#contestList"),
    contests,
    "contest",
    "contest.html",
  );
  makeLinkList(
    document.querySelector("#personList"),
    names,
    "name",
    "person.html",
  );
}

async function renderContest() {
  const rows = await loadRows();
  const contests = sortContestsLatestFirst(rows.map((r) => r.contest));
  const browse = document.querySelector("#contestBrowse");
  const detail = document.querySelector("#contestDetail");
  const list = document.querySelector("#contestList");
  const select = document.querySelector("#contestSelect");
  const body = document.querySelector("#contestTableBody");
  const title = document.querySelector("#contestTitle");
  const courseInfo = document.querySelector("#contestCourse");
  const queryContest = getParam("contest");
  const selectedContest =
    queryContest && contests.includes(queryContest) ? queryContest : "";

  if (!selectedContest) {
    browse.hidden = false;
    detail.hidden = true;
    makeLinkList(list, contests, "contest", "contest.html");
    return;
  }

  browse.hidden = true;
  detail.hidden = false;

  for (const c of contests) {
    const option = document.createElement("option");
    option.value = c;
    option.textContent = c;
    if (c === selectedContest) option.selected = true;
    select.appendChild(option);
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
        <td class="score-col">${item.total}</td>
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
  const browse = document.querySelector("#personBrowse");
  const detail = document.querySelector("#personDetail");
  const list = document.querySelector("#personList");
  const select = document.querySelector("#personSelect");
  const body = document.querySelector("#personTableBody");
  const title = document.querySelector("#personTitle");
  const chart = document.querySelector("#personContestChart");
  const queryName = getParam("name");
  const selectedName = queryName && names.includes(queryName) ? queryName : "";

  if (!selectedName) {
    browse.hidden = false;
    detail.hidden = true;
    makeLinkList(list, names, "name", "person.html");
    return;
  }

  browse.hidden = true;
  detail.hidden = false;

  for (const n of names) {
    const option = document.createElement("option");
    option.value = n;
    option.textContent = n;
    if (n === selectedName) option.selected = true;
    select.appendChild(option);
  }

  const draw = () => {
    const name = select.value;
    title.textContent = `${name} 대회별 차트`;

    const target = rows
      .filter((r) => r.name === name)
      .sort((a, b) => parseContestValue(b.contest) - parseContestValue(a.contest));

    const contestTotals = new Map();
    for (const item of target) {
      const prev = contestTotals.get(item.contest) || 0;
      contestTotals.set(item.contest, prev + item.stroke);
    }

    const chartData = Array.from(contestTotals.entries())
      .map(([contest, total]) => ({ contest, total }))
      .sort((a, b) => parseContestValue(a.contest) - parseContestValue(b.contest));
    renderLineChart(chart, chartData);

    body.innerHTML = "";
    for (const item of target) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><a href="contest.html?contest=${encodeURIComponent(item.contest)}">${item.contest}</a></td>
        <td>${item.course}</td>
        <td class="score-col">${item.stroke}</td>
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
