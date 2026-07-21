# Budget & Savings Goals

A responsive personal budgeting web app (GBP £). Works on mobile and desktop
browsers. No build step, no backend, no external dependencies — plain
HTML/CSS/JS with data persisted in the browser's `localStorage`.

## Features

- **Income** — single editable monthly take-home field.
- **Expenses** — pre-populated categories with Budgeted / Actual amounts, per-row
  difference, and running totals. Add, remove, and rename categories.
- **Savings allocation** — savings categories with Budgeted / Actual and totals.
- **Summary dashboard** — Income − Expenses − Savings = Left Over, shown
  prominently, plus a donut chart of where the month's money went (expenses vs.
  each savings category vs. unallocated).
- **Private profile rooms** — Bayo and Adedola each get separate local data and a
  passcode gate on the same app.
- **Spending log** — add individual purchases by date, category, note, and
  amount; logged purchases roll into category Actual totals.
- **Money trail** — richer "where the money went" cards, category bars, over/under
  plan indicators, and biggest-spend highlights.
- **Stewardship word** — rotating scripture prompts for faith-led planning.
- **Savings goals** — target / current / monthly contribution with auto-calculated
  months remaining, estimated completion date, and a progress bar per goal.
- **Debt payoff** — name, balance, APR, monthly payment with an auto-calculated
  estimated payoff time (flags payments that never clear the balance).
- **Monthly history** — save a snapshot of the current month and see income vs.
  expenses vs. savings trend over time in a line chart.

## Running

It's a static site — just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

All data stays in your browser via `localStorage` under the key
`budget-savings-app.profiles.v2`.
