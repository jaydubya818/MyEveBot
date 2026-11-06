import {it,expect} from 'vitest';
import {factoryPreviewLines} from './current-truth-lines.ts';
it('shows the private preview of a verified Factory candidate as a Result line, and an unavailable preview honestly',()=>{
 expect(factoryPreviewLines(undefined)).toEqual([]);
 expect(factoryPreviewLines({verification:'PARTIAL',preview:{url:'http://127.0.0.1:8789/preview/'+'f'.repeat(64)+'/',candidateCommit:'c'.repeat(40)}})).toEqual([
  `Private preview: http://127.0.0.1:8789/preview/${'f'.repeat(64)}/ (candidate ${'c'.repeat(40)}; owner-only on this machine; built by MyFactory from the verified candidate).`]);
 expect(factoryPreviewLines({verification:'PARTIAL',preview:{error:'Factory preview unavailable (409)'}})).toEqual([
  'Private preview: unavailable (Factory preview unavailable (409)). The verified Result is unchanged.']);
});
