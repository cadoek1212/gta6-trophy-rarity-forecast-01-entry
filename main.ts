// GTA VI trophy rarity forecast — make.fun gta6-trophy-rarity-forecast-01.
//
// Forecasts each trophy's Exophase earn rate (%) at the case target by
// modelling earners and tracked players separately, in counts:
//
//   rate(target) = earners(target) / playersTracked(target)
//
// Why counts, not rates: Exophase refreshes its counts in jumps. On launch
// night the page sat frozen at 638 tracked players, then one refresh jumped
// to 3,868 and every rate fell even though earners had grown. A model that
// persists the last rate (the house baseline) misses every refresh. So this
// program forecasts the denominator and each trophy's earners separately.
//
// Two paths, chosen by what the case history shows:
//  * Fit path — when the history actually varies (the final case, 2.5 days
//    of reads): least-squares fit of log players and log earners against
//    log(1 + hours since release), extrapolated to the target with the
//    slope damped, so a saturating curve is not chased off a cliff.
//  * Prior path — when the history is flat (practice: every launch-night
//    read identical): hardcoded per-trophy earner-growth priors fitted from
//    the first public refresh (638 -> 3,868 players, observed on the live
//    Exophase page) and the launch-week shape of comparable AAA games
//    (fast saturation of the first story chapter, S-curve mid-story, slow
//    grind/platinum), plus a denominator jump prior for the first refresh.
//
// Spread is an honest logit-normal band whose width grows with the horizon
// (sqrt of days), with extra width when the history is flat and when the
// earner count is tiny. Node 22+, standard library only, no network,
// deterministic (no randomness anywhere).
import * as fs from "node:fs";
import * as path from "node:path";

// Standard-normal quantiles for the five forecast levels.
const Z = [-1.6448536269514722, -0.6744897501960817, 0, 0.6744897501960817, 1.6448536269514722];
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];

// Release of GTA VI (game.release_date in the case, fallback below).
const RELEASE_FALLBACK_MS = Date.parse("2026-11-19T00:00:00Z");

// ---- Spread tuning constants (logit scale) ------------------------------
// S_BASE: base width. S_HORIZON: extra width per sqrt(day of horizon).
// S_FLAT: extra width when the history is flat (prior path, no observed
// variation to lean on). S_COUNT: extra width for tiny earner counts.
const S_BASE = 0.25;
const S_HORIZON = 0.6;
const S_FLAT = 0.15;
const S_COUNT = 0.25;

// ---- Per-trophy priors (prior path only) ---------------------------------
// [earner-growth multiplier over a 1.5 h window from a ~3 h checkpoint,
//  median cap in % at the target]
// Fitted from the first public refresh (launch night 638 players ->
// 3,868 at 04:30Z 19 Nov, earners per trophy read off the live page) and
// from launch-week adoption shapes of comparable AAA games. Fast/early
// trophies grow earners quickly (fishing challenge, arcade, chapter 1);
// story missions grow steadily; grind, collectibles and the platinum
// barely move in the first hours. Caps are generous plausibility rails.
interface TrophyPrior {
  g: number;
  cap: number;
}
const PRIORS: Record<number, TrophyPrior> = {
  1: { g: 1.0, cap: 0.05 }, // platinum — ~200 h, practically frozen
  2: { g: 1.0, cap: 100 }, // first mission — everyone earns it
  3: { g: 2.4, cap: 85 }, // chapter 1 — saturates fastest
  4: { g: 1.3, cap: 60 }, // chapter 2
  5: { g: 1.3, cap: 60 }, // chapter 3
  6: { g: 1.3, cap: 60 }, // chapter 4
  7: { g: 1.3, cap: 40 }, // final mission
  8: { g: 1.3, cap: 40 },
  9: { g: 1.3, cap: 40 },
  10: { g: 1.3, cap: 40 },
  11: { g: 1.3, cap: 40 },
  12: { g: 1.3, cap: 40 },
  13: { g: 1.3, cap: 40 },
  14: { g: 1.0, cap: 0.05 }, // 100% completion gold
  15: { g: 1.0, cap: 1.0 }, // 250 stunts
  16: { g: 1.1, cap: 25 }, // try each activity once
  17: { g: 1.0, cap: 1.0 }, // all shooting-range golds
  18: { g: 1.0, cap: 5 }, // drone race at every location
  19: { g: 1.1, cap: 15 }, // win 20 races
  20: { g: 3.4, cap: 25 }, // beat Cal (fishing) — quickest earner
  21: { g: 2.5, cap: 30 }, // complete an arcade game
  22: { g: 1.1, cap: 15 }, // stranger final: Andy
  23: { g: 1.1, cap: 15 }, // stranger final: Kenton
  24: { g: 1.2, cap: 15 }, // stranger final: Billy
  25: { g: 1.0, cap: 3 }, // 8 stranger strands
  26: { g: 1.1, cap: 15 }, // stranger final: Randy
  27: { g: 1.1, cap: 15 }, // stranger final: Tyrone
  28: { g: 1.0, cap: 2 }, // meditate at every spot
  29: { g: 1.1, cap: 10 }, // hunt a unique animal
  30: { g: 1.0, cap: 2 }, // 3 collectible card sets
  31: { g: 1.0, cap: 2 }, // WAiNK at 100 locations
  32: { g: 1.0, cap: 2 }, // complete 50 challenges
  33: { g: 1.2, cap: 20 }, // lose a 4-star wanted level
  34: { g: 1.2, cap: 15 }, // rob 3 shops back-to-back
  35: { g: 1.9, cap: 30 }, // discover 100 vehicles
  36: { g: 1.1, cap: 15 }, // 5 kills in one Combat Focus
  37: { g: 1.5, cap: 30 }, // unscheduled departure at VCIA
  38: { g: 1.2, cap: 15 }, // Rhinos
  39: { g: 1.2, cap: 15 }, // rob a jewelry store undetected
  40: { g: 1.1, cap: 15 }, // rob 5 bank vaults
  41: { g: 1.0, cap: 15 }, // rob an armored truck
  42: { g: 1.2, cap: 15 }, // explore all of Leonida
  43: { g: 1.1, cap: 15 }, // rob an illegal op per gang
  44: { g: 1.3, cap: 20 }, // cocktail on Ocean Beach
  45: { g: 1.1, cap: 15 }, // showroom smash
  46: { g: 1.2, cap: 15 }, // bowling follow-through
  47: { g: 1.2, cap: 15 }, // partnership with mass appeal
  48: { g: 1.4, cap: 20 }, // choices made
  49: { g: 1.2, cap: 15 }, // second time's the charm
  50: { g: 1.4, cap: 20 }, // what the hell just happened
  51: { g: 1.4, cap: 20 }, // melee drive-by
  52: { g: 1.1, cap: 15 }, // launder $250k marked bills
  53: { g: 1.2, cap: 15 }, // spend $100k across shops
  54: { g: 1.2, cap: 15 }, // purchase all garages
  55: { g: 1.2, cap: 15 }, // register 10 vehicles
};
const DEFAULT_PRIOR: TrophyPrior = { g: 1.1, cap: 20 };

// ---- Small numeric helpers ----------------------------------------------
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
function logitPct(pct: number): number {
  const p = clamp(pct, 0.01, 99.99) / 100;
  return Math.log(p / (1 - p));
}
function sigmoid(x: number): number {
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1 / (1 + e);
  }
  const e = Math.exp(x);
  return e / (1 + e);
}
// Least squares y = a + b*x. Returns [a, b]; b = 0 when x has no spread.
function linfit(xs: number[], ys: number[]): [number, number] {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    sxx += dx * dx;
    sxy += dx * (ys[i] - my);
  }
  if (sxx <= 1e-12) return [my, 0];
  const b = sxy / sxx;
  return [my - b * mx, b];
}

// ---- Case types ------------------------------------------------------------
interface Trophy {
  id: number;
  name: string;
  tier: string;
}
interface Read {
  at: string;
  players_tracked: number;
  rates: (number | null)[];
}
interface Case {
  id: string;
  at: string;
  horizon_minutes: number;
  target: string;
  levels: number[];
  game?: { release_date?: string };
  trophies: Trophy[];
  history: Read[];
}

// ---- Forecast --------------------------------------------------------------
function forecastCase(c: Case): { id: number; q: number[] }[] {
  const releaseMs = c.game?.release_date
    ? Date.parse(c.game.release_date)
    : RELEASE_FALLBACK_MS;
  const atMs = Date.parse(c.at);
  const horizonH =
    typeof c.horizon_minutes === "number"
      ? c.horizon_minutes / 60
      : (Date.parse(c.target) - atMs) / 3600000;
  const tCkptH = (atMs - releaseMs) / 3600000;
  const tTgtH = tCkptH + horizonH;
  const horizonDays = Math.max(horizonH, 0) / 24;

  const n = c.trophies.length;
  const history = (c.history ?? []).slice().sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  );

  // Last non-null rate per trophy, and last players-tracked.
  const lastRate: number[] = new Array(n).fill(0);
  const lastEarners: number[] = new Array(n).fill(0);
  let playersLast = 0;
  for (const read of history) {
    if (typeof read.players_tracked === "number" && read.players_tracked > 0) {
      playersLast = read.players_tracked;
    }
    if (Array.isArray(read.rates)) {
      for (let i = 0; i < n; i++) {
        const r = read.rates[i];
        if (typeof r === "number") lastRate[i] = r;
      }
    }
  }
  if (playersLast <= 0) playersLast = 1;
  for (let i = 0; i < n; i++) {
    lastEarners[i] = (lastRate[i] / 100) * playersLast;
  }

  // Does the history actually vary? (Practice: one frozen value throughout.)
  const distinctPlayers = new Set(
    history
      .map((r) => r.players_tracked)
      .filter((d) => typeof d === "number" && d > 0),
  );
  const spanH =
    history.length >= 2
      ? (Date.parse(history[history.length - 1].at) -
          Date.parse(history[0].at)) /
        3600000
      : 0;
  const useFit = distinctPlayers.size >= 3 && spanH >= 6;

  // --- Denominator forecast -------------------------------------------------
  let playersTgt: number;
  if (useFit) {
    // log players vs log(1 + hours since release), slope damped x0.8.
    const xs: number[] = [];
    const ys: number[] = [];
    for (const read of history) {
      if (typeof read.players_tracked !== "number" || read.players_tracked <= 0)
        continue;
      const tH = (Date.parse(read.at) - releaseMs) / 3600000;
      xs.push(Math.log1p(Math.max(tH, 0)));
      ys.push(Math.log(read.players_tracked));
    }
    const [a, bRaw] = linfit(xs, ys);
    const b = clamp(bRaw * 0.8, 0, 2.5);
    const pred = Math.exp(a + b * Math.log1p(Math.max(tTgtH, 0)));
    playersTgt = clamp(pred, playersLast, playersLast * 40);
  } else {
    // Prior: the first refresh jumped the denominator ~6x over 90 minutes
    // from a ~3 h checkpoint; later checkpoints see a much smaller jump
    // (the launch-night backlog is gone) and longer horizons grow slower
    // than linearly (sublinear in horizon, decaying with checkpoint age).
    const jump =
      1 +
      5.06 *
        Math.pow(Math.max(horizonH, 0) / 1.5, 0.6) *
        Math.exp(-Math.max(0, tCkptH - 3) / 24);
    playersTgt = playersLast * jump;
  }

  // --- Per-trophy forecast ----------------------------------------------------
  const rows: { id: number; q: number[] }[] = [];
  for (let i = 0; i < n; i++) {
    const trophy = c.trophies[i];
    const rLast = lastRate[i];
    const prior = PRIORS[trophy.id] ?? DEFAULT_PRIOR;

    // The first-mission trophy sits at 100%: everyone earns it, it stays.
    if (rLast >= 99.99) {
      rows.push({ id: trophy.id, q: [100, 100, 100, 100, 100] });
      continue;
    }

    let earnersTgt: number;
    if (useFit) {
      // log earners vs log(1 + hours since release), slope damped x0.8.
      const xs: number[] = [];
      const ys: number[] = [];
      let maxSeen = 0;
      for (const read of history) {
        if (!Array.isArray(read.rates)) continue;
        const r = read.rates[i];
        if (typeof r !== "number" || typeof read.players_tracked !== "number")
          continue;
        const e = (r / 100) * read.players_tracked;
        if (e > maxSeen) maxSeen = e;
        if (e <= 0) continue;
        const tH = (Date.parse(read.at) - releaseMs) / 3600000;
        xs.push(Math.log1p(Math.max(tH, 0)));
        ys.push(Math.log(e));
      }
      if (xs.length >= 3) {
        const [a, bRaw] = linfit(xs, ys);
        const b = clamp(bRaw * 0.8, 0, 3);
        earnersTgt = Math.exp(a + b * Math.log1p(Math.max(tTgtH, 0)));
      } else {
        earnersTgt = lastEarners[i];
      }
      // Earners never decrease; they cannot exceed the tracked players.
      earnersTgt = clamp(earnersTgt, Math.max(maxSeen, lastEarners[i]), playersTgt);
    } else {
      // Prior: earners grow by the trophy's class multiplier, sublinear
      // in the horizon (sqrt), so a 90-minute practice window and a
      // week-long final window use the same shape, not a linear blow-up.
      const gE = 1 + (prior.g - 1) * Math.sqrt(Math.max(horizonH, 0) / 1.5);
      earnersTgt = lastEarners[i] * Math.min(gE, 40);
    }

    let median = (earnersTgt / playersTgt) * 100;
    // The cap is a plausibility rail for long horizons; it must never push
    // the median below the no-growth floor (today's earners over the
    // forecast denominator) — on a short horizon that floor is the answer.
    const floorRate = (lastEarners[i] / playersTgt) * 100;
    median = clamp(median, 0.01, Math.max(prior.cap, floorRate));
    if (rLast <= 0.01) median = 0.01;

    // Honest spread: grows with horizon, wider on a flat history and
    // for trophies with only a handful of earners (count noise).
    const s =
      S_BASE +
      S_HORIZON * Math.sqrt(horizonDays) +
      (useFit ? 0 : S_FLAT) +
      S_COUNT / Math.sqrt(lastEarners[i] + 2);

    const lm = logitPct(median);
    const q: number[] = [];
    let prev = 0.01;
    for (let k = 0; k < 5; k++) {
      const v = clamp(sigmoid(lm + Z[k] * s) * 100, 0.01, 99.99);
      const rounded = Math.round(Math.max(v, prev) * 10000) / 10000;
      q.push(rounded);
      prev = rounded;
    }
    void LEVELS;
    rows.push({ id: trophy.id, q });
  }
  return rows;
}

// ---- Entry point --------------------------------------------------------------
function main(): void {
  const inDir = process.env.MAKEFUN_INPUT_DIR ?? "/input";
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const files = fs
    .readdirSync(inDir)
    .filter((f) => f.endsWith(".in"))
    .sort();
  for (const file of files) {
    const c = JSON.parse(
      fs.readFileSync(path.join(inDir, file), "utf8"),
    ) as Case;
    const rows = forecastCase(c);
    const out = JSON.stringify({ trophies: rows }) + "\n";
    fs.writeFileSync(path.join(outDir, file.replace(/\.in$/, ".out")), out);
  }
}

main();
