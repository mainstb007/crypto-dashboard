#!/usr/bin/env python3
with open('index.html', 'r') as f:
    lines = f.readlines()

# Fix line 2259 (index 2258) - properly escape the quotes
fixed_line = '          <h3><span class="coin-ticker" onclick="selectCoin(String.raw`${coin.symbol}`)" style="cursor: pointer; ${selectedCoin === String.raw`${coin.symbol}` ? `color: var(--info-border); font-weight: 700; background: var(--info-bg); padding: 2px 8px; border-radius: 4px;` : ``}">${coin.symbol}</span> <span class="coin-rank">#${coinData.indexOf(coin) + 1}</span></h3>\n'

lines[2258] = fixed_line

with open('index.html', 'w') as f:
    f.writelines(lines)

print("Fixed template literal quoting issue!")
