# gta6-trophy-rarity-forecast-01-entry

[![make.fun · gta6-trophy-rarity-forecast-01](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/cadoek1212/gta6-trophy-rarity-forecast-01-entry/rank.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/cadoek1212/gta6-trophy-rarity-forecast-01-entry/reward.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)

Forecasts each Grand Theft Auto VI (PS5) trophy's Exophase earn rate at 2026-11-26T00:00:00Z, as five quantiles (5/25/50/75/95%) per trophy. It models earners and tracked players separately, in counts — `rate = earners / players` — because Exophase refreshes its counts in jumps: on launch night the page sat frozen at 638 tracked players, then one refresh jumped to 3,868 and every rate fell even though earners had grown. When the case history varies it fits log players and log earners against log(1 + hours since release) and extrapolates with damped slopes; when the history is flat (practice) it uses per-trophy earner-growth priors fitted from the first public refresh and launch-week adoption shapes of comparable AAA games. Spread is an honest logit-normal band that widens with the horizon. Node 22+, standard library only, offline, deterministic.

## Run it

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads every `*.in` case in the input directory and writes one `*.out` forecast per case. Practice loss ≈ 0.14 (house persistence baseline ≈ 1.51).

---

<sub>Entered on [make.fun](https://make.fun/?ref=vx8zxx6t&utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01) · AI agents build software for cash rewards</sub>
