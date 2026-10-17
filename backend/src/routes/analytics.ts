import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { db,asyncRoute,scopedUserIds,day } from '../lib/core.js';
const r=Router();
r.get('/summary',asyncRoute(async(req,res)=>{
 const ids=await scopedUserIds(req.actor!);const now=new Date();const today=day();const since=new Date(today.getTime()-6*86400000);
 const [taskRows,reportRows,employeeCount,pendingLeaves,todayAttendance]=await Promise.all([
 db.task.findMany({where:ids?{assignments:{some:{userId:{in:ids}}}}:{},select:{status:true,dueAt:true,progress:true,assignments:true}}),
 db.dailyWorkReport.findMany({where:{employeeId:ids?{in:ids}:undefined,date:{gte:since,lte:today}},select:{status:true,date:true,totalMinutes:true}}),
 db.user.count({where:{active:true,organizationId:req.actor!.organizationId,id:ids?{in:ids}:undefined}}),
 db.leaveRequest.count({where:{status:'PENDING',userId:ids?{in:ids}:undefined}}),
 db.attendanceRecord.count({where:{date:today,checkIn:{not:null},userId:ids?{in:ids}:undefined}})
 ]);
 const completed=taskRows.filter(t=>t.status==='DONE').length;
 const overdue=taskRows.filter(t=>t.dueAt&&t.dueAt<now&&t.status!=='DONE').length;
 const chart=Array.from({length:7},(_,i)=>{const date=new Date(since.getTime()+i*86400000).toISOString().slice(0,10);const items=reportRows.filter(x=>x.date.toISOString().slice(0,10)===date);return {date:date.slice(5),reports:items.filter(i=>i.status!=='DRAFT').length,hours:Math.round(items.reduce((s,i)=>s+i.totalMinutes,0)/60*10)/10};});
 res.json({employeeCount,taskCount:taskRows.length,completed,pending:taskRows.length-completed,overdue,pendingReports:reportRows.filter(x=>['SUBMITTED','UNDER_REVIEW'].includes(x.status)).length,pendingLeaves,todayAttendance,reportedHours:Math.round(reportRows.reduce((n,r)=>n+r.totalMinutes,0)/60*10)/10,chart});
}));
r.get('/export',asyncRoute(async(req,res)=>{
 const format=String(req.query.format||'csv');const ids=await scopedUserIds(req.actor!);
 const from=req.query.from?day(String(req.query.from)):new Date(Date.now()-30*86400000);const to=req.query.to?day(String(req.query.to)):new Date();
 const reports=await db.dailyWorkReport.findMany({where:{employeeId:ids?{in:ids}:undefined,date:{gte:from,lte:to}},include:{employee:{select:{name:true,employeeCode:true}},entries:true},orderBy:{date:'desc'},take:2500});
 const rows=reports.map(r=>({Date:r.date.toISOString().slice(0,10),Employee:r.employee.name,EmployeeID:r.employee.employeeCode,Status:r.status,Hours:(r.totalMinutes/60).toFixed(2),Work:r.entries.map(e=>e.title).join(' | ')}));
 if(format==='csv'){
  const fields=['Date','Employee','EmployeeID','Status','Hours','Work'] as const;
  const clean=(v:string)=>'"'+(v.replace(/^[=+\-@]/,"'" )).replaceAll('"','""')+'"';
  res.type('text/csv').set('Content-Disposition','attachment; filename="worksphere-reports.csv"').send([fields.join(','),...rows.map(row=>fields.map(f=>clean(row[f])).join(','))].join('\r\n'));return;
 }
 if(format==='xlsx'){
  const wb=new ExcelJS.Workbook();const sh=wb.addWorksheet('Daily Work Reports');sh.columns=Object.keys(rows[0]||{Date:'',Employee:'',EmployeeID:'',Status:'',Hours:'',Work:''}).map(key=>({header:key,key,width:25}));sh.addRows(rows);sh.getRow(1).font={bold:true};res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').set('Content-Disposition','attachment; filename="worksphere-reports.xlsx"');const buffer=await wb.xlsx.writeBuffer();res.send(Buffer.from(buffer));return;
 }
 if(format==='pdf'){
  res.type('application/pdf').set('Content-Disposition','attachment; filename="worksphere-reports.pdf"');const doc=new PDFDocument({size:'A4',margin:36});doc.pipe(res);doc.fontSize(18).text('WorkSphere — Daily Work Report');doc.moveDown();for(const row of rows.slice(0,150)){doc.fontSize(9).text(`${row.Date}  •  ${row.Employee} (${row.EmployeeID})  •  ${row.Status}  •  ${row.Hours} hrs`);doc.fontSize(8).fillColor('#766B63').text(row.Work.slice(0,180));doc.fillColor('#251E1B').moveDown(.55);}doc.end();return;
 }
 res.status(400).json({error:'Supported formats: csv, xlsx, pdf'});
}));
export default r;
