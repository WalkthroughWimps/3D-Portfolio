import fs from "fs";
import path from "path";
import { fetch as undiciFetch } from "node:undici";
import xlsx from "xlsx";
import cheerio from "cheerio";

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED PROMISE REJECTION:", err);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

const fetchFn = globalThis.fetch ?? undiciFetch;
const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".opus",
  ".flac",
  ".m4a",
  ".aac",
  ".wma",
  ".alac"
]);
const DATA_DIR = path.resolve("data");
const LOG_PATH = path.join(DATA_DIR, "imslp_import.log");
const JSON_PATH = path.join(DATA_DIR, "attributions.json");
const XLSX_PATH = path.join(DATA_DIR, "Attribution_Tracker.xlsx");
const SHEET_NAME = "Attributions";
const HEADERS = [
  "Asset Key",
  "Track Title",
  "Creator Name",
  "Creator URL",
  "Source URL",
  "License Name",
  "License URL",
  "ISRC",
  "Changes Made",
  "Attribution Text",
  "HTML Attribution",
  "Used On Pages"
];

const LICENSE_DEFINITIONS = {
  "BY-4.0": {
    name: "Creative Commons Attribution 4.0 International",
    url: "https://creativecommons.org/licenses/by/4.0/"
  },
  "BY-SA-4.0": {
    name: "Creative Commons Attribution-ShareAlike 4.0 International",
    url: "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "BY-3.0": {
    name: "Creative Commons Attribution 3.0 Unported",
    url: "https://creativecommons.org/licenses/by/3.0/"
  },
  "BY-SA-3.0": {
    name: "Creative Commons Attribution-ShareAlike 3.0 Unported",
    url: "https://creativecommons.org/licenses/by-sa/3.0/"
  }
};

async function ensureDataDirectory() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
}

function appendLog(message, level = "INFO") {
  const timestamp = new Date().toISOString();
  const text = `[${timestamp}] ${level}: ${message}`;
  fs.appendFileSync(LOG_PATH, `${text}\n`);
  console.log(text);
}

function loadAttributionsJson() {
  try {
    const raw = fs.readFileSync(JSON_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

function saveAttributionsJson(entries) {
  const serialized = JSON.stringify(entries, null, 2);
  fs.writeFileSync(JSON_PATH, `${serialized}\n`, "utf-8");
}

function loadWorkbook() {
  if (!fs.existsSync(XLSX_PATH)) {
    const newBook = xlsx.utils.book_new();
    const initialSheet = xlsx.utils.aoa_to_sheet([HEADERS]);
    xlsx.utils.book_append_sheet(newBook, initialSheet, SHEET_NAME);
    return newBook;
  }
  const book = xlsx.readFile(XLSX_PATH);
  if (!book.Sheets[SHEET_NAME]) {
    const sheet = xlsx.utils.aoa_to_sheet([HEADERS]);
    xlsx.utils.book_append_sheet(book, sheet, SHEET_NAME);
  }
  return book;
}

function appendRowToWorkbook(workbook, row) {
  const sheet = workbook.Sheets[SHEET_NAME];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!data.length) {
    data.push(HEADERS);
  }
  data.push(row);
  workbook.Sheets[SHEET_NAME] = xlsx.utils.aoa_to_sheet(data);
}

function saveWorkbook(workbook) {
  xlsx.writeFile(workbook, XLSX_PATH);
}

async function findAudioFiles(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findAudioFiles(resolved)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXTENSIONS.has(ext)) {
        files.push(resolved);
      }
    }
  }
  return files;
}

function extractPmlpIds(files) {
  const ids = new Set();
  for (const file of files) {
    const match = /PMLP(\d+)/i.exec(file);
    if (match) {
      ids.add(match[1]);
    }
  }
  return [...ids];
}

function detectLicense(sectionText, nodes) {
  const normalized = sectionText.toLowerCase();
  if (!/cc\s*by/.test(normalized)) {
    return { reason: "missing CC BY" };
  }
  if (/(nc|nd)/.test(normalized) && !/by-sa/.test(normalized)) {
    return { reason: "restrictive license (NC/ND)" };
  }

  let licenseAnchor = null;
  for (const node of nodes) {
    const candidate = node.find('a[href*="creativecommons.org/licenses/by"]');
    if (candidate.length) {
      licenseAnchor = candidate.first();
      break;
    }
  }

  const combined = [
    licenseAnchor?.text?.()?.trim() ?? "",
    licenseAnchor?.attr?.("href") ?? "",
    sectionText
  ]
    .join(" ")
    .toLowerCase();

  const isShareAlike = /by[-\s]?sa/.test(combined);
  const versionMatch = combined.match(/([34]\.0)/);
  const version = versionMatch ? versionMatch[1] : "4.0";

  const key = `BY${isShareAlike ? "-SA" : ""}-${version}`;
  const definition = LICENSE_DEFINITIONS[key];
  if (!definition) {
    return { reason: "unsupported license version" };
  }

  const href = licenseAnchor?.attr("href") || definition.url;
  return {
    definition,
    url: href
  };
}

function detectCreator(sectionText) {
  const performerMatch = sectionText.match(/performers?\s*:?\s*([^;\n.]+)/i);
  if (performerMatch && performerMatch[1]) {
    return performerMatch[1].trim();
  }
  const recordedByMatch = sectionText.match(/recorded by\s*([^;\n.]+)/i);
  if (recordedByMatch && recordedByMatch[1]) {
    return recordedByMatch[1].trim();
  }
  return "IMSLP Recording";
}

function gatherSectionNodes($, headingName) {
  const headline = $(".mw-headline")
    .filter((_, el) => $(el).text().trim().toLowerCase().includes(headingName))
    .first();
  if (!headline.length) {
    return null;
  }
  const wrapper = headline.closest("h2");
  if (!wrapper.length) {
    return null;
  }
  const nodes = [];
  let current = wrapper.next();
  while (current.length && current[0]?.name !== "h2") {
    nodes.push(current);
    current = current.next();
  }
  return nodes;
}

async function fetchRecordingEntry(pmlpId) {
  const pageUrl = `https://imslp.org/wiki/PMLP${pmlpId}`;
  const response = await fetchFn(pageUrl, {
    headers: {
      "User-Agent": "IMSLP Attribution Importer/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${pageUrl}: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  const trackTitle = $("#firstHeading").text().trim() || `PMLP${pmlpId}`;

  const sectionNodes = gatherSectionNodes($, "recordings");
  if (!sectionNodes || !sectionNodes.length) {
    appendLog(`PMLP${pmlpId} skipped: no Recordings section`, "WARN");
    return null;
  }

  const sectionText = sectionNodes
    .map((node) => $(node).text())
    .join("\n")
    .trim();

  if (!sectionText) {
    appendLog(`PMLP${pmlpId} skipped: empty Recordings section`, "WARN");
    return null;
  }

  const licenseInfo = detectLicense(sectionText, sectionNodes);
  if (!licenseInfo?.definition) {
    const reason = licenseInfo?.reason ?? "license parsing failed";
    appendLog(`PMLP${pmlpId} skipped: ${reason}`, "WARN");
    return null;
  }

  const creatorName = detectCreator(sectionText);

  return {
    trackTitle,
    creatorName,
    creatorUrl: "",
    sourceUrl: pageUrl,
    licenseName: licenseInfo.definition.name,
    licenseUrl: licenseInfo.url,
    isrc: "",
    changesMade: "",
    attributionText: "",
    htmlAttribution: "",
    usedOnPages: []
  };
}

async function main() {
  const folder = process.argv[2];
  if (!folder) {
    await ensureDataDirectory();
    appendLog("No folder provided. Drop a folder onto IMSLP_Attribution_Import.cmd.", "ERROR");
    process.exitCode = 1;
    return;
  }

  const targetPath = path.resolve(folder);
  let stats;
  try {
    stats = await fs.promises.stat(targetPath);
  } catch (err) {
    await ensureDataDirectory();
    appendLog(`Provided path does not exist: ${targetPath}`, "ERROR");
    process.exitCode = 1;
    return;
  }

  if (!stats.isDirectory()) {
    await ensureDataDirectory();
    appendLog(`Provided path is not a directory: ${targetPath}`, "ERROR");
    process.exitCode = 1;
    return;
  }

  await ensureDataDirectory();
  appendLog(`Starting IMSLP import from folder: ${targetPath}`);

  const audioFiles = await findAudioFiles(targetPath);
  const ids = extractPmlpIds(audioFiles);
  if (!ids.length) {
    appendLog("No PMLP IDs detected in the supplied folder.", "WARN");
    return;
  }

  const existingEntries = loadAttributionsJson();
  const workbook = loadWorkbook();
  let added = 0;

  for (const id of ids) {
    const assetKey = `pmlp${id}`;
    if (existingEntries[assetKey]) {
      appendLog(`PMLP${id} already tracked; skipping.`);
      continue;
    }

    try {
      const entry = await fetchRecordingEntry(id);
      if (!entry) {
        continue;
      }
      existingEntries[assetKey] = entry;
      const row = [
        assetKey,
        entry.trackTitle,
        entry.creatorName,
        entry.creatorUrl,
        entry.sourceUrl,
        entry.licenseName,
        entry.licenseUrl,
        entry.isrc,
        entry.changesMade,
        entry.attributionText,
        entry.htmlAttribution,
        entry.usedOnPages.join(", ")
      ];
      appendRowToWorkbook(workbook, row);
      added += 1;
      appendLog(`PMLP${id} imported: ${entry.licenseName}`);
    } catch (err) {
      appendLog(`PMLP${id} failed: ${err.message}`, "ERROR");
    }
  }

  if (added) {
    saveAttributionsJson(existingEntries);
    saveWorkbook(workbook);
    appendLog(`Import completed. ${added} new attribution(s) recorded.`);
  } else {
    appendLog("Import completed. No new attributions added.");
  }
}

main().catch((err) => {
  appendLog(`Importer crashed: ${err.stack || err}`, "ERROR");
  process.exitCode = 1;
});
