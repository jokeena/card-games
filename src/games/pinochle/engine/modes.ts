export interface ModeConfig {
  id: string;
  label: string;
  short: string;
  players: number;
  /** seat index -> team index */
  teams: number[];
  teamCount: number;
  handSize: number;
  kittySize: number;
  bidStart: number;
  /** Bid the dealer is stuck with if everyone passes. */
  stuck: number;
  target: number;
  /** Cards exchanged bid-winner<->partner. 0 = no passing. */
  passCount: number;
}

export const MODES: ModeConfig[] = [
  {
    id: 'p3k', label: '3 Player · Kitty', short: '3P Kitty',
    players: 3, teams: [0, 1, 2], teamCount: 3,
    handSize: 15, kittySize: 3, bidStart: 15, stuck: 15, target: 120, passCount: 0,
  },
  {
    id: 'p3', label: '3 Player', short: '3P',
    players: 3, teams: [0, 1, 2], teamCount: 3,
    handSize: 16, kittySize: 0, bidStart: 15, stuck: 15, target: 120, passCount: 0,
  },
  {
    id: 'p4', label: '4 Player · Passing', short: '4P Pass',
    players: 4, teams: [0, 1, 0, 1], teamCount: 2,
    handSize: 12, kittySize: 0, bidStart: 25, stuck: 25, target: 150, passCount: 4,
  },
  {
    id: 'p4np', label: '4 Player', short: '4P',
    players: 4, teams: [0, 1, 0, 1], teamCount: 2,
    handSize: 12, kittySize: 0, bidStart: 21, stuck: 20, target: 150, passCount: 0,
  },
  {
    id: 'p5', label: '5 Player', short: '5P',
    players: 5, teams: [0, 1, 2, 3, 4], teamCount: 5,
    handSize: 9, kittySize: 3, bidStart: 15, stuck: 10, target: 100, passCount: 0,
  },
  {
    id: 'p6', label: '6 Player', short: '6P',
    players: 6, teams: [0, 1, 2, 0, 1, 2], teamCount: 3,
    handSize: 8, kittySize: 0, bidStart: 15, stuck: 10, target: 100, passCount: 0,
  },
];

export const partnerOf = (mode: ModeConfig, seat: number): number | null => {
  const mate = mode.teams.findIndex((t, s) => s !== seat && t === mode.teams[seat]);
  return mate === -1 ? null : mate;
};
