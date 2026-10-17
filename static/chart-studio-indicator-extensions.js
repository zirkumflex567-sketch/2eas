(function (root) {
  "use strict";
  const accounts = new Set(["titan", "xau5m_m5", "titan_m5", "xau5m_500"]);
  const symbolPattern = /^XAUUSD(?:\.p|\.pi)?$/i;
  const maxPackageChars = 64 * 1024;
  const floatTag = Symbol("python-float");
  const identifierPattern = /^[a-z][a-z0-9-]{0,47}$/;

  function taggedFloat(value) { return { [floatTag]: value }; }
  function pythonFloat(value) {
    if (Object.is(value, -0)) return "-0.0";
    const magnitude = Math.abs(value);
    if (magnitude === 0) return "0.0";
    let representation = value.toString();
    if (magnitude >= 1e-4 && magnitude < 1e16) {
      if (!/[eE]/.test(representation)) return representation.includes(".") ? representation : representation + ".0";
      const [mantissa, exponentText] = representation.toLowerCase().split("e");
      const exponent = Number(exponentText);
      const digits = mantissa.replace(".", "").replace("-", "");
      const decimal = mantissa.replace("-", "").indexOf(".");
      const point = decimal < 0 ? mantissa.replace("-", "").length : decimal;
      const target = point + exponent;
      const expanded = target <= 0 ? "0." + "0".repeat(-target) + digits
        : target >= digits.length ? digits + "0".repeat(target - digits.length) + ".0"
        : digits.slice(0, target) + "." + digits.slice(target);
      return (value < 0 ? "-" : "") + expanded;
    }
    if (!/[eE]/.test(representation)) representation = value.toExponential();
    const [mantissa, exponentText] = representation.toLowerCase().split("e");
    const exponent = Number(exponentText);
    return mantissa + "e" + (exponent < 0 ? "-" : "+") + String(Math.abs(exponent)).padStart(2, "0");
  }

  function canonicalJson(value) {
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, floatTag)) {
      return pythonFloat(value[floatTag]);
    }
    if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error("INVALID_NUMBER");
      return String(value);
    }
    if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
    if (typeof value === "object") {
      return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
    }
    throw new Error("INVALID_JSON_VALUE");
  }

  function exactKeys(value, keys) {
    return value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
  }

  function validUnicode(value) {
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
        index += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    }
    return true;
  }

  function normalizedManifest(input) {
    if (!exactKeys(input, ["id", "version", "name", "parameters", "expression"])) throw new Error("INVALID_MANIFEST");
    if (typeof input.id !== "string" || !identifierPattern.test(input.id)) throw new Error("INVALID_IDENTIFIER");
    if (typeof input.version !== "string" || !/^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/.test(input.version)) throw new Error("INVALID_VERSION");
    if (typeof input.name !== "string" || !input.name || [...input.name].length > 48 || !validUnicode(input.name) || /[\u0000-\u001f\u007f]/.test(input.name)) throw new Error("INVALID_NAME");
    if (!Array.isArray(input.parameters) || input.parameters.length > 16) throw new Error("PARAMETER_LIMIT");
    const parameters = new Set();
    const declarations = input.parameters.map(item => {
      if (!exactKeys(item, ["id", "min", "max", "default", "step"]) || typeof item.id !== "string" || !identifierPattern.test(item.id)) throw new Error("INVALID_PARAMETER");
      if (parameters.has(item.id)) throw new Error("DUPLICATE_PARAMETER");
      parameters.add(item.id);
      const values = [item.min, item.max, item.default, item.step];
      if (!values.every(value => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12) || item.step <= 0) throw new Error("INVALID_NUMBER");
      if (item.max < item.min || item.default < item.min || item.default > item.max) throw new Error("INVALID_PARAMETER_RANGE");
      const ratio = (item.default - item.min) / item.step;
      if (!Number.isFinite(ratio) || Math.abs(ratio - Math.round(ratio)) > 1e-9) throw new Error("INVALID_PARAMETER_STEP");
      return { id: item.id, min: taggedFloat(item.min), max: taggedFloat(item.max), default: taggedFloat(item.default), step: taggedFloat(item.step) };
    });
    const stats = { nodes: 0 };
    function visit(node, depth) {
      if (depth > 16) throw new Error("DEPTH_LIMIT");
      if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error("INVALID_EXPRESSION");
      stats.nodes += 1;
      if (stats.nodes > 128) throw new Error("NODE_LIMIT");
      if (exactKeys(node, ["source"])) {
        if (typeof node.source !== "string" || !["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"].includes(node.source)) throw new Error("INVALID_SOURCE");
        return { source: node.source };
      }
      if (exactKeys(node, ["constant"])) {
        if (typeof node.constant !== "number" || !Number.isFinite(node.constant) || Math.abs(node.constant) > 1e12) throw new Error("INVALID_NUMBER");
        return { constant: taggedFloat(node.constant) };
      }
      if (exactKeys(node, ["parameter"])) {
        if (typeof node.parameter !== "string" || !parameters.has(node.parameter)) throw new Error("UNKNOWN_PARAMETER");
        return { parameter: node.parameter };
      }
      if (node.op === "abs" || node.op === "neg") {
        if (!exactKeys(node, ["op", "input"])) throw new Error("UNSUPPORTED_OPERATION");
        return { op: node.op, input: visit(node.input, depth + 1) };
      }
      if (["add", "sub", "mul", "div", "min", "max"].includes(node.op)) {
        if (!exactKeys(node, ["op", "left", "right"])) throw new Error("UNSUPPORTED_OPERATION");
        return { op: node.op, left: visit(node.left, depth + 1), right: visit(node.right, depth + 1) };
      }
      if (node.op === "sma" || node.op === "ema") {
        if (!exactKeys(node, ["op", "period", "input"]) || !Number.isInteger(node.period) || node.period < 2 || node.period > 1000) throw new Error("PERIOD_LIMIT");
        return { op: node.op, period: node.period, input: visit(node.input, depth + 1) };
      }
      throw new Error("UNSUPPORTED_OPERATION");
    }
    return { id: input.id, version: input.version, name: input.name, parameters: declarations, expression: visit(input.expression, 1) };
  }

  function canonicalizeManifestForSigning(input) {
    const manifest = normalizedManifest(input);
    const canonical = canonicalJson(manifest);
    if (new TextEncoder().encode(canonical).byteLength > maxPackageChars) throw new Error("PACKAGE_LIMIT");
    return { manifest, canonical };
  }

  function base64Bytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function bytesBase64(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary);
  }

  async function privateKeyBytes(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 8192) { bytes.fill(0); throw new Error("KEY_FILE_LIMIT"); }
    if (bytes.length < 16) { bytes.fill(0); throw new Error("INVALID_PKCS8"); }
    if (file.name.toLowerCase().endsWith(".pem")) {
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch (_) { bytes.fill(0); throw new Error("INVALID_PKCS8"); }
      const match = text.match(/^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+?)\s+-----END PRIVATE KEY-----\s*$/);
      bytes.fill(0);
      if (!match) throw new Error("INVALID_PKCS8");
      const encoded = match[1].replace(/\s/g, "");
      const decoded = base64Bytes(encoded);
      if (!encoded || bytesBase64(decoded) !== encoded) { decoded.fill(0); throw new Error("INVALID_PKCS8"); }
      return decoded;
    }
    return bytes;
  }

  function mount({ panel, chart, getContext, getCandles }) {
    if (!panel || !chart || typeof getContext !== "function" || typeof getCandles !== "function") return null;
    const section = document.createElement("details");
    section.className = "cs-indicator-extension-panel";
    section.innerHTML = '<summary>Signierte Indikator-Erweiterung · Vorschau</summary>' +
      '<label>Datei <input type="file" accept=".json,application/json" data-extension-file></label>' +
      '<button type="button" data-extension-preview>Signatur prüfen und Vorschau berechnen</button>' +
      '<p role="status" aria-live="polite" data-extension-status>Keine Erweiterung geladen · es wird kein Paket gespeichert oder ausgeführt.</p>' +
      '<details class="cs-indicator-extension-export"><summary>Signiertes Paket lokal exportieren</summary>' +
      '<label>Manifest (JSON)<textarea data-extension-manifest rows="10" spellcheck="false" aria-describedby="cs-extension-export-help"></textarea></label>' +
      '<label>Herausgeber-Key-ID<input type="text" maxlength="48" autocomplete="off" data-extension-key-id></label>' +
      '<label>Ed25519-PKCS#8-Schlüsseldatei (.pem oder .pk8)<input type="file" accept=".pem,.pk8,application/pkcs8,application/octet-stream" data-extension-signing-key></label>' +
      '<button type="button" data-extension-export>Paket im Browser signieren und herunterladen</button>' +
      '<p id="cs-extension-export-help">Der private Schlüssel wird nur im Browser verwendet, nie hochgeladen oder gespeichert. Import/Vorschau funktioniert erst, wenn dieser Herausgeber-Key serverseitig freigeschaltet ist.</p>' +
      '<p role="status" aria-live="polite" data-extension-export-status>Kein Schlüssel geladen · kein Paket exportiert.</p></details>';
    const anchor = panel.querySelector("#cs-evidence-panel") || panel.firstElementChild;
    if (anchor) anchor.insertAdjacentElement("afterend", section);
    else panel.prepend(section);
    const fileInput = section.querySelector("[data-extension-file]");
    const previewButton = section.querySelector("[data-extension-preview]");
    const status = section.querySelector("[data-extension-status]");
    const manifestInput=section.querySelector("[data-extension-manifest]");
    const keyIdInput=section.querySelector("[data-extension-key-id]");
    const signingKeyInput=section.querySelector("[data-extension-signing-key]");
    const exportButton=section.querySelector("[data-extension-export]");
    const exportStatus=section.querySelector("[data-extension-export-status]");
    manifestInput.value=JSON.stringify({id:"custom-indicator",version:"1.0.0",name:"Custom indicator",parameters:[],expression:{source:"close"}},null,2);
    let packageText = "";
    let series = null;
    let generation = 0;

    const removeSeries = () => {
      if (series) {
        try { chart.removeSeries(series); } catch (_) { /* chart may already be disposed */ }
        series = null;
      }
    };
    const invalidateScope = () => {
      generation += 1;
      removeSeries();
      status.textContent = "Konten- oder Zeitrahmenwechsel · Vorschau gelöscht; erneut berechnen.";
    };

    exportButton.addEventListener("click",async()=>{
      exportButton.disabled=true;
      let keyBytes=null,signingKey=null;
      try{
        const keyId=keyIdInput.value.trim();
        if(!identifierPattern.test(keyId))throw new Error("INVALID_KEY_ID");
        const manifestText=manifestInput.value;
        if(manifestText.length>maxPackageChars)throw new Error("PACKAGE_LIMIT");
        let inputManifest;
        try{inputManifest=JSON.parse(manifestText)}catch(_){throw new Error("INVALID_MANIFEST_JSON")}
        const {manifest,canonical}=canonicalizeManifestForSigning(inputManifest);
        const keyFile=signingKeyInput.files?.[0];
        if(!keyFile)throw new Error("PRIVATE_KEY_REQUIRED");
        if(!root.crypto?.subtle||root.isSecureContext===false)throw new Error("WEBCRYPTO_UNAVAILABLE");
        keyBytes=await privateKeyBytes(keyFile);
        try{
          signingKey=await root.crypto.subtle.importKey("pkcs8",keyBytes.buffer.slice(keyBytes.byteOffset,keyBytes.byteOffset+keyBytes.byteLength),{name:"Ed25519"},false,["sign"]);
        }catch(error){throw new Error(error?.name==="NotSupportedError"?"ED25519_UNAVAILABLE":"INVALID_PKCS8")}
        keyBytes.fill(0);keyBytes=null;
        const signature=new Uint8Array(await root.crypto.subtle.sign("Ed25519",signingKey,new TextEncoder().encode(canonical)));
        const packageText=canonicalJson({schemaVersion:1,keyId,signature:bytesBase64(signature),manifest});
        const packageBytes=new TextEncoder().encode(packageText);
        if(packageBytes.byteLength>maxPackageChars)throw new Error("PACKAGE_LIMIT");
        const blob=new Blob([packageBytes],{type:"application/json;charset=utf-8"});
        const url=URL.createObjectURL(blob),link=document.createElement("a");
        link.href=url;link.download=manifest.id+"-"+manifest.version+".json";link.hidden=true;
        section.append(link);link.click();link.remove();root.setTimeout(()=>URL.revokeObjectURL(url),1000);
        exportStatus.textContent="Paket signiert und lokal heruntergeladen · privater Schlüssel weder gespeichert noch gesendet. Servervorschau erst nach Freischaltung dieses Public Keys.";
        signature.fill(0);
      }catch(error){
        const code=typeof error?.message==="string"&&/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:"SIGNING_FAILED";
        exportStatus.textContent="Export abgelehnt · "+code+". Es wurde kein Paket heruntergeladen.";
      }finally{
        if(keyBytes)keyBytes.fill(0);
        signingKey=null;
        signingKeyInput.value="";
        exportButton.disabled=false;
      }
    });

    fileInput.addEventListener("change", async () => {
      packageText = "";
      removeSeries();
      const file = fileInput.files?.[0];
      if (!file) {
        status.textContent = "Keine Datei ausgewählt.";
        return;
      }
      if (file.size > maxPackageChars) {
        fileInput.value = "";
        status.textContent = "Paket zu groß · maximal 64 KiB.";
        return;
      }
      try {
        packageText = await file.text();
        if (packageText.length > maxPackageChars) throw new Error("PACKAGE_LIMIT");
        JSON.parse(packageText);
        status.textContent = "Paket gelesen · noch nicht verifiziert.";
      } catch (_) {
        packageText = "";
        status.textContent = "Ungültige JSON-Datei · es wurde nichts importiert.";
      }
    });

    previewButton.addEventListener("click", async () => {
      generation += 1;
      const requestGeneration = generation;
      removeSeries();
      if (!packageText) {
        status.textContent = "Zuerst eine JSON-Paketdatei auswählen.";
        return;
      }
      const context = getContext();
      const contextKey = context && `${context.account}|${context.symbol}|${context.timeframe}`;
      const bars = getCandles();
      if (!context || !accounts.has(context.account) || !symbolPattern.test(context.symbol) ||
          !/^(M1|M5|M15|M30|H1|H4|D1)$/.test(context.timeframe) ||
          !Array.isArray(bars) || bars.length < 1 || bars.length > 10000) {
        status.textContent = "Kein unterstützter Demo-Chart mit geladenen Kerzen verfügbar.";
        return;
      }
      status.textContent = "Signatur wird geprüft und Vorschau berechnet …";
      try {
        const prefix = root.location.pathname.startsWith("/stt") ? "/stt" : "";
        const response = await fetch(prefix + "/api/chart/v1/indicator-extensions/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            ...context,
            package: packageText,
            parameters: {},
            bars: bars.map(bar => ({ time: Number(bar.time), open: bar.open, high: bar.high, low: bar.low, close: bar.close }))
          })
        });
        const data = await response.json();
        if (generation !== requestGeneration) return;
        const current = getContext();
        if (!current || `${current.account}|${current.symbol}|${current.timeframe}` !== contextKey) {
          status.textContent = "Chart-Scope geändert · verspätetes Ergebnis verworfen.";
          return;
        }
        if (!response.ok) {
          const code = data?.detail?.code || "PREVIEW_UNAVAILABLE";
          status.textContent = code === "TRUST_STORE_UNAVAILABLE"
            ? "Import gesperrt · der Server hat noch keine vertrauenswürdigen Herausgeber-Schlüssel."
            : "Paket abgelehnt · " + code;
          return;
        }
        if (data.source !== "CALLER_SUPPLIED_BARS" || data.canExecute !== false ||
            data.account !== context.account || data.symbol !== context.symbol || data.timeframe !== context.timeframe ||
            !Array.isArray(data.series) || data.series.length !== bars.length ||
            !data.series.every((point, index) => point.time === Number(bars[index].time) &&
              (point.value === null || (typeof point.value === "number" && Number.isFinite(point.value))))) {
          status.textContent = "Unerwartetes API-Ergebnis · Vorschau verworfen.";
          return;
        }
        const points = data.series.filter(point => Number.isSafeInteger(point.time) &&
          (point.value === null || (typeof point.value === "number" && Number.isFinite(point.value))))
          .filter(point => point.value !== null).map(point => ({ time: point.time, value: point.value }));
        if (!points.length) {
          status.textContent = "Signatur gültig · noch keine berechenbaren Werte (Warm-up).";
          return;
        }
        series = chart.addLineSeries({
          title: data.indicator.name + " · Erweiterung",
          color: "#f3c56a", lineWidth: 2, lastValueVisible: false, priceLineVisible: false
        });
        series.setData(points);
        status.textContent = `${data.indicator.name} · signiert und verifiziert · ${points.length} Werte · ${context.timeframe} · ${data.source} · nicht ausführbar · nur aktuelle Sitzung.`;
      } catch (_) {
        if (generation === requestGeneration) status.textContent = "Vorschau fehlgeschlagen · Chartdaten oder Serverantwort nicht verfügbar.";
      }
    });

    return { clear: invalidateScope, refresh: invalidateScope };
  }

  root.ChartStudioIndicatorExtensions = { mount };
})(window);
