import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { db,asyncRoute,parse,HttpError,safeUser,scopedUserIds,requirePermission,audit,requireScope } from '../lib/core.js';
const r=Router();
const userSchema=z.object({name:z.string().min(2),email:z.string().email(),employeeCode:z.string().min(2),password:z.string().min(12),primaryRole:z.string().default('EMPLOYEE'),departmentId:z.string().nullable().optional(),designationId:z.string().nullable().optional(),teamId:z.string().nullable().optional(),branchId:z.string().nullable().optional(),managerId:z.string().nullable().optional(),phone:z.string().optional()});
r.get('/',asyncRoute(async(req,res)=>{
 const ids=await scopedUserIds(req.actor!);
 const where:any={organizationId:req.actor!.organizationId,id:ids?{in:ids}:undefined};
 const users=await db.user.findMany({where,select:{...safeUser,department:true,designation:true,team:true},orderBy:{name:'asc'},take:300});res.json(users);
}));
r.post('/',requirePermission('employees.manage'),asyncRoute(async(req,res)=>{
 const v=parse(userSchema,req.body);if(v.primaryRole==='SUPER_ADMIN'&&!req.actor!.permissions.includes('*'))throw new HttpError(403,'Only a Super Admin may assign that role');if(v.managerId) await requireScope(req.actor!,v.managerId);
 const role=await db.role.findUnique({where:{code:v.primaryRole}});if(!role) throw new HttpError(400,'Invalid role');
 const {password,...data}=v;
 const user=await db.user.create({data:{...data,email:data.email.toLowerCase(),organizationId:req.actor!.organizationId,passwordHash:await argon2.hash(password,{type:argon2.argon2id}),roles:{create:{roleId:role.id}}},select:safeUser});
 await audit(req.actor!.id,'CREATE','user',user.id);res.status(201).json(user);
}));
r.patch('/:id',requirePermission('employees.manage'),asyncRoute(async(req,res)=>{
 const v=parse(userSchema.omit({password:true}).partial().extend({active:z.boolean().optional()}),req.body);if(v.primaryRole==='SUPER_ADMIN'&&!req.actor!.permissions.includes('*'))throw new HttpError(403,'Only a Super Admin may assign that role');
 const original=await db.user.findUnique({where:{id:req.params.id}});if(!original||original.organizationId!==req.actor!.organizationId) throw new HttpError(404,'User not found');
 if(v.managerId===req.params.id) throw new HttpError(400,'Self-reporting not permitted');
 if(v.primaryRole){const role=await db.role.findUnique({where:{code:v.primaryRole}});if(!role) throw new HttpError(400,'Invalid role');await db.userRole.deleteMany({where:{userId:original.id}});await db.userRole.create({data:{userId:original.id,roleId:role.id}});}
 const u=await db.user.update({where:{id:original.id},data:{...v,email:v.email?.toLowerCase()},select:safeUser});
 if(v.active===false) await db.authSession.updateMany({where:{userId:u.id},data:{revokedAt:new Date()}});
 await audit(req.actor!.id,'UPDATE','user',u.id,v);res.json(u);
}));
r.get('/organization',asyncRoute(async(req,res)=>{
 const o=await db.organization.findUniqueOrThrow({where:{id:req.actor!.organizationId}});res.json(o);
}));
export default r;
