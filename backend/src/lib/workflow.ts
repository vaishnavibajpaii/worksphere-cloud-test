/** Pure workflow invariants shared by API handlers and unit tests. */
export const EDITABLE_REPORT_STATUSES = ['DRAFT','CHANGES_REQUESTED'] as const;
export const REVIEWABLE_REPORT_STATUSES = ['SUBMITTED','UNDER_REVIEW','ESCALATED'] as const;
export const REVIEW_ACTIONS = ['APPROVED','CHANGES_REQUESTED','REJECTED','UNDER_REVIEW','ESCALATED'] as const;
export function canEditReport(status:string){return (EDITABLE_REPORT_STATUSES as readonly string[]).includes(status);}
export function canSubmitReport(status:string,entryCount:number){return status==='DRAFT' && entryCount>0;}
export function canReviewReport(status:string,action:string,comment:string){return (REVIEWABLE_REPORT_STATUSES as readonly string[]).includes(status)&&(REVIEW_ACTIONS as readonly string[]).includes(action)&&(!['REJECTED','CHANGES_REQUESTED'].includes(action)||comment.trim().length>0);}
export function calculateMinutes(entries:{minutes:number}[]){const total=entries.reduce((sum,e)=>sum+e.minutes,0);if(entries.some(e=>!Number.isInteger(e.minutes)||e.minutes<0||e.minutes>1440)||total>1440)throw new Error('Total time must be between 0 and 24 hours');return total;}
export function canManageAssignees(actorId:string,assigneeIds:string[],managerIdByUser:Record<string,string|null>,isHR:boolean){return isHR||assigneeIds.every(id=>id===actorId||managerIdByUser[id]===actorId);}
