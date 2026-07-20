import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
const adapter=new PrismaPg({connectionString:process.env.DATABASE_URL!});const prisma=new PrismaClient({adapter});
const userId=process.env.DEFAULT_USER_ID??"11111111-1111-4111-8111-111111111111";
async function main(){await prisma.user.upsert({where:{id:userId},update:{},create:{id:userId,name:"Personal User"}});if (await prisma.debt.count({ where: { userId } })) return;
 const motor=await prisma.debt.create({data:{userId,name:"Cicilan Motor",creditor:"Leasing Contoh",originalPrincipal:18000000,remainingPrincipal:18000000,paymentPolicy:"FIXED",fixedMonthlyAmount:1200000,minimumMonthlyAmount:1200000,targetMonthlyAmount:1200000,dueDay:10,priority:"CRITICAL",allocationPolicy:"CURRENT_INSTALLMENT_FIRST",lateFeeRule:{create:{calculationType:"DAILY",dailyAmount:10000,graceDays:0,maxDays:30,maxAmount:300000,settlementPolicy:"NEXT_INSTALLMENT"}}}});
 await prisma.debtInstallment.create({data:{debtId:motor.id,period:"2026-07",scheduledPrincipal:1200000,dueDate:new Date("2026-07-10")}});
 await prisma.debt.create({data:{userId,name:"Utang Keluarga",creditor:"Keluarga",originalPrincipal:8000000,remainingPrincipal:8000000,paymentPolicy:"FLEXIBLE",minimumMonthlyAmount:300000,targetMonthlyAmount:1000000,priority:"NORMAL",canBeNegotiated:true,allocationPolicy:"PRINCIPAL_FIRST",lateFeeRule:{create:{calculationType:"NONE",settlementPolicy:"MANUAL"}}}});
 await prisma.debt.create({data:{userId,name:"Utang Vendor",creditor:"Vendor Lama",originalPrincipal:7000000,remainingPrincipal:7000000,paymentPolicy:"NEGOTIABLE",minimumMonthlyAmount:0,targetMonthlyAmount:500000,priority:"SLOW",canBeNegotiated:true,allocationPolicy:"PRINCIPAL_FIRST",lateFeeRule:{create:{calculationType:"MANUAL",settlementPolicy:"END_OF_TERM"}}}});
}
main().finally(()=>prisma.$disconnect());
