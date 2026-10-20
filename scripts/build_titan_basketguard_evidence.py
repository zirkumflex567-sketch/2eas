"""Prepare an account-bound Titan BasketGuard recorder build under output/."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import build_titan_evidence as COMMON


ALLOWED_ACCOUNTS = frozenset({"xau5m_m5", "titan_m5"})
EXPECTED_PRESETS = {"xau5m_m5": "puprime250.set", "titan_m5": "puprime500.set"}
EXPECTED_PRESET_SHA256 = {
    "xau5m_m5": "ff92ce8710e151cb73d304e411338c411db487bc3983f15eec541138a0aea286",
    "titan_m5": "feb3030fee155bb41e8604a67117519f97db00beac614e103180813faf697e69",
}
EXPECTED_INSTALLED_SOURCE_SHA256 = {
    "xau5m_m5": "1fb7858b6cc48e2274221e6dc2dfbf3790e6941989faf6411885e2fdcefc4e32",
    "titan_m5": "0400b695b428da64e4a57c48d8484c295724333049ab8b034a5d744a417b597a",
}
SOURCE_NAME = "XAU_Titan_Pro_BasketGuard.mq5"
EA_NAME = "XAU_Titan_Pro_BasketGuard_EvidenceCapture"


def _expected_parameter_hash(source_text: str, values: dict[str, str], alias: str = "xau5m_m5") -> str:
    if alias not in ALLOWED_ACCOUNTS:
        raise ValueError("effective parameter hash is restricted to the allowlisted demo accounts")
    runtime_values = dict(values)
    if "InpEnablePropProtection" in runtime_values:
        # This legacy input is intentionally ignored by BasketGuard. The
        # canonical runtime hash records the account-bound Blueberry decision.
        runtime_values["InpEnablePropProtection"] = "false"
    return COMMON._expected_parameter_hash(source_text, runtime_values)


def _input_declarations(source_text: str) -> list[tuple[str, str, str]]:
    rows = re.findall(r"^\s*input\s+(\w+)\s+(\w+)\s*=\s*([^;]+);", source_text, re.M)
    if not rows or len({name for _kind, name, _default in rows}) != len(rows):
        raise ValueError("BasketGuard input schema is empty or contains duplicate names")
    return rows


def _function_definition(source_text: str, name: str) -> str:
    match = re.search(rf"(?m)^\w+\s+{re.escape(name)}\s*\([^)]*\)\s*\{{", source_text)
    if not match:
        raise ValueError(f"expected unique {name} definition in BasketGuard source")
    start = match.start()
    depth = 0
    for index in range(match.end() - 1, len(source_text)):
        if source_text[index] == "{":
            depth += 1
        elif source_text[index] == "}":
            depth -= 1
            if depth == 0:
                return source_text[start:index + 1]
    raise ValueError(f"unterminated {name} definition")


def _normalize_reviewed_installed_source(installed_text: str, main_source_text: str) -> str:
    """Allow only known identity, challenge-binding, and capture-clock deltas."""
    normalized = installed_text.replace("\r\n", "\n").replace("\r", "\n")
    normalized, header_count = re.subn(
        r"(?m)^#define CS_EVIDENCE_CAPTURE\n(?:^#define CS_EVIDENCE_[^\n]*\n)+",
        "",
        normalized,
        count=1,
    )
    if header_count != 1:
        raise ValueError("installed BasketGuard is missing its reviewed account-bound build header")

    declaration = 'string CSParameterSetHash="";\n'
    if normalized.count(declaration) != 1:
        raise ValueError("installed BasketGuard parameter-hash declaration drifted")
    normalized = normalized.replace(declaration, declaration + "bool IsBlueberryChallengeAccount();\n", 1)

    main_input = next(line for line in main_source_text.splitlines(keepends=True)
                      if re.match(r"\s*input\s+bool\s+InpEnablePropProtection\s*=", line))
    old_input = re.compile(r"(?m)^\s*input\s+bool\s+InpEnablePropProtection\s*=\s*true;[^\n]*\n")
    normalized, count = old_input.subn(main_input, normalized, count=1)
    if count != 1:
        raise ValueError("installed BasketGuard prop-input behavior drifted")

    old_hash_line = '   result+="InpEnablePropProtection="+(InpEnablePropProtection ? "1" : "0")+"\\n";\n'
    main_hash_line = next(line for line in main_source_text.splitlines(keepends=True)
                          if 'result+="InpEnablePropProtection="' in line)
    normalized = _replace_once(normalized, old_hash_line, main_hash_line, "parameter-hash guard")

    challenge_function = _function_definition(main_source_text, "IsBlueberryChallengeAccount")
    wait_anchor = "bool           m_wait_for_signal_reset = false;\n"
    normalized = _replace_once(normalized, wait_anchor,
                               wait_anchor + "\n// Challenge protection belongs only to the explicitly configured Blueberry account.\n"
                               + challenge_function + "\n", "Blueberry account binding")

    init_anchor = "   m_last_entry_time   = GetLastEntryTimeForMagic();\n"
    binding_log = ('   PrintFormat("Blueberry challenge protection binding: %s",\n'
                   '               IsBlueberryChallengeAccount() ? "ACTIVE" : "disabled for non-Blueberry account");\n')
    normalized = _replace_once(normalized, init_anchor, init_anchor + binding_log, "challenge initialization log")
    normalized = _replace_once(normalized, "   if(InpEnablePropProtection)\n",
                               "   if(IsBlueberryChallengeAccount())\n", "challenge guard binding")
    old_quote_clock = "CSUtcFromMillis(cs_tick.time_msc)"
    if normalized.count(old_quote_clock) != 2:
        raise ValueError("installed BasketGuard quote-clock capture points drifted")
    normalized = normalized.replace(old_quote_clock,
                                    "CSUtcFromBrokerMillis(cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS)")
    prior_shutdown = "#ifdef CS_EVIDENCE_CAPTURE_ENABLED\n   EventKillTimer();"
    flushed_shutdown = ("#ifdef CS_EVIDENCE_CAPTURE_ENABLED\n"
                        "   CSFlushEvidenceQueueOnShutdown();\n"
                        "   EventKillTimer();")
    if normalized.count(flushed_shutdown) == 1:
        pass
    elif normalized.count(prior_shutdown) == 1:
        normalized = normalized.replace(prior_shutdown, flushed_shutdown, 1)
    else:
        raise ValueError("installed BasketGuard shutdown hook is ambiguous or unreviewed")
    return normalized


def _assert_reviewed_semantic_parity(installed_text: str, main_source_text: str) -> None:
    if _normalize_reviewed_installed_source(installed_text, main_source_text) != main_source_text:
        raise ValueError("installed BasketGuard source differs from main outside reviewed capture/Blueberry changes")


def _replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise ValueError(f"installed BasketGuard {label} anchor is missing or ambiguous")
    return text.replace(old, new, 1)


def _guard_broker_write_calls(source_text: str) -> str:
    methods = {"Buy", "Sell", "PositionModify", "PositionClose"}
    calls = []
    for match in re.finditer(r"m_trade\.(Buy|Sell|PositionModify|PositionClose)\s*\(", source_text):
        open_paren = source_text.find("(", match.start())
        depth = 0
        quoted = False
        escaped = False
        end = None
        for index in range(open_paren, len(source_text)):
            char = source_text[index]
            if quoted:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    quoted = False
                continue
            if char == '"':
                quoted = True
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    end = index + 1
                    break
        if end is None:
            raise ValueError(f"unterminated CTrade.{match.group(1)} call")
        calls.append((match.start(), end, match.group(1), source_text[match.start():end]))
    expected_counts = {"Buy": 1, "Sell": 1, "PositionModify": 3, "PositionClose": 1}
    observed = {method: sum(1 for _start, _end, name, _call in calls if name == method)
                for method in methods}
    if observed != expected_counts:
        raise ValueError(f"BasketGuard broker-write call inventory drifted: {observed}")
    for start, end, method, call in reversed(calls):
        guarded = f'(CS_EVIDENCE_RECORD_ONLY ? CSSuppressBrokerWrite("{method.upper()}") : {call})'
        source_text = source_text[:start] + guarded + source_text[end:]
    helper = '''

bool CSSuppressBrokerWrite(const string operation)
  {
   PrintFormat("RECORD-ONLY: suppressed broker write %s",operation);
   return false;
  }
'''
    include_line = '#include <Trade\\Trade.mqh>'
    if source_text.count(include_line) != 1:
        raise ValueError("expected unique Trade.mqh include after write guards")
    return source_text.replace(include_line, include_line + helper, 1)


def _effective_preset(source_text: str, preset_path: Path) -> dict[str, str]:
    _, supplied = COMMON._preset_input_names(Path(preset_path))
    declarations = _input_declarations(source_text)
    declared = {name for _kind, name, _default in declarations}
    unknown = set(supplied) - declared
    if unknown:
        raise ValueError(f"preset contains unknown input keys: {', '.join(sorted(unknown))}")
    values = {
        name: supplied.get(name, default.strip())
        for _kind, name, default in declarations
    }
    # Reuse the existing strict canonical serializer to validate every supplied
    # value and every source default, including finite numeric values.
    _expected_parameter_hash(source_text, values)
    return values


def _instrument_source(source_text: str, alias: str, producer: str,
                       terminal_hash: str, source_hash: str,
                       expected_parameter_hash: str, login: int, server: str,
                       terminal_path: str, broker_utc_offset_seconds: int,
                       record_only: bool = False) -> str:
    if alias not in ALLOWED_ACCOUNTS:
        raise ValueError(f"account {alias!r} is not allowlisted for BasketGuard evidence builds")
    if not re.fullmatch(r"[0-9a-f]{64}", terminal_hash) or not re.fullmatch(r"[0-9a-f]{64}", source_hash):
        raise ValueError("source and terminal identities must be SHA-256 digests")
    if not re.fullmatch(r"[0-9a-f]{64}", expected_parameter_hash):
        raise ValueError("effective parameter hash must be a SHA-256 digest")
    if type(broker_utc_offset_seconds) is not int or not -86400 <= broker_utc_offset_seconds <= 86400:
        raise ValueError("invalid configured broker UTC offset")
    marker = '#include <Trade\\Trade.mqh>'
    if source_text.count(marker) != 1:
        raise ValueError("expected unique Trade.mqh include")
    definitions = [
        "#define CS_EVIDENCE_CAPTURE",
        f"#define CS_EVIDENCE_RECORD_ONLY {1 if record_only else 0}",
        f"#define CS_EVIDENCE_ACCOUNT_ID {COMMON._mql_string(alias)}",
        f"#define CS_EVIDENCE_PRODUCER_ID {COMMON._mql_string(producer)}",
        f"#define CS_EVIDENCE_TERMINAL_HASH {COMMON._mql_string(terminal_hash)}",
        f"#define CS_EVIDENCE_SOURCE_HASH {COMMON._mql_string(source_hash)}",
        f"#define CS_EVIDENCE_EXPECTED_PARAMETER_SET_HASH {COMMON._mql_string(expected_parameter_hash)}",
        f"#define CS_EVIDENCE_EXPECTED_LOGIN {int(login)}",
        f"#define CS_EVIDENCE_EXPECTED_SERVER {COMMON._mql_string(server)}",
        f"#define CS_EVIDENCE_EXPECTED_TERMINAL_PATH {COMMON._mql_string(terminal_path)}",
        f"#define CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS {broker_utc_offset_seconds}",
    ]
    generated = source_text.replace(marker, "\n".join(definitions) + "\n" + marker, 1)
    if record_only:
        generated = _guard_broker_write_calls(generated)
    init_anchor = '''   else if(CSInitializeEvidenceProducer() && !EventSetTimer(1))'''
    guarded_init = '''   else if(CSParameterSetHash!=CS_EVIDENCE_EXPECTED_PARAMETER_SET_HASH)
     {
      Print("ChartStudio evidence recorder disabled: active inputs differ from the approved preset and EA defaults.");
      CSRecorderDisabled=true;
     }
   else if(CSInitializeEvidenceProducer() && !EventSetTimer(1))'''
    if generated.count(init_anchor) != 1:
        raise ValueError("expected unique BasketGuard recorder initialization anchor")
    generated = generated.replace(init_anchor, guarded_init, 1)

    deinit = _function_definition(generated, "OnDeinit")
    if (deinit.count("CSFlushEvidenceQueueOnShutdown();") != 1 or
            deinit.index("CSFlushEvidenceQueueOnShutdown();") > deinit.index("EventKillTimer();")):
        raise ValueError("BasketGuard source must flush recorder queue before stopping its timer")

    order_registration_anchor = '''#endif
            if(entry_accepted)'''
    if generated.count(order_registration_anchor) != 2:
        raise ValueError("expected one accepted-order registration point per trade direction")
    generated = generated.replace(
        order_registration_anchor,
        '''if(entry_accepted && cs_order_ticket>0)
               CSRegisterOrderAttempt(cs_order_ticket,cs_attempt_id,rates[0].time);
#endif
            if(entry_accepted)''',
    )

    transaction_stub = '''// Deal/lifecycle recording remains owned by the broker-side evidence adapter;
// this EA hook intentionally performs no duplicate history or file I/O.
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
  }'''
    transaction_capture = '''#ifdef CS_EVIDENCE_CAPTURE_ENABLED
#define CS_ORDER_CORRELATION_CAPACITY 64
ulong CSOrderTickets[CS_ORDER_CORRELATION_CAPACITY];
string CSOrderAttemptIds[CS_ORDER_CORRELATION_CAPACITY];
datetime CSOrderSignalBars[CS_ORDER_CORRELATION_CAPACITY];
int CSOrderCorrelationNext=0;

void CSRegisterOrderAttempt(const ulong order_ticket,const string attempt_id,const datetime signal_bar)
  {
   if(order_ticket==0 || attempt_id=="" || signal_bar<=0)
      return;
   int slot=CSOrderCorrelationNext%CS_ORDER_CORRELATION_CAPACITY;
   CSOrderTickets[slot]=order_ticket;
   CSOrderAttemptIds[slot]=attempt_id;
   CSOrderSignalBars[slot]=signal_bar;
   CSOrderCorrelationNext++;
  }

bool CSFindOrderAttempt(const ulong order_ticket,string &attempt_id,datetime &signal_bar)
  {
   if(order_ticket==0)
      return false;
   for(int i=0;i<CS_ORDER_CORRELATION_CAPACITY;i++)
      if(CSOrderTickets[i]==order_ticket && CSOrderAttemptIds[i]!="")
        {
         attempt_id=CSOrderAttemptIds[i];
         signal_bar=CSOrderSignalBars[i];
         return signal_bar>0;
        }
   return false;
  }

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(!CSRecorderReady || CSRecorderDisabled || trans.type!=TRADE_TRANSACTION_DEAL_ADD ||
      trans.symbol!=_Symbol || trans.order==0 || trans.deal==0 || trans.position==0 ||
      trans.volume<=0.0 || trans.price<=0.0)
      return;
   string cs_attempt_id="";
   datetime cs_signal_bar=0;
   if(!CSFindOrderAttempt(trans.order,cs_attempt_id,cs_signal_bar))
      return;
   string cs_features=CSFeature("deal_volume",CSNumber(trans.volume,8),"lots","M15")+","+
      CSFeature("deal_price",CSNumber(trans.price,_Digits),"price","M15")+","+
      CSFeature("deal_type_code",IntegerToString((int)trans.deal_type),"enum","M15")+","+
      CSFeature("deal_stop_loss",CSNumber(trans.price_sl,_Digits),"price","M15")+","+
      CSFeature("deal_take_profit",CSNumber(trans.price_tp,_Digits),"price","M15");
   string cs_predicates=CSPredicate("broker_deal_observed","1","EQ","1","PASS","TRADE_TRANSACTION_DEAL_ADD");
   CSEnqueueDecision("BROKER_RESULT","PASS",cs_signal_bar,cs_features,cs_predicates,"",
                     cs_attempt_id,trans.order,"",trans.deal,trans.position);
  }
#endif'''
    if generated.count(transaction_stub) != 1:
        raise ValueError("expected unique empty BasketGuard transaction hook")
    generated = generated.replace(transaction_stub, transaction_capture, 1)
    return generated


def _manifest(source_text: str, source_bytes: bytes, alias: str, preset_path: Path,
              effective_values: dict[str, str], terminal_hash: str,
              source_hash: str, record_only: bool = False) -> dict:
    return {
        "schemaVersion": 1,
        "accountAlias": alias,
        "producerId": "titan_puprime250" if alias == "xau5m_m5" else "titan_puprime500",
        "sourceSha256": hashlib.sha256(source_bytes).hexdigest(),
        "sourceAndIncludeSha256": source_hash,
        "terminalIdentityHash": terminal_hash,
        "presetName": Path(preset_path).name,
        "presetSha256": hashlib.sha256(Path(preset_path).read_bytes()).hexdigest(),
        "presetInputCount": len(COMMON._preset_input_names(Path(preset_path))[1]),
        "effectiveInputCount": len(effective_values),
        "effectiveParameterSetHash": _expected_parameter_hash(source_text, effective_values, alias),
        "challengeProtection": "account-bound; false on PU Prime demos",
        "recordOnly": bool(record_only),
        "inputSchemaSha256": hashlib.sha256("\n".join(sorted(effective_values)).encode()).hexdigest(),
    }


def prepare_variant(repo_root: Path, alias: str, preset_path: Path,
                    record_only: bool = False) -> COMMON.BuildVariant:
    if alias not in ALLOWED_ACCOUNTS:
        raise ValueError(f"account {alias!r} is not allowlisted for BasketGuard evidence builds")
    if Path(preset_path).name.casefold() != EXPECTED_PRESETS[alias].casefold():
        raise ValueError(f"preset filename is not bound to account {alias!r}")
    if hashlib.sha256(Path(preset_path).read_bytes()).hexdigest() != EXPECTED_PRESET_SHA256[alias]:
        raise ValueError(f"preset content hash is not bound to account {alias!r}")

    repo_root = Path(repo_root).resolve()
    source_path = repo_root / SOURCE_NAME
    helper_path = repo_root / "ChartStudioEvidenceSpool.mqh"
    source_bytes = source_path.read_bytes()
    helper_bytes = helper_path.read_bytes()
    source_text = source_bytes.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    values = _effective_preset(source_text, Path(preset_path))

    sys.path.insert(0, str(repo_root))
    import account_gateway
    from chart_studio.evidence_api import DEFAULT_EVIDENCE_PRODUCERS
    from chart_studio.evidence_models import AccountContext

    spec = account_gateway.ACCOUNTS[alias]
    if spec.get("is_demo") is not True or spec.get("server") != "PUPrime-Demo":
        raise ValueError(f"account {alias!r} is not the expected PU Prime demo")
    terminal = Path(spec["terminal"]).resolve()
    if not terminal.is_file():
        raise FileNotFoundError(f"configured terminal executable not found for {alias}")
    mql_root = terminal.parent / "MQL5"
    installed_source = mql_root / "Experts" / SOURCE_NAME
    installed_binary = mql_root / "Experts" / SOURCE_NAME.replace(".mq5", ".ex5")
    if not installed_source.is_file() or not installed_binary.is_file():
        raise FileNotFoundError(f"installed BasketGuard source/binary not found for {alias}")
    installed_source_bytes = installed_source.read_bytes()
    installed_source_digest = hashlib.sha256(installed_source_bytes).hexdigest()
    if installed_source_digest != EXPECTED_INSTALLED_SOURCE_SHA256[alias]:
        raise ValueError(f"installed BasketGuard source drifted from reviewed demo source for {alias}")
    installed_text = installed_source_bytes.decode("utf-8-sig")
    _assert_reviewed_semantic_parity(installed_text, source_text)

    context = AccountContext.from_config(alias)
    source_hash = hashlib.sha256(source_bytes + b"\0" + helper_bytes).hexdigest()
    expected_parameter_hash = _expected_parameter_hash(source_text, values, alias)
    producer = DEFAULT_EVIDENCE_PRODUCERS.get(alias)
    if not producer:
        raise ValueError(f"evidence producer is not configured for {alias}")
    generated = _instrument_source(
        source_text, alias, producer, context.terminal_identity_hash, source_hash,
        expected_parameter_hash, int(spec["login"]), spec["server"],
        str(terminal.parent), spec["broker_utc_offset_seconds"], record_only=record_only,
    )

    build_name = f"{EA_NAME}_RecordOnly" if record_only else EA_NAME
    output_root = repo_root / "output" / "titan-basketguard-evidence" / alias
    if record_only:
        output_root /= "record-only"
    expected_output = (repo_root / "output").resolve()
    directory = output_root
    while directory != repo_root and expected_output in (directory.resolve(), *directory.resolve().parents):
        if directory.exists() and COMMON._is_link_or_junction(directory):
            raise ValueError("build output cannot traverse a symlink or junction")
        if directory == repo_root / "output":
            break
        directory = directory.parent
    expected_build_root = expected_output / "titan-basketguard-evidence" / alias
    if record_only:
        expected_build_root /= "record-only"
    if output_root.resolve() != expected_build_root:
        raise ValueError("build output must remain under repository output/")
    output_root.mkdir(parents=True, exist_ok=True)
    source_output = output_root / f"{build_name}.mq5"
    helper_output = output_root / "ChartStudioEvidenceSpool.mqh"
    manifest_path = output_root / "build-manifest.json"
    for output_file in (source_output, helper_output, manifest_path,
                        source_output.with_suffix(".ex5"), source_output.with_suffix(".log")):
        if output_file.is_symlink() or COMMON._is_link_or_junction(output_file):
            raise ValueError("build output files cannot be links")
    source_output.with_suffix(".ex5").unlink(missing_ok=True)
    source_output.with_suffix(".log").unlink(missing_ok=True)
    COMMON._atomic_write(source_output, generated.encode("utf-8-sig"))
    COMMON._atomic_write(helper_output, helper_bytes)
    manifest = _manifest(source_text, source_bytes, alias, Path(preset_path), values,
                         context.terminal_identity_hash, source_hash, record_only=record_only)
    manifest.update({
        "generatedSourceSha256": hashlib.sha256(source_output.read_bytes()).hexdigest(),
        "installedBinarySha256": hashlib.sha256(installed_binary.read_bytes()).hexdigest(),
        "sourcePath": str(installed_source),
        "installedSourceSha256": installed_source_digest,
        "terminalPath": str(terminal),
        "compiler": str(terminal.parent / "MetaEditor64.exe"),
        "portableIncludeRoot": str(mql_root),
        "artifact": str(source_output.with_suffix(".ex5")),
        "compileLog": str(source_output.with_suffix(".log")),
    })
    COMMON._atomic_write(manifest_path, (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    compiler = terminal.parent / "MetaEditor64.exe"
    return COMMON.BuildVariant(source_output, manifest_path, compiler, mql_root,
                               source_output.with_suffix(".log"))


def compile_candidate(variant):
    artifact = COMMON.compile_variant(variant)
    if COMMON._is_link_or_junction(variant.manifest):
        raise ValueError("candidate manifest cannot be a link")
    manifest = json.loads(variant.manifest.read_text(encoding="utf-8"))
    manifest["artifactSha256"] = hashlib.sha256(artifact.read_bytes()).hexdigest()
    manifest["compileResult"] = "0 errors, 0 warnings"
    COMMON._atomic_write(variant.manifest, (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    return artifact


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("account", choices=sorted(ALLOWED_ACCOUNTS))
    parser.add_argument("--preset", required=True, type=Path)
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--record-only", action="store_true",
                        help="compile a side-by-side diagnostic EA that suppresses every CTrade write")
    args = parser.parse_args()
    try:
        variant = prepare_variant(Path(__file__).resolve().parents[1], args.account, args.preset,
                                  record_only=args.record_only)
        if args.prepare_only:
            print(f"Prepared {variant.source}; manifest {variant.manifest}")
            return 0
        artifact = compile_candidate(variant)
        print(f"Compiled candidate {artifact}; manifest {variant.manifest}")
        return 0
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Recorder build refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
