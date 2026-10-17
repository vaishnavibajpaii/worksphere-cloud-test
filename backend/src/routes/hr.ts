import { Router } from 'express';
import { z } from 'zod';
import { db,asyncRoute,parse,HttpError,day,scopedUserIds,requirePermission,requireScope,audit,notify } from '../lib/core.js';
const r=Router();
r.get('/attendance',asyncRoute(async(req,res)=>{
 const ids=await scopedUserIds(req.actor!);const rows=await db.attendanceRecord.findMany({where:{userId:ids?{in:ids}:undefined},include:{user:{select:{name:true,employeeCode:true}}},orderBy:{date:'desc'},take:300});res.json(rows);
}));
r.post('/attendance/check',asyncRoute(async(req,res)=>{
 const {type}=parse(z.object({type:z.enum(['in','out'])}),req.body);const date=day();const old=await db.attendanceRecord.findUnique({where:{userId_date:{userId:req.actor!.id,date}}});
 if(type==='in'&&old?.checkIn)throw new HttpError(409,'Already checked in');if(type==='out'&&(!old?.checkIn||old.checkOut))throw new HttpError(409,'Check in first or you have already checked out');
 const row=await db.attendanceRecord.upsert({where:{userId_date:{userId:req.actor!.id,date}},create:{userId:req.actor!.id,date,checkIn:type==='in'?new Date():undefined},update:type==='out'?{checkOut:new Date()}:{checkIn:new Date()}});
 await audit(req.actor!.id,'ATTENDANCE_'+type.toUpperCase(),'attendance',row.id);res.json(row);
}));
r.patch('/attendance/:id',requirePermission('attendance.manage'),asyncRoute(async(req,res)=>{
 const {status,note}=parse(z.object({status:z.enum(['PRESENT','ABSENT','HALF_DAY','LEAVE']),note:z.string().min(3)}),req.body);
 const record=await db.attendanceRecord.findUnique({where:{id:req.params.id}});if(!record)throw new HttpError(404,'Not found');await requireScope(req.actor!,record.userId);
 const row=await db.attendanceRecord.update({where:{id:record.id},data:{status,note}});await audit(req.actor!.id,'CORRECT_ATTENDANCE','attendance',record.id,{status,note});res.json(row);
}));
r.get('/leave/types',asyncRoute(async(_req,res)=>res.json(await db.leaveType.findMany({where:{active:true},orderBy:{name:'asc'}}))));
r.get('/leave/balances',asyncRoute(async(req,res)=>{
 const userId=typeof req.query.userId==='string'?req.query.userId:req.actor!.id;await requireScope(req.actor!,userId);
 res.json(await db.leaveBalance.findMany({where:{userId,year:new Date().getFullYear()},include:{type:true}}));
}));
r.get('/leave',asyncRoute(async(req,res)=>{
 const ids=await scopedUserIds(req.actor!);res.json(await db.leaveRequest.findMany({where:{userId:ids?{in:ids}:undefined},include:{user:{select:{id:true,name:true}},type:true},orderBy:{createdAt:'desc'},take:300}));
}));
r.post('/leave',asyncRoute(async(req,res)=>{
 const v=parse(z.object({typeId:z.string(),startDate:z.string(),endDate:z.string(),reason:z.string().min(3)}),req.body);
 const startDate=day(v.startDate),endDate=day(v.endDate);const days=Math.round((endDate.getTime()-startDate.getTime())/86400000)+1;
 if(days<1||days>90)throw new HttpError(400,'Leave period must be 1–90 days');if(startDate.getUTCFullYear()!==endDate.getUTCFullYear())throw new HttpError(400,'Submit separate requests for different calendar years');
 const type=await db.leaveType.findUnique({where:{id:v.typeId}});if(!type?.active)throw new HttpError(400,'Invalid leave type');
 const overlaps=await db.leaveRequest.count({where:{userId:req.actor!.id,status:{in:['PENDING','APPROVED']},startDate:{lte:endDate},endDate:{gte:startDate}}});if(overlaps)throw new HttpError(409,'Overlapping leave request exists');
 const x=await db.leaveRequest.create({data:{userId:req.actor!.id,typeId:v.typeId,startDate,endDate,days,reason:v.reason}});
 const me=await db.user.findUnique({where:{id:req.actor!.id},select:{name:true,managerId:true}});
 if(me?.managerId)await notify([me.managerId],'Leave approval needed',`${me.name} requested ${days} day(s) of leave`,'/leave');await audit(req.actor!.id,'APPLY','leave',x.id);res.status(201).json(x);
}));
r.post('/leave/:id/review',requirePermission('leave.review'),asyncRoute(async(req,res)=>{
 const v=parse(z.object({status:z.enum(['APPROVED','REJECTED']),comment:z.string().default('')}),req.body);
 const old=await db.leaveRequest.findUnique({where:{id:req.params.id}});if(!old)throw new HttpError(404,'Not found');if(old.userId===req.actor!.id)throw new HttpError(403,'You cannot approve your own leave');await requireScope(req.actor!,old.userId);
 if(old.status!=='PENDING')throw new HttpError(409,'Request already decided');
 if(v.status==='REJECTED'&&!v.comment.trim())throw new HttpError(400,'Rejection reason required');
 const row=await db.$transaction(async(tx)=>{
  if(v.status==='APPROVED'){
   const type=await tx.leaveType.findUniqueOrThrow({where:{id:old.typeId}});
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${old.userId + old.typeId + old.startDate.getUTCFullYear()}))`;
   const bal=await tx.leaveBalance.upsert({where:{userId_typeId_year:{userId:old.userId,typeId:old.typeId,year:old.startDate.getUTCFullYear()}},create:{userId:old.userId,typeId:old.typeId,year:old.startDate.getUTCFullYear(),allotted:type.daysPerYear,used:0},update:{}});
   if(bal.used+old.days>bal.allotted)throw new HttpError(409,'Insufficient leave balance');
   await tx.leaveBalance.update({where:{id:bal.id},data:{used:{increment:old.days}}});
  }
  return tx.leaveRequest.update({where:{id:old.id},data:{status:v.status,reviewedById:req.actor!.id,reviewComment:v.comment}});
 });await audit(req.actor!.id,v.status,'leave',row.id);await notify([old.userId],'Leave request reviewed',`Your leave was ${v.status.toLowerCase()}`,'/leave');res.json(row);
}));
r.get('/holidays',asyncRoute(async(_req,res)=>res.json(await db.holiday.findMany({orderBy:{date:'asc'}}))));
r.post('/holidays',requirePermission('attendance.manage'),asyncRoute(async(req,res)=>{
 const v=parse(z.object({name:z.string().min(2),date:z.string()}),req.body);const x=await db.holiday.create({data:{name:v.name,date:day(v.date)}});res.status(201).json(x);
}));
export default r;
