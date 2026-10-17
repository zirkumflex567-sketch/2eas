(function (root) {
  "use strict";
  const MAX_AUTOSCALE_PRICE = 1e9;
  function validPrice(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_AUTOSCALE_PRICE;
  }
  function merge(base, extent) {
    if (!extent || !validPrice(extent.min) || !validPrice(extent.max) || extent.min > extent.max) return base;
    const range = base?.priceRange;
    if (range && (!Number.isFinite(range.minValue) || !Number.isFinite(range.maxValue) || range.minValue > range.maxValue)) return base;
    const minValue = range ? Math.min(range.minValue, extent.min) : extent.min;
    const maxValue = range ? Math.max(range.maxValue, extent.max) : extent.max;
    return { ...(base || {}), priceRange: { minValue, maxValue } };
  }
  root.ChartStudioPositionAutoscale = Object.freeze({ merge });
})(window);
