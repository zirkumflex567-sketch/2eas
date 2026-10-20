"use strict";

function layoutAxisBadges(candidates, options = {}) {
  if (!Array.isArray(candidates)) throw new TypeError("Axis badge candidates must be an array");
  const paneHeight = Number(options.paneHeight);
  const minGapPx = options.minGapPx === undefined ? 32 : Number(options.minGapPx);
  if (!Number.isFinite(paneHeight) || paneHeight < 0 || !Number.isFinite(minGapPx) || minGapPx <= 0) {
    throw new TypeError("Axis badge layout requires a non-negative pane height and positive gap");
  }
  const ids = new Set();
  const positioned = candidates.map((candidate, index) => {
    if (!candidate || typeof candidate.id !== "string" || !candidate.id || ids.has(candidate.id)) {
      throw new TypeError("Axis badge ids must be unique non-empty strings");
    }
    if (!Number.isFinite(candidate.priority)) throw new TypeError("Axis badge priority must be finite");
    ids.add(candidate.id);
    return { id: candidate.id, y: candidate.y, priority: candidate.priority,
      lineVisible: candidate.lineVisible !== false, index, visible: false };
  }).sort((a, b) => a.priority - b.priority || a.index - b.index);
  const reserved = [];
  for (const candidate of positioned) {
    const y = candidate.y;
    const inPane = Number.isFinite(y) && paneHeight >= minGapPx &&
      y >= minGapPx / 2 && y <= paneHeight - minGapPx / 2;
    candidate.visible = candidate.lineVisible && inPane &&
      reserved.every(other => Math.abs(y - other) >= minGapPx);
    if (candidate.visible) reserved.push(y);
  }
  positioned.sort((a, b) => a.index - b.index);
  return positioned.map(({ id, y, visible }) => ({ id, y, visible }));
}

if (typeof module !== "undefined" && module.exports) module.exports = { layoutAxisBadges };
if (typeof window !== "undefined") window.ChartAxisBadgeLayout = Object.freeze({ layoutAxisBadges });
