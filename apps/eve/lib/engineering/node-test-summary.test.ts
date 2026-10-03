import {describe,it,expect} from 'vitest';
import {nodeTestSummary} from './node-test-summary.ts';
describe('signed implementation display summaries',()=>{
 it.each(['#','ℹ'])('accepts a complete passing Node reporter %s',prefix=>{
  expect(nodeTestSummary(`${prefix} tests 5\n${prefix} pass 5\n${prefix} fail 0\n`)).toEqual({passed:5,total:5});
 });
 it('accepts CRLF output',()=>expect(nodeTestSummary('# tests 2\r\n# pass 2\r\n')).toEqual({passed:2,total:2}));
 it.each(['','# tests 0\n# pass 0','# tests 5\n# pass 4','# tests 9007199254740992\n# pass 9007199254740992','# tests 5\n# pass 5\n# tests 5','# tests 5\n# pass 5\n# pass 5','# tests 5\nℹ pass 5','prefix # tests 5\n# pass 5'])('rejects absent, ambiguous, failed or unsafe counts',log=>expect(nodeTestSummary(log)).toBeNull());
});
