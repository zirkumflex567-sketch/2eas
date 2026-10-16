//+------------------------------------------------------------------+
//|                                         ChallengeGuardian.mq5    |
//|                             Copyright 2026, Quantitative Systems |
//|                Universal Prop-Firm Challenge Account Protector   |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Quantitative Systems"
#property link      "https://www.mql5.com"
#property version   "2.00"
#property description "Dedizierter Prop-Firm Challenge Guardian (3.5% Daily DD & $9,100 Min-Balance Schutz)"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\OrderInfo.mqh>

//--- Input Parameter
input group "=== 1. Challenge Schutz-Regeln ==="
input double   InpMaxDailyDrawdownPercent = 3.50;      // Max. Tagesverlust in % (Tages-Notbremse)
input double   InpMinAccountBalance       = 9100.0;    // Min. Kontostand / Equity in USD (Hard Stop)
input double   InpInitialBalance          = 10000.0;   // Challenge Startkapital (z.B. $10,000)
input double   InpWarningThresholdPercent = 2.50;      // Warnschwelle Tages-DD in % (Gelbe Warnung)

input group "=== 2. Notfall & Verbot Aktionen ==="
input bool     InpClosePositionsOnBreach  = true;      // Bei Verstoß alle offenen Trades sofort schließen
input bool     InpCancelPendingOrders     = true;      // Bei Verstoß alle Pending Orders löschen
input bool     InpBlockNewOrders          = true;      // Bei Tradingverbot neue Orders sofort abwürgen
input bool     InpPlaySoundAlert          = true;      // Warnton bei Verstoß abspielen

input group "=== 3. Chart HUD & Steuerung ==="
input bool     InpShowHUDByDefault        = true;      // HUD beim Start anzeigen
input int      InpXOffset                 = 20;        // X-Abstand vom linken Rand (Pixel)
input int      InpYOffset                 = 35;        // Y-Abstand vom oberen Rand (Pixel)
input color    InpColorBackground         = C'22,27,34'; // Hintergrundfarbe (Dark Slate)
input color    InpColorBorder             = C'48,54,61'; // Rahmenfarbe

//--- Global Objects & State
CTrade         m_trade;
CPositionInfo  m_position;
COrderInfo     m_order;

bool           m_hud_visible        = true;
bool           m_daily_banned       = false;
bool           m_total_banned       = false;
datetime       m_current_day        = 0;
double         m_day_start_balance  = 0.0;
string         m_ban_reason         = "";

// Object Name Prefix to avoid collision
#define CG_PREFIX "CG_HUD_"
#define CG_BTN_TOGGLE  "CG_HUD_BtnToggle"
#define CG_BTN_PANIC   "CG_HUD_BtnPanic"

//+------------------------------------------------------------------+
//| Hilfsfunktion: Berechnet Tagesstart-Balance anhand Historie      |
//+------------------------------------------------------------------+
double CalculateDayStartBalance()
{
   MqlDateTime dt;
   TimeCurrent(dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   datetime day_start = StructToTime(dt);

   double current_balance = AccountInfoDouble(ACCOUNT_BALANCE);

   if(!HistorySelect(day_start, TimeCurrent()))
      return current_balance;

   double realized_today = 0.0;
   int deals_total = HistoryDealsTotal();
   for(int i = 0; i < deals_total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket > 0)
      {
         long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
         if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT)
         {
            realized_today += HistoryDealGetDouble(ticket, DEAL_PROFIT)
                            + HistoryDealGetDouble(ticket, DEAL_SWAP)
                            + HistoryDealGetDouble(ticket, DEAL_COMMISSION)
                            + HistoryDealGetDouble(ticket, DEAL_FEE);
         }
      }
   }

   double start_bal = current_balance - realized_today;
   return (start_bal > 0) ? start_bal : current_balance;
}

//+------------------------------------------------------------------+
//| Schließt alle Positionen des gesamten Kontos                    |
//+------------------------------------------------------------------+
void CloseAllPositions()
{
   int closed = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         ulong ticket = m_position.Ticket();
         if(m_trade.PositionClose(ticket))
            closed++;
         else
            PrintFormat("Fehler beim Schließen von Ticket #%I64u: Code %d", ticket, m_trade.ResultRetcode());
      }
   }
   if(closed > 0)
      PrintFormat("Challenge Guardian: %d Positionen erfolgreich liquidiert.", closed);
}

//+------------------------------------------------------------------+
//| Löscht alle ausstehenden Pending Orders                         |
//+------------------------------------------------------------------+
void CancelAllPendingOrders()
{
   int cancelled = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(m_order.SelectByIndex(i))
      {
         ulong ticket = m_order.Ticket();
         if(m_trade.OrderDelete(ticket))
            cancelled++;
      }
   }
   if(cancelled > 0)
      PrintFormat("Challenge Guardian: %d Pending Orders gelöscht.", cancelled);
}

//+------------------------------------------------------------------+
//| UI Hilfsfunktionen                                              |
//+------------------------------------------------------------------+
void CreateLabel(string name, int x, int y, string text, color clr, int font_size = 9, bool bold = false)
{
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetString(0, name, OBJPROP_FONT, "Segoe UI");
   }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, font_size);
   if(bold)
      ObjectSetString(0, name, OBJPROP_FONT, "Segoe UI Bold");
   else
      ObjectSetString(0, name, OBJPROP_FONT, "Segoe UI");
}

void CreatePanel(string name, int x, int y, int width, int height, color bg_color, color border_color)
{
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, width);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, height);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg_color);
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, border_color);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
}

void CreateButton(string name, int x, int y, int width, int height, string text, color bg_color, color text_color)
{
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetString(0, name, OBJPROP_FONT, "Segoe UI Bold");
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 9);
   }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, width);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, height);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg_color);
   ObjectSetInteger(0, name, OBJPROP_COLOR, text_color);
}

void RemoveHUDObjects()
{
   for(int i = ObjectsTotal(0) - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i);
      if(StringFind(name, CG_PREFIX) == 0 && name != CG_BTN_TOGGLE)
         ObjectDelete(0, name);
   }
}

void RemoveAllObjects()
{
   for(int i = ObjectsTotal(0) - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i);
      if(StringFind(name, CG_PREFIX) == 0)
         ObjectDelete(0, name);
   }
}

//+------------------------------------------------------------------+
//| Zeichnet das vollständige HUD                                   |
//+------------------------------------------------------------------+
void RenderHUD()
{
   int x = InpXOffset;
   int y = InpYOffset;

   // 1. Toggle Button immer anzeigen
   string toggle_txt = m_hud_visible ? "[ 👁️ HUD AUSBLICKEN ]" : "[ 🛡️ GUARDIAN HUD ANZEIGEN ]";
   color toggle_bg = m_hud_visible ? C'40,48,60' : C'31,111,235';
   CreateButton(CG_BTN_TOGGLE, x, y, 200, 24, toggle_txt, toggle_bg, clrWhite);

   if(!m_hud_visible)
   {
      RemoveHUDObjects();
      ChartRedraw(0);
      return;
   }

   y += 30;
   int panel_w = 350;
   int panel_h = 345;

   // Haupt-Hintergrund
   CreatePanel(CG_PREFIX + "BG", x, y, panel_w, panel_h, InpColorBackground, InpColorBorder);

   // Header Hintergrundleiste
   color header_bg = C'13,17,23';
   bool is_banned = (m_daily_banned || m_total_banned);
   if(is_banned)
      header_bg = C'140,20,20'; // Alarmrot
   CreatePanel(CG_PREFIX + "HDR_BG", x, y, panel_w, 32, header_bg, InpColorBorder);

   // Header Titel
   CreateLabel(CG_PREFIX + "HDR_TITLE", x + 12, y + 7, "🛡️ CHALLENGE GUARDIAN PRO", clrWhite, 10, true);

   // Status Badge
   string status_str = "GESCHÜTZT (AKTIV)";
   color status_color = C'46,160,67'; // Grün
   if(m_total_banned)
   {
      status_str = "TRADINGVERBOT (MIN. $9100 ERREICHT)";
      status_color = C'248,81,73'; // Rot
   }
   else if(m_daily_banned)
   {
      status_str = "TRADINGVERBOT (3.5% TAGESLIMIT)";
      status_color = C'248,81,73'; // Rot
   }
   else
   {
      double daily_dd_pct = 0.0;
      double cur_equity = AccountInfoDouble(ACCOUNT_EQUITY);
      if(m_day_start_balance > 0 && cur_equity < m_day_start_balance)
         daily_dd_pct = ((m_day_start_balance - cur_equity) / m_day_start_balance) * 100.0;

      if(daily_dd_pct >= InpWarningThresholdPercent)
      {
         status_str = StringFormat("WARNUNG (Tages-DD: %.2f%%)", daily_dd_pct);
         status_color = C'210,153,34'; // Gelb
      }
   }
   CreateLabel(CG_PREFIX + "STATUS", x + 12, y + 38, "Status: " + status_str, status_color, 9, true);

   // Trennlinie 1
   CreatePanel(CG_PREFIX + "SEP1", x + 10, y + 58, panel_w - 20, 1, InpColorBorder, InpColorBorder);

   // Account Metrics
   double cur_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double cur_equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double float_pnl   = cur_equity - cur_balance;
   double float_pct   = (cur_balance > 0) ? (float_pnl / cur_balance * 100.0) : 0.0;

   int cur_y = y + 66;
   int col1 = x + 14;
   int col2 = x + 185;

   // Zeile: Balance & Equity
   CreateLabel(CG_PREFIX + "L_BAL", col1, cur_y, "Balance:", C'160,170,185', 9, false);
   CreateLabel(CG_PREFIX + "V_BAL", col2, cur_y, StringFormat("$%.2f", cur_balance), clrWhite, 9, true);
   cur_y += 18;

   CreateLabel(CG_PREFIX + "L_EQ", col1, cur_y, "Equity:", C'160,170,185', 9, false);
   CreateLabel(CG_PREFIX + "V_EQ", col2, cur_y, StringFormat("$%.2f", cur_equity), clrWhite, 9, true);
   cur_y += 18;

   // Zeile: Floating PnL
   color pnl_color = (float_pnl >= 0) ? C'46,160,67' : C'248,81,73';
   string pnl_sign = (float_pnl >= 0) ? "+" : "";
   CreateLabel(CG_PREFIX + "L_PNL", col1, cur_y, "Offener PnL:", C'160,170,185', 9, false);
   CreateLabel(CG_PREFIX + "V_PNL", col2, cur_y, StringFormat("%s$%.2f (%s%.2f%%)", pnl_sign, float_pnl, pnl_sign, float_pct), pnl_color, 9, true);
   cur_y += 18;

   // Zeile: Offene Trades & Lots
   int pos_cnt = PositionsTotal();
   double total_lots = 0.0;
   for(int i = 0; i < pos_cnt; i++)
   {
      if(m_position.SelectByIndex(i))
         total_lots += m_position.Volume();
   }
   CreateLabel(CG_PREFIX + "L_POS", col1, cur_y, "Positionen:", C'160,170,185', 9, false);
   CreateLabel(CG_PREFIX + "V_POS", col2, cur_y, StringFormat("%d Trades (%.2f Lots)", pos_cnt, total_lots), clrWhite, 9, false);
   cur_y += 18;

   // Zeile: Margin Level
   double margin_level = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
   string margin_str = (margin_level > 0) ? StringFormat("%.1f%%", margin_level) : "Keine Margin";
   CreateLabel(CG_PREFIX + "L_ML", col1, cur_y, "Margin-Level:", C'160,170,185', 9, false);
   CreateLabel(CG_PREFIX + "V_ML", col2, cur_y, margin_str, C'180,195,215', 9, false);
   cur_y += 22;

   // Trennlinie 2
   CreatePanel(CG_PREFIX + "SEP2", x + 10, cur_y, panel_w - 20, 1, InpColorBorder, InpColorBorder);
   cur_y += 8;

   // Challenge Drawdown Sektion
   double daily_dd_pct = 0.0;
   double daily_loss_val = 0.0;
   if(m_day_start_balance > 0 && cur_equity < m_day_start_balance)
   {
      daily_loss_val = m_day_start_balance - cur_equity;
      daily_dd_pct = (daily_loss_val / m_day_start_balance) * 100.0;
   }
   double max_daily_loss = m_day_start_balance * (InpMaxDailyDrawdownPercent / 100.0);
   double daily_buffer = max_daily_loss - daily_loss_val;
   if(daily_buffer < 0) daily_buffer = 0.0;

   // Zeile: Tages-Start
   CreateLabel(CG_PREFIX + "L_DAYSTART", col1, cur_y, "Tages-Startbasis:", C'160,170,185', 9, false);
   CreateLabel(CG_PREFIX + "V_DAYSTART", col2, cur_y, StringFormat("$%.2f", m_day_start_balance), clrWhite, 9, false);
   cur_y += 18;

   // Zeile: Tages-Drawdown
   color dd_color = clrWhite;
   if(daily_dd_pct >= InpMaxDailyDrawdownPercent) dd_color = C'248,81,73';
   else if(daily_dd_pct >= InpWarningThresholdPercent) dd_color = C'210,153,34';
   else dd_color = C'46,160,67';

   CreateLabel(CG_PREFIX + "L_DAYDD", col1, cur_y, "Aktueller Tages-DD:", C'160,170,185', 9, false);
   CreateLabel(CG_PREFIX + "V_DAYDD", col2, cur_y, StringFormat("%.2f%% / %.2f%% Limit", daily_dd_pct, InpMaxDailyDrawdownPercent), dd_color, 9, true);
   cur_y += 18;

   // Zeile: Puffer bis Tagesstopp
   CreateLabel(CG_PREFIX + "L_DAYBUF", col1, cur_y, "Puffer bis Tagesstopp:", C'160,170,185', 9, false);
   color buf_color = (daily_buffer < 100 ? C'248,81,73' : C'46,160,67');
   CreateLabel(CG_PREFIX + "V_DAYBUF", col2, cur_y, StringFormat("$%.2f", daily_buffer), buf_color, 9, true);
   cur_y += 22;

   // Trennlinie 3
   CreatePanel(CG_PREFIX + "SEP3", x + 10, cur_y, panel_w - 20, 1, InpColorBorder, InpColorBorder);
   cur_y += 8;

   // Zeile: 9100 USD Hard Stop
   double effective_val = MathMin(cur_balance, cur_equity);
   double min_balance_buffer = effective_val - InpMinAccountBalance;
   if(min_balance_buffer < 0) min_balance_buffer = 0.0;

   CreateLabel(CG_PREFIX + "L_MINBAL", col1, cur_y, "Min. Balance Grenze:", C'160,170,185', 9, false);
   CreateLabel(CG_PREFIX + "V_MINBAL", col2, cur_y, StringFormat("$%.2f Hard Stop", InpMinAccountBalance), clrWhite, 9, false);
   cur_y += 18;

   CreateLabel(CG_PREFIX + "L_MINBUF", col1, cur_y, "Puffer bis $9100 Stop:", C'160,170,185', 9, false);
   color min_color = (min_balance_buffer < 200) ? C'248,81,73' : C'46,160,67';
   CreateLabel(CG_PREFIX + "V_MINBUF", col2, cur_y, StringFormat("$%.2f", min_balance_buffer), min_color, 9, true);
   cur_y += 26;

   // Notfall-Button: Panic Close All
   CreateButton(CG_BTN_PANIC, x + 14, cur_y, panel_w - 28, 24, "🚨 NOT-SCHLIESSEN (ALLE POSITIONEN)", C'130,25,25', clrWhite);

   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| Haupt-Überwachungslogik (Guardian Circuit Breaker)               |
//+------------------------------------------------------------------+
void CheckAccountProtection()
{
   // 1. Datumwechsel prüfen & Tagesbasis aktualisieren
   MqlDateTime dt;
   TimeCurrent(dt);
   datetime today = StringToTime(StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day));

   if(today != m_current_day)
   {
      m_current_day       = today;
      m_day_start_balance = CalculateDayStartBalance();
      m_daily_banned      = false;
      m_ban_reason        = "";
      PrintFormat("Challenge Guardian: Neuer Handelstag initialisiert. Tages-Basis: $%.2f", m_day_start_balance);
   }

   double cur_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double cur_equity  = AccountInfoDouble(ACCOUNT_EQUITY);

   // 2. Täglicher Drawdown Check (3.5% Regel)
   double daily_dd_pct = 0.0;
   if(m_day_start_balance > 0 && cur_equity < m_day_start_balance)
   {
      daily_dd_pct = ((m_day_start_balance - cur_equity) / m_day_start_balance) * 100.0;
   }

   if(daily_dd_pct >= InpMaxDailyDrawdownPercent)
   {
      if(!m_daily_banned)
      {
         m_daily_banned = true;
         m_ban_reason = StringFormat("Tages-Drawdown überschritten: %.2f%% >= %.2f%% Limit! (DayStart: $%.2f, Equity: $%.2f)",
                                     daily_dd_pct, InpMaxDailyDrawdownPercent, m_day_start_balance, cur_equity);
         PrintFormat("🚨 ALARM: %s", m_ban_reason);

         if(InpClosePositionsOnBreach)
            CloseAllPositions();
         if(InpCancelPendingOrders)
            CancelAllPendingOrders();
         if(InpPlaySoundAlert)
            PlaySound("alert.wav");

         Alert("🚨 CHALLENGE GUARDIAN: TAGES-DRAWDOWN ERREICHT! TRADINGVERBOT AKTIV!");
      }
   }

   // 3. Absolute Min-Balance Grenze Check (9100 USD Regel)
   if(cur_balance <= InpMinAccountBalance || cur_equity <= InpMinAccountBalance)
   {
      if(!m_total_banned)
      {
         m_total_banned = true;
         m_ban_reason = StringFormat("Min. Kontogrenze verletzt! Balance: $%.2f, Equity: $%.2f <= Hard Stop $%.2f!",
                                     cur_balance, cur_equity, InpMinAccountBalance);
         PrintFormat("🚨 KATASTROPHEN-STOPP: %s", m_ban_reason);

         if(InpClosePositionsOnBreach)
            CloseAllPositions();
         if(InpCancelPendingOrders)
            CancelAllPendingOrders();
         if(InpPlaySoundAlert)
            PlaySound("alert.wav");

         Alert("🚨 CHALLENGE GUARDIAN: 9100 USD GRENZE VERLETZT! KONTO GESPERRT!");
      }
   }

   // 4. Dauerhafter Block / Watchdog wenn gesperrt
   if((m_daily_banned || m_total_banned) && InpBlockNewOrders)
   {
      if(PositionsTotal() > 0)
      {
         Print("Challenge Guardian Sperre aktiv: Unerlaubte Position entdeckt! Schließe sofort...");
         CloseAllPositions();
      }
      if(OrdersTotal() > 0)
      {
         Print("Challenge Guardian Sperre aktiv: Unerlaubte Pending Order entdeckt! Lösche sofort...");
         CancelAllPendingOrders();
      }
   }
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
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
   m_hud_visible       = InpShowHUDByDefault;
   m_daily_banned      = false;
   m_total_banned      = false;
   m_current_day       = 0;
   m_day_start_balance = CalculateDayStartBalance();

   // Magic Number für Schließungen
   m_trade.SetExpertMagicNumber(999999);
   m_trade.SetDeviationInPoints(20);

   PrintFormat("Challenge Guardian geladen. DayStart-Basis: $%.2f | Daily-Limit: %.2f%% | Min-Balance: $%.2f",
               m_day_start_balance, InpMaxDailyDrawdownPercent, InpMinAccountBalance);

   // Starte 500ms Timer für flüssiges UI & stetige Wachhund-Überwachung
   EventSetMillisecondTimer(500);

   RenderHUD();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   RemoveAllObjects();
   ChartRedraw(0);
   Print("Challenge Guardian beendet. HUD entfernt.");
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   CheckAccountProtection();
   RenderHUD();
}

//+------------------------------------------------------------------+
//| Expert timer function (500ms intervall)                          |
//+------------------------------------------------------------------+
void OnTimer()
{
   CheckAccountProtection();
   RenderHUD();
}

//+------------------------------------------------------------------+
//| ChartEvent function (Interaktive Buttons)                        |
//+------------------------------------------------------------------+
void OnChartEvent(const int id,
                  const long &lparam,
                  const double &dparam,
                  const string &sparam)
{
   if(id == CHARTEVENT_OBJECT_CLICK)
   {
      // 1. HUD An/Aus Umschalter
      if(sparam == CG_BTN_TOGGLE)
      {
         m_hud_visible = !m_hud_visible;
         ObjectSetInteger(0, CG_BTN_TOGGLE, OBJPROP_STATE, false);
         RenderHUD();
      }
      // 2. Notfall-Schließen Button
      else if(sparam == CG_BTN_PANIC)
      {
         ObjectSetInteger(0, CG_BTN_PANIC, OBJPROP_STATE, false);
         Print("🚨 NOTFALL-BUTTON GEDRÜCKT: Liquidierung aller Positionen manuell ausgelöst!");
         CloseAllPositions();
         CancelAllPendingOrders();
         RenderHUD();
      }
   }
}
//+------------------------------------------------------------------+
