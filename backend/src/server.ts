import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { db,auth,csrf,errorHandler,HttpError,asyncRoute,requireScope } from './lib/core.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import reportRoutes from './routes/reports.js';
import taskRoutes from './routes/tasks.js';
import projectRoutes from './routes/projects.js';
import hrRoutes from './routes/hr.js';
import adminRoutes from './routes/admin.js';
import commRoutes from './routes/communications.js';
import analyticsRoutes from './routes/analytics.js';

if(!process.env.JWT_SECRET || process.env.JWT_SECRET.length<48)throw new Error('Set a strong JWT_SECRET (48+ characters) in .env');
const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
app.use(helmet({crossOriginResourcePolicy:{policy:'same-site'}}));
app.use(cors({origin:process.env.APP_ORIGIN||'http://localhost:5173',credentials:true}));
app.use(express.json({limit:'512kb'}));app.use(cookieParser());app.use('/api',csrf);
app.get('/api/health',asyncRoute(async(_req,res)=>{await db.$queryRaw`SELECT 1`;res.json({ok:true,service:'worksphere-api'});}));
app.use('/api/auth',authRoutes);
app.use('/api/users',auth,userRoutes);
app.use('/api/reports',auth,reportRoutes);
app.use('/api/tasks',auth,taskRoutes);
app.use('/api/projects',auth,projectRoutes);
app.use('/api/hr',auth,hrRoutes);
app.use('/api/admin',auth,adminRoutes);
app.use('/api',auth,commRoutes);
app.use('/api/analytics',auth,analyticsRoutes);
const uploadDir=path.resolve(process.env.UPLOAD_DIR||'./uploads');fs.mkdirSync(uploadDir,{recursive:true});
const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(_req,_file,cb)=>cb(null,crypto.randomUUID())}),limits:{fileSize:5*1024*1024,files:1},fileFilter:(_req,file,cb)=>{if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.mimetype))return cb(new Error('Unsupported attachment type'));cb(null,true);}});
app.post('/api/files',auth,upload.single('file'),asyncRoute(async(req,res)=>{
 if(!req.file)throw new HttpError(400,'No file provided');
 // Avoid serving uploads as static assets; private access is mediated below.
 const file=await db.fileMetadata.create({data:{ownerId:req.actor!.id,originalName:path.basename(req.file.originalname).slice(0,200),contentType:req.file.mimetype,bytes:req.file.size,storageKey:req.file.filename}});res.status(201).json({id:file.id,name:file.originalName});
}));
app.get('/api/files/:id',auth,asyncRoute(async(req,res)=>{
 const file=await db.fileMetadata.findUnique({where:{id:req.params.id}});if(!file)throw new HttpError(404,'File missing');
 if(file.ownerId!==req.actor!.id){
  if(!req.actor!.permissions.includes('reports.review')&&!req.actor!.permissions.includes('*'))throw new HttpError(403,'No file access');
  const linked=await db.$queryRaw<Array<{employeeId:string}>>`SELECT r."employeeId" FROM "DailyReportEntry" e JOIN "DailyWorkReport" r ON e."reportId"=r.id WHERE e."attachmentIds" @> ${JSON.stringify([file.id])}::jsonb LIMIT 1`;
  if(!linked.length)throw new HttpError(403,'Attachment not attached to an accessible report');
  await requireScope(req.actor!,linked[0].employeeId);
 }
 const filename=path.join(uploadDir,path.basename(file.storageKey));if(!fs.existsSync(filename))throw new HttpError(404,'File unavailable');
 res.set('Content-Type',file.contentType).set('Content-Disposition',`attachment; filename="${file.id}"`).sendFile(filename);
}));
app.use('/api',(_req,_res,next)=>next(new HttpError(404,'API route not found')));
app.use(errorHandler);
const port=Number(process.env.API_PORT||4000);
app.listen(port,()=>console.info(`WorkSphere API listening on http://localhost:${port}`));
process.on('SIGINT',()=>db.$disconnect().finally(()=>process.exit(0)));
