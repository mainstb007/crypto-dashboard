# Crypto Trading Dashboard — Reference Guide

Complete reference for the live crypto analysis dashboard. Covers architecture, scoring logic, the verdict pipeline, multi-timeframe LuxAlgo integration, the scheduled refresh task, and the deploy workflow.

**Live URL:** https://crypto-dashboard-mainstb007.vercel.app (or current Vercel domain)
**Working file:** `~/Documents/Claude/Cowork/Crypto/live_crypto_dashboard.html`
**Deploy repo:** `~/Documents/Claude/Cowork/Crypto/crypto-dashboard-deploy/` → GitHub `mainstb007/crypto-dashboard` → Vercel auto-deploy

---

## 1. What the dashboard does

A single-page dashboard that pulls live prices for 40 cryptocurrencies from Binance, KuCoin, Bybit, and CoinGecko, runs a multi-layered technical analysis pipeline, blends in real LuxAlgo Pine indicator readings captured from TradingView Desktop, and emits a per-coin verdict ("LOAD UP NOW", "Solid buy", "Take profit", etc.) along with supporting evidence.

The dashboard refreshes prices every 10 minutes automatically. LuxAlgo Pine readings are refreshed twice daily (1 AM and 1 PM, Monday–Thursday) by a scheduled task that drives TradingView Desktop via the `tradingview-mcp` server.

---

## 2. Coin universe

40 coins tracked. BTC and ETH are flagged `isMajor: true` and treated as benchmarks rather than ranked picks. The other 38 are scored and bucketed into tiers (see §3).

**Majors (benchmark, not ranked):**
BTC, ETH

**Tier S candidates** (strong fundamentals + narrative):
SOL, LINK, TAO, NEAR, FET

**Tier A candidates** (good fundamentals):
SUI, RENDER, HBAR, AR, SEI, ZEC, APT

**Tier B candidates** (speculative):
OP, ARB, XRP, ADA, AVAX, DOT, ATOM, ICP, HNT, AKT, STX, WLD, FIL, GRT, THETA, ALGO, VET, TRX, DOGE, MOVR, CFX, PYTH, TON, TRB, POL, ZK

*The "tier candidate" assignment in code is the *starting* category. The actual tier displayed on each card is computed dynamically from the score (see §3) — so a Tier B candidate can land in Tier A on a given day if its score crosses the threshold.*

HNT and AKT are skipped from the LuxAlgo snapshot because they don't have Binance USDT pairs that TradingView can read.

---

## 3. Tier classification

One score per coin, 0–100, with bands:

| Score | Tier | Meaning |
|---|---|---|
| ≥75 | **Tier S** | Top asset — high quality + good entry timing |
| 60–74 | **Tier A** | Strong asset — favourable setup |
| <60 | **Tier B** | Watchlist / speculative |
| (BTC, ETH) | **Major** | Benchmark — sets the macro tone, not ranked |

### Score components (function `calculateComprehensiveScore` in code)

Baseline starts at **50**. Adds and subtracts:

**Technicals (~60 points of swing):**
- RSI deeply oversold (<30): +10. Mildly oversold (<40): +7. Overbought (>70): −7.
- Daily trend bullish: +5. Bearish: −3.
- Multi-indicator confluence: 3+ bull signals +15, 2 bull +10. 3+ bear −15, 2 bear −10.
- VWAP entry quality: Excellent +15, Good +12, Fair +7, Take Profit −10, Consider Selling −5.
- Above SMA20: +3. Above SMA200: +2.
- 24h dip ≤−8%: +15 (oversold). −5% to −8%: +10. >+10%: −8 (extended).
- Volume >$100M: +10. >$50M: +5.

**Fundamentals (~40 points):**
- Tokenomics: no future unlocks +10, inflation <3% +8, staking APR >5% +5.
- Catalysts: ≥3 listed +10. Risks: ≤3 listed +5.
- Category bonus (AI / DePIN / L1 / infra): +10.
- Token unlock penalty: within 2 months −10, within 4 months −5.

The tier reflects *both* asset quality and current opportunity timing — it's not a pure quality rank. A fundamentally strong coin that's overextended can drop a tier; a weak coin in deep oversold capitulation can briefly rise a tier.

---

## 4. The verdict pipeline

This is the heart of the dashboard. It maps tier × entry quality into an actionable recommendation.

```
[Prices, OHLCV from exchanges]
         ↓
[Per-timeframe analysis] ──→ trend, RSI, VWAP, MACD, Stochastic, SMAs,
  (1H, 4H, 1D, 1W)        Bollinger, structure, FVGs, order blocks,
                          liquidity sweeps, Supertrend, smart money flow,
                          volume sentiment
         ↓
[Composite signal] ──→ blends LuxAlgo-style sub-scores +
  (computeCompositeSignal) MA stacks + osc confluence + premium/discount +
                          + REAL LuxAlgo Pine readings (40% blend) +
                          + 1W macro alignment (±8) +
                          + 4H swing confirmation (±4) +
                          + 1H intraday momentum (±3) +
                          + volume sentiment (±8) +
                          + cross-timeframe volume confirmation (±3)
         ↓
[Entry quality label]: Excellent / Good / Fair / Hold / Consider Selling
         ↓
[Action verdict] ── tier × entry label matrix
  (computeActionVerdict)   e.g. "Tier S + Excellent → 🎯 LOAD UP NOW"
         ↓
[Confirmation modifiers] ── ±flags from {vol sentiment, BoS/CHoCH,
  (applyConfirmationModifiers) liquidity sweeps, premium/discount, Supertrend}
         ↓
[Final verdict tag] e.g. "🎯 LOAD UP NOW · ✅ strong confluence"
```

### The tier × entry-quality matrix

For non-major coins:

| Tier | Excellent | Good | Fair | Hold | Consider Selling |
|---|---|---|---|---|---|
| **S** | 🎯 LOAD UP NOW | ✅ Solid buy | ⏳ Wait for dip | ⏸️ Hold / patient | 💰 Take profit |
| **A** | ✅ Solid buy | ✅ Good entry | ⏳ Wait | ⏸️ Patient | 💰 Trim |
| **B** | 👀 Speculative starter | 👀 Speculative | ⏸️ Skip | ⏸️ Skip | 🚪 Exit |

For BTC and ETH (Majors), verdicts are reframed as market-context signals:
- Excellent entry → "🟢 Major dip — risk-on signal"
- Good → "🟢 Constructive majors"
- Fair → "🟡 Majors neutral"
- Hold → "🟡 Majors holding range"
- Consider Selling → "🔴 Majors extended — caution"

### Confirmation modifier flags

Appended to the verdict tag based on agreement count across {volume sentiment, market structure event, liquidity sweep, premium/discount zone, Supertrend, multi-timeframe LuxAlgo}:

- 3+ bullish flags net positive → `· ✅ strong confluence`
- 2 net positive → `· ✅ confluence`
- 3+ net negative → `· ⚠️ heavy contradiction`
- 2 net negative → `· ⚠️ contradicting signals`
- Balanced → `· 🟡 mixed signals`

---

## 5. Timeframes

The composite signal looks at four timeframes per coin:

| TF | Code | Role | Weight in verdict |
|---|---|---|---|
| **1H** | `60` | Intraday momentum / entry timing | ±3 alignment with 1D |
| **4H** | `240` | Swing confirmation / structure | ±4 alignment with 1D |
| **1D** | `D` | **Primary** — drives entry quality | 40% blend with computed score |
| **1W** | `W` | Macro structure / cycle context | ±8 alignment with 1D |

The 1D timeframe is the authoritative input for the entry quality label that drives the verdict. 1H, 4H, and 1W are used as confirmation / divergence signals layered on top.

**Multi-timeframe divergence signal:** when 1H and 1D disagree sharply (e.g., 1H ≥70 but 1D ≤40), this surfaces as "1H reversal vs weak 1D" — useful for catching short-term turns inside daily downtrends. Same for 1W/1D: "1W bullish but 1D weak → accumulation zone".

---

## 6. LuxAlgo integration

The dashboard uses LuxAlgo Pine indicators in two complementary ways:

### 6a. Open-source approximations (always available)

Every coin gets approximations of LuxAlgo's concepts computed from OHLCV in the browser. These work for every coin regardless of TradingView availability:

| LuxAlgo concept | Open-source equivalent in code |
|---|---|
| Price Action Concepts: market structure | `findStructure` — BoS / CHoCH detection from pivot progression |
| PAC: Fair Value Gaps | `findFVGs` — 3-candle imbalances (bull/bear, filled/open) |
| PAC: Order Blocks | `findOrderBlocks` — last opposite-color candle before strong impulse |
| PAC: Liquidity Sweeps | `findLiquiditySweeps` — wick pierces swing low/high then reclaims |
| PAC: Premium / Discount zones | `computePremiumDiscount` — position in recent swing range |
| Signals & Overlays: MA stack | `computeMAStack` — price vs SMA 50/100/200 alignment |
| Signals & Overlays: Supertrend | `computeSupertrend` — ATR-based trend follower |
| Oscillator Matrix: Smart Money Flow | `computeSmartMoneyFlow` — OBV × price acceleration |
| Oscillator Matrix: Stochastic RSI | `calculateStochRSI` — Stoch applied to RSI series |

### 6b. Real Pine values (snapshot from TradingView Desktop)

Twice daily (1 AM and 1 PM Mon–Thu), the scheduled task drives TradingView Desktop via Chrome DevTools Protocol (`tradingview-mcp`) and reads the *actual* LuxAlgo Pine outputs for each coin across all 4 timeframes. These are embedded into the HTML as `LUXALGO_SNAPSHOT`.

The Pine indicators read are:
- **LuxAlgo® - Signals & Overlays™** — provides Trend Strength (0–100 scale)
- **LuxAlgo® - Price Action Concepts™ (Premium)** — provides Premium Bottom, Equilibrium Top/Bottom, Discount Top
- **LuxAlgo® - Oscillator Matrix™** — provides HyperWave, Money Flow, Confluence Meter Value

Each snapshot entry per coin per timeframe contains:
```json
{
  "trendStrength": 0..100,
  "pacDiscountTop": <price>,
  "pacEqBottom": <price>,
  "pacEqTop": <price>,
  "pacPremiumBottom": <price>,
  "hyperWave": 0..100,
  "moneyFlow": 0..100,
  "confluence": 0..100
}
```

The function `evaluateLuxAlgoSnapshot` converts these into a 0–100 score per timeframe with detailed reasons:

- Trend Strength ≥70: +12 (strong bull). ≥55: +6. ≤5: −10 (capitulation). ≤35: −6.
- Price in discount zone: +10. Premium zone: −10.
- HyperWave <20: +10 (deeply oversold). <35: +5. >80: −10. >65: −5.
- Money Flow ≥60: +6. ≥52: +3. ≤40: −6. ≤48: −3.
- Confluence ≥70: +6. ≤25: −6.

The 1D snapshot score is then **blended 60/40** with the live computed composite. The 1H/4H/1W scores serve as confirmation/divergence signals.

---

## 7. Volume sentiment composite

A dedicated indicator pack focused entirely on volume-based accumulation/distribution:

| Sub-component | Function | What it measures |
|---|---|---|
| **OBV slope** | `computeOBV` | On-Balance Volume direction over 14 bars. Rising = accumulation. |
| **Money Flow Index (MFI)** | `computeMFI` | RSI variant using typical price × volume. <20 oversold, >80 overbought. |
| **Chaikin Money Flow (CMF)** | `computeCMF` | Volume-weighted close position over 20 bars. Range −1 to +1. |
| **Buy/Sell pressure** | `computeBuySellPressure` | Williams %B-like (close position in range) × volume, 20 bars. CVD proxy. |

These combine into one 0–100 score with a label (Strong Accumulation / Mild Accumulation / Neutral / Mild Distribution / Strong Distribution), surfaced as the "📊 Volume sentiment" badge on each card.

The composite signal also checks 1D vs 4H volume sentiment agreement for the cross-timeframe confirmation bonus (±3).

---

## 8. The BTC & ETH benchmark panel

BTC and ETH get their own panel above the filters because their job is to set macro tone, not to be ranked against alts.

The panel shows:
- Side-by-side cards with price, 24h change, trend, RSI, VWAP entry quality, issuance/staking
- A regime tag at the top (Risk-On / Risk-Off / Mixed / Neutral) derived from BTC + ETH trend alignment
- A dynamic "Bias" thesis paragraph per coin that adapts to RSI, trend, and macro context
- The ETH/BTC ratio with relative-strength commentary

---

## 9. UI features

### Click-to-filter ticker
Click any coin's ticker symbol (e.g., `SOL`, `BTC`) to filter the grid to just that coin. A blue selection bar appears with a "Clear selection" button. Click the same ticker again or the X to clear.

### Filters
- Tier filter (All / Majors / Tier S / Tier A / Tier B)
- Buy-situation filter (All / Excellent buy / Good buy / Fair / Hold / Consider selling)
- Search by ticker or full name
- Sort by: Best action verdict / Best entry timing / Highest score / Strongest 24h / Weakest 24h / Allocation / Alpha

### Theme switcher
Top-right header has a 🌓 Theme dropdown with System / Light / Dark. Choice persists via localStorage. System mode follows OS dark-mode preference automatically.

### Live PINE row
For coins with real LuxAlgo snapshot data, a purple-badged row shows the actual Pine values from your TradingView subscription:
- 🟣 LIVE PINE LuxAlgo · TS / HW / MF / PAC zone
- Below it: a mini timeframe strip showing 1H / 4H / 1D / 1W scores side-by-side, color-coded bull (green ≥65), bear (red ≤35), or neutral (grey). Hover any cell for tooltips.

---

## 10. Scheduled refresh task

The full scan runs automatically twice daily, Monday through Thursday.

**Schedule:** `0 1,13 * * 1-4` — 1 AM and 1 PM local time on Mon, Tue, Wed, Thu only. Fri/Sat/Sun are skipped.

**Spec file:** `~/Documents/Claude/Cowork/Crypto/refresh-luxalgo-snapshot.md` — contains the full task prompt to paste into Cowork's New Scheduled Task dialog.

**What it does each run:**
1. Health-checks TradingView Desktop is running with debug port 9222
2. Kicks off a JS loop inside TradingView that iterates 38 coins × 4 timeframes (1H, 4H, 1D, 1W) = 152 reads
3. Polls the background loop until done (~15–25 minutes — the 1H phase is the slowest)
4. Parses results into the `LUXALGO_SNAPSHOT` shape
5. Saves a backup JSON at `~/Documents/Claude/Cowork/Crypto/luxalgo_snapshot.json`
6. Regenerates the `LUXALGO_SNAPSHOT` block in `live_crypto_dashboard.html` in place
7. Reports a summary (top strongest, top weakest, multi-timeframe consensus signals, divergences)
8. Prints the manual deploy command for you to paste into Terminal

**The task does NOT push to GitHub automatically** — the sandbox can't authenticate your git credentials. You manually run the deploy command when you want the new snapshot to go live.

**Prerequisites every run:**
- TradingView Desktop must be running with debug port enabled: `~/Documents/Claude/Cowork/Crypto/tradingview-mcp/scripts/launch_tv_debug_mac.sh`
- The chart layout must have these three LuxAlgo indicators loaded:
  - LuxAlgo® - Signals & Overlays™
  - LuxAlgo® - Price Action Concepts™ (Premium)
  - LuxAlgo® - Oscillator Matrix™

If TradingView isn't running, the task stops cleanly and notifies you.

**Manual one-line trigger** (if you want to refresh outside the schedule):

> In any Cowork chat: *"Refresh the LuxAlgo snapshot using the spec in `refresh-luxalgo-snapshot.md`"*

---

## 11. Deploy workflow

The deploy chain is fully wired up:

```
live_crypto_dashboard.html (working file in Crypto folder)
        ↓ manual copy
crypto-dashboard-deploy/index.html (local clone of GitHub repo)
        ↓ git push
GitHub: mainstb007/crypto-dashboard (main branch)
        ↓ Vercel webhook (auto, ~5s detection)
Vercel build (10–20s, static HTML)
        ↓
Live URL — Vercel deployment swaps in
```

**Standard deploy from Terminal:**

```bash
cd ~/Documents/Claude/Cowork/Crypto/crypto-dashboard-deploy
rm -f .git/HEAD.lock .git/index.lock
git pull origin main
cp ../live_crypto_dashboard.html index.html
git add index.html
git commit -m "Update dashboard"
git push origin main
```

macOS keychain handles GitHub auth automatically since you've pushed from this Mac before. After `git push`, hard-refresh the live URL with `Cmd+Shift+R` to skip cache and see the new version.

**Vercel dashboard:** https://vercel.com/dashboard → `crypto-dashboard` project. Build logs and deployment history live there.

---

## 12. Project file layout

Everything lives in `~/Documents/Claude/Cowork/Crypto/`:

```
Crypto/
├── live_crypto_dashboard.html   # The dashboard itself (working file)
├── DASHBOARD_GUIDE.md           # This file
├── refresh-luxalgo-snapshot.md  # Scheduled task spec
├── luxalgo_snapshot.json        # Latest snapshot backup (written by task)
├── Cycle_Deployment_Plan_May2026.html  # Investment plan reference
├── Profile_1789c.txt            # Coin profile data
├── README.md                    # Older repo readme
├── crypto-dashboard-deploy/     # Git clone of Vercel-deployed repo
│   ├── .git/
│   ├── index.html               # Deployed copy of the dashboard
│   ├── README.md
│   └── (helper scripts)
└── tradingview-mcp/             # Cloned MCP server for TradingView Desktop
    ├── src/
    ├── scripts/
    │   └── launch_tv_debug_mac.sh  # Launches TV with debug port
    ├── node_modules/
    └── package.json
```

**Claude Desktop MCP config:**
`~/Library/Application Support/Claude/claude_desktop_config.json`
Contains the `tradingview` MCP server entry pointing at `tradingview-mcp/src/server.js`.

---

## 13. Common operations

### Refresh the snapshot manually
In Cowork chat: *"Refresh the LuxAlgo snapshot using the spec in `refresh-luxalgo-snapshot.md`"*. Make sure TradingView Desktop is running with the debug port first.

### Change the score thresholds for tiers
Edit `getTier()` in `live_crypto_dashboard.html`. Current cutoffs: ≥75 S, ≥60 A, else B.

### Change the verdict matrix
Edit `computeActionVerdict()`. Each tier has a sub-object mapping entry labels to verdict tags + class + note.

### Add a new coin
1. Add to `ALL_COINS` array at the top of the script block — include symbol, name, category, allocation.
2. Add to `COIN_IDS` mapping if its CoinGecko ID differs from a default guess.
3. Optionally add to `TOKENOMICS`, `CATALYSTS`, `RISKS` objects for richer rendering and scoring.
4. Re-run the snapshot scan to pick up LuxAlgo readings for it.

### Remove a coin
Delete from `ALL_COINS`. The snapshot data for that coin stays in `LUXALGO_SNAPSHOT` but is harmlessly ignored.

### Change the schedule
1. Edit `refresh-luxalgo-snapshot.md` — update the cron line and prompt date references.
2. In Cowork's Tasks panel, delete the existing `refresh-luxalgo-snapshot` task and recreate with the new cron from the spec file.
3. Cron syntax reference:
   - `0 1,13 * * 1-4` — twice daily Mon-Thu (current)
   - `0 7 * * *` — daily at 7 AM
   - `0 */6 * * *` — every 6 hours
   - `0 9 * * 1-5` — weekdays at 9 AM

### Modify LuxAlgo blending weight
In `computeCompositeSignal`, the line `score = Math.round(score * 0.6 + real1d.score * 0.4)` sets the 60/40 blend. Change `0.6` and `0.4` to shift the balance toward computed approximations or real Pine values.

---

## 14. Architecture diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    USER'S BROWSER (Vercel-hosted)                   │
│                                                                     │
│  live_crypto_dashboard.html (static HTML + JS)                     │
│   ├─ ALL_COINS list, TOKENOMICS, CATALYSTS, RISKS                  │
│   ├─ LUXALGO_SNAPSHOT (baked Pine values)                          │
│   ├─ fetchPriceFromExchanges (Binance/KuCoin/Bybit/CoinGecko)      │
│   ├─ fetchBinanceKlines (OHLCV for 1H, 4H, 1D, 1W)                 │
│   ├─ analyzeTimeframe (RSI, MACD, VWAP, MA, BB, structure, FVG,    │
│   │                    sweeps, supertrend, smart money flow,        │
│   │                    volume sentiment)                            │
│   ├─ computeCompositeSignal (blends all signals + LuxAlgo)         │
│   ├─ computeActionVerdict + applyConfirmationModifiers              │
│   └─ renderCoins + renderMajorsPanel                                │
│                                                                     │
│  Refresh cycle: every 10 minutes (prices + analysis)               │
└─────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ Vercel auto-deploys on git push
                                  │
┌─────────────────────────────────────────────────────────────────────┐
│                          GITHUB                                     │
│  mainstb007/crypto-dashboard (main branch)                         │
└─────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ git push (manual from Terminal)
                                  │
┌─────────────────────────────────────────────────────────────────────┐
│                      USER'S MAC (Mac mini Pro)                      │
│                                                                     │
│  ~/Documents/Claude/Cowork/Crypto/                                  │
│   ├─ live_crypto_dashboard.html (working file)                      │
│   ├─ crypto-dashboard-deploy/index.html (git clone)                 │
│   └─ luxalgo_snapshot.json (latest snapshot backup)                 │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Scheduled task (Cowork, cron: 0 1,13 * * 1-4)            │    │
│  │   1. Polls tradingview-mcp tv_health_check                 │    │
│  │   2. ui_evaluate JS loop drives TradingView Desktop:      │    │
│  │      40 coins × 4 timeframes (1H/4H/1D/1W) = 152 reads    │    │
│  │   3. Parses Pine outputs (TrendStrength, PAC, HW, MF, Conf)│    │
│  │   4. Rewrites LUXALGO_SNAPSHOT block in HTML in-place      │    │
│  │   5. Reports summary, prints deploy command                │    │
│  └────────────────────────────────────────────────────────────┘    │
│                            │ Chrome DevTools Protocol (port 9222)   │
│                            ▼                                        │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  TradingView Desktop                                       │    │
│  │   - Subscribed account                                     │    │
│  │   - Chart layout with 3 LuxAlgo Pine indicators loaded    │    │
│  │     (Signals & Overlays, PAC Premium, Oscillator Matrix)  │    │
│  │   - Launched with --remote-debugging-port=9222             │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 15. Known limitations & gotchas

- **HNT and AKT are skipped** in the LuxAlgo snapshot — they don't have `BINANCE:HNTUSDT` or `BINANCE:AKTUSDT` pairs that TradingView can chart. They still get full computed approximation analysis though.
- **TradingView throttles 1H reads heavily.** Each 1H symbol switch takes 20–40 seconds because TradingView fetches deep bar history. The full 4-timeframe scan takes 15–25 minutes total. Schedule accordingly.
- **The scheduled task only runs while Cowork is open.** If Cowork is closed when 1 AM / 1 PM hits, the task runs on next launch.
- **The scheduled task doesn't auto-push to GitHub.** The Linux sandbox where Cowork runs commands doesn't have your git credentials. After each scheduled run, you manually copy-paste the deploy command into Terminal.
- **The `LUXALGO_SNAPSHOT` is a static snapshot, not live.** It's only as fresh as the last scheduled run (or the last manual refresh). The computed approximations always update every 10 minutes from live OHLCV — that's the safety net.
- **The tier classification mixes asset quality and entry timing.** Tier S doesn't mean "this is permanently a top-5 asset" — it means "this is a strong asset that's also in a good entry zone right now." Use the catalysts/risks/tokenomics sections to evaluate pure quality.
- **The dashboard runs entirely in the browser.** No backend, no database. Prices come from public exchange APIs at runtime. If you're behind a corporate proxy that blocks Binance/KuCoin, the dashboard degrades gracefully but loses data for affected coins.
- **PYTH 1H and ETH 4H were dropped** from the most recent snapshot due to chart-state timing glitches during that pair of symbol switches. The next scheduled run picks them up automatically.

---

## 16. Useful URLs and references

- Live dashboard: https://crypto-dashboard-mainstb007.vercel.app
- GitHub repo: https://github.com/mainstb007/crypto-dashboard
- Vercel dashboard: https://vercel.com/dashboard
- TradingView MCP (third-party, not Anthropic): https://github.com/tradesdontlie/tradingview-mcp
- GitHub Personal Access Tokens (for manual pushes if keychain fails): https://github.com/settings/tokens
- LuxAlgo (Pine indicators on TradingView, paid subscription): https://luxalgo.com

---

*Last updated: 2026-05-21. Maintain this file as the dashboard evolves — it's the source of truth for how everything fits together.*
