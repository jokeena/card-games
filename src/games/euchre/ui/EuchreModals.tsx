import { GameState, TEAM_OF } from '../engine/game';
import { TEAM_COLORS, teamName } from './EuchreTable';

interface Props {
  state: GameState;
  names: string[];
  onContinue: () => void;
  onNewGame: () => void;
}

export function EuchreModals({ state, names, onContinue, onNewGame }: Props) {
  if (state.phase === 'handEnd') return <HandEndModal state={state} names={names} onContinue={onContinue} />;
  if (state.phase === 'gameOver') return <GameOverModal state={state} names={names} onNewGame={onNewGame} />;
  return null;
}

function HandEndModal({ state, names, onContinue }: Pick<Props, 'state' | 'names' | 'onContinue'>) {
  const r = state.handResult!;
  const myTeam = TEAM_OF[0];
  const makerName = r.maker === 0 ? 'You' : names[r.maker];
  const title = r.euchred
    ? (r.makers === myTeam ? (r.maker === 0 ? 'You were euched!' : `${makerName} was euched!`) : 'Euched them!')
    : r.march
      ? `${makerName} took all 5 tricks${r.alone ? ' alone' : ''}`
      : (r.maker === 0 ? 'You made it' : `${makerName} made it`);
  return (
    <div className="modal-backdrop backdrop-clear">
      <div className="modal">
        <h2 className={r.deltas[myTeam] > 0 ? 'result-made' : 'result-set'}>{title}</h2>
        <div className="modal-bidline">
          {makerName} called {r.noTrump ? 'no trump ' : ''}{r.alone ? 'alone ' : ''}and took {r.makerTricks} trick{r.makerTricks === 1 ? '' : 's'}
        </div>
        <table className="result-table">
          <thead>
            <tr><th></th><th>Tricks</th><th>Hand</th><th>Score</th></tr>
          </thead>
          <tbody>
            {[0, 1].map((team) => (
              <tr key={team} className={team === r.makers ? 'bid-row' : ''}>
                <td className="result-name">
                  <span className="team-dot" style={{ background: TEAM_COLORS[team] }} />
                  {teamName(names, team)}
                  {team === r.makers && <span className="chip chip-bid">makers</span>}
                </td>
                <td>{state.tricksTaken[team]}</td>
                <td className={r.deltas[team] > 0 ? 'pos' : ''}>{r.deltas[team] > 0 ? `+${r.deltas[team]}` : 0}</td>
                <td className="result-score">{state.scores[team]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-gold btn-lg" onClick={onContinue}>
          {state.winnerTeam !== null ? 'Final result' : 'Next hand'}
        </button>
      </div>
    </div>
  );
}

function GameOverModal({ state, names, onNewGame }: Pick<Props, 'state' | 'names' | 'onNewGame'>) {
  const winner = state.winnerTeam!;
  const youWon = TEAM_OF[0] === winner;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>{youWon ? '🏆 You win!' : `${teamName(names, winner)} win.`}</h2>
        <div className="final-scores">
          {[0, 1].map((team) => (
            <div key={team}>
              <span className="team-dot" style={{ background: TEAM_COLORS[team] }} />
              {teamName(names, team)}: <b>{state.scores[team]}</b>
            </div>
          ))}
        </div>
        <button className="btn btn-gold btn-lg" onClick={onNewGame}>Back to menu</button>
      </div>
    </div>
  );
}

export function EuchreRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide rules-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Euchre — Rules</h2>
        <div className="rules-grid">
          <section>
            <h3>The deal</h3>
            <ul>
              <li>24 cards (9–A); 5 each, 4 to the kitty, top card turned up</li>
              <li>First black jack from a fresh shuffle picks the first dealer</li>
              <li>Round 1: order up the turn card — dealer picks it up and buries one</li>
              <li>Round 2: name any other suit; if it comes back, the dealer is stuck</li>
              <li>Calling alone: your partner sits out; play three-handed tricks</li>
            </ul>
          </section>
          <section>
            <h3>Trick play</h3>
            <ul>
              <li>Right bower (trump jack) is high, then left bower (same-color jack)</li>
              <li>The left bower <i>is</i> trump — it can't follow its printed suit</li>
              <li>Follow the led suit if you can; void, play anything</li>
              <li>Left of the dealer leads the first trick</li>
              <li>House option: No Trump — aces high, no bowers, nothing ruffs</li>
            </ul>
          </section>
          <section>
            <h3>Scoring — first to 10</h3>
            <table className="rules-meld-table">
              <tbody>
                <tr><td>Makers take 3 or 4</td><td>1</td></tr>
                <tr><td>March (all 5)</td><td>2</td></tr>
                <tr><td>Lone march</td><td>4</td></tr>
                <tr><td>Euchred (makers take fewer than 3)</td><td>2 to defenders</td></tr>
              </tbody>
            </table>
            <p className="modal-note">Score kept the honest way: two 5s at each team's edge of the table.</p>
          </section>
        </div>
        <button className="btn btn-gold" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
