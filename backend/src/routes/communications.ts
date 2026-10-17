import { Router } from 'express';
import { z } from 'zod';
import { db,asyncRoute,parse,HttpError,requirePermission,notify,audit } from '../lib/core.js';
const r=Router();
r.get('/notifications',asyncRoute(async(req,res)=>res.json(await db.notification.findMany({where:{userId:req.actor!.id},orderBy:{createdAt:'desc'},take:80}))));
r.post('/notifications/:id/read',asyncRoute(async(req,res)=>{
 const result=await db.notification.updateMany({where:{id:req.params.id,userId:req.actor!.id},data:{readAt:new Date()}});if(!result.count)throw new HttpError(404,'Not found');res.json({ok:true});
}));
r.post('/notifications/read-all',asyncRoute(async(req,res)=>{await db.notification.updateMany({where:{userId:req.actor!.id,readAt:null},data:{readAt:new Date()}});res.json({ok:true});}));
r.get('/announcements',asyncRoute(async(req,res)=>{
 const rows=await db.announcement.findMany({where:{OR:[{audience:'ALL'},{audience:req.actor!.primaryRole}]},orderBy:{createdAt:'desc'},take:100});res.json(rows);
}));
r.post('/announcements',requirePermission('announcements.manage'),asyncRoute(async(req,res)=>{
 const v=parse(z.object({title:z.string().min(3),body:z.string().min(3),audience:z.string().default('ALL')}),req.body);
 const notice=await db.announcement.create({data:{...v,authorId:req.actor!.id}});
 const users=await db.user.findMany({where:{organizationId:req.actor!.organizationId,active:true,primaryRole:v.audience==='ALL'?undefined:v.audience},select:{id:true}});
 await notify(users.map(u=>u.id),'Company announcement',v.title,'/announcements');await audit(req.actor!.id,'PUBLISH','announcement',notice.id);res.status(201).json(notice);
}));
export default r;
