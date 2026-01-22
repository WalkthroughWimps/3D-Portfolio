import fs from "fs";
import path from "path";
import xlsx from "xlsx";

const INPUT_FILE = path.resolve("Attribution_Tracker_Starter.xlsx");
const OUTPUT_FILE = path.resolve("data/attributions.json");
const SHEET_NAME = "Attributions";

function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
}

function parseRow(row) {
    return {
        trackTitle: clean(row["Track Title"] || row.trackTitle),
        creatorName: clean(row["Creator Name"] || row.creatorName),
        creatorUrl: clean(row["Creator URL"] || row.creatorUrl),
        sourceUrl: clean(row["Source URL"] || row.sourceUrl),
        licenseName: clean(row["License Name"] || row.licenseName),
        licenseUrl: clean(row["License URL"] || row.licenseUrl),
        isrc: clean(row.ISRC || row.isrc),
        changesMade: clean(row["Changes Made"] || row.changesMade),
        attributionText: clean(row["Attribution Text"] || row.attributionText),
        htmlAttribution: clean(row["HTML Attribution"] || row.htmlAttribution),
        usedOnPages: clean(row["Used On Pages"] || row.usedOnPages)
    };
}

function normalizeUsedOnPages(value) {
    if (!value) return [];
    return value
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter(Boolean);
}

function ensureOutputDirectory() {
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function main() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Missing attribution spreadsheet at ${INPUT_FILE}.`);
        process.exit(1);
    }

    const workbook = xlsx.readFile(INPUT_FILE);
    const sheet = workbook.Sheets[SHEET_NAME];
    if (!sheet) {
        console.error(`Worksheet '${SHEET_NAME}' not found in ${INPUT_FILE}.`);
        process.exit(1);
    }

    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
    const result = {};
    rows.forEach((row, index) => {
        const key = clean(row["Asset Key"] || row.assetKey || row.asset_key);
        if (!key) {
            console.warn(`Skipping row ${index + 2} because Asset Key is missing.`);
            return;
        }
        const parsed = parseRow(row);
        parsed.usedOnPages = normalizeUsedOnPages(parsed.usedOnPages);
        result[key] = parsed;
    });

    ensureOutputDirectory();
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf-8");
    console.log(`Exported ${Object.keys(result).length} attributions to ${OUTPUT_FILE}.`);
}

main();
