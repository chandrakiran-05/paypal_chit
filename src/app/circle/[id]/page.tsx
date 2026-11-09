import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { verifyChain } from '@/lib/ledger';
import CircleDashboard from '@/components/CircleDashboard';

export const dynamic='force-dynamic';
export default async function CirclePage({params}:{params:{id:string}}){
 const circle=await db.circle.findUnique({where:{id:params.id},include:{members:{orderBy:{payoutPosition:'asc'}},rounds:{orderBy:{number:'asc'},include:{contributions:true,winner:true}},ledgerEntries:{orderBy:{createdAt:'desc'},take:12},agentActions:{orderBy:{createdAt:'desc'},take:12}}});
 if(!circle)notFound();
 const check=await verifyChain(circle.id);const round=circle.rounds.find(r=>r.number===circle.currentRound);const now=Date.now();
 return <CircleDashboard circle={{id:circle.id,name:circle.name,mode:circle.mode,currency:circle.currency,frequency:circle.frequency,currentRound:circle.currentRound,contributionAmount:Number(circle.contributionAmount),commissionPercent:Number(circle.commissionPercent),maxDiscountPercent:Number(circle.maxDiscountPercent)}} members={circle.members.map(m=>({id:m.id,name:m.name,position:m.payoutPosition,hasWon:m.hasWon}))} rounds={circle.rounds.map(r=>({id:r.id,number:r.number,dueDate:r.dueDate.toISOString(),winnerMemberId:r.winnerMemberId,winnerName:r.winner?.name??null,winningBid:r.winningBid===null?null:Number(r.winningBid),status:r.status}))} rows={circle.members.map(m=>{const contribution=round?.contributions.find(c=>c.memberId===m.id);return {id:m.id,name:m.name,email:m.email,position:m.payoutPosition,paid:contribution?.status==='PAID',late:!!contribution&&contribution.status!=='PAID'&&round!.dueDate.getTime()<now,riskScore:m.riskScore,riskReason:m.riskReason,contributionId:contribution?.id??null}})} actions={circle.agentActions.map(a=>({...a,createdAt:a.createdAt.toISOString()}))} ledger={circle.ledgerEntries.map(e=>({id:e.id,type:e.type,createdAt:e.createdAt.toISOString(),payload:e.payload,hash:e.hash}))} verified={check.valid} brokenEntryId={check.brokenEntry?.id} demoMode={process.env.DEMO_MODE==='true'}/>;
}
