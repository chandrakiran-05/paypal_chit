'use client';

import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);
export type LedgerRow = { id:string; name:string; email:string; position:number; paid:boolean; late:boolean; riskScore:number; riskReason:string|null; contributionId:string|null };
const theme = themeQuartz.withParams({ accentColor:'#1e6846', backgroundColor:'#ffffff', foregroundColor:'#17251f', headerBackgroundColor:'#f8f9f5', borderColor:'#e5e9e1', fontFamily:'Arial, Helvetica, sans-serif', fontSize:13, rowHoverColor:'#f6f9f3', spacing:9 });
export default function LedgerGrid({ rows, onPay, onDemoPay, demoMode }: {rows:LedgerRow[];onPay:(id:string)=>void;onDemoPay:(id:string)=>void;demoMode:boolean}) {
  const columns = useMemo<ColDef<LedgerRow>[]>(() => [
    {headerName:'MEMBER',field:'name',flex:1.5,minWidth:185,cellRenderer:({data}:{data:LedgerRow})=><div className="flex h-full items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eaf3e7] text-xs font-bold text-[#28724d]">{data.name[0]}</span><div className="leading-tight"><div className="font-bold">{data.name}</div><div className="text-[11px] text-[#879185]">{data.email}</div></div></div>},
    {headerName:'POSITION',field:'position',width:120,cellRenderer:({value}:{value:number})=><span className="font-semibold text-[#647267]">#{String(value).padStart(2,'0')}</span>},
    {headerName:'STATUS',field:'paid',width:130,cellRenderer:({data}:{data:LedgerRow})=><span className={`rounded-full px-3 py-1 text-xs font-bold ${data.paid?'bg-[#e8f4e7] text-[#267047]':data.late?'bg-[#fff0db] text-[#aa6c1e]':'bg-[#f1f2ef] text-[#718074]'}`}>{data.paid?'Paid':data.late?'Late':'Pending'}</span>},
    {headerName:'RISK',field:'riskScore',width:140,cellRenderer:({data}:{data:LedgerRow})=><span title={data.riskReason??undefined} className={`font-bold ${data.riskScore>=70?'text-[#a95638]':data.riskScore>=35?'text-[#b17b25]':'text-[#2c7950]'}`}>{data.riskScore} <span className="font-normal text-[#9ba69d]">/ 100</span></span>},
    {headerName:'ACTION',width:demoMode?190:130,sortable:false,filter:false,cellRenderer:({data}:{data:LedgerRow})=>data.paid?<span className="text-xs text-[#9ca69e]">Complete</span>:<div className="flex h-full items-center gap-2"><button onClick={()=>data.contributionId&&onPay(data.contributionId)} className="rounded-lg border border-[#cfddd0] px-2.5 py-1 text-xs font-bold text-[#216b48] hover:bg-[#eaf4e8]">PayPal ↗</button>{demoMode&&<button onClick={()=>data.contributionId&&onDemoPay(data.contributionId)} title="Simulate payment" className="rounded-lg border border-[#ead5a8] px-2.5 py-1 text-xs font-bold text-[#876527] hover:bg-[#fff6e5]">Demo</button>}</div>}
  ],[onPay,onDemoPay,demoMode]);
  return <div className="h-[440px] w-full"><AgGridReact theme={theme} rowData={rows} columnDefs={columns} getRowId={({data})=>data.id} rowHeight={65} headerHeight={42} pagination paginationPageSize={6} paginationPageSizeSelector={false} suppressCellFocus defaultColDef={{sortable:true,filter:true,resizable:true}}/></div>;
}
