// FluffyStuff's CC0 Regular SVG set; 0 denotes a red five, as in riichi notation.
const numbered = [['m', 'Man', '萬'], ['p', 'Pin', '筒'], ['s', 'Sou', '索']].flatMap(([suit, file, name]) =>
  Array.from({ length: 10 }, (_, value) => Object.freeze({
    code: `${value}${suit}`, label: value === 0 ? `赤五${name}` : `${'一二三四五六七八九'[value - 1]}${name}`,
    image: `./assets/mahjong/${file}${value || 5}${value === 0 ? '-Dora' : ''}.svg`,
    copies: value === 0 ? 1 : value === 5 ? 3 : 4,
  })));
const honors = [['Ton', '東'], ['Nan', '南'], ['Shaa', '西'], ['Pei', '北'], ['Haku', '白'], ['Hatsu', '發'], ['Chun', '中']]
  .map(([file, label], index) => Object.freeze({ code: `${index + 1}z`, label, image: `./assets/mahjong/${file}.svg`, copies: 4 }));
export const RIICHI_FACES = Object.freeze([...numbered, ...honors]);

// Both neighboring rivers share this one 68-tile pool. Draw without replacement
// so no red five can occur, and each of the 34 regular designs occurs at most twice.
export function sideRiverFaces(count = 36, random = Math.random) {
  const pool = RIICHI_FACES.filter(face => !face.code.startsWith('0')).flatMap(face => [face, face]);
  if (!Number.isInteger(count) || count < 0 || count > pool.length) throw new RangeError('Invalid river size');
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function nextRiichiFace(previousCode = null, random = Math.random) {
  const choices = RIICHI_FACES.filter((face) => face.code !== previousCode);
  const total = choices.reduce((count, face) => count + face.copies, 0);
  let ticket = Math.min(total - 1, Math.floor(random() * total));
  for (const face of choices) {
    ticket -= face.copies;
    if (ticket < 0) return face;
  }
}
