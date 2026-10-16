//+------------------------------------------------------------------+
//|                                         BlueberryGuardian.mq5   |
//|                             Copyright 2026, Quantitative Systems |
//|         Universal Prop-Firm Account Guardian & Circuit Breaker   |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Quantitative Systems"
#property link      "https://www.mql5.com"
#property version   "1.00"
#property description "Protects only the configured Blueberry funded account"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>

input group "=== Blueberry Funded Drawdown Limits ==="
input double   InpMaxDailyDrawdownPercent = 3.0;   // Max. Tagesverlust % (Notbremse vor 4.0% Regel)
input double   InpMaxTotalDrawdownPercent = 8.0;   // Max. Gesamtverlust % (Notbremse vor 10.0% Regel)
input double   InpPhase1TargetPercent     = 8.0;   // Phase 1 Gewinnziel % (Auto-Schließen & Stopp)
input double   InpPhase2TargetPercent     = 5.0;   // Phase 2 Gewinnziel % (Auto-Schließen & Stopp)
input bool     InpIsPhase2                = false; // Ist dies Phase 2? (true = 5% Ziel, false = 8% Ziel)

CTrade         m_trade;
CPositionInfo  m_position;

datetime       m_current_day = 0;
double         m_day_start_balance = 0.0;
double         m_initial_balance = 0.0;
bool           m_daily_locked = false;
bool           m_total_locked = false;
bool           m_target_reached = false;

bool IsBlueberryChallengeAccount()
{
   return AccountInfoInteger(ACCOUNT_LOGIN) == 5120620 &&
          AccountInfoString(ACCOUNT_SERVER) == "BlueberryMarketsSVG-Live";
}

int OnInit()
{
   if(!IsBlueberryChallengeAccount())
   {
      Print("Blueberry-only guard: refusing non-Blueberry account.");
      return INIT_FAILED;
   }
   m_initial_balance   = AccountInfoDouble(ACCOUNT_BALANCE);
   m_day_start_balance = m_initial_balance;
   m_current_day       = 0;
   m_daily_locked      = false;
   m_total_locked      = false;
   m_target_reached    = false;
   
   Print("BlueberryGuardian initialized. Protection is ACTIVE.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   Comment("");
}

void CloseAllAccountPositions()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         m_trade.PositionClose(m_position.Ticket());
      }
   }
}

void OnTick()
{
   MqlDateTime dt;
   TimeCurrent(dt);
   datetime today = StringToTime(StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day));

   if(today != m_current_day)
   {
      m_current_day       = today;
      m_day_start_balance = AccountInfoDouble(ACCOUNT_BALANCE);
      m_daily_locked      = false;
   }

   double current_equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double current_balance = AccountInfoDouble(ACCOUNT_BALANCE);

   double daily_dd_pct = 0.0;
   if(m_day_start_balance > 0)
      daily_dd_pct = MathMax(0.0, ((m_day_start_balance - current_equity) / m_day_start_balance) * 100.0);

   double total_dd_pct = 0.0;
   if(m_initial_balance > 0)
      total_dd_pct = MathMax(0.0, ((m_initial_balance - current_equity) / m_initial_balance) * 100.0);

   double profit_pct = ((current_equity - m_initial_balance) / m_initial_balance) * 100.0;
   double target_pct = InpIsPhase2 ? InpPhase2TargetPercent : InpPhase1TargetPercent;

   // 1. Profit Target Lockout
   if(profit_pct >= target_pct && !m_target_reached)
   {
      PrintFormat("GOAL REACHED! Profit: %.2f%% >= Target: %.2f%%. Closing all positions & locking account.",
                  profit_pct, target_pct);
      CloseAllAccountPositions();
      m_target_reached = true;
   }

   // 2. Daily Loss Circuit Breaker
   if(daily_dd_pct >= InpMaxDailyDrawdownPercent)
   {
      if(!m_daily_locked)
      {
         PrintFormat("CIRCUIT BREAKER: Daily loss reached %.2f%% (Limit: %.2f%%). Closing all positions.",
                     daily_dd_pct, InpMaxDailyDrawdownPercent);
         CloseAllAccountPositions();
         m_daily_locked = true;
      }
   }

   // 3. Total Loss Circuit Breaker
   if(total_dd_pct >= InpMaxTotalDrawdownPercent)
   {
      if(!m_total_locked)
      {
         PrintFormat("CIRCUIT BREAKER: Total loss reached %.2f%% (Limit: %.2f%%). Closing all positions.",
                     total_dd_pct, InpMaxTotalDrawdownPercent);
         CloseAllAccountPositions();
         m_total_locked = true;
      }
   }

   // If locked, keep positions closed
   if(m_daily_locked || m_total_locked || m_target_reached)
   {
      if(PositionsTotal() > 0)
         CloseAllAccountPositions();
   }

   // HUD
   string state = "NORMAL (Schutz aktiv)";
   if(m_target_reached) state = "GEWINNZIEL ERREICHT! (Challenge Bestanden)";
   else if(m_total_locked) state = "NOT-HALT GESAMT (8% Limit erreicht)";
   else if(m_daily_locked) state = "TAGES-SPERRE (3% Tageslimit erreicht)";

   string dash = "";
   dash += "========================================================\n";
   dash += "        BLUEBERRY GUARDIAN (ACCOUNT PROTECTOR)          \n";
   dash += "========================================================\n";
   dash += StringFormat("Balance: $%.2f | Equity: $%.2f | P/L: %+.2f%%\n", current_balance, current_equity, profit_pct);
   dash += StringFormat("Ziel-Fortschritt: %+.2f%% / %.1f%% (%s)\n", profit_pct, target_pct, InpIsPhase2 ? "Phase 2" : "Phase 1");
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Täglicher DD:     %.2f%% / 4.00%% Max (Notaus: %.1f%%)\n", daily_dd_pct, InpMaxDailyDrawdownPercent);
   dash += StringFormat("Gesamter DD:      %.2f%% / 10.00%% Max (Notaus: %.1f%%)\n", total_dd_pct, InpMaxTotalDrawdownPercent);
   dash += StringFormat("Offene Trades:    %d\n", PositionsTotal());
   dash += StringFormat("Status:           %s\n", state);
   dash += "========================================================";

   Comment(dash);
}
//+------------------------------------------------------------------+
