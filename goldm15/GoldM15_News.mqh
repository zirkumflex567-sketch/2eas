#ifndef GOLD_M15_NEWS
#define GOLD_M15_NEWS
bool GoldReplaceCalendar(const datetime &source[],datetime &target[])
{
   int size=ArraySize(source);
   if(!ArrayIsDynamic(target) || ArrayResize(target,size)!=size || ArraySize(target)!=size) return false;
   return size==0 || ArrayCopy(target,source)==size;
}
bool GoldNewsBlocked(datetime now,const datetime &events[],int seconds)
{
   int lo=0,hi=ArraySize(events);
   while(lo<hi) { int mid=(lo+hi)/2; if(events[mid]<now-seconds) lo=mid+1; else hi=mid; }
   return lo<ArraySize(events) && events[lo]<=now+seconds;
}
bool GoldHolidayBlocked(datetime now,const datetime &events[])
{
   // Calendar and now use the same broker-server clock. A holiday covers its whole day.
   datetime day=(datetime)(((long)now/86400)*86400);
   int lo=0,hi=ArraySize(events);
   while(lo<hi) { int mid=(lo+hi)/2; if(events[mid]<day) lo=mid+1; else hi=mid; }
   return lo<ArraySize(events) && events[lo]<day+86400;
}
bool GoldHolidayEarlyPause(datetime now,const datetime &events[],int hour)
{
   MqlDateTime clock; if(hour<0 || hour>23 || !TimeToStruct(now,clock)) return true;
   if(clock.hour<hour) return false;
   // Conservative session protection derived from the calendar, not trade dates:
   // holiday eves, and Fridays immediately after a Thursday USD holiday.
   return GoldHolidayBlocked(now+86400,events) || (clock.day_of_week==5 && GoldHolidayBlocked(now-86400,events));
}
bool GoldLoadNews(string file,string server,datetime &from,datetime &to,datetime &events[])
{
   ArrayResize(events,0); from=0; to=0;
   int f=FileOpen(file,FILE_READ|FILE_CSV|FILE_ANSI,',',CP_UTF8); if(f==INVALID_HANDLE) return false;
   string tag=FileReadString(f),start=FileReadString(f),end=FileReadString(f),broker=FileReadString(f);
   from=StringToTime(start); to=StringToTime(end);
   if(tag!="coverage" || broker!=server || from<=0 || to<=from) { FileClose(f); return false; }
   int count=0; bool valid=true;
   while(!FileIsEnding(f))
   {
      string raw=FileReadString(f),id=FileReadString(f);
      datetime time=(datetime)StringToInteger(raw);
      if(time<from || time>=to || StringToInteger(id)<=0 || count>=100000) { valid=false; break; }
      ArrayResize(events,count+1,2048); events[count++]=time;
   }
   FileClose(f);
   if(!valid || count==0) { ArrayResize(events,0); return false; }
   ArraySort(events); return true;
}
#endif
