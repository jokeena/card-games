import { GameState } from '../engine/game';
import { ModeConfig } from '../engine/modes';
import { teamName, TEAM_COLORS } from './GameTable';

interface Props {
  state: GameState;
  names: string[];
  onContinue: () => void;
  onNewGame: () => void;
}

export function Modals({ state, names, onContinue, onNewGame }: Props) {
  if (state.phase === 'handEnd') return <HandEndModal state={state} names={names} onContinue={onContinue} />;
  if (state.phase === 'gameOver') return <GameOverModal state={state} names={names} onNewGame={onNewGame} />;
  return null;
}

function HandEndModal({ state, names, onContinue }: Pick<Props, 'state' | 'names' | 'onContinue'>) {
  const r = state.handResult!;
  const isMe = state.bidWinner === 0;
  const isPartner = !isMe && state.mode.teams[state.bidWinner] === state.mode.teams[0];
  const title = r.made
    ? (isMe ? 'You made the bid' : `${names[state.bidWinner]} made the bid`)
    : isMe ? 'You went set'
      : isPartner ? `${names[state.bidWinner]} went set`
        : `${names[state.bidWinner]} was set`;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className={r.made ? 'result-made' : 'result-set'}>{title}</h2>
        {/* Phones hide the in-table bid chip (it wraps badly) and show this instead */}
        <div className="modal-bidline">Bid {r.bid}</div>
        <table className="result-table">
          <thead>
            <tr><th></th><th>Meld</th><th>Tricks</th><th>Hand</th><th>Score</th></tr>
          </thead>
          <tbody>
            {r.perTeam.map((t, team) => (
              <tr key={team} className={team === r.bidTeam ? 'bid-row' : ''}>
                <td className="result-name">
                  <span className="team-dot" style={{ background: TEAM_COLORS[team] }} />
                  {teamName(state, names, team)}
                  {team === r.bidTeam && <span className="chip chip-bid">bid {r.bid}</span>}
                </td>
                <td>{t.meldKept ? t.meld : t.meld > 0 ? <s>{t.meld}</s> : 0}</td>
                <td>{t.trickPoints}</td>
                <td className={t.delta < 0 ? 'neg' : 'pos'}>{t.delta >= 0 ? `+${t.delta}` : t.delta}</td>
                <td className="result-score">{state.scores[team]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.perTeam.some((t) => !t.meldKept && t.meld > 0) && (
          <p className="modal-note">Struck-through meld was lost.</p>
        )}
        <button className="btn btn-gold btn-lg" onClick={onContinue}>
          {state.winnerTeam !== null ? 'Final result' : 'Next hand'}
        </button>
      </div>
    </div>
  );
}

function GameOverModal({ state, names, onNewGame }: Pick<Props, 'state' | 'names' | 'onNewGame'>) {
  const winner = state.winnerTeam!;
  const youWon = state.mode.teams[0] === winner;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>{youWon ? '🏆 You win!' : `${teamName(state, names, winner)} wins.`}</h2>
        <div className="final-scores">
          {state.scores.map((score, team) => (
            <div key={team}>
              <span className="team-dot" style={{ background: TEAM_COLORS[team] }} />
              {teamName(state, names, team)}: <b>{score}</b>
            </div>
          ))}
        </div>
        <button className="btn btn-gold btn-lg" onClick={onNewGame}>Back to menu</button>
      </div>
    </div>
  );
}

export function RulesModal({ mode, onClose }: { mode: ModeConfig; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide rules-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{mode.label} — Rules</h2>
        <div className="rules-grid">
          <section>
            <h3>This game</h3>
            <ul>
              <li>{mode.handSize} cards each{mode.kittySize > 0 ? `, ${mode.kittySize}-card kitty` : ''}</li>
              {mode.kittySize > 0 && <li>Bid winner takes the kitty, buries {mode.kittySize}; buried counters count as theirs</li>}
              <li>Bidding opens at {mode.bidStart}; increments of 1 or any jump</li>
              <li>All pass → dealer is stuck at {mode.stuck}</li>
              {mode.passCount > 0 && <li>Partner passes {mode.passCount} to the bid winner, who returns {mode.passCount}</li>}
              <li>First to {mode.target} wins — bidder goes out first</li>
              {mode.teamCount < mode.players
                ? <li>{mode.teamCount} teams of {mode.players / mode.teamCount}, partners across the table</li>
                : <li>Cutthroat — everyone for themselves</li>}
            </ul>
          </section>
          <section>
            <h3>Trick play</h3>
            <ul>
              <li>Bid winner names any suit as trump and leads</li>
              <li>Must follow suit, and must beat the winning card if you can</li>
              <li>Void? Must trump; must overtrump if the trick is trumped</li>
              <li>A / 10 / K taken in tricks = 1 point each; last trick = 1 (25 per hand)</li>
              <li>Make the bid: score meld + tricks. Set: lose the bid, keep nothing</li>
              <li>Every side needs a trick to keep its meld</li>
            </ul>
          </section>
          <section>
            <h3>Meld</h3>
            <table className="rules-meld-table">
              <tbody>
                <tr><td>Run (A-10-K-Q-J trump)</td><td>15</td></tr>
                <tr><td>… each extra trump K or Q</td><td>+2</td></tr>
                <tr><td>Double run</td><td>150</td></tr>
                <tr><td>Aces / Kings / Queens / Jacks around</td><td>10 / 8 / 6 / 4</td></tr>
                <tr><td>Doubles around</td><td>×10</td></tr>
                <tr><td>Marriage (K+Q) / in trump</td><td>2 / 4</td></tr>
                <tr><td>Pinochle (J♦ + Q♠) / double</td><td>4 / 30</td></tr>
                <tr><td>9 of trump</td><td>1</td></tr>
              </tbody>
            </table>
          </section>
        </div>
        <button className="btn btn-gold" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
