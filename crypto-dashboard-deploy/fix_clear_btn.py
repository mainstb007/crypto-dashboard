#!/usr/bin/env python3
with open('index.html', 'r') as f:
    lines = f.readlines()

# Find line 2207 (index 2206) and insert after it
insert_index = 2207
new_lines = [
    '\n',
    '\t\t  // Update clear selection button visibility and selected coin name\n',
    '\t\t  const clearBtnContainer = document.getElementById(\'clearSelectionContainer\');\n',
    '\t\t  const selectedCoinName = document.getElementById(\'selectedCoinName\');\n',
    '\t\t  if (selectedCoin) {\n',
    '\t\t    if (clearBtnContainer) clearBtnContainer.style.display = \'flex\';\n',
    '\t\t    if (selectedCoinName) {\n',
    '\t\t      const selectedCoinData = coinData.find(c => c.symbol === selectedCoin);\n',
    '\t\t      selectedCoinName.textContent = selectedCoinData ? `${selectedCoinData.symbol} - ${selectedCoinData.name}` : selectedCoin;\n',
    '\t\t    }\n',
    '\t\t  } else {\n',
    '\t\t    if (clearBtnContainer) clearBtnContainer.style.display = \'none\';\n',
    '\t\t  }\n'
]

for i, line in enumerate(new_lines):
    lines.insert(insert_index + i, line)

with open('index.html', 'w') as f:
    f.writelines(lines)

print("Added clear selection button logic!")
