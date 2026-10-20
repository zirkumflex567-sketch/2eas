// Read-only MT5 economic-calendar snapshot bridge for non-funded demo terminals.
// Writes only MQL5/Files/chart_studio_calendar.json. It never submits trade requests.
#property strict
#property version "1.00"

input string InpAccountAlias="titan";
input int InpRefreshSeconds=60;

long expected_login=0;
string expected_server="";
string account_alias="";

string JsonEscape(const string value)
  {
   string out="";
   for(int i=0;i<StringLen(value);i++)
     {
      ushort character=StringGetCharacter(value,i);
      if(character=='\\') out+="\\\\";
      else if(character=='\"') out+="\\\"";
      else if(character=='\r') out+="\\r";
      else if(character=='\n') out+="\\n";
      else if(character=='\t') out+="\\t";
      else if(character<0x20) out+=StringFormat("\\u%04X",(int)character);
      else out+=ShortToString(character);
     }
   return out;
  }

string ServerStamp(const datetime value)
  {
   string stamp=TimeToString(value,TIME_DATE|TIME_MINUTES|TIME_SECONDS);
   StringReplace(stamp,".","-");
   return stamp;
  }

string UtcStamp(const datetime value)
  {
   string stamp=TimeToString(value,TIME_DATE|TIME_MINUTES|TIME_SECONDS);
   StringReplace(stamp,".","-");
   return stamp+"Z";
  }

string ImportanceName(const ENUM_CALENDAR_EVENT_IMPORTANCE value)
  {
   if(value==CALENDAR_IMPORTANCE_HIGH) return "HIGH";
   if(value==CALENDAR_IMPORTANCE_MODERATE) return "MODERATE";
   if(value==CALENDAR_IMPORTANCE_LOW) return "LOW";
   return "NONE";
  }

string TimeModeName(const ENUM_CALENDAR_EVENT_TIMEMODE value)
  {
   if(value==CALENDAR_TIMEMODE_DATETIME) return "DATETIME";
   if(value==CALENDAR_TIMEMODE_DATE) return "DATE";
   if(value==CALENDAR_TIMEMODE_NOTIME) return "NO_TIME";
   if(value==CALENDAR_TIMEMODE_TENTATIVE) return "TENTATIVE";
   return "UNKNOWN";
  }

bool ResolveIdentity()
  {
   if(_Symbol!="XAUUSD" && _Symbol!="XAUUSD.p" && _Symbol!="XAUUSD.pi") return false;
   account_alias=InpAccountAlias;
   if(account_alias=="titan")
     { expected_login=53087839; expected_server="ICMarketsEU-Demo"; }
   else if(account_alias=="xau5m_m5")
     { expected_login=700194619; expected_server="PUPrime-Demo"; }
   else if(account_alias=="titan_m5")
     { expected_login=700184986; expected_server="PUPrime-Demo"; }
   else if(account_alias=="xau5m_500")
     { expected_login=700194822; expected_server="PUPrime-Demo"; }
   else if(account_alias=="goldm15")
     { expected_login=53090070; expected_server="ICMarketsEU-Demo"; }
   else return false;
   return ((long)AccountInfoInteger(ACCOUNT_LOGIN)==expected_login &&
           AccountInfoString(ACCOUNT_SERVER)==expected_server);
  }

bool WriteSnapshot()
  {
   if(!ResolveIdentity())
     {
      Print("ChartStudio calendar bridge: account identity mismatch; no file written.");
      return false;
     }
   datetime server_now=TimeTradeServer();
   datetime utc_now=TimeGMT();
   if(server_now<=0 || utc_now<=0) return false;
   int offset=(int)(server_now-utc_now);
   if(MathAbs(offset)>14*60*60) return false;

   datetime from_time=server_now-60;
   datetime to_time=server_now+14*24*60*60;
   MqlCalendarValue values[];
   ResetLastError();
   int count=CalendarValueHistory(values,from_time,to_time,NULL,"USD");
   if(count<0)
     {
      PrintFormat("ChartStudio calendar bridge: MT5 calendar read failed (%d); previous snapshot retained.",GetLastError());
      return false;
     }

   string json="{\"schema\":\"mt5-calendar-v1\",\"account\":\""+JsonEscape(account_alias)+
               "\",\"symbol\":\""+JsonEscape(_Symbol)+"\",\"currency\":\"USD\",\"capturedAtUtc\":\""+
               UtcStamp(utc_now)+"\",\"serverTime\":\""+ServerStamp(server_now)+
               "\",\"serverUtcOffsetSeconds\":"+IntegerToString(offset)+
               ",\"coverage\":{\"fromServerTime\":\""+ServerStamp(from_time)+
               "\",\"toServerTime\":\""+ServerStamp(to_time)+"\",\"complete\":"+
               (count<5000 ? "true" : "false")+"},\"events\":[";
   int emitted=0;
   int limit=MathMin(count,5000);
   for(int i=0;i<limit;i++)
     {
      if(values[i].time<server_now) continue;
      MqlCalendarEvent event;
      if(!CalendarEventById(values[i].event_id,event)) continue;
      if(emitted>0) json+=",";
      json+="{\"id\":\""+StringFormat("%I64u",values[i].id)+
            "\",\"revision\":"+IntegerToString(values[i].revision)+
            ",\"name\":\""+JsonEscape(event.name)+"\",\"currency\":\"USD\",\"importance\":\""+
            ImportanceName(event.importance)+"\",\"timeServer\":\""+ServerStamp(values[i].time)+
            "\",\"timeMode\":\""+TimeModeName(event.time_mode)+
            "\",\"status\":\"SCHEDULED\"}";
      emitted++;
     }
   json+="]}";

   string temporary="chart_studio_calendar.tmp";
   string destination="chart_studio_calendar.json";
   FileDelete(temporary);
   int handle=FileOpen(temporary,FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
   if(handle==INVALID_HANDLE)
     {
      PrintFormat("ChartStudio calendar bridge: snapshot file open failed (%d).",GetLastError());
      return false;
     }
   FileWriteString(handle,json);
   FileFlush(handle);
   FileClose(handle);
   if(!FileMove(temporary,0,destination,FILE_REWRITE))
     {
      PrintFormat("ChartStudio calendar bridge: atomic snapshot replace failed (%d).",GetLastError());
      return false;
     }
   return true;
  }

int OnInit()
  {
   if(InpRefreshSeconds<15 || InpRefreshSeconds>3600 || !ResolveIdentity())
     {
      Print("ChartStudio calendar bridge: unsupported alias or account; initialization rejected.");
      return INIT_FAILED;
     }
   ResetLastError();
   if(!EventSetTimer(InpRefreshSeconds))
     {
      PrintFormat("ChartStudio calendar bridge: refresh timer setup failed (%d); initialization rejected.",GetLastError());
      return INIT_FAILED;
     }
   WriteSnapshot();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { WriteSnapshot(); }
void OnTick() { }
