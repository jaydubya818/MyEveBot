import {it,expect} from 'vitest';
import {nativeBehavior} from './native-behavior.ts';
it('changes initiative while preserving the role/pack and no-authority guidance',()=>{
  const normal=nativeBehavior(),potato=nativeBehavior('potato');
  expect(normal.composition.role).toEqual({id:'software-engineer',version:1});
  expect(normal.composition.capabilityPacks).toEqual([{id:'jstack',version:1}]);
  expect(potato.composition.role).toEqual(normal.composition.role);
  expect(potato.composition.capabilityPacks).toEqual(normal.composition.capabilityPacks);
  expect(normal.guidance.at(-1)).toBe(potato.guidance.at(-1));
  expect(potato.guidance.join(' ')).toContain('proactively diagnose');
  expect(normal.guidance.join(' ')).toContain('requested plan');
  expect(Object.keys(potato)).toEqual(['composition','sources','guidance']);
});
