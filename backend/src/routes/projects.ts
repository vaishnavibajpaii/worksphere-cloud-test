import { Router } from 'express';
import { z } from 'zod';
import { db,asyncRoute,parse,HttpError,requirePermission,audit } from '../lib/core.js';
const r=Router();
const form=z.object({name:z.string().min(2),code:z.string().min(2),description:z.string().default(''),status:z.string().default('ACTIVE'),ownerId:z.string(),startsAt:z.string().nullable().optional(),endsAt:z.string().nullable().optional()});
r.get('/',asyncRoute(async(req,res)=>{
 const data=await db.project.findMany({where:{organizationId:req.actor!.organizationId},include:{owner:{select:{name:true}},_count:{select:{tasks:true}}},orderBy:{createdAt:'desc'}});res.json(data);
}));
r.post('/',requirePermission('projects.manage'),asyncRoute(async(req,res)=>{
 const v=parse(form,req.body);const owner=await db.user.findUnique({where:{id:v.ownerId}});if(!owner||owner.organizationId!==req.actor!.organizationId)throw new HttpError(400,'Invalid project owner');
 const {startsAt,endsAt,...rest}=v;const x=await db.project.create({data:{...rest,organizationId:req.actor!.organizationId,startsAt:startsAt?new Date(startsAt):null,endsAt:endsAt?new Date(endsAt):null}});await audit(req.actor!.id,'CREATE','project',x.id);res.status(201).json(x);
}));
r.patch('/:id',requirePermission('projects.manage'),asyncRoute(async(req,res)=>{
 const project=await db.project.findUnique({where:{id:req.params.id}});if(!project||project.organizationId!==req.actor!.organizationId)throw new HttpError(404,'Not found');
 const v=parse(form.partial(),req.body);const {startsAt,endsAt,...rest}=v;const x=await db.project.update({where:{id:project.id},data:{...rest,startsAt:startsAt===undefined?undefined:startsAt?new Date(startsAt):null,endsAt:endsAt===undefined?undefined:endsAt?new Date(endsAt):null}});await audit(req.actor!.id,'UPDATE','project',project.id);res.json(x);
}));
export default r;
