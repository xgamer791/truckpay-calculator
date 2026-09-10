import { copyFile, mkdir } from 'node:fs/promises';
import models from '@gutenye/ocr-models/node';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ort = dirname(require.resolve('onnxruntime-web'));
await mkdir('public/reader', { recursive: true });
for (const source of [models.detectionPath, models.recognitionPath, models.dictionaryPath]) {
  await copyFile(source, join('public/reader', source.split('/').at(-1)));
}
for (const name of ['ort-wasm.wasm', 'ort-wasm-simd.wasm']) await copyFile(join(ort, name), join('public/reader', name));
console.log('Prepared local ticket reader models and runtime.');
