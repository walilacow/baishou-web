// 內力費用顯示。引擎 JSON 的 ManaCost 是攤平的：{"generic":1,"crane":2}（不是 {generic, colored:{…}}）。
export const SHORT = { tiger: '虎', dragon: '龍', crane: '鶴', wolf: '狼', scorpion: '蠍', bat: '蝠', jiao: '鮫', jianghu: '通' };
const ORDER = ['tiger', 'dragon', 'crane', 'wolf', 'scorpion', 'bat', 'jiao', 'jianghu'];

/** 例：{crane:2, generic:1} → "鶴2 通1"；免費 → ''。 */
export function costText(cost) {
  if (!cost) return '';
  const parts = [];
  for (const f of ORDER) if (cost[f] > 0) parts.push(`${SHORT[f]}${cost[f]}`);
  if (cost.generic > 0) parts.push(`通${cost.generic}`);
  return parts.join(' ');
}

/** 總點數（與引擎 ManaCost.total 一致） */
export function costTotal(cost) {
  return Object.values(cost ?? {}).reduce((a, n) => a + (n > 0 ? n : 0), 0);
}
