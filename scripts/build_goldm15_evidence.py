"""Build an isolated, opt-in GoldM15 evidence candidate; never install it in MT5."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import account_gateway
from chart_studio.evidence_models import AccountContext
from build_titan_evidence import (
    BuildVariant,
    _atomic_write,
    _expected_parameter_hash,
    _is_link_or_junction,
    _input_names,
    _mql_string,
    _parameter_hash_function,
    _preset_input_names,
    compile_variant,
)


ALLOWED_ACCOUNTS = frozenset({"goldm15"})
SOURCE = Path("goldm15/GoldM15_Reconstruction.mq5")
HELPERS = (
    Path("goldm15/GoldM15_Core.mqh"),
    Path("goldm15/GoldM15_Risk.mqh"),
    Path("goldm15/GoldM15_RiskCore.mqh"),
    Path("goldm15/GoldM15_News.mqh"),
)
EXPECTED_HASHES = {
    "goldm15/GoldM15_Reconstruction.mq5": "9651f8d86b6243510251a8898d0a0b96abea50b57b3d425709a232aa8736fefc",
    "goldm15/GoldM15_Core.mqh": "f85f2e6a7499884e950edf715f462f6e92ffe204b4f4f84f12c6a8e7004c91e1",
    "goldm15/GoldM15_Risk.mqh": "a7597935174b7283e8df57902fb01ab8d7cca0c584b5adc6ed83920230ebe3b5",
    "goldm15/GoldM15_RiskCore.mqh": "096d2b4d98da67001b381028c615ad5612135482f7d58cb585574a293968335a",
    "goldm15/GoldM15_News.mqh": "54cf4dd2884d90fb2040b3e78ac246b22d1e8b5a168318ee75814431c2da70b6",
    "goldm15/GoldM15_Reconstruction.set": "e6c517dd9e5fc26a4d257506a493163d43bbc52a3b1032479eb8aed89d6efa40",
    "ChartStudioEvidenceSpool.mqh": "8b5656ed7c80700ca937403632aeb936c94ddd9f01452fb96286c0d6daeea083",
}
PRESET_NAME = "GoldM15_Reconstruction.set"
PRODUCER = "goldm15_demo"
EA_NAME = "GoldM15_EvidenceCapture"


def _instrument_source(source_text: str, *, account_alias: str, producer: str,
                       terminal_hash: str, source_hash: str, expected_parameter_hash: str,
                       login: int, server: str, terminal_path: str) -> str:
    if account_alias not in ALLOWED_ACCOUNTS:
        raise ValueError("account is not allowlisted")
    source_text = source_text.replace("\r\n", "\n")
    include_anchor = '#include "GoldM15_Risk.mqh"'
    if source_text.count(include_anchor) != 1:
        raise ValueError("expected unique GoldM15 risk include")
    declarations = _input_names(source_text)
    parameter_hash = _parameter_hash_function(source_text, declarations)
    definitions = [
        "#define CS_EVIDENCE_CAPTURE",
        '#define CS_EVIDENCE_STRATEGY_ID "goldm15_reconstruction"',
        '#define CS_EVIDENCE_STRATEGY_VERSION "1.22"',
        f"#define CS_EVIDENCE_ACCOUNT_ID {_mql_string(account_alias)}",
        f"#define CS_EVIDENCE_PRODUCER_ID {_mql_string(producer)}",
        f"#define CS_EVIDENCE_TERMINAL_HASH {_mql_string(terminal_hash)}",
        f"#define CS_EVIDENCE_SOURCE_HASH {_mql_string(source_hash)}",
        f"#define CS_EVIDENCE_EXPECTED_PARAMETER_SET_HASH {_mql_string(expected_parameter_hash)}",
        f"#define CS_EVIDENCE_EXPECTED_LOGIN {int(login)}",
        f"#define CS_EVIDENCE_EXPECTED_SERVER {_mql_string(server)}",
        f"#define CS_EVIDENCE_EXPECTED_TERMINAL_PATH {_mql_string(terminal_path)}",
        "string CSParameterSetCanonical();",
        'string CSParameterSetHash="";',
        '#include "ChartStudioEvidenceSpool.mqh"',
    ]
    source_text = source_text.replace(include_anchor, include_anchor + "\n" + "\n".join(definitions), 1)

    parameter_anchor = "ENUM_TIMEFRAMES signal_timeframe=PERIOD_CURRENT;"
    if source_text.count(parameter_anchor) != 1:
        raise ValueError("expected unique GoldM15 parameter-hash insertion point")
    source_text = source_text.replace(parameter_anchor, parameter_anchor + "\n\n" + parameter_hash, 1)

    init_anchor = "   PrintFormat(\"SIGNAL_TIMEFRAME input=%s effective=%s chart=%s\",EnumToString(SignalTimeframe),EnumToString(signal_timeframe),EnumToString(Period()));"
    init_capture = '''#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   CSParameterSetHash=CSHashText(CSParameterSetCanonical());
   if(CSParameterSetHash=="")
      Print("ChartStudio evidence recorder disabled: parameter hash unavailable.");
   else if(CSParameterSetHash!=CS_EVIDENCE_EXPECTED_PARAMETER_SET_HASH)
     {
      Print("ChartStudio evidence recorder disabled: active inputs differ from approved preset.");
      CSRecorderDisabled=true;
     }
   else if(signal_timeframe!=PERIOD_M15)
     {
      Print("ChartStudio evidence recorder disabled: only the verified M15 signal timeframe is supported.");
      CSRecorderDisabled=true;
     }
   else if(!risk_active)
     {
      Print("ChartStudio evidence recorder disabled: risk timer unavailable.");
      CSRecorderDisabled=true;
     }
   else
      CSInitializeEvidenceProducer();
#endif
'''
    if source_text.count(init_anchor) != 1:
        raise ValueError("expected unique GoldM15 initialization insertion point")
    source_text = source_text.replace(init_anchor, init_anchor + "\n" + init_capture, 1)

    signal_anchor = "   return true;\n}\nvoid OnTick()"
    signal_capture = '''#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   datetime cs_bar=iTime(_Symbol,signal_timeframe,1);
   for(int cs_i=0;cs_i<3;cs_i++)
     {
      bool cs_buy_fast=fast[cs_i]<=cfg[cs_i].buy_entry;
      bool cs_buy_trend=buy_trend[cs_i]>=cfg[cs_i].buy_trend;
      bool cs_sell_fast=fast[cs_i]>=cfg[cs_i].sell_entry;
      bool cs_sell_trend=sell_trend[cs_i]<=cfg[cs_i].sell_trend;
      bool cs_has_position=SystemPosition(cs_i)>0;
      string cs_entry_features=CSFeature("fast_rsi",CSNumber(fast[cs_i],4),"rsi_points",EnumToString(signal_timeframe))+","+
         CSFeature("buy_trend_rsi",CSNumber(buy_trend[cs_i],4),"rsi_points",EnumToString(signal_timeframe))+","+
         CSFeature("sell_trend_rsi",CSNumber(sell_trend[cs_i],4),"rsi_points",EnumToString(signal_timeframe))+","+
         CSFeature("buy_entry_threshold",CSNumber(cfg[cs_i].buy_entry,4),"rsi_points",EnumToString(signal_timeframe))+","+
         CSFeature("sell_entry_threshold",CSNumber(cfg[cs_i].sell_entry,4),"rsi_points",EnumToString(signal_timeframe))+","+
         CSFeature("system_id",IntegerToString(cs_i+1),"count",EnumToString(signal_timeframe));
      string cs_entry_predicates=CSPredicate("buy_fast_rsi",CSNumber(fast[cs_i],4),"LE",CSNumber(cfg[cs_i].buy_entry,4),cs_buy_fast ? "PASS" : "BLOCK","BUY_FAST_RSI")+","+
         CSPredicate("buy_trend_rsi",CSNumber(buy_trend[cs_i],4),"GE",CSNumber(cfg[cs_i].buy_trend,4),cs_buy_trend ? "PASS" : "BLOCK","BUY_TREND_RSI")+","+
         CSPredicate("sell_fast_rsi",CSNumber(fast[cs_i],4),"GE",CSNumber(cfg[cs_i].sell_entry,4),cs_sell_fast ? "PASS" : "BLOCK","SELL_FAST_RSI")+","+
         CSPredicate("sell_trend_rsi",CSNumber(sell_trend[cs_i],4),"LE",CSNumber(cfg[cs_i].sell_trend,4),cs_sell_trend ? "PASS" : "BLOCK","SELL_TREND_RSI")+","+
         CSPredicate("entry_candidate",CSBoolNumber(pending_open[cs_i]!=0),"EQ","1",pending_open[cs_i]!=0 ? "PASS" : "BLOCK",pending_open[cs_i]==1 ? "BUY_SIGNAL" : (pending_open[cs_i]==-1 ? "SELL_SIGNAL" : "NO_SIGNAL"));
      string cs_features=cs_has_position ? CSFeature("exit_candidate",CSBoolNumber(pending_close[cs_i]),"boolean",EnumToString(signal_timeframe)) : cs_entry_features;
      string cs_predicates=cs_has_position ? CSPredicate("exit_candidate",CSBoolNumber(pending_close[cs_i]),"EQ","1",pending_close[cs_i] ? "PASS" : "BLOCK",pending_close[cs_i] ? "EXIT_SIGNAL" : "EXIT_NOT_TRIGGERED") : cs_entry_predicates;
      string cs_outcome=cs_has_position ? (pending_close[cs_i] ? "PASS" : "BLOCK") : (pending_open[cs_i]!=0 ? "PASS" : "BLOCK");
      CSEnqueueDecision(cs_has_position ? "EXIT_SIGNAL" : "SIGNAL",cs_outcome,cs_bar,cs_features,cs_predicates);
     }
#endif
'''
    if source_text.count(signal_anchor) != 1:
        raise ValueError("expected unique GoldM15 closed-bar decision insertion point")
    source_text = source_text.replace(signal_anchor, signal_capture + signal_anchor, 1)

    timer_anchor = "void OnTimer()\n{\n   if(risk_active) risk_guard.Service(trade,MagicBase);\n}"
    timer_capture = "void OnTimer()\n{\n#ifdef CS_EVIDENCE_CAPTURE_ENABLED\n   CSFlushEvidenceQueue();\n#endif\n   if(risk_active) risk_guard.Service(trade,MagicBase);\n}"
    if source_text.count(timer_anchor) != 1:
        raise ValueError("expected unique GoldM15 timer handler")
    source_text = source_text.replace(timer_anchor, timer_capture, 1)
    return source_text


def prepare_variant(repo_root: Path, alias: str, output_root: Path, *, preset_path: Path) -> BuildVariant:
    root = Path(repo_root).resolve()
    if alias not in ALLOWED_ACCOUNTS:
        raise ValueError("account is not allowlisted")
    spec = account_gateway.ACCOUNTS[alias]
    if spec.get("is_demo") is not True or spec.get("challenge_protection") is not False:
        raise ValueError("configured demo account required")
    if Path(preset_path).name.casefold() != PRESET_NAME.casefold():
        raise ValueError("preset filename is not bound to GoldM15")
    preset_raw, preset_values = _preset_input_names(Path(preset_path))
    preset_hash = hashlib.sha256(preset_raw).hexdigest()
    if preset_hash != EXPECTED_HASHES["goldm15/GoldM15_Reconstruction.set"]:
        raise ValueError("preset content hash differs from reviewed GoldM15 preset")

    source_path = root / SOURCE
    source_bytes = source_path.read_bytes()
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    all_paths = [SOURCE, *HELPERS]
    for relative in all_paths:
        if hashlib.sha256((root / relative).read_bytes()).hexdigest() != EXPECTED_HASHES[relative.as_posix()]:
            raise ValueError(f"GoldM15 source/include changed from reviewed baseline: {relative}")
    source_text = source_bytes.decode("utf-8-sig")
    source_names = _input_names(source_text)
    if set(preset_values) != source_names:
        raise ValueError("GoldM15 preset inputs do not match the source schema")
    expected_parameter_hash = _expected_parameter_hash(source_text, preset_values)
    spool = root / "ChartStudioEvidenceSpool.mqh"
    spool_bytes = spool.read_bytes()
    if hashlib.sha256(spool_bytes).hexdigest() != EXPECTED_HASHES["ChartStudioEvidenceSpool.mqh"]:
        raise ValueError("shared evidence spool helper changed from reviewed baseline")
    source_and_include_hash = hashlib.sha256(
        b"\0".join([(root / p).read_bytes() for p in all_paths] + [spool_bytes])
    ).hexdigest()
    context = AccountContext.from_config(alias)
    terminal = Path(spec["terminal"])
    if not terminal.is_file():
        raise ValueError("configured GoldM15 demo terminal executable is unavailable")
    terminal_root = terminal.parent
    compiler = terminal_root / "MetaEditor64.exe"
    include_root = terminal_root / "MQL5"
    if not compiler.is_file() or not (include_root / "Include" / "Trade" / "Trade.mqh").is_file():
        raise ValueError("GoldM15 demo terminal MetaEditor/include tree is unavailable")

    output_arg = Path(output_root).absolute()
    expected_output = (root / "output").resolve()
    if output_arg != expected_output and expected_output not in output_arg.parents:
        raise ValueError("build output must remain under repository output/")
    if _is_link_or_junction(expected_output):
        raise ValueError("build output root cannot be a symlink or junction")
    relative_output = output_arg.relative_to(expected_output)
    output_cursor = expected_output
    for component in relative_output.parts:
        output_cursor = output_cursor / component
        if _is_link_or_junction(output_cursor):
            raise ValueError("build output cannot traverse a symlink or junction")
        output_cursor.mkdir(exist_ok=True)
    output = output_arg.resolve()
    if output != expected_output and expected_output not in output.parents:
        raise ValueError("build output must remain under repository output/")
    variant_dir = output / "goldm15-evidence" / alias
    for directory in (variant_dir.parent, variant_dir):
        if _is_link_or_junction(directory):
            raise ValueError("build output cannot traverse a symlink or junction")
        directory.mkdir(exist_ok=True)
        if _is_link_or_junction(directory) or (directory.resolve() != expected_output and expected_output not in directory.resolve().parents):
            raise ValueError("build output must remain under repository output/")

    producer = PRODUCER
    generated = _instrument_source(
        source_text,
        account_alias=alias,
        producer=producer,
        terminal_hash=context.terminal_identity_hash,
        source_hash=source_and_include_hash,
        expected_parameter_hash=expected_parameter_hash,
        login=int(spec["login"]),
        server=spec["server"],
        terminal_path=str(terminal_root),
    )
    variant_source = variant_dir / f"{EA_NAME}.mq5"
    helper_output = variant_dir / "ChartStudioEvidenceSpool.mqh"
    helper_outputs = [variant_dir / path.name for path in HELPERS]
    manifest_path = variant_dir / "build-manifest.json"
    ex5 = variant_source.with_suffix(".ex5")
    log = variant_source.with_suffix(".log")
    for path in (variant_source, helper_output, *helper_outputs, manifest_path, ex5, log):
        if path.is_symlink():
            raise ValueError("build output files cannot be symlinks")
    ex5.unlink(missing_ok=True)
    log.unlink(missing_ok=True)
    _atomic_write(variant_source, generated.encode("utf-8-sig"))
    _atomic_write(helper_output, spool_bytes)
    for source_helper, output_helper in zip(HELPERS, helper_outputs, strict=True):
        _atomic_write(output_helper, (root / source_helper).read_bytes())
    manifest = {
        "schemaVersion": 1,
        "accountAlias": alias,
        "producerId": producer,
        "terminalIdentityHash": context.terminal_identity_hash,
        "sourceAndIncludeSha256": source_and_include_hash,
        "spoolHelperSha256": hashlib.sha256(spool_bytes).hexdigest(),
        "supportingSources": {str(path): EXPECTED_HASHES[path.as_posix()] for path in HELPERS},
        "sourceSha256": source_hash,
        "presetName": Path(preset_path).name,
        "presetSha256": preset_hash,
        "presetInputCount": len(preset_values),
        "expectedParameterSetHash": expected_parameter_hash,
        "generatedSourceSha256": hashlib.sha256(variant_source.read_bytes()).hexdigest(),
        "compiler": str(compiler),
        "artifact": str(ex5),
        "compileLog": str(log),
        "deployment": "NOT_INSTALLED",
    }
    _atomic_write(manifest_path, (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    return BuildVariant(variant_source, manifest_path, compiler, include_root, log)


def compile_candidate(variant: BuildVariant) -> Path:
    artifact = compile_variant(variant)
    manifest = json.loads(variant.manifest.read_text(encoding="utf-8"))
    manifest["artifactSha256"] = hashlib.sha256(artifact.read_bytes()).hexdigest()
    manifest["compileResult"] = "0 errors, 0 warnings"
    _atomic_write(variant.manifest, (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    return artifact


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("account", choices=sorted(ALLOWED_ACCOUNTS))
    parser.add_argument("--preset", required=True, type=Path)
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    root = REPO_ROOT
    try:
        variant = prepare_variant(root, args.account, root / "output", preset_path=args.preset)
        if not args.prepare_only:
            artifact = compile_candidate(variant)
            print(f"Compiled isolated candidate {artifact}; no MT5 installation changed")
        else:
            print(f"Prepared isolated candidate {variant.source}; no MT5 installation changed")
        return 0
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"Refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
