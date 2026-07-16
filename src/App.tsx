import { useState } from 'react';
import { EuchreApp, EuchreStats, EUCHRE_STATS_KEY, emptyEuchreStats, loadEuchreSave, loadEuchreStats } from './games/euchre/EuchreApp';
import { FivesGallery } from './games/euchre/ui/ScoreFives';
import { MODES } from './games/pinochle/engine/modes';
import { PinochleApp } from './games/pinochle/PinochleApp';

type GameId = 'pinochle' | 'euchre';

/* Pinochle keeps its stats per mode under this shape (see PinochleApp). */
interface PinochleModeStats {
  games: number; wins: number; hands: number;
  bidsWon: number; bidsMade: number; bidsSet: number;
  bestHand: number; biggestMeld: number;
}
const PINOCHLE_STATS_KEY = 'pinochle-stats';

function loadPinochleStats(): Record<string, PinochleModeStats> {
  try {
    return JSON.parse(localStorage.getItem(PINOCHLE_STATS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function StatsModal({ onClose }: { onClose: () => void }) {
  const [pin, setPin] = useState(loadPinochleStats);
  const [euc, setEuc] = useState<EuchreStats>(loadEuchreStats);
  const pinRows = MODES.filter((m) => pin[m.id] && (pin[m.id].games > 0 || pin[m.id].hands > 0));
  const eucAny = euc.games > 0 || euc.hands > 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Your record</h2>

        <div className="menu-section">Pinochle</div>
        {pinRows.length === 0 ? (
          <p className="modal-note">No finished pinochle hands yet.</p>
        ) : (
          <table className="result-table stats-table">
            <thead>
              <tr>
                <th></th><th>Games</th><th>Won</th><th>Hands</th>
                <th>Bids</th><th>Made</th><th>Set</th><th>Best hand</th><th>Best meld</th>
              </tr>
            </thead>
            <tbody>
              {pinRows.map((m) => {
                const s = pin[m.id];
                return (
                  <tr key={m.id}>
                    <td className="result-name">{m.label}</td>
                    <td>{s.games}</td><td>{s.wins}</td><td>{s.hands}</td>
                    <td>{s.bidsWon}</td><td>{s.bidsMade}</td><td>{s.bidsSet}</td>
                    <td>{s.bestHand}</td><td>{s.biggestMeld}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="menu-section">Euchre</div>
        {!eucAny ? (
          <p className="modal-note">No finished euchre hands yet.</p>
        ) : (
          <table className="result-table stats-table">
            <tbody>
              <tr><td className="result-name">Games / won</td><td>{euc.games} / {euc.wins}</td></tr>
              <tr><td className="result-name">Hands</td><td>{euc.hands}</td></tr>
              <tr><td className="result-name">Your calls / made / set</td><td>{euc.calls} / {euc.made} / {euc.set}</td></tr>
              <tr><td className="result-name">Times you euchred them</td><td>{euc.euchres}</td></tr>
              <tr><td className="result-name">Loners / lone marches</td><td>{euc.loners} / {euc.loneMarches}</td></tr>
            </tbody>
          </table>
        )}

        <div className="bid-controls">
          <button className="btn btn-gold" onClick={onClose}>Close</button>
          {(pinRows.length > 0 || eucAny) && (
            <button className="btn btn-muted" onClick={() => {
              localStorage.removeItem(PINOCHLE_STATS_KEY);
              localStorage.removeItem(EUCHRE_STATS_KEY);
              setPin({});
              setEuc(emptyEuchreStats());
            }}>
              Reset stats
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [game, setGame] = useState<GameId | null>(null);
  const [showStats, setShowStats] = useState(false);

  if (game === 'pinochle') {
    return <PinochleApp onExit={() => setGame(null)} />;
  }
  if (game === 'euchre') {
    return <EuchreApp onExit={() => setGame(null)} />;
  }

  if (typeof window !== 'undefined' && window.location.hash === '#fives') {
    return <FivesGallery />;
  }

  const euchreSave = loadEuchreSave();

  return (
    <div className="menu">
      <div className="menu-card">
        <h1><span className="suit-red">♥</span> Card Games <span>♠</span></h1>
        <p className="menu-sub">House rules edition</p>

        <div className="menu-section">Pick a game</div>
        <div className="mode-grid">
          <button className="mode-card" onClick={() => setGame('pinochle')}>Pinochle</button>
          <button className="mode-card" onClick={() => setGame('euchre')}>
            Euchre
            {euchreSave && <><br /><small>Resume — hand {euchreSave.state.handNumber}</small></>}
          </button>
        </div>

        <button className="menu-stats" onClick={() => setShowStats(true)}>Lifetime stats</button>
      </div>
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
    </div>
  );
}
