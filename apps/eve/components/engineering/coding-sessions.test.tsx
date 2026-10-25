// @vitest-environment happy-dom
import {describe,it,expect} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {CodingSessions} from "./coding-sessions";
import type {FactoryCodingSessionAdapter} from "../../lib/engineering/coding-sessions";
type View=Awaited<ReturnType<FactoryCodingSessionAdapter["observe"]>>;
describe("saved coding session presentation",()=>{
 it("shows unavailable and empty states honestly",()=>{
  expect(renderToStaticMarkup(<CodingSessions/>)).toContain("unavailable");
  expect(renderToStaticMarkup(<CodingSessions view={{sessions:[],artifacts:[],capabilities:{}} as unknown as View}/>)).toContain("No Factory coding sessions");
 });
 it.each([["RUNNING_REPORTED","Coding in progress"],["INTERRUPTING","Interruption requested"],["RECONCILIATION_REQUIRED","Reconciliation required"],["COMPLETED_UNVERIFIED","verification incomplete"],["VERIFICATION_FAILED","Verification failed"],["INDEPENDENT_CHECKS_PASSED","Independent checks passed"]])("renders %s without manufacturing success",(state,label)=>{
  const html=renderToStaticMarkup(<CodingSessions view={{sessions:[{id:"run",state,repository:"fixture/disposable",assignedAgentId:"coder-one",baseSha:"abc",attemptNumber:1,independentlyVerified:state==="INDEPENDENT_CHECKS_PASSED"}],artifacts:[],capabilities:{resume:{supported:false,reason:"In-place resume unqualified"}}} as unknown as View}/>);
  expect(html).toContain(label);expect(html).toContain("coder-one");expect(html).toContain("Deferred");
  if(state!=="INDEPENDENT_CHECKS_PASSED")expect(html).toContain("does not establish verified success");
 });
});
