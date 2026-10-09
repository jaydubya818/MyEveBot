import {CronExpressionParser} from "cron-parser";
/** Bounded, deterministic plan. Advancing next_fire_at discards older backlog. */
export function missedOccurrenceTimes(input:{cron:string|null;timezone:string;due:Date;now:Date;policy:"skip"|"run_latest"|"catch_up_bounded";limit?:number}):Date[] {
  const {cron,timezone,due,now,policy}=input;
  if(!cron || now.getTime()-due.getTime()<=60_000)return [due];
  if(policy==="skip")return [];
  const iterator=CronExpressionParser.parse(cron,{tz:timezone,currentDate:now});
  const limit=policy==="run_latest"?1:Math.max(1,Math.min(5,input.limit??3));
  const times:Date[]=[];
  for(let i=0;i<limit;i++){const time=iterator.prev().toDate();if(time<due)break;times.push(time);}
  return times.reverse();
}
