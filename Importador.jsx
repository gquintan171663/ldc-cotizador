import React, { useState, useEffect } from "react";
import { C, NAVIERAS, isKnownScac, money, parseWorkbook, matchCommodity } from "./lib.js";
import { Btn, Chip } from "./ui.jsx";
import { importRates, contarImportadas, deleteImportadas } from "./db.js";

export function Importador({ onBack }){
  const [data,setData]=useState(null);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const [result,setResult]=useState(null);
  const [prog,setProg]=useState(null);
  const [cnt,setCnt]=useState(null);
  const [delMsg,setDelMsg]=useState("");
  const refreshCnt=()=>contarImportadas().then(setCnt);
  useEffect(()=>{ refreshCnt(); },[]);
  const borrar=async(onlyBorradores)=>{
    const q=onlyBorradores
      ? "¿Borrar los BORRADORES importados? Esto elimina las cotizaciones importadas en estado borrador (no las que ya marcaste enviadas)."
      : "¿Borrar TODO lo importado? Esto elimina TODAS las cotizaciones que entraron por Excel, sin importar su estatus. Esta acción no se puede deshacer.";
    if(!window.confirm(q)) return;
    setBusy(true); setDelMsg("");
    const r=await deleteImportadas({onlyBorradores});
    setBusy(false);
    setDelMsg("Se borraron "+r.borradas+" cotizaciones importadas"+(r.errores.length?(" · "+r.errores.length+" errores"):"")+".");
    refreshCnt();
  };

  const onFile=async(e)=>{
    const f=e.target.files&&e.target.files[0]; if(!f) return;
    setBusy(true); setErr(""); setResult(null);
    try{ const buf=await f.arrayBuffer(); setData(parseWorkbook(buf)); }
    catch(ex){ setErr("No se pudo leer el archivo: "+ex.message); }
    setBusy(false);
  };
  const doImport=async()=>{
    if(!data) return; setBusy(true); setErr(""); setProg({done:0,totalC:0});
    try{ const sum=await importRates(data.recs,(p)=>setProg(p)); setResult(sum); refreshCnt(); }
    catch(ex){ setErr("Error al importar: "+ex.message); }
    setBusy(false);
  };

  const th={fontSize:9.5,letterSpacing:.4,textTransform:"uppercase",color:"#fff",fontWeight:"bold",padding:"7px 8px",whiteSpace:"nowrap",textAlign:"left"};
  const td={padding:"6px 8px",borderBottom:"1px solid "+C.sep,fontSize:12,verticalAlign:"top"};
  const navTag=(s)=>s?<span style={{fontSize:10,fontWeight:"bold",color:isKnownScac(s)?C.slate:C.red}}>{s}</span>:<span style={{color:C.label}}>—</span>;

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <span style={{fontSize:13,fontWeight:"bold",color:C.ink}}>Cargar tarifas de Pricing (Excel) <span style={{fontWeight:"normal",color:C.label,fontSize:12}}>· extrae, normaliza e inserta como costo base</span></span>
      <span onClick={onBack} style={{cursor:"pointer",fontSize:12,color:C.label}}>← Volver</span>
    </div>
    <div style={{background:"#fff",border:"1px dashed "+C.sep2,borderRadius:12,padding:20,marginBottom:14,textAlign:"center"}}>
      <input type="file" accept=".xls,.xlsx" onChange={onFile} style={{fontSize:13}}/>
      <div style={{fontSize:11,color:C.label,marginTop:8}}>Todo es costo de naviera: entra como tarifa base (costo). Sin venta ni margen — eso se define al cotizar. Dirección: Exportación.</div>
      {busy&&!prog&&<div style={{marginTop:8,color:C.red,fontSize:12}}>Leyendo…</div>}
      {err&&<div style={{marginTop:8,color:C.red,fontSize:12}}>{err}</div>}
    </div>

    <div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:12,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
      <div style={{fontSize:12.5,color:C.slate}}>
        <b style={{color:C.ink}}>Limpieza de importaciones.</b>{" "}
        {cnt?(<span style={{color:C.label}}>Hay <b style={{color:C.slate}}>{cnt.total}</b> cotizaciones importadas (<b style={{color:C.slate}}>{cnt.borradores}</b> en borrador).</span>):<span style={{color:C.label}}>Contando…</span>}
        {delMsg&&<span style={{color:C.green,fontWeight:"bold",marginLeft:8}}>{delMsg}</span>}
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn kind="ghost" small onClick={()=>borrar(true)} disabled={busy||!cnt||cnt.borradores===0}>Borrar borradores importados</Btn>
        <Btn kind="danger" small onClick={()=>borrar(false)} disabled={busy||!cnt||cnt.total===0}>Borrar TODO lo importado</Btn>
      </div>
    </div>

    {result&&(<div style={{background:C.greenBg,border:"1px solid "+C.greenBd,borderRadius:10,padding:14,marginBottom:14}}>
      <b style={{color:C.green}}>Importación completa</b>
      <div style={{fontSize:12.5,color:C.slate,marginTop:6}}>{result.clientes} clientes nuevos · {result.versiones} versiones · {result.lineas} líneas · {result.opciones} opciones de costo.</div>
      {result.errores.length>0&&<div style={{fontSize:11,color:C.red,marginTop:6}}>{result.errores.length} errores: {result.errores.slice(0,4).join(" · ")}{result.errores.length>4?"…":""}</div>}
    </div>)}

    {data&&!result&&(<>
      <div style={{display:"flex",gap:18,marginBottom:12,flexWrap:"wrap"}}>
        <span style={{fontSize:12.5,color:C.slate}}><b>{data.recs.length}</b> tarifas</span>
        <span style={{fontSize:12.5,color:C.slate}}><b>{data.sheets.length}</b> hojas</span>
        <span style={{fontSize:12.5,color:C.slate}}><b>{new Set(data.recs.map(r=>r.cust)).size}</b> clientes</span>
        <span style={{fontSize:12.5,color:data.warns?C.red:C.green}}><b>{data.warns}</b> con advertencia</span>
        <span style={{fontSize:12,color:C.label}}>{data.sheets.map(s=>s.sn+" ("+(s.nohdr?"sin encabezado":s.n)+")").join(" · ")}</span>
      </div>
      <div style={{border:"1px solid "+C.sep2,borderRadius:10,overflow:"auto",background:"#fff",maxHeight:420}}>
        <table style={{borderCollapse:"collapse",minWidth:1000}}>
          <thead><tr style={{background:C.ink,position:"sticky",top:0}}>
            {["Cliente","Commodity","Ruta","Scope","Vigencia","20' costo base","Nav","40' costo base","Nav","⚠"].map((h,i)=><th key={i} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {data.recs.slice(0,250).map((r,i)=>(<tr key={i} style={{background:r.w.length?"#FFFBFB":"#fff"}}>
              <td style={{...td,fontWeight:"bold",color:C.slate}}>{r.cust}</td>
              <td style={td}>{(()=>{const mc=matchCommodity(r.com);return mc?<span title={"→ "+mc.com}>{mc.com}<span style={{color:C.green,fontSize:10}}> ✓</span></span>:(r.com?<span style={{color:C.red}}>{r.com} · sin catálogo</span>:"—");})()}</td>
              <td style={td}><span style={{color:C.label}}>{r.ori}</span> › {r.pol} › {r.dest}</td>
              <td style={td}><Chip>{r.scope}{r.mode?(" · "+r.mode):""}</Chip></td>
              <td style={{...td,color:C.label}}>{String(r.exp||"—")}</td>
              <td style={{...td,textAlign:"right",color:C.slate}}>{r.cost20!=null?money(r.cost20):""}</td>
              <td style={td}>{navTag(r.nav20)}</td>
              <td style={{...td,textAlign:"right",color:C.slate}}>{r.cost40!=null?money(r.cost40):""}</td>
              <td style={td}>{navTag(r.nav40)}</td>
              <td style={{...td,fontSize:10,color:C.red}}>{r.w.join("; ")}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14}}>
        <span style={{fontSize:11,color:C.label}}>{busy&&prog?("Insertando… "+prog.done+"/"+prog.totalC+" clientes · "+(prog.lineas||0)+" líneas"):("Mostrando "+Math.min(data.recs.length,250)+" de "+data.recs.length+". Navieras en rojo no están en el catálogo.")}</span>
        <Btn kind="green" onClick={doImport} disabled={busy}>{busy?"Importando…":"Importar "+data.recs.length+" costos como tarifa base"}</Btn>
      </div>
    </>)}
  </div>);
}
