"use strict";

const assert = require("node:assert/strict");
const { layoutAxisBadges } = require("../static/chart-axis-badge-layout.js");

const rows = layoutAxisBadges([
  { id: "entry", y: 61, priority: 10, lineVisible: true },
  { id: "sl", y: 60, priority: 0, lineVisible: true },
  { id: "tp", y: 74, priority: 1, lineVisible: true },
  { id: "poc", y: 92, priority: 20, lineVisible: true },
  { id: "outside", y: 2, priority: 0, lineVisible: true },
  { id: "disabled", y: 110, priority: 0, lineVisible: false },
], { paneHeight: 120, minGapPx: 32 });

assert.deepEqual(rows.map(row => [row.id, row.visible]), [
  ["entry", false], ["sl", true], ["tp", false], ["poc", true],
  ["outside", false], ["disabled", false],
]);
const visible = rows.filter(row => row.visible);
assert.ok(visible.every(row => row.y >= 16 && row.y <= 104));
for (let first = 0; first < visible.length; first += 1) {
  for (let second = first + 1; second < visible.length; second += 1) {
    assert.ok(Math.abs(visible[first].y - visible[second].y) >= 32,
      `${visible[first].id} and ${visible[second].id} overlap`);
  }
}

console.log(JSON.stringify({ candidates: rows.length, visible: visible.length,
  hidden: rows.length - visible.length, priority: visible.map(row => row.id) }));
