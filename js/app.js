// js/app.js – Student mental health & performance dashboard

let academicData = [];
let currentFilters = {
  gender: "all",
  attendance: "all"
};

const tooltip = d3.select("#tooltip");

// ----- DATA LOAD -----
function loadData() {
  d3.csv("data/student_academic_performance.csv", d => ({
    Student_ID: d.Student_ID,
    Age: +d.Age,
    Gender: d.Gender,
    StudyHours: +d.Study_Hours_per_Day,
    SleepHours: +d.Sleep_Hours,
    Attendance: +d["Attendance_%"],
    Assignments: +d["Assignments_Completed_%"],
    Midterm: +d.Midterm_Score,
    Final: +d.Final_Score,
    Stress: +d["Stress_Level_(1-10)"],
    SocialMedia: +d.Social_Media_Hours,
    GPA: +d.GPA
  }))
    .then(data => {
      academicData = data.filter(d =>
        !Number.isNaN(d.GPA) &&
        !Number.isNaN(d.SleepHours) &&
        !Number.isNaN(d.Stress) &&
        !Number.isNaN(d.StudyHours)
      );

      const countEl = d3.select("#student-count");
      if (!countEl.empty()) {
        countEl.text(academicData.length);
      }

      initDashboard();
    })
    .catch(err => {
      console.error("Error loading student_academic_performance.csv:", err);
    });
}

// ----- GLOBAL METADATA -----
const factorMeta = {
  SleepHours: { label: "Sleep hours per night", color: "#38bdf8" },
  Stress: { label: "Stress level (1–10)", color: "#ef4444" },
  StudyHours: { label: "Study hours per day", color: "#22c55e" },
  Attendance: { label: "Attendance (%)", color: "#a855f7" },
  SocialMedia: { label: "Social media hours", color: "#f97316" }
};

const outcomeMeta = {
  GPA: { label: "GPA (0–4)", domain: [0, 4] },
  Midterm: { label: "Midterm score", domain: [0, 100] },
  Final: { label: "Final exam score", domain: [0, 100] },
  Assignments: { label: "Assignments completed (%)", domain: [0, 100] }
};

// initial combos for the 3 charts
const scatterConfigs = [
  { id: 1, svgId: "#scatter-1", factorKey: "SleepHours", outcomeKey: "GPA" },
  { id: 2, svgId: "#scatter-2", factorKey: "Stress", outcomeKey: "GPA" },
  { id: 3, svgId: "#scatter-3", factorKey: "StudyHours", outcomeKey: "GPA" }
];

// ----- INIT & EVENT WIRING -----
function initDashboard() {
  initFilterControls();
  initScatterControls();
  renderAll();
}

function getFilteredData() {
  let rows = academicData;

  // gender filter (expects Male/Female or similar)
  if (currentFilters.gender !== "all") {
    rows = rows.filter(d => (d.Gender || "").toLowerCase() === currentFilters.gender);
  }

  // attendance filter
  if (currentFilters.attendance === "80plus") {
    rows = rows.filter(d => !Number.isNaN(d.Attendance) && d.Attendance >= 80);
  } else if (currentFilters.attendance === "90plus") {
    rows = rows.filter(d => !Number.isNaN(d.Attendance) && d.Attendance >= 90);
  }

  return rows;
}

function initFilterControls() {
  const genderSelect = document.getElementById("filter-gender");
  const attendanceSelect = document.getElementById("filter-attendance");

  if (genderSelect) {
    genderSelect.addEventListener("change", () => {
      currentFilters.gender = genderSelect.value;
      renderAll();
    });
  }

  if (attendanceSelect) {
    attendanceSelect.addEventListener("change", () => {
      currentFilters.attendance = attendanceSelect.value;
      renderAll();
    });
  }
}

function initScatterControls() {
  scatterConfigs.forEach(cfg => {
    const factorSelect = document.querySelector(
      `.scatter-controls[data-chart="${cfg.id}"] .factor-select`
    );
    const outcomeSelect = document.querySelector(
      `.scatter-controls[data-chart="${cfg.id}"] .outcome-select`
    );

    if (!factorSelect || !outcomeSelect) return;

    // Populate factor options
    factorSelect.innerHTML = "";
    Object.entries(factorMeta).forEach(([key, meta]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = meta.label;
      if (key === cfg.factorKey) opt.selected = true;
      factorSelect.appendChild(opt);
    });

    // Populate outcome options
    outcomeSelect.innerHTML = "";
    Object.entries(outcomeMeta).forEach(([key, meta]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = meta.label;
      if (key === cfg.outcomeKey) opt.selected = true;
      outcomeSelect.appendChild(opt);
    });

    factorSelect.addEventListener("change", () => {
      cfg.factorKey = factorSelect.value;
      renderScatterForConfig(cfg);
    });

    outcomeSelect.addEventListener("change", () => {
      cfg.outcomeKey = outcomeSelect.value;
      renderScatterForConfig(cfg);
    });
  });
}

function renderAll() {
  renderEffectSummaryBars();
  scatterConfigs.forEach(cfg => renderScatterForConfig(cfg));
}

// ----- LAYOUT & MATH HELPERS -----
function initSvg(svgSelector, marginOverrides = {}) {
  const svg = d3.select(svgSelector);
  if (svg.empty()) return null;
  svg.selectAll("*").remove();

  const defaultMargin = { top: 28, right: 16, bottom: 55, left: 70 };
  const margin = Object.assign({}, defaultMargin, marginOverrides);

  const node = svg.node();
  const bbox = node.getBoundingClientRect();
  const width = bbox.width || 800;
  const height = parseInt(svg.style("height")) || 420;

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  return { svg, g, innerWidth, innerHeight, margin };
}

function linearRegression(data, xKey, yKey) {
  const pts = data.filter(d =>
    !Number.isNaN(d[xKey]) && !Number.isNaN(d[yKey])
  );
  const n = pts.length;
  if (!n) return null;

  const meanX = d3.mean(pts, d => d[xKey]);
  const meanY = d3.mean(pts, d => d[yKey]);

  let num = 0, den = 0;
  for (const d of pts) {
    const dx = d[xKey] - meanX;
    const dy = d[yKey] - meanY;
    num += dx * dy;
    den += dx * dx;
  }
  if (den === 0) return null;

  const slope = num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

function computeCorrelation(xArr, yArr) {
  const n = xArr.length;
  if (n === 0 || yArr.length !== n) return 0;

  const meanX = d3.mean(xArr);
  const meanY = d3.mean(yArr);

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xArr[i] - meanX;
    const dy = yArr[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

// ----- CORRELATION BAR CHART (SUMMARY) -----
function renderEffectSummaryBars() {
  const layout = initSvg("#corr-bars", { bottom: 70, left: 70, right: 20, top: 30 });
  if (!layout) return;
  const { g, innerWidth, innerHeight } = layout;

  const data = getFilteredData();
  if (!data.length) {
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#9ca3af")
      .text("No data for current filters.");
    return;
  }

  const factors = [
    { key: "SleepHours", label: "Sleep" },
    { key: "Stress", label: "Stress" },
    { key: "StudyHours", label: "Study" }
  ];

  const outcomes = [
    { key: "GPA", label: "GPA" },
    { key: "Midterm", label: "Midterm" },
    { key: "Final", label: "Final" },
    { key: "Assignments", label: "Assignments %" }
  ];

  const rows = [];
  outcomes.forEach(out => {
    factors.forEach(f => {
      const valid = data.filter(d =>
        !Number.isNaN(d[f.key]) && !Number.isNaN(d[out.key])
      );
      const xArr = valid.map(d => d[f.key]);
      const yArr = valid.map(d => d[out.key]);
      const r = computeCorrelation(xArr, yArr);

      rows.push({
        outcomeKey: out.key,
        outcomeLabel: out.label,
        factorKey: f.key,
        factorLabel: f.label,
        color: factorMeta[f.key].color,
        r
      });
    });
  });

  const x0 = d3.scaleBand()
    .domain(outcomes.map(o => o.label))
    .range([0, innerWidth])
    .padding(0.25);

  const x1 = d3.scaleBand()
    .domain(factors.map(f => f.label))
    .range([0, x0.bandwidth()])
    .padding(0.08);

  const rExtent = d3.extent(rows, d => d.r);
  const maxAbs = Math.max(Math.abs(rExtent[0] || 0), Math.abs(rExtent[1] || 0), 0.1);

  const y = d3.scaleLinear()
    .domain([-maxAbs, maxAbs])
    .nice()
    .range([innerHeight, 0]);

  const xAxis = d3.axisBottom(x0);
  const yAxis = d3.axisLeft(y)
    .ticks(5)
    .tickFormat(d3.format(".1f"));

  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll("text")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 11);

  g.append("g")
    .call(yAxis)
    .selectAll("text")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 11);

  g.selectAll(".domain, .tick line")
    .attr("stroke", "#4b5563");

  // zero line
  g.append("line")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", y(0))
    .attr("y2", y(0))
    .attr("stroke", "#6b7280")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "4,3");

  // grouped bars
  g.selectAll(".outcome-group")
    .data(outcomes)
    .enter()
    .append("g")
    .attr("class", "outcome-group")
    .attr("transform", d => `translate(${x0(d.label)},0)`)
    .each(function (out) {
      const group = d3.select(this);
      const subset = rows.filter(r => r.outcomeKey === out.key);

      group.selectAll("rect")
        .data(subset)
        .enter()
        .append("rect")
        .attr("x", d => x1(d.factorLabel))
        .attr("y", d => d.r >= 0 ? y(d.r) : y(0))
        .attr("width", x1.bandwidth())
        .attr("height", d => Math.abs(y(d.r) - y(0)))
        .attr("fill", d => d.color)
        .attr("opacity", 0.9)
        .on("mouseover", (event, d) => {
          tooltip
            .style("display", "block")
            .html(`
              <strong>${d.factorLabel}</strong> → <strong>${d.outcomeLabel}</strong><br/>
              Correlation r = ${d.r.toFixed(2)}<br/>
              ${
                d.r > 0
                  ? "Higher " + d.factorLabel.toLowerCase() + " tends to go with higher " + d.outcomeLabel
                  : "Higher " + d.factorLabel.toLowerCase() + " tends to go with lower " + d.outcomeLabel
              }
            `);
        })
        .on("mousemove", event => {
          tooltip
            .style("left", (event.pageX + 14) + "px")
            .style("top", (event.pageY - 20) + "px");
        })
        .on("mouseout", () => tooltip.style("display", "none"));
    });

  // axis labels
  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 40)
    .attr("text-anchor", "middle")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 12)
    .text("Academic outcome");

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -50)
    .attr("text-anchor", "middle")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 12)
    .text("Correlation with factor (r)");

  // legend
  const legend = g.append("g")
    .attr("transform", `translate(${innerWidth - 140}, 0)`);

  const legendItems = factors;
  legendItems.forEach((f, i) => {
    const yOffset = i * 18;
    legend.append("rect")
      .attr("x", 0)
      .attr("y", yOffset)
      .attr("width", 10)
      .attr("height", 10)
      .attr("fill", factorMeta[f.key].color);

    legend.append("text")
      .attr("x", 16)
      .attr("y", yOffset + 9)
      .attr("fill", "#e5e7eb")
      .attr("font-size", 11)
      .text(f.label);
  });
}

// ----- SCATTERPLOTS -----
function renderScatterForConfig(cfg) {
  const factor = factorMeta[cfg.factorKey];
  const outcome = outcomeMeta[cfg.outcomeKey];
  if (!factor || !outcome) return;

  renderScatter({
    svgId: cfg.svgId,
    xKey: cfg.factorKey,
    yKey: cfg.outcomeKey,
    xLabel: factor.label,
    yLabel: outcome.label,
    yDomain: outcome.domain,
    color: factor.color
  });

  const titleEl = document.querySelector(
    `.scatter-card[data-chart="${cfg.id}"] .mini-title-main`
  );
  const subEl = document.querySelector(
    `.scatter-card[data-chart="${cfg.id}"] .mini-title-sub`
  );
  if (titleEl) {
    titleEl.textContent = `${factor.label} vs ${outcome.label}`;
  }
  if (subEl) {
    subEl.textContent = `Exploring how ${factor.label.toLowerCase()} relates to ${outcome.label.toLowerCase()} for the selected students.`;
  }
}

function renderScatter({ svgId, xKey, yKey, xLabel, yLabel, yDomain, color }) {
  const layout = initSvg(svgId, { top: 20, right: 12, bottom: 45, left: 55 });
  if (!layout) return;
  const { g, innerWidth, innerHeight } = layout;

  const data = getFilteredData().filter(d =>
    !Number.isNaN(d[xKey]) && !Number.isNaN(d[yKey])
  );

  if (!data.length) {
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#9ca3af")
      .text("No data for this combination.");
    return;
  }

  const xExtent = d3.extent(data, d => d[xKey]);
  const xMin = Math.max(0, xExtent[0]);
  const xMax = xExtent[1];

  const xScale = d3.scaleLinear()
    .domain([xMin, xMax])
    .nice()
    .range([0, innerWidth]);

  let yScale;
  if (yDomain) {
    yScale = d3.scaleLinear()
      .domain(yDomain)
      .nice()
      .range([innerHeight, 0]);
  } else {
    const yExtent = d3.extent(data, d => d[yKey]);
    yScale = d3.scaleLinear()
      .domain(yExtent)
      .nice()
      .range([innerHeight, 0]);
  }

  const xAxis = d3.axisBottom(xScale).ticks(5);
  const yAxis = d3.axisLeft(yScale).ticks(4);

  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll("text")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 9);

  g.append("g")
    .call(yAxis)
    .selectAll("text")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 9);

  g.selectAll(".domain, .tick line")
    .attr("stroke", "#4b5563");

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 30)
    .attr("text-anchor", "middle")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 10)
    .text(xLabel);

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -42)
    .attr("text-anchor", "middle")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 10)
    .text(yLabel);

  g.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d[xKey]))
    .attr("cy", d => yScale(d[yKey]))
    .attr("r", 3)
    .attr("fill", color)
    .attr("opacity", 0.85)
    .on("mouseover", (event, d) => {
      tooltip
        .style("display", "block")
        .html(`
          <strong>ID:</strong> ${d.Student_ID}<br/>
          <strong>${xLabel}:</strong> ${d[xKey].toFixed(2)}<br/>
          <strong>${yLabel}:</strong> ${d[yKey].toFixed(2)}<br/>
          <strong>GPA:</strong> ${
            !Number.isNaN(d.GPA) ? d.GPA.toFixed(2) : "–"
          }
        `);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", (event.pageX + 14) + "px")
        .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseout", () => tooltip.style("display", "none"));

  const lr = linearRegression(data, xKey, yKey);
  if (lr) {
    const x0 = xScale.domain()[0];
    const x1 = xScale.domain()[1];
    const y0 = lr.slope * x0 + lr.intercept;
    const y1 = lr.slope * x1 + lr.intercept;

    g.append("line")
      .attr("x1", xScale(x0))
      .attr("y1", yScale(y0))
      .attr("x2", xScale(x1))
      .attr("y2", yScale(y1))
      .attr("stroke", "#fbbf24")
      .attr("stroke-width", 1.8)
      .attr("stroke-opacity", 0.95);
  }
}

// ----- BOOTSTRAP -----
loadData();
