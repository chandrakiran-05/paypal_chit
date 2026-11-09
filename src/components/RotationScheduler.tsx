'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BryntumScheduler } from '@bryntum/scheduler-react';
import '@bryntum/scheduler/scheduler.css';
import '@bryntum/scheduler/stockholm-light.css';
import '@bryntum/scheduler/fontawesome/css/fontawesome.css';
import '@bryntum/scheduler/fontawesome/css/solid.css';

type Member={id:string;name:string;position:number};
type Round={id:string;number:number;dueDate:string;winnerMemberId:string|null};
export default function RotationScheduler({circleId,mode,members,rounds,currentRound}:{circleId:string;mode:'FIXED'|'BIDDING';members:Member[];rounds:Round[];currentRound:number}){
 const router=useRouter();const [error,setError]=useState('');const [busy,setBusy]=useState(false);const sorted=useMemo(()=>[...members].sort((a,b)=>a.position-b.position),[members]);
 const resources=useMemo(()=>sorted.map(m=>({id:m.id,name:m.name})),[sorted]);
 const events=useMemo(()=>rounds.filter(r=>r.winnerMemberId).map(r=>({id:r.id,name:`R${r.number}`,resourceId:r.winnerMemberId!,startDate:r.dueDate,endDate:new Date(new Date(r.dueDate).getTime()+5*86400000).toISOString(),eventColor:r.number===currentRound?'green':'blue'})),[rounds,currentRound]);
 const activeDate=rounds.find(r=>r.number===currentRound)?.dueDate??rounds[0]?.dueDate;const start=new Date(new Date(activeDate).getTime()-7*86400000);const end=new Date(Math.max(...rounds.map(r=>new Date(r.dueDate).getTime()))+18*86400000);
 async function saveOrder(source:unknown){if(mode!=='FIXED'||busy)return;const scheduler=source as {resourceStore:{records:Array<{id:string}>}};const memberIds=scheduler.resourceStore.records.map(r=>String(r.id));if(memberIds.every((id,i)=>id===sorted[i].id))return;setBusy(true);setError('');try{const headers:Record<string,string>={'Content-Type':'application/json'};const token=sessionStorage.getItem('chit.adminToken');if(token)headers.Authorization=`Bearer ${token}`;const res=await fetch('/api/rotation/reorder',{method:'POST',headers,body:JSON.stringify({circleId,memberIds})});const body=await res.json();if(!res.ok)throw Error(body.error??'Could not save rotation');router.refresh()}catch(e){setError(e instanceof Error?e.message:'Could not save rotation');router.refresh()}finally{setBusy(false)}}
 return <section className="chit-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7eae3] px-6 py-5"><div><p className="chit-label">The next turns</p><h2 className="mt-2 font-serif text-[25px]">Payout rotation</h2><p className="mt-1 text-xs text-[#788479]">{mode==='FIXED'?'Drag a member row to change future payout order.':'Winning bidders appear on the timeline.'}</p></div><span className="rounded-full bg-[#f1f4ee] px-3 py-1.5 text-xs font-bold text-[#5b715f]">{rounds.length} rounds</span></div>{error&&<p role="alert" className="mx-6 mt-3 rounded-lg bg-[#fff0e9] p-3 text-xs text-[#a34930]">{error}</p>}<div className="h-[420px] w-full overflow-hidden"><BryntumScheduler resources={resources} events={events} startDate={start} endDate={end} viewPreset="weekAndMonth" rowHeight={58} barMargin={12} columns={[{text:'Member',field:'name',width:175}]} readOnly={mode==='BIDDING'} rowReorderFeature={mode==='FIXED'?{showGrip:true}:false} eventDragFeature={false} eventResizeFeature={false} eventDragCreateFeature={false} eventEditFeature={false} onGridRowBeforeDragStart={({context})=>{const dragged=context.records[0];return !members.some(m=>m.id===String(dragged.id)&&m.position<currentRound)}} onGridRowDrop={({source,context})=>{if(context.valid)void saveOrder(source)}} /></div></section>;
}
