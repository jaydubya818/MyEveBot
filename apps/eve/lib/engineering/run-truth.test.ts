import { describe,it,expect } from "vitest";
import { projectRuns, type ObservedRunInput } from "./run-truth.ts";
import { fixture } from "../../test/engineering-fixtures.ts";
const now=Date.parse("2026-09-27T00:00:00Z");
const work={...fixture().work,version:2,generation:2,control:"agent" as const,lifecycle:"active" as const};
const run:ObservedRunInput={id:"r1",purpose:"DEEP_AGENT",status:"RUNNING",generation:2,version:2,associatedAt:"2026-09-26T23:00:00Z",timestampSource:"admission",deadline:"2026-09-27T01:00:00Z"};
const authority={runId:"r1",writerRunId:"r1",writerSessionId:"writer",reason:"Authority unavailable"};
describe("active, latest and historical Run observations",()=>{
 it("A: active and latest agree only after current authority and custody checks",()=>{const p=projectRuns(work,[run],authority,now);expect(p.activeRun?.id).toBe(p.latestRun?.id);expect(p.writerSession.productive).toBe(true);});
 it("B: expired latest remains historical without a usable writer",()=>{const p=projectRuns(work,[{...run,deadline:"2026-09-26T23:30:00Z"}],authority,now);expect(p.activeRun).toBeNull();expect(p.latestRun?.effectiveStatus).toBe("EXPIRED");expect(p.latestRun?.storedStatus).toBe("RUNNING");expect(p.writerSession.recordedId).toBe("writer");expect(p.writerSession.productive).toBe(false);});
 it("H: no Run ever created stays distinct from historical-only Work",()=>{const p=projectRuns(work,[],authority,now);expect(p.activeRun).toBeNull();expect(p.latestRun).toBeNull();expect(p.runHistory).toEqual([]);expect(p.writerSession.productive).toBe(false);});
 it("C: completed Run remains visible",()=>{const p=projectRuns(work,[{...run,status:"COMPLETED"}],authority,now);expect(p.activeRun).toBeNull();expect(p.latestRun?.effectiveStatus).toBe("COMPLETED");});
 it("F: latest uses admission/start time, independently of active Run",()=>{const p=projectRuns(work,[{...run,id:"older",status:"FAILED",associatedAt:"2026-09-26T22:00:00Z"},run,{...run,id:"latest",status:"COMPLETED",associatedAt:"2026-09-26T23:45:00Z"}],authority,now);expect(p.latestRun?.id).toBe("latest");expect(p.activeRun?.id).toBe("r1");expect(p.runHistory.map(r=>r.id)).toEqual(["latest","r1","older"]);});
 it.each([{...authority,runId:null},{...authority,writerSessionId:null},{...authority,writerRunId:"other"}])("fails closed without current authority or custody",a=>{expect(projectRuns(work,[run],a,now).activeRun).toBeNull();});
 it("does not guess latest from a status-update timestamp or mutate history",()=>{const input=structuredClone(run);input.associatedAt=null;input.timestampSource="unavailable";const before=JSON.stringify(input);const p=projectRuns(work,[input],authority,now);expect(p.latestRun).toBeNull();expect(p.latestOrderCertain).toBe(false);expect(p.runHistory).toHaveLength(1);expect(JSON.stringify(input)).toBe(before);});
 it.each([{...work,generation:3},{...work,control:"paused" as const}])("fences changed Work",w=>expect(projectRuns(w,[run],authority,now).activeRun).toBeNull());
});
