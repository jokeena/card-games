import { useEffect, useReducer, useRef, useState } from 'react';
import { botAction } from './bots/bot';
import { GameAction, GameState, TEAM_OF, gameReducer, newGame } from './engine/game';
import { EuchreModals, EuchreRulesModal } from './ui/EuchreModals';
import { EuchreTable, teamName } from './ui/EuchreTable';
import { ScoreFives } from './ui/ScoreFives';
import { SUIT_NAME, SUIT_SYMBOL, isRed } from './engine/types';

/* ---------- Saved game & lifetime stats (localStorage) ---------- */

const SAVE_KEY = 'euchre-save';
const STATS_KEY = 'euchre-stats';

interface SaveData {
  state: GameState;
  names: string[];
}

function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (!data?.state?.phase || !data.names || data.state.phase === 'gameOver') return null;
    return data;
  } catch {
    return null;
  }
}

interface Stats {
  games: number;
  wins: number;
  hands: number;
  calls: number;      // hands your side named trump
  made: number;
  set: number;        // your side's calls that got euchred
  euchres: number;    // times you euchred them
  loners: number;     // times your side went alone
  loneMarches: number;
}

const emptyStats = (): Stats => ({
  games: 0, wins: 0, hands: 0, calls: 0, made: 0, set: 0, euchres: 0, loners: 0, loneMarches: 0,
});

function loadStats(): Stats {
  try {
    return { ...emptyStats(), ...JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}') };
  } catch {
    return emptyStats();
  }
}

function updateStats(apply: (s: Stats) => void) {
  const stats = loadStats();
  apply(stats);
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

const NAME_POOL = ['Audrey', 'James', 'Lorraine', 'Ella', 'Reagan', 'John', 'Sean', 'Cha Cha', 'Carl', 'Blake', 'Jeff'];

function drawNames(): string[] {
  const pool = [...NAME_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return ['You', ...pool.slice(0, 3)];
}

function actorFor(state: GameState): number | null {
  switch (state.phase) {
    case 'order1':
    case 'order2':
    case 'play':
      return state.turn;
    case 'discard':
      return state.dealer;
    default:
      return null;
  }
}

/** States the game sits in waiting for the human — undo jump targets. */
function isHumanDecision(s: GameState): boolean {
  return actorFor(s) === 0 || s.phase === 'handEnd';
}

interface Hist {
  present: GameState;
  past: GameState[];
}

type HistAction = GameAction | { type: 'UNDO' };

function histReducer(h: Hist, action: HistAction): Hist {
  if (action.type === 'UNDO') {
    const past = [...h.past];
    while (past.length > 0) {
      const s = past.pop()!;
      if (isHumanDecision(s)) return { present: s, past };
    }
    return h;
  }
  const next = gameReducer(h.present, action);
  if (next === h.present) return h;
  return { present: next, past: [...h.past.slice(-300), h.present] };
}

/** ms of "thinking" per phase — ordering snappy, play measured. */
function botDelay(state: GameState): number {
  if (state.phase === 'order1' || state.phase === 'order2') return 480;
  if (state.phase === 'play') return 380;
  return 600;
}

function Game({ save, onExit }: { save: SaveData | null; onExit: () => void }) {
  const [hist, dispatch] = useReducer(
    histReducer, save,
    (sv: SaveData | null): Hist => ({ present: sv?.state ?? newGame(), past: [] }));
  const { present: state, past } = hist;
  const [showRules, setShowRules] = useState(false);
  const [names] = useState(() => save?.names ?? drawNames());
  const canUndo = past.some(isHumanDecision);

  // Persist after every change; clear and record the game when it ends.
  const gameRecorded = useRef(false);
  useEffect(() => {
    if (state.phase === 'gameOver') {
      localStorage.removeItem(SAVE_KEY);
      if (!gameRecorded.current) {
        gameRecorded.current = true;
        updateStats((s) => {
          s.games++;
          if (state.winnerTeam === TEAM_OF[0]) s.wins++;
        });
      }
      return;
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ state, names } satisfies SaveData));
  }, [state, names]);

  // Per-hand stats, once per hand (a resumed game must not re-count its saved hand).
  const lastHandRecorded = useRef(
    save ? (save.state.phase === 'handEnd' ? save.state.handNumber : save.state.handNumber - 1) : 0);
  useEffect(() => {
    if (state.phase !== 'handEnd' || !state.handResult) return;
    if (state.handNumber <= lastHandRecorded.current) return;
    lastHandRecorded.current = state.handNumber;
    const r = state.handResult;
    const mine = r.makers === TEAM_OF[0];
    updateStats((s) => {
      s.hands++;
      if (mine) {
        s.calls++;
        if (r.euchred) s.set++;
        else s.made++;
        if (r.alone) {
          s.loners++;
          if (r.march) s.loneMarches++;
        }
      } else if (r.euchred) {
        s.euchres++;
      }
    });
  }, [state]);

  // Bot driver + auto-continue. The dealer-draw animation continues itself
  // from the table, and handEnd waits on the modal button.
  useEffect(() => {
    if (state.phase === 'trickEnd') {
      const t = setTimeout(() => dispatch({ type: 'CONTINUE' }), 1550);
      return () => clearTimeout(t);
    }
    const actor = actorFor(state);
    if (actor !== null && actor !== 0) {
      const t = setTimeout(() => {
        const action = botAction(state, actor);
        if (action) dispatch(action);
      }, botDelay(state));
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <div className="game-root">
      <header className="top-bar">
        <button className="bar-btn" onClick={onExit}>← Menu</button>
        <button className="bar-btn" disabled={!canUndo} onClick={() => dispatch({ type: 'UNDO' })}>
          ↩ Undo
        </button>
        <span className="bar-title">Euchre</span>
        <span className="bar-spacer" />
        {state.trump && state.phase !== 'gameOver' && (
          <span className="bar-trump">
            <span className={`bar-trump-sym ${isRed(state.trump) ? 'suit-red' : ''}`}>
              {SUIT_SYMBOL[state.trump]}
            </span>
            <span className="bar-trump-name">{SUIT_NAME[state.trump]} trump</span>
          </span>
        )}
        <button className="bar-btn bar-btn-round" title="Rules" onClick={() => setShowRules(true)}>i</button>
      </header>
      <EuchreTable state={state} names={names} dispatch={dispatch} />
      <EuchreModals
        state={state}
        names={names}
        onContinue={() => dispatch({ type: 'CONTINUE' })}
        onNewGame={onExit}
      />
      {showRules && <EuchreRulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

function StatsModal({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Stats>(loadStats);
  const any = stats.games > 0 || stats.hands > 0;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your record</h2>
        {!any ? (
          <p className="modal-note">No finished hands yet — go play one.</p>
        ) : (
          <table className="result-table stats-table">
            <tbody>
              <tr><td className="result-name">Games / won</td><td>{stats.games} / {stats.wins}</td></tr>
              <tr><td className="result-name">Hands</td><td>{stats.hands}</td></tr>
              <tr><td className="result-name">Your calls / made / set</td><td>{stats.calls} / {stats.made} / {stats.set}</td></tr>
              <tr><td className="result-name">Times you euchred them</td><td>{stats.euchres}</td></tr>
              <tr><td className="result-name">Loners / lone marches</td><td>{stats.loners} / {stats.loneMarches}</td></tr>
            </tbody>
          </table>
        )}
        <div className="bid-controls">
          <button className="btn btn-gold" onClick={onClose}>Close</button>
          {any && (
            <button className="btn btn-muted"
              onClick={() => { localStorage.removeItem(STATS_KEY); setStats(emptyStats()); }}>
              Reset stats
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Dev harness: /#fives shows every score state for eyeballing the layout. */
function FivesGallery() {
  return (
    <div className="fives-gallery">
      {Array.from({ length: 11 }).map((_, n) => (
        <div key={n} className="fives-gallery-item">
          <div className="fives-gallery-label">{n}</div>
          <ScoreFives score={n} color="red" />
          <ScoreFives score={n} color="black" />
        </div>
      ))}
    </div>
  );
}

export function EuchreApp({ onExit }: { onExit: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const [save, setSave] = useState<SaveData | null>(loadSave);
  const [resuming, setResuming] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const start = (resume: boolean) => {
    setResuming(resume);
    setPlaying(true);
    setGameKey((k) => k + 1);
  };

  if (playing) {
    return (
      <Game
        key={gameKey}
        save={resuming ? save : null}
        onExit={() => { setPlaying(false); setSave(loadSave()); }}
      />
    );
  }

  if (typeof window !== 'undefined' && window.location.hash === '#fives') {
    return <FivesGallery />;
  }

  return (
    <div className="menu">
      <div className="menu-card">
        <button className="bar-btn menu-back" onClick={onExit}>← Games</button>
        <h1><span className="suit-red">♥</span> Euchre <span>♠</span></h1>
        <p className="menu-sub">First black jack deals</p>

        {save && (
          <>
            <div className="menu-section">In progress</div>
            <button className="resume-card" onClick={() => start(true)}>
              <span className="resume-title">Resume — hand {save.state.handNumber}</span>
              <span className="resume-scores">
                {save.state.scores
                  .map((s, t) => `${teamName(save.names, t)} ${s}`)
                  .join('  ·  ')}
              </span>
            </button>
          </>
        )}

        <div className="menu-section">{save ? 'New game' : 'Play'}</div>
        <div className="mode-grid">
          <button className="mode-card" onClick={() => start(false)}>
            4 Player · Partners
          </button>
        </div>

        <button className="menu-stats" onClick={() => setShowStats(true)}>Lifetime stats</button>
      </div>
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
    </div>
  );
}
