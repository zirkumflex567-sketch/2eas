"""Build opt-in Titan evidence EAs into ignored output; never install into MT5."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


ALLOWED_ACCOUNTS = frozenset({"xau5m_m5", "titan_m5"})
EXPECTED_PRESETS = {"xau5m_m5": "puprime250.set", "titan_m5": "puprime500.set"}
EXPECTED_PRESET_SHA256 = {
    "xau5m_m5": "ff92ce8710e151cb73d304e411338c411db487bc3983f15eec541138a0aea286",
    "titan_m5": "feb3030fee155bb41e8604a67117519f97db00beac614e103180813faf697e69",
}
EA_NAME = "XAU_Titan_Pro_EvidenceCapture"
SOURCE_NAME = "XAU_Titan_Pro_EvidenceBase.mq5"
EXPECTED_SOURCE_SHA256 = "a3acca057c8f4dd0b0c2b642432ee7ef918cb95c1af6a36c21dd6a4021c02336"
EXPECTED_SOURCE_TEXT_SHA256 = "48aed95375bf3cae67627dc77077f1e4b8b568a521bfddba1b71d40079778a0a"
# Exact earlier terminal source: same strategy and order logic, before the
# account-bound Blueberry guard replaced the legacy global input toggle.
EXPECTED_LEGACY_INSTALLED_SOURCE_TEXT_SHA256 = "0a350ad96fcada67eeaddc1d2a60480693f39bf15a4825ed4cc932ec7f8a0339"


@dataclass(frozen=True)
class BuildVariant:
    source: Path
    manifest: Path
    compiler: Path
    include_root: Path
    log: Path


def _input_names(source_text: str) -> set[str]:
    names = re.findall(r"^\s*input\s+(?:\w+)\s+(\w+)\s*=", source_text, re.M)
    if not names or len(names) != len(set(names)):
        raise ValueError("EA input schema is empty or contains duplicate names")
    return set(names)


def _parameter_hash_function(source_text: str, names: set[str]) -> str:
    declarations = re.findall(r"^\s*input\s+(\w+)\s+(\w+)\s*=", source_text, re.M)
    if {name for _kind, name in declarations} != names:
        raise ValueError("EA input declarations could not be serialized")
    lines = ["string CSParameterSetCanonical()", "  {", "   string result=\"\";"]
    for kind, name in declarations:
        if kind == "bool":
            expression = f'({name} ? "1" : "0")'
        elif kind == "string":
            expression = f"CSJsonQuote({name})"
        elif kind in {"double", "float"}:
            expression = f"DoubleToString({name},16)"
        else:
            expression = f"IntegerToString((long){name})"
        lines.append(f'   result+="{name}="+{expression}+"\\n";')
    lines.extend(["   return result;", "  }"])
    return "\n".join(lines)


def _expected_parameter_hash(source_text: str, values: dict[str, str]) -> str:
    declarations = re.findall(r"^\s*input\s+(\w+)\s+(\w+)\s*=", source_text, re.M)
    if {name for _kind, name in declarations} != set(values):
        raise ValueError("preset values do not match the EA input schema")
    canonical = []
    for kind, name in declarations:
        value = values[name]
        if kind == "bool":
            normalized = value.casefold()
            if normalized not in {"true", "false", "0", "1"}:
                raise ValueError(f"preset boolean is invalid for {name}")
            encoded = "1" if normalized in {"true", "1"} else "0"
        elif kind in {"double", "float"}:
            try:
                number = float(value)
            except ValueError as exc:
                raise ValueError(f"preset number is invalid for {name}") from exc
            if not math.isfinite(number):
                raise ValueError(f"preset number is invalid for {name}")
            encoded = format(number, ".16f")
        elif kind == "string":
            if any(ord(char) < 0x20 for char in value):
                raise ValueError(f"preset string contains unsupported control characters for {name}")
            encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        else:
            try:
                number = float(value)
            except ValueError as exc:
                raise ValueError(f"preset integer is invalid for {name}") from exc
            if not math.isfinite(number) or not number.is_integer():
                raise ValueError(f"preset integer is invalid for {name}")
            encoded = str(int(number))
        canonical.append(f"{name}={encoded}\n")
    return hashlib.sha256("".join(canonical).encode("utf-8")).hexdigest()


def _neutralize_account_risk_logs(source_text: str) -> str:
    replacements = (
        (
            'PrintFormat("BLUEBERRY RISK BREACH: Daily DD %.2f%% >= Limit %.2f%%. Closing all positions.",\n'
            '                        daily_dd_pct, InpMaxDailyDrawdownPercent);',
            'PrintFormat("RISK GUARD BREACH [%s | %s | %s]: Daily DD %.2f%% >= Limit %.2f%%. Closing all positions.",\n'
            '                        AccountInfoString(ACCOUNT_SERVER), _Symbol, EnumToString(Period()),\n'
            '                        daily_dd_pct, InpMaxDailyDrawdownPercent);',
        ),
        (
            'PrintFormat("BLUEBERRY RISK BREACH: Total DD %.2f%% >= Limit %.2f%%. Closing all positions and halting EA permanently.",\n'
            '                        total_dd_pct, InpMaxTotalDrawdownPercent);',
            'PrintFormat("RISK GUARD BREACH [%s | %s | %s]: Total DD %.2f%% >= Limit %.2f%%. Closing all positions and halting EA permanently.",\n'
            '                        AccountInfoString(ACCOUNT_SERVER), _Symbol, EnumToString(Period()),\n'
            '                        total_dd_pct, InpMaxTotalDrawdownPercent);',
        ),
        (
            'PrintFormat("BLUEBERRY GOAL REACHED! Profit reached %.2f%% >= Target %.2f%%. Halting EA.",\n'
            '                        profit_pct, InpPhaseProfitTargetPct);',
            'PrintFormat("PROFIT TARGET REACHED [%s | %s | %s]: Profit reached %.2f%% >= Target %.2f%%. Halting EA.",\n'
            '                        AccountInfoString(ACCOUNT_SERVER), _Symbol, EnumToString(Period()),\n'
            '                        profit_pct, InpPhaseProfitTargetPct);',
        ),
        ('state_str = "BLUEBERRY TARGET ERREICHT! (Bestanden)";',
         'state_str = "PROFIT TARGET ERREICHT! (Bestanden)";'),
    )
    for old, new in replacements:
        if source_text.count(old) != 1:
            raise ValueError("expected unique account-neutral risk-log source anchor")
        source_text = source_text.replace(old, new, 1)
    return source_text


def _instrument_source(source_text: str, account_alias: str, producer: str,
                       terminal_hash: str, source_hash: str, expected_parameter_hash: str, login: int,
                       server: str, terminal_path: str, broker_utc_offset_seconds: int) -> str:
    if type(broker_utc_offset_seconds) is not int or not -86400 <= broker_utc_offset_seconds <= 86400:
        raise ValueError("invalid configured broker UTC offset")
    source_text = _neutralize_account_risk_logs(source_text)
    trade_include = '#include <Trade\\PositionInfo.mqh>'
    definitions = [
        "#define CS_EVIDENCE_CAPTURE",
        f"#define CS_EVIDENCE_ACCOUNT_ID {_mql_string(account_alias)}",
        f"#define CS_EVIDENCE_PRODUCER_ID {_mql_string(producer)}",
        f"#define CS_EVIDENCE_TERMINAL_HASH {_mql_string(terminal_hash)}",
        f"#define CS_EVIDENCE_SOURCE_HASH {_mql_string(source_hash)}",
        f"#define CS_EVIDENCE_EXPECTED_PARAMETER_SET_HASH {_mql_string(expected_parameter_hash)}",
        f"#define CS_EVIDENCE_EXPECTED_LOGIN {int(login)}",
        f"#define CS_EVIDENCE_EXPECTED_SERVER {_mql_string(server)}",
        f"#define CS_EVIDENCE_EXPECTED_TERMINAL_PATH {_mql_string(terminal_path)}",
        "#define CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS CSBrokerUtcOffsetSeconds()",
        "string CSParameterSetCanonical();",
        'string CSParameterSetHash="";',
        '#include "ChartStudioEvidenceSpool.mqh"',
    ]
    if source_text.count(trade_include) != 1:
        raise ValueError("expected unique standard PositionInfo include in Titan source")
    source_text = source_text.replace(trade_include, trade_include + "\n" + "\n".join(definitions), 1)

    source_names = _input_names(source_text)
    hash_function = _parameter_hash_function(source_text, source_names)
    anchor = "//+------------------------------------------------------------------+\n//| Setup Robust Live Execution"
    if source_text.count(anchor) != 1:
        raise ValueError("expected unique execution setup insertion point")
    source_text = source_text.replace(anchor, hash_function + "\n\n" + anchor, 1)

    init_anchor = '   PrintFormat("XAU_Titan_Pro initialized.'
    init_capture = '''#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   CSParameterSetHash=CSHashText(CSParameterSetCanonical());
   if(CSParameterSetHash=="")
      Print("ChartStudio evidence recorder disabled: parameter hash unavailable.");
   else if(CSParameterSetHash!=CS_EVIDENCE_EXPECTED_PARAMETER_SET_HASH)
     {
      Print("ChartStudio evidence recorder disabled: active inputs differ from the approved preset.");
      CSRecorderDisabled=true;
     }
   else if(CSInitializeEvidenceProducer() && !EventSetTimer(1))
     {
      Print("ChartStudio evidence recorder disabled: timer unavailable.");
      CSRecorderReady=false;
      CSRecorderDisabled=true;
     }
   if(CSRecorderReady)
      CSSeedOpenPositionSnapshots();
#endif

'''
    if source_text.count(init_anchor) != 1:
        raise ValueError("expected unique initialization log insertion point")
    source_text = source_text.replace(init_anchor, init_capture + init_anchor, 1)

    deinit_anchor = "void OnDeinit(const int reason)\n{"
    if source_text.count(deinit_anchor) != 1:
        raise ValueError("expected unique deinitialization function")
    source_text = source_text.replace(
        deinit_anchor,
        deinit_anchor + "\n#ifdef CS_EVIDENCE_CAPTURE_ENABLED\n   CSFlushEvidenceQueueOnShutdown();\n   EventKillTimer();\n#endif",
        1,
    )
    event_handlers = '''
void OnTimer()
  {
   CSFlushEvidenceQueue();
  }

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

#define CS_POSITION_CORRELATION_CAPACITY 64
ulong CSPositionTickets[CS_POSITION_CORRELATION_CAPACITY];
string CSPositionAttemptIds[CS_POSITION_CORRELATION_CAPACITY];
datetime CSPositionSignalBars[CS_POSITION_CORRELATION_CAPACITY];
double CSPositionStopLoss[CS_POSITION_CORRELATION_CAPACITY];
double CSPositionTakeProfit[CS_POSITION_CORRELATION_CAPACITY];
double CSPositionVolumes[CS_POSITION_CORRELATION_CAPACITY];
int CSPositionCorrelationNext=0;

void CSRegisterPosition(const ulong position_ticket,const string attempt_id,const datetime signal_bar,
                        const double stop_loss,const double take_profit,const double volume)
  {
   if(position_ticket==0 || signal_bar<=0)
      return;
   int slot=-1;
   for(int i=0;i<CS_POSITION_CORRELATION_CAPACITY;i++)
      if(CSPositionTickets[i]==position_ticket)
        {
         slot=i;
         break;
        }
   if(slot<0)
     {
      slot=CSPositionCorrelationNext%CS_POSITION_CORRELATION_CAPACITY;
      CSPositionCorrelationNext++;
     }
   CSPositionTickets[slot]=position_ticket;
   CSPositionAttemptIds[slot]=attempt_id;
   CSPositionSignalBars[slot]=signal_bar;
   CSPositionStopLoss[slot]=stop_loss;
   CSPositionTakeProfit[slot]=take_profit;
   CSPositionVolumes[slot]=volume;
  }

bool CSFindPosition(const ulong position_ticket,string &attempt_id,datetime &signal_bar,
                    double &stop_loss,double &take_profit,double &volume)
  {
   if(position_ticket==0)
      return false;
   for(int i=0;i<CS_POSITION_CORRELATION_CAPACITY;i++)
      if(CSPositionTickets[i]==position_ticket)
        {
         attempt_id=CSPositionAttemptIds[i];
         signal_bar=CSPositionSignalBars[i];
         stop_loss=CSPositionStopLoss[i];
         take_profit=CSPositionTakeProfit[i];
         volume=CSPositionVolumes[i];
         return signal_bar>0;
        }
   return false;
  }

void CSSeedOpenPositionSnapshots()
  {
   datetime signal_bar=iTime(_Symbol,PERIOD_M15,1);
   if(signal_bar<=0)
      return;
   for(int i=PositionsTotal()-1;i>=0;i--)
      if(m_position.SelectByIndex(i) && m_position.Symbol()==_Symbol && m_position.Magic()==InpMagicNumber)
         CSRegisterPosition(m_position.Ticket(),"",signal_bar,m_position.StopLoss(),
                            m_position.TakeProfit(),m_position.Volume());
  }

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(!CSRecorderReady || CSRecorderDisabled || trans.symbol!=_Symbol)
      return;
   if(trans.type==TRADE_TRANSACTION_DEAL_ADD)
     {
      if(trans.order==0 || trans.deal==0 || trans.position==0 || trans.volume<=0.0 || trans.price<=0.0)
         return;
      string cs_attempt_id="";
      datetime cs_signal_bar=0;
      if(!CSFindOrderAttempt(trans.order,cs_attempt_id,cs_signal_bar))
         return;
      datetime cs_observed_utc=TimeGMT();
      string cs_event_time=CSUtc(cs_observed_utc);
      string cs_features=CSFeature("deal_volume",CSNumber(trans.volume,8),"lots","M15")+","+
         CSFeature("deal_price",CSNumber(trans.price,m_symbol.Digits()),"price","M15")+","+
         CSFeature("deal_type_code",IntegerToString((int)trans.deal_type),"enum","M15")+","+
         CSFeature("transaction_type_code",IntegerToString((int)trans.type),"enum","M15")+","+
         CSFeature("deal_stop_loss",CSNumber(trans.price_sl,m_symbol.Digits()),"price","M15")+","+
         CSFeature("deal_take_profit",CSNumber(trans.price_tp,m_symbol.Digits()),"price","M15");
      string cs_predicates=CSPredicate("broker_deal_observed","1","EQ","1","PASS","TRADE_TRANSACTION_DEAL_ADD");
      CSEnqueueDecision("BROKER_RESULT","PASS",cs_signal_bar,cs_features,cs_predicates,"",
                        cs_attempt_id,trans.order,cs_event_time,trans.deal,trans.position);
      CSRegisterPosition(trans.position,cs_attempt_id,cs_signal_bar,trans.price_sl,trans.price_tp,trans.volume);
      return;
     }
   if(trans.type!=TRADE_TRANSACTION_POSITION || trans.position==0)
      return;
   string cs_attempt_id="";
   datetime cs_signal_bar=0;
   double cs_sl_before=0.0,cs_tp_before=0.0,cs_volume_before=0.0;
   if(!CSFindPosition(trans.position,cs_attempt_id,cs_signal_bar,cs_sl_before,cs_tp_before,cs_volume_before))
      return;
   double cs_volume_after=trans.volume>0.0 ? trans.volume : cs_volume_before;
   bool cs_sl_changed=trans.price_sl!=cs_sl_before;
   bool cs_tp_changed=trans.price_tp!=cs_tp_before;
   bool cs_volume_changed=cs_volume_after!=cs_volume_before;
   if(!cs_sl_changed && !cs_tp_changed && !cs_volume_changed)
      return;
   string cs_features=CSFeature("sl_before",CSNumber(cs_sl_before,m_symbol.Digits()),"price","M15")+","+
      CSFeature("sl_after",CSNumber(trans.price_sl,m_symbol.Digits()),"price","M15")+","+
      CSFeature("tp_before",CSNumber(cs_tp_before,m_symbol.Digits()),"price","M15")+","+
      CSFeature("tp_after",CSNumber(trans.price_tp,m_symbol.Digits()),"price","M15")+","+
      CSFeature("volume_before",CSNumber(cs_volume_before,8),"lots","M15")+","+
      CSFeature("volume_after",CSNumber(cs_volume_after,8),"lots","M15");
   string cs_reason=cs_sl_changed && cs_tp_changed ? "SL_AND_TP_CHANGED" :
      (cs_sl_changed ? "SL_CHANGED" : (cs_tp_changed ? "TP_CHANGED" : "POSITION_VOLUME_CHANGED"));
   string cs_predicates=CSPredicate("position_state_changed","1","EQ","1","PASS",cs_reason);
   datetime cs_observed_utc=TimeGMT();
   CSEnqueueDecision("BROKER_RESULT","PASS",cs_signal_bar,cs_features,cs_predicates,"",
                     cs_attempt_id,0,CSUtc(cs_observed_utc),0,trans.position);
   CSRegisterPosition(trans.position,cs_attempt_id,cs_signal_bar,trans.price_sl,trans.price_tp,cs_volume_after);
  }

'''
    handler_anchor = "//+------------------------------------------------------------------+\n//| Check if within Elite Trading Window"
    if source_text.count(handler_anchor) != 1:
        raise ValueError("expected unique event-handler insertion point")
    source_text = source_text.replace(handler_anchor, event_handlers + handler_anchor, 1)

    signal_anchor = "   bool sell_signal = base_sell && sell_not_overextended && sell_run_ok && sell_sr_ok;"
    signal_capture = '''
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   string timeframe="M15";
   string features=CSFeature("close_1",CSNumber(close1,m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("open_1",CSNumber(open1,m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("trend_ema_1",CSNumber(trend_ema[1],m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("fast_ema_1",CSNumber(fast_ema[1],m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("slow_ema_1",CSNumber(slow_ema[1],m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("rsi_1",CSNumber(rsi_val[1],4),"rsi_points",timeframe)+","+
      CSFeature("atr_1",CSNumber(atr_val[1],m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("swing_high",CSNumber(swing_high,m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("swing_low",CSNumber(swing_low,m_symbol.Digits()),"price",timeframe);
   string predicates=CSPredicate("base_buy",CSBoolNumber(base_buy),"EQ","1",base_buy ? "PASS" : "BLOCK","BASE_BUY")+","+
      CSPredicate("base_sell",CSBoolNumber(base_sell),"EQ","1",base_sell ? "PASS" : "BLOCK","BASE_SELL")+","+
      CSPredicate("buy_not_overextended",CSBoolNumber(buy_not_overextended),"EQ","1",buy_not_overextended ? "PASS" : "BLOCK","BUY_EXTENSION")+","+
      CSPredicate("sell_not_overextended",CSBoolNumber(sell_not_overextended),"EQ","1",sell_not_overextended ? "PASS" : "BLOCK","SELL_EXTENSION")+","+
      CSPredicate("buy_run_ok",CSBoolNumber(buy_run_ok),"EQ","1",buy_run_ok ? "PASS" : "BLOCK","BUY_RUN")+","+
      CSPredicate("sell_run_ok",CSBoolNumber(sell_run_ok),"EQ","1",sell_run_ok ? "PASS" : "BLOCK","SELL_RUN")+","+
      CSPredicate("buy_sr_ok",CSBoolNumber(buy_sr_ok),"EQ","1",buy_sr_ok ? "PASS" : "BLOCK","BUY_SR")+","+
      CSPredicate("sell_sr_ok",CSBoolNumber(sell_sr_ok),"EQ","1",sell_sr_ok ? "PASS" : "BLOCK","SELL_SR")+","+
      CSPredicate("buy_signal",CSBoolNumber(buy_signal),"EQ","1",buy_signal ? "PASS" : "BLOCK","BUY_SIGNAL")+","+
      CSPredicate("sell_signal",CSBoolNumber(sell_signal),"EQ","1",sell_signal ? "PASS" : "BLOCK","SELL_SIGNAL");
   CSEnqueueDecision("SIGNAL",(buy_signal || sell_signal) ? "PASS" : "BLOCK",
                     rates[0].time,features,predicates);
#endif
'''
    if source_text.count(signal_anchor) != 1:
        raise ValueError("expected unique closed-bar signal insertion point")
    source_text = source_text.replace(signal_anchor, signal_anchor + "\n" + signal_capture, 1)

    lockout_anchor = '''   if(m_daily_lockout || m_total_lockout || m_target_reached)
   {
      UpdateDashboard(dt);
      return;
   }'''
    lockout_capture = '''   if(m_daily_lockout || m_total_lockout || m_target_reached)
   {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
      if(is_new_m15_bar && current_m15_time>0)
        {
         string cs_filter_reason=m_daily_lockout ? "LOCKOUT_DAILY_DRAWDOWN" :
            (m_total_lockout ? "LOCKOUT_TOTAL_DRAWDOWN" : "LOCKOUT_PROFIT_TARGET");
         string cs_features=CSFeature("current_equity",CSNumber(current_equity,2),"account_currency","M15")+","+
            CSFeature("current_balance",CSNumber(current_balance,2),"account_currency","M15");
         string cs_predicates=CSPredicate("daily_lockout",CSBoolNumber(m_daily_lockout),"EQ","0",
            m_daily_lockout ? "BLOCK" : "PASS","LOCKOUT_DAILY_DRAWDOWN")+","+
            CSPredicate("total_lockout",CSBoolNumber(m_total_lockout),"EQ","0",
            m_total_lockout ? "BLOCK" : "PASS","LOCKOUT_TOTAL_DRAWDOWN")+","+
            CSPredicate("profit_target_reached",CSBoolNumber(m_target_reached),"EQ","0",
            m_target_reached ? "BLOCK" : "PASS","LOCKOUT_PROFIT_TARGET")+","+
            CSPredicate("entry_eligible","0","EQ","1","BLOCK",cs_filter_reason);
         CSEnqueueDecision("ENTRY_FILTER","BLOCK",current_m15_time-PeriodSeconds(PERIOD_M15),
                           cs_features,cs_predicates);
        }
#endif
      UpdateDashboard(dt);
      return;
   }'''
    if source_text.count(lockout_anchor) != 1:
        raise ValueError("expected unique post-guard entry lockout gate")
    source_text = source_text.replace(lockout_anchor, lockout_capture, 1)

    entry_gate_anchor = '''   if(is_new_m15_bar && IsWithinTradingWindow(dt))
   {
      int open_count = CountOpenPositions();
      if(open_count < InpMaxOpenPositions)
      {
         if(current_m15_time > m_last_entry_time + (InpMinBarsBetweenEntries * PeriodSeconds(m_calc_timeframe)))
         {
            CheckSignalAndTrade();
         }
      }
   }'''
    entry_gate_capture = '''   if(is_new_m15_bar && IsWithinTradingWindow(dt))
   {
      int open_count = CountOpenPositions();
      if(open_count < InpMaxOpenPositions)
      {
         if(current_m15_time > m_last_entry_time + (InpMinBarsBetweenEntries * PeriodSeconds(m_calc_timeframe)))
         {
            CheckSignalAndTrade();
         }
         else
         {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
            if(current_m15_time>0)
              {
               long cs_elapsed=(long)(current_m15_time-m_last_entry_time);
               long cs_required=(long)(InpMinBarsBetweenEntries*PeriodSeconds(m_calc_timeframe));
               string cs_features=CSFeature("elapsed_since_last_entry_seconds",CSNumber((double)cs_elapsed,0),"seconds","M15")+","+
                  CSFeature("minimum_entry_interval_seconds",CSNumber((double)cs_required,0),"seconds","M15");
               string cs_predicates=CSPredicate("minimum_entry_interval_elapsed",CSNumber((double)cs_elapsed,0),"GT",
                  CSNumber((double)cs_required,0),"BLOCK","MIN_BARS_BETWEEN_ENTRIES");
               CSEnqueueDecision("ENTRY_FILTER","BLOCK",current_m15_time-PeriodSeconds(PERIOD_M15),
                                 cs_features,cs_predicates);
              }
#endif
         }
      }
      else
      {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
         if(current_m15_time>0)
           {
            string cs_features=CSFeature("open_positions",CSNumber((double)open_count,0),"count","M15")+","+
               CSFeature("maximum_open_positions",CSNumber((double)InpMaxOpenPositions,0),"count","M15");
            string cs_predicates=CSPredicate("open_positions_below_limit",CSNumber((double)open_count,0),"GE",
               CSNumber((double)InpMaxOpenPositions,0),"BLOCK","MAX_OPEN_POSITIONS");
            CSEnqueueDecision("ENTRY_FILTER","BLOCK",current_m15_time-PeriodSeconds(PERIOD_M15),
                              cs_features,cs_predicates);
           }
#endif
      }
   }
   else if(is_new_m15_bar)
   {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
      if(current_m15_time>0)
        {
         int cs_server_minute=dt.hour*60+dt.min;
         string cs_features=CSFeature("broker_server_minute_of_day",CSNumber((double)cs_server_minute,0),"minute_of_day","M15");
         string cs_predicates=CSPredicate("inside_trading_window","0","EQ","1","BLOCK","OUTSIDE_TRADING_WINDOW");
         CSEnqueueDecision("ENTRY_FILTER","BLOCK",current_m15_time-PeriodSeconds(PERIOD_M15),
                           cs_features,cs_predicates);
        }
#endif
   }'''
    if source_text.count(entry_gate_anchor) != 1:
        raise ValueError("expected unique closed-bar entry filter gate")
    source_text = source_text.replace(entry_gate_anchor, entry_gate_capture, 1)

    for direction, method in (("BUY", "Buy"), ("SELL", "Sell")):
        call = f"if(m_trade.{method}(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment))"
        replacement = f'''#ifdef CS_EVIDENCE_CAPTURE_ENABLED
            MqlTick cs_tick={{}};
            bool cs_quote_ok=SymbolInfoTick(_Symbol,cs_tick) && cs_tick.time_msc>0 &&
                             cs_tick.bid>0.0 && cs_tick.ask>=cs_tick.bid;
            double cs_bid=cs_tick.bid,cs_ask=cs_tick.ask;
            string cs_quote_time=CSUtcFromBrokerMillis(cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
            datetime cs_request_utc=TimeGMT();
            string cs_request_time=CSUtc(cs_request_utc);
            double cs_tick_size=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
            double cs_tick_value=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
            string cs_currency=SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT);
#endif
            bool cs_order_sent=m_trade.{method}(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment);
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
            uint cs_order_retcode=m_trade.ResultRetcode();
            datetime cs_ack_utc=TimeGMT();
            ulong cs_order_ticket=cs_order_sent ? m_trade.ResultOrder() : 0;
            string cs_attempt_id=CS_EVIDENCE_PRODUCER_ID+"_"+
                                 IntegerToString((long)GetTickCount64())+"_"+
                                 IntegerToString((long)(CSEventCounter+1));
            string cs_attempt_outcome=cs_order_sent ? "PASS" : "BLOCK";
            string cs_attempt_predicate=CSPredicate("broker_order",cs_order_sent ? "1" : "0","EQ","1",
                                                     cs_attempt_outcome,"BROKER_RESULT");
            if(cs_quote_ok && cs_tick_size>0.0)
              {{
               string cs_attempt=CSOrderAttemptJson(cs_attempt_id,"{direction}",entry_price,lot_size,
                  cs_bid,cs_ask,cs_tick_size,cs_tick_value,cs_currency,cs_quote_time,
                  cs_request_time,CSUtc(cs_ack_utc),cs_order_retcode,cs_order_ticket,
                  cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
               CSEnqueueDecision("ORDER_ATTEMPT",cs_attempt_outcome,rates[0].time,
                  features,cs_attempt_predicate,cs_attempt,cs_attempt_id,cs_order_ticket,cs_request_time);
              }}
            else
               CSEnqueueDecision("ORDER_ATTEMPT",cs_attempt_outcome,rates[0].time,
                  features,cs_attempt_predicate,"",cs_attempt_id,cs_order_ticket,cs_request_time);
            if(cs_order_ticket>0)
               CSRegisterOrderAttempt(cs_order_ticket,cs_attempt_id,rates[0].time);
#endif
            if(cs_order_sent)'''
        if source_text.count(call) != 1:
            raise ValueError(f"expected unique {method} order call")
        source_text = source_text.replace(call, replacement, 1)

    close_reasons = (
        "DAILY_DRAWDOWN", "TOTAL_DRAWDOWN", "PROFIT_TARGET",
        "WEEKEND_FRIDAY", "WEEKEND", "DYNAMIC_RUNNER",
    )
    close_call = "CloseAllPositionsForMagic();"
    if source_text.count(close_call) != len(close_reasons):
        raise ValueError("expected six unique Titan risk and basket close call sites")
    for reason in close_reasons:
        source_text = source_text.replace(close_call, f'CloseAllPositionsForMagic("{reason}");', 1)

    close_function = "void CloseAllPositionsForMagic()"
    if source_text.count(close_function) != 1:
        raise ValueError("expected unique Titan risk-close helper")
    source_text = source_text.replace(
        close_function,
        "void CloseAllPositionsForMagic(const string cs_reason)",
        1,
    )
    close_anchor = "            m_trade.PositionClose(m_position.Ticket());"
    close_capture = '''#ifdef CS_EVIDENCE_CAPTURE_ENABLED
            ulong ticket=m_position.Ticket();
            ENUM_POSITION_TYPE cs_position_type=(ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
            double cs_close_volume=PositionGetDouble(POSITION_VOLUME);
            string cs_close_side=cs_position_type==POSITION_TYPE_BUY ? "SELL" :
               (cs_position_type==POSITION_TYPE_SELL ? "BUY" : "");
            MqlTick cs_close_tick={};
            bool cs_close_quote_ok=SymbolInfoTick(_Symbol,cs_close_tick) && cs_close_tick.time_msc>0 &&
                                   cs_close_tick.bid>0.0 && cs_close_tick.ask>=cs_close_tick.bid;
            double cs_close_bid=cs_close_tick.bid,cs_close_ask=cs_close_tick.ask;
            double cs_close_price=cs_position_type==POSITION_TYPE_BUY ? cs_close_bid :
               (cs_position_type==POSITION_TYPE_SELL ? cs_close_ask : 0.0);
            string cs_close_quote_time=CSUtcFromBrokerMillis(cs_close_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
            double cs_close_tick_size=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
            double cs_close_tick_value=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
            string cs_close_currency=SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT);
            datetime cs_close_request_utc=TimeGMT();
            string cs_close_request_time=CSUtc(cs_close_request_utc);
            bool cs_close_sent=m_trade.PositionClose(ticket);
            uint cs_close_retcode=m_trade.ResultRetcode();
            datetime cs_close_ack_utc=TimeGMT();
            ulong cs_order_ticket=cs_close_sent ? m_trade.ResultOrder() : 0;
            string cs_attempt_id=CS_EVIDENCE_PRODUCER_ID+"_risk_"+
                                 IntegerToString((long)GetTickCount64())+"_"+
                                 IntegerToString((long)(CSEventCounter+1));
            string cs_close_outcome=cs_close_sent ? "PASS" : "BLOCK";
            string cs_close_predicate=CSPredicate("risk_guard_close",cs_close_sent ? "1" : "0","EQ","1",
                                                   cs_close_outcome,cs_reason);
            datetime cs_close_bar_time=iTime(_Symbol,PERIOD_M15,1);
            string cs_attempt="";
            if(cs_close_quote_ok && cs_close_side!="" && cs_close_tick_size>0.0 && cs_close_volume>0.0 && cs_close_price>0.0)
               cs_attempt=CSOrderAttemptJson(cs_attempt_id,cs_close_side,cs_close_price,cs_close_volume,
                  cs_close_bid,cs_close_ask,cs_close_tick_size,cs_close_tick_value,cs_close_currency,
                  cs_close_quote_time,cs_close_request_time,CSUtc(cs_close_ack_utc),cs_close_retcode,
                  cs_order_ticket,cs_close_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
            if(cs_close_bar_time>0)
               CSEnqueueDecision("ORDER_ATTEMPT",cs_close_outcome,cs_close_bar_time,"",cs_close_predicate,
                  cs_attempt,cs_attempt_id,cs_order_ticket,cs_close_request_time);
            if(cs_order_ticket>0 && cs_close_bar_time>0)
               CSRegisterOrderAttempt(cs_order_ticket,cs_attempt_id,cs_close_bar_time);
#else
            m_trade.PositionClose(m_position.Ticket());
#endif'''
    if source_text.count(close_anchor) != 1:
        raise ValueError("expected unique Titan position close in risk helper")
    source_text = source_text.replace(close_anchor, close_capture, 1)
    return source_text


def _preset_input_names(path: Path) -> tuple[bytes, dict[str, str]]:
    if not path.is_file():
        raise FileNotFoundError("account preset file not found")
    raw = path.read_bytes()
    encoding = "utf-16" if b"\0" in raw[:128] else "utf-8-sig"
    try:
        text = raw.decode(encoding)
    except UnicodeDecodeError as exc:
        raise ValueError("preset encoding is unsupported") from exc
    values = {}
    names = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith((";", "#")):
            continue
        name, separator, value = line.partition("=")
        if not separator:
            raise ValueError("preset contains a malformed input record")
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            raise ValueError("preset contains an invalid input name")
        if not value.strip():
            raise ValueError("preset contains an empty value")
        names.append(name)
        values[name] = value.strip()
    if not values:
        raise ValueError("preset contains no input records")
    if len(names) != len(set(names)):
        raise ValueError("preset contains duplicate input names")
    return raw, values


def _mql_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=True)


def _is_link_or_junction(path: Path) -> bool:
    junction_check = getattr(path, "is_junction", None)
    return path.is_symlink() or (junction_check is not None and junction_check())


def _atomic_write(path: Path, content: bytes) -> None:
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", dir=path.parent, prefix=".build-", delete=False) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def _normalized_source_sha256(source_bytes: bytes) -> str:
    text = source_bytes.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def prepare_variant(repo_root: Path, alias: str, output_root: Path, *, preset_path: Path) -> BuildVariant:
    """Generate an account-bound source package in output_root/alias."""
    if alias not in ALLOWED_ACCOUNTS:
        raise ValueError(f"account {alias!r} is not allowlisted for Titan evidence builds")
    if Path(preset_path).name.casefold() != EXPECTED_PRESETS[alias].casefold():
        raise ValueError(f"preset filename is not bound to account {alias!r}")
    preset_digest = hashlib.sha256(Path(preset_path).read_bytes()).hexdigest()
    if preset_digest != EXPECTED_PRESET_SHA256[alias]:
        raise ValueError(f"preset content hash is not bound to account {alias!r}")

    repo_root = repo_root.resolve()
    output_root_input = Path(output_root).absolute()
    output_root = output_root_input.resolve()
    expected_output = (repo_root / "output").resolve()
    if output_root != expected_output and expected_output not in output_root.parents:
        raise ValueError("build output must remain under repository output/")
    directory = output_root_input
    while directory == expected_output or expected_output in directory.parents:
        if directory.exists() and _is_link_or_junction(directory):
            raise ValueError("build output cannot traverse a symlink or junction")
        if directory == expected_output:
            break
        directory = directory.parent

    sys.path.insert(0, str(repo_root))
    import account_gateway
    from chart_studio.evidence_api import DEFAULT_EVIDENCE_PRODUCERS
    from chart_studio.evidence_models import AccountContext

    spec = account_gateway.ACCOUNTS[alias]
    if spec.get("is_demo") is not True:
        raise ValueError(f"account {alias!r} is not configured as a demo account")
    terminal = Path(spec["terminal"]).resolve()
    if not terminal.is_file():
        raise FileNotFoundError(f"configured terminal executable not found for {alias}")
    compiler = terminal.parent / "MetaEditor64.exe"
    include_root = terminal.parent / "MQL5"
    if not compiler.is_file():
        raise FileNotFoundError(f"portable MetaEditor not found for {alias}")
    if not (include_root / "Include" / "Trade" / "Trade.mqh").is_file():
        raise FileNotFoundError(f"portable MT5 Include tree is incomplete for {alias}")

    source_path = repo_root / SOURCE_NAME
    installed_source_path = include_root / "Experts" / "XAU_Titan_Pro.mq5"
    installed_binary_path = include_root / "Experts" / "XAU_Titan_Pro.ex5"
    helper_path = repo_root / "ChartStudioEvidenceSpool.mqh"
    source_bytes = source_path.read_bytes()
    helper_bytes = helper_path.read_bytes()
    source_digest = hashlib.sha256(source_bytes).hexdigest()
    if source_digest != EXPECTED_SOURCE_SHA256:
        raise ValueError("recorder base source hash is not the verified installed Titan version")
    installed_source_matches = False
    if installed_source_path.is_file():
        installed_source_bytes = installed_source_path.read_bytes()
        installed_source_matches = (
            hashlib.sha256(installed_source_bytes).hexdigest() == EXPECTED_SOURCE_SHA256
            or _normalized_source_sha256(installed_source_bytes) in {
                EXPECTED_SOURCE_TEXT_SHA256,
                EXPECTED_LEGACY_INSTALLED_SOURCE_TEXT_SHA256,
            }
        )
    if not installed_source_matches:
        raise ValueError(f"installed Titan source does not match the verified recorder base for {alias}")
    if not installed_binary_path.is_file():
        raise FileNotFoundError(f"installed Titan binary not found for {alias}")
    installed_binary_hash = hashlib.sha256(installed_binary_path.read_bytes()).hexdigest()
    preset_raw, preset_values = _preset_input_names(Path(preset_path))
    source_text = source_bytes.decode("utf-8-sig").replace("\r\n", "\n")
    source_names = _input_names(source_text)
    if set(preset_values) != source_names:
        missing = sorted(source_names - set(preset_values))
        unknown = sorted(set(preset_values) - source_names)
        raise ValueError(
            "preset inputs do not match EA input schema "
            f"(missing={len(missing)}, unknown={len(unknown)})"
        )
    expected_parameter_hash = _expected_parameter_hash(source_text, preset_values)
    source_hash = hashlib.sha256(source_bytes + b"\0" + helper_bytes).hexdigest()
    ctx = AccountContext.from_config(alias)
    producer = DEFAULT_EVIDENCE_PRODUCERS[alias]
    if not producer:
        raise ValueError(f"no evidence producer configured for {alias}")
    term_root = str(terminal.parent)
    generated = _instrument_source(
        source_text, alias, producer, ctx.terminal_identity_hash, source_hash, expected_parameter_hash,
        int(spec["login"]), spec["server"], term_root, spec["broker_utc_offset_seconds"],
    )

    variant_dir = output_root_input / alias
    if _is_link_or_junction(variant_dir):
        raise ValueError("build output cannot traverse a symlink or junction")
    resolved_variant_dir = variant_dir.resolve()
    if resolved_variant_dir != expected_output and expected_output not in resolved_variant_dir.parents:
        raise ValueError("build output must remain under repository output/")
    variant_dir.mkdir(parents=True, exist_ok=True)
    if _is_link_or_junction(variant_dir):
        raise ValueError("build output cannot traverse a symlink or junction")
    variant_source = variant_dir / f"{EA_NAME}.mq5"
    helper_output = variant_dir / "ChartStudioEvidenceSpool.mqh"
    manifest_path = variant_dir / "build-manifest.json"
    for output_file in (variant_source, helper_output, manifest_path):
        if output_file.is_symlink():
            raise ValueError("build output files cannot be symlinks")
    ex5 = variant_source.with_suffix(".ex5")
    log = variant_source.with_suffix(".log")
    if ex5.is_symlink() or log.is_symlink():
        raise ValueError("build output files cannot be symlinks")
    ex5.unlink(missing_ok=True)
    log.unlink(missing_ok=True)
    _atomic_write(variant_source, generated.encode("utf-8-sig"))
    _atomic_write(helper_output, helper_bytes)
    manifest = {
        "schemaVersion": 1,
        "accountAlias": alias,
        "producerId": producer,
        "terminalIdentityHash": ctx.terminal_identity_hash,
        "sourceAndIncludeSha256": source_hash,
        "sourceSha256": source_digest,
        "installedBinarySha256": installed_binary_hash,
        "generatedSourceSha256": hashlib.sha256(variant_source.read_bytes()).hexdigest(),
        "presetName": Path(preset_path).name,
        "presetSha256": hashlib.sha256(preset_raw).hexdigest(),
        "presetInputCount": len(preset_values),
        "inputSchemaSha256": hashlib.sha256("\n".join(sorted(source_names)).encode("utf-8")).hexdigest(),
        "expectedParameterSetHash": expected_parameter_hash,
        "compiler": str(compiler),
        "portableIncludeRoot": str(include_root),
        "artifact": str(ex5),
        "compileLog": str(log),
    }
    _atomic_write(manifest_path, (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    return BuildVariant(variant_source, manifest_path, compiler, include_root, log)


def compiler_command(compiler: Path, source: Path, include_root: Path, log: Path) -> list[str]:
    wrapper = Path(__file__).with_name("run_metaeditor_compile.ps1")
    return [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(wrapper),
        str(compiler),
        str(source),
        str(include_root),
    ]


def compile_variant(variant: BuildVariant) -> Path:
    artifact = variant.source.with_suffix(".ex5")
    if artifact.is_symlink() or variant.log.is_symlink():
        raise ValueError("compiler outputs cannot be symlinks")
    artifact.unlink(missing_ok=True)
    variant.log.unlink(missing_ok=True)
    command = compiler_command(variant.compiler, variant.source, variant.include_root, variant.log)
    completed = subprocess.run(command, cwd=variant.compiler.parent, timeout=180, check=False)
    if variant.log.exists():
        log_bytes = variant.log.read_bytes()
        encoding = "utf-16" if b"\0" in log_bytes[:128] else "utf-8"
        log_text = log_bytes.decode(encoding, errors="replace")
    else:
        log_text = ""
    result = re.search(r"(?m)^\s*Result:\s*(\d+)\s+errors?,\s*(\d+)\s+warnings?\b", log_text)
    if not artifact.is_file() or not result or result.group(1) != "0" or result.group(2) != "0":
        artifact.unlink(missing_ok=True)
        raise RuntimeError(
            f"MetaEditor compile failed (wrapper exit={completed.returncode}); inspect {variant.log}; "
            "no MT5 terminal installation was changed"
        )
    return artifact


def compile_candidate(variant: BuildVariant) -> Path:
    """Compile a candidate and bind its exact artifact hash to the build manifest."""
    artifact = compile_variant(variant)
    if _is_link_or_junction(variant.manifest) or _is_link_or_junction(artifact):
        raise ValueError("candidate manifest and artifact cannot be links")
    manifest = json.loads(variant.manifest.read_text(encoding="utf-8"))
    manifest["artifactSha256"] = hashlib.sha256(artifact.read_bytes()).hexdigest()
    manifest["compileResult"] = "0 errors, 0 warnings"
    _atomic_write(variant.manifest, (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    return artifact


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("account", choices=sorted(ALLOWED_ACCOUNTS))
    parser.add_argument("--preset", required=True, type=Path, help="the exact preset to bind to this instrumented candidate")
    parser.add_argument("--prepare-only", action="store_true", help="generate source and manifest without compiling")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        variant = prepare_variant(root, args.account, root / "output" / "ea-evidence-builds", preset_path=args.preset)
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
