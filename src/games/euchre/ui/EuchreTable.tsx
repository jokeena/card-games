import { useEffect, useMemo, useRef, useState } from 'react';
import { CardView } from '../../../cards/CardView';
import { GameAction, GameState, PLAYERS, TEAM_OF, partnerOf } from '../engine/game';
import { legalPlays, winningIndex } from '../engine/tricks';
import { Card, SUITS, SUIT_SYMBOL, Suit, effectiveSuit, isRed, trickPower } from '../engine/types';
import { ScoreFives } from './ScoreFives';

const SEAT_POS: [number, number][] = [[50, 100], [8, 50], [50, 16], [92, 50]];
const MOBILE_SEAT_POS: [number, number][] = [[50, 100], [11, 44], [50, 18], [89, 44]];
const TRICK_OFFSET: [number, number][] = [[0, 76], [-94, 0], [0, -52], [94, 0]];
const MOBILE_TRICK_OFFSET: [number, number][] = [[0, 62], [-68, 0], [0, -46], [68, 0]];

/** Your team plays the red 5s, theirs the black — matching the avatar rings. */
export const TEAM_COLORS = ['#e06868', '#4a5568'];
const TEAM_FIVES: ('red' | 'black')[] = ['red', 'black'];

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 740px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 740px)');
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

/**
 * Sort for display by EFFECTIVE suit (the left bower files with trump),
 * alternating colors where possible, trump first when named.
 */
function sortHand(hand: Card[], trump: Suit | null): Card[] {
  const eff = (c: Card) => (trump ? effectiveSuit(c, trump) : c.suit);
  const wheel: Suit[] = ['C', 'D', 'S', 'H'];
  const present = wheel.filter((s) => hand.some((c) => eff(c) === s));
  const perms = (arr: Suit[]): Suit[][] =>
    arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
  let best = present;
  let bestKey = Infinity;
  for (const perm of perms(present)) {
    let touches = 0;
    for (let i = 1; i < perm.length; i++) if (isRed(perm[i]) === isRed(perm[i - 1])) touches++;
    const key = touches * 10 + (trump && perm[0] === trump ? 0 : 1);
    if (key < bestKey) { bestKey = key; best = perm; }
  }
  const rank = (c: Card) => (trump ? trickPower(c, trump) : trickPower(c, c.suit));
  return [...hand].sort((a, b) => {
    const sa = best.indexOf(eff(a));
    const sb = best.indexOf(eff(b));
    if (sa !== sb) return sa - sb;
    return rank(b) - rank(a);
  });
}

export function teamName(names: string[], team: number): string {
  return [0, 1, 2, 3].filter((s) => TEAM_OF[s] === team).map((s) => names[s]).join(' & ');
}

function isActing(state: GameState, seat: number): boolean {
  switch (state.phase) {
    case 'order1':
    case 'order2':
    case 'play':
      return state.turn === seat;
    case 'discard':
      return state.dealer === seat;
    default:
      return false;
  }
}

/** Seats that have already passed this order round (turn walks from left of dealer). */
function passedThisRound(state: GameState): boolean[] {
  const passed = Array(PLAYERS).fill(false);
  if (state.phase !== 'order1' && state.phase !== 'order2') return passed;
  for (let i = 1; i <= PLAYERS; i++) {
    const seat = (state.dealer + i) % PLAYERS;
    if (seat === state.turn) break;
    passed[seat] = true;
  }
  return passed;
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

interface Props {
  state: GameState;
  names: string[];
  dispatch: (a: GameAction) => void;
}

export function EuchreTable({ state, names, dispatch }: Props) {
  const narrow = useIsNarrow();
  const positions = narrow ? MOBILE_SEAT_POS : SEAT_POS;
  const trickOffsets = narrow ? MOBILE_TRICK_OFFSET : TRICK_OFFSET;
  const [collect, setCollect] = useState(false);
  const [aloneSel, setAloneSel] = useState(false);
  const [drawN, setDrawN] = useState(0);

  useEffect(() => setAloneSel(false), [state.handNumber, state.phase]);

  // Trick pickup: let the completed trick sit, then sweep it to the winner.
  useEffect(() => {
    if (state.phase === 'trickEnd') {
      setCollect(false);
      const t = setTimeout(() => setCollect(true), 750);
      return () => clearTimeout(t);
    }
    setCollect(false);
  }, [state.phase, state.tricksPlayed]);

  // Opening ritual: flip the draw cards around the table until the black
  // jack lands, hold on it, then deal. drawCards is fixed in state; drawN
  // is just the reveal cursor.
  const isDraw = state.phase === 'dealerDraw';
  useEffect(() => {
    if (!isDraw) return;
    setDrawN(0);
    const iv = setInterval(() => {
      setDrawN((n) => {
        if (n >= state.drawCards.length) { clearInterval(iv); return n; }
        return n + 1;
      });
    }, 260);
    return () => clearInterval(iv);
  }, [isDraw, state.drawCards.length]);
  const drawDone = isDraw && drawN >= state.drawCards.length;
  useEffect(() => {
    if (!drawDone) return;
    const t = setTimeout(() => dispatch({ type: 'CONTINUE' }), 1600);
    return () => clearTimeout(t);
  }, [drawDone, dispatch]);

  const passed = passedThisRound(state);
  const humanTurnToPlay = state.phase === 'play' && state.turn === 0 && state.inactive !== 0;
  const humanDiscarding = state.phase === 'discard' && state.dealer === 0;
  const legal = useMemo(
    () => (humanTurnToPlay ? legalPlays(state.hands[0], state.trick, state.trump!) : []),
    [state, humanTurnToPlay],
  );
  const legalIds = new Set(legal.map((c) => c.id));

  const hand = sortHand(state.hands[0] ?? [], state.trump ?? state.turnCard?.suit ?? null);

  const onCardClick = (card: Card) => {
    if (humanDiscarding) dispatch({ type: 'DISCARD', seat: 0, cardId: card.id });
    else if (humanTurnToPlay && legalIds.has(card.id)) dispatch({ type: 'PLAY', seat: 0, cardId: card.id });
  };

  const statusText = (() => {
    switch (state.phase) {
      case 'dealerDraw':
        return drawDone
          ? `${state.dealer === 0 ? 'You draw' : `${names[state.dealer]} draws`} the black jack and deal${state.dealer === 0 ? '' : 's'}.`
          : 'First black jack deals…';
      case 'order1':
        return state.turn === 0
          ? (state.dealer === 0 ? 'Pick it up, or turn it down.' : 'Order it up, or pass.')
          : `${names[state.turn]} is thinking…`;
      case 'order2':
        return state.turn === 0
          ? (state.dealer === 0 ? "You're stuck — name trump." : 'Name a suit, or pass.')
          : `${names[state.turn]} is thinking…`;
      case 'discard':
        return state.dealer === 0 ? 'Click a card to bury it.' : `${names[state.dealer]} picks it up…`;
      case 'play':
        return humanTurnToPlay ? 'Your play.' : '';
      case 'trickEnd':
        return `${names[state.trickWinner]} take${state.trickWinner === 0 ? '' : 's'} the trick.`;
      default:
        return '';
    }
  })();

  const showOrderPanel = (state.phase === 'order1' || state.phase === 'order2') &&
    state.turn === 0 && !isDraw;
  const makerVisible = state.maker >= 0 && state.phase !== 'gameOver';

  return (
    <div className="table-wrap">
      <div className="felt" data-mark={state.trump ? SUIT_SYMBOL[state.trump] : ''}>
        {/* Compact board: target, trump, and this hand's trick tally */}
        <div className="board board-euchre">
          <div className="board-head">
            <span>First to 10</span>
            {state.trump && (
              <span className={`board-trump ${isRed(state.trump) ? 'suit-red' : ''}`}>
                {SUIT_SYMBOL[state.trump]}
              </span>
            )}
          </div>
          {[0, 1].map((team) => (
            <div key={team} className="board-row">
              <span className="team-dot" style={{ background: TEAM_COLORS[team] }} />
              <span className="board-name">{teamName(names, team)}</span>
              {(state.phase === 'play' || state.phase === 'trickEnd') && (
                <span className="tally">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <i key={i} className={i < (state.tricksTaken[team] ?? 0) ? 'tally-won' : ''} />
                  ))}
                </span>
              )}
              <span className="board-score">{state.scores[team]}</span>
            </div>
          ))}
          {makerVisible && (
            <div className="board-bid">
              {state.maker === 0 ? 'You' : names[state.maker]} made it{state.alone ? ' — alone' : ''}
            </div>
          )}
        </div>

        {/* The score fives, kept at each team's edge of the table */}
        <div className="fives-spot fives-you">
          <ScoreFives score={state.scores[0] ?? 0} color={TEAM_FIVES[0]} />
        </div>
        <div className="fives-spot fives-them">
          <ScoreFives score={state.scores[1] ?? 0} color={TEAM_FIVES[1]} />
        </div>

        {/* Opponent seats */}
        {positions.map(([x, y], seat) => seat !== 0 && (
          <div key={seat} className="seat" style={{ left: `${x}%`, top: `${y}%` }}>
            <div className={[
              'avatar',
              isActing(state, seat) ? 'avatar-active' : '',
              state.inactive === seat ? 'avatar-out' : '',
              state.maker === seat && makerVisible ? 'avatar-bid' : '',
            ].filter(Boolean).join(' ')}
              style={{ ['--team' as string]: TEAM_COLORS[TEAM_OF[seat]] }}>
              {names[seat][0]}
              {state.dealer === seat && !isDraw && <span className="chip chip-dealer">D</span>}
              {state.maker === seat && makerVisible && state.trump && (
                <span className={`chip chip-bid chip-trump ${isRed(state.trump) ? 'chip-red' : ''}`}>
                  {SUIT_SYMBOL[state.trump]}
                </span>
              )}
            </div>
            <div className="seat-name">
              {names[seat]}
              {state.inactive === seat && <span className="out-note"> · sitting out</span>}
            </div>
            <div className="seat-fan">
              {state.inactive !== seat && state.hands[seat]?.map((c, i, arr) => (
                <div key={c.id} className="fan-back"
                  style={{ transform: `rotate(${(i - (arr.length - 1) / 2) * 5}deg)` }} />
              ))}
            </div>
            {(state.phase === 'order1' || state.phase === 'order2') && passed[seat] && (
              <div className="seat-bubble bubble-pass">Pass</div>
            )}
            {state.maker === seat && state.alone && makerVisible && (
              <div className="seat-bubble bubble-alone">Alone</div>
            )}
            {(state.tricksTaken[TEAM_OF[seat]] ?? 0) > 0 && (
              <div className="seat-strewn"><Strewn count={state.tricksTaken[TEAM_OF[seat]]} /></div>
            )}
          </div>
        ))}

        {/* Dealer draw: cards flipping around the table until the black jack */}
        {isDraw && (
          <div className="draw-layer">
            {state.drawCards.slice(0, drawN).map((d, i) => {
              // Cards land between the seat and the table center, fanning
              // slightly with each lap so nothing hides the avatars.
              const [sx, sy] = positions[d.seat];
              const cx = sx + (50 - sx) * 0.34;
              const cy = sy + (52 - sy) * 0.36;
              const round = Math.floor(i / PLAYERS);
              const isJack = i === state.drawCards.length - 1 && drawN === state.drawCards.length;
              const dx = ((round % 3) - 1) * 26;
              const dy = Math.floor(round / 3) * 16;
              return (
                <div key={`${d.card.id}-${i}`}
                  className={`draw-card ${isJack ? 'draw-jack' : ''}`}
                  style={{
                    left: `calc(${cx}% + ${dx}px)`,
                    top: `calc(${cy}% + ${dy}px)`,
                  }}>
                  <CardView card={d.card} size="small" />
                </div>
              );
            })}
          </div>
        )}

        {/* Kitty and the turn card */}
        {!isDraw && state.phase !== 'gameOver' && (state.turnCard || state.phase === 'order2') && (
          <div className="kitty-spot">
            <div className="kitty-stack">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="fan-back" style={{ transform: `translate(${i * 2}px, ${-i * 2}px)` }} />
              ))}
              {state.turnCard ? (
                <div className="upcard"><CardView card={state.turnCard} size={narrow ? 'small' : 'mid'} /></div>
              ) : (
                <div className="upcard upcard-down"><div className="fan-back" /></div>
              )}
            </div>
            <span className="kitty-note">
              {state.turnCard
                ? 'up for grabs'
                : <><span className={isRed(state.turnedDown!) ? 'suit-red' : ''}>{SUIT_SYMBOL[state.turnedDown!]}</span> turned down</>}
            </span>
          </div>
        )}

        {/* Trick */}
        <div className="trick-area">
          {state.trick.map((p, i) => {
            const [sx, sy] = positions[p.seat];
            const [ox, oy] = trickOffsets[p.seat];
            const doCollect = state.phase === 'trickEnd' && collect;
            const [wx, wy] = doCollect ? positions[state.trickWinner] : [0, 0];
            const leading = (state.phase === 'play' || state.phase === 'trickEnd') &&
              i === winningIndex(state.trick, state.trump!);
            return (
              <div
                key={p.card.id}
                className={[
                  'trick-card',
                  doCollect ? 'trick-collect' : '',
                  leading ? 'trick-leading' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  left: doCollect ? `${wx}%` : `calc(50% + ${ox}px)`,
                  top: doCollect ? `${Math.min(wy, 88)}%` : `calc(52% + ${oy}px)`,
                  ['--fx' as string]: `${sx}%`,
                  ['--fy' as string]: `${Math.min(sy, 96)}%`,
                  ['--rot' as string]: `${((p.seat * 47 + i * 13) % 9) - 4}deg`,
                }}
              >
                <CardView card={p.card} />
              </div>
            );
          })}
        </div>

        {statusText && <div className="status-bar">{statusText}</div>}

        {/* Order round 1: order it up / pass */}
        {showOrderPanel && state.phase === 'order1' && state.turnCard && (
          <div className="action-panel">
            <div className="panel-label">
              {state.dealer === 0 ? 'Pick up the' : 'Order up the'}{' '}
              <span className={isRed(state.turnCard.suit) ? 'suit-red' : ''}>
                {SUIT_SYMBOL[state.turnCard.suit]}
              </span>?
            </div>
            <div className="bid-controls">
              <button className="bid-pass" onClick={() => dispatch({ type: 'PASS', seat: 0 })}>
                {state.dealer === 0 ? 'Turn it down' : 'Pass'}
              </button>
              <button className="bid-main"
                onClick={() => dispatch({ type: 'ORDER_UP', seat: 0, alone: aloneSel })}>
                {state.dealer === 0 ? 'Pick it up' : 'Order it up'}
              </button>
              <button className={`alone-toggle ${aloneSel ? 'alone-on' : ''}`}
                onClick={() => setAloneSel((a) => !a)}>
                Alone
              </button>
            </div>
          </div>
        )}

        {/* Order round 2: name a suit / pass (dealer is stuck) */}
        {showOrderPanel && state.phase === 'order2' && (
          <div className="action-panel">
            <div className="panel-label">Name trump</div>
            <div className="suit-buttons">
              {SUITS.filter((s) => s !== state.turnedDown).map((s) => (
                <button key={s} className={`suit-btn ${isRed(s) ? 'suit-red' : ''}`}
                  onClick={() => dispatch({ type: 'NAME_TRUMP', seat: 0, suit: s, alone: aloneSel })}>
                  {SUIT_SYMBOL[s]}
                </button>
              ))}
            </div>
            <div className="bid-controls">
              {state.dealer !== 0 && (
                <button className="bid-pass" onClick={() => dispatch({ type: 'PASS', seat: 0 })}>
                  Pass
                </button>
              )}
              <button className={`alone-toggle ${aloneSel ? 'alone-on' : ''}`}
                onClick={() => setAloneSel((a) => !a)}>
                Alone
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Human hand */}
      <div className="hand-row">
        <div className="hand-side">
          <div className={[
            'avatar avatar-you',
            isActing(state, 0) || humanTurnToPlay ? 'avatar-active' : '',
            state.inactive === 0 ? 'avatar-out' : '',
            state.maker === 0 && makerVisible ? 'avatar-bid' : '',
          ].filter(Boolean).join(' ')}
            style={{ ['--team' as string]: TEAM_COLORS[0] }}>
            You
            {state.dealer === 0 && !isDraw && <span className="chip chip-dealer">D</span>}
            {state.maker === 0 && makerVisible && state.trump && (
              <span className={`chip chip-bid chip-trump ${isRed(state.trump) ? 'chip-red' : ''}`}>
                {SUIT_SYMBOL[state.trump]}
              </span>
            )}
          </div>
          {(state.phase === 'order1' || state.phase === 'order2') && passed[0] && (
            <div className="seat-bubble bubble-pass">Pass</div>
          )}
          {state.maker === 0 && state.alone && makerVisible && (
            <div className="seat-bubble bubble-alone">Alone</div>
          )}
        </div>
        <div className="hand-cards">
          {hand.map((c, i) => (
            <div key={c.id} className="hand-slot" style={{ ['--i' as string]: i }}>
              <CardView
                card={c}
                dimmed={(humanTurnToPlay && !legalIds.has(c.id)) || state.inactive === 0}
                onClick={
                  humanDiscarding || (humanTurnToPlay && legalIds.has(c.id))
                    ? () => onCardClick(c)
                    : undefined
                }
              />
            </div>
          ))}
        </div>
        <div className="hand-side">
          <Strewn count={state.tricksTaken[0] ?? 0} />
        </div>
      </div>
    </div>
  );
}
