import { useState } from 'react';
import { EuchreApp } from './games/euchre/EuchreApp';
import { PinochleApp } from './games/pinochle/PinochleApp';

type GameId = 'pinochle' | 'euchre';

export default function App() {
  const [game, setGame] = useState<GameId | null>(null);

  if (game === 'pinochle') {
    return <PinochleApp onExit={() => setGame(null)} />;
  }
  if (game === 'euchre') {
    return <EuchreApp onExit={() => setGame(null)} />;
  }

  return (
    <div className="menu">
      <div className="menu-card">
        <h1><span className="suit-red">♥</span> Card Games <span>♠</span></h1>
        <p className="menu-sub">House rules edition</p>

        <div className="menu-section">Pick a game</div>
        <div className="mode-grid">
          <button className="mode-card" onClick={() => setGame('pinochle')}>Pinochle</button>
          <button className="mode-card" onClick={() => setGame('euchre')}>Euchre</button>
        </div>
      </div>
    </div>
  );
}
