// 她偶尔说的话。都是为这里写的原创短句，不是原作台词；
// 不说“空白”“替代”“消失”，不催，不夸大，语气平而短
export const LINES = {
  day: [
    '今日の月、見た？',
    'ここは、あなたの場所。',
    'ゆっくりでいい。',
    '無理しなくていい。',
    'わからなくても、いい。',
    'ここにいると、ぽかぽかする。',
    '来てくれて、ありがとう。',
    '今日も、おつかれさま。',
    '好きなもの、ひとつ増えた？',
    '田んぼの水、あたたかかった。',
    '笑いたいときに、笑えばいい。',
    'ことばを、ひとつ覚えた。あなたは？',
  ],
  morning: ['おはよう。今日も、いっしょに。', 'おはよう。窓の外、明るい。'],
  night: ['もう遅い。おやすみ。', '明日も会えるように。おやすみ。'],
  hua: ['名前をつけると、その日が少し近くなる。'],
  word: ['ことばが、ひとつ増えた。', 'その言葉、わたしも覚えたい。'],
  done: ['……よかった。', '穂が、少し重くなった。'],
  swap: ['変えても、いい。'],
  rain: ['雨の音。……嫌いじゃない。'],
  keep: ['しまっておくね。'],
  let: ['軽くなった？'],
};

let enabled = true;
export function setEnabled(v) { enabled = v !== false; }
export const isEnabled = () => enabled;

function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

// 同一天、同一处说同一句，不会一刷新就换
export function lineOfDay(pool, key) {
  if (!enabled) return '';
  const list = LINES[pool] || [];
  return list.length ? list[hash(pool + key) % list.length] : '';
}

export function pick(pool) {
  if (!enabled) return '';
  const list = LINES[pool] || [];
  return list.length ? list[Math.floor(Math.random() * list.length)] : '';
}

// 首页那一句：清早和深夜各有专门的话
export function roomLine(d, key) {
  const h = d.getHours();
  if (h >= 23 || h < 5) return lineOfDay('night', key);
  if (h >= 5 && h < 9) return lineOfDay('morning', key);
  return lineOfDay('day', key);
}
