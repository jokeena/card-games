# Card Games — House Rules Edition

Browser card games played against bots. Built with React + TypeScript + Vite; no backend — everything runs client-side. Currently ships Pinochle (3–6 player variants, custom house rules); Euchre is next.

## Pinochle modes

| Mode | Deal | Bid opens / dealer stuck | Play to |
|---|---|---|---|
| 3 Player · Kitty | 15 + 3 kitty | 15 / 15 | 120 |
| 3 Player · No Kitty | 16 each | 15 / 15 | 120 |
| 4 Player · Passing (partners pass 4) | 12 each | 25 / 25 | 150 |
| 4 Player · No Passing | 12 each | 21 / 20 | 150 |
| 5 Player (cutthroat) | 9 + 3 kitty | 15 / 10 | 100 |
| 6 Player · 3 Teams of 2 | 8 each | 15 / 10 | 100 |

House rules include: run +2 per extra trump K/Q, doubles-around at 10× value, strict must-beat/must-trump trick play (reneging is impossible), going set subtracts the bid, every side needs a trick to keep its meld, and bidder goes out first.

## Run it

```bash
npm install
npm run dev     # dev server
npm test        # engine tests
npm run build   # production build to dist/
```
