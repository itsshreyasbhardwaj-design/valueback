#!/usr/bin/env node
/**
 * One-time download of the open-source Tesseract English model so image OCR can
 * run fully offline afterwards. No account, no API key, no paid service.
 * Source: tessdata_fast (Apache-2.0), mirrored on jsDelivr.
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';

const dir = resolve(process.env.OCR_DATA_DIR ?? './ocr-data');
const target = resolve(dir, 'eng.traineddata.gz');
const url = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz';

if (existsSync(target) && statSync(target).size > 1_000_000) {
  console.log(`Already present: ${target}`);
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
console.log(`Downloading English OCR model from ${url}`);
const res = await fetch(url);
if (!res.ok || !res.body) {
  console.error(`Download failed (${res.status}). Image OCR stays unavailable; everything else works.`);
  process.exit(1);
}
await pipeline(Readable.fromWeb(res.body), createWriteStream(target));
console.log(`Saved ${target} (${(statSync(target).size / 1e6).toFixed(1)} MB). Image OCR is now available.`);
