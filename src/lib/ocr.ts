import 'server-only';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readEnv } from './env';

/**
 * Local OCR via tesseract.js (WASM). Runs entirely on this machine.
 *
 * The WASM core ships inside node_modules, but the English language model is a
 * ~15 MB data file that is NOT vendored into the repo. Fetch it once with
 * `npm run fetch:ocr`. Until then image OCR reports itself as unavailable and
 * the upload falls back to manual entry — it never pretends to have read text.
 */
export const OCR_DATA_DIR = resolve(readEnv('OCR_DATA_DIR') ?? './ocr-data');
const LANG = 'eng';

export function ocrAvailable(): boolean {
  return (
    existsSync(resolve(OCR_DATA_DIR, `${LANG}.traineddata.gz`)) ||
    existsSync(resolve(OCR_DATA_DIR, `${LANG}.traineddata`))
  );
}

export const OCR_UNAVAILABLE_MESSAGE =
  'Image text recognition is not set up on this machine. Run `npm run fetch:ocr` once to download the open-source English model (about 15 MB, no account needed), or enter the details by hand.';

export type OcrResult = { ok: true; text: string } | { ok: false; error: string };

export async function ocrImage(data: Buffer, timeoutMs = 60_000): Promise<OcrResult> {
  if (!ocrAvailable()) return { ok: false, error: OCR_UNAVAILABLE_MESSAGE };
  type OcrWorker = {
    recognize: (d: Buffer) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<unknown>;
  };
  let worker: OcrWorker | null = null;
  try {
    const { createWorker } = await import('tesseract.js');
    worker = (await createWorker(LANG, 1, {
      langPath: OCR_DATA_DIR,
      gzip: existsSync(resolve(OCR_DATA_DIR, `${LANG}.traineddata.gz`)),
      cacheMethod: 'none',
      logger: () => {},
      errorHandler: () => {},
    })) as unknown as OcrWorker;

    const recognised = await Promise.race([
      worker.recognize(data),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR timed out')), timeoutMs),
      ),
    ]);
    return { ok: true, text: recognised.data.text ?? '' };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.message === 'OCR timed out'
          ? 'Reading this image took too long and was stopped. Try a smaller or sharper image, or enter the details by hand.'
          : 'This image could not be read automatically. Enter the details by hand.',
    };
  } finally {
    await worker?.terminate().catch(() => {});
  }
}
