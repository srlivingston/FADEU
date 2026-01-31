/* global require */

const dataUrl = "./data/points.geojson";
const basinSelect = document.getElementById("basin-select");
const stateSelect = document.getElementById("state-select");
const riverSelect = document.getElementById("river-select");
const depositionSelect = document.getElementById("deposition-select");
const ageMinInput = document.getElementById("age-min");
const ageMaxInput = document.getElementById("age-max");
const uncertaintyMaxInput = document.getElementById("uncertainty-max");
const ageModeSelect = document.getElementById("age-mode");
const sortOrderSelect = document.getElementById("sort-order");
const applyButton = document.getElementById("apply-filter");
const resetButton = document.getElementById("reset-filter");
const exportButton = document.getElementById("export-csv");
const resultsBody = document.getElementById("results-body");

let layerView;
let rawFeatures = [];
let lastResults = [];

const palette = [
  "#d95a3d",
  "#2c72bb",
  "#2f8f65",
  "#f1a93b",
  "#7a4dd8",
  "#0f4c81",
  "#c63f67",
];

const escapeSql = (value) => value.replace(/'/g, "''");
const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : value;

const getFilterState = () => {
  const basin = normalizeString(basinSelect.value);
  const state = normalizeString(stateSelect.value);
  const river = normalizeString(riverSelect.value);
  const depositionEnvironment = normalizeString(depositionSelect.value);
  const minAge =
    ageMinInput.value.trim() === "" ? Number.NaN : Number(ageMinInput.value);
  const maxAge =
    ageMaxInput.value.trim() === "" ? Number.NaN : Number(ageMaxInput.value);
  const maxUncertainty =
    uncertaintyMaxInput.value.trim() === ""
      ? Number.NaN
      : Number(uncertaintyMaxInput.value);
  const mode = ageModeSelect.value;

  return {
    basin,
    state,
    river,
    depositionEnvironment,
    minAge,
    maxAge,
    maxUncertainty,
    mode,
  };
};

const buildWhere = (state) => {
  const clauses = [];
  const {
    basin,
    state: stateValue,
    river,
    depositionEnvironment,
    minAge,
    maxAge,
    maxUncertainty,
    mode,
  } = state;

  if (basin) {
    clauses.push(`BASIN = '${escapeSql(basin)}'`);
  }
  if (stateValue) {
    clauses.push(`STATE = '${escapeSql(stateValue)}'`);
  }
  if (river) {
    clauses.push(`RIVER = '${escapeSql(river)}'`);
  }
  if (depositionEnvironment) {
    clauses.push(
      `DEPOSITION_ENVIRONMENT = '${escapeSql(depositionEnvironment)}'`,
    );
  }

  if (!Number.isNaN(minAge) || !Number.isNaN(maxAge)) {
    if (mode === "center") {
      if (!Number.isNaN(minAge)) {
        clauses.push(`UNCAL_DATA >= ${minAge}`);
      }
      if (!Number.isNaN(maxAge)) {
        clauses.push(`UNCAL_DATA <= ${maxAge}`);
      }
    } else if (mode === "contained") {
      if (!Number.isNaN(minAge)) {
        clauses.push(`UNCAL_MIN >= ${minAge}`);
      }
      if (!Number.isNaN(maxAge)) {
        clauses.push(`UNCAL_MAX <= ${maxAge}`);
      }
    } else {
      if (!Number.isNaN(minAge)) {
        clauses.push(`UNCAL_MAX >= ${minAge}`);
      }
      if (!Number.isNaN(maxAge)) {
        clauses.push(`UNCAL_MIN <= ${maxAge}`);
      }
    }
  }

  if (!Number.isNaN(maxUncertainty)) {
    clauses.push(`MARGIN <= ${maxUncertainty}`);
  }

  return clauses.length ? clauses.join(" AND ") : "1=1";
};

const applyFilter = async () => {
  if (!layerView) {
    return;
  }
  const state = getFilterState();
  const where = buildWhere(state);
  layerView.filter = { where };
  await updateResults(state);
};

const resetFilter = async (defaults) => {
  basinSelect.value = "";
  stateSelect.value = "";
  riverSelect.value = "";
  depositionSelect.value = "";
  ageMinInput.value = defaults.minAge ?? "";
  ageMaxInput.value = defaults.maxAge ?? "";
  uncertaintyMaxInput.value = "";
  ageModeSelect.value = "overlap";
  sortOrderSelect.value = "uncal-desc";
  await applyFilter();
};

const createRenderer = (basins) => ({
  type: "unique-value",
  field: "BASIN",
  defaultSymbol: {
    type: "simple-marker",
    color: "#374655",
    size: 7,
    outline: { color: "#ffffff", width: 0.5 },
  },
  uniqueValueInfos: basins.map((basin, index) => ({
    value: basin,
    symbol: {
      type: "simple-marker",
      color: palette[index % palette.length],
      size: 8,
      outline: { color: "#ffffff", width: 0.6 },
    },
    label: basin,
  })),
});

const matchesFilter = (attrs, state) => {
  const basinOk = !state.basin || attrs.BASIN === state.basin;
  const stateOk = !state.state || attrs.STATE === state.state;
  const riverOk = !state.river || attrs.RIVER === state.river;
  const depositionOk =
    !state.depositionEnvironment ||
    attrs.DEPOSITION_ENVIRONMENT === state.depositionEnvironment;
  if (!basinOk || !stateOk || !riverOk || !depositionOk) {
    return false;
  }

  const maxUncertainty = state.maxUncertainty;
  if (!Number.isNaN(maxUncertainty)) {
    const margin = Number(attrs.MARGIN);
    if (Number.isNaN(margin) || margin > maxUncertainty) {
      return false;
    }
  }

  const minAge = state.minAge;
  const maxAge = state.maxAge;
  const hasAgeFilter = !Number.isNaN(minAge) || !Number.isNaN(maxAge);
  if (!hasAgeFilter) {
    return true;
  }

  const uncal = Number(attrs.UNCAL_DATA);
  const uncalMin = Number(attrs.UNCAL_MIN);
  const uncalMax = Number(attrs.UNCAL_MAX);
  const mode = state.mode;

  if (mode === "center") {
    if (Number.isNaN(uncal)) {
      return false;
    }
    if (!Number.isNaN(minAge) && uncal < minAge) {
      return false;
    }
    if (!Number.isNaN(maxAge) && uncal > maxAge) {
      return false;
    }
    return true;
  }

  if (Number.isNaN(uncalMin) || Number.isNaN(uncalMax)) {
    return false;
  }

  if (mode === "contained") {
    if (!Number.isNaN(minAge) && uncalMin < minAge) {
      return false;
    }
    if (!Number.isNaN(maxAge) && uncalMax > maxAge) {
      return false;
    }
    return true;
  }

  if (!Number.isNaN(minAge) && uncalMax < minAge) {
    return false;
  }
  if (!Number.isNaN(maxAge) && uncalMin > maxAge) {
    return false;
  }
  return true;
};

const updateResults = (state) => {
  if (rawFeatures.length === 0) {
    return;
  }
  resultsBody.innerHTML = "";
  const filtered = rawFeatures.filter((attrs) => matchesFilter(attrs, state));
  const sorted = filtered.slice();
  switch (sortOrderSelect.value) {
    case "uncal-asc":
      sorted.sort((a, b) => (a.UNCAL_DATA ?? 0) - (b.UNCAL_DATA ?? 0));
      break;
    case "margin-asc":
      sorted.sort((a, b) => {
        const marginDiff = (a.MARGIN ?? 0) - (b.MARGIN ?? 0);
        if (marginDiff !== 0) {
          return marginDiff;
        }
        return (b.UNCAL_DATA ?? 0) - (a.UNCAL_DATA ?? 0);
      });
      break;
    case "uncal-desc":
    default:
      sorted.sort((a, b) => (b.UNCAL_DATA ?? 0) - (a.UNCAL_DATA ?? 0));
      break;
  }

  lastResults = sorted;
  if (exportButton) {
    exportButton.disabled = sorted.length === 0;
    exportButton.textContent = `Export CSV${sorted.length ? ` (${sorted.length})` : ""}`;
  }

  if (sorted.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "No records match the current filters.";
    row.appendChild(cell);
    resultsBody.appendChild(row);
    return;
  }

  sorted.forEach((attrs) => {
    const {
      RIVER,
      BASIN,
      STATE,
      DEPOSITION_ENVIRONMENT,
      UNCAL_DATA,
      MARGIN,
      UNCAL_MIN,
      UNCAL_MAX,
    } = attrs;
    const row = document.createElement("tr");

    const basinCell = document.createElement("td");
    basinCell.textContent = BASIN || "Unknown basin";

    const riverCell = document.createElement("td");
    riverCell.textContent = RIVER || "Unknown river";

    const depositionCell = document.createElement("td");
    depositionCell.textContent =
      DEPOSITION_ENVIRONMENT || "Unknown environment";

    const stateCell = document.createElement("td");
    stateCell.textContent = STATE || "n/a";
    stateCell.className = "meta";

    const ageCell = document.createElement("td");
    ageCell.textContent = UNCAL_DATA ?? "n/a";
    ageCell.className = "meta";

    const marginCell = document.createElement("td");
    marginCell.textContent = MARGIN ?? "n/a";
    marginCell.className = "meta";

    const rangeCell = document.createElement("td");
    rangeCell.textContent = `${UNCAL_MIN ?? "n/a"}–${UNCAL_MAX ?? "n/a"}`;
    rangeCell.className = "meta";

    row.appendChild(basinCell);
    row.appendChild(riverCell);
    row.appendChild(depositionCell);
    row.appendChild(stateCell);
    row.appendChild(ageCell);
    row.appendChild(marginCell);
    row.appendChild(rangeCell);
    resultsBody.appendChild(row);
  });
};

const csvEscape = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const formatDateStamp = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const exportCsv = () => {
  if (!lastResults.length) {
    return;
  }
  const header = [
    "Basin",
    "River",
    "Deposition Env.",
    "State",
    "Uncal Age",
    "+/-",
    "Range",
    "Author",
    "Publication Year",
    "Material",
    "Lab Code",
    "Sedimentary Context",
    "Alluvial Assemble",
  ];
  const rows = lastResults.map((attrs) => {
    const basin = attrs.BASIN || "Unknown basin";
    const river = attrs.RIVER || "Unknown river";
    const deposition = attrs.DEPOSITION_ENVIRONMENT || "Unknown environment";
    const state = attrs.STATE || "n/a";
    const uncal = attrs.UNCAL_DATA ?? "n/a";
    const margin = attrs.MARGIN ?? "n/a";
    const range = `${attrs.UNCAL_MIN ?? "n/a"}-${attrs.UNCAL_MAX ?? "n/a"}`;
    const author = attrs.AUTHOR || "n/a";
    const publicationYear = attrs.DATE ?? "n/a";
    const material = attrs.MATERIAL || "n/a";
    const labCode = attrs.LAB_CODE || "n/a";
    const sedimentaryContext = attrs.SEDIMENTARY_CONTEXT || "n/a";
    const alluvialAssemble = attrs.ALLUVIAL_ESSEMBLE || "n/a";
    return [
      basin,
      river,
      deposition,
      state,
      uncal,
      margin,
      range,
      author,
      publicationYear,
      material,
      labCode,
      sedimentaryContext,
      alluvialAssemble,
    ];
  });

  const csvLines = [
    header.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ];
  const blob = new Blob([csvLines.join("\r\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fadeu-visible-records-${formatDateStamp()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const init = async () => {
  const response = await fetch(dataUrl);
  const geojson = await response.json();
  const basins = new Set();
  const states = new Set();
  const rivers = new Set();
  const depositionEnvironments = new Set();
  const ages = [];
  rawFeatures = geojson.features.map((feature) => {
    const props = feature.properties || {};
    return {
      ...props,
      BASIN: normalizeString(props.BASIN),
      STATE: normalizeString(props.STATE),
      RIVER: normalizeString(props.RIVER),
      DEPOSITION_ENVIRONMENT: normalizeString(props.DEPOSITION_ENVIRONMENT),
    };
  });

  geojson.features.forEach((feature) => {
    const basin = normalizeString(feature.properties?.BASIN);
    const stateValue = normalizeString(feature.properties?.STATE);
    const river = normalizeString(feature.properties?.RIVER);
    const depositionEnvironment = normalizeString(
      feature.properties?.DEPOSITION_ENVIRONMENT,
    );
    const age = Number(feature.properties?.UNCAL_DATA);
    if (basin) {
      basins.add(basin);
    }
    if (stateValue) {
      states.add(stateValue);
    }
    if (river) {
      rivers.add(river);
    }
    if (depositionEnvironment) {
      depositionEnvironments.add(depositionEnvironment);
    }
    if (!Number.isNaN(age)) {
      ages.push(age);
    }
  });

  const sortedBasins = Array.from(basins).sort();
  sortedBasins.forEach((basin) => {
    const option = document.createElement("option");
    option.value = basin;
    option.textContent = basin;
    basinSelect.appendChild(option);
  });

  const sortedStates = Array.from(states).sort();
  sortedStates.forEach((stateValue) => {
    const option = document.createElement("option");
    option.value = stateValue;
    option.textContent = stateValue;
    stateSelect.appendChild(option);
  });

  const sortedRivers = Array.from(rivers).sort();
  sortedRivers.forEach((river) => {
    const option = document.createElement("option");
    option.value = river;
    option.textContent = river;
    riverSelect.appendChild(option);
  });

  const sortedDepositionEnvironments = Array.from(depositionEnvironments).sort();
  sortedDepositionEnvironments.forEach((depositionEnvironment) => {
    const option = document.createElement("option");
    option.value = depositionEnvironment;
    option.textContent = depositionEnvironment;
    depositionSelect.appendChild(option);
  });

  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);

  ageMinInput.min = minAge;
  ageMinInput.max = maxAge;
  ageMaxInput.min = minAge;
  ageMaxInput.max = maxAge;
  ageMinInput.value = minAge;
  ageMaxInput.value = maxAge;

  require(["esri/Map", "esri/views/MapView", "esri/layers/GeoJSONLayer"], (
    Map,
    MapView,
    GeoJSONLayer,
  ) => {
    const fields = [
      { name: "AUTHOR", type: "string" },
      { name: "DATE", type: "integer" },
      { name: "RIVER", type: "string" },
      { name: "MATERIAL", type: "string" },
      { name: "LAB_CODE", type: "string" },
      { name: "STATE", type: "string" },
      { name: "SEDIMENTARY_CONTEXT", type: "string" },
      { name: "UNCAL_DATA", type: "double" },
      { name: "MARGIN", type: "double" },
      { name: "DEPOSITION_ENVIRONMENT", type: "string" },
      { name: "ALLUVIAL_ESSEMBLE", type: "string" },
      { name: "BASIN", type: "string" },
      { name: "UNCAL_MIN", type: "double" },
      { name: "UNCAL_MAX", type: "double" },
    ];

    const layer = new GeoJSONLayer({
      url: dataUrl,
      title: "FADEU Radiocarbon Points",
      fields,
      renderer: createRenderer(sortedBasins),
      popupTemplate: {
        title: "{RIVER} ({BASIN})",
        content: [
          {
            type: "text",
            text:
              "<strong>Radiocarbon age (uncalibrated):</strong> {UNCAL_DATA} ± {MARGIN} 14C yr BP<br/>" +
              "<strong>Uncalibrated range:</strong> {UNCAL_MIN}–{UNCAL_MAX} 14C yr BP",
          },
          {
            type: "fields",
            fieldInfos: [
              { fieldName: "AUTHOR", label: "Author" },
              { fieldName: "DATE", label: "Publication year" },
              { fieldName: "RIVER", label: "River" },
              { fieldName: "MATERIAL", label: "Material" },
              { fieldName: "LAB_CODE", label: "Lab Code" },
              { fieldName: "STATE", label: "State" },
              {
                fieldName: "SEDIMENTARY_CONTEXT",
                label: "Sedimentary Context",
              },
              { fieldName: "UNCAL_DATA", label: "Uncal Data" },
              { fieldName: "MARGIN", label: "Margin" },
              {
                fieldName: "DEPOSITION_ENVIRONMENT",
                label: "Deposition Environment",
              },
              { fieldName: "ALLUVIAL_ESSEMBLE", label: "Alluvial Assemble" },
              { fieldName: "BASIN", label: "Basin" },
            ],
          },
        ],
      },
    });

    const map = new Map({
      basemap: "topo-vector",
      layers: [layer],
    });

    const view = new MapView({
      container: "viewDiv",
      map,
      center: [-89.5, 37.8],
      zoom: 4,
      constraints: {
        minZoom: 3,
      },
    });

    view.whenLayerView(layer).then(async (lv) => {
      layerView = lv;
      await applyFilter();
    });
  });

  applyButton.addEventListener("click", applyFilter);
  resetButton.addEventListener("click", () => resetFilter({ minAge, maxAge }));
  sortOrderSelect.addEventListener("change", applyFilter);
  if (exportButton) {
    exportButton.addEventListener("click", exportCsv);
  }
};

init();
