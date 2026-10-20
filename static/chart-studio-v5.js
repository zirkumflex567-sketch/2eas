"use strict";
var ChartStudioV5 = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/adapter.ts
  var adapter_exports = {};
  __export(adapter_exports, {
    VERSION: () => VERSION2,
    calculateAtrBands: () => calculateAtrBands,
    calculateAutoFibonacci: () => calculateAutoFibonacci,
    calculateBollingerBands: () => calculateBollingerBands,
    calculateIchimoku: () => calculateIchimoku,
    calculateLinearRegressionChannel: () => calculateLinearRegressionChannel,
    calculatePivotPoints: () => calculatePivotPoints,
    calculateSessionVwap: () => calculateSessionVwap,
    calculateVolumeZones: () => calculateVolumeZones,
    createIncrementalOscillator: () => createIncrementalOscillator,
    createStudioV5: () => createStudioV5
  });

  // node_modules/fancy-canvas/size.mjs
  function size(_a) {
    var width = _a.width, height = _a.height;
    if (width < 0) {
      throw new Error("Negative width is not allowed for Size");
    }
    if (height < 0) {
      throw new Error("Negative height is not allowed for Size");
    }
    return {
      width,
      height
    };
  }
  function equalSizes(first, second) {
    return first.width === second.width && first.height === second.height;
  }

  // node_modules/fancy-canvas/device-pixel-ratio.mjs
  var Observable = (
    /** @class */
    (function() {
      function Observable2(win) {
        var _this = this;
        this._resolutionListener = function() {
          return _this._onResolutionChanged();
        };
        this._resolutionMediaQueryList = null;
        this._observers = [];
        this._window = win;
        this._installResolutionListener();
      }
      Observable2.prototype.dispose = function() {
        this._uninstallResolutionListener();
        this._window = null;
      };
      Object.defineProperty(Observable2.prototype, "value", {
        get: function() {
          return this._window.devicePixelRatio;
        },
        enumerable: false,
        configurable: true
      });
      Observable2.prototype.subscribe = function(next) {
        var _this = this;
        var observer = { next };
        this._observers.push(observer);
        return {
          unsubscribe: function() {
            _this._observers = _this._observers.filter(function(o2) {
              return o2 !== observer;
            });
          }
        };
      };
      Observable2.prototype._installResolutionListener = function() {
        if (this._resolutionMediaQueryList !== null) {
          throw new Error("Resolution listener is already installed");
        }
        var dppx = this._window.devicePixelRatio;
        this._resolutionMediaQueryList = this._window.matchMedia("all and (resolution: ".concat(dppx, "dppx)"));
        this._resolutionMediaQueryList.addListener(this._resolutionListener);
      };
      Observable2.prototype._uninstallResolutionListener = function() {
        if (this._resolutionMediaQueryList !== null) {
          this._resolutionMediaQueryList.removeListener(this._resolutionListener);
          this._resolutionMediaQueryList = null;
        }
      };
      Observable2.prototype._reinstallResolutionListener = function() {
        this._uninstallResolutionListener();
        this._installResolutionListener();
      };
      Observable2.prototype._onResolutionChanged = function() {
        var _this = this;
        this._observers.forEach(function(observer) {
          return observer.next(_this._window.devicePixelRatio);
        });
        this._reinstallResolutionListener();
      };
      return Observable2;
    })()
  );
  function createObservable(win) {
    return new Observable(win);
  }

  // node_modules/fancy-canvas/canvas-element-bitmap-size.mjs
  var DevicePixelContentBoxBinding = (
    /** @class */
    (function() {
      function DevicePixelContentBoxBinding2(canvasElement, transformBitmapSize, options) {
        var _a;
        this._canvasElement = null;
        this._bitmapSizeChangedListeners = [];
        this._suggestedBitmapSize = null;
        this._suggestedBitmapSizeChangedListeners = [];
        this._devicePixelRatioObservable = null;
        this._canvasElementResizeObserver = null;
        this._canvasElement = canvasElement;
        this._canvasElementClientSize = size({
          width: this._canvasElement.clientWidth,
          height: this._canvasElement.clientHeight
        });
        this._transformBitmapSize = transformBitmapSize !== null && transformBitmapSize !== void 0 ? transformBitmapSize : (function(size2) {
          return size2;
        });
        this._allowResizeObserver = (_a = options === null || options === void 0 ? void 0 : options.allowResizeObserver) !== null && _a !== void 0 ? _a : true;
        this._chooseAndInitObserver();
      }
      DevicePixelContentBoxBinding2.prototype.dispose = function() {
        var _a, _b;
        if (this._canvasElement === null) {
          throw new Error("Object is disposed");
        }
        (_a = this._canvasElementResizeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        this._canvasElementResizeObserver = null;
        (_b = this._devicePixelRatioObservable) === null || _b === void 0 ? void 0 : _b.dispose();
        this._devicePixelRatioObservable = null;
        this._suggestedBitmapSizeChangedListeners.length = 0;
        this._bitmapSizeChangedListeners.length = 0;
        this._canvasElement = null;
      };
      Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "canvasElement", {
        get: function() {
          if (this._canvasElement === null) {
            throw new Error("Object is disposed");
          }
          return this._canvasElement;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "canvasElementClientSize", {
        get: function() {
          return this._canvasElementClientSize;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "bitmapSize", {
        get: function() {
          return size({
            width: this.canvasElement.width,
            height: this.canvasElement.height
          });
        },
        enumerable: false,
        configurable: true
      });
      DevicePixelContentBoxBinding2.prototype.resizeCanvasElement = function(clientSize) {
        this._canvasElementClientSize = size(clientSize);
        this.canvasElement.style.width = "".concat(this._canvasElementClientSize.width, "px");
        this.canvasElement.style.height = "".concat(this._canvasElementClientSize.height, "px");
        this._invalidateBitmapSize();
      };
      DevicePixelContentBoxBinding2.prototype.subscribeBitmapSizeChanged = function(listener) {
        this._bitmapSizeChangedListeners.push(listener);
      };
      DevicePixelContentBoxBinding2.prototype.unsubscribeBitmapSizeChanged = function(listener) {
        this._bitmapSizeChangedListeners = this._bitmapSizeChangedListeners.filter(function(l2) {
          return l2 !== listener;
        });
      };
      Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "suggestedBitmapSize", {
        get: function() {
          return this._suggestedBitmapSize;
        },
        enumerable: false,
        configurable: true
      });
      DevicePixelContentBoxBinding2.prototype.subscribeSuggestedBitmapSizeChanged = function(listener) {
        this._suggestedBitmapSizeChangedListeners.push(listener);
      };
      DevicePixelContentBoxBinding2.prototype.unsubscribeSuggestedBitmapSizeChanged = function(listener) {
        this._suggestedBitmapSizeChangedListeners = this._suggestedBitmapSizeChangedListeners.filter(function(l2) {
          return l2 !== listener;
        });
      };
      DevicePixelContentBoxBinding2.prototype.applySuggestedBitmapSize = function() {
        if (this._suggestedBitmapSize === null) {
          return;
        }
        var oldSuggestedSize = this._suggestedBitmapSize;
        this._suggestedBitmapSize = null;
        this._resizeBitmap(oldSuggestedSize);
        this._emitSuggestedBitmapSizeChanged(oldSuggestedSize, this._suggestedBitmapSize);
      };
      DevicePixelContentBoxBinding2.prototype._resizeBitmap = function(newSize) {
        var oldSize = this.bitmapSize;
        if (equalSizes(oldSize, newSize)) {
          return;
        }
        this.canvasElement.width = newSize.width;
        this.canvasElement.height = newSize.height;
        this._emitBitmapSizeChanged(oldSize, newSize);
      };
      DevicePixelContentBoxBinding2.prototype._emitBitmapSizeChanged = function(oldSize, newSize) {
        var _this = this;
        this._bitmapSizeChangedListeners.forEach(function(listener) {
          return listener.call(_this, oldSize, newSize);
        });
      };
      DevicePixelContentBoxBinding2.prototype._suggestNewBitmapSize = function(newSize) {
        var oldSuggestedSize = this._suggestedBitmapSize;
        var finalNewSize = size(this._transformBitmapSize(newSize, this._canvasElementClientSize));
        var newSuggestedSize = equalSizes(this.bitmapSize, finalNewSize) ? null : finalNewSize;
        if (oldSuggestedSize === null && newSuggestedSize === null) {
          return;
        }
        if (oldSuggestedSize !== null && newSuggestedSize !== null && equalSizes(oldSuggestedSize, newSuggestedSize)) {
          return;
        }
        this._suggestedBitmapSize = newSuggestedSize;
        this._emitSuggestedBitmapSizeChanged(oldSuggestedSize, newSuggestedSize);
      };
      DevicePixelContentBoxBinding2.prototype._emitSuggestedBitmapSizeChanged = function(oldSize, newSize) {
        var _this = this;
        this._suggestedBitmapSizeChangedListeners.forEach(function(listener) {
          return listener.call(_this, oldSize, newSize);
        });
      };
      DevicePixelContentBoxBinding2.prototype._chooseAndInitObserver = function() {
        var _this = this;
        if (!this._allowResizeObserver) {
          this._initDevicePixelRatioObservable();
          return;
        }
        isDevicePixelContentBoxSupported().then(function(isSupported) {
          return isSupported ? _this._initResizeObserver() : _this._initDevicePixelRatioObservable();
        });
      };
      DevicePixelContentBoxBinding2.prototype._initDevicePixelRatioObservable = function() {
        var _this = this;
        if (this._canvasElement === null) {
          return;
        }
        var win = canvasElementWindow(this._canvasElement);
        if (win === null) {
          throw new Error("No window is associated with the canvas");
        }
        this._devicePixelRatioObservable = createObservable(win);
        this._devicePixelRatioObservable.subscribe(function() {
          return _this._invalidateBitmapSize();
        });
        this._invalidateBitmapSize();
      };
      DevicePixelContentBoxBinding2.prototype._invalidateBitmapSize = function() {
        var _a, _b;
        if (this._canvasElement === null) {
          return;
        }
        var win = canvasElementWindow(this._canvasElement);
        if (win === null) {
          return;
        }
        var ratio = (_b = (_a = this._devicePixelRatioObservable) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : win.devicePixelRatio;
        var canvasRects = this._canvasElement.getClientRects();
        var newSize = (
          // eslint-disable-next-line no-negated-condition
          canvasRects[0] !== void 0 ? predictedBitmapSize(canvasRects[0], ratio) : size({
            width: this._canvasElementClientSize.width * ratio,
            height: this._canvasElementClientSize.height * ratio
          })
        );
        this._suggestNewBitmapSize(newSize);
      };
      DevicePixelContentBoxBinding2.prototype._initResizeObserver = function() {
        var _this = this;
        if (this._canvasElement === null) {
          return;
        }
        this._canvasElementResizeObserver = new ResizeObserver(function(entries) {
          var entry = entries.find(function(entry2) {
            return entry2.target === _this._canvasElement;
          });
          if (!entry || !entry.devicePixelContentBoxSize || !entry.devicePixelContentBoxSize[0]) {
            return;
          }
          var entrySize = entry.devicePixelContentBoxSize[0];
          var newSize = size({
            width: entrySize.inlineSize,
            height: entrySize.blockSize
          });
          _this._suggestNewBitmapSize(newSize);
        });
        this._canvasElementResizeObserver.observe(this._canvasElement, { box: "device-pixel-content-box" });
      };
      return DevicePixelContentBoxBinding2;
    })()
  );
  function bindTo(canvasElement, target) {
    if (target.type === "device-pixel-content-box") {
      return new DevicePixelContentBoxBinding(canvasElement, target.transform, target.options);
    }
    throw new Error("Unsupported binding target");
  }
  function canvasElementWindow(canvasElement) {
    return canvasElement.ownerDocument.defaultView;
  }
  function isDevicePixelContentBoxSupported() {
    return new Promise(function(resolve) {
      var ro = new ResizeObserver(function(entries) {
        resolve(entries.every(function(entry) {
          return "devicePixelContentBoxSize" in entry;
        }));
        ro.disconnect();
      });
      ro.observe(document.body, { box: "device-pixel-content-box" });
    }).catch(function() {
      return false;
    });
  }
  function predictedBitmapSize(canvasRect, ratio) {
    return size({
      width: Math.round(canvasRect.left * ratio + canvasRect.width * ratio) - Math.round(canvasRect.left * ratio),
      height: Math.round(canvasRect.top * ratio + canvasRect.height * ratio) - Math.round(canvasRect.top * ratio)
    });
  }

  // node_modules/fancy-canvas/canvas-rendering-target.mjs
  var CanvasRenderingTarget2D = (
    /** @class */
    (function() {
      function CanvasRenderingTarget2D2(context, mediaSize, bitmapSize) {
        if (mediaSize.width === 0 || mediaSize.height === 0) {
          throw new TypeError("Rendering target could only be created on a media with positive width and height");
        }
        this._mediaSize = mediaSize;
        if (bitmapSize.width === 0 || bitmapSize.height === 0) {
          throw new TypeError("Rendering target could only be created using a bitmap with positive integer width and height");
        }
        this._bitmapSize = bitmapSize;
        this._context = context;
      }
      CanvasRenderingTarget2D2.prototype.useMediaCoordinateSpace = function(f2) {
        try {
          this._context.save();
          this._context.setTransform(1, 0, 0, 1, 0, 0);
          this._context.scale(this._horizontalPixelRatio, this._verticalPixelRatio);
          return f2({
            context: this._context,
            mediaSize: this._mediaSize
          });
        } finally {
          this._context.restore();
        }
      };
      CanvasRenderingTarget2D2.prototype.useBitmapCoordinateSpace = function(f2) {
        try {
          this._context.save();
          this._context.setTransform(1, 0, 0, 1, 0, 0);
          return f2({
            context: this._context,
            mediaSize: this._mediaSize,
            bitmapSize: this._bitmapSize,
            horizontalPixelRatio: this._horizontalPixelRatio,
            verticalPixelRatio: this._verticalPixelRatio
          });
        } finally {
          this._context.restore();
        }
      };
      Object.defineProperty(CanvasRenderingTarget2D2.prototype, "_horizontalPixelRatio", {
        get: function() {
          return this._bitmapSize.width / this._mediaSize.width;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(CanvasRenderingTarget2D2.prototype, "_verticalPixelRatio", {
        get: function() {
          return this._bitmapSize.height / this._mediaSize.height;
        },
        enumerable: false,
        configurable: true
      });
      return CanvasRenderingTarget2D2;
    })()
  );
  function tryCreateCanvasRenderingTarget2D(binding, contextOptions) {
    var mediaSize = binding.canvasElementClientSize;
    if (mediaSize.width === 0 || mediaSize.height === 0) {
      return null;
    }
    var bitmapSize = binding.bitmapSize;
    if (bitmapSize.width === 0 || bitmapSize.height === 0) {
      return null;
    }
    var context = binding.canvasElement.getContext("2d", contextOptions);
    if (context === null) {
      return null;
    }
    return new CanvasRenderingTarget2D(context, mediaSize, bitmapSize);
  }

  // node_modules/lightweight-charts/dist/lightweight-charts.production.mjs
  var e = { title: "", visible: true, hitTestTolerance: 3, lastValueVisible: true, priceLineVisible: true, priceLineSource: 0, priceLineWidth: 1, priceLineColor: "", priceLineStyle: 2, baseLineVisible: true, baseLineWidth: 1, baseLineColor: "#B2B5BE", baseLineStyle: 0, priceFormat: { type: "price", precision: 2, minMove: 0.01 } };
  var r;
  var h;
  function a(t, i) {
    const n = (function(t2, i2) {
      switch (t2) {
        case 0:
        default:
          return [];
        case 1:
          return [i2, i2];
        case 2:
          return [2 * i2, 2 * i2];
        case 3:
          return [6 * i2, 6 * i2];
        case 4:
          return [i2, 4 * i2];
      }
    })(i, t.lineWidth);
    return t.setLineDash(n), n;
  }
  function l(t, i, n, s) {
    t.beginPath();
    const e2 = t.lineWidth % 2 ? 0.5 : 0;
    t.moveTo(n, i + e2), t.lineTo(s, i + e2), t.stroke();
  }
  function o(t, i) {
    if (!t) throw new Error("Assertion failed" + (i ? ": " + i : ""));
  }
  function _(t) {
    if (void 0 === t) throw new Error("Value is undefined");
    return t;
  }
  function u(t) {
    if (null === t) throw new Error("Value is null");
    return t;
  }
  function c(t) {
    return u(_(t));
  }
  !(function(t) {
    t[t.Simple = 0] = "Simple", t[t.WithSteps = 1] = "WithSteps", t[t.Curved = 2] = "Curved";
  })(r || (r = {})), (function(t) {
    t[t.Solid = 0] = "Solid", t[t.Dotted = 1] = "Dotted", t[t.Dashed = 2] = "Dashed", t[t.LargeDashed = 3] = "LargeDashed", t[t.SparseDotted = 4] = "SparseDotted";
  })(h || (h = {}));
  var d = class {
    constructor() {
      this.t = [];
    }
    i(t, i, n) {
      const s = { h: t, l: i, o: true === n };
      this.t.push(s);
    }
    _(t) {
      const i = this.t.findIndex(((i2) => t === i2.h));
      i > -1 && this.t.splice(i, 1);
    }
    u(t) {
      this.t = this.t.filter(((i) => i.l !== t));
    }
    p(t, i, n) {
      const s = [...this.t];
      this.t = this.t.filter(((t2) => !t2.o)), s.forEach(((s2) => s2.h(t, i, n)));
    }
    v() {
      return this.t.length > 0;
    }
    m() {
      this.t = [];
    }
  };
  function f(t, ...i) {
    for (const n of i) for (const i2 in n) void 0 !== n[i2] && Object.prototype.hasOwnProperty.call(n, i2) && !["__proto__", "constructor", "prototype"].includes(i2) && ("object" != typeof n[i2] || void 0 === t[i2] || Array.isArray(n[i2]) ? t[i2] = n[i2] : f(t[i2], n[i2]));
    return t;
  }
  function p(t) {
    return "number" == typeof t && isFinite(t);
  }
  function v(t) {
    return "number" == typeof t && t % 1 == 0;
  }
  function m(t) {
    return "string" == typeof t;
  }
  function w(t) {
    return "boolean" == typeof t;
  }
  function M(t) {
    const i = t;
    if (!i || "object" != typeof i) return i;
    let n, s, e2;
    for (s in n = Array.isArray(i) ? [] : {}, i) i.hasOwnProperty(s) && (e2 = i[s], n[s] = e2 && "object" == typeof e2 ? M(e2) : e2);
    return n;
  }
  function g(t) {
    return null !== t;
  }
  function b(t) {
    return null === t ? void 0 : t;
  }
  var S = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
  function x(t, i, n) {
    return void 0 === i && (i = S), `${n = void 0 !== n ? `${n} ` : ""}${t}px ${i}`;
  }
  var C = class {
    constructor(t) {
      this.M = { S: 1, C: 5, P: NaN, k: "", T: "", R: "", D: "", I: 0, V: 0, B: 0, A: 0, L: 0 }, this.O = t;
    }
    N() {
      const t = this.M, i = this.F(), n = this.W();
      return t.P === i && t.T === n || (t.P = i, t.T = n, t.k = x(i, n), t.A = 2.5 / 12 * i, t.I = t.A, t.V = i / 12 * t.C, t.B = i / 12 * t.C, t.L = 0), t.R = this.H(), t.D = this.U(), this.M;
    }
    H() {
      return this.O.N().layout.textColor;
    }
    U() {
      return this.O.$();
    }
    F() {
      return this.O.N().layout.fontSize;
    }
    W() {
      return this.O.N().layout.fontFamily;
    }
  };
  function y(t) {
    return t < 0 ? 0 : t > 255 ? 255 : Math.round(t) || 0;
  }
  function P(t) {
    return 0.199 * t[0] + 0.687 * t[1] + 0.114 * t[2];
  }
  var k = class {
    constructor(t, i) {
      this.j = /* @__PURE__ */ new Map(), this.q = t, i && (this.j = i);
    }
    Y(t, i) {
      if ("transparent" === t) return t;
      const n = this.K(t), s = n[3];
      return `rgba(${n[0]}, ${n[1]}, ${n[2]}, ${i * s})`;
    }
    G(t) {
      const i = this.K(t);
      return { Z: `rgb(${i[0]}, ${i[1]}, ${i[2]})`, X: P(i) > 160 ? "black" : "white" };
    }
    J(t) {
      return P(this.K(t));
    }
    tt(t, i, n) {
      const [s, e2, r2, h2] = this.K(t), [a2, l2, o2, _2] = this.K(i), u2 = [y(s + n * (a2 - s)), y(e2 + n * (l2 - e2)), y(r2 + n * (o2 - r2)), (c2 = h2 + n * (_2 - h2), c2 <= 0 || c2 > 1 ? Math.min(Math.max(c2, 0), 1) : Math.round(1e4 * c2) / 1e4)];
      var c2;
      return `rgba(${u2[0]}, ${u2[1]}, ${u2[2]}, ${u2[3]})`;
    }
    K(t) {
      const i = this.j.get(t);
      if (i) return i;
      const n = (function(t2) {
        const i2 = document.createElement("div");
        i2.style.display = "none", document.body.appendChild(i2), i2.style.color = t2;
        const n2 = window.getComputedStyle(i2).color;
        return document.body.removeChild(i2), n2;
      })(t), s = n.match(/^rgba?\s*\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)$/);
      if (!s) {
        if (this.q.length) for (const i2 of this.q) {
          const n2 = i2(t);
          if (n2) return this.j.set(t, n2), n2;
        }
        throw new Error(`Failed to parse color: ${t}`);
      }
      const e2 = [parseInt(s[1], 10), parseInt(s[2], 10), parseInt(s[3], 10), s[4] ? parseFloat(s[4]) : 1];
      return this.j.set(t, e2), e2;
    }
  };
  var T = class {
    constructor() {
      this.it = [];
    }
    nt(t) {
      this.it = t;
    }
    st(t, i, n) {
      this.it.forEach(((s) => {
        s.st(t, i, n);
      }));
    }
  };
  var R = class {
    st(t, i, n) {
      t.useBitmapCoordinateSpace(((t2) => this.et(t2, i, n)));
    }
  };
  var D = class extends R {
    constructor() {
      super(...arguments), this.rt = null;
    }
    ht(t) {
      this.rt = t;
    }
    et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
      if (null === this.rt || null === this.rt.lt) return;
      const s = this.rt.lt, e2 = this.rt, r2 = Math.max(1, Math.floor(i)) % 2 / 2, h2 = (h3) => {
        t.beginPath();
        for (let a2 = s.to - 1; a2 >= s.from; --a2) {
          const s2 = e2.ot[a2], l2 = Math.round(s2._t * i) + r2, o2 = s2.ut * n, _2 = h3 * n + r2;
          t.moveTo(l2, o2), t.arc(l2, o2, _2, 0, 2 * Math.PI);
        }
        t.fill();
      };
      e2.ct > 0 && (t.fillStyle = e2.dt, h2(e2.ft + e2.ct)), t.fillStyle = e2.vt, h2(e2.ft);
    }
  };
  function I() {
    return { ot: [{ _t: 0, ut: 0, wt: 0, Mt: 0 }], vt: "", dt: "", ft: 0, ct: 0, lt: null };
  }
  var V = { from: 0, to: 1 };
  var B = class {
    constructor(t, i, n) {
      this.gt = new T(), this.bt = [], this.St = [], this.xt = true, this.O = t, this.Ct = i, this.yt = n, this.gt.nt(this.bt);
    }
    Pt(t) {
      this.kt(), this.xt = true;
    }
    Tt() {
      return this.xt && (this.Rt(), this.xt = false), this.gt;
    }
    kt() {
      const t = this.yt.Dt();
      t.length !== this.bt.length && (this.St = t.map(I), this.bt = this.St.map(((t2) => {
        const i = new D();
        return i.ht(t2), i;
      })), this.gt.nt(this.bt));
    }
    Rt() {
      const t = 2 === this.Ct.N().mode || !this.Ct.It(), i = this.yt.Vt(), n = this.Ct.Bt(), s = this.O.Et();
      this.kt(), i.forEach(((i2, e2) => {
        const r2 = this.St[e2], h2 = i2.At(n), a2 = i2.Lt();
        !t && null !== h2 && i2.It() && null !== a2 ? (r2.vt = h2.zt, r2.ft = h2.ft, r2.ct = h2.Ot, r2.ot[0].Mt = h2.Mt, r2.ot[0].ut = i2.Ft().Nt(h2.Mt, a2.Wt), r2.dt = h2.Ht ?? this.O.Ut(r2.ot[0].ut / i2.Ft().$t()), r2.ot[0].wt = n, r2.ot[0]._t = s.jt(n), r2.lt = V) : r2.lt = null;
      }));
    }
  };
  var E = class extends R {
    constructor(t) {
      super(), this.qt = t;
    }
    et({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
      if (null === this.qt) return;
      const e2 = this.qt.Yt.It, r2 = this.qt.Kt.It;
      if (!e2 && !r2) return;
      const h2 = Math.round(this.qt._t * n), o2 = Math.round(this.qt.ut * s);
      t.lineCap = "butt", e2 && h2 >= 0 && (t.lineWidth = Math.floor(this.qt.Yt.ct * n), t.strokeStyle = this.qt.Yt.R, t.fillStyle = this.qt.Yt.R, a(t, this.qt.Yt.Gt), (function(t2, i2, n2, s2) {
        t2.beginPath();
        const e3 = t2.lineWidth % 2 ? 0.5 : 0;
        t2.moveTo(i2 + e3, n2), t2.lineTo(i2 + e3, s2), t2.stroke();
      })(t, h2, 0, i.height)), r2 && o2 >= 0 && (t.lineWidth = Math.floor(this.qt.Kt.ct * s), t.strokeStyle = this.qt.Kt.R, t.fillStyle = this.qt.Kt.R, a(t, this.qt.Kt.Gt), l(t, o2, 0, i.width));
    }
  };
  var A = class {
    constructor(t, i) {
      this.xt = true, this.Zt = { Yt: { ct: 1, Gt: 0, R: "", It: false }, Kt: { ct: 1, Gt: 0, R: "", It: false }, _t: 0, ut: 0 }, this.Xt = new E(this.Zt), this.Jt = t, this.yt = i;
    }
    Pt() {
      this.xt = true;
    }
    Tt(t) {
      return this.xt && (this.Rt(), this.xt = false), this.Xt;
    }
    Rt() {
      const t = this.Jt.It(), i = this.yt.Qt().N().crosshair, n = this.Zt;
      if (2 === i.mode) return n.Kt.It = false, void (n.Yt.It = false);
      n.Kt.It = t && this.Jt.ti(this.yt), n.Yt.It = t && this.Jt.ii(), n.Kt.ct = i.horzLine.width, n.Kt.Gt = i.horzLine.style, n.Kt.R = i.horzLine.color, n.Yt.ct = i.vertLine.width, n.Yt.Gt = i.vertLine.style, n.Yt.R = i.vertLine.color, n._t = this.Jt.ni(), n.ut = this.Jt.si();
    }
  };
  function L(t, i, n, s, e2, r2) {
    t.fillRect(i + r2, n, s - 2 * r2, r2), t.fillRect(i + r2, n + e2 - r2, s - 2 * r2, r2), t.fillRect(i, n, r2, e2), t.fillRect(i + s - r2, n, r2, e2);
  }
  function z(t, i, n, s, e2, r2) {
    t.save(), t.globalCompositeOperation = "copy", t.fillStyle = r2, t.fillRect(i, n, s, e2), t.restore();
  }
  function O(t, i, n, s, e2, r2) {
    t.beginPath(), t.roundRect ? t.roundRect(i, n, s, e2, r2) : (t.lineTo(i + s - r2[1], n), 0 !== r2[1] && t.arcTo(i + s, n, i + s, n + r2[1], r2[1]), t.lineTo(i + s, n + e2 - r2[2]), 0 !== r2[2] && t.arcTo(i + s, n + e2, i + s - r2[2], n + e2, r2[2]), t.lineTo(i + r2[3], n + e2), 0 !== r2[3] && t.arcTo(i, n + e2, i, n + e2 - r2[3], r2[3]), t.lineTo(i, n + r2[0]), 0 !== r2[0] && t.arcTo(i, n, i + r2[0], n, r2[0]));
  }
  function N(t, i, n, s, e2, r2, h2 = 0, a2 = [0, 0, 0, 0], l2 = "") {
    if (t.save(), !h2 || !l2 || l2 === r2) return O(t, i, n, s, e2, a2), t.fillStyle = r2, t.fill(), void t.restore();
    const o2 = h2 / 2;
    var _2;
    O(t, i + o2, n + o2, s - h2, e2 - h2, (_2 = -o2, a2.map(((t2) => 0 === t2 ? t2 : t2 + _2)))), "transparent" !== r2 && (t.fillStyle = r2, t.fill()), "transparent" !== l2 && (t.lineWidth = h2, t.strokeStyle = l2, t.closePath(), t.stroke()), t.restore();
  }
  function F(t, i, n, s, e2, r2, h2) {
    t.save(), t.globalCompositeOperation = "copy";
    const a2 = t.createLinearGradient(0, 0, 0, e2);
    a2.addColorStop(0, r2), a2.addColorStop(1, h2), t.fillStyle = a2, t.fillRect(i, n, s, e2), t.restore();
  }
  var W = class {
    constructor(t, i) {
      this.ht(t, i);
    }
    ht(t, i) {
      this.qt = t, this.ei = i;
    }
    $t(t, i) {
      return this.qt.It ? t.P + t.A + t.I : 0;
    }
    st(t, i, n, s) {
      if (!this.qt.It || 0 === this.qt.ri.length) return;
      const e2 = this.qt.R, r2 = this.ei.Z, h2 = t.useBitmapCoordinateSpace(((t2) => {
        const h3 = t2.context;
        h3.font = i.k;
        const a2 = this.hi(t2, i, n, s), l2 = a2.ai;
        return a2.li ? N(h3, l2.oi, l2._i, l2.ui, l2.ci, r2, l2.di, [l2.ft, 0, 0, l2.ft], r2) : N(h3, l2.fi, l2._i, l2.ui, l2.ci, r2, l2.di, [0, l2.ft, l2.ft, 0], r2), this.qt.pi && (h3.fillStyle = e2, h3.fillRect(l2.fi, l2.mi, l2.wi - l2.fi, l2.Mi)), this.qt.gi && (h3.fillStyle = i.D, h3.fillRect(a2.li ? l2.bi - l2.di : 0, l2._i, l2.di, l2.Si - l2._i)), a2;
      }));
      t.useMediaCoordinateSpace((({ context: t2 }) => {
        const n2 = h2.xi;
        t2.font = i.k, t2.textAlign = h2.li ? "right" : "left", t2.textBaseline = "middle", t2.fillStyle = e2, t2.fillText(this.qt.ri, n2.Ci, (n2._i + n2.Si) / 2 + n2.yi);
      }));
    }
    hi(t, i, n, s) {
      const { context: e2, bitmapSize: r2, mediaSize: h2, horizontalPixelRatio: a2, verticalPixelRatio: l2 } = t, o2 = this.qt.pi || !this.qt.Pi ? i.C : 0, _2 = this.qt.ki ? i.S : 0, u2 = i.A + this.ei.Ti, c2 = i.I + this.ei.Ri, d2 = i.V, f2 = i.B, p2 = this.qt.ri, v2 = i.P, m2 = n.Di(e2, p2), w2 = Math.ceil(n.Ii(e2, p2)), M2 = v2 + u2 + c2, g2 = i.S + d2 + f2 + w2 + o2, b2 = Math.max(1, Math.floor(l2));
      let S2 = Math.round(M2 * l2);
      S2 % 2 != b2 % 2 && (S2 += 1);
      const x2 = _2 > 0 ? Math.max(1, Math.floor(_2 * a2)) : 0, C2 = Math.round(g2 * a2), y2 = Math.round(o2 * a2), P2 = this.ei.Vi ?? this.ei.Bi ?? this.ei.Ei, k2 = Math.round(P2 * l2) - Math.floor(0.5 * l2), T2 = Math.floor(k2 + b2 / 2 - S2 / 2), R2 = T2 + S2, D2 = "right" === s, I2 = D2 ? h2.width - _2 : _2, V2 = D2 ? r2.width - x2 : x2;
      let B2, E2, A2;
      return D2 ? (B2 = V2 - C2, E2 = V2 - y2, A2 = I2 - o2 - d2 - _2) : (B2 = V2 + C2, E2 = V2 + y2, A2 = I2 + o2 + d2), { li: D2, ai: { _i: T2, mi: k2, Si: R2, ui: C2, ci: S2, ft: 2 * a2, di: x2, oi: B2, fi: V2, wi: E2, Mi: b2, bi: r2.width }, xi: { _i: T2 / l2, Si: R2 / l2, Ci: A2, yi: m2 } };
    }
  };
  var H = class {
    constructor(t) {
      this.Ai = { Ei: 0, Z: "#000", Ri: 0, Ti: 0 }, this.Li = { ri: "", It: false, pi: true, Pi: false, Ht: "", R: "#FFF", gi: false, ki: false }, this.zi = { ri: "", It: false, pi: false, Pi: true, Ht: "", R: "#FFF", gi: true, ki: true }, this.xt = true, this.Oi = new (t || W)(this.Li, this.Ai), this.Ni = new (t || W)(this.zi, this.Ai);
    }
    ri() {
      return this.Fi(), this.Li.ri;
    }
    Ei() {
      return this.Fi(), this.Ai.Ei;
    }
    Pt() {
      this.xt = true;
    }
    $t(t, i = false) {
      return Math.max(this.Oi.$t(t, i), this.Ni.$t(t, i));
    }
    Wi() {
      return this.Ai.Vi ?? null;
    }
    Hi() {
      return this.Ai.Vi ?? this.Ai.Bi ?? this.Ei();
    }
    Ui(t) {
      this.Ai.Bi = t ?? void 0;
    }
    $i() {
      return this.Fi(), this.Li.It || this.zi.It;
    }
    ji() {
      return this.Fi(), this.Li.It;
    }
    Tt(t) {
      return this.Fi(), this.Li.pi = this.Li.pi && t.N().ticksVisible, this.zi.pi = this.zi.pi && t.N().ticksVisible, this.Oi.ht(this.Li, this.Ai), this.Ni.ht(this.zi, this.Ai), this.Oi;
    }
    qi() {
      return this.Fi(), this.Oi.ht(this.Li, this.Ai), this.Ni.ht(this.zi, this.Ai), this.Ni;
    }
    Fi() {
      this.xt && (this.Li.pi = true, this.zi.pi = false, this.Yi(this.Li, this.zi, this.Ai));
    }
  };
  var U = class extends H {
    constructor(t, i, n) {
      super(), this.Jt = t, this.Ki = i, this.Gi = n;
    }
    Yi(t, i, n) {
      if (t.It = false, 2 === this.Jt.N().mode) return;
      const s = this.Jt.N().horzLine;
      if (!s.labelVisible) return;
      const e2 = this.Ki.Lt();
      if (!this.Jt.It() || this.Ki.Zi() || null === e2) return;
      const r2 = this.Ki.Xi().G(s.labelBackgroundColor);
      n.Z = r2.Z, t.R = r2.X;
      const h2 = 2 / 12 * this.Ki.P();
      n.Ti = h2, n.Ri = h2;
      const a2 = this.Gi(this.Ki);
      n.Ei = a2.Ei, t.ri = this.Ki.Ji(a2.Mt, e2), t.It = true;
    }
  };
  var $ = /[1-9]/g;
  var j = class {
    constructor() {
      this.qt = null;
    }
    ht(t) {
      this.qt = t;
    }
    st(t, i) {
      if (null === this.qt || false === this.qt.It || 0 === this.qt.ri.length) return;
      const n = t.useMediaCoordinateSpace((({ context: t2 }) => (t2.font = i.k, Math.round(i.Qi.Ii(t2, u(this.qt).ri, $)))));
      if (n <= 0) return;
      const s = i.tn, e2 = n + 2 * s, r2 = e2 / 2, h2 = this.qt.nn;
      let a2 = this.qt.Ei, l2 = Math.floor(a2 - r2) + 0.5;
      l2 < 0 ? (a2 += Math.abs(0 - l2), l2 = Math.floor(a2 - r2) + 0.5) : l2 + e2 > h2 && (a2 -= Math.abs(h2 - (l2 + e2)), l2 = Math.floor(a2 - r2) + 0.5);
      const o2 = l2 + e2, _2 = Math.ceil(0 + i.S + i.C + i.A + i.P + i.I);
      t.useBitmapCoordinateSpace((({ context: t2, horizontalPixelRatio: n2, verticalPixelRatio: s2 }) => {
        const e3 = u(this.qt);
        t2.fillStyle = e3.Z;
        const r3 = Math.round(l2 * n2), h3 = Math.round(0 * s2), a3 = Math.round(o2 * n2), c2 = Math.round(_2 * s2), d2 = Math.round(2 * n2);
        if (t2.beginPath(), t2.moveTo(r3, h3), t2.lineTo(r3, c2 - d2), t2.arcTo(r3, c2, r3 + d2, c2, d2), t2.lineTo(a3 - d2, c2), t2.arcTo(a3, c2, a3, c2 - d2, d2), t2.lineTo(a3, h3), t2.fill(), e3.pi) {
          const r4 = Math.round(e3.Ei * n2), a4 = h3, l3 = Math.round((a4 + i.C) * s2);
          t2.fillStyle = e3.R;
          const o3 = Math.max(1, Math.floor(n2)), _3 = Math.floor(0.5 * n2);
          t2.fillRect(r4 - _3, a4, o3, l3 - a4);
        }
      })), t.useMediaCoordinateSpace((({ context: t2 }) => {
        const n2 = u(this.qt), e3 = 0 + i.S + i.C + i.A + i.P / 2;
        t2.font = i.k, t2.textAlign = "left", t2.textBaseline = "middle", t2.fillStyle = n2.R;
        const r3 = i.Qi.Di(t2, "Apr0");
        t2.translate(l2 + s, e3 + r3), t2.fillText(n2.ri, 0, 0);
      }));
    }
  };
  var q = class {
    constructor(t, i, n) {
      this.xt = true, this.Xt = new j(), this.Zt = { It: false, Z: "#4c525e", R: "white", ri: "", nn: 0, Ei: NaN, pi: true }, this.Ct = t, this.sn = i, this.Gi = n;
    }
    Pt() {
      this.xt = true;
    }
    Tt() {
      return this.xt && (this.Rt(), this.xt = false), this.Xt.ht(this.Zt), this.Xt;
    }
    Rt() {
      const t = this.Zt;
      if (t.It = false, 2 === this.Ct.N().mode) return;
      const i = this.Ct.N().vertLine;
      if (!i.labelVisible) return;
      const n = this.sn.Et();
      if (n.Zi()) return;
      t.nn = n.nn();
      const s = this.Gi();
      if (null === s) return;
      t.Ei = s.Ei;
      const e2 = n.en(this.Ct.Bt());
      t.ri = n.rn(u(e2)), t.It = true;
      const r2 = this.sn.Xi().G(i.labelBackgroundColor);
      t.Z = r2.Z, t.R = r2.X, t.pi = n.N().ticksVisible;
    }
  };
  var Y = class {
    constructor() {
      this.hn = null, this.an = 0;
    }
    ln() {
      return this.an;
    }
    _n(t) {
      this.an = t;
    }
    Ft() {
      return this.hn;
    }
    un(t) {
      this.hn = t;
    }
    cn(t) {
      return [];
    }
    dn() {
      return [];
    }
    It() {
      return true;
    }
  };
  var K;
  !(function(t) {
    t[t.Normal = 0] = "Normal", t[t.Magnet = 1] = "Magnet", t[t.Hidden = 2] = "Hidden", t[t.MagnetOHLC = 3] = "MagnetOHLC";
  })(K || (K = {}));
  var G = class extends Y {
    constructor(t, i) {
      super(), this.yt = null, this.fn = NaN, this.pn = 0, this.vn = false, this.mn = /* @__PURE__ */ new Map(), this.wn = false, this.Mn = /* @__PURE__ */ new WeakMap(), this.gn = /* @__PURE__ */ new WeakMap(), this.bn = NaN, this.Sn = NaN, this.xn = NaN, this.Cn = NaN, this.sn = t, this.yn = i;
      this.Pn = /* @__PURE__ */ ((t2, i2) => (n2) => {
        const s = i2(), e2 = t2();
        if (n2 === u(this.yt).kn()) return { Mt: e2, Ei: s };
        {
          const t3 = u(n2.Lt());
          return { Mt: n2.Tn(s, t3), Ei: s };
        }
      })((() => this.fn), (() => this.Sn));
      const n = /* @__PURE__ */ ((t2, i2) => () => {
        const n2 = this.sn.Et().Rn(t2()), s = i2();
        return n2 && Number.isFinite(s) ? { wt: n2, Ei: s } : null;
      })((() => this.pn), (() => this.ni()));
      this.Dn = new q(this, t, n);
    }
    N() {
      return this.yn;
    }
    In(t, i) {
      this.xn = t, this.Cn = i;
    }
    Vn() {
      this.xn = NaN, this.Cn = NaN;
    }
    Bn() {
      return this.xn;
    }
    En() {
      return this.Cn;
    }
    An(t, i, n) {
      this.wn || (this.wn = true), this.vn = true, this.Ln(t, i, n);
    }
    Bt() {
      return this.pn;
    }
    ni() {
      return this.bn;
    }
    si() {
      return this.Sn;
    }
    It() {
      return this.vn;
    }
    zn() {
      this.vn = false, this.On(), this.fn = NaN, this.bn = NaN, this.Sn = NaN, this.yt = null, this.Vn(), this.Nn();
    }
    Fn(t) {
      if (!this.yn.doNotSnapToHiddenSeriesIndices) return t;
      const i = this.sn, n = i.Et();
      let s = null, e2 = null;
      for (const n2 of i.Wn()) {
        const i2 = n2.Un().Hn(t, -1);
        if (i2) {
          if (i2.$n === t) return t;
          (null === s || i2.$n > s) && (s = i2.$n);
        }
        const r3 = n2.Un().Hn(t, 1);
        if (r3) {
          if (r3.$n === t) return t;
          (null === e2 || r3.$n < e2) && (e2 = r3.$n);
        }
      }
      const r2 = [s, e2].filter(g);
      if (0 === r2.length) return t;
      const h2 = n.jt(t), a2 = r2.map(((t2) => Math.abs(h2 - n.jt(t2))));
      return r2[a2.indexOf(Math.min(...a2))];
    }
    jn(t) {
      let i = this.Mn.get(t);
      i || (i = new A(this, t), this.Mn.set(t, i));
      let n = this.gn.get(t);
      return n || (n = new B(this.sn, this, t), this.gn.set(t, n)), [i, n];
    }
    ti(t) {
      return t === this.yt && this.yn.horzLine.visible;
    }
    ii() {
      return this.yn.vertLine.visible;
    }
    qn(t, i) {
      this.vn && this.yt === t || this.mn.clear();
      const n = [];
      return this.yt === t && n.push(this.Yn(this.mn, i, this.Pn)), n;
    }
    dn() {
      return this.vn ? [this.Dn] : [];
    }
    Kn() {
      return this.yt;
    }
    Nn() {
      this.sn.Gn().forEach(((t) => {
        this.Mn.get(t)?.Pt(), this.gn.get(t)?.Pt();
      })), this.mn.forEach(((t) => t.Pt())), this.Dn.Pt();
    }
    Zn(t) {
      return t && !t.kn().Zi() ? t.kn() : null;
    }
    Ln(t, i, n) {
      this.Xn(t, i, n) && this.Nn();
    }
    Xn(t, i, n) {
      const s = this.bn, e2 = this.Sn, r2 = this.fn, h2 = this.pn, a2 = this.yt, l2 = this.Zn(n);
      this.pn = t, this.bn = isNaN(t) ? NaN : this.sn.Et().jt(t), this.yt = n;
      const o2 = null !== l2 ? l2.Lt() : null;
      return null !== l2 && null !== o2 ? (this.fn = i, this.Sn = l2.Nt(i, o2)) : (this.fn = NaN, this.Sn = NaN), s !== this.bn || e2 !== this.Sn || h2 !== this.pn || r2 !== this.fn || a2 !== this.yt;
    }
    On() {
      const t = this.sn.Jn().map(((t2) => t2.Un().Qn())).filter(g), i = 0 === t.length ? null : Math.max(...t);
      this.pn = null !== i ? i : NaN;
    }
    Yn(t, i, n) {
      let s = t.get(i);
      return void 0 === s && (s = new U(this, i, n), t.set(i, s)), s;
    }
  };
  function Z(t) {
    return "left" === t || "right" === t;
  }
  var X = class _X {
    constructor(t) {
      this.ts = /* @__PURE__ */ new Map(), this.ns = [], this.ss = t;
    }
    es(t, i) {
      const n = (function(t2, i2) {
        return void 0 === t2 ? i2 : { rs: Math.max(t2.rs, i2.rs), hs: t2.hs || i2.hs };
      })(this.ts.get(t), i);
      this.ts.set(t, n);
    }
    ls() {
      return this.ss;
    }
    _s(t) {
      const i = this.ts.get(t);
      return void 0 === i ? { rs: this.ss } : { rs: Math.max(this.ss, i.rs), hs: i.hs };
    }
    us() {
      this.cs(), this.ns = [{ ds: 0 }];
    }
    fs(t) {
      this.cs(), this.ns = [{ ds: 1, Wt: t }];
    }
    ps(t) {
      this.vs(), this.ns.push({ ds: 5, Wt: t });
    }
    cs() {
      this.vs(), this.ns.push({ ds: 6 });
    }
    ws() {
      this.cs(), this.ns = [{ ds: 4 }];
    }
    Ms(t) {
      this.cs(), this.ns.push({ ds: 2, Wt: t });
    }
    gs(t) {
      this.cs(), this.ns.push({ ds: 3, Wt: t });
    }
    bs() {
      return this.ns;
    }
    Ss(t) {
      for (const i of t.ns) this.xs(i);
      this.ss = Math.max(this.ss, t.ss), t.ts.forEach(((t2, i) => {
        this.es(i, t2);
      }));
    }
    static Cs() {
      return new _X(2);
    }
    static ys() {
      return new _X(3);
    }
    xs(t) {
      switch (t.ds) {
        case 0:
          this.us();
          break;
        case 1:
          this.fs(t.Wt);
          break;
        case 2:
          this.Ms(t.Wt);
          break;
        case 3:
          this.gs(t.Wt);
          break;
        case 4:
          this.ws();
          break;
        case 5:
          this.ps(t.Wt);
          break;
        case 6:
          this.vs();
      }
    }
    vs() {
      const t = this.ns.findIndex(((t2) => 5 === t2.ds));
      -1 !== t && this.ns.splice(t, 1);
    }
  };
  var J = class {
    formatTickmarks(t) {
      return t.map(((t2) => this.format(t2)));
    }
  };
  var Q = ".";
  function tt(t, i) {
    if (!p(t)) return "n/a";
    if (!v(i)) throw new TypeError("invalid length");
    if (i < 0 || i > 16) throw new TypeError("invalid length");
    if (0 === i) return t.toString();
    return ("0000000000000000" + t.toString()).slice(-i);
  }
  var it = class extends J {
    constructor(t, i) {
      if (super(), i || (i = 1), p(t) && v(t) || (t = 100), t < 0) throw new TypeError("invalid base");
      this.Ki = t, this.Ps = i, this.ks();
    }
    format(t) {
      const i = t < 0 ? "\u2212" : "";
      return t = Math.abs(t), i + this.Ts(t);
    }
    ks() {
      if (this.Rs = 0, this.Ki > 0 && this.Ps > 0) {
        let t = this.Ki;
        for (; t > 1; ) t /= 10, this.Rs++;
      }
    }
    Ts(t) {
      const i = this.Ki / this.Ps;
      let n = Math.floor(t), s = "";
      const e2 = void 0 !== this.Rs ? this.Rs : NaN;
      if (i > 1) {
        let r2 = +(Math.round(t * i) - n * i).toFixed(this.Rs);
        r2 >= i && (r2 -= i, n += 1), s = Q + tt(+r2.toFixed(this.Rs) * this.Ps, e2);
      } else n = Math.round(n * i) / i, e2 > 0 && (s = Q + tt(0, e2));
      return n.toFixed(0) + s;
    }
  };
  var nt = class extends it {
    constructor(t = 100) {
      super(t);
    }
    format(t) {
      return `${super.format(t)}%`;
    }
  };
  var st = class extends J {
    constructor(t) {
      super(), this.Ds = t;
    }
    format(t) {
      let i = "";
      return t < 0 && (i = "-", t = -t), t < 995 ? i + this.Is(t) : t < 999995 ? i + this.Is(t / 1e3) + "K" : t < 999999995 ? (t = 1e3 * Math.round(t / 1e3), i + this.Is(t / 1e6) + "M") : (t = 1e6 * Math.round(t / 1e6), i + this.Is(t / 1e9) + "B");
    }
    Is(t) {
      let i;
      const n = Math.pow(10, this.Ds);
      return i = (t = Math.round(t * n) / n) >= 1e-15 && t < 1 ? t.toFixed(this.Ds).replace(/\.?0+$/, "") : String(t), i.replace(/(\.[1-9]*)0+$/, ((t2, i2) => i2));
    }
  };
  var et = /[2-9]/g;
  var rt = class {
    constructor(t = 50) {
      this.Vs = 0, this.Bs = 1, this.Es = 1, this.As = {}, this.Ls = /* @__PURE__ */ new Map(), this.zs = t;
    }
    Os() {
      this.Vs = 0, this.Ls.clear(), this.Bs = 1, this.Es = 1, this.As = {};
    }
    Ii(t, i, n) {
      return this.Ns(t, i, n).width;
    }
    Di(t, i, n) {
      const s = this.Ns(t, i, n);
      return ((s.actualBoundingBoxAscent || 0) - (s.actualBoundingBoxDescent || 0)) / 2;
    }
    Ns(t, i, n) {
      const s = n || et, e2 = String(i).replace(s, "0");
      if (this.Ls.has(e2)) return _(this.Ls.get(e2)).Fs;
      if (this.Vs === this.zs) {
        const t2 = this.As[this.Es];
        delete this.As[this.Es], this.Ls.delete(t2), this.Es++, this.Vs--;
      }
      t.save(), t.textBaseline = "middle";
      const r2 = t.measureText(e2);
      return t.restore(), 0 === r2.width && i.length || (this.Ls.set(e2, { Fs: r2, Ws: this.Bs }), this.As[this.Bs] = e2, this.Vs++, this.Bs++), r2;
    }
  };
  var ht = class {
    constructor(t) {
      this.Hs = null, this.M = null, this.Us = "right", this.$s = t;
    }
    js(t, i, n) {
      this.Hs = t, this.M = i, this.Us = n;
    }
    st(t) {
      null !== this.M && null !== this.Hs && this.Hs.st(t, this.M, this.$s, this.Us);
    }
  };
  var at = class {
    constructor(t, i, n) {
      this.qs = t, this.$s = new rt(50), this.Ys = i, this.O = n, this.F = -1, this.Xt = new ht(this.$s);
    }
    Tt() {
      const t = this.O.Ks(this.Ys);
      if (null === t) return null;
      const i = t.Gs(this.Ys) ? t.Zs() : this.Ys.Ft();
      if (null === i) return null;
      const n = t.Xs(i);
      if ("overlay" === n) return null;
      const s = this.O.Js();
      return s.P !== this.F && (this.F = s.P, this.$s.Os()), this.Xt.js(this.qs.qi(), s, n), this.Xt;
    }
  };
  var lt = class extends R {
    constructor() {
      super(...arguments), this.qt = null;
    }
    ht(t) {
      this.qt = t;
    }
    Qs(t, i) {
      if (!this.qt?.It) return null;
      const { ut: n, ct: s, te: e2 } = this.qt;
      return i >= n - s - 7 && i <= n + s + 7 ? { ie: this.qt, ne: Math.abs(i - n), se: 2, ee: "price-line", te: e2 } : null;
    }
    et({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
      if (null === this.qt) return;
      if (false === this.qt.It) return;
      const e2 = Math.round(this.qt.ut * s);
      e2 < 0 || e2 > i.height || (t.lineCap = "butt", t.strokeStyle = this.qt.R, t.lineWidth = Math.floor(this.qt.ct * n), a(t, this.qt.Gt), l(t, e2, 0, i.width));
    }
  };
  var ot = class {
    constructor(t) {
      this.re = { ut: 0, R: "rgba(0, 0, 0, 0)", ct: 1, Gt: 0, It: false }, this.he = new lt(), this.xt = true, this.ae = t, this.le = t.Qt(), this.he.ht(this.re);
    }
    Pt() {
      this.xt = true;
    }
    Tt() {
      return this.ae.It() ? (this.xt && (this.oe(), this.xt = false), this.he) : null;
    }
  };
  var _t = class extends ot {
    constructor(t) {
      super(t);
    }
    oe() {
      this.re.It = false;
      const t = this.ae.Ft(), i = t._e()._e;
      if (2 !== i && 3 !== i) return;
      const n = this.ae.N();
      if (!n.baseLineVisible || !this.ae.It()) return;
      const s = this.ae.Lt();
      null !== s && (this.re.It = true, this.re.ut = t.Nt(s.Wt, s.Wt), this.re.R = n.baseLineColor, this.re.ct = n.baseLineWidth, this.re.Gt = n.baseLineStyle);
    }
  };
  var ut = class extends R {
    constructor() {
      super(...arguments), this.qt = null;
    }
    ht(t) {
      this.qt = t;
    }
    ue() {
      return this.qt;
    }
    et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
      const s = this.qt;
      if (null === s) return;
      const e2 = Math.max(1, Math.floor(i)), r2 = e2 % 2 / 2, h2 = Math.round(s.ce.x * i) + r2, a2 = s.ce.y * n;
      t.fillStyle = s.de, t.beginPath();
      const l2 = Math.max(2, 1.5 * s.fe) * i;
      t.arc(h2, a2, l2, 0, 2 * Math.PI, false), t.fill(), t.fillStyle = s.pe, t.beginPath(), t.arc(h2, a2, s.ft * i, 0, 2 * Math.PI, false), t.fill(), t.lineWidth = e2, t.strokeStyle = s.ve, t.beginPath(), t.arc(h2, a2, s.ft * i + e2 / 2, 0, 2 * Math.PI, false), t.stroke();
    }
  };
  var ct = [{ me: 0, we: 0.25, Me: 4, ge: 10, be: 0.25, Se: 0, xe: 0.4, Ce: 0.8 }, { me: 0.25, we: 0.525, Me: 10, ge: 14, be: 0, Se: 0, xe: 0.8, Ce: 0 }, { me: 0.525, we: 1, Me: 14, ge: 14, be: 0, Se: 0, xe: 0, Ce: 0 }];
  var dt = class {
    constructor(t) {
      this.Xt = new ut(), this.xt = true, this.ye = true, this.Pe = performance.now(), this.ke = this.Pe - 1, this.Te = t;
    }
    Re() {
      this.ke = this.Pe - 1, this.Pt();
    }
    De() {
      if (this.Pt(), 2 === this.Te.N().lastPriceAnimation) {
        const t = performance.now(), i = this.ke - t;
        if (i > 0) return void (i < 650 && (this.ke += 2600));
        this.Pe = t, this.ke = t + 2600;
      }
    }
    Pt() {
      this.xt = true;
    }
    Ie() {
      this.ye = true;
    }
    It() {
      return 0 !== this.Te.N().lastPriceAnimation;
    }
    Ve() {
      switch (this.Te.N().lastPriceAnimation) {
        case 0:
          return false;
        case 1:
          return true;
        case 2:
          return performance.now() <= this.ke;
      }
    }
    Tt() {
      return this.xt ? (this.Rt(), this.xt = false, this.ye = false) : this.ye && (this.Be(), this.ye = false), this.Xt;
    }
    Rt() {
      this.Xt.ht(null);
      const t = this.Te.Qt().Et(), i = t.Ee(), n = this.Te.Lt();
      if (null === i || null === n) return;
      const s = this.Te.Ae(true);
      if (s.Le || !i.ze(s.$n)) return;
      const e2 = { x: t.jt(s.$n), y: this.Te.Ft().Nt(s.Mt, n.Wt) }, r2 = s.R, h2 = this.Te.N().lineWidth, a2 = this.Oe(this.Ne(), r2);
      this.Xt.ht({ de: r2, fe: h2, pe: a2.pe, ve: a2.ve, ft: a2.ft, ce: e2 });
    }
    Be() {
      const t = this.Xt.ue();
      if (null !== t) {
        const i = this.Oe(this.Ne(), t.de);
        t.pe = i.pe, t.ve = i.ve, t.ft = i.ft;
      }
    }
    Ne() {
      return this.Ve() ? performance.now() - this.Pe : 2599;
    }
    Fe(t, i, n, s) {
      const e2 = n + (s - n) * i;
      return this.Te.Qt().Xi().Y(t, e2);
    }
    Oe(t, i) {
      const n = t % 2600 / 2600;
      let s;
      for (const t2 of ct) if (n >= t2.me && n <= t2.we) {
        s = t2;
        break;
      }
      o(void 0 !== s, "Last price animation internal logic error");
      const e2 = (n - s.me) / (s.we - s.me);
      return { pe: this.Fe(i, e2, s.be, s.Se), ve: this.Fe(i, e2, s.xe, s.Ce), ft: (r2 = e2, h2 = s.Me, a2 = s.ge, h2 + (a2 - h2) * r2) };
      var r2, h2, a2;
    }
  };
  var ft = class extends ot {
    constructor(t) {
      super(t);
    }
    oe() {
      const t = this.re;
      t.It = false;
      const i = this.ae.N();
      if (!i.priceLineVisible || !this.ae.It()) return;
      const n = this.ae.Ae(0 === i.priceLineSource);
      n.Le || (t.It = true, t.ut = n.Ei, t.R = this.ae.We(n.R), t.ct = i.priceLineWidth, t.Gt = i.priceLineStyle);
    }
  };
  var pt = class extends H {
    constructor(t) {
      super(), this.Jt = t;
    }
    Yi(t, i, n) {
      t.It = false, i.It = false;
      const s = this.Jt;
      if (!s.It()) return;
      const e2 = s.N(), r2 = e2.lastValueVisible, h2 = "" !== s.He(), a2 = 0 === e2.seriesLastValueMode, l2 = s.Ae(false);
      if (l2.Le) return;
      r2 && (t.ri = this.Ue(l2, r2, a2), t.It = 0 !== t.ri.length), (h2 || a2) && (i.ri = this.$e(l2, r2, h2, a2), i.It = i.ri.length > 0);
      const o2 = s.We(l2.R), _2 = this.Jt.Qt().Xi().G(o2);
      n.Z = _2.Z, n.Ei = l2.Ei, i.Ht = s.Qt().Ut(l2.Ei / s.Ft().$t()), t.Ht = o2, t.R = _2.X, i.R = _2.X;
    }
    $e(t, i, n, s) {
      let e2 = "";
      const r2 = this.Jt.He();
      return n && 0 !== r2.length && (e2 += `${r2} `), i && s && (e2 += this.Jt.Ft().je() ? t.qe : t.Ye), e2.trim();
    }
    Ue(t, i, n) {
      return i ? n ? this.Jt.Ft().je() ? t.Ye : t.qe : t.ri : "";
    }
  };
  function vt(t, i, n, s) {
    const e2 = Number.isFinite(i), r2 = Number.isFinite(n);
    return e2 && r2 ? t(i, n) : e2 || r2 ? e2 ? i : n : s;
  }
  var mt = class _mt {
    constructor(t, i) {
      this.Ke = t, this.Ge = i;
    }
    Ze(t) {
      return null !== t && (this.Ke === t.Ke && this.Ge === t.Ge);
    }
    Xe() {
      return new _mt(this.Ke, this.Ge);
    }
    Je() {
      return this.Ke;
    }
    Qe() {
      return this.Ge;
    }
    tr() {
      return this.Ge - this.Ke;
    }
    Zi() {
      return this.Ge === this.Ke || Number.isNaN(this.Ge) || Number.isNaN(this.Ke);
    }
    Ss(t) {
      return null === t ? this : new _mt(vt(Math.min, this.Je(), t.Je(), -1 / 0), vt(Math.max, this.Qe(), t.Qe(), 1 / 0));
    }
    ir(t) {
      if (!p(t)) return;
      if (0 === this.Ge - this.Ke) return;
      const i = 0.5 * (this.Ge + this.Ke);
      let n = this.Ge - i, s = this.Ke - i;
      n *= t, s *= t, this.Ge = i + n, this.Ke = i + s;
    }
    nr(t) {
      p(t) && (this.Ge += t, this.Ke += t);
    }
    sr() {
      return { minValue: this.Ke, maxValue: this.Ge };
    }
    static er(t) {
      return null === t ? null : new _mt(t.minValue, t.maxValue);
    }
  };
  var wt = class _wt {
    constructor(t, i) {
      this.rr = t, this.hr = i || null;
    }
    ar() {
      return this.rr;
    }
    lr() {
      return this.hr;
    }
    sr() {
      return { priceRange: null === this.rr ? null : this.rr.sr(), margins: this.hr || void 0 };
    }
    static er(t) {
      return null === t ? null : new _wt(mt.er(t.priceRange), t.margins);
    }
  };
  var Mt = [2, 4, 8, 16, 32, 64, 128, 256, 512];
  var gt = "Custom series with conflation reducer must have a priceValueBuilder method";
  var bt = class extends ot {
    constructor(t, i) {
      super(t), this._r = i;
    }
    oe() {
      const t = this.re;
      t.It = false;
      const i = this._r.N();
      if (!this.ae.It() || !i.lineVisible) return;
      const n = this._r.ur();
      null !== n && (t.It = true, t.ut = n, t.R = i.color, t.ct = i.lineWidth, t.Gt = i.lineStyle, t.te = this._r.N().id);
    }
  };
  var St = class extends H {
    constructor(t, i) {
      super(), this.Te = t, this._r = i;
    }
    Yi(t, i, n) {
      t.It = false, i.It = false;
      const s = this._r.N(), e2 = s.axisLabelVisible, r2 = "" !== s.title, h2 = this.Te;
      if (!e2 || !h2.It()) return;
      const a2 = this._r.ur();
      if (null === a2) return;
      r2 && (i.ri = s.title, i.It = true), i.Ht = h2.Qt().Ut(a2 / h2.Ft().$t()), t.ri = this.cr(s.price), t.It = true;
      const l2 = this.Te.Qt().Xi().G(s.axisLabelColor || s.color);
      n.Z = l2.Z;
      const o2 = s.axisLabelTextColor || l2.X;
      t.R = o2, i.R = o2, n.Ei = a2;
    }
    cr(t) {
      const i = this.Te.Lt();
      return null === i ? "" : this.Te.Ft().Ji(t, i.Wt);
    }
  };
  var xt = class {
    constructor(t, i) {
      this.Te = t, this.yn = i, this.dr = new bt(t, this), this.qs = new St(t, this), this.pr = new at(this.qs, t, t.Qt());
    }
    vr(t) {
      f(this.yn, t), this.Pt(), this.Te.Qt().mr();
    }
    N() {
      return this.yn;
    }
    wr() {
      return this.dr;
    }
    Mr() {
      return this.pr;
    }
    gr() {
      return this.qs;
    }
    Pt() {
      this.dr.Pt(), this.qs.Pt();
    }
    ur() {
      const t = this.Te, i = t.Ft();
      if (t.Qt().Et().Zi() || i.Zi()) return null;
      const n = t.Lt();
      return null === n ? null : i.Nt(this.yn.price, n.Wt);
    }
  };
  var Ct = class {
    constructor() {
      this.br = /* @__PURE__ */ new WeakMap();
    }
    Sr(t, i, n) {
      const s = 1 / i * n;
      if (t >= s) return 1;
      const e2 = s / t, r2 = Math.pow(2, Math.floor(Math.log2(e2)));
      return Math.min(r2, 512);
    }
    Cr(t, i, n, s = false, e2) {
      if (0 === t.length || i <= 1) return t;
      const r2 = this.yr(i);
      if (r2 <= 1) return t;
      const h2 = this.Pr(t);
      let a2 = h2.kr.get(r2);
      return void 0 !== a2 || (a2 = this.Tr(t, r2, n, s, e2, h2.kr), h2.kr.set(r2, a2)), a2;
    }
    Rr(t, i, n, s, e2 = false, r2) {
      if (n < 1 || 0 === t.length) return t;
      const h2 = this.Pr(t), a2 = h2.kr.get(n);
      if (!a2) return this.Cr(t, n, s, e2, r2);
      const l2 = this.Dr(t, i, n, a2, e2, s, r2);
      return h2.kr.set(n, l2), l2;
    }
    yr(t) {
      if (t <= 2) return 2;
      for (const i of Mt) if (t <= i) return i;
      return 512;
    }
    Ir(t) {
      if (0 === t.length) return 0;
      const i = t[0], n = t[t.length - 1];
      return 31 * t.length + 17 * i.$n + 13 * n.$n;
    }
    Tr(t, i, n, s = false, e2, r2 = /* @__PURE__ */ new Map()) {
      if (2 === i) return this.Vr(t, 2, n, s, e2);
      const h2 = i / 2;
      let a2 = r2.get(h2);
      return a2 || (a2 = this.Tr(t, h2, n, s, e2, r2), r2.set(h2, a2)), this.Br(a2, n, s, e2);
    }
    Vr(t, i, n, s = false, e2) {
      const r2 = this.Er(t, i, n, s, e2);
      return this.Ar(r2, s);
    }
    Br(t, i, n = false, s) {
      const e2 = this.Er(t, 2, i, n, s);
      return this.Ar(e2, n);
    }
    Er(t, i, n, s = false, e2) {
      const r2 = [];
      for (let h2 = 0; h2 < t.length; h2 += i) {
        if (t.length - h2 >= i) {
          const i2 = this.Lr(t[h2], t[h2 + 1], n, s, e2);
          i2.zr = false, r2.push(i2);
        } else if (0 === r2.length) r2.push(this.Or(t[h2], true));
        else {
          const i2 = r2[r2.length - 1];
          r2[r2.length - 1] = this.Nr(i2, t[h2], n, s, e2);
        }
      }
      return r2;
    }
    Fr(t, i) {
      return (t ?? 1) + (i ?? 1);
    }
    Lr(t, i, n, s = false, e2) {
      if (!s || !n || !e2) {
        const n2 = t.Wt[1] > i.Wt[1] ? t.Wt[1] : i.Wt[1], s2 = t.Wt[2] < i.Wt[2] ? t.Wt[2] : i.Wt[2];
        return { Wr: t.$n, Hr: i.$n, Ur: t.wt, $r: i.wt, jr: t.Wt[0], qr: n2, Yr: s2, Kr: i.Wt[3], Gr: this.Fr(t.Gr, i.Gr), Zr: void 0, zr: false };
      }
      const r2 = n(this.Xr(t, e2), this.Xr(i, e2)), h2 = e2(r2), a2 = h2.length ? h2[h2.length - 1] : 0;
      return { Wr: t.$n, Hr: i.$n, Ur: t.wt, $r: i.wt, jr: t.Wt[0], qr: Math.max(t.Wt[1], a2), Yr: Math.min(t.Wt[2], a2), Kr: a2, Gr: this.Fr(t.Gr, i.Gr), Zr: r2, zr: false };
    }
    Nr(t, i, n, s = false, e2) {
      if (!s || !n || !e2) return { Wr: t.Wr, Hr: i.$n, Ur: t.Ur, $r: i.wt, jr: t.jr, qr: t.qr > i.Wt[1] ? t.qr : i.Wt[1], Yr: t.Yr < i.Wt[2] ? t.Yr : i.Wt[2], Kr: i.Wt[3], Gr: t.Gr + (i.Gr ?? 1), Zr: t.Zr, zr: false };
      const r2 = t.Zr, h2 = this.Xr(i, e2), a2 = r2 ? { data: r2, index: t.Wr, originalTime: t.Ur, time: t.Ur, priceValues: e2(r2) } : null, l2 = a2 ? n(a2, h2) : h2.data, o2 = a2 ? e2(l2) : h2.priceValues, _2 = o2.length ? o2[o2.length - 1] : 0;
      return { Wr: t.Wr, Hr: i.$n, Ur: t.Ur, $r: i.wt, jr: t.jr, qr: Math.max(t.qr, _2), Yr: Math.min(t.Yr, _2), Kr: _2, Gr: t.Gr + (i.Gr ?? 1), Zr: l2, zr: false };
    }
    Jr(t, i, n, s, e2, r2, h2 = false, a2) {
      const l2 = i === s ? e2 : t[i];
      if (n - i == 1) return this.Or(l2, true);
      const o2 = i + 1 === s ? e2 : t[i + 1];
      let _2 = this.Lr(l2, o2, r2, h2, a2);
      for (let l3 = i + 2; l3 < n; l3++) {
        const i2 = l3 === s ? e2 : t[l3];
        _2 = this.Nr(_2, i2, r2, h2, a2);
      }
      return _2;
    }
    Xr(t, i) {
      const n = t.ue ?? {};
      return { data: t.ue, index: t.$n, originalTime: t.Qr, time: t.wt, priceValues: i(n) };
    }
    th(t, i = false) {
      const n = true === i, s = !!t.Zr;
      return { ...{ $n: t.Wr, wt: t.Ur, Qr: t.Ur, Wt: [n ? t.Kr : t.jr, t.qr, t.Yr, t.Kr], Gr: t.Gr }, ue: n ? s ? t.Zr : { wt: t.Ur } : void 0 };
    }
    Ar(t, i = false) {
      return t.map(((t2) => this.th(t2, i)));
    }
    Dr(t, i, n, s, e2 = false, r2, h2) {
      if (0 === s.length) return s;
      const a2 = t.length - 1, l2 = Math.floor(a2 / n) * n;
      if (Math.min(l2 + n, t.length) - l2 < n && t.length > n) {
        const s2 = t.slice();
        return s2[s2.length - 1] = i, this.Cr(s2, n, r2, e2, h2);
      }
      if (Math.floor((a2 - 1) / n) === Math.floor(a2 / n) || 1 === s.length) {
        const o2 = Math.min(l2 + n, t.length), _2 = o2 - l2;
        if (_2 <= 0) return s;
        const u2 = 1 === _2 ? this.Or(l2 === a2 ? i : t[l2], true) : this.Jr(t, l2, o2, a2, i, r2, e2, h2);
        return s[s.length - 1] = this.th(u2, e2), s;
      }
      {
        const s2 = t.slice();
        return s2[s2.length - 1] = i, this.Cr(s2, n, r2, e2, h2);
      }
    }
    Or(t, i = false) {
      return { Wr: t.$n, Hr: t.$n, Ur: t.wt, $r: t.wt, jr: t.Wt[0], qr: t.Wt[1], Yr: t.Wt[2], Kr: t.Wt[3], Gr: t.Gr ?? 1, Zr: t.ue, zr: i };
    }
    Pr(t) {
      const i = this.ih(t), n = this.Ir(t);
      return i.nh !== n && (i.kr.clear(), i.nh = n), i;
    }
    ih(t) {
      let i = this.br.get(t);
      return void 0 === i && (i = { nh: this.Ir(t), kr: /* @__PURE__ */ new Map() }, this.br.set(t, i)), i;
    }
  };
  var yt = class extends Y {
    constructor(t) {
      super(), this.sn = t;
    }
    Qt() {
      return this.sn;
    }
  };
  var Pt = { Bar: (t, i, n, s) => {
    const e2 = i.upColor, r2 = i.downColor, h2 = u(t(n, s)), a2 = c(h2.Wt[0]) <= c(h2.Wt[3]);
    return { sh: h2.R ?? (a2 ? e2 : r2) };
  }, Candlestick: (t, i, n, s) => {
    const e2 = i.upColor, r2 = i.downColor, h2 = i.borderUpColor, a2 = i.borderDownColor, l2 = i.wickUpColor, o2 = i.wickDownColor, _2 = u(t(n, s)), d2 = c(_2.Wt[0]) <= c(_2.Wt[3]);
    return { sh: _2.R ?? (d2 ? e2 : r2), eh: _2.Ht ?? (d2 ? h2 : a2), rh: _2.hh ?? (d2 ? l2 : o2) };
  }, Custom: (t, i, n, s) => ({ sh: u(t(n, s)).R ?? i.color }), Area: (t, i, n, s) => {
    const e2 = u(t(n, s));
    return { sh: e2.vt ?? i.lineColor, vt: e2.vt ?? i.lineColor, ah: e2.ah ?? i.topColor, oh: e2.oh ?? i.bottomColor };
  }, Baseline: (t, i, n, s) => {
    const e2 = u(t(n, s));
    return { sh: e2.Wt[3] >= i.baseValue.price ? i.topLineColor : i.bottomLineColor, _h: e2._h ?? i.topLineColor, uh: e2.uh ?? i.bottomLineColor, dh: e2.dh ?? i.topFillColor1, fh: e2.fh ?? i.topFillColor2, ph: e2.ph ?? i.bottomFillColor1, mh: e2.mh ?? i.bottomFillColor2 };
  }, Line: (t, i, n, s) => {
    const e2 = u(t(n, s));
    return { sh: e2.R ?? i.color, vt: e2.R ?? i.color };
  }, Histogram: (t, i, n, s) => ({ sh: u(t(n, s)).R ?? i.color }) };
  var kt = class {
    constructor(t) {
      this.wh = (t2, i) => void 0 !== i ? i.Wt : this.Te.Un().Mh(t2), this.Te = t, this.gh = Pt[t.bh()];
    }
    Sh(t, i) {
      return this.gh(this.wh, this.Te.N(), t, i);
    }
  };
  function Tt(t, i, n, s, e2 = 0, r2 = i.length) {
    let h2 = r2 - e2;
    for (; 0 < h2; ) {
      const r3 = h2 >> 1, a2 = e2 + r3;
      s(i[a2], n) === t ? (e2 = a2 + 1, h2 -= r3 + 1) : h2 = r3;
    }
    return e2;
  }
  var Rt = Tt.bind(null, true);
  var Dt = Tt.bind(null, false);
  var It;
  !(function(t) {
    t[t.NearestLeft = -1] = "NearestLeft", t[t.None = 0] = "None", t[t.NearestRight = 1] = "NearestRight";
  })(It || (It = {}));
  var Vt = 30;
  var Bt = class {
    constructor() {
      this.xh = [], this.Ch = /* @__PURE__ */ new Map(), this.yh = /* @__PURE__ */ new Map(), this.Ph = [];
    }
    kh() {
      return this.Th() > 0 ? this.xh[this.xh.length - 1] : null;
    }
    Rh() {
      return this.Th() > 0 ? this.Dh(0) : null;
    }
    Qn() {
      return this.Th() > 0 ? this.Dh(this.xh.length - 1) : null;
    }
    Th() {
      return this.xh.length;
    }
    Zi() {
      return 0 === this.Th();
    }
    ze(t) {
      return null !== this.Ih(t, 0);
    }
    Mh(t) {
      return this.Hn(t);
    }
    Hn(t, i = 0) {
      const n = this.Ih(t, i);
      return null === n ? null : { ...this.Vh(n), $n: this.Dh(n) };
    }
    Bh() {
      return this.xh;
    }
    Eh(t, i, n) {
      if (this.Zi()) return null;
      let s = null;
      for (const e2 of n) {
        s = Et(s, this.Ah(t, i, e2));
      }
      return s;
    }
    ht(t) {
      this.yh.clear(), this.Ch.clear(), this.xh = t, this.Ph = t.map(((t2) => t2.$n));
    }
    Lh() {
      return this.Ph;
    }
    Dh(t) {
      return this.xh[t].$n;
    }
    Vh(t) {
      return this.xh[t];
    }
    Ih(t, i) {
      const n = this.zh(t);
      if (null === n && 0 !== i) switch (i) {
        case -1:
          return this.Oh(t);
        case 1:
          return this.Nh(t);
        default:
          throw new TypeError("Unknown search mode");
      }
      return n;
    }
    Oh(t) {
      let i = this.Fh(t);
      return i > 0 && (i -= 1), i !== this.xh.length && this.Dh(i) < t ? i : null;
    }
    Nh(t) {
      const i = this.Wh(t);
      return i !== this.xh.length && t < this.Dh(i) ? i : null;
    }
    zh(t) {
      const i = this.Fh(t);
      return i === this.xh.length || t < this.xh[i].$n ? null : i;
    }
    Fh(t) {
      return Rt(this.xh, t, ((t2, i) => t2.$n < i));
    }
    Wh(t) {
      return Dt(this.xh, t, ((t2, i) => t2.$n > i));
    }
    Hh(t, i, n) {
      let s = null;
      for (let e2 = t; e2 < i; e2++) {
        const t2 = this.xh[e2].Wt[n];
        Number.isNaN(t2) || (null === s ? s = { Uh: t2, $h: t2 } : (t2 < s.Uh && (s.Uh = t2), t2 > s.$h && (s.$h = t2)));
      }
      return s;
    }
    Ah(t, i, n) {
      if (this.Zi()) return null;
      let s = null;
      const e2 = u(this.Rh()), r2 = u(this.Qn()), h2 = Math.max(t, e2), a2 = Math.min(i, r2), l2 = Math.ceil(h2 / Vt) * Vt, o2 = Math.max(l2, Math.floor(a2 / Vt) * Vt);
      {
        const t2 = this.Fh(h2), e3 = this.Wh(Math.min(a2, l2, i));
        s = Et(s, this.Hh(t2, e3, n));
      }
      let _2 = this.Ch.get(n);
      void 0 === _2 && (_2 = /* @__PURE__ */ new Map(), this.Ch.set(n, _2));
      for (let t2 = Math.max(l2 + 1, h2); t2 < o2; t2 += Vt) {
        const i2 = Math.floor(t2 / Vt);
        let e3 = _2.get(i2);
        if (void 0 === e3) {
          const t3 = this.Fh(i2 * Vt), s2 = this.Wh((i2 + 1) * Vt - 1);
          e3 = this.Hh(t3, s2, n), _2.set(i2, e3);
        }
        s = Et(s, e3);
      }
      {
        const t2 = this.Fh(o2), i2 = this.Wh(a2);
        s = Et(s, this.Hh(t2, i2, n));
      }
      return s;
    }
  };
  function Et(t, i) {
    if (null === t) return i;
    if (null === i) return t;
    return { Uh: Math.min(t.Uh, i.Uh), $h: Math.max(t.$h, i.$h) };
  }
  function At() {
    return new Bt();
  }
  var Lt = { setLineStyle: a };
  var zt = class {
    constructor(t) {
      this.jh = t;
    }
    st(t, i, n) {
      this.jh.draw(t, Lt);
    }
    qh(t, i, n) {
      this.jh.drawBackground?.(t, Lt);
    }
  };
  var Ot = class {
    constructor(t) {
      this.Ls = null, this.Yh = t;
    }
    Tt() {
      const t = this.Yh.renderer();
      if (null === t) return null;
      if (this.Ls?.Kh === t) return this.Ls.Gh;
      const i = new zt(t);
      return this.Ls = { Kh: t, Gh: i }, i;
    }
    Zh() {
      return this.Yh.zOrder?.() ?? "normal";
    }
  };
  var Nt = class {
    constructor(t) {
      this.Xh = null, this.Jh = t;
    }
    Qh() {
      return this.Jh;
    }
    Nn() {
      this.Jh.updateAllViews?.();
    }
    jn() {
      const t = this.Jh.paneViews?.() ?? [];
      if (this.Xh?.Kh === t) return this.Xh.Gh;
      const i = t.map(((t2) => new Ot(t2)));
      return this.Xh = { Kh: t, Gh: i }, i;
    }
    Qs(t, i) {
      return this.Jh.hitTest?.(t, i) ?? null;
    }
  };
  var Ft = class extends Nt {
    cn() {
      return [];
    }
  };
  var Wt = class {
    constructor(t) {
      this.jh = t;
    }
    st(t, i, n) {
      this.jh.draw(t, Lt);
    }
    qh(t, i, n) {
      this.jh.drawBackground?.(t, Lt);
    }
  };
  var Ht = class {
    constructor(t) {
      this.Ls = null, this.Yh = t;
    }
    Tt() {
      const t = this.Yh.renderer();
      if (null === t) return null;
      if (this.Ls?.Kh === t) return this.Ls.Gh;
      const i = new Wt(t);
      return this.Ls = { Kh: t, Gh: i }, i;
    }
    Zh() {
      return this.Yh.zOrder?.() ?? "normal";
    }
  };
  function Ut(t) {
    return { ri: t.text(), Ei: t.coordinate(), Vi: t.fixedCoordinate?.(), R: t.textColor(), Z: t.backColor(), It: t.visible?.() ?? true, pi: t.tickVisible?.() ?? true };
  }
  var $t = class {
    constructor(t, i) {
      this.Xt = new j(), this.ta = t, this.ia = i;
    }
    Tt() {
      return this.Xt.ht({ nn: this.ia.nn(), ...Ut(this.ta) }), this.Xt;
    }
  };
  var jt = class extends H {
    constructor(t, i) {
      super(), this.ta = t, this.Ki = i;
    }
    Yi(t, i, n) {
      const s = Ut(this.ta);
      n.Z = s.Z, t.R = s.R;
      const e2 = 2 / 12 * this.Ki.P();
      n.Ti = e2, n.Ri = e2, n.Ei = s.Ei, n.Vi = s.Vi, t.ri = s.ri, t.It = s.It, t.pi = s.pi;
    }
  };
  var qt = class extends Nt {
    constructor(t, i) {
      super(t), this.na = null, this.sa = null, this.ea = null, this.ra = null, this.Te = i;
    }
    dn() {
      const t = this.Jh.timeAxisViews?.() ?? [];
      if (this.na?.Kh === t) return this.na.Gh;
      const i = this.Te.Qt().Et(), n = t.map(((t2) => new $t(t2, i)));
      return this.na = { Kh: t, Gh: n }, n;
    }
    qn() {
      const t = this.Jh.priceAxisViews?.() ?? [];
      if (this.sa?.Kh === t) return this.sa.Gh;
      const i = this.Te.Ft(), n = t.map(((t2) => new jt(t2, i)));
      return this.sa = { Kh: t, Gh: n }, n;
    }
    ha() {
      const t = this.Jh.priceAxisPaneViews?.() ?? [];
      if (this.ea?.Kh === t) return this.ea.Gh;
      const i = t.map(((t2) => new Ht(t2)));
      return this.ea = { Kh: t, Gh: i }, i;
    }
    aa() {
      const t = this.Jh.timeAxisPaneViews?.() ?? [];
      if (this.ra?.Kh === t) return this.ra.Gh;
      const i = t.map(((t2) => new Ht(t2)));
      return this.ra = { Kh: t, Gh: i }, i;
    }
    la(t, i) {
      return this.Jh.autoscaleInfo?.(t, i) ?? null;
    }
  };
  function Yt(t, i, n, s) {
    t.forEach(((t2) => {
      i(t2).forEach(((t3) => {
        t3.Zh() === n && s.push(t3);
      }));
    }));
  }
  function Kt(t) {
    return t.jn();
  }
  function Gt(t) {
    return t.ha();
  }
  function Zt(t) {
    return t.aa();
  }
  var Xt = ["Area", "Line", "Baseline"];
  var Jt = class extends yt {
    constructor(t, i, n, s, e2) {
      super(t), this.qt = At(), this.dr = new ft(this), this.oa = [], this._a = new _t(this), this.ua = null, this.ca = null, this.da = null, this.fa = [], this.pa = new Ct(), this.va = /* @__PURE__ */ new Map(), this.ma = null, this.yn = n, this.wa = i;
      const r2 = new pt(this);
      if (this.mn = [r2], this.pr = new at(r2, this, t), Xt.includes(this.wa) && (this.ua = new dt(this)), this.Ma(), this.Yh = s(this, this.Qt(), e2), "Custom" === this.wa) {
        const t2 = this.Yh;
        t2.ga && this.ba(t2.ga);
      }
    }
    m() {
      null !== this.da && clearTimeout(this.da);
    }
    We(t) {
      return this.yn.priceLineColor || t;
    }
    Ae(t) {
      const i = { Le: true }, n = this.Ft();
      if (this.Qt().Et().Zi() || n.Zi() || this.qt.Zi()) return i;
      const s = this.Qt().Et().Ee(), e2 = this.Lt();
      if (null === s || null === e2) return i;
      let r2, h2;
      if (t) {
        const t2 = this.qt.kh();
        if (null === t2) return i;
        r2 = t2, h2 = t2.$n;
      } else {
        const t2 = this.qt.Hn(s.bi(), -1);
        if (null === t2) return i;
        if (r2 = this.qt.Mh(t2.$n), null === r2) return i;
        h2 = t2.$n;
      }
      const a2 = r2.Wt[3], l2 = this.Sa().Sh(h2, { Wt: r2 }), o2 = n.Nt(a2, e2.Wt);
      return { Le: false, Mt: a2, ri: n.Ji(a2, e2.Wt), qe: n.xa(a2), Ye: n.Ca(a2, e2.Wt), R: l2.sh, Ei: o2, $n: h2 };
    }
    Sa() {
      return null !== this.ca || (this.ca = new kt(this)), this.ca;
    }
    N() {
      return this.yn;
    }
    vr(t) {
      const i = this.Qt(), { priceScaleId: n, visible: s, priceFormat: e2 } = t;
      void 0 !== n && n !== this.yn.priceScaleId && i.ya(this, n), void 0 !== s && s !== this.yn.visible && i.Pa();
      const r2 = void 0 !== t.conflationThresholdFactor;
      f(this.yn, t), Object.prototype.hasOwnProperty.call(t, "autoscaleInfoProvider") && void 0 === t.autoscaleInfoProvider && (this.yn.autoscaleInfoProvider = void 0), r2 && (this.va.clear(), this.Qt().mr()), void 0 !== e2 && (this.Ma(), i.ka()), i.Ta(this), i.Ra(), this.Yh.Pt("options");
    }
    ht(t, i) {
      this.qt.ht(t), this.va.clear();
      const n = this.Qt().Et().N();
      n.enableConflation && n.precomputeConflationOnInit && this.Da(n.precomputeConflationPriority), this.Ia(), null !== this.ua && (i && i.Va ? this.ua.De() : 0 === t.length && this.ua.Re());
      const s = this.Qt().Ks(this);
      this.Qt().Ba(s), this.Qt().Ta(this), this.Qt().Ra(), this.Qt().mr();
    }
    Ia() {
      this.Yh.Pt("data");
    }
    Ea(t) {
      const i = new xt(this, t);
      return this.oa.push(i), this.Qt().Ta(this), i;
    }
    Aa(t) {
      const i = this.oa.indexOf(t);
      -1 !== i && this.oa.splice(i, 1), this.Qt().Ta(this);
    }
    La() {
      return this.oa;
    }
    bh() {
      return this.wa;
    }
    Lt() {
      const t = this.za();
      return null === t ? null : { Wt: t.Wt[3], Oa: t.wt };
    }
    za() {
      const t = this.Qt().Et().Ee();
      if (null === t) return null;
      const i = t.Na();
      return this.qt.Hn(i, 1);
    }
    Un() {
      return this.qt;
    }
    ba(t) {
      this.ma = t, this.va.clear();
    }
    Fa() {
      return !!this.Qt().Et().N().enableConflation && this.Wa() > 1;
    }
    Rr(t) {
      if (!this.Fa()) return;
      const i = this.Wa();
      if (!this.va.has(i)) return;
      const n = "Custom" === this.wa, s = n && this.ma || void 0, e2 = n && this.Yh.Ha ? (t2) => {
        const i2 = t2, n2 = this.Yh.Ha(i2);
        return Array.isArray(n2) ? n2 : ["number" == typeof n2 ? n2 : 0];
      } : void 0, r2 = this.pa.Rr(this.qt.Bh(), t, i, s, n, e2), h2 = At();
      h2.ht(r2), this.va.set(i, h2);
    }
    Ua() {
      const t = this.Qt().Et().N().enableConflation;
      if ("Custom" === this.wa && null === this.ma) return this.qt;
      if (!t) return this.qt;
      const i = this.Wa(), n = this.va.get(i);
      if (n) return n;
      this.$a(i);
      return this.va.get(i) ?? this.qt;
    }
    ja(t) {
      const i = this.qt.Mh(t);
      return null === i ? null : "Bar" === this.wa || "Candlestick" === this.wa || "Custom" === this.wa ? { jr: i.Wt[0], qr: i.Wt[1], Yr: i.Wt[2], Kr: i.Wt[3] } : i.Wt[3];
    }
    qa(t) {
      const i = [];
      Yt(this.fa, Kt, "top", i);
      const n = this.ua;
      return null !== n && n.It() ? (null === this.da && n.Ve() && (this.da = setTimeout((() => {
        this.da = null, this.Qt().Ya();
      }), 0)), n.Ie(), i.unshift(n), i) : i;
    }
    jn() {
      const t = [];
      this.Ka() || t.push(this._a), t.push(this.Yh, this.dr);
      const i = this.oa.map(((t2) => t2.wr()));
      return t.push(...i), Yt(this.fa, Kt, "normal", t), t;
    }
    Ga() {
      const t = this.Yh.Ga?.() ?? null;
      if (null === t) return null;
      const i = [];
      this.Ka() || i.push(this._a), i.push(...t.Za), Yt(this.fa, Kt, "normal", i);
      const n = [];
      n.push(...t.qa, this.dr);
      const s = this.oa.map(((t2) => t2.wr()));
      return n.push(...s), { Za: i, qa: n };
    }
    Xa() {
      return this.Ja(Kt, "bottom");
    }
    Qa(t) {
      return this.Ja(Gt, t);
    }
    tl(t) {
      return this.Ja(Zt, t);
    }
    il(t, i) {
      return this.fa.map(((n) => n.Qs(t, i))).filter(((t2) => null !== t2));
    }
    cn() {
      return [this.pr, ...this.oa.map(((t) => t.Mr()))];
    }
    qn(t, i) {
      if (i !== this.hn && !this.Ka()) return [];
      const n = [...this.mn];
      for (const t2 of this.oa) n.push(t2.gr());
      return this.fa.forEach(((t2) => {
        n.push(...t2.qn());
      })), n;
    }
    dn() {
      const t = [];
      return this.fa.forEach(((i) => {
        t.push(...i.dn());
      })), t;
    }
    la(t, i) {
      if (void 0 !== this.yn.autoscaleInfoProvider) {
        const n = this.yn.autoscaleInfoProvider((() => {
          const n2 = this.nl(t, i);
          return null === n2 ? null : n2.sr();
        }));
        return wt.er(n);
      }
      return this.nl(t, i);
    }
    Kh() {
      const t = this.yn.priceFormat;
      return t.base ?? 1 / t.minMove;
    }
    sl() {
      return this.el;
    }
    Nn() {
      this.Yh.Pt();
      for (const t of this.mn) t.Pt();
      for (const t of this.oa) t.Pt();
      this.dr.Pt(), this._a.Pt(), this.ua?.Pt(), this.fa.forEach(((t) => t.Nn()));
    }
    Ft() {
      return u(super.Ft());
    }
    At(t) {
      if (!(("Line" === this.wa || "Area" === this.wa || "Baseline" === this.wa) && this.yn.crosshairMarkerVisible)) return null;
      const i = this.qt.Mh(t);
      if (null === i) return null;
      return { Mt: i.Wt[3], ft: this.rl(), Ht: this.hl(), Ot: this.al(), zt: this.ll(t) };
    }
    He() {
      return this.yn.title;
    }
    It() {
      return this.yn.visible;
    }
    ol(t) {
      this.fa.push(new qt(t, this));
    }
    _l(t) {
      this.fa = this.fa.filter(((i) => i.Qh() !== t));
    }
    ul() {
      if ("Custom" === this.wa) return (t) => this.Yh.Ha(t);
    }
    cl() {
      if ("Custom" === this.wa) return (t) => this.Yh.dl(t);
    }
    fl() {
      return this.qt.Lh();
    }
    Ka() {
      return !Z(this.Ft().pl());
    }
    nl(t, i) {
      if (!v(t) || !v(i) || this.qt.Zi()) return null;
      const n = "Line" === this.wa || "Area" === this.wa || "Baseline" === this.wa || "Histogram" === this.wa ? [3] : [2, 1], s = this.qt.Eh(t, i, n);
      let e2 = null !== s ? new mt(s.Uh, s.$h) : null, r2 = null;
      if ("Histogram" === this.bh()) {
        const t2 = this.yn.base, i2 = new mt(t2, t2);
        e2 = null !== e2 ? e2.Ss(i2) : i2;
      }
      return this.fa.forEach(((n2) => {
        const s2 = n2.la(t, i);
        if (s2?.priceRange) {
          const t2 = new mt(s2.priceRange.minValue, s2.priceRange.maxValue);
          e2 = null !== e2 ? e2.Ss(t2) : t2;
        }
        s2?.margins && (r2 = s2.margins);
      })), new wt(e2, r2);
    }
    rl() {
      switch (this.wa) {
        case "Line":
        case "Area":
        case "Baseline":
          return this.yn.crosshairMarkerRadius;
      }
      return 0;
    }
    hl() {
      switch (this.wa) {
        case "Line":
        case "Area":
        case "Baseline": {
          const t = this.yn.crosshairMarkerBorderColor;
          if (0 !== t.length) return t;
        }
      }
      return null;
    }
    al() {
      switch (this.wa) {
        case "Line":
        case "Area":
        case "Baseline":
          return this.yn.crosshairMarkerBorderWidth;
      }
      return 0;
    }
    ll(t) {
      switch (this.wa) {
        case "Line":
        case "Area":
        case "Baseline": {
          const t2 = this.yn.crosshairMarkerBackgroundColor;
          if (0 !== t2.length) return t2;
        }
      }
      return this.Sa().Sh(t).sh;
    }
    Ma() {
      switch (this.yn.priceFormat.type) {
        case "custom": {
          const t = this.yn.priceFormat.formatter;
          this.el = { format: t, formatTickmarks: this.yn.priceFormat.tickmarksFormatter ?? ((i) => i.map(t)) };
          break;
        }
        case "volume":
          this.el = new st(this.yn.priceFormat.precision);
          break;
        case "percent":
          this.el = new nt(this.yn.priceFormat.precision);
          break;
        default: {
          const t = Math.pow(10, this.yn.priceFormat.precision);
          this.el = new it(t, this.yn.priceFormat.minMove * t);
        }
      }
      null !== this.hn && this.hn.vl();
    }
    Ja(t, i) {
      const n = [];
      return Yt(this.fa, t, i, n), n;
    }
    Wa() {
      const { ml: t, wl: i, Ml: n } = this.gl();
      return this.pa.Sr(t, i, n);
    }
    gl() {
      const t = this.Qt().Et(), i = t.ml(), n = window.devicePixelRatio || 1, s = t.N().conflationThresholdFactor;
      return { ml: i, wl: n, Ml: this.yn.conflationThresholdFactor ?? s ?? 1 };
    }
    bl(t) {
      const i = this.qt.Bh();
      let n;
      if ("Custom" === this.wa && null !== this.ma) {
        const s2 = this.ul();
        if (!s2) throw new Error(gt);
        n = this.pa.Cr(i, t, this.ma, true, ((t2) => s2(t2)));
      } else n = this.pa.Cr(i, t);
      const s = At();
      return s.ht(n), s;
    }
    $a(t) {
      const i = this.bl(t);
      this.va.set(t, i);
    }
    Da(t) {
      if ("Custom" === this.wa && (null === this.ma || !this.ul())) return;
      this.va.clear();
      const i = this.Qt().Et().Sl();
      for (const n of i) {
        const i2 = () => {
          this.xl(n);
        }, s = "object" == typeof window && window || "object" == typeof self && self;
        s?.yl?.Cl ? s.yl.Cl((() => {
          i2();
        }), { se: t }) : Promise.resolve().then((() => i2()));
      }
    }
    xl(t) {
      if (this.va.has(t)) return;
      if (0 === this.qt.Bh().length) return;
      const i = this.bl(t);
      this.va.set(t, i);
    }
  };
  var Qt = [3];
  var ti = [0, 1, 2, 3];
  var ii = class {
    constructor(t) {
      this.yn = t;
    }
    Pl(t, i, n) {
      let s = t;
      if (0 === this.yn.mode) return s;
      const e2 = n.kn(), r2 = e2.Lt();
      if (null === r2) return s;
      const h2 = e2.Nt(t, r2), a2 = n.kl().filter(((t2) => t2 instanceof Jt)).reduce(((t2, s2) => {
        if (n.Gs(s2) || !s2.It()) return t2;
        const e3 = s2.Ft(), r3 = s2.Un();
        if (e3.Zi() || !r3.ze(i)) return t2;
        const h3 = r3.Mh(i);
        if (null === h3) return t2;
        const a3 = c(s2.Lt()), l3 = 3 === this.yn.mode ? ti : Qt;
        return t2.concat(l3.map(((t3) => e3.Nt(h3.Wt[t3], a3.Wt))));
      }), []);
      if (0 === a2.length) return s;
      a2.sort(((t2, i2) => Math.abs(t2 - h2) - Math.abs(i2 - h2)));
      const l2 = a2[0];
      return s = e2.Tn(l2, r2), s;
    }
  };
  function ni(t, i, n) {
    return Math.min(Math.max(t, i), n);
  }
  function si(t, i, n) {
    return i - t <= n;
  }
  var ri = class extends R {
    constructor() {
      super(...arguments), this.qt = null;
    }
    ht(t) {
      this.qt = t;
    }
    et({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
      if (null === this.qt) return;
      const e2 = Math.max(1, Math.floor(n));
      t.lineWidth = e2, (function(t2, i2) {
        t2.save(), t2.lineWidth % 2 && t2.translate(0.5, 0.5), i2(), t2.restore();
      })(t, (() => {
        const r2 = u(this.qt);
        if (r2.Tl) {
          t.strokeStyle = r2.Rl, a(t, r2.Dl), t.beginPath();
          for (const s2 of r2.Il) {
            const r3 = Math.round(s2.Vl * n);
            t.moveTo(r3, -e2), t.lineTo(r3, i.height + e2);
          }
          t.stroke();
        }
        if (r2.Bl) {
          t.strokeStyle = r2.El, a(t, r2.Al), t.beginPath();
          for (const n2 of r2.Ll) {
            const r3 = Math.round(n2.Vl * s);
            t.moveTo(-e2, r3), t.lineTo(i.width + e2, r3);
          }
          t.stroke();
        }
      }));
    }
  };
  var hi = class {
    constructor(t) {
      this.Xt = new ri(), this.xt = true, this.yt = t;
    }
    Pt() {
      this.xt = true;
    }
    Tt() {
      if (this.xt) {
        const t = this.yt.Qt().N().grid, i = { Bl: t.horzLines.visible, Tl: t.vertLines.visible, El: t.horzLines.color, Rl: t.vertLines.color, Al: t.horzLines.style, Dl: t.vertLines.style, Ll: this.yt.kn().zl(), Il: (this.yt.Qt().Et().zl() || []).map(((t2) => ({ Vl: t2.coord }))) };
        this.Xt.ht(i), this.xt = false;
      }
      return this.Xt;
    }
  };
  var ai = class {
    constructor(t) {
      this.Yh = new hi(t);
    }
    wr() {
      return this.Yh;
    }
  };
  var li = { Ol: 4, Nl: 1e-4 };
  function oi(t, i) {
    const n = 100 * (t - i) / i;
    return i < 0 ? -n : n;
  }
  function _i(t, i) {
    const n = oi(t.Je(), i), s = oi(t.Qe(), i);
    return new mt(n, s);
  }
  function ui(t, i) {
    const n = 100 * (t - i) / i + 100;
    return i < 0 ? -n : n;
  }
  function ci(t, i) {
    const n = ui(t.Je(), i), s = ui(t.Qe(), i);
    return new mt(n, s);
  }
  function di(t, i) {
    const n = Math.abs(t);
    if (n < 1e-15) return 0;
    const s = Math.log10(n + i.Nl) + i.Ol;
    return t < 0 ? -s : s;
  }
  function fi(t, i) {
    const n = Math.abs(t);
    if (n < 1e-15) return 0;
    const s = Math.pow(10, n - i.Ol) - i.Nl;
    return t < 0 ? -s : s;
  }
  function pi(t, i) {
    if (null === t) return null;
    const n = di(t.Je(), i), s = di(t.Qe(), i);
    return new mt(n, s);
  }
  function vi(t, i) {
    if (null === t) return null;
    const n = fi(t.Je(), i), s = fi(t.Qe(), i);
    return new mt(n, s);
  }
  function mi(t) {
    if (null === t) return li;
    const i = Math.abs(t.Qe() - t.Je());
    if (i >= 1 || i < 1e-15) return li;
    const n = Math.ceil(Math.abs(Math.log10(i))), s = li.Ol + n;
    return { Ol: s, Nl: 1 / Math.pow(10, s) };
  }
  var wi = class {
    constructor(t, i) {
      if (this.Fl = t, this.Wl = i, (function(t2) {
        if (t2 < 0) return false;
        if (t2 > 1e18) return true;
        for (let i2 = t2; i2 > 1; i2 /= 10) if (i2 % 10 != 0) return false;
        return true;
      })(this.Fl)) this.Hl = [2, 2.5, 2];
      else {
        this.Hl = [];
        for (let t2 = this.Fl; 1 !== t2; ) {
          if (t2 % 2 == 0) this.Hl.push(2), t2 /= 2;
          else {
            if (t2 % 5 != 0) throw new Error("unexpected base");
            this.Hl.push(2, 2.5), t2 /= 5;
          }
          if (this.Hl.length > 100) throw new Error("something wrong with base");
        }
      }
    }
    Ul(t, i, n) {
      const s = 0 === this.Fl ? 0 : 1 / this.Fl;
      let e2 = Math.pow(10, Math.max(0, Math.ceil(Math.log10(t - i)))), r2 = 0, h2 = this.Wl[0];
      for (; ; ) {
        const t2 = si(e2, s, 1e-14) && e2 > s + 1e-14, i2 = si(e2, n * h2, 1e-14), a3 = si(e2, 1, 1e-14);
        if (!(t2 && i2 && a3)) break;
        e2 /= h2, h2 = this.Wl[++r2 % this.Wl.length];
      }
      if (e2 <= s + 1e-14 && (e2 = s), e2 = Math.max(1, e2), this.Hl.length > 0 && (a2 = e2, l2 = 1, o2 = 1e-14, Math.abs(a2 - l2) < o2)) for (r2 = 0, h2 = this.Hl[0]; si(e2, n * h2, 1e-14) && e2 > s + 1e-14; ) e2 /= h2, h2 = this.Hl[++r2 % this.Hl.length];
      var a2, l2, o2;
      return e2;
    }
  };
  var Mi = class {
    constructor(t, i, n, s) {
      this.$l = [], this.Ki = t, this.Fl = i, this.jl = n, this.ql = s;
    }
    Ul(t, i) {
      if (t < i) throw new Error("high < low");
      const n = this.Ki.$t(), s = (t - i) * this.Yl() / n, e2 = new wi(this.Fl, [2, 2.5, 2]), r2 = new wi(this.Fl, [2, 2, 2.5]), h2 = new wi(this.Fl, [2.5, 2, 2]), a2 = [];
      return a2.push(e2.Ul(t, i, s), r2.Ul(t, i, s), h2.Ul(t, i, s)), (function(t2) {
        if (t2.length < 1) throw Error("array is empty");
        let i2 = t2[0];
        for (let n2 = 1; n2 < t2.length; ++n2) t2[n2] < i2 && (i2 = t2[n2]);
        return i2;
      })(a2);
    }
    Kl() {
      const t = this.Ki, i = t.Lt();
      if (null === i) return void (this.$l = []);
      const n = t.$t(), s = this.jl(n - 1, i), e2 = this.jl(0, i), r2 = this.Ki.N().entireTextOnly ? this.Gl() / 2 : 0, h2 = r2, a2 = n - 1 - r2, l2 = Math.max(s, e2), o2 = Math.min(s, e2);
      if (l2 === o2) return void (this.$l = []);
      const _2 = this.Ul(l2, o2);
      if (this.Zl(i, _2, l2, o2, h2, a2), t.Xl() && this.Jl(_2, o2, l2)) {
        const t2 = this.Ki.Ql();
        this.io(i, _2, h2, a2, t2, 2 * t2);
      }
      const u2 = this.$l.map(((t2) => t2.no)), c2 = this.Ki.so(u2);
      for (let t2 = 0; t2 < this.$l.length; t2++) this.$l[t2].eo = c2[t2];
    }
    zl() {
      return this.$l;
    }
    Gl() {
      return this.Ki.P();
    }
    Yl() {
      return Math.ceil(this.Gl() * this.Ki.N().tickMarkDensity);
    }
    Zl(t, i, n, s, e2, r2) {
      const h2 = this.$l, a2 = this.Ki;
      let l2 = n % i;
      l2 += l2 < 0 ? i : 0;
      const o2 = n >= s ? 1 : -1;
      let _2 = null, u2 = 0;
      for (let c2 = n - l2; c2 > s; c2 -= i) {
        const n2 = this.ql(c2, t, true);
        null !== _2 && Math.abs(n2 - _2) < this.Yl() || (n2 < e2 || n2 > r2 || (u2 < h2.length ? (h2[u2].Vl = n2, h2[u2].eo = a2.ro(c2), h2[u2].no = c2) : h2.push({ Vl: n2, eo: a2.ro(c2), no: c2 }), u2++, _2 = n2, a2.ho() && (i = this.Ul(c2 * o2, s))));
      }
      h2.length = u2;
    }
    io(t, i, n, s, e2, r2) {
      const h2 = this.$l, a2 = this.ao(t, n, e2, r2), l2 = this.ao(t, s, -r2, -e2), o2 = this.ql(0, t, true) - this.ql(i, t, true);
      h2.length > 0 && h2[0].Vl - a2.Vl < o2 / 2 && h2.shift(), h2.length > 0 && l2.Vl - h2[h2.length - 1].Vl < o2 / 2 && h2.pop(), h2.unshift(a2), h2.push(l2);
    }
    ao(t, i, n, s) {
      const e2 = (n + s) / 2, r2 = this.jl(i + n, t), h2 = this.jl(i + s, t), a2 = Math.min(r2, h2), l2 = Math.max(r2, h2), o2 = Math.max(0.1, this.Ul(l2, a2)), _2 = this.jl(i + e2, t), u2 = _2 - _2 % o2, c2 = this.ql(u2, t, true);
      return { eo: this.Ki.ro(u2), Vl: c2, no: u2 };
    }
    Jl(t, i, n) {
      let s = c(this.Ki.ar());
      return this.Ki.ho() && (s = vi(s, this.Ki.lo())), s.Je() - i < t && n - s.Qe() < t;
    }
  };
  function gi(t) {
    return t.slice().sort(((t2, i) => u(t2.ln()) - u(i.ln())));
  }
  var bi;
  !(function(t) {
    t[t.Normal = 0] = "Normal", t[t.Logarithmic = 1] = "Logarithmic", t[t.Percentage = 2] = "Percentage", t[t.IndexedTo100 = 3] = "IndexedTo100";
  })(bi || (bi = {}));
  var Si = new nt();
  var xi = new it(100, 1);
  var Ci = class {
    constructor(t, i, n, s, e2) {
      this.oo = 0, this._o = null, this.rr = null, this.uo = null, this.co = { do: false, fo: null }, this.po = false, this.vo = 0, this.mo = 0, this.wo = new d(), this.Mo = new d(), this.bo = [], this.So = null, this.xo = null, this.Co = null, this.yo = null, this.Po = null, this.el = xi, this.ko = mi(null), this.To = t, this.yn = i, this.Ro = n, this.Do = s, this.Io = e2, this.Vo = new Mi(this, 100, this.Bo.bind(this), this.Eo.bind(this));
    }
    pl() {
      return this.To;
    }
    N() {
      return this.yn;
    }
    vr(t) {
      if (f(this.yn, t), this.vl(), void 0 !== t.mode && this.Ao({ _e: t.mode }), void 0 !== t.scaleMargins) {
        const i = _(t.scaleMargins.top), n = _(t.scaleMargins.bottom);
        if (i < 0 || i > 1) throw new Error(`Invalid top margin - expect value between 0 and 1, given=${i}`);
        if (n < 0 || n > 1) throw new Error(`Invalid bottom margin - expect value between 0 and 1, given=${n}`);
        if (i + n > 1) throw new Error(`Invalid margins - sum of margins must be less than 1, given=${i + n}`);
        this.Lo(), this.Co = null;
      }
    }
    zo() {
      return this.yn.autoScale;
    }
    Oo() {
      return this.po;
    }
    ho() {
      return 1 === this.yn.mode;
    }
    je() {
      return 2 === this.yn.mode;
    }
    No() {
      return 3 === this.yn.mode;
    }
    lo() {
      return this.ko;
    }
    _e() {
      return { hs: this.yn.autoScale, Fo: this.yn.invertScale, _e: this.yn.mode };
    }
    Ao(t) {
      const i = this._e();
      let n = null;
      void 0 !== t.hs && (this.yn.autoScale = t.hs), void 0 !== t._e && (this.yn.mode = t._e, 2 !== t._e && 3 !== t._e || (this.yn.autoScale = true), this.co.do = false), 1 === i._e && t._e !== i._e && (!(function(t2, i2) {
        if (null === t2) return false;
        const n2 = fi(t2.Je(), i2), s2 = fi(t2.Qe(), i2);
        return isFinite(n2) && isFinite(s2);
      })(this.rr, this.ko) ? this.yn.autoScale = true : (n = vi(this.rr, this.ko), null !== n && this.Wo(n))), 1 === t._e && t._e !== i._e && (n = pi(this.rr, this.ko), null !== n && this.Wo(n));
      const s = i._e !== this.yn.mode;
      s && (2 === i._e || this.je()) && this.vl(), s && (3 === i._e || this.No()) && this.vl(), void 0 !== t.Fo && i.Fo !== t.Fo && (this.yn.invertScale = t.Fo, this.Ho()), this.Mo.p(i, this._e());
    }
    Uo() {
      return this.Mo;
    }
    P() {
      return this.Ro.fontSize;
    }
    $t() {
      return this.oo;
    }
    $o(t) {
      this.oo !== t && (this.oo = t, this.Lo(), this.Co = null);
    }
    jo() {
      if (this._o) return this._o;
      const t = this.$t() - this.qo() - this.Yo();
      return this._o = t, t;
    }
    ar() {
      return this.Ko(), this.rr;
    }
    Wo(t, i) {
      const n = this.rr;
      (i || null === n && null !== t || null !== n && !n.Ze(t)) && (this.Co = null, this.rr = t);
    }
    Go(t) {
      this.Wo(t), this.Zo(null !== t);
    }
    Zi() {
      return this.Ko(), 0 === this.oo || !this.rr || this.rr.Zi();
    }
    Xo(t) {
      return this.Fo() ? t : this.$t() - 1 - t;
    }
    Nt(t, i) {
      return this.je() ? t = oi(t, i) : this.No() && (t = ui(t, i)), this.Eo(t, i);
    }
    Jo(t, i, n) {
      this.Ko();
      const s = this.Yo(), e2 = u(this.ar()), r2 = e2.Je(), h2 = e2.Qe(), a2 = this.jo() - 1, l2 = this.Fo(), o2 = a2 / (h2 - r2), _2 = void 0 === n ? 0 : n.from, c2 = void 0 === n ? t.length : n.to, d2 = this.Qo();
      for (let n2 = _2; n2 < c2; n2++) {
        const e3 = t[n2], h3 = e3.Mt;
        if (isNaN(h3)) continue;
        let a3 = h3;
        null !== d2 && (a3 = d2(e3.Mt, i));
        const _3 = s + o2 * (a3 - r2), u2 = l2 ? _3 : this.oo - 1 - _3;
        e3.ut = u2;
      }
    }
    t_(t, i, n) {
      this.Ko();
      const s = this.Yo(), e2 = u(this.ar()), r2 = e2.Je(), h2 = e2.Qe(), a2 = this.jo() - 1, l2 = this.Fo(), o2 = a2 / (h2 - r2), _2 = void 0 === n ? 0 : n.from, c2 = void 0 === n ? t.length : n.to, d2 = this.Qo();
      for (let n2 = _2; n2 < c2; n2++) {
        const e3 = t[n2];
        let h3 = e3.jr, a3 = e3.qr, _3 = e3.Yr, u2 = e3.Kr;
        null !== d2 && (h3 = d2(e3.jr, i), a3 = d2(e3.qr, i), _3 = d2(e3.Yr, i), u2 = d2(e3.Kr, i));
        let c3 = s + o2 * (h3 - r2), f2 = l2 ? c3 : this.oo - 1 - c3;
        e3.i_ = f2, c3 = s + o2 * (a3 - r2), f2 = l2 ? c3 : this.oo - 1 - c3, e3.n_ = f2, c3 = s + o2 * (_3 - r2), f2 = l2 ? c3 : this.oo - 1 - c3, e3.s_ = f2, c3 = s + o2 * (u2 - r2), f2 = l2 ? c3 : this.oo - 1 - c3, e3.e_ = f2;
      }
    }
    Tn(t, i) {
      const n = this.Bo(t, i);
      return this.r_(n, i);
    }
    r_(t, i) {
      let n = t;
      return this.je() ? n = (function(t2, i2) {
        return i2 < 0 && (t2 = -t2), t2 / 100 * i2 + i2;
      })(n, i) : this.No() && (n = (function(t2, i2) {
        return t2 -= 100, i2 < 0 && (t2 = -t2), t2 / 100 * i2 + i2;
      })(n, i)), n;
    }
    kl() {
      return this.bo;
    }
    Dt() {
      return this.xo || (this.xo = gi(this.bo)), this.xo;
    }
    h_(t) {
      -1 === this.bo.indexOf(t) && (this.bo.push(t), this.vl(), this.a_());
    }
    l_(t) {
      const i = this.bo.indexOf(t);
      if (-1 === i) throw new Error("source is not attached to scale");
      this.bo.splice(i, 1), 0 === this.bo.length && (this.Ao({ hs: true }), this.Wo(null)), this.vl(), this.a_();
    }
    Lt() {
      let t = null;
      for (const i of this.bo) {
        const n = i.Lt();
        null !== n && ((null === t || n.Oa < t.Oa) && (t = n));
      }
      return null === t ? null : t.Wt;
    }
    Fo() {
      return this.yn.invertScale;
    }
    zl() {
      const t = null === this.Lt();
      if (null !== this.Co && (t || this.Co.o_ === t)) return this.Co.zl;
      this.Vo.Kl();
      const i = this.Vo.zl();
      return this.Co = { zl: i, o_: t }, this.wo.p(), i;
    }
    __() {
      return this.wo;
    }
    u_(t) {
      this.je() || this.No() || null === this.yo && null === this.uo && (this.Zi() || (this.yo = this.oo - t, this.uo = u(this.ar()).Xe()));
    }
    c_(t) {
      if (this.je() || this.No()) return;
      if (null === this.yo) return;
      this.Ao({ hs: false }), (t = this.oo - t) < 0 && (t = 0);
      let i = (this.yo + 0.2 * (this.oo - 1)) / (t + 0.2 * (this.oo - 1));
      const n = u(this.uo).Xe();
      i = Math.max(i, 0.1), n.ir(i), this.Wo(n);
    }
    d_() {
      this.je() || this.No() || (this.yo = null, this.uo = null);
    }
    f_(t) {
      this.zo() || null === this.Po && null === this.uo && (this.Zi() || (this.Po = t, this.uo = u(this.ar()).Xe()));
    }
    p_(t) {
      if (this.zo()) return;
      if (null === this.Po) return;
      const i = u(this.ar()).tr() / (this.jo() - 1);
      let n = t - this.Po;
      this.Fo() && (n *= -1);
      const s = n * i, e2 = u(this.uo).Xe();
      e2.nr(s), this.Wo(e2, true), this.Co = null;
    }
    v_() {
      this.zo() || null !== this.Po && (this.Po = null, this.uo = null);
    }
    sl() {
      return this.el || this.vl(), this.el;
    }
    Ji(t, i) {
      switch (this.yn.mode) {
        case 2:
          return this.m_(oi(t, i));
        case 3:
          return this.sl().format(ui(t, i));
        default:
          return this.cr(t);
      }
    }
    ro(t) {
      switch (this.yn.mode) {
        case 2:
          return this.m_(t);
        case 3:
          return this.sl().format(t);
        default:
          return this.cr(t);
      }
    }
    so(t) {
      switch (this.yn.mode) {
        case 2:
          return this.w_(t);
        case 3:
          return this.sl().formatTickmarks(t);
        default:
          return this.M_(t);
      }
    }
    xa(t) {
      return this.cr(t, u(this.So).sl());
    }
    Ca(t, i) {
      return t = oi(t, i), this.m_(t, Si);
    }
    g_() {
      return this.bo;
    }
    b_(t) {
      this.co = { fo: t, do: false };
    }
    Nn() {
      this.bo.forEach(((t) => t.Nn()));
    }
    Xl() {
      return this.yn.ensureEdgeTickMarksVisible && this.zo();
    }
    Ql() {
      return this.P() / 2;
    }
    vl() {
      this.Co = null;
      let t = 1 / 0;
      this.So = null;
      for (const i2 of this.bo) i2.ln() < t && (t = i2.ln(), this.So = i2);
      let i = 100;
      null !== this.So && (i = Math.round(this.So.Kh())), this.el = xi, this.je() ? (this.el = Si, i = 100) : this.No() ? (this.el = new it(100, 1), i = 100) : null !== this.So && (this.el = this.So.sl()), this.Vo = new Mi(this, i, this.Bo.bind(this), this.Eo.bind(this)), this.Vo.Kl();
    }
    a_() {
      this.xo = null;
    }
    S_() {
      return null === this.So || this.je() || this.No() ? 1 : 1 / this.So.Kh();
    }
    Xi() {
      return this.Io;
    }
    Zo(t) {
      this.po = t;
    }
    qo() {
      return this.Fo() ? this.yn.scaleMargins.bottom * this.$t() + this.mo : this.yn.scaleMargins.top * this.$t() + this.vo;
    }
    Yo() {
      return this.Fo() ? this.yn.scaleMargins.top * this.$t() + this.vo : this.yn.scaleMargins.bottom * this.$t() + this.mo;
    }
    Ko() {
      this.co.do || (this.co.do = true, this.x_());
    }
    Lo() {
      this._o = null;
    }
    Eo(t, i) {
      if (this.Ko(), this.Zi()) return 0;
      t = this.ho() && t ? di(t, this.ko) : t;
      const n = u(this.ar()), s = this.Yo() + (this.jo() - 1) * (t - n.Je()) / n.tr();
      return this.Xo(s);
    }
    Bo(t, i) {
      if (this.Ko(), this.Zi()) return 0;
      const n = this.Xo(t), s = u(this.ar()), e2 = s.Je() + s.tr() * ((n - this.Yo()) / (this.jo() - 1));
      return this.ho() ? fi(e2, this.ko) : e2;
    }
    Ho() {
      this.Co = null, this.Vo.Kl();
    }
    x_() {
      if (this.Oo() && !this.zo()) return;
      const t = this.co.fo;
      if (null === t) return;
      let i = null;
      const n = this.g_();
      let s = 0, e2 = 0;
      for (const r3 of n) {
        if (!r3.It()) continue;
        const n2 = r3.Lt();
        if (null === n2) continue;
        const h3 = r3.la(t.Na(), t.bi());
        let a2 = h3 && h3.ar();
        if (null !== a2) {
          switch (this.yn.mode) {
            case 1:
              a2 = pi(a2, this.ko);
              break;
            case 2:
              a2 = _i(a2, n2.Wt);
              break;
            case 3:
              a2 = ci(a2, n2.Wt);
          }
          if (i = null === i ? a2 : i.Ss(u(a2)), null !== h3) {
            const t2 = h3.lr();
            null !== t2 && (s = Math.max(s, t2.above), e2 = Math.max(e2, t2.below));
          }
        }
      }
      if (this.Xl() && (s = Math.max(s, this.Ql()), e2 = Math.max(e2, this.Ql())), s === this.vo && e2 === this.mo || (this.vo = s, this.mo = e2, this.Co = null, this.Lo()), null !== i) {
        if (i.Je() === i.Qe()) {
          const t2 = 5 * this.S_();
          this.ho() && (i = vi(i, this.ko)), i = new mt(i.Je() - t2, i.Qe() + t2), this.ho() && (i = pi(i, this.ko));
        }
        if (this.ho()) {
          const t2 = vi(i, this.ko), n2 = mi(t2);
          if (r2 = n2, h2 = this.ko, r2.Ol !== h2.Ol || r2.Nl !== h2.Nl) {
            const s2 = null !== this.uo ? vi(this.uo, this.ko) : null;
            this.ko = n2, i = pi(t2, n2), null !== s2 && (this.uo = pi(s2, n2));
          }
        }
        this.Wo(i);
      } else null === this.rr && (this.Wo(new mt(-0.5, 0.5)), this.ko = mi(null));
      var r2, h2;
    }
    Qo() {
      return this.je() ? oi : this.No() ? ui : this.ho() ? (t) => di(t, this.ko) : null;
    }
    C_(t, i, n) {
      return void 0 === i ? (void 0 === n && (n = this.sl()), n.format(t)) : i(t);
    }
    y_(t, i, n) {
      return void 0 === i ? (void 0 === n && (n = this.sl()), n.formatTickmarks(t)) : i(t);
    }
    cr(t, i) {
      return this.C_(t, this.Do.priceFormatter, i);
    }
    M_(t, i) {
      const n = this.Do.priceFormatter;
      return this.y_(t, this.Do.tickmarksPriceFormatter ?? (n ? (t2) => t2.map(n) : void 0), i);
    }
    m_(t, i) {
      return this.C_(t, this.Do.percentageFormatter, i);
    }
    w_(t, i) {
      const n = this.Do.percentageFormatter;
      return this.y_(t, this.Do.tickmarksPercentageFormatter ?? (n ? (t2) => t2.map(n) : void 0), i);
    }
  };
  function yi(t) {
    return t instanceof Jt;
  }
  var Pi = class {
    constructor(t, i) {
      this.bo = [], this.P_ = /* @__PURE__ */ new Map(), this.oo = 0, this.k_ = 0, this.T_ = 1, this.xo = null, this.R_ = null, this.D_ = false, this.I_ = new d(), this.fa = [], this.ia = t, this.sn = i, this.V_ = new ai(this);
      const n = i.N();
      this.B_ = this.E_("left", n.leftPriceScale), this.A_ = this.E_("right", n.rightPriceScale), this.B_.Uo().i(this.L_.bind(this, this.B_), this), this.A_.Uo().i(this.L_.bind(this, this.A_), this), this.z_(n);
    }
    z_(t) {
      if (t.leftPriceScale && this.B_.vr(t.leftPriceScale), t.rightPriceScale && this.A_.vr(t.rightPriceScale), t.localization && (this.B_.vl(), this.A_.vl()), t.overlayPriceScales) {
        const i = Array.from(this.P_.values());
        for (const n of i) {
          const i2 = u(n[0].Ft());
          i2.vr(t.overlayPriceScales), t.localization && i2.vl();
        }
      }
    }
    O_(t) {
      switch (t) {
        case "left":
          return this.B_;
        case "right":
          return this.A_;
      }
      return this.P_.has(t) ? _(this.P_.get(t))[0].Ft() : null;
    }
    m() {
      this.Qt().N_().u(this), this.B_.Uo().u(this), this.A_.Uo().u(this), this.bo.forEach(((t) => {
        t.m && t.m();
      })), this.fa = this.fa.filter(((t) => {
        const i = t.Qh();
        return i.detached && i.detached(), false;
      })), this.I_.p();
    }
    F_() {
      return this.T_;
    }
    W_(t) {
      this.T_ = t;
    }
    Qt() {
      return this.sn;
    }
    nn() {
      return this.k_;
    }
    $t() {
      return this.oo;
    }
    H_(t) {
      this.k_ = t, this.U_();
    }
    $o(t) {
      this.oo = t, this.B_.$o(t), this.A_.$o(t), this.bo.forEach(((i) => {
        if (this.Gs(i)) {
          const n = i.Ft();
          null !== n && n.$o(t);
        }
      })), this.U_();
    }
    j_(t) {
      this.D_ = t;
    }
    q_() {
      return this.D_;
    }
    Y_() {
      return this.bo.filter(yi);
    }
    kl() {
      return this.bo;
    }
    Gs(t) {
      const i = t.Ft();
      return null === i || this.B_ !== i && this.A_ !== i;
    }
    h_(t, i, n) {
      this.K_(t, i, n ? t.ln() : this.bo.length);
    }
    l_(t, i) {
      const n = this.bo.indexOf(t);
      o(-1 !== n, "removeDataSource: invalid data source"), this.bo.splice(n, 1), i || this.bo.forEach(((t2, i2) => t2._n(i2)));
      const s = u(t.Ft()).pl();
      if (this.P_.has(s)) {
        const i2 = _(this.P_.get(s)), n2 = i2.indexOf(t);
        -1 !== n2 && (i2.splice(n2, 1), 0 === i2.length && this.P_.delete(s));
      }
      const e2 = t.Ft();
      e2 && e2.kl().indexOf(t) >= 0 && (e2.l_(t), this.G_(e2)), this.Z_();
    }
    Xs(t) {
      return t === this.B_ ? "left" : t === this.A_ ? "right" : "overlay";
    }
    X_() {
      return this.B_;
    }
    J_() {
      return this.A_;
    }
    Q_(t, i) {
      t.u_(i);
    }
    tu(t, i) {
      t.c_(i), this.U_();
    }
    iu(t) {
      t.d_();
    }
    nu(t, i) {
      t.f_(i);
    }
    su(t, i) {
      t.p_(i), this.U_();
    }
    eu(t) {
      t.v_();
    }
    U_() {
      this.bo.forEach(((t) => {
        t.Nn();
      }));
    }
    kn() {
      const [t, i] = this.ru();
      let n = null;
      return t.N().visible && 0 !== t.kl().length ? n = t : i.N().visible && 0 !== i.kl().length ? n = i : 0 !== this.bo.length && (n = this.bo[0].Ft()), null === n && (n = this.Zs() ?? t), n;
    }
    Zs() {
      const [t, i] = this.ru();
      return t.N().visible ? t : i.N().visible ? i : null;
    }
    G_(t) {
      null !== t && t.zo() && this.hu(t);
    }
    au(t) {
      const i = this.ia.Ee();
      t.Ao({ hs: true }), null !== i && t.b_(i), this.U_();
    }
    lu() {
      this.hu(this.B_), this.hu(this.A_);
    }
    ou() {
      this.G_(this.B_), this.G_(this.A_), this.bo.forEach(((t) => {
        this.Gs(t) && this.G_(t.Ft());
      })), this.U_(), this.sn.mr();
    }
    Dt() {
      return null === this.xo && (this.xo = gi(this.bo)), this.xo;
    }
    _u() {
      const t = this.Dt(), i = this.sn.cu()?.uu, n = this.sn.N().hoveredSeriesOnTop, s = this.R_;
      if (null !== s && s.Kh === t && s.du === i && s.fu === n) return s.pu;
      const e2 = (function(t2, i2, n2) {
        if (!n2) return t2;
        const s2 = t2.indexOf(i2);
        if (-1 === s2 || s2 === t2.length - 1) return t2;
        const e3 = [];
        for (let i3 = 0; i3 < t2.length; i3++) i3 !== s2 && e3.push(t2[i3]);
        return e3.push(t2[s2]), e3;
      })(t, i, n);
      return this.R_ = { Kh: t, du: i, fu: n, pu: e2 }, e2;
    }
    vu(t, i) {
      i = ni(i, 0, this.bo.length - 1);
      const n = this.bo.indexOf(t);
      o(-1 !== n, "setSeriesOrder: invalid data source"), this.bo.splice(n, 1), this.bo.splice(i, 0, t), this.bo.forEach(((t2, i2) => t2._n(i2))), this.Z_();
      for (const t2 of [this.B_, this.A_]) t2.a_(), t2.vl();
      this.sn.mr();
    }
    Vt() {
      return this.Dt().filter(yi);
    }
    mu() {
      return this.I_;
    }
    wu() {
      return this.V_;
    }
    ol(t) {
      this.fa.push(new Ft(t));
    }
    _l(t) {
      this.fa = this.fa.filter(((i) => i.Qh() !== t)), t.detached && t.detached(), this.sn.mr();
    }
    Mu() {
      return this.fa;
    }
    il(t, i) {
      return this.fa.map(((n) => n.Qs(t, i))).filter(((t2) => null !== t2));
    }
    hu(t) {
      const i = t.g_();
      if (i && i.length > 0 && !this.ia.Zi()) {
        const i2 = this.ia.Ee();
        null !== i2 && t.b_(i2);
      }
      t.Nn();
    }
    K_(t, i, n) {
      let s = this.O_(i);
      if (null === s && (s = this.E_(i, this.sn.N().overlayPriceScales)), this.bo.splice(n, 0, t), !Z(i)) {
        const n2 = this.P_.get(i) || [];
        n2.push(t), this.P_.set(i, n2);
      }
      t._n(n), s.h_(t), t.un(s), this.G_(s), this.Z_();
    }
    Z_() {
      this.xo = null, this.R_ = null;
    }
    ru() {
      return "left" === this.sn.N().defaultVisiblePriceScaleId ? [this.B_, this.A_] : [this.A_, this.B_];
    }
    L_(t, i, n) {
      i._e !== n._e && this.hu(t);
    }
    E_(t, i) {
      const n = { visible: true, autoScale: true, ...M(i) }, s = new Ci(t, n, this.sn.N().layout, this.sn.N().localization, this.sn.Xi());
      return s.$o(this.$t()), s;
    }
  };
  function ki(t, i) {
    return null === i || (2 === t.se && 2 !== i.se || (2 !== i.se || 2 === t.se) && (t.ne !== i.ne && t.ne < i.ne));
  }
  function Ti(t) {
    return { te: t.te, ie: t.ie };
  }
  function Ri(t) {
    return { ne: t.distance ?? 0, se: t.hitTestPriority ?? ("marker" === t.itemType ? 2 : 0), ee: t.itemType ?? "primitive", gu: t.cursorStyle, te: t.externalId };
  }
  function Di(t) {
    return { uu: t.uu, bu: Ti(t.Su), gu: t.Su.gu, ee: t.Su.ee ?? "primitive" };
  }
  function Ii(t, i, n, s) {
    let e2 = null;
    for (const r2 of t) {
      let t2 = r2.Qs?.(i, n, s) ?? null;
      if (null === t2) {
        const e3 = r2.Tt(s);
        t2 = null !== e3 && e3.Qs ? e3.Qs(i, n) : null;
      }
      if (null !== t2) {
        const i2 = { xu: r2, Su: t2 };
        (null === e2 || ki(i2.Su, e2.Su)) && (e2 = i2);
      }
    }
    return e2;
  }
  function Vi(t) {
    return void 0 !== t.jn;
  }
  function Bi(t, i, n) {
    const s = [t, ...t.Dt()].reverse(), e2 = (function(t2, i2, n2) {
      let s2, e3, r3;
      for (const l2 of t2) {
        const t3 = l2.il?.(i2, n2) ?? [];
        for (const i3 of t3) {
          const t4 = Ri(i3);
          h3 = i3.zOrder, a2 = s2?.zOrder, (!a2 || "top" === h3 && "top" !== a2 || "normal" === h3 && "bottom" === a2 || i3.zOrder === s2?.zOrder && void 0 !== e3 && ki(t4, e3) || i3.zOrder === s2?.zOrder && void 0 === e3) && (s2 = i3, e3 = t4, r3 = l2);
        }
      }
      var h3, a2;
      return s2 && r3 && e3 ? { Su: e3, Cu: s2, uu: r3 } : null;
    })(s, i, n);
    if ("top" === e2?.Cu.zOrder) return Di(e2);
    let r2 = null, h2 = null;
    for (const a2 of s) {
      if (e2 && e2.uu === a2 && "bottom" !== e2.Cu.zOrder && !e2.Cu.isBackground) return r2 ?? Di(e2);
      if (Vi(a2)) {
        const s2 = Ii(a2.jn(t), i, n, t);
        if (null !== s2) {
          const t2 = { uu: a2, xu: s2.xu, bu: Ti(s2.Su), gu: s2.Su.gu, ee: s2.Su.ee ?? "primitive" };
          (null === r2 || ki(s2.Su, h2)) && (r2 = t2, h2 = s2.Su);
        }
      }
      if (e2 && e2.uu === a2 && "bottom" !== e2.Cu.zOrder && e2.Cu.isBackground) return r2 ?? Di(e2);
    }
    return null !== r2 ? r2 : e2?.Cu ? Di(e2) : null;
  }
  var Ei = class {
    constructor(t, i, n = 50) {
      this.Vs = 0, this.Bs = 1, this.Es = 1, this.Ls = /* @__PURE__ */ new Map(), this.As = /* @__PURE__ */ new Map(), this.yu = t, this.Pu = i, this.zs = n;
    }
    ku(t) {
      const i = t.time, n = this.Pu.cacheKey(i), s = this.Ls.get(n);
      if (void 0 !== s) return s.Tu;
      if (this.Vs === this.zs) {
        const t2 = this.As.get(this.Es);
        this.As.delete(this.Es), this.Ls.delete(_(t2)), this.Es++, this.Vs--;
      }
      const e2 = this.yu(t);
      return this.Ls.set(n, { Tu: e2, Ws: this.Bs }), this.As.set(this.Bs, n), this.Vs++, this.Bs++, e2;
    }
  };
  var Ai = class {
    constructor(t, i) {
      o(t <= i, "right should be >= left"), this.Ru = t, this.Du = i;
    }
    Na() {
      return this.Ru;
    }
    bi() {
      return this.Du;
    }
    Iu() {
      return this.Du - this.Ru + 1;
    }
    ze(t) {
      return this.Ru <= t && t <= this.Du;
    }
    Ze(t) {
      return this.Ru === t.Na() && this.Du === t.bi();
    }
  };
  function Li(t, i) {
    return null === t || null === i ? t === i : t.Ze(i);
  }
  var zi = class {
    constructor() {
      this.Vu = /* @__PURE__ */ new Map(), this.Ls = null, this.Bu = false;
    }
    Eu(t) {
      this.Bu = t, this.Ls = null;
    }
    Au(t, i) {
      this.Lu(i), this.Ls = null;
      for (let n = i; n < t.length; ++n) {
        const i2 = t[n];
        let s = this.Vu.get(i2.timeWeight);
        void 0 === s && (s = [], this.Vu.set(i2.timeWeight, s)), s.push({ index: n, time: i2.time, weight: i2.timeWeight, originalTime: i2.originalTime });
      }
    }
    zu(t, i, n, s, e2) {
      const r2 = Math.ceil(i / t);
      return null !== this.Ls && this.Ls.Ou === r2 && e2 === this.Ls.Nu && n === this.Ls.Fu || (this.Ls = { Nu: e2, Fu: n, zl: this.Wu(r2, n, s), Ou: r2 }), this.Ls.zl;
    }
    Lu(t) {
      if (0 === t) return void this.Vu.clear();
      const i = [];
      this.Vu.forEach(((n, s) => {
        t <= n[0].index ? i.push(s) : n.splice(Rt(n, t, ((i2) => i2.index < t)), 1 / 0);
      }));
      for (const t2 of i) this.Vu.delete(t2);
    }
    Wu(t, i, n) {
      let s = [];
      const e2 = (t2) => !i || n.has(t2.index);
      for (const i2 of Array.from(this.Vu.keys()).sort(((t2, i3) => i3 - t2))) {
        if (!this.Vu.get(i2)) continue;
        const n2 = s;
        s = [];
        const r2 = n2.length;
        let h2 = 0;
        const a2 = _(this.Vu.get(i2)), l2 = a2.length;
        let o2 = 1 / 0, u2 = -1 / 0;
        for (let i3 = 0; i3 < l2; i3++) {
          const l3 = a2[i3], _2 = l3.index;
          for (; h2 < r2; ) {
            const t2 = n2[h2], i4 = t2.index;
            if (!(i4 < _2 && e2(t2))) {
              o2 = i4;
              break;
            }
            h2++, s.push(t2), u2 = i4, o2 = 1 / 0;
          }
          if (o2 - _2 >= t && _2 - u2 >= t && e2(l3)) s.push(l3), u2 = _2;
          else if (this.Bu) return n2;
        }
        for (; h2 < r2; h2++) e2(n2[h2]) && s.push(n2[h2]);
      }
      return s;
    }
  };
  var Oi = class _Oi {
    constructor(t) {
      this.Hu = t;
    }
    Uu() {
      return null === this.Hu ? null : new Ai(Math.floor(this.Hu.Na()), Math.ceil(this.Hu.bi()));
    }
    $u() {
      return this.Hu;
    }
    static ju() {
      return new _Oi(null);
    }
  };
  function Ni(t, i) {
    return t.weight > i.weight ? t : i;
  }
  var Fi = class {
    constructor(t, i, n, s) {
      this.k_ = 0, this.qu = null, this.Yu = [], this.Po = null, this.yo = null, this.Ku = new zi(), this.Gu = /* @__PURE__ */ new Map(), this.Zu = Oi.ju(), this.Xu = true, this.Ju = new d(), this.Qu = new d(), this.tc = new d(), this.nc = null, this.sc = null, this.ec = /* @__PURE__ */ new Map(), this.rc = -1, this.hc = [], this.ac = 1, this.yn = i, this.Do = n, this.lc = i.rightOffset, this.oc = i.barSpacing, this.sn = t, this._c(i), this.Pu = s, this.uc(), this.Ku.Eu(i.uniformDistribution), this.cc(), this.dc();
    }
    N() {
      return this.yn;
    }
    fc(t) {
      f(this.Do, t), this.vc(), this.uc();
    }
    vr(t, i) {
      f(this.yn, t), this.yn.fixLeftEdge && this.mc(), this.yn.fixRightEdge && this.wc(), void 0 !== t.barSpacing && this.sn.Ms(t.barSpacing), void 0 !== t.rightOffset && this.sn.gs(t.rightOffset), this._c(t), void 0 === t.minBarSpacing && void 0 === t.maxBarSpacing || this.sn.Ms(t.barSpacing ?? this.oc), void 0 !== t.ignoreWhitespaceIndices && t.ignoreWhitespaceIndices !== this.yn.ignoreWhitespaceIndices && this.dc(), this.vc(), this.uc(), void 0 === t.enableConflation && void 0 === t.conflationThresholdFactor || this.cc(), this.tc.p();
    }
    Rn(t) {
      return this.Yu[t]?.time ?? null;
    }
    en(t) {
      return this.Yu[t] ?? null;
    }
    Mc(t, i) {
      if (this.Yu.length < 1) return null;
      if (this.Pu.key(t) > this.Pu.key(this.Yu[this.Yu.length - 1].time)) return i ? this.Yu.length - 1 : null;
      const n = Rt(this.Yu, this.Pu.key(t), ((t2, i2) => this.Pu.key(t2.time) < i2));
      return this.Pu.key(t) < this.Pu.key(this.Yu[n].time) ? i ? n : null : n;
    }
    Zi() {
      return 0 === this.k_ || 0 === this.Yu.length || null === this.qu;
    }
    gc() {
      return this.Yu.length > 0;
    }
    Ee() {
      return this.bc(), this.Zu.Uu();
    }
    Sc() {
      return this.bc(), this.Zu.$u();
    }
    xc() {
      const t = this.Ee();
      if (null === t) return null;
      const i = { from: t.Na(), to: t.bi() };
      return this.Cc(i);
    }
    Cc(t) {
      const i = Math.round(t.from), n = Math.round(t.to), s = u(this.yc()), e2 = u(this.Pc());
      return { from: u(this.en(Math.max(s, i))), to: u(this.en(Math.min(e2, n))) };
    }
    kc(t) {
      return { from: u(this.Mc(t.from, true)), to: u(this.Mc(t.to, true)) };
    }
    nn() {
      return this.k_;
    }
    H_(t) {
      if (!isFinite(t) || t <= 0) return;
      if (this.k_ === t) return;
      const i = this.Sc(), n = this.k_;
      if (this.k_ = t, this.Xu = true, this.yn.lockVisibleTimeRangeOnResize && 0 !== n) {
        const i2 = this.oc * t / n;
        this.oc = i2;
      }
      if (this.yn.fixLeftEdge && null !== i && i.Na() <= 0) {
        const i2 = n - t;
        this.lc -= Math.round(i2 / this.oc) + 1, this.Xu = true;
      }
      this.Tc(), this.Rc();
    }
    jt(t) {
      if (this.Zi() || !v(t)) return 0;
      const i = this.Dc() + this.lc - t;
      return this.k_ - (i + 0.5) * this.oc - 1;
    }
    Ic(t, i) {
      const n = this.Dc(), s = void 0 === i ? 0 : i.from, e2 = void 0 === i ? t.length : i.to;
      for (let i2 = s; i2 < e2; i2++) {
        const s2 = t[i2].wt, e3 = n + this.lc - s2, r2 = this.k_ - (e3 + 0.5) * this.oc - 1;
        t[i2]._t = r2;
      }
    }
    Vc(t, i) {
      const n = Math.ceil(this.Bc(t));
      return i && this.yn.ignoreWhitespaceIndices && !this.Ec(n) ? this.Ac(n) : n;
    }
    gs(t) {
      this.Xu = true, this.lc = t, this.Rc(), this.sn.Lc(), this.sn.mr();
    }
    ml() {
      return this.oc;
    }
    Ms(t) {
      const i = this.oc;
      if (this.zc(t), void 0 !== this.yn.rightOffsetPixels && 0 !== i) {
        const t2 = this.lc * i / this.oc;
        this.lc = t2;
      }
      this.Rc(), this.sn.Lc(), this.sn.mr();
    }
    Oc() {
      return this.lc;
    }
    zl() {
      if (this.Zi()) return null;
      if (null !== this.sc) return this.sc;
      const t = this.oc, i = 5 * (this.sn.N().layout.fontSize + 4) / 8 * (this.yn.tickMarkMaxCharacterLength || 8), n = Math.round(i / t), s = u(this.Ee()), e2 = Math.max(s.Na(), s.Na() - n), r2 = Math.max(s.bi(), s.bi() - n), h2 = this.Ku.zu(t, i, this.yn.ignoreWhitespaceIndices, this.ec, this.rc), a2 = this.yc() + n, l2 = this.Pc() - n, o2 = this.Nc(), _2 = this.yn.fixLeftEdge || o2, c2 = this.yn.fixRightEdge || o2;
      let d2 = 0;
      for (const t2 of h2) {
        if (!(e2 <= t2.index && t2.index <= r2)) continue;
        let n2;
        d2 < this.hc.length ? (n2 = this.hc[d2], n2.coord = this.jt(t2.index), n2.label = this.Fc(t2), n2.weight = t2.weight) : (n2 = { needAlignCoordinate: false, coord: this.jt(t2.index), label: this.Fc(t2), weight: t2.weight }, this.hc.push(n2)), this.oc > i / 2 && !o2 ? n2.needAlignCoordinate = false : n2.needAlignCoordinate = _2 && t2.index <= a2 || c2 && t2.index >= l2, d2++;
      }
      return this.hc.length = d2, this.sc = this.hc, this.hc;
    }
    Wc() {
      let t;
      this.Xu = true, this.Ms(this.yn.barSpacing), t = void 0 !== this.yn.rightOffsetPixels ? this.yn.rightOffsetPixels / this.ml() : this.yn.rightOffset, this.gs(t);
    }
    Hc(t) {
      this.Xu = true, this.qu = t, this.Rc(), this.mc();
    }
    Uc(t, i) {
      const n = this.Bc(t), s = this.ml(), e2 = s + i * (s / 10);
      this.Ms(e2), this.yn.rightBarStaysOnScroll || this.gs(this.Oc() + (n - this.Bc(t)));
    }
    u_(t) {
      this.Po && this.v_(), null === this.yo && null === this.nc && (this.Zi() || (this.yo = t, this.$c()));
    }
    c_(t) {
      if (null === this.nc) return;
      const i = ni(this.k_ - t, 0, this.k_), n = ni(this.k_ - u(this.yo), 0, this.k_);
      0 !== i && 0 !== n && this.Ms(this.nc.ml * i / n);
    }
    d_() {
      null !== this.yo && (this.yo = null, this.jc());
    }
    f_(t) {
      null === this.Po && null === this.nc && (this.Zi() || (this.Po = t, this.$c()));
    }
    p_(t) {
      if (null === this.Po) return;
      const i = (this.Po - t) / this.ml();
      this.lc = u(this.nc).Oc + i, this.Xu = true, this.Rc();
    }
    v_() {
      null !== this.Po && (this.Po = null, this.jc());
    }
    qc() {
      this.Yc(this.yn.rightOffset);
    }
    Yc(t, i = 400) {
      if (!isFinite(t)) throw new RangeError("offset is required and must be finite number");
      if (!isFinite(i) || i <= 0) throw new RangeError("animationDuration (optional) must be finite positive number");
      const n = this.lc, s = performance.now();
      this.sn.ps({ Kc: (t2) => (t2 - s) / i >= 1, Gc: (e2) => {
        const r2 = (e2 - s) / i;
        return r2 >= 1 ? t : n + (t - n) * r2;
      } });
    }
    Pt(t, i) {
      this.Xu = true, this.Yu = t, this.Ku.Au(t, i), this.Rc();
    }
    Zc() {
      return this.Ju;
    }
    Xc() {
      return this.Qu;
    }
    Jc() {
      return this.tc;
    }
    Dc() {
      return this.qu || 0;
    }
    Qc(t, i) {
      const n = t.Iu(), s = i && this.yn.rightOffsetPixels || 0;
      this.zc((this.k_ - s) / n), this.lc = t.bi() - this.Dc(), i && (this.lc = s ? s / this.ml() : this.yn.rightOffset), this.Rc(), this.Xu = true, this.sn.Lc(), this.sn.mr();
    }
    td() {
      const t = this.yc(), i = this.Pc();
      if (null === t || null === i) return;
      const n = !this.yn.rightOffsetPixels && this.yn.rightOffset || 0;
      this.Qc(new Ai(t, i + n), true);
    }
    nd(t) {
      const i = new Ai(t.from, t.to);
      this.Qc(i);
    }
    rn(t) {
      return void 0 !== this.Do.timeFormatter ? this.Do.timeFormatter(t.originalTime) : this.Pu.formatHorzItem(t.time);
    }
    dc() {
      if (!this.yn.ignoreWhitespaceIndices) return;
      this.ec.clear();
      const t = this.sn.Jn();
      for (const i of t) for (const t2 of i.fl()) this.ec.set(t2, true);
      this.rc++;
    }
    sd() {
      return this.ac;
    }
    Sl() {
      const t = 1 / (window.devicePixelRatio || 1), i = this.yn.minBarSpacing;
      if (i >= t) return [1];
      const n = [1];
      let s = 2;
      for (; s <= 512; ) {
        i < t / s && n.push(s), s *= 2;
      }
      return n;
    }
    Nc() {
      const t = this.sn.N().handleScroll, i = this.sn.N().handleScale;
      return !(t.horzTouchDrag || t.mouseWheel || t.pressedMouseMove || t.vertTouchDrag || i.axisDoubleClickReset.time || i.axisPressedMouseMove.time || i.mouseWheel || i.pinch);
    }
    yc() {
      return 0 === this.Yu.length ? null : 0;
    }
    Pc() {
      return 0 === this.Yu.length ? null : this.Yu.length - 1;
    }
    ed(t) {
      return (this.k_ - 1 - t) / this.oc;
    }
    Bc(t) {
      const i = this.ed(t), n = this.Dc() + this.lc - i;
      return Math.round(1e6 * n) / 1e6;
    }
    zc(t) {
      const i = this.oc;
      this.oc = t, this.Tc(), i !== this.oc && (this.Xu = true, this.rd(), this.cc());
    }
    bc() {
      if (!this.Xu) return;
      if (this.Xu = false, this.Zi()) return void this.hd(Oi.ju());
      const t = this.Dc(), i = this.k_ / this.oc, n = this.lc + t, s = new Ai(n - i + 1, n);
      this.hd(new Oi(s));
    }
    Tc() {
      const t = ni(this.oc, this.ad(), this.ld());
      this.oc !== t && (this.oc = t, this.Xu = true);
    }
    ld() {
      return this.yn.maxBarSpacing > 0 ? this.yn.maxBarSpacing : 0.5 * this.k_;
    }
    ad() {
      return this.yn.fixLeftEdge && this.yn.fixRightEdge && 0 !== this.Yu.length ? this.k_ / this.Yu.length : this.yn.minBarSpacing;
    }
    cc() {
      if (!this.yn.enableConflation) return void (this.ac = 1);
      const t = 1 / (window.devicePixelRatio || 1) * (this.yn.conflationThresholdFactor ?? 1);
      if (this.oc >= t) return void (this.ac = 1);
      const i = t / this.oc, n = Math.pow(2, Math.floor(Math.log2(i)));
      this.ac = Math.min(n, 512);
    }
    Rc() {
      const t = this.od();
      null !== t && this.lc < t && (this.lc = t, this.Xu = true);
      const i = this._d();
      this.lc > i && (this.lc = i, this.Xu = true);
    }
    od() {
      const t = this.yc(), i = this.qu;
      if (null === t || null === i) return null;
      return t - i - 1 + (this.yn.fixLeftEdge ? this.k_ / this.oc : Math.min(2, this.Yu.length));
    }
    _d() {
      return this.yn.fixRightEdge ? 0 : this.k_ / this.oc - Math.min(2, this.Yu.length);
    }
    $c() {
      this.nc = { ml: this.ml(), Oc: this.Oc() };
    }
    jc() {
      this.nc = null;
    }
    Fc(t) {
      let i = this.Gu.get(t.weight);
      return void 0 === i && (i = new Ei(((t2) => this.ud(t2)), this.Pu), this.Gu.set(t.weight, i)), i.ku(t);
    }
    ud(t) {
      return this.Pu.formatTickmark(t, this.Do);
    }
    hd(t) {
      const i = this.Zu;
      this.Zu = t, Li(i.Uu(), this.Zu.Uu()) || this.Ju.p(), Li(i.$u(), this.Zu.$u()) || this.Qu.p(), this.rd();
    }
    rd() {
      this.sc = null;
    }
    vc() {
      this.rd(), this.Gu.clear();
    }
    uc() {
      this.Pu.updateFormatter(this.Do);
    }
    mc() {
      if (!this.yn.fixLeftEdge) return;
      const t = this.yc();
      if (null === t) return;
      const i = this.Ee();
      if (null === i) return;
      const n = i.Na() - t;
      if (n < 0) {
        const t2 = this.lc - n - 1;
        this.gs(t2);
      }
      this.Tc();
    }
    wc() {
      this.Rc(), this.Tc();
    }
    Ec(t) {
      return !this.yn.ignoreWhitespaceIndices || (this.ec.get(t) || false);
    }
    Ac(t) {
      const i = (function* (t2) {
        const i2 = Math.round(t2), n2 = i2 < t2;
        let s = 1;
        for (; ; ) n2 ? (yield i2 + s, yield i2 - s) : (yield i2 - s, yield i2 + s), s++;
      })(t), n = this.Pc();
      for (; n; ) {
        const t2 = i.next().value;
        if (this.ec.get(t2)) return t2;
        if (t2 < 0 || t2 > n) break;
      }
      return t;
    }
    _c(t) {
      if (void 0 !== t.rightOffsetPixels) {
        const i = t.rightOffsetPixels / (t.barSpacing || this.oc);
        this.sn.gs(i);
      }
    }
  };
  var Wi;
  var Hi;
  var Ui;
  var $i;
  var ji;
  !(function(t) {
    t[t.OnTouchEnd = 0] = "OnTouchEnd", t[t.OnNextTap = 1] = "OnNextTap";
  })(Wi || (Wi = {}));
  var qi = class {
    constructor(t, i, n) {
      this.dd = [], this.fd = [], this.pd = null, this.k_ = 0, this.vd = null, this.md = new d(), this.wd = new d(), this.Md = null, this.gd = t, this.yn = i, this.Pu = n, this.Io = new k(this.yn.layout.colorParsers), this.bd = new C(this), this.ia = new Fi(this, i.timeScale, this.yn.localization, n), this.Ct = new G(this, i.crosshair), this.Sd = new ii(i.crosshair), i.addDefaultPane && (this.xd(0), this.dd[0].W_(2)), this.Cd = this.yd(0), this.Pd = this.yd(1);
    }
    ka() {
      this.kd(X.ys());
    }
    mr() {
      this.kd(X.Cs());
    }
    Ya() {
      this.kd(new X(1));
    }
    Ta(t) {
      const i = this.Td(t);
      this.kd(i);
    }
    cu() {
      return this.vd;
    }
    Rd(t) {
      if (this.vd?.uu === t?.uu && this.vd?.bu?.te === t?.bu?.te && this.vd?.bu?.ie === t?.bu?.ie && this.vd?.gu === t?.gu && this.vd?.ee === t?.ee) return;
      const i = this.vd;
      this.vd = t, null !== i && this.Ta(i.uu), null !== t && t.uu !== i?.uu && this.Ta(t.uu);
    }
    N() {
      return this.yn;
    }
    vr(t) {
      f(this.yn, t), this.dd.forEach(((i) => i.z_(t))), void 0 !== t.timeScale && this.ia.vr(t.timeScale), void 0 !== t.localization && this.ia.fc(t.localization), (t.leftPriceScale || t.rightPriceScale) && this.md.p(), this.Cd = this.yd(0), this.Pd = this.yd(1), this.ka();
    }
    Dd(t, i, n = 0) {
      const s = this.dd[n];
      if (void 0 === s) return;
      if ("left" === t) return f(this.yn, { leftPriceScale: i }), s.z_({ leftPriceScale: i }), this.md.p(), void this.ka();
      if ("right" === t) return f(this.yn, { rightPriceScale: i }), s.z_({ rightPriceScale: i }), this.md.p(), void this.ka();
      const e2 = this.Id(t, n);
      null !== e2 && (e2.Ft.vr(i), this.md.p());
    }
    Id(t, i) {
      const n = this.dd[i];
      if (void 0 === n) return null;
      const s = n.O_(t);
      return null !== s ? { Kn: n, Ft: s } : null;
    }
    Et() {
      return this.ia;
    }
    Gn() {
      return this.dd;
    }
    Vd() {
      return this.Ct;
    }
    Bd() {
      return this.wd;
    }
    Ed(t, i) {
      t.$o(i), this.Lc();
    }
    H_(t) {
      this.k_ = t, this.ia.H_(this.k_), this.dd.forEach(((i) => i.H_(t))), this.Lc();
    }
    Ad(t) {
      1 !== this.dd.length && (o(t >= 0 && t < this.dd.length, "Invalid pane index"), this.dd.splice(t, 1), this.ka());
    }
    Ld(t, i) {
      if (this.dd.length < 2) return;
      o(t >= 0 && t < this.dd.length, "Invalid pane index");
      const n = this.dd[t], s = this.dd.reduce(((t2, i2) => t2 + i2.F_()), 0), e2 = this.dd.reduce(((t2, i2) => t2 + i2.$t()), 0), r2 = e2 - 30 * (this.dd.length - 1);
      i = Math.min(r2, Math.max(30, i));
      const h2 = s / e2, a2 = n.$t();
      n.W_(i * h2);
      let l2 = i - a2, _2 = this.dd.length - 1;
      for (const t2 of this.dd) if (t2 !== n) {
        const i2 = Math.min(r2, Math.max(30, t2.$t() - l2 / _2));
        l2 -= t2.$t() - i2, _2 -= 1;
        const n2 = i2 * h2;
        t2.W_(n2);
      }
      this.ka();
    }
    zd(t, i) {
      o(t >= 0 && t < this.dd.length && i >= 0 && i < this.dd.length, "Invalid pane index");
      const n = this.dd[t], s = this.dd[i];
      this.dd[t] = s, this.dd[i] = n, this.ka();
    }
    Od(t, i) {
      if (o(t >= 0 && t < this.dd.length && i >= 0 && i < this.dd.length, "Invalid pane index"), t === i) return;
      const [n] = this.dd.splice(t, 1);
      this.dd.splice(i, 0, n), this.ka();
    }
    Q_(t, i, n) {
      t.Q_(i, n);
    }
    tu(t, i, n) {
      t.tu(i, n), this.Ra(), this.kd(this.Nd(t, 2));
    }
    iu(t, i) {
      t.iu(i), this.kd(this.Nd(t, 2));
    }
    nu(t, i, n) {
      i.zo() || t.nu(i, n);
    }
    su(t, i, n) {
      i.zo() || (t.su(i, n), this.Ra(), this.kd(this.Nd(t, 2)));
    }
    eu(t, i) {
      i.zo() || (t.eu(i), this.kd(this.Nd(t, 2)));
    }
    au(t, i) {
      t.au(i), this.kd(this.Nd(t, 2));
    }
    Fd(t) {
      this.ia.u_(t);
    }
    Wd(t, i) {
      const n = this.Et();
      if (n.Zi() || 0 === i) return;
      const s = n.nn();
      t = Math.max(1, Math.min(t, s)), n.Uc(t, i), this.Lc();
    }
    Hd(t) {
      this.Ud(0), this.$d(t), this.jd();
    }
    qd(t) {
      this.ia.c_(t), this.Lc();
    }
    Yd() {
      this.ia.d_(), this.mr();
    }
    Ud(t) {
      this.ia.f_(t);
    }
    $d(t) {
      this.ia.p_(t), this.Lc();
    }
    jd() {
      this.ia.v_(), this.mr();
    }
    Jn() {
      return this.fd;
    }
    Wn() {
      return null === this.pd && (this.pd = this.fd.filter(((t) => t.It()))), this.pd;
    }
    Pa() {
      this.pd = null;
    }
    Kd(t, i, n, s, e2) {
      this.Ct.In(t, i);
      let r2 = NaN, h2 = this.ia.Vc(t, true);
      const a2 = this.ia.Ee();
      null !== a2 && (h2 = Math.min(Math.max(a2.Na(), h2), a2.bi())), h2 = this.Ct.Fn(h2);
      const l2 = s.kn(), o2 = l2.Lt();
      if (null !== o2 && (r2 = l2.Tn(i, o2)), r2 = this.Sd.Pl(r2, h2, s), this.Ct.An(h2, r2, s), this.Ya(), !e2) {
        const e3 = Bi(s, t, i);
        this.Rd(e3 && { uu: e3.uu, bu: e3.bu, gu: e3.gu || null, ee: e3.ee }), this.wd.p(this.Ct.Bt(), { x: t, y: i }, n);
      }
    }
    Gd(t, i, n) {
      const s = n.kn(), e2 = s.Lt(), r2 = s.Nt(t, u(e2)), h2 = this.ia.Mc(i, true), a2 = this.ia.jt(u(h2));
      this.Kd(a2, r2, null, n, true);
    }
    Zd(t) {
      this.Vd().zn(), this.Ya(), t || this.wd.p(null, null, null);
    }
    Ra() {
      const t = this.Ct.Kn();
      if (null !== t) {
        const i = this.Ct.Bn(), n = this.Ct.En();
        this.Kd(i, n, null, t);
      }
      this.Ct.Nn();
    }
    Xd(t, i, n) {
      const s = this.ia.Rn(0);
      void 0 !== i && void 0 !== n && this.ia.Pt(i, n);
      const e2 = this.ia.Rn(0), r2 = this.ia.Dc(), h2 = this.ia.Ee();
      if (null !== h2 && null !== s && null !== e2) {
        const i2 = h2.ze(r2), a2 = this.Pu.key(s) > this.Pu.key(e2), l2 = null !== t && t > r2 && !a2, o2 = this.ia.N().allowShiftVisibleRangeOnWhitespaceReplacement, _2 = i2 && (!(void 0 === n) || o2) && this.ia.N().shiftVisibleRangeOnNewBar;
        if (l2 && !_2) {
          const i3 = t - r2;
          this.ia.gs(this.ia.Oc() - i3);
        }
      }
      this.ia.Hc(t);
    }
    Ba(t) {
      null !== t && t.ou();
    }
    Ks(t) {
      if ((function(t2) {
        return t2 instanceof Pi;
      })(t)) return t;
      const i = this.dd.find(((i2) => i2.Dt().includes(t)));
      return void 0 === i ? null : i;
    }
    Lc() {
      this.dd.forEach(((t) => t.ou())), this.Ra();
    }
    m() {
      this.dd.forEach(((t) => t.m())), this.dd.length = 0, this.yn.localization.priceFormatter = void 0, this.yn.localization.percentageFormatter = void 0, this.yn.localization.timeFormatter = void 0;
    }
    Jd() {
      return this.bd;
    }
    Js() {
      return this.bd.N();
    }
    N_() {
      return this.md;
    }
    Qd(t, i) {
      const n = this.xd(i);
      this.tf(t, n), this.fd.push(t), this.Pa(), 1 === this.fd.length ? this.ka() : this.mr();
    }
    if(t) {
      const i = this.Ks(t), n = this.fd.indexOf(t);
      o(-1 !== n, "Series not found");
      const s = u(i);
      this.fd.splice(n, 1), s.l_(t), t.m && t.m(), this.Pa(), this.ia.dc(), this.nf(s);
    }
    ya(t, i) {
      const n = u(this.Ks(t));
      n.l_(t, true), n.h_(t, i, true);
    }
    td() {
      const t = X.Cs();
      t.us(), this.kd(t);
    }
    sf(t) {
      const i = X.Cs();
      i.fs(t), this.kd(i);
    }
    ws() {
      const t = X.Cs();
      t.ws(), this.kd(t);
    }
    Ms(t) {
      const i = X.Cs();
      i.Ms(t), this.kd(i);
    }
    gs(t) {
      const i = X.Cs();
      i.gs(t), this.kd(i);
    }
    ps(t) {
      const i = X.Cs();
      i.ps(t), this.kd(i);
    }
    cs() {
      const t = X.Cs();
      t.cs(), this.kd(t);
    }
    ef() {
      const t = this.yn.defaultVisiblePriceScaleId, i = this.yn.leftPriceScale.visible;
      return i !== this.yn.rightPriceScale.visible ? i ? "left" : "right" : t;
    }
    rf(t, i) {
      o(i >= 0, "Index should be greater or equal to 0");
      if (i === this.hf(t)) return;
      const n = u(this.Ks(t));
      n.l_(t);
      const s = this.xd(i);
      this.tf(t, s);
      let e2 = false;
      0 === n.kl().length && (e2 = this.nf(n)), e2 || this.ka();
    }
    af() {
      return this.Pd;
    }
    $() {
      return this.Cd;
    }
    Ut(t) {
      const i = this.Pd, n = this.Cd;
      if (i === n) return i;
      if (t = Math.max(0, Math.min(100, Math.round(100 * t))), null === this.Md || this.Md.ah !== n || this.Md.oh !== i) this.Md = { ah: n, oh: i, lf: /* @__PURE__ */ new Map() };
      else {
        const i2 = this.Md.lf.get(t);
        if (void 0 !== i2) return i2;
      }
      const s = this.Io.tt(n, i, t / 100);
      return this.Md.lf.set(t, s), s;
    }
    _f(t) {
      return this.dd.indexOf(t);
    }
    Xi() {
      return this.Io;
    }
    uf() {
      return this.cf();
    }
    cf(t) {
      const i = new Pi(this.ia, this);
      this.dd.push(i);
      const n = t ?? this.dd.length - 1, s = X.ys();
      return s.es(n, { rs: 0, hs: true }), this.kd(s), i;
    }
    xd(t) {
      return o(t >= 0, "Index should be greater or equal to 0"), (t = Math.min(this.dd.length, t)) < this.dd.length ? this.dd[t] : this.cf(t);
    }
    hf(t) {
      return this.dd.findIndex(((i) => i.Y_().includes(t)));
    }
    Nd(t, i) {
      const n = new X(i);
      if (null !== t) {
        const s = this.dd.indexOf(t);
        n.es(s, { rs: i });
      }
      return n;
    }
    Td(t, i) {
      return void 0 === i && (i = 2), this.Nd(this.Ks(t), i);
    }
    kd(t) {
      this.gd && this.gd(t), this.dd.forEach(((t2) => t2.wu().wr().Pt()));
    }
    tf(t, i) {
      const n = t.N().priceScaleId, s = void 0 !== n ? n : this.ef();
      i.h_(t, s), Z(s) || t.vr(t.N());
    }
    yd(t) {
      const i = this.yn.layout;
      return "gradient" === i.background.type ? 0 === t ? i.background.topColor : i.background.bottomColor : i.background.color;
    }
    nf(t) {
      return !t.q_() && 0 === t.kl().length && this.dd.length > 1 && (this.dd.splice(this._f(t), 1), this.ka(), true);
    }
  };
  function Yi(t) {
    if (t >= 1) return 0;
    let i = 0;
    for (; i < 8; i++) {
      const n = Math.round(t);
      if (Math.abs(n - t) < 1e-8) return i;
      t *= 10;
    }
    return i;
  }
  function Ki(t) {
    return !p(t) && !m(t);
  }
  function Gi(t) {
    return p(t);
  }
  !(function(t) {
    t[t.Disabled = 0] = "Disabled", t[t.Continuous = 1] = "Continuous", t[t.OnDataUpdate = 2] = "OnDataUpdate";
  })(Hi || (Hi = {})), (function(t) {
    t[t.LastBar = 0] = "LastBar", t[t.LastVisible = 1] = "LastVisible";
  })(Ui || (Ui = {})), (function(t) {
    t.Solid = "solid", t.VerticalGradient = "gradient";
  })($i || ($i = {})), (function(t) {
    t[t.Year = 0] = "Year", t[t.Month = 1] = "Month", t[t.DayOfMonth = 2] = "DayOfMonth", t[t.Time = 3] = "Time", t[t.TimeWithSeconds = 4] = "TimeWithSeconds";
  })(ji || (ji = {}));
  var Zi = (t) => t.getUTCFullYear();
  function Xi(t, i, n) {
    return i.replace(/yyyy/g, ((t2) => tt(Zi(t2), 4))(t)).replace(/yy/g, ((t2) => tt(Zi(t2) % 100, 2))(t)).replace(/MMMM/g, ((t2, i2) => new Date(t2.getUTCFullYear(), t2.getUTCMonth(), 1).toLocaleString(i2, { month: "long" }))(t, n)).replace(/MMM/g, ((t2, i2) => new Date(t2.getUTCFullYear(), t2.getUTCMonth(), 1).toLocaleString(i2, { month: "short" }))(t, n)).replace(/MM/g, ((t2) => tt(((t3) => t3.getUTCMonth() + 1)(t2), 2))(t)).replace(/dd/g, ((t2) => tt(((t3) => t3.getUTCDate())(t2), 2))(t));
  }
  var Ji = class {
    constructor(t = "yyyy-MM-dd", i = "default") {
      this.df = t, this.ff = i;
    }
    ku(t) {
      return Xi(t, this.df, this.ff);
    }
  };
  var Qi = class {
    constructor(t) {
      this.pf = t || "%h:%m:%s";
    }
    ku(t) {
      return this.pf.replace("%h", tt(t.getUTCHours(), 2)).replace("%m", tt(t.getUTCMinutes(), 2)).replace("%s", tt(t.getUTCSeconds(), 2));
    }
  };
  var tn = { vf: "yyyy-MM-dd", mf: "%h:%m:%s", wf: " ", Mf: "default" };
  var nn = class {
    constructor(t = {}) {
      const i = { ...tn, ...t };
      this.gf = new Ji(i.vf, i.Mf), this.bf = new Qi(i.mf), this.Sf = i.wf;
    }
    ku(t) {
      return `${this.gf.ku(t)}${this.Sf}${this.bf.ku(t)}`;
    }
  };
  function sn(t) {
    return 60 * t * 60 * 1e3;
  }
  function en(t) {
    return 60 * t * 1e3;
  }
  var rn = [{ xf: (hn = 1, 1e3 * hn), Cf: 10 }, { xf: en(1), Cf: 20 }, { xf: en(5), Cf: 21 }, { xf: en(30), Cf: 22 }, { xf: sn(1), Cf: 30 }, { xf: sn(3), Cf: 31 }, { xf: sn(6), Cf: 32 }, { xf: sn(12), Cf: 33 }];
  var hn;
  function an(t, i) {
    if (t.getUTCFullYear() !== i.getUTCFullYear()) return 70;
    if (t.getUTCMonth() !== i.getUTCMonth()) return 60;
    if (t.getUTCDate() !== i.getUTCDate()) return 50;
    for (let n = rn.length - 1; n >= 0; --n) if (Math.floor(i.getTime() / rn[n].xf) !== Math.floor(t.getTime() / rn[n].xf)) return rn[n].Cf;
    return 0;
  }
  function ln(t) {
    let i = t;
    if (m(t) && (i = _n(t)), !Ki(i)) throw new Error("time must be of type BusinessDay");
    const n = new Date(Date.UTC(i.year, i.month - 1, i.day, 0, 0, 0, 0));
    return { yf: Math.round(n.getTime() / 1e3), Pf: i };
  }
  function on(t) {
    if (!Gi(t)) throw new Error("time must be of type isUTCTimestamp");
    return { yf: t };
  }
  function _n(t) {
    const i = new Date(t);
    if (isNaN(i.getTime())) throw new Error(`Invalid date string=${t}, expected format=yyyy-mm-dd`);
    return { day: i.getUTCDate(), month: i.getUTCMonth() + 1, year: i.getUTCFullYear() };
  }
  function un(t) {
    m(t.time) && (t.time = _n(t.time));
  }
  var cn = class {
    options() {
      return this.yn;
    }
    setOptions(t) {
      this.yn = t, this.updateFormatter(t.localization);
    }
    preprocessData(t) {
      Array.isArray(t) ? (function(t2) {
        t2.forEach(un);
      })(t) : un(t);
    }
    createConverterToInternalObj(t) {
      return u((function(t2) {
        return 0 === t2.length ? null : Ki(t2[0].time) || m(t2[0].time) ? ln : on;
      })(t));
    }
    key(t) {
      return "object" == typeof t && "yf" in t ? t.yf : this.key(this.convertHorzItemToInternal(t));
    }
    cacheKey(t) {
      const i = t;
      return void 0 === i.Pf ? new Date(1e3 * i.yf).getTime() : new Date(Date.UTC(i.Pf.year, i.Pf.month - 1, i.Pf.day)).getTime();
    }
    convertHorzItemToInternal(t) {
      return Gi(i = t) ? on(i) : Ki(i) ? ln(i) : ln(_n(i));
      var i;
    }
    updateFormatter(t) {
      if (!this.yn) return;
      const i = t.dateFormat;
      this.yn.timeScale.timeVisible ? this.kf = new nn({ vf: i, mf: this.yn.timeScale.secondsVisible ? "%h:%m:%s" : "%h:%m", wf: "   ", Mf: t.locale }) : this.kf = new Ji(i, t.locale);
    }
    formatHorzItem(t) {
      const i = t;
      return this.kf.ku(new Date(1e3 * i.yf));
    }
    formatTickmark(t, i) {
      const n = (function(t2, i2, n2) {
        switch (t2) {
          case 0:
          case 10:
            return i2 ? n2 ? 4 : 3 : 2;
          case 20:
          case 21:
          case 22:
          case 30:
          case 31:
          case 32:
          case 33:
            return i2 ? 3 : 2;
          case 50:
            return 2;
          case 60:
            return 1;
          case 70:
            return 0;
        }
      })(t.weight, this.yn.timeScale.timeVisible, this.yn.timeScale.secondsVisible), s = this.yn.timeScale;
      if (void 0 !== s.tickMarkFormatter) {
        const e2 = s.tickMarkFormatter(t.originalTime, n, i.locale);
        if (null !== e2) return e2;
      }
      return (function(t2, i2, n2) {
        const s2 = {};
        switch (i2) {
          case 0:
            s2.year = "numeric";
            break;
          case 1:
            s2.month = "short";
            break;
          case 2:
            s2.day = "numeric";
            break;
          case 3:
            s2.hour12 = false, s2.hour = "2-digit", s2.minute = "2-digit";
            break;
          case 4:
            s2.hour12 = false, s2.hour = "2-digit", s2.minute = "2-digit", s2.second = "2-digit";
        }
        const e2 = void 0 === t2.Pf ? new Date(1e3 * t2.yf) : new Date(Date.UTC(t2.Pf.year, t2.Pf.month - 1, t2.Pf.day));
        return new Date(e2.getUTCFullYear(), e2.getUTCMonth(), e2.getUTCDate(), e2.getUTCHours(), e2.getUTCMinutes(), e2.getUTCSeconds(), e2.getUTCMilliseconds()).toLocaleString(n2, s2);
      })(t.time, n, i.locale);
    }
    maxTickMarkWeight(t) {
      let i = t.reduce(Ni, t[0]).weight;
      return i > 30 && i < 50 && (i = 30), i;
    }
    fillWeightsForPoints(t, i) {
      !(function(t2, i2 = 0) {
        if (0 === t2.length) return;
        let n = 0 === i2 ? null : t2[i2 - 1].time.yf, s = null !== n ? new Date(1e3 * n) : null, e2 = 0;
        for (let r2 = i2; r2 < t2.length; ++r2) {
          const i3 = t2[r2], h2 = new Date(1e3 * i3.time.yf);
          null !== s && (i3.timeWeight = an(h2, s)), e2 += i3.time.yf - (n || i3.time.yf), n = i3.time.yf, s = h2;
        }
        if (0 === i2 && t2.length > 1) {
          const i3 = Math.ceil(e2 / (t2.length - 1)), n2 = new Date(1e3 * (t2[0].time.yf - i3));
          t2[0].timeWeight = an(new Date(1e3 * t2[0].time.yf), n2);
        }
      })(t, i);
    }
    static Tf(t) {
      return f({ localization: { dateFormat: "dd MMM 'yy" } }, t ?? {});
    }
  };
  var dn = "undefined" != typeof window;
  function fn() {
    return !!dn && window.navigator.userAgent.toLowerCase().indexOf("firefox") > -1;
  }
  function pn() {
    return !!dn && /iPhone|iPad|iPod/.test(window.navigator.platform);
  }
  function vn(t, i) {
    switch (t) {
      case "custom":
        return void 0 !== i ? "custom-object" : "series";
      case "price-line":
        return "custom-price-line";
      case "marker":
        return "series-marker";
      case "primitive":
        return "primitive";
      default:
        return "series";
    }
  }
  function mn(t) {
    return t + t % 2;
  }
  function wn(t) {
    dn && void 0 !== window.chrome && t.addEventListener("mousedown", ((t2) => {
      if (1 === t2.button) return t2.preventDefault(), false;
    }));
  }
  var Mn = class {
    constructor(t, i, n) {
      this.Rf = 0, this.Df = null, this.If = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY }, this.Vf = 0, this.Bf = null, this.Ef = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY }, this.Af = null, this.Lf = false, this.zf = null, this.Of = null, this.Nf = false, this.Ff = false, this.Wf = false, this.Hf = null, this.Uf = null, this.$f = null, this.jf = null, this.qf = null, this.Yf = null, this.Kf = null, this.Gf = 0, this.Zf = false, this.Xf = false, this.Jf = false, this.Qf = 0, this.tp = null, this.ip = !pn(), this.np = (t2) => {
        this.sp(t2);
      }, this.ep = (t2) => {
        if (this.rp(t2)) {
          const i2 = this.hp(t2);
          if (++this.Vf, this.Bf && this.Vf > 1) {
            const { ap: n2 } = this.lp(Sn(t2), this.Ef);
            n2 < 30 && !this.Wf && this.op(i2, this.up._p), this.cp();
          }
        } else {
          const i2 = this.hp(t2);
          if (++this.Rf, this.Df && this.Rf > 1) {
            const { ap: n2 } = this.lp(Sn(t2), this.If);
            n2 < 5 && !this.Ff && this.dp(i2, this.up.fp), this.pp();
          }
        }
      }, this.vp = t, this.up = i, this.yn = n, this.mp();
    }
    m() {
      null !== this.Hf && (this.Hf(), this.Hf = null), null !== this.Uf && (this.Uf(), this.Uf = null), null !== this.jf && (this.jf(), this.jf = null), null !== this.qf && (this.qf(), this.qf = null), null !== this.Yf && (this.Yf(), this.Yf = null), null !== this.$f && (this.$f(), this.$f = null), this.wp(), this.pp();
    }
    Mp(t) {
      this.jf && this.jf();
      const i = this.gp.bind(this);
      if (this.jf = () => {
        this.vp.removeEventListener("mousemove", i);
      }, this.vp.addEventListener("mousemove", i), this.rp(t)) return;
      const n = this.hp(t);
      this.dp(n, this.up.bp), this.ip = true;
    }
    pp() {
      null !== this.Df && clearTimeout(this.Df), this.Rf = 0, this.Df = null, this.If = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY };
    }
    cp() {
      null !== this.Bf && clearTimeout(this.Bf), this.Vf = 0, this.Bf = null, this.Ef = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY };
    }
    gp(t) {
      if (this.Jf || null !== this.Of) return;
      if (this.rp(t)) return;
      const i = this.hp(t);
      this.dp(i, this.up.Sp), this.ip = true;
    }
    xp(t) {
      const i = Cn(t.changedTouches, u(this.tp));
      if (null === i) return;
      if (this.Qf = xn(t), null !== this.Kf) return;
      if (this.Xf) return;
      this.Zf = true;
      const n = this.lp(Sn(i), u(this.Of)), { Cp: s, yp: e2, ap: r2 } = n;
      if (this.Nf || !(r2 < 5)) {
        if (!this.Nf) {
          const t2 = 0.5 * s, i2 = e2 >= t2 && !this.yn.Pp(), n2 = t2 > e2 && !this.yn.kp();
          i2 || n2 || (this.Xf = true), this.Nf = true, this.Wf = true, this.wp(), this.cp();
        }
        if (!this.Xf) {
          const n2 = this.hp(t, i);
          this.op(n2, this.up.Tp), bn(t);
        }
      }
    }
    Rp(t) {
      if (0 !== t.button) return;
      const i = this.lp(Sn(t), u(this.zf)), { ap: n } = i;
      if (n >= 5 && (this.Ff = true, this.pp()), this.Ff) {
        const i2 = this.hp(t);
        this.dp(i2, this.up.Dp);
      }
    }
    lp(t, i) {
      const n = Math.abs(i._t - t._t), s = Math.abs(i.ut - t.ut);
      return { Cp: n, yp: s, ap: n + s };
    }
    Ip(t) {
      let i = Cn(t.changedTouches, u(this.tp));
      if (null === i && 0 === t.touches.length && (i = t.changedTouches[0]), null === i) return;
      this.tp = null, this.Qf = xn(t), this.wp(), this.Of = null, this.Yf && (this.Yf(), this.Yf = null);
      const n = this.hp(t, i);
      if (this.op(n, this.up.Vp), ++this.Vf, this.Bf && this.Vf > 1) {
        const { ap: t2 } = this.lp(Sn(i), this.Ef);
        t2 < 30 && !this.Wf && this.op(n, this.up._p), this.cp();
      } else this.Wf || (this.op(n, this.up.Bp), this.up.Bp && bn(t));
      0 === this.Vf && bn(t), 0 === t.touches.length && this.Lf && (this.Lf = false, bn(t));
    }
    sp(t) {
      if (0 !== t.button) return;
      const i = this.hp(t);
      if (this.zf = null, this.Jf = false, this.qf && (this.qf(), this.qf = null), fn()) {
        this.vp.ownerDocument.documentElement.removeEventListener("mouseleave", this.np);
      }
      if (!this.rp(t)) if (this.dp(i, this.up.Ep), ++this.Rf, this.Df && this.Rf > 1) {
        const { ap: n } = this.lp(Sn(t), this.If);
        n < 5 && !this.Ff && this.dp(i, this.up.fp), this.pp();
      } else this.Ff || this.dp(i, this.up.Ap);
    }
    wp() {
      null !== this.Af && (clearTimeout(this.Af), this.Af = null);
    }
    Lp(t) {
      if (null !== this.tp) return;
      const i = t.changedTouches[0];
      this.tp = i.identifier, this.Qf = xn(t);
      const n = this.vp.ownerDocument.documentElement;
      this.Wf = false, this.Nf = false, this.Xf = false, this.Of = Sn(i), this.Yf && (this.Yf(), this.Yf = null);
      {
        const i2 = this.xp.bind(this), s2 = this.Ip.bind(this);
        this.Yf = () => {
          n.removeEventListener("touchmove", i2), n.removeEventListener("touchend", s2);
        }, n.addEventListener("touchmove", i2, { passive: false }), n.addEventListener("touchend", s2, { passive: false }), this.wp(), this.Af = setTimeout(this.zp.bind(this, t), 240);
      }
      const s = this.hp(t, i);
      this.op(s, this.up.Op), this.Bf || (this.Vf = 0, this.Bf = setTimeout(this.cp.bind(this), 500), this.Ef = Sn(i));
    }
    Np(t) {
      if (0 !== t.button) return;
      const i = this.vp.ownerDocument.documentElement;
      fn() && i.addEventListener("mouseleave", this.np), this.Ff = false, this.zf = Sn(t), this.qf && (this.qf(), this.qf = null);
      {
        const t2 = this.Rp.bind(this), n2 = this.sp.bind(this);
        this.qf = () => {
          i.removeEventListener("mousemove", t2), i.removeEventListener("mouseup", n2);
        }, i.addEventListener("mousemove", t2), i.addEventListener("mouseup", n2);
      }
      if (this.Jf = true, this.rp(t)) return;
      const n = this.hp(t);
      this.dp(n, this.up.Fp), this.Df || (this.Rf = 0, this.Df = setTimeout(this.pp.bind(this), 500), this.If = Sn(t));
    }
    mp() {
      this.vp.addEventListener("mouseenter", this.Mp.bind(this)), this.vp.addEventListener("touchcancel", this.wp.bind(this));
      {
        const t = this.vp.ownerDocument, i = (t2) => {
          this.up.Wp && (t2.composed && this.vp.contains(t2.composedPath()[0]) || t2.target && this.vp.contains(t2.target) || this.up.Wp());
        };
        this.Uf = () => {
          t.removeEventListener("touchstart", i);
        }, this.Hf = () => {
          t.removeEventListener("mousedown", i);
        }, t.addEventListener("mousedown", i), t.addEventListener("touchstart", i, { passive: true });
      }
      pn() && (this.$f = () => {
        this.vp.removeEventListener("dblclick", this.ep);
      }, this.vp.addEventListener("dblclick", this.ep)), this.vp.addEventListener("mouseleave", this.Hp.bind(this)), this.vp.addEventListener("touchstart", this.Lp.bind(this), { passive: true }), wn(this.vp), this.vp.addEventListener("mousedown", this.Np.bind(this)), this.Up(), this.vp.addEventListener("touchmove", (() => {
      }), { passive: false });
    }
    Up() {
      void 0 === this.up.$p && void 0 === this.up.jp && void 0 === this.up.qp || (this.vp.addEventListener("touchstart", ((t) => this.Yp(t.touches)), { passive: true }), this.vp.addEventListener("touchmove", ((t) => {
        if (2 === t.touches.length && null !== this.Kf && void 0 !== this.up.jp) {
          const i = gn(t.touches[0], t.touches[1]) / this.Gf;
          this.up.jp(this.Kf, i), bn(t);
        }
      }), { passive: false }), this.vp.addEventListener("touchend", ((t) => {
        this.Yp(t.touches);
      })));
    }
    Yp(t) {
      1 === t.length && (this.Zf = false), 2 !== t.length || this.Zf || this.Lf ? this.Kp() : this.Gp(t);
    }
    Gp(t) {
      const i = this.vp.getBoundingClientRect() || { left: 0, top: 0 };
      this.Kf = { _t: (t[0].clientX - i.left + (t[1].clientX - i.left)) / 2, ut: (t[0].clientY - i.top + (t[1].clientY - i.top)) / 2 }, this.Gf = gn(t[0], t[1]), void 0 !== this.up.$p && this.up.$p(), this.wp();
    }
    Kp() {
      null !== this.Kf && (this.Kf = null, void 0 !== this.up.qp && this.up.qp());
    }
    Hp(t) {
      if (this.jf && this.jf(), this.rp(t)) return;
      if (!this.ip) return;
      const i = this.hp(t);
      this.dp(i, this.up.Zp), this.ip = !pn();
    }
    zp(t) {
      const i = Cn(t.touches, u(this.tp));
      if (null === i) return;
      const n = this.hp(t, i);
      this.op(n, this.up.Xp), this.Wf = true, this.Lf = true;
    }
    rp(t) {
      return t.sourceCapabilities && void 0 !== t.sourceCapabilities.firesTouchEvents ? t.sourceCapabilities.firesTouchEvents : xn(t) < this.Qf + 500;
    }
    op(t, i) {
      i && i.call(this.up, t);
    }
    dp(t, i) {
      i && i.call(this.up, t);
    }
    hp(t, i) {
      const n = i || t, s = this.vp.getBoundingClientRect() || { left: 0, top: 0 };
      return { clientX: n.clientX, clientY: n.clientY, pageX: n.pageX, pageY: n.pageY, screenX: n.screenX, screenY: n.screenY, localX: n.clientX - s.left, localY: n.clientY - s.top, ctrlKey: t.ctrlKey, altKey: t.altKey, shiftKey: t.shiftKey, metaKey: t.metaKey, Jp: !t.type.startsWith("mouse") && "contextmenu" !== t.type && "click" !== t.type, Qp: t.type, tv: n.target, xu: t.view, iv: () => {
        "touchstart" !== t.type && bn(t);
      } };
    }
  };
  function gn(t, i) {
    const n = t.clientX - i.clientX, s = t.clientY - i.clientY;
    return Math.sqrt(n * n + s * s);
  }
  function bn(t) {
    t.cancelable && t.preventDefault();
  }
  function Sn(t) {
    return { _t: t.pageX, ut: t.pageY };
  }
  function xn(t) {
    return t.timeStamp || performance.now();
  }
  function Cn(t, i) {
    for (let n = 0; n < t.length; ++n) if (t[n].identifier === i) return t[n];
    return null;
  }
  var yn = class {
    constructor(t, i, n) {
      this.nv = null, this.sv = null, this.ev = true, this.rv = null, this.hv = t, this.av = t.lv()[i], this.ov = t.lv()[n], this._v = document.createElement("tr"), this._v.style.height = "1px", this.uv = document.createElement("td"), this.uv.style.position = "relative", this.uv.style.padding = "0", this.uv.style.margin = "0", this.uv.setAttribute("colspan", "3"), this.cv(), this._v.appendChild(this.uv), this.ev = this.hv.N().layout.panes.enableResize, this.ev ? this.dv() : (this.nv = null, this.sv = null);
    }
    m() {
      null !== this.sv && this.sv.m();
    }
    fv() {
      return this._v;
    }
    pv() {
      return size({ width: this.av.pv().width, height: 1 });
    }
    vv() {
      return size({ width: this.av.vv().width, height: 1 * window.devicePixelRatio });
    }
    mv(t, i, n) {
      const s = this.vv();
      t.fillStyle = this.hv.N().layout.panes.separatorColor, t.fillRect(i, n, s.width, s.height);
    }
    Pt() {
      this.cv(), this.hv.N().layout.panes.enableResize !== this.ev && (this.ev = this.hv.N().layout.panes.enableResize, this.ev ? this.dv() : (null !== this.nv && (this.uv.removeChild(this.nv.wv), this.uv.removeChild(this.nv.Mv), this.nv = null), null !== this.sv && (this.sv.m(), this.sv = null)));
    }
    dv() {
      const t = document.createElement("div"), i = t.style;
      i.position = "fixed", i.display = "none", i.zIndex = "49", i.top = "0", i.left = "0", i.width = "100%", i.height = "100%", i.cursor = "row-resize", this.uv.appendChild(t);
      const n = document.createElement("div"), s = n.style;
      s.position = "absolute", s.zIndex = "50", s.top = "-4px", s.height = "9px", s.width = "100%", s.backgroundColor = "", s.cursor = "row-resize", this.uv.appendChild(n);
      const e2 = { bp: this.gv.bind(this), Zp: this.bv.bind(this), Fp: this.Sv.bind(this), Op: this.Sv.bind(this), Dp: this.xv.bind(this), Tp: this.xv.bind(this), Ep: this.Cv.bind(this), Vp: this.Cv.bind(this) };
      this.sv = new Mn(n, e2, { Pp: () => false, kp: () => true }), this.nv = { Mv: n, wv: t };
    }
    cv() {
      this.uv.style.background = this.hv.N().layout.panes.separatorColor;
    }
    gv(t) {
      null !== this.nv && (this.nv.Mv.style.backgroundColor = this.hv.N().layout.panes.separatorHoverColor);
    }
    bv(t) {
      null !== this.nv && null === this.rv && (this.nv.Mv.style.backgroundColor = "");
    }
    Sv(t) {
      if (null === this.nv) return;
      const i = this.av.yv().F_() + this.ov.yv().F_(), n = i / (this.av.pv().height + this.ov.pv().height), s = 30 * n;
      i <= 2 * s || (this.rv = { Pv: t.pageY, kv: this.av.yv().F_(), Tv: i - s, Rv: i, Dv: n, Iv: s }, this.nv.wv.style.display = "block");
    }
    xv(t) {
      const i = this.rv;
      if (null === i) return;
      const n = (t.pageY - i.Pv) * i.Dv, s = ni(i.kv + n, i.Iv, i.Tv);
      this.av.yv().W_(s), this.ov.yv().W_(i.Rv - s), this.hv.Qt().ka();
    }
    Cv(t) {
      null !== this.rv && null !== this.nv && (this.rv = null, this.nv.wv.style.display = "none");
    }
  };
  function Pn(t, i) {
    return t.Vv - i.Vv;
  }
  function kn(t, i, n) {
    const s = (t.Vv - i.Vv) / (t.wt - i.wt);
    return Math.sign(s) * Math.min(Math.abs(s), n);
  }
  var Tn = class {
    constructor(t, i, n, s) {
      this.Bv = null, this.Ev = null, this.Av = null, this.Lv = null, this.zv = null, this.Ov = 0, this.Nv = 0, this.Fv = t, this.Wv = i, this.Hv = n, this.Ps = s;
    }
    Uv(t, i) {
      if (null !== this.Bv) {
        if (this.Bv.wt === i) return void (this.Bv.Vv = t);
        if (Math.abs(this.Bv.Vv - t) < this.Ps) return;
      }
      this.Lv = this.Av, this.Av = this.Ev, this.Ev = this.Bv, this.Bv = { wt: i, Vv: t };
    }
    me(t, i) {
      if (null === this.Bv || null === this.Ev) return;
      if (i - this.Bv.wt > 50) return;
      let n = 0;
      const s = kn(this.Bv, this.Ev, this.Wv), e2 = Pn(this.Bv, this.Ev), r2 = [s], h2 = [e2];
      if (n += e2, null !== this.Av) {
        const t2 = kn(this.Ev, this.Av, this.Wv);
        if (Math.sign(t2) === Math.sign(s)) {
          const i2 = Pn(this.Ev, this.Av);
          if (r2.push(t2), h2.push(i2), n += i2, null !== this.Lv) {
            const t3 = kn(this.Av, this.Lv, this.Wv);
            if (Math.sign(t3) === Math.sign(s)) {
              const i3 = Pn(this.Av, this.Lv);
              r2.push(t3), h2.push(i3), n += i3;
            }
          }
        }
      }
      let a2 = 0;
      for (let t2 = 0; t2 < r2.length; ++t2) a2 += h2[t2] / n * r2[t2];
      Math.abs(a2) < this.Fv || (this.zv = { Vv: t, wt: i }, this.Nv = a2, this.Ov = (function(t2, i2) {
        const n2 = Math.log(i2);
        return Math.log(1 * n2 / -t2) / n2;
      })(Math.abs(a2), this.Hv));
    }
    Gc(t) {
      const i = u(this.zv), n = t - i.wt;
      return i.Vv + this.Nv * (Math.pow(this.Hv, n) - 1) / Math.log(this.Hv);
    }
    Kc(t) {
      return null === this.zv || this.$v(t) === this.Ov;
    }
    $v(t) {
      const i = t - u(this.zv).wt;
      return Math.min(i, this.Ov);
    }
  };
  var Rn = class {
    constructor(t, i) {
      this.jv = void 0, this.qv = void 0, this.Yv = void 0, this.vn = false, this.Kv = t, this.Gv = i, this.Zv();
    }
    Pt() {
      this.Zv();
    }
    Xv() {
      this.jv && this.Kv.removeChild(this.jv), this.qv && this.Kv.removeChild(this.qv), this.jv = void 0, this.qv = void 0;
    }
    Jv() {
      return this.vn !== this.Qv() || this.Yv !== this.tm();
    }
    tm() {
      return this.Gv.Qt().Xi().J(this.Gv.N().layout.textColor) > 160 ? "dark" : "light";
    }
    Qv() {
      return this.Gv.N().layout.attributionLogo;
    }
    im() {
      const t = new URL(location.href);
      return t.hostname ? "&utm_source=" + t.hostname + t.pathname : "";
    }
    Zv() {
      this.Jv() && (this.Xv(), this.vn = this.Qv(), this.vn && (this.Yv = this.tm(), this.qv = document.createElement("style"), this.qv.innerText = "a#tv-attr-logo{--fill:#131722;--stroke:#fff;position:absolute;left:10px;bottom:10px;height:19px;width:35px;margin:0;padding:0;border:0;z-index:3;}a#tv-attr-logo[data-dark]{--fill:#D1D4DC;--stroke:#131722;}", this.jv = document.createElement("a"), this.jv.href = `https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart${this.im()}`, this.jv.title = "Charting by TradingView", this.jv.id = "tv-attr-logo", this.jv.target = "_blank", this.jv.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="35" height="19" fill="none"><g fill-rule="evenodd" clip-path="url(#a)" clip-rule="evenodd"><path fill="var(--stroke)" d="M2 0H0v10h6v9h21.4l.5-1.3 6-15 1-2.7H23.7l-.5 1.3-.2.6a5 5 0 0 0-7-.9V0H2Zm20 17h4l5.2-13 .8-2h-7l-1 2.5-.2.5-1.5 3.8-.3.7V17Zm-.8-10a3 3 0 0 0 .7-2.7A3 3 0 1 0 16.8 7h4.4ZM14 7V2H2v6h6v9h4V7h2Z"/><path fill="var(--fill)" d="M14 2H2v6h6v9h6V2Zm12 15h-7l6-15h7l-6 15Zm-7-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></g><defs><clipPath id="a"><path fill="var(--stroke)" d="M0 0h35v19H0z"/></clipPath></defs></svg>', this.jv.toggleAttribute("data-dark", "dark" === this.Yv), this.Kv.appendChild(this.qv), this.Kv.appendChild(this.jv)));
    }
  };
  function Dn(t, n) {
    const s = u(t.ownerDocument).createElement("canvas");
    t.appendChild(s);
    const e2 = bindTo(s, { type: "device-pixel-content-box", options: { allowResizeObserver: true }, transform: (t2, i) => ({ width: Math.max(t2.width, i.width), height: Math.max(t2.height, i.height) }) });
    return e2.resizeCanvasElement(n), e2;
  }
  function In(t) {
    t.width = 1, t.height = 1, t.getContext("2d")?.clearRect(0, 0, 1, 1);
  }
  function Vn(t, i, n, s) {
    t.qh && t.qh(i, n, s);
  }
  function Bn(t, i, n, s) {
    t.st(i, n, s);
  }
  function En(t, i, n, s) {
    An(t(n, s), i, s);
  }
  function An(t, i, n) {
    for (const s of t) {
      const t2 = s.Tt(n);
      null !== t2 && i(t2);
    }
  }
  function Ln(t, i) {
    return (n) => {
      if (!(function(t2) {
        return void 0 !== t2.Ft;
      })(n)) return [];
      return (n.Ft()?.pl() ?? "") !== i ? [] : n.Qa?.(t) ?? [];
    };
  }
  function zn(t, i, n, s) {
    if (!t.length) return;
    let e2 = 0;
    const r2 = t[0].$t(s, true);
    let h2 = 1 === i ? n / 2 - (t[0].Hi() - r2 / 2) : t[0].Hi() - r2 / 2 - n / 2;
    h2 = Math.max(0, h2);
    for (let r3 = 1; r3 < t.length; r3++) {
      const a2 = t[r3], l2 = t[r3 - 1], o2 = l2.$t(s, false), _2 = a2.Hi(), u2 = l2.Hi();
      if (1 === i ? _2 > u2 - o2 : _2 < u2 + o2) {
        const s2 = u2 - o2 * i;
        a2.Ui(s2);
        const r4 = s2 - i * o2 / 2;
        if ((1 === i ? r4 < 0 : r4 > n) && h2 > 0) {
          const s3 = 1 === i ? -1 - r4 : r4 - n, a3 = Math.min(s3, h2);
          for (let n2 = e2; n2 < t.length; n2++) t[n2].Ui(t[n2].Hi() + i * a3);
          h2 -= a3;
        }
      } else e2 = r3, h2 = 1 === i ? u2 - o2 - _2 : _2 - (u2 + o2);
    }
  }
  var On = class {
    constructor(i, n, s, e2) {
      this.Ki = null, this.nm = null, this.sm = false, this.rm = new rt(200), this.hm = null, this.am = 0, this.lm = false, this.om = () => {
        this.lm || this.yt._m().Qt().mr();
      }, this.um = () => {
        this.lm || this.yt._m().Qt().mr();
      }, this.yt = i, this.yn = n, this.Ro = n.layout, this.bd = s, this.dm = "left" === e2, this.fm = Ln("normal", e2), this.pm = Ln("top", e2), this.vm = Ln("bottom", e2), this.uv = document.createElement("div"), this.uv.style.height = "100%", this.uv.style.overflow = "hidden", this.uv.style.width = "25px", this.uv.style.left = "0", this.uv.style.position = "relative", this.wm = Dn(this.uv, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
      const r2 = this.wm.canvasElement;
      r2.style.position = "absolute", r2.style.zIndex = "1", r2.style.left = "0", r2.style.top = "0", this.Mm = Dn(this.uv, size({ width: 16, height: 16 })), this.Mm.subscribeSuggestedBitmapSizeChanged(this.um);
      const h2 = this.Mm.canvasElement;
      h2.style.position = "absolute", h2.style.zIndex = "2", h2.style.left = "0", h2.style.top = "0";
      const a2 = { Fp: this.Sv.bind(this), Op: this.Sv.bind(this), Dp: this.xv.bind(this), Tp: this.xv.bind(this), Wp: this.gm.bind(this), Ep: this.Cv.bind(this), Vp: this.Cv.bind(this), fp: this.bm.bind(this), _p: this.bm.bind(this), bp: this.Sm.bind(this), Zp: this.bv.bind(this) };
      this.sv = new Mn(this.Mm.canvasElement, a2, { Pp: () => !this.yn.handleScroll.vertTouchDrag, kp: () => true });
    }
    m() {
      this.sv.m(), this.Mm.unsubscribeSuggestedBitmapSizeChanged(this.um), In(this.Mm.canvasElement), this.Mm.dispose(), this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose(), null !== this.Ki && this.Ki.__().u(this), this.Ki = null;
    }
    fv() {
      return this.uv;
    }
    P() {
      return this.Ro.fontSize;
    }
    xm() {
      const t = this.bd.N();
      return this.hm !== t.k && (this.rm.Os(), this.hm = t.k), t;
    }
    Cm() {
      if (null === this.Ki) return 0;
      let t = 0;
      const i = this.xm(), n = u(this.wm.canvasElement.getContext("2d", { colorSpace: this.yt._m().N().layout.colorSpace }));
      n.save();
      const s = this.Ki.zl();
      n.font = this.ym(), s.length > 0 && (t = Math.max(this.rm.Ii(n, s[0].eo), this.rm.Ii(n, s[s.length - 1].eo)));
      const e2 = this.Pm();
      for (let i2 = e2.length; i2--; ) {
        const s2 = this.rm.Ii(n, e2[i2].ri());
        s2 > t && (t = s2);
      }
      const r2 = this.Ki.Lt();
      if (null !== r2 && null !== this.nm && (2 !== (h2 = this.yn.crosshair).mode && h2.horzLine.visible && h2.horzLine.labelVisible)) {
        const i2 = this.Ki.Tn(1, r2), s2 = this.Ki.Tn(this.nm.height - 2, r2);
        t = Math.max(t, this.rm.Ii(n, this.Ki.Ji(Math.floor(Math.min(i2, s2)) + 0.11111111111111, r2)), this.rm.Ii(n, this.Ki.Ji(Math.ceil(Math.max(i2, s2)) - 0.11111111111111, r2)));
      }
      var h2;
      n.restore();
      const a2 = t || 34;
      return mn(Math.ceil(i.S + i.C + i.V + i.B + 5 + a2));
    }
    km(t) {
      null !== this.nm && equalSizes(this.nm, t) || (this.nm = t, this.lm = true, this.wm.resizeCanvasElement(t), this.Mm.resizeCanvasElement(t), this.lm = false, this.uv.style.width = `${t.width}px`, this.uv.style.height = `${t.height}px`);
    }
    Tm() {
      return u(this.nm).width;
    }
    un(t) {
      this.Ki !== t && (null !== this.Ki && this.Ki.__().u(this), this.Ki = t, t.__().i(this.wo.bind(this), this));
    }
    Ft() {
      return this.Ki;
    }
    Os() {
      const t = this.yt.yv();
      this.yt._m().Qt().au(t, u(this.Ft()));
    }
    Rm(t) {
      if (null === this.nm) return;
      const i = { colorSpace: this.yt._m().N().layout.colorSpace };
      if (1 !== t) {
        this.Dm(), this.wm.applySuggestedBitmapSize();
        const t2 = tryCreateCanvasRenderingTarget2D(this.wm, i);
        null !== t2 && (t2.useBitmapCoordinateSpace(((t3) => {
          this.Im(t3), this.Vm(t3);
        })), this.yt.Bm(t2, this.vm), this.Em(t2), this.yt.Bm(t2, this.fm), this.Am(t2));
      }
      this.Mm.applySuggestedBitmapSize();
      const n = tryCreateCanvasRenderingTarget2D(this.Mm, i);
      null !== n && (n.useBitmapCoordinateSpace((({ context: t2, bitmapSize: i2 }) => {
        t2.clearRect(0, 0, i2.width, i2.height);
      })), this.Lm(n), this.yt.Bm(n, this.pm));
    }
    vv() {
      return this.wm.bitmapSize;
    }
    mv(t, i, n, s) {
      const e2 = this.vv();
      if (e2.width > 0 && e2.height > 0 && (t.drawImage(this.wm.canvasElement, i, n), s)) {
        const s2 = this.Mm.canvasElement;
        t.drawImage(s2, i, n);
      }
    }
    Pt() {
      this.Ki?.zl();
    }
    Sv(t) {
      if (null === this.Ki || this.Ki.Zi() || !this.yn.handleScale.axisPressedMouseMove.price) return;
      const i = this.yt._m().Qt(), n = this.yt.yv();
      this.sm = true, i.Q_(n, this.Ki, t.localY);
    }
    xv(t) {
      if (null === this.Ki || !this.yn.handleScale.axisPressedMouseMove.price) return;
      const i = this.yt._m().Qt(), n = this.yt.yv(), s = this.Ki;
      i.tu(n, s, t.localY);
    }
    gm() {
      if (null === this.Ki || !this.yn.handleScale.axisPressedMouseMove.price) return;
      const t = this.yt._m().Qt(), i = this.yt.yv(), n = this.Ki;
      this.sm && (this.sm = false, t.iu(i, n));
    }
    Cv(t) {
      if (null === this.Ki || !this.yn.handleScale.axisPressedMouseMove.price) return;
      const i = this.yt._m().Qt(), n = this.yt.yv();
      this.sm = false, i.iu(n, this.Ki);
    }
    bm(t) {
      this.yn.handleScale.axisDoubleClickReset.price && this.Os();
    }
    Sm(t) {
      if (null === this.Ki) return;
      !this.yt._m().Qt().N().handleScale.axisPressedMouseMove.price || this.Ki.je() || this.Ki.No() || this.zm(1);
    }
    bv(t) {
      this.zm(0);
    }
    Pm() {
      const t = [], i = null === this.Ki ? void 0 : this.Ki;
      return ((n) => {
        for (let s = 0; s < n.length; ++s) {
          const e2 = n[s].qn(this.yt.yv(), i);
          for (let i2 = 0; i2 < e2.length; i2++) t.push(e2[i2]);
        }
      })(this.yt.yv().Dt()), t;
    }
    Im({ context: t, bitmapSize: i }) {
      const { width: n, height: s } = i, e2 = this.yt.yv().Qt(), r2 = e2.$(), h2 = e2.af();
      r2 === h2 ? z(t, 0, 0, n, s, r2) : F(t, 0, 0, n, s, r2, h2);
    }
    Vm({ context: t, bitmapSize: i, horizontalPixelRatio: n }) {
      if (null === this.nm || null === this.Ki || !this.Ki.N().borderVisible) return;
      t.fillStyle = this.Ki.N().borderColor;
      const s = Math.max(1, Math.floor(this.xm().S * n));
      let e2;
      e2 = this.dm ? i.width - s : 0, t.fillRect(e2, 0, s, i.height);
    }
    Em(t) {
      if (null === this.nm || null === this.Ki) return;
      const i = this.Ki.zl(), n = this.Ki.N(), s = this.xm(), e2 = this.dm ? this.nm.width - s.C : 0;
      n.borderVisible && n.ticksVisible && t.useBitmapCoordinateSpace((({ context: t2, horizontalPixelRatio: r2, verticalPixelRatio: h2 }) => {
        t2.fillStyle = n.borderColor;
        const a2 = Math.max(1, Math.floor(h2)), l2 = Math.floor(0.5 * h2), o2 = Math.round(s.C * r2);
        t2.beginPath();
        for (const n2 of i) t2.rect(Math.floor(e2 * r2), Math.round(n2.Vl * h2) - l2, o2, a2);
        t2.fill();
      })), t.useMediaCoordinateSpace((({ context: t2 }) => {
        t2.font = this.ym(), t2.fillStyle = n.textColor ?? this.Ro.textColor, t2.textAlign = this.dm ? "right" : "left", t2.textBaseline = "middle";
        const r2 = this.dm ? Math.round(e2 - s.V) : Math.round(e2 + s.C + s.V), h2 = i.map(((i2) => this.rm.Di(t2, i2.eo)));
        for (let n2 = i.length; n2--; ) {
          const s2 = i[n2];
          t2.fillText(s2.eo, r2, s2.Vl + h2[n2]);
        }
      }));
    }
    Dm() {
      if (null === this.nm || null === this.Ki) return;
      let t = this.nm.height / 2;
      const i = [], n = this.Ki.Dt().slice(), s = this.yt.yv(), e2 = this.xm();
      this.Ki === s.Zs() && this.yt.yv().Dt().forEach(((t2) => {
        s.Gs(t2) && n.push(t2);
      }));
      const r2 = this.Ki.kl()[0], h2 = this.Ki;
      n.forEach(((n2) => {
        const e3 = n2.qn(s, h2);
        e3.forEach(((t2) => {
          t2.$i() && null === t2.Wi() && (t2.Ui(null), i.push(t2));
        })), r2 === n2 && e3.length > 0 && (t = e3[0].Ei());
      }));
      this.Ki.N().alignLabels && this.Om(i, e2, t);
    }
    Om(t, i, n) {
      if (null === this.nm) return;
      const s = t.filter(((t2) => t2.Ei() <= n)), e2 = t.filter(((t2) => t2.Ei() > n));
      s.sort(((t2, i2) => i2.Ei() - t2.Ei())), s.length && e2.length && e2.push(s[0]), e2.sort(((t2, i2) => t2.Ei() - i2.Ei()));
      for (const n2 of t) {
        const t2 = Math.floor(n2.$t(i) / 2), s2 = n2.Ei();
        s2 > -t2 && s2 < t2 && n2.Ui(t2), s2 > this.nm.height - t2 && s2 < this.nm.height + t2 && n2.Ui(this.nm.height - t2);
      }
      zn(s, 1, this.nm.height, i), zn(e2, -1, this.nm.height, i);
    }
    Am(t) {
      if (null === this.nm) return;
      const i = this.Pm(), n = this.xm(), s = this.dm ? "right" : "left";
      i.forEach(((i2) => {
        if (i2.ji()) {
          i2.Tt(u(this.Ki)).st(t, n, this.rm, s);
        }
      }));
    }
    Lm(t) {
      if (null === this.nm || null === this.Ki) return;
      const i = this.yt._m().Qt(), n = [], s = this.yt.yv(), e2 = i.Vd().qn(s, this.Ki);
      e2.length && n.push(e2);
      const r2 = this.xm(), h2 = this.dm ? "right" : "left";
      n.forEach(((i2) => {
        i2.forEach(((i3) => {
          i3.Tt(u(this.Ki)).st(t, r2, this.rm, h2);
        }));
      }));
    }
    zm(t) {
      this.uv.style.cursor = 1 === t ? "ns-resize" : "default";
    }
    wo() {
      const t = this.Cm();
      this.am < t && this.yt._m().Qt().ka(), this.am = t;
    }
    ym() {
      return x(this.Ro.fontSize, this.Ro.fontFamily);
    }
  };
  function Nn(t, i) {
    return t.Xa?.(i) ?? [];
  }
  function Fn(t, i) {
    return t.jn?.(i) ?? [];
  }
  function Wn(t, i) {
    return t.cn?.(i) ?? [];
  }
  function Hn(t, i) {
    return t.qa?.(i) ?? [];
  }
  var Un = class _Un {
    constructor(i, n) {
      this.nm = size({ width: 0, height: 0 }), this.Nm = null, this.Fm = null, this.Wm = null, this.Hm = null, this.Um = false, this.$m = new d(), this.jm = new d(), this.qm = 0, this.Ym = false, this.Km = null, this.Gm = false, this.Zm = null, this.Xm = null, this.lm = false, this.om = () => {
        this.lm || null === this.Jm || this.sn().mr();
      }, this.um = () => {
        this.lm || null === this.Jm || this.sn().mr();
      }, this.Gv = i, this.Jm = n, this.Jm.mu().i(this.Qm.bind(this), this, true), this.tw = document.createElement("td"), this.tw.style.padding = "0", this.tw.style.position = "relative";
      const s = document.createElement("div");
      s.style.width = "100%", s.style.height = "100%", s.style.position = "relative", s.style.overflow = "hidden", this.iw = document.createElement("td"), this.iw.style.padding = "0", this.nw = document.createElement("td"), this.nw.style.padding = "0", this.tw.appendChild(s), this.wm = Dn(s, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
      const e2 = this.wm.canvasElement;
      e2.style.position = "absolute", e2.style.zIndex = "1", e2.style.left = "0", e2.style.top = "0", this.Mm = Dn(s, size({ width: 16, height: 16 })), this.Mm.subscribeSuggestedBitmapSizeChanged(this.um);
      const r2 = this.Mm.canvasElement;
      r2.style.position = "absolute", r2.style.zIndex = "2", r2.style.left = "0", r2.style.top = "0", this._v = document.createElement("tr"), this._v.appendChild(this.iw), this._v.appendChild(this.tw), this._v.appendChild(this.nw), this.sw(), this.sv = new Mn(this.Mm.canvasElement, this, { Pp: () => null === this.Km && !this.Gv.N().handleScroll.vertTouchDrag, kp: () => null === this.Km && !this.Gv.N().handleScroll.horzTouchDrag });
    }
    m() {
      null !== this.Nm && this.Nm.m(), null !== this.Fm && this.Fm.m(), this.Wm = null, this.Mm.unsubscribeSuggestedBitmapSizeChanged(this.um), In(this.Mm.canvasElement), this.Mm.dispose(), this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose(), null !== this.Jm && (this.Jm.mu().u(this), this.Jm.m()), this.sv.m();
    }
    yv() {
      return u(this.Jm);
    }
    ew(t) {
      null !== this.Jm && this.Jm.mu().u(this), this.Jm = t, null !== this.Jm && this.Jm.mu().i(_Un.prototype.Qm.bind(this), this, true), this.sw(), this.Gv.lv().indexOf(this) === this.Gv.lv().length - 1 ? (this.Wm = this.Wm ?? new Rn(this.tw, this.Gv), this.Wm.Pt()) : (this.Wm?.Xv(), this.Wm = null);
    }
    _m() {
      return this.Gv;
    }
    fv() {
      return this._v;
    }
    sw() {
      if (null !== this.Jm && (this.rw(), 0 !== this.sn().Jn().length)) {
        if (null !== this.Nm) {
          const t = this.Jm.X_();
          this.Nm.un(u(t));
        }
        if (null !== this.Fm) {
          const t = this.Jm.J_();
          this.Fm.un(u(t));
        }
      }
    }
    hw() {
      null !== this.Nm && this.Nm.Pt(), null !== this.Fm && this.Fm.Pt();
    }
    F_() {
      return null !== this.Jm ? this.Jm.F_() : 0;
    }
    W_(t) {
      this.Jm && this.Jm.W_(t);
    }
    bp(t) {
      if (!this.Jm) return;
      this.aw();
      const i = t.localX, n = t.localY;
      this.lw(i, n, t);
    }
    Fp(t) {
      this.aw(), this.ow(), this.lw(t.localX, t.localY, t);
    }
    Sp(t) {
      if (!this.Jm) return;
      this.aw();
      const i = t.localX, n = t.localY;
      this.lw(i, n, t);
    }
    Ap(t) {
      null !== this.Jm && (this.aw(), this.lw(t.localX, t.localY, t), this._w(t));
    }
    fp(t) {
      null !== this.Jm && this.uw(this.jm, t);
    }
    _p(t) {
      this.fp(t);
    }
    Dp(t) {
      this.aw(), this.cw(t), this.lw(t.localX, t.localY, t);
    }
    Ep(t) {
      null !== this.Jm && (this.aw(), this.Ym = false, this.dw(t));
    }
    Bp(t) {
      null !== this.Jm && this._w(t);
    }
    Xp(t) {
      if (this.Ym = true, null === this.Km) {
        const i = { x: t.localX, y: t.localY };
        this.fw(i, i, t);
      }
    }
    Zp(t) {
      null !== this.Jm && (this.aw(), this.Jm.Qt().Rd(null), this.pw());
    }
    mw() {
      return this.$m;
    }
    ww() {
      return this.jm;
    }
    $p() {
      this.qm = 1, this.sn().cs();
    }
    jp(t, i) {
      if (!this.Gv.N().handleScale.pinch) return;
      const n = 5 * (i - this.qm);
      this.qm = i, this.sn().Wd(t._t, n);
    }
    Op(t) {
      this.Ym = false, this.Gm = null !== this.Km, this.ow();
      const i = this.sn().Vd();
      null !== this.Km && i.It() && (this.Zm = { x: i.ni(), y: i.si() }, this.Km = { x: t.localX, y: t.localY });
    }
    Tp(t) {
      if (null === this.Jm) return;
      const i = t.localX, n = t.localY;
      if (null === this.Km) this.cw(t);
      else {
        this.Gm = false;
        const s = u(this.Zm), e2 = s.x + (i - this.Km.x), r2 = s.y + (n - this.Km.y);
        this.lw(e2, r2, t);
      }
    }
    Vp(t) {
      0 === this._m().N().trackingMode.exitMode && (this.Gm = true), this.Mw(), this.dw(t);
    }
    Qs(t, i) {
      const n = this.Jm;
      return null === n ? null : Bi(n, t, i);
    }
    gw(i, n) {
      u("left" === n ? this.Nm : this.Fm).km(size({ width: i, height: this.nm.height }));
    }
    pv() {
      return this.nm;
    }
    km(t) {
      equalSizes(this.nm, t) || (this.nm = t, this.lm = true, this.wm.resizeCanvasElement(t), this.Mm.resizeCanvasElement(t), this.lm = false, this.tw.style.width = t.width + "px", this.tw.style.height = t.height + "px");
    }
    bw() {
      const t = u(this.Jm);
      t.G_(t.X_()), t.G_(t.J_());
      for (const i of t.kl()) if (t.Gs(i)) {
        const n = i.Ft();
        null !== n && t.G_(n), i.Nn();
      }
      for (const i of t.Mu()) i.Nn();
    }
    vv() {
      return this.wm.bitmapSize;
    }
    mv(t, i, n, s) {
      const e2 = this.vv();
      if (e2.width > 0 && e2.height > 0 && (t.drawImage(this.wm.canvasElement, i, n), s)) {
        const s2 = this.Mm.canvasElement;
        null !== t && t.drawImage(s2, i, n);
      }
    }
    Rm(t) {
      if (0 === t) return;
      if (null === this.Jm) return;
      t > 1 && this.bw(), null !== this.Nm && this.Nm.Rm(t), null !== this.Fm && this.Fm.Rm(t);
      const i = { colorSpace: this.Gv.N().layout.colorSpace };
      if (1 !== t) {
        this.wm.applySuggestedBitmapSize();
        const t2 = tryCreateCanvasRenderingTarget2D(this.wm, i);
        null !== t2 && (t2.useBitmapCoordinateSpace(((t3) => {
          this.Im(t3);
        })), this.Jm && (this.Sw(t2, Nn), this.xw(t2), this.Sw(t2, Fn), this.Sw(t2, Wn)));
      }
      this.Mm.applySuggestedBitmapSize();
      const n = tryCreateCanvasRenderingTarget2D(this.Mm, i);
      null !== n && (n.useBitmapCoordinateSpace((({ context: t2, bitmapSize: i2 }) => {
        t2.clearRect(0, 0, i2.width, i2.height);
      })), this.Cw(n), this.Sw(n, Hn), this.Sw(n, Wn));
    }
    yw() {
      return this.Nm;
    }
    Pw() {
      return this.Fm;
    }
    Bm(t, i) {
      this.Sw(t, i);
    }
    Qm() {
      null !== this.Jm && this.Jm.mu().u(this), this.Jm = null;
    }
    _w(t) {
      this.uw(this.$m, t);
    }
    uw(t, i) {
      const n = i.localX, s = i.localY;
      t.v() && t.p(this.sn().Et().Vc(n), { x: n, y: s }, i);
    }
    Im({ context: t, bitmapSize: i }) {
      const { width: n, height: s } = i, e2 = this.sn(), r2 = e2.$(), h2 = e2.af();
      r2 === h2 ? z(t, 0, 0, n, s, h2) : F(t, 0, 0, n, s, r2, h2);
    }
    xw(t) {
      const i = u(this.Jm), n = i.wu().wr().Tt(i);
      null !== n && n.st(t, false);
    }
    Cw(t) {
      this.kw(t, Fn, Bn, this.sn().Vd());
    }
    Sw(t, i) {
      const n = u(this.Jm), s = i === Fn ? this.Tw() : null, e2 = null === s ? null : this.Rw(s, n), r2 = n.Mu();
      if (null === e2 || null === s) {
        const s2 = n._u();
        return this.Dw(t, i, Vn, r2, s2), void this.Dw(t, i, Bn, r2, s2);
      }
      const h2 = n.Dt(), a2 = (t2) => t2 === s ? e2.Za : void 0;
      this.Dw(t, i, Vn, r2, h2, a2), this.Dw(t, i, Bn, r2, h2, a2), this.kw(t, i, Vn, s, e2.qa), this.kw(t, i, Bn, s, e2.qa);
    }
    Dw(t, i, n, s, e2, r2) {
      for (const e3 of s) this.kw(t, i, n, e3);
      if (void 0 !== r2) for (const s2 of e2) this.kw(t, i, n, s2, r2(s2));
      else for (const s2 of e2) this.kw(t, i, n, s2);
    }
    Tw() {
      const t = u(this.Jm), i = t.Qt().cu()?.uu;
      if (!t.Qt().N().hoveredSeriesOnTop || void 0 === i) return null;
      for (const n of t.Dt()) if (n === i) return n;
      return null;
    }
    Rw(t, i) {
      const n = t.Ga?.(i) ?? null;
      return null === n || 0 === n.qa.length ? null : n;
    }
    kw(t, i, n, s, e2) {
      const r2 = u(this.Jm), h2 = r2.Qt().cu(), a2 = null !== h2 && h2.uu === s, l2 = null !== h2 && a2 && void 0 !== h2.bu ? h2.bu.ie : void 0, o2 = (i2) => n(i2, t, a2, l2);
      void 0 === e2 ? En(i, o2, s, r2) : An(e2, o2, r2);
    }
    rw() {
      if (null === this.Jm) return;
      const t = this.Gv, i = this.Jm.X_().N().visible, n = this.Jm.J_().N().visible;
      i || null === this.Nm || (this.iw.removeChild(this.Nm.fv()), this.Nm.m(), this.Nm = null), n || null === this.Fm || (this.nw.removeChild(this.Fm.fv()), this.Fm.m(), this.Fm = null);
      const s = t.Qt().Jd();
      i && null === this.Nm && (this.Nm = new On(this, t.N(), s, "left"), this.iw.appendChild(this.Nm.fv())), n && null === this.Fm && (this.Fm = new On(this, t.N(), s, "right"), this.nw.appendChild(this.Fm.fv()));
    }
    Iw(t) {
      return t.Jp && this.Ym || null !== this.Km;
    }
    lw(t, i, n) {
      t = Math.max(0, Math.min(t, this.nm.width - 1)), i = Math.max(0, Math.min(i, this.nm.height - 1)), this.sn().Kd(t, i, n, u(this.Jm));
    }
    pw() {
      this.sn().Zd();
    }
    Mw() {
      this.Gm && (this.Km = null, this.pw());
    }
    fw(t, i, n) {
      this.Km = t, this.Gm = false, this.lw(i.x, i.y, n);
      const s = this.sn().Vd();
      this.Zm = { x: s.ni(), y: s.si() };
    }
    sn() {
      return this.Gv.Qt();
    }
    dw(t) {
      if (!this.Um) return;
      const i = this.sn(), n = this.yv();
      if (i.eu(n, n.kn()), this.Hm = null, this.Um = false, i.jd(), null !== this.Xm) {
        const t2 = performance.now(), n2 = i.Et();
        this.Xm.me(n2.Oc(), t2), this.Xm.Kc(t2) || i.ps(this.Xm);
      }
    }
    aw() {
      this.Km = null;
    }
    ow() {
      if (!this.Jm) return;
      if (this.sn().cs(), document.activeElement !== document.body && document.activeElement !== document.documentElement) u(document.activeElement).blur();
      else {
        const t = document.getSelection();
        null !== t && t.removeAllRanges();
      }
      !this.Jm.kn().Zi() && this.sn().Et().Zi();
    }
    cw(t) {
      if (null === this.Jm) return;
      const i = this.sn(), n = i.Et();
      if (n.Zi()) return;
      const s = this.Gv.N(), e2 = s.handleScroll, r2 = s.kineticScroll;
      if ((!e2.pressedMouseMove || t.Jp) && (!e2.horzTouchDrag && !e2.vertTouchDrag || !t.Jp)) return;
      const h2 = this.Jm.kn(), a2 = performance.now();
      if (null !== this.Hm || this.Iw(t) || (this.Hm = { x: t.clientX, y: t.clientY, yf: a2, Vw: t.localX, Bw: t.localY }), null !== this.Hm && !this.Um && (this.Hm.x !== t.clientX || this.Hm.y !== t.clientY)) {
        if (t.Jp && r2.touch || !t.Jp && r2.mouse) {
          const t2 = n.ml();
          this.Xm = new Tn(0.2 / t2, 7 / t2, 0.997, 15 / t2), this.Xm.Uv(n.Oc(), this.Hm.yf);
        } else this.Xm = null;
        h2.Zi() || i.nu(this.Jm, h2, t.localY), i.Ud(t.localX), this.Um = true;
      }
      this.Um && (h2.Zi() || i.su(this.Jm, h2, t.localY), i.$d(t.localX), null !== this.Xm && this.Xm.Uv(n.Oc(), a2));
    }
  };
  var $n = class {
    constructor(i, n, s, e2, r2) {
      this.xt = true, this.nm = size({ width: 0, height: 0 }), this.om = () => this.Rm(3), this.dm = "left" === i, this.bd = s.Jd, this.yn = n, this.Ew = e2, this.Aw = r2, this.uv = document.createElement("div"), this.uv.style.width = "25px", this.uv.style.height = "100%", this.uv.style.overflow = "hidden", this.wm = Dn(this.uv, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
    }
    m() {
      this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose();
    }
    fv() {
      return this.uv;
    }
    pv() {
      return this.nm;
    }
    km(t) {
      equalSizes(this.nm, t) || (this.nm = t, this.wm.resizeCanvasElement(t), this.uv.style.width = `${t.width}px`, this.uv.style.height = `${t.height}px`, this.xt = true);
    }
    Rm(t) {
      if (t < 3 && !this.xt) return;
      if (0 === this.nm.width || 0 === this.nm.height) return;
      this.xt = false, this.wm.applySuggestedBitmapSize();
      const i = tryCreateCanvasRenderingTarget2D(this.wm, { colorSpace: this.yn.layout.colorSpace });
      null !== i && i.useBitmapCoordinateSpace(((t2) => {
        this.Im(t2), this.Vm(t2);
      }));
    }
    vv() {
      return this.wm.bitmapSize;
    }
    mv(t, i, n) {
      const s = this.vv();
      s.width > 0 && s.height > 0 && t.drawImage(this.wm.canvasElement, i, n);
    }
    Vm({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
      if (!this.Ew()) return;
      t.fillStyle = this.yn.timeScale.borderColor;
      const e2 = Math.floor(this.bd.N().S * n), r2 = Math.floor(this.bd.N().S * s), h2 = this.dm ? i.width - e2 : 0;
      t.fillRect(h2, 0, e2, r2);
    }
    Im({ context: t, bitmapSize: i }) {
      z(t, 0, 0, i.width, i.height, this.Aw());
    }
  };
  function jn(t) {
    return (i) => i.tl?.(t) ?? [];
  }
  var qn = jn("normal");
  var Yn = jn("top");
  var Kn = jn("bottom");
  var Gn = class {
    constructor(i, n) {
      this.Lw = null, this.zw = null, this.M = null, this.Ow = false, this.nm = size({ width: 0, height: 0 }), this.Nw = new d(), this.rm = new rt(5), this.lm = false, this.om = () => {
        this.lm || this.Gv.Qt().mr();
      }, this.um = () => {
        this.lm || this.Gv.Qt().mr();
      }, this.Gv = i, this.Pu = n, this.yn = i.N().layout, this.jv = document.createElement("tr"), this.Fw = document.createElement("td"), this.Fw.style.padding = "0", this.Ww = document.createElement("td"), this.Ww.style.padding = "0", this.uv = document.createElement("td"), this.uv.style.height = "25px", this.uv.style.padding = "0", this.Hw = document.createElement("div"), this.Hw.style.width = "100%", this.Hw.style.height = "100%", this.Hw.style.position = "relative", this.Hw.style.overflow = "hidden", this.uv.appendChild(this.Hw), this.wm = Dn(this.Hw, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
      const s = this.wm.canvasElement;
      s.style.position = "absolute", s.style.zIndex = "1", s.style.left = "0", s.style.top = "0", this.Mm = Dn(this.Hw, size({ width: 16, height: 16 })), this.Mm.subscribeSuggestedBitmapSizeChanged(this.um);
      const e2 = this.Mm.canvasElement;
      e2.style.position = "absolute", e2.style.zIndex = "2", e2.style.left = "0", e2.style.top = "0", this.jv.appendChild(this.Fw), this.jv.appendChild(this.uv), this.jv.appendChild(this.Ww), this.Uw(), this.Gv.Qt().N_().i(this.Uw.bind(this), this), this.sv = new Mn(this.Mm.canvasElement, this, { Pp: () => true, kp: () => !this.Gv.N().handleScroll.horzTouchDrag });
    }
    m() {
      this.sv.m(), null !== this.Lw && this.Lw.m(), null !== this.zw && this.zw.m(), this.Mm.unsubscribeSuggestedBitmapSizeChanged(this.um), In(this.Mm.canvasElement), this.Mm.dispose(), this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose();
    }
    fv() {
      return this.jv;
    }
    $w() {
      return this.Lw;
    }
    jw() {
      return this.zw;
    }
    Fp(t) {
      if (this.Ow) return;
      this.Ow = true;
      const i = this.Gv.Qt();
      !i.Et().Zi() && this.Gv.N().handleScale.axisPressedMouseMove.time && i.Fd(t.localX);
    }
    Op(t) {
      this.Fp(t);
    }
    Wp() {
      const t = this.Gv.Qt();
      !t.Et().Zi() && this.Ow && (this.Ow = false, this.Gv.N().handleScale.axisPressedMouseMove.time && t.Yd());
    }
    Dp(t) {
      const i = this.Gv.Qt();
      !i.Et().Zi() && this.Gv.N().handleScale.axisPressedMouseMove.time && i.qd(t.localX);
    }
    Tp(t) {
      this.Dp(t);
    }
    Ep() {
      this.Ow = false;
      const t = this.Gv.Qt();
      t.Et().Zi() && !this.Gv.N().handleScale.axisPressedMouseMove.time || t.Yd();
    }
    Vp() {
      this.Ep();
    }
    fp() {
      this.Gv.N().handleScale.axisDoubleClickReset.time && this.Gv.Qt().ws();
    }
    _p() {
      this.fp();
    }
    bp() {
      this.Gv.Qt().N().handleScale.axisPressedMouseMove.time && this.zm(1);
    }
    Zp() {
      this.zm(0);
    }
    pv() {
      return this.nm;
    }
    qw() {
      return this.Nw;
    }
    Yw(i, s, e2) {
      equalSizes(this.nm, i) || (this.nm = i, this.lm = true, this.wm.resizeCanvasElement(i), this.Mm.resizeCanvasElement(i), this.lm = false, this.uv.style.width = `${i.width}px`, this.uv.style.height = `${i.height}px`, this.Nw.p(i)), null !== this.Lw && this.Lw.km(size({ width: s, height: i.height })), null !== this.zw && this.zw.km(size({ width: e2, height: i.height }));
    }
    Kw() {
      const t = this.Gw();
      return Math.ceil(t.S + t.C + t.P + t.A + t.I + t.Zw);
    }
    Pt() {
      this.Gv.Qt().Et().zl();
    }
    vv() {
      return this.wm.bitmapSize;
    }
    mv(t, i, n, s) {
      const e2 = this.vv();
      if (e2.width > 0 && e2.height > 0 && (t.drawImage(this.wm.canvasElement, i, n), s)) {
        const s2 = this.Mm.canvasElement;
        t.drawImage(s2, i, n);
      }
    }
    Rm(t) {
      if (0 === t) return;
      const i = { colorSpace: this.yn.colorSpace };
      if (1 !== t) {
        this.wm.applySuggestedBitmapSize();
        const n2 = tryCreateCanvasRenderingTarget2D(this.wm, i);
        null !== n2 && (n2.useBitmapCoordinateSpace(((t2) => {
          this.Im(t2), this.Vm(t2), this.Xw(n2, Kn);
        })), this.Em(n2), this.Xw(n2, qn)), null !== this.Lw && this.Lw.Rm(t), null !== this.zw && this.zw.Rm(t);
      }
      this.Mm.applySuggestedBitmapSize();
      const n = tryCreateCanvasRenderingTarget2D(this.Mm, i);
      null !== n && (n.useBitmapCoordinateSpace((({ context: t2, bitmapSize: i2 }) => {
        t2.clearRect(0, 0, i2.width, i2.height);
      })), this.Jw([...this.Gv.Qt().Jn(), this.Gv.Qt().Vd()], n), this.Xw(n, Yn));
    }
    Xw(t, i) {
      const n = this.Gv.Qt().Jn();
      for (const s of n) En(i, ((i2) => Vn(i2, t, false, void 0)), s, void 0);
      for (const s of n) En(i, ((i2) => Bn(i2, t, false, void 0)), s, void 0);
    }
    Im({ context: t, bitmapSize: i }) {
      z(t, 0, 0, i.width, i.height, this.Gv.Qt().af());
    }
    Vm({ context: t, bitmapSize: i, verticalPixelRatio: n }) {
      if (this.Gv.N().timeScale.borderVisible) {
        t.fillStyle = this.Qw();
        const s = Math.max(1, Math.floor(this.Gw().S * n));
        t.fillRect(0, 0, i.width, s);
      }
    }
    Em(t) {
      const i = this.Gv.Qt().Et(), n = i.zl();
      if (!n || 0 === n.length) return;
      const s = this.Pu.maxTickMarkWeight(n), e2 = this.Gw(), r2 = i.N();
      r2.borderVisible && r2.ticksVisible && t.useBitmapCoordinateSpace((({ context: t2, horizontalPixelRatio: i2, verticalPixelRatio: s2 }) => {
        t2.strokeStyle = this.Qw(), t2.fillStyle = this.Qw();
        const r3 = Math.max(1, Math.floor(i2)), h2 = Math.floor(0.5 * i2);
        t2.beginPath();
        const a2 = Math.round(e2.C * s2);
        for (let s3 = n.length; s3--; ) {
          const e3 = Math.round(n[s3].coord * i2);
          t2.rect(e3 - h2, 0, r3, a2);
        }
        t2.fill();
      })), t.useMediaCoordinateSpace((({ context: t2 }) => {
        const i2 = e2.S + e2.C + e2.A + e2.P / 2;
        t2.textAlign = "center", t2.textBaseline = "middle", t2.fillStyle = this.H(), t2.font = this.ym();
        for (const e3 of n) if (e3.weight < s) {
          const n2 = e3.needAlignCoordinate ? this.tM(t2, e3.coord, e3.label) : e3.coord;
          t2.fillText(e3.label, n2, i2);
        }
        this.Gv.N().timeScale.allowBoldLabels && (t2.font = this.iM());
        for (const e3 of n) if (e3.weight >= s) {
          const n2 = e3.needAlignCoordinate ? this.tM(t2, e3.coord, e3.label) : e3.coord;
          t2.fillText(e3.label, n2, i2);
        }
      }));
    }
    tM(t, i, n) {
      const s = this.rm.Ii(t, n), e2 = s / 2, r2 = Math.floor(i - e2) + 0.5;
      return r2 < 0 ? i += Math.abs(0 - r2) : r2 + s > this.nm.width && (i -= Math.abs(this.nm.width - (r2 + s))), i;
    }
    Jw(t, i) {
      const n = this.Gw();
      for (const s of t) for (const t2 of s.dn()) t2.Tt().st(i, n);
    }
    Qw() {
      return this.Gv.N().timeScale.borderColor;
    }
    H() {
      return this.yn.textColor;
    }
    F() {
      return this.yn.fontSize;
    }
    ym() {
      return x(this.F(), this.yn.fontFamily);
    }
    iM() {
      return x(this.F(), this.yn.fontFamily, "bold");
    }
    Gw() {
      null === this.M && (this.M = { S: 1, L: NaN, A: NaN, I: NaN, tn: NaN, C: 5, P: NaN, k: "", Qi: new rt(), Zw: 0 });
      const t = this.M, i = this.ym();
      if (t.k !== i) {
        const n = this.F();
        t.P = n, t.k = i, t.A = 3 * n / 12, t.I = 3 * n / 12, t.tn = 9 * n / 12, t.L = 0, t.Zw = 4 * n / 12, t.Qi.Os();
      }
      return this.M;
    }
    zm(t) {
      this.uv.style.cursor = 1 === t ? "ew-resize" : "default";
    }
    Uw() {
      const t = this.Gv.Qt(), i = t.N();
      i.leftPriceScale.visible || null === this.Lw || (this.Fw.removeChild(this.Lw.fv()), this.Lw.m(), this.Lw = null), i.rightPriceScale.visible || null === this.zw || (this.Ww.removeChild(this.zw.fv()), this.zw.m(), this.zw = null);
      const n = { Jd: this.Gv.Qt().Jd() }, s = () => i.leftPriceScale.borderVisible && t.Et().N().borderVisible, e2 = () => t.af();
      i.leftPriceScale.visible && null === this.Lw && (this.Lw = new $n("left", i, n, s, e2), this.Fw.appendChild(this.Lw.fv())), i.rightPriceScale.visible && null === this.zw && (this.zw = new $n("right", i, n, s, e2), this.Ww.appendChild(this.zw.fv()));
    }
  };
  var Zn = !!dn && !!navigator.userAgentData && navigator.userAgentData.brands.some(((t) => t.brand.includes("Chromium"))) && !!dn && (navigator?.userAgentData?.platform ? "Windows" === navigator.userAgentData.platform : navigator.userAgent.toLowerCase().indexOf("win") >= 0);
  var Xn = class {
    constructor(t, i, n) {
      var s;
      this.nM = [], this.sM = [], this.eM = 0, this.oo = 0, this.k_ = 0, this.rM = 0, this.hM = 0, this.aM = null, this.lM = false, this.$m = new d(), this.jm = new d(), this.wd = new d(), this.oM = null, this._M = null, this.Kv = t, this.yn = i, this.Pu = n, this.jv = document.createElement("div"), this.jv.classList.add("tv-lightweight-charts"), this.jv.style.overflow = "hidden", this.jv.style.direction = "ltr", this.jv.style.width = "100%", this.jv.style.height = "100%", (s = this.jv).style.userSelect = "none", s.style.webkitUserSelect = "none", s.style.msUserSelect = "none", s.style.MozUserSelect = "none", s.style.webkitTapHighlightColor = "transparent", this.uM = document.createElement("table"), this.uM.setAttribute("cellspacing", "0"), this.jv.appendChild(this.uM), this.cM = this.dM.bind(this), Jn(this.yn) && this.fM(true), this.sn = new qi(this.gd.bind(this), this.yn, n), this.Qt().Bd().i(this.pM.bind(this), this), this.vM = new Gn(this, this.Pu), this.uM.appendChild(this.vM.fv());
      const e2 = i.autoSize && this.mM();
      let r2 = this.yn.width, h2 = this.yn.height;
      if (e2 || 0 === r2 || 0 === h2) {
        const i2 = t.getBoundingClientRect();
        r2 = r2 || i2.width, h2 = h2 || i2.height;
      }
      this.wM(r2, h2), this.MM(), t.appendChild(this.jv), this.gM(), this.sn.Et().Jc().i(this.sn.ka.bind(this.sn), this), this.sn.N_().i(this.sn.ka.bind(this.sn), this);
    }
    Qt() {
      return this.sn;
    }
    N() {
      return this.yn;
    }
    lv() {
      return this.nM;
    }
    bM() {
      return this.vM;
    }
    m() {
      this.fM(false), 0 !== this.eM && window.cancelAnimationFrame(this.eM), this.sn.Bd().u(this), this.sn.Et().Jc().u(this), this.sn.N_().u(this), this.sn.m();
      for (const t of this.nM) this.uM.removeChild(t.fv()), t.mw().u(this), t.ww().u(this), t.m();
      this.nM = [];
      for (const t of this.sM) this.SM(t);
      this.sM = [], u(this.vM).m(), null !== this.jv.parentElement && this.jv.parentElement.removeChild(this.jv), this.wd.m(), this.$m.m(), this.jm.m(), this.xM();
    }
    wM(i, n, s = false) {
      if (this.oo === n && this.k_ === i) return;
      const e2 = (function(i2) {
        const n2 = Math.floor(i2.width), s2 = Math.floor(i2.height);
        return size({ width: n2 - n2 % 2, height: s2 - s2 % 2 });
      })(size({ width: i, height: n }));
      this.oo = e2.height, this.k_ = e2.width;
      const r2 = this.oo + "px", h2 = this.k_ + "px";
      if (this.CM() || (u(this.jv).style.height = r2, u(this.jv).style.width = h2), this.uM.style.height = r2, this.uM.style.width = h2, s) {
        0 !== this.eM && (window.cancelAnimationFrame(this.eM), this.eM = 0), this.lM = false;
        const t = X.ys();
        null !== this.aM && (t.Ss(this.aM), this.aM = null), this.yM(t, performance.now());
      } else this.sn.ka();
    }
    Rm(t) {
      void 0 === t && (t = X.ys());
      for (let i = 0; i < this.nM.length; i++) this.nM[i].Rm(t._s(i).rs);
      this.yn.timeScale.visible && this.vM.Rm(t.ls());
    }
    vr(t) {
      const i = Jn(this.yn);
      this.sn.vr(t);
      const n = Jn(this.yn);
      n !== i && this.fM(n), t.layout?.panes && this.PM(), this.gM(), this.kM(t);
    }
    mw() {
      return this.$m;
    }
    ww() {
      return this.jm;
    }
    Bd() {
      return this.wd;
    }
    TM(t = false) {
      null !== this.aM && (this.yM(this.aM, performance.now()), this.aM = null);
      const i = this.RM(null), n = document.createElement("canvas");
      n.width = i.width, n.height = i.height;
      const s = u(n.getContext("2d"));
      return this.RM(s, t), n;
    }
    DM(t) {
      if ("left" === t && !this.IM()) return 0;
      if ("right" === t && !this.VM()) return 0;
      if (0 === this.nM.length) return 0;
      return u("left" === t ? this.nM[0].yw() : this.nM[0].Pw()).Tm();
    }
    CM() {
      return this.yn.autoSize && null !== this.oM;
    }
    Mv() {
      return this.jv;
    }
    BM(t) {
      this._M = t, this._M ? this.Mv().style.setProperty("cursor", t) : this.Mv().style.removeProperty("cursor");
    }
    EM() {
      return this._M;
    }
    AM(t) {
      return _(this.nM[t]).pv();
    }
    PM() {
      this.sM.forEach(((t) => {
        t.Pt();
      }));
    }
    kM(t) {
      (void 0 !== t.autoSize || !this.oM || void 0 === t.width && void 0 === t.height) && (t.autoSize && !this.oM && this.mM(), false === t.autoSize && null !== this.oM && this.xM(), t.autoSize || void 0 === t.width && void 0 === t.height || this.wM(t.width || this.k_, t.height || this.oo));
    }
    RM(i, n) {
      let s = 0, e2 = 0;
      const r2 = this.nM[0], h2 = (t, s2) => {
        let e3 = 0;
        for (let r3 = 0; r3 < this.nM.length; r3++) {
          const h3 = this.nM[r3], a3 = u("left" === t ? h3.yw() : h3.Pw()), l2 = a3.vv();
          if (null !== i && a3.mv(i, s2, e3, n), e3 += l2.height, r3 < this.nM.length - 1) {
            const t2 = this.sM[r3], n2 = t2.vv();
            null !== i && t2.mv(i, s2, e3), e3 += n2.height;
          }
        }
      };
      if (this.IM()) {
        h2("left", 0);
        s += u(r2.yw()).vv().width;
      }
      for (let t = 0; t < this.nM.length; t++) {
        const r3 = this.nM[t], h3 = r3.vv();
        if (null !== i && r3.mv(i, s, e2, n), e2 += h3.height, t < this.nM.length - 1) {
          const n2 = this.sM[t], r4 = n2.vv();
          null !== i && n2.mv(i, s, e2), e2 += r4.height;
        }
      }
      if (s += r2.vv().width, this.VM()) {
        h2("right", s);
        s += u(r2.Pw()).vv().width;
      }
      const a2 = (t, n2, s2) => {
        u("left" === t ? this.vM.$w() : this.vM.jw()).mv(u(i), n2, s2);
      };
      if (this.yn.timeScale.visible) {
        const t = this.vM.vv();
        if (null !== i) {
          let s2 = 0;
          this.IM() && (a2("left", s2, e2), s2 = u(r2.yw()).vv().width), this.vM.mv(i, s2, e2, n), s2 += t.width, this.VM() && a2("right", s2, e2);
        }
        e2 += t.height;
      }
      return size({ width: s, height: e2 });
    }
    LM() {
      let i = 0, n = 0, s = 0;
      for (const t of this.nM) this.IM() && (n = Math.max(n, u(t.yw()).Cm(), this.yn.leftPriceScale.minimumWidth)), this.VM() && (s = Math.max(s, u(t.Pw()).Cm(), this.yn.rightPriceScale.minimumWidth)), i += t.F_();
      n = mn(n), s = mn(s);
      const e2 = this.k_, r2 = this.oo, h2 = Math.max(e2 - n - s, 0), a2 = 1 * this.sM.length, l2 = this.yn.timeScale.visible;
      let o2 = l2 ? Math.max(this.vM.Kw(), this.yn.timeScale.minimumHeight) : 0;
      var _2;
      o2 = (_2 = o2) + _2 % 2;
      const c2 = a2 + o2, d2 = r2 < c2 ? 0 : r2 - c2, f2 = d2 / i;
      let p2 = 0;
      const v2 = window.devicePixelRatio || 1;
      for (let i2 = 0; i2 < this.nM.length; ++i2) {
        const e3 = this.nM[i2];
        e3.ew(this.sn.Gn()[i2]);
        let r3 = 0, a3 = 0;
        a3 = i2 === this.nM.length - 1 ? Math.ceil((d2 - p2) * v2) / v2 : Math.round(e3.F_() * f2 * v2) / v2, r3 = Math.max(a3, 2), p2 += r3, e3.km(size({ width: h2, height: r3 })), this.IM() && e3.gw(n, "left"), this.VM() && e3.gw(s, "right"), e3.yv() && this.sn.Ed(e3.yv(), r3);
      }
      this.vM.Yw(size({ width: l2 ? h2 : 0, height: o2 }), l2 ? n : 0, l2 ? s : 0), this.sn.H_(h2), this.rM !== n && (this.rM = n), this.hM !== s && (this.hM = s);
    }
    fM(t) {
      t ? this.jv.addEventListener("wheel", this.cM, { passive: false }) : this.jv.removeEventListener("wheel", this.cM);
    }
    zM(t) {
      switch (t.deltaMode) {
        case t.DOM_DELTA_PAGE:
          return 120;
        case t.DOM_DELTA_LINE:
          return 32;
      }
      return Zn ? 1 / window.devicePixelRatio : 1;
    }
    dM(t) {
      if (!(0 !== t.deltaX && this.yn.handleScroll.mouseWheel || 0 !== t.deltaY && this.yn.handleScale.mouseWheel)) return;
      const i = this.zM(t), n = i * t.deltaX / 100, s = -i * t.deltaY / 100;
      if (t.cancelable && t.preventDefault(), 0 !== s && this.yn.handleScale.mouseWheel) {
        const i2 = Math.sign(s) * Math.min(1, Math.abs(s)), n2 = t.clientX - this.jv.getBoundingClientRect().left;
        this.Qt().Wd(n2, i2);
      }
      0 !== n && this.yn.handleScroll.mouseWheel && this.Qt().Hd(-80 * n);
    }
    yM(t, i) {
      const n = t.ls();
      3 === n && this.OM(), 3 !== n && 2 !== n || (this.NM(t), this.FM(t, i), this.vM.Pt(), this.nM.forEach(((t2) => {
        t2.hw();
      })), 3 === this.aM?.ls() && (this.aM.Ss(t), this.OM(), this.NM(this.aM), this.FM(this.aM, i), t = this.aM, this.aM = null)), this.Rm(t);
    }
    FM(t, i) {
      for (const n of t.bs()) this.xs(n, i);
    }
    NM(t) {
      const i = this.sn.Gn();
      for (let n = 0; n < i.length; n++) t._s(n).hs && i[n].lu();
    }
    xs(t, i) {
      const n = this.sn.Et();
      switch (t.ds) {
        case 0:
          n.td();
          break;
        case 1:
          n.nd(t.Wt);
          break;
        case 2:
          n.Ms(t.Wt);
          break;
        case 3:
          n.gs(t.Wt);
          break;
        case 4:
          n.Wc();
          break;
        case 5:
          t.Wt.Kc(i) || n.gs(t.Wt.Gc(i));
      }
    }
    gd(t) {
      null !== this.aM ? this.aM.Ss(t) : this.aM = t, this.lM || (this.lM = true, this.eM = window.requestAnimationFrame(((t2) => {
        if (this.lM = false, this.eM = 0, null !== this.aM) {
          const i = this.aM;
          this.aM = null, this.yM(i, t2);
          for (const n of i.bs()) if (5 === n.ds && !n.Wt.Kc(t2)) {
            this.Qt().ps(n.Wt);
            break;
          }
        }
      })));
    }
    OM() {
      this.MM();
    }
    SM(t) {
      this.uM.removeChild(t.fv()), t.m();
    }
    MM() {
      const t = this.sn.Gn(), i = t.length, n = this.nM.length;
      for (let t2 = i; t2 < n; t2++) {
        const t3 = _(this.nM.pop());
        this.uM.removeChild(t3.fv()), t3.mw().u(this), t3.ww().u(this), t3.m();
        const i2 = this.sM.pop();
        void 0 !== i2 && this.SM(i2);
      }
      for (let s = n; s < i; s++) {
        const i2 = new Un(this, t[s]);
        if (i2.mw().i(this.WM.bind(this, i2), this), i2.ww().i(this.HM.bind(this, i2), this), this.nM.push(i2), s > 0) {
          const t2 = new yn(this, s - 1, s);
          this.sM.push(t2), this.uM.insertBefore(t2.fv(), this.vM.fv());
        }
        this.uM.insertBefore(i2.fv(), this.vM.fv());
      }
      for (let n2 = 0; n2 < i; n2++) {
        const i2 = t[n2], s = this.nM[n2];
        s.yv() !== i2 ? s.ew(i2) : s.sw();
      }
      this.gM(), this.LM();
    }
    UM(t, i, n, s) {
      const e2 = /* @__PURE__ */ new Map();
      if (null !== t) {
        this.sn.Jn().forEach(((i2) => {
          const n2 = i2.Un().Hn(t);
          null !== n2 && e2.set(i2, n2);
        }));
      }
      let r2;
      if (null !== t) {
        const i2 = this.sn.Et().en(t)?.originalTime;
        void 0 !== i2 && (r2 = i2);
      }
      const h2 = this.Qt().cu(), a2 = this.$M(s), l2 = (function(t2, i2) {
        const n2 = null !== t2 && t2.uu instanceof Jt ? t2.uu : void 0, s2 = t2?.bu?.te, e3 = void 0 !== i2 && -1 !== i2 ? i2 : void 0;
        return null === t2 || void 0 === t2.ee ? { jM: n2, qM: s2 } : { jM: n2, qM: s2, YM: { ds: t2.ee, KM: (r3 = t2.uu, h3 = t2.ee, r3 instanceof Pi ? "pane-primitive" : "marker" === h3 || "primitive" === h3 ? "series-primitive" : "series"), GM: vn(t2.ee, s2), Y_: n2, ZM: s2, XM: e3 } };
        var r3, h3;
      })(h2, a2);
      return { Qr: r2, $n: t ?? void 0, JM: i ?? void 0, XM: -1 !== a2 ? a2 : void 0, jM: l2.jM, QM: e2, qM: l2.qM, YM: l2.YM, tg: n ?? void 0 };
    }
    $M(t) {
      let i = -1;
      if (t) i = this.nM.indexOf(t);
      else {
        const t2 = this.Qt().Vd().Kn();
        null !== t2 && (i = this.Qt().Gn().indexOf(t2));
      }
      return i;
    }
    WM(t, i, n, s) {
      this.$m.p((() => this.UM(i, n, s, t)));
    }
    HM(t, i, n, s) {
      this.jm.p((() => this.UM(i, n, s, t)));
    }
    pM(t, i, n) {
      this.BM(this.Qt().cu()?.gu ?? null), this.wd.p((() => this.UM(t, i, n)));
    }
    gM() {
      const t = this.yn.timeScale.visible ? "" : "none";
      this.vM.fv().style.display = t;
    }
    IM() {
      return this.nM[0].yv().X_().N().visible;
    }
    VM() {
      return this.nM[0].yv().J_().N().visible;
    }
    mM() {
      return "ResizeObserver" in window && (this.oM = new ResizeObserver(((t) => {
        const i = t[t.length - 1];
        if (!i) return;
        const n = i.contentRect.width, s = i.contentRect.height;
        this.wM(n, s, true);
      })), this.oM.observe(this.Kv, { box: "border-box" }), true);
    }
    xM() {
      null !== this.oM && this.oM.disconnect(), this.oM = null;
    }
  };
  function Jn(t) {
    return Boolean(t.handleScroll.mouseWheel || t.handleScale.mouseWheel);
  }
  function Qn(t) {
    return void 0 === t.open && void 0 === t.value;
  }
  function ts(t) {
    return (function(t2) {
      return void 0 !== t2.open;
    })(t) || (function(t2) {
      return void 0 !== t2.value;
    })(t);
  }
  function is(t, i, n, s) {
    const e2 = n.value, r2 = { $n: i, wt: t, Wt: [e2, e2, e2, e2], Qr: s };
    return void 0 !== n.color && (r2.R = n.color), r2;
  }
  function ns(t, i, n, s) {
    const e2 = n.value, r2 = { $n: i, wt: t, Wt: [e2, e2, e2, e2], Qr: s };
    return void 0 !== n.lineColor && (r2.vt = n.lineColor), void 0 !== n.topColor && (r2.ah = n.topColor), void 0 !== n.bottomColor && (r2.oh = n.bottomColor), r2;
  }
  function ss(t, i, n, s) {
    const e2 = n.value, r2 = { $n: i, wt: t, Wt: [e2, e2, e2, e2], Qr: s };
    return void 0 !== n.topLineColor && (r2._h = n.topLineColor), void 0 !== n.bottomLineColor && (r2.uh = n.bottomLineColor), void 0 !== n.topFillColor1 && (r2.dh = n.topFillColor1), void 0 !== n.topFillColor2 && (r2.fh = n.topFillColor2), void 0 !== n.bottomFillColor1 && (r2.ph = n.bottomFillColor1), void 0 !== n.bottomFillColor2 && (r2.mh = n.bottomFillColor2), r2;
  }
  function es(t, i, n, s) {
    const e2 = { $n: i, wt: t, Wt: [n.open, n.high, n.low, n.close], Qr: s };
    return void 0 !== n.color && (e2.R = n.color), e2;
  }
  function rs(t, i, n, s) {
    const e2 = { $n: i, wt: t, Wt: [n.open, n.high, n.low, n.close], Qr: s };
    return void 0 !== n.color && (e2.R = n.color), void 0 !== n.borderColor && (e2.Ht = n.borderColor), void 0 !== n.wickColor && (e2.hh = n.wickColor), e2;
  }
  function hs(t, i, n, s, e2) {
    const r2 = _(e2)(n), h2 = Math.max(...r2), a2 = Math.min(...r2), l2 = r2[r2.length - 1], o2 = [l2, h2, a2, l2], { time: u2, color: c2, ...d2 } = n;
    return { $n: i, wt: t, Wt: o2, Qr: s, ue: d2, R: c2 };
  }
  function as(t) {
    return void 0 !== t.Wt;
  }
  function ls(t, i) {
    return void 0 !== i.customValues && (t.ig = i.customValues), t;
  }
  function os(t) {
    return (i, n, s, e2, r2, h2) => (function(t2, i2) {
      return i2 ? i2(t2) : Qn(t2);
    })(s, h2) ? ls({ wt: i, $n: n, Qr: e2 }, s) : ls(t(i, n, s, e2, r2), s);
  }
  function _s(t) {
    return { Candlestick: os(rs), Bar: os(es), Area: os(ns), Baseline: os(ss), Histogram: os(is), Line: os(is), Custom: os(hs) }[t];
  }
  function us(t) {
    return { $n: 0, ng: /* @__PURE__ */ new Map(), Oa: t };
  }
  function cs(t, i) {
    if (void 0 !== t && 0 !== t.length) return { sg: i.key(t[0].wt), eg: i.key(t[t.length - 1].wt) };
  }
  function ds(t) {
    let i;
    return t.forEach(((t2) => {
      void 0 === i && (i = t2.Qr);
    })), _(i);
  }
  var fs = class {
    constructor(t) {
      this.rg = /* @__PURE__ */ new Map(), this.hg = /* @__PURE__ */ new Map(), this.ag = /* @__PURE__ */ new Map(), this.lg = [], this.Pu = t;
    }
    m() {
      this.rg.clear(), this.hg.clear(), this.ag.clear(), this.lg = [];
    }
    og(t, i) {
      let n = 0 !== this.rg.size, s = false;
      const e2 = this.hg.get(t);
      if (void 0 !== e2) if (1 === this.hg.size) n = false, s = true, this.rg.clear();
      else for (const i2 of this.lg) i2.pointData.ng.delete(t) && (s = true);
      let r2 = [];
      if (0 !== i.length) {
        const n2 = i.map(((t2) => t2.time)), e3 = this.Pu.createConverterToInternalObj(i), h3 = _s(t.bh()), a2 = t.ul(), l2 = t.cl();
        r2 = i.map(((i2, r3) => {
          const o2 = e3(i2.time), _2 = this.Pu.key(o2);
          let u2 = this.rg.get(_2);
          void 0 === u2 && (u2 = us(o2), this.rg.set(_2, u2), s = true);
          const c2 = h3(o2, u2.$n, i2, n2[r3], a2, l2);
          return u2.ng.set(t, c2), c2;
        }));
      }
      n && this._g(), this.ug(t, r2);
      let h2 = -1;
      if (s) {
        const t2 = [];
        this.rg.forEach(((i2) => {
          t2.push({ timeWeight: 0, time: i2.Oa, pointData: i2, originalTime: ds(i2.ng) });
        })), t2.sort(((t3, i2) => this.Pu.key(t3.time) - this.Pu.key(i2.time))), h2 = this.cg(t2);
      }
      return this.dg(t, h2, (function(t2, i2, n2) {
        const s2 = cs(t2, n2), e3 = cs(i2, n2);
        if (void 0 !== s2 && void 0 !== e3) return { fg: false, Va: s2.eg >= e3.eg && s2.sg >= e3.sg };
      })(this.hg.get(t), e2, this.Pu));
    }
    if(t) {
      return this.og(t, []);
    }
    pg(t, i, n) {
      if (n && t.Fa()) throw new Error("Historical updates are not supported when conflation is enabled. Conflation requires data to be processed in order.");
      const s = i;
      !(function(t2) {
        void 0 === t2.Qr && (t2.Qr = t2.time);
      })(s), this.Pu.preprocessData(i);
      const e2 = this.Pu.createConverterToInternalObj([i])(i.time), r2 = this.ag.get(t);
      if (!n && void 0 !== r2 && this.Pu.key(e2) < this.Pu.key(r2)) throw new Error(`Cannot update oldest data, last time=${r2}, new time=${e2}`);
      let h2 = this.rg.get(this.Pu.key(e2));
      if (n && void 0 === h2) throw new Error("Cannot update non-existing data point when historicalUpdate is true");
      const a2 = void 0 === h2;
      void 0 === h2 && (h2 = us(e2), this.rg.set(this.Pu.key(e2), h2));
      const l2 = _s(t.bh()), o2 = t.ul(), _2 = t.cl(), u2 = l2(e2, h2.$n, i, s.Qr, o2, _2), c2 = !n && !a2 && void 0 !== r2 && this.Pu.key(e2) === this.Pu.key(r2);
      h2.ng.set(t, u2), n ? this.vg(t, u2, h2.$n) : c2 && t.Fa() && as(u2) ? (t.Rr(u2), this.mg(t, u2)) : this.mg(t, u2);
      const d2 = { Va: as(u2), fg: n };
      if (!a2) return this.dg(t, -1, d2);
      const f2 = { timeWeight: 0, time: h2.Oa, pointData: h2, originalTime: ds(h2.ng) }, p2 = Rt(this.lg, this.Pu.key(f2.time), ((t2, i2) => this.Pu.key(t2.time) < i2));
      this.lg.splice(p2, 0, f2);
      for (let t2 = p2; t2 < this.lg.length; ++t2) ps(this.lg[t2].pointData, t2);
      return this.Pu.fillWeightsForPoints(this.lg, p2), this.dg(t, p2, d2);
    }
    wg(t, i) {
      const n = this.hg.get(t);
      if (void 0 === n || i <= 0) return [[], this.Mg()];
      i = Math.min(i, n.length);
      const s = n.splice(-i).reverse();
      0 === n.length ? this.ag.delete(t) : this.ag.set(t, n[n.length - 1].wt);
      for (const i2 of s) {
        const n2 = this.rg.get(this.Pu.key(i2.wt));
        if (n2 && (n2.ng.delete(t), 0 === n2.ng.size)) {
          this.rg.delete(this.Pu.key(n2.Oa)), this.lg.splice(n2.$n, 1);
          for (let t2 = n2.$n; t2 < this.lg.length; ++t2) ps(this.lg[t2].pointData, t2);
        }
      }
      return [s, this.dg(t, this.lg.length - 1, { fg: false, Va: false })];
    }
    mg(t, i) {
      let n = this.hg.get(t);
      void 0 === n && (n = [], this.hg.set(t, n));
      const s = 0 !== n.length ? n[n.length - 1] : null;
      null === s || this.Pu.key(i.wt) > this.Pu.key(s.wt) ? as(i) && n.push(i) : as(i) ? n[n.length - 1] = i : n.splice(-1, 1), this.ag.set(t, i.wt);
    }
    vg(t, i, n) {
      const s = this.hg.get(t);
      if (void 0 === s) return;
      const e2 = Rt(s, n, ((t2, i2) => t2.$n < i2));
      as(i) ? s[e2] = i : s.splice(e2, 1);
    }
    ug(t, i) {
      0 !== i.length ? (this.hg.set(t, i.filter(as)), this.ag.set(t, i[i.length - 1].wt)) : (this.hg.delete(t), this.ag.delete(t));
    }
    _g() {
      for (const t of this.lg) 0 === t.pointData.ng.size && this.rg.delete(this.Pu.key(t.time));
    }
    cg(t) {
      let i = -1;
      for (let n = 0; n < this.lg.length && n < t.length; ++n) {
        const s = this.lg[n], e2 = t[n];
        if (this.Pu.key(s.time) !== this.Pu.key(e2.time)) {
          i = n;
          break;
        }
        e2.timeWeight = s.timeWeight, ps(e2.pointData, n);
      }
      if (-1 === i && this.lg.length !== t.length && (i = Math.min(this.lg.length, t.length)), -1 === i) return -1;
      for (let n = i; n < t.length; ++n) ps(t[n].pointData, n);
      return this.Pu.fillWeightsForPoints(t, i), this.lg = t, i;
    }
    gg() {
      if (0 === this.hg.size) return null;
      let t = 0;
      return this.hg.forEach(((i) => {
        0 !== i.length && (t = Math.max(t, i[i.length - 1].$n));
      })), t;
    }
    dg(t, i, n) {
      const s = this.Mg();
      if (-1 !== i) this.hg.forEach(((i2, e2) => {
        s.Y_.set(e2, { ue: i2, bg: e2 === t ? n : void 0 });
      })), this.hg.has(t) || s.Y_.set(t, { ue: [], bg: n }), s.Et.Sg = this.lg, s.Et.xg = i;
      else {
        const i2 = this.hg.get(t);
        s.Y_.set(t, { ue: i2 || [], bg: n });
      }
      return s;
    }
    Mg() {
      return { Y_: /* @__PURE__ */ new Map(), Et: { Dc: this.gg() } };
    }
  };
  function ps(t, i) {
    t.$n = i, t.ng.forEach(((t2) => {
      t2.$n = i;
    }));
  }
  function vs(t, i) {
    return t._t < i;
  }
  function ms(t, i) {
    return i < t._t;
  }
  function ws(t, i, n, s) {
    return Rt(t, i, vs, n, s);
  }
  function Ms(t, i, n, s) {
    return Dt(t, i, ms, n, s);
  }
  function gs(t, i, n) {
    return { ne: t, se: i, ee: n };
  }
  function bs(t, i, n, s) {
    return t >= i - s && t <= n + s;
  }
  function Ss(t, i, n, s, e2, r2) {
    const h2 = e2 - n, a2 = r2 - s;
    if (0 === h2 && 0 === a2) return Math.hypot(t - n, i - s);
    const l2 = ((t - n) * h2 + (i - s) * a2) / (h2 * h2 + a2 * a2), o2 = Math.max(0, Math.min(1, l2)), _2 = n + h2 * o2, u2 = s + a2 * o2;
    return Math.hypot(t - _2, i - u2);
  }
  var xs = [0, 0];
  function Cs(t, i, n) {
    return void 0 === i || i.wt !== t.wt - 1 ? t._t - n / 2 : (i._t + t._t) / 2;
  }
  function ys(t, i, n) {
    return void 0 === i || i.wt !== t.wt + 1 ? t._t + n / 2 : (t._t + i._t) / 2;
  }
  function Ps(t, i, n, s, e2, r2, h2) {
    if (null === i || i.from >= i.to || 0 === t.length) return null;
    const a2 = e2 / 2 + r2, l2 = ws(t, n - a2, i.from, i.to), o2 = Ms(t, n + a2, l2, i.to);
    if (l2 >= o2) return null;
    let _2 = Number.POSITIVE_INFINITY;
    for (let a3 = l2; a3 < o2; a3++) {
      const l3 = t[a3], o3 = a3 > i.from ? t[a3 - 1] : void 0, u2 = a3 < i.to - 1 ? t[a3 + 1] : void 0, c2 = Cs(l3, o3, e2) - r2, d2 = ys(l3, u2, e2) + r2;
      if (n < c2 || n > d2) continue;
      h2(l3, xs);
      const f2 = xs[0], p2 = xs[1], v2 = Math.min(f2, p2), m2 = Math.max(f2, p2), w2 = v2 - r2, M2 = m2 + r2;
      if (s >= v2 && s <= m2) _2 = Math.min(_2, 0);
      else if (s >= w2 && s <= M2) {
        const t2 = Math.min(Math.abs(s - v2), Math.abs(m2 - s));
        _2 = Math.min(_2, t2);
      }
    }
    return Number.isFinite(_2) ? gs(_2, 0, "series-range") : null;
  }
  function ks(t, i) {
    return t.wt < i;
  }
  function Ts(t, i) {
    return i < t.wt;
  }
  function Rs(t, i, n) {
    const s = i.Na(), e2 = i.bi(), r2 = Rt(t, s, ks), h2 = Dt(t, e2, Ts);
    if (!n) return { from: r2, to: h2 };
    let a2 = r2, l2 = h2;
    return r2 > 0 && r2 < t.length && t[r2].wt >= s && (a2 = r2 - 1), h2 > 0 && h2 < t.length && t[h2 - 1].wt <= e2 && (l2 = h2 + 1), { from: a2, to: l2 };
  }
  var Ds = class {
    constructor(t, i, n) {
      this.Cg = true, this.yg = true, this.Pg = true, this.kg = [], this.Tg = null, this.Rg = -1, this.ae = t, this.le = i, this.Dg = n;
    }
    Pt(t) {
      this.Cg = true, "data" === t && (this.yg = true), "options" === t && (this.Pg = true);
    }
    Tt() {
      return this.ae.It() ? (this.Ig(), null === this.Tg ? null : this.Vg) : null;
    }
    Qs(t, i) {
      return this.ae.It() ? (this.Ig(), null === this.Tg ? null : this.Bg(t, i)) : null;
    }
    Bg(t, i) {
      return null;
    }
    Eg() {
      this.kg = this.kg.map(((t) => ({ ...t, ...this.ae.Sa().Sh(t.wt) })));
    }
    Ag() {
      this.Tg = null;
    }
    Ig() {
      const t = this.le.Et(), i = t.N().enableConflation ? t.sd() : 0;
      i !== this.Rg && (this.yg = true, this.Rg = i), this.yg && (this.Lg(), this.yg = false), this.Pg && (this.Eg(), this.Pg = false), this.Cg && (this.zg(), this.Cg = false);
    }
    zg() {
      const t = this.ae.Ft(), i = this.le.Et();
      if (this.Ag(), i.Zi() || t.Zi()) return;
      const n = i.Ee();
      if (null === n) return;
      if (0 === this.ae.Un().Th()) return;
      const s = this.ae.Lt();
      null !== s && (this.Tg = Rs(this.kg, n, this.Dg), this.Og(t, i, s.Wt), this.Ng());
    }
  };
  var Is = class {
    constructor(t, i) {
      this.Fg = t, this.Ki = i;
    }
    st(t, i, n) {
      this.Fg.draw(t, this.Ki, i, n);
    }
  };
  function Vs(t) {
    switch (t) {
      case "point":
        return 2;
      case "range":
        return 0;
      default:
        return 1;
    }
  }
  var Bs = class extends Ds {
    constructor(t, i, n) {
      super(t, i, false), this.Yh = n, this.Fg = this.Yh.renderer(), this.Vg = new Is(this.Fg, ((t2) => this.Wg(t2)));
    }
    get ga() {
      return this.Yh.conflationReducer;
    }
    Ha(t) {
      return this.Yh.priceValueBuilder(t);
    }
    dl(t) {
      return this.Yh.isWhitespace(t);
    }
    Bg(t, i) {
      const n = this.Fg.hitTest?.(t, i, ((t2) => this.Wg(t2)));
      if (null != n) return { ne: (s = n).distance, se: Vs(s.type), ee: "custom", gu: s.cursorStyle, te: s.objectId, ie: s.hitTestData };
      var s;
      const e2 = Ps(this.kg, this.Tg, t, i, this.le.Et().ml(), this.ae.N().hitTestTolerance, ((t2, i2) => {
        const n2 = t2.Hg;
        let s2 = NaN, e3 = NaN;
        if (void 0 !== n2 && !this.Yh.isWhitespace(n2)) for (const t3 of this.Yh.priceValueBuilder(n2)) {
          const i3 = this.Wg(t3);
          null !== i3 && (s2 = Number.isNaN(s2) ? i3 : Math.min(s2, i3), e3 = Number.isNaN(e3) ? i3 : Math.max(e3, i3));
        }
        i2[0] = s2, i2[1] = e3;
      }));
      return null === e2 ? null : { ...e2, ee: "custom" };
    }
    Lg() {
      const t = this.ae.Sa();
      this.kg = this.ae.Ua().Bh().map(((i) => ({ wt: i.$n, _t: NaN, ...t.Sh(i.$n), Hg: i.ue })));
    }
    Og(t, i) {
      i.Ic(this.kg, b(this.Tg));
    }
    Ng() {
      this.Yh.update({ bars: this.kg.map(Es), barSpacing: this.le.Et().ml(), visibleRange: this.Tg, conflationFactor: this.le.Et().sd() }, this.ae.N());
    }
    Wg(t) {
      const i = this.ae.Lt();
      return null === i ? null : this.ae.Ft().Nt(t, i.Wt);
    }
  };
  function Es(t) {
    return { x: t._t, time: t.wt, originalData: t.Hg, barColor: t.sh };
  }
  var As = { color: "#2196f3" };
  var Ls = (t, i, n) => {
    const s = c(n);
    return new Bs(t, i, s);
  };
  function zs(t) {
    const i = { value: t.Wt[3], time: t.Qr };
    return void 0 !== t.ig && (i.customValues = t.ig), i;
  }
  function Os(t) {
    const i = zs(t);
    return void 0 !== t.R && (i.color = t.R), i;
  }
  function Ns(t) {
    const i = zs(t);
    return void 0 !== t.vt && (i.lineColor = t.vt), void 0 !== t.ah && (i.topColor = t.ah), void 0 !== t.oh && (i.bottomColor = t.oh), i;
  }
  function Fs(t) {
    const i = zs(t);
    return void 0 !== t._h && (i.topLineColor = t._h), void 0 !== t.uh && (i.bottomLineColor = t.uh), void 0 !== t.dh && (i.topFillColor1 = t.dh), void 0 !== t.fh && (i.topFillColor2 = t.fh), void 0 !== t.ph && (i.bottomFillColor1 = t.ph), void 0 !== t.mh && (i.bottomFillColor2 = t.mh), i;
  }
  function Ws(t) {
    const i = { open: t.Wt[0], high: t.Wt[1], low: t.Wt[2], close: t.Wt[3], time: t.Qr };
    return void 0 !== t.ig && (i.customValues = t.ig), i;
  }
  function Hs(t) {
    const i = Ws(t);
    return void 0 !== t.R && (i.color = t.R), i;
  }
  function Us(t) {
    const i = Ws(t), { R: n, Ht: s, hh: e2 } = t;
    return void 0 !== n && (i.color = n), void 0 !== s && (i.borderColor = s), void 0 !== e2 && (i.wickColor = e2), i;
  }
  function $s(t) {
    return { Area: Ns, Line: Os, Baseline: Fs, Histogram: Os, Bar: Hs, Candlestick: Us, Custom: js }[t];
  }
  function js(t) {
    const i = t.Qr;
    return { ...t.ue, time: i };
  }
  var qs = { vertLine: { color: "#9598A1", width: 1, style: 3, visible: true, labelVisible: true, labelBackgroundColor: "#131722" }, horzLine: { color: "#9598A1", width: 1, style: 3, visible: true, labelVisible: true, labelBackgroundColor: "#131722" }, mode: 1, doNotSnapToHiddenSeriesIndices: false };
  var Ys = { vertLines: { color: "#D6DCDE", style: 0, visible: true }, horzLines: { color: "#D6DCDE", style: 0, visible: true } };
  var Ks = { background: { type: "solid", color: "#FFFFFF" }, textColor: "#191919", fontSize: 12, fontFamily: S, panes: { enableResize: true, separatorColor: "#E0E3EB", separatorHoverColor: "rgba(178, 181, 189, 0.2)" }, attributionLogo: true, colorSpace: "srgb", colorParsers: [] };
  var Gs = { autoScale: true, mode: 0, invertScale: false, alignLabels: true, borderVisible: true, borderColor: "#2B2B43", entireTextOnly: false, visible: false, ticksVisible: false, scaleMargins: { bottom: 0.1, top: 0.2 }, minimumWidth: 0, ensureEdgeTickMarksVisible: false, tickMarkDensity: 2.5 };
  var Zs = { rightOffset: 0, barSpacing: 6, minBarSpacing: 0.5, maxBarSpacing: 0, fixLeftEdge: false, fixRightEdge: false, lockVisibleTimeRangeOnResize: false, rightBarStaysOnScroll: false, borderVisible: true, borderColor: "#2B2B43", visible: true, timeVisible: false, secondsVisible: true, shiftVisibleRangeOnNewBar: true, allowShiftVisibleRangeOnWhitespaceReplacement: false, ticksVisible: false, uniformDistribution: false, minimumHeight: 0, allowBoldLabels: true, ignoreWhitespaceIndices: false, enableConflation: false, conflationThresholdFactor: 1, precomputeConflationOnInit: false, precomputeConflationPriority: "background" };
  function Xs() {
    return { addDefaultPane: true, hoveredSeriesOnTop: true, width: 0, height: 0, autoSize: false, layout: Ks, crosshair: qs, grid: Ys, overlayPriceScales: { ...Gs }, leftPriceScale: { ...Gs, visible: false }, rightPriceScale: { ...Gs, visible: true }, defaultVisiblePriceScaleId: "right", timeScale: Zs, localization: { locale: dn ? navigator.language : "", dateFormat: "dd MMM 'yy" }, handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true }, handleScale: { axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true }, mouseWheel: true, pinch: true }, kineticScroll: { mouse: false, touch: true }, trackingMode: { exitMode: 1 } };
  }
  var Js = class {
    constructor(t, i, n) {
      this.hv = t, this.Ug = i, this.$g = n ?? 0;
    }
    applyOptions(t) {
      this.hv.Qt().Dd(this.Ug, t, this.$g);
    }
    options() {
      return this.Ki().N();
    }
    width() {
      return Z(this.Ug) ? this.hv.DM(this.Ug) : 0;
    }
    setVisibleRange(t) {
      this.setAutoScale(false), this.Ki().Go(new mt(t.from, t.to));
    }
    getVisibleRange() {
      let t, i, n = this.Ki().ar();
      if (null === n) return null;
      if (this.Ki().ho()) {
        const s = this.Ki().S_(), e2 = Yi(s);
        n = vi(n, this.Ki().lo()), t = Number((Math.round(n.Je() / s) * s).toFixed(e2)), i = Number((Math.round(n.Qe() / s) * s).toFixed(e2));
      } else t = n.Je(), i = n.Qe();
      return { from: t, to: i };
    }
    setAutoScale(t) {
      this.applyOptions({ autoScale: t });
    }
    Ki() {
      return u(this.hv.Qt().Id(this.Ug, this.$g)).Ft;
    }
  };
  var Qs = class {
    constructor(t, i, n, s) {
      this.hv = t, this.yt = n, this.jg = i, this.qg = s;
    }
    getHeight() {
      return this.yt.$t();
    }
    setHeight(t) {
      const i = this.hv.Qt(), n = i._f(this.yt);
      i.Ld(n, t);
    }
    getStretchFactor() {
      return this.yt.F_();
    }
    setStretchFactor(t) {
      this.yt.W_(t), this.hv.Qt().ka();
    }
    paneIndex() {
      return this.hv.Qt()._f(this.yt);
    }
    moveTo(t) {
      const i = this.paneIndex();
      i !== t && (o(t >= 0 && t < this.hv.lv().length, "Invalid pane index"), this.hv.Qt().Od(i, t));
    }
    getSeries() {
      return this.yt.Y_().map(((t) => this.jg(t))) ?? [];
    }
    getHTMLElement() {
      const t = this.hv.lv();
      return t && 0 !== t.length && t[this.paneIndex()] ? t[this.paneIndex()].fv() : null;
    }
    attachPrimitive(t) {
      this.yt.ol(t), t.attached && t.attached({ chart: this.qg, requestUpdate: () => this.yt.Qt().ka() });
    }
    detachPrimitive(t) {
      this.yt._l(t);
    }
    priceScale(t) {
      if (null === this.yt.O_(t)) throw new Error(`Cannot find price scale with id: ${t}`);
      return new Js(this.hv, t, this.paneIndex());
    }
    setPreserveEmptyPane(t) {
      this.yt.j_(t);
    }
    preserveEmptyPane() {
      return this.yt.q_();
    }
    addCustomSeries(t, i = {}, n = 0) {
      return this.qg.addCustomSeries(t, i, n);
    }
    addSeries(t, i = {}) {
      return this.qg.addSeries(t, i, this.paneIndex());
    }
  };
  var te = { color: "#FF0000", price: 0, lineStyle: 2, lineWidth: 1, lineVisible: true, axisLabelVisible: true, title: "", axisLabelColor: "", axisLabelTextColor: "" };
  var ie = class {
    constructor(t) {
      this._r = t;
    }
    applyOptions(t) {
      this._r.vr(t);
    }
    options() {
      return this._r.N();
    }
    Yg() {
      return this._r;
    }
  };
  var ne = class {
    constructor(t, i, n, s, e2, r2) {
      this.Kg = new d(), this.ae = t, this.Gg = i, this.Zg = n, this.Pu = e2, this.qg = s, this.Xg = r2;
    }
    m() {
      this.Kg.m();
    }
    priceFormatter() {
      return this.ae.sl();
    }
    priceToCoordinate(t) {
      const i = this.ae.Lt();
      return null === i ? null : this.ae.Ft().Nt(t, i.Wt);
    }
    coordinateToPrice(t) {
      const i = this.ae.Lt();
      return null === i ? null : this.ae.Ft().Tn(t, i.Wt);
    }
    barsInLogicalRange(t) {
      if (null === t) return null;
      const i = new Oi(new Ai(t.from, t.to)).Uu(), n = this.ae.Un();
      if (n.Zi()) return null;
      const s = n.Hn(i.Na(), 1), e2 = n.Hn(i.bi(), -1), r2 = u(n.Rh()), h2 = u(n.Qn());
      if (null !== s && null !== e2 && s.$n > e2.$n) return { barsBefore: t.from - r2, barsAfter: h2 - t.to };
      const a2 = { barsBefore: null === s || s.$n === r2 ? t.from - r2 : s.$n - r2, barsAfter: null === e2 || e2.$n === h2 ? h2 - t.to : h2 - e2.$n };
      return null !== s && null !== e2 && (a2.from = s.Qr, a2.to = e2.Qr), a2;
    }
    setData(t) {
      this.Pu, this.ae.bh(), this.Gg.Jg(this.ae, t), this.Qg("full");
    }
    update(t, i = false) {
      this.ae.bh(), this.Gg.tb(this.ae, t, i), this.Qg("update");
    }
    pop(t = 1) {
      const i = this.Gg.ib(this.ae, t);
      0 !== i.length && this.Qg("update");
      const n = $s(this.seriesType());
      return i.map(((t2) => n(t2)));
    }
    dataByIndex(t, i) {
      const n = this.ae.Un().Hn(t, i);
      if (null === n) return null;
      return $s(this.seriesType())(n);
    }
    data() {
      const t = $s(this.seriesType());
      return this.ae.Un().Bh().map(((i) => t(i)));
    }
    subscribeDataChanged(t) {
      this.Kg.i(t);
    }
    unsubscribeDataChanged(t) {
      this.Kg._(t);
    }
    applyOptions(t) {
      this.ae.vr(t);
    }
    options() {
      return M(this.ae.N());
    }
    priceScale() {
      return this.Zg.priceScale(this.ae.Ft().pl(), this.getPane().paneIndex());
    }
    createPriceLine(t) {
      const i = f(M(te), t), n = this.ae.Ea(i);
      return new ie(n);
    }
    removePriceLine(t) {
      this.ae.Aa(t.Yg());
    }
    priceLines() {
      return this.ae.La().map(((t) => new ie(t)));
    }
    seriesType() {
      return this.ae.bh();
    }
    lastValueData(t) {
      const i = this.ae.Ae(t);
      return i.Le ? { noData: true } : { noData: false, price: i.Mt, color: i.R };
    }
    attachPrimitive(t) {
      this.ae.ol(t), t.attached && t.attached({ chart: this.qg, series: this, requestUpdate: () => this.ae.Qt().ka(), horzScaleBehavior: this.Pu });
    }
    detachPrimitive(t) {
      this.ae._l(t), t.detached && t.detached(), this.ae.Qt().ka();
    }
    getPane() {
      const t = this.ae, i = u(this.ae.Qt().Ks(t));
      return this.Xg(i);
    }
    moveToPane(t) {
      this.ae.Qt().rf(this.ae, t);
    }
    seriesOrder() {
      const t = this.ae.Qt().Ks(this.ae);
      return null === t ? -1 : t.Y_().indexOf(this.ae);
    }
    setSeriesOrder(t) {
      const i = this.ae.Qt().Ks(this.ae);
      null !== i && i.vu(this.ae, t);
    }
    Qg(t) {
      this.Kg.v() && this.Kg.p(t);
    }
  };
  var se = class {
    constructor(t, i, n) {
      this.nb = new d(), this.Qu = new d(), this.Nw = new d(), this.sn = t, this.ia = t.Et(), this.vM = i, this.ia.Zc().i(this.sb.bind(this)), this.ia.Xc().i(this.eb.bind(this)), this.vM.qw().i(this.rb.bind(this)), this.Pu = n;
    }
    m() {
      this.ia.Zc().u(this), this.ia.Xc().u(this), this.vM.qw().u(this), this.nb.m(), this.Qu.m(), this.Nw.m();
    }
    scrollPosition() {
      return this.ia.Oc();
    }
    scrollToPosition(t, i) {
      i ? this.ia.Yc(t, 1e3) : this.sn.gs(t);
    }
    scrollToRealTime() {
      this.ia.qc();
    }
    getVisibleRange() {
      const t = this.ia.xc();
      return null === t ? null : { from: t.from.originalTime, to: t.to.originalTime };
    }
    setVisibleRange(t) {
      const i = { from: this.Pu.convertHorzItemToInternal(t.from), to: this.Pu.convertHorzItemToInternal(t.to) }, n = this.ia.kc(i);
      this.sn.sf(n);
    }
    getVisibleLogicalRange() {
      const t = this.ia.Sc();
      return null === t ? null : { from: t.Na(), to: t.bi() };
    }
    setVisibleLogicalRange(t) {
      o(t.from <= t.to, "The from index cannot be after the to index."), this.sn.sf(t);
    }
    resetTimeScale() {
      this.sn.ws();
    }
    fitContent() {
      this.sn.td();
    }
    logicalToCoordinate(t) {
      const i = this.sn.Et();
      return i.Zi() ? null : i.jt(t);
    }
    coordinateToLogical(t) {
      return this.ia.Zi() ? null : this.ia.Vc(t);
    }
    timeToIndex(t, i) {
      const n = this.Pu.convertHorzItemToInternal(t);
      return this.ia.Mc(n, i);
    }
    timeToCoordinate(t) {
      const i = this.timeToIndex(t, false);
      return null === i ? null : this.ia.jt(i);
    }
    coordinateToTime(t) {
      const i = this.sn.Et(), n = i.Vc(t), s = i.en(n);
      return null === s ? null : s.originalTime;
    }
    width() {
      return this.vM.pv().width;
    }
    height() {
      return this.vM.pv().height;
    }
    subscribeVisibleTimeRangeChange(t) {
      this.nb.i(t);
    }
    unsubscribeVisibleTimeRangeChange(t) {
      this.nb._(t);
    }
    subscribeVisibleLogicalRangeChange(t) {
      this.Qu.i(t);
    }
    unsubscribeVisibleLogicalRangeChange(t) {
      this.Qu._(t);
    }
    subscribeSizeChange(t) {
      this.Nw.i(t);
    }
    unsubscribeSizeChange(t) {
      this.Nw._(t);
    }
    applyOptions(t) {
      this.ia.vr(t);
    }
    options() {
      return { ...M(this.ia.N()), barSpacing: this.ia.ml() };
    }
    sb() {
      this.nb.v() && this.nb.p(this.getVisibleRange());
    }
    eb() {
      this.Qu.v() && this.Qu.p(this.getVisibleLogicalRange());
    }
    rb(t) {
      this.Nw.p(t.width, t.height);
    }
  };
  function ee(t) {
    return (function(t2) {
      if (w(t2.handleScale)) {
        const i2 = t2.handleScale;
        t2.handleScale = { axisDoubleClickReset: { time: i2, price: i2 }, axisPressedMouseMove: { time: i2, price: i2 }, mouseWheel: i2, pinch: i2 };
      } else if (void 0 !== t2.handleScale) {
        const { axisPressedMouseMove: i2, axisDoubleClickReset: n } = t2.handleScale;
        w(i2) && (t2.handleScale.axisPressedMouseMove = { time: i2, price: i2 }), w(n) && (t2.handleScale.axisDoubleClickReset = { time: n, price: n });
      }
      const i = t2.handleScroll;
      w(i) && (t2.handleScroll = { horzTouchDrag: i, vertTouchDrag: i, mouseWheel: i, pressedMouseMove: i });
    })(t), t;
  }
  var re = class {
    constructor(t, i, n) {
      this.hb = /* @__PURE__ */ new Map(), this.ab = /* @__PURE__ */ new Map(), this.lb = new d(), this.ob = new d(), this._b = new d(), this.dd = /* @__PURE__ */ new WeakMap(), this.ub = new fs(i);
      const s = void 0 === n ? M(Xs()) : f(M(Xs()), ee(n));
      this.cb = i, this.hv = new Xn(t, s, i), this.hv.mw().i(((t2) => {
        this.lb.v() && this.lb.p(this.fb(t2()));
      }), this), this.hv.ww().i(((t2) => {
        this.ob.v() && this.ob.p(this.fb(t2()));
      }), this), this.hv.Bd().i(((t2) => {
        this._b.v() && this._b.p(this.fb(t2()));
      }), this);
      const e2 = this.hv.Qt();
      this.pb = new se(e2, this.hv.bM(), this.cb);
    }
    remove() {
      this.hv.mw().u(this), this.hv.ww().u(this), this.hv.Bd().u(this), this.pb.m(), this.hv.m(), this.hb.clear(), this.ab.clear(), this.lb.m(), this.ob.m(), this._b.m(), this.ub.m();
    }
    resize(t, i, n) {
      this.autoSizeActive() || this.hv.wM(t, i, n);
    }
    addCustomSeries(t, i = {}, n = 0) {
      const s = ((t2) => ({ type: "Custom", isBuiltIn: false, defaultOptions: { ...As, ...t2.defaultOptions() }, mb: Ls, wb: t2 }))(c(t));
      return this.Mb(s, i, n);
    }
    addSeries(t, i = {}, n = 0) {
      return this.Mb(t, i, n);
    }
    removeSeries(t) {
      const i = _(this.hb.get(t)), n = this.ub.if(i);
      this.hv.Qt().if(i), this.gb(n), this.hb.delete(t), this.ab.delete(i);
    }
    Jg(t, i) {
      this.gb(this.ub.og(t, i));
    }
    tb(t, i, n) {
      this.gb(this.ub.pg(t, i, n));
    }
    ib(t, i) {
      const [n, s] = this.ub.wg(t, i);
      return 0 !== n.length && this.gb(s), n;
    }
    subscribeClick(t) {
      this.lb.i(t);
    }
    unsubscribeClick(t) {
      this.lb._(t);
    }
    subscribeCrosshairMove(t) {
      this._b.i(t);
    }
    unsubscribeCrosshairMove(t) {
      this._b._(t);
    }
    subscribeDblClick(t) {
      this.ob.i(t);
    }
    unsubscribeDblClick(t) {
      this.ob._(t);
    }
    priceScale(t, i = 0) {
      return new Js(this.hv, t, i);
    }
    timeScale() {
      return this.pb;
    }
    applyOptions(t) {
      this.hv.vr(ee(t));
    }
    options() {
      return this.hv.N();
    }
    takeScreenshot(t = false, i = false) {
      let n, s;
      try {
        i || (n = this.hv.Qt().N().crosshair.mode, this.hv.vr({ crosshair: { mode: 2 } })), s = this.hv.TM(t);
      } finally {
        i || void 0 === n || this.hv.Qt().vr({ crosshair: { mode: n } });
      }
      return s;
    }
    addPane(t = false) {
      const i = this.hv.Qt().uf();
      return i.j_(t), this.bb(i);
    }
    removePane(t) {
      this.hv.Qt().Ad(t);
    }
    swapPanes(t, i) {
      this.hv.Qt().zd(t, i);
    }
    autoSizeActive() {
      return this.hv.CM();
    }
    chartElement() {
      return this.hv.Mv();
    }
    panes() {
      return this.hv.Qt().Gn().map(((t) => this.bb(t)));
    }
    paneSize(t = 0) {
      const i = this.hv.AM(t);
      return { height: i.height, width: i.width };
    }
    setCrosshairPosition(t, i, n) {
      const s = this.hb.get(n);
      if (void 0 === s) return;
      const e2 = this.hv.Qt().Ks(s);
      null !== e2 && this.hv.Qt().Gd(t, i, e2);
    }
    clearCrosshairPosition() {
      this.hv.Qt().Zd(true);
    }
    horzBehaviour() {
      return this.cb;
    }
    Mb(t, i = {}, n = 0) {
      o(void 0 !== t.mb), (function(t2) {
        if (void 0 === t2 || "custom" === t2.type) return;
        const i2 = t2;
        void 0 !== i2.minMove && void 0 === i2.precision && (i2.precision = Yi(i2.minMove));
      })(i.priceFormat), "Candlestick" === t.type && (function(t2) {
        void 0 !== t2.borderColor && (t2.borderUpColor = t2.borderColor, t2.borderDownColor = t2.borderColor), void 0 !== t2.wickColor && (t2.wickUpColor = t2.wickColor, t2.wickDownColor = t2.wickColor);
      })(i);
      const s = f(M(e), M(t.defaultOptions), i), r2 = t.mb, h2 = new Jt(this.hv.Qt(), t.type, s, r2, t.wb);
      this.hv.Qt().Qd(h2, n);
      const a2 = new ne(h2, this, this, this, this.cb, ((t2) => this.bb(t2)));
      return this.hb.set(a2, h2), this.ab.set(h2, a2), a2;
    }
    gb(t) {
      const i = this.hv.Qt();
      for (const i2 of t.Y_.keys()) i2.Ia();
      i.Xd(t.Et.Dc, t.Et.Sg, t.Et.xg), t.Y_.forEach(((t2, i2) => i2.ht(t2.ue, t2.bg))), i.Et().dc(), i.Lc();
    }
    Sb(t) {
      return _(this.ab.get(t));
    }
    xb(t) {
      return void 0 !== t && this.ab.has(t) ? this.Sb(t) : void 0;
    }
    fb(t) {
      const i = /* @__PURE__ */ new Map();
      t.QM.forEach(((t2, n2) => {
        const s2 = n2.bh(), e2 = $s(s2)(t2);
        if ("Custom" !== s2) o(ts(e2));
        else {
          const t3 = n2.cl();
          o(!t3 || false === t3(e2));
        }
        i.set(this.Sb(n2), e2);
      }));
      const n = this.xb(t.jM), s = void 0 === t.YM ? void 0 : { type: t.YM.ds, sourceKind: t.YM.KM, objectKind: t.YM.GM, series: this.xb(t.YM.Y_), objectId: t.YM.ZM, paneIndex: t.YM.XM };
      return { time: t.Qr, logical: t.$n, point: t.JM, paneIndex: t.XM, hoveredInfo: s, hoveredSeries: n, hoveredObjectId: t.qM, seriesData: i, sourceEvent: t.tg };
    }
    bb(t) {
      let i = this.dd.get(t);
      return i || (i = new Qs(this.hv, ((t2) => this.Sb(t2)), t, this), this.dd.set(t, i)), i;
    }
  };
  function he(t) {
    if (m(t)) {
      const i = document.getElementById(t);
      return o(null !== i, `Cannot find element in DOM with id=${t}`), i;
    }
    return t;
  }
  function ae(t, i, n) {
    const s = he(t), e2 = new re(s, i, n);
    return i.setOptions(e2.options()), e2;
  }
  function le(t, i) {
    return ae(t, new cn(), cn.Tf(i));
  }
  function _e(t, i, n, s) {
    return Math.hypot(n - t, s - i);
  }
  function ue(t, i, n, s, e2, r2, h2, a2 = 0) {
    if (0 === i.length || s.from >= i.length || s.to <= 0) return;
    const { context: l2, horizontalPixelRatio: o2, verticalPixelRatio: _2 } = t, u2 = i[s.from];
    let c2 = r2(t, u2), d2 = u2;
    if (s.to - s.from < 2) {
      const i2 = e2 / 2;
      l2.beginPath();
      const n2 = { _t: u2._t - i2, ut: u2.ut }, s2 = { _t: u2._t + i2, ut: u2.ut };
      l2.moveTo(n2._t * o2, n2.ut * _2), l2.lineTo(s2._t * o2, s2.ut * _2), h2(t, c2, n2, s2);
    } else {
      const e3 = a2 > 0;
      let f2 = 0;
      const p2 = (i2, n2) => {
        if (h2(t, c2, d2, n2), l2.beginPath(), c2 = i2, d2 = n2, e3) {
          const t2 = f2 % a2;
          l2.lineDashOffset = t2, f2 = t2;
        }
      };
      let v2 = d2;
      l2.beginPath(), l2.moveTo(u2._t * o2, u2.ut * _2);
      for (let h3 = s.from + 1; h3 < s.to; ++h3) {
        v2 = i[h3];
        const s2 = v2._t * o2, a3 = v2.ut * _2, u3 = r2(t, v2);
        switch (n) {
          case 0:
            if (l2.lineTo(s2, a3), e3) {
              const t2 = i[h3 - 1], n2 = t2._t * o2, e4 = t2.ut * _2;
              f2 += _e(n2, e4, s2, a3);
            }
            break;
          case 1: {
            const t2 = i[h3 - 1], n2 = t2.ut * _2;
            l2.lineTo(s2, n2), e3 && (f2 += Math.abs(v2._t - t2._t) * o2), u3 !== c2 && (p2(u3, v2), l2.lineTo(s2, n2)), l2.lineTo(s2, a3), e3 && (f2 += Math.abs(v2.ut - t2.ut) * _2);
            break;
          }
          case 2: {
            const [t2, n2] = pe(i, h3 - 1, h3), r3 = t2._t * o2, u4 = t2.ut * _2, c3 = n2._t * o2, d3 = n2.ut * _2;
            if (l2.bezierCurveTo(r3, u4, c3, d3, s2, a3), e3) {
              const t3 = i[h3 - 1], n3 = t3._t * o2, e4 = t3.ut * _2, l3 = _e(n3, e4, s2, a3), p3 = _e(n3, e4, r3, u4) + _e(r3, u4, c3, d3) + _e(c3, d3, s2, a3);
              f2 += (l3 + p3) / 2;
            }
            break;
          }
        }
        1 !== n && u3 !== c2 && (p2(u3, v2), l2.moveTo(s2, a3));
      }
      (d2 !== v2 || d2 === v2 && 1 === n) && h2(t, c2, d2, v2), e3 && (l2.lineDashOffset = 0);
    }
  }
  var ce = 6;
  function de(t, i) {
    return { _t: t._t - i._t, ut: t.ut - i.ut };
  }
  function fe(t, i) {
    return { _t: t._t / i, ut: t.ut / i };
  }
  function pe(t, i, n) {
    const s = Math.max(0, i - 1), e2 = Math.min(t.length - 1, n + 1);
    var r2, h2;
    return [(r2 = t[i], h2 = fe(de(t[n], t[s]), ce), { _t: r2._t + h2._t, ut: r2.ut + h2.ut }), de(t[n], fe(de(t[e2], t[i]), ce))];
  }
  function ve(t, i) {
    const n = t.context;
    n.strokeStyle = i, n.stroke();
  }
  var me = class extends R {
    constructor() {
      super(...arguments), this.rt = null;
    }
    ht(t) {
      this.rt = t;
    }
    et(t) {
      if (null === this.rt) return;
      const { ot: i, lt: n, Cb: s, yb: e2, ct: r2, Gt: h2, Pb: l2 } = this.rt;
      if (null === n) return;
      const o2 = t.context;
      o2.lineCap = "butt", o2.lineWidth = r2 * t.verticalPixelRatio;
      const _2 = a(o2, h2);
      o2.lineJoin = "round";
      const u2 = this.kb.bind(this), c2 = (function(t2) {
        return t2.reduce(((t3, i2) => t3 + i2), 0);
      })(_2);
      void 0 !== e2 && ue(t, i, e2, n, s, u2, ve, c2), l2 && (function(t2, i2, n2, s2, e3) {
        if (s2.to - s2.from <= 0) return;
        const { horizontalPixelRatio: r3, verticalPixelRatio: h3, context: a2 } = t2;
        let l3 = null;
        const o3 = Math.max(1, Math.floor(r3)) % 2 / 2, _3 = n2 * h3 + o3;
        for (let n3 = s2.to - 1; n3 >= s2.from; --n3) {
          const s3 = i2[n3];
          if (s3) {
            const i3 = e3(t2, s3);
            i3 !== l3 && (null !== l3 && a2.fill(), a2.beginPath(), a2.fillStyle = i3, l3 = i3);
            const n4 = Math.round(s3._t * r3) + o3, u3 = s3.ut * h3;
            a2.moveTo(n4, u3), a2.arc(n4, u3, _3, 0, 2 * Math.PI);
          }
        }
        a2.fill();
      })(t, i, l2, n, u2);
    }
  };
  var we = class extends me {
    kb(t, i) {
      return i.vt;
    }
  };
  function Me(t, i, n, s, e2) {
    const r2 = 1 - e2;
    return r2 * r2 * r2 * t + 3 * r2 * r2 * e2 * i + 3 * r2 * e2 * e2 * n + e2 * e2 * e2 * s;
  }
  function ge(t, i, n, s, e2) {
    if (2 === n) {
      const [n2, r2] = pe(s, e2 - 1, e2);
      return [Math.min(t._t, i._t, n2._t, r2._t), Math.max(t._t, i._t, n2._t, r2._t)];
    }
    return [Math.min(t._t, i._t), Math.max(t._t, i._t)];
  }
  function be(t, i, n, s, e2, r2, h2, a2) {
    switch (e2) {
      case 1: {
        const e3 = Ss(t, i, n._t, n.ut, s._t, n.ut), r3 = Ss(t, i, s._t, n.ut, s._t, s.ut), h3 = Math.min(e3, r3);
        return h3 <= a2 ? h3 : null;
      }
      case 2: {
        const [e3, l2] = pe(r2, h2 - 1, h2), o2 = (function(t2, i2, n2) {
          let s2 = Number.POSITIVE_INFINITY, e4 = n2[0];
          for (let r3 = 1; r3 <= 12; r3++) {
            const h3 = r3 / 12, a3 = { _t: Me(n2[0]._t, n2[1]._t, n2[2]._t, n2[3]._t, h3), ut: Me(n2[0].ut, n2[1].ut, n2[2].ut, n2[3].ut, h3) };
            s2 = Math.min(s2, Ss(t2, i2, e4._t, e4.ut, a3._t, a3.ut)), e4 = a3;
          }
          return s2;
        })(t, i, [n, e3, l2, s]);
        return o2 <= a2 ? o2 : null;
      }
      default: {
        const e3 = Ss(t, i, n._t, n.ut, s._t, s.ut);
        return e3 <= a2 ? e3 : null;
      }
    }
  }
  var Se = class extends Ds {
    constructor(t, i) {
      super(t, i, true);
    }
    Og(t, i, n) {
      i.Ic(this.kg, b(this.Tg)), t.Jo(this.kg, n, b(this.Tg));
    }
    Tb(t, i) {
      return { wt: t, Mt: i, _t: NaN, ut: NaN };
    }
    Lg() {
      const t = this.ae.Sa();
      this.kg = this.ae.Ua().Bh().map(((i) => {
        let n;
        if ((i.Gr ?? 1) > 1) {
          const t2 = i.Wt[1], s = i.Wt[2], e2 = i.Wt[3];
          n = Math.abs(t2 - e2) > Math.abs(s - e2) ? t2 : s;
        } else n = i.Wt[3];
        return this.Rb(i.$n, n, t);
      }));
    }
  };
  var xe = class extends Se {
    Bg(t, i) {
      const n = this.ae.N();
      return (function(t2, i2, n2, s, e2, r2, h2, a2 = 0, l2 = 0) {
        if (null === i2 || i2.from >= i2.to || 0 === t2.length) return null;
        const o2 = Math.max(r2 / 2, h2 ?? 0) + l2;
        let _2 = Number.POSITIVE_INFINITY;
        if (void 0 !== h2) {
          const e3 = h2 + l2, r3 = ws(t2, n2 - e3, i2.from, i2.to), a3 = Ms(t2, n2 + e3, r3, i2.to);
          for (let i3 = r3; i3 < a3; i3++) {
            const e4 = t2[i3];
            if (!bs(n2, e4._t, e4._t, h2 + l2)) continue;
            const r4 = Math.hypot(n2 - e4._t, s - e4.ut);
            r4 <= h2 + l2 && (_2 = Math.min(_2, r4));
          }
        }
        if (i2.to - i2.from < 2) {
          const e3 = t2[i2.from], r3 = Math.max(a2 / 2, o2), h3 = Ss(n2, s, e3._t - r3, e3.ut, e3._t + r3, e3.ut);
          return h3 <= o2 && (_2 = Math.min(_2, h3)), Number.isFinite(_2) ? gs(_2, 2, "series-point") : null;
        }
        let u2 = Number.POSITIVE_INFINITY;
        const c2 = ws(t2, n2 - o2, i2.from, i2.to), d2 = Ms(t2, n2 + o2, c2, i2.to), f2 = Math.max(i2.from + 1, c2), p2 = Math.min(i2.to, d2 + 1);
        for (let i3 = f2; i3 < p2; i3++) {
          const r3 = t2[i3 - 1], h3 = t2[i3], [a3, l3] = ge(r3, h3, e2, t2, i3);
          if (!bs(n2, a3, l3, o2)) continue;
          const _3 = be(n2, s, r3, h3, e2, t2, i3, o2);
          null !== _3 && (u2 = Math.min(u2, _3));
        }
        return Number.isFinite(_2) ? gs(_2, 2, "series-point") : Number.isFinite(u2) ? gs(u2, 1, "series-line") : null;
      })(this.kg, this.Tg, t, i, n.lineType, n.lineVisible ? n.lineWidth : 1, n.pointMarkersVisible ? n.pointMarkersRadius || n.lineWidth / 2 + 2 : void 0, this.le.Et().ml(), n.hitTestTolerance);
    }
  };
  var Ce = class extends xe {
    constructor() {
      super(...arguments), this.Vg = new we();
    }
    Rb(t, i, n) {
      return { ...this.Tb(t, i), ...n.Sh(t) };
    }
    Ng() {
      const t = this.ae.N(), i = { ot: this.kg, Gt: t.lineStyle, yb: t.lineVisible ? t.lineType : void 0, ct: t.lineWidth, Pb: t.pointMarkersVisible ? t.pointMarkersRadius || t.lineWidth / 2 + 2 : void 0, lt: this.Tg, Cb: this.le.Et().ml() };
      this.Vg.ht(i);
    }
  };
  var ye = { type: "Line", isBuiltIn: true, defaultOptions: { color: "#2196f3", lineStyle: 0, lineWidth: 3, lineType: 0, lineVisible: true, crosshairMarkerVisible: true, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: "", crosshairMarkerBorderWidth: 2, crosshairMarkerBackgroundColor: "", lastPriceAnimation: 0, pointMarkersVisible: false }, mb: (t, i) => new Ce(t, i) };
  function Ae(t, i, n, s, e2) {
    const { context: r2, horizontalPixelRatio: h2, verticalPixelRatio: a2 } = i;
    r2.lineTo(e2._t * h2, t * a2), r2.lineTo(s._t * h2, t * a2), r2.closePath(), r2.fillStyle = n, r2.fill();
  }
  var Le = class extends R {
    constructor() {
      super(...arguments), this.rt = null;
    }
    ht(t) {
      this.rt = t;
    }
    et(t) {
      if (null === this.rt) return;
      const { ot: i, lt: n, Cb: s, ct: e2, Gt: r2, yb: h2 } = this.rt, l2 = this.rt.Lb ?? (this.rt.zb ? 0 : t.mediaSize.height);
      if (null === n) return;
      const o2 = t.context;
      o2.lineCap = "butt", o2.lineJoin = "round", o2.lineWidth = e2, a(o2, r2), o2.lineWidth = 1, ue(t, i, h2, n, s, this.Ob.bind(this), Ae.bind(null, l2));
    }
  };
  var ze = class {
    Nb(t, i) {
      const n = this.Fb, { Wb: s, Hb: e2, Ub: r2, $b: h2, Lb: a2, jb: l2, qb: o2 } = i;
      if (void 0 === this.Yb || void 0 === n || n.Wb !== s || n.Hb !== e2 || n.Ub !== r2 || n.$b !== h2 || n.Lb !== a2 || n.jb !== l2 || n.qb !== o2) {
        const { verticalPixelRatio: n2 } = t, _2 = a2 || l2 > 0 ? n2 : 1, u2 = l2 * _2, c2 = o2 === t.bitmapSize.height ? o2 : o2 * _2, d2 = (a2 ?? 0) * _2, f2 = t.context.createLinearGradient(0, u2, 0, c2);
        if (f2.addColorStop(0, s), null != a2) {
          const t2 = ni((d2 - u2) / (c2 - u2), 0, 1);
          f2.addColorStop(t2, e2), f2.addColorStop(t2, r2);
        }
        f2.addColorStop(1, h2), this.Yb = f2, this.Fb = i;
      }
      return this.Yb;
    }
  };
  var Fe = class {
    constructor(t, i, n, s) {
      this.Zb = t, this.Xb = i, this.Jb = n, this.Qb = s;
    }
    st(t, i, n) {
      this.Zb.st(t, i, n), !this.Jb() || i && this.Qb() || this.Xb.st(t, i, n);
    }
  };
  var We = class {
    constructor(t, i) {
      this.Xb = t, this.tS = i;
    }
    Tt() {
      return this.tS() ? this.Xb : null;
    }
  };
  var $e = class extends Le {
    constructor() {
      super(...arguments), this.Kb = new ze();
    }
    Ob(t, i) {
      return this.Kb.Nb(t, { Wb: i.ah, Hb: "", Ub: "", $b: i.oh, jb: this.rt?.jb ?? 0, qb: t.bitmapSize.height });
    }
  };
  var je = class extends xe {
    constructor(t, i) {
      super(t, i), this.lS = new $e(), this.Xb = new we(), this.sS = new We(this.Xb, (() => this.Jb())), this.eS = [this], this.rS = [this.sS], this.hS = { Za: this.eS, qa: this.rS }, this.Vg = new Fe(this.lS, this.Xb, (() => this.Jb()), (() => this.le.N().hoveredSeriesOnTop));
    }
    Ga() {
      return this.hS;
    }
    Rb(t, i, n) {
      return { ...this.Tb(t, i), ...n.Sh(t) };
    }
    Ng() {
      const t = this.ae.N();
      if (null === this.Tg || 0 === this.kg.length) return;
      let i;
      if (t.relativeGradient) {
        i = this.kg[this.Tg.from].ut;
        for (let t2 = this.Tg.from; t2 < this.Tg.to; t2++) {
          const n = this.kg[t2];
          n.ut < i && (i = n.ut);
        }
      }
      this.lS.ht({ yb: t.lineType, ot: this.kg, Gt: t.lineStyle, ct: t.lineWidth, Lb: null, jb: i, zb: t.invertFilledArea, lt: this.Tg, Cb: this.le.Et().ml() }), this.Xb.ht({ yb: t.lineVisible ? t.lineType : void 0, ot: this.kg, Gt: t.lineStyle, ct: t.lineWidth, lt: this.Tg, Cb: this.le.Et().ml(), Pb: t.pointMarkersVisible ? t.pointMarkersRadius || t.lineWidth / 2 + 2 : void 0 });
    }
    Jb() {
      return this.ae.It() && null !== this.Tg && this.aS();
    }
    aS() {
      const t = this.ae.N();
      return t.lineVisible || t.pointMarkersVisible;
    }
  };
  var qe = { type: "Area", isBuiltIn: true, defaultOptions: { topColor: "rgba( 46, 220, 135, 0.4)", bottomColor: "rgba( 40, 221, 100, 0)", invertFilledArea: false, relativeGradient: false, lineColor: "#33D778", lineStyle: 0, lineWidth: 3, lineType: 0, lineVisible: true, crosshairMarkerVisible: true, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: "", crosshairMarkerBorderWidth: 2, crosshairMarkerBackgroundColor: "", lastPriceAnimation: 0, pointMarkersVisible: false }, mb: (t, i) => new je(t, i) };
  var Ye = class extends R {
    constructor() {
      super(...arguments), this.qt = null, this.oS = 0, this._S = 0;
    }
    ht(t) {
      this.qt = t;
    }
    et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
      if (null === this.qt || 0 === this.qt.Un.length || null === this.qt.lt) return;
      if (this.oS = this.uS(i), this.oS >= 2) {
        Math.max(1, Math.floor(i)) % 2 != this.oS % 2 && this.oS--;
      }
      this._S = this.qt.cS ? Math.min(this.oS, Math.floor(i)) : this.oS;
      let s = null;
      const e2 = this._S <= this.oS && this.qt.ml >= Math.floor(1.5 * i);
      for (let r2 = this.qt.lt.from; r2 < this.qt.lt.to; ++r2) {
        const h2 = this.qt.Un[r2];
        s !== h2.sh && (t.fillStyle = h2.sh, s = h2.sh);
        const a2 = Math.floor(0.5 * this._S), l2 = Math.round(h2._t * i), o2 = l2 - a2, _2 = this._S, u2 = o2 + _2 - 1, c2 = Math.min(h2.n_, h2.s_), d2 = Math.max(h2.n_, h2.s_), f2 = Math.round(c2 * n) - a2, p2 = Math.round(d2 * n) + a2, v2 = Math.max(p2 - f2, this._S);
        t.fillRect(o2, f2, _2, v2);
        const m2 = Math.ceil(1.5 * this.oS);
        if (e2) {
          if (this.qt.dS) {
            const i3 = l2 - m2;
            let s3 = Math.max(f2, Math.round(h2.i_ * n) - a2), e4 = s3 + _2 - 1;
            e4 > f2 + v2 - 1 && (e4 = f2 + v2 - 1, s3 = e4 - _2 + 1), t.fillRect(i3, s3, o2 - i3, e4 - s3 + 1);
          }
          const i2 = l2 + m2;
          let s2 = Math.max(f2, Math.round(h2.e_ * n) - a2), e3 = s2 + _2 - 1;
          e3 > f2 + v2 - 1 && (e3 = f2 + v2 - 1, s2 = e3 - _2 + 1), t.fillRect(u2 + 1, s2, i2 - u2, e3 - s2 + 1);
        }
      }
    }
    uS(t) {
      const i = Math.floor(t);
      return Math.max(i, Math.floor((function(t2, i2) {
        return Math.floor(0.3 * t2 * i2);
      })(u(this.qt).ml, t)));
    }
  };
  var Ke = class extends Ds {
    constructor(t, i) {
      super(t, i, false);
    }
    Bg(t, i) {
      return Ps(this.kg, this.Tg, t, i, this.le.Et().ml(), this.ae.N().hitTestTolerance, ((t2, i2) => {
        i2[0] = t2.n_, i2[1] = t2.s_;
      }));
    }
    Og(t, i, n) {
      i.Ic(this.kg, b(this.Tg)), t.t_(this.kg, n, b(this.Tg));
    }
    fS(t, i, n) {
      return { wt: t, jr: i.Wt[0], qr: i.Wt[1], Yr: i.Wt[2], Kr: i.Wt[3], _t: NaN, i_: NaN, n_: NaN, s_: NaN, e_: NaN };
    }
    Lg() {
      const t = this.ae.Sa();
      this.kg = this.ae.Ua().Bh().map(((i) => this.Rb(i.$n, i, t)));
    }
  };
  var Ge = class extends Ke {
    constructor() {
      super(...arguments), this.Vg = new Ye();
    }
    Rb(t, i, n) {
      return { ...this.fS(t, i, n), ...n.Sh(t) };
    }
    Ng() {
      const t = this.ae.N();
      this.Vg.ht({ Un: this.kg, ml: this.le.Et().ml(), dS: t.openVisible, cS: t.thinBars, lt: this.Tg });
    }
  };
  var Ze = { type: "Bar", isBuiltIn: true, defaultOptions: { upColor: "#26a69a", downColor: "#ef5350", openVisible: true, thinBars: true }, mb: (t, i) => new Ge(t, i) };
  var Xe = class extends R {
    constructor() {
      super(...arguments), this.qt = null, this.oS = 0;
    }
    ht(t) {
      this.qt = t;
    }
    et(t) {
      if (null === this.qt || 0 === this.qt.Un.length || null === this.qt.lt) return;
      const { horizontalPixelRatio: i } = t;
      if (this.oS = (function(t2, i2) {
        if (t2 >= 2.5 && t2 <= 4) return Math.floor(3 * i2);
        const n2 = 1 - 0.2 * Math.atan(Math.max(4, t2) - 4) / (0.5 * Math.PI), s2 = Math.floor(t2 * n2 * i2), e2 = Math.floor(t2 * i2), r2 = Math.min(s2, e2);
        return Math.max(Math.floor(i2), r2);
      })(this.qt.ml, i), this.oS >= 2) {
        Math.floor(i) % 2 != this.oS % 2 && this.oS--;
      }
      const n = this.qt.Un;
      this.qt.pS && this.vS(t, n, this.qt.lt), this.qt.gi && this.Vm(t, n, this.qt.lt);
      const s = this.mS(i);
      (!this.qt.gi || this.oS > 2 * s) && this.wS(t, n, this.qt.lt);
    }
    vS(t, i, n) {
      if (null === this.qt) return;
      const { context: s, horizontalPixelRatio: e2, verticalPixelRatio: r2 } = t;
      let h2 = "", a2 = Math.min(Math.floor(e2), Math.floor(this.qt.ml * e2));
      a2 = Math.max(Math.floor(e2), Math.min(a2, this.oS));
      const l2 = Math.floor(0.5 * a2);
      let o2 = null;
      for (let t2 = n.from; t2 < n.to; t2++) {
        const n2 = i[t2];
        n2.rh !== h2 && (s.fillStyle = n2.rh, h2 = n2.rh);
        const _2 = Math.round(Math.min(n2.i_, n2.e_) * r2), u2 = Math.round(Math.max(n2.i_, n2.e_) * r2), c2 = Math.round(n2.n_ * r2), d2 = Math.round(n2.s_ * r2);
        let f2 = Math.round(e2 * n2._t) - l2;
        const p2 = f2 + a2 - 1;
        null !== o2 && (f2 = Math.max(o2 + 1, f2), f2 = Math.min(f2, p2));
        const v2 = p2 - f2 + 1;
        s.fillRect(f2, c2, v2, _2 - c2), s.fillRect(f2, u2 + 1, v2, d2 - u2), o2 = p2;
      }
    }
    mS(t) {
      let i = Math.floor(1 * t);
      this.oS <= 2 * i && (i = Math.floor(0.5 * (this.oS - 1)));
      const n = Math.max(Math.floor(t), i);
      return this.oS <= 2 * n ? Math.max(Math.floor(t), Math.floor(1 * t)) : n;
    }
    Vm(t, i, n) {
      if (null === this.qt) return;
      const { context: s, horizontalPixelRatio: e2, verticalPixelRatio: r2 } = t;
      let h2 = "";
      const a2 = this.mS(e2);
      let l2 = null;
      for (let t2 = n.from; t2 < n.to; t2++) {
        const n2 = i[t2];
        n2.eh !== h2 && (s.fillStyle = n2.eh, h2 = n2.eh);
        let o2 = Math.round(n2._t * e2) - Math.floor(0.5 * this.oS);
        const _2 = o2 + this.oS - 1, u2 = Math.round(Math.min(n2.i_, n2.e_) * r2), c2 = Math.round(Math.max(n2.i_, n2.e_) * r2);
        if (null !== l2 && (o2 = Math.max(l2 + 1, o2), o2 = Math.min(o2, _2)), this.qt.ml * e2 > 2 * a2) L(s, o2, u2, _2 - o2 + 1, c2 - u2 + 1, a2);
        else {
          const t3 = _2 - o2 + 1;
          s.fillRect(o2, u2, t3, c2 - u2 + 1);
        }
        l2 = _2;
      }
    }
    wS(t, i, n) {
      if (null === this.qt) return;
      const { context: s, horizontalPixelRatio: e2, verticalPixelRatio: r2 } = t;
      let h2 = "";
      const a2 = this.mS(e2);
      for (let t2 = n.from; t2 < n.to; t2++) {
        const n2 = i[t2];
        let l2 = Math.round(Math.min(n2.i_, n2.e_) * r2), o2 = Math.round(Math.max(n2.i_, n2.e_) * r2), _2 = Math.round(n2._t * e2) - Math.floor(0.5 * this.oS), u2 = _2 + this.oS - 1;
        if (n2.sh !== h2) {
          const t3 = n2.sh;
          s.fillStyle = t3, h2 = t3;
        }
        this.qt.gi && (_2 += a2, l2 += a2, u2 -= a2, o2 -= a2), l2 > o2 || s.fillRect(_2, l2, u2 - _2 + 1, o2 - l2 + 1);
      }
    }
  };
  var Je = class extends Ke {
    constructor() {
      super(...arguments), this.Vg = new Xe();
    }
    Rb(t, i, n) {
      return { ...this.fS(t, i, n), ...n.Sh(t) };
    }
    Ng() {
      const t = this.ae.N();
      this.Vg.ht({ Un: this.kg, ml: this.le.Et().ml(), pS: t.wickVisible, gi: t.borderVisible, lt: this.Tg });
    }
  };
  var Qe = { type: "Candlestick", isBuiltIn: true, defaultOptions: { upColor: "#26a69a", downColor: "#ef5350", wickVisible: true, borderVisible: true, borderColor: "#378658", borderUpColor: "#26a69a", borderDownColor: "#ef5350", wickColor: "#737375", wickUpColor: "#26a69a", wickDownColor: "#ef5350" }, mb: (t, i) => new Je(t, i) };
  var tr = class extends R {
    constructor() {
      super(...arguments), this.qt = null, this.MS = [];
    }
    ht(t) {
      this.qt = t, this.MS = [];
    }
    et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
      if (null === this.qt || 0 === this.qt.ot.length || null === this.qt.lt) return;
      this.MS.length || this.gS(i);
      const s = Math.max(1, Math.floor(n)), e2 = Math.round(this.qt.bS * n) - Math.floor(s / 2), r2 = e2 + s;
      for (let i2 = this.qt.lt.from; i2 < this.qt.lt.to; i2++) {
        const h2 = this.qt.ot[i2], a2 = this.MS[i2 - this.qt.lt.from], l2 = Math.round(h2.ut * n);
        let o2, _2;
        t.fillStyle = h2.sh, l2 <= e2 ? (o2 = l2, _2 = r2) : (o2 = e2, _2 = l2 - Math.floor(s / 2) + s), t.fillRect(a2.Na, o2, a2.bi - a2.Na + 1, _2 - o2);
      }
    }
    gS(t) {
      if (null === this.qt || 0 === this.qt.ot.length || null === this.qt.lt) return void (this.MS = []);
      const i = Math.ceil(this.qt.ml * t) <= 1 ? 0 : Math.max(1, Math.floor(t)), n = Math.round(this.qt.ml * t) - i;
      this.MS = new Array(this.qt.lt.to - this.qt.lt.from);
      for (let i2 = this.qt.lt.from; i2 < this.qt.lt.to; i2++) {
        const s2 = this.qt.ot[i2], e2 = Math.round(s2._t * t);
        let r2, h2;
        if (n % 2) {
          const t2 = (n - 1) / 2;
          r2 = e2 - t2, h2 = e2 + t2;
        } else {
          const t2 = n / 2;
          r2 = e2 - t2, h2 = e2 + t2 - 1;
        }
        this.MS[i2 - this.qt.lt.from] = { Na: r2, bi: h2, SS: e2, ce: s2._t * t, wt: s2.wt };
      }
      for (let t2 = this.qt.lt.from + 1; t2 < this.qt.lt.to; t2++) {
        const n2 = this.MS[t2 - this.qt.lt.from], s2 = this.MS[t2 - this.qt.lt.from - 1];
        n2.wt === s2.wt + 1 && (n2.Na - s2.bi !== i + 1 && (s2.SS > s2.ce ? s2.bi = n2.Na - i - 1 : n2.Na = s2.bi + i + 1));
      }
      let s = Math.ceil(this.qt.ml * t);
      for (let t2 = this.qt.lt.from; t2 < this.qt.lt.to; t2++) {
        const i2 = this.MS[t2 - this.qt.lt.from];
        i2.bi < i2.Na && (i2.bi = i2.Na);
        const n2 = i2.bi - i2.Na + 1;
        s = Math.min(n2, s);
      }
      if (i > 0 && s < 4) for (let t2 = this.qt.lt.from; t2 < this.qt.lt.to; t2++) {
        const i2 = this.MS[t2 - this.qt.lt.from];
        i2.bi - i2.Na + 1 > s && (i2.SS > i2.ce ? i2.bi -= 1 : i2.Na += 1);
      }
    }
  };
  var ir = class extends Se {
    constructor() {
      super(...arguments), this.Vg = new tr();
    }
    Bg(t, i) {
      const n = this.ae.Ft().Nt(this.ae.N().base, u(this.ae.Lt()).Wt);
      return null === n ? null : Ps(this.kg, this.Tg, t, i, this.le.Et().ml(), this.ae.N().hitTestTolerance, ((t2, i2) => {
        i2[0] = t2.ut, i2[1] = n;
      }));
    }
    Rb(t, i, n) {
      return { ...this.Tb(t, i), ...n.Sh(t) };
    }
    Ng() {
      const t = { ot: this.kg, ml: this.le.Et().ml(), lt: this.Tg, bS: this.ae.Ft().Nt(this.ae.N().base, u(this.ae.Lt()).Wt) };
      this.Vg.ht(t);
    }
  };
  var nr = { type: "Histogram", isBuiltIn: true, defaultOptions: { color: "#26a69a", base: 0 }, mb: (t, i) => new ir(t, i) };
  var Gr = { ...e, color: "#2196f3" };

  // src/oscillators.ts
  var MAX_OSCILLATOR_BARS = 15e4;
  var bounded = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  function checkBars(input) {
    if (!Array.isArray(input) || input.length > MAX_OSCILLATOR_BARS) throw Error("Invalid oscillator history");
    let previous = 0;
    for (const bar of input) {
      if (!Number.isSafeInteger(bar.time) || bar.time <= previous || !Number.isFinite(bar.open) || !Number.isFinite(bar.high) || !Number.isFinite(bar.low) || !Number.isFinite(bar.close)) throw Error("Invalid oscillator candles");
      if (bar.tick_volume !== void 0 && (!Number.isFinite(bar.tick_volume) || bar.tick_volume < 0) || bar.real_volume !== void 0 && (!Number.isFinite(bar.real_volume) || bar.real_volume < 0)) throw Error("Invalid oscillator volume");
      previous = bar.time;
    }
    return [...input];
  }
  function ema(values, period) {
    const out = new Array(values.length).fill(null), factor = 2 / (period + 1);
    let previous = null;
    for (let i = 0; i < values.length; i++) {
      previous = previous === null ? values[i] : previous + factor * (values[i] - previous);
      if (i >= period - 1) out[i] = previous;
    }
    return out;
  }
  function point(bars, index, value) {
    return { time: bars[index].time, value };
  }
  function rsi(bars, period) {
    const out = [];
    if (bars.length <= period) return out;
    let up = 0, down = 0;
    for (let i = 1; i <= period; i++) {
      const d2 = bars[i].close - bars[i - 1].close;
      up += Math.max(d2, 0);
      down += Math.max(-d2, 0);
    }
    up /= period;
    down /= period;
    const value = () => up === 0 && down === 0 ? 50 : down === 0 ? 100 : up === 0 ? 0 : 100 - 100 / (1 + up / down);
    out.push(point(bars, period, value()));
    for (let i = period + 1; i < bars.length; i++) {
      const d2 = bars[i].close - bars[i - 1].close;
      up = (up * (period - 1) + Math.max(d2, 0)) / period;
      down = (down * (period - 1) + Math.max(-d2, 0)) / period;
      out.push(point(bars, i, value()));
    }
    return out;
  }
  function stochastic(bars, period, smoothK, smoothD) {
    const stochK = [], stochD = [];
    if (bars.length < period || smoothK < 1 || smoothD < 1) return { stochK, stochD };
    const raw = [];
    for (let i = period - 1; i < bars.length; i++) {
      let high = -Infinity, low = Infinity;
      for (let j2 = i - period + 1; j2 <= i; j2++) {
        high = Math.max(high, bars[j2].high);
        low = Math.min(low, bars[j2].low);
      }
      raw.push(point(bars, i, high === low ? 50 : 100 * (bars[i].close - low) / (high - low)));
    }
    let sum = 0;
    for (let i = 0; i < raw.length; i++) {
      sum += raw[i].value;
      if (i >= smoothK) sum -= raw[i - smoothK].value;
      if (i >= smoothK - 1) stochK.push({ time: raw[i].time, value: sum / smoothK });
    }
    sum = 0;
    for (let i = 0; i < stochK.length; i++) {
      sum += stochK[i].value;
      if (i >= smoothD) sum -= stochK[i - smoothD].value;
      if (i >= smoothD - 1) stochD.push({ time: stochK[i].time, value: sum / smoothD });
    }
    return { stochK, stochD };
  }
  function stochRsi(bars, period, stochPeriod, smoothK, smoothD) {
    const values = rsi(bars, period), raw = [], stochRsiK = [], stochRsiD = [];
    for (let i = stochPeriod - 1; i < values.length; i++) {
      const window2 = values.slice(i - stochPeriod + 1, i + 1), low = Math.min(...window2.map((p2) => p2.value)), high = Math.max(...window2.map((p2) => p2.value));
      raw.push({ time: values[i].time, value: high === low ? 50 : 100 * (values[i].value - low) / (high - low) });
    }
    let sum = 0;
    for (let i = 0; i < raw.length; i++) {
      sum += raw[i].value;
      if (i >= smoothK) sum -= raw[i - smoothK].value;
      if (i >= smoothK - 1) stochRsiK.push({ time: raw[i].time, value: sum / smoothK });
    }
    sum = 0;
    for (let i = 0; i < stochRsiK.length; i++) {
      sum += stochRsiK[i].value;
      if (i >= smoothD) sum -= stochRsiK[i - smoothD].value;
      if (i >= smoothD - 1) stochRsiD.push({ time: stochRsiK[i].time, value: sum / smoothD });
    }
    return { stochRsiK, stochRsiD };
  }
  function cci(bars, period) {
    const out = [], window2 = [];
    let sum = 0;
    for (let i = 0; i < bars.length; i++) {
      const b2 = bars[i], value = (b2.high + b2.low + b2.close) / 3;
      window2.push(value);
      sum += value;
      if (window2.length > period) sum -= window2.shift();
      if (window2.length < period) continue;
      const mean = sum / period;
      let deviation = 0;
      for (const sample of window2) deviation += Math.abs(sample - mean);
      out.push(point(bars, i, deviation === 0 ? 0 : (value - mean) / (0.015 * deviation / period)));
    }
    return out;
  }
  function momentum(bars, period) {
    const out = [];
    for (let i = period; i < bars.length; i++) out.push(point(bars, i, bars[i].close - bars[i - period].close));
    return out;
  }
  function roc(bars, period) {
    const out = [];
    for (let i = period; i < bars.length; i++) {
      const reference = bars[i - period].close;
      if (reference !== 0) out.push(point(bars, i, (bars[i].close / reference - 1) * 100));
    }
    return out;
  }
  function brokerVolume(bar) {
    return (bar.real_volume ?? 0) > 0 ? bar.real_volume : bar.tick_volume ?? 0;
  }
  function obv(bars) {
    const out = [];
    if (!bars.length) return out;
    let value = 0;
    out.push(point(bars, 0, value));
    for (let i = 1; i < bars.length; i++) {
      if (bars[i].close > bars[i - 1].close) value += brokerVolume(bars[i]);
      else if (bars[i].close < bars[i - 1].close) value -= brokerVolume(bars[i]);
      out.push(point(bars, i, value));
    }
    return out;
  }
  function mfi(bars, period) {
    const out = [], positive = [], negative = [], volumes = [];
    for (let i = 1; i < bars.length; i++) {
      const bar = bars[i], previous = bars[i - 1], price = (bar.high + bar.low + bar.close) / 3, previousPrice = (previous.high + previous.low + previous.close) / 3, volume = brokerVolume(bar), flow = price * volume;
      positive.push(price > previousPrice ? flow : 0);
      negative.push(price < previousPrice ? flow : 0);
      volumes.push(volume);
      if (positive.length > period) {
        positive.shift();
        negative.shift();
        volumes.shift();
      }
      if (positive.length < period || volumes.reduce((sum, item) => sum + item, 0) <= 0) continue;
      const pos = positive.reduce((sum, item) => sum + item, 0), neg = negative.reduce((sum, item) => sum + item, 0);
      out.push(point(bars, i, pos + neg === 0 ? 50 : 100 * pos / (pos + neg)));
    }
    return out;
  }
  function tr2(bars, i) {
    const b2 = bars[i], prev = bars[i - 1]?.close;
    return Math.max(b2.high - b2.low, prev === void 0 ? 0 : Math.abs(b2.high - prev), prev === void 0 ? 0 : Math.abs(b2.low - prev));
  }
  function atr(bars, period) {
    const out = [];
    if (bars.length < period) return out;
    let mean = 0;
    for (let i = 0; i < period; i++) mean += tr2(bars, i);
    mean /= period;
    out.push(point(bars, period - 1, mean));
    for (let i = period; i < bars.length; i++) {
      mean = (mean * (period - 1) + tr2(bars, i)) / period;
      out.push(point(bars, i, mean));
    }
    return out;
  }
  function macd(bars, fast, slow, signal) {
    const values = bars.map((b2) => b2.close), f2 = ema(values, fast), s = ema(values, slow), out = { macd: [], signal: [], histogram: [] };
    let smooth = null, ready = 0;
    for (let i = 0; i < bars.length; i++) {
      if (f2[i] === null || s[i] === null) continue;
      const value = f2[i] - s[i];
      out.macd.push(point(bars, i, value));
      ready++;
      smooth = smooth === null ? value : smooth + 2 / (signal + 1) * (value - smooth);
      if (ready < signal) continue;
      out.signal.push(point(bars, i, smooth));
      out.histogram.push({ ...point(bars, i, value - smooth), color: value >= smooth ? "rgba(66,213,178,.75)" : "rgba(249,107,126,.75)" });
    }
    return out;
  }
  function adx(bars, period) {
    const out = { adx: [], plusDi: [], minusDi: [] };
    if (bars.length <= period) return out;
    const trValues = [], plus = [], minus = [];
    for (let i = 1; i < bars.length; i++) {
      const a2 = bars[i], b2 = bars[i - 1], u2 = a2.high - b2.high, d2 = b2.low - a2.low;
      trValues[i] = tr2(bars, i);
      plus[i] = u2 > d2 && u2 > 0 ? u2 : 0;
      minus[i] = d2 > u2 && d2 > 0 ? d2 : 0;
    }
    let t = 0, p2 = 0, m2 = 0;
    for (let i = 1; i <= period; i++) {
      t += trValues[i];
      p2 += plus[i];
      m2 += minus[i];
    }
    const dxValues = [];
    let average = null;
    for (let i = period; i < bars.length; i++) {
      if (i > period) {
        t = t - t / period + trValues[i];
        p2 = p2 - p2 / period + plus[i];
        m2 = m2 - m2 / period + minus[i];
      }
      const pd = t > 0 ? 100 * p2 / t : 0, md = t > 0 ? 100 * m2 / t : 0, total = pd + md, dx = total > 0 ? 100 * Math.abs(pd - md) / total : 0;
      out.plusDi.push(point(bars, i, pd));
      out.minusDi.push(point(bars, i, md));
      if (dxValues.length < period) {
        dxValues.push(dx);
        if (dxValues.length === period) {
          average = dxValues.reduce((a2, v2) => a2 + v2, 0) / period;
          out.adx.push(point(bars, i, average));
        }
      } else {
        average = (average * (period - 1) + dx) / period;
        out.adx.push(point(bars, i, average));
      }
    }
    return out;
  }
  function calculateOscillator(input, kind, settings) {
    const bars = checkBars(input);
    validateSettings(kind, settings);
    if (kind === "macd") return macd(bars, settings.fast, settings.slow, settings.signal);
    if (kind === "stochastic") return stochastic(bars, settings.period, settings.smoothK, settings.smoothD);
    if (kind === "stochrsi") {
      const s = settings;
      return stochRsi(bars, s.period, s.stochPeriod, s.smoothK, s.smoothD);
    }
    if (kind === "cci") return { cci: cci(bars, settings.period) };
    if (kind === "momentum") return { momentum: momentum(bars, settings.period) };
    if (kind === "roc") return { roc: roc(bars, settings.period) };
    if (kind === "obv") return { obv: obv(bars) };
    if (kind === "mfi") return { mfi: mfi(bars, settings.period) };
    if (kind === "rsi") return { rsi: rsi(bars, settings.period) };
    if (kind === "atr") return { atr: atr(bars, settings.period) };
    if (kind === "adx") return adx(bars, settings.period);
    throw Error("Unknown oscillator kind");
  }
  function initialState(kind) {
    if (kind === "rsi") return { kind, count: 0, gainSum: 0, lossSum: 0, gain: null, loss: null };
    if (kind === "atr") return { kind, count: 0, sum: 0, average: null };
    if (kind === "macd") return { kind, fast: null, slow: null, signal: null, ready: 0 };
    if (kind === "adx") return { kind, tr: 0, plus: 0, minus: 0, dxCount: 0, dxSum: 0, average: null };
    if (kind === "cci") return { kind, window: [], sum: 0 };
    if (kind === "stochrsi") return { kind, close: null, count: 0, gainSum: 0, lossSum: 0, gain: null, loss: null, rsiWindow: [], rawWindow: [], kWindow: [], rawSum: 0, kSum: 0 };
    if (kind === "obv") return { kind, value: 0 };
    if (kind === "mfi") return { kind, positive: [], negative: [], volumes: [] };
    if (kind === "momentum" || kind === "roc") return { kind, lookback: [] };
    return { kind, raw: [], k: [], sumRaw: 0, sumK: 0 };
  }
  function oscillatorStep(state, bar, index, previous, bars, settings) {
    const points = {};
    const add = (key, value, color) => {
      const row = { time: bar.time, value };
      if (color) row.color = color;
      points[key] = [row];
    };
    if (state.kind === "rsi") {
      const period2 = settings.period;
      if (index === 0) return { state, points };
      const delta = bar.close - previous.close;
      let gain = state.gain, loss = state.loss, count = state.count, gainSum = state.gainSum, lossSum = state.lossSum;
      if (count < period2) {
        gainSum += Math.max(delta, 0);
        lossSum += Math.max(-delta, 0);
        count++;
        if (count === period2) {
          gain = gainSum / period2;
          loss = lossSum / period2;
        }
      } else {
        gain = (gain * (period2 - 1) + Math.max(delta, 0)) / period2;
        loss = (loss * (period2 - 1) + Math.max(-delta, 0)) / period2;
      }
      if (count >= period2) {
        const g2 = gain, d2 = loss, value = g2 === 0 && d2 === 0 ? 50 : d2 === 0 ? 100 : g2 === 0 ? 0 : 100 - 100 / (1 + g2 / d2);
        add("rsi", value);
      }
      return { state: { kind: "rsi", count, gainSum, lossSum, gain, loss }, points };
    }
    if (state.kind === "atr") {
      const period2 = settings.period, current = tr2(bars, index);
      let count = state.count, sum = state.sum, average = state.average;
      if (count < period2) {
        sum += current;
        count++;
        if (count === period2) average = sum / period2;
      } else average = (average * (period2 - 1) + current) / period2;
      if (average !== null) add("atr", average);
      return { state: { kind: "atr", count, sum, average }, points };
    }
    if (state.kind === "obv") {
      if (index === 0) {
        add("obv", state.value);
        return { state, points };
      }
      const value = state.value + (bar.close > previous.close ? brokerVolume(bar) : bar.close < previous.close ? -brokerVolume(bar) : 0);
      add("obv", value);
      return { state: { kind: "obv", value }, points };
    }
    if (state.kind === "mfi") {
      if (index === 0) return { state, points };
      const period2 = settings.period, price = (bar.high + bar.low + bar.close) / 3, previousPrice = (previous.high + previous.low + previous.close) / 3, volume = brokerVolume(bar), flow = price * volume;
      const positive = [...state.positive, price > previousPrice ? flow : 0], negative = [...state.negative, price < previousPrice ? flow : 0], volumes = [...state.volumes, volume];
      if (positive.length > period2) {
        positive.shift();
        negative.shift();
        volumes.shift();
      }
      if (positive.length === period2 && volumes.reduce((sum, item) => sum + item, 0) > 0) {
        const pos = positive.reduce((sum, item) => sum + item, 0), neg = negative.reduce((sum, item) => sum + item, 0);
        add("mfi", pos + neg === 0 ? 50 : 100 * pos / (pos + neg));
      }
      return { state: { kind: "mfi", positive, negative, volumes }, points };
    }
    if (state.kind === "macd") {
      const { fast, slow, signal } = settings;
      const fastValue = state.fast === null ? bar.close : state.fast + 2 / (fast + 1) * (bar.close - state.fast);
      const slowValue = state.slow === null ? bar.close : state.slow + 2 / (slow + 1) * (bar.close - state.slow);
      let ready = state.ready, signalValue = state.signal;
      if (index >= slow - 1) {
        const value = fastValue - slowValue;
        ready++;
        signalValue = signalValue === null ? value : signalValue + 2 / (signal + 1) * (value - signalValue);
        add("macd", value);
        if (ready >= signal) {
          add("signal", signalValue);
          add("histogram", value - signalValue, value >= signalValue ? "rgba(66,213,178,.75)" : "rgba(249,107,126,.75)");
        }
      }
      return { state: { kind: "macd", fast: fastValue, slow: slowValue, signal: signalValue, ready }, points };
    }
    if (state.kind === "adx") {
      const period2 = settings.period;
      if (index === 0) return { state, points };
      const up = bar.high - previous.high, down = previous.low - bar.low, currentTr = tr2(bars, index);
      const currentPlus = up > down && up > 0 ? up : 0, currentMinus = down > up && down > 0 ? down : 0;
      let total = state.tr, plus = state.plus, minus = state.minus;
      if (index <= period2) {
        total += currentTr;
        plus += currentPlus;
        minus += currentMinus;
      } else {
        total = total - total / period2 + currentTr;
        plus = plus - plus / period2 + currentPlus;
        minus = minus - minus / period2 + currentMinus;
      }
      if (index < period2) return { state: { ...state, tr: total, plus, minus }, points };
      const pd = total > 0 ? 100 * plus / total : 0, md = total > 0 ? 100 * minus / total : 0, sum = pd + md, dx = sum > 0 ? 100 * Math.abs(pd - md) / sum : 0;
      let dxCount = state.dxCount, dxSum = state.dxSum, average = state.average;
      if (dxCount < period2) {
        dxCount++;
        dxSum += dx;
        if (dxCount === period2) average = dxSum / period2;
      } else average = (average * (period2 - 1) + dx) / period2;
      add("plusDi", pd);
      add("minusDi", md);
      if (average !== null) add("adx", average);
      return { state: { kind: "adx", tr: total, plus, minus, dxCount, dxSum, average }, points };
    }
    if (state.kind === "cci") {
      const period2 = settings.period, value = (bar.high + bar.low + bar.close) / 3;
      const window2 = [...state.window, value];
      let sum = state.sum + value;
      if (window2.length > period2) sum -= window2.shift();
      if (window2.length === period2) {
        const mean = sum / period2;
        let deviation = 0;
        for (const sample of window2) deviation += Math.abs(sample - mean);
        add("cci", deviation === 0 ? 0 : (value - mean) / (0.015 * deviation / period2));
      }
      return { state: { kind: "cci", window: window2, sum }, points };
    }
    if (state.kind === "stochrsi") {
      const s = settings;
      let { count, gainSum, lossSum, gain, loss } = state;
      let rsiWindow = state.rsiWindow, rawWindow = state.rawWindow, kWindow = state.kWindow, rawSum = state.rawSum, kSum = state.kSum;
      if (state.close !== null) {
        const delta = bar.close - state.close;
        if (count < s.period) {
          gainSum += Math.max(delta, 0);
          lossSum += Math.max(-delta, 0);
          count++;
          if (count === s.period) {
            gain = gainSum / s.period;
            loss = lossSum / s.period;
          }
        } else {
          gain = (gain * (s.period - 1) + Math.max(delta, 0)) / s.period;
          loss = (loss * (s.period - 1) + Math.max(-delta, 0)) / s.period;
        }
        if (count >= s.period) {
          const g2 = gain, l2 = loss, value = g2 === 0 && l2 === 0 ? 50 : l2 === 0 ? 100 : g2 === 0 ? 0 : 100 - 100 / (1 + g2 / l2);
          rsiWindow = [...rsiWindow, value];
          if (rsiWindow.length > s.stochPeriod) rsiWindow.shift();
          if (rsiWindow.length === s.stochPeriod) {
            const low = Math.min(...rsiWindow), high = Math.max(...rsiWindow), raw2 = high === low ? 50 : 100 * (value - low) / (high - low);
            rawWindow = [...rawWindow, raw2];
            rawSum += raw2;
            if (rawWindow.length > s.smoothK) rawSum -= rawWindow.shift();
            if (rawWindow.length === s.smoothK) {
              const kval = rawSum / s.smoothK;
              add("stochRsiK", kval);
              kWindow = [...kWindow, kval];
              kSum += kval;
              if (kWindow.length > s.smoothD) kSum -= kWindow.shift();
              if (kWindow.length === s.smoothD) add("stochRsiD", kSum / s.smoothD);
            }
          }
        }
      }
      return { state: { kind: "stochrsi", close: bar.close, count, gainSum, lossSum, gain, loss, rsiWindow, rawWindow, kWindow, rawSum, kSum }, points };
    }
    if (state.kind === "momentum" || state.kind === "roc") {
      const period2 = settings.period, lookback = [...state.lookback];
      if (lookback.length === period2) {
        const reference = lookback[0];
        if (state.kind === "momentum") add("momentum", bar.close - reference);
        else if (reference !== 0) add("roc", (bar.close / reference - 1) * 100);
        lookback.shift();
      }
      lookback.push(bar.close);
      return { state: { kind: state.kind, lookback }, points };
    }
    const { period, smoothK, smoothD } = settings;
    let raw = state.raw, k2 = state.k, sumRaw = state.sumRaw, sumK = state.sumK;
    if (index >= period - 1) {
      let high = -Infinity, low = Infinity;
      for (let i = index - period + 1; i < index; i++) {
        high = Math.max(high, bars[i].high);
        low = Math.min(low, bars[i].low);
      }
      high = Math.max(high, bar.high);
      low = Math.min(low, bar.low);
      const rawValue = high === low ? 50 : 100 * (bar.close - low) / (high - low), nextRaw = [...raw, rawValue];
      sumRaw += rawValue;
      if (nextRaw.length > smoothK) sumRaw -= nextRaw.shift();
      raw = nextRaw;
      if (raw.length === smoothK) {
        const kValue = sumRaw / smoothK;
        add("stochK", kValue);
        const nextK = [...k2, kValue];
        sumK += kValue;
        if (nextK.length > smoothD) sumK -= nextK.shift();
        k2 = nextK;
        if (k2.length === smoothD) add("stochD", sumK / smoothD);
      }
    }
    return { state: { kind: "stochastic", raw, k: k2, sumRaw, sumK }, points };
  }
  function createIncrementalOscillator(input, kind, settings) {
    validateSettings(kind, settings);
    const bars = checkBars(input), configuration = { ...settings };
    const keys = kind === "rsi" ? ["rsi"] : kind === "atr" ? ["atr"] : kind === "macd" ? ["macd", "signal", "histogram"] : kind === "adx" ? ["adx", "plusDi", "minusDi"] : kind === "stochrsi" ? ["stochRsiK", "stochRsiD"] : kind === "cci" ? ["cci"] : kind === "momentum" ? ["momentum"] : kind === "roc" ? ["roc"] : kind === "obv" ? ["obv"] : kind === "mfi" ? ["mfi"] : ["stochK", "stochD"];
    const values = Object.fromEntries(keys.map((key) => [key, []]));
    const snapshot = () => Object.fromEntries(Object.entries(values).map(([key, points]) => [key, points.map((point2) => ({ ...point2 }))]));
    let state = initialState(kind), beforeCurrent = state;
    for (let index = 0; index < bars.length; index++) {
      beforeCurrent = state;
      const step = oscillatorStep(state, bars[index], index, bars[index - 1], bars, configuration);
      state = step.state;
      for (const [key, points] of Object.entries(step.points)) values[key].push(...points);
    }
    return { snapshot, updateLast(bar) {
      if (!bar || !Number.isSafeInteger(bar.time) || bar.time <= 0 || ![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close) || bar.high < bar.low) throw Error("Invalid oscillator candle");
      const last = bars[bars.length - 1], replace = last?.time === bar.time;
      if (last && bar.time < last.time) throw Error("Cannot update oscillator history out of order");
      if (!replace && bars.length >= MAX_OSCILLATOR_BARS) throw Error("Oscillator history limit reached");
      let index, previous, baseline;
      if (replace) {
        index = bars.length - 1;
        previous = bars[index - 1];
        baseline = beforeCurrent;
        bars[index] = { ...bar };
      } else {
        index = bars.length;
        previous = last;
        beforeCurrent = state;
        baseline = state;
        bars.push({ ...bar });
      }
      const step = oscillatorStep(baseline, bar, index, previous, bars, configuration);
      state = step.state;
      const delta = {};
      for (const key of keys) {
        const rows = step.points[key] ?? [], current = values[key];
        if (replace && current.length && current[current.length - 1].time === bar.time) current.pop();
        if (rows.length) {
          current.push(...rows);
          delta[key] = rows.map((point2) => ({ ...point2 }));
        } else delta[key] = [];
      }
      return delta;
    } };
  }
  function validateSettings(kind, settings) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw Error("Invalid oscillator settings");
    const keys = Object.keys(settings).sort().join(","), expected = kind === "obv" ? "" : kind === "macd" ? "fast,signal,slow" : kind === "stochastic" ? "period,smoothD,smoothK" : kind === "stochrsi" ? "period,smoothD,smoothK,stochPeriod" : "period";
    if (keys !== expected) throw Error("Invalid oscillator settings");
    if (kind === "obv") return;
    if (kind === "macd") {
      if (!("fast" in settings) || !bounded(settings.fast, 2, 300) || !bounded(settings.slow, 3, 300) || settings.fast >= settings.slow || !bounded(settings.signal, 2, 200)) throw Error("Invalid MACD settings");
      return;
    }
    if (kind === "stochastic") {
      if (!("period" in settings) || !("smoothK" in settings) || !("smoothD" in settings) || !bounded(settings.period, 2, 200) || !bounded(settings.smoothK, 1, 100) || !bounded(settings.smoothD, 1, 100))
        throw Error("Invalid Stochastic settings");
      return;
    }
    if (kind === "stochrsi") {
      if (!("period" in settings) || !("stochPeriod" in settings) || !("smoothK" in settings) || !("smoothD" in settings) || !bounded(settings.period, 2, 200) || !bounded(settings.stochPeriod, 2, 200) || !bounded(settings.smoothK, 1, 100) || !bounded(settings.smoothD, 1, 100)) throw Error("Invalid StochRSI settings");
      return;
    }
    if (!("period" in settings) || !bounded(settings.period, 2, 200)) throw Error("Invalid oscillator period");
    if (kind !== "rsi" && kind !== "atr" && kind !== "adx" && kind !== "cci" && kind !== "momentum" && kind !== "roc" && kind !== "mfi") throw Error("Unknown oscillator kind");
  }

  // src/volume-zones.ts
  var VERSION = "volume-range-median-v1";
  var MAX_ZONES = 3e3;
  function calculateVolumeZones(input, options) {
    const lookback = options?.lookback ?? 20, multiplier = options?.multiplier ?? 2, empty = { status: "INVALID_CONFIGURATION", algorithmVersion: VERSION, lookbackBars: Number.isInteger(lookback) ? lookback : 20, multiplier: Number.isFinite(multiplier) ? multiplier : 2, source: "OHLC_VOLUME_ONLY", zones: [] };
    const tf = Number(options?.timeframeSeconds), asOf = Number(options?.asOfUtc);
    if (!Array.isArray(input) || input.length > MAX_OSCILLATOR_BARS || !Number.isSafeInteger(tf) || tf <= 0 || tf > 86400 || !Number.isFinite(asOf) || asOf <= 0 || !Number.isSafeInteger(lookback) || lookback < 5 || lookback > 100 || !Number.isFinite(multiplier) || multiplier < 1 || multiplier > 10) return empty;
    const closed = input.filter((bar) => bar && Number.isSafeInteger(bar.time) && bar.time > 0 && bar.time + tf <= asOf && Number.isFinite(bar.open) && bar.open > 0 && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close) && bar.low > 0 && bar.high >= Math.max(bar.open, bar.close, bar.low) && bar.low <= Math.min(bar.open, bar.close, bar.high) && (bar.tick_volume === void 0 || Number.isFinite(bar.tick_volume) && bar.tick_volume >= 0) && (bar.real_volume === void 0 || Number.isFinite(bar.real_volume) && bar.real_volume >= 0)).map((bar) => ({ ...bar })).sort((a2, b2) => a2.time - b2.time).filter((bar, index, all) => index === 0 || bar.time !== all[index - 1].time);
    if (closed.length <= lookback) return { ...empty, status: "WARMUP", zones: [] };
    const volume = (bar, source) => {
      const value = source === "REAL_VOLUME" ? bar.real_volume : bar.tick_volume;
      return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
    };
    let evaluated = 0, hasVolume = false;
    const zones = [];
    for (let i = lookback; i < closed.length; i++) {
      const bar = closed[i], source = (bar.real_volume ?? 0) > 0 ? "REAL_VOLUME" : (bar.tick_volume ?? 0) > 0 ? "TICK_VOLUME_PROXY" : null;
      if (!source) continue;
      hasVolume = true;
      const previous = closed.slice(i - lookback, i).map((item) => volume(item, source));
      if (previous.some((value) => value === null)) continue;
      const sorted = previous;
      sorted.sort((a2, b2) => a2 - b2);
      const mid = sorted.length >> 1, median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      if (!(median > 0) || !Number.isFinite(median)) continue;
      evaluated++;
      const current = volume(bar, source), threshold = median * multiplier;
      if (current === null || !Number.isFinite(threshold) || current < threshold) continue;
      const last = closed[closed.length - 1], observedEnd = last.time + tf, end = Math.min(bar.time + tf * 20, observedEnd);
      if (end <= bar.time) continue;
      zones.push({ time: bar.time, start: bar.time, end, high: bar.high, low: bar.low, volume: current, medianVolume: median, multiplier, threshold, source, algorithmVersion: VERSION, label: source === "REAL_VOLUME" ? "Realvolumen-OHLC-Range" : "Tickvolumenproxy-OHLC-Range", closedAt: bar.time + tf, observedEnd, lastClosedBarTime: last.time, previousClosedBarTime: closed[closed.length - 2]?.time ?? null });
    }
    const status = zones.length ? "AVAILABLE" : evaluated ? "NO_TRIGGERS" : hasVolume ? "NO_COMPARABLE_BASELINE" : "NO_VOLUME_DATA";
    return { ...empty, status, zones: zones.slice(-MAX_ZONES) };
  }

  // src/adapter.ts
  var VERSION2 = "5.2.1";
  var pricePresentationTypes = ["candles", "heikin", "hollow", "bars", "line", "area"];
  function heikinAshiCandles(bars) {
    let previousOpen = null, previousClose = null;
    return bars.map((bar) => {
      const close = (bar.open + bar.high + bar.low + bar.close) / 4;
      const open = previousOpen === null ? (bar.open + bar.close) / 2 : (previousOpen + previousClose) / 2;
      const result = { time: bar.time, open, high: Math.max(bar.high, open, close), low: Math.min(bar.low, open, close), close };
      previousOpen = open;
      previousClose = close;
      return result;
    });
  }
  function hollowCandles(bars) {
    return bars.map((bar) => {
      const up = bar.close >= bar.open, color = up ? "#1bca99" : "#f16b8d";
      return { ...bar, color: up ? "rgba(0,0,0,0)" : color, borderColor: color, wickColor: color };
    });
  }
  function calculateLinearRegressionChannel(input, period, multiplier) {
    const upper = [], middle = [], lower = [];
    if (!Number.isInteger(period) || period < 2 || period > 200 || !Number.isFinite(multiplier) || multiplier < 0.1 || multiplier > 10 || Math.abs(multiplier * 10 - Math.round(multiplier * 10)) > 1e-8) return { upper, middle, lower };
    const xMean = (period - 1) / 2, denominator = period * (period * period - 1) / 12;
    for (let end = period - 1; end < input.length; end++) {
      const window2 = input.slice(end - period + 1, end + 1);
      if (window2.some((bar) => !bar || !Number.isFinite(bar.close) || !Number.isFinite(bar.time))) continue;
      let ySum = 0;
      for (const bar of window2) ySum += bar.close;
      const yMean = ySum / period;
      let covariance = 0;
      for (let x2 = 0; x2 < period; x2++) covariance += (x2 - xMean) * (window2[x2].close - yMean);
      const slope = covariance / denominator, intercept = yMean - slope * xMean, center = intercept + slope * (period - 1);
      let squaredResiduals = 0;
      for (let x2 = 0; x2 < period; x2++) {
        const residual = window2[x2].close - (intercept + slope * x2);
        squaredResiduals += residual * residual;
      }
      const width = Math.sqrt(squaredResiduals / period) * multiplier, time = window2[period - 1].time;
      middle.push({ time, value: center });
      upper.push({ time, value: center + width });
      lower.push({ time, value: center - width });
    }
    return { upper, middle, lower };
  }
  function calculateIchimoku(input, options = { tenkanPeriod: 9, kijunPeriod: 26, senkouBPeriod: 52, displacement: 26 }) {
    const values = { tenkan: [], kijun: [], senkouA: [], senkouB: [], chikou: [] };
    const bars = input.filter(validBar).map((bar) => ({ ...bar })).sort((a2, b3) => a2.time - b3.time).filter((bar, index, all) => index === 0 || bar.time !== all[index - 1].time);
    const { tenkanPeriod, kijunPeriod, senkouBPeriod, displacement } = options ?? {};
    if (![tenkanPeriod, kijunPeriod, senkouBPeriod].every((value) => Number.isInteger(value) && value >= 2 && value <= 200) || !Number.isInteger(displacement) || displacement < 0 || displacement > 200) return values;
    const secondsByTimeframe = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800 };
    const seconds = options.timeframe ? secondsByTimeframe[options.timeframe] : void 0;
    const midpoint = (index, period) => {
      if (index < period - 1) return null;
      let high = -Infinity, low = Infinity;
      for (let j2 = index - period + 1; j2 <= index; j2++) {
        high = Math.max(high, bars[j2].high);
        low = Math.min(low, bars[j2].low);
      }
      return (high + low) / 2;
    };
    const t = /* @__PURE__ */ new Map(), k2 = /* @__PURE__ */ new Map(), b2 = /* @__PURE__ */ new Map();
    for (let i = 0; i < bars.length; i++) {
      const tenkan = midpoint(i, tenkanPeriod), kijun = midpoint(i, kijunPeriod), spanB = midpoint(i, senkouBPeriod), time = bars[i].time;
      if (tenkan !== null) {
        t.set(i, tenkan);
        values.tenkan.push({ time, sourceTime: time, value: tenkan });
      }
      if (kijun !== null) {
        k2.set(i, kijun);
        values.kijun.push({ time, sourceTime: time, value: kijun });
      }
      if (spanB !== null) b2.set(i, spanB);
      if (i >= displacement) {
        const source = bars[i - displacement];
        values.chikou.push({ time: source.time, sourceTime: time, value: bars[i].close });
      }
    }
    for (let i = 0; i < bars.length; i++) {
      const target = i + displacement, sourceTime = bars[i].time;
      let time, projected = false;
      if (target < bars.length) time = bars[target].time;
      else if (seconds && bars.length) {
        time = bars[bars.length - 1].time + (target - (bars.length - 1)) * seconds;
        projected = true;
      } else continue;
      const tenkan = t.get(i), kijun = k2.get(i), spanB = b2.get(i);
      if (tenkan !== void 0 && kijun !== void 0) values.senkouA.push({ time, sourceTime, value: (tenkan + kijun) / 2, ...projected ? { projected: true } : {} });
      if (spanB !== void 0) values.senkouB.push({ time, sourceTime, value: spanB, ...projected ? { projected: true } : {} });
    }
    return values;
  }
  function calculatePivotPoints(sourceInput, targetInput, basis) {
    const lines = { p: [], r1: [], r2: [], r3: [], s1: [], s2: [], s3: [] };
    const empty = { available: false, algorithmVersion: "classic-floor-v1", source: "MT5_VERIFIED", basis, reason: "No confirmed MT5 source history.", lines };
    if (basis !== "D1" && basis !== "W1" || !Array.isArray(sourceInput) || !Array.isArray(targetInput) || sourceInput.length < 2) return empty;
    let previous = 0;
    for (const bar of sourceInput) {
      if (!validBar(bar) || !Number.isSafeInteger(bar.time) || bar.time <= previous) return { ...empty, reason: "Malformed or unordered MT5 source candles." };
      previous = bar.time;
    }
    let interval = 0;
    for (const target of targetInput) {
      const time = Number(target?.time);
      if (!Number.isSafeInteger(time) || time <= 0) continue;
      while (interval + 1 < sourceInput.length - 1 && time >= sourceInput[interval + 2].time) interval++;
      if (time < sourceInput[1].time) continue;
      const current = sourceInput[interval], confirmedAt = sourceInput[interval + 1].time, p2 = (current.high + current.low + current.close) / 3, range = current.high - current.low;
      const values = { p: p2, r1: 2 * p2 - current.low, s1: 2 * p2 - current.high, r2: p2 + range, s2: p2 - range, r3: current.high + 2 * (p2 - current.low), s3: current.low - 2 * (current.high - p2) }, validTo = sourceInput[interval + 2]?.time ?? null;
      for (const key of Object.keys(lines)) lines[key].push({ time, value: values[key], sourceTime: current.time, validFrom: confirmedAt, validTo });
    }
    return { ...empty, available: Object.values(lines).some((points) => points.length > 0), reason: void 0, lines };
  }
  function calculateAutoFibonacci(input, timeframe = "M15", asOfUtc = Math.floor(Date.now() / 1e3)) {
    const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], keys = ["0", "0.236", "0.382", "0.5", "0.618", "0.786", "1"];
    const cadences = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800 }, seconds = cadences[timeframe];
    const lines = { "0": { ratio: 0, value: null, points: [] }, "0.236": { ratio: 0.236, value: null, points: [] }, "0.382": { ratio: 0.382, value: null, points: [] }, "0.5": { ratio: 0.5, value: null, points: [] }, "0.618": { ratio: 0.618, value: null, points: [] }, "0.786": { ratio: 0.786, value: null, points: [] }, "1": { ratio: 1, value: null, points: [] } };
    const empty = { available: false, algorithmVersion: "confirmed-swing-auto-fib-v1", source: "MT5_VERIFIED", timeframe, swingStrength: 2, reason: "WARMUP_OR_MISSING", direction: null, start: null, end: null, confirmedAt: null, lines };
    if (!seconds || !Number.isSafeInteger(asOfUtc) || asOfUtc <= 0 || !Array.isArray(input) || input.length > MAX_OSCILLATOR_BARS) return { ...empty, reason: "INVALID_INPUT_OR_TIMEFRAME" };
    let previous = 0;
    for (const bar of input) {
      if (!validBar(bar) || bar.time <= previous) return { ...empty, reason: "INVALID_OHLC_ORDER_OR_TIMESTAMP" };
      previous = bar.time;
    }
    const closed = input.filter((bar) => bar.time + seconds <= asOfUtc), pivots = [];
    for (let i = 2; i < closed.length - 2; i++) {
      const bar = closed[i], left = closed.slice(i - 2, i), right = closed.slice(i + 1, i + 3);
      const high = left.every((item) => bar.high > item.high) && right.every((item) => bar.high > item.high), low = left.every((item) => bar.low < item.low) && right.every((item) => bar.low < item.low);
      if (high === low) continue;
      const pivot = { type: high ? "HIGH" : "LOW", time: bar.time, price: high ? bar.high : bar.low, confirmedAt: closed[i + 2].time + seconds };
      const prior = pivots[pivots.length - 1];
      if (prior?.type === pivot.type) {
        if (pivot.type === "HIGH" ? pivot.price > prior.price : pivot.price < prior.price) pivots[pivots.length - 1] = pivot;
      } else pivots.push(pivot);
    }
    if (pivots.length < 2) return empty;
    const start = pivots[pivots.length - 2], end = pivots[pivots.length - 1], direction = start.type === "LOW" && end.type === "HIGH" ? "UP" : start.type === "HIGH" && end.type === "LOW" ? "DOWN" : null, range = Math.abs(end.price - start.price);
    if (!direction || !Number.isFinite(range) || range <= 0) return { ...empty, reason: "NO_CONFIRMED_IMPULSE" };
    for (let i = 0; i < ratios.length; i++) {
      const ratio = ratios[i], value = direction === "UP" ? end.price - range * ratio : end.price + range * ratio;
      if (!Number.isFinite(value)) return { ...empty, reason: "INVALID_LEVEL_PRICE" };
      lines[keys[i]] = { ratio, value, points: input.filter((bar) => bar.time >= end.confirmedAt && bar.time <= asOfUtc).map((bar) => ({ time: bar.time, value })) };
    }
    if (lines[keys[0]].points.length === 0) return { ...empty, reason: "NO_POST_CONFIRMATION_CANDLES", direction, start, end, confirmedAt: end.confirmedAt, lines };
    return { ...empty, available: true, reason: null, direction, start, end, confirmedAt: end.confirmedAt, lines };
  }
  function utcDateForTime(time) {
    if (typeof time === "number") return new Date(time * 1e3);
    if (typeof time === "string") {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(time);
      if (!match) throw Error("Invalid chart time");
      return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    }
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }
  function timezoneParts(date, formatter) {
    if (!Number.isFinite(date.getTime())) throw Error("Invalid chart time");
    const parts = formatter.formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  }
  function utcOffsetSuffix(date, local) {
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const utcMinute = Math.floor(date.getTime() / 6e4) * 6e4, minutes = Math.round((localAsUtc - utcMinute) / 6e4);
    const absolute = Math.abs(minutes), hours = Math.trunc(absolute / 60), remainder = absolute % 60;
    return (minutes < 0 ? "-" : "+") + String(hours).padStart(2, "0") + (remainder ? String(remainder).padStart(2, "0") : "");
  }
  function drawAnchorHandle(context, x2, y2, color) {
    context.save();
    context.fillStyle = "#f8fafc";
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x2, y2, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }
  var PriceLevelPrimitive = class {
    constructor(id, price, color, visible = true) {
      this.id = id;
      this.price = price;
      this.color = color;
      this.y = null;
      this.selected = false;
      this.visible = true;
      this.series = null;
      this.requestUpdate = null;
      this.visible = visible;
    }
    attached(param) {
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.series = null;
      this.requestUpdate = null;
      this.y = null;
    }
    updateAllViews() {
      this.y = this.series?.priceToCoordinate(this.price) ?? null;
    }
    coordinate() {
      this.updateAllViews();
      return this.y;
    }
    hitTest(_x, y2) {
      if (!this.visible) return null;
      const distance = this.y === null ? null : Math.abs(this.y - y2);
      if (distance === null || distance > 6) return null;
      return { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 1, distance };
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.y === null ? null : { draw: (target) => {
        const y2 = this.y;
        if (y2 === null) return;
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          context.save();
          context.strokeStyle = this.color;
          context.lineWidth = this.selected ? 2 : 1;
          context.setLineDash([5, 4]);
          context.beginPath();
          context.moveTo(0, y2);
          context.lineTo(mediaSize.width, y2);
          context.stroke();
          context.restore();
        });
      } } }];
    }
    set(price, color, visible = true) {
      this.price = price;
      this.color = color;
      this.visible = visible;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var TimeMarkerPrimitive = class {
    constructor(id, time, color, visible = true) {
      this.id = id;
      this.time = time;
      this.color = color;
      this.x = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.requestUpdate = null;
      this.visible = visible;
    }
    attached(param) {
      this.chart = param.chart;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.requestUpdate = null;
      this.x = null;
    }
    updateAllViews() {
      this.x = this.chart?.timeScale().timeToCoordinate(this.time) ?? null;
    }
    coordinate() {
      this.updateAllViews();
      return this.x;
    }
    hitTest(x2, _y) {
      if (!this.visible) return null;
      const distance = this.x === null ? null : Math.abs(this.x - x2);
      if (distance === null || distance > 6) return null;
      return { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 1, distance };
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.x === null ? null : { draw: (target) => {
        const x2 = this.x;
        if (x2 === null) return;
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          context.save();
          context.strokeStyle = this.color;
          context.lineWidth = this.selected ? 2 : 1;
          context.setLineDash([3, 4]);
          context.beginPath();
          context.moveTo(x2, 0);
          context.lineTo(x2, mediaSize.height);
          context.stroke();
          context.restore();
        });
      } } }];
    }
    set(time, color, visible = true) {
      this.time = time;
      this.color = color;
      this.visible = visible;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var TextAnnotationPrimitive = class {
    constructor(id, options) {
      this.id = id;
      this.options = options;
      this.point = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.point = null;
    }
    updateAllViews() {
      const x2 = this.chart?.timeScale().timeToCoordinate(this.options.time) ?? null;
      const y2 = this.series?.priceToCoordinate(this.options.price) ?? null;
      this.point = x2 === null || y2 === null ? null : { x: x2, y: y2 };
    }
    coordinate() {
      this.updateAllViews();
      return this.point;
    }
    hitTest(x2, y2) {
      if (!this.visible || !this.point) return null;
      const left = this.point.x + 7, top = this.point.y - 18, width = this.options.text.length * 7 + 12;
      if (x2 < left || x2 > left + width || y2 < top || y2 > top + 21) return null;
      return { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 2, distance: 0 };
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.point === null ? null : { draw: (target) => {
        const point2 = this.point;
        if (!point2) return;
        target.useMediaCoordinateSpace(({ context }) => {
          context.save();
          context.font = "12px sans-serif";
          const width = context.measureText(this.options.text).width + 12, left = point2.x + 7, top = point2.y - 18;
          context.fillStyle = "rgba(9,25,35,0.94)";
          context.strokeStyle = this.options.color;
          context.lineWidth = this.selected ? 2 : 1;
          context.fillRect(left, top, width, 21);
          context.strokeRect(left, top, width, 21);
          context.fillStyle = "#e8f2f6";
          context.textBaseline = "middle";
          context.fillText(this.options.text, left + 6, top + 10.5);
          context.restore();
        });
      } } }];
    }
    set(options) {
      this.options = { ...options };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var TrendLinePrimitive = class {
    constructor(id, options, readout) {
      this.id = id;
      this.options = options;
      this.readout = readout;
      this.points = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.points = null;
    }
    updateAllViews() {
      const x1 = this.chart?.timeScale().timeToCoordinate(this.options.startTime) ?? null;
      const y1 = this.series?.priceToCoordinate(this.options.startPrice) ?? null;
      const x2 = this.chart?.timeScale().timeToCoordinate(this.options.endTime) ?? null;
      const y2 = this.series?.priceToCoordinate(this.options.endPrice) ?? null;
      this.points = x1 === null || y1 === null || x2 === null || y2 === null ? null : { x1, y1, x2, y2 };
    }
    coordinates() {
      this.updateAllViews();
      return this.points;
    }
    hitTest(x2, y2) {
      if (!this.visible || !this.points) return null;
      const p2 = this.points;
      const dx = p2.x2 - p2.x1, dy = p2.y2 - p2.y1, length2 = dx * dx + dy * dy;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x2 - p2.x1) * dx + (y2 - p2.y1) * dy) / length2));
      const distance = Math.hypot(x2 - (p2.x1 + t * dx), y2 - (p2.y1 + t * dy));
      return distance > 6 ? null : { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 2, distance };
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.points === null ? null : { draw: (target) => {
        const p2 = this.points;
        if (!p2) return;
        target.useMediaCoordinateSpace(({ context }) => {
          context.save();
          context.strokeStyle = this.options.color;
          context.lineWidth = this.selected ? 2 : 1.5;
          context.beginPath();
          context.moveTo(p2.x1, p2.y1);
          context.lineTo(p2.x2, p2.y2);
          context.stroke();
          if (this.readout) {
            const text = this.readout;
            context.font = "12px sans-serif";
            const width = context.measureText(text).width + 12, x2 = (p2.x1 + p2.x2) / 2, y2 = (p2.y1 + p2.y2) / 2 - 20;
            context.fillStyle = "rgba(9,25,35,0.94)";
            context.strokeStyle = this.options.color;
            context.fillRect(x2 - width / 2, y2 - 10, width, 20);
            context.strokeRect(x2 - width / 2, y2 - 10, width, 20);
            context.fillStyle = "#e8f2f6";
            context.textBaseline = "middle";
            context.textAlign = "center";
            context.fillText(text, x2, y2);
          }
          context.restore();
          if (this.selected) {
            drawAnchorHandle(context, p2.x1, p2.y1, this.options.color);
            drawAnchorHandle(context, p2.x2, p2.y2, this.options.color);
          }
        });
      } } }];
    }
    set(options) {
      this.options = { ...options };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setReadout(value) {
      this.readout = value;
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var RayPrimitive = class {
    constructor(id, options) {
      this.id = id;
      this.options = options;
      this.points = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.points = null;
    }
    updateAllViews() {
      const chart = this.chart, x1 = chart?.timeScale().timeToCoordinate(this.options.startTime) ?? null;
      const y1 = this.series?.priceToCoordinate(this.options.startPrice) ?? null;
      const x2 = chart?.timeScale().timeToCoordinate(this.options.endTime) ?? null;
      const y2 = this.series?.priceToCoordinate(this.options.endPrice) ?? null;
      if (!chart || x1 === null || y1 === null || x2 === null || y2 === null) {
        this.points = null;
        return;
      }
      const dx = x2 - x1, dy = y2 - y1, { width, height } = chart.paneSize();
      let endX, endY;
      if (Math.abs(dx) > 1e-3) {
        endX = dx > 0 ? width : 0;
        endY = y1 + dy * ((endX - x1) / dx);
      } else {
        endX = x1;
        endY = dy > 0 ? height : 0;
      }
      this.points = { x1, y1, x2: endX, y2: endY };
    }
    coordinates() {
      this.updateAllViews();
      return this.points;
    }
    hitTest(x2, y2) {
      if (!this.visible || !this.points) return null;
      const p2 = this.points, dx = p2.x2 - p2.x1, dy = p2.y2 - p2.y1, length2 = dx * dx + dy * dy;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x2 - p2.x1) * dx + (y2 - p2.y1) * dy) / length2));
      const distance = Math.hypot(x2 - (p2.x1 + t * dx), y2 - (p2.y1 + t * dy));
      return distance > 6 ? null : { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 1, distance };
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.points === null ? null : { draw: (target) => {
        const p2 = this.points;
        if (!p2) return;
        target.useMediaCoordinateSpace(({ context }) => {
          context.save();
          context.strokeStyle = this.options.color;
          context.lineWidth = this.selected ? 2 : 1.5;
          context.beginPath();
          context.moveTo(p2.x1, p2.y1);
          context.lineTo(p2.x2, p2.y2);
          context.stroke();
          context.restore();
        });
      } } }];
    }
    set(options) {
      this.options = { ...options };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var FIBONACCI_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618];
  function fibonacciRatios(options) {
    return options.levels === void 0 ? FIBONACCI_RATIOS.map((ratio) => ({ level: ratio * 100, ratio })) : options.levels.map((level) => ({ level, ratio: level / 100 }));
  }
  var FibonacciPrimitive = class {
    constructor(id, options) {
      this.id = id;
      this.options = options;
      this.geometry = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.geometry = null;
    }
    updateAllViews() {
      const chart = this.chart, x1 = chart?.timeScale().timeToCoordinate(this.options.startTime) ?? null;
      const x2 = chart?.timeScale().timeToCoordinate(this.options.endTime) ?? null;
      const y1 = this.series?.priceToCoordinate(this.options.startPrice) ?? null, y2 = this.series?.priceToCoordinate(this.options.endPrice) ?? null;
      if (!chart || x1 === null || x2 === null || y1 === null || y2 === null || !this.series) {
        this.geometry = null;
        return;
      }
      const levels = fibonacciRatios(this.options).map(({ ratio }) => {
        const price = this.options.startPrice + (this.options.endPrice - this.options.startPrice) * ratio, y3 = this.series.priceToCoordinate(price);
        return y3 === null ? null : { ratio, price, y: y3 };
      });
      if (levels.some((level) => level === null)) {
        this.geometry = null;
        return;
      }
      this.geometry = { x1, y1, x2, y2, levels };
    }
    coordinates() {
      this.updateAllViews();
      return this.geometry;
    }
    hitTest(x2, y2) {
      if (!this.visible || !this.geometry) return null;
      const { x1, x2: x22, levels } = this.geometry;
      if (x2 < Math.min(x1, x22) - 5 || x2 > Math.max(x1, x22) + 5) return null;
      const nearest = Math.min(...levels.map((level) => Math.abs(level.y - y2)));
      return nearest > 6 ? null : { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 1, distance: nearest };
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.geometry === null ? null : { draw: (target) => {
        const g2 = this.geometry;
        if (!g2) return;
        target.useMediaCoordinateSpace(({ context }) => {
          context.save();
          context.strokeStyle = this.options.color;
          context.lineWidth = this.selected ? 2 : 1;
          for (const level of g2.levels) {
            context.beginPath();
            context.moveTo(g2.x1, level.y);
            context.lineTo(g2.x2, level.y);
            context.stroke();
          }
          context.restore();
          if (this.selected) {
            drawAnchorHandle(context, g2.x1, g2.y1, this.options.color);
            drawAnchorHandle(context, g2.x2, g2.y2, this.options.color);
          }
        });
      } } }];
    }
    set(options) {
      this.options = { ...options };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var FIBONACCI_FAN_RATIOS = [0.382, 0.5, 0.618];
  function fibonacciFanRatios(options) {
    return options.ratios === void 0 ? [...FIBONACCI_FAN_RATIOS] : [...options.ratios];
  }
  var FibonacciFanPrimitive = class {
    constructor(id, options) {
      this.id = id;
      this.options = options;
      this.geometry = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.geometry = null;
    }
    updateAllViews() {
      const chart = this.chart, x1 = chart?.timeScale().timeToCoordinate(this.options.startTime) ?? null, x2 = chart?.timeScale().timeToCoordinate(this.options.endTime) ?? null;
      const y1 = this.series?.priceToCoordinate(this.options.startPrice) ?? null, y2 = this.series?.priceToCoordinate(this.options.endPrice) ?? null;
      if (!chart || !this.series || x1 === null || x2 === null || y1 === null || y2 === null) {
        this.geometry = null;
        return;
      }
      const { width, height } = chart.paneSize(), dx = x2 - x1, ratios = fibonacciFanRatios(this.options), rays = [];
      if (Math.abs(dx) < 1e-7 || width <= 0 || height <= 0) {
        this.geometry = null;
        return;
      }
      for (const ratio of ratios) {
        const targetPrice = this.options.startPrice + (this.options.endPrice - this.options.startPrice) * ratio, targetY = this.series.priceToCoordinate(targetPrice);
        if (targetY === null) {
          this.geometry = null;
          return;
        }
        const rayDx = x2 - x1, rayDy = targetY - y1, candidates = [];
        if (rayDx > 0) candidates.push((width - x1) / rayDx);
        else if (rayDx < 0) candidates.push((0 - x1) / rayDx);
        if (rayDy > 0) candidates.push((height - y1) / rayDy);
        else if (rayDy < 0) candidates.push((0 - y1) / rayDy);
        const positive = candidates.filter((value) => Number.isFinite(value) && value >= 0), scale = positive.length ? Math.min(...positive) : 1;
        rays.push({ ratio, targetPrice, x1, y1, x2: x1 + rayDx * scale, y2: y1 + rayDy * scale });
      }
      this.geometry = { x1, y1, x2, y2, rays };
    }
    coordinates() {
      this.updateAllViews();
      return this.geometry ? { x1: this.geometry.x1, y1: this.geometry.y1, x2: this.geometry.x2, y2: this.geometry.y2, rays: this.geometry.rays.map((ray) => ({ ...ray })) } : null;
    }
    hitTest(x2, y2) {
      if (!this.visible || !this.geometry) return null;
      const distance = (ray) => {
        const dx = ray.x2 - ray.x1, dy = ray.y2 - ray.y1, length2 = dx * dx + dy * dy, t = length2 ? Math.max(0, Math.min(1, ((x2 - ray.x1) * dx + (y2 - ray.y1) * dy) / length2)) : 0;
        return Math.hypot(x2 - (ray.x1 + t * dx), y2 - (ray.y1 + t * dy));
      };
      const nearest = Math.min(...this.geometry.rays.map(distance)), anchorDistance = Math.min(Math.hypot(x2 - this.geometry.x1, y2 - this.geometry.y1), Math.hypot(x2 - this.geometry.x2, y2 - this.geometry.y2));
      if (nearest > 6 && anchorDistance > 12) return null;
      return { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 1, distance: Math.min(nearest, anchorDistance) };
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.geometry === null ? null : { draw: (target) => {
        const g2 = this.geometry;
        if (!g2) return;
        target.useMediaCoordinateSpace(({ context }) => {
          context.save();
          context.strokeStyle = this.options.color;
          context.lineWidth = this.selected ? 2 : 1.5;
          for (const ray of g2.rays) {
            context.beginPath();
            context.moveTo(ray.x1, ray.y1);
            context.lineTo(ray.x2, ray.y2);
            context.stroke();
          }
          if (this.selected) {
            drawAnchorHandle(context, g2.x1, g2.y1, this.options.color);
            drawAnchorHandle(context, g2.x2, g2.y2, this.options.color);
          }
          context.restore();
        });
      } } }];
    }
    set(options) {
      this.options = { ...options, ratios: options.ratios ? [...options.ratios] : void 0 };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var TREND_FIB_RATIOS = [0, 0.382, 0.5, 0.618, 1, 1.618, 2.618];
  function trendFibRatios(options) {
    return options.ratios === void 0 ? [...TREND_FIB_RATIOS] : [...options.ratios];
  }
  var TrendBasedFibonacciPrimitive = class {
    constructor(id, options) {
      this.id = id;
      this.options = options;
      this.geometry = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.geometry = null;
    }
    updateAllViews() {
      const chart = this.chart, series = this.series;
      if (!chart || !series) {
        this.geometry = null;
        return;
      }
      const anchors = [{ time: this.options.startTime, price: this.options.startPrice }, { time: this.options.endTime, price: this.options.endPrice }, { time: this.options.thirdTime, price: this.options.thirdPrice }].map((anchor) => ({ x: chart.timeScale().timeToCoordinate(anchor.time) ?? null, y: series.priceToCoordinate(anchor.price) ?? null }));
      if (anchors.some((anchor) => anchor.x === null || anchor.y === null)) {
        this.geometry = null;
        return;
      }
      const { width, height } = chart.paneSize(), origin = anchors[2], x1 = origin.x, x2 = width;
      if (width <= 0 || height <= 0 || x1 >= width) {
        this.geometry = null;
        return;
      }
      const levels = [];
      for (const ratio of trendFibRatios(this.options)) {
        const price = this.options.thirdPrice + (this.options.endPrice - this.options.startPrice) * ratio, y2 = series.priceToCoordinate(price);
        if (y2 !== null && y2 >= 0 && y2 <= height) levels.push({ ratio, price, y: y2, x1, x2 });
      }
      this.geometry = { anchors, levels };
    }
    coordinates() {
      this.updateAllViews();
      return this.geometry ? { anchors: this.geometry.anchors.map((anchor) => ({ ...anchor })), levels: this.geometry.levels.map((level) => ({ ...level })) } : null;
    }
    hitTest(x2, y2) {
      if (!this.visible || !this.geometry) return null;
      const anchorDistance = Math.min(...this.geometry.anchors.map((anchor) => Math.hypot(x2 - anchor.x, y2 - anchor.y))), lineDistance = Math.min(...this.geometry.levels.map((level) => x2 >= level.x1 - 4 && x2 <= level.x2 + 4 ? Math.abs(y2 - level.y) : Infinity));
      if (anchorDistance > 12 && lineDistance > 6) return null;
      return { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 1, distance: Math.min(anchorDistance, lineDistance) };
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.geometry === null ? null : { draw: (target) => {
        const g2 = this.geometry;
        if (!g2) return;
        target.useMediaCoordinateSpace(({ context }) => {
          context.save();
          context.strokeStyle = this.options.color;
          context.lineWidth = this.selected ? 2 : 1.5;
          for (const level of g2.levels) {
            context.beginPath();
            context.moveTo(level.x1, level.y);
            context.lineTo(level.x2, level.y);
            context.stroke();
          }
          if (this.selected) for (const anchor of g2.anchors) drawAnchorHandle(context, anchor.x, anchor.y, this.options.color);
          context.restore();
        });
      } } }];
    }
    set(options) {
      this.options = { ...options, ratios: options.ratios ? [...options.ratios] : void 0 };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var FIBONACCI_TIME_FACTORS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55];
  var FibonacciTimeZonePrimitive = class {
    constructor(options) {
      this.options = options;
      this.guides = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.requestUpdate = null;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.requestUpdate = null;
      this.guides = null;
    }
    updateAllViews() {
      const chart = this.chart;
      if (!chart) {
        this.guides = null;
        return;
      }
      const interval = this.options.endTime - this.options.startTime;
      const startX = chart.timeScale().timeToCoordinate(this.options.startTime), endX = chart.timeScale().timeToCoordinate(this.options.endTime);
      if (startX === null || endX === null) {
        this.guides = null;
        return;
      }
      this.guides = FIBONACCI_TIME_FACTORS.map((factor) => {
        const time = this.options.startTime + interval * factor, projected = chart.timeScale().timeToCoordinate(time), x2 = projected ?? startX + (endX - startX) * factor;
        return { factor, time, x: x2 };
      });
    }
    coordinates() {
      this.updateAllViews();
      return this.guides;
    }
    hitTest(x2, y2) {
      if (!this.visible || !this.guides) return null;
      const nearest = Math.min(...this.guides.map((guide) => Math.abs(guide.x - x2)));
      return nearest > 6 ? null : { externalId: this.options.id, zOrder: "top", cursorStyle: "ew-resize", hitTestPriority: 1, distance: nearest };
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.guides === null ? null : { draw: (target) => {
        const guides = this.guides;
        if (!guides) return;
        target.useMediaCoordinateSpace(({ context }) => {
          context.save();
          context.strokeStyle = this.options.color;
          context.lineWidth = this.selected ? 2 : 1.25;
          for (const guide of guides) {
            context.beginPath();
            context.moveTo(guide.x, 0);
            context.lineTo(guide.x, context.canvas.height);
            context.stroke();
          }
          if (this.selected) {
            const start = guides.find((guide) => guide.factor === 0), end = guides.find((guide) => guide.factor === 1);
            if (start) drawAnchorHandle(context, start.x, 20, this.options.color);
            if (end) drawAnchorHandle(context, end.x, 20, this.options.color);
          }
          context.restore();
        });
      } } }];
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
    setOptions(options) {
      this.options = { ...options };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
  };
  var RectanglePrimitive = class {
    constructor(id, options) {
      this.id = id;
      this.options = options;
      this.rect = null;
      this.anchors = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.rect = null;
      this.anchors = null;
    }
    updateAllViews() {
      const x1 = this.chart?.timeScale().timeToCoordinate(this.options.startTime) ?? null;
      const y1 = this.series?.priceToCoordinate(this.options.startPrice) ?? null;
      const x2 = this.chart?.timeScale().timeToCoordinate(this.options.endTime) ?? null;
      const y2 = this.series?.priceToCoordinate(this.options.endPrice) ?? null;
      this.anchors = x1 === null || y1 === null || x2 === null || y2 === null ? null : { x1, y1, x2, y2 };
      this.rect = this.anchors === null ? null : { left: Math.min(x1, x2), top: Math.min(y1, y2), right: Math.max(x1, x2), bottom: Math.max(y1, y2) };
    }
    coordinates() {
      this.updateAllViews();
      return this.rect;
    }
    hitTest(x2, y2) {
      if (!this.visible || !this.rect) return null;
      const r2 = this.rect, inside = x2 >= r2.left && x2 <= r2.right && y2 >= r2.top && y2 <= r2.bottom;
      const edgeDistance = inside ? Math.min(x2 - r2.left, r2.right - x2, y2 - r2.top, r2.bottom - y2) : Math.hypot(Math.max(r2.left - x2, 0, x2 - r2.right), Math.max(r2.top - y2, 0, y2 - r2.bottom));
      if (this.options.fill && inside || edgeDistance <= 6) return { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 0, distance: this.options.fill && inside ? 0 : edgeDistance };
      return null;
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.rect === null ? null : { draw: (target) => {
        const r2 = this.rect;
        if (!r2) return;
        target.useMediaCoordinateSpace(({ context }) => {
          context.save();
          if (this.options.fill) {
            context.globalAlpha = 0.14;
            context.fillStyle = this.options.color;
            context.fillRect(r2.left, r2.top, r2.right - r2.left, r2.bottom - r2.top);
            context.globalAlpha = 1;
          }
          context.strokeStyle = this.options.color;
          context.lineWidth = this.selected ? 2 : 1.5;
          context.strokeRect(r2.left, r2.top, r2.right - r2.left, r2.bottom - r2.top);
          context.restore();
          if (this.selected && this.anchors) {
            drawAnchorHandle(context, this.anchors.x1, this.anchors.y1, this.options.color);
            drawAnchorHandle(context, this.anchors.x2, this.anchors.y2, this.options.color);
          }
        });
      } } }];
    }
    set(options) {
      this.options = { ...options };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var EllipsePrimitive = class {
    constructor(id, options) {
      this.id = id;
      this.options = options;
      this.points = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.points = null;
      this.requestUpdate = null;
    }
    updateAllViews() {
      const x1 = this.chart?.timeScale().timeToCoordinate(this.options.startTime) ?? null, y1 = this.series?.priceToCoordinate(this.options.startPrice) ?? null, x2 = this.chart?.timeScale().timeToCoordinate(this.options.endTime) ?? null, y2 = this.series?.priceToCoordinate(this.options.endPrice) ?? null;
      this.points = x1 === null || y1 === null || x2 === null || y2 === null ? null : { x1, y1, x2, y2 };
    }
    coordinates() {
      this.updateAllViews();
      return this.points ? { ...this.points } : null;
    }
    hitTest(x2, y2) {
      const p2 = this.points;
      if (!this.visible || !p2) return null;
      const rx = Math.abs(p2.x2 - p2.x1) / 2, ry = Math.abs(p2.y2 - p2.y1) / 2, cx = (p2.x1 + p2.x2) / 2, cy = (p2.y1 + p2.y2) / 2;
      if (rx < 1 || ry < 1) return null;
      const anchor = Math.min(Math.hypot(x2 - p2.x1, y2 - p2.y1), Math.hypot(x2 - p2.x2, y2 - p2.y2)), edge = Math.abs(Math.hypot((x2 - cx) / rx, (y2 - cy) / ry) - 1) * Math.min(rx, ry);
      return anchor <= 12 || edge <= 7 ? { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 0, distance: Math.min(anchor, edge) } : null;
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.points === null ? null : { draw: (target) => {
        const p2 = this.points;
        if (!p2) return;
        target.useMediaCoordinateSpace(({ context }) => {
          const rx = Math.abs(p2.x2 - p2.x1) / 2, ry = Math.abs(p2.y2 - p2.y1) / 2, cx = (p2.x1 + p2.x2) / 2, cy = (p2.y1 + p2.y2) / 2;
          context.save();
          context.strokeStyle = this.options.color;
          context.lineWidth = this.selected ? 2 : 1.5;
          context.beginPath();
          context.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
          context.stroke();
          if (this.selected) {
            drawAnchorHandle(context, p2.x1, p2.y1, this.options.color);
            drawAnchorHandle(context, p2.x2, p2.y2, this.options.color);
          }
          context.restore();
        });
      } } }];
    }
    set(options) {
      this.options = { ...options };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var ChannelPrimitive = class {
    constructor(id, options) {
      this.id = id;
      this.options = options;
      this.geometry = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.geometry = null;
    }
    updateAllViews() {
      const chart = this.chart, series = this.series;
      const timeX = (time) => chart?.timeScale().timeToCoordinate(time) ?? null;
      const priceY = (value) => series?.priceToCoordinate(value) ?? null;
      const ax = timeX(this.options.startTime), ay = priceY(this.options.startPrice), bx = timeX(this.options.endTime), by = priceY(this.options.endPrice), cx = timeX(this.options.offsetTime), cy = priceY(this.options.offsetPrice);
      if (ax === null || ay === null || bx === null || by === null || cx === null || cy === null) {
        this.geometry = null;
        return;
      }
      const slope = Math.abs(bx - ax) < 1e-7 ? 0 : (by - ay) / (bx - ax), shift = cy - (ay + slope * (cx - ax));
      this.geometry = { a: { x: ax, y: ay }, b: { x: bx, y: by }, c: { x: cx, y: cy }, d: { x: bx, y: by + shift }, m1: { x: ax, y: ay + shift / 2 }, m2: { x: bx, y: by + shift / 2 } };
    }
    coordinates() {
      this.updateAllViews();
      return this.geometry;
    }
    hitTest(x2, y2) {
      if (!this.visible || !this.geometry) return null;
      const g2 = this.geometry, c2 = { x: g2.a.x, y: g2.a.y + (g2.d.y - g2.b.y) }, segments = [[g2.a, g2.b], [c2, g2.d], [g2.m1, g2.m2]];
      let nearest = Infinity;
      for (const [p2, q2] of segments) {
        const dx = q2.x - p2.x, dy = q2.y - p2.y, len = dx * dx + dy * dy, t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x2 - p2.x) * dx + (y2 - p2.y) * dy) / len));
        nearest = Math.min(nearest, Math.hypot(x2 - (p2.x + t * dx), y2 - (p2.y + t * dy)));
      }
      return nearest > 7 ? null : { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 1, distance: nearest };
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.geometry === null ? null : { draw: (target) => {
        const g2 = this.geometry;
        if (!g2) return;
        target.useMediaCoordinateSpace(({ context }) => {
          const c2 = { x: g2.a.x, y: g2.a.y + (g2.d.y - g2.b.y) };
          context.save();
          context.beginPath();
          context.moveTo(g2.a.x, g2.a.y);
          context.lineTo(g2.b.x, g2.b.y);
          context.lineTo(g2.d.x, g2.d.y);
          context.lineTo(c2.x, c2.y);
          context.closePath();
          context.globalAlpha = 0.08;
          context.fillStyle = this.options.color;
          context.fill();
          context.globalAlpha = 1;
          context.strokeStyle = this.options.color;
          context.lineWidth = this.selected ? 2 : 1.5;
          context.beginPath();
          context.moveTo(g2.a.x, g2.a.y);
          context.lineTo(g2.b.x, g2.b.y);
          context.stroke();
          context.beginPath();
          context.moveTo(c2.x, c2.y);
          context.lineTo(g2.d.x, g2.d.y);
          context.stroke();
          context.setLineDash([3, 4]);
          context.beginPath();
          context.moveTo(g2.m1.x, g2.m1.y);
          context.lineTo(g2.m2.x, g2.m2.y);
          context.stroke();
          context.restore();
          if (this.selected) {
            drawAnchorHandle(context, g2.a.x, g2.a.y, this.options.color);
            drawAnchorHandle(context, g2.b.x, g2.b.y, this.options.color);
            drawAnchorHandle(context, g2.c.x, g2.c.y, this.options.color);
          }
        });
      } } }];
    }
    set(options) {
      this.options = { ...options };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var PitchforkPrimitive = class {
    constructor(id, options) {
      this.id = id;
      this.options = options;
      this.points = null;
      this.selected = false;
      this.visible = true;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.points = null;
    }
    updateAllViews() {
      const chart = this.chart, series = this.series;
      if (!chart || !series) {
        this.points = null;
        return;
      }
      const point2 = (time, price) => {
        const x2 = chart.timeScale().timeToCoordinate(time), y2 = series.priceToCoordinate(price);
        return x2 === null || y2 === null ? null : { x: x2, y: y2 };
      };
      const a2 = point2(this.options.startTime, this.options.startPrice), b2 = point2(this.options.endTime, this.options.endPrice), c2 = point2(this.options.thirdTime, this.options.thirdPrice);
      if (!a2 || !b2 || !c2) {
        this.points = null;
        return;
      }
      const m2 = { x: (b2.x + c2.x) / 2, y: (b2.y + c2.y) / 2 }, direction = { x: m2.x - a2.x, y: m2.y - a2.y }, width = chart.timeScale().width(), height = chart.panes()[0]?.getHeight() ?? 0;
      const clip = (origin) => {
        let lo = 0, hi2 = Infinity;
        for (const [p2, d2, max] of [[origin.x, direction.x, width], [origin.y, direction.y, height]]) {
          if (Math.abs(d2) < 1e-9) {
            if (p2 < 0 || p2 > max) return null;
            continue;
          }
          const near = (0 - p2) / d2, far = (max - p2) / d2;
          lo = Math.max(lo, Math.min(near, far));
          hi2 = Math.min(hi2, Math.max(near, far));
        }
        if (hi2 < Math.max(lo, 0)) return null;
        const t = Math.max(lo, 0), end = Number.isFinite(hi2) ? hi2 : 1e5;
        return [{ x: origin.x + t * direction.x, y: origin.y + t * direction.y }, { x: origin.x + end * direction.x, y: origin.y + end * direction.y }];
      };
      const rays = [clip(a2), clip(b2), clip(c2)];
      this.points = { a: a2, b: b2, c: c2, m: m2, direction, segments: rays.filter((ray) => ray !== null) };
    }
    coordinates() {
      this.updateAllViews();
      return this.points;
    }
    hitTest(x2, y2) {
      if (!this.visible || !this.points) return null;
      let nearest = Infinity;
      for (const [a2, b2] of this.points.segments) {
        const dx = b2.x - a2.x, dy = b2.y - a2.y, len = dx * dx + dy * dy, t = len ? Math.max(0, Math.min(1, ((x2 - a2.x) * dx + (y2 - a2.y) * dy) / len)) : 0;
        nearest = Math.min(nearest, Math.hypot(x2 - a2.x - t * dx, y2 - a2.y - t * dy));
      }
      return nearest > 8 ? null : { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 1, distance: nearest };
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.points === null ? null : { draw: (target) => {
        const p2 = this.points;
        if (!p2) return;
        target.useMediaCoordinateSpace(({ context }) => {
          context.save();
          context.strokeStyle = this.options.color;
          context.lineWidth = this.selected ? 2 : 1.5;
          context.setLineDash([4, 3]);
          for (const [a2, b2] of p2.segments) {
            context.beginPath();
            context.moveTo(a2.x, a2.y);
            context.lineTo(b2.x, b2.y);
            context.stroke();
          }
          context.setLineDash([]);
          if (this.selected) {
            drawAnchorHandle(context, p2.a.x, p2.a.y, this.options.color);
            drawAnchorHandle(context, p2.b.x, p2.b.y, this.options.color);
            drawAnchorHandle(context, p2.c.x, p2.c.y, this.options.color);
          }
          context.restore();
        });
      } } }];
    }
    set(options) {
      this.options = { ...options };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var MeasurementPrimitive = class extends TrendLinePrimitive {
  };
  var RiskRewardPrimitive = class {
    constructor(id, options) {
      this.id = id;
      this.options = options;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.geometry = null;
      this.visible = true;
      this.selected = false;
      this.visible = options.visible ?? true;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
      this.updateAllViews();
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.geometry = null;
    }
    updateAllViews() {
      const chart = this.chart, series = this.series;
      if (!chart || !series) {
        this.geometry = null;
        return;
      }
      const x1 = chart.timeScale().timeToCoordinate(this.options.startTime), x2 = chart.timeScale().timeToCoordinate(this.options.endTime);
      const entryY = series.priceToCoordinate(this.options.entryPrice), stopY = series.priceToCoordinate(this.options.stopPrice), targetY = series.priceToCoordinate(this.options.targetPrice);
      if (x1 === null || x2 === null || entryY === null || stopY === null || targetY === null) {
        this.geometry = null;
        return;
      }
      this.geometry = { x1, x2, entryY, stopY, targetY, ratio: Math.abs(this.options.targetPrice - this.options.entryPrice) / Math.abs(this.options.entryPrice - this.options.stopPrice) };
    }
    coordinates() {
      this.updateAllViews();
      return this.geometry;
    }
    hitTest(x2, y2) {
      if (!this.visible || !this.geometry) return null;
      const g2 = this.geometry, left = Math.min(g2.x1, g2.x2), right = Math.max(g2.x1, g2.x2);
      const inZone = (a2, b2) => x2 >= left && x2 <= right && y2 >= Math.min(a2, b2) && y2 <= Math.max(a2, b2);
      if (inZone(g2.entryY, g2.stopY) || inZone(g2.entryY, g2.targetY)) return { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 1, distance: 0 };
      const yDistance = Math.min(Math.abs(y2 - g2.entryY), Math.abs(y2 - g2.stopY), Math.abs(y2 - g2.targetY));
      return x2 >= left - 5 && x2 <= right + 5 && yDistance <= 6 ? { externalId: this.id, zOrder: "top", cursorStyle: "pointer", hitTestPriority: 1, distance: yDistance } : null;
    }
    paneViews() {
      return !this.visible ? [] : [{ zOrder: () => "top", renderer: () => this.geometry === null ? null : { draw: (target) => {
        const g2 = this.geometry;
        if (!g2) return;
        const left = Math.min(g2.x1, g2.x2), width = Math.abs(g2.x2 - g2.x1);
        target.useMediaCoordinateSpace(({ context }) => {
          const band = (a2, b2, color, label) => {
            const top = Math.min(a2, b2), height = Math.abs(a2 - b2);
            context.fillStyle = color;
            context.fillRect(left, top, width, height);
            context.strokeStyle = color.replace(".16)", ".9)");
            context.lineWidth = this.selected ? 2 : 1;
            context.strokeRect(left, top, width, height);
            context.fillStyle = "#e8f4ff";
            context.font = "12px sans-serif";
            context.textAlign = "right";
            context.textBaseline = "bottom";
            context.fillText(label, Math.max(left + 48, left + width - 5), top + height - 2);
          };
          context.save();
          band(g2.entryY, g2.stopY, "rgba(248,113,113,.16)", "RISK");
          band(g2.entryY, g2.targetY, "rgba(65,216,154,.16)", `REWARD \xB7 R:R ${g2.ratio.toFixed(2)}`);
          context.strokeStyle = "#f4d35e";
          context.lineWidth = this.selected ? 2 : 1;
          context.setLineDash([4, 3]);
          context.beginPath();
          context.moveTo(left, g2.entryY);
          context.lineTo(left + width, g2.entryY);
          context.stroke();
          context.setLineDash([]);
          context.restore();
          if (this.selected) {
            drawAnchorHandle(context, g2.x1, g2.entryY, "#f4d35e");
            drawAnchorHandle(context, (g2.x1 + g2.x2) / 2, g2.stopY, "#f87171");
            drawAnchorHandle(context, g2.x2, g2.targetY, "#41d89a");
          }
        });
      } } }];
    }
    set(options) {
      this.options = { ...options };
      this.visible = options.visible ?? true;
      this.updateAllViews();
      this.requestUpdate?.();
    }
    setSelected(selected) {
      this.selected = selected;
      this.requestUpdate?.();
    }
  };
  var IchimokuCloudPrimitive = class {
    constructor(visible = true) {
      this.visible = visible;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.values = { tenkan: [], kijun: [], senkouA: [], senkouB: [], chikou: [] };
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
    }
    updateAllViews() {
    }
    paneViews() {
      if (!this.visible) return [];
      return [{ zOrder: () => "bottom", renderer: () => ({ draw: (target) => {
        const chart = this.chart, series = this.series;
        if (!chart || !series) return;
        const lower = new Map(this.values.senkouB.map((point2) => [point2.time, point2]));
        target.useMediaCoordinateSpace(({ context }) => {
          context.save();
          for (let i = 0; i < this.values.senkouA.length - 1; i++) {
            const a0 = this.values.senkouA[i], a1 = this.values.senkouA[i + 1], b0 = lower.get(a0.time), b1 = lower.get(a1.time);
            if (!b0 || !b1) continue;
            const pts = [[chart.timeScale().timeToCoordinate(a0.time), series.priceToCoordinate(a0.value)], [chart.timeScale().timeToCoordinate(a1.time), series.priceToCoordinate(a1.value)], [chart.timeScale().timeToCoordinate(b1.time), series.priceToCoordinate(b1.value)], [chart.timeScale().timeToCoordinate(b0.time), series.priceToCoordinate(b0.value)]];
            if (pts.some(([x2, y2]) => x2 === null || y2 === null || !Number.isFinite(x2) || !Number.isFinite(y2))) continue;
            const d0 = a0.value - b0.value, d1 = a1.value - b1.value, fill = (poly, green) => {
              context.beginPath();
              context.moveTo(poly[0][0], poly[0][1]);
              for (let j2 = 1; j2 < poly.length; j2++) context.lineTo(poly[j2][0], poly[j2][1]);
              context.closePath();
              context.fillStyle = green ? "rgba(65,216,154,.12)" : "rgba(244,119,137,.12)";
              context.fill();
            };
            if (d0 * d1 < 0) {
              const t = d0 / (d0 - d1), cross = [pts[0][0] + (pts[1][0] - pts[0][0]) * t, pts[0][1] + (pts[1][1] - pts[0][1]) * t];
              fill([[pts[0][0], pts[0][1]], cross, [pts[3][0], pts[3][1]]], d0 > 0);
              fill([cross, [pts[1][0], pts[1][1]], [pts[2][0], pts[2][1]]], d1 > 0);
            } else fill(pts.map(([x2, y2]) => [x2, y2]), (d0 === 0 ? d1 : d0) >= 0);
          }
          context.restore();
        });
      } }) }];
    }
    set(values, visible) {
      this.values = values;
      this.visible = visible;
      this.requestUpdate?.();
    }
  };
  var VolumeZonePrimitive = class {
    constructor(result, visible = true) {
      this.result = result;
      this.visible = visible;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
    }
    attached(param) {
      this.chart = param.chart;
      this.series = param.series;
      this.requestUpdate = param.requestUpdate;
    }
    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
    }
    updateAllViews() {
    }
    paneViews() {
      if (!this.visible) return [];
      return [{ zOrder: () => "bottom", renderer: () => ({ draw: (target) => {
        const chart = this.chart, series = this.series;
        if (!chart || !series) return;
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const scale = chart.timeScale();
          for (const zone of this.result.zones) {
            const x1 = scale.timeToCoordinate(zone.start);
            let x2 = scale.timeToCoordinate(zone.end);
            if (x2 === null && zone.end === zone.observedEnd) {
              const last = scale.timeToCoordinate(zone.lastClosedBarTime), previous = zone.previousClosedBarTime === null ? null : scale.timeToCoordinate(zone.previousClosedBarTime);
              if (last !== null && Number.isFinite(last)) x2 = last + (previous !== null && last > previous ? last - previous : 0);
            }
            const a2 = series.priceToCoordinate(zone.high), b2 = series.priceToCoordinate(zone.low);
            if (x1 === null || x2 === null || a2 === null || b2 === null || ![x1, x2, a2, b2].every(Number.isFinite)) continue;
            const left = Math.max(0, Math.min(x1, x2)), right = Math.min(mediaSize.width, Math.max(x1, x2)), top = Math.max(0, Math.min(a2, b2)), bottom = Math.min(mediaSize.height, Math.max(a2, b2));
            if (right <= left || bottom <= top) continue;
            context.save();
            context.fillStyle = zone.source === "REAL_VOLUME" ? "rgba(244,211,94,.14)" : "rgba(255,174,87,.11)";
            context.strokeStyle = zone.source === "REAL_VOLUME" ? "rgba(244,211,94,.8)" : "rgba(255,174,87,.8)";
            context.setLineDash(zone.source === "REAL_VOLUME" ? [] : [4, 3]);
            context.fillRect(left, top, right - left, bottom - top);
            context.strokeRect(left, top, right - left, bottom - top);
            context.setLineDash([]);
            context.font = "10px sans-serif";
            context.fillStyle = "#fff1cf";
            context.fillText(zone.label + " \xB7 " + zone.multiplier + "\xD7 Median", left + 3, Math.max(11, top + 11), Math.max(20, right - left - 6));
            context.restore();
          }
        });
      } }) }];
    }
    set(result, visible) {
      this.result = result;
      this.visible = visible;
      this.requestUpdate?.();
    }
  };
  var BrokerDealMarkersPrimitive = class {
    constructor(chart, series) {
      this.chart = chart;
      this.series = series;
      this.markers = [];
      this.requestUpdate = null;
    }
    attached(param) {
      this.requestUpdate = param.requestUpdate;
    }
    detached() {
      this.requestUpdate = null;
    }
    set(markers) {
      this.markers = markers.map((marker) => ({ ...marker }));
      this.requestUpdate?.();
    }
    paneViews() {
      const chart = this.chart, series = this.series, markers = this.markers;
      return [{ zOrder: () => "top", renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context }) => {
        context.save();
        for (const marker of markers) {
          if (!marker.plotted) continue;
          const x2 = chart.timeScale().timeToCoordinate(marker.chartTimeSeconds), y2 = series.priceToCoordinate(marker.price);
          if (x2 === null || y2 === null) continue;
          const color = marker.side === "BUY" ? "#49c6ff" : "#ffb84d";
          context.fillStyle = color;
          context.strokeStyle = "#07131d";
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(x2, y2, 6, 0, Math.PI * 2);
          context.fill();
          context.stroke();
          context.fillStyle = "#061018";
          context.font = "bold 8px sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText({ IN: "+", OUT: "\u2212", INOUT: "\u2194", OUT_BY: "\xD7" }[marker.entry], x2, y2);
          context.fillStyle = color;
          context.font = "bold 9px sans-serif";
          context.textAlign = "left";
          context.textBaseline = "middle";
          context.fillText(`${marker.entry} #${marker.ticket}`, x2 + 9, y2 - 7);
        }
        context.restore();
      }) }) }];
    }
  };
  var PositionZonesPrimitive = class {
    constructor(series) {
      this.series = series;
      this.requestUpdate = null;
      this.positions = [];
    }
    attached(param) {
      this.requestUpdate = param.requestUpdate;
    }
    detached() {
      this.requestUpdate = null;
    }
    set(positions) {
      this.positions = positions.map((position) => ({ ...position }));
      this.requestUpdate?.();
    }
    paneViews() {
      const series = this.series, positions = this.positions;
      return [
        { zOrder: () => "bottom", renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          context.save();
          context.beginPath();
          context.rect(0, 0, mediaSize.width, mediaSize.height);
          context.clip();
          for (const position of positions) {
            const entry = series.priceToCoordinate(position.entryPrice);
            if (entry === null || !Number.isFinite(entry)) continue;
            for (const [price, color] of [[position.stopLoss, "rgba(244,94,112,.12)"], [position.takeProfit, "rgba(54,214,183,.10)"]]) {
              if (price === null || price === void 0) continue;
              const targetY = series.priceToCoordinate(price);
              if (targetY === null || !Number.isFinite(targetY)) continue;
              const top = Math.max(0, Math.min(entry, targetY)), bottom = Math.min(mediaSize.height, Math.max(entry, targetY));
              if (bottom <= top) continue;
              context.fillStyle = color;
              context.fillRect(0, top, mediaSize.width, bottom - top);
            }
          }
          context.restore();
        }) }) },
        { zOrder: () => "top", renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          context.save();
          context.font = "10px monospace";
          context.textBaseline = "middle";
          positions.forEach((position, index) => {
            const entry = series.priceToCoordinate(position.entryPrice);
            if (entry === null || !Number.isFinite(entry)) return;
            const y2 = Math.max(9, Math.min(mediaSize.height - 9, entry - 7 + index * 13));
            const width = Math.max(0, mediaSize.width - 12);
            context.fillStyle = "rgba(5,17,26,.82)";
            context.fillRect(4, y2 - 8, width, 16);
            context.fillStyle = position.side === "BUY" ? "#b8eaff" : "#ffe0a8";
            context.textAlign = "left";
            context.fillText(position.label, 8, y2, Math.max(0, mediaSize.width - 16));
          });
          context.restore();
        }) }) }
      ];
    }
  };
  var colorPattern = /^#[0-9a-fA-F]{6}$/;
  function validBar(c2) {
    return Number.isSafeInteger(c2.time) && c2.time > 0 && Number.isFinite(new Date(c2.time * 1e3).getTime()) && [c2.open, c2.high, c2.low, c2.close].every((n) => Number.isFinite(n) && n > 0) && (c2.tick_volume === void 0 || Number.isFinite(c2.tick_volume) && c2.tick_volume >= 0) && (c2.real_volume === void 0 || Number.isFinite(c2.real_volume) && c2.real_volume >= 0) && c2.high >= Math.max(c2.open, c2.close, c2.low) && c2.low <= Math.min(c2.open, c2.close, c2.high);
  }
  function normalizeCandles(data) {
    if (!Array.isArray(data)) throw Error("Invalid bars");
    if (data.length > MAX_OSCILLATOR_BARS) throw Error("History budget exceeded");
    const set = /* @__PURE__ */ new Set(), out = [];
    for (const item of data) {
      if (!validBar(item)) throw Error("Invalid OHLC candle");
      if (set.has(item.time)) throw Error("Duplicate bar time");
      set.add(item.time);
      out.push({ ...item });
    }
    out.sort((a2, b2) => a2.time - b2.time);
    return out;
  }
  function validSeriesData(data) {
    const out = data.map((v2) => {
      if (!Number.isSafeInteger(v2.time) || v2.time <= 0 || !Number.isFinite(v2.value)) throw Error("Invalid indicator data");
      return { ...v2 };
    }).sort((a2, b2) => a2.time - b2.time);
    for (let i = 1; i < out.length; i++) if (out[i - 1].time === out[i].time) throw Error("Duplicate indicator timestamp");
    return out;
  }
  function movingAverageData(bars, options) {
    const { type, period, source = "close", displayShift = 0 } = options;
    if (!["EMA", "SMA", "WMA", "RMA", "SMMA"].includes(type) || !Number.isInteger(period) || period < 1 || period > 1e3 || !["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"].includes(source) || !Number.isInteger(displayShift) || displayShift < -500 || displayShift > 500)
      throw Error("Invalid moving-average configuration");
    if (bars.length < period) return { base: [], points: [] };
    const valueAt = (bar) => source === "hl2" ? (bar.high + bar.low) / 2 : source === "hlc3" ? (bar.high + bar.low + bar.close) / 3 : source === "ohlc4" ? (bar.open + bar.high + bar.low + bar.close) / 4 : bar[source];
    const points = [], shifted = [];
    let sum = 0, weighted = 0, previous = null;
    for (let i = 0; i < bars.length; i++) {
      const value = valueAt(bars[i]);
      let result = null;
      if (type === "EMA") {
        previous = previous === null ? value : previous + 2 / (period + 1) * (value - previous);
        if (i >= period - 1) result = previous;
      } else if (type === "RMA" || type === "SMMA") {
        if (i < period) sum += value;
        if (i === period - 1) previous = sum / period;
        else if (i >= period) previous += (value - previous) / period;
        if (i >= period - 1) result = previous;
      } else {
        if (i < period) {
          sum += value;
          if (type === "WMA") weighted += (i + 1) * value;
        } else {
          const dropped = valueAt(bars[i - period]);
          if (type === "WMA") weighted = weighted - sum + period * value;
          sum += value - dropped;
        }
        if (i >= period - 1) result = type === "SMA" ? sum / period : weighted / (period * (period + 1) / 2);
      }
      if (result !== null) points.push({ time: bars[i].time, value: result });
    }
    if (displayShift === 0) return { base: points, points };
    const values = new Map(points.map((point2) => [point2.time, point2.value]));
    for (let target = 0; target < bars.length; target++) {
      const sourceIndex = target - displayShift;
      if (sourceIndex < 0 || sourceIndex >= bars.length) continue;
      const result = values.get(bars[sourceIndex].time);
      if (result !== void 0) shifted.push({ time: bars[target].time, value: result });
    }
    return { base: points, points: shifted };
  }
  function donchianData(bars, period) {
    if (!Number.isInteger(period) || period < 2 || period > 200) throw Error("Invalid Donchian period");
    const upper = [], middle = [], lower = [];
    for (let i = period - 1; i < bars.length; i++) {
      let high = -Infinity, low = Infinity;
      for (let j2 = i - period + 1; j2 <= i; j2++) {
        high = Math.max(high, bars[j2].high);
        low = Math.min(low, bars[j2].low);
      }
      upper.push({ time: bars[i].time, value: high });
      lower.push({ time: bars[i].time, value: low });
      middle.push({ time: bars[i].time, value: (high + low) / 2 });
    }
    return { upper, middle, lower };
  }
  function calculateBollingerBands(input, period, stdDev) {
    const upper = [], middle = [], lower = [];
    if (!Number.isInteger(period) || period < 2 || period > 300 || !Number.isFinite(stdDev) || stdDev < 0.1 || stdDev > 10 || Math.abs(stdDev * 10 - Math.round(stdDev * 10)) > 1e-8) return { upper, middle, lower };
    let sum = 0, squares = 0, runLength = 0;
    for (let i = 0; i < input.length; i++) {
      const bar = input[i];
      if (!bar || !validBar(bar)) {
        sum = 0;
        squares = 0;
        runLength = 0;
        continue;
      }
      const value = bar.close;
      sum += value;
      squares += value * value;
      runLength++;
      if (runLength > period) {
        const dropped = input[i - period].close;
        sum -= dropped;
        squares -= dropped * dropped;
        runLength = period;
      }
      if (runLength === period) {
        const mean = sum / period, deviation = Math.sqrt(Math.max(0, squares / period - mean * mean)), time = bar.time;
        middle.push({ time, value: mean });
        upper.push({ time, value: mean + stdDev * deviation });
        lower.push({ time, value: mean - stdDev * deviation });
      }
    }
    return { upper, middle, lower };
  }
  function calculateSessionVwap(input, options = {}) {
    const timeZone = options.timeZone ?? "UTC", sessionStart = options.sessionStart ?? "00:00";
    if (typeof timeZone !== "string" || timeZone.length < 1 || timeZone.length > 64 || typeof sessionStart !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(sessionStart)) throw Error("Invalid VWAP session configuration");
    let formatter;
    try {
      formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    } catch (_2) {
      throw Error("Invalid VWAP timezone");
    }
    if (!Array.isArray(input)) throw Error("Invalid VWAP bars");
    const points = [], sources = /* @__PURE__ */ new Set();
    let session = null, sumPV = 0, sumVolume = 0;
    for (const bar of input) {
      if (!bar || !validBar(bar)) throw Error("Invalid VWAP candle");
      const parts = Object.fromEntries(formatter.formatToParts(new Date(bar.time * 1e3)).map((part) => [part.type, part.value]));
      const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day), minute = Number(parts.hour) * 60 + Number(parts.minute);
      const [startHour, startMinute] = sessionStart.split(":").map(Number), startMinutes = startHour * 60 + startMinute;
      const sessionDate = new Date(Date.UTC(year, month - 1, day) - (minute < startMinutes ? 864e5 : 0));
      const key = sessionDate.toISOString().slice(0, 10);
      if (key !== session) {
        session = key;
        sumPV = 0;
        sumVolume = 0;
      }
      const realVolume = bar.real_volume ?? 0, tickVolume = bar.tick_volume ?? 0;
      const real = realVolume > 0, volume = real ? realVolume : tickVolume;
      if (volume <= 0) continue;
      const typical = (bar.high + bar.low + bar.close) / 3, weighted = typical * volume, nextPV = sumPV + weighted, nextVolume = sumVolume + volume;
      if (!Number.isFinite(weighted) || !Number.isFinite(nextPV) || !Number.isFinite(nextVolume) || nextVolume <= 0) throw Error("Invalid VWAP volume weights");
      sumPV = nextPV;
      sumVolume = nextVolume;
      sources.add(real ? "REAL_VOLUME" : "TICK_VOLUME_PROXY");
      points.push({ time: bar.time, value: sumPV / sumVolume });
    }
    const volumeSource = sources.size === 0 ? "NO_VOLUME" : sources.size > 1 ? "MIXED" : sources.has("REAL_VOLUME") ? "REAL_VOLUME" : "TICK_VOLUME_PROXY";
    return { points, volumeSource };
  }
  function keltnerData(bars, options) {
    const { period, atrPeriod, multiplier } = options;
    if (!Number.isInteger(period) || period < 2 || period > 200 || !Number.isInteger(atrPeriod) || atrPeriod < 2 || atrPeriod > 200 || !Number.isFinite(multiplier) || multiplier < 0.1 || multiplier > 10 || Math.abs(multiplier * 10 - Math.round(multiplier * 10)) > 1e-8) throw Error("Invalid Keltner configuration");
    const mean = movingAverageData(bars, { id: options.id, type: "EMA", period, source: "close", color: options.color }).base;
    const atrValues = calculateOscillator(bars, "atr", { period: atrPeriod }).atr;
    const ranges = new Map(atrValues.map((point2) => [point2.time, point2.value])), upper = [], middle = [], lower = [];
    for (const point2 of mean) {
      const range = ranges.get(point2.time);
      if (range === void 0) continue;
      middle.push(point2);
      upper.push({ time: point2.time, value: point2.value + range * multiplier });
      lower.push({ time: point2.time, value: point2.value - range * multiplier });
    }
    return { upper, middle, lower };
  }
  function calculateAtrBands(input, period, atrPeriod, multiplier) {
    const upper = [], middle = [], lower = [];
    if (!Number.isInteger(period) || period < 2 || period > 200 || !Number.isInteger(atrPeriod) || atrPeriod < 2 || atrPeriod > 200 || !Number.isFinite(multiplier) || multiplier < 0.1 || multiplier > 10 || Math.abs(multiplier * 10 - Math.round(multiplier * 10)) > 1e-8) return { upper, middle, lower };
    const ranges = new Map(calculateOscillator(input, "atr", { period: atrPeriod }).atr.map((point2) => [point2.time, point2.value]));
    let sum = 0, count = 0;
    for (let i = 0; i < input.length; i++) {
      const bar = input[i];
      if (!bar || !validBar(bar)) {
        sum = 0;
        count = 0;
        continue;
      }
      sum += bar.close;
      count++;
      if (count > period) {
        sum -= input[i - period].close;
        count = period;
      }
      if (count < period) continue;
      const range = ranges.get(bar.time);
      if (range === void 0) continue;
      const center = sum / period, width = range * multiplier;
      middle.push({ time: bar.time, value: center });
      upper.push({ time: bar.time, value: center + width });
      lower.push({ time: bar.time, value: center - width });
    }
    return { upper, middle, lower };
  }
  var initialSupertrendState = () => ({ count: 0, sum: 0, atr: null, upper: null, lower: null, direction: false });
  function supertrendStep(bars, index, options, prior) {
    const bar = bars[index], previous = bars[index - 1], range = Math.max(bar.high - bar.low, previous ? Math.abs(bar.high - previous.close) : 0, previous ? Math.abs(bar.low - previous.close) : 0);
    let count = prior.count, sum = prior.sum, atr2 = prior.atr;
    if (count < options.period) {
      sum += range;
      count++;
      if (count === options.period) atr2 = sum / options.period;
    } else atr2 = (atr2 * (options.period - 1) + range) / options.period;
    if (atr2 === null) return { state: { ...prior, count, sum }, value: null };
    const mid = (bar.high + bar.low) / 2, basicUpper = mid + options.multiplier * atr2, basicLower = mid - options.multiplier * atr2;
    const upper = prior.upper === null ? basicUpper : basicUpper < prior.upper || previous.close > prior.upper ? basicUpper : prior.upper;
    const lower = prior.lower === null ? basicLower : basicLower > prior.lower || previous.close < prior.lower ? basicLower : prior.lower;
    const direction = prior.upper === null ? false : prior.direction ? !(bar.close < lower) : bar.close > upper;
    return { state: { count, sum, atr: atr2, upper, lower, direction }, value: { time: bar.time, value: direction ? lower : upper, trend: direction ? "UP" : "DOWN" } };
  }
  function supertrendData(bars, options) {
    const values = [];
    let state = initialSupertrendState(), beforeLast = state;
    for (let index = 0; index < bars.length; index++) {
      if (index === bars.length - 1) beforeLast = state;
      const result = supertrendStep(bars, index, options, state);
      state = result.state;
      if (result.value) values.push(result.value);
    }
    return { values, up: values.filter((point2) => point2.trend === "UP"), down: values.filter((point2) => point2.trend === "DOWN"), state, beforeLast };
  }
  var initialParabolicSarState = () => ({ initialized: false, up: true, sar: null, extreme: null, acceleration: 0 });
  function parabolicSarStep(bars, index, options, prior) {
    if (index < 1) return { state: prior, value: null };
    const validInitial = () => {
      const up2 = bars[1].close >= bars[0].close;
      const sar2 = up2 ? Math.min(bars[0].low, bars[1].low) : Math.max(bars[0].high, bars[1].high);
      const extreme2 = up2 ? Math.max(bars[0].high, bars[1].high) : Math.min(bars[0].low, bars[1].low);
      return { state: { initialized: true, up: up2, sar: sar2, extreme: extreme2, acceleration: options.step }, value: { time: bars[1].time, value: sar2, trend: up2 ? "UP" : "DOWN" } };
    };
    if (index === 1 || !prior.initialized) return validInitial();
    const bar = bars[index], previous = bars[index - 1], beforePrevious = bars[index - 2];
    let sar = prior.sar, up = prior.up, extreme = prior.extreme, acceleration = prior.acceleration;
    let projected = sar + acceleration * (extreme - sar);
    projected = up ? Math.min(projected, previous.low, beforePrevious.low) : Math.max(projected, previous.high, beforePrevious.high);
    const reversed = up ? bar.low <= projected : bar.high >= projected;
    if (reversed) {
      sar = extreme;
      up = !up;
      extreme = up ? bar.high : bar.low;
      acceleration = options.step;
    } else {
      sar = projected;
      const extended = up ? bar.high > extreme : bar.low < extreme;
      if (extended) {
        extreme = up ? bar.high : bar.low;
        acceleration = Math.min(options.maxStep, acceleration + options.step);
      }
    }
    return { state: { initialized: true, up, sar, extreme, acceleration }, value: { time: bar.time, value: sar, trend: up ? "UP" : "DOWN" } };
  }
  function parabolicSarData(bars, options) {
    const values = [];
    let state = initialParabolicSarState(), beforeLast = state;
    for (let index = 0; index < bars.length; index++) {
      if (index === bars.length - 1) beforeLast = state;
      const result = parabolicSarStep(bars, index, options, state);
      state = result.state;
      if (result.value) values.push(result.value);
    }
    return { values, up: values.filter((point2) => point2.trend === "UP"), down: values.filter((point2) => point2.trend === "DOWN"), state, beforeLast };
  }
  function createStudioV5(host, accountId, scope) {
    if (!host || !accountId || !/^[a-zA-Z0-9_-]{1,50}$/.test(accountId)) throw Error("Invalid chart host/account");
    if (scope && (!/^[a-zA-Z0-9._-]{1,32}$/.test(scope.symbol) || !/^[a-zA-Z0-9_-]{1,24}$/.test(scope.timeframe))) throw Error("Invalid chart storage scope");
    const drawingScope = scope ? Object.freeze({ ...scope }) : null;
    let displayTimeZone = "UTC";
    const timeLocale = document.documentElement.lang || navigator.language || "en-US";
    const makeTimeFormatters = (timeZone) => ({
      year: new Intl.DateTimeFormat(timeLocale, { timeZone, year: "numeric" }),
      month: new Intl.DateTimeFormat(timeLocale, { timeZone, month: "short" }),
      day: new Intl.DateTimeFormat(timeLocale, { timeZone, day: "2-digit" }),
      parts: new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }),
      crosshair: new Intl.DateTimeFormat(timeLocale, { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short", hourCycle: "h23" })
    });
    let timeFormatters = makeTimeFormatters(displayTimeZone);
    const formatTimeLabel = (time, tickType) => {
      const date = utcDateForTime(time);
      if (tickType === ji.Year) return timeFormatters.year.format(date);
      if (tickType === ji.Month) return timeFormatters.month.format(date);
      if (tickType === ji.DayOfMonth) return timeFormatters.day.format(date);
      const parts = timezoneParts(date, timeFormatters.parts), clock = String(parts.hour).padStart(2, "0") + ":" + String(parts.minute).padStart(2, "0");
      return clock + utcOffsetSuffix(date, parts);
    };
    const formatCrosshairTime = (time) => timeFormatters.crosshair.format(utcDateForTime(time));
    const chart = le(host, {
      autoSize: true,
      layout: { background: { color: "#091923" }, textColor: "#d0e7ee" },
      grid: { vertLines: { visible: false }, horzLines: { color: "#233b48" } },
      rightPriceScale: { minimumWidth: 112 },
      localization: { timeFormatter: formatCrosshairTime },
      timeScale: { timeVisible: true, borderVisible: true, rightOffset: 8, tickMarkFormatter: formatTimeLabel },
      crosshair: { mode: 0 }
    });
    const price = chart.addSeries(Qe, {
      upColor: "#1bca99",
      downColor: "#f16b8d",
      borderVisible: false,
      wickUpColor: "#1bca99",
      wickDownColor: "#f16b8d"
    });
    const barPresentation = chart.addSeries(Ze, { upColor: "#1bca99", downColor: "#f16b8d", visible: false, thinBars: true, priceLineVisible: false });
    const linePresentation = chart.addSeries(ye, { color: "#49c6ff", lineWidth: 2, visible: false, priceLineVisible: false, lastValueVisible: true });
    const areaPresentation = chart.addSeries(qe, { lineColor: "#49c6ff", topColor: "rgba(73,198,255,0.35)", bottomColor: "rgba(73,198,255,0.02)", lineWidth: 2, visible: false, priceLineVisible: false, lastValueVisible: true });
    const transparentCandle = "rgba(0,0,0,0)";
    const brokerDealPrimitive = new BrokerDealMarkersPrimitive(chart, price);
    price.attachPrimitive(brokerDealPrimitive);
    let brokerDealMarkers = [];
    const positionOverlayLines = /* @__PURE__ */ new Map();
    const positionZonesPrimitive = new PositionZonesPrimitive(price);
    price.attachPrimitive(positionZonesPrimitive);
    let positionOverlayPositions = [], positionOverlayCurrency = "", positionOverlayMarginMode = "UNKNOWN";
    const marketLevelLabels = { daily_high: "D-H", daily_low: "D-L", daily_poc: "D-POC", daily_vah: "D-VAH", daily_val: "D-VAL", weekly_high: "W-H", weekly_low: "W-L", weekly_poc: "W-POC", weekly_vah: "W-VAH", weekly_val: "W-VAL" };
    const marketLevelColors = { daily_high: "#f43f5e", daily_low: "#10b981", daily_poc: "#f59e0b", daily_vah: "#fb923c", daily_val: "#fbbf24", weekly_high: "#e11d48", weekly_low: "#059669", weekly_poc: "#06b6d4", weekly_vah: "#38bdf8", weekly_val: "#67e8f9" };
    const marketLevelStyles = { daily_high: 2, daily_low: 2, daily_poc: 0, daily_vah: 1, daily_val: 1, weekly_high: 1, weekly_low: 1, weekly_poc: 0, weekly_vah: 1, weekly_val: 1 };
    const marketLevelKeys = Object.keys(marketLevelLabels);
    const marketLevelLines = /* @__PURE__ */ new Map();
    const PRICE_AXIS_LABEL_MIN_GAP_PX = 32;
    let priceAxisLabelRows = [];
    let priceAxisLayoutRevision = 0;
    function applyPriceAxisLabelLayout() {
      priceAxisLayoutRevision++;
      const paneHeight = Math.max(0, chart.panes()[0]?.getHeight() ?? 0);
      const candidates = [];
      for (const [key, item] of marketLevelLines) {
        const priority = key.endsWith("_poc") ? key.startsWith("daily_") ? 20 : 21 : key.endsWith("_high") || key.endsWith("_low") ? key.startsWith("daily_") ? 30 : 40 : key.startsWith("daily_") ? 50 : 60;
        candidates.push({ id: `market:${key}`, price: item.price, label: item.label, priority, line: item.line, lineVisible: item.visible, apply: (visible) => {
          if (item.axisLabelVisible === visible) return;
          item.axisLabelVisible = visible;
          item.line.applyOptions({ axisLabelVisible: visible, title: item.visible ? item.label : "" });
        } });
      }
      for (const [key, item] of positionOverlayLines) {
        const priority = item.readback.role === "SL" ? 0 : item.readback.role === "TP" ? 1 : 10;
        candidates.push({ id: `position:${key}`, price: item.readback.price, label: item.readback.label, priority, line: item.line, lineVisible: true, apply: (visible) => {
          if (item.readback.axisLabelVisible === visible) return;
          item.readback.axisLabelVisible = visible;
          item.line.applyOptions({ axisLabelVisible: visible, title: item.readback.label });
        } });
      }
      const positioned = candidates.map((item) => ({ ...item, y: price.priceToCoordinate(item.price) })).sort((a2, b2) => a2.priority - b2.priority || a2.id.localeCompare(b2.id));
      const reserved = [], result = [];
      for (const item of positioned) {
        const y2 = typeof item.y === "number" && Number.isFinite(item.y) ? item.y : null;
        const visible = item.lineVisible && y2 !== null && paneHeight >= PRICE_AXIS_LABEL_MIN_GAP_PX && y2 >= PRICE_AXIS_LABEL_MIN_GAP_PX / 2 && y2 <= paneHeight - PRICE_AXIS_LABEL_MIN_GAP_PX / 2 && reserved.every((other) => Math.abs(y2 - other) >= PRICE_AXIS_LABEL_MIN_GAP_PX);
        item.apply(visible);
        if (visible) reserved.push(y2);
        result.push({ id: item.id, price: item.price, y: y2, paneHeight, priority: item.priority, lineVisible: item.lineVisible, axisLabelVisible: visible });
      }
      priceAxisLabelRows = result;
      return result.map((item) => ({ ...item }));
    }
    let axisLabelFrame = null;
    const schedulePriceAxisLabelLayout = () => {
      if (axisLabelFrame !== null || destroyed) return;
      axisLabelFrame = requestAnimationFrame(() => {
        axisLabelFrame = null;
        if (!destroyed) applyPriceAxisLabelLayout();
      });
    };
    let marketLevelAsOfUtc = null;
    function clearMarketLevels() {
      guard();
      for (const item of marketLevelLines.values()) price.removePriceLine(item.line);
      marketLevelLines.clear();
      marketLevelAsOfUtc = null;
      applyPriceAxisLabelLayout();
    }
    function setMarketLevels(snapshot) {
      guard();
      const expected = { account: activeAccount, symbol: drawingScope?.symbol ?? "", timeframe: drawingScope?.timeframe ?? "" }, received = snapshot?.scope;
      if (!received || received.account !== expected.account || received.symbol !== expected.symbol || received.timeframe !== expected.timeframe) throw Error("Market-level scope mismatch");
      if (snapshot.source !== "MT5_VERIFIED" || snapshot.canExecute !== false || !Number.isSafeInteger(snapshot.asOfUtc) || snapshot.asOfUtc <= 0 || !snapshot.levels || typeof snapshot.levels !== "object" || Array.isArray(snapshot.levels) || Object.keys(snapshot.levels).sort().join(",") !== [...marketLevelKeys].sort().join(",")) throw Error("Invalid read-only market-level snapshot");
      if (snapshot.visible !== void 0 && (!snapshot.visible || typeof snapshot.visible !== "object" || Array.isArray(snapshot.visible) || Object.keys(snapshot.visible).some((key) => !marketLevelKeys.includes(key)) || Object.values(snapshot.visible).some((value) => typeof value !== "boolean"))) throw Error("Invalid market-level visibility");
      const candidate = [];
      try {
        for (const key of marketLevelKeys) {
          const value = snapshot.levels[key];
          if (value === null) continue;
          if (!Number.isFinite(value) || value <= 0) throw Error("Invalid market-level price");
          const visible = snapshot.visible?.[key] !== false, label = marketLevelLabels[key];
          candidate.push({ key, price: value, label, visible, line: price.createPriceLine({ price: value, color: marketLevelColors[key], lineWidth: key.endsWith("_poc") ? 2 : 1, lineStyle: marketLevelStyles[key], axisLabelVisible: visible, title: visible ? label : "", lineVisible: visible }) });
        }
      } catch (error) {
        for (const item of candidate) price.removePriceLine(item.line);
        throw error;
      }
      clearMarketLevels();
      for (const item of candidate) marketLevelLines.set(item.key, { line: item.line, price: item.price, label: item.label, visible: item.visible, axisLabelVisible: item.visible });
      marketLevelAsOfUtc = snapshot.asOfUtc;
      applyPriceAxisLabelLayout();
      return readMarketLevels();
    }
    function readMarketLevels() {
      guard();
      const levels = {};
      for (const [key, item] of marketLevelLines) levels[key] = { price: item.price, label: item.label, visible: item.visible, axisLabelVisible: item.axisLabelVisible };
      return { source: marketLevelAsOfUtc !== null ? "MT5_VERIFIED" : "NONE", asOfUtc: marketLevelAsOfUtc, count: marketLevelLines.size, levels };
    }
    function clearPositionOverlays() {
      guard();
      for (const item of positionOverlayLines.values()) price.removePriceLine(item.line);
      positionOverlayLines.clear();
      positionOverlayPositions = [];
      positionOverlayCurrency = "";
      positionOverlayMarginMode = "UNKNOWN";
      positionZonesPrimitive.set([]);
      applyPriceAxisLabelLayout();
    }
    function setPositionOverlays(snapshot) {
      guard();
      const expected = { account: activeAccount, symbol: drawingScope?.symbol ?? "", timeframe: drawingScope?.timeframe ?? "" }, received = snapshot?.scope;
      if (!received || received.account !== expected.account || received.symbol !== expected.symbol || received.timeframe !== expected.timeframe) {
        clearPositionOverlays();
        throw Error("Position overlay scope mismatch");
      }
      if (snapshot.source !== "MT5_VERIFIED" || snapshot.canExecute !== false || !Array.isArray(snapshot.positions) || snapshot.positions.length > 500 || typeof snapshot.currency !== "string" || !/^[A-Z]{3}$/.test(snapshot.currency) || ![0, 1, 2].includes(snapshot.marginMode)) throw Error("Invalid read-only position overlay snapshot");
      const tickets = /* @__PURE__ */ new Set(), candidate = [], positionModels = [];
      const mode = { 0: "NETTING", 1: "EXCHANGE", 2: "HEDGING" }[snapshot.marginMode];
      for (const row of snapshot.positions) {
        if (!row || typeof row.ticket !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(row.ticket) || tickets.has(row.ticket) || row.side !== "BUY" && row.side !== "SELL") throw Error("Invalid or duplicate position ticket");
        tickets.add(row.ticket);
        if (!Number.isFinite(row.volume) || row.volume < 0 || !Number.isFinite(row.profit) || !Number.isFinite(row.swap) || row.currency !== snapshot.currency) throw Error("Invalid position money fields");
        let usdProfit = null, usdSwap = null;
        if (row.usdConversion?.state === "AVAILABLE") {
          if (row.usdConversion.source !== "ACCOUNT_CURRENCY" && row.usdConversion.source !== "MT5_FX_QUOTE" || !Number.isFinite(row.usdConversion.amountsUsd?.profit) || !Number.isFinite(row.usdConversion.amountsUsd?.swap)) throw Error("Invalid verified USD conversion");
          usdProfit = row.usdConversion.amountsUsd.profit;
          usdSwap = row.usdConversion.amountsUsd.swap;
        } else if (row.usdConversion !== void 0 && (row.usdConversion.state !== "UNAVAILABLE" || row.usdConversion.source !== "NONE" || typeof row.usdConversion.reason !== "string")) throw Error("Invalid unavailable USD conversion");
        for (const [role, value] of [["Entry", row.entryPrice], ["SL", row.stopLoss], ["TP", row.takeProfit]]) {
          if ((role === "Entry" || value !== void 0 && value !== null) && (!Number.isFinite(value) || value <= 0)) throw Error("Invalid position overlay price");
          if (value === void 0 || value === null) continue;
          candidate.push({ ticket: row.ticket, side: row.side, role, price: value, label: `${row.side} ${role}`, axisLabelVisible: true });
        }
        const fmt = (value) => value.toFixed(2), usdLabel = usdProfit === null ? "" : ` \xB7 USD P/L ${fmt(usdProfit)} \xB7 Swap ${fmt(usdSwap)}`;
        positionModels.push({
          ticket: row.ticket,
          side: row.side,
          volume: row.volume,
          entryPrice: row.entryPrice,
          stopLoss: row.stopLoss ?? null,
          takeProfit: row.takeProfit ?? null,
          profit: row.profit,
          swap: row.swap,
          currency: row.currency,
          usdProfit,
          usdSwap,
          label: `${mode} \xB7 ${row.side} ${row.volume.toFixed(2)}L #${row.ticket} @ ${fmt(row.entryPrice)} \xB7 P/L ${fmt(row.profit)} ${row.currency} \xB7 Swap ${fmt(row.swap)} ${row.currency}${usdLabel}`
        });
      }
      const created = [];
      try {
        for (const item of candidate) {
          const line = price.createPriceLine({ price: item.price, color: item.role === "SL" ? "#ff657a" : item.role === "TP" ? "#35d6c2" : item.side === "BUY" ? "#49c6ff" : "#ffb84d", lineWidth: item.role === "Entry" ? 2 : 1, lineStyle: item.role === "SL" ? 2 : item.role === "TP" ? 1 : 0, axisLabelVisible: true, title: item.label });
          created.push({ line, readback: { ...item, axisLabelVisible: true } });
        }
      } catch (error) {
        for (const item of created) price.removePriceLine(item.line);
        throw error;
      }
      clearPositionOverlays();
      for (const item of created) positionOverlayLines.set(`${item.readback.ticket}:${item.readback.role}`, item);
      positionOverlayPositions = positionModels;
      positionOverlayCurrency = snapshot.currency;
      positionOverlayMarginMode = mode;
      positionZonesPrimitive.set(positionModels);
      applyPriceAxisLabelLayout();
      return readPositionOverlays();
    }
    function readPositionOverlays() {
      guard();
      return { count: positionOverlayLines.size, lines: Array.from(positionOverlayLines.values(), (item) => ({ ...item.readback })), positionCount: positionOverlayPositions.length, zoneCount: positionOverlayPositions.reduce((count, row) => count + (row.stopLoss !== null ? 1 : 0) + (row.takeProfit !== null ? 1 : 0), 0), currency: positionOverlayCurrency, marginMode: positionOverlayMarginMode, positions: positionOverlayPositions.map((row) => ({ ...row })) };
    }
    function setBrokerDealMarkers(snapshot) {
      guard();
      const expected = { account: activeAccount, symbol: drawingScope?.symbol ?? "", timeframe: drawingScope?.timeframe ?? "" }, received = snapshot?.scope;
      if (!received || received.account !== expected.account || received.symbol !== expected.symbol || received.timeframe !== expected.timeframe) throw Error("Broker deal marker scope mismatch");
      if (snapshot.source !== "MT5_VERIFIED" || snapshot.canExecute !== false || !Array.isArray(snapshot.markers) || snapshot.markers.length > 500) throw Error("Invalid read-only broker deal marker snapshot");
      const tickets = /* @__PURE__ */ new Set(), candidate = [];
      for (const row of snapshot.markers) {
        if (!row || typeof row.ticket !== "string" || !/^[1-9][0-9]{0,19}$/.test(row.ticket) || tickets.has(row.ticket) || row.account !== expected.account || row.symbol !== expected.symbol || row.timeframe !== expected.timeframe || row.side !== "BUY" && row.side !== "SELL" || !["IN", "OUT", "INOUT", "OUT_BY"].includes(row.entry) || !Number.isFinite(row.price) || row.price <= 0 || !Number.isSafeInteger(row.fillTimeUtcMs) || row.fillTimeUtcMs <= 0 || row.chartTimeSeconds !== Math.floor(row.fillTimeUtcMs / 1e3) || typeof row.plotted !== "boolean" || typeof row.label !== "string" || row.label.length > 100) throw Error("Invalid broker deal marker");
        tickets.add(row.ticket);
        candidate.push({ ...row, plotted: barsByTime.has(row.chartTimeSeconds) });
      }
      brokerDealMarkers = candidate;
      brokerDealPrimitive.set(candidate);
      return readBrokerDealMarkers();
    }
    function readBrokerDealMarkers() {
      guard();
      const markers = brokerDealMarkers.map((row) => ({ ...row }));
      return { plotted: markers.filter((row) => row.plotted).length, unplotted: markers.filter((row) => !row.plotted).length, markers };
    }
    const newLine = (opts) => chart.addSeries(ye, {
      color: opts.color,
      lineWidth: opts.lineWidth ?? 2,
      visible: opts.visible ?? true,
      title: opts.title ?? opts.id,
      priceLineVisible: false,
      lastValueVisible: true
    });
    const averages = /* @__PURE__ */ new Map();
    const donchianOverlays = /* @__PURE__ */ new Map();
    const bollingerOverlays = /* @__PURE__ */ new Map();
    const sessionVwapOverlays = /* @__PURE__ */ new Map();
    const keltnerOverlays = /* @__PURE__ */ new Map();
    const atrBandsOverlays = /* @__PURE__ */ new Map();
    const ichimokuOverlays = /* @__PURE__ */ new Map();
    const pivotOverlays = /* @__PURE__ */ new Map();
    const linearRegressionOverlays = /* @__PURE__ */ new Map();
    const supertrendOverlays = /* @__PURE__ */ new Map();
    const parabolicSarOverlays = /* @__PURE__ */ new Map();
    const managedMovingAverages = /* @__PURE__ */ new Map();
    const transientMovingAverages = /* @__PURE__ */ new Set();
    const readoutIndicators = /* @__PURE__ */ new Map();
    const paneLines = /* @__PURE__ */ new Map();
    const paneHeightOverrides = /* @__PURE__ */ new Map();
    const oscillators = /* @__PURE__ */ new Map();
    const transientOscillators = /* @__PURE__ */ new Set();
    const priceLevels = /* @__PURE__ */ new Map();
    const timeMarkers = /* @__PURE__ */ new Map();
    const textAnnotations = /* @__PURE__ */ new Map();
    const trendLines = /* @__PURE__ */ new Map();
    const rectangles = /* @__PURE__ */ new Map();
    const ellipses = /* @__PURE__ */ new Map();
    const rays = /* @__PURE__ */ new Map();
    const fibonacci = /* @__PURE__ */ new Map();
    const fibonacciFans = /* @__PURE__ */ new Map();
    const trendBasedFibonaccis = /* @__PURE__ */ new Map();
    const fibonacciTimeZones = /* @__PURE__ */ new Map();
    const channels = /* @__PURE__ */ new Map();
    const pitchforks = /* @__PURE__ */ new Map();
    const measurements = /* @__PURE__ */ new Map();
    const riskRewards = /* @__PURE__ */ new Map();
    let placementTool = null, placementAnchors = [], placementText = null, placementSequence = 0;
    const drawingState = (phase, id) => host.dispatchEvent(new CustomEvent("chartstudio-v5-drawing-state", { detail: { kind: placementTool, phase, ...id ? { id } : {} } }));
    const cancelDrawingTool = (notify = true) => {
      if (!placementTool) return;
      placementTool = null;
      placementAnchors = [];
      placementText = null;
      if (notify) drawingState("CANCELLED");
    };
    const placeDrawingAt = (time, x2, y2) => {
      if (!placementTool) return;
      const { width } = chart.paneSize(), paneHeight = chart.panes()[0]?.getHeight() ?? 0;
      if (x2 < 0 || x2 > width || y2 < 0 || y2 > paneHeight || typeof time !== "number" || !Number.isSafeInteger(time) || !barsByTime.has(time)) {
        drawingState("ERROR");
        return;
      }
      const value = price.coordinateToPrice(y2);
      if (placementTool !== "FIB_TIME" && (value === null || !Number.isFinite(value) || value <= 0)) {
        drawingState("ERROR");
        return;
      }
      const anchor = { time, price: value ?? 0 };
      const tool = placementTool;
      if (tool === "PRICE" || tool === "TIME" || tool === "TEXT") {
        const id2 = `preview-${tool.toLowerCase()}-${++placementSequence}`;
        try {
          if (tool === "PRICE") addPriceLevel({ id: id2, price: anchor.price, color: "#49c6ff" });
          else if (tool === "TIME") addTimeMarker({ id: id2, time: anchor.time, color: "#ffb84d" });
          else addTextAnnotation({ id: id2, time: anchor.time, price: anchor.price, text: placementText, color: "#f4d35e" });
          placementTool = null;
          placementAnchors = [];
          placementText = null;
          host.dispatchEvent(new CustomEvent("chartstudio-v5-drawing-state", { detail: { kind: tool, phase: "CREATED", id: id2 } }));
        } catch (_2) {
          drawingState("ERROR");
        }
        return;
      }
      if (placementAnchors.some((item) => item.time === anchor.time)) {
        drawingState("ERROR");
        return;
      }
      const anchors = [...placementAnchors, anchor], required = tool === "CHANNEL" || tool === "PITCHFORK" || tool === "RISK_REWARD" || tool === "FIB_TREND" ? 3 : 2;
      if (anchors.length < required) {
        placementAnchors = anchors;
        drawingState(anchors.length === 1 ? "FIRST_ANCHOR" : "SECOND_ANCHOR");
        return;
      }
      const id = `preview-${tool.toLowerCase()}-${++placementSequence}`;
      try {
        const [start, end, offset] = anchors, color = tool === "TREND" || tool === "RECT" || tool === "ELLIPSE" || tool === "CHANNEL" ? "#49c6ff" : "#ffb84d";
        if (tool === "FIB_TIME") addFibonacciTimeZone({ id, startTime: start.time, endTime: end.time, color });
        else if (tool === "FIB_TREND") addTrendBasedFibonacci({ id, startTime: start.time, startPrice: start.price, endTime: end.time, endPrice: end.price, thirdTime: offset.time, thirdPrice: offset.price, color });
        else if (tool === "CHANNEL") addChannel({ id, startTime: start.time, startPrice: start.price, endTime: end.time, endPrice: end.price, offsetTime: offset.time, offsetPrice: offset.price, color });
        else if (tool === "PITCHFORK") addPitchfork({ id, startTime: start.time, startPrice: start.price, endTime: end.time, endPrice: end.price, thirdTime: offset.time, thirdPrice: offset.price, color });
        else if (tool === "RISK_REWARD") addRiskReward({ id, startTime: start.time, entryPrice: start.price, stopTime: end.time, stopPrice: end.price, endTime: offset.time, targetPrice: offset.price });
        else {
          const options = { id, startTime: start.time, startPrice: start.price, endTime: end.time, endPrice: end.price, color };
          if (tool === "TREND") addTrendLine(options);
          else if (tool === "RAY") addRay(options);
          else if (tool === "RECT") addRectangle({ ...options, fill: true });
          else if (tool === "ELLIPSE") addEllipse(options);
          else if (tool === "FIBO") addFibonacci(options);
          else if (tool === "FIB_FAN") addFibonacciFan(options);
          else addMeasurement(options);
        }
        placementTool = null;
        placementAnchors = [];
        placementText = null;
        host.dispatchEvent(new CustomEvent("chartstudio-v5-drawing-state", { detail: { kind: tool, phase: "CREATED", id } }));
      } catch (_2) {
        drawingState("ERROR");
      }
    };
    const maxNativeDrawings = 1e3, maxIndicatorInstances = 20;
    const drawingCount = () => priceLevels.size + timeMarkers.size + textAnnotations.size + trendLines.size + rectangles.size + ellipses.size + rays.size + fibonacci.size + fibonacciFans.size + trendBasedFibonaccis.size + fibonacciTimeZones.size + channels.size + pitchforks.size + measurements.size + riskRewards.size;
    const undoStack = [], redoStack = [];
    const historyLimit = 100;
    const utf8ByteLength = (value) => new TextEncoder().encode(value).byteLength;
    let persistenceStatus = drawingScope ? "PENDING" : "DISABLED";
    let persistenceError = null, drawingsHydrated = false, hydratingDrawings = false;
    let lastPersistedSnapshot = null;
    const persistenceLimit = 524288;
    let selectedDrawingId = null, hoveredDrawingId = null;
    const selectedDrawingIds = /* @__PURE__ */ new Set();
    let activeDrag = null;
    chart.subscribeCrosshairMove((param) => {
      const time = param.time;
      let dataWindow = null;
      if (typeof time === "number") try {
        dataWindow = readDataWindow(time);
      } catch {
      }
      host.dispatchEvent(new CustomEvent("chartstudio-v5-data-window", { detail: dataWindow }));
      const objectId = param.hoveredInfo?.objectId;
      hoveredDrawingId = typeof objectId === "string" && (priceLevels.has(objectId) || timeMarkers.has(objectId) || textAnnotations.has(objectId) || trendLines.has(objectId) || rectangles.has(objectId) || ellipses.has(objectId) || rays.has(objectId) || fibonacci.has(objectId) || fibonacciFans.has(objectId) || trendBasedFibonaccis.has(objectId) || fibonacciTimeZones.has(objectId) || measurements.has(objectId)) ? objectId : null;
    });
    const touchAnchorAt = (x2, y2, excludeTimeZones = false) => {
      let bestId = null, bestDistance = 12;
      const ids = [...trendLines.keys(), ...rectangles.keys(), ...ellipses.keys(), ...fibonacci.keys(), ...fibonacciFans.keys(), ...trendBasedFibonaccis.keys(), ...fibonacciTimeZones.keys(), ...channels.keys(), ...pitchforks.keys(), ...riskRewards.keys()];
      for (const id of ids) {
        if (excludeTimeZones && fibonacciTimeZones.has(id)) continue;
        const snapshot = snapshotDrawing(id);
        if (!snapshot || snapshot.options.visible === false) continue;
        for (const anchor of channels.has(id) ? ["START", "END", "OFFSET"] : riskRewards.has(id) ? ["ENTRY", "STOP", "TARGET"] : pitchforks.has(id) || trendBasedFibonaccis.has(id) ? ["START", "END", "THIRD"] : ["START", "END"]) {
          const point2 = drawingAnchorPosition(id, anchor);
          if (!point2) continue;
          const distance = Math.hypot(x2 - point2.x, y2 - point2.y);
          if (distance <= bestDistance) {
            bestId = id;
            bestDistance = distance;
          }
        }
      }
      return bestId;
    };
    const drawingAt = (clientX, clientY) => {
      const rect = host.getBoundingClientRect(), x2 = clientX - rect.left, y2 = clientY - rect.top;
      let bestId = null, bestDistance = Infinity;
      const primitives = [...priceLevels.values(), ...timeMarkers.values(), ...textAnnotations.values(), ...trendLines.values(), ...rectangles.values(), ...ellipses.values(), ...rays.values(), ...fibonacci.values(), ...fibonacciFans.values(), ...trendBasedFibonaccis.values(), ...fibonacciTimeZones.values(), ...channels.values(), ...pitchforks.values(), ...measurements.values(), ...riskRewards.values()];
      for (const item of primitives) {
        const hit = item.primitive.hitTest(x2, y2);
        if (hit && hit.distance <= bestDistance) {
          bestId = hit.externalId;
          bestDistance = hit.distance;
        }
      }
      return bestId;
    };
    const onPointerDown = (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      if (placementTool) {
        if (event.shiftKey) return;
        const rect = host.getBoundingClientRect(), x2 = event.clientX - rect.left, y2 = event.clientY - rect.top;
        placeDrawingAt(chart.timeScale().coordinateToTime(x2), x2, y2);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const competingAnchor = hoveredDrawingId && fibonacciTimeZones.has(hoveredDrawingId) ? touchAnchorAt(event.clientX, event.clientY, true) : null;
      const drawingId = competingAnchor ?? hoveredDrawingId ?? drawingAt(event.clientX, event.clientY) ?? (event.pointerType === "touch" ? touchAnchorAt(event.clientX, event.clientY) : null);
      if (!drawingId) {
        if (!event.shiftKey) selectDrawing(null);
        return;
      }
      hoveredDrawingId = drawingId;
      const level = priceLevels.get(drawingId), marker = timeMarkers.get(drawingId), annotation = textAnnotations.get(drawingId), trend = trendLines.get(drawingId), rectangle = rectangles.get(drawingId), ellipse = ellipses.get(drawingId), fibo = fibonacci.get(drawingId), fibFan = fibonacciFans.get(drawingId), fibTrend = trendBasedFibonaccis.get(drawingId), fibTime = fibonacciTimeZones.get(drawingId), channel = channels.get(drawingId), pitchfork = pitchforks.get(drawingId), measurement = measurements.get(drawingId), riskReward = riskRewards.get(drawingId);
      if (event.shiftKey) toggleDrawingSelection(drawingId);
      else selectDrawing(drawingId);
      if (host.tabIndex < 0) host.tabIndex = 0;
      host.focus({ preventScroll: true });
      if (!level && !marker && !annotation && !trend && !rectangle && !ellipse && !fibo && !fibFan && !fibTrend && !fibTime && !channel && !pitchfork && !measurement && !riskReward) return;
      if ((level?.options.locked ?? marker?.options.locked ?? annotation?.options.locked ?? trend?.options.locked ?? rectangle?.options.locked ?? ellipse?.options.locked ?? fibo?.options.locked ?? fibFan?.options.locked ?? fibTrend?.options.locked ?? fibTime?.options.locked ?? channel?.options.locked ?? pitchfork?.options.locked ?? measurement?.options.locked ?? riskReward?.options.locked) === true) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (level) activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "PRICE", original: { ...level.options } };
      else if (marker) activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "TIME", original: { ...marker.options } };
      else if (annotation) activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "TEXT", original: { ...annotation.options } };
      else if (trend) {
        const points = trend.primitive.coordinates(), rect = host.getBoundingClientRect();
        if (!points) return;
        const x2 = event.clientX - rect.left, y2 = event.clientY - rect.top;
        const startDistance = Math.hypot(x2 - points.x1, y2 - points.y1), endDistance = Math.hypot(x2 - points.x2, y2 - points.y2);
        if (Math.min(startDistance, endDistance) > 12) return;
        activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "TREND", anchor: startDistance <= endDistance ? "START" : "END", original: { ...trend.options } };
      } else if (rectangle) {
        const rect = host.getBoundingClientRect(), start = drawingAnchorPosition(drawingId, "START"), end = drawingAnchorPosition(drawingId, "END");
        if (!start || !end) return;
        const x2 = event.clientX - rect.left, y2 = event.clientY - rect.top;
        const startDistance = Math.hypot(x2 - (start.x - rect.left), y2 - (start.y - rect.top)), endDistance = Math.hypot(x2 - (end.x - rect.left), y2 - (end.y - rect.top));
        if (Math.min(startDistance, endDistance) > 12) return;
        activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "RECT", anchor: startDistance <= endDistance ? "START" : "END", original: { ...rectangle.options } };
      } else if (ellipse) {
        const start = drawingAnchorPosition(drawingId, "START"), end = drawingAnchorPosition(drawingId, "END");
        if (!start || !end) return;
        const ds2 = Math.hypot(event.clientX - start.x, event.clientY - start.y), de2 = Math.hypot(event.clientX - end.x, event.clientY - end.y);
        if (Math.min(ds2, de2) > 12) return;
        activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "ELLIPSE", anchor: ds2 <= de2 ? "START" : "END", original: { ...ellipse.options } };
      } else if (fibo) {
        const rect = host.getBoundingClientRect(), start = drawingAnchorPosition(drawingId, "START"), end = drawingAnchorPosition(drawingId, "END");
        if (!start || !end) return;
        const x2 = event.clientX - rect.left, y2 = event.clientY - rect.top;
        const startDistance = Math.hypot(x2 - (start.x - rect.left), y2 - (start.y - rect.top)), endDistance = Math.hypot(x2 - (end.x - rect.left), y2 - (end.y - rect.top));
        if (Math.min(startDistance, endDistance) > 12) return;
        const original = { ...fibo.options };
        if (original.levels) original.levels = [...original.levels];
        activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "FIBO", anchor: startDistance <= endDistance ? "START" : "END", original };
      } else if (fibFan) {
        const start = drawingAnchorPosition(drawingId, "START"), end = drawingAnchorPosition(drawingId, "END");
        if (!start || !end) return;
        const ds2 = Math.hypot(event.clientX - start.x, event.clientY - start.y), de2 = Math.hypot(event.clientX - end.x, event.clientY - end.y);
        if (Math.min(ds2, de2) > 12) return;
        activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "FIB_FAN", anchor: ds2 <= de2 ? "START" : "END", original: { ...fibFan.options, ratios: [...fibonacciFanRatios(fibFan.options)] } };
      } else if (fibTrend) {
        const points = ["START", "END", "THIRD"].map((anchor) => drawingAnchorPosition(drawingId, anchor));
        if (points.some((point2) => !point2)) return;
        const distances = points.map((point2) => Math.hypot(event.clientX - point2.x, event.clientY - point2.y)), nearest = distances.indexOf(Math.min(...distances));
        if (distances[nearest] > 12) return;
        activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "FIB_TREND", anchor: ["START", "END", "THIRD"][nearest], original: { ...fibTrend.options, ratios: [...trendFibRatios(fibTrend.options)] } };
      } else if (fibTime) {
        const start = drawingAnchorPosition(drawingId, "START"), end = drawingAnchorPosition(drawingId, "END");
        if (!start || !end) return;
        const ds2 = Math.hypot(event.clientX - start.x, event.clientY - start.y), de2 = Math.hypot(event.clientX - end.x, event.clientY - end.y);
        if (Math.min(ds2, de2) > 12) return;
        activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "FIB_TIME", anchor: ds2 <= de2 ? "START" : "END", original: { ...fibTime.options } };
      } else if (channel) {
        const points = ["START", "END", "OFFSET"].map((anchor) => drawingAnchorPosition(drawingId, anchor));
        if (points.some((point2) => !point2)) return;
        const distances = points.map((point2) => Math.hypot(event.clientX - point2.x, event.clientY - point2.y)), nearest = distances.indexOf(Math.min(...distances));
        if (distances[nearest] > 12) return;
        activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "CHANNEL", anchor: ["START", "END", "OFFSET"][nearest], original: { ...channel.options } };
      } else if (pitchfork) {
        const points = ["START", "END", "THIRD"].map((anchor) => drawingAnchorPosition(drawingId, anchor));
        if (points.some((point2) => !point2)) return;
        const distances = points.map((point2) => Math.hypot(event.clientX - point2.x, event.clientY - point2.y)), nearest = distances.indexOf(Math.min(...distances));
        if (distances[nearest] > 12) return;
        activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "PITCHFORK", anchor: ["START", "END", "THIRD"][nearest], original: { ...pitchfork.options } };
      } else if (measurement) {
        const a2 = drawingAnchorPosition(drawingId, "START"), b2 = drawingAnchorPosition(drawingId, "END");
        if (!a2 || !b2) return;
        const da = Math.hypot(event.clientX - a2.x, event.clientY - a2.y), db = Math.hypot(event.clientX - b2.x, event.clientY - b2.y);
        if (Math.min(da, db) > 12) return;
        activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "MEASURE", anchor: da <= db ? "START" : "END", original: { ...measurement.options } };
      } else if (riskReward) {
        const points = ["ENTRY", "STOP", "TARGET"].map((anchor) => drawingAnchorPosition(drawingId, anchor));
        if (points.some((point2) => !point2)) return;
        const distances = points.map((point2) => Math.hypot(event.clientX - point2.x, event.clientY - point2.y)), nearest = distances.indexOf(Math.min(...distances));
        if (distances[nearest] > 12) return;
        activeDrag = { pointerId: event.pointerId, id: drawingId, kind: "RISK_REWARD", anchor: ["ENTRY", "STOP", "TARGET"][nearest], original: { ...riskReward.options } };
      } else return;
      host.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onPointerMove = (event) => {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const rect = host.getBoundingClientRect(), x2 = event.clientX - rect.left, y2 = event.clientY - rect.top;
      if (activeDrag.kind === "PRICE") {
        const value = price.coordinateToPrice(y2);
        if (value !== null && Number.isFinite(value) && value > 0) {
          const item = priceLevels.get(activeDrag.id);
          if (item) updatePriceLevel(activeDrag.id, { price: value, color: item.options.color });
        }
      } else if (activeDrag.kind === "TIME") {
        const logical = chart.timeScale().coordinateToLogical(x2), index = logical === null ? -1 : Math.round(Number(logical));
        const candle = bars[index];
        if (candle) {
          const item = timeMarkers.get(activeDrag.id);
          if (item) updateTimeMarker(activeDrag.id, { time: candle.time, color: item.options.color });
        }
      } else if (activeDrag.kind === "TEXT") {
        const logical = chart.timeScale().coordinateToLogical(x2), index = logical === null ? -1 : Math.round(Number(logical));
        const candle = bars[index], value = price.coordinateToPrice(y2);
        if (candle && value !== null && Number.isFinite(value) && value > 0) {
          const item = textAnnotations.get(activeDrag.id);
          if (item) updateTextAnnotation(activeDrag.id, { time: candle.time, price: value });
        }
      } else if (activeDrag.kind === "FIB_TIME") {
        const logical = chart.timeScale().coordinateToLogical(x2), index = logical === null ? -1 : Math.round(Number(logical)), candle = bars[index], item = fibonacciTimeZones.get(activeDrag.id);
        if (candle && item) {
          const patch = activeDrag.anchor === "START" ? { startTime: candle.time } : { endTime: candle.time };
          try {
            updateFibonacciTimeZone(activeDrag.id, patch);
          } catch (_2) {
          }
        }
      } else if (activeDrag.kind === "FIB_TREND") {
        const logical = chart.timeScale().coordinateToLogical(x2), index = logical === null ? -1 : Math.round(Number(logical)), candle = bars[index], value = price.coordinateToPrice(y2), item = trendBasedFibonaccis.get(activeDrag.id);
        if (candle && value !== null && Number.isFinite(value) && value > 0 && item) {
          const patch = activeDrag.anchor === "START" ? { startTime: candle.time, startPrice: value } : activeDrag.anchor === "END" ? { endTime: candle.time, endPrice: value } : { thirdTime: candle.time, thirdPrice: value };
          try {
            updateTrendBasedFibonacci(activeDrag.id, patch);
          } catch (_2) {
          }
        }
      } else if (activeDrag.kind === "CHANNEL") {
        const logical = chart.timeScale().coordinateToLogical(x2), index = logical === null ? -1 : Math.round(Number(logical));
        const candle = bars[index], value = price.coordinateToPrice(y2), item = channels.get(activeDrag.id);
        if (candle && value !== null && Number.isFinite(value) && value > 0 && item) {
          const patch = activeDrag.anchor === "START" ? { startTime: candle.time, startPrice: value } : activeDrag.anchor === "END" ? { endTime: candle.time, endPrice: value } : { offsetTime: candle.time, offsetPrice: value };
          const options = { ...item.options, ...patch };
          try {
            validateChannel(options);
            updateChannel(activeDrag.id, patch);
          } catch (_2) {
          }
        }
      } else if (activeDrag.kind === "PITCHFORK") {
        const logical = chart.timeScale().coordinateToLogical(x2), index = logical === null ? -1 : Math.round(Number(logical)), candle = bars[index], value = price.coordinateToPrice(y2), item = pitchforks.get(activeDrag.id);
        if (candle && value !== null && Number.isFinite(value) && value > 0 && item) {
          const patch = activeDrag.anchor === "START" ? { startTime: candle.time, startPrice: value } : activeDrag.anchor === "END" ? { endTime: candle.time, endPrice: value } : { thirdTime: candle.time, thirdPrice: value };
          try {
            updatePitchfork(activeDrag.id, patch);
          } catch (_2) {
          }
        }
      } else if (activeDrag.kind === "RISK_REWARD") {
        const logical = chart.timeScale().coordinateToLogical(x2), index = logical === null ? -1 : Math.round(Number(logical)), candle = bars[index], value = price.coordinateToPrice(y2), item = riskRewards.get(activeDrag.id);
        if (candle && value !== null && Number.isFinite(value) && value > 0 && item) {
          const patch = activeDrag.anchor === "ENTRY" ? { startTime: candle.time, entryPrice: value } : activeDrag.anchor === "STOP" ? { stopTime: candle.time, stopPrice: value } : { endTime: candle.time, targetPrice: value };
          try {
            updateRiskReward(activeDrag.id, patch);
          } catch (_2) {
          }
        }
      } else if (activeDrag.kind === "TREND" || activeDrag.kind === "RECT" || activeDrag.kind === "ELLIPSE" || activeDrag.kind === "FIBO" || activeDrag.kind === "FIB_FAN" || activeDrag.kind === "MEASURE") {
        const logical = chart.timeScale().coordinateToLogical(x2), index = logical === null ? -1 : Math.round(Number(logical));
        const candle = bars[index], value = price.coordinateToPrice(y2), item = activeDrag.kind === "TREND" ? trendLines.get(activeDrag.id) : activeDrag.kind === "RECT" ? rectangles.get(activeDrag.id) : activeDrag.kind === "ELLIPSE" ? ellipses.get(activeDrag.id) : activeDrag.kind === "FIBO" ? fibonacci.get(activeDrag.id) : activeDrag.kind === "FIB_FAN" ? fibonacciFans.get(activeDrag.id) : measurements.get(activeDrag.id);
        if (candle && value !== null && Number.isFinite(value) && value > 0 && item) {
          const patch = activeDrag.anchor === "START" ? { startTime: candle.time, startPrice: value } : { endTime: candle.time, endPrice: value };
          const otherTime = activeDrag.anchor === "START" ? item.options.endTime : item.options.startTime, otherPrice = activeDrag.anchor === "START" ? item.options.endPrice : item.options.startPrice;
          if (candle.time !== otherTime && (activeDrag.kind === "TREND" || value !== otherPrice)) {
            if (activeDrag.kind === "TREND") updateTrendLine(activeDrag.id, patch);
            else if (activeDrag.kind === "RECT") updateRectangle(activeDrag.id, patch);
            else if (activeDrag.kind === "ELLIPSE") updateEllipse(activeDrag.id, patch);
            else if (activeDrag.kind === "FIBO") updateFibonacci(activeDrag.id, patch);
            else if (activeDrag.kind === "FIB_FAN") updateFibonacciFan(activeDrag.id, patch);
            else updateMeasurement(activeDrag.id, patch);
          }
        }
      }
    };
    const finishDrag = (cancel) => {
      const drag = activeDrag;
      if (!drag) return;
      if (cancel) {
        if (drag.kind === "PRICE" && priceLevels.has(drag.id)) updatePriceLevel(drag.id, { price: drag.original.price, color: drag.original.color });
        if (drag.kind === "TIME" && timeMarkers.has(drag.id)) updateTimeMarker(drag.id, { time: drag.original.time, color: drag.original.color });
        if (drag.kind === "TEXT" && textAnnotations.has(drag.id)) updateTextAnnotation(drag.id, drag.original);
        if (drag.kind === "TREND" && trendLines.has(drag.id)) updateTrendLine(drag.id, drag.original);
        if (drag.kind === "RECT" && rectangles.has(drag.id)) updateRectangle(drag.id, drag.original);
        if (drag.kind === "ELLIPSE" && ellipses.has(drag.id)) updateEllipse(drag.id, drag.original);
        if (drag.kind === "FIBO" && fibonacci.has(drag.id)) updateFibonacci(drag.id, drag.original);
        if (drag.kind === "FIB_FAN" && fibonacciFans.has(drag.id)) updateFibonacciFan(drag.id, drag.original);
        if (drag.kind === "FIB_TREND" && trendBasedFibonaccis.has(drag.id)) updateTrendBasedFibonacci(drag.id, drag.original);
        if (drag.kind === "FIB_TIME" && fibonacciTimeZones.has(drag.id)) updateFibonacciTimeZone(drag.id, drag.original);
        if (drag.kind === "CHANNEL" && channels.has(drag.id)) updateChannel(drag.id, drag.original);
        if (drag.kind === "PITCHFORK" && pitchforks.has(drag.id)) updatePitchfork(drag.id, drag.original);
        if (drag.kind === "MEASURE" && measurements.has(drag.id)) updateMeasurement(drag.id, drag.original);
        if (drag.kind === "RISK_REWARD" && riskRewards.has(drag.id)) updateRiskReward(drag.id, drag.original);
      } else {
        let before;
        if (drag.kind === "PRICE") before = { kind: "PRICE", options: { ...drag.original } };
        else if (drag.kind === "TIME") before = { kind: "TIME", options: { ...drag.original } };
        else if (drag.kind === "TEXT") before = { kind: "TEXT", options: { ...drag.original } };
        else if (drag.kind === "TREND") before = { kind: "TREND", options: { ...drag.original } };
        else if (drag.kind === "RECT") before = { kind: "RECT", options: { ...drag.original } };
        else if (drag.kind === "ELLIPSE") before = { kind: "ELLIPSE", options: { ...drag.original } };
        else if (drag.kind === "FIBO") {
          const original = { ...drag.original };
          if (original.levels) original.levels = [...original.levels];
          else delete original.levels;
          before = { kind: "FIBO", options: original };
        } else if (drag.kind === "FIB_FAN") before = { kind: "FIB_FAN", options: { ...drag.original, ratios: [...fibonacciFanRatios(drag.original)] } };
        else if (drag.kind === "FIB_TREND") before = { kind: "FIB_TREND", options: { ...drag.original, ratios: [...trendFibRatios(drag.original)] } };
        else if (drag.kind === "FIB_TIME") before = { kind: "FIB_TIME", options: { ...drag.original } };
        else if (drag.kind === "CHANNEL") before = { kind: "CHANNEL", options: { ...drag.original } };
        else if (drag.kind === "PITCHFORK") before = { kind: "PITCHFORK", options: { ...drag.original } };
        else if (drag.kind === "RISK_REWARD") before = { kind: "RISK_REWARD", options: { ...drag.original } };
        else before = { kind: "MEASURE", options: { ...drag.original } };
        recordDrawingChange(drag.id, before, snapshotDrawing(drag.id));
      }
      activeDrag = null;
      if (host.hasPointerCapture(drag.pointerId)) host.releasePointerCapture(drag.pointerId);
    };
    const onPointerUp = (event) => {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finishDrag(false);
    };
    const onPointerCancel = (event) => {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finishDrag(true);
    };
    const onLostPointerCapture = (event) => {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      finishDrag(true);
    };
    function nudgeSelectedDrawing(dx, dy) {
      const ids = [...selectedDrawingIds];
      if (!ids.length || !dx && !dy || !bars.length) return false;
      const before = ids.map((id) => ({ id, snapshot: snapshotDrawing(id) }));
      if (before.some((item) => !item.snapshot || item.snapshot.options.locked)) return false;
      const timeKeys = { TIME: ["time"], TEXT: ["time"], TREND: ["startTime", "endTime"], RECT: ["startTime", "endTime"], ELLIPSE: ["startTime", "endTime"], RAY: ["startTime", "endTime"], FIBO: ["startTime", "endTime"], FIB_FAN: ["startTime", "endTime"], FIB_TIME: ["startTime", "endTime"], MEASURE: ["startTime", "endTime"], CHANNEL: ["startTime", "endTime", "offsetTime"], PITCHFORK: ["startTime", "endTime", "thirdTime"], RISK_REWARD: ["startTime", "stopTime", "endTime"] };
      const priceKeys = { PRICE: ["price"], TEXT: ["price"], TREND: ["startPrice", "endPrice"], RECT: ["startPrice", "endPrice"], ELLIPSE: ["startPrice", "endPrice"], RAY: ["startPrice", "endPrice"], FIBO: ["startPrice", "endPrice"], FIB_FAN: ["startPrice", "endPrice"], MEASURE: ["startPrice", "endPrice"], CHANNEL: ["startPrice", "endPrice", "offsetPrice"], PITCHFORK: ["startPrice", "endPrice", "thirdPrice"], RISK_REWARD: ["entryPrice", "stopPrice", "targetPrice"] };
      const moveTime = (value) => {
        const index = bars.findIndex((bar) => bar.time === value), next = index + dx;
        return index >= 0 && next >= 0 && next < bars.length ? bars[next].time : null;
      };
      const movePrice = (value) => {
        if (!dy) return value;
        const coordinate = price.priceToCoordinate(value);
        if (coordinate === null) return null;
        const next = price.coordinateToPrice(coordinate + dy);
        return next !== null && Number.isFinite(next) && next > 0 ? next : null;
      };
      const candidates = [];
      for (const item of before) {
        const current = item.snapshot;
        if (current.kind === "PRICE" && !dy || current.kind === "TIME" && !dx) continue;
        const options = { ...current.options };
        if (dx && current.kind !== "PRICE") for (const key of timeKeys[current.kind] ?? []) {
          const moved = moveTime(options[key]);
          if (moved === null) return false;
          options[key] = moved;
        }
        if (dy && current.kind !== "TIME") for (const key of priceKeys[current.kind] ?? []) {
          const moved = movePrice(options[key]);
          if (moved === null) return false;
          options[key] = moved;
        }
        const after = { kind: current.kind, options };
        if (JSON.stringify(after) !== JSON.stringify(current)) candidates.push({ id: item.id, before: current, after });
      }
      if (!candidates.length || candidates.length > historyLimit || !drawingScope && persistenceStatus !== "DISABLED" || drawingScope && persistenceStatus !== "READY") return false;
      const originalUndo = undoStack.slice(), originalRedo = redoStack.slice(), originalSelection = ids.slice();
      let applied = 0;
      try {
        for (const change of candidates) {
          if (!restoreDrawing(change.id, change.after)) throw Error("Nudge apply failed");
          applied++;
        }
      } catch (_2) {
        for (let index = Math.min(applied, candidates.length - 1); index >= 0; index--) restoreDrawing(candidates[index].id, candidates[index].before);
        selectDrawings(originalSelection);
        return false;
      }
      selectDrawings(originalSelection);
      const keepExisting = Math.max(0, historyLimit - candidates.length);
      if (undoStack.length > keepExisting) undoStack.splice(0, undoStack.length - keepExisting);
      for (const change of candidates) undoStack.push({ id: change.id, before: change.before, after: change.after });
      redoStack.length = 0;
      if (!persistDrawings(candidates.length)) {
        for (let index = candidates.length - 1; index >= 0; index--) restoreDrawing(candidates[index].id, candidates[index].before);
        undoStack.splice(0, undoStack.length, ...originalUndo);
        redoStack.splice(0, redoStack.length, ...originalRedo);
        selectDrawings(originalSelection);
        return false;
      }
      selectDrawings(originalSelection);
      return true;
    }
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,button,[contenteditable=true]")) return;
      if (event.key === "Escape" && activeDrag) {
        event.preventDefault();
        event.stopImmediatePropagation();
        finishDrag(true);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        event.stopImmediatePropagation();
        redo();
        return;
      }
      const moveKeys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const move = moveKeys[event.key], step = event.shiftKey ? 10 : 1;
      if (move && nudgeSelectedDrawing(move[0] * step, move[1] * step)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedDrawingIds.size) {
        event.preventDefault();
        event.stopImmediatePropagation();
        deleteSelectedDrawings();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selectedDrawingIds.size) {
        event.preventDefault();
        event.stopImmediatePropagation();
        duplicateSelectedDrawings();
      }
      if (!event.ctrlKey && !event.metaKey && selectedDrawingIds.size && event.key.toLowerCase() === "h") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const items = [...selectedDrawingIds].map((id) => snapshotDrawing(id));
        setSelectedDrawingsVisible(items.some((item) => item?.options.visible !== false) ? false : true);
        return;
      }
      if (!event.ctrlKey && !event.metaKey && selectedDrawingIds.size && event.key.toLowerCase() === "l") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const items = [...selectedDrawingIds].map((id) => snapshotDrawing(id));
        setSelectedDrawingsLocked(items.some((item) => item?.options.locked !== true) ? true : false);
        return;
      }
    };
    host.addEventListener("pointerdown", onPointerDown, true);
    host.addEventListener("pointermove", onPointerMove, true);
    host.addEventListener("pointerup", onPointerUp, true);
    host.addEventListener("pointercancel", onPointerCancel, true);
    host.addEventListener("lostpointercapture", onLostPointerCapture, true);
    host.addEventListener("keydown", onKeyDown, true);
    const createPaneLine = (opts, paneIndex = chart.panes().length) => chart.addSeries(ye, {
      color: opts.color,
      lineWidth: opts.lineWidth ?? 2,
      visible: opts.visible ?? true,
      title: opts.title ?? opts.id,
      priceLineVisible: false,
      lastValueVisible: true
    }, paneIndex);
    const newHistogram = (paneIndex = chart.panes().length) => chart.addSeries(nr, { priceLineVisible: false, lastValueVisible: true }, paneIndex);
    const newVolume = () => chart.addSeries(nr, {
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false
    }, chart.panes().length);
    let volume = null;
    let volumeZones = null;
    const autoFibRatios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], autoFibColors = ["#eab308", "#f97316", "#22d3ee", "#f8fafc", "#a78bfa", "#22c55e", "#fb7185"];
    let autoFibonacci = null;
    let bars = [], barsByTime = /* @__PURE__ */ new Map(), activeAccount = accountId, destroyed = false;
    const indicatorInstanceCount = () => averages.size + paneLines.size + oscillators.size + donchianOverlays.size + bollingerOverlays.size + sessionVwapOverlays.size + keltnerOverlays.size + atrBandsOverlays.size + linearRegressionOverlays.size + supertrendOverlays.size + parabolicSarOverlays.size + ichimokuOverlays.size + pivotOverlays.size + (autoFibonacci ? 1 : 0);
    function guard() {
      if (destroyed) throw Error("Chart was destroyed");
    }
    function persistenceKey(account = activeAccount) {
      if (!drawingScope) return null;
      return `2eas.chartstudio.v5.drawings:v5:${encodeURIComponent(account)}:${encodeURIComponent(drawingScope.symbol)}:${encodeURIComponent(drawingScope.timeframe)}`;
    }
    function previousPersistenceKey(account = activeAccount) {
      if (!drawingScope) return null;
      return `2eas.chartstudio.v5.drawings:v4:${encodeURIComponent(account)}:${encodeURIComponent(drawingScope.symbol)}:${encodeURIComponent(drawingScope.timeframe)}`;
    }
    function legacyPersistenceKey(account = activeAccount) {
      if (!drawingScope) return null;
      return `2eas.chartstudio.v5.drawings:${encodeURIComponent(account)}:${encodeURIComponent(drawingScope.symbol)}:${encodeURIComponent(drawingScope.timeframe)}`;
    }
    function localStorageApi() {
      try {
        return host.ownerDocument.defaultView?.localStorage ?? null;
      } catch (_2) {
        return null;
      }
    }
    function chartTypeStorageKey(account = activeAccount) {
      if (!drawingScope) return null;
      return `2eas.chartstudio.v5.price-presentation:v1:${encodeURIComponent(account)}:${encodeURIComponent(drawingScope.symbol)}:${encodeURIComponent(drawingScope.timeframe)}`;
    }
    function restorePricePresentation(account = activeAccount) {
      const storage = localStorageApi(), key = chartTypeStorageKey(account);
      if (!storage || !key) return "candles";
      try {
        const value = storage.getItem(key);
        return pricePresentationTypes.includes(value) ? value : "candles";
      } catch (_2) {
        return "candles";
      }
    }
    let pricePresentation = restorePricePresentation(accountId);
    function pricePresentationBars() {
      if (pricePresentation === "heikin") return heikinAshiCandles(bars);
      if (pricePresentation === "hollow") return hollowCandles(bars);
      if (pricePresentation === "bars" || pricePresentation === "line" || pricePresentation === "area") return bars.map((bar) => ({ ...bar, color: transparentCandle, borderColor: transparentCandle, wickColor: transparentCandle }));
      return bars.map((bar) => ({ ...bar }));
    }
    function syncPresentationSeries() {
      price.setData(pricePresentationBars());
      barPresentation.setData(bars);
      const closes = bars.map((bar) => ({ time: bar.time, value: bar.close }));
      linePresentation.setData(closes);
      areaPresentation.setData(closes);
      barPresentation.applyOptions({ visible: pricePresentation === "bars" });
      linePresentation.applyOptions({ visible: pricePresentation === "line" });
      areaPresentation.applyOptions({ visible: pricePresentation === "area" });
      schedulePriceAxisLabelLayout();
    }
    function readPricePresentation() {
      guard();
      const displayed = pricePresentationBars();
      const seriesData = pricePresentation === "line" || pricePresentation === "area" ? bars.map((bar) => ({ time: bar.time, value: bar.close })) : displayed.map((bar) => ({ ...bar }));
      return {
        type: pricePresentation,
        source: "CHART_FEED",
        bars: displayed.map((bar) => ({ ...bar })),
        seriesData,
        renderedSeries: { candles: pricePresentation === "candles" || pricePresentation === "heikin" || pricePresentation === "hollow", bars: pricePresentation === "bars", line: pricePresentation === "line", area: pricePresentation === "area" },
        styles: displayed.map((bar) => ({ bodyColor: bar.color ?? null, borderColor: bar.borderColor ?? null, wickColor: bar.wickColor ?? null }))
      };
    }
    function setPricePresentation(value) {
      guard();
      if (typeof value !== "string" || !pricePresentationTypes.includes(value)) throw Error("Unsupported chart presentation");
      const next = value, key = chartTypeStorageKey(), storage = localStorageApi();
      pricePresentation = next;
      if (storage && key) try {
        storage.setItem(key, next);
      } catch (_2) {
      }
      syncPresentationSeries();
      return readPricePresentation();
    }
    function drawingSnapshots() {
      return [
        ...[...priceLevels.values()].map(({ options }) => ({ kind: "PRICE", options: { ...options } })),
        ...[...timeMarkers.values()].map(({ options }) => ({ kind: "TIME", options: { ...options } })),
        ...[...textAnnotations.values()].map(({ options }) => ({ kind: "TEXT", options: { ...options } })),
        ...[...trendLines.values()].map(({ options }) => ({ kind: "TREND", options: { ...options } })),
        ...[...rectangles.values()].map(({ options }) => ({ kind: "RECT", options: { ...options } })),
        ...[...ellipses.values()].map(({ options }) => ({ kind: "ELLIPSE", options: { ...options } })),
        ...[...rays.values()].map(({ options }) => ({ kind: "RAY", options: { ...options } })),
        ...[...fibonacci.values()].map(({ options }) => ({ kind: "FIBO", options: { ...options } })),
        ...[...fibonacciFans.values()].map(({ options }) => ({ kind: "FIB_FAN", options: { ...options, ratios: [...fibonacciFanRatios(options)] } })),
        ...[...trendBasedFibonaccis.values()].map(({ options }) => ({ kind: "FIB_TREND", options: { ...options, ratios: [...trendFibRatios(options)] } })),
        ...[...fibonacciTimeZones.values()].map(({ options }) => ({ kind: "FIB_TIME", options: { ...options } })),
        ...[...channels.values()].map(({ options }) => ({ kind: "CHANNEL", options: { ...options } })),
        ...[...pitchforks.values()].map(({ options }) => ({ kind: "PITCHFORK", options: { ...options } })),
        ...[...measurements.values()].map(({ options }) => ({ kind: "MEASURE", options: { ...options } })),
        ...[...riskRewards.values()].map(({ options }) => ({ kind: "RISK_REWARD", options: { ...options } }))
      ];
    }
    function exportLayout() {
      guard();
      if (!drawingScope) throw Error("Layout export requires symbol/timeframe scope");
      const serialized = JSON.stringify({
        schemaVersion: 2,
        symbol: drawingScope.symbol,
        timeframe: drawingScope.timeframe,
        drawings: drawingSnapshots(),
        view: viewSnapshots()
      });
      if (utf8ByteLength(serialized) > persistenceLimit) throw Error("Layout export exceeds size limit");
      return serialized;
    }
    function viewSnapshots() {
      const visibleRange = chart.timeScale().getVisibleLogicalRange();
      const persistentOscillators = [...oscillators.entries()].filter(([id]) => !transientOscillators.has(id));
      const persistentPaneLines = [...paneLines.entries()].map(([id, series]) => ({ id, series, paneIndex: chart.panes().findIndex((pane) => pane.getSeries().includes(series)) }));
      const volumePaneIndex = volume ? chart.panes().findIndex((pane) => pane.getSeries().includes(volume)) : -1;
      const retainedPaneIndices = /* @__PURE__ */ new Set([
        0,
        ...persistentOscillators.map(([, group]) => group.paneIndex),
        ...persistentPaneLines.map((item) => item.paneIndex),
        ...volumePaneIndex >= 1 ? [volumePaneIndex] : []
      ]);
      const orderedPaneIndices = [...retainedPaneIndices].filter((index) => Number.isInteger(index) && index >= 0 && index < chart.panes().length).sort((a2, b2) => a2 - b2);
      const portablePaneIndex = new Map(orderedPaneIndices.map((index, position) => [index, position]));
      const paneHeight = (index) => {
        const pane = chart.panes()[index], actual = pane ? Math.round(pane.getHeight()) : 0, override = paneHeightOverrides.get(index), derived = Math.round(host.clientHeight / (chart.panes().length || 1));
        return actual >= 80 && actual <= 600 ? actual : override && override >= 80 && override <= 600 ? override : Number.isFinite(derived) ? Math.min(600, Math.max(80, derived)) : 150;
      };
      return {
        movingAverages: [...managedMovingAverages.entries()].filter(([id]) => !transientMovingAverages.has(id)).map(([, value]) => ({ ...value.options })),
        sessionVwaps: [...sessionVwapOverlays.values()].map(({ options }) => ({ ...options })),
        supertrends: [...supertrendOverlays.values()].map((group) => ({ ...group.options })),
        parabolicSars: [...parabolicSarOverlays.values()].map((group) => ({ ...group.options })),
        oscillators: persistentOscillators.map(([, group]) => ({ options: { ...group.options, settings: { ...group.options.settings } }, paneIndex: portablePaneIndex.get(group.paneIndex) ?? 0 })),
        paneLines: persistentPaneLines.map(({ id, series, paneIndex }) => {
          const readout = readoutIndicators.get(id);
          return { options: { id, color: series.options().color, lineWidth: series.options().lineWidth, title: series.options().title, visible: series.options().visible }, data: readout ? [...readout.values].map(([time, value]) => ({ time, value })) : [], paneIndex: portablePaneIndex.get(paneIndex) ?? 0 };
        }),
        paneHeights: orderedPaneIndices.map(paneHeight),
        volumeVisible: !!volume,
        volumePaneIndex: volume && volumePaneIndex >= 0 ? portablePaneIndex.get(volumePaneIndex) ?? null : null,
        displayTimeZone,
        visibleRange: visibleRange ? { from: visibleRange.from, to: visibleRange.to } : null,
        chartType: pricePresentation
      };
    }
    function persistDrawings(protectedUndoEntries = 0) {
      if (!drawingScope || !drawingsHydrated || hydratingDrawings) return true;
      if (persistenceStatus === "CONFLICT" || persistenceStatus === "UNAVAILABLE") return false;
      const storage = localStorageApi(), key = persistenceKey();
      if (!storage || !key) {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "STORAGE_UNAVAILABLE";
        return false;
      }
      try {
        if (storage.getItem(key) !== lastPersistedSnapshot) {
          persistenceStatus = "CONFLICT";
          persistenceError = "EXTERNAL_CHANGE";
          return false;
        }
        const drawings = drawingSnapshots();
        const envelope = () => JSON.stringify({
          schemaVersion: 6,
          account: activeAccount,
          symbol: drawingScope.symbol,
          timeframe: drawingScope.timeframe,
          drawings,
          undoStack,
          redoStack,
          ...viewSnapshots()
        });
        let serialized = envelope();
        while (utf8ByteLength(serialized) > persistenceLimit && undoStack.length > protectedUndoEntries) {
          undoStack.shift();
          serialized = envelope();
        }
        while (utf8ByteLength(serialized) > persistenceLimit && redoStack.length) {
          redoStack.shift();
          serialized = envelope();
        }
        if (utf8ByteLength(serialized) > persistenceLimit) {
          persistenceStatus = "UNAVAILABLE";
          persistenceError = "SNAPSHOT_TOO_LARGE";
          return false;
        }
        storage.setItem(key, serialized);
        lastPersistedSnapshot = serialized;
        persistenceStatus = "READY";
        persistenceError = null;
        return true;
      } catch (_2) {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "STORAGE_WRITE_FAILED";
        return false;
      }
    }
    function verifyPersistence() {
      guard();
      if (!drawingScope || !drawingsHydrated || persistenceStatus !== "READY") return false;
      const storage = localStorageApi(), key = persistenceKey();
      if (!storage || !key) {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "STORAGE_UNAVAILABLE";
        return false;
      }
      try {
        if (storage.getItem(key) !== lastPersistedSnapshot) {
          persistenceStatus = "CONFLICT";
          persistenceError = "EXTERNAL_CHANGE";
          return false;
        }
        return true;
      } catch (_2) {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "STORAGE_READ_FAILED";
        return false;
      }
    }
    function hydrateDrawings() {
      if (!drawingScope) {
        drawingsHydrated = true;
        persistenceStatus = "DISABLED";
        return;
      }
      if (drawingsHydrated) return;
      drawingsHydrated = true;
      const storage = localStorageApi(), key = persistenceKey();
      if (!storage || !key) {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "STORAGE_UNAVAILABLE";
        return;
      }
      let raw, legacy = false, currentSnapshot = false;
      try {
        raw = storage.getItem(key);
        currentSnapshot = raw !== null;
        if (raw === null) {
          raw = storage.getItem(previousPersistenceKey());
          legacy = raw !== null;
        }
        if (raw === null) {
          raw = storage.getItem(legacyPersistenceKey());
          legacy = raw !== null;
        }
      } catch (_2) {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "STORAGE_READ_FAILED";
        return;
      }
      lastPersistedSnapshot = currentSnapshot ? raw : null;
      if (raw === null) {
        persistenceStatus = "READY";
        persistenceError = null;
        if (drawingCount()) persistDrawings();
        return;
      }
      if (utf8ByteLength(raw) > persistenceLimit) {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "SNAPSHOT_TOO_LARGE";
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (_2) {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "INVALID_SNAPSHOT";
        return;
      }
      if (!parsed || typeof parsed !== "object") {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "INVALID_SNAPSHOT";
        return;
      }
      const root = parsed;
      const schemaKeys = Object.keys(root).sort().join(",");
      if (!root || Array.isArray(parsed) || !(/* @__PURE__ */ new Set(["account,drawings,schemaVersion,symbol,timeframe", "account,drawings,redoStack,schemaVersion,symbol,timeframe,undoStack", "account,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,redoStack,schemaVersion,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible", "account,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,redoStack,schemaVersion,supertrends,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible", "account,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,parabolicSars,redoStack,schemaVersion,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible", "account,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,parabolicSars,redoStack,schemaVersion,supertrends,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible", "account,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,parabolicSars,redoStack,schemaVersion,sessionVwaps,supertrends,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible", "account,chartType,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,parabolicSars,redoStack,schemaVersion,sessionVwaps,supertrends,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible"])).has(schemaKeys) || root.schemaVersion !== 1 && root.schemaVersion !== 2 && root.schemaVersion !== 3 && root.schemaVersion !== 4 && root.schemaVersion !== 5 && root.schemaVersion !== 6 || ("supertrends" in root || "parabolicSars" in root) && root.schemaVersion < 3 || "sessionVwaps" in root && root.schemaVersion < 4 || root.account !== activeAccount || root.symbol !== drawingScope.symbol || root.timeframe !== drawingScope.timeframe || !Array.isArray(root.drawings) || root.drawings.length > maxNativeDrawings) {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "INVALID_OR_MISMATCHED_SNAPSHOT";
        return;
      }
      const isV2 = root.schemaVersion >= 2, isV3 = root.schemaVersion >= 3, isV4 = root.schemaVersion >= 4, isCurrentSnapshot = root.schemaVersion === 6;
      const restoredUndo = [], restoredRedo = [];
      let restoredAverages = [], restoredOscillators = [], restoredPaneLines = [], restoredSupertrends = [], restoredParabolicSars = [], restoredSessionVwaps = [], restoredPaneHeights = [], restoredVolume = false, restoredVolumePane = null, restoredTimeZone = "UTC", restoredRange = null, restoredChartType = pricePresentation;
      if (isV3) {
        try {
          if (!Array.isArray(root.movingAverages) || root.movingAverages.length > 16 || !Array.isArray(root.oscillators) || root.oscillators.length > 8 || !Array.isArray(root.paneLines) || root.paneLines.length > 8 || root.supertrends !== void 0 && (!Array.isArray(root.supertrends) || root.supertrends.length > maxIndicatorInstances) || root.parabolicSars !== void 0 && (!Array.isArray(root.parabolicSars) || root.parabolicSars.length > maxIndicatorInstances) || !Array.isArray(root.paneHeights) || root.paneHeights.length < 1 || root.paneHeights.length > 10 || typeof root.volumeVisible !== "boolean" || root.volumePaneIndex !== null && (!Number.isInteger(root.volumePaneIndex) || Number(root.volumePaneIndex) < 1 || Number(root.volumePaneIndex) >= root.paneHeights.length) || root.volumeVisible !== (root.volumePaneIndex !== null) || typeof root.displayTimeZone !== "string" || root.schemaVersion === 6 && !pricePresentationTypes.includes(root.chartType)) throw Error();
          const savedPaneHeights = root.paneHeights;
          restoredAverages = root.movingAverages.map((raw2) => {
            if (!raw2 || typeof raw2 !== "object" || Array.isArray(raw2)) throw Error();
            const options = raw2;
            const keys = Object.keys(options).sort().join(","), allowed = /* @__PURE__ */ new Set(["color,displayShift,id,period,source,type", "color,displayShift,id,lineWidth,period,source,type", "color,displayShift,id,period,source,type,visible", "color,displayShift,id,lineWidth,period,source,type,visible", "color,displayShift,id,period,source,title,type", "color,displayShift,id,lineWidth,period,source,title,type", "color,displayShift,id,period,source,title,type,visible", "color,displayShift,id,lineWidth,period,source,title,type,visible", "color,id,period,source,type", "color,id,lineWidth,period,source,type", "color,id,period,source,type,visible", "color,id,lineWidth,period,source,type,visible", "color,id,period,type", "color,id,lineWidth,period,type", "color,id,period,type,visible", "color,id,lineWidth,period,type,visible"]);
            if (!allowed.has(keys) || typeof options.id !== "string" || !/^[-_a-zA-Z0-9]{1,32}$/.test(options.id) || typeof options.color !== "string" || !colorPattern.test(options.color) || options.lineWidth !== void 0 && ![1, 2, 3, 4].includes(options.lineWidth) || options.visible !== void 0 && typeof options.visible !== "boolean" || options.title !== void 0 && (typeof options.title !== "string" || options.title.length > 80 || /[\u0000-\u001f\u007f]/.test(options.title))) throw Error();
            const value = { ...options, source: options.source ?? "close", displayShift: options.displayShift ?? 0 };
            movingAverageData(bars, value);
            return value;
          });
          restoredOscillators = root.oscillators.map((raw2) => {
            if (!raw2 || typeof raw2 !== "object" || Array.isArray(raw2)) throw Error();
            const entry = raw2;
            if (Object.keys(entry).sort().join(",") !== "options,paneIndex" || !entry.options || typeof entry.options !== "object" || Array.isArray(entry.options) || !Number.isInteger(entry.paneIndex)) throw Error();
            const options = entry.options, keys = Object.keys(options).sort().join(","), allowed = /* @__PURE__ */ new Set(["color,id,kind,settings", "color,id,kind,lineWidth,settings", "color,id,kind,settings,title", "color,id,kind,lineWidth,settings,title", "color,id,kind,settings,visible", "color,id,kind,lineWidth,settings,visible", "color,id,kind,settings,title,visible", "color,id,kind,lineWidth,settings,title,visible"]);
            if (!allowed.has(keys) || typeof options.id !== "string" || !/^[-_a-zA-Z0-9]{1,32}$/.test(options.id) || typeof options.color !== "string" || !colorPattern.test(options.color) || !["rsi", "atr", "macd", "adx", "stochastic", "stochrsi", "cci", "momentum", "roc", "obv", "mfi"].includes(options.kind) || options.lineWidth !== void 0 && ![1, 2, 3, 4].includes(options.lineWidth) || options.visible !== void 0 && typeof options.visible !== "boolean" || options.title !== void 0 && (typeof options.title !== "string" || options.title.length > 80 || /[\u0000-\u001f\u007f]/.test(options.title)) || !Number.isInteger(entry.paneIndex) || Number(entry.paneIndex) < 1 || Number(entry.paneIndex) >= savedPaneHeights.length) throw Error();
            const oscillatorOptions2 = options;
            calculateOscillator(bars, oscillatorOptions2.kind, oscillatorOptions2.settings);
            return { options: { ...oscillatorOptions2, settings: { ...oscillatorOptions2.settings } }, paneIndex: Number(entry.paneIndex) };
          });
          restoredPaneLines = root.paneLines.map((raw2) => {
            if (!raw2 || typeof raw2 !== "object" || Array.isArray(raw2)) throw Error();
            const entry = raw2;
            if (Object.keys(entry).sort().join(",") !== "data,options,paneIndex" || !entry.options || typeof entry.options !== "object" || Array.isArray(entry.options) || !Array.isArray(entry.data) || entry.data.length > 15e4 || !Number.isInteger(entry.paneIndex)) throw Error();
            const options = entry.options, keys = Object.keys(options).sort().join(","), allowed = /* @__PURE__ */ new Set(["color,id", "color,id,lineWidth", "color,id,title", "color,id,visible", "color,id,lineWidth,title", "color,id,lineWidth,visible", "color,id,title,visible", "color,id,lineWidth,title,visible"]);
            if (!allowed.has(keys) || typeof options.id !== "string" || !/^[-_a-zA-Z0-9]{1,32}$/.test(options.id) || typeof options.color !== "string" || !colorPattern.test(options.color) || options.lineWidth !== void 0 && ![1, 2, 3, 4].includes(options.lineWidth) || options.visible !== void 0 && typeof options.visible !== "boolean" || options.title !== void 0 && (typeof options.title !== "string" || options.title.length > 80 || /[\u0000-\u001f\u007f]/.test(options.title)) || !Number.isInteger(entry.paneIndex) || Number(entry.paneIndex) < 1 || Number(entry.paneIndex) >= savedPaneHeights.length) throw Error();
            return { options, data: validSeriesData(entry.data), paneIndex: Number(entry.paneIndex) };
          });
          restoredSupertrends = (root.supertrends ?? []).map((raw2) => {
            if (!raw2 || typeof raw2 !== "object" || Array.isArray(raw2)) throw Error();
            const options = raw2;
            const keys = Object.keys(options).sort().join(","), allowed = /* @__PURE__ */ new Set(["color,id,multiplier,period", "color,id,lineWidth,multiplier,period", "color,id,multiplier,period,title", "color,id,lineWidth,multiplier,period,title", "color,id,multiplier,period,visible", "color,id,lineWidth,multiplier,period,visible", "color,id,multiplier,period,title,visible", "color,id,lineWidth,multiplier,period,title,visible"]);
            if (!allowed.has(keys) || !validSupertrendConfiguration(options)) throw Error();
            return { ...options };
          });
          restoredParabolicSars = (root.parabolicSars ?? []).map((raw2) => {
            if (!raw2 || typeof raw2 !== "object" || Array.isArray(raw2)) throw Error();
            const options = raw2;
            const keys = Object.keys(options).sort().join(","), allowed = /* @__PURE__ */ new Set(["color,id,maxStep,step", "color,id,lineWidth,maxStep,step", "color,id,maxStep,step,title", "color,id,lineWidth,maxStep,step,title", "color,id,maxStep,step,visible", "color,id,lineWidth,maxStep,step,visible", "color,id,maxStep,step,title,visible", "color,id,lineWidth,maxStep,step,title,visible"]);
            if (!allowed.has(keys) || !validParabolicSar(options)) throw Error();
            return { ...options };
          });
          if (isV4 && (!Array.isArray(root.sessionVwaps) || root.sessionVwaps.length > maxIndicatorInstances)) throw Error();
          restoredSessionVwaps = (root.sessionVwaps ?? []).map((raw2) => {
            if (!raw2 || typeof raw2 !== "object" || Array.isArray(raw2)) throw Error();
            const options = raw2;
            const normalized = { ...options, timeZone: options.timeZone ?? "UTC", sessionStart: options.sessionStart ?? "00:00", visible: options.visible ?? true };
            if (!validSessionVwapOptions(normalized)) throw Error();
            calculateSessionVwap(bars, normalized);
            return { ...normalized };
          });
          const restoredIds = [...restoredAverages.map((item) => item.id), ...restoredOscillators.map((item) => item.options.id), ...restoredPaneLines.map((item) => item.options.id), ...restoredSupertrends.map((item) => item.id), ...restoredParabolicSars.map((item) => item.id), ...restoredSessionVwaps.map((item) => item.id)];
          if (restoredIds.length > maxIndicatorInstances || new Set(restoredIds).size !== restoredIds.length) throw Error();
          restoredPaneHeights = savedPaneHeights.map((value) => {
            if (!Number.isInteger(value) || Number(value) < 80 || Number(value) > 600) throw Error();
            return Number(value);
          });
          if (root.schemaVersion === 6) restoredChartType = root.chartType;
          if (root.volumePaneIndex !== null) restoredVolumePane = Number(root.volumePaneIndex);
          restoredVolume = root.volumeVisible;
          const zone = root.displayTimeZone;
          const canonical = new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
          if (canonical !== zone) throw Error();
          restoredTimeZone = canonical;
          if (root.visibleRange !== null) {
            if (!root.visibleRange || typeof root.visibleRange !== "object" || Array.isArray(root.visibleRange) || Object.keys(root.visibleRange).sort().join(",") !== "from,to") throw Error();
            const range = root.visibleRange;
            if (typeof range.from !== "number" || !Number.isFinite(range.from) || Math.abs(range.from) > 1e6 || typeof range.to !== "number" || !Number.isFinite(range.to) || Math.abs(range.to) > 1e6 || range.from >= range.to) throw Error();
            restoredRange = { from: range.from, to: range.to };
          }
        } catch (_2) {
          persistenceStatus = "UNAVAILABLE";
          persistenceError = "INVALID_VIEW_STATE";
          return;
        }
      }
      const parseSnapshot = (raw2, expectedId) => {
        if (raw2 === null) return null;
        if (!raw2 || typeof raw2 !== "object" || Array.isArray(raw2)) throw Error();
        const row = raw2;
        if (Object.keys(row).sort().join(",") !== "kind,options" || !row.options || typeof row.options !== "object" || Array.isArray(row.options)) throw Error();
        const options = row.options, kind = row.kind;
        const keys = Object.keys(options).sort().join(",");
        const expected = kind === "PRICE" ? "color,id,locked,price,visible" : kind === "TIME" ? "color,id,locked,time,visible" : kind === "TEXT" ? "color,id,locked,price,text,time,visible" : kind === "TREND" || kind === "RAY" || kind === "MEASURE" || kind === "ELLIPSE" ? "color,endPrice,endTime,id,locked,startPrice,startTime,visible" : kind === "RECT" ? "color,endPrice,endTime,fill,id,locked,startPrice,startTime,visible" : kind === "CHANNEL" ? "color,endPrice,endTime,id,locked,offsetPrice,offsetTime,startPrice,startTime,visible" : kind === "PITCHFORK" ? "color,endPrice,endTime,id,locked,startPrice,startTime,thirdPrice,thirdTime,visible" : kind === "RISK_REWARD" ? "endTime,entryPrice,id,locked,startTime,stopPrice,stopTime,targetPrice,visible" : kind === "FIB_TIME" ? "color,endTime,id,locked,startTime,visible" : kind === "FIB_FAN" ? "color,endPrice,endTime,id,locked,ratios,startPrice,startTime,visible" : kind === "FIB_TREND" ? "color,endPrice,endTime,id,locked,ratios,startPrice,startTime,thirdPrice,thirdTime,visible" : kind === "FIBO" ? (/* @__PURE__ */ new Set(["color,endPrice,endTime,id,locked,startPrice,startTime,visible", "color,endPrice,endTime,id,levels,locked,startPrice,startTime,visible"])).has(keys) : kind === "ELLIPSE" ? "color,endPrice,endTime,id,locked,startPrice,startTime,visible" : "";
        if (!expected || kind !== "FIBO" && keys !== expected || options.id !== expectedId || averages.has(expectedId) || paneLines.has(expectedId)) throw Error();
        if (kind === "PRICE") {
          const value2 = options;
          validatePriceLevel(value2);
          return { kind, options: { ...value2 } };
        }
        if (kind === "TIME") {
          const value2 = options;
          validateTimeMarker(value2, false);
          return { kind, options: { ...value2 } };
        }
        if (kind === "TEXT") {
          const value2 = options;
          validateTextAnnotation(value2, false);
          return { kind, options: { ...value2 } };
        }
        if (kind === "TREND") {
          const value2 = options;
          validateTrendLine(value2, false);
          return { kind, options: { ...value2 } };
        }
        if (kind === "RECT") {
          const value2 = options;
          validateRectangle(value2, false);
          return { kind, options: { ...value2 } };
        }
        if (kind === "ELLIPSE") {
          const value2 = options;
          validateTrendLine(value2, false);
          if (value2.startTime === value2.endTime || value2.startPrice === value2.endPrice) throw Error();
          return { kind, options: { ...value2 } };
        }
        if (kind === "RAY") {
          const value2 = options;
          validateTrendLine(value2, false);
          return { kind, options: { ...value2 } };
        }
        if (kind === "CHANNEL") {
          const value2 = options;
          validateChannel(value2, false);
          return { kind, options: { ...value2 } };
        }
        if (kind === "PITCHFORK") {
          const value2 = options;
          validatePitchfork(value2);
          return { kind, options: { ...value2 } };
        }
        if (kind === "RISK_REWARD") {
          const value2 = options;
          validateRiskReward(value2, false);
          return { kind, options: { ...value2 } };
        }
        if (kind === "MEASURE") {
          const value2 = options;
          validateTrendLine(value2, false);
          return { kind, options: { ...value2 } };
        }
        if (kind === "FIB_TIME") {
          const value2 = options;
          validateFibonacciTimeZone(value2, false);
          return { kind, options: { ...value2 } };
        }
        if (kind === "FIB_FAN") {
          const value2 = normalizeFibonacciFanOptions(options, false);
          return { kind, options: { ...value2 } };
        }
        if (kind === "FIB_TREND") {
          const value2 = normalizeTrendBasedFibonacciOptions(options, false);
          return { kind, options: { ...value2 } };
        }
        const value = normalizeFibonacciOptions(options, false);
        return { kind: "FIBO", options: { ...value } };
      };
      const parseHistory = (raw2, out) => {
        if (!Array.isArray(raw2) || raw2.length > historyLimit) throw Error("history array invalid");
        for (const item of raw2) {
          if (!item || typeof item !== "object" || Array.isArray(item)) throw Error("history item invalid");
          const entry = item;
          if (Object.keys(entry).sort().join(",") !== "after,before,id" || typeof entry.id !== "string" || !/^[-_a-zA-Z0-9]{1,32}$/.test(entry.id)) throw Error();
          const before = parseSnapshot(entry.before, entry.id), after = parseSnapshot(entry.after, entry.id);
          if (before === null && after === null || before && after && before.kind !== after.kind) throw Error();
          out.push({ id: entry.id, before, after });
        }
      };
      if (isV2) {
        try {
          parseHistory(root.undoStack, restoredUndo);
          parseHistory(root.redoStack, restoredRedo);
          if (restoredUndo.length + restoredRedo.length > historyLimit) throw Error(`history total ${restoredUndo.length}+${restoredRedo.length}`);
        } catch (_2) {
          persistenceStatus = "UNAVAILABLE";
          persistenceError = "INVALID_OR_UNAVAILABLE_DRAWING";
          return;
        }
      }
      if (drawingCount()) {
        persistenceStatus = "CONFLICT";
        persistenceError = "DRAWINGS_ALREADY_PRESENT";
        return;
      }
      const seen = /* @__PURE__ */ new Set(), snapshots = [];
      try {
        for (const entry of root.drawings) {
          if (!entry || typeof entry !== "object") throw Error();
          const row = entry;
          if (!row.options || typeof row.options !== "object") throw Error();
          const options = row.options;
          if (isV2) {
            if (Array.isArray(entry) || Object.keys(entry).sort().join(",") !== "kind,options" || Array.isArray(row.options)) throw Error();
            const keys = Object.keys(options).sort().join(","), kind = row.kind;
            const expected = kind === "PRICE" ? "color,id,locked,price,visible" : kind === "TIME" ? "color,id,locked,time,visible" : kind === "TEXT" ? "color,id,locked,price,text,time,visible" : kind === "TREND" || kind === "RAY" || kind === "MEASURE" || kind === "ELLIPSE" ? "color,endPrice,endTime,id,locked,startPrice,startTime,visible" : kind === "RECT" ? "color,endPrice,endTime,fill,id,locked,startPrice,startTime,visible" : kind === "CHANNEL" ? "color,endPrice,endTime,id,locked,offsetPrice,offsetTime,startPrice,startTime,visible" : kind === "PITCHFORK" ? "color,endPrice,endTime,id,locked,startPrice,startTime,thirdPrice,thirdTime,visible" : kind === "RISK_REWARD" ? "endTime,entryPrice,id,locked,startTime,stopPrice,stopTime,targetPrice,visible" : kind === "FIB_TIME" ? "color,endTime,id,locked,startTime,visible" : kind === "FIB_FAN" ? "color,endPrice,endTime,id,locked,ratios,startPrice,startTime,visible" : kind === "FIB_TREND" ? "color,endPrice,endTime,id,locked,ratios,startPrice,startTime,thirdPrice,thirdTime,visible" : kind === "FIBO" ? (/* @__PURE__ */ new Set(["color,endPrice,endTime,id,locked,startPrice,startTime,visible", "color,endPrice,endTime,id,levels,locked,startPrice,startTime,visible"])).has(keys) : kind === "ELLIPSE" ? "color,endPrice,endTime,id,locked,startPrice,startTime,visible" : "";
            if (!expected || kind !== "FIBO" && keys !== expected) throw Error();
          }
          if (typeof options.id !== "string" || seen.has(options.id) || averages.has(options.id) || paneLines.has(options.id)) throw Error();
          seen.add(options.id);
          if (row.kind === "PRICE") {
            const normalized = { id: options.id, price: options.price, color: options.color, visible: options.visible, locked: options.locked };
            validatePriceLevel(normalized);
            snapshots.push({ kind: "PRICE", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "TIME") {
            const normalized = { id: options.id, time: options.time, color: options.color, visible: options.visible, locked: options.locked };
            validateTimeMarker(normalized, false);
            snapshots.push({ kind: "TIME", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "TEXT") {
            const normalized = { id: options.id, time: options.time, price: options.price, text: options.text, color: options.color, visible: options.visible, locked: options.locked };
            validateTextAnnotation(normalized, false);
            snapshots.push({ kind: "TEXT", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "TREND") {
            const normalized = { id: options.id, startTime: options.startTime, startPrice: options.startPrice, endTime: options.endTime, endPrice: options.endPrice, color: options.color, visible: options.visible, locked: options.locked };
            validateTrendLine(normalized, false);
            snapshots.push({ kind: "TREND", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "ELLIPSE") {
            const normalized = { id: options.id, startTime: options.startTime, startPrice: options.startPrice, endTime: options.endTime, endPrice: options.endPrice, color: options.color, visible: options.visible, locked: options.locked };
            validateTrendLine(normalized, false);
            if (normalized.startTime === normalized.endTime || normalized.startPrice === normalized.endPrice) throw Error();
            snapshots.push({ kind: "ELLIPSE", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "RECT") {
            const normalized = { id: options.id, startTime: options.startTime, startPrice: options.startPrice, endTime: options.endTime, endPrice: options.endPrice, color: options.color, fill: options.fill, visible: options.visible, locked: options.locked };
            validateRectangle(normalized, false);
            snapshots.push({ kind: "RECT", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "RAY") {
            const normalized = { id: options.id, startTime: options.startTime, startPrice: options.startPrice, endTime: options.endTime, endPrice: options.endPrice, color: options.color, visible: options.visible, locked: options.locked };
            validateTrendLine(normalized, false);
            snapshots.push({ kind: "RAY", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "CHANNEL") {
            const normalized = { id: options.id, startTime: options.startTime, startPrice: options.startPrice, endTime: options.endTime, endPrice: options.endPrice, offsetTime: options.offsetTime, offsetPrice: options.offsetPrice, color: options.color, visible: options.visible, locked: options.locked };
            validateChannel(normalized, false);
            snapshots.push({ kind: "CHANNEL", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "PITCHFORK") {
            const normalized = { id: options.id, startTime: options.startTime, startPrice: options.startPrice, endTime: options.endTime, endPrice: options.endPrice, thirdTime: options.thirdTime, thirdPrice: options.thirdPrice, color: options.color, visible: options.visible, locked: options.locked };
            validatePitchfork(normalized);
            snapshots.push({ kind: "PITCHFORK", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "RISK_REWARD") {
            const normalized = { id: options.id, startTime: options.startTime, entryPrice: options.entryPrice, stopTime: options.stopTime, stopPrice: options.stopPrice, endTime: options.endTime, targetPrice: options.targetPrice, visible: options.visible, locked: options.locked };
            validateRiskReward(normalized, false);
            snapshots.push({ kind: "RISK_REWARD", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "MEASURE") {
            const normalized = options;
            validateTrendLine(normalized);
            snapshots.push({ kind: "MEASURE", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "FIB_FAN") {
            const normalized = normalizeFibonacciFanOptions(options, false);
            snapshots.push({ kind: "FIB_FAN", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "FIB_TREND") {
            const normalized = normalizeTrendBasedFibonacciOptions(options, false);
            snapshots.push({ kind: "FIB_TREND", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "FIB_TIME") {
            const normalized = options;
            validateFibonacciTimeZone(normalized, false);
            snapshots.push({ kind: "FIB_TIME", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
          } else if (row.kind === "FIBO") {
            const normalized = { id: options.id, startTime: options.startTime, startPrice: options.startPrice, endTime: options.endTime, endPrice: options.endPrice, color: options.color, levels: options.levels, visible: options.visible, locked: options.locked };
            const validated = normalizeFibonacciOptions(normalized, false);
            if (options.levels === void 0) delete validated.levels;
            snapshots.push({ kind: "FIBO", options: { ...validated, visible: validated.visible ?? true, locked: validated.locked ?? false } });
          } else throw Error();
        }
      } catch (_2) {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "INVALID_OR_UNAVAILABLE_DRAWING";
        return;
      }
      if (isV3) {
        const drawingIds = snapshots.map((snapshot) => snapshot.options.id), indicatorIds = [...restoredAverages.map((item) => item.id), ...restoredOscillators.map((item) => item.options.id), ...restoredSupertrends.map((item) => item.id), ...restoredParabolicSars.map((item) => item.id), ...restoredSessionVwaps.map((item) => item.id)];
        const paneIds = /* @__PURE__ */ new Set([...restoredOscillators.map((item) => item.paneIndex), ...restoredPaneLines.map((item) => item.paneIndex), ...restoredVolumePane === null ? [] : [restoredVolumePane]]);
        if ((/* @__PURE__ */ new Set([...drawingIds, ...indicatorIds])).size !== drawingIds.length + indicatorIds.length || paneIds.size !== restoredPaneHeights.length - 1 || Array.from({ length: restoredPaneHeights.length - 1 }, (_2, i) => i + 1).some((index) => !paneIds.has(index)) || restoredAverages.length + restoredOscillators.length + restoredPaneLines.length + restoredSupertrends.length + restoredParabolicSars.length + restoredSessionVwaps.length > 0 && (averages.size > 0 || managedMovingAverages.size > 0 || oscillators.size > 0 || paneLines.size > 0 || donchianOverlays.size > 0 || keltnerOverlays.size + atrBandsOverlays.size > 0 || linearRegressionOverlays.size > 0 || supertrendOverlays.size > 0 || parabolicSarOverlays.size > 0 || sessionVwapOverlays.size > 0)) {
          persistenceStatus = "CONFLICT";
          persistenceError = "VIEW_ALREADY_PRESENT";
          return;
        }
      }
      hydratingDrawings = true;
      try {
        for (const snapshot of snapshots) {
          if (snapshot.kind === "PRICE") addPriceLevel(snapshot.options);
          else if (snapshot.kind === "TIME") addTimeMarker(snapshot.options, false);
          else if (snapshot.kind === "TEXT") addTextAnnotation(snapshot.options, false);
          else if (snapshot.kind === "TREND") addTrendLine(snapshot.options, false);
          else if (snapshot.kind === "RECT") addRectangle(snapshot.options, false);
          else if (snapshot.kind === "RAY") addRay(snapshot.options, false);
          else if (snapshot.kind === "CHANNEL") addChannel(snapshot.options, false);
          else if (snapshot.kind === "PITCHFORK") addPitchfork(snapshot.options);
          else if (snapshot.kind === "RISK_REWARD") addRiskReward(snapshot.options);
          else if (snapshot.kind === "MEASURE") addMeasurement(snapshot.options);
          else if (snapshot.kind === "FIB_TIME") addFibonacciTimeZone(snapshot.options, false);
          else if (snapshot.kind === "FIB_FAN") addFibonacciFan(snapshot.options, false);
          else if (snapshot.kind === "FIB_TREND") addTrendBasedFibonacci(snapshot.options, false);
          else addFibonacci(snapshot.options, false);
        }
        if (isV3) {
          for (const options of restoredAverages) addMovingAverage(options);
          for (const item of restoredOscillators) addOscillator(item.options);
          for (const options of restoredSupertrends) addSupertrend(options);
          for (const options of restoredParabolicSars) addParabolicSar(options);
          for (const options of restoredSessionVwaps) addSessionVwap(options);
          for (const item of restoredPaneLines) {
            addPaneLine(item.options, item.data);
            const series = paneLines.get(item.options.id);
            series.moveToPane(item.paneIndex);
          }
          if (restoredVolume) showVolume(true);
          for (const item of restoredOscillators) if (oscillators.get(item.options.id)?.paneIndex !== item.paneIndex) moveOscillator(item.options.id, item.paneIndex);
          if (restoredVolume && volume && restoredVolumePane !== null) {
            const current = chart.panes().findIndex((pane) => pane.getSeries().includes(volume));
            if (current !== restoredVolumePane) volume.moveToPane(restoredVolumePane);
          }
          if (chart.panes().length !== restoredPaneHeights.length) throw Error();
          for (let index = 1; index < restoredPaneHeights.length; index++) {
            chart.panes()[index].setHeight(restoredPaneHeights[index]);
            paneHeightOverrides.set(index, restoredPaneHeights[index]);
          }
          setDisplayTimeZone(restoredTimeZone);
          if (restoredRange) setVisibleLogicalRange(restoredRange);
          if (root.schemaVersion === 6) {
            pricePresentation = restoredChartType;
            syncPresentationSeries();
            const storage2 = localStorageApi(), key2 = chartTypeStorageKey();
            if (storage2 && key2) storage2.setItem(key2, restoredChartType);
          }
        }
        undoStack.splice(0, undoStack.length, ...restoredUndo);
        redoStack.splice(0, redoStack.length, ...restoredRedo);
        persistenceStatus = "READY";
        persistenceError = null;
      } catch (_2) {
        for (const item of priceLevels.values()) price.detachPrimitive(item.primitive);
        priceLevels.clear();
        for (const item of timeMarkers.values()) price.detachPrimitive(item.primitive);
        timeMarkers.clear();
        for (const item of textAnnotations.values()) price.detachPrimitive(item.primitive);
        textAnnotations.clear();
        for (const item of trendLines.values()) price.detachPrimitive(item.primitive);
        trendLines.clear();
        for (const item of rectangles.values()) price.detachPrimitive(item.primitive);
        rectangles.clear();
        for (const item of ellipses.values()) price.detachPrimitive(item.primitive);
        ellipses.clear();
        for (const item of rays.values()) price.detachPrimitive(item.primitive);
        rays.clear();
        for (const item of fibonacci.values()) price.detachPrimitive(item.primitive);
        fibonacci.clear();
        for (const item of fibonacciFans.values()) price.detachPrimitive(item.primitive);
        fibonacciFans.clear();
        for (const item of trendBasedFibonaccis.values()) price.detachPrimitive(item.primitive);
        trendBasedFibonaccis.clear();
        for (const item of channels.values()) price.detachPrimitive(item.primitive);
        channels.clear();
        for (const item of pitchforks.values()) price.detachPrimitive(item.primitive);
        pitchforks.clear();
        for (const item of measurements.values()) price.detachPrimitive(item.primitive);
        measurements.clear();
        for (const item of riskRewards.values()) price.detachPrimitive(item.primitive);
        riskRewards.clear();
        for (const item of averages.values()) chart.removeSeries(item);
        averages.clear();
        managedMovingAverages.clear();
        transientMovingAverages.clear();
        for (const group of oscillators.values()) for (const series of group.series.values()) chart.removeSeries(series);
        oscillators.clear();
        transientOscillators.clear();
        readoutIndicators.clear();
        for (const group of supertrendOverlays.values()) {
          chart.removeSeries(group.up);
          chart.removeSeries(group.down);
        }
        supertrendOverlays.clear();
        for (const group of parabolicSarOverlays.values()) {
          chart.removeSeries(group.up);
          chart.removeSeries(group.down);
        }
        parabolicSarOverlays.clear();
        for (const group of sessionVwapOverlays.values()) chart.removeSeries(group.series);
        sessionVwapOverlays.clear();
        for (const series of paneLines.values()) chart.removeSeries(series);
        paneLines.clear();
        if (volume) {
          chart.removeSeries(volume);
          volume = null;
        }
        undoStack.length = 0;
        redoStack.length = 0;
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "RESTORE_FAILED";
      } finally {
        hydratingDrawings = false;
      }
      if (!isCurrentSnapshot || legacy) persistDrawings();
    }
    function selectDrawing(id) {
      selectDrawings(id === null ? [] : [id]);
    }
    function markDrawingSelected(id, selected) {
      trendBasedFibonaccis.get(id)?.primitive.setSelected(selected);
      priceLevels.get(id)?.primitive.setSelected(selected);
      timeMarkers.get(id)?.primitive.setSelected(selected);
      textAnnotations.get(id)?.primitive.setSelected(selected);
      trendLines.get(id)?.primitive.setSelected(selected);
      rectangles.get(id)?.primitive.setSelected(selected);
      ellipses.get(id)?.primitive.setSelected(selected);
      rays.get(id)?.primitive.setSelected(selected);
      fibonacci.get(id)?.primitive.setSelected(selected);
      fibonacciFans.get(id)?.primitive.setSelected(selected);
      fibonacciTimeZones.get(id)?.primitive.setSelected(selected);
      channels.get(id)?.primitive.setSelected(selected);
      pitchforks.get(id)?.primitive.setSelected(selected);
      measurements.get(id)?.primitive.setSelected(selected);
      riskRewards.get(id)?.primitive.setSelected(selected);
    }
    function selectDrawings(ids) {
      guard();
      if (!Array.isArray(ids) || ids.length > maxNativeDrawings || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !snapshotDrawing(id))) throw Error("Unknown or invalid drawing selection");
      for (const id of selectedDrawingIds) markDrawingSelected(id, false);
      selectedDrawingIds.clear();
      for (const id of ids) {
        selectedDrawingIds.add(id);
        markDrawingSelected(id, true);
      }
      selectedDrawingId = ids[0] ?? null;
      return [...selectedDrawingIds];
    }
    function toggleDrawingSelection(id) {
      guard();
      if (typeof id !== "string" || !snapshotDrawing(id)) throw Error("Unknown drawing selection");
      const next = new Set(selectedDrawingIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return selectDrawings([...next]);
    }
    function snapshotDrawing(id) {
      const priceLevel = priceLevels.get(id);
      if (priceLevel) return { kind: "PRICE", options: { ...priceLevel.options } };
      const timeMarker = timeMarkers.get(id);
      if (timeMarker) return { kind: "TIME", options: { ...timeMarker.options } };
      const textAnnotation = textAnnotations.get(id);
      if (textAnnotation) return { kind: "TEXT", options: { ...textAnnotation.options } };
      const trendLine = trendLines.get(id);
      if (trendLine) return { kind: "TREND", options: { ...trendLine.options } };
      const rectangle = rectangles.get(id);
      if (rectangle) return { kind: "RECT", options: { ...rectangle.options } };
      const ellipse = ellipses.get(id);
      if (ellipse) return { kind: "ELLIPSE", options: { ...ellipse.options } };
      const ray = rays.get(id);
      if (ray) return { kind: "RAY", options: { ...ray.options } };
      const fibo = fibonacci.get(id);
      if (fibo) {
        const options = { ...fibo.options };
        if (options.levels) options.levels = [...options.levels];
        else delete options.levels;
        return { kind: "FIBO", options };
      }
      const fibFan = fibonacciFans.get(id);
      if (fibFan) return { kind: "FIB_FAN", options: { ...fibFan.options, ratios: [...fibonacciFanRatios(fibFan.options)] } };
      const fibTrend = trendBasedFibonaccis.get(id);
      if (fibTrend) return { kind: "FIB_TREND", options: { ...fibTrend.options, ratios: [...trendFibRatios(fibTrend.options)] } };
      const fibTime = fibonacciTimeZones.get(id);
      if (fibTime) return { kind: "FIB_TIME", options: { ...fibTime.options } };
      const channel = channels.get(id);
      if (channel) return { kind: "CHANNEL", options: { ...channel.options } };
      const pitchfork = pitchforks.get(id);
      if (pitchfork) return { kind: "PITCHFORK", options: { ...pitchfork.options } };
      const measurement = measurements.get(id);
      if (measurement) return { kind: "MEASURE", options: { ...measurement.options } };
      const riskReward = riskRewards.get(id);
      if (riskReward) return { kind: "RISK_REWARD", options: { ...riskReward.options } };
      return null;
    }
    function recordDrawingChange(id, before, after) {
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      undoStack.push({ id, before, after });
      if (undoStack.length > historyLimit) undoStack.shift();
      redoStack.length = 0;
      persistDrawings();
    }
    function restoreDrawing(id, snapshot) {
      if (snapshot && (averages.has(id) || paneLines.has(id))) return false;
      const wasSelected = selectedDrawingId === id;
      if (wasSelected) selectDrawing(null);
      const oldPrice = priceLevels.get(id);
      if (oldPrice) {
        price.detachPrimitive(oldPrice.primitive);
        priceLevels.delete(id);
      }
      const oldTime = timeMarkers.get(id);
      if (oldTime) {
        price.detachPrimitive(oldTime.primitive);
        timeMarkers.delete(id);
      }
      const oldText = textAnnotations.get(id);
      if (oldText) {
        price.detachPrimitive(oldText.primitive);
        textAnnotations.delete(id);
      }
      const oldTrend = trendLines.get(id);
      if (oldTrend) {
        price.detachPrimitive(oldTrend.primitive);
        trendLines.delete(id);
      }
      const oldRect = rectangles.get(id);
      if (oldRect) {
        price.detachPrimitive(oldRect.primitive);
        rectangles.delete(id);
      }
      const oldEllipse = ellipses.get(id);
      if (oldEllipse) {
        price.detachPrimitive(oldEllipse.primitive);
        ellipses.delete(id);
      }
      const oldRay = rays.get(id);
      if (oldRay) {
        price.detachPrimitive(oldRay.primitive);
        rays.delete(id);
      }
      const oldFibo = fibonacci.get(id);
      if (oldFibo) {
        price.detachPrimitive(oldFibo.primitive);
        fibonacci.delete(id);
      }
      const oldFibFan = fibonacciFans.get(id);
      if (oldFibFan) {
        price.detachPrimitive(oldFibFan.primitive);
        fibonacciFans.delete(id);
      }
      const oldFibTrend = trendBasedFibonaccis.get(id);
      if (oldFibTrend) {
        price.detachPrimitive(oldFibTrend.primitive);
        trendBasedFibonaccis.delete(id);
      }
      const oldFibTime = fibonacciTimeZones.get(id);
      if (oldFibTime) {
        price.detachPrimitive(oldFibTime.primitive);
        fibonacciTimeZones.delete(id);
      }
      const oldChannel = channels.get(id);
      if (oldChannel) {
        price.detachPrimitive(oldChannel.primitive);
        channels.delete(id);
      }
      const oldPitchfork = pitchforks.get(id);
      if (oldPitchfork) {
        price.detachPrimitive(oldPitchfork.primitive);
        pitchforks.delete(id);
      }
      const oldMeasurement = measurements.get(id);
      if (oldMeasurement) {
        price.detachPrimitive(oldMeasurement.primitive);
        measurements.delete(id);
      }
      const oldRiskReward = riskRewards.get(id);
      if (oldRiskReward) {
        price.detachPrimitive(oldRiskReward.primitive);
        riskRewards.delete(id);
      }
      if (snapshot?.kind === "PRICE") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validatePriceLevel(options);
        const primitive = new PriceLevelPrimitive(id, options.price, options.color, options.visible ?? true);
        price.attachPrimitive(primitive);
        priceLevels.set(id, { primitive, options });
      } else if (snapshot?.kind === "TIME") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validateTimeMarker(options, false);
        const primitive = new TimeMarkerPrimitive(id, options.time, options.color, options.visible ?? true);
        price.attachPrimitive(primitive);
        timeMarkers.set(id, { primitive, options });
      } else if (snapshot?.kind === "TEXT") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validateTextAnnotation(options, false);
        const primitive = new TextAnnotationPrimitive(id, options);
        price.attachPrimitive(primitive);
        textAnnotations.set(id, { primitive, options });
      } else if (snapshot?.kind === "TREND") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validateTrendLine(options, false);
        const primitive = new TrendLinePrimitive(id, options);
        price.attachPrimitive(primitive);
        trendLines.set(id, { primitive, options });
      } else if (snapshot?.kind === "RECT") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validateRectangle(options, false);
        const primitive = new RectanglePrimitive(id, options);
        price.attachPrimitive(primitive);
        rectangles.set(id, { primitive, options });
      } else if (snapshot?.kind === "ELLIPSE") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validateTrendLine(options, false);
        if (options.startTime === options.endTime || options.startPrice === options.endPrice) return false;
        const primitive = new EllipsePrimitive(id, options);
        price.attachPrimitive(primitive);
        ellipses.set(id, { primitive, options });
      } else if (snapshot?.kind === "RAY") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validateTrendLine(options, false);
        const primitive = new RayPrimitive(id, options);
        price.attachPrimitive(primitive);
        rays.set(id, { primitive, options });
      } else if (snapshot?.kind === "FIBO") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validateTrendLine(options, false);
        const primitive = new FibonacciPrimitive(id, options);
        price.attachPrimitive(primitive);
        fibonacci.set(id, { primitive, options });
      } else if (snapshot?.kind === "FIB_FAN") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = normalizeFibonacciFanOptions({ ...snapshot.options, ratios: [...fibonacciFanRatios(snapshot.options)] }, false), primitive = new FibonacciFanPrimitive(id, options);
        price.attachPrimitive(primitive);
        fibonacciFans.set(id, { primitive, options });
      } else if (snapshot?.kind === "FIB_TREND") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = normalizeTrendBasedFibonacciOptions({ ...snapshot.options, ratios: [...trendFibRatios(snapshot.options)] }, false), primitive = new TrendBasedFibonacciPrimitive(id, options);
        price.attachPrimitive(primitive);
        trendBasedFibonaccis.set(id, { primitive, options });
      } else if (snapshot?.kind === "FIB_TIME") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validateFibonacciTimeZone(options, false);
        const primitive = new FibonacciTimeZonePrimitive(options);
        price.attachPrimitive(primitive);
        fibonacciTimeZones.set(id, { primitive, options });
      } else if (snapshot?.kind === "CHANNEL") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validateChannel(options, false);
        const primitive = new ChannelPrimitive(id, options);
        price.attachPrimitive(primitive);
        channels.set(id, { primitive, options });
      } else if (snapshot?.kind === "PITCHFORK") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validatePitchfork(options);
        const primitive = new PitchforkPrimitive(id, options);
        price.attachPrimitive(primitive);
        pitchforks.set(id, { primitive, options });
      } else if (snapshot?.kind === "RISK_REWARD") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validateRiskReward(options, false);
        const primitive = new RiskRewardPrimitive(id, options);
        price.attachPrimitive(primitive);
        riskRewards.set(id, { primitive, options });
      } else if (snapshot?.kind === "MEASURE") {
        if (drawingCount() >= maxNativeDrawings) return false;
        const options = { ...snapshot.options };
        validateTrendLine(options, false);
        const primitive = new MeasurementPrimitive(id, options, measurementLabel(options));
        price.attachPrimitive(primitive);
        measurements.set(id, { primitive, options });
      }
      if (wasSelected && snapshot) selectDrawing(id);
      return true;
    }
    function undo() {
      guard();
      if (activeDrag) {
        finishDrag(true);
        return true;
      }
      const change = undoStack[undoStack.length - 1];
      if (!change || !restoreDrawing(change.id, change.before)) return false;
      undoStack.pop();
      redoStack.push(change);
      persistDrawings();
      return true;
    }
    function redo() {
      guard();
      if (activeDrag) {
        finishDrag(true);
        return true;
      }
      const change = redoStack[redoStack.length - 1];
      if (!change || !restoreDrawing(change.id, change.after)) return false;
      redoStack.pop();
      undoStack.push(change);
      persistDrawings();
      return true;
    }
    function deleteDrawingById(id) {
      if (priceLevels.has(id)) return removePriceLevel(id);
      if (timeMarkers.has(id)) return removeTimeMarker(id);
      if (textAnnotations.has(id)) return removeTextAnnotation(id);
      if (trendLines.has(id)) return removeTrendLine(id);
      if (rectangles.has(id)) return removeRectangle(id);
      if (ellipses.has(id)) return removeEllipse(id);
      if (rays.has(id)) return removeRay(id);
      if (channels.has(id)) return removeChannel(id);
      if (pitchforks.has(id)) return removePitchfork(id);
      if (measurements.has(id)) return removeMeasurement(id);
      if (riskRewards.has(id)) return removeRiskReward(id);
      if (fibonacci.has(id)) return removeFibonacci(id);
      if (fibonacciFans.has(id)) return removeFibonacciFan(id);
      if (trendBasedFibonaccis.has(id)) return removeTrendBasedFibonacci(id);
      if (fibonacciTimeZones.has(id)) return removeFibonacciTimeZone(id);
      return false;
    }
    function deleteSelectedDrawings() {
      guard();
      const ids = [...selectedDrawingIds];
      if (ids.some((id) => !snapshotDrawing(id))) throw Error("Drawing selection changed");
      const deleted = [];
      for (const id of ids) if (deleteDrawingById(id)) deleted.push(id);
      return deleted;
    }
    function deleteSelectedDrawing() {
      guard();
      return selectedDrawingId ? deleteDrawingById(selectedDrawingId) : false;
    }
    function duplicateSelectedDrawing() {
      guard();
      if (!selectedDrawingId) return null;
      const source = snapshotDrawing(selectedDrawingId);
      if (!source) return null;
      const base = selectedDrawingId.slice(0, 20);
      let suffix = 1, id = "";
      do {
        id = `${base}-copy${suffix++}`;
      } while (priceLevels.has(id) || timeMarkers.has(id) || textAnnotations.has(id) || trendLines.has(id) || rectangles.has(id) || ellipses.has(id) || rays.has(id) || fibonacci.has(id) || fibonacciFans.has(id) || trendBasedFibonaccis.has(id) || fibonacciTimeZones.has(id) || channels.has(id) || pitchforks.has(id) || riskRewards.has(id) || averages.has(id) || paneLines.has(id));
      if (source.kind === "PRICE") addPriceLevel({ id, price: source.options.price, color: source.options.color, visible: source.options.visible, locked: source.options.locked });
      else if (source.kind === "TIME") addTimeMarker({ id, time: source.options.time, color: source.options.color, visible: source.options.visible, locked: source.options.locked });
      else if (source.kind === "TEXT") addTextAnnotation({ ...source.options, id });
      else if (source.kind === "TREND") addTrendLine({ ...source.options, id });
      else if (source.kind === "RECT") addRectangle({ ...source.options, id });
      else if (source.kind === "ELLIPSE") addEllipse({ ...source.options, id });
      else if (source.kind === "RAY") addRay({ ...source.options, id });
      else if (source.kind === "FIB_FAN") addFibonacciFan({ ...source.options, id, ratios: [...fibonacciFanRatios(source.options)] });
      else if (source.kind === "FIB_TREND") addTrendBasedFibonacci({ ...source.options, id, ratios: [...trendFibRatios(source.options)] });
      else if (source.kind === "FIB_TIME") addFibonacciTimeZone({ ...source.options, id });
      else if (source.kind === "CHANNEL") addChannel({ ...source.options, id });
      else if (source.kind === "PITCHFORK") addPitchfork({ ...source.options, id });
      else if (source.kind === "MEASURE") addMeasurement({ ...source.options, id });
      else if (source.kind === "RISK_REWARD") addRiskReward({ ...source.options, id });
      else addFibonacci({ ...source.options, id });
      selectDrawing(id);
      return id;
    }
    function duplicateSelectedDrawings() {
      guard();
      const sourceIds = [...selectedDrawingIds];
      if (sourceIds.some((id) => !snapshotDrawing(id))) throw Error("Drawing selection changed");
      if (drawingCount() + sourceIds.length > maxNativeDrawings) throw Error("Native drawing limit");
      const duplicates = [];
      for (const sourceId of sourceIds) {
        selectDrawing(sourceId);
        const duplicateId = duplicateSelectedDrawing();
        if (!duplicateId) throw Error("Drawing could not be duplicated");
        duplicates.push(duplicateId);
      }
      selectDrawings(duplicates);
      return duplicates;
    }
    function setCandles(data) {
      guard();
      const next = normalizeCandles(data);
      finishDrag(true);
      undoStack.length = 0;
      redoStack.length = 0;
      bars = next;
      barsByTime = new Map(bars.map((c2) => [c2.time, c2]));
      brokerDealMarkers = brokerDealMarkers.map((row) => ({ ...row, plotted: barsByTime.has(row.chartTimeSeconds) }));
      brokerDealPrimitive.set(brokerDealMarkers);
      for (const series of averages.values()) series.setData([]);
      for (const series of paneLines.values()) series.setData([]);
      for (const group of oscillators.values()) for (const series of group.series.values()) series.setData([]);
      for (const group of supertrendOverlays.values()) {
        group.up.setData([]);
        group.down.setData([]);
      }
      for (const group of parabolicSarOverlays.values()) {
        group.up.setData([]);
        group.down.setData([]);
      }
      readoutIndicators.clear();
      syncPresentationSeries();
      refreshManagedMovingAverages();
      refreshDonchianOverlays();
      refreshBollingerOverlays();
      refreshSessionVwapOverlays();
      refreshKeltnerOverlays();
      refreshAtrBandsOverlays();
      refreshLinearRegressionOverlays();
      refreshSupertrendOverlays();
      refreshParabolicSar();
      refreshIchimokuOverlays();
      refreshPivotOverlays();
      refreshOscillators();
      refreshVolumeZones();
      refreshAutoFibonacci();
      if (volume) volume.setData(volumeRows());
      hydrateDrawings();
      if (drawingsHydrated && persistenceStatus === "READY") persistDrawings();
      schedulePriceAxisLabelLayout();
    }
    function volumeRows() {
      return bars.map((c2) => ({
        time: c2.time,
        value: Math.max(0, (c2.real_volume ?? 0) > 0 ? c2.real_volume : c2.tick_volume ?? 0),
        color: c2.close >= c2.open ? "#4bc3d7" : "#dc6987"
      }));
    }
    function refreshVolumeZones() {
      if (!volumeZones) return;
      volumeZones.result = calculateVolumeZones(bars, { timeframeSeconds: volumeZones.options.timeframeSeconds, asOfUtc: volumeZones.asOf.timeUtc, lookback: volumeZones.options.lookback ?? 20, multiplier: volumeZones.options.multiplier ?? 2 });
      volumeZones.primitive.set(volumeZones.result, volumeZones.options.visible ?? true);
    }
    function setVolumeZones(options, asOf) {
      guard();
      if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => !["timeframeSeconds", "lookback", "multiplier", "visible"].includes(key)) || !Number.isSafeInteger(options.timeframeSeconds) || options.timeframeSeconds <= 0 || options.timeframeSeconds > 86400 || options.lookback !== void 0 && (!Number.isInteger(options.lookback) || options.lookback < 5 || options.lookback > 100) || options.multiplier !== void 0 && (!Number.isFinite(options.multiplier) || options.multiplier < 1 || options.multiplier > 10) || options.visible !== void 0 && typeof options.visible !== "boolean") throw Error("Invalid volume-zone configuration");
      if (!asOf || typeof asOf !== "object" || Array.isArray(asOf) || Object.keys(asOf).some((key) => !["source", "account", "symbol", "timeframe", "timeUtc"].includes(key)) || asOf.source !== "MT5_VERIFIED" || asOf.account !== activeAccount || !drawingScope || asOf.symbol !== drawingScope.symbol || asOf.timeframe !== drawingScope.timeframe || !Number.isSafeInteger(asOf.timeUtc) || asOf.timeUtc <= 0) throw Error("Volume-zone as-of does not match verified chart scope");
      const scopedSeconds = drawingScope ? { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 }[drawingScope.timeframe] : void 0;
      if (drawingScope && (scopedSeconds === void 0 || options.timeframeSeconds !== scopedSeconds)) throw Error("Volume-zone timeframe does not match chart scope");
      const normalized = { ...options }, verifiedAsOf = { ...asOf }, result = calculateVolumeZones(bars, { timeframeSeconds: normalized.timeframeSeconds, asOfUtc: verifiedAsOf.timeUtc, lookback: normalized.lookback ?? 20, multiplier: normalized.multiplier ?? 2 });
      if (volumeZones) {
        volumeZones.options = normalized;
        volumeZones.asOf = verifiedAsOf;
        volumeZones.result = result;
        volumeZones.primitive.set(result, normalized.visible ?? true);
      } else {
        const primitive = new VolumeZonePrimitive(result, normalized.visible ?? true);
        price.attachPrimitive(primitive);
        volumeZones = { options: normalized, asOf: verifiedAsOf, result, primitive };
      }
      return readVolumeZones();
    }
    function readVolumeZones() {
      guard();
      return volumeZones ? { options: { ...volumeZones.options }, asOf: { ...volumeZones.asOf }, result: JSON.parse(JSON.stringify(volumeZones.result)) } : null;
    }
    function clearVolumeZones() {
      guard();
      if (!volumeZones) return false;
      price.detachPrimitive(volumeZones.primitive);
      volumeZones = null;
      return true;
    }
    function refreshAutoFibonacci() {
      if (!autoFibonacci) return;
      autoFibonacci.result = calculateAutoFibonacci(bars, drawingScope?.timeframe ?? "", autoFibonacci.asOf.timeUtc);
      autoFibRatios.forEach((ratio, index) => autoFibonacci.series[index].setData(autoFibonacci.result.lines[String(ratio)].points));
    }
    function setAutoFibonacci(options, asOf) {
      guard();
      if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => !["timeframeSeconds", "visible"].includes(key)) || !Number.isSafeInteger(options.timeframeSeconds) || options.timeframeSeconds <= 0 || options.timeframeSeconds > 604800 || options.visible !== void 0 && typeof options.visible !== "boolean") throw Error("Invalid auto-Fibonacci configuration");
      if (!asOf || typeof asOf !== "object" || Array.isArray(asOf) || Object.keys(asOf).some((key) => !["source", "account", "symbol", "timeframe", "timeUtc"].includes(key)) || asOf.source !== "MT5_VERIFIED" || asOf.account !== activeAccount || !drawingScope || asOf.symbol !== drawingScope.symbol || asOf.timeframe !== drawingScope.timeframe || !Number.isSafeInteger(asOf.timeUtc) || asOf.timeUtc <= 0) throw Error("Auto-Fibonacci as-of does not match verified chart scope");
      const scopedSeconds = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800 }[drawingScope.timeframe];
      if (scopedSeconds === void 0 || options.timeframeSeconds !== scopedSeconds) throw Error("Auto-Fibonacci timeframe does not match chart scope");
      if (!autoFibonacci && indicatorInstanceCount() >= maxIndicatorInstances) throw Error("Indicator instance limit");
      const normalized = { ...options }, verifiedAsOf = { ...asOf }, result = calculateAutoFibonacci(bars, drawingScope.timeframe, verifiedAsOf.timeUtc), visible = normalized.visible ?? true;
      if (autoFibonacci) {
        autoFibonacci.options = normalized;
        autoFibonacci.asOf = verifiedAsOf;
        autoFibonacci.result = result;
        autoFibRatios.forEach((ratio, index) => {
          autoFibonacci.series[index].applyOptions({ visible, title: `Auto Fib ${(ratio * 100).toFixed(1)}%` });
          autoFibonacci.series[index].setData(result.lines[String(ratio)].points);
        });
      } else {
        const series = autoFibRatios.map((ratio, index) => {
          const line = createPaneLine({ id: `auto-fib-${index}`, color: autoFibColors[index], lineWidth: 1, visible, title: `Auto Fib ${(ratio * 100).toFixed(1)}%` }, 0);
          line.setData(result.lines[String(ratio)].points);
          return line;
        });
        autoFibonacci = { options: normalized, asOf: verifiedAsOf, result, series };
      }
      return readAutoFibonacci();
    }
    function readAutoFibonacci() {
      guard();
      return autoFibonacci ? { options: { ...autoFibonacci.options }, asOf: { ...autoFibonacci.asOf }, result: JSON.parse(JSON.stringify(autoFibonacci.result)), series: autoFibonacci.series.map((series) => ({ title: series.options().title, visible: series.options().visible, points: series.data().map((point2) => ({ ...point2 })) })) } : null;
    }
    function clearAutoFibonacci() {
      guard();
      if (!autoFibonacci) return false;
      for (const series of autoFibonacci.series) chart.removeSeries(series);
      autoFibonacci = null;
      return true;
    }
    function applyAverageData(opts, data) {
      guard();
      if (!opts || !/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id) || !colorPattern.test(opts.color)) throw Error("Invalid line options");
      if (indicatorInstanceCount() >= maxIndicatorInstances && !averages.has(opts.id)) throw Error("Indicator instance limit");
      if (oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || (keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id)) || supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || (ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id)) || paneLines.has(opts.id) || priceLevels.has(opts.id) || timeMarkers.has(opts.id) || textAnnotations.has(opts.id) || trendLines.has(opts.id) || rectangles.has(opts.id) || rays.has(opts.id) || fibonacci.has(opts.id) || fibonacciFans.has(opts.id) || trendBasedFibonaccis.has(opts.id) || fibonacciTimeZones.has(opts.id) || channels.has(opts.id) || pitchforks.has(opts.id) || measurements.has(opts.id) || riskRewards.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      const values = validSeriesData(data);
      let series = averages.get(opts.id);
      if (!series) {
        series = newLine(opts);
        averages.set(opts.id, series);
      } else series.applyOptions({
        color: opts.color,
        lineWidth: opts.lineWidth ?? 2,
        visible: opts.visible ?? true,
        title: opts.title ?? opts.id
      });
      series.setData(values);
      readoutIndicators.set(opts.id, { id: opts.id, title: opts.title ?? opts.id, kind: "OVERLAY", values: new Map(values.map((v2) => [v2.time, v2.value])) });
    }
    function addAverage(opts, data) {
      managedMovingAverages.delete(opts?.id);
      transientMovingAverages.delete(opts?.id);
      applyAverageData(opts, data);
    }
    function addManagedMovingAverage(options, persistent) {
      guard();
      const calculation = movingAverageData(bars, options), normalized = { ...options, source: options.source ?? "close", displayShift: options.displayShift ?? 0 };
      applyAverageData({ id: options.id, color: options.color, lineWidth: options.lineWidth, visible: options.visible, title: options.title ?? `${options.type} ${options.period}` }, calculation.points);
      managedMovingAverages.set(options.id, { options: normalized, base: new Map(calculation.base.map((point2) => [point2.time, point2.value])) });
      if (persistent) {
        transientMovingAverages.delete(options.id);
        persistDrawings();
      } else transientMovingAverages.add(options.id);
    }
    function addMovingAverage(options) {
      addManagedMovingAverage(options, true);
    }
    function addTransientMovingAverage(options) {
      addManagedMovingAverage(options, false);
    }
    function refreshDonchianOverlays() {
      for (const [id, group] of donchianOverlays) {
        const values = donchianData(bars, group.options.period), keys = ["upper", "middle", "lower"];
        for (let i = 0; i < 3; i++) group.series[i].setData(values[keys[i]]);
        readoutIndicators.set(id, { id, title: group.options.title ?? `Donchian ${group.options.period}`, kind: "OVERLAY", values: new Map(values.middle.map((point2) => [point2.time, point2.value])) });
      }
    }
    function validBollingerOptions(options) {
      return !!options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => ["id", "period", "stdDev", "color", "lineWidth", "visible", "title"].includes(key)) && /^[-_a-zA-Z0-9]{1,32}$/.test(options.id) && colorPattern.test(options.color) && Number.isInteger(options.period) && options.period >= 2 && options.period <= 300 && Number.isFinite(options.stdDev) && options.stdDev >= 0.1 && options.stdDev <= 10 && Math.abs(options.stdDev * 10 - Math.round(options.stdDev * 10)) <= 1e-8 && (options.lineWidth === void 0 || Number.isInteger(options.lineWidth) && options.lineWidth >= 1 && options.lineWidth <= 4) && (options.visible === void 0 || typeof options.visible === "boolean") && (options.title === void 0 || typeof options.title === "string" && options.title.length <= 80 && !/[\u0000-\u001f\u007f]/.test(options.title));
    }
    function refreshBollingerOverlays() {
      for (const [id, group] of bollingerOverlays) {
        const values = calculateBollingerBands(bars, group.options.period, group.options.stdDev), keys = ["upper", "middle", "lower"];
        for (let i = 0; i < 3; i++) group.series[i].setData(values[keys[i]]);
        group.values = values;
        readoutIndicators.set(id, { id, title: group.options.title ?? `Bollinger ${group.options.period}`, kind: "OVERLAY", values: new Map(values.middle.map((point2) => [point2.time, point2.value])) });
      }
    }
    function sessionVwapTitle(options, source) {
      const label = source === "REAL_VOLUME" ? "Real volume" : source === "TICK_VOLUME_PROXY" ? "Tick-volume proxy" : source === "MIXED" ? "Real/tick-volume mix" : "No usable volume";
      return `${options.title ?? "Session VWAP"} ${options.sessionStart} ${options.timeZone} \xB7 ${label}`;
    }
    function validSessionVwapOptions(options) {
      return !!options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => ["id", "color", "lineWidth", "visible", "title", "timeZone", "sessionStart"].includes(key)) && /^[-_a-zA-Z0-9]{1,32}$/.test(options.id) && colorPattern.test(options.color) && (options.lineWidth === void 0 || Number.isInteger(options.lineWidth) && options.lineWidth >= 1 && options.lineWidth <= 4) && (options.visible === void 0 || typeof options.visible === "boolean") && (options.title === void 0 || typeof options.title === "string" && options.title.length <= 80 && !/[\u0000-\u001f\u007f]/.test(options.title)) && typeof options.timeZone === "string" && options.timeZone.length > 0 && options.timeZone.length <= 64 && typeof options.sessionStart === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(options.sessionStart);
    }
    function refreshSessionVwapOverlays() {
      for (const [id, group] of sessionVwapOverlays) {
        const result = calculateSessionVwap(bars, group.options);
        group.result = result;
        group.series.setData(result.points);
        group.series.applyOptions({ title: sessionVwapTitle(group.options, result.volumeSource) });
        readoutIndicators.set(id, { id, title: sessionVwapTitle(group.options, result.volumeSource), kind: "OVERLAY", values: new Map(result.points.map((point2) => [point2.time, point2.value])) });
      }
    }
    function addSessionVwap(options) {
      guard();
      const normalized = { ...options, timeZone: options.timeZone ?? "UTC", sessionStart: options.sessionStart ?? "00:00", visible: options.visible ?? true };
      if (!validSessionVwapOptions(normalized)) throw Error("Invalid session VWAP configuration");
      if (oscillators.has(normalized.id) || averages.has(normalized.id) || donchianOverlays.has(normalized.id) || bollingerOverlays.has(normalized.id) || keltnerOverlays.has(normalized.id) || atrBandsOverlays.has(normalized.id) || linearRegressionOverlays.has(normalized.id) || supertrendOverlays.has(normalized.id) || parabolicSarOverlays.has(normalized.id) || ichimokuOverlays.has(normalized.id) || pivotOverlays.has(normalized.id) || paneLines.has(normalized.id) || priceLevels.has(normalized.id) || timeMarkers.has(normalized.id) || textAnnotations.has(normalized.id) || trendLines.has(normalized.id) || rectangles.has(normalized.id) || rays.has(normalized.id) || fibonacci.has(normalized.id) || fibonacciFans.has(normalized.id) || trendBasedFibonaccis.has(normalized.id) || fibonacciTimeZones.has(normalized.id) || channels.has(normalized.id) || pitchforks.has(normalized.id) || measurements.has(normalized.id)) throw Error("Duplicate chart object identity");
      const existing = sessionVwapOverlays.get(normalized.id);
      if (indicatorInstanceCount() >= maxIndicatorInstances && !existing) throw Error("Indicator instance limit");
      if (!existing && (averages.has(normalized.id) || oscillators.has(normalized.id) || donchianOverlays.has(normalized.id) || bollingerOverlays.has(normalized.id) || keltnerOverlays.has(normalized.id) || atrBandsOverlays.has(normalized.id) || linearRegressionOverlays.has(normalized.id) || supertrendOverlays.has(normalized.id) || parabolicSarOverlays.has(normalized.id) || ichimokuOverlays.has(normalized.id) || pivotOverlays.has(normalized.id) || paneLines.has(normalized.id) || priceLevels.has(normalized.id) || timeMarkers.has(normalized.id) || textAnnotations.has(normalized.id) || trendLines.has(normalized.id) || rectangles.has(normalized.id) || rays.has(normalized.id) || fibonacci.has(normalized.id) || fibonacciFans.has(normalized.id) || trendBasedFibonaccis.has(normalized.id) || fibonacciTimeZones.has(normalized.id) || channels.has(normalized.id) || pitchforks.has(normalized.id) || measurements.has(normalized.id))) throw Error("Duplicate chart object identity");
      const result = calculateSessionVwap(bars, normalized), series = existing?.series ?? newLine({ id: normalized.id, color: normalized.color, lineWidth: normalized.lineWidth, visible: normalized.visible, title: sessionVwapTitle(normalized, result.volumeSource) });
      series.applyOptions({ color: normalized.color, lineWidth: normalized.lineWidth ?? 2, visible: normalized.visible, title: sessionVwapTitle(normalized, result.volumeSource) });
      series.setData(result.points);
      sessionVwapOverlays.set(normalized.id, { options: normalized, series, result });
      readoutIndicators.set(normalized.id, { id: normalized.id, title: sessionVwapTitle(normalized, result.volumeSource), kind: "OVERLAY", values: new Map(result.points.map((point2) => [point2.time, point2.value])) });
      persistDrawings();
      return { options: { ...normalized }, ...result };
    }
    function updateSessionVwap(id, patch) {
      guard();
      const existing = sessionVwapOverlays.get(id);
      if (!existing) return false;
      if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !["color", "lineWidth", "visible", "title", "timeZone", "sessionStart"].includes(key))) throw Error("Invalid session VWAP update");
      const normalized = { ...existing.options, ...patch, id };
      if (!validSessionVwapOptions(normalized)) throw Error("Invalid session VWAP configuration");
      const result = calculateSessionVwap(bars, normalized), title = sessionVwapTitle(normalized, result.volumeSource);
      existing.series.applyOptions({ color: normalized.color, lineWidth: normalized.lineWidth ?? 2, visible: normalized.visible ?? true, title });
      existing.series.setData(result.points);
      existing.options = normalized;
      existing.result = result;
      readoutIndicators.set(id, { id, title, kind: "OVERLAY", values: new Map(result.points.map((point2) => [point2.time, point2.value])) });
      persistDrawings();
      return { options: { ...normalized }, ...result };
    }
    function removeSessionVwap(id) {
      guard();
      const group = sessionVwapOverlays.get(id);
      if (!group) return false;
      chart.removeSeries(group.series);
      sessionVwapOverlays.delete(id);
      readoutIndicators.delete(id);
      persistDrawings();
      return true;
    }
    function sessionVwapOptions(id) {
      guard();
      const group = sessionVwapOverlays.get(id);
      return group ? { ...group.options } : null;
    }
    function addBollinger(options) {
      guard();
      const normalized = { ...options, period: options.period ?? 20, stdDev: options.stdDev ?? 2, visible: options.visible ?? true };
      if (!validBollingerOptions(normalized)) throw Error("Invalid Bollinger configuration");
      if (oscillators.has(normalized.id) || averages.has(normalized.id) || donchianOverlays.has(normalized.id) || (keltnerOverlays.has(normalized.id) || atrBandsOverlays.has(normalized.id)) || linearRegressionOverlays.has(normalized.id) || supertrendOverlays.has(normalized.id) || parabolicSarOverlays.has(normalized.id) || (ichimokuOverlays.has(normalized.id) || pivotOverlays.has(normalized.id)) || paneLines.has(normalized.id) || priceLevels.has(normalized.id) || timeMarkers.has(normalized.id) || textAnnotations.has(normalized.id) || trendLines.has(normalized.id) || rectangles.has(normalized.id) || rays.has(normalized.id) || fibonacci.has(normalized.id) || fibonacciFans.has(normalized.id) || trendBasedFibonaccis.has(normalized.id) || fibonacciTimeZones.has(normalized.id) || channels.has(normalized.id) || pitchforks.has(normalized.id) || measurements.has(normalized.id) || riskRewards.has(normalized.id) || sessionVwapOverlays.has(normalized.id)) throw Error("Duplicate chart object identity");
      if (indicatorInstanceCount() >= maxIndicatorInstances && !bollingerOverlays.has(normalized.id)) throw Error("Indicator instance limit");
      const existing = bollingerOverlays.get(normalized.id);
      const series = existing?.series ?? [
        newLine({ id: normalized.id + "-upper", color: normalized.color, lineWidth: normalized.lineWidth ?? 2, visible: normalized.visible, title: `${normalized.title ?? "Bollinger"} Upper` }),
        newLine({ id: normalized.id + "-middle", color: "#9f8be0", lineWidth: 1, visible: normalized.visible, title: `${normalized.title ?? "Bollinger"} Middle` }),
        newLine({ id: normalized.id + "-lower", color: normalized.color, lineWidth: normalized.lineWidth ?? 2, visible: normalized.visible, title: `${normalized.title ?? "Bollinger"} Lower` })
      ];
      const colors = [normalized.color, "#9f8be0", normalized.color];
      for (let i = 0; i < 3; i++) series[i].applyOptions({ color: colors[i], lineWidth: i === 1 ? 1 : normalized.lineWidth ?? 2, visible: normalized.visible, title: `${normalized.title ?? "Bollinger"} ${["Upper", "Middle", "Lower"][i]}` });
      bollingerOverlays.set(normalized.id, { options: normalized, series, values: existing?.values ?? { upper: [], middle: [], lower: [] } });
      refreshBollingerOverlays();
    }
    function updateBollinger(id, patch) {
      guard();
      const existing = bollingerOverlays.get(id);
      if (!existing) return false;
      if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !["period", "stdDev", "color", "lineWidth", "visible", "title"].includes(key))) throw Error("Invalid Bollinger update");
      const next = { ...existing.options, ...patch };
      if (!validBollingerOptions(next)) throw Error("Invalid Bollinger configuration");
      addBollinger(next);
      return true;
    }
    function bollingerOptions(id) {
      guard();
      const group = bollingerOverlays.get(id);
      return group ? { ...group.options } : void 0;
    }
    function removeBollinger(id) {
      guard();
      const group = bollingerOverlays.get(id);
      if (!group) return false;
      for (const series of group.series) chart.removeSeries(series);
      bollingerOverlays.delete(id);
      readoutIndicators.delete(id);
      return true;
    }
    function addDonchian(options) {
      guard();
      if (!options || !/^[-_a-zA-Z0-9]{1,32}$/.test(options.id) || !colorPattern.test(options.color) || !Number.isInteger(options.period) || options.period < 2 || options.period > 200 || options.lineWidth !== void 0 && (!Number.isInteger(options.lineWidth) || options.lineWidth < 1 || options.lineWidth > 4) || options.visible !== void 0 && typeof options.visible !== "boolean") throw Error("Invalid Donchian configuration");
      if (oscillators.has(options.id) || averages.has(options.id) || linearRegressionOverlays.has(options.id) || (keltnerOverlays.has(options.id) || atrBandsOverlays.has(options.id)) || supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || (ichimokuOverlays.has(options.id) || pivotOverlays.has(options.id)) || paneLines.has(options.id) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id) || bollingerOverlays.has(options.id) || sessionVwapOverlays.has(options.id)) throw Error("Duplicate chart object identity");
      if (indicatorInstanceCount() >= maxIndicatorInstances && !donchianOverlays.has(options.id)) throw Error("Indicator instance limit");
      const current = donchianOverlays.get(options.id), normalized = { ...options, visible: options.visible ?? true };
      const series = current?.series ?? [
        newLine({ id: options.id + "-upper", color: options.color, lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: `${options.title ?? "Donchian"} Upper` }),
        newLine({ id: options.id + "-middle", color: "#b7c8d0", lineWidth: 1, visible: normalized.visible, title: `${options.title ?? "Donchian"} Middle` }),
        newLine({ id: options.id + "-lower", color: "#f3c56a", lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: `${options.title ?? "Donchian"} Lower` })
      ];
      const colors = [options.color, "#b7c8d0", "#f3c56a"];
      for (let i = 0; i < 3; i++) series[i].applyOptions({ color: colors[i], lineWidth: i === 1 ? 1 : options.lineWidth ?? 2, visible: normalized.visible, title: `${options.title ?? "Donchian"} ${["Upper", "Middle", "Lower"][i]}` });
      donchianOverlays.set(options.id, { options: normalized, series });
      refreshDonchianOverlays();
    }
    function removeDonchian(id) {
      guard();
      const group = donchianOverlays.get(id);
      if (!group) return false;
      for (const series of group.series) chart.removeSeries(series);
      donchianOverlays.delete(id);
      readoutIndicators.delete(id);
      return true;
    }
    function refreshKeltnerOverlays() {
      for (const [id, group] of keltnerOverlays) {
        const values = keltnerData(bars, group.options), keys = ["upper", "middle", "lower"];
        for (let i = 0; i < 3; i++) group.series[i].setData(values[keys[i]]);
        readoutIndicators.set(id, { id, title: group.options.title ?? `Keltner ${group.options.period}`, kind: "OVERLAY", values: new Map(values.middle.map((point2) => [point2.time, point2.value])) });
      }
    }
    function addKeltner(options) {
      guard();
      if (!options || !/^[-_a-zA-Z0-9]{1,32}$/.test(options.id) || !colorPattern.test(options.color) || !Number.isInteger(options.period) || options.period < 2 || options.period > 200 || !Number.isInteger(options.atrPeriod) || options.atrPeriod < 2 || options.atrPeriod > 200 || !Number.isFinite(options.multiplier) || options.multiplier < 0.1 || options.multiplier > 10 || Math.abs(options.multiplier * 10 - Math.round(options.multiplier * 10)) > 1e-8 || options.lineWidth !== void 0 && (!Number.isInteger(options.lineWidth) || options.lineWidth < 1 || options.lineWidth > 4) || options.visible !== void 0 && typeof options.visible !== "boolean") throw Error("Invalid Keltner configuration");
      if (oscillators.has(options.id) || averages.has(options.id) || donchianOverlays.has(options.id) || atrBandsOverlays.has(options.id) || linearRegressionOverlays.has(options.id) || supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || (ichimokuOverlays.has(options.id) || pivotOverlays.has(options.id)) || paneLines.has(options.id) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id) || bollingerOverlays.has(options.id) || sessionVwapOverlays.has(options.id)) throw Error("Duplicate chart object identity");
      if (indicatorInstanceCount() >= maxIndicatorInstances && !(keltnerOverlays.has(options.id) || atrBandsOverlays.has(options.id))) throw Error("Indicator instance limit");
      const existing = keltnerOverlays.get(options.id), normalized = { ...options, visible: options.visible ?? true };
      const series = existing?.series ?? [
        newLine({ id: options.id + "-upper", color: options.color, lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: `${options.title ?? "Keltner"} Upper` }),
        newLine({ id: options.id + "-middle", color: "#b7c8d0", lineWidth: 1, visible: normalized.visible, title: `${options.title ?? "Keltner"} Middle` }),
        newLine({ id: options.id + "-lower", color: "#f3c56a", lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: `${options.title ?? "Keltner"} Lower` })
      ];
      const colors = [options.color, "#b7c8d0", "#f3c56a"];
      for (let i = 0; i < 3; i++) series[i].applyOptions({ color: colors[i], lineWidth: i === 1 ? 1 : options.lineWidth ?? 2, visible: normalized.visible, title: `${options.title ?? "Keltner"} ${["Upper", "Middle", "Lower"][i]}` });
      keltnerOverlays.set(options.id, { options: normalized, series });
      refreshKeltnerOverlays();
    }
    function removeKeltner(id) {
      guard();
      const group = keltnerOverlays.get(id);
      if (!group) return false;
      for (const series of group.series) chart.removeSeries(series);
      keltnerOverlays.delete(id);
      readoutIndicators.delete(id);
      return true;
    }
    function refreshAtrBandsOverlays() {
      for (const [id, group] of atrBandsOverlays) {
        const values = calculateAtrBands(bars, group.options.period, group.options.atrPeriod, group.options.multiplier), keys = ["upper", "middle", "lower"];
        for (let i = 0; i < 3; i++) group.series[i].setData(values[keys[i]]);
        group.values = values;
        readoutIndicators.set(id, { id: id + "-middle", title: group.options.title ?? `ATR Bands ${group.options.period} / ${group.options.atrPeriod} \xD7 ${group.options.multiplier}`, kind: "OVERLAY", values: new Map(values.middle.map((point2) => [point2.time, point2.value])) });
      }
    }
    function validAtrBandsOptions(options) {
      const period = options?.period ?? 20, atrPeriod = options?.atrPeriod ?? 14, multiplier = options?.multiplier ?? 2;
      return !!options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => ["id", "period", "atrPeriod", "multiplier", "color", "lineWidth", "visible", "title"].includes(key)) && /^[-_a-zA-Z0-9]{1,32}$/.test(options.id) && colorPattern.test(options.color) && Number.isInteger(period) && period >= 2 && period <= 200 && Number.isInteger(atrPeriod) && atrPeriod >= 2 && atrPeriod <= 200 && Number.isFinite(multiplier) && multiplier >= 0.1 && multiplier <= 10 && Math.abs(multiplier * 10 - Math.round(multiplier * 10)) <= 1e-8 && (options.lineWidth === void 0 || Number.isInteger(options.lineWidth) && options.lineWidth >= 1 && options.lineWidth <= 4) && (options.visible === void 0 || typeof options.visible === "boolean") && (options.title === void 0 || typeof options.title === "string" && options.title.length <= 100 && !/[\u0000-\u001f\u007f]/.test(options.title));
    }
    function addAtrBands(options) {
      guard();
      if (!validAtrBandsOptions(options)) throw Error("Invalid ATR Bands configuration");
      const id = options.id;
      if (oscillators.has(id) || averages.has(id) || donchianOverlays.has(id) || bollingerOverlays.has(id) || keltnerOverlays.has(id) || linearRegressionOverlays.has(id) || supertrendOverlays.has(id) || parabolicSarOverlays.has(id) || paneLines.has(id) || priceLevels.has(id) || timeMarkers.has(id) || textAnnotations.has(id) || trendLines.has(id) || rectangles.has(id) || ellipses.has(id) || rays.has(id) || fibonacci.has(id) || fibonacciFans.has(id) || channels.has(id) || pitchforks.has(id) || measurements.has(id) || riskRewards.has(id) || sessionVwapOverlays.has(id)) throw Error("Duplicate chart object identity");
      if (indicatorInstanceCount() >= maxIndicatorInstances && !atrBandsOverlays.has(id)) throw Error("Indicator instance limit");
      const existing = atrBandsOverlays.get(id), normalized = { ...options, period: options.period ?? 20, atrPeriod: options.atrPeriod ?? 14, multiplier: options.multiplier ?? 2, visible: options.visible ?? true }, title = options.title ?? "ATR Bands";
      const series = existing?.series ?? [
        newLine({ id: id + "-upper", color: options.color, lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: title + " Upper" }),
        newLine({ id: id + "-middle", color: "#b7c8d0", lineWidth: 1, visible: normalized.visible, title: title + " Middle" }),
        newLine({ id: id + "-lower", color: "#f3c56a", lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: title + " Lower" })
      ];
      for (let i = 0; i < 3; i++) series[i].applyOptions({ color: [options.color, "#b7c8d0", "#f3c56a"][i], lineWidth: i === 1 ? 1 : options.lineWidth ?? 2, visible: normalized.visible, title: `${title} ${["Upper", "Middle", "Lower"][i]}` });
      atrBandsOverlays.set(id, { options: normalized, series, values: existing?.values ?? { upper: [], middle: [], lower: [] } });
      refreshAtrBandsOverlays();
    }
    function updateAtrBands(id, patch) {
      guard();
      const existing = atrBandsOverlays.get(id);
      if (!existing) return false;
      if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !["period", "atrPeriod", "multiplier", "color", "lineWidth", "visible", "title"].includes(key))) throw Error("Invalid ATR Bands update");
      const options = { ...existing.options, ...patch };
      if (!validAtrBandsOptions(options)) throw Error("Invalid ATR Bands configuration");
      addAtrBands(options);
      return true;
    }
    function atrBandsOptions(id) {
      guard();
      const group = atrBandsOverlays.get(id);
      return group ? { ...group.options } : void 0;
    }
    function removeAtrBands(id) {
      guard();
      const group = atrBandsOverlays.get(id);
      if (!group) return false;
      for (const series of group.series) chart.removeSeries(series);
      atrBandsOverlays.delete(id);
      readoutIndicators.delete(id);
      return true;
    }
    function refreshLinearRegressionOverlays() {
      for (const [id, group] of linearRegressionOverlays) {
        const values = calculateLinearRegressionChannel(bars, group.options.period, group.options.multiplier), keys = ["upper", "middle", "lower"];
        for (let i = 0; i < 3; i++) group.series[i].setData(values[keys[i]]);
        group.values = values;
        readoutIndicators.set(id, { id, title: group.options.title ?? `Linear Regression ${group.options.period}`, kind: "OVERLAY", values: new Map(values.middle.map((point2) => [point2.time, point2.value])) });
      }
    }
    function validLinearRegressionOptions(options) {
      return !!options && /^[-_a-zA-Z0-9]{1,32}$/.test(options.id) && colorPattern.test(options.color) && Object.keys(options).every((key) => ["id", "period", "multiplier", "color", "lineWidth", "visible", "title"].includes(key)) && Number.isInteger(options.period) && options.period >= 2 && options.period <= 200 && Number.isFinite(options.multiplier) && options.multiplier >= 0.1 && options.multiplier <= 10 && Math.abs(options.multiplier * 10 - Math.round(options.multiplier * 10)) <= 1e-8 && (options.lineWidth === void 0 || Number.isInteger(options.lineWidth) && options.lineWidth >= 1 && options.lineWidth <= 4) && (options.visible === void 0 || typeof options.visible === "boolean") && (options.title === void 0 || typeof options.title === "string" && options.title.length <= 80);
    }
    function addLinearRegression(options) {
      guard();
      if (!validLinearRegressionOptions(options)) throw Error("Invalid Linear Regression configuration");
      if (oscillators.has(options.id) || averages.has(options.id) || donchianOverlays.has(options.id) || (keltnerOverlays.has(options.id) || atrBandsOverlays.has(options.id)) || supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || (ichimokuOverlays.has(options.id) || pivotOverlays.has(options.id)) || paneLines.has(options.id) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id) || bollingerOverlays.has(options.id) || sessionVwapOverlays.has(options.id)) throw Error("Duplicate chart object identity");
      if (indicatorInstanceCount() >= maxIndicatorInstances && !linearRegressionOverlays.has(options.id)) throw Error("Indicator instance limit");
      const existing = linearRegressionOverlays.get(options.id), normalized = { ...options, visible: options.visible ?? true };
      const series = existing?.series ?? [
        newLine({ id: options.id + "-upper", color: options.color, lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: `${options.title ?? "Linear Regression"} Upper` }),
        newLine({ id: options.id + "-middle", color: "#b7c8d0", lineWidth: 1, visible: normalized.visible, title: `${options.title ?? "Linear Regression"} Middle` }),
        newLine({ id: options.id + "-lower", color: "#f3c56a", lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: `${options.title ?? "Linear Regression"} Lower` })
      ];
      const colors = [options.color, "#b7c8d0", "#f3c56a"];
      for (let i = 0; i < 3; i++) series[i].applyOptions({ color: colors[i], lineWidth: i === 1 ? 1 : options.lineWidth ?? 2, visible: normalized.visible, title: `${options.title ?? "Linear Regression"} ${["Upper", "Middle", "Lower"][i]}` });
      linearRegressionOverlays.set(options.id, { options: normalized, series, values: existing?.values ?? { upper: [], middle: [], lower: [] } });
      refreshLinearRegressionOverlays();
    }
    function updateLinearRegression(id, patch) {
      guard();
      const existing = linearRegressionOverlays.get(id);
      if (!existing) return false;
      if (!patch || typeof patch !== "object" || Object.keys(patch).some((key) => !["period", "multiplier", "color", "lineWidth", "visible", "title"].includes(key))) throw Error("Invalid Linear Regression update");
      const options = { ...existing.options, ...patch };
      if (!validLinearRegressionOptions(options)) throw Error("Invalid Linear Regression configuration");
      addLinearRegression(options);
      return true;
    }
    function linearRegressionOptions(id) {
      guard();
      const group = linearRegressionOverlays.get(id);
      return group ? { ...group.options } : void 0;
    }
    function removeLinearRegression(id) {
      guard();
      const group = linearRegressionOverlays.get(id);
      if (!group) return false;
      for (const series of group.series) chart.removeSeries(series);
      linearRegressionOverlays.delete(id);
      readoutIndicators.delete(id);
      return true;
    }
    function refreshIchimokuOverlays() {
      const components = [["tenkan", "Tenkan"], ["kijun", "Kijun"], ["senkouA", "Senkou A (Quelle)"], ["senkouB", "Senkou B (Quelle)"], ["chikou", "Chikou (Quelle)"]];
      for (const [id, group] of ichimokuOverlays) {
        const values = calculateIchimoku(bars, { tenkanPeriod: group.options.tenkanPeriod, kijunPeriod: group.options.kijunPeriod, senkouBPeriod: group.options.senkouBPeriod, displacement: group.options.displacement, timeframe: drawingScope?.timeframe });
        const keys = components.map(([key]) => key);
        for (let i = 0; i < keys.length; i++) group.series[i].setData(values[keys[i]].map((point2) => ({ time: point2.time, value: point2.value })));
        group.values = values;
        group.cloud.set(values, group.options.visible ?? true);
        for (const [key, label] of components) readoutIndicators.set(id + ":" + key, { id: id + ":" + key, title: (group.options.title ?? "Ichimoku") + " " + label, kind: "OVERLAY", values: new Map(values[key].map((point2) => [point2.sourceTime, point2.value])) });
      }
    }
    function refreshPivotOverlays() {
      for (const [id, group] of pivotOverlays) {
        const values = calculatePivotPoints(group.sourceBars, bars, group.options.basis);
        group.values = values;
        for (const [key, series] of group.series) series.setData(values.lines[key].map((point2) => ({ time: point2.time, value: point2.value })));
        for (const key of Object.keys(values.lines)) readoutIndicators.set(id + ":" + key, { id: id + ":" + key, title: (group.options.title ?? "Pivot Points") + " " + key.toUpperCase(), kind: "OVERLAY", values: new Map(values.lines[key].map((point2) => [point2.time, point2.value])) });
      }
    }
    function validPivotOptions(options, sourceBars) {
      return !!options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => ["id", "color", "lineWidth", "visible", "title", "account", "symbol", "basis", "source", "sourceWindow"].includes(key)) && /^[-_a-zA-Z0-9]{1,32}$/.test(options.id) && colorPattern.test(options.color) && (options.lineWidth === void 0 || Number.isInteger(options.lineWidth) && options.lineWidth >= 1 && options.lineWidth <= 4) && (options.visible === void 0 || typeof options.visible === "boolean") && (options.title === void 0 || typeof options.title === "string" && options.title.length <= 80 && !/[\u0000-\u001f\u007f]/.test(options.title)) && options.account === activeAccount && options.symbol === drawingScope?.symbol && (options.basis === "D1" || options.basis === "W1") && options.source === "MT5_VERIFIED" && options.sourceWindow && Number.isSafeInteger(options.sourceWindow.from) && Number.isSafeInteger(options.sourceWindow.to) && sourceBars.length >= 2 && sourceBars[0].time === options.sourceWindow.from && sourceBars[sourceBars.length - 1]?.time === options.sourceWindow.to && calculatePivotPoints(sourceBars, bars, options.basis).available;
    }
    function addPivotPoints(options, sourceBars) {
      guard();
      if (!validPivotOptions(options, sourceBars)) throw Error("Invalid or mismatched verified Pivot Points scope");
      if (averages.has(options.id) || donchianOverlays.has(options.id) || bollingerOverlays.has(options.id) || keltnerOverlays.has(options.id) || atrBandsOverlays.has(options.id) || linearRegressionOverlays.has(options.id) || supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || ichimokuOverlays.has(options.id) || oscillators.has(options.id) || paneLines.has(options.id) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id) || sessionVwapOverlays.has(options.id)) throw Error("Duplicate chart object identity");
      if (indicatorInstanceCount() >= maxIndicatorInstances && !pivotOverlays.has(options.id)) throw Error("Indicator instance limit");
      const existing = pivotOverlays.get(options.id), normalized = { ...options, visible: options.visible ?? true }, keys = ["p", "r1", "r2", "r3", "s1", "s2", "s3"], colors = [options.color, "#52cbea", "#41d89a", "#b58aff", "#f47789", "#ffae57", "#e6e6e6"];
      const series = existing?.series ?? /* @__PURE__ */ new Map();
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        let line = series.get(key);
        if (!line) {
          line = newLine({ id: options.id + "-" + key, color: colors[i], lineWidth: key === "p" ? 2 : 1, visible: normalized.visible, title: (options.title ?? "Pivot Points") + " " + key.toUpperCase() });
          series.set(key, line);
        }
        line.applyOptions({ color: colors[i], visible: normalized.visible, title: (options.title ?? "Pivot Points") + " " + key.toUpperCase() });
      }
      pivotOverlays.set(options.id, { options: normalized, series, sourceBars: sourceBars.map((bar) => ({ ...bar })), values: existing?.values ?? calculatePivotPoints(sourceBars, bars, options.basis) });
      refreshPivotOverlays();
    }
    function updatePivotPoints(id, sourceBars) {
      guard();
      const existing = pivotOverlays.get(id);
      if (!existing) return false;
      const options = { ...existing.options, sourceWindow: { from: sourceBars[0]?.time, to: sourceBars[sourceBars.length - 1]?.time } };
      if (!validPivotOptions(options, sourceBars)) throw Error("Invalid or mismatched verified Pivot Points update");
      addPivotPoints(options, sourceBars);
      return true;
    }
    function pivotOptions(id) {
      guard();
      const group = pivotOverlays.get(id);
      return group ? { ...group.options, sourceWindow: { ...group.options.sourceWindow } } : void 0;
    }
    function removePivotPoints(id) {
      guard();
      const group = pivotOverlays.get(id);
      if (!group) return false;
      for (const series of group.series.values()) chart.removeSeries(series);
      pivotOverlays.delete(id);
      for (const key of ["p", "r1", "r2", "r3", "s1", "s2", "s3"]) readoutIndicators.delete(id + ":" + key);
      return true;
    }
    function validIchimokuOptions(options) {
      return !!options && typeof options === "object" && !Array.isArray(options) && /^[-_a-zA-Z0-9]{1,32}$/.test(options.id) && colorPattern.test(options.color) && Object.keys(options).every((key) => ["id", "color", "lineWidth", "visible", "title", "tenkanPeriod", "kijunPeriod", "senkouBPeriod", "displacement"].includes(key)) && Number.isInteger(options.tenkanPeriod ?? 9) && (options.tenkanPeriod ?? 9) >= 2 && (options.tenkanPeriod ?? 9) <= 200 && Number.isInteger(options.kijunPeriod ?? 26) && (options.kijunPeriod ?? 26) >= 2 && (options.kijunPeriod ?? 26) <= 200 && Number.isInteger(options.senkouBPeriod ?? 52) && (options.senkouBPeriod ?? 52) >= 2 && (options.senkouBPeriod ?? 52) <= 200 && Number.isInteger(options.displacement ?? 26) && (options.displacement ?? 26) >= 0 && (options.displacement ?? 26) <= 200 && (options.lineWidth === void 0 || Number.isInteger(options.lineWidth) && options.lineWidth >= 1 && options.lineWidth <= 4) && (options.visible === void 0 || typeof options.visible === "boolean") && (options.title === void 0 || typeof options.title === "string" && options.title.length <= 80 && !/[\u0000-\u001f\u007f]/.test(options.title));
    }
    function addIchimoku(options) {
      guard();
      if (!validIchimokuOptions(options)) throw Error("Invalid Ichimoku configuration");
      const id = options.id;
      if (averages.has(id) || donchianOverlays.has(id) || bollingerOverlays.has(id) || keltnerOverlays.has(id) || atrBandsOverlays.has(id) || linearRegressionOverlays.has(id) || supertrendOverlays.has(id) || parabolicSarOverlays.has(id) || oscillators.has(id) || paneLines.has(id) || priceLevels.has(id) || timeMarkers.has(id) || textAnnotations.has(id) || trendLines.has(id) || rectangles.has(id) || ellipses.has(id) || rays.has(id) || fibonacci.has(id) || fibonacciFans.has(id) || channels.has(id) || pitchforks.has(id) || measurements.has(id) || riskRewards.has(id) || sessionVwapOverlays.has(id)) throw Error("Duplicate chart object identity");
      if (indicatorInstanceCount() >= maxIndicatorInstances && !ichimokuOverlays.has(id) && !pivotOverlays.has(id)) throw Error("Indicator instance limit");
      const existing = ichimokuOverlays.get(id), normalized = { ...options, tenkanPeriod: options.tenkanPeriod ?? 9, kijunPeriod: options.kijunPeriod ?? 26, senkouBPeriod: options.senkouBPeriod ?? 52, displacement: options.displacement ?? 26, visible: options.visible ?? true };
      const series = existing?.series ?? [
        newLine({ id: id + "-tenkan", color: "#55d7ee", lineWidth: 1, visible: normalized.visible, title: "Ichimoku Tenkan" }),
        newLine({ id: id + "-kijun", color: "#f3c56a", lineWidth: 1, visible: normalized.visible, title: "Ichimoku Kijun" }),
        newLine({ id: id + "-senkou-a", color: "#41d89a", lineWidth: 1, visible: normalized.visible, title: "Ichimoku Senkou A" }),
        newLine({ id: id + "-senkou-b", color: "#f47789", lineWidth: 1, visible: normalized.visible, title: "Ichimoku Senkou B" }),
        newLine({ id: id + "-chikou", color: "#b58aff", lineWidth: 1, visible: normalized.visible, title: "Ichimoku Chikou" })
      ];
      const titles = ["Tenkan", "Kijun", "Senkou A", "Senkou B", "Chikou"], colors = [options.color, "#f3c56a", "#41d89a", "#f47789", "#b58aff"];
      for (let i = 0; i < series.length; i++) series[i].applyOptions({ visible: normalized.visible, lineWidth: options.lineWidth ?? 1, color: colors[i], title: (options.title ?? "Ichimoku") + " " + titles[i] });
      const cloud = existing?.cloud ?? new IchimokuCloudPrimitive(normalized.visible);
      if (!existing) price.attachPrimitive(cloud);
      ichimokuOverlays.set(id, { options: normalized, series, cloud, values: existing?.values ?? { tenkan: [], kijun: [], senkouA: [], senkouB: [], chikou: [] } });
      refreshIchimokuOverlays();
    }
    function updateIchimoku(id, patch) {
      guard();
      const existing = ichimokuOverlays.get(id);
      if (!existing) return false;
      if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !["color", "lineWidth", "visible", "title", "tenkanPeriod", "kijunPeriod", "senkouBPeriod", "displacement"].includes(key))) throw Error("Invalid Ichimoku update");
      const options = { ...existing.options, ...patch };
      if (!validIchimokuOptions(options)) throw Error("Invalid Ichimoku configuration");
      addIchimoku(options);
      return true;
    }
    function ichimokuOptions(id) {
      guard();
      const group = ichimokuOverlays.get(id);
      return group ? { ...group.options } : void 0;
    }
    function removeIchimoku(id) {
      guard();
      const group = ichimokuOverlays.get(id);
      if (!group) return false;
      for (const series of group.series) chart.removeSeries(series);
      price.detachPrimitive(group.cloud);
      ichimokuOverlays.delete(id);
      for (const key of ["tenkan", "kijun", "senkouA", "senkouB", "chikou"]) readoutIndicators.delete(id + ":" + key);
      return true;
    }
    function refreshSupertrendOverlays() {
      for (const [id, group] of supertrendOverlays) {
        const result = supertrendData(bars, group.options), up = new Map(result.up.map((point2) => [point2.time, point2.value])), down = new Map(result.down.map((point2) => [point2.time, point2.value]));
        group.up.setData(bars.map((bar) => {
          const value = up.get(bar.time);
          return value === void 0 ? { time: bar.time } : { time: bar.time, value };
        }));
        group.down.setData(bars.map((bar) => {
          const value = down.get(bar.time);
          return value === void 0 ? { time: bar.time } : { time: bar.time, value };
        }));
        group.state = result.state;
        group.beforeLast = result.beforeLast;
        group.lastTime = bars.length ? bars[bars.length - 1].time : null;
        readoutIndicators.set(id, { id, title: group.options.title ?? `Supertrend ${group.options.period} \xD7 ${group.options.multiplier}`, kind: "OVERLAY", values: new Map(result.values.map((point2) => [point2.time, point2.value])), directions: new Map(result.values.map((point2) => [point2.time, point2.trend])) });
      }
    }
    function updateSupertrendLast(group, bar, index, replacing) {
      const prior = replacing ? group.beforeLast : group.state, result = supertrendStep(bars, index, group.options, prior), readout = readoutIndicators.get(group.options.id);
      if (replacing) group.state = result.state;
      else {
        group.beforeLast = group.state;
        group.state = result.state;
      }
      group.lastTime = bar.time;
      const point2 = result.value;
      group.up.update(point2?.trend === "UP" ? { time: bar.time, value: point2.value } : { time: bar.time });
      group.down.update(point2?.trend === "DOWN" ? { time: bar.time, value: point2.value } : { time: bar.time });
      if (readout) {
        readout.values.delete(bar.time);
        readout.directions?.delete(bar.time);
        if (point2) {
          readout.values.set(bar.time, point2.value);
          readout.directions?.set(bar.time, point2.trend);
        }
      }
    }
    function validSupertrendConfiguration(options) {
      const allowed = /* @__PURE__ */ new Set(["id", "period", "multiplier", "color", "lineWidth", "visible", "title"]);
      return !!options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => allowed.has(key)) && (options.title === void 0 || typeof options.title === "string" && options.title.length <= 100 && !/[\u0000-\u001f\u007f]/.test(options.title)) && /^[-_a-zA-Z0-9]{1,32}$/.test(options.id) && colorPattern.test(options.color) && Number.isInteger(options.period) && options.period >= 2 && options.period <= 200 && Number.isFinite(options.multiplier) && options.multiplier >= 0.1 && options.multiplier <= 10 && Math.abs(options.multiplier * 10 - Math.round(options.multiplier * 10)) <= 1e-8 && (options.lineWidth === void 0 || Number.isInteger(options.lineWidth) && options.lineWidth >= 1 && options.lineWidth <= 4) && (options.visible === void 0 || typeof options.visible === "boolean");
    }
    function addSupertrend(options) {
      guard();
      if (!validSupertrendConfiguration(options)) throw Error("Invalid Supertrend configuration");
      if (oscillators.has(options.id) || averages.has(options.id) || donchianOverlays.has(options.id) || linearRegressionOverlays.has(options.id) || (keltnerOverlays.has(options.id) || atrBandsOverlays.has(options.id)) || supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || (ichimokuOverlays.has(options.id) || pivotOverlays.has(options.id)) || paneLines.has(options.id) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id) || bollingerOverlays.has(options.id) || sessionVwapOverlays.has(options.id)) throw Error("Duplicate chart object identity");
      if (indicatorInstanceCount() >= maxIndicatorInstances) throw Error("Indicator instance limit");
      const normalized = { ...options, visible: options.visible ?? true }, title = options.title ?? `Supertrend ${options.period} \xD7 ${options.multiplier}`;
      const up = newLine({ id: options.id + "-up", color: options.color, lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: title + " \xB7 Aufw\xE4rtstrend" });
      const down = newLine({ id: options.id + "-down", color: "#f47789", lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: title + " \xB7 Abw\xE4rtstrend" });
      const group = { options: normalized, up, down, state: initialSupertrendState(), beforeLast: initialSupertrendState(), lastTime: null };
      supertrendOverlays.set(options.id, group);
      refreshSupertrendOverlays();
      persistDrawings();
    }
    function updateSupertrend(id, patch) {
      guard();
      const group = supertrendOverlays.get(id);
      if (!group) throw Error("Unknown Supertrend instance");
      const patchKeys = /* @__PURE__ */ new Set(["period", "multiplier", "color", "lineWidth", "visible", "title"]);
      if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !patchKeys.has(key))) throw Error("Invalid Supertrend configuration");
      const next = { ...group.options, ...patch };
      if (!validSupertrendConfiguration(next)) throw Error("Invalid Supertrend configuration");
      const visible = next.visible ?? true, title = next.title ?? `Supertrend ${next.period} \xD7 ${next.multiplier}`;
      group.up.applyOptions({ color: next.color, lineWidth: next.lineWidth ?? 2, visible, title: title + " \xB7 Aufw\xE4rtstrend" });
      group.down.applyOptions({ color: "#f47789", lineWidth: next.lineWidth ?? 2, visible, title: title + " \xB7 Abw\xE4rtstrend" });
      group.options = next;
      refreshSupertrendOverlays();
      persistDrawings();
      return { ...next };
    }
    function removeSupertrend(id) {
      guard();
      const group = supertrendOverlays.get(id);
      if (!group) return false;
      chart.removeSeries(group.up);
      chart.removeSeries(group.down);
      supertrendOverlays.delete(id);
      readoutIndicators.delete(id);
      persistDrawings();
      return true;
    }
    function supertrendOptions(id) {
      guard();
      const options = supertrendOverlays.get(id)?.options;
      return options ? { ...options } : null;
    }
    function refreshParabolicSar() {
      for (const [id, group] of parabolicSarOverlays) {
        const result = parabolicSarData(bars, group.options), up = new Map(result.up.map((point2) => [point2.time, point2.value])), down = new Map(result.down.map((point2) => [point2.time, point2.value]));
        group.up.setData(bars.map((bar) => {
          const value = up.get(bar.time);
          return value === void 0 ? { time: bar.time } : { time: bar.time, value };
        }));
        group.down.setData(bars.map((bar) => {
          const value = down.get(bar.time);
          return value === void 0 ? { time: bar.time } : { time: bar.time, value };
        }));
        group.state = result.state;
        group.beforeLast = result.beforeLast;
        group.lastTime = bars.length ? bars[bars.length - 1].time : null;
        readoutIndicators.set(id, { id, title: group.options.title ?? "Parabolic SAR", kind: "OVERLAY", values: new Map(result.values.map((point2) => [point2.time, point2.value])), directions: new Map(result.values.map((point2) => [point2.time, point2.trend])) });
      }
    }
    function updateParabolicSarLast(group, bar, index, replacing) {
      const prior = replacing ? group.beforeLast : group.state, result = parabolicSarStep(bars, index, group.options, prior), readout = readoutIndicators.get(group.options.id);
      if (replacing) group.state = result.state;
      else {
        group.beforeLast = group.state;
        group.state = result.state;
      }
      group.lastTime = bar.time;
      group.up.update(result.value?.trend === "UP" ? { time: bar.time, value: result.value.value } : { time: bar.time });
      group.down.update(result.value?.trend === "DOWN" ? { time: bar.time, value: result.value.value } : { time: bar.time });
      if (readout) {
        readout.values.delete(bar.time);
        readout.directions?.delete(bar.time);
        if (result.value) {
          readout.values.set(bar.time, result.value.value);
          readout.directions?.set(bar.time, result.value.trend);
        }
      }
    }
    function validParabolicSar(options) {
      const afValid = (value, min, max) => Number.isFinite(value) && value >= min && value <= max && Math.abs(value * 100 - Math.round(value * 100)) <= 1e-8;
      const allowed = /* @__PURE__ */ new Set(["id", "step", "maxStep", "color", "lineWidth", "visible", "title"]);
      return !!options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => allowed.has(key)) && (options.title === void 0 || typeof options.title === "string" && options.title.length <= 100 && !/[\u0000-\u001f\u007f]/.test(options.title)) && /^[-_a-zA-Z0-9]{1,32}$/.test(options.id) && colorPattern.test(options.color) && afValid(options.step, 0.01, 0.1) && afValid(options.maxStep, 0.01, 0.5) && options.maxStep >= options.step && (options.lineWidth === void 0 || Number.isInteger(options.lineWidth) && options.lineWidth >= 1 && options.lineWidth <= 4) && (options.visible === void 0 || typeof options.visible === "boolean");
    }
    function addParabolicSar(options) {
      guard();
      if (!validParabolicSar(options)) throw Error("Invalid Parabolic SAR configuration");
      if (averages.has(options.id) || managedMovingAverages.has(options.id) || oscillators.has(options.id) || paneLines.has(options.id) || donchianOverlays.has(options.id) || bollingerOverlays.has(options.id) || (keltnerOverlays.has(options.id) || atrBandsOverlays.has(options.id)) || linearRegressionOverlays.has(options.id) || supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || (ichimokuOverlays.has(options.id) || pivotOverlays.has(options.id)) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id) || sessionVwapOverlays.has(options.id)) throw Error("Duplicate chart object identity");
      if (indicatorInstanceCount() >= maxIndicatorInstances) throw Error("Indicator instance limit");
      const normalized = { ...options, visible: options.visible ?? true }, title = options.title ?? "Parabolic SAR";
      const up = newLine({ id: options.id + "-up", color: options.color, lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: title + " \xB7 Aufw\xE4rtstrend" });
      const down = newLine({ id: options.id + "-down", color: "#f47789", lineWidth: options.lineWidth ?? 2, visible: normalized.visible, title: title + " \xB7 Abw\xE4rtstrend" });
      parabolicSarOverlays.set(options.id, { options: normalized, up, down, state: initialParabolicSarState(), beforeLast: initialParabolicSarState(), lastTime: null });
      refreshParabolicSar();
      persistDrawings();
    }
    function updateParabolicSar(id, patch) {
      guard();
      const group = parabolicSarOverlays.get(id);
      if (!group) throw Error("Unknown Parabolic SAR instance");
      if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !["step", "maxStep", "color", "lineWidth", "visible", "title"].includes(key))) throw Error("Invalid Parabolic SAR configuration");
      const next = { ...group.options, ...patch };
      if (!validParabolicSar(next)) throw Error("Invalid Parabolic SAR configuration");
      const visible = next.visible ?? true, title = next.title ?? "Parabolic SAR";
      group.up.applyOptions({ color: next.color, lineWidth: next.lineWidth ?? 2, visible, title: title + " \xB7 Aufw\xE4rtstrend" });
      group.down.applyOptions({ color: "#f47789", lineWidth: next.lineWidth ?? 2, visible, title: title + " \xB7 Abw\xE4rtstrend" });
      group.options = next;
      refreshParabolicSar();
      persistDrawings();
      return { ...next };
    }
    function removeParabolicSar(id) {
      guard();
      const group = parabolicSarOverlays.get(id);
      if (!group) return false;
      chart.removeSeries(group.up);
      chart.removeSeries(group.down);
      parabolicSarOverlays.delete(id);
      readoutIndicators.delete(id);
      persistDrawings();
      return true;
    }
    function parabolicSarOptions(id) {
      guard();
      const options = parabolicSarOverlays.get(id)?.options;
      return options ? { ...options } : null;
    }
    function refreshManagedMovingAverages() {
      for (const [id, state] of managedMovingAverages) {
        const { options } = state, calculation = movingAverageData(bars, options);
        state.base = new Map(calculation.base.map((point2) => [point2.time, point2.value]));
        applyAverageData({ id: options.id, color: options.color, lineWidth: options.lineWidth, visible: options.visible, title: options.title ?? `${options.type} ${options.period}` }, calculation.points);
      }
    }
    function updateManagedMovingAverage(id, state) {
      const { options } = state, index = bars.length - 1, bar = bars[index], { period, type, source = "close", displayShift = 0 } = options;
      let value = null;
      const sourceValue = (item) => source === "hl2" ? (item.high + item.low) / 2 : source === "hlc3" ? (item.high + item.low + item.close) / 3 : source === "ohlc4" ? (item.open + item.high + item.low + item.close) / 4 : item[source];
      if (index >= period - 1) {
        const current = sourceValue(bar), prior = index > 0 ? state.base.get(bars[index - 1].time) : void 0;
        if (type === "EMA" || type === "RMA" || type === "SMMA") {
          if (prior !== void 0) value = type === "EMA" ? prior + 2 / (period + 1) * (current - prior) : prior + (current - prior) / period;
          else {
            const recalculated = movingAverageData(bars, options).base;
            value = recalculated.length ? recalculated[recalculated.length - 1].value : null;
          }
        } else {
          const start = index - period + 1, window2 = bars.slice(start, index + 1);
          let sum = 0, weighted = 0;
          for (let i = 0; i < window2.length; i++) {
            const sample = sourceValue(window2[i]);
            sum += sample;
            if (type === "WMA") weighted += (i + 1) * sample;
          }
          value = type === "SMA" ? sum / period : weighted / (period * (period + 1) / 2);
        }
      }
      if (value === null) state.base.delete(bar.time);
      else state.base.set(bar.time, value);
      const series = averages.get(id), readout = readoutIndicators.get(id);
      if (!series || !readout) return;
      const targetIndex = index + displayShift;
      if (value !== null && targetIndex >= 0 && targetIndex < bars.length) {
        const target = bars[targetIndex];
        series.update({ time: target.time, value });
        readout.values.set(target.time, value);
      }
      if (displayShift > 0) {
        const revealedIndex = index - displayShift;
        if (revealedIndex >= 0) {
          const revealed = state.base.get(bars[revealedIndex].time);
          if (revealed !== void 0) {
            series.update({ time: bar.time, value: revealed });
            readout.values.set(bar.time, revealed);
          }
        }
      }
    }
    function validatePriceLevel(opts) {
      if (!opts || !/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id) || !colorPattern.test(opts.color) || !Number.isFinite(opts.price) || opts.price <= 0 || opts.visible !== void 0 && typeof opts.visible !== "boolean" || opts.locked !== void 0 && typeof opts.locked !== "boolean")
        throw Error("Invalid price level");
    }
    function addPriceLevel(opts) {
      guard();
      validatePriceLevel(opts);
      if (supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || (ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id)) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || (keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id)) || averages.has(opts.id) || paneLines.has(opts.id) || timeMarkers.has(opts.id) || textAnnotations.has(opts.id) || trendLines.has(opts.id) || rectangles.has(opts.id) || rays.has(opts.id) || fibonacci.has(opts.id) || fibonacciFans.has(opts.id) || trendBasedFibonaccis.has(opts.id) || fibonacciTimeZones.has(opts.id) || channels.has(opts.id) || pitchforks.has(opts.id) || measurements.has(opts.id) || riskRewards.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      const existing = priceLevels.get(opts.id);
      const options = { ...opts, visible: opts.visible ?? existing?.options.visible ?? true, locked: opts.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(opts.id);
        existing.primitive.set(options.price, options.color, options.visible);
        existing.options = options;
        recordDrawingChange(opts.id, before, snapshotDrawing(opts.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new PriceLevelPrimitive(opts.id, options.price, options.color, options.visible);
      price.attachPrimitive(primitive);
      priceLevels.set(opts.id, { primitive, options });
      recordDrawingChange(opts.id, null, snapshotDrawing(opts.id));
    }
    function updatePriceLevel(id, patch) {
      guard();
      const item = priceLevels.get(id);
      if (!item) throw Error("Unknown price level");
      const before = snapshotDrawing(id);
      const options = { ...item.options, ...patch };
      validatePriceLevel(options);
      item.primitive.set(options.price, options.color, options.visible);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removePriceLevel(id) {
      guard();
      const item = priceLevels.get(id);
      if (!item) return false;
      if (activeDrag?.id === id) finishDrag(true);
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      priceLevels.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function validateTimeMarker(opts, requireLoadedTime = true) {
      if (!opts || !/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id) || !colorPattern.test(opts.color) || !Number.isSafeInteger(opts.time) || opts.time <= 0 || !Number.isFinite(new Date(opts.time * 1e3).getTime()) || requireLoadedTime && !barsByTime.has(opts.time) || opts.visible !== void 0 && typeof opts.visible !== "boolean" || opts.locked !== void 0 && typeof opts.locked !== "boolean")
        throw Error("Invalid or unloaded UTC time marker");
    }
    function addTimeMarker(opts, requireLoadedTime = true) {
      guard();
      validateTimeMarker(opts, requireLoadedTime);
      if (supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || (ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id)) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || (keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id)) || averages.has(opts.id) || paneLines.has(opts.id) || priceLevels.has(opts.id) || textAnnotations.has(opts.id) || trendLines.has(opts.id) || rectangles.has(opts.id) || rays.has(opts.id) || fibonacci.has(opts.id) || fibonacciFans.has(opts.id) || trendBasedFibonaccis.has(opts.id) || fibonacciTimeZones.has(opts.id) || channels.has(opts.id) || pitchforks.has(opts.id) || measurements.has(opts.id) || riskRewards.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      const existing = timeMarkers.get(opts.id);
      const options = { ...opts, visible: opts.visible ?? existing?.options.visible ?? true, locked: opts.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(opts.id);
        existing.primitive.set(options.time, options.color, options.visible);
        existing.options = options;
        recordDrawingChange(opts.id, before, snapshotDrawing(opts.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new TimeMarkerPrimitive(opts.id, options.time, options.color, options.visible);
      price.attachPrimitive(primitive);
      timeMarkers.set(opts.id, { primitive, options });
      recordDrawingChange(opts.id, null, snapshotDrawing(opts.id));
    }
    function updateTimeMarker(id, patch) {
      guard();
      const item = timeMarkers.get(id);
      if (!item) throw Error("Unknown time marker");
      const before = snapshotDrawing(id);
      const options = { ...item.options, ...patch };
      validateTimeMarker(options, patch.time !== void 0);
      item.primitive.set(options.time, options.color, options.visible);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeTimeMarker(id) {
      guard();
      const item = timeMarkers.get(id);
      if (!item) return false;
      if (activeDrag?.id === id) finishDrag(true);
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      timeMarkers.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function validateTextAnnotation(opts, requireLoadedTime = true) {
      if (!opts || !/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id) || !colorPattern.test(opts.color) || !Number.isSafeInteger(opts.time) || opts.time <= 0 || !Number.isFinite(new Date(opts.time * 1e3).getTime()) || requireLoadedTime && !barsByTime.has(opts.time) || !Number.isFinite(opts.price) || opts.price <= 0 || typeof opts.text !== "string" || !/^[\x20-\x7E]{1,40}$/.test(opts.text) || opts.visible !== void 0 && typeof opts.visible !== "boolean" || opts.locked !== void 0 && typeof opts.locked !== "boolean")
        throw Error("Invalid or unavailable text annotation");
    }
    function addTextAnnotation(opts, requireLoadedTime = true) {
      guard();
      validateTextAnnotation(opts, requireLoadedTime);
      if (supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || (ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id)) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || (keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id)) || averages.has(opts.id) || paneLines.has(opts.id) || priceLevels.has(opts.id) || timeMarkers.has(opts.id) || trendLines.has(opts.id) || rectangles.has(opts.id) || rays.has(opts.id) || fibonacci.has(opts.id) || fibonacciFans.has(opts.id) || trendBasedFibonaccis.has(opts.id) || fibonacciTimeZones.has(opts.id) || channels.has(opts.id) || pitchforks.has(opts.id) || measurements.has(opts.id) || riskRewards.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      const existing = textAnnotations.get(opts.id);
      const options = { ...opts, visible: opts.visible ?? existing?.options.visible ?? true, locked: opts.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(opts.id);
        existing.primitive.set(options);
        existing.options = options;
        recordDrawingChange(opts.id, before, snapshotDrawing(opts.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new TextAnnotationPrimitive(opts.id, options);
      price.attachPrimitive(primitive);
      textAnnotations.set(opts.id, { primitive, options });
      recordDrawingChange(opts.id, null, snapshotDrawing(opts.id));
    }
    function updateTextAnnotation(id, patch) {
      guard();
      const item = textAnnotations.get(id);
      if (!item) throw Error("Unknown text annotation");
      const before = snapshotDrawing(id);
      const options = { ...item.options, ...patch };
      validateTextAnnotation(options, patch.time !== void 0);
      item.primitive.set(options);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeTextAnnotation(id) {
      guard();
      const item = textAnnotations.get(id);
      if (!item) return false;
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      textAnnotations.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function validateTrendLine(opts, requireLoadedAnchors = true) {
      if (!opts || !/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id) || !colorPattern.test(opts.color) || !Number.isSafeInteger(opts.startTime) || !Number.isSafeInteger(opts.endTime) || opts.startTime <= 0 || opts.endTime <= 0 || opts.endTime === opts.startTime || !Number.isFinite(new Date(opts.startTime * 1e3).getTime()) || !Number.isFinite(new Date(opts.endTime * 1e3).getTime()) || requireLoadedAnchors && (!barsByTime.has(opts.startTime) || !barsByTime.has(opts.endTime)) || !Number.isFinite(opts.startPrice) || opts.startPrice <= 0 || !Number.isFinite(opts.endPrice) || opts.endPrice <= 0 || opts.visible !== void 0 && typeof opts.visible !== "boolean" || opts.locked !== void 0 && typeof opts.locked !== "boolean") throw Error("Invalid or unavailable trend line");
    }
    function addTrendLine(opts, requireLoadedAnchors = true) {
      guard();
      validateTrendLine(opts, requireLoadedAnchors);
      if (supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || (ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id)) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || (keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id)) || averages.has(opts.id) || paneLines.has(opts.id) || priceLevels.has(opts.id) || timeMarkers.has(opts.id) || textAnnotations.has(opts.id) || rectangles.has(opts.id) || rays.has(opts.id) || fibonacci.has(opts.id) || fibonacciFans.has(opts.id) || trendBasedFibonaccis.has(opts.id) || fibonacciTimeZones.has(opts.id) || channels.has(opts.id) || pitchforks.has(opts.id) || measurements.has(opts.id) || riskRewards.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      const existing = trendLines.get(opts.id), options = { ...opts, visible: opts.visible ?? existing?.options.visible ?? true, locked: opts.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(opts.id);
        existing.primitive.set(options);
        existing.options = options;
        recordDrawingChange(opts.id, before, snapshotDrawing(opts.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new TrendLinePrimitive(opts.id, options);
      price.attachPrimitive(primitive);
      trendLines.set(opts.id, { primitive, options });
      recordDrawingChange(opts.id, null, snapshotDrawing(opts.id));
    }
    function updateTrendLine(id, patch) {
      guard();
      const item = trendLines.get(id);
      if (!item) throw Error("Unknown trend line");
      const before = snapshotDrawing(id);
      const options = { ...item.options, ...patch };
      validateTrendLine(options, patch.startTime !== void 0 || patch.endTime !== void 0);
      item.primitive.set(options);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeTrendLine(id) {
      guard();
      const item = trendLines.get(id);
      if (!item) return false;
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      trendLines.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function validateRectangle(opts, requireLoadedAnchors = true) {
      validateTrendLine(opts, requireLoadedAnchors);
      if (!opts || typeof opts.fill !== "boolean" || opts.startPrice === opts.endPrice) throw Error("Invalid rectangle fill/geometry");
    }
    function addRectangle(opts, requireLoadedAnchors = true) {
      guard();
      validateRectangle(opts, requireLoadedAnchors);
      if (supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || (ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id)) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || (keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id)) || averages.has(opts.id) || paneLines.has(opts.id) || priceLevels.has(opts.id) || timeMarkers.has(opts.id) || textAnnotations.has(opts.id) || trendLines.has(opts.id) || rays.has(opts.id) || fibonacci.has(opts.id) || fibonacciFans.has(opts.id) || trendBasedFibonaccis.has(opts.id) || fibonacciTimeZones.has(opts.id) || channels.has(opts.id) || pitchforks.has(opts.id) || measurements.has(opts.id) || riskRewards.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      const existing = rectangles.get(opts.id), options = { ...opts, visible: opts.visible ?? existing?.options.visible ?? true, locked: opts.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(opts.id);
        existing.primitive.set(options);
        existing.options = options;
        recordDrawingChange(opts.id, before, snapshotDrawing(opts.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new RectanglePrimitive(opts.id, options);
      price.attachPrimitive(primitive);
      rectangles.set(opts.id, { primitive, options });
      recordDrawingChange(opts.id, null, snapshotDrawing(opts.id));
    }
    function updateRectangle(id, patch) {
      guard();
      const item = rectangles.get(id);
      if (!item) throw Error("Unknown rectangle");
      const before = snapshotDrawing(id);
      const options = { ...item.options, ...patch };
      validateRectangle(options, patch.startTime !== void 0 || patch.endTime !== void 0);
      item.primitive.set(options);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeRectangle(id) {
      guard();
      const item = rectangles.get(id);
      if (!item) return false;
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      rectangles.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function addEllipse(opts, requireLoadedAnchors = true) {
      guard();
      validateTrendLine(opts, requireLoadedAnchors);
      if (opts.startTime === opts.endTime || opts.startPrice === opts.endPrice) throw Error("Invalid ellipse geometry");
      const existing = ellipses.get(opts.id);
      if (supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id) || averages.has(opts.id) || paneLines.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id) || snapshotDrawing(opts.id) && !existing) throw Error("Duplicate chart object identity");
      const options = { ...opts, visible: opts.visible ?? existing?.options.visible ?? true, locked: opts.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(opts.id);
        existing.primitive.set(options);
        existing.options = options;
        recordDrawingChange(opts.id, before, snapshotDrawing(opts.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new EllipsePrimitive(opts.id, options);
      price.attachPrimitive(primitive);
      ellipses.set(opts.id, { primitive, options });
      recordDrawingChange(opts.id, null, snapshotDrawing(opts.id));
    }
    function updateEllipse(id, patch) {
      guard();
      const item = ellipses.get(id);
      if (!item) throw Error("Unknown ellipse");
      const before = snapshotDrawing(id), options = { ...item.options, ...patch };
      validateTrendLine(options, patch.startTime !== void 0 || patch.endTime !== void 0);
      if (options.startTime === options.endTime || options.startPrice === options.endPrice) throw Error("Invalid ellipse geometry");
      item.primitive.set(options);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeEllipse(id) {
      guard();
      const item = ellipses.get(id);
      if (!item) return false;
      if (activeDrag?.id === id) finishDrag(true);
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      ellipses.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function addRay(opts, requireLoadedAnchors = true) {
      guard();
      validateTrendLine(opts, requireLoadedAnchors);
      if (supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || (ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id)) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || (keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id)) || averages.has(opts.id) || paneLines.has(opts.id) || priceLevels.has(opts.id) || timeMarkers.has(opts.id) || textAnnotations.has(opts.id) || trendLines.has(opts.id) || rectangles.has(opts.id) || fibonacci.has(opts.id) || fibonacciFans.has(opts.id) || trendBasedFibonaccis.has(opts.id) || fibonacciTimeZones.has(opts.id) || channels.has(opts.id) || pitchforks.has(opts.id) || measurements.has(opts.id) || riskRewards.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      const existing = rays.get(opts.id), options = { ...opts, visible: opts.visible ?? existing?.options.visible ?? true, locked: opts.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(opts.id);
        existing.primitive.set(options);
        existing.options = options;
        recordDrawingChange(opts.id, before, snapshotDrawing(opts.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new RayPrimitive(opts.id, options);
      price.attachPrimitive(primitive);
      rays.set(opts.id, { primitive, options });
      recordDrawingChange(opts.id, null, snapshotDrawing(opts.id));
    }
    function updateRay(id, patch) {
      guard();
      const item = rays.get(id);
      if (!item) throw Error("Unknown ray");
      const before = snapshotDrawing(id);
      const options = { ...item.options, ...patch };
      validateTrendLine(options, patch.startTime !== void 0 || patch.endTime !== void 0);
      item.primitive.set(options);
      item.options = options;
      recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeRay(id) {
      guard();
      const item = rays.get(id);
      if (!item) return false;
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      rays.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function normalizeFibonacciOptions(opts, requireLoadedAnchors = true) {
      validateTrendLine(opts, requireLoadedAnchors);
      if (opts.levels === void 0) {
        const base = { ...opts };
        delete base.levels;
        return base;
      }
      if (!Array.isArray(opts.levels) || opts.levels.length < 1 || opts.levels.length > 16 || opts.levels.some((level, index) => !Number.isFinite(level) || level < -1e3 || level > 1e3 || index > 0 && level <= opts.levels[index - 1])) throw Error("Invalid Fibonacci levels");
      return { ...opts, levels: [...opts.levels] };
    }
    function fibonacciLevels(id) {
      guard();
      const item = fibonacci.get(id);
      if (!item) return null;
      return fibonacciRatios(item.options).map(({ level, ratio }) => ({ level, ratio, price: item.options.startPrice + (item.options.endPrice - item.options.startPrice) * ratio }));
    }
    function addFibonacci(opts, requireLoadedAnchors = true) {
      guard();
      const normalized = normalizeFibonacciOptions(opts, requireLoadedAnchors);
      if (supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || (ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id)) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || (keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id)) || averages.has(opts.id) || paneLines.has(opts.id) || priceLevels.has(opts.id) || timeMarkers.has(opts.id) || textAnnotations.has(opts.id) || trendLines.has(opts.id) || rectangles.has(opts.id) || ellipses.has(opts.id) || rays.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      const existing = fibonacci.get(opts.id), options = { ...normalized, visible: normalized.visible ?? existing?.options.visible ?? true, locked: normalized.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(opts.id);
        existing.primitive.set(options);
        existing.options = options;
        recordDrawingChange(opts.id, before, snapshotDrawing(opts.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new FibonacciPrimitive(opts.id, options);
      price.attachPrimitive(primitive);
      fibonacci.set(opts.id, { primitive, options });
      recordDrawingChange(opts.id, null, snapshotDrawing(opts.id));
    }
    function updateFibonacci(id, patch) {
      guard();
      const item = fibonacci.get(id);
      if (!item) throw Error("Unknown Fibonacci drawing");
      const before = snapshotDrawing(id);
      const options = normalizeFibonacciOptions({ ...item.options, ...patch }, patch.startTime !== void 0 || patch.endTime !== void 0);
      item.primitive.set(options);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeFibonacci(id) {
      guard();
      const item = fibonacci.get(id);
      if (!item) return false;
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      fibonacci.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function normalizeFibonacciFanOptions(options, requireLoadedAnchors = true) {
      validateTrendLine(options, requireLoadedAnchors);
      const ratios = options.ratios ?? [...FIBONACCI_FAN_RATIOS];
      if (!Array.isArray(ratios) || ratios.length < 1 || ratios.length > 16 || ratios.some((ratio, index) => !Number.isFinite(ratio) || ratio <= 0 || ratio >= 1 || index > 0 && ratio <= ratios[index - 1])) throw Error("Invalid Fibonacci Fan ratios");
      return { ...options, ratios: [...ratios] };
    }
    function fibonacciFanRays(id) {
      guard();
      const item = fibonacciFans.get(id);
      return item?.primitive.coordinates()?.rays.map((ray) => ({ ...ray })) ?? null;
    }
    function addFibonacciFan(options, requireLoadedAnchors = true) {
      guard();
      const normalized = normalizeFibonacciFanOptions(options, requireLoadedAnchors);
      if (supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || (ichimokuOverlays.has(options.id) || pivotOverlays.has(options.id)) || oscillators.has(options.id) || donchianOverlays.has(options.id) || linearRegressionOverlays.has(options.id) || (keltnerOverlays.has(options.id) || atrBandsOverlays.has(options.id)) || averages.has(options.id) || paneLines.has(options.id) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || ellipses.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id) || bollingerOverlays.has(options.id) || sessionVwapOverlays.has(options.id)) throw Error("Duplicate chart object identity");
      const existing = fibonacciFans.get(options.id), next = { ...normalized, visible: normalized.visible ?? existing?.options.visible ?? true, locked: normalized.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(options.id);
        existing.primitive.set(next);
        existing.options = next;
        recordDrawingChange(options.id, before, snapshotDrawing(options.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new FibonacciFanPrimitive(options.id, next);
      price.attachPrimitive(primitive);
      fibonacciFans.set(options.id, { primitive, options: next });
      recordDrawingChange(options.id, null, snapshotDrawing(options.id));
    }
    function updateFibonacciFan(id, patch) {
      guard();
      const item = fibonacciFans.get(id);
      if (!item) throw Error("Unknown Fibonacci Fan");
      const before = snapshotDrawing(id), options = normalizeFibonacciFanOptions({ ...item.options, ...patch }, patch.startTime !== void 0 || patch.endTime !== void 0);
      item.primitive.set(options);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeFibonacciFan(id) {
      guard();
      const item = fibonacciFans.get(id);
      if (!item) return false;
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      fibonacciFans.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function normalizeTrendBasedFibonacciOptions(options, requireLoadedAnchors = true) {
      const times = [options?.startTime, options?.endTime, options?.thirdTime], prices = [options?.startPrice, options?.endPrice, options?.thirdPrice], ratios = options?.ratios ?? [...TREND_FIB_RATIOS];
      if (!options || !/^[-_a-zA-Z0-9]{1,32}$/.test(options.id) || !colorPattern.test(options.color) || times.some((time) => !Number.isSafeInteger(time) || time <= 0 || !Number.isFinite(new Date(time * 1e3).getTime())) || new Set(times).size !== 3 || requireLoadedAnchors && times.some((time) => !barsByTime.has(time)) || prices.some((price2) => !Number.isFinite(price2) || price2 <= 0) || !Array.isArray(ratios) || ratios.length < 1 || ratios.length > 16 || ratios.some((ratio, index) => !Number.isFinite(ratio) || ratio < 0 || ratio > 10 || index > 0 && ratio <= ratios[index - 1]) || options.visible !== void 0 && typeof options.visible !== "boolean" || options.locked !== void 0 && typeof options.locked !== "boolean") throw Error("Invalid or unavailable Trend-Based Fibonacci");
      return { ...options, ratios: [...ratios] };
    }
    function trendBasedFibonacciLevels(id) {
      guard();
      const item = trendBasedFibonaccis.get(id);
      return item?.primitive.coordinates()?.levels.map((level) => ({ ...level })) ?? null;
    }
    function addTrendBasedFibonacci(options, requireLoadedAnchors = true) {
      guard();
      const normalized = normalizeTrendBasedFibonacciOptions(options, requireLoadedAnchors);
      if (supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || (ichimokuOverlays.has(options.id) || pivotOverlays.has(options.id)) || oscillators.has(options.id) || donchianOverlays.has(options.id) || linearRegressionOverlays.has(options.id) || (keltnerOverlays.has(options.id) || atrBandsOverlays.has(options.id)) || averages.has(options.id) || paneLines.has(options.id) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || ellipses.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id) || bollingerOverlays.has(options.id) || sessionVwapOverlays.has(options.id)) throw Error("Duplicate chart object identity");
      const next = { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false };
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new TrendBasedFibonacciPrimitive(options.id, next);
      price.attachPrimitive(primitive);
      trendBasedFibonaccis.set(options.id, { primitive, options: next });
      recordDrawingChange(options.id, null, snapshotDrawing(options.id));
    }
    function updateTrendBasedFibonacci(id, patch) {
      guard();
      const item = trendBasedFibonaccis.get(id);
      if (!item) throw Error("Unknown Trend-Based Fibonacci");
      if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !["startTime", "startPrice", "endTime", "endPrice", "thirdTime", "thirdPrice", "color", "ratios", "visible", "locked"].includes(key))) throw Error("Invalid Trend-Based Fibonacci update");
      const before = snapshotDrawing(id), options = normalizeTrendBasedFibonacciOptions({ ...item.options, ...patch }, ["startTime", "endTime", "thirdTime"].some((key) => key in patch));
      item.primitive.set(options);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeTrendBasedFibonacci(id) {
      guard();
      const item = trendBasedFibonaccis.get(id);
      if (!item) return false;
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      trendBasedFibonaccis.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function validateFibonacciTimeZone(options, requireLoadedAnchors = true) {
      const validTime = (value) => Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value * 1e3).getTime());
      if (!options || !/^[-_a-zA-Z0-9]{1,32}$/.test(options.id) || !colorPattern.test(options.color) || !validTime(options.startTime) || !validTime(options.endTime) || options.startTime === options.endTime || requireLoadedAnchors && (!barsByTime.has(options.startTime) || !barsByTime.has(options.endTime)) || options.visible !== void 0 && typeof options.visible !== "boolean" || options.locked !== void 0 && typeof options.locked !== "boolean") throw Error("Invalid or unavailable Fibonacci Time Zones");
    }
    function fibonacciTimeZoneGuides(id) {
      guard();
      const item = fibonacciTimeZones.get(id);
      return item?.primitive.coordinates()?.map((guide) => ({ ...guide })) ?? null;
    }
    function addFibonacciTimeZone(options, requireLoadedAnchors = true) {
      guard();
      validateFibonacciTimeZone(options, requireLoadedAnchors);
      if (averages.has(options.id) || paneLines.has(options.id) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id) || fibonacciTimeZones.has(options.id) || oscillators.has(options.id) || donchianOverlays.has(options.id) || bollingerOverlays.has(options.id) || keltnerOverlays.has(options.id) || atrBandsOverlays.has(options.id) || linearRegressionOverlays.has(options.id) || supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || ichimokuOverlays.has(options.id) || pivotOverlays.has(options.id) || sessionVwapOverlays.has(options.id)) throw Error("Duplicate chart object identity");
      const existing = fibonacciTimeZones.get(options.id), normalized = { ...options, visible: options.visible ?? existing?.options.visible ?? true, locked: options.locked ?? existing?.options.locked ?? false };
      if (existing) {
        existing.primitive.setOptions(normalized);
        existing.options = normalized;
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new FibonacciTimeZonePrimitive(normalized);
      price.attachPrimitive(primitive);
      fibonacciTimeZones.set(options.id, { primitive, options: normalized });
      recordDrawingChange(options.id, null, snapshotDrawing(options.id));
    }
    function updateFibonacciTimeZone(id, patch) {
      guard();
      const item = fibonacciTimeZones.get(id);
      if (!item) throw Error("Unknown Fibonacci Time Zones drawing");
      const before = snapshotDrawing(id), options = { ...item.options, ...patch };
      validateFibonacciTimeZone(options, patch.startTime !== void 0 || patch.endTime !== void 0);
      item.primitive.setOptions(options);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeFibonacciTimeZone(id) {
      guard();
      const item = fibonacciTimeZones.get(id);
      if (!item) return false;
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      fibonacciTimeZones.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function validateChannel(opts, requireLoadedAnchors = true) {
      const timeValid = (value) => Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value * 1e3).getTime());
      if (!opts || !/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id) || !colorPattern.test(opts.color) || !timeValid(opts.startTime) || !timeValid(opts.endTime) || !timeValid(opts.offsetTime) || opts.startTime === opts.endTime && opts.startPrice === opts.endPrice || requireLoadedAnchors && (!barsByTime.has(opts.startTime) || !barsByTime.has(opts.endTime) || !barsByTime.has(opts.offsetTime)) || !Number.isFinite(opts.startPrice) || opts.startPrice <= 0 || !Number.isFinite(opts.endPrice) || opts.endPrice <= 0 || !Number.isFinite(opts.offsetPrice) || opts.offsetPrice <= 0 || opts.visible !== void 0 && typeof opts.visible !== "boolean" || opts.locked !== void 0 && typeof opts.locked !== "boolean") throw Error("Invalid or unavailable channel");
      if (requireLoadedAnchors) {
        const ax = chart.timeScale().timeToCoordinate(opts.startTime), bx = chart.timeScale().timeToCoordinate(opts.endTime), cx = chart.timeScale().timeToCoordinate(opts.offsetTime);
        const ay = price.priceToCoordinate(opts.startPrice), by = price.priceToCoordinate(opts.endPrice), cy = price.priceToCoordinate(opts.offsetPrice);
        if (ax !== null && bx !== null && cx !== null && ay !== null && by !== null && cy !== null) {
          const slope = Math.abs(bx - ax) < 1e-7 ? 0 : (by - ay) / (bx - ax), shift = cy - (ay + slope * (cx - ax));
          if (Math.abs(shift) < 0.5) throw Error("Channel offset must be nonzero");
        }
      }
    }
    function measurementLabel(options) {
      const read = measurementReadoutValue(options);
      return `${read.priceDelta >= 0 ? "+" : ""}${read.priceDelta.toFixed(2)} (${read.percentChange >= 0 ? "+" : ""}${read.percentChange.toFixed(2)}%) \xB7 ${read.bars} bars`;
    }
    function measurementReadoutValue(options) {
      const start = barsByTime.get(options.startTime), end = barsByTime.get(options.endTime);
      if (!start || !end) throw Error("Invalid or unavailable measurement");
      return { priceDelta: options.endPrice - options.startPrice, percentChange: (options.endPrice - options.startPrice) / options.startPrice * 100, bars: Math.abs(bars.indexOf(end) - bars.indexOf(start)) };
    }
    function addMeasurement(opts) {
      guard();
      validateTrendLine(opts, true);
      if (supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || (ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id)) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || (keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id)) || averages.has(opts.id) || paneLines.has(opts.id) || priceLevels.has(opts.id) || timeMarkers.has(opts.id) || textAnnotations.has(opts.id) || trendLines.has(opts.id) || rectangles.has(opts.id) || ellipses.has(opts.id) || rays.has(opts.id) || fibonacci.has(opts.id) || fibonacciFans.has(opts.id) || trendBasedFibonaccis.has(opts.id) || fibonacciTimeZones.has(opts.id) || channels.has(opts.id) || pitchforks.has(opts.id) || measurements.has(opts.id) || riskRewards.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      const existing = measurements.get(opts.id), options = { ...opts, visible: opts.visible ?? existing?.options.visible ?? true, locked: opts.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(opts.id);
        existing.primitive.set(options);
        existing.options = options;
        recordDrawingChange(opts.id, before, snapshotDrawing(opts.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new MeasurementPrimitive(opts.id, options, measurementLabel(options));
      price.attachPrimitive(primitive);
      measurements.set(opts.id, { primitive, options });
      recordDrawingChange(opts.id, null, snapshotDrawing(opts.id));
    }
    function updateMeasurement(id, patch) {
      guard();
      const item = measurements.get(id);
      if (!item) throw Error("Unknown measurement");
      const before = snapshotDrawing(id), options = { ...item.options, ...patch };
      validateTrendLine(options, patch.startTime !== void 0 || patch.endTime !== void 0);
      const label = measurementLabel(options);
      item.primitive.set(options);
      item.primitive.setReadout(label);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeMeasurement(id) {
      guard();
      const item = measurements.get(id);
      if (!item) return false;
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      measurements.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function measurementReadout(id) {
      guard();
      const item = measurements.get(id);
      return item ? measurementReadoutValue(item.options) : null;
    }
    function addChannel(opts, requireLoadedAnchors = true) {
      guard();
      validateChannel(opts, requireLoadedAnchors);
      if (supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || (ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id)) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || (keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id)) || averages.has(opts.id) || paneLines.has(opts.id) || priceLevels.has(opts.id) || timeMarkers.has(opts.id) || textAnnotations.has(opts.id) || trendLines.has(opts.id) || rectangles.has(opts.id) || ellipses.has(opts.id) || rays.has(opts.id) || fibonacci.has(opts.id) || fibonacciFans.has(opts.id) || trendBasedFibonaccis.has(opts.id) || fibonacciTimeZones.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      const existing = channels.get(opts.id), options = { ...opts, visible: opts.visible ?? existing?.options.visible ?? true, locked: opts.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(opts.id);
        existing.primitive.set(options);
        existing.options = options;
        recordDrawingChange(opts.id, before, snapshotDrawing(opts.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new ChannelPrimitive(opts.id, options);
      price.attachPrimitive(primitive);
      channels.set(opts.id, { primitive, options });
      recordDrawingChange(opts.id, null, snapshotDrawing(opts.id));
    }
    function updateChannel(id, patch) {
      guard();
      const item = channels.get(id);
      if (!item) throw Error("Unknown channel");
      const before = snapshotDrawing(id), options = { ...item.options, ...patch };
      validateChannel(options, patch.startTime !== void 0 || patch.endTime !== void 0 || patch.offsetTime !== void 0);
      item.primitive.set(options);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeChannel(id) {
      guard();
      const item = channels.get(id);
      if (!item) return false;
      if (activeDrag?.id === id) finishDrag(true);
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      channels.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function validatePitchfork(opts, requireLoadedAnchors = true) {
      const validTime = (value) => Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value * 1e3).getTime());
      if (!opts || !/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id) || !colorPattern.test(opts.color) || !validTime(opts.startTime) || !validTime(opts.endTime) || !validTime(opts.thirdTime) || opts.startTime >= opts.endTime || opts.startTime >= opts.thirdTime || opts.endTime === opts.thirdTime || requireLoadedAnchors && (!barsByTime.has(opts.startTime) || !barsByTime.has(opts.endTime) || !barsByTime.has(opts.thirdTime)) || !Number.isFinite(opts.startPrice) || opts.startPrice <= 0 || !Number.isFinite(opts.endPrice) || opts.endPrice <= 0 || !Number.isFinite(opts.thirdPrice) || opts.thirdPrice <= 0 || opts.visible !== void 0 && typeof opts.visible !== "boolean" || opts.locked !== void 0 && typeof opts.locked !== "boolean") throw Error("Invalid or unavailable Pitchfork");
      if (requireLoadedAnchors) {
        const xs2 = [opts.startTime, opts.endTime, opts.thirdTime].map((time) => chart.timeScale().timeToCoordinate(time)), ys2 = [opts.startPrice, opts.endPrice, opts.thirdPrice].map((value) => price.priceToCoordinate(value));
        if (xs2.some((value) => value === null) || ys2.some((value) => value === null)) throw Error("Pitchfork anchors are outside the loaded chart");
      }
    }
    function addPitchfork(opts) {
      guard();
      validatePitchfork(opts);
      if (averages.has(opts.id) || paneLines.has(opts.id) || priceLevels.has(opts.id) || timeMarkers.has(opts.id) || textAnnotations.has(opts.id) || trendLines.has(opts.id) || rectangles.has(opts.id) || rays.has(opts.id) || fibonacci.has(opts.id) || fibonacciFans.has(opts.id) || trendBasedFibonaccis.has(opts.id) || fibonacciTimeZones.has(opts.id) || channels.has(opts.id) || measurements.has(opts.id) || riskRewards.has(opts.id) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || bollingerOverlays.has(opts.id) || keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      const existing = pitchforks.get(opts.id), options = { ...opts, visible: opts.visible ?? existing?.options.visible ?? true, locked: opts.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(opts.id);
        existing.primitive.set(options);
        existing.options = options;
        recordDrawingChange(opts.id, before, snapshotDrawing(opts.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new PitchforkPrimitive(opts.id, options);
      price.attachPrimitive(primitive);
      pitchforks.set(opts.id, { primitive, options });
      recordDrawingChange(opts.id, null, snapshotDrawing(opts.id));
    }
    function updatePitchfork(id, patch) {
      guard();
      const item = pitchforks.get(id);
      if (!item) throw Error("Unknown Pitchfork");
      const before = snapshotDrawing(id), options = { ...item.options, ...patch }, anchorChanged = patch.startTime !== void 0 || patch.startPrice !== void 0 || patch.endTime !== void 0 || patch.endPrice !== void 0 || patch.thirdTime !== void 0 || patch.thirdPrice !== void 0;
      validatePitchfork(options, anchorChanged);
      item.primitive.set(options);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removePitchfork(id) {
      guard();
      const item = pitchforks.get(id);
      if (!item) return false;
      if (activeDrag?.id === id) finishDrag(true);
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      pitchforks.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function validateRiskReward(options, requireLoadedAnchors = true) {
      const validTime = (value) => Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value * 1e3).getTime());
      if (!options || !/^[-_a-zA-Z0-9]{1,32}$/.test(options.id) || !validTime(options.startTime) || !validTime(options.stopTime) || !validTime(options.endTime) || options.startTime === options.endTime || requireLoadedAnchors && (!barsByTime.has(options.startTime) || !barsByTime.has(options.stopTime) || !barsByTime.has(options.endTime)) || !Number.isFinite(options.entryPrice) || options.entryPrice <= 0 || !Number.isFinite(options.stopPrice) || options.stopPrice <= 0 || !Number.isFinite(options.targetPrice) || options.targetPrice <= 0 || (options.stopPrice - options.entryPrice) * (options.targetPrice - options.entryPrice) >= 0 || options.visible !== void 0 && typeof options.visible !== "boolean" || options.locked !== void 0 && typeof options.locked !== "boolean") throw Error("Invalid or unavailable risk/reward drawing");
    }
    function riskRewardRatio(options) {
      return Math.abs(options.targetPrice - options.entryPrice) / Math.abs(options.entryPrice - options.stopPrice);
    }
    function addRiskReward(options) {
      guard();
      validateRiskReward(options, true);
      if (supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || (ichimokuOverlays.has(options.id) || pivotOverlays.has(options.id)) || oscillators.has(options.id) || donchianOverlays.has(options.id) || linearRegressionOverlays.has(options.id) || (keltnerOverlays.has(options.id) || atrBandsOverlays.has(options.id)) || averages.has(options.id) || paneLines.has(options.id) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || ellipses.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id)) throw Error("Duplicate chart object identity");
      const existing = riskRewards.get(options.id), normalized = { ...options, visible: options.visible ?? existing?.options.visible ?? true, locked: options.locked ?? existing?.options.locked ?? false };
      if (existing) {
        const before = snapshotDrawing(options.id);
        existing.primitive.set(normalized);
        existing.options = normalized;
        recordDrawingChange(options.id, before, snapshotDrawing(options.id));
        return;
      }
      if (drawingCount() >= maxNativeDrawings) throw Error("Native drawing limit");
      const primitive = new RiskRewardPrimitive(options.id, normalized);
      price.attachPrimitive(primitive);
      riskRewards.set(options.id, { primitive, options: normalized });
      recordDrawingChange(options.id, null, snapshotDrawing(options.id));
    }
    function updateRiskReward(id, patch) {
      guard();
      const item = riskRewards.get(id);
      if (!item) throw Error("Unknown risk/reward drawing");
      const before = snapshotDrawing(id), options = { ...item.options, ...patch };
      validateRiskReward(options, patch.startTime !== void 0 || patch.stopTime !== void 0 || patch.endTime !== void 0);
      item.primitive.set(options);
      item.options = options;
      if (activeDrag?.id !== id) recordDrawingChange(id, before, snapshotDrawing(id));
    }
    function removeRiskReward(id) {
      guard();
      const item = riskRewards.get(id);
      if (!item) return false;
      if (activeDrag?.id === id) finishDrag(true);
      const before = snapshotDrawing(id);
      price.detachPrimitive(item.primitive);
      riskRewards.delete(id);
      if (selectedDrawingIds.has(id)) selectDrawings([...selectedDrawingIds].filter((selected) => selected !== id));
      recordDrawingChange(id, before, null);
      return true;
    }
    function drawingPosition(id) {
      guard();
      const rect = host.getBoundingClientRect();
      const priceLevel = priceLevels.get(id);
      if (priceLevel) {
        if (!priceLevel.options.visible) return null;
        const y2 = priceLevel.primitive.coordinate();
        return y2 === null ? null : { x: rect.left + Math.min(40, rect.width / 2), y: rect.top + y2 };
      }
      const timeMarker = timeMarkers.get(id);
      if (timeMarker) {
        if (!timeMarker.options.visible) return null;
        const x2 = timeMarker.primitive.coordinate();
        return x2 === null ? null : { x: rect.left + x2, y: rect.top + Math.min(40, rect.height / 2) };
      }
      const annotation = textAnnotations.get(id);
      if (annotation) {
        if (!annotation.options.visible) return null;
        const point2 = annotation.primitive.coordinate();
        return point2 === null ? null : { x: rect.left + point2.x + 12, y: rect.top + point2.y - 8 };
      }
      const trend = trendLines.get(id);
      if (trend) {
        if (!trend.options.visible) return null;
        const p2 = trend.primitive.coordinates();
        return p2 === null ? null : { x: rect.left + (p2.x1 + p2.x2) / 2, y: rect.top + (p2.y1 + p2.y2) / 2 };
      }
      const zone = rectangles.get(id);
      if (zone) {
        if (!zone.options.visible) return null;
        const p2 = zone.primitive.coordinates();
        return p2 === null ? null : { x: rect.left + (p2.left + p2.right) / 2, y: rect.top + (p2.top + p2.bottom) / 2 };
      }
      const ellipse = ellipses.get(id);
      if (ellipse) {
        if (!ellipse.options.visible) return null;
        const p2 = ellipse.primitive.coordinates();
        return p2 ? { x: rect.left + (p2.x1 + p2.x2) / 2, y: rect.top + (p2.y1 + p2.y2) / 2 } : null;
      }
      const ray = rays.get(id);
      if (ray) {
        if (!ray.options.visible) return null;
        const p2 = ray.primitive.coordinates();
        return p2 === null ? null : { x: rect.left + (p2.x1 + p2.x2) / 2, y: rect.top + (p2.y1 + p2.y2) / 2 };
      }
      const fibo = fibonacci.get(id);
      if (fibo) {
        if (!fibo.options.visible) return null;
        const p2 = fibo.primitive.coordinates();
        if (!p2) return null;
        const level = p2.levels.find((item) => item.ratio === 0.5);
        return level ? { x: rect.left + (p2.x1 + p2.x2) / 2, y: rect.top + level.y } : null;
      }
      const fibFan = fibonacciFans.get(id);
      if (fibFan) {
        if (!fibFan.options.visible) return null;
        const rays2 = fibFan.primitive.coordinates()?.rays;
        if (!rays2?.length) return null;
        const ray2 = rays2[Math.floor(rays2.length / 2)];
        return { x: rect.left + (ray2.x1 + ray2.x2) / 2, y: rect.top + (ray2.y1 + ray2.y2) / 2 };
      }
      const fibTrend = trendBasedFibonaccis.get(id);
      if (fibTrend) {
        if (!fibTrend.options.visible) return null;
        const levels = fibTrend.primitive.coordinates()?.levels;
        if (!levels?.length) return null;
        const level = levels[Math.floor(levels.length / 2)];
        return { x: rect.left + (level.x1 + level.x2) / 2, y: rect.top + level.y };
      }
      const fibTime = fibonacciTimeZones.get(id);
      if (fibTime) {
        if (!fibTime.options.visible) return null;
        const guide = fibTime.primitive.coordinates()?.[0];
        return guide ? { x: rect.left + guide.x, y: rect.top + 20 } : null;
      }
      const channel = channels.get(id);
      if (channel) {
        if (!channel.options.visible) return null;
        const p2 = channel.primitive.coordinates();
        return p2 ? { x: rect.left + (p2.m1.x + p2.m2.x) / 2, y: rect.top + (p2.m1.y + p2.m2.y) / 2 } : null;
      }
      const pitchfork = pitchforks.get(id);
      if (pitchfork) {
        if (!pitchfork.options.visible) return null;
        const p2 = pitchfork.primitive.coordinates();
        return p2 ? { x: rect.left + p2.m.x, y: rect.top + p2.m.y } : null;
      }
      const measurement = measurements.get(id);
      if (measurement) {
        if (!measurement.options.visible) return null;
        const p2 = measurement.primitive.coordinates();
        return p2 ? { x: rect.left + (p2.x1 + p2.x2) / 2, y: rect.top + (p2.y1 + p2.y2) / 2 } : null;
      }
      const riskReward = riskRewards.get(id);
      if (riskReward) {
        if (!riskReward.options.visible) return null;
        const p2 = riskReward.primitive.coordinates();
        return p2 ? { x: rect.left + (p2.x1 + p2.x2) / 2, y: rect.top + (p2.entryY + p2.targetY) / 2 } : null;
      }
      return null;
    }
    function drawingGeometry(id) {
      guard();
      const pitchfork = pitchforks.get(id);
      return pitchfork?.primitive.coordinates() ?? trendBasedFibonaccis.get(id)?.primitive.coordinates() ?? null;
    }
    function drawingAnchorPosition(id, anchor) {
      guard();
      const trend = trendLines.get(id), zone = rectangles.get(id), ellipse = ellipses.get(id), ray = rays.get(id), fibo = fibonacci.get(id), fibFan = fibonacciFans.get(id), fibTrend = trendBasedFibonaccis.get(id), measurement = measurements.get(id);
      const fibTime = fibonacciTimeZones.get(id)?.options;
      if (fibTime) {
        if (fibTime.visible === false) return null;
        const x3 = chart.timeScale().timeToCoordinate(anchor === "START" ? fibTime.startTime : fibTime.endTime), rect2 = host.getBoundingClientRect();
        return x3 === null ? null : { x: rect2.left + x3, y: rect2.top + 20 };
      }
      const channel = channels.get(id)?.options;
      const pitchfork = pitchforks.get(id)?.options;
      const risk = riskRewards.get(id)?.options;
      const fibTrendOptions = fibTrend?.options;
      if (fibTrendOptions) {
        if (fibTrendOptions.visible === false) return null;
        const time2 = anchor === "START" ? fibTrendOptions.startTime : anchor === "END" ? fibTrendOptions.endTime : fibTrendOptions.thirdTime, priceValue2 = anchor === "START" ? fibTrendOptions.startPrice : anchor === "END" ? fibTrendOptions.endPrice : fibTrendOptions.thirdPrice, x3 = chart.timeScale().timeToCoordinate(time2), y3 = price.priceToCoordinate(priceValue2), rect2 = host.getBoundingClientRect();
        return x3 === null || y3 === null ? null : { x: rect2.left + x3, y: rect2.top + y3 };
      }
      if (risk) {
        const time2 = anchor === "ENTRY" ? risk.startTime : anchor === "STOP" ? risk.stopTime : risk.endTime, priceValue2 = anchor === "ENTRY" ? risk.entryPrice : anchor === "STOP" ? risk.stopPrice : risk.targetPrice, x3 = chart.timeScale().timeToCoordinate(time2), y3 = price.priceToCoordinate(priceValue2), rect2 = host.getBoundingClientRect();
        return x3 === null || y3 === null ? null : { x: rect2.left + x3, y: rect2.top + y3 };
      }
      if (pitchfork) {
        const time2 = anchor === "START" ? pitchfork.startTime : anchor === "END" ? pitchfork.endTime : pitchfork.thirdTime, priceValue2 = anchor === "START" ? pitchfork.startPrice : anchor === "END" ? pitchfork.endPrice : pitchfork.thirdPrice, x3 = chart.timeScale().timeToCoordinate(time2), y3 = price.priceToCoordinate(priceValue2), rect2 = host.getBoundingClientRect();
        return x3 === null || y3 === null ? null : { x: rect2.left + x3, y: rect2.top + y3 };
      }
      const options = trend?.options ?? zone?.options ?? ellipse?.options ?? ray?.options ?? fibo?.options ?? fibFan?.options ?? channel ?? measurement?.options;
      if (!options || options.visible === false) return null;
      const time = anchor === "OFFSET" && channel ? channel.offsetTime : anchor === "START" ? options.startTime : options.endTime, priceValue = anchor === "OFFSET" && channel ? channel.offsetPrice : anchor === "START" ? options.startPrice : options.endPrice;
      const x2 = chart.timeScale().timeToCoordinate(time), y2 = price.priceToCoordinate(priceValue), rect = host.getBoundingClientRect();
      return x2 === null || y2 === null ? null : { x: rect.left + x2, y: rect.top + y2 };
    }
    function readDrawing(id) {
      guard();
      const level = priceLevels.get(id);
      if (level) return { ...level.options };
      const marker = timeMarkers.get(id);
      if (marker) return { ...marker.options };
      const annotation = textAnnotations.get(id);
      if (annotation) return { ...annotation.options };
      const trend = trendLines.get(id);
      if (trend) return { ...trend.options };
      const zone = rectangles.get(id);
      if (zone) return { ...zone.options };
      const ellipse = ellipses.get(id);
      if (ellipse) return { ...ellipse.options };
      const ray = rays.get(id);
      if (ray) return { ...ray.options };
      const fibo = fibonacci.get(id);
      if (fibo) {
        const options = { ...fibo.options };
        if (options.levels) options.levels = [...options.levels];
        else delete options.levels;
        return options;
      }
      const fibFan = fibonacciFans.get(id);
      if (fibFan) return { ...fibFan.options, ratios: [...fibonacciFanRatios(fibFan.options)] };
      const fibTrend = trendBasedFibonaccis.get(id);
      if (fibTrend) return { ...fibTrend.options, ratios: [...trendFibRatios(fibTrend.options)] };
      const fibTime = fibonacciTimeZones.get(id);
      if (fibTime) return { ...fibTime.options };
      const channel = channels.get(id);
      if (channel) return { ...channel.options };
      const pitchfork = pitchforks.get(id);
      if (pitchfork) return { ...pitchfork.options };
      const measurement = measurements.get(id);
      if (measurement) return { ...measurement.options };
      const riskReward = riskRewards.get(id);
      if (riskReward) return { ...riskReward.options, riskRewardRatio: riskRewardRatio(riskReward.options) };
      return null;
    }
    function exportDrawings() {
      guard();
      if (!drawingScope) throw Error("Drawing export requires symbol/timeframe scope");
      const drawings = [
        ...[...priceLevels.values()].map(({ options }) => ({ kind: "PRICE", options: { ...options } })),
        ...[...timeMarkers.values()].map(({ options }) => ({ kind: "TIME", options: { ...options } })),
        ...[...textAnnotations.values()].map(({ options }) => ({ kind: "TEXT", options: { ...options } })),
        ...[...trendLines.values()].map(({ options }) => ({ kind: "TREND", options: { ...options } })),
        ...[...rectangles.values()].map(({ options }) => ({ kind: "RECT", options: { ...options } })),
        ...[...ellipses.values()].map(({ options }) => ({ kind: "ELLIPSE", options: { ...options } })),
        ...[...rays.values()].map(({ options }) => ({ kind: "RAY", options: { ...options } })),
        ...[...fibonacci.values()].map(({ options }) => ({ kind: "FIBO", options: { ...options } })),
        ...[...fibonacciFans.values()].map(({ options }) => ({ kind: "FIB_FAN", options: { ...options, ratios: [...fibonacciFanRatios(options)] } })),
        ...[...trendBasedFibonaccis.values()].map(({ options }) => ({ kind: "FIB_TREND", options: { ...options, ratios: [...trendFibRatios(options)] } })),
        ...[...fibonacciTimeZones.values()].map(({ options }) => ({ kind: "FIB_TIME", options: { ...options } })),
        ...[...channels.values()].map(({ options }) => ({ kind: "CHANNEL", options: { ...options } })),
        ...[...pitchforks.values()].map(({ options }) => ({ kind: "PITCHFORK", options: { ...options } })),
        ...[...measurements.values()].map(({ options }) => ({ kind: "MEASURE", options: { ...options } })),
        ...[...riskRewards.values()].map(({ options }) => ({ kind: "RISK_REWARD", options: { ...options } }))
      ];
      const serialized = JSON.stringify({ schemaVersion: 1, symbol: drawingScope.symbol, timeframe: drawingScope.timeframe, drawings });
      if (utf8ByteLength(serialized) > persistenceLimit) throw Error("Drawing export exceeds size limit");
      return serialized;
    }
    function importDrawings(serialized) {
      guard();
      if (!drawingScope) throw Error("Drawing import requires symbol/timeframe scope");
      if (typeof serialized !== "string" || utf8ByteLength(serialized) > persistenceLimit) throw Error("Invalid drawing import size");
      let parsed;
      try {
        parsed = JSON.parse(serialized);
      } catch (_2) {
        throw Error("Invalid drawing import JSON");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Invalid drawing import envelope");
      const root = parsed;
      if (Object.keys(root).sort().join(",") !== "drawings,schemaVersion,symbol,timeframe" || root.schemaVersion !== 1 || root.symbol !== drawingScope.symbol || root.timeframe !== drawingScope.timeframe || !Array.isArray(root.drawings) || root.drawings.length > maxNativeDrawings)
        throw Error("Unsupported or mismatched drawing import");
      if (!drawingsHydrated || persistenceStatus !== "READY") throw Error("Drawing import requires ready storage");
      const storage = localStorageApi(), key = persistenceKey();
      if (!storage || !key) {
        persistenceStatus = "UNAVAILABLE";
        persistenceError = "STORAGE_UNAVAILABLE";
        throw Error("Drawing storage unavailable");
      }
      try {
        if (storage.getItem(key) !== lastPersistedSnapshot) {
          persistenceStatus = "CONFLICT";
          persistenceError = "EXTERNAL_CHANGE";
          throw Error("Drawing storage conflict");
        }
      } catch (error) {
        if (persistenceStatus !== "CONFLICT") {
          persistenceStatus = "UNAVAILABLE";
          persistenceError = "STORAGE_READ_FAILED";
        }
        throw error;
      }
      if (drawingCount()) throw Error("Drawing import conflicts with existing drawings");
      const snapshots = [], seen = /* @__PURE__ */ new Set();
      for (const entry of root.drawings) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw Error("Invalid drawing import entry");
        const row = entry;
        if (Object.keys(row).sort().join(",") !== "kind,options" || !row.options || typeof row.options !== "object" || Array.isArray(row.options))
          throw Error("Invalid drawing import entry");
        const options = row.options, kind = row.kind;
        const keys = Object.keys(options).sort().join(",");
        const expected = kind === "PRICE" ? "color,id,locked,price,visible" : kind === "TIME" ? "color,id,locked,time,visible" : kind === "TEXT" ? "color,id,locked,price,text,time,visible" : kind === "TREND" || kind === "RAY" || kind === "MEASURE" ? "color,endPrice,endTime,id,locked,startPrice,startTime,visible" : kind === "CHANNEL" ? "color,endPrice,endTime,id,locked,offsetPrice,offsetTime,startPrice,startTime,visible" : kind === "PITCHFORK" ? "color,endPrice,endTime,id,locked,startPrice,startTime,thirdPrice,thirdTime,visible" : kind === "FIB_TIME" ? "color,endTime,id,locked,startTime,visible" : kind === "FIB_FAN" ? "color,endPrice,endTime,id,locked,ratios,startPrice,startTime,visible" : kind === "FIB_TREND" ? "color,endPrice,endTime,id,locked,ratios,startPrice,startTime,thirdPrice,thirdTime,visible" : kind === "FIBO" ? (/* @__PURE__ */ new Set(["color,endPrice,endTime,id,locked,startPrice,startTime,visible", "color,endPrice,endTime,id,levels,locked,startPrice,startTime,visible"])).has(keys) : kind === "RECT" ? "color,endPrice,endTime,fill,id,locked,startPrice,startTime,visible" : "";
        if (!expected || kind !== "FIBO" && keys !== expected || typeof options.id !== "string" || seen.has(options.id) || averages.has(options.id) || supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || (ichimokuOverlays.has(options.id) || pivotOverlays.has(options.id)) || paneLines.has(options.id) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id)) throw Error("Invalid or conflicting drawing identity/options");
        seen.add(options.id);
        if (kind === "PRICE") {
          const normalized = options;
          validatePriceLevel(normalized);
          snapshots.push({ kind: "PRICE", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "TIME") {
          const normalized = options;
          validateTimeMarker(normalized);
          snapshots.push({ kind: "TIME", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "TEXT") {
          const normalized = options;
          validateTextAnnotation(normalized);
          snapshots.push({ kind: "TEXT", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "TREND") {
          const normalized = options;
          validateTrendLine(normalized);
          snapshots.push({ kind: "TREND", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "ELLIPSE") {
          const normalized = options;
          validateTrendLine(normalized);
          if (normalized.startTime === normalized.endTime || normalized.startPrice === normalized.endPrice) throw Error("Invalid ellipse geometry");
          snapshots.push({ kind: "ELLIPSE", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "RECT") {
          const normalized = options;
          validateRectangle(normalized);
          snapshots.push({ kind: "RECT", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "RAY") {
          const normalized = options;
          validateTrendLine(normalized);
          snapshots.push({ kind: "RAY", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "CHANNEL") {
          const normalized = options;
          validateChannel(normalized);
          snapshots.push({ kind: "CHANNEL", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "PITCHFORK") {
          const normalized = options;
          validatePitchfork(normalized);
          snapshots.push({ kind: "PITCHFORK", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "MEASURE") {
          const normalized = options;
          validateTrendLine(normalized);
          snapshots.push({ kind: "MEASURE", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "FIB_FAN") {
          const normalized = normalizeFibonacciFanOptions(options);
          snapshots.push({ kind: "FIB_FAN", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "FIB_TREND") {
          const normalized = normalizeTrendBasedFibonacciOptions(options, false);
          snapshots.push({ kind: "FIB_TREND", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else if (kind === "FIB_TIME") {
          const normalized = options;
          validateFibonacciTimeZone(normalized);
          snapshots.push({ kind: "FIB_TIME", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        } else {
          const normalized = normalizeFibonacciOptions(options);
          if (options.levels === void 0) delete normalized.levels;
          snapshots.push({ kind: "FIBO", options: { ...normalized, visible: normalized.visible ?? true, locked: normalized.locked ?? false } });
        }
      }
      if (snapshots.length > maxNativeDrawings) throw Error("Native drawing limit");
      hydratingDrawings = true;
      try {
        for (const snapshot of snapshots) {
          if (snapshot.kind === "PRICE") addPriceLevel(snapshot.options);
          else if (snapshot.kind === "TIME") addTimeMarker(snapshot.options);
          else if (snapshot.kind === "TEXT") addTextAnnotation(snapshot.options);
          else if (snapshot.kind === "TREND") addTrendLine(snapshot.options);
          else if (snapshot.kind === "RECT") addRectangle(snapshot.options);
          else if (snapshot.kind === "ELLIPSE") addEllipse(snapshot.options);
          else if (snapshot.kind === "RAY") addRay(snapshot.options);
          else if (snapshot.kind === "CHANNEL") addChannel(snapshot.options);
          else if (snapshot.kind === "PITCHFORK") addPitchfork(snapshot.options);
          else if (snapshot.kind === "RISK_REWARD") addRiskReward(snapshot.options);
          else if (snapshot.kind === "MEASURE") addMeasurement(snapshot.options);
          else if (snapshot.kind === "FIB_TIME") addFibonacciTimeZone(snapshot.options);
          else if (snapshot.kind === "FIB_FAN") addFibonacciFan(snapshot.options);
          else if (snapshot.kind === "FIB_TREND") addTrendBasedFibonacci(snapshot.options, false);
          else addFibonacci(snapshot.options);
        }
      } catch (error) {
        for (const item of priceLevels.values()) price.detachPrimitive(item.primitive);
        priceLevels.clear();
        for (const item of timeMarkers.values()) price.detachPrimitive(item.primitive);
        timeMarkers.clear();
        for (const item of textAnnotations.values()) price.detachPrimitive(item.primitive);
        textAnnotations.clear();
        for (const item of trendLines.values()) price.detachPrimitive(item.primitive);
        trendLines.clear();
        for (const item of rectangles.values()) price.detachPrimitive(item.primitive);
        rectangles.clear();
        for (const item of ellipses.values()) price.detachPrimitive(item.primitive);
        ellipses.clear();
        for (const item of rays.values()) price.detachPrimitive(item.primitive);
        rays.clear();
        for (const item of fibonacci.values()) price.detachPrimitive(item.primitive);
        fibonacci.clear();
        for (const item of fibonacciFans.values()) price.detachPrimitive(item.primitive);
        fibonacciFans.clear();
        for (const item of trendBasedFibonaccis.values()) price.detachPrimitive(item.primitive);
        trendBasedFibonaccis.clear();
        for (const item of channels.values()) price.detachPrimitive(item.primitive);
        channels.clear();
        for (const item of pitchforks.values()) price.detachPrimitive(item.primitive);
        pitchforks.clear();
        for (const item of measurements.values()) price.detachPrimitive(item.primitive);
        measurements.clear();
        for (const item of riskRewards.values()) price.detachPrimitive(item.primitive);
        riskRewards.clear();
        undoStack.length = 0;
        redoStack.length = 0;
        throw error;
      } finally {
        hydratingDrawings = false;
      }
      undoStack.length = 0;
      redoStack.length = 0;
      persistDrawings();
      return { imported: snapshots.length };
    }
    function setDrawingVisible(id, visible) {
      guard();
      if (typeof visible !== "boolean") throw Error("Invalid drawing visibility");
      const priceLevel = priceLevels.get(id);
      if (priceLevel) {
        updatePriceLevel(id, { visible });
        return true;
      }
      const timeMarker = timeMarkers.get(id);
      if (timeMarker) {
        updateTimeMarker(id, { visible });
        return true;
      }
      const annotation = textAnnotations.get(id);
      if (annotation) {
        updateTextAnnotation(id, { visible });
        return true;
      }
      const trend = trendLines.get(id);
      if (trend) {
        updateTrendLine(id, { visible });
        return true;
      }
      const zone = rectangles.get(id);
      if (zone) {
        updateRectangle(id, { visible });
        return true;
      }
      const ellipse = ellipses.get(id);
      if (ellipse) {
        updateEllipse(id, { visible });
        return true;
      }
      const ray = rays.get(id);
      if (ray) {
        updateRay(id, { visible });
        return true;
      }
      const fibo = fibonacci.get(id);
      if (fibo) {
        updateFibonacci(id, { visible });
        return true;
      }
      const fibFan = fibonacciFans.get(id);
      if (fibFan) {
        updateFibonacciFan(id, { visible });
        return true;
      }
      const fibTrend = trendBasedFibonaccis.get(id);
      if (fibTrend) {
        updateTrendBasedFibonacci(id, { visible });
        return true;
      }
      const fibTime = fibonacciTimeZones.get(id);
      if (fibTime) {
        updateFibonacciTimeZone(id, { visible });
        return true;
      }
      const channel = channels.get(id);
      if (channel) {
        updateChannel(id, { visible });
        return true;
      }
      const pitchfork = pitchforks.get(id);
      if (pitchfork) {
        updatePitchfork(id, { visible });
        return true;
      }
      if (measurements.has(id)) {
        updateMeasurement(id, { visible });
        return true;
      }
      if (riskRewards.has(id)) {
        updateRiskReward(id, { visible });
        return true;
      }
      return false;
    }
    function setDrawingLocked(id, locked) {
      guard();
      if (typeof locked !== "boolean") throw Error("Invalid drawing lock state");
      const priceLevel = priceLevels.get(id);
      if (priceLevel) {
        updatePriceLevel(id, { locked });
        return true;
      }
      const timeMarker = timeMarkers.get(id);
      if (timeMarker) {
        updateTimeMarker(id, { locked });
        return true;
      }
      const annotation = textAnnotations.get(id);
      if (annotation) {
        updateTextAnnotation(id, { locked });
        return true;
      }
      const trend = trendLines.get(id);
      if (trend) {
        updateTrendLine(id, { locked });
        return true;
      }
      const zone = rectangles.get(id);
      if (zone) {
        updateRectangle(id, { locked });
        return true;
      }
      const ellipse = ellipses.get(id);
      if (ellipse) {
        updateEllipse(id, { locked });
        return true;
      }
      const ray = rays.get(id);
      if (ray) {
        updateRay(id, { locked });
        return true;
      }
      const fibo = fibonacci.get(id);
      if (fibo) {
        updateFibonacci(id, { locked });
        return true;
      }
      const fibFan = fibonacciFans.get(id);
      if (fibFan) {
        updateFibonacciFan(id, { locked });
        return true;
      }
      const fibTrend = trendBasedFibonaccis.get(id);
      if (fibTrend) {
        updateTrendBasedFibonacci(id, { locked });
        return true;
      }
      const fibTime = fibonacciTimeZones.get(id);
      if (fibTime) {
        updateFibonacciTimeZone(id, { locked });
        return true;
      }
      const channel = channels.get(id);
      if (channel) {
        updateChannel(id, { locked });
        return true;
      }
      const pitchfork = pitchforks.get(id);
      if (pitchfork) {
        updatePitchfork(id, { locked });
        return true;
      }
      if (measurements.has(id)) {
        updateMeasurement(id, { locked });
        return true;
      }
      if (riskRewards.has(id)) {
        updateRiskReward(id, { locked });
        return true;
      }
      return false;
    }
    function setSelectedDrawingsVisible(visible) {
      guard();
      if (typeof visible !== "boolean") throw Error("Invalid drawing visibility");
      const ids = [...selectedDrawingIds];
      if (ids.some((id) => !snapshotDrawing(id))) throw Error("Drawing selection changed");
      for (const id of ids) setDrawingVisible(id, visible);
      return ids;
    }
    function setSelectedDrawingsLocked(locked) {
      guard();
      if (typeof locked !== "boolean") throw Error("Invalid drawing lock state");
      const ids = [...selectedDrawingIds];
      if (ids.some((id) => !snapshotDrawing(id))) throw Error("Drawing selection changed");
      for (const id of ids) setDrawingLocked(id, locked);
      return ids;
    }
    function addPaneLine(opts, data) {
      guard();
      if (!opts || !/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id) || !colorPattern.test(opts.color))
        throw Error("Invalid pane line");
      const values = validSeriesData(data);
      if (supertrendOverlays.has(opts.id) || parabolicSarOverlays.has(opts.id) || (ichimokuOverlays.has(opts.id) || pivotOverlays.has(opts.id)) || oscillators.has(opts.id) || donchianOverlays.has(opts.id) || linearRegressionOverlays.has(opts.id) || (keltnerOverlays.has(opts.id) || atrBandsOverlays.has(opts.id)) || averages.has(opts.id) || priceLevels.has(opts.id) || timeMarkers.has(opts.id) || textAnnotations.has(opts.id) || trendLines.has(opts.id) || rectangles.has(opts.id) || rays.has(opts.id) || fibonacci.has(opts.id) || fibonacciFans.has(opts.id) || trendBasedFibonaccis.has(opts.id) || fibonacciTimeZones.has(opts.id) || channels.has(opts.id) || pitchforks.has(opts.id) || measurements.has(opts.id) || riskRewards.has(opts.id) || bollingerOverlays.has(opts.id) || sessionVwapOverlays.has(opts.id)) throw Error("Duplicate chart object identity");
      if (indicatorInstanceCount() >= maxIndicatorInstances && !paneLines.has(opts.id)) throw Error("Indicator instance limit");
      if (paneLines.size + oscillators.size >= 8 && !paneLines.has(opts.id)) throw Error("Native pane limit");
      let series = paneLines.get(opts.id);
      if (!series) {
        series = createPaneLine(opts);
        paneLines.set(opts.id, series);
        chart.panes()[chart.panes().length - 1]?.setHeight(150);
      } else series.applyOptions({
        color: opts.color,
        lineWidth: opts.lineWidth ?? 2,
        visible: opts.visible ?? true,
        title: opts.title ?? opts.id
      });
      series.setData(values);
      readoutIndicators.set(opts.id, { id: opts.id, title: opts.title ?? opts.id, kind: "PANE", values: new Map(values.map((v2) => [v2.time, v2.value])) });
      persistDrawings();
    }
    function movePaneLine(id, paneIndex) {
      guard();
      if (!Number.isInteger(paneIndex) || paneIndex < 1 || paneIndex >= chart.panes().length)
        throw Error("Invalid native pane index");
      const series = paneLines.get(id);
      if (!series) throw Error("Unknown native pane line");
      series.moveToPane(paneIndex);
      persistDrawings();
    }
    const oscillatorComponents = (kind) => kind === "rsi" ? ["rsi"] : kind === "atr" ? ["atr"] : kind === "macd" ? ["macd", "signal", "histogram"] : kind === "stochastic" ? ["stochK", "stochD"] : kind === "stochrsi" ? ["stochRsiK", "stochRsiD"] : kind === "cci" ? ["cci"] : kind === "momentum" ? ["momentum"] : kind === "roc" ? ["roc"] : kind === "obv" ? ["obv"] : kind === "mfi" ? ["mfi"] : ["adx", "plusDi", "minusDi"];
    const oscillatorTitles = (kind) => kind === "macd" ? { macd: "MACD", signal: "Signal", histogram: "Histogram" } : kind === "adx" ? { adx: "ADX", plusDi: "+DI", minusDi: "\u2212DI" } : kind === "stochastic" ? { stochK: "%K", stochD: "%D" } : kind === "stochrsi" ? { stochRsiK: "StochRSI %K", stochRsiD: "StochRSI %D" } : kind === "cci" ? { cci: "CCI" } : kind === "momentum" ? { momentum: "Momentum" } : kind === "roc" ? { roc: "ROC (%)" } : kind === "obv" ? { obv: "OBV" } : kind === "mfi" ? { mfi: "MFI" } : kind === "rsi" ? { rsi: "RSI" } : { atr: "ATR" };
    function replaceOscillatorData(group, incremental = false) {
      const rows = incremental ? group.calculator.updateLast(bars[bars.length - 1]) : (group.calculator = createIncrementalOscillator(bars, group.options.kind, group.options.settings), group.calculator.snapshot());
      const currentTime = bars[bars.length - 1]?.time, components = oscillatorComponents(group.options.kind), titles = oscillatorTitles(group.options.kind);
      const nextValues = /* @__PURE__ */ new Map();
      for (const key of components) {
        const points = rows[key] ?? [];
        let series = group.series.get(key);
        if (!series) {
          if (key === "histogram") series = newHistogram(group.paneIndex);
          else series = createPaneLine({ id: group.options.id + ":" + key, color: key === "signal" || key === "stochD" || key === "stochRsiD" ? "#f3c56a" : key === "plusDi" ? "#55deaa" : key === "minusDi" ? "#f17e97" : group.options.color, lineWidth: group.options.lineWidth, title: titles[key] }, group.paneIndex);
          series.priceScale().applyOptions({ autoScale: true, borderVisible: true, scaleMargins: { top: 0.08, bottom: 0.08 } });
          group.series.set(key, series);
        }
        if (key === "histogram") {
          const histogram = series;
          histogram.applyOptions({ visible: group.options.visible ?? true, title: titles[key], priceLineVisible: false, lastValueVisible: true });
          const chartPoints = incremental ? points.filter((p2) => p2.time === currentTime) : points;
          const rowsWithColor = chartPoints.map((p2) => ({ time: p2.time, value: p2.value, color: p2.color ?? (p2.value >= 0 ? "rgba(66,213,178,.75)" : "rgba(249,107,126,.75)") }));
          if (incremental) {
            const last = rowsWithColor[rowsWithColor.length - 1];
            if (last) histogram.update(last);
          } else histogram.setData(rowsWithColor);
        } else {
          const line = series, color = key === "signal" || key === "stochD" || key === "stochRsiD" ? "#f3c56a" : key === "plusDi" ? "#55deaa" : key === "minusDi" ? "#f17e97" : group.options.color;
          line.applyOptions({ color, lineWidth: group.options.lineWidth ?? 2, visible: group.options.visible ?? true, title: titles[key], priceLineVisible: false, lastValueVisible: true });
          const chartPoints = incremental ? points.filter((p2) => p2.time === currentTime) : points;
          if (incremental) {
            const last = chartPoints[chartPoints.length - 1];
            if (last) line.update(last);
          } else line.setData(points);
        }
        const values = incremental ? group.values.get(key) ?? /* @__PURE__ */ new Map() : new Map(points.map((p2) => [p2.time, p2.value]));
        if (incremental && currentTime !== void 0) {
          values.delete(currentTime);
          const last = points.find((p2) => p2.time === currentTime);
          if (last) values.set(last.time, last.value);
        }
        nextValues.set(key, values);
        readoutIndicators.set(group.options.id + ":" + key, { id: group.options.id + ":" + key, title: (group.options.title ?? group.options.id) + " " + titles[key], kind: "PANE", values });
      }
      group.values = nextValues;
    }
    function refreshOscillators(incremental = false) {
      for (const group of oscillators.values()) replaceOscillatorData(group, incremental);
    }
    function addOscillator(options, persistent = true) {
      guard();
      if (!options || !/^[-_a-zA-Z0-9]{1,32}$/.test(options.id) || !colorPattern.test(options.color) || !["rsi", "atr", "macd", "adx", "stochastic", "stochrsi", "cci", "momentum", "roc", "obv", "mfi"].includes(options.kind) || options.lineWidth !== void 0 && ![1, 2, 3, 4].includes(options.lineWidth)) throw Error("Invalid oscillator options");
      if (supertrendOverlays.has(options.id) || parabolicSarOverlays.has(options.id) || (ichimokuOverlays.has(options.id) || pivotOverlays.has(options.id)) || oscillators.has(options.id) || donchianOverlays.has(options.id) || linearRegressionOverlays.has(options.id) || (keltnerOverlays.has(options.id) || atrBandsOverlays.has(options.id)) || averages.has(options.id) || paneLines.has(options.id) || priceLevels.has(options.id) || timeMarkers.has(options.id) || textAnnotations.has(options.id) || trendLines.has(options.id) || rectangles.has(options.id) || ellipses.has(options.id) || rays.has(options.id) || fibonacci.has(options.id) || fibonacciFans.has(options.id) || trendBasedFibonaccis.has(options.id) || fibonacciTimeZones.has(options.id) || channels.has(options.id) || pitchforks.has(options.id) || measurements.has(options.id) || riskRewards.has(options.id) || bollingerOverlays.has(options.id) || sessionVwapOverlays.has(options.id)) throw Error("Duplicate chart object identity");
      if (indicatorInstanceCount() >= maxIndicatorInstances) throw Error("Indicator instance limit");
      if (paneLines.size + oscillators.size >= 8) throw Error("Native pane limit");
      const normalized = { ...options, settings: { ...options.settings } };
      const calculator = createIncrementalOscillator([], normalized.kind, normalized.settings);
      const group = { options: normalized, paneIndex: chart.panes().length, series: /* @__PURE__ */ new Map(), values: /* @__PURE__ */ new Map(), calculator };
      oscillators.set(options.id, group);
      try {
        const paneIndex = chart.panes().length - 1;
        chart.panes()[paneIndex]?.setHeight(150);
        paneHeightOverrides.set(paneIndex, 150);
        replaceOscillatorData(group);
        if (persistent) {
          transientOscillators.delete(options.id);
          persistDrawings();
        } else transientOscillators.add(options.id);
      } catch (error) {
        oscillators.delete(options.id);
        transientOscillators.delete(options.id);
        for (const series of group.series.values()) chart.removeSeries(series);
        for (const key of oscillatorComponents(normalized.kind)) readoutIndicators.delete(normalized.id + ":" + key);
        throw error;
      }
    }
    function addTransientOscillator(options) {
      return addOscillator(options, false);
    }
    function updateOscillator(id, patch, persistent = true) {
      guard();
      const group = oscillators.get(id);
      if (!group) throw Error("Unknown oscillator");
      const next = { ...group.options, ...patch, settings: patch.settings ? { ...patch.settings } : group.options.settings };
      if (!colorPattern.test(next.color) || next.lineWidth !== void 0 && ![1, 2, 3, 4].includes(next.lineWidth)) throw Error("Invalid oscillator style");
      calculateOscillator(bars, next.kind, next.settings);
      group.options = next;
      replaceOscillatorData(group);
      if (persistent) {
        transientOscillators.delete(id);
        persistDrawings();
      } else transientOscillators.add(id);
    }
    function updateTransientOscillator(id, patch) {
      return updateOscillator(id, patch, false);
    }
    function oscillatorOptions(id) {
      guard();
      const group = oscillators.get(id);
      return group ? { ...group.options, settings: { ...group.options.settings } } : null;
    }
    function moveOscillator(id, paneIndex) {
      guard();
      const group = oscillators.get(id);
      if (!group || !Number.isInteger(paneIndex) || paneIndex < 1 || paneIndex >= chart.panes().length) throw Error("Invalid oscillator pane");
      for (const series of group.series.values()) series.moveToPane(paneIndex);
      group.paneIndex = paneIndex;
      persistDrawings();
    }
    function oscillatorPaneLayout() {
      guard();
      return chart.panes().map((pane, index) => ({ index, titles: pane.getSeries().map((series) => series.options().title) }));
    }
    function removeOscillator(id, persistent = true) {
      guard();
      const group = oscillators.get(id);
      if (!group) return false;
      for (const series of group.series.values()) chart.removeSeries(series);
      for (const key of oscillatorComponents(group.options.kind)) readoutIndicators.delete(id + ":" + key);
      oscillators.delete(id);
      transientOscillators.delete(id);
      if (persistent) persistDrawings();
      return true;
    }
    function removeTransientOscillator(id) {
      return removeOscillator(id, false);
    }
    function resizePane(index, height) {
      guard();
      if (!Number.isInteger(index) || index < 1 || index >= chart.panes().length || !Number.isInteger(height) || height < 80 || height > 600) throw Error("Invalid pane height");
      chart.panes()[index].setHeight(height);
      paneHeightOverrides.set(index, height);
      persistDrawings();
    }
    function paneHeights() {
      guard();
      return chart.panes().map((pane) => pane.getHeight());
    }
    function removePaneLine(id) {
      guard();
      const series = paneLines.get(id);
      if (!series) return false;
      chart.removeSeries(series);
      paneLines.delete(id);
      readoutIndicators.delete(id);
      persistDrawings();
      return true;
    }
    function moveAverage(id, pane) {
      guard();
      if (!averages.has(id) || !Number.isInteger(pane) || pane < 0 || pane > 8) throw Error("Invalid pane request");
      averages.get(id).moveToPane(pane);
    }
    function showVolume(show) {
      guard();
      if (show && !volume) {
        volume = newVolume();
        volume.setData(volumeRows());
        const paneIndex = chart.panes().length - 1, pane = chart.panes()[paneIndex];
        if (pane) pane.setHeight(140);
        paneHeightOverrides.set(paneIndex, 140);
      } else if (!show && volume) {
        chart.removeSeries(volume);
        volume = null;
      }
      persistDrawings();
    }
    function visibleLogicalRange() {
      guard();
      const range = chart.timeScale().getVisibleLogicalRange();
      return range ? { from: range.from, to: range.to } : null;
    }
    function setVisibleLogicalRange(range) {
      guard();
      if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to) || range.from >= range.to)
        throw Error("Invalid visible logical range");
      chart.timeScale().setVisibleLogicalRange({ from: range.from, to: range.to });
      persistDrawings();
    }
    function setDisplayTimeZone(timeZone) {
      guard();
      if (typeof timeZone !== "string" || timeZone.length < 1 || timeZone.length > 100) throw Error("Invalid IANA display timezone");
      let canonical, nextFormatters;
      try {
        canonical = new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
        nextFormatters = makeTimeFormatters(canonical);
      } catch {
        throw Error("Invalid IANA display timezone");
      }
      if (!canonical) throw Error("Invalid IANA display timezone");
      displayTimeZone = canonical;
      timeFormatters = nextFormatters;
      chart.applyOptions({ localization: { timeFormatter: formatCrosshairTime }, timeScale: { tickMarkFormatter: formatTimeLabel } });
      persistDrawings();
      return displayTimeZone;
    }
    function formatDisplayTime(time, tickType = ji.Time) {
      guard();
      return formatTimeLabel(time, tickType);
    }
    function updateLast(c2) {
      guard();
      if (!validBar(c2)) throw Error("Invalid candle");
      const prev = bars[bars.length - 1];
      const replacing = !!prev && c2.time === prev.time;
      if (prev && c2.time < prev.time) throw Error("Cannot update historical bar out of order");
      if ((!prev || c2.time > prev.time) && bars.length >= MAX_OSCILLATOR_BARS) throw Error("Chart history limit reached");
      if (prev && c2.time === prev.time) bars[bars.length - 1] = { ...c2 };
      else bars.push({ ...c2 });
      barsByTime.set(c2.time, { ...c2 });
      brokerDealMarkers = brokerDealMarkers.map((row) => ({ ...row, plotted: barsByTime.has(row.chartTimeSeconds) }));
      brokerDealPrimitive.set(brokerDealMarkers);
      for (const indicator of readoutIndicators.values()) {
        indicator.values.delete(c2.time);
        indicator.directions?.delete(c2.time);
      }
      if (pricePresentation === "candles" || pricePresentation === "bars" || pricePresentation === "line" || pricePresentation === "area") price.update(pricePresentationBars()[bars.length - 1]);
      else price.setData(pricePresentationBars());
      barPresentation.update(c2);
      linePresentation.update({ time: c2.time, value: c2.close });
      areaPresentation.update({ time: c2.time, value: c2.close });
      if (volume) volume.update(volumeRows()[bars.length - 1]);
      for (const [id, state] of managedMovingAverages) updateManagedMovingAverage(id, state);
      refreshDonchianOverlays();
      refreshBollingerOverlays();
      refreshSessionVwapOverlays();
      refreshKeltnerOverlays();
      refreshAtrBandsOverlays();
      refreshLinearRegressionOverlays();
      refreshIchimokuOverlays();
      refreshPivotOverlays();
      refreshVolumeZones();
      refreshAutoFibonacci();
      for (const group of supertrendOverlays.values()) updateSupertrendLast(group, c2, bars.length - 1, replacing && group.lastTime === c2.time);
      for (const group of parabolicSarOverlays.values()) updateParabolicSarLast(group, c2, bars.length - 1, replacing && group.lastTime === c2.time);
      refreshOscillators(true);
      schedulePriceAxisLabelLayout();
    }
    function removeAverage(id) {
      guard();
      const s = averages.get(id);
      if (!s) return false;
      chart.removeSeries(s);
      averages.delete(id);
      managedMovingAverages.delete(id);
      transientMovingAverages.delete(id);
      readoutIndicators.delete(id);
      return true;
    }
    function averageOptions(id) {
      guard();
      return averages.get(id)?.options() ?? null;
    }
    function movingAverageOptions(id) {
      guard();
      const value = managedMovingAverages.get(id)?.options;
      return value ? { ...value } : null;
    }
    function readDataWindow(time) {
      guard();
      if (!Number.isSafeInteger(time) || time <= 0 || !Number.isFinite(new Date(time * 1e3).getTime())) throw Error("Invalid UTC candle time");
      const candle = barsByTime.get(time);
      if (!candle) return { state: "UNAVAILABLE", account: activeAccount, source: "CHART_FEED", time, timeUtc: new Date(time * 1e3).toISOString(), reason: "BAR_NOT_LOADED" };
      const real = typeof candle.real_volume === "number" && candle.real_volume > 0;
      const hasTick = typeof candle.tick_volume === "number" && Number.isFinite(candle.tick_volume) && candle.tick_volume >= 0;
      return {
        state: "AVAILABLE",
        account: activeAccount,
        source: "CHART_FEED",
        time,
        timeUtc: new Date(time * 1e3).toISOString(),
        ohlc: { open: candle.open, high: candle.high, low: candle.low, close: candle.close },
        volume: real ? { value: candle.real_volume, source: "REAL_VOLUME" } : hasTick ? { value: candle.tick_volume, source: "TICK_VOLUME_PROXY" } : { value: null, source: "UNAVAILABLE" },
        ...volumeZones ? { volumeZones: { status: volumeZones.result.status, zones: volumeZones.result.zones.filter((zone) => zone.time === time).map(({ algorithmVersion, source, label, volume: volume2, medianVolume, threshold, multiplier, start, end, high, low }) => ({ algorithmVersion, source, label, volume: volume2, medianVolume, threshold, multiplier, start, end, high, low })) } } : {},
        ...autoFibonacci?.result.available && time >= autoFibonacci.result.confirmedAt && time <= autoFibonacci.asOf.timeUtc ? { autoFibonacci: { algorithmVersion: autoFibonacci.result.algorithmVersion, source: autoFibonacci.result.source, timeframe: autoFibonacci.result.timeframe, direction: autoFibonacci.result.direction, start: autoFibonacci.result.start, end: autoFibonacci.result.end, confirmedAt: autoFibonacci.result.confirmedAt, levels: autoFibRatios.map((ratio) => ({ ratio, value: autoFibonacci.result.lines[String(ratio)].value })) } } : {},
        indicators: Array.from(readoutIndicators.values(), (indicator) => {
          const value = indicator.values.get(time), available = value !== void 0;
          const direction = indicator.directions?.get(time);
          return { id: indicator.id, title: indicator.title, kind: indicator.kind, value: available ? value : null, ...direction ? { direction } : {}, state: available ? "AVAILABLE" : "WARMUP_OR_MISSING" };
        })
      };
    }
    function changeAccount(next) {
      guard();
      if (!/^[a-zA-Z0-9_-]{1,50}$/.test(next)) throw Error("Invalid account");
      clearPositionOverlays();
      brokerDealMarkers = [];
      brokerDealPrimitive.set([]);
      if (volumeZones) {
        price.detachPrimitive(volumeZones.primitive);
        volumeZones = null;
      }
      clearAutoFibonacci();
      finishDrag(true);
      selectDrawing(null);
      hoveredDrawingId = null;
      undoStack.length = 0;
      redoStack.length = 0;
      drawingsHydrated = false;
      lastPersistedSnapshot = null;
      persistenceError = null;
      persistenceStatus = drawingScope ? "PENDING" : "DISABLED";
      activeAccount = next;
      pricePresentation = restorePricePresentation(next);
      bars = [];
      barsByTime.clear();
      syncPresentationSeries();
      for (const item of priceLevels.values()) price.detachPrimitive(item.primitive);
      priceLevels.clear();
      for (const item of timeMarkers.values()) price.detachPrimitive(item.primitive);
      timeMarkers.clear();
      selectedDrawingId = null;
      for (const item of textAnnotations.values()) price.detachPrimitive(item.primitive);
      textAnnotations.clear();
      for (const item of trendLines.values()) price.detachPrimitive(item.primitive);
      trendLines.clear();
      for (const item of rectangles.values()) price.detachPrimitive(item.primitive);
      rectangles.clear();
      for (const item of ellipses.values()) price.detachPrimitive(item.primitive);
      ellipses.clear();
      for (const item of rays.values()) price.detachPrimitive(item.primitive);
      rays.clear();
      for (const item of fibonacci.values()) price.detachPrimitive(item.primitive);
      fibonacci.clear();
      for (const item of fibonacciFans.values()) price.detachPrimitive(item.primitive);
      fibonacciFans.clear();
      for (const item of trendBasedFibonaccis.values()) price.detachPrimitive(item.primitive);
      trendBasedFibonaccis.clear();
      for (const item of channels.values()) price.detachPrimitive(item.primitive);
      channels.clear();
      for (const item of pitchforks.values()) price.detachPrimitive(item.primitive);
      pitchforks.clear();
      for (const item of measurements.values()) price.detachPrimitive(item.primitive);
      measurements.clear();
      for (const item of riskRewards.values()) price.detachPrimitive(item.primitive);
      riskRewards.clear();
      for (const item of averages.values()) chart.removeSeries(item);
      averages.clear();
      managedMovingAverages.clear();
      transientMovingAverages.clear();
      for (const group of donchianOverlays.values()) for (const series of group.series) chart.removeSeries(series);
      donchianOverlays.clear();
      for (const group of bollingerOverlays.values()) for (const series of group.series) chart.removeSeries(series);
      bollingerOverlays.clear();
      for (const group of sessionVwapOverlays.values()) chart.removeSeries(group.series);
      sessionVwapOverlays.clear();
      for (const group of keltnerOverlays.values()) for (const series of group.series) chart.removeSeries(series);
      keltnerOverlays.clear();
      for (const group of atrBandsOverlays.values()) for (const series of group.series) chart.removeSeries(series);
      atrBandsOverlays.clear();
      for (const group of ichimokuOverlays.values()) {
        for (const series of group.series) chart.removeSeries(series);
        price.detachPrimitive(group.cloud);
      }
      ichimokuOverlays.clear();
      for (const group of pivotOverlays.values()) for (const series of group.series.values()) chart.removeSeries(series);
      pivotOverlays.clear();
      for (const group of linearRegressionOverlays.values()) for (const series of group.series) chart.removeSeries(series);
      linearRegressionOverlays.clear();
      for (const group of supertrendOverlays.values()) {
        chart.removeSeries(group.up);
        chart.removeSeries(group.down);
      }
      supertrendOverlays.clear();
      for (const group of parabolicSarOverlays.values()) {
        chart.removeSeries(group.up);
        chart.removeSeries(group.down);
      }
      parabolicSarOverlays.clear();
      for (const group of oscillators.values()) for (const series of group.series.values()) chart.removeSeries(series);
      oscillators.clear();
      for (const line of paneLines.values()) chart.removeSeries(line);
      paneLines.clear();
      readoutIndicators.clear();
      if (volume) volume.setData([]);
    }
    function setDrawingTool(tool, text) {
      guard();
      if (tool !== null && !["TREND", "RAY", "PRICE", "TIME", "RECT", "ELLIPSE", "FIBO", "FIB_FAN", "FIB_TREND", "FIB_TIME", "MEASURE", "CHANNEL", "PITCHFORK", "RISK_REWARD", "TEXT"].includes(tool)) throw Error("Invalid drawing tool");
      if (tool === "TEXT" && (typeof text !== "string" || !/^[\x20-\x7E]{1,40}$/.test(text))) throw Error("Text placement requires 1-40 printable ASCII characters");
      cancelDrawingTool(false);
      placementTool = tool;
      placementAnchors = [];
      placementText = tool === "TEXT" ? text : null;
      if (tool) drawingState("SECOND_ANCHOR");
      return true;
    }
    function drawingToolState() {
      return { tool: placementTool, hasFirstAnchor: placementAnchors.length > 0, anchorCount: placementAnchors.length };
    }
    function inspect() {
      guard();
      return {
        version: VERSION2,
        account: activeAccount,
        chartType: pricePresentation,
        priceAxisWidth: chart.priceScale("right").width(),
        priceAxisLayoutRevision,
        priceAxisLabels: priceAxisLabelRows.map((item) => ({ ...item })),
        positionOverlayCount: positionOverlayLines.size,
        positionOverlays: readPositionOverlays().lines,
        marketLevelCount: marketLevelLines.size,
        marketLevels: readMarketLevels(),
        brokerDealMarkerCount: brokerDealMarkers.filter((row) => row.plotted).length,
        nativeDrawingCount: drawingCount(),
        drawingTool: placementTool,
        displayTimeZone,
        volumeZoneStatus: volumeZones?.result.status ?? "DISABLED",
        volumeZoneCount: volumeZones?.result.zones.length ?? 0,
        candleCount: bars.length,
        lastTime: bars[bars.length - 1]?.time ?? null,
        sessionVwapCount: sessionVwapOverlays.size,
        sessionVwapSeries: [...sessionVwapOverlays.entries()].map(([id, group]) => ({ id, options: { ...group.options }, points: group.result.points.map((point2) => ({ ...point2 })), volumeSource: group.result.volumeSource, visible: group.series.options().visible })),
        averageCount: averages.size,
        nativePaneLines: paneLines.size,
        oscillatorCount: oscillators.size,
        supertrendCount: supertrendOverlays.size,
        parabolicSarCount: parabolicSarOverlays.size,
        ichimokuCount: ichimokuOverlays.size,
        pivotCount: pivotOverlays.size,
        pivotSeries: [...pivotOverlays.entries()].map(([id, group]) => ({ id, options: { ...group.options, sourceWindow: { ...group.options.sourceWindow } }, lines: Object.fromEntries(["p", "r1", "r2", "r3", "s1", "s2", "s3"].map((key) => [key, group.values.lines[key].map((point2) => ({ ...point2 }))])), visible: Array.from(group.series.values(), (series) => series.options().visible) })),
        ichimokuSeries: [...ichimokuOverlays.entries()].map(([id, group]) => ({ id, options: { ...group.options }, lines: Object.fromEntries(["tenkan", "kijun", "senkouA", "senkouB", "chikou"].map((key) => [key, group.values[key].map((point2) => ({ ...point2 }))])), visible: group.series.map((series) => series.options().visible) })),
        bollingerCount: bollingerOverlays.size,
        bollingerSeries: [...bollingerOverlays.entries()].map(([id, group]) => ({ id, options: { ...group.options }, lines: { upper: group.values.upper.map((point2) => ({ ...point2 })), middle: group.values.middle.map((point2) => ({ ...point2 })), lower: group.values.lower.map((point2) => ({ ...point2 })) }, visible: group.series.map((series) => series.options().visible) })),
        atrBandsCount: atrBandsOverlays.size,
        atrBandsSeries: [...atrBandsOverlays.entries()].map(([id, group]) => ({ id, options: { ...group.options }, lines: { upper: group.values.upper.map((point2) => ({ ...point2 })), middle: group.values.middle.map((point2) => ({ ...point2 })), lower: group.values.lower.map((point2) => ({ ...point2 })) }, visible: group.series.map((series) => series.options().visible) })),
        linearRegressionCount: linearRegressionOverlays.size,
        linearRegressionLineCount: [...linearRegressionOverlays.values()].reduce((count, group) => count + group.series.length, 0),
        linearRegressionSeries: [...linearRegressionOverlays.entries()].map(([id, group]) => ({ id, options: { ...group.options }, lines: { upper: group.values.upper.map((point2) => ({ ...point2 })), middle: group.values.middle.map((point2) => ({ ...point2 })), lower: group.values.lower.map((point2) => ({ ...point2 })) }, visible: group.series.map((series) => series.options().visible) })),
        oscillatorPaneCount: new Set(Array.from(oscillators.values(), (group) => {
          const series = group.series.values().next().value;
          return series ? chart.panes().findIndex((pane) => pane.getSeries().includes(series)) : -1;
        }).filter((index) => index >= 0)).size,
        nativePrimitives: drawingCount(),
        selectedDrawingId,
        selectedDrawingIds: [...selectedDrawingIds],
        hoveredDrawingId,
        paneCount: chart.panes().length,
        volumeVisible: !!volume,
        persistenceStatus,
        persistenceError
      };
    }
    const priceAxisResizeObserver = new ResizeObserver(schedulePriceAxisLabelLayout);
    priceAxisResizeObserver.observe(host);
    host.addEventListener("wheel", schedulePriceAxisLabelLayout, { passive: true, capture: true });
    chart.timeScale().subscribeVisibleLogicalRangeChange(schedulePriceAxisLabelLayout);
    function destroy() {
      if (destroyed) return;
      cancelDrawingTool(false);
      finishDrag(true);
      clearPositionOverlays();
      if (volumeZones) {
        price.detachPrimitive(volumeZones.primitive);
        volumeZones = null;
      }
      destroyed = true;
      if (axisLabelFrame !== null) cancelAnimationFrame(axisLabelFrame);
      priceAxisResizeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(schedulePriceAxisLabelLayout);
      host.removeEventListener("wheel", schedulePriceAxisLabelLayout, true);
      host.removeEventListener("pointerdown", onPointerDown, true);
      host.removeEventListener("pointermove", onPointerMove, true);
      host.removeEventListener("pointerup", onPointerUp, true);
      host.removeEventListener("pointercancel", onPointerCancel, true);
      host.removeEventListener("lostpointercapture", onLostPointerCapture, true);
      host.removeEventListener("keydown", onKeyDown, true);
      chart.remove();
      averages.clear();
      managedMovingAverages.clear();
      transientMovingAverages.clear();
      donchianOverlays.clear();
      bollingerOverlays.clear();
      sessionVwapOverlays.clear();
      keltnerOverlays.clear();
      atrBandsOverlays.clear();
      ichimokuOverlays.clear();
      pivotOverlays.clear();
      linearRegressionOverlays.clear();
      supertrendOverlays.clear();
      parabolicSarOverlays.clear();
      paneLines.clear();
      oscillators.clear();
      transientOscillators.clear();
      priceLevels.clear();
      timeMarkers.clear();
      textAnnotations.clear();
      trendLines.clear();
      rectangles.clear();
      ellipses.clear();
      rays.clear();
      fibonacci.clear();
      fibonacciFans.clear();
      trendBasedFibonaccis.clear();
      channels.clear();
      measurements.clear();
      riskRewards.clear();
      readoutIndicators.clear();
      volume = null;
      bars = [];
      barsByTime.clear();
    }
    return Object.freeze({
      setCandles,
      setPricePresentation,
      readPricePresentation,
      addAverage,
      addMovingAverage,
      addTransientMovingAverage,
      addDonchian,
      removeDonchian,
      addBollinger,
      updateBollinger,
      removeBollinger,
      bollingerOptions,
      addSessionVwap,
      updateSessionVwap,
      removeSessionVwap,
      sessionVwapOptions,
      addKeltner,
      removeKeltner,
      addAtrBands,
      updateAtrBands,
      removeAtrBands,
      atrBandsOptions,
      addLinearRegression,
      updateLinearRegression,
      removeLinearRegression,
      linearRegressionOptions,
      addIchimoku,
      updateIchimoku,
      removeIchimoku,
      ichimokuOptions,
      addPivotPoints,
      updatePivotPoints,
      pivotOptions,
      removePivotPoints,
      addSupertrend,
      updateSupertrend,
      removeSupertrend,
      supertrendOptions,
      addParabolicSar,
      updateParabolicSar,
      removeParabolicSar,
      parabolicSarOptions,
      movingAverageOptions,
      moveAverage,
      removeAverage,
      selectDrawings,
      toggleDrawingSelection,
      setSelectedDrawingsVisible,
      setSelectedDrawingsLocked,
      deleteSelectedDrawings,
      addPriceLevel,
      updatePriceLevel,
      removePriceLevel,
      addTimeMarker: (options) => addTimeMarker(options),
      updateTimeMarker,
      removeTimeMarker,
      addTextAnnotation: (options) => addTextAnnotation(options),
      updateTextAnnotation,
      removeTextAnnotation,
      addTrendLine: (options) => addTrendLine(options),
      updateTrendLine,
      removeTrendLine,
      addRectangle: (options) => addRectangle(options),
      updateRectangle,
      removeRectangle,
      addEllipse,
      updateEllipse,
      removeEllipse,
      addRay: (options) => addRay(options),
      updateRay,
      removeRay,
      addFibonacci: (options) => addFibonacci(options),
      updateFibonacci,
      removeFibonacci,
      fibonacciLevels,
      addFibonacciFan,
      updateFibonacciFan,
      removeFibonacciFan,
      fibonacciFanRays,
      addTrendBasedFibonacci,
      updateTrendBasedFibonacci,
      removeTrendBasedFibonacci,
      trendBasedFibonacciLevels,
      addFibonacciTimeZones: (options) => addFibonacciTimeZone(options),
      updateFibonacciTimeZones: updateFibonacciTimeZone,
      removeFibonacciTimeZones: removeFibonacciTimeZone,
      fibonacciTimeZoneGuides,
      addChannel: (options) => addChannel(options),
      updateChannel,
      removeChannel,
      addPitchfork: (options) => addPitchfork(options),
      updatePitchfork,
      removePitchfork,
      drawingPosition,
      drawingGeometry,
      drawingAnchorPosition,
      readDrawing,
      exportDrawings,
      exportLayout,
      importDrawings,
      setDrawingVisible,
      setDrawingLocked,
      undo,
      redo,
      deleteSelectedDrawing,
      duplicateSelectedDrawing,
      duplicateSelectedDrawings,
      addMeasurement,
      updateMeasurement,
      removeMeasurement,
      measurementReadout,
      addPaneLine,
      movePaneLine,
      removePaneLine,
      addOscillator,
      updateOscillator,
      removeOscillator,
      addTransientOscillator,
      updateTransientOscillator,
      removeTransientOscillator,
      moveOscillator,
      oscillatorOptions,
      oscillatorPaneLayout,
      resizePane,
      paneHeights,
      showVolume,
      visibleLogicalRange,
      setVisibleLogicalRange,
      setDisplayTimeZone,
      displayTimeZone: () => displayTimeZone,
      formatTimeLabel: formatDisplayTime,
      formatCrosshairTime,
      readDataWindow,
      updateLast,
      changeAccount,
      averageOptions,
      setVolumeZones,
      readVolumeZones,
      clearVolumeZones,
      setAutoFibonacci,
      readAutoFibonacci,
      clearAutoFibonacci,
      setMarketLevels,
      readMarketLevels,
      clearMarketLevels,
      setPositionOverlays,
      readPositionOverlays,
      clearPositionOverlays,
      setBrokerDealMarkers,
      readBrokerDealMarkers,
      setDrawingTool,
      drawingToolState,
      verifyPersistence,
      inspect,
      destroy
    });
  }
  return __toCommonJS(adapter_exports);
})();
/*! Bundled license information:

lightweight-charts/dist/lightweight-charts.production.mjs:
  (*!
   * @license
   * TradingView Lightweight Charts™ v5.2.1
   * Copyright (c) 2026 TradingView, Inc.
   * Licensed under Apache License 2.0 https://www.apache.org/licenses/LICENSE-2.0
   *)
*/
