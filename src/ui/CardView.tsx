import { Card, isRed, Suit, SUIT_SYMBOL } from '../engine/types';

interface Props {
  card?: Card;
  faceDown?: boolean;
  size?: 'small' | 'mid';
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
}

/**
 * Pip positions (x%, y%, flipped) within the pip area — pulled toward
 * the middle so nothing collides with the corner indices.
 */
const PIP_LAYOUT: Record<string, [number, number, boolean][]> = {
  '10': [
    [33, 18, false], [67, 18, false], [50, 29, false], [33, 39, false], [67, 39, false],
    [33, 61, true], [67, 61, true], [50, 71, true], [33, 82, true], [67, 82, true],
  ],
  '9': [
    [33, 18, false], [67, 18, false], [33, 39, false], [67, 39, false], [50, 50, false],
    [33, 61, true], [67, 61, true], [33, 82, true], [67, 82, true],
  ],
};

const OUT = '#3a352c';
const GOLD = '#d9b23c';
const SKIN = '#f2d8b2';
const WHITE = '#fdfcf7';

/**
 * Double-ended court figure, drawn as a half-card bust and mirrored,
 * in the tradition of standard court art. viewBox is 44x68; the
 * mirror line is y=34.
 */
function CourtArt({ rank, suit }: { rank: 'K' | 'Q' | 'J'; suit: Suit }) {
  const red = isRed(suit);
  const robe = red ? '#c04036' : '#33549e';
  const acc = red ? '#33549e' : '#c04036';
  const pipColor = red ? '#c0392b' : '#1c1c1c';
  const sym = SUIT_SYMBOL[suit];

  const ROBE = 'M8 34 L10.5 25 Q14 21 18 21 L26 21 Q30 21 33.5 25 L36 34 Z';
  const COLLAR = 'M17.5 21 L26.5 21 L25.8 23.6 L18.2 23.6 Z';

  const half = (
    <g stroke={OUT} strokeWidth="0.6" strokeLinejoin="round">
      {rank === 'K' && (
        <>
          {/* sword behind the shoulder */}
          <rect x="33.1" y="2.5" width="1.9" height="15.5" rx="0.6" fill="#c6cdd8" />
          <circle cx="34" cy="19.2" r="1.3" fill={GOLD} />
          <rect x="30.2" y="6" width="7.6" height="1.7" rx="0.8" fill={GOLD} />
          <path d={ROBE} fill={robe} />
          <path d="M10.5 25 L22 33 L33.5 25" fill="none" stroke={GOLD} strokeWidth="1.5" />
          <path d={COLLAR} fill={WHITE} />
          <ellipse cx="22" cy="14.5" rx="4.9" ry="5" fill={SKIN} />
          <path d="M16.9 15.5 Q22 25.5 27.1 15.5 Q27.1 20.5 22 21.8 Q16.9 20.5 16.9 15.5 Z" fill="#d9d4c9" />
          <path d="M13.6 10.6 L14.9 4.9 L18.5 8.1 L22 4.1 L25.5 8.1 L29.1 4.9 L30.4 10.6 Z" fill={GOLD} />
          <circle cx="14.9" cy="4.5" r="0.95" fill={GOLD} />
          <circle cx="22" cy="3.6" r="0.95" fill={GOLD} />
          <circle cx="29.1" cy="4.5" r="0.95" fill={GOLD} />
          <circle cx="20.1" cy="13.6" r="0.62" fill={OUT} stroke="none" />
          <circle cx="23.9" cy="13.6" r="0.62" fill={OUT} stroke="none" />
        </>
      )}
      {rank === 'Q' && (
        <>
          {/* flower held at the shoulder */}
          <path d="M33.2 25.5 Q34.8 21 34.2 18.2" fill="none" strokeWidth="0.9" />
          <g stroke="none">
            <circle cx="34.2" cy="16.2" r="1.25" fill={acc} />
            <circle cx="32.1" cy="17.4" r="1.25" fill={acc} />
            <circle cx="36.3" cy="17.4" r="1.25" fill={acc} />
            <circle cx="33.2" cy="19" r="1.25" fill={acc} />
            <circle cx="35.2" cy="19" r="1.25" fill={acc} />
            <circle cx="34.2" cy="17.7" r="1" fill={GOLD} />
          </g>
          <path d={ROBE} fill={robe} />
          <path d="M14 30 L22 24.5 L30 30" fill="none" stroke={GOLD} strokeWidth="1.2" />
          <path d={COLLAR} fill={WHITE} />
          <path d="M16.2 10.5 Q13.8 17.5 15.2 24.5 L18.4 21.5 Q17.1 15.5 17.9 11.5 Z" fill="#6a4a30" />
          <path d="M27.8 10.5 Q30.2 17.5 28.8 24.5 L25.6 21.5 Q26.9 15.5 26.1 11.5 Z" fill="#6a4a30" />
          <ellipse cx="22" cy="15.6" rx="4.6" ry="4.9" fill={SKIN} />
          <path d="M14.8 9.8 Q22 3.8 29.2 9.8 L28.4 11.8 Q22 6.8 15.6 11.8 Z" fill={GOLD} />
          <circle cx="17.4" cy="7.7" r="0.85" fill={WHITE} />
          <circle cx="22" cy="5.7" r="0.85" fill={WHITE} />
          <circle cx="26.6" cy="7.7" r="0.85" fill={WHITE} />
          <circle cx="20.3" cy="14.8" r="0.62" fill={OUT} stroke="none" />
          <circle cx="23.7" cy="14.8" r="0.62" fill={OUT} stroke="none" />
          <path d="M20.9 17.8 Q22 18.6 23.1 17.8" fill="none" strokeWidth="0.5" />
          <g stroke="none">
            <circle cx="19.6" cy="22.4" r="0.6" fill={GOLD} />
            <circle cx="22" cy="22.9" r="0.6" fill={GOLD} />
            <circle cx="24.4" cy="22.4" r="0.6" fill={GOLD} />
          </g>
        </>
      )}
      {rank === 'J' && (
        <>
          {/* halberd staff */}
          <path d="M8.9 1 L11 3.5 L8.9 6 L6.8 3.5 Z" fill={GOLD} />
          <rect x="8.2" y="4.5" width="1.5" height="26" fill="#a97f3c" />
          <path d={ROBE} fill={robe} />
          <path d="M16.5 22.5 L15 34 M22 24 L22 34 M27.5 22.5 L29 34" stroke={GOLD} strokeWidth="1.1" fill="none" />
          <path d={COLLAR} fill={WHITE} />
          <ellipse cx="22" cy="16" rx="4.7" ry="4.9" fill={SKIN} />
          <path d="M17 12.5 Q22 10.2 27 12.5 L27 16 Q22 13.5 17 16 Z" fill="#7a5230" />
          <path d="M26.5 5.8 Q30.5 1.5 34 3.4" fill="none" stroke={WHITE} strokeWidth="1.1" />
          <ellipse cx="20.8" cy="6.9" rx="7.6" ry="3.1" fill={acc} transform="rotate(-9 20.8 6.9)" />
          <path d="M13.8 9.2 L28.2 9.2 L27.6 11.8 L14.4 11.8 Z" fill={GOLD} />
          <circle cx="20.2" cy="15" r="0.62" fill={OUT} stroke="none" />
          <circle cx="23.8" cy="15" r="0.62" fill={OUT} stroke="none" />
        </>
      )}
      <text x="7.5" y="31" fontSize="7" fill={pipColor} stroke="none" textAnchor="middle">{sym}</text>
    </g>
  );

  return (
    <svg viewBox="0 0 44 68" aria-hidden="true">
      {half}
      <g transform="rotate(180 22 34)">{half}</g>
      <line x1="3" y1="34" x2="41" y2="34" stroke="#d9d3c3" strokeWidth="0.6" />
    </svg>
  );
}

export function CardView({ card, faceDown, size, selected, dimmed, onClick }: Props) {
  const cls = [
    'card',
    size === 'small' ? 'card-small' : size === 'mid' ? 'card-mid' : '',
    faceDown ? 'card-back' : '',
    selected ? 'card-selected' : '',
    dimmed ? 'card-dimmed' : '',
    onClick && !dimmed ? 'card-clickable' : '',
  ].filter(Boolean).join(' ');

  if (faceDown || !card) {
    return <div className={cls} />;
  }

  const sym = SUIT_SYMBOL[card.suit];
  const isCourt = card.rank === 'K' || card.rank === 'Q' || card.rank === 'J';

  return (
    <div className={`${cls} ${isRed(card.suit) ? 'card-red' : 'card-black'}`} onClick={dimmed ? undefined : onClick}>
      <div className="card-corner">
        <span className={card.rank === '10' ? 'rank-ten' : undefined}>{card.rank}</span>
        <span className="corner-suit">{sym}</span>
      </div>
      {card.rank === 'A' ? (
        <div className="card-ace">{sym}</div>
      ) : isCourt ? (
        <div className="card-court">
          <CourtArt rank={card.rank as 'K' | 'Q' | 'J'} suit={card.suit} />
        </div>
      ) : (
        <div className="card-pips">
          {PIP_LAYOUT[card.rank].map(([x, y, flip], i) => (
            <span
              key={i}
              className={flip ? 'pip pip-flip' : 'pip'}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {sym}
            </span>
          ))}
        </div>
      )}
      <div className="card-corner card-corner-flip">
        <span className={card.rank === '10' ? 'rank-ten' : undefined}>{card.rank}</span>
        <span className="corner-suit">{sym}</span>
      </div>
    </div>
  );
}
