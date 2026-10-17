import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
const db=new PrismaClient();
async function main(){
 if(process.env.NODE_ENV==='production')throw new Error('Demo seed is disabled in production');
 const demoPassword=process.env.DEMO_PASSWORD||'WorkSphere@12345';
 const pass=await argon2.hash(demoPassword,{type:argon2.argon2id});
 const organization=await db.organization.upsert({where:{slug:'worksphere'},create:{name:'Acme Creative Labs',slug:'worksphere'},update:{}});
 const perms=['*','employees.manage','team.manage','tasks.assign','projects.manage','reports.review','leave.review','attendance.manage','announcements.manage','admin.manage'];
 for(const code of perms)await db.permission.upsert({where:{code},create:{code,description:code==='*'?'Full administration':code.replaceAll('.',' ')},update:{}});
 const map:Record<string,string[]>={SUPER_ADMIN:['*'],HR_ADMIN:['employees.manage','reports.review','leave.review','attendance.manage','announcements.manage','projects.manage','tasks.assign'],MANAGER:['reports.review','tasks.assign','projects.manage','leave.review'],TEAM_LEADER:['team.manage','reports.review','tasks.assign'],EMPLOYEE:[]};
 for(const [code,permissions] of Object.entries(map)){
  const r=await db.role.upsert({where:{code},create:{code,name:code.split('_').map(s=>s[0]+s.slice(1).toLowerCase()).join(' '),system:true},update:{}});
  for(const permissionCode of permissions){const p=await db.permission.findUniqueOrThrow({where:{code:permissionCode}});await db.rolePermission.upsert({where:{roleId_permissionId:{roleId:r.id,permissionId:p.id}},create:{roleId:r.id,permissionId:p.id},update:{}});}
 }
 const depts=await Promise.all(['Engineering','Design','Human Resources','Sales'].map(async(name,i)=>db.department.upsert({where:{organizationId_code:{organizationId:organization.id,code:['ENG','DSN','HR','SAL'][i]}},create:{organizationId:organization.id,name,code:['ENG','DSN','HR','SAL'][i]},update:{}})));
 const branch=await db.branch.upsert({where:{organizationId_code:{organizationId:organization.id,code:'HQ'}},create:{organizationId:organization.id,name:'Head Office',code:'HQ'},update:{}});
 const designations=await Promise.all(['Software Engineer','UI Designer','HR Manager','Team Lead','Project Manager'].map(name=>db.designation.upsert({where:{name},create:{name},update:{}})));
 const team=await db.team.upsert({where:{organizationId_name:{organizationId:organization.id,name:'Product Engineering'}},create:{organizationId:organization.id,name:'Product Engineering'},update:{}});
 const definitions=[
 ['EMP001','Aarav Mehta','admin@worksphere.local','SUPER_ADMIN',2],
 ['EMP002','Priya Sharma','hr@worksphere.local','HR_ADMIN',2],
 ['EMP003','Rohan Verma','manager@worksphere.local','MANAGER',0],
 ['EMP004','Nisha Kapoor','manager2@worksphere.local','MANAGER',0],
 ['EMP005','Aditya Rao','lead@worksphere.local','TEAM_LEADER',0],
 ['EMP006','Sneha Iyer','lead2@worksphere.local','TEAM_LEADER',0],
 ['EMP007','Kabir Sethi','employee@worksphere.local','EMPLOYEE',0],
 ['EMP008','Ananya Gupta','ananya@worksphere.local','EMPLOYEE',0],
 ['EMP009','Vikram Singh','vikram@worksphere.local','EMPLOYEE',0],
 ['EMP010','Meera Joshi','meera@worksphere.local','EMPLOYEE',1],
 ['EMP011','Ishaan Nair','ishaan@worksphere.local','EMPLOYEE',0],
 ['EMP012','Zoya Khan','zoya@worksphere.local','EMPLOYEE',1],
 ['EMP013','Dev Patel','dev@worksphere.local','EMPLOYEE',0],
 ['EMP014','Tara Desai','tara@worksphere.local','EMPLOYEE',1],
 ['EMP015','Arjun Malhotra','arjun@worksphere.local','EMPLOYEE',0],
 ['EMP016','Riya Banerjee','riya@worksphere.local','EMPLOYEE',0]
 ] as const;
 const all:any[]=[];
 for(const [employeeCode,name,email,primaryRole,dept] of definitions){
  const user=await db.user.upsert({where:{employeeCode},create:{employeeCode,name,email,primaryRole,passwordHash:pass,organizationId:organization.id,departmentId:depts[dept].id,branchId:branch.id,teamId:team.id,designationId:designations[primaryRole==='HR_ADMIN'?2:primaryRole==='MANAGER'?4:primaryRole==='TEAM_LEADER'?3:0].id},update:{}});
  const role=await db.role.findUniqueOrThrow({where:{code:primaryRole}});await db.userRole.upsert({where:{userId_roleId:{userId:user.id,roleId:role.id}},create:{userId:user.id,roleId:role.id},update:{}});all.push(user);
 }
 for(const user of all.slice(4))await db.user.update({where:{id:user.id},data:{managerId:user.employeeCode==='EMP005'||user.employeeCode==='EMP006'?all[2].id:all[2].id}});
 const project=await db.project.upsert({where:{organizationId_code:{organizationId:organization.id,code:'PROJ-100'}},create:{organizationId:organization.id,code:'PROJ-100',name:'Customer Portal Redesign',ownerId:all[2].id,description:'Improve customer onboarding and account journeys',status:'ACTIVE'},update:{}});
 const jobs=['Design account dashboard','Build notifications API','Write integration tests','Refine navigation mobile UX','Review analytics API','Update project documentation'];
 for(let i=0;i<jobs.length;i++){
  const uniqueTitle=jobs[i];const existing=await db.task.findFirst({where:{title:uniqueTitle,projectId:project.id}});
  if(!existing)await db.task.create({data:{title:uniqueTitle,projectId:project.id,createdById:all[2].id,priority:i===0?'HIGH':'MEDIUM',status:i===2?'DONE':i===1?'IN_PROGRESS':'TODO',progress:i===2?100:i===1?55:0,dueAt:new Date(Date.now()+(i+1)*86400000),assignments:{create:{userId:all[6+i].id}}}});
 }
 for(const [code,name,daysPerYear] of [['CASUAL','Casual Leave',12],['SICK','Sick Leave',8],['EARNED','Earned Leave',15]] as const){const leave=await db.leaveType.upsert({where:{code},create:{code,name,daysPerYear},update:{}});for(const user of all)await db.leaveBalance.upsert({where:{userId_typeId_year:{userId:user.id,typeId:leave.id,year:new Date().getFullYear()}},create:{userId:user.id,typeId:leave.id,year:new Date().getFullYear(),allotted:daysPerYear},update:{}});}
 const defaultMasters:{category:string; items:[string,string][]}[]=[
 {category:'TASK_PRIORITY',items:[['LOW','Low'],['MEDIUM','Medium'],['HIGH','High'],['URGENT','Urgent']]},
 {category:'TASK_STATUS',items:[['TODO','To Do'],['IN_PROGRESS','In Progress'],['BLOCKED','Blocked'],['DONE','Done']]},
 {category:'WORK_REPORT_STATUS',items:[['DRAFT','Draft'],['SUBMITTED','Submitted'],['UNDER_REVIEW','Under Review'],['CHANGES_REQUESTED','Changes Requested'],['APPROVED','Approved'],['REJECTED','Rejected'],['ESCALATED','Escalated']]},
 {category:'TASK_CATEGORY',items:[['DEVELOPMENT','Development'],['DESIGN','Design'],['TESTING','Testing'],['OPERATIONS','Operations']]},
 {category:'WORK_SHIFT',items:[['GENERAL','General shift (9:30–18:30)']]},
 {category:'DOCUMENT_CATEGORY',items:[['OTHER','General document']]}
 ];
 for(const {category,items} of defaultMasters)for(const [code,label] of items)await db.masterItem.upsert({where:{organizationId_category_code:{organizationId:organization.id,category,code}},create:{organizationId:organization.id,category,code,label},update:{}});
 const defaults:Record<string,unknown>={brandPrimary:'#B96149',brandSidebar:'#F4E6D8',brandBackground:'#F8F5F0',timezone:'Asia/Kolkata',reportNotifyHR:true,reportDeadline:'18:30',workingDays:['MON','TUE','WED','THU','FRI'],workingHours:8,dashboardWidgets:{announcements:true,attendance:true,leaves:true},reportRequiredFields:['title','completed','minutes']};
 for(const [key,value] of Object.entries(defaults))await db.setting.upsert({where:{organizationId_key:{organizationId:organization.id,key}},create:{organizationId:organization.id,key,value:value as any},update:{}});
 if(!await db.announcement.findFirst())await db.announcement.create({data:{title:'Welcome to WorkSphere ✨',body:'Use Daily Reports to submit your work, Tasks to manage your priorities, and your profile menu to personalize your experience.',authorId:all[0].id}});
 console.info(`Seed finished. Development-only credentials: admin@worksphere.local / ${demoPassword} (also hr@worksphere.local, manager@worksphere.local, employee@worksphere.local).`);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
