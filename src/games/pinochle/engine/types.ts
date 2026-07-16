import { Card, Rank } from '../../../cards/types';

export * from '../../../cards/types';

/** Higher wins a trick. First-played wins ties. */
export const RANK_POWER: Record<Rank, number> = {
  A: 5, '10': 4, K: 3, Q: 2, J: 1, '9': 0,
};

/** A/10/K captured in tricks are worth 1 point each. */
export const isCounter = (c: Card) => c.rank === 'A' || c.rank === '10' || c.rank === 'K';
