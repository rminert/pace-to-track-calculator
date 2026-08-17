# Track Splits Calculator

A phone-first tool for interval workouts: enter a target pace and a rep distance, get the target
time at every 100m mark around the track.

**Live site:** https://rminert.github.io/pace-to-track-calculator/

Every push to `main` deploys. The workflow enables Pages itself on its first run, so no manual
setup is needed while the repo is public.

## Two tabs

**Calculator** — pick a pace (min/mi or min/km) and a distance (200m through 5K presets, or any
custom distance in meters). You get:

- the total target time for the rep, plus per-lap and per-100m pace,
- a table of every 100m mark with **elapsed** (cumulative) and **segment** times,
- lap badges at every 400m,
- a Copy button, and a shareable URL — `#pace=8:00&unit=mi&dist=800` — so a workout can be
  bookmarked or texted.

Example: 800m repeats at 8:00/mi → 100m in 29.8, 200m in 59.7, 400m in 1:59.3, 800m in 3:58.6.

**Pace Chart** — a reference table of 100m / 200m / 300m / 400m splits for every pace from
4:00/mi to 14:00/mi in 10-second steps (2:20–9:00/km when switched to metric). The pace column
and header row stay pinned while scrolling, and the "jump to pace" box highlights the nearest row.

Splits assume a standard 400m lap in lane 1; outer lanes run longer per lap.

## Running locally

No build step and no dependencies — just static files.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Layout

```
index.html            markup for both tabs
assets/styles.css     Fleet Feet-inspired theme (Deep Cerulean #007EA7, black, white)
assets/app.js         pace math, rendering, tabs, URL/localStorage state
.github/workflows/    GitHub Pages deploy
```

The pace math lives in a handful of pure functions in `assets/app.js` (`parsePace`,
`secondsPerMeter`, `splitFor`, `formatTime`), shared by both tabs so they can never disagree.
They're exposed on `window.TrackSplits` for quick console checks.
