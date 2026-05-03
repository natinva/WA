import { describe,it,expect } from 'vitest'; import { parseTRNumber } from '../utils/numeric';
describe('validation',()=>{ it('parses comma',()=>expect(parseTRNumber('1,5')).toBe(1.5)); it('invalid',()=>expect(()=>parseTRNumber('x')).toThrow());});
