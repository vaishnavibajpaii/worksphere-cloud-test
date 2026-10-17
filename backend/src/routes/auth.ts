import { Router } from 'express';
import crypto from 'node:crypto';
import argon2 from 'argon2';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { db, asyncRoute, parse, HttpError, hashToken,randomToken,signAccess,ACCESS_MS,REFRESH_MS,auth,safeUser,getPermissions,audit } from '../lib/core.js';
const router=Router();
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false});
const prod=process.env.NODE_ENV==='production';
const setCookies=(res:any,userId:string,sessionId:string,refresh:string)=>{
 res.cookie('ws_access',signAccess(userId,sessionId),{httpOnly:true,secure:prod,sameSite:'lax',path:'/',maxAge:ACCESS_MS});
 res.cookie('ws_refresh',refresh,{httpOnly:true,secure:prod,sameSite:'lax',path:'/api/auth',maxAge:REFRESH_MS});
 const csrf=randomToken();res.cookie('ws_csrf',csrf,{httpOnly:false,secure:prod,sameSite:'lax',path:'/',maxAge:REFRESH_MS});
};
const clearCookies=(res:any)=>{res.clearCookie('ws_access',{path:'/'});res.clearCookie('ws_refresh',{path:'/api/auth'});res.clearCookie('ws_csrf',{path:'/'});};
router.post('/login',loginLimiter,asyncRoute(async(req,res)=>{
 const v=parse(z.object({email:z.string().email(),password:z.string().min(1)}),req.body);
 const user=await db.user.findUnique({where:{email:v.email.toLowerCase()},select:{...safeUser,passwordHash:true,organizationId:true}});
 if(!user || !user.active || !await argon2.verify(user.passwordHash,v.password)) throw new HttpError(401,'Invalid credentials');
 const refresh=randomToken();const s=await db.authSession.create({data:{userId:user.id,refreshHash:hashToken(refresh),expiresAt:new Date(Date.now()+REFRESH_MS)}});
 setCookies(res,user.id,s.id,refresh); await audit(user.id,'LOGIN','session',s.id);
 const {passwordHash:_,...profile}=user;res.json({user:{...profile,permissions:await getPermissions(user.id)}});
}));
router.post('/refresh',asyncRoute(async(req,res)=>{
 const token=req.cookies?.ws_refresh;if(!token) throw new HttpError(401,'No refresh token');
 const s=await db.authSession.findUnique({where:{refreshHash:hashToken(token)},include:{user:true}});
 if(!s || s.revokedAt || s.expiresAt < new Date() || !s.user.active) {clearCookies(res);throw new HttpError(401,'Session expired');}
 const nextToken=randomToken();await db.authSession.update({where:{id:s.id},data:{refreshHash:hashToken(nextToken)}});
 setCookies(res,s.userId,s.id,nextToken);res.json({ok:true});
}));
router.get('/me',auth,asyncRoute(async(req,res)=>{
 const u=await db.user.findUniqueOrThrow({where:{id:req.actor!.id},select:safeUser});res.json({...u,permissions:req.actor!.permissions});
}));
router.post('/logout',auth,asyncRoute(async(req,res)=>{
 const token=req.cookies.ws_refresh;if(token) await db.authSession.updateMany({where:{userId:req.actor!.id,refreshHash:hashToken(token)},data:{revokedAt:new Date()}});
 else await db.authSession.updateMany({where:{userId:req.actor!.id},data:{revokedAt:new Date()}});
 clearCookies(res);res.json({ok:true});
}));
router.post('/forgot-password',loginLimiter,asyncRoute(async(req,res)=>{
 const {email}=parse(z.object({email:z.string().email()}),req.body);
 const user=await db.user.findUnique({where:{email:email.toLowerCase()}});
 if(user?.active){
  const token=randomToken();await db.passwordReset.create({data:{userId:user.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+30*60*1000)}});
  const link=`${process.env.APP_ORIGIN || 'http://localhost:5173'}/reset-password?token=${encodeURIComponent(token)}`;
  if(process.env.SMTP_HOST){const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});await transport.sendMail({from:process.env.SMTP_FROM,to:user.email,subject:'Reset your WorkSphere password',text:`Reset your password using this link (expires in 30 minutes): ${link}`});}
  else if(!prod) console.info(`DEV ONLY reset link for ${user.email}: ${link}`);
 }
 res.json({message:'If the account exists, reset instructions have been sent.'});
}));
router.post('/reset-password',loginLimiter,asyncRoute(async(req,res)=>{
 const {token,password}=parse(z.object({token:z.string().min(20),password:z.string().min(12)}),req.body);
 const reset=await db.passwordReset.findUnique({where:{tokenHash:hashToken(token)}});
 if(!reset||reset.usedAt||reset.expiresAt<new Date()) throw new HttpError(400,'Reset link invalid or expired');
 const hash=await argon2.hash(password,{type:argon2.argon2id});
 await db.$transaction(async(tx)=>{await tx.passwordReset.update({where:{id:reset.id},data:{usedAt:new Date()}});await tx.user.update({where:{id:reset.userId},data:{passwordHash:hash}});await tx.authSession.updateMany({where:{userId:reset.userId},data:{revokedAt:new Date()}});});
 await audit(reset.userId,'PASSWORD_RESET','user',reset.userId);res.json({ok:true});
}));
export default router;
