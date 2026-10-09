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

export function nextRiichiFace(previousCode = null, random = Math.random) {
  const choices = RIICHI_FACES.filter((face) => face.code !== previousCode);
  const total = choices.reduce((count, face) => count + face.copies, 0);
  let ticket = Math.min(total - 1, Math.floor(random() * total));
  for (const face of choices) {
    ticket -= face.copies;
    if (ticket < 0) return face;
  }
}
