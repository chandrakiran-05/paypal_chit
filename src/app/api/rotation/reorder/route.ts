import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const bodySchema=z.object({circleId:z.string().min(1),memberIds:z.array(z.string().min(1)).min(2).max(20)});
export async function POST(request:Request){
 try{
  const token=process.env.ADMIN_TOKEN;
  if(process.env.NODE_ENV==='production'&&!token)return NextResponse.json({error:'ADMIN_TOKEN is not configured'},{status:503});
  if(token&&request.headers.get('authorization')!==`Bearer ${token}`)return NextResponse.json({error:'Organizer access required'},{status:401});
  const {circleId,memberIds}=bodySchema.parse(await request.json());
  const circle=await db.circle.findUnique({where:{id:circleId},include:{members:{orderBy:{payoutPosition:'asc'}},rounds:true}});
  if(!circle||circle.mode!=='FIXED')return NextResponse.json({error:'Fixed circle not found'},{status:404});
  if(memberIds.length!==circle.members.length||new Set(memberIds).size!==memberIds.length||memberIds.some(id=>!circle.members.some(m=>m.id===id)))return NextResponse.json({error:'Member list is incomplete'},{status:400});
  if(circle.members.some(m=>m.payoutPosition<circle.currentRound&&memberIds[m.payoutPosition-1]!==m.id))return NextResponse.json({error:'Past payout positions are locked'},{status:400});
  await db.$transaction(async tx=>{
   for(const [index,member] of circle.members.entries())await tx.member.update({where:{id:member.id},data:{payoutPosition:1000+index}});
   for(const [index,id] of memberIds.entries())await tx.member.update({where:{id},data:{payoutPosition:index+1}});
   for(const round of circle.rounds.filter(r=>r.number>=circle.currentRound))await tx.round.update({where:{id:round.id},data:{winnerMemberId:memberIds[round.number-1]}});
  });
  return NextResponse.json({ok:true});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not reorder'},{status:400})}
}
