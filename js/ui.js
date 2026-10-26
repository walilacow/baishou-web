import { VERSION, BUILD, COPYRIGHT } from './version.js';

/** 建 DOM 元素：h('div.cls#id', {attr}, ...children) */
export function h(tag, attrs, ...kids) {
  const m = tag.match(/^([a-z0-9]+)((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m ? m[1] : tag);
  for (const part of (m?.[2] ?? '').match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'text') el.textContent = v;
    else if (k === 'class') el.className += ' ' + v;
    else if (v === false || v == null) continue;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** 每頁頁首（測試版標記）與頁尾（版權宣告） */
export function betaBadge() {
  return h('span.beta', { title: '測試版' }, `測試版 ${VERSION}`, h('span.b', `（Build ${BUILD}）`));
}
export function footer() {
  return h('footer.site-footer', h('div', COPYRIGHT), h('div.links', h('a', { href: '#/rules' }, '遊戲規則'), ' · ', h('a', { href: '#/about' }, '關於')));
}

export function toast(msg) {
  const t = h('div.toast', msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

/** localStorage 包起來：私密視窗或被封鎖時不要壞掉 */
export const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

/** 對局頁的外框（頁首＋對局＋頁尾）；頁首、頁尾每頁都有，測試版標記與版權宣告不能少。 */
export function battleShell(root) {
  return h('div.page.battle-page',
    h('header.topbar', h('a.brand', { href: '#/' }, '百獸真經'), betaBadge(), h('nav', h('a', { href: 'rules.html', target: '_blank', rel: 'noopener' }, '規則'))),
    root, footer());
}
