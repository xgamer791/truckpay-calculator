import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { createEngine, readMarietta } from '../src/ticket-reader/core.js';
import models from '@gutenye/ocr-models/node';

export async function createTicketReader() {
  const engine = await createEngine(ort, { detection: models.detectionPath, recognition: models.recognitionPath },
    await readFile(models.dictionaryPath, 'utf8'), { intraOpNumThreads: 2, interOpNumThreads: 1 });
  return {
    engine,
    async read(input) {
      const { data, info } = await sharp(input).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return await readMarietta({ data, width: info.width, height: info.height }, engine);
    },
    close: () => engine.close(),
  };
}
