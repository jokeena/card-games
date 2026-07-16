/**
 * A team's score kept the table way: two 5s, 0–10. John's family convention,
 * confirmed exactly:
 *  - 0    both face down, stacked in a cross
 *  - 1–4  bottom 5 face up, the face-down card slid/angled to expose N pips
 *  - 5    the face-up 5 fully exposed, the other tucked beneath
 *  - 6–9  both face up: the top 5 fully visible, slid to expose N−5 pips
 *  - 10   both fully face up side by side
 * Red 5s for one team, black for the other (conjured — the euchre deck has
 * no 5s). The pips run down the card in a staggered zigzag, one per row,
 * so a straight slide of the cover exposes exactly N pips for every N.
 */

interface Props {
  score: number;
  color: 'red' | 'black';
}

/** Cover transforms for "expose N pips of the card underneath", N = 1–4. */
const COVER_POSE: Record<number, string> = {
  1: 'translate(2%, 24%) rotate(2deg)',
  2: 'translate(-2%, 41%) rotate(-2deg)',
  3: 'translate(2%, 58%) rotate(2deg)',
  4: 'translate(-2%, 75%) rotate(-2deg)',
};

const PIPS: [number, number][] = [[32, 16], [68, 31], [50, 48], [32, 65], [68, 82]];

function FiveFace({ color }: { color: 'red' | 'black' }) {
  const sym = color === 'red' ? '♥' : '♠';
  return (
    <svg className="five-svg" viewBox="0 0 44 62" aria-hidden="true">
      <text className="five-index" x="5.5" y="11">5</text>
      <text className="five-index five-index-suit" x="5.5" y="19">{sym}</text>
      {PIPS.map(([x, y], i) => (
        <text key={i} className="five-pip" x={`${x}%`} y={`${y}%`}>{sym}</text>
      ))}
      <g transform="rotate(180 22 31)">
        <text className="five-index" x="5.5" y="11">5</text>
        <text className="five-index five-index-suit" x="5.5" y="19">{sym}</text>
      </g>
    </svg>
  );
}

export function ScoreFives({ score, color }: Props) {
  const n = Math.max(0, Math.min(10, score));
  const cls = `five-card five-${color}`;

  let bottom: { face: boolean; style: React.CSSProperties };
  let top: { face: boolean; style: React.CSSProperties };

  if (n === 0) {
    bottom = { face: false, style: {} };
    top = { face: false, style: { transform: 'rotate(90deg)' } };
  } else if (n <= 4) {
    bottom = { face: true, style: {} };
    top = { face: false, style: { transform: COVER_POSE[n] } };
  } else if (n === 5) {
    bottom = { face: false, style: { transform: 'translate(-9%, -5%) rotate(-7deg)' } };
    top = { face: true, style: {} };
  } else if (n <= 9) {
    bottom = { face: true, style: {} };
    top = { face: true, style: { transform: COVER_POSE[n - 5] } };
  } else {
    bottom = { face: true, style: { transform: 'translate(-56%, 0)' } };
    top = { face: true, style: { transform: 'translate(56%, 0)' } };
  }

  return (
    <div className={`fives ${n === 10 ? 'fives-win' : ''}`} title={`${n} point${n === 1 ? '' : 's'}`}>
      <div className={`${cls} ${bottom.face ? '' : 'five-back'}`} style={bottom.style}>
        {bottom.face && <FiveFace color={color} />}
      </div>
      <div className={`${cls} ${top.face ? '' : 'five-back'}`} style={top.style}>
        {top.face && <FiveFace color={color} />}
      </div>
    </div>
  );
}
