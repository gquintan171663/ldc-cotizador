import React, { useState, useEffect } from "react";
import { C } from "./lib.js";
import { Btn, Chip } from "./ui.jsx";
import { listCotizaciones } from "./db.js";

const ESTATUS={borrador:{t:"Borrador",c:C.label,bg:C.soft},enviada:{t:"Enviada",c:C.green,bg:C.greenBg},aceptada:{t:"Aceptada",c:C.green,bg:C.greenBg},rechazada:{t:"Rechazada",c:C.red,bg:C.redSoft},vencida:{t:"Vencida",c:C.red,bg:C.redSoft},superseded:{t:"Reemplazada",c:"#8A6D1F",bg:"#FBF4E0"}};
function EstChip({e}){const m=ESTATUS[e]||{t:e,c:C.label,bg:C.soft};return <span style={{fontSize:10,fontWeight:"bold",color:m.c,background:m.bg,border:"1px solid "+C.sep2,borderRadius:4,padding:"2px 7px"}}>{m.t}</span>;}

export function Cotizaciones({ onOpen, onNew }){
  const [rows,setRows]=useState(null);
  const [q,setQ]=useState("");
  const reload=()=>{ setRows(null); listCotizaciones().then(({rows})=>setRows(rows||[])); };
  useEffect(()=>{ reload(); },[]);
  const filtered=(rows||[]).filter(r=>{ const s=q.trim().toLowerCase(); if(!s) return true; return (r.cliente+" "+r.folio+" "+r.commodity+" "+r.owner).toLowerCase().includes(s); });
  const th={fontSize:9.5,letterSpacing:.5,textTransform:"uppercase",color:"#fff",fontWeight:"bold",padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap"};
  const td={padding:"8px 10px",borderBottom:"1px solid "+C.sep,fontSize:12.5,verticalAlign:"middle"};
  const fecha=(s)=>{ try{return new Date(s).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"});}catch{return"";} };
  return (<div style={{maxWidth:1160,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div><div style={{fontSize:16,fontWeight:"bold",color:C.ink}}>Cotizaciones del equipo</div><div style={{fontSize:12,color:C.label}}>Todas las cotizaciones de Pricing</div></div>
      <div style={{display:"flex",gap:8}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente, folio, commodity…" style={{padding:"8px 11px",border:"1px solid "+C.sep2,borderRadius:6,fontSize:13,width:280}}/>
        <Btn kind="ghost" small onClick={reload}>↻</Btn>
        <Btn kind="primary" small onClick={onNew}>＋ Nueva cotización</Btn>
      </div>
    </div>
    {rows===null?<div style={{color:C.label,fontSize:13,padding:20}}>Cargando…</div>:(
      <div style={{border:"1px solid "+C.sep2,borderRadius:10,overflow:"auto",background:"#fff"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:C.ink}}>{["Folio","Cliente","Dir.","Estatus","Responsable","Actualizado",""].map((h,i)=><th key={i} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={7} style={{...td,textAlign:"center",color:C.label,padding:24}}>Sin cotizaciones todavía.</td></tr>}
            {filtered.map(r=>(<tr key={r.id} style={{background:r.estatus==="superseded"?C.soft:"#fff"}}>
              <td style={{...td,fontWeight:"bold",color:C.slate}}>{r.codigo}{r.commodity?<span style={{color:C.label,fontWeight:"normal"}}> · {r.commodity}</span>:null}{r.origen==="importado"&&<span style={{marginLeft:6,fontSize:9,color:C.label}}>(import)</span>}</td>
              <td style={td}>{r.cliente}</td>
              <td style={td}>{r.direccion==="E"?"Exp":"Imp"}</td>
              <td style={td}><EstChip e={r.estatus}/></td>
              <td style={{...td,color:C.label,fontSize:11}}>{r.owner}</td>
              <td style={{...td,color:C.label,fontSize:11}}>{fecha(r.updated_at)}</td>
              <td style={{...td,textAlign:"right"}}><Btn kind="ghost" small onClick={()=>onOpen(r.id)}>Abrir</Btn></td>
            </tr>))}
          </tbody>
        </table>
      </div>
    )}
  </div>);
}
