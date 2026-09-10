import * as ort from 'onnxruntime-web/wasm';
import { createEngine, readPlantTicket } from './core.js';

let engine;
self.onmessage = async ({ data: { id, image, base } }) => {
  try {
    if (!engine) {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = base;
      const dictionary = await fetch(base + 'ppocr_keys_v1.txt');
      if (!dictionary.ok) throw new Error('Missing reader dictionary');
      engine = await createEngine(ort, {
        detection: base + 'ch_PP-OCRv4_det_infer.onnx',
        recognition: base + 'ch_PP-OCRv4_rec_infer.onnx',
      }, await dictionary.text(), { executionProviders: ['wasm'] });
    }
    self.postMessage({ id, result: await readPlantTicket(image, engine) });
  } catch { self.postMessage({ id, error: true }); }
};
