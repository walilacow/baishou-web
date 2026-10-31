// 載入 wasm 引擎（CardGameCore 編成 WebAssembly），用 JSON 指令呼叫。規則全在引擎裡，這裡只傳話。
import { loadFX } from './fx.js';
const enc = new TextEncoder();
const dec = new TextDecoder();

function makeWasiImports(getMemory) {
  const view = () => new DataView(getMemory().buffer);
  const ok = () => 0;
  const table = {
    args_sizes_get: (argc, size) => { const v = view(); v.setUint32(argc, 0, true); v.setUint32(size, 0, true); return 0; },
    args_get: ok,
    environ_sizes_get: (n, size) => { const v = view(); v.setUint32(n, 0, true); v.setUint32(size, 0, true); return 0; },
    environ_get: ok,
    clock_time_get: (_id, _prec, out) => { view().setBigUint64(out, BigInt(Date.now()) * 1000000n, true); return 0; },
    clock_res_get: (_id, out) => { view().setBigUint64(out, 1000000n, true); return 0; },
    random_get: (ptr, len) => { crypto.getRandomValues(new Uint8Array(getMemory().buffer, ptr, len)); return 0; },
    fd_write: (fd, iovs, iovsLen, nwritten) => {
      const v = view(); let total = 0; let text = '';
      for (let i = 0; i < iovsLen; i++) {
        const p = v.getUint32(iovs + i * 8, true), l = v.getUint32(iovs + i * 8 + 4, true);
        text += dec.decode(new Uint8Array(getMemory().buffer, p, l)); total += l;
      }
      if (text.trim()) console.log(`[wasm fd${fd}]`, text.trim());
      v.setUint32(nwritten, total, true); return 0;
    },
    fd_fdstat_get: (_fd, out) => { const v = view(); v.setUint8(out, 2); v.setUint16(out + 2, 0, true); v.setBigUint64(out + 8, 0n, true); v.setBigUint64(out + 16, 0n, true); return 0; },
    fd_prestat_get: () => 8,        // EBADF：沒有預先開啟的目錄
    fd_prestat_dir_name: () => 8,
    fd_close: ok, fd_seek: () => 70, fd_read: () => 8, fd_sync: ok, fd_filestat_get: () => 8,
    proc_exit: (code) => { throw new Error(`wasm exit ${code}`); },
    sched_yield: ok, poll_oneoff: () => 52,
  };
  return new Proxy(table, { get: (t, k) => t[k] ?? (() => 52) });
}

/** 抓檔案：網路偶爾斷一下就重試，不要一次失敗就整個壞掉 */
async function fetchRetry(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return r; last = new Error(`${url} → ${r.status}`); } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  throw last;
}

export class Engine {
  static async load(base = '.') {
    const resp = await fetchRetry(`${base}/assets/cardgame.wasm`);
    const bytes = await resp.arrayBuffer();
    let memory;
    const imports = { wasi_snapshot_preview1: makeWasiImports(() => memory) };
    const { instance } = await WebAssembly.instantiate(bytes, imports);
    memory = instance.exports.memory;
    if (instance.exports._initialize) instance.exports._initialize();
    const e = new Engine(instance);
    await e.init(base);
    return e;
  }

  constructor(instance) { this.ex = instance.exports; }

  call(obj) {
    const bytes = enc.encode(JSON.stringify(obj));
    const p = this.ex.web_alloc(bytes.length);
    new Uint8Array(this.ex.memory.buffer, p, bytes.length).set(bytes);
    let text;
    try {
      const r = this.ex.web_call(p, bytes.length);
      const n = this.ex.web_result_len();
      text = dec.decode(new Uint8Array(this.ex.memory.buffer, r, n).slice());
    } finally { this.ex.web_free(p); }   // wasm trap 時也要還輸入緩衝區
    const res = JSON.parse(text);
    if (res.ok === false) throw new Error(res.error || '引擎錯誤');
    return res;
  }

  async init(base) {
    const names = await (await fetchRetry(`${base}/data/index.json`)).json();
    const files = {};
    await Promise.all(names.map(async (n) => { files[n] = await (await fetchRetry(`${base}/data/${n}`)).text(); }));
    this.call({ cmd: 'init', files });
    try { this.artSet = new Set(await (await fetch(`${base}/art/index.json`)).json()); } catch { this.artSet = new Set(); }
    await loadFX(base);
    const c = this.call({ cmd: 'cards' });
    this.cards = c.cards; this.bases = c.bases; this.keywords = c.keywords; this.factionNames = c.factionNames; this.typeNames = c.typeNames;
  }
}
