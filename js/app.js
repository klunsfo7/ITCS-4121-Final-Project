// ===============================
// GLOBAL VARIABLES
// ===============================
let mentalData = [];
let perfData = [];

const tooltip = d3.select("#tooltip");

// ===============================
// HELPER: CGPA MIDPOINT
// ===============================
function cgpaMid(band) {
  if (!band) return null;
  const parts = band.split("-");
  if (parts.length !== 2) return null;
  const a = parseFloat(parts[0]);
  const b = parseFloat(parts[1]);
  if (isNaN(a) || isNaN(b)) return null;
  return (a + b) / 2;
}

// ===============================
// TAB NAVIGATION
// ===============================
function setupNav() {
  const buttons = d3.selectAll("#viz-nav button");
  const sections = d3.selectAll(".viz");

  buttons.on("click", function () {
    const targetId = this.getAttribute("data-target");

    buttons.classed("active", false);
    d3.select(this).classed("active", true);

    sections.classed("active", false);
    d3.select(`#${targetId}`).classed("active", true);
  });
}

// ===============================
// DATA LOADING
// ===============================
function loadData() {
  Promise.all([
    // Mental health dataset
    d3.csv("data/mental_health_clean.csv", d => ({
      gender: d.gender,
      age: +d.age,
      university: d.university,
      degree_level: d.degree_level,
      major: d.major,
      academic_year: d.academic_year,
      cgpa_band: d.cgpa,
      cgpa_numeric: d.cgpa_numeric ? +d.cgpa_numeric : null,
      // depression/anxiety on 1–5 scale
      depression: d.depression ? +d.depression : null,
      anxiety: d.anxiety ? +d.anxiety : null
    })),

    // Academic performance dataset
    d3.csv("data/student_performance_clean.csv", d => ({
      gender: d.gender,
      race_group: d.race_group,
      parent_education: d.parent_education,
      lunch: d.lunch,             // not used yet, but kept
      test_prep: d.test_prep,
      math_score: +d.math_score,
      reading_score: +d.reading_score,
      writing_score: +d.writing_score
    }))
  ])
  .then(([mh, sp]) => {
    mentalData = mh;
    perfData = sp;

    d3.select("#mh-count").text(mentalData.length);
    d3.select("#sp-count").text(perfData.length);

    renderMentalChart();
    renderPerfPlaceholder();

    d3.select("#mh-gender-filter").on("change", renderMentalChart);
    d3.select("#mh-condition-select").on("change", renderMentalChart);

    d3.select("#sp-prep-filter").on("change", renderPerfPlaceholder);
    d3.select("#sp-score-select").on("change", renderPerfPlaceholder);
  })
  .catch(err => console.error("Error loading data:", err));
}

// ===============================
// MENTAL HEALTH BAR CHART
// (Moderate + High = "depressed/anxious")
// ===============================
function renderMentalChart() {
  const svg = d3.select("#mh-svg");
  svg.selectAll("*").remove();

  const width = parseInt(svg.style("width"));
  const height = parseInt(svg.style("height"));
  const margin = { top: 28, right: 20, bottom: 60, left: 80 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const genderFilter = d3.select("#mh-gender-filter").property("value");
  const conditionKey = d3.select("#mh-condition-select").property("value"); // "depression" | "anxiety"

  // 3–5 on the 1–5 scale = moderate or high
  const THRESHOLD = 3;

  let data = mentalData;
  if (genderFilter !== "All") {
    data = data.filter(d => d.gender === genderFilter);
  }

  // Group by CGPA band
  const grouped = d3.rollups(
    data,
    v => {
      const total = v.length;
      const positive = v.filter(d => d[conditionKey] != null && d[conditionKey] >= THRESHOLD).length;
      const rate = total ? positive / total : 0;
      return { total, positive, rate };
    },
    d => d.cgpa_band
  )
  .filter(([band]) => band)
  .map(([band, stats]) => ({
    band,
    total: stats.total,
    positive: stats.positive,
    rate: stats.rate,
    mid: cgpaMid(band)
  }))
  .filter(d => d.total > 0)
  .sort((a, b) => d3.ascending(a.mid, b.mid));

  if (!grouped.length) {
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#9ca3af")
      .text("No data available for this filter.");
    return;
  }

  // Scales
  const xScale = d3.scaleBand()
    .domain(grouped.map(d => d.band))
    .range([0, innerWidth])
    .padding(0.25);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(grouped, d => d.rate) || 0.5])
    .nice()
    .range([innerHeight, 0]);

  // Axes
  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale))
    .selectAll("text")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 11);

  g.append("g")
    .call(d3.axisLeft(yScale).ticks(6).tickFormat(d3.format(".0%")))
    .selectAll("text")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 11);

  g.selectAll(".domain, .tick line")
    .attr("stroke", "#4b5563");

  // Labels
  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 45)
    .attr("text-anchor", "middle")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 12)
    .text("CGPA band");

  const conditionLabel =
    conditionKey === "depression"
      ? "Depression rate (moderate + high)"
      : "Anxiety rate (moderate + high)";

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -70)
    .attr("text-anchor", "middle")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 12)
    .text(conditionLabel);

  const barColor = conditionKey === "depression" ? "#ef4444" : "#22c55e";

  // Bars
  g.selectAll("rect")
    .data(grouped)
    .enter()
    .append("rect")
    .attr("x", d => xScale(d.band))
    .attr("y", d => yScale(d.rate))
    .attr("width", xScale.bandwidth())
    .attr("height", d => innerHeight - yScale(d.rate))
    .attr("fill", barColor)
    .attr("opacity", 0.9)
    .on("mouseover", (event, d) => {
      tooltip
        .style("display", "block")
        .html(`
          <strong>CGPA:</strong> ${d.band}<br/>
          <strong>Moderate+high ${conditionKey}:</strong> ${d.positive} / ${d.total}<br/>
          <strong>Rate:</strong> ${(d.rate * 100).toFixed(1)}%
        `);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", (event.pageX + 14) + "px")
        .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseout", () => tooltip.style("display", "none"));
}

// ===============================
// PERFORMANCE PLACEHOLDER
// ===============================
function renderPerfPlaceholder() {
  const svg = d3.select("#sp-svg");
  svg.selectAll("*").remove();

  const width = parseInt(svg.style("width"));
  const height = parseInt(svg.style("height"));
  const margin = { top: 20, right: 20, bottom: 30, left: 20 };

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const prepFilter = d3.select("#sp-prep-filter").property("value");
  const scoreKey = d3.select("#sp-score-select").property("value");

  let data = perfData;
  if (prepFilter !== "All") {
    data = data.filter(d => d.test_prep === prepFilter);
  }

  const total = data.length;
  const avg = total ? d3.mean(data, d => d[scoreKey]) : null;

  const cx = (width - margin.left - margin.right) / 2;
  const cy = (height - margin.top - margin.bottom) / 2;

  const scoreLabel = {
    math_score: "average math score",
    reading_score: "average reading score",
    writing_score: "average writing score"
  };

  g.append("text")
    .attr("x", cx)
    .attr("y", cy - 10)
    .attr("text-anchor", "middle")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 20)
    .text(avg != null ? avg.toFixed(1) : "–");

  g.append("text")
    .attr("x", cx)
    .attr("y", cy + 12)
    .attr("text-anchor", "middle")
    .attr("fill", "#9ca3af")
    .attr("font-size", 13)
    .text(avg != null ? scoreLabel[scoreKey] : "No data");
}

// ===============================
// INIT
// ===============================
setupNav();
loadData();
