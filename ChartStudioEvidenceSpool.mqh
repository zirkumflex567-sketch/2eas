#ifndef CHART_STUDIO_EVIDENCE_SPOOL_MQH
#define CHART_STUDIO_EVIDENCE_SPOOL_MQH

// The checked-in/default EA build is read-only with respect to this recorder.
// Demo variants are built with explicit account-scoped definitions.
#ifdef CS_EVIDENCE_CAPTURE
#define CS_EVIDENCE_CAPTURE_ENABLED
#endif
#ifndef CS_EVIDENCE_ACCOUNT_ID
#define CS_EVIDENCE_ACCOUNT_ID ""
#endif
#ifndef CS_EVIDENCE_PRODUCER_ID
#define CS_EVIDENCE_PRODUCER_ID ""
#endif
#ifndef CS_EVIDENCE_TERMINAL_HASH
#define CS_EVIDENCE_TERMINAL_HASH ""
#endif
#ifndef CS_EVIDENCE_SOURCE_HASH
#define CS_EVIDENCE_SOURCE_HASH ""
#endif
#ifndef CS_EVIDENCE_EXPECTED_LOGIN
#define CS_EVIDENCE_EXPECTED_LOGIN 0
#endif
#ifndef CS_EVIDENCE_EXPECTED_SERVER
#define CS_EVIDENCE_EXPECTED_SERVER ""
#endif
#ifndef CS_EVIDENCE_EXPECTED_TERMINAL_PATH
#define CS_EVIDENCE_EXPECTED_TERMINAL_PATH ""
#endif
#ifndef CS_EVIDENCE_STRATEGY_ID
#define CS_EVIDENCE_STRATEGY_ID "xau_titan_pro_basket_guard"
#endif
#ifndef CS_EVIDENCE_STRATEGY_VERSION
#define CS_EVIDENCE_STRATEGY_VERSION "7_20"
#endif

#define CS_QUEUE_CAPACITY 64
#define CS_QUEUE_BATCH 8
#define CS_SEGMENT_FOLDER "ChartStudioEvidence"
#define CS_SEGMENT_MAX_BYTES 131072

string CSQueue[CS_QUEUE_CAPACITY];
int CSQueueHead=0;
int CSQueueCount=0;
ulong CSQueueOverflowCount=0;
ulong CSQueueOverflowNextLog=1;
ulong CSSequence=0;
bool CSRecorderReady=false;
bool CSRecorderDisabled=false;
ulong CSEventCounter=0;

string CSJsonQuote(string value)
  {
   StringReplace(value,"\\","\\\\");
   StringReplace(value,"\"","\\\"");
   StringReplace(value,"\r","\\r");
   StringReplace(value,"\n","\\n");
   StringReplace(value,"\t","\\t");
   return "\""+value+"\"";
  }

string CSHashText(const string text)
  {
   uchar data[],key[],digest[];
   StringToCharArray(text,data,0,WHOLE_ARRAY,CP_UTF8);
   int size=ArraySize(data);
   if(size>0 && data[size-1]==0)
      ArrayResize(data,size-1);
   if(ArraySize(data)==0 || CryptEncode(CRYPT_HASH_SHA256,data,key,digest)!=32)
      return "";
   string hex="";
   for(int i=0;i<ArraySize(digest);i++)
      hex+=StringFormat("%02x",(int)digest[i]);
   StringToLower(hex);
   return hex;
  }

string CSUtc(datetime value)
  {
   MqlDateTime parts;
   TimeToStruct(value,parts);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       parts.year,parts.mon,parts.day,parts.hour,parts.min,parts.sec);
  }

string CSUtcFromMillis(const long value)
  {
   if(value<=0)
      return "";
   datetime seconds=(datetime)(value/1000);
   // Request timestamps use whole seconds; keep both timestamps comparable.
   return CSUtc(seconds);
  }

string CSUtcFromBrokerMillis(const long value,const int broker_utc_offset_seconds)
  {
   if(value<=0 || broker_utc_offset_seconds < -86400 || broker_utc_offset_seconds > 86400)
      return "";
   datetime seconds=(datetime)(value/1000-broker_utc_offset_seconds);
   return CSUtc(seconds);
  }

string CSNumber(double value,int digits=10)
  {
   if(!MathIsValidNumber(value))
      return "null";
   return DoubleToString(value,digits);
  }

string CSBoolNumber(const bool value)
  {
   return value ? "1" : "0";
  }

string CSFeature(const string id,const string value,const string unit,const string timeframe)
  {
   return "{\"id\":"+CSJsonQuote(id)+",\"value\":"+value+",\"unit\":"+
          CSJsonQuote(unit)+",\"timeframe\":"+CSJsonQuote(timeframe)+"}";
  }

string CSPredicate(const string id,const string observed,const string comparator,
                   const string threshold,const string outcome,const string reason)
  {
   return "{\"ruleId\":"+CSJsonQuote(id)+",\"observedValue\":"+observed+
          ",\"comparator\":"+CSJsonQuote(comparator)+",\"threshold\":"+threshold+
          ",\"outcome\":"+CSJsonQuote(outcome)+",\"reasonCode\":"+CSJsonQuote(reason)+"}";
  }

void CSEnqueueEnvelope(const string envelope)
  {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   if(!CSRecorderReady || CSRecorderDisabled || StringLen(envelope)==0)
      return;
   if(CSQueueCount>=CS_QUEUE_CAPACITY)
     {
      if(CSQueueOverflowCount<2147483647)
         CSQueueOverflowCount++;
      return;
     }
   int slot=(CSQueueHead+CSQueueCount)%CS_QUEUE_CAPACITY;
   CSQueue[slot]=envelope;
   CSQueueCount++;
#endif
  }

void CSEnqueueDecision(const string stage,const string outcome,const datetime bar_open_server,
                      const string feature_vector,const string predicates,
                      const string order_attempt_json="",const string order_attempt_id="",
                      const ulong broker_ticket=0,const string request_time_utc="")
  {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   if(!CSRecorderReady || CSRecorderDisabled)
      return;
   datetime now_utc=TimeGMT();
   datetime server_now=TimeTradeServer();
   datetime close_utc=now_utc-(server_now-(bar_open_server+PeriodSeconds(PERIOD_M15)));
   if(close_utc>now_utc)
      close_utc=now_utc;
   CSEventCounter++;
   string correlation="titan_"+IntegerToString((long)bar_open_server)+"_"+
                       IntegerToString((long)CSEventCounter);
   string event_id="decision_"+IntegerToString((long)GetTickCount64())+"_"+
                    IntegerToString((long)CSEventCounter);
   string payload="{\"eventId\":"+CSJsonQuote(event_id)+
      ",\"accountId\":"+CSJsonQuote(CS_EVIDENCE_ACCOUNT_ID)+
      ",\"terminalIdentityHash\":"+CSJsonQuote(CS_EVIDENCE_TERMINAL_HASH)+
      ",\"symbol\":"+CSJsonQuote(_Symbol)+
      ",\"strategyId\":"+CSJsonQuote(CS_EVIDENCE_STRATEGY_ID)+",\"strategyVersion\":"+
      CSJsonQuote(CS_EVIDENCE_STRATEGY_VERSION)+",\"subsystemId\":"+
      CSJsonQuote(CS_EVIDENCE_SOURCE_HASH)+",\"parameterSetHash\":"+CSJsonQuote(CSParameterSetHash)+
      ",\"decisionTimeUtc\":"+CSJsonQuote(request_time_utc!="" ? request_time_utc : CSUtc(now_utc))+
      ",\"evaluatedBarCloseUtc\":"+CSJsonQuote(CSUtc(close_utc))+
      ",\"timeframe\":\"M15\",\"barIsClosed\":true,\"featureVector\":["+
      feature_vector+"],\"predicates\":["+predicates+
      "],\"stage\":"+CSJsonQuote(stage)+",\"outcome\":"+CSJsonQuote(outcome)+
      (order_attempt_id!="" ? ",\"orderAttemptId\":"+CSJsonQuote(order_attempt_id) : "")+
      (broker_ticket>0 ? ",\"brokerTicket\":"+CSJsonQuote(IntegerToString((long)broker_ticket)) : "")+
      (order_attempt_json!="" ? ",\"orderAttempt\":"+order_attempt_json : "")+
      ",\"dataProvenance\":\"recorded\",\"dataRevision\":1,\"capturedAtUtc\":"+
      CSJsonQuote(CSUtc(now_utc))+",\"correlationId\":"+CSJsonQuote(correlation)+"}";
   string envelope="{\"schemaVersion\":1,\"type\":\"DECISION\",\"id\":"+
      CSJsonQuote(event_id)+",\"accountId\":"+CSJsonQuote(CS_EVIDENCE_ACCOUNT_ID)+
      ",\"brokerServer\":"+CSJsonQuote(CS_EVIDENCE_EXPECTED_SERVER)+
      ",\"terminalIdentityHash\":"+CSJsonQuote(CS_EVIDENCE_TERMINAL_HASH)+
      ",\"dataRevision\":1,\"provenance\":\"RECORDED\",\"supersedes\":null,\"payload\":"+payload+"}";
   CSEnqueueEnvelope(envelope);
#endif
  }

string CSOrderAttemptJson(const string attempt_id,const string side,const double intended_price,
                          const double requested_volume,const double bid,const double ask,
                          const double tick_size,const double tick_value,const string currency,
                          const string quote_time_utc,const string request_time_utc,
                          const string ack_time_utc,const uint broker_retcode,const ulong broker_ticket,
                          const long broker_time_epoch_millis=0,const int broker_utc_offset_seconds=0)
  {
   string value="{\"orderAttemptId\":"+CSJsonQuote(attempt_id)+
      ",\"side\":"+CSJsonQuote(side)+
      ",\"intendedPrice\":"+CSJsonQuote(CSNumber(intended_price,_Digits))+
      ",\"requestedVolume\":"+CSJsonQuote(CSNumber(requested_volume,8))+
      ",\"requestTimeUtc\":"+CSJsonQuote(request_time_utc)+
      ",\"ackTimeUtc\":"+CSJsonQuote(ack_time_utc)+
      ",\"brokerRetcode\":"+IntegerToString((int)broker_retcode)+
      ",\"quoteSnapshot\":{\"symbol\":"+CSJsonQuote(_Symbol)+
      ",\"bid\":"+CSJsonQuote(CSNumber(bid,_Digits))+
      ",\"ask\":"+CSJsonQuote(CSNumber(ask,_Digits))+
      ",\"tickSize\":"+CSJsonQuote(CSNumber(tick_size,10))+
      ",\"quoteTimeUtc\":"+CSJsonQuote(quote_time_utc)+
      ",\"source\":\"MT5_VERIFIED\",\"canExecute\":false";
   if(broker_time_epoch_millis>0)
      value+=",\"brokerTimeEpochMs\":"+IntegerToString(broker_time_epoch_millis)+
             ",\"brokerUtcOffsetSeconds\":"+IntegerToString(broker_utc_offset_seconds);
   if(tick_value>0.0 && currency!="")
      value+=",\"tickValuePerLot\":"+CSJsonQuote(CSNumber(tick_value,8))+
             ",\"currency\":"+CSJsonQuote(currency);
   else
      value+=",\"tickValuePerLot\":null,\"currency\":null";
   value+="}";
   if(broker_ticket>0)
      value+=",\"brokerTicket\":"+CSJsonQuote(IntegerToString((long)broker_ticket));
   return value+"}";
  }

bool CSValidateRuntimeIdentity()
  {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   if(CS_EVIDENCE_ACCOUNT_ID=="" || CS_EVIDENCE_PRODUCER_ID=="" ||
      CS_EVIDENCE_TERMINAL_HASH=="" || CS_EVIDENCE_SOURCE_HASH=="" ||
      CS_EVIDENCE_EXPECTED_SERVER=="" ||
      CS_EVIDENCE_EXPECTED_TERMINAL_PATH=="" || CS_EVIDENCE_EXPECTED_LOGIN<=0)
      return false;
   if(AccountInfoInteger(ACCOUNT_TRADE_MODE)!=ACCOUNT_TRADE_MODE_DEMO ||
      AccountInfoInteger(ACCOUNT_LOGIN)!=(long)CS_EVIDENCE_EXPECTED_LOGIN ||
      AccountInfoString(ACCOUNT_SERVER)!=CS_EVIDENCE_EXPECTED_SERVER)
      return false;
   string actual=TerminalInfoString(TERMINAL_PATH);
   string expected=CS_EVIDENCE_EXPECTED_TERMINAL_PATH;
   StringToLower(actual);
   StringToLower(expected);
   return actual==expected;
#else
   return false;
#endif
  }

string CSSeqPath()
  {
   return CS_SEGMENT_FOLDER+"\\"+CS_EVIDENCE_PRODUCER_ID+".sequence.bin";
  }

bool CSPersistSequence()
  {
   string target=CSSeqPath();
   string temp=CS_SEGMENT_FOLDER+"\\"+CS_EVIDENCE_PRODUCER_ID+".sequence.tmp";
   int handle=FileOpen(temp,FILE_WRITE|FILE_BIN|FILE_COMMON);
   if(handle==INVALID_HANDLE)
      return false;
   FileWriteLong(handle,(long)CSSequence);
   FileFlush(handle);
   bool complete=(FileSize(handle)==8);
   FileClose(handle);
   if(!complete)
      return false;
   return FileMove(temp,FILE_COMMON,target,FILE_COMMON|FILE_REWRITE);
  }

ulong CSSequenceFromName(const string name)
  {
   string prefix=CS_EVIDENCE_PRODUCER_ID+".";
   int pos=StringFind(name,prefix);
   if(pos<0)
      return 0;
   int start=pos+StringLen(prefix);
   int dash=StringFind(name,"-",start);
   int end=StringFind(name,".ready.ndjson",dash+1);
   if(dash<0 || end<0)
      return 0;
   string first=StringSubstr(name,start,dash-start);
   string last=StringSubstr(name,dash+1,end-dash-1);
   long lo=StringToInteger(first),hi=StringToInteger(last);
   if(lo<1 || hi<lo || hi>2147483647)
      return 0;
   return (ulong)hi;
  }

ulong CSFindLatestReady(const string folder)
  {
   string mask=folder+CS_EVIDENCE_PRODUCER_ID+".*.ready.ndjson";
   string name="";
   long search=FileFindFirst(mask,name,FILE_COMMON);
   if(search==INVALID_HANDLE)
      return 0;
   ulong latest=CSSequenceFromName(name);
   while(FileFindNext(search,name))
     {
      ulong value=CSSequenceFromName(name);
      if(value>latest)
         latest=value;
     }
   FileFindClose(search);
   return latest;
  }

bool CSRecoverSequence()
  {
   string path=CSSeqPath();
   if(FileIsExist(path,FILE_COMMON))
     {
      int handle=FileOpen(path,FILE_READ|FILE_BIN|FILE_COMMON);
      if(handle==INVALID_HANDLE)
         return false;
      if(FileSize(handle)!=8)
        {
         FileClose(handle);
         return false;
        }
      long value=FileReadLong(handle);
      FileClose(handle);
      if(value<0 || value>2147483647)
         return false;
      CSSequence=(ulong)value;
     }
   ulong latest=CSFindLatestReady(CS_SEGMENT_FOLDER+"\\");
   ulong archived=CSFindLatestReady(CS_SEGMENT_FOLDER+"\\archive\\");
   if(archived>latest)
      latest=archived;
   if(latest>CSSequence)
      CSSequence=latest;
   return CSPersistSequence();
  }

bool CSInitializeEvidenceProducer()
  {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   CSRecorderReady=false;
   CSRecorderDisabled=false;
   if(!CSValidateRuntimeIdentity())
     {
      Print("ChartStudio evidence recorder disabled: demo identity mismatch.");
      CSRecorderDisabled=true;
      return false;
     }
   if(!CSRecoverSequence())
     {
      Print("ChartStudio evidence recorder disabled: private spool sequence unavailable.");
      CSRecorderDisabled=true;
      return false;
     }
   CSRecorderReady=true;
   PrintFormat("ChartStudio evidence recorder ready (%s).",CS_EVIDENCE_PRODUCER_ID);
   return true;
#else
   return false;
#endif
  }

bool CSWriteReadySegment(const string line,const ulong sequence)
  {
   string stem=CS_SEGMENT_FOLDER+"\\"+CS_EVIDENCE_PRODUCER_ID+"."+IntegerToString((long)sequence);
   string temp=stem+".tmp.ndjson";
   string ready=stem+"-"+IntegerToString((long)sequence)+".ready.ndjson";
   if(StringLen(line)>CS_SEGMENT_MAX_BYTES || FileIsExist(ready,FILE_COMMON))
      return false;
   int handle=FileOpen(temp,FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON,0,CP_UTF8);
   if(handle==INVALID_HANDLE)
      return false;
   uint written=FileWriteString(handle,line+"\n");
   FileFlush(handle);
   bool complete=(written==StringLen(line)+1 && FileSize(handle)<=CS_SEGMENT_MAX_BYTES);
   FileClose(handle);
   if(!complete)
     {
      FileDelete(temp,FILE_COMMON);
      return false;
     }
   if(!FileMove(temp,FILE_COMMON,ready,FILE_COMMON))
     {
      FileDelete(temp,FILE_COMMON);
      return false;
     }
   return true;
  }

void CSFlushEvidenceQueue()
  {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   if(!CSRecorderReady || CSRecorderDisabled)
      return;
   if(CSQueueOverflowCount>=CSQueueOverflowNextLog)
     {
      PrintFormat("ChartStudio evidence recorder queue loss: dropped=%I64u (in-memory counter).",
                  CSQueueOverflowCount);
      CSQueueOverflowNextLog=CSQueueOverflowCount+100;
     }
   int sent=0;
   while(CSQueueCount>0 && sent<CS_QUEUE_BATCH)
     {
      if(CSSequence>=2147483647)
        {
         CSRecorderDisabled=true;
         Print("ChartStudio evidence recorder disabled: sequence limit reached.");
         return;
        }
      string envelope=CSQueue[CSQueueHead];
      ulong next=CSSequence+1;
      CSSequence=next;
      if(!CSPersistSequence())
        {
         CSRecorderDisabled=true;
         Print("ChartStudio evidence recorder disabled: sequence persistence failed.");
         return;
        }
      string captured=CSUtc(TimeGMT());
      string line="{\"spoolVersion\":1,\"producerId\":"+CSJsonQuote(CS_EVIDENCE_PRODUCER_ID)+
                  ",\"sequence\":"+IntegerToString((long)next)+
                  ",\"accountId\":"+CSJsonQuote(CS_EVIDENCE_ACCOUNT_ID)+
                  ",\"terminalIdentityHash\":"+CSJsonQuote(CS_EVIDENCE_TERMINAL_HASH)+
                  ",\"capturedAtUtc\":"+CSJsonQuote(captured)+
                  ",\"envelope\":"+envelope+"}";
      if(!CSWriteReadySegment(line,next))
        {
         // Keep this event queued. The next attempt advances sequence again,
         // making a lost write visible as an importer gap.
         return;
        }
      CSQueue[CSQueueHead]="";
      CSQueueHead=(CSQueueHead+1)%CS_QUEUE_CAPACITY;
      CSQueueCount--;
      sent++;
     }
#endif
  }

#endif // CHART_STUDIO_EVIDENCE_SPOOL_MQH
