import React, { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { C, puertoNombre, parseFletesBase, validarFletesBase, TRADELANES, COMMODITIES } from "./lib.js";
import { Btn } from "./ui.jsx";
import { listFletesBase, upsertFletesBase, deleteFleteBase, deleteFletesBaseTodos, saveFletesArchivo, listFletesArchivos, getFletesArchivo, reporteFletesEnCotizaciones } from "./db.js";

// Encabezados del template del catálogo (deben coincidir con lo que lee parseFletesBase)
const HDR_TEMPLATE=["Origen","Transp Mode Origen","POL","POD","Destination","Transp Mode Destino","T.T.","Tarifa Base 20'","Tarifa Base 40'/40HC","Carrier","Tradelane","Srvc. Mode","Producto","Vig desde","Vig hasta"];
const _b64FromBuffer=(buf)=>{ let bin=""; const bytes=new Uint8Array(buf); const CH=0x8000; for(let i=0;i<bytes.length;i+=CH){ bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+CH)); } return btoa(bin); };
const _descargarB64=(b64,nombre)=>{ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); const blob=new Blob([arr],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=nombre||"fletes_base.xlsx"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); };

const hoyISO=()=>new Date().toISOString().slice(0,10);
const fFecha=(s)=>{ if(!s) return ""; try{ const d=String(s).includes("T")?new Date(s):new Date(s+"T12:00:00"); return d.toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"2-digit"});}catch{return String(s);} };
const vigHoy=(a,b)=>{ const h=hoyISO(); if(a&&a>h) return false; if(b&&b<h) return false; return (a||b)?true:false; };

export function FletesBase({ role }){
  const [rows,setRows]=useState(null);
  const [versiones,setVersiones]=useState([]);
  const [q,setQ]=useState("");
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const [reporte,setReporte]=useState(null);
  const fileRef=useRef(null);
  const isAdmin = role==="admin";

  const reload=()=>{ setRows(null); listFletesBase().then(({rows,error})=>{ if(error){ setMsg("Error al cargar: "+error); setRows([]); } else setRows(rows||[]); }); listFletesArchivos().then(({rows})=>setVersiones(rows||[])); };
  useEffect(()=>{ reload(); },[]);

  const bajarPlantilla=async()=>{
    const OPC_CARRIER=["CMA","Hapag","Maersk","MSC"];
    const OPC_SRVC=["CY-CY","DR-CY","CY-DR","DR-DR"];
    const OPC_MODO=["All Truck","Rail+Truck","Rail Ramp","Truck Ramp","Barge"];
    const OPC_TL=TRADELANES.map(t=>t.code);
    const OPC_PROD=COMMODITIES.map(c=>c.com);
    const wb=new ExcelJS.Workbook();
    const ws=wb.addWorksheet("Fletes base",{views:[{state:"frozen",ySplit:1}]});
    const L=wb.addWorksheet("Listas"); L.state="veryHidden";
    const col=(arr,c)=>{ arr.forEach((v,i)=>{ L.getCell(i+1,c).value=v; }); return L.getColumn(c).letter; };
    const colTL=col(OPC_TL,1), colProd=col(OPC_PROD,2), colCarr=col(OPC_CARRIER,3), colSrvc=col(OPC_SRVC,4), colModo=col(OPC_MODO,5);
    const rng=(letter,n)=>"Listas!$"+letter+"$1:$"+letter+"$"+n;

    ws.columns=HDR_TEMPLATE.map((h,i)=>({ header:h, width:[13,17,14,16,14,17,7,14,16,10,10,10,20,12,12][i]||14 }));
    const hr=ws.getRow(1); hr.height=20;
    hr.eachCell((c)=>{ c.font={name:"Arial",bold:true,size:9,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1A1A1A"}}; c.alignment={horizontal:"center",vertical:"middle"}; c.border={bottom:{style:"thin",color:{argb:"FF000000"}}}; });

    // fila 2: EJEMPLO/guía (el app la ignora: Origen empieza con "EJEMPLO")
    const ej=["EJEMPLO Guadalajara","All Truck","Manzanillo, MX","Ningbo","","","28","","1650","Maersk","TPWB","DR-CY","Steel Products","2026-07-01","2026-07-31"];
    const er=ws.getRow(2); ej.forEach((v,i)=>{ er.getCell(i+1).value=v; });
    er.eachCell((c)=>{ c.font={name:"Arial",italic:true,size:9,color:{argb:"FF8A939C"}}; });

    const dv=(colIdx,ref)=>{ for(let r=2;r<=400;r++){ ws.getCell(r,colIdx).dataValidation={ type:"list", allowBlank:true, formulae:["="+ref] }; } };
    dv(2,  rng(colModo,OPC_MODO.length));     // Transp Mode Origen
    dv(6,  rng(colModo,OPC_MODO.length));     // Transp Mode Destino
    dv(10, rng(colCarr,OPC_CARRIER.length));  // Carrier
    dv(11, rng(colTL,  OPC_TL.length));       // Tradelane
    dv(12, rng(colSrvc,OPC_SRVC.length));     // Srvc. Mode
    dv(13, rng(colProd,OPC_PROD.length));     // Producto

    ws.autoFilter="A1:"+ws.getColumn(HDR_TEMPLATE.length).letter+"1";
    const buf=await wb.xlsx.writeBuffer();
    const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="Plantilla_fletes_base.xlsx"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const bajarVersion=async(v)=>{ const { b64, nombre, error }=await getFletesArchivo(v.id); if(error||!b64){ alert("No se pudo descargar: "+(error||"vacío")); return; } _descargarB64(b64, nombre||v.nombre); };

  const onFile=async(e)=>{
    const f=e.target.files&&e.target.files[0]; if(e.target) e.target.value=""; if(!f) return;
    setBusy(true); setMsg(""); setReporte(null);
    try{
      const buf=await f.arrayBuffer();
      const wb=XLSX.read(buf,{type:"array",cellDates:true});
      const sheet=wb.SheetNames[0];
      const aoa=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:null});
      const v=validarFletesBase(aoa);
      if(!v.ok){
        setReporte({ nombre:f.name, bloqueos:v.bloqueos, avisos:v.avisos, resumen:v.resumen });
        setMsg("\u26D4 No se subió: el archivo tiene "+v.bloqueos.length+" problema(s) que debes corregir primero.");
        setBusy(false); return;
      }
      const { guardados, errores }=await upsertFletesBase(v.registros);
      try{ await saveFletesArchivo({ nombre:f.name, b64:_b64FromBuffer(buf), filas:guardados }); }catch(_){}
      setReporte(v.avisos.length?{ nombre:f.name, bloqueos:[], avisos:v.avisos, resumen:v.resumen }:null);
      setMsg((errores.length?"\u26A0 ":"\u2713 ")+"Catálogo reemplazado · "+guardados+" flete(s) base"+(v.avisos.length?(" · "+v.avisos.length+" aviso(s)"):"")+(errores.length?(" · errores: "+errores.slice(0,2).join(" · ")):"")+".");
      reload();
    }catch(ex){ setMsg("No se pudo procesar: "+ex.message); }
    setBusy(false);
  };

  const bajar=()=>{
    const data=(rows||[]);
    const head=["Origen","POL","POL nombre","POD","POD nombre","Destino","Equipo","Naviera","Producto","Flete Base","Moneda","Tradelane","Pre-carriage","On-carriage","T.T.","Vig desde","Vig hasta","Vigente hoy"];
    const aoa=[head,...data.map(r=>[r.origen,r.pol,puertoNombre(r.pol),r.pod,puertoNombre(r.pod),r.destino,r.equipo,r.naviera,r.producto,r.flete_base,r.moneda,r.tradelane,r.precarriage_mode,r.oncarriage_mode,r.tt,r.vig_desde||"",r.vig_hasta||"",vigHoy(r.vig_desde,r.vig_hasta)?"Sí":"No"])];
    const ws=XLSX.utils.aoa_to_sheet(aoa); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Fletes base");
    XLSX.writeFile(wb,"Catalogo_fletes_base_"+hoyISO()+".xlsx");
  };

  const bajarReporte=async()=>{
    setBusy(true);
    let res; try{ res=await reporteFletesEnCotizaciones(); }catch(ex){ res={rows:[],error:ex.message}; }
    setBusy(false);
    if(res.error){ alert("Error al generar el reporte: "+res.error); return; }
    if(!res.rows.length){ alert("No hay fletes base en cotizaciones todavía."); return; }
    const head=["Cliente","No. Acuerdo","Modo","Folio","AM","Dir","Tradelane","Producto","Origen","POL","POL nombre","POD","POD nombre","Destino","Equipo","Naviera","Flete Base","Recargos","Profit","Tarifa al cliente","T.T.","Vig desde","Vig hasta","Estatus","Actualizado"];
    const filas=res.rows.map(r=>[r.cliente,r.no_acuerdo,r.modo,r.codigo,r.am||"",r.direccion==="I"?"Imp":"Exp",r.tradelane,r.producto,r.origen,r.pol,puertoNombre(r.pol),r.pod,puertoNombre(r.pod),r.destino,r.equipo,r.naviera,Number(r.flete_base)||0,Number(r.recargos)||0,Number(r.profit)||0,Number(r.tarifa_cliente)||0,r.transito||"",r.vig_desde||"",r.vig_hasta||"",r.estatus,r.updated_at?String(r.updated_at).slice(0,10):""]);
    const wb=new ExcelJS.Workbook();
    const ws=wb.addWorksheet("Fletes en cotizaciones",{views:[{state:"frozen",ySplit:1}]});
    ws.columns=head.map(h=>({ header:h, width:Math.min(Math.max(h.length+2,9),24) }));
    const hr=ws.getRow(1); hr.height=20;
    hr.eachCell((c)=>{ c.font={name:"Arial",bold:true,size:9,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1A1A1A"}}; c.alignment={horizontal:"center",vertical:"middle"}; });
    filas.forEach(f=>{ const row=ws.addRow(f); row.font={name:"Arial",size:9}; });
    ["Q","R","S","T"].forEach(col=>{ ws.getColumn(col).numFmt="$#,##0"; });   // Flete Base, Recargos, Profit, Tarifa al cliente
    ws.autoFilter="A1:"+ws.getColumn(head.length).letter+"1";
    const buf=await wb.xlsx.writeBuffer();
    const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="Reporte_fletes_en_cotizaciones_"+hoyISO()+".xlsx"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const borrar=async(id)=>{ if(!confirm("¿Eliminar este flete base del catálogo?")) return; const {error}=await deleteFleteBase(id); if(error) alert(error); else reload(); };
  const vaciar=async()=>{ if(!confirm("¿Vaciar TODO el catálogo de fletes base? Esta acción no se puede deshacer.")) return; const {error}=await deleteFletesBaseTodos(); if(error) alert(error); else reload(); };

  const filtered=useMemo(()=>{ const s=q.trim().toLowerCase(); if(!s) return rows||[]; return (rows||[]).filter(r=>(r.pol+" "+r.pod+" "+puertoNombre(r.pol)+" "+puertoNombre(r.pod)+" "+r.naviera+" "+r.producto+" "+r.origen+" "+r.destino+" "+r.tradelane).toLowerCase().includes(s)); },[rows,q]);

  const th={fontSize:9,letterSpacing:.4,textTransform:"uppercase",color:"#fff",fontWeight:"bold",padding:"7px 8px",textAlign:"left",whiteSpace:"nowrap",background:C.slate,position:"sticky",top:0};
  const td={padding:"6px 8px",borderBottom:"1px solid "+C.sep,fontSize:12,whiteSpace:"nowrap"};

  return (<div style={{maxWidth:1240,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,gap:12,flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:16,fontWeight:"bold",color:C.ink}}>Catálogo de fletes base</div>
        <div style={{fontSize:12,color:C.label,maxWidth:620}}>Repositorio de referencia. Sube tu Excel de fletes base; sirve para consultar y, dentro de una cotización, se te avisa si hay coincidencias — pero nunca se aplica solo.</div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input type="file" ref={fileRef} accept=".xlsx,.xls" style={{display:"none"}} onChange={onFile}/>
        <Btn kind="ghost" small onClick={bajarPlantilla}>⬇ Plantilla vacía</Btn>
        <Btn kind="primary" small onClick={()=>fileRef.current&&fileRef.current.click()} disabled={busy}>{busy?"Procesando…":"⇪ Subir catálogo (Excel)"}</Btn>
        <Btn kind="ghost" small onClick={bajar} disabled={!(rows&&rows.length)}>⬇ Bajar catálogo</Btn>
        <Btn kind="ghost" small onClick={reload}>↻</Btn>
        {isAdmin&&rows&&rows.length>0&&<Btn kind="ghost" small onClick={vaciar}>Vaciar</Btn>}
        <span style={{width:1,alignSelf:"stretch",background:C.sep2,margin:"0 2px"}}/>
        <Btn kind="ghost" small onClick={bajarReporte} disabled={busy} title="Excel con los fletes base usados dentro de las cotizaciones (independiente del catálogo)">⬇ Reporte de cotizaciones</Btn>
      </div>
    </div>

    {msg&&<div style={{background:(msg[0]==="\u26D4"||msg[0]==="\u26A0"||msg.startsWith("No")||msg.startsWith("Error"))?"#FCEEF0":"#E8F5EC",border:"1px solid "+C.sep2,borderRadius:8,padding:"8px 12px",fontSize:12.5,color:C.slate,marginBottom:12}}>{msg}</div>}

    {reporte&&<div style={{border:"1px solid "+C.sep2,borderRadius:10,background:"#fff",padding:14,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:13,fontWeight:"bold",color:C.ink}}>{reporte.bloqueos.length?"Corrige estos problemas para poder subir":"Se subió con avisos"} <span style={{fontWeight:"normal",color:C.label,fontSize:12}}>· {reporte.nombre}</span></div>
        <span onClick={()=>setReporte(null)} style={{cursor:"pointer",fontSize:12,color:C.label}}>cerrar \u2715</span>
      </div>
      <div style={{fontSize:11.5,color:C.label,marginBottom:10}}>Filas de datos: {reporte.resumen.filasDatos||0} · Registros válidos: {reporte.resumen.registros||0}{reporte.resumen.omitidas?(" · Omitidas sin tarifa: "+reporte.resumen.omitidas):""}</div>
      {reporte.bloqueos.length>0&&<div style={{marginBottom:reporte.avisos.length?10:0}}>
        <div style={{fontSize:11,fontWeight:"bold",color:C.red,textTransform:"uppercase",letterSpacing:.4,marginBottom:4}}>\u26D4 Bloqueantes ({reporte.bloqueos.length})</div>
        <div style={{maxHeight:180,overflow:"auto",border:"1px solid "+C.sep2,borderRadius:6}}>
          {reporte.bloqueos.map((b,i)=>(<div key={i} style={{fontSize:12,padding:"4px 10px",borderBottom:i<reporte.bloqueos.length-1?"1px solid "+C.sep:"none",color:C.slate}}><b style={{color:C.red}}>Fila {b.fila}:</b> {b.motivo}</div>))}
        </div>
      </div>}
      {reporte.avisos.length>0&&<div>
        <div style={{fontSize:11,fontWeight:"bold",color:"#8A6D1F",textTransform:"uppercase",letterSpacing:.4,marginBottom:4}}>\u26A0 Avisos ({reporte.avisos.length})</div>
        <div style={{maxHeight:140,overflow:"auto",border:"1px solid "+C.sep2,borderRadius:6}}>
          {reporte.avisos.slice(0,40).map((a,i)=>(<div key={i} style={{fontSize:12,padding:"4px 10px",borderBottom:i<Math.min(reporte.avisos.length,40)-1?"1px solid "+C.sep:"none",color:C.slate}}><b style={{color:"#8A6D1F"}}>Fila {a.fila}:</b> {a.motivo}</div>))}
          {reporte.avisos.length>40&&<div style={{fontSize:11,padding:"4px 10px",color:C.label}}>…y {reporte.avisos.length-40} aviso(s) más.</div>}
        </div>
      </div>}
    </div>}

    {versiones.length>0&&<div style={{background:"#F7F9FB",border:"1px solid "+C.sep2,borderRadius:8,padding:"8px 12px",marginBottom:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:11,fontWeight:"bold",color:C.slate,textTransform:"uppercase",letterSpacing:.4}}>Versiones subidas</span>
      {versiones.map((v,i)=>(<span key={v.id} style={{fontSize:12,color:C.slate,display:"inline-flex",alignItems:"center",gap:6,background:"#fff",border:"1px solid "+C.sep2,borderRadius:6,padding:"3px 8px"}}>
        {i===0&&<span style={{fontSize:9,fontWeight:"bold",color:"#fff",background:C.green,borderRadius:3,padding:"1px 5px"}}>ACTUAL</span>}
        <span>{v.nombre}</span>
        <span style={{color:C.label,fontSize:11}}>· {v.filas} filas · {fFecha(v.created_at)}</span>
        <span onClick={()=>bajarVersion(v)} title="Descargar esta versión" style={{cursor:"pointer",color:C.red,fontWeight:"bold"}}>⬇</span>
      </span>))}
      <span style={{fontSize:10.5,color:C.label}}>Se conservan las 2 últimas, sólo para consulta.</span>
    </div>}

    <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar puerto, naviera, producto, tradelane…" style={{padding:"8px 11px",border:"1px solid "+C.sep2,borderRadius:6,fontSize:13,width:340}}/>
      {rows&&<span style={{fontSize:12,color:C.label}}>{filtered.length} de {rows.length} registro(s)</span>}
    </div>

    {rows===null?<div style={{color:C.label,fontSize:13,padding:20}}>Cargando…</div>:
     rows.length===0?<div style={{border:"1px solid "+C.sep2,borderRadius:10,background:"#fff",padding:28,textAlign:"center",color:C.label,fontSize:13}}>Catálogo vacío. Sube un Excel de fletes base para empezar.</div>:(
      <div style={{border:"1px solid "+C.sep2,borderRadius:10,overflow:"auto",background:"#fff",maxHeight:"70vh"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>{["Origen","POL","POD","Destino","Eq.","Naviera","Producto","Flete base","Tradelane","Vigencia",""].map((h,i)=><th key={i} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(r=>{const viv=vigHoy(r.vig_desde,r.vig_hasta);const venc=r.vig_hasta&&r.vig_hasta<hoyISO();
              return (<tr key={r.id}>
                <td style={td}>{r.origen||"—"}</td>
                <td style={td} title={puertoNombre(r.pol)}>{r.pol}</td>
                <td style={td} title={puertoNombre(r.pod)}>{r.pod}</td>
                <td style={td}>{r.destino||"—"}</td>
                <td style={td}>{r.equipo}</td>
                <td style={{...td,fontWeight:"bold"}}>{r.naviera}</td>
                <td style={td}>{r.producto||"—"}</td>
                <td style={{...td,textAlign:"right",fontWeight:"bold",color:C.red,fontVariantNumeric:"tabular-nums"}}>${Number(r.flete_base).toLocaleString()}</td>
                <td style={{...td,fontSize:11,color:C.label}}>{r.tradelane||"—"}</td>
                <td style={{...td,fontSize:11,color:venc?C.label:C.slate}}>{(r.vig_desde||r.vig_hasta)?(fFecha(r.vig_desde)+" – "+(r.vig_hasta?fFecha(r.vig_hasta):"…")):"—"}{viv&&<span style={{marginLeft:6,fontSize:9.5,fontWeight:"bold",color:C.green,background:C.greenBg,border:"1px solid "+C.sep2,borderRadius:4,padding:"1px 5px"}}>vigente</span>}</td>
                <td style={{...td,textAlign:"right"}}><span onClick={()=>borrar(r.id)} title="Eliminar" style={{cursor:"pointer",color:C.label,fontWeight:"bold"}}>🗑</span></td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>);
}
