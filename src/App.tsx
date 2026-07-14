import { useEffect, useReducer, useRef, useState } from 'react';
import { botAction, Difficulty } from './bots/bot';
import { GameAction, gameReducer, GameState, newGame } from './engine/game';
import { MODES, ModeConfig, partnerOf } from './engine/modes';
import { winsRemainingTricks } from './engine/tricks';
import { SUIT_NAME, SUIT_SYMBOL, isCounter, isRed } from './engine/types';
import { GameTable, teamName } from './ui/GameTable';
import { Modals, RulesModal } from './ui/Modals';

/* ---------- Saved game & lifetime stats (localStorage) ---------- */

const SAVE_KEY = 'pinochle-save';
const STATS_KEY = 'pinochle-stats';

interface SaveData {
  state: GameState;
  names: string[];
  difficulty: Difficulty;
}

function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (!data?.state?.mode || !data.names || data.state.phase === 'gameOver') return null;
    // Saves from before the public-voids field: backfill it.
    if (!data.state.voids) {
      data.state.voids = Array.from({ length: data.state.mode.players }, () => Array(4).fill(false));
    }
    return data;
  } catch {
    return null;
  }
}

interface ModeStats {
  games: number;
  wins: number;
  hands: number;
  bidsWon: number;
  bidsMade: number;
  bidsSet: number;
  bestHand: number;
  biggestMeld: number;
}

type Stats = Record<string, ModeStats>;

const emptyModeStats = (): ModeStats => ({
  games: 0, wins: 0, hands: 0, bidsWon: 0, bidsMade: 0, bidsSet: 0, bestHand: 0, biggestMeld: 0,
});

function loadStats(): Stats {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}') as Stats;
  } catch {
    return {};
  }
}

function updateStats(modeId: string, apply: (m: ModeStats) => void) {
  const stats = loadStats();
  const m = stats[modeId] ?? (stats[modeId] = emptyModeStats());
  apply(m);
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

const NAME_POOL = ['Audrey', 'James', 'Lorraine', 'Ella', 'Reagan', 'John', 'Sean', 'Cha Cha', 'Carl'];

function drawNames(players: number): string[] {
  const pool = [...NAME_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return ['You', ...pool.slice(0, players - 1)];
}

function actorFor(state: GameState): number | null {
  switch (state.phase) {
    case 'bidding':
    case 'play':
      return state.turn;
    case 'trump':
    case 'discard':
    case 'pass2':
      return state.bidWinner;
    case 'pass1':
      return partnerOf(state.mode, state.bidWinner);
    default:
      return null;
  }
}

/**
 * States the game sits in waiting for the human — the targets undo jumps
 * back to. Jumping only to these keeps undo useful: landing on a bot's turn
 * would just let the bot replay its move immediately.
 */
function isHumanDecision(s: GameState): boolean {
  if (actorFor(s) === 0) return true;
  return s.phase === 'meld' || s.phase === 'handReview' || s.phase === 'handEnd';
}

interface Hist {
  present: GameState;
  past: GameState[];
  /** True right after an undo — pauses auto throw-in/claim so the position isn't instantly replayed. */
  undone: boolean;
}

type HistAction = GameAction | { type: 'UNDO' };

function histReducer(h: Hist, action: HistAction): Hist {
  if (action.type === 'UNDO') {
    const past = [...h.past];
    while (past.length > 0) {
      const s = past.pop()!;
      if (isHumanDecision(s)) return { present: s, past, undone: true };
    }
    return h;
  }
  const next = gameReducer(h.present, action);
  if (next === h.present) return h;
  return { present: next, past: [...h.past.slice(-300), h.present], undone: false };
}

/** ms of "thinking" per phase — bidding snappy, play measured. */
function botDelay(state: GameState): number {
  if (state.phase === 'bidding') return 160;
  if (state.phase === 'play') return 380;
  // Give the face-up kitty reveal time to be read before trump is named.
  if (state.phase === 'trump' && state.mode.kittySize > 0) return 2400;
  return 500;
}

function Game({ mode, difficulty, save, onExit }: {
  mode: ModeConfig;
  difficulty: Difficulty;
  save: SaveData | null;
  onExit: () => void;
}) {
  const [hist, dispatch] = useReducer(
    histReducer, mode,
    (m: ModeConfig): Hist => ({ present: save?.state ?? newGame(m), past: [], undone: false }));
  const { present: state, past, undone } = hist;
  const [showRules, setShowRules] = useState(false);
  const [names] = useState(() => save?.names ?? drawNames(mode.players));
  const canUndo = past.some(isHumanDecision);

  // Persist the game after every change; clear it (and record the result) when it ends.
  const gameRecorded = useRef(false);
  useEffect(() => {
    if (state.phase === 'gameOver') {
      localStorage.removeItem(SAVE_KEY);
      if (!gameRecorded.current) {
        gameRecorded.current = true;
        updateStats(mode.id, (m) => {
          m.games++;
          if (state.winnerTeam === mode.teams[0]) m.wins++;
        });
      }
      return;
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ state, names, difficulty } satisfies SaveData));
  }, [state, names, difficulty, mode]);

  // Per-hand stats, once per hand (a resumed game must not re-count its saved hand).
  const lastHandRecorded = useRef(
    save ? (save.state.phase === 'handEnd' ? save.state.handNumber : save.state.handNumber - 1) : 0);
  useEffect(() => {
    if (state.phase !== 'handEnd' || !state.handResult) return;
    if (state.handNumber <= lastHandRecorded.current) return;
    lastHandRecorded.current = state.handNumber;
    const r = state.handResult;
    const myTeam = mode.teams[0];
    updateStats(mode.id, (m) => {
      m.hands++;
      m.bestHand = Math.max(m.bestHand, r.perTeam[myTeam].delta);
      m.biggestMeld = Math.max(m.biggestMeld, state.melds[0]?.total ?? 0);
      if (r.bidTeam === myTeam) {
        m.bidsWon++;
        if (r.made) m.bidsMade++;
        else m.bidsSet++;
      }
    });
  }, [state, mode]);

  useEffect(() => {
    if (state.phase === 'trickEnd') {
      const t = setTimeout(() => dispatch({ type: 'CONTINUE' }), 1550);
      return () => clearTimeout(t);
    }

    if (state.phase === 'meld') {
      const bidTeam = mode.teams[state.bidWinner];
      const teamMeld = state.melds.reduce(
        (sum, m, seat) => (mode.teams[seat] === bidTeam ? sum + (m?.total ?? 0) : sum), 0);
      const tricksNeeded = state.highBid - teamMeld;

      if (state.bidWinner === 0) {
        // Even taking every trick can't cover the bid: go set automatically.
        const maxTrickPoints =
          state.hands.flat().filter(isCounter).length + state.discard.filter(isCounter).length + 1;
        if (tricksNeeded > maxTrickPoints && !undone) {
          const t = setTimeout(() => dispatch({ type: 'THROW_IN', seat: 0 }), 1200);
          return () => clearTimeout(t);
        }
        return; // human clicks "Play hand"
      }

      // A bot bid winner concedes only a near-mathematically-dead bid (25 trick
      // points exist per hand) — playing on risks feeding the setters more.
      // (Slower when the human just received returned cards, so they can be read.)
      const limit = difficulty === 'hard' ? 23 : difficulty === 'medium' ? 24 : 25;
      if (tricksNeeded > limit && !undone) {
        const wait = partnerOf(mode, state.bidWinner) === 0 ? 2600 : 900;
        const t = setTimeout(() => dispatch({ type: 'THROW_IN', seat: state.bidWinner }), wait);
        return () => clearTimeout(t);
      }
      return; // human clicks "Play hand"
    }

    // Human on lead and guaranteed the rest no matter the order: end it there.
    // With a single card left, just let it be played out normally.
    if (state.phase === 'play' && state.turn === 0 && state.trick.length === 0 && !undone &&
        state.hands[0].length > 1 && winsRemainingTricks(state.hands, 0, state.trump!)) {
      const t = setTimeout(() => dispatch({ type: 'CLAIM_REST', seat: 0 }), 250);
      return () => clearTimeout(t);
    }

    const actor = actorFor(state);
    if (actor !== null && actor !== 0) {
      const t = setTimeout(() => {
        const action = botAction(state, actor, difficulty);
        if (action) dispatch(action);
      }, botDelay(state));
      return () => clearTimeout(t);
    }
  }, [state, undone, difficulty, mode]);

  return (
    <div className="game-root">
      <header className="top-bar">
        <button className="bar-btn" onClick={onExit}>← Menu</button>
        <button className="bar-btn" disabled={!canUndo} onClick={() => dispatch({ type: 'UNDO' })}>
          ↩ Undo
        </button>
        <span className="bar-title">{mode.label}</span>
        <span className="bar-spacer" />
        {state.trump && state.phase !== 'gameOver' && (
          <span className="bar-trump">
            <span className={`bar-trump-sym ${isRed(state.trump) ? 'suit-red' : ''}`}>
              {SUIT_SYMBOL[state.trump]}
            </span>
            {SUIT_NAME[state.trump]} trump
          </span>
        )}
        <button className="bar-btn bar-btn-round" title="Rules" onClick={() => setShowRules(true)}>i</button>
      </header>
      <GameTable state={state} names={names} dispatch={dispatch} />
      <Modals
        state={state}
        names={names}
        onContinue={() => dispatch({ type: 'CONTINUE' })}
        onNewGame={onExit}
      />
      {showRules && <RulesModal mode={mode} onClose={() => setShowRules(false)} />}
    </div>
  );
}

function StatsModal({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Stats>(loadStats);
  const rows = MODES.filter((m) => stats[m.id] && (stats[m.id].games > 0 || stats[m.id].hands > 0));
  const total = rows.reduce((acc, m) => {
    const s = stats[m.id];
    acc.games += s.games; acc.wins += s.wins; acc.hands += s.hands;
    acc.bidsWon += s.bidsWon; acc.bidsMade += s.bidsMade; acc.bidsSet += s.bidsSet;
    acc.bestHand = Math.max(acc.bestHand, s.bestHand);
    acc.biggestMeld = Math.max(acc.biggestMeld, s.biggestMeld);
    return acc;
  }, emptyModeStats());

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Your record</h2>
        {rows.length === 0 ? (
          <p className="modal-note">No finished hands yet — go play one.</p>
        ) : (
          <table className="result-table stats-table">
            <thead>
              <tr>
                <th></th><th>Games</th><th>Won</th><th>Hands</th>
                <th>Bids</th><th>Made</th><th>Set</th><th>Best hand</th><th>Best meld</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const s = stats[m.id];
                return (
                  <tr key={m.id}>
                    <td className="result-name">{m.label}</td>
                    <td>{s.games}</td><td>{s.wins}</td><td>{s.hands}</td>
                    <td>{s.bidsWon}</td><td>{s.bidsMade}</td><td>{s.bidsSet}</td>
                    <td>{s.bestHand}</td><td>{s.biggestMeld}</td>
                  </tr>
                );
              })}
              {rows.length > 1 && (
                <tr className="bid-row">
                  <td className="result-name">All modes</td>
                  <td>{total.games}</td><td>{total.wins}</td><td>{total.hands}</td>
                  <td>{total.bidsWon}</td><td>{total.bidsMade}</td><td>{total.bidsSet}</td>
                  <td>{total.bestHand}</td><td>{total.biggestMeld}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        <div className="bid-controls">
          <button className="btn btn-gold" onClick={onClose}>Close</button>
          {rows.length > 0 && (
            <button
              className="btn btn-muted"
              onClick={() => { localStorage.removeItem(STATS_KEY); setStats({}); }}
            >
              Reset stats
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<ModeConfig | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>(
    () => (localStorage.getItem('pinochle-difficulty') as Difficulty) || 'medium',
  );
  const [gameKey, setGameKey] = useState(0);
  const [save, setSave] = useState<SaveData | null>(loadSave);
  const [resuming, setResuming] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const pickDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    localStorage.setItem('pinochle-difficulty', d);
  };

  const start = (m: ModeConfig, resume: boolean) => {
    setResuming(resume);
    setMode(m);
    setGameKey((k) => k + 1);
  };

  if (mode) {
    return (
      <Game
        key={gameKey}
        mode={mode}
        difficulty={resuming && save ? save.difficulty : difficulty}
        save={resuming ? save : null}
        onExit={() => { setMode(null); setSave(loadSave()); }}
      />
    );
  }

  return (
    <div className="menu">
      <div className="menu-card">
        <h1><span className="suit-red">♥</span> Pinochle <span>♠</span></h1>
        <p className="menu-sub">House rules edition</p>

        {save && (
          <>
            <div className="menu-section">In progress</div>
            <button className="resume-card" onClick={() => start(save.state.mode, true)}>
              <span className="resume-title">
                Resume {save.state.mode.label} — hand {save.state.handNumber}
              </span>
              <span className="resume-scores">
                {save.state.scores
                  .map((s, t) => `${teamName(save.state, save.names, t)} ${s}`)
                  .join('  ·  ')}
              </span>
            </button>
          </>
        )}

        <div className="menu-section">Bots</div>
        <div className="segmented">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              className={difficulty === d ? 'seg-active' : ''}
              onClick={() => pickDifficulty(d)}
            >
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>

        <div className="menu-section">{save ? 'New game' : 'Play'}</div>
        <div className="mode-grid">
          {MODES.map((m) => (
            <button key={m.id} className="mode-card" onClick={() => start(m, false)}>
              {m.label}
            </button>
          ))}
        </div>

        <button className="menu-stats" onClick={() => setShowStats(true)}>Lifetime stats</button>
      </div>
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
    </div>
  );
}
