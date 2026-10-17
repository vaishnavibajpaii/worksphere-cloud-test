import {describe,it,expect} from 'vitest';
import {calculateMinutes,canEditReport,canSubmitReport,canReviewReport,canManageAssignees} from './workflow.js';
describe('daily work report workflow',()=>{
 it('permits draft editing',()=>expect(canEditReport('DRAFT')).toBe(true));
 it('permits editing a returned report',()=>expect(canEditReport('CHANGES_REQUESTED')).toBe(true));
 it('locks approved reports',()=>expect(canEditReport('APPROVED')).toBe(false));
 it('requires a nonempty draft for submission',()=>{expect(canSubmitReport('DRAFT',1)).toBe(true);expect(canSubmitReport('DRAFT',0)).toBe(false);expect(canSubmitReport('APPROVED',2)).toBe(false)});
 it('permits valid reviews',()=>expect(canReviewReport('SUBMITTED','APPROVED','')).toBe(true));
 it('disallows silent rejection',()=>expect(canReviewReport('SUBMITTED','REJECTED','')).toBe(false));
 it('disallows review of locked reports',()=>expect(canReviewReport('APPROVED','CHANGES_REQUESTED','reason')).toBe(false));
 it('sums reported minutes accurately',()=>expect(calculateMinutes([{minutes:60},{minutes:45}])).toBe(105));
 it('rejects more than 24 hours',()=>expect(()=>calculateMinutes([{minutes:1000},{minutes:500}])).toThrow());
 it('rejects negative work minutes',()=>expect(()=>calculateMinutes([{minutes:-1}])).toThrow());
});
describe('team assignment scope',()=>{
 const tree={alice:'manager',bob:'someone-else',manager:null};
 it('allows own direct reports',()=>expect(canManageAssignees('manager',['alice'],tree,false)).toBe(true));
 it('blocks employees outside team',()=>expect(canManageAssignees('manager',['bob'],tree,false)).toBe(false));
 it('allows HR with proper permission',()=>expect(canManageAssignees('hr',['alice','bob'],tree,true)).toBe(true));
});
