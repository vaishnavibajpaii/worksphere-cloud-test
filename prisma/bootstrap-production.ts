/** First-run bootstrap for an EMPTY pilot DB. No public demo passwords, no automatic user reset. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
const db = new PrismaClient();
async function main() {
  const existingUsers = await db.user.count();
  if (existingUsers > 0) {
    console.log('Bootstrap: existing users detected; leaving accounts unchanged.');
    return;
  }
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 16) {
    throw new Error('For first deployment set BOOTSTRAP_ADMIN_EMAIL and a unique BOOTSTRAP_ADMIN_PASSWORD (minimum 16 characters).');
  }
  const organization = await db.organization.upsert({
    where: {slug:'worksphere'},
    create: {name: process.env.WORKSPHERE_ORG_NAME || 'WorkSphere Test', slug:'worksphere'},
    update: {}
  });
  // The first admin must be able to create users of every default role.
  const permissionCodes = ['*','employees.manage','team.manage','tasks.assign','projects.manage',
    'reports.review','leave.review','attendance.manage','announcements.manage','admin.manage'];
  for (const code of permissionCodes) {
    await db.permission.upsert({where:{code},create:{code,description:code==='*'?'Full administration':code.replaceAll('.',' ')},update:{}});
  }
  const roleMap: Record<string,string[]> = {
    SUPER_ADMIN:['*'],
    HR_ADMIN:['employees.manage','reports.review','leave.review','attendance.manage','announcements.manage','projects.manage','tasks.assign'],
    MANAGER:['reports.review','tasks.assign','projects.manage','leave.review'],
    TEAM_LEADER:['team.manage','reports.review','tasks.assign'],
    EMPLOYEE:[]
  };
  for (const [code,codes] of Object.entries(roleMap)) {
    const role = await db.role.upsert({where:{code},create:{code,name:code.replaceAll('_',' '),system:true},update:{}});
    for (const permissionCode of codes) {
      const permission = await db.permission.findUniqueOrThrow({where:{code:permissionCode}});
      await db.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},create:{roleId:role.id,permissionId:permission.id},update:{}});
    }
  }
  const adminRole = await db.role.findUniqueOrThrow({where:{code:'SUPER_ADMIN'}});
  for (const [code, name, daysPerYear] of [
    ['CASUAL','Casual Leave',12],['SICK','Sick Leave',8],['EARNED','Earned Leave',15]
  ] as const) {
    await db.leaveType.upsert({where:{code},create:{code,name,daysPerYear},update:{}});
  }
  const masters: Record<string, [string,string][]> = {
    TASK_PRIORITY:[['LOW','Low'],['MEDIUM','Medium'],['HIGH','High'],['URGENT','Urgent']],
    TASK_STATUS:[['TODO','To Do'],['IN_PROGRESS','In Progress'],['BLOCKED','Blocked'],['DONE','Done']],
    WORK_REPORT_STATUS:[['DRAFT','Draft'],['SUBMITTED','Submitted'],['UNDER_REVIEW','Under Review'],['CHANGES_REQUESTED','Changes Requested'],['APPROVED','Approved'],['REJECTED','Rejected'],['ESCALATED','Escalated']],
    TASK_CATEGORY:[['DEVELOPMENT','Development'],['DESIGN','Design'],['TESTING','Testing'],['OPERATIONS','Operations']],
    WORK_SHIFT:[['GENERAL','General shift (9:30–18:30)']],
    DOCUMENT_CATEGORY:[['OTHER','General document']]
  };
  for (const [category,items] of Object.entries(masters)) for (const [code,label] of items) {
    await db.masterItem.upsert({where:{organizationId_category_code:{organizationId:organization.id,category,code}},create:{organizationId:organization.id,category,code,label},update:{}});
  }
  const defaults: Record<string,unknown> = {brandPrimary:'#B96149',brandSidebar:'#F4E6D8',brandBackground:'#F8F5F0',timezone:'Asia/Kolkata',reportNotifyHR:true,reportDeadline:'18:30',workingDays:['MON','TUE','WED','THU','FRI'],workingHours:8,dashboardWidgets:{announcements:true,attendance:true,leaves:true},reportRequiredFields:['title','completed','minutes']};
  for (const [key,value] of Object.entries(defaults)) {
    await db.setting.upsert({where:{organizationId_key:{organizationId:organization.id,key}},create:{organizationId:organization.id,key,value:value as any},update:{}});
  }
  const hash = await argon2.hash(password,{type:argon2.argon2id});
  const user = await db.user.create({
    data: {organizationId: organization.id, employeeCode:'ADMIN001',name:'System Administrator',
      email, passwordHash:hash, primaryRole:'SUPER_ADMIN'}
  });
  await db.userRole.create({data:{userId:user.id,roleId:adminRole.id}});
  console.log('Bootstrap: private Super Admin created. Password has not been printed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
