# LuxAlgo Snapshot Refresh — Task Spec (4 timeframes, twice daily, Mon–Thu)

This file contains the full prompt for the scheduled task that refreshes the LuxAlgo Pine indicator snapshot in the crypto dashboard. Schedule it to run **twice daily — 1 AM and 1 PM local time, Monday through Thursday only** (skipping Friday, Saturday, Sunday).

## How to schedule in Cowork UI

1. Open Cowork's Tasks panel (left sidebar)
2. Click **New Scheduled Task**
3. Set:
   - **Schedule (cron):** `0 1,13 * * 1-4` (1 AM and 1 PM on Mon, Tue, Wed, Thu only)
   - **Name:** `refresh-luxalgo-snapshot`
   - **Description:** LuxAlgo Pine snapshot refresh from TradingView (1H, 4H, 1D, 1W) — twice daily Mon–Thu
4. Paste the entire "Task Prompt" section below into the prompt field
5. Save

**Cron breakdown:** `0 1,13 * * 1-4`
- `0` — at minute 0
- `1,13` — of hours 1 and 13 (1 AM and 1 PM)
- `*` — every day of the month
- `*` — every month
- `1-4` — day of week Monday through Thursday (0=Sun, 1=Mon, 4=Thu, 5=Fri)

If you already have a `refresh-luxalgo-snapshot` task from a prior version, **delete it first** (or use Update Scheduled Task) — the new prompt covers 4 timeframes instead of 2 and runs a longer scan.

The task only runs while Cowork is open. If Cowork was closed when the task fired, it runs on next launch.

## Prerequisites — every run

- TradingView Desktop running with the debug port (9222). Launch:
  `cd ~/Documents/Claude/Cowork/Crypto/tradingview-mcp && ./scripts/launch_tv_debug_mac.sh`
- The chart layout must have these three LuxAlgo indicators:
  - LuxAlgo® - Signals & Overlays™
  - LuxAlgo® - Price Action Concepts™ (Premium)
  - LuxAlgo® - Oscillator Matrix™

If TradingView isn't running, the task will notify you and stop cleanly.

## Expected runtime

Roughly **15–20 minutes** for the full 4-timeframe sweep across 40 coins:
- 1H phase is the slowest (~20s per coin due to deeper bar history) ≈ 13 min
- 4H, 1D each ≈ 2 min
- 1W ≈ 2 min

If TradingView is throttling, the task gracefully reports partial coverage.

## Task Prompt

```
You are refreshing the LuxAlgo Pine indicator snapshot for the crypto dashboard.
This runs twice daily (1 AM and 1 PM). The full scan covers 4 timeframes: 1H, 4H, 1D, 1W.

STEP 1 — Health check.
Call mcp__tradingview__tv_health_check. If cdp_connected is false, stop and tell the
user TradingView needs to be relaunched with the debug script at
~/Documents/Claude/Cowork/Crypto/tradingview-mcp/scripts/launch_tv_debug_mac.sh

STEP 2 — Kick off the mega-scan via mcp__tradingview__ui_evaluate with this JS:

(function() {
  window.__luxsnap = { done: false, results: { '1h':{}, '4h':{}, '1d':{}, '1w':{} }, error: null, log: [], phase: 'starting' };
  const all = ['BTC','ETH','SOL','LINK','TAO','NEAR','FET','SUI','RENDER','HBAR','AR','SEI','ZEC','APT','OP','ARB','XRP','ADA','AVAX','DOT','ATOM','ICP','HNT','AKT','STX','WLD','FIL','GRT','THETA','ALGO','VET','TRX','DOGE','MOVR','CFX','PYTH','TON','TRB','POL','ZK'];
  const TFS = [['1h','60'],['4h','240'],['1d','D'],['1w','W']];
  (async function() {
    try {
      const chart = window.TradingViewApi._activeChartWidgetWV.value();
      const widget = chart._chartWidget;
      function readStudies() {
        const model = widget.model(); const sources = model.model().dataSources();
        const out = {};
        for (const s of sources) {
          if (!s.metaInfo) continue;
          try {
            const meta = s.metaInfo();
            const name = meta.description || meta.shortDescription || '';
            if (!name || name.indexOf('LuxAlgo') < 0) continue;
            const dwv = s.dataWindowView(); if (!dwv) continue;
            const items = dwv.items() || []; const vals = {};
            for (const item of items) { if (item._value && item._value !== '∅' && item._title) vals[item._title] = item._value; }
            const key = name.indexOf('Signals & Overlays') >= 0 ? 'so'
                      : name.indexOf('Price Action Concepts') >= 0 ? 'pac'
                      : name.indexOf('Oscillator Matrix') >= 0 ? 'osc' : null;
            if (key) out[key] = vals;
          } catch(e) {}
        }
        return out;
      }
      for (const [tfKey, tfRes] of TFS) {
        window.__luxsnap.phase = tfKey;
        chart.setResolution(tfRes, {});
        await new Promise(r => setTimeout(r, 800));
        // 1H needs longer per-symbol settle (deeper history)
        const delay = tfKey === '1h' ? 4000 : 2200;
        for (const sym of all) {
          chart.setSymbol('BINANCE:' + sym + 'USDT', {});
          await new Promise(r => setTimeout(r, delay));
          window.__luxsnap.results[tfKey][sym] = readStudies();
          window.__luxsnap.log.push(tfKey + ':' + sym);
        }
      }
      window.__luxsnap.phase = 'done';
      window.__luxsnap.done = true;
    } catch (e) { window.__luxsnap.error = String(e); window.__luxsnap.done = true; }
  })();
  return 'kicked off 4-TF mega-scan (~15-20 min)';
})()

STEP 3 — Wait/poll. Sleep in 45-second chunks (max per call) using
mcp__workspace__bash `sleep 45 && echo done`. Between sleeps, poll:

  mcp__tradingview__ui_evaluate with expression:
  JSON.stringify({done: window.__luxsnap.done, phase: window.__luxsnap.phase, count: window.__luxsnap.log.length, error: window.__luxsnap.error})

Keep waiting until done is true or 25 minutes have elapsed. If not done after 25 minutes,
proceed with partial data — report which timeframes are incomplete.

STEP 4 — Parse and persist:

  mcp__tradingview__ui_evaluate with:
  (function() {
    function num(s) { if (!s) return null; const x = parseFloat(String(s).replace(/,/g,'').replace(/[−–]/g,'-')); return isNaN(x) ? null : x; }
    function extract(d) { const so=d.so||{},pac=d.pac||{},osc=d.osc||{}; return { trendStrength:num(so['Trend Strength']), pacDiscountTop:num(pac['Discount Top']), pacEqBottom:num(pac['Equilibrium Bottom']), pacEqTop:num(pac['Equilibrium Top']), pacPremiumBottom:num(pac['Premium Bottom']), hyperWave:num(osc['HyperWave']), moneyFlow:num(osc['Money Flow']), confluence:num(osc['Confluence Meter Value']) }; }
    const r = window.__luxsnap.results;
    const out = {};
    for (const tf of ['1h','4h','1d','1w']) {
      for (const sym in r[tf]) {
        const e = extract(r[tf][sym]);
        if (e.trendStrength == null) continue;
        if (!out[sym]) out[sym] = {};
        out[sym][tf] = e;
      }
    }
    return JSON.stringify(out);
  })()

Save the parsed JSON to ~/Documents/Claude/Cowork/Crypto/luxalgo_snapshot.json using Write.

STEP 5 — Rewrite the LUXALGO_SNAPSHOT block in
~/Documents/Claude/Cowork/Crypto/live_crypto_dashboard.html via mcp__workspace__bash:

python3 <<'PYEOF'
import json, re, datetime
data = json.load(open('/sessions/charming-gracious-hypatia/mnt/Crypto/luxalgo_snapshot.json'))
ORDER = ["BTC","ETH","SOL","LINK","TAO","NEAR","FET","SUI","RENDER","HBAR","AR","SEI","ZEC","APT","OP","ARB","XRP","ADA","AVAX","DOT","ATOM","ICP","HNT","AKT","STX","WLD","FIL","GRT","THETA","ALGO","VET","TRX","DOGE","MOVR","CFX","PYTH","TON","TRB","POL","ZK"]
today = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
lines = ['const LUXALGO_SNAPSHOT = {']
lines.append(f'  "_meta": {{ "source": "TradingView Desktop (LuxAlgo Pine indicators)", "capturedAt": "{today}", "coverage": "1H/4H/1D/1W twice-daily refresh" }},')
for sym in ORDER:
    if sym not in data: continue
    tfs = data[sym]; parts = []
    for tf in ('1h','4h','1d','1w'):
        if tf not in tfs: continue
        d = tfs[tf]
        kv = ', '.join(f'"{k}": {v if v is not None else "null"}' for k,v in d.items())
        parts.append(f'"{tf}": {{ {kv} }}')
    lines.append(f'  "{sym}": {{ {", ".join(parts)} }},')
lines[-1] = lines[-1].rstrip(',')
lines.append('};')
new_block = '\n'.join(lines)
html_path = '/sessions/charming-gracious-hypatia/mnt/Crypto/live_crypto_dashboard.html'
html = open(html_path).read()
pat = re.compile(r'const LUXALGO_SNAPSHOT = \{[\s\S]*?\n\};')
new_html, n = pat.subn(new_block, html, count=1)
if n == 1:
    open(html_path, 'w').write(new_html)
    coverage = {tf: sum(1 for s in ORDER if s in data and tf in data[s]) for tf in ('1h','4h','1d','1w')}
    print(f'Updated. Coverage: {coverage}')
else:
    print('ERROR: snapshot block not found')
PYEOF

STEP 6 — Report a concise summary:
- Coverage per timeframe (e.g. "1H: 40 coins, 4H: 38, 1D: 38, 1W: 40")
- Top 5 strongest by 1D Trend Strength
- Top 5 weakest by 1D Trend Strength
- Any 4-timeframe consensus signals — coins where 1H, 4H, 1D, and 1W are all
  bullish (≥60) or all bearish (≤40). These are highest-conviction reads.
- The manual deploy command:
  cd ~/Documents/Claude/Cowork/Crypto/crypto-dashboard-deploy && rm -f .git/HEAD.lock && cp ../live_crypto_dashboard.html index.html && git add . && git commit -m "Refresh LuxAlgo snapshot $(date +%Y-%m-%d-%H)" && git push

Do NOT git push automatically — the sandbox can't auth. The user pushes manually.
```

## Manual one-line trigger

To run this anytime without scheduling, say in any Cowork chat:

> Refresh the LuxAlgo snapshot using the spec in `refresh-luxalgo-snapshot.md`
