import { Card, isRed, SUIT_SYMBOL } from '../engine/types';

interface Props {
  card?: Card;
  faceDown?: boolean;
  size?: 'small' | 'mid';
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
}

export function CardView({ card, faceDown, size, selected, dimmed, onClick }: Props) {
  const cls = [
    'card',
    size === 'small' ? 'card-small' : size === 'mid' ? 'card-mid' : '',
    faceDown ? 'card-back' : '',
    selected ? 'card-selected' : '',
    dimmed ? 'card-dimmed' : '',
    onClick && !dimmed ? 'card-clickable' : '',
  ].filter(Boolean).join(' ');

  if (faceDown || !card) {
    return <div className={cls} />;
  }

  const sym = SUIT_SYMBOL[card.suit];
  const isCourt = card.rank === 'K' || card.rank === 'Q' || card.rank === 'J';

  return (
    <div className={`${cls} ${isRed(card.suit) ? 'card-red' : 'card-black'}`} onClick={dimmed ? undefined : onClick}>
      <div className="card-corner">
        <span>{card.rank}</span>
        <span>{sym}</span>
      </div>
      {isCourt ? (
        <div className="card-court">
          <span className="court-letter">{card.rank}</span>
          <span className="court-suit">{sym}</span>
        </div>
      ) : card.rank === 'A' ? (
        <div className="card-pip card-pip-ace">{sym}</div>
      ) : (
        <div className="card-num">
          <span className="num">{card.rank}</span>
          <span className="num-suit">{sym}</span>
        </div>
      )}
      <div className="card-corner card-corner-flip">
        <span>{card.rank}</span>
        <span>{sym}</span>
      </div>
    </div>
  );
}
