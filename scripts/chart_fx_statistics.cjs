"use strict";

function maxValue(values) {
  let found = false;
  let result = -Infinity;
  for (const value of values) {
    result = Math.max(result, value);
    found = true;
  }
  return found ? result : null;
}

function minValue(values) {
  let found = false;
  let result = Infinity;
  for (const value of values) {
    result = Math.min(result, value);
    found = true;
  }
  return found ? result : null;
}

module.exports = { maxValue, minValue };
