"""Print comparable summary metrics from saved German MT5 HTML reports."""

from bs4 import BeautifulSoup
from pathlib import Path
import sys


LABELS = {
    "net": "Nettogewinn gesamt:",
    "gross_profit": "Bruttogewinn:",
    "gross_loss": "Bruttoverlust:",
    "equity_dd_max": "Rückgang Equity maximal:",
    "equity_dd_rel": "Rückgang Equity relativ:",
    "profit_factor": "Profitfaktor:",
    "trades": "Gesamtanzahl Trades:",
    "largest_loss": "Größter Verlusttrade:",
    "history_quality": "Qualität der Historie:",
}


def main(paths):
    for path in paths:
        soup = BeautifulSoup(Path(path).read_text(encoding="utf-16"), "html.parser")
        values = {}
        for row in soup.find_all("tr"):
            cells = [cell.get_text(" ", strip=True) for cell in row.find_all("td")]
            for key, label in LABELS.items():
                if label in cells:
                    index = cells.index(label)
                    values[key] = cells[index + 1] if index + 1 < len(cells) else ""
        print(Path(path).name, values)


if __name__ == "__main__":
    main(sys.argv[1:])
