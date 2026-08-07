import React, { useState, useEffect, useMemo } from "react";
import { C } from "./lib.js";
import { Btn, Chip } from "./ui.jsx";
import { listCotizaciones, deleteAcuerdo } from "./db.js";

const ESTATUS={borrador:{t:"Borrador",c:C.label,bg:C.soft},enviada:{t:"Enviada",c:C.green,bg:C.greenBg},aceptada:{t:"Aceptada",c:C.green,bg:C.greenBg},rechazada:{t:"Rechazada",c:C.red,bg:C.redSoft},vencida:{t:"Vencida",c:C.red,bg:C.redSoft},superseded:{t:"Reemplazada",c:"#8A6D1F",bg:"#FBF4E0"}};
function EstChip({e}){const m=ESTATUS[e]||{t:e,c:C.label,bg:C.soft};return <span style={{fontSize:10,fontWeight:"bold",color:m.c,background:m.bg,border:"1px solid "+C.sep2,borderRadius:4,padding:"2px 7px",whiteSpace:"nowrap"}}>{m.t}</span>;}

const MODO={ME:"Marítimo Exportación",MI:"Marítimo Importación",AE:"Aéreo Exportación",AI:"Aéreo Importación"};
const hoyISO=()=>new Date().toISOString().slice(0,10);
const vigenteHoy=(a,b)=>{ const h=hoyISO(); if(!a&&!b) return false; if(a&&a>h) return false; if(b&&b<h) return false; return true; };

export function Cotizaciones({ onOpen, onNew, role }){
  const isAdmin = role==="admin";
  const [rows,setRows]=useState(null);
  const [q,setQ]=useState("");
  const [abierto,setAbierto]=useState({});
  const ultimoEnviado=(g)=>{ const env=(g.rows||[]).filter(r=>r.estatus==="enviada").sort((a,b)=>(b.amendment||0)-(a.amendment||0)); return env[0]||null; };
  const reload=()=>{ setRows(null); listCotizaciones().then(({rows})=>setRows(rows||[])); };

  const borrarMacro=async(g)=>{
    if(!isAdmin||!g.acuerdoId) return;
    const n=g.rows.length;
    const ok=confirm("⚠ BORRAR CONTRATO MACRO\n\nCliente: "+g.cliente+"\nAcuerdo: "+(g.noAcuerdo||"—")+"\n\nSe eliminarán PERMANENTEMENTE este acuerdo y sus "+n+" amendment(s), con todas sus rutas, costos y recargos. El cliente NO se borra.\n\nEsta acción no se puede deshacer. ¿Continuar?");
    if(!ok) return;
    const ok2=confirm("Confirmación final: se borrará el acuerdo "+(g.noAcuerdo||"")+" de "+g.cliente+". ¿Seguro?");
    if(!ok2) return;
    const { error }=await deleteAcuerdo(g.acuerdoId);
    if(error) alert("No se pudo borrar: "+error); else reload();
  };
  useEffect(()=>{ reload(); },[]);

  const filtered=(rows||[]).filter(r=>{ const s=q.trim().toLowerCase(); if(!s) return true; return (r.cliente+" "+r.folio+" "+r.commodity+" "+r.owner+" "+r.noAcuerdo+" "+r.tradelane).toLowerCase().includes(s); });

  // Agrupamos por contrato macro (cliente + acuerdo). Un cliente con acuerdos
  // de distinto modo aparece en tarjetas separadas, que es como se manejan.
  const grupos=useMemo(()=>{
    const m=new Map();
    filtered.forEach(r=>{
      const k=r.acuerdoId||("sin:"+r.cliente);
      if(!m.has(k)) m.set(k,{cliente:r.cliente,noCliente:r.noCliente,noAcuerdo:r.noAcuerdo,acuerdoId:r.acuerdoId,modo:r.modo,vd:r.acuerdoVigDesde,vh:r.acuerdoVigHasta,rows:[]});
      m.get(k).rows.push(r);
    });
    const arr=[...m.values()];
    arr.forEach(g=>g.rows.sort((a,b)=>(a.amendment||0)-(b.amendment||0)||String(a.codigo||"").localeCompare(String(b.codigo||""))));
    arr.sort((a,b)=>String(a.cliente||"").localeCompare(String(b.cliente||""),"es"));
    return arr;
  },[filtered]);

  const th={fontSize:9,letterSpacing:.5,textTransform:"uppercase",color:C.label,fontWeight:"bold",padding:"6px 10px",textAlign:"left",whiteSpace:"nowrap",borderBottom:"1px solid "+C.sep2};
  const td={padding:"8px 10px",borderBottom:"1px solid "+C.sep,fontSize:12.5,verticalAlign:"middle"};
  const fecha=(s)=>{ if(!s) return ""; try{return new Date(s+(String(s).length===10?"T12:00:00":"")).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"2-digit"});}catch{return"";} };
  const fechaHora=(s)=>{ if(!s) return ""; try{const d=new Date(s);return d.toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"2-digit"})+" "+d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});}catch{return fecha(s);} };
  const correoCorto=(e)=>String(e||"").split("@")[0];
  const rangoVig=(a,b)=>(!a&&!b)?"—":(fecha(a)+" – "+(b?fecha(b):"…"));

  return (<div style={{maxWidth:1160,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div><div style={{fontSize:16,fontWeight:"bold",color:C.ink}}>Cotizaciones del equipo</div><div style={{fontSize:12,color:C.label}}>Agrupadas por cliente y contrato macro</div></div>
      <div style={{display:"flex",gap:8}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente, acuerdo, folio, commodity…" style={{padding:"8px 11px",border:"1px solid "+C.sep2,borderRadius:6,fontSize:13,width:300}}/>
        <Btn kind="ghost" small onClick={reload}>↻</Btn>
        <Btn kind="primary" small onClick={onNew}>＋ Nueva cotización</Btn>
      </div>
    </div>

    {rows===null?<div style={{color:C.label,fontSize:13,padding:20}}>Cargando…</div>:
     grupos.length===0?<div style={{border:"1px solid "+C.sep2,borderRadius:10,background:"#fff",padding:28,textAlign:"center",color:C.label,fontSize:13}}>{q?"Sin resultados para esa búsqueda.":"Sin cotizaciones todavía."}</div>:(
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {grupos.map((g,gi)=>{ const exp=q?true:!!abierto[gi]; const ue=ultimoEnviado(g); const ueVenc=ue&&ue.vigHasta&&ue.vigHasta<hoyISO(); return (
          <div key={gi} style={{border:"1px solid "+C.sep2,borderRadius:10,background:"#fff",overflow:"hidden"}}>

            {/* Encabezado del cliente + contrato macro */}
            <div onClick={()=>setAbierto(a=>({...a,[gi]:!(q?true:!!a[gi])}))} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:C.soft,borderBottom:exp?"1px solid "+C.sep2:"none",cursor:"pointer"}}>
              <span style={{color:C.label,fontSize:12,flex:"none"}}>{exp?"▾":"▸"}</span>
              <div style={{height:26,width:4,background:C.red,borderRadius:2,flex:"none"}}/>
              <div style={{minWidth:0}}>
                <div style={{fontSize:14.5,fontWeight:"bold",color:C.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {g.cliente}{g.noCliente?<span style={{color:C.label,fontWeight:"normal",fontSize:12}}> ({g.noCliente})</span>:null}
                </div>
                <div style={{fontSize:11,color:C.label,marginTop:2}}>
                  {MODO[g.modo]||g.modo||"—"} · {g.rows.length} {g.rows.length===1?"amendment":"amendments"}
                  {ue?<span> · Último enviado {ue.folio} <span style={{fontWeight:"bold",color:ueVenc?C.red:C.slate}}>{rangoVig(ue.vigDesde,ue.vigHasta)}{ueVenc?" · VENCIDO":""}</span></span>:<span> · sin AM enviado</span>}
                </div>
              </div>
              <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,flex:"none"}}>
                <span style={{fontSize:9,color:C.label,letterSpacing:.5,textTransform:"uppercase"}}>Contrato macro</span>
                <span style={{fontSize:12.5,fontWeight:"bold",color:"#fff",background:C.red,borderRadius:5,padding:"4px 10px",letterSpacing:.5}}>{g.noAcuerdo||"— sin acuerdo —"}</span>
                {isAdmin&&g.acuerdoId&&<span onClick={(e)=>{e.stopPropagation();borrarMacro(g);}} title="Borrar contrato macro (solo admin)" style={{cursor:"pointer",marginLeft:2,color:C.label,fontSize:15,lineHeight:1}}>🗑</span>}
              </div>
            </div>

            {/* Amendments */}
            {exp&&<div style={{overflow:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["","Folio","Dir.","Tradelane","Vigencia","Estatus","Responsable","Actualizado",""].map((h,i)=><th key={i} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {g.rows.map(r=>{const viv=vigenteHoy(r.vigDesde,r.vigHasta);const venc=r.vigHasta&&r.vigHasta<hoyISO();
                    return (<tr key={r.id} style={{background:r.estatus==="superseded"?C.soft:"#fff"}}>
                      <td style={{...td,width:52}}><Chip>{"AM"+(r.amendment||1)}</Chip></td>
                      <td style={{...td,fontWeight:"bold",color:C.slate,whiteSpace:"nowrap"}}>{r.codigo}{r.commodity?<span style={{color:C.label,fontWeight:"normal"}}> · {r.commodity}</span>:null}{r.origen==="importado"&&<span style={{marginLeft:6,fontSize:9,color:C.label}}>(import)</span>}</td>
                      <td style={td}>{r.direccion==="E"?"Exp":"Imp"}</td>
                      <td style={{...td,fontSize:11,color:C.label,whiteSpace:"nowrap"}}>{r.tradelane||"—"}</td>
                      <td style={{...td,whiteSpace:"nowrap",fontSize:11.5,color:venc?C.label:C.slate}}>
                        {rangoVig(r.vigDesde,r.vigHasta)}
                        {viv&&<span title="Vigente hoy" style={{marginLeft:6,fontSize:9.5,fontWeight:"bold",color:C.green,background:C.greenBg,border:"1px solid "+C.sep2,borderRadius:4,padding:"1px 5px"}}>vigente</span>}
                      </td>
                      <td style={td}><EstChip e={r.estatus}/></td>
                      <td style={{...td,color:C.label,fontSize:11,whiteSpace:"nowrap"}}>{r.owner}</td>
                      <td style={{...td,color:C.label,fontSize:11,whiteSpace:"nowrap"}}><div>{fechaHora(r.updated_at)}</div>{r.actualizadoPor&&<div title={r.actualizadoPor} style={{fontSize:10,color:C.label}}>por {correoCorto(r.actualizadoPor)}</div>}</td>
                      <td style={{...td,textAlign:"right"}}><Btn kind="ghost" small onClick={()=>onOpen(r.id)}>Abrir</Btn></td>
                    </tr>);
                  })}
                </tbody>
              </table>
            </div>}

          </div>
        );})}
      </div>
    )}
  </div>);
}
