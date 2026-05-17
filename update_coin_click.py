#!/usr/bin/env python3
import re

with open('index.html', 'r') as f:
    content = f.read()

# Replace the coin symbol line to make it clickable
old_pattern = r'<h3>\$\{coin\.symbol\} '
new_replacement = '<h3><span class="coin-ticker" onclick="selectCoin(\'${coin.symbol}\')" style="cursor: pointer; ${selectedCoin === \'${coin.symbol}\' ? \'color: var(--info-border); font-weight: 700; background: var(--info-bg); padding: 2px 8px; border-radius: 4px;\' : \'\'}">${coin.symbol} '

content = re.sub(old_pattern, new_replacement, content)

with open('index.html', 'w') as f:
    f.write(content)

print("Coin ticker made clickable!")
