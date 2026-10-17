import { Router } from 'express';
import { z } from 'zod';
import { db,asyncRoute,parse,HttpError,requirePermission,requireScope,scopedUserIds,notify,audit } from '../lib/core.js';
const r=Router();
const schema=z.object({title:z.string().min(3),description:z.string().default(''),projectId:z.string().nullable().optional(),priority:z.string().default('MEDIUM'),status:z.string().default('TODO'),dueAt:z.string().nullable().optional(),assigneeIds:z.array(z.string()).min(1),progress:z.number().int().min(0).max(100).default(0)});
const include={assignments:{include:{user:{select:{id:true,name:true}}}},project:{select:{id:true,name:true}},comments:{include:{author:{select:{name:true}}},orderBy:{createdAt:'desc' as const},take:10}};
r.get('/',asyncRoute(async(req,res)=>{
 const ids=await scopedUserIds(req.actor!);
 const records=await db.task.findMany({where:{assignments:ids?{some:{userId:{in:ids}}}:undefined},include,orderBy:[{dueAt:'asc'},{createdAt:'desc'}],take:300});res.json(records);
}));
r.post('/',requirePermission('tasks.assign'),asyncRoute(async(req,res)=>{
 const v=parse(schema,req.body);for(const id of v.assigneeIds)await requireScope(req.actor!,id);
 if(v.projectId){const p=await db.project.findUnique({where:{id:v.projectId}});if(!p||p.organizationId!==req.actor!.organizationId)throw new HttpError(404,'Project not found');}
 const {assigneeIds,dueAt,...data}=v;
 const task=await db.task.create({data:{...data,dueAt:dueAt?new Date(dueAt):null,createdById:req.actor!.id,assignments:{create:assigneeIds.map(userId=>({userId}))}},include});
 await notify(assigneeIds,'New task assigned',task.title,'/tasks');await audit(req.actor!.id,'CREATE','task',task.id);res.status(201).json(task);
}));
r.patch('/:id',asyncRoute(async(req,res)=>{
 const task=await db.task.findUnique({where:{id:req.params.id},include:{assignments:true}});
 if(!task)throw new HttpError(404,'Task not found');
 const mine=task.assignments.some(x=>x.userId===req.actor!.id),canManage=req.actor!.permissions.includes('tasks.assign')||req.actor!.permissions.includes('*');
 if(!mine&&!canManage)throw new HttpError(403,'Task not assigned to you');
 if(canManage)for(const assignment of task.assignments)await requireScope(req.actor!,assignment.userId);
 const v=parse(schema.partial(),req.body);
 if(!canManage && Object.keys(v).some(k=>!['status','progress'].includes(k)))throw new HttpError(403,'Employees may only update status and progress');
 if(v.assigneeIds && canManage)for(const id of v.assigneeIds)await requireScope(req.actor!,id);
 const {assigneeIds,dueAt,...data}=v;
 const updated=await db.task.update({where:{id:task.id},data:{...data,dueAt:dueAt===undefined?undefined:dueAt?new Date(dueAt):null,assignments:assigneeIds?{deleteMany:{},create:assigneeIds.map(userId=>({userId}))}:undefined},include});
 await audit(req.actor!.id,'UPDATE','task',task.id,v);res.json(updated);
}));
r.post('/:id/comment',asyncRoute(async(req,res)=>{
 const {message}=parse(z.object({message:z.string().min(1).max(2000)}),req.body);
 const task=await db.task.findUnique({where:{id:req.params.id},include:{assignments:true}});if(!task)throw new HttpError(404,'Not found');
 if(!task.assignments.some(a=>a.userId===req.actor!.id)){if(!req.actor!.permissions.includes('tasks.assign')&&!req.actor!.permissions.includes('*'))throw new HttpError(403,'Not assigned');for(const assignment of task.assignments)await requireScope(req.actor!,assignment.userId);}
 const c=await db.taskComment.create({data:{taskId:task.id,authorId:req.actor!.id,message}});res.status(201).json(c);
}));
r.post('/:id/time',asyncRoute(async(req,res)=>{
 const v=parse(z.object({minutes:z.number().int().min(1).max(1440),note:z.string().max(1000).default('')}),req.body);
 const assignment=await db.taskAssignment.findUnique({where:{taskId_userId:{taskId:req.params.id,userId:req.actor!.id}}});if(!assignment)throw new HttpError(403,'Not assigned');
 const log=await db.taskTimeLog.create({data:{taskId:req.params.id,userId:req.actor!.id,...v}});res.status(201).json(log);
}));
export default r;
