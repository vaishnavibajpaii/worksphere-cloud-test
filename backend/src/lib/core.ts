import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'node:path';
// npm workspaces run backend scripts with backend/ as cwd; env lives at project root.
dotenv.config({path:path.resolve(process.cwd(),'../.env')});
dotenv.config();
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z, ZodError } from 'zod';

export const db = new PrismaClient();
export const ACCESS_MS = 15 * 60 * 1000;
export const REFRESH_MS = 7 * 24 * 3600 * 1000;
export const secret = process.env.JWT_SECRET || '';
export const hashToken = (s:string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = () => crypto.randomBytes(36).toString('base64url');
export const day = (d: string | Date = new Date()) => { const s = d instanceof Date ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(d) : d.slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400,'Invalid date'); return new Date(s+'T00:00:00.000Z'); };
export class HttpError extends Error { constructor(public status:number, message:string) { super(message); } }
export const asyncRoute = (fn:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>) => (req:Request,res:Response,next:NextFunction) => { Promise.resolve(fn(req,res,next)).catch(next); };
export const parse = <T extends z.ZodTypeAny>(schema:T,value:unknown):z.infer<T> => schema.parse(value);
export const audit = async (actorId:string | null, action:string, entity:string, entityId?:string, detail?:unknown) => { await db.auditLog.create({data:{actorId,action,entity,entityId,detail:(detail ?? undefined) as any}}); };
export const notify = async (ids:string[], title:string,body:string,link?:string) => { if(!ids.length) return; await db.notification.createMany({data:[...new Set(ids)].map(userId=>({userId,title,body,link}))}); };
export const safeUser = {id:true,name:true,email:true,employeeCode:true,primaryRole:true,active:true,departmentId:true,designationId:true,teamId:true,branchId:true,managerId:true,joinedAt:true,phone:true,avatarUrl:true} as const;
export type SessionUser = {id:string; organizationId:string; name:string; primaryRole:string; managerId:string|null; active:boolean; permissions:string[]};
declare global { namespace Express { interface Request { actor?:SessionUser } } }
export const signAccess = (userId:string,sessionId:string) => jwt.sign({sub:userId,sid:sessionId},secret,{expiresIn:'15m',issuer:'worksphere'});
export const getPermissions = async (userId:string) => {const roles=await db.userRole.findMany({where:{userId},include:{role:{include:{permissions:{include:{permission:true}}}}}});return [...new Set(roles.flatMap(r=>r.role.permissions.map(p=>p.permission.code)))];};
export const auth = asyncRoute(async(req,res,next)=>{
 const token = req.cookies?.ws_access || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);
 if(!token) throw new HttpError(401,'Please sign in');
 let payload:any;
 try { payload = jwt.verify(token,secret,{issuer:'worksphere'}); } catch { throw new HttpError(401,'Session expired'); }
 if(typeof payload.sub!=='string'||typeof payload.sid!=='string') throw new HttpError(401,'Invalid session');
 const [user,session]=await Promise.all([db.user.findUnique({where:{id:payload.sub}}),db.authSession.findUnique({where:{id:payload.sid}})]);
 if(!user?.active || !session || session.userId!==user.id || session.revokedAt || session.expiresAt < new Date()) throw new HttpError(401,'Session revoked');
 req.actor={id:user.id,organizationId:user.organizationId,name:user.name,primaryRole:user.primaryRole,managerId:user.managerId,active:user.active,permissions:await getPermissions(user.id)};
 next();
});
export const requirePermission=(code:string) => (req:Request,_res:Response,next:NextFunction)=>{
 if(!req.actor?.permissions.includes(code) && !req.actor?.permissions.includes('*')) return next(new HttpError(403,'Insufficient permission'));
 next();
};
export const isAdmin=(a:SessionUser) => a.permissions.includes('*');
export const isHR=(a:SessionUser) => isAdmin(a) || a.permissions.includes('employees.manage');
export const isManager=(a:SessionUser) => isHR(a) || a.permissions.includes('reports.review');
export const manages = async(actor:SessionUser,employeeId:string)=>{
 if(isHR(actor)) return true;
 if(actor.id===employeeId) return true;
 const employee=await db.user.findUnique({where:{id:employeeId},select:{managerId:true}});
 if(employee?.managerId===actor.id) return true;
 // Team leads can manage members of the same team when permitted.
 if(actor.permissions.includes('team.manage')) {
  const [lead,target]=await Promise.all([db.user.findUnique({where:{id:actor.id},select:{teamId:true}}),db.user.findUnique({where:{id:employeeId},select:{teamId:true}})]);
  return !!lead?.teamId && lead.teamId===target?.teamId;
 }
 return false;
};
export const requireScope=async(actor:SessionUser,id:string)=>{if(!await manages(actor,id)) throw new HttpError(403,'Employee is outside your reporting scope');};
export const scopedUserIds=async(actor:SessionUser):Promise<string[]|undefined> => {
 if(isHR(actor)) return undefined;
 if(!isManager(actor) && !actor.permissions.includes('team.manage')) return [actor.id];
 const people=await db.user.findMany({where:{organizationId:actor.organizationId},select:{id:true,managerId:true,teamId:true}});
 const ownTeam=people.find(p=>p.id===actor.id)?.teamId;
 return people.filter(p=>p.id===actor.id || p.managerId===actor.id || (actor.permissions.includes('team.manage') && !!ownTeam && p.teamId===ownTeam)).map(p=>p.id);
};
export const csrf = (req:Request,_res:Response,next:NextFunction)=>{
 if(['GET','HEAD','OPTIONS'].includes(req.method) || req.path.startsWith('/auth/login') || req.path.startsWith('/auth/refresh') || req.path.startsWith('/auth/reset') || req.path.startsWith('/auth/forgot-password')) return next();
 if(!req.cookies?.ws_csrf || req.get('x-csrf-token')!==req.cookies.ws_csrf) return next(new HttpError(403,'CSRF check failed'));
 next();
};
export const errorHandler = (err:any,_req:Request,res:Response,_next:NextFunction)=>{
 if(err instanceof ZodError) return res.status(400).json({error:'Validation failed',issues:err.issues.map(i=>({field:i.path.join('.'),message:i.message}))});
 if(err?.code==='P2002') return res.status(409).json({error:'A record with this value already exists'});
 if(err?.code==='P2025') return res.status(404).json({error:'Record not found'});
 const status=err instanceof HttpError ? err.status : 500;
 if(status===500) console.error(err);
 return res.status(status).json({error:status===500?'Unexpected server error':err.message});
};
export const formatDate=(dt:Date)=>dt.toISOString().slice(0,10);
