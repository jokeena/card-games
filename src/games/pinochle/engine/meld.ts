import { Card, Rank, Suit, SUITS, SUIT_NAME } from './types';

export interface MeldItem {
  name: string;
  points: number;
  cardIds: string[];
}

export interface MeldResult {
  items: MeldItem[];
  total: number;
  /** Unique ids of every card participating in any meld — for table display. */
  cardIds: string[];
}

type Groups = Record<Suit, Record<Rank, Card[]>>;

function groupCards(hand: Card[]): Groups {
  const g = {} as Groups;
  for (const s of SUITS) g[s] = { A: [], '10': [], K: [], Q: [], J: [], '9': [] };
  for (const c of hand) g[c.suit][c.rank].push(c);
  return g;
}

const ids = (...cards: Card[]) => cards.map((c) => c.id);

/**
 * House rules in effect:
 * - Run = 15; each extra trump K or Q alongside a single run = +2
 *   (A-10-K-K-Q-J = 17, A-10-K-K-Q-Q-J = 19). Trump marriage is never
 *   scored separately when a run is present.
 * - Double run = 150 (10x rule).
 * - Doubles around = 10x the single value (100/80/60/40).
 */
export function computeMeld(hand: Card[], trump: Suit): MeldResult {
  const g = groupCards(hand);
  const items: MeldItem[] = [];
  const t = g[trump];

  const runDepth = Math.min(t.A.length, t['10'].length, t.K.length, t.Q.length, t.J.length);
  if (runDepth === 2) {
    items.push({
      name: 'Double run',
      points: 150,
      cardIds: ids(...t.A, ...t['10'], ...t.K, ...t.Q, ...t.J),
    });
  } else if (runDepth === 1) {
    const extras = (t.K.length - 1) + (t.Q.length - 1);
    items.push({
      name: extras > 0 ? `Run +${extras} extra K/Q` : 'Run',
      points: 15 + 2 * extras,
      cardIds: ids(t.A[0], t['10'][0], ...t.K, ...t.Q, t.J[0]),
    });
  } else {
    const m = Math.min(t.K.length, t.Q.length);
    if (m > 0) {
      items.push({
        name: m === 2 ? 'Two trump marriages' : 'Trump marriage',
        points: 4 * m,
        cardIds: ids(...t.K.slice(0, m), ...t.Q.slice(0, m)),
      });
    }
  }

  for (const s of SUITS) {
    if (s === trump) continue;
    const m = Math.min(g[s].K.length, g[s].Q.length);
    if (m > 0) {
      items.push({
        name: `${m === 2 ? 'Two marriages' : 'Marriage'} in ${SUIT_NAME[s]}`,
        points: 2 * m,
        cardIds: ids(...g[s].K.slice(0, m), ...g[s].Q.slice(0, m)),
      });
    }
  }

  const AROUND: [Rank, string, number][] = [
    ['A', 'Aces', 10], ['K', 'Kings', 8], ['Q', 'Queens', 6], ['J', 'Jacks', 4],
  ];
  for (const [rank, label, value] of AROUND) {
    const minCount = Math.min(...SUITS.map((s) => g[s][rank].length));
    if (minCount === 2) {
      items.push({
        name: `Double ${label.toLowerCase()} around`,
        points: value * 10,
        cardIds: SUITS.flatMap((s) => ids(...g[s][rank])),
      });
    } else if (minCount === 1) {
      items.push({
        name: `${label} around`,
        points: value,
        cardIds: SUITS.map((s) => g[s][rank][0].id),
      });
    }
  }

  const p = Math.min(g.D.J.length, g.S.Q.length);
  if (p === 2) items.push({ name: 'Double pinochle', points: 30, cardIds: ids(...g.D.J, ...g.S.Q) });
  else if (p === 1) items.push({ name: 'Pinochle', points: 4, cardIds: [g.D.J[0].id, g.S.Q[0].id] });

  if (t['9'].length > 0) {
    items.push({
      name: t['9'].length === 2 ? 'Two 9s of trump' : '9 of trump',
      points: t['9'].length,
      cardIds: ids(...t['9']),
    });
  }

  return {
    items,
    total: items.reduce((sum, i) => sum + i.points, 0),
    cardIds: [...new Set(items.flatMap((i) => i.cardIds))],
  };
}
