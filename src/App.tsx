import { useEffect, useReducer, useState } from 'react';
import { botAction, Difficulty } from './bots/bot';
import { gameReducer, GameState, newGame } from './engine/game';
import { MODES, ModeConfig, partnerOf } from './engine/modes';
import { GameTable } from './ui/GameTable';
import { Modals, RulesModal } from './ui/Modals';

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

/** ms of "thinking" per phase — bidding snappy, play measured. */
function botDelay(state: GameState): number {
  if (state.phase === 'bidding') return 160;
  if (state.phase === 'play') return 380;
  return 500;
}

function Game({ mode, difficulty, onExit }: { mode: ModeConfig; difficulty: Difficulty; onExit: () => void }) {
  const [state, dispatch] = useReducer(gameReducer, mode, newGame);
  const [showRules, setShowRules] = useState(false);
  const [names] = useState(() => drawNames(mode.players));

  useEffect(() => {
    if (state.phase === 'trickEnd') {
      const t = setTimeout(() => dispatch({ type: 'CONTINUE' }), 1550);
      return () => clearTimeout(t);
    }

    // A bot bid winner may look at the table meld and concede a hopeless bid.
    if (state.phase === 'meld' && state.bidWinner !== 0) {
      const bidTeam = mode.teams[state.bidWinner];
      const teamMeld = state.melds.reduce(
        (sum, m, seat) => (mode.teams[seat] === bidTeam ? sum + (m?.total ?? 0) : sum), 0);
      const tricksNeeded = state.highBid - teamMeld;
      const limit = difficulty === 'hard' ? 21 : difficulty === 'medium' ? 24 : 26;
      if (tricksNeeded > limit) {
        const t = setTimeout(() => dispatch({ type: 'THROW_IN', seat: state.bidWinner }), 900);
        return () => clearTimeout(t);
      }
      return; // human clicks "Play hand"
    }

    const actor = actorFor(state);
    if (actor !== null && actor !== 0) {
      const t = setTimeout(() => {
        const action = botAction(state, actor, difficulty);
        if (action) dispatch(action);
      }, botDelay(state));
      return () => clearTimeout(t);
    }
  }, [state, difficulty, mode]);

  return (
    <div className="game-root">
      <header className="top-bar">
        <button className="bar-btn" onClick={onExit}>← Menu</button>
        <span className="bar-title">{mode.label}</span>
        <span className="bar-spacer" />
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

export default function App() {
  const [mode, setMode] = useState<ModeConfig | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>(
    () => (localStorage.getItem('pinochle-difficulty') as Difficulty) || 'medium',
  );
  const [gameKey, setGameKey] = useState(0);

  const pickDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    localStorage.setItem('pinochle-difficulty', d);
  };

  if (mode) {
    return (
      <Game
        key={gameKey}
        mode={mode}
        difficulty={difficulty}
        onExit={() => { setMode(null); setGameKey((k) => k + 1); }}
      />
    );
  }

  return (
    <div className="menu">
      <div className="menu-card">
        <h1><span className="suit-red">♥</span> Pinochle <span>♠</span></h1>
        <p className="menu-sub">House rules edition</p>

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

        <div className="menu-section">Play</div>
        <div className="mode-grid">
          {MODES.map((m) => (
            <button key={m.id} className="mode-card" onClick={() => setMode(m)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
