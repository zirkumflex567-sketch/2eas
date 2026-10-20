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
    "ChartStudioEvidenceSpool.mqh": "c0fd13c2519c1f4de40debae2fc12f858cb55b4abc8c2592fcda7f6a51a7c709",
}
PRESET_NAME = "GoldM15_Reconstruction.set"
PRODUCER = "goldm15_demo"
EA_NAME = "GoldM15_EvidenceCapture"
RECORD_ONLY_PRODUCER = "goldm15_demo_recordonly"
RECORD_ONLY_EA_NAME = "GoldM15_EvidenceCapture_RecordOnly"


def _source_digest(content: bytes) -> str:
    return hashlib.sha256(content.replace(b"\r\n", b"\n")).hexdigest()


def _instrument_risk_helper(source_text: str, *, record_only: bool = False) -> str:
    source_text = source_text.replace("\r\n", "\n")
    cancel_anchor = "void GoldCancelOrders(CTrade &closer,long magic,bool all)"
    if source_text.count(cancel_anchor) != 1:
        raise ValueError("expected unique GoldM15 pending-order cancellation helper")
    source_text = source_text.replace(
        cancel_anchor,
        "void GoldCancelOrders(CTrade &closer,long magic,bool all,const string reason)",
        1,
    )
    cancel_calls = "GoldCancelOrders(closer,magic,all);"
    if source_text.count(cancel_calls) != 1:
        raise ValueError("expected unique GoldM15 liquidation cancel call")
    source_text = source_text.replace(cancel_calls, "GoldCancelOrders(closer,magic,all,reason);", 1)
    news_cancel_call = "GoldCancelOrders(closer,magic,all_scope);"
    if source_text.count(news_cancel_call) != 1:
        raise ValueError("expected unique GoldM15 news-veto cancellation call")
    source_text = source_text.replace(
        news_cancel_call,
        'GoldCancelOrders(closer,magic,all_scope,"NEWS_ENTRY_VETO");',
        1,
    )

    cancel_request_anchor = '''      if(ticket>0 && (all || (OrderGetString(ORDER_SYMBOL)==_Symbol && m>magic && m<=magic+3)))
         if(!closer.OrderDelete(ticket) || !GoldAcceptedResult(closer.ResultRetcode())) PrintFormat("RISK cancel retry %I64u: %u",ticket,closer.ResultRetcode());'''
    cancel_request_capture = '''      if(ticket>0 && (all || (OrderGetString(ORDER_SYMBOL)==_Symbol && m>magic && m<=magic+3)))
        {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
         string cs_symbol=OrderGetString(ORDER_SYMBOL);
         ENUM_ORDER_TYPE cs_order_type=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
         double cs_order_price=OrderGetDouble(ORDER_PRICE_OPEN);
         double cs_order_volume=OrderGetDouble(ORDER_VOLUME_CURRENT);
         datetime cs_request_utc=TimeGMT();
         bool cs_cancelled=closer.OrderDelete(ticket);
         uint cs_cancel_retcode=closer.ResultRetcode();
         bool cs_cancel_accepted=cs_cancelled && GoldAcceptedResult(cs_cancel_retcode);
         string cs_cancel_outcome=cs_cancel_accepted ? "PASS" : "BLOCK";
         if(!cs_cancelled || !GoldAcceptedResult(cs_cancel_retcode))
            PrintFormat("RISK cancel retry %I64u: %u",ticket,cs_cancel_retcode);
         if(cs_symbol==_Symbol && CSRecorderReady && !CSRecorderDisabled)
           {
            datetime cs_bar_time=iTime(_Symbol,PERIOD_M15,1);
            string cs_cancel_id=CS_EVIDENCE_PRODUCER_ID+"_cancel_"+
               IntegerToString((long)GetTickCount64())+"_"+IntegerToString((long)(CSEventCounter+1));
            string cs_features=CSFeature("pending_order_price",CSNumber(cs_order_price,_Digits),"price","M15")+","+
               CSFeature("pending_order_volume",CSNumber(cs_order_volume,8),"lots","M15")+","+
               CSFeature("pending_order_type_code",CSNumber((double)cs_order_type,0),"enum","M15")+","+
               CSFeature("broker_retcode",CSNumber((double)cs_cancel_retcode,0),"code","M15");
            string cs_predicates=CSPredicate("pending_order_cancel",CSBoolNumber(cs_cancel_accepted),"EQ","1",
               cs_cancel_outcome,reason);
            string cs_request_time=CSUtc(cs_request_utc);
            if(cs_bar_time>0)
               CSEnqueueDecision("ORDER_ATTEMPT",cs_cancel_outcome,cs_bar_time,cs_features,cs_predicates,"",
                  cs_cancel_id,ticket,cs_request_time);
           }
#else
         if(!closer.OrderDelete(ticket) || !GoldAcceptedResult(closer.ResultRetcode())) PrintFormat("RISK cancel retry %I64u: %u",ticket,closer.ResultRetcode());
#endif
        }'''
    if source_text.count(cancel_request_anchor) != 1:
        raise ValueError("expected unique GoldM15 pending-order cancel request")
    source_text = source_text.replace(cancel_request_anchor, cancel_request_capture, 1)

    liquidate_anchor = "void GoldLiquidate(CTrade &closer,long magic,bool all)"
    if source_text.count(liquidate_anchor) != 1:
        raise ValueError("expected unique GoldM15 account risk liquidation helper")
    source_text = source_text.replace(
        liquidate_anchor,
        "void GoldLiquidate(CTrade &closer,long magic,bool all,const string reason)",
        1,
    )
    service_anchor = """      bool close=state.hard_lock || state.daily_lock || rollover || !state.known || !persistence_ok || !HolidayAllowed(now);
      if(close && now-last_liquidate>=2)
      { last_liquidate=now; if(!flat) liquidations++; GoldLiquidate(closer,magic,all_scope); }"""
    service_capture = """      bool close=state.hard_lock || state.daily_lock || rollover || !state.known || !persistence_ok || !HolidayAllowed(now);
      string cs_reason=state.hard_lock ? "HARD_LOCK" :
         (state.daily_lock ? "DAILY_DRAWDOWN" : (rollover ? "ROLLOVER" :
         (!state.known ? "BASELINE_UNKNOWN" : (!persistence_ok ? "PERSISTENCE_FAILURE" : "HOLIDAY_OR_GUARD"))));
      if(close && now-last_liquidate>=2)
      { last_liquidate=now; if(!flat) liquidations++; GoldLiquidate(closer,magic,all_scope,cs_reason); }"""
    if source_text.count(service_anchor) != 1:
        raise ValueError("expected unique GoldM15 risk liquidation trigger")
    source_text = source_text.replace(service_anchor, service_capture, 1)

    close_anchor = """         closer.SetTypeFillingBySymbol(PositionGetString(POSITION_SYMBOL));
         if(!closer.PositionClose(ticket) || !GoldAcceptedResult(closer.ResultRetcode())) PrintFormat("RISK close retry %I64u: %u",ticket,closer.ResultRetcode());"""
    close_capture = """         string cs_symbol=PositionGetString(POSITION_SYMBOL);
         closer.SetTypeFillingBySymbol(cs_symbol);
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
         long cs_position_type=PositionGetInteger(POSITION_TYPE);
         double cs_volume=PositionGetDouble(POSITION_VOLUME);
         MqlTick cs_tick={};
         bool cs_quote_ok=cs_symbol==_Symbol && SymbolInfoTick(cs_symbol,cs_tick) && cs_tick.time_msc>0 &&
                          cs_tick.bid>0.0 && cs_tick.ask>=cs_tick.bid;
         datetime cs_request_utc=TimeGMT();
         bool cs_closed=closer.PositionClose(ticket);
         uint cs_retcode=closer.ResultRetcode();
         ulong cs_order_ticket=cs_closed ? closer.ResultOrder() : 0;
         if(!cs_closed || !GoldAcceptedResult(cs_retcode))
            PrintFormat("RISK close retry %I64u: %u",ticket,cs_retcode);
         CSCaptureGoldRiskCloseAttempt(reason,ticket,cs_position_type,cs_volume,cs_symbol,cs_quote_ok,
            cs_tick,cs_request_utc,cs_closed,cs_retcode,cs_order_ticket);
#else
         if(!closer.PositionClose(ticket) || !GoldAcceptedResult(closer.ResultRetcode())) PrintFormat("RISK close retry %I64u: %u",ticket,closer.ResultRetcode());
#endif"""
    if source_text.count(close_anchor) != 1:
        raise ValueError("expected unique GoldM15 risk close request")
    source_text = source_text.replace(close_anchor, close_capture, 1)
    if record_only:
        source_text = source_text.replace("closer.OrderDelete(ticket)", 'CSSuppressBrokerWrite("OrderDelete")')
        source_text = source_text.replace("closer.PositionClose(ticket)", 'CSSuppressBrokerWrite("PositionClose")')
    return source_text


def _instrument_source(source_text: str, *, account_alias: str, producer: str,
                       terminal_hash: str, source_hash: str, expected_parameter_hash: str,
                       login: int, server: str, terminal_path: str,
                       broker_utc_offset_seconds: int, record_only: bool = False) -> str:
    if account_alias not in ALLOWED_ACCOUNTS:
        raise ValueError("account is not allowlisted")
    if type(broker_utc_offset_seconds) is not int or not -86400 <= broker_utc_offset_seconds <= 86400:
        raise ValueError("invalid configured broker UTC offset")
    source_text = source_text.replace("\r\n", "\n")
    include_anchor = '#include "GoldM15_Risk.mqh"'
    if source_text.count(include_anchor) != 1:
        raise ValueError("expected unique GoldM15 risk include")
    declarations = _input_names(source_text)
    parameter_hash = _parameter_hash_function(source_text, declarations)
    definitions = [
        "#define CS_EVIDENCE_CAPTURE",
        *( ["#define CS_EVIDENCE_RECORD_ONLY 1"] if record_only else [] ),
        *( ['bool CSSuppressBrokerWrite(const string operation) { PrintFormat("RECORD-ONLY: suppressed broker write operation=%s reason=RECORD_ONLY_SUPPRESSED",operation); return false; }'] if record_only else [] ),
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
        f"#define CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS {broker_utc_offset_seconds}",
        "string CSParameterSetCanonical();",
        "void CSCaptureGoldRiskCloseAttempt(const string reason,const ulong ticket,const long position_type,",
        "   const double volume,const string symbol,const bool quote_ok,const MqlTick &tick,",
        "   const datetime request_utc,const bool sent,const uint retcode,const ulong order_ticket);",
        'string CSParameterSetHash="";',
        '#include "ChartStudioEvidenceSpool.mqh"',
    ]
    source_text = source_text.replace("\n" + include_anchor,
                                      "\n" + "\n".join(definitions) + "\n" + include_anchor, 1)

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

    deinit_anchor = "void OnDeinit(const int reason)\n{"
    if source_text.count(deinit_anchor) != 1:
        raise ValueError("expected unique GoldM15 deinitialization function")
    deinit_capture = "\n#ifdef CS_EVIDENCE_CAPTURE_ENABLED\n   CSFlushEvidenceQueueOnShutdown();\n#endif"
    source_text = source_text.replace(deinit_anchor, deinit_anchor + deinit_capture, 1)

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
      CSEnqueueDecision("SIGNAL",cs_outcome,cs_bar,cs_features,cs_predicates);
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

    order_anchor = '''      bool sent=side==1 ? trade.Buy(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment)
                       : trade.Sell(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment);
      uint result=trade.ResultRetcode();'''
    order_capture = '''#ifdef CS_EVIDENCE_CAPTURE_ENABLED
      string cs_attempt_id=CS_EVIDENCE_PRODUCER_ID+"_"+
                           IntegerToString((long)GetTickCount64())+"_"+IntegerToString(i+1);
      datetime cs_request_utc=TimeGMT();
      string cs_request_time=CSUtc(cs_request_utc);
      string cs_quote_time=CSUtcFromBrokerMillis(tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
      double cs_tick_size=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
      double cs_tick_value=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
      string cs_currency=SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT);
#endif
      bool sent=side==1 ? trade.Buy(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment)
                       : trade.Sell(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment);
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
      uint cs_retcode=trade.ResultRetcode();
      datetime cs_ack_utc=TimeGMT();
      ulong cs_order_ticket=trade.ResultOrder();
      bool cs_accepted=sent && GoldAcceptedResult(cs_retcode);
      string cs_outcome=cs_accepted ? "PASS" : "BLOCK";
      string cs_predicates=CSPredicate("broker_request",CSBoolNumber(cs_accepted),"EQ","1",
                                       cs_outcome,cs_accepted ? "BROKER_ACCEPTED" : "BROKER_REJECTED");
      string cs_features=CSFeature("requested_lots",CSNumber(lots,8),"lots",EnumToString(signal_timeframe))+","+
         CSFeature("intended_price",CSNumber(execution,_Digits),"price",EnumToString(signal_timeframe))+","+
         CSFeature("protective_stop",CSNumber(stop,_Digits),"price",EnumToString(signal_timeframe))+","+
         CSFeature("system_id",IntegerToString(i+1),"count",EnumToString(signal_timeframe));
      string cs_attempt="";
      if(tick.time_msc>0 && tick.bid>0.0 && tick.ask>=tick.bid && cs_tick_size>0.0 &&
         cs_retcode>0 && cs_quote_time!="")
         cs_attempt=CSOrderAttemptJson(cs_attempt_id,side==1 ? "BUY" : "SELL",execution,lots,
            tick.bid,tick.ask,cs_tick_size,cs_tick_value,cs_currency,cs_quote_time,
            cs_request_time,CSUtc(cs_ack_utc),cs_retcode,cs_order_ticket,
            tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
      CSEnqueueDecision("ORDER_ATTEMPT",cs_outcome,iTime(_Symbol,signal_timeframe,1),
         cs_features,cs_predicates,cs_attempt,cs_attempt_id,cs_order_ticket,cs_request_time);
      if(cs_accepted && cs_order_ticket>0)
         CSRegisterOrderAttempt(cs_order_ticket,cs_attempt_id,iTime(_Symbol,signal_timeframe,1));
#endif
      uint result=trade.ResultRetcode();'''
    if source_text.count(order_anchor) != 1:
        raise ValueError("expected unique GoldM15 market-order submission")
    source_text = source_text.replace(order_anchor, order_capture, 1)
    if record_only:
        source_text = source_text.replace(
            "bool sent=side==1 ? trade.Buy(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment)\n                       : trade.Sell(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment);",
            'bool sent=CSSuppressBrokerWrite(side==1 ? "Buy" : "Sell");',
            1,
        )

    close_anchor = """         last_attempt[i]=TimeCurrent();
         bool closed=trade.PositionClose(ticket);
         uint close_result=trade.ResultRetcode();"""
    close_capture = '''         last_attempt[i]=TimeCurrent();
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
         string cs_close_attempt_id=CS_EVIDENCE_PRODUCER_ID+"_close_"+
            IntegerToString((long)GetTickCount64())+"_"+IntegerToString(i+1);
         datetime cs_close_request_utc=TimeGMT();
         string cs_close_request_time=CSUtc(cs_close_request_utc);
         string cs_close_quote_time=CSUtcFromBrokerMillis(tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
         double cs_close_tick_size=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
         double cs_close_tick_value=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
         string cs_close_currency=SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT);
         string cs_close_side="";
         double cs_close_price=0.0,cs_close_volume=0.0;
         bool cs_close_position_known=PositionSelectByTicket(ticket);
         if(cs_close_position_known)
           {
            long cs_position_type=PositionGetInteger(POSITION_TYPE);
            cs_close_volume=PositionGetDouble(POSITION_VOLUME);
            if(cs_position_type==POSITION_TYPE_BUY)
              { cs_close_side="SELL"; cs_close_price=tick.bid; }
            else if(cs_position_type==POSITION_TYPE_SELL)
              { cs_close_side="BUY"; cs_close_price=tick.ask; }
           }
#endif
         bool closed=trade.PositionClose(ticket);
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
         uint cs_close_retcode=trade.ResultRetcode();
         datetime cs_close_ack_utc=TimeGMT();
         ulong cs_close_ticket=trade.ResultOrder();
         bool cs_close_accepted=closed && GoldAcceptedResult(cs_close_retcode);
         string cs_close_outcome=cs_close_accepted ? "PASS" : "BLOCK";
         string cs_close_predicates=CSPredicate("broker_close_request",CSBoolNumber(cs_close_accepted),"EQ","1",
            cs_close_outcome,cs_close_accepted ? "BROKER_ACCEPTED" : "BROKER_REJECTED");
         string cs_close_features="";
         if(cs_close_position_known && cs_close_side!="")
            cs_close_features=CSFeature("requested_lots",CSNumber(cs_close_volume,8),"lots","M15")+","+
               CSFeature("intended_price",CSNumber(cs_close_price,_Digits),"price","M15");
         string cs_close_attempt="";
         if(cs_close_position_known && cs_close_side!="" && tick.time_msc>0 && tick.bid>0.0 && tick.ask>=tick.bid &&
            cs_close_tick_size>0.0 && cs_close_retcode>0 && cs_close_quote_time!="")
            cs_close_attempt=CSOrderAttemptJson(cs_close_attempt_id,cs_close_side,cs_close_price,cs_close_volume,
               tick.bid,tick.ask,cs_close_tick_size,cs_close_tick_value,cs_close_currency,cs_close_quote_time,
               cs_close_request_time,CSUtc(cs_close_ack_utc),cs_close_retcode,cs_close_ticket,
               tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
         CSEnqueueDecision("ORDER_ATTEMPT",cs_close_outcome,iTime(_Symbol,signal_timeframe,1),
            cs_close_features,cs_close_predicates,cs_close_attempt,cs_close_attempt_id,cs_close_ticket,
            cs_close_request_time,0,ticket);
         if(cs_close_accepted && cs_close_ticket>0)
            CSRegisterOrderAttempt(cs_close_ticket,cs_close_attempt_id,iTime(_Symbol,signal_timeframe,1));
#endif
         uint close_result=trade.ResultRetcode();'''
    if source_text.count(close_anchor) != 1:
        raise ValueError("expected unique GoldM15 strategy position-close call")
    source_text = source_text.replace(close_anchor, close_capture, 1)
    if record_only:
        source_text = source_text.replace(
            "         bool closed=trade.PositionClose(ticket);",
            '         Print("RECORD-ONLY: suppressed broker write operation=PositionClose reason=RECORD_ONLY_SUPPRESSED");\n         bool closed=false;',
            1,
        )

    event_handlers = '''
#define CS_GOLD_ORDER_CAPACITY 64
ulong CSOrderTickets[CS_GOLD_ORDER_CAPACITY];
string CSOrderAttemptIds[CS_GOLD_ORDER_CAPACITY];
datetime CSOrderSignalBars[CS_GOLD_ORDER_CAPACITY];
int CSOrderNext=0;

void CSRegisterOrderAttempt(const ulong order_ticket,const string attempt_id,const datetime signal_bar)
  {
   if(order_ticket==0 || attempt_id=="" || signal_bar<=0)
      return;
   int slot=CSOrderNext%CS_GOLD_ORDER_CAPACITY;
   CSOrderTickets[slot]=order_ticket;
   CSOrderAttemptIds[slot]=attempt_id;
   CSOrderSignalBars[slot]=signal_bar;
   CSOrderNext++;
  }

bool CSFindOrderAttempt(const ulong order_ticket,string &attempt_id,datetime &signal_bar)
  {
   if(order_ticket==0)
      return false;
   for(int i=0;i<CS_GOLD_ORDER_CAPACITY;i++)
      if(CSOrderTickets[i]==order_ticket && CSOrderAttemptIds[i]!="")
        {
         attempt_id=CSOrderAttemptIds[i];
         signal_bar=CSOrderSignalBars[i];
         return signal_bar>0;
        }
   return false;
  }

#define CS_GOLD_POSITION_CAPACITY 64
ulong CSPositionTickets[CS_GOLD_POSITION_CAPACITY];
string CSPositionAttemptIds[CS_GOLD_POSITION_CAPACITY];
datetime CSPositionSignalBars[CS_GOLD_POSITION_CAPACITY];
double CSPositionStops[CS_GOLD_POSITION_CAPACITY];
double CSPositionTargets[CS_GOLD_POSITION_CAPACITY];
double CSPositionVolumes[CS_GOLD_POSITION_CAPACITY];
int CSPositionNext=0;

void CSRegisterPosition(const ulong position_ticket,const string attempt_id,const datetime signal_bar,
                        const double stop_loss,const double take_profit,const double volume)
  {
   if(position_ticket==0 || signal_bar<=0)
      return;
   int slot=-1;
   for(int i=0;i<CS_GOLD_POSITION_CAPACITY;i++)
      if(CSPositionTickets[i]==position_ticket)
        {
         slot=i;
         break;
        }
   if(slot<0)
     {
      slot=CSPositionNext%CS_GOLD_POSITION_CAPACITY;
      CSPositionNext++;
     }
   CSPositionTickets[slot]=position_ticket;
   CSPositionAttemptIds[slot]=attempt_id;
   CSPositionSignalBars[slot]=signal_bar;
   CSPositionStops[slot]=stop_loss;
   CSPositionTargets[slot]=take_profit;
   CSPositionVolumes[slot]=volume;
  }

bool CSFindPosition(const ulong position_ticket,string &attempt_id,datetime &signal_bar,
                    double &stop_loss,double &take_profit,double &volume)
  {
   if(position_ticket==0)
      return false;
   for(int i=0;i<CS_GOLD_POSITION_CAPACITY;i++)
      if(CSPositionTickets[i]==position_ticket)
        {
         attempt_id=CSPositionAttemptIds[i];
         signal_bar=CSPositionSignalBars[i];
         stop_loss=CSPositionStops[i];
         take_profit=CSPositionTargets[i];
         volume=CSPositionVolumes[i];
         return signal_bar>0;
        }
   return false;
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
      string cs_features=CSFeature("deal_volume",CSNumber(trans.volume,8),"lots","M15")+","+
         CSFeature("deal_price",CSNumber(trans.price,_Digits),"price","M15")+","+
         CSFeature("deal_type_code",IntegerToString((int)trans.deal_type),"enum","M15")+","+
         CSFeature("transaction_type_code",IntegerToString((int)trans.type),"enum","M15")+","+
         CSFeature("deal_stop_loss",CSNumber(trans.price_sl,_Digits),"price","M15")+","+
         CSFeature("deal_take_profit",CSNumber(trans.price_tp,_Digits),"price","M15");
      string cs_predicates=CSPredicate("broker_deal_observed","1","EQ","1","PASS","TRADE_TRANSACTION_DEAL_ADD");
      datetime cs_observed_utc=TimeGMT();
      CSEnqueueDecision("BROKER_RESULT","PASS",cs_signal_bar,cs_features,cs_predicates,"",
                        cs_attempt_id,trans.order,CSUtc(cs_observed_utc),trans.deal,trans.position);
      if(PositionSelectByTicket(trans.position))
         CSRegisterPosition(trans.position,cs_attempt_id,cs_signal_bar,
            PositionGetDouble(POSITION_SL),PositionGetDouble(POSITION_TP),
            PositionGetDouble(POSITION_VOLUME));
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
   if(PositionSelectByTicket(trans.position))
      cs_volume_after=PositionGetDouble(POSITION_VOLUME);
   bool cs_sl_changed=trans.price_sl!=cs_sl_before;
   bool cs_tp_changed=trans.price_tp!=cs_tp_before;
   bool cs_volume_changed=cs_volume_after!=cs_volume_before;
   if(!cs_sl_changed && !cs_tp_changed && !cs_volume_changed)
      return;
   string cs_features=CSFeature("sl_before",CSNumber(cs_sl_before,_Digits),"price","M15")+","+
      CSFeature("sl_after",CSNumber(trans.price_sl,_Digits),"price","M15")+","+
      CSFeature("tp_before",CSNumber(cs_tp_before,_Digits),"price","M15")+","+
      CSFeature("tp_after",CSNumber(trans.price_tp,_Digits),"price","M15")+","+
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
    timer_anchor = "void OnTimer()\n{\n#ifdef CS_EVIDENCE_CAPTURE_ENABLED"
    if source_text.count(timer_anchor) != 1:
        raise ValueError("expected unique GoldM15 timer insertion point")
    risk_capture_handler = '''
void CSCaptureGoldRiskCloseAttempt(const string reason,const ulong ticket,const long position_type,
   const double volume,const string symbol,const bool quote_ok,const MqlTick &tick,
   const datetime request_utc,const bool sent,const uint retcode,const ulong order_ticket)
  {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   if(!CSRecorderReady || CSRecorderDisabled || symbol!=_Symbol)
      return;
   string side=position_type==POSITION_TYPE_BUY ? "SELL" :
      (position_type==POSITION_TYPE_SELL ? "BUY" : "");
   bool accepted=sent && GoldAcceptedResult(retcode);
   string outcome=accepted ? "PASS" : "BLOCK";
   string attempt_id=CS_EVIDENCE_PRODUCER_ID+"_risk_"+
      IntegerToString((long)GetTickCount64())+"_"+IntegerToString((long)(CSEventCounter+1));
   datetime bar_time=iTime(_Symbol,PERIOD_M15,1);
   string request_time=CSUtc(request_utc);
   string ack_time=CSUtc(TimeGMT());
   string quote_time=CSUtcFromBrokerMillis(tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
   double price=position_type==POSITION_TYPE_BUY ? tick.bid :
      (position_type==POSITION_TYPE_SELL ? tick.ask : 0.0);
   double tick_size=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_SIZE);
   double tick_value=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_VALUE);
   string currency=SymbolInfoString(symbol,SYMBOL_CURRENCY_PROFIT);
   string predicates=CSPredicate("risk_guard_close",CSBoolNumber(accepted),"EQ","1",outcome,reason);
   string attempt="";
   if(quote_ok && side!="" && tick_size>0.0 && volume>0.0 && price>0.0 && retcode>0 && quote_time!="")
      attempt=CSOrderAttemptJson(attempt_id,side,price,volume,tick.bid,tick.ask,tick_size,tick_value,
         currency,quote_time,request_time,ack_time,retcode,order_ticket,
         tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
   if(bar_time>0)
      CSEnqueueDecision("ORDER_ATTEMPT",outcome,bar_time,"",predicates,attempt,attempt_id,
         order_ticket,request_time,0,ticket);
   if(accepted && order_ticket>0 && bar_time>0)
      CSRegisterOrderAttempt(order_ticket,attempt_id,bar_time);
#endif
  }

'''
    source_text = source_text.replace(timer_anchor, event_handlers + risk_capture_handler + timer_anchor, 1)
    return source_text


def prepare_variant(repo_root: Path, alias: str, output_root: Path, *, preset_path: Path,
                    record_only: bool = False) -> BuildVariant:
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
    if _source_digest(spool_bytes) != EXPECTED_HASHES["ChartStudioEvidenceSpool.mqh"]:
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
    if record_only:
        variant_dir = variant_dir / "record-only"
    for directory in (variant_dir.parent, variant_dir):
        if _is_link_or_junction(directory):
            raise ValueError("build output cannot traverse a symlink or junction")
        directory.mkdir(exist_ok=True)
        if _is_link_or_junction(directory) or (directory.resolve() != expected_output and expected_output not in directory.resolve().parents):
            raise ValueError("build output must remain under repository output/")

    producer = RECORD_ONLY_PRODUCER if record_only else PRODUCER
    ea_name = RECORD_ONLY_EA_NAME if record_only else EA_NAME
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
        broker_utc_offset_seconds=spec["broker_utc_offset_seconds"],
        record_only=record_only,
    )
    variant_source = variant_dir / f"{ea_name}.mq5"
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
    generated_supporting_sources = {}
    for source_helper, output_helper in zip(HELPERS, helper_outputs, strict=True):
        helper_bytes = (root / source_helper).read_bytes()
        if source_helper == Path("goldm15/GoldM15_Risk.mqh"):
            helper_text = _instrument_risk_helper(helper_bytes.decode("utf-8-sig"))
            if record_only:
                helper_text = helper_text.replace("closer.OrderDelete(ticket)", 'CSSuppressBrokerWrite("OrderDelete")')
                helper_text = helper_text.replace("closer.PositionClose(ticket)", 'CSSuppressBrokerWrite("PositionClose")')
            helper_bytes = helper_text.encode("utf-8-sig")
        _atomic_write(output_helper, helper_bytes)
        generated_supporting_sources[source_helper.as_posix()] = hashlib.sha256(helper_bytes).hexdigest()
    manifest = {
        "schemaVersion": 1,
        "accountAlias": alias,
        "producerId": producer,
        "recordOnly": record_only,
        "terminalIdentityHash": context.terminal_identity_hash,
        "sourceAndIncludeSha256": source_and_include_hash,
        "spoolHelperSha256": _source_digest(spool_bytes),
        "supportingSources": {str(path): EXPECTED_HASHES[path.as_posix()] for path in HELPERS},
        "generatedSupportingSources": generated_supporting_sources,
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
    parser.add_argument("--record-only", action="store_true")
    args = parser.parse_args()
    root = REPO_ROOT
    try:
        variant = prepare_variant(root, args.account, root / "output", preset_path=args.preset, record_only=args.record_only)
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
