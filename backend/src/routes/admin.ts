import { Router } from 'express';
import { z } from 'zod';
import { db,asyncRoute,parse,HttpError,requirePermission,audit } from '../lib/core.js';
const r=Router();
const masterForm=z.object({code:z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),label:z.string().min(2).max(120),active:z.boolean().default(true),metadata:z.record(z.unknown()).default({})});
const categories=['TASK_CATEGORY','TASK_PRIORITY','TASK_STATUS','WORK_REPORT_STATUS','WORK_SHIFT','ATTENDANCE_POLICY','APPROVAL_WORKFLOW','NOTIFICATION_TEMPLATE','EMAIL_CONFIGURATION','CUSTOM_FIELD','REPORT_TEMPLATE','DOCUMENT_CATEGORY','APPLICATION_SETTING','EMPLOYMENT_TYPE','OFFICE_LOCATION'] as const;
r.get('/catalog',asyncRoute(async(req,res)=>{
 const [branches,departments,designations,teams,roles,leaveTypes,masters]=await Promise.all([
 db.branch.findMany({where:{organizationId:req.actor!.organizationId}}),db.department.findMany({where:{organizationId:req.actor!.organizationId}}),db.designation.findMany(),db.team.findMany({where:{organizationId:req.actor!.organizationId}}),db.role.findMany(),db.leaveType.findMany(),db.masterItem.findMany({where:{organizationId:req.actor!.organizationId},orderBy:[{category:'asc'},{label:'asc'}]})]);
 res.json({branches,departments,designations,teams,roles,leaveTypes,masters,categories});
}));
r.post('/master/:category',requirePermission('admin.manage'),asyncRoute(async(req,res)=>{
 const category=req.params.category.toUpperCase();const v=parse(masterForm,req.body);
 let record:any;
 switch(category){
 case 'BRANCH':record=await db.branch.create({data:{organizationId:req.actor!.organizationId,name:v.label,code:v.code,active:v.active}});break;
 case 'DEPARTMENT':record=await db.department.create({data:{organizationId:req.actor!.organizationId,name:v.label,code:v.code,active:v.active}});break;
 case 'DESIGNATION':record=await db.designation.create({data:{name:v.label,active:v.active}});break;
 case 'TEAM':record=await db.team.create({data:{organizationId:req.actor!.organizationId,name:v.label,active:v.active}});break;
 case 'LEAVE_TYPE':record=await db.leaveType.create({data:{code:v.code,name:v.label,active:v.active,daysPerYear:Number(v.metadata.daysPerYear)||12}});break;
 default:if(!categories.includes(category as typeof categories[number]))throw new HttpError(400,'Unknown master category');record=await db.masterItem.create({data:{organizationId:req.actor!.organizationId,category,...v,metadata:v.metadata as any}});
 }
 await audit(req.actor!.id,'MASTER_CREATE',category,record.id);res.status(201).json(record);
}));
r.patch('/master/:category/:id',requirePermission('admin.manage'),asyncRoute(async(req,res)=>{
 const category=req.params.category.toUpperCase();const v=parse(masterForm.partial(),req.body);const id=req.params.id;let record:any;
 switch(category){
 case 'BRANCH':record=await db.branch.update({where:{id},data:{name:v.label,code:v.code,active:v.active}});break;
 case 'DEPARTMENT':record=await db.department.update({where:{id},data:{name:v.label,code:v.code,active:v.active}});break;
 case 'DESIGNATION':record=await db.designation.update({where:{id},data:{name:v.label,active:v.active}});break;
 case 'TEAM':record=await db.team.update({where:{id},data:{name:v.label,active:v.active}});break;
 case 'LEAVE_TYPE':record=await db.leaveType.update({where:{id},data:{name:v.label,code:v.code,active:v.active,daysPerYear:v.metadata?.daysPerYear===undefined?undefined:Number(v.metadata.daysPerYear)}});break;
 default:{const old=await db.masterItem.findUnique({where:{id}});if(!old||old.organizationId!==req.actor!.organizationId||old.category!==category)throw new HttpError(404,'Master not found');record=await db.masterItem.update({where:{id},data:{...v,metadata:v.metadata as any}});}
 }
 await audit(req.actor!.id,'MASTER_UPDATE',category,id,v);res.json(record);
}));
r.get('/settings',asyncRoute(async(req,res)=>{
 const o=await db.organization.findUniqueOrThrow({where:{id:req.actor!.organizationId}});
 const settings=await db.setting.findMany({where:{organizationId:o.id}});
 res.json({organization:o,settings:Object.fromEntries(settings.map(s=>[s.key,s.value]))});
}));
r.patch('/settings',requirePermission('admin.manage'),asyncRoute(async(req,res)=>{
 const data=parse(z.object({organizationName:z.string().min(2).optional(),settings:z.record(z.unknown()).optional()}),req.body);
 const allow=['brandPrimary','brandSidebar','brandBackground','brandLogo','brandFavicon','reportNotifyHR','reportDeadline','timezone','workingDays','workingHours','dashboardWidgets','reportRequiredFields','reportTransitions','customFields','companyEmail','smtpFrom','notificationTemplates','leavePolicy','attendancePolicy','approvalWorkflow'];
 const rejected=Object.keys(data.settings||{}).filter(k=>!allow.includes(k));if(rejected.length)throw new HttpError(400,'Unsupported setting(s): '+rejected.join(', '));
 await db.$transaction(async(tx)=>{
  if(data.organizationName)await tx.organization.update({where:{id:req.actor!.organizationId},data:{name:data.organizationName}});
  for(const [key,value] of Object.entries(data.settings||{}))await tx.setting.upsert({where:{organizationId_key:{organizationId:req.actor!.organizationId,key}},create:{organizationId:req.actor!.organizationId,key,value:value as any},update:{value:value as any}});
 });await audit(req.actor!.id,'SETTINGS_CHANGE','organization',req.actor!.organizationId,Object.keys(data.settings||{}));res.json({ok:true});
}));
r.get('/roles',requirePermission('admin.manage'),asyncRoute(async(_req,res)=>{
 res.json(await db.role.findMany({include:{permissions:{include:{permission:true}}},orderBy:{name:'asc'}}));
}));
r.get('/permissions',requirePermission('admin.manage'),asyncRoute(async(_req,res)=>res.json(await db.permission.findMany({orderBy:{code:'asc'}}))));
r.post('/roles',requirePermission('admin.manage'),asyncRoute(async(req,res)=>{
 const v=parse(z.object({code:z.string().regex(/^[A-Z_]+$/),name:z.string().min(2),permissionCodes:z.array(z.string())}),req.body);
 const ps=await db.permission.findMany({where:{code:{in:v.permissionCodes}}});if(ps.length!==new Set(v.permissionCodes).size)throw new HttpError(400,'Unknown permission');
 const role=await db.role.create({data:{code:v.code,name:v.name,permissions:{create:ps.map(p=>({permissionId:p.id}))}}});await audit(req.actor!.id,'CREATE','role',role.id);res.status(201).json(role);
}));
r.put('/roles/:id/permissions',requirePermission('admin.manage'),asyncRoute(async(req,res)=>{
 const v=parse(z.object({permissionCodes:z.array(z.string())}),req.body);const role=await db.role.findUnique({where:{id:req.params.id}});if(!role)throw new HttpError(404,'Role not found');if(role.code==='SUPER_ADMIN')throw new HttpError(403,'Super Admin permissions cannot be modified');
 const ps=await db.permission.findMany({where:{code:{in:v.permissionCodes}}});if(ps.length!==new Set(v.permissionCodes).size)throw new HttpError(400,'Unknown permission');
 await db.$transaction(async(tx)=>{await tx.rolePermission.deleteMany({where:{roleId:role.id}});await tx.rolePermission.createMany({data:ps.map(p=>({roleId:role.id,permissionId:p.id}))});});await audit(req.actor!.id,'UPDATE_PERMISSIONS','role',role.id,v);res.json({ok:true});
}));
r.get('/audit',requirePermission('admin.manage'),asyncRoute(async(_req,res)=>res.json(await db.auditLog.findMany({include:{actor:{select:{name:true}}},orderBy:{createdAt:'desc'},take:250}))));
export default r;
