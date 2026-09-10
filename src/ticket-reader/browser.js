import { applyTicketRead, READER_VERSION } from './core.js';

let worker, sequence = 0, queue = Promise.resolve(), idle;
function dispose() { worker?.terminate(); worker = null; clearTimeout(idle); }
function run(image) {
  return new Promise((resolve, reject) => {
    clearTimeout(idle);
    worker ||= new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const id = ++sequence;
    const timer = setTimeout(() => { dispose(); reject(new Error('Ticket reading timed out')); }, 90000);
    const finish = () => { clearTimeout(timer); idle = setTimeout(dispose, 120000); };
    worker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      finish();
      if (data.error) { dispose(); reject(new Error('Ticket reader could not finish')); }
      else resolve(data.result);
    };
    worker.onerror = () => { finish(); dispose(); reject(new Error('Ticket reader could not load')); };
    worker.postMessage({ id, image, base: new URL(import.meta.env.BASE_URL + 'reader/', window.location.origin).href }, image?[image.data.buffer]:[]);
  });
}

export function preloadTicketReader() {
  const job=queue.then(()=>run());queue=job.catch(()=>{});return queue;
}

export async function readTicket(source) {
  const job = queue.then(async () => {
    if (typeof Worker === 'undefined') throw new Error('Ticket reader requires Web Workers');
    // New captures already have a processed canvas. Avoid JPEG encoding,
    // fetching a data URL, and decoding that same image before inference.
    if (source?.getContext) {
      const data=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height);
      return await run({data:data.data,width:data.width,height:data.height});
    }
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 20000);
    let response;
    try { response = await fetch(source, { signal: abort.signal }); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error('Ticket image unavailable');
    const url = URL.createObjectURL(await response.blob());
    try {
      const image = new Image(); image.src = url; await image.decode();
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return await run({ data: data.data, width: data.width, height: data.height });
    } finally { URL.revokeObjectURL(url); }
  });
  queue = job.catch(() => {});
  return job;
}

export { applyTicketRead, READER_VERSION };
