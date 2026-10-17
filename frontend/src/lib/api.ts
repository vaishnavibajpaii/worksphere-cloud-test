export type User = {id:string;name:string;email:string;employeeCode:string;primaryRole:string;active:boolean;departmentId?:string|null;managerId?:string|null;permissions:string[];phone?:string|null};
export type WorkEntry = {id?:string;taskId?:string|null;title:string;description:string;completed:string;inProgress:string;pending:string;blocker:string;priority:string;minutes:number;progress:number;attachmentIds:string[]};
export type WorkReport = {id:string;employeeId:string;date:string;status:string;remarks:string;nextDayPlan:string;totalMinutes:number;submittedAt?:string|null;employee:{id:string;name:string;employeeCode:string;managerId:string|null;department?:{name:string}};entries:WorkEntry[];reviews:{id:string;action:string;comment:string;createdAt:string;reviewer:{name:string}}[]};
export type Task = {id:string;title:string;description:string;status:string;priority:string;progress:number;dueAt?:string|null;projectId?:string|null;project?:{id:string;name:string};assignments:{userId:string;user:{id:string;name:string}}[];comments:{id:string;message:string;author:{name:string}}[]};
export type Project = {id:string;name:string;code:string;description:string;status:string;startsAt?:string;endsAt?:string;ownerId:string;owner:{name:string};_count:{tasks:number}};
export type Catalog = {branches:any[];departments:any[];designations:any[];teams:any[];roles:any[];leaveTypes:any[];masters:any[];categories:string[]};
export type Summary = {employeeCount:number;taskCount:number;completed:number;pending:number;overdue:number;pendingReports:number;pendingLeaves:number;todayAttendance:number;reportedHours:number;chart:{date:string;reports:number;hours:number}[]};
let refreshPromise:Promise<void>|null=null;
function csrf(){return decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('ws_csrf='))?.split('=')[1]||'');}
export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
export async function api<T=any>(url:string,options:RequestInit={},retry=true):Promise<T>{
 const headers:Record<string,string>={...(options.headers as Record<string,string>||{})};
 if(options.body && !(options.body instanceof FormData))headers['Content-Type']='application/json';
 if(!['GET','HEAD'].includes((options.method||'GET').toUpperCase()))headers['X-CSRF-Token']=csrf();
 const res=await fetch('/api'+url,{...options,headers,credentials:'include'});
 if(res.status===401&&retry&&!url.startsWith('/auth/')){
  try {if(!refreshPromise)refreshPromise=fetch('/api/auth/refresh',{method:'POST',credentials:'include'}).then(r=>{if(!r.ok)throw new Error('Refresh failed');}).finally(()=>refreshPromise=null);await refreshPromise;return api<T>(url,options,false);} catch {window.dispatchEvent(new Event('worksphere:logout'));}
 }
 const json=await res.json().catch(()=>null);
 if(!res.ok)throw new ApiError(res.status,json?.error||'Request failed');
 return json as T;
}
export const post=<T=any>(url:string,body:any)=>api<T>(url,{method:'POST',body:JSON.stringify(body)});
export const patch=<T=any>(url:string,body:any)=>api<T>(url,{method:'PATCH',body:JSON.stringify(body)});
export const put=<T=any>(url:string,body:any)=>api<T>(url,{method:'PUT',body:JSON.stringify(body)});
export const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
export const localDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const shortDate=(s?:string|null)=>s?new Date(s).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—';
export const hrs=(min:number)=>`${Math.floor(min/60)}h ${min%60}m`;
export function exportDownload(format:'csv'|'xlsx'|'pdf',from?:string,to?:string){
 const q=new URLSearchParams({format});if(from)q.set('from',from);if(to)q.set('to',to);
 fetch('/api/analytics/export?'+q,{credentials:'include'}).then(async response=>{if(!response.ok)throw new Error('Export failed');const blob=await response.blob();const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=`worksphere-reports.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}).catch(err=>alert(err.message));
}
