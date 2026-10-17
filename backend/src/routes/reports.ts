import { Router } from 'express';
import {canEditReport,canSubmitReport,canReviewReport,calculateMinutes} from '../lib/workflow.js';
import { z } from 'zod';
import { db,asyncRoute,parse,HttpError,day,formatDate,scopedUserIds,requireScope,requirePermission,notify,audit,isHR } from '../lib/core.js';
const r=Router();
const entry=z.object({taskId:z.string().nullable().optional(),title:z.string().min(2),description:z.string().default(''),completed:z.string().default(''),inProgress:z.string().default(''),pending:z.string().default(''),blocker:z.string().default(''),priority:z.string().default('MEDIUM'),minutes:z.number().int().min(0).max(1440),progress:z.number().int().min(0).max(100),attachmentIds:z.array(z.string()).default([])});
const form=z.object({date:z.string(),remarks:z.string().default(''),nextDayPlan:z.string().default(''),entries:z.array(entry).min(1).max(30)});
const include={employee:{select:{id:true,name:true,employeeCode:true,managerId:true,department:{select:{name:true}}}},entries:true,reviews:{include:{reviewer:{select:{name:true}}},orderBy:{createdAt:'desc' as const}}};
r.get('/',asyncRoute(async(req,res)=>{
 const ids=await scopedUserIds(req.actor!);
 const status=typeof req.query.status==='string' ? req.query.status:undefined;
 const where:any={employeeId:ids?{in:ids}:undefined,status:status||undefined};
 if(req.query.from)where.date={...where.date,gte:day(String(req.query.from))};
 if(req.query.to)where.date={...where.date,lte:day(String(req.query.to))};
 const records=await db.dailyWorkReport.findMany({where,include,orderBy:[{date:'desc'},{updatedAt:'desc'}],take:250});res.json(records);
}));
r.get('/missing',requirePermission('reports.review'),asyncRoute(async(req,res)=>{
 const date=day(String(req.query.date||new Date().toISOString().slice(0,10)));
 const ids=await scopedUserIds(req.actor!);
 const employees=await db.user.findMany({where:{active:true,id:ids?{in:ids}:undefined,organizationId:req.actor!.organizationId},select:{id:true,name:true,employeeCode:true}});
 const reports=await db.dailyWorkReport.findMany({where:{date,employeeId:{in:employees.map(e=>e.id)}},select:{employeeId:true}});
 const submitted=new Set(reports.map(r=>r.employeeId));res.json(employees.filter(e=>!submitted.has(e.id)));
}));
r.post('/',asyncRoute(async(req,res)=>{
 const v=parse(form,req.body);const date=day(v.date);
 const attachmentIds=[...new Set(v.entries.flatMap(x=>x.attachmentIds))];
 if(attachmentIds.length){const files=await db.fileMetadata.count({where:{id:{in:attachmentIds},ownerId:req.actor!.id}});if(files!==attachmentIds.length)throw new HttpError(403,'One or more attachments do not belong to you');}
 const validTasks=v.entries.filter(x=>x.taskId).map(x=>x.taskId!);
 if(validTasks.length){const tasks=await db.taskAssignment.findMany({where:{userId:req.actor!.id,taskId:{in:validTasks}}});if(new Set(tasks.map(t=>t.taskId)).size!==new Set(validTasks).size)throw new HttpError(403,'One or more tasks are not assigned to you');}
 const old=await db.dailyWorkReport.findUnique({where:{employeeId_date:{employeeId:req.actor!.id,date}},include:{entries:true}});
 if(old && !canEditReport(old.status)) throw new HttpError(409,'Report is locked; only drafts or returned reports can be edited');
 let count:number;try{count=calculateMinutes(v.entries)}catch{throw new HttpError(400,'Total reported time cannot exceed 24 hours')}
 const result=await db.$transaction(async(tx)=>{
  const report=old?await tx.dailyWorkReport.update({where:{id:old.id},data:{remarks:v.remarks,nextDayPlan:v.nextDayPlan,totalMinutes:count,currentVersion:{increment:1},status:'DRAFT'}}):await tx.dailyWorkReport.create({data:{employeeId:req.actor!.id,date,remarks:v.remarks,nextDayPlan:v.nextDayPlan,totalMinutes:count}});
  if(old)await tx.dailyReportEntry.deleteMany({where:{reportId:report.id}});
  await tx.dailyReportEntry.createMany({data:v.entries.map(e=>({...e,taskId:e.taskId||null,attachmentIds:e.attachmentIds,reportId:report.id}))});
  await tx.reportVersion.create({data:{reportId:report.id,version:report.currentVersion,snapshot:v as any}});
  return report;
 });await audit(req.actor!.id,'SAVE_DRAFT','report',result.id);res.status(old?200:201).json(result);
}));
r.post('/:id/submit',asyncRoute(async(req,res)=>{
 const report=await db.dailyWorkReport.findUnique({where:{id:req.params.id},include:{employee:true,entries:true}});
 if(!report||report.employeeId!==req.actor!.id) throw new HttpError(404,'Report not found');
 if(!canSubmitReport(report.status,report.entries.length))throw new HttpError(409,'Report must be a nonempty draft to submit');
 const updated=await db.dailyWorkReport.update({where:{id:report.id},data:{status:'SUBMITTED',submittedAt:new Date()}});
 const recipients=[report.employee.managerId].filter((x):x is string=>!!x);
 const hrSetting=await db.setting.findUnique({where:{organizationId_key:{organizationId:req.actor!.organizationId,key:'reportNotifyHR'}}});
 if(hrSetting?.value===true){const hrs=await db.user.findMany({where:{organizationId:req.actor!.organizationId,primaryRole:'HR_ADMIN',active:true},select:{id:true}});recipients.push(...hrs.map(x=>x.id));}
 await notify(recipients,'Work report submitted',`${report.employee.name} submitted ${formatDate(report.date)}`,'/reports');
 await audit(req.actor!.id,'SUBMIT','report',report.id);res.json(updated);
}));
r.post('/:id/review',requirePermission('reports.review'),asyncRoute(async(req,res)=>{
 const {action,comment}=parse(z.object({action:z.enum(['APPROVED','CHANGES_REQUESTED','REJECTED','UNDER_REVIEW','ESCALATED']),comment:z.string().max(3000).default('')}),req.body);
 const report=await db.dailyWorkReport.findUnique({where:{id:req.params.id},include:{employee:true}});
 if(!report) throw new HttpError(404,'Report not found');if(report.employeeId===req.actor!.id)throw new HttpError(403,'You cannot approve your own work report');await requireScope(req.actor!,report.employeeId);
 if(!canReviewReport(report.status,action,comment)) throw new HttpError(409,'Invalid report transition or missing review reason');
 const updated=await db.$transaction(async(tx)=>{
  const value=await tx.dailyWorkReport.update({where:{id:report.id},data:{status:action,approvedAt:action==='APPROVED'?new Date():null}});
  await tx.dailyReportReview.create({data:{reportId:report.id,reviewerId:req.actor!.id,action,comment}});return value;
 });
 await notify([report.employeeId],'Work report reviewed',`Your ${formatDate(report.date)} report: ${action.replace(/_/g,' ').toLowerCase()}`,'/reports');
 await audit(req.actor!.id,'REVIEW','report',report.id,{action,comment});res.json(updated);
}));
r.post('/:id/reopen',requirePermission('admin.manage'),asyncRoute(async(req,res)=>{
 const report=await db.dailyWorkReport.findUnique({where:{id:req.params.id}});
 if(!report)throw new HttpError(404,'Not found');if(report.status!=='APPROVED')throw new HttpError(409,'Only approved reports require reopening');
 const updated=await db.dailyWorkReport.update({where:{id:report.id},data:{status:'CHANGES_REQUESTED',approvedAt:null}});
 await audit(req.actor!.id,'REOPEN_APPROVED','report',report.id,req.body);await notify([report.employeeId],'Report reopened','An administrator reopened your approved report','/reports');res.json(updated);
}));
r.get('/:id/history',asyncRoute(async(req,res)=>{
 const report=await db.dailyWorkReport.findUnique({where:{id:req.params.id}});if(!report)throw new HttpError(404,'Not found');await requireScope(req.actor!,report.employeeId);
 res.json(await db.reportVersion.findMany({where:{reportId:report.id},orderBy:{version:'desc'}}));
}));
export default r;
