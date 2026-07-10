import { useEffect, useMemo, useRef, useState } from 'react';
import { GameAction, GameState } from '../engine/game';
import { partnerOf } from '../engine/modes';
import { legalPlays } from '../engine/tricks';
import { Card, RANK_POWER, Suit, SUITS, SUIT_SYMBOL, isRed } from '../engine/types';
import { CardView } from './CardView';

const SEAT_POS: Record<number, [number, number][]> = {
  3: [[50, 100], [12, 26], [88, 26]],
  4: [[50, 100], [8, 50], [50, 12], [92, 50]],
  5: [[50, 100], [7, 58], [22, 15], [78, 15], [93, 58]],
  6: [[50, 100], [7, 62], [16, 16], [50, 10], [84, 16], [93, 62]],
};

export const TEAM_COLORS = ['#53b4e8', '#f0a53c', '#b26fd1', '#6dbf73', '#e06868'];

interface Props {
  state: GameState;
  names: string[];
  dispatch: (a: GameAction) => void;
}

interface Flight {
  key: number;
  from: number;
  to: number;
  count: number;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Trump first, then order suits so touching suits alternate color when possible. */
function suitOrder(hand: Card[], trump: Suit | null): Suit[] {
  const present = SUITS.filter((s) => hand.some((c) => c.suit === s));
  let best = present;
  let bestScore = Infinity;
  for (const perm of permutations(present)) {
    if (trump && present.includes(trump) && perm[0] !== trump) continue;
    let sameColorTouches = 0;
    for (let i = 1; i < perm.length; i++) {
      if (isRed(perm[i]) === isRed(perm[i - 1])) sameColorTouches++;
    }
    if (sameColorTouches < bestScore) {
      bestScore = sameColorTouches;
      best = perm;
    }
  }
  return best;
}

function sortHand(hand: Card[], trump: Suit | null): Card[] {
  const order = suitOrder(hand, trump);
  return [...hand].sort((a, b) => {
    const sa = order.indexOf(a.suit);
    const sb = order.indexOf(b.suit);
    if (sa !== sb) return sa - sb;
    if (RANK_POWER[a.rank] !== RANK_POWER[b.rank]) return RANK_POWER[b.rank] - RANK_POWER[a.rank];
    return a.id < b.id ? -1 : 1;
  });
}

export function teamName(state: GameState, names: string[], team: number): string {
  const seats = state.mode.teams
    .map((t, s) => (t === team ? s : -1))
    .filter((s) => s >= 0);
  return seats.map((s) => names[s]).join(' & ');
}

function isActing(state: GameState, seat: number, partner: number | null): boolean {
  switch (state.phase) {
    case 'bidding':
    case 'play':
      return state.turn === seat;
    case 'trump':
    case 'discard':
    case 'pass2':
      return state.bidWinner === seat;
    case 'pass1':
      return partner === seat;
    default:
      return false;
  }
}

/** Face-down cards strewn about, one per trick taken. */
function Strewn({ count }: { count: number }) {
  const n = Math.min(count, 9);
  return (
    <div className="strewn">
      {Array.from({ length: n }).map((_, i) => (
        <i key={i} style={{
          transform: `translate(${((i * 37) % 30) - 15}px, ${((i * 53) % 18) - 9}px) rotate(${((i * 67) % 52) - 26}deg)`,
        }} />
      ))}
    </div>
  );
}

export function GameTable({ state, names, dispatch }: Props) {
  const { mode } = state;
  const positions = SEAT_POS[mode.players];
  const [selection, setSelection] = useState<string[]>([]);
  const [collect, setCollect] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const prevPhase = useRef(state.phase);
  const flightKey = useRef(0);

  useEffect(() => setSelection([]), [state.phase, state.handNumber]);

  // Trick pickup: let the completed trick sit in the middle, then sweep it to the winner.
  useEffect(() => {
    if (state.phase === 'trickEnd') {
      setCollect(false);
      const t = setTimeout(() => setCollect(true), 750);
      return () => clearTimeout(t);
    }
    setCollect(false);
  }, [state.phase, state.tricksPlayed]);

  // Card-pass flights between partner and bid winner.
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = state.phase;
    if (mode.passCount === 0 || state.bidWinner < 0) return;
    const partnerSeat = partnerOf(mode, state.bidWinner);
    if (partnerSeat === null) return;

    let flight: Flight | null = null;
    if (prev === 'pass1' && state.phase === 'pass2') {
      flight = { key: flightKey.current++, from: partnerSeat, to: state.bidWinner, count: mode.passCount };
    } else if (prev === 'pass2' && state.phase === 'meld') {
      flight = { key: flightKey.current++, from: state.bidWinner, to: partnerSeat, count: mode.passCount };
    }
    if (flight) {
      const f = flight;
      setFlights((fs) => [...fs, f]);
      const t = setTimeout(() => setFlights((fs) => fs.filter((x) => x.key !== f.key)), 1100);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.bidWinner, mode]);

  const partner = state.bidWinner >= 0 ? partnerOf(mode, state.bidWinner) : null;

  const humanNeedsPick =
    (state.phase === 'discard' && state.bidWinner === 0) ||
    (state.phase === 'pass1' && partner === 0) ||
    (state.phase === 'pass2' && state.bidWinner === 0);
  const pickCount = state.phase === 'discard' ? mode.kittySize : mode.passCount;

  const humanTurnToPlay = state.phase === 'play' && state.turn === 0;
  const legal = useMemo(
    () => (humanTurnToPlay ? legalPlays(state.hands[0], state.trick, state.trump!) : []),
    [state, humanTurnToPlay],
  );
  const legalIds = new Set(legal.map((c) => c.id));

  const hand = sortHand(state.hands[0] ?? [], state.trump);
  const humanActive = isActing(state, 0, partner) || humanTurnToPlay;
  const meldVisible = state.phase === 'meld';
  const meldKnown = state.melds.some((m) => m !== null);

  const toggleSelect = (id: string) => {
    setSelection((sel) =>
      sel.includes(id) ? sel.filter((s) => s !== id)
        : sel.length < pickCount ? [...sel, id] : sel);
  };

  const confirmPick = () => {
    if (selection.length !== pickCount) return;
    if (state.phase === 'discard') dispatch({ type: 'DISCARD', seat: 0, cardIds: selection });
    else dispatch({ type: 'PASS_CARDS', seat: 0, cardIds: selection });
  };

  const onCardClick = (card: Card) => {
    if (humanNeedsPick) toggleSelect(card.id);
    else if (humanTurnToPlay && legalIds.has(card.id)) {
      dispatch({ type: 'PLAY', seat: 0, cardId: card.id });
    }
  };

  const trickCount = (team: number) =>
    state.captured[team] ? Math.floor(state.captured[team].length / mode.players) : 0;

  const teamMeld = (team: number) =>
    state.melds.reduce((sum, m, seat) => (mode.teams[seat] === team ? sum + (m?.total ?? 0) : sum), 0);

  const meldCardsFor = (seat: number): Card[] => {
    const m = state.melds[seat];
    if (!m) return [];
    const idSet = new Set(m.cardIds);
    return sortHand(state.hands[seat].filter((c) => idSet.has(c.id)), state.trump);
  };

  const statusText = (() => {
    switch (state.phase) {
      case 'bidding':
        return state.turn === 0 ? 'Your bid.' : '';
      case 'trump':
        return state.bidWinner === 0 ? 'Name trump.' : `${names[state.bidWinner]} is naming trump…`;
      case 'discard':
        return state.bidWinner === 0 ? '' : `${names[state.bidWinner]} is burying the kitty…`;
      case 'pass1':
        return partner === 0 ? '' : `${names[partner!]} is passing cards…`;
      case 'pass2':
        return state.bidWinner === 0 ? '' : `${names[state.bidWinner]} is passing back…`;
      case 'meld':
        return 'Meld is on the table.';
      case 'play':
        return state.turn === 0 ? 'Your play.' : '';
      case 'trickEnd':
        return `${names[state.trickWinner]} take${state.trickWinner === 0 ? '' : 's'} the trick.`;
      default:
        return '';
    }
  })();

  const isTrickEnd = state.phase === 'trickEnd';

  return (
    <div className="table-wrap">
      <div className="felt">
        {/* Scoreboard */}
        <div className="board">
          <div className="board-head">
            <span>First to {mode.target}</span>
            {state.trump && (
              <span className={`board-trump ${isRed(state.trump) ? 'suit-red' : ''}`}>
                {SUIT_SYMBOL[state.trump]}
              </span>
            )}
          </div>
          {state.scores.map((score, team) => (
            <div key={team} className="board-row">
              <span className="team-dot" style={{ background: TEAM_COLORS[team] }} />
              <span className="board-name">{teamName(state, names, team)}</span>
              {meldKnown && state.phase !== 'handEnd' && state.phase !== 'gameOver' && (
                <span className="board-meld" title="Meld this hand">{teamMeld(team)}</span>
              )}
              <span className="board-score">{score}</span>
            </div>
          ))}
          {state.highSeat >= 0 && state.phase !== 'gameOver' && (
            <div className="board-bid">
              Bid {state.highBid} — {names[state.bidWinner >= 0 ? state.bidWinner : state.highSeat]}
            </div>
          )}
        </div>

        {/* Opponent seats */}
        {positions.map(([x, y], seat) => seat !== 0 && (
          <div key={seat} className="seat" style={{ left: `${x}%`, top: `${y}%` }}>
            <div className={`avatar ${isActing(state, seat, partner) ? 'avatar-active' : ''} ${state.phase === 'bidding' && state.passed[seat] ? 'avatar-passed' : ''}`}
              style={{ ['--team' as string]: TEAM_COLORS[mode.teams[seat]] }}>
              {names[seat][0]}
              {state.dealer === seat && <span className="chip chip-dealer">D</span>}
              {state.bidWinner === seat && state.phase !== 'bidding' && state.phase !== 'gameOver' && (
                <span className="chip chip-bid">{state.highBid}</span>
              )}
            </div>
            <div className="seat-name">{names[seat]}</div>
            <div className="seat-fan">
              {state.hands[seat]?.slice(0, 12).map((c, i, arr) => (
                <div key={c.id} className="fan-back"
                  style={{ transform: `rotate(${(i - (arr.length - 1) / 2) * 5}deg)` }} />
              ))}
            </div>
            {state.phase === 'bidding' && (
              state.passed[seat]
                ? <div className="seat-bubble bubble-pass">Passed</div>
                : <div className="seat-bubble">{state.highSeat === seat ? `Bid ${state.highBid}` : ''}</div>
            )}
            {trickCount(mode.teams[seat]) > 0 && (
              <div className="seat-strewn"><Strewn count={trickCount(mode.teams[seat])} /></div>
            )}
          </div>
        ))}

        {/* Meld laid out on the table */}
        {meldVisible && positions.map(([sx, sy], seat) => {
          const cards = meldCardsFor(seat);
          if (cards.length === 0) return null;
          const mx = sx + (50 - sx) * 0.42;
          const my = sy + (44 - sy) * (seat === 0 ? 0.34 : 0.45);
          return (
            <div key={`meld-${seat}`} className="meld-row" style={{ left: `${mx}%`, top: `${my}%` }}>
              <span className="meld-row-badge">{state.melds[seat]!.total}</span>
              {cards.map((c) => <CardView key={c.id} card={c} size="mid" />)}
            </div>
          );
        })}

        {/* Trick */}
        <div className="trick-area">
          {state.trick.map((p, i) => {
            const [sx, sy] = positions[p.seat];
            const doCollect = isTrickEnd && collect;
            const [wx, wy] = doCollect ? positions[state.trickWinner] : [0, 0];
            const tx = doCollect ? wx : 50 + (sx - 50) * 0.15;
            const ty = doCollect ? Math.min(wy, 88) : 45 + (sy - 45) * 0.17;
            return (
              <div
                key={p.card.id}
                className={[
                  'trick-card',
                  doCollect ? 'trick-collect' : '',
                  isTrickEnd && p.seat === state.trickWinner ? 'trick-winner' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  left: `${tx}%`,
                  top: `${ty}%`,
                  ['--sx' as string]: `${(sx - 50) * 3.2}px`,
                  ['--sy' as string]: `${(sy - 46) * 3.2}px`,
                  ['--rot' as string]: `${((p.seat * 47 + i * 13) % 15) - 7}deg`,
                }}
              >
                <CardView card={p.card} />
              </div>
            );
          })}

          {/* Passed cards in flight */}
          {flights.map((f) =>
            Array.from({ length: f.count }).map((_, i) => (
              <div key={`${f.key}-${i}`} className="flight-card" style={{
                ['--fx' as string]: `${positions[f.from][0]}%`,
                ['--fy' as string]: `${Math.min(positions[f.from][1], 94)}%`,
                ['--tx' as string]: `${positions[f.to][0]}%`,
                ['--ty' as string]: `${Math.min(positions[f.to][1], 94)}%`,
                animationDelay: `${i * 80}ms`,
              }} />
            )))}

          {state.phase === 'bidding' && mode.kittySize > 0 && (
            <div className="kitty-display">
              {Array.from({ length: mode.kittySize }).map((_, i) => (
                <div key={i} className="fan-back" style={{ transform: `rotate(${(i - 1) * 8}deg)` }} />
              ))}
              <span>kitty</span>
            </div>
          )}
        </div>

        {statusText && <div className="status-bar">{statusText}</div>}

        {state.phase === 'bidding' && state.turn === 0 && (
          <BidPanel state={state} dispatch={dispatch} />
        )}
        {state.phase === 'trump' && state.bidWinner === 0 && (
          <div className="action-panel">
            <div className="panel-label">Name trump</div>
            <div className="suit-buttons">
              {SUITS.map((s) => (
                <button key={s} className={`suit-btn ${isRed(s) ? 'suit-red' : ''}`}
                  onClick={() => dispatch({ type: 'NAME_TRUMP', seat: 0, suit: s })}>
                  {SUIT_SYMBOL[s]}
                </button>
              ))}
            </div>
          </div>
        )}
        {humanNeedsPick && (
          <div className="pass-tray">
            <div className="tray-label">
              {state.phase === 'discard'
                ? `Bury ${pickCount} cards`
                : state.phase === 'pass1'
                  ? `Pass ${pickCount} to ${names[state.bidWinner]}`
                  : `Pass ${pickCount} back to ${names[partner!]}`}
            </div>
            <div className="tray-slots">
              {Array.from({ length: pickCount }).map((_, i) => {
                const id = selection[i];
                const card = id ? state.hands[0].find((c) => c.id === id) : undefined;
                return card ? (
                  <div key={id} className="tray-card" onClick={() => toggleSelect(id!)}>
                    <CardView card={card} size="mid" />
                  </div>
                ) : (
                  <div key={`empty-${i}`} className="tray-empty" />
                );
              })}
            </div>
            <button className="btn btn-confirm" disabled={selection.length !== pickCount} onClick={confirmPick}>
              {state.phase === 'discard' ? 'Bury' : 'Pass'}
            </button>
          </div>
        )}
        {state.phase === 'meld' && (
          <div className="action-panel">
            <div className="bid-controls">
              <button className="btn btn-gold" onClick={() => dispatch({ type: 'CONTINUE' })}>
                Play hand
              </button>
              {state.bidWinner === 0 && (
                <button className="btn btn-muted" onClick={() => dispatch({ type: 'THROW_IN', seat: 0 })}>
                  Go set (−{state.highBid})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Human hand */}
      <div className="hand-row">
        <div className="hand-side">
          <div className={`avatar avatar-you ${humanActive ? 'avatar-active' : ''}`}
            style={{ ['--team' as string]: TEAM_COLORS[mode.teams[0]] }}>
            You
            {state.dealer === 0 && <span className="chip chip-dealer">D</span>}
            {state.bidWinner === 0 && state.phase !== 'bidding' && state.phase !== 'gameOver' && (
              <span className="chip chip-bid">{state.highBid}</span>
            )}
          </div>
        </div>
        <div className="hand-cards">
          {(humanNeedsPick ? hand.filter((c) => !selection.includes(c.id)) : hand).map((c, i) => (
            <div key={c.id} className="hand-slot" style={{ ['--i' as string]: i }}>
              <CardView
                card={c}
                selected={selection.includes(c.id)}
                dimmed={humanTurnToPlay && !legalIds.has(c.id)}
                onClick={
                  humanNeedsPick || (humanTurnToPlay && legalIds.has(c.id))
                    ? () => onCardClick(c)
                    : undefined
                }
              />
            </div>
          ))}
        </div>
        {trickCount(mode.teams[0]) > 0 && (
          <div className="hand-side">
            <Strewn count={trickCount(mode.teams[0])} />
          </div>
        )}
      </div>
    </div>
  );
}

function BidPanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const min = state.highSeat === -1 ? state.mode.bidStart : state.highBid + 1;
  const [amount, setAmount] = useState(min);
  useEffect(() => setAmount(min), [min]);

  return (
    <div className="action-panel bid-panel">
      <div className="bid-controls">
        <button className="bid-pass" onClick={() => dispatch({ type: 'PASS_BID', seat: 0 })}>
          Pass
        </button>
        <button className="bid-step" disabled={amount <= min}
          onClick={() => setAmount((a) => Math.max(min, a - 1))}>−</button>
        <button className="bid-main" onClick={() => dispatch({ type: 'BID', seat: 0, amount })}>
          Bid {amount}
        </button>
        <button className="bid-step" onClick={() => setAmount((a) => a + 1)}>+</button>
      </div>
    </div>
  );
}
