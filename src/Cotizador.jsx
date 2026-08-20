import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import { C, F, EQUIPOS, EQUIPO_CATS, NAVIERAS, navName, CATALOG, COMMODITY_INDUSTRIAS, tx, scopeFull, serviceMode, transportMode, n, round10, adicPorCont, cargosBL, inclPorCont, inclBL, subjectTo, enPrecio, esSubjectTo, money, MONEDAS, optPuertos, optCiudades, puertoNombre, paisOrigen, paisDestino, rutaPaisLabel, tlDe, tlLabel, TRADELANES, tradeLabel, rutaEnTradelane, opcionActivaEq, mejorOpcionEq, ordenOpciones, ordenRecargos, ovRazon, PLANTILLA_RECARGOS, parseTarifario, ordenarRutas } from "./lib.js";
import { inS, Lbl, Field, TI, Sel, Chip, Btn, ClaveAutocomplete, ComboBox } from "./ui.jsx";
import { saveCotizacion, loadVersion, markEnviada, nuevaVersion, crearCliente, altaSurcharge, listSurcharges, recargosDeRutaSimilar, recargosDeRutaSimilarPorNaviera, recargosDeNaviera, anclarVenta, checkConflictoTarifa, guardarCorreccion, buscarCoincidenciasRecargo, aplicarRecargoEnBorradores, buscarRutasSimilares } from "./db.js";
import { abrirCotizacion } from "./quote.js";
import { exportarExcel } from "./quoteExcel.js";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

function SurchargeGrid({surs,onChange,catalog,dir,equipos,editable=true,onPropagar}){
  const cat=catalog||CATALOG;
  const rows=surs||[];
  const eqsQ=EQUIPOS.filter(e=>(equipos||[]).includes(e.k));
  const e20=eqsQ.find(e=>e.teu<2)||{k:"20DV",teu:1};
  const e40=eqsQ.find(e=>e.teu>=2)||{k:"40HC",teu:2};
  const [openSize,setOpenSize]=useState({});
  const set=(i,p)=>onChange(rows.map((x,j)=>j===i?{...x,...p}:x));
  const add=()=>onChange([...rows,{c:"",d:"",monto:"",moneda:"USD",incluido:false,desplegar:true,pago:"prepaid",basis:"contenedor"}]);
  const del=(i)=>onChange(rows.filter((_,j)=>j!==i));
  const onClave=(i,val)=>{const h=cat.find(x=>x.c.toUpperCase()===val.trim().toUpperCase());set(i,(h&&!tx(rows[i].d))?{c:h.c,d:h.d}:{c:val});};
  const th={fontSize:9.5,letterSpacing:.5,textTransform:"uppercase",color:C.label,fontWeight:"bold",textAlign:"left",padding:"4px 6px"};
  const td={padding:"3px 6px"};const cell={...inS,padding:"5px 7px",fontSize:12.5};
  return (<div style={{border:"1px solid "+C.sep2,borderRadius:8,background:"#fff"}}>
    <table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr style={{background:C.soft,borderBottom:"1px solid "+C.sep2}}>
        <th style={{...th,width:"11%"}}>Clave</th><th style={{...th,width:"22%"}}>Descripción</th><th style={{...th,width:"10%"}}>Monto</th><th style={{...th,width:"9%"}}>Mon.</th>
        <th style={{...th,width:"12%"}}>Base cobro</th><th style={{...th,width:"8%",textAlign:"center"}}>No Incl.</th><th style={{...th,width:"7%",textAlign:"center"}}>INCL.</th><th style={{...th,width:"8%",textAlign:"center"}}>Mostrar</th><th style={{...th,width:"10%"}}>Pago</th><th style={{...th,width:"3%"}}></th></tr></thead>
      <tbody>
        {rows.length===0&&<tr><td colSpan={10} style={{padding:10,textAlign:"center",color:C.label,fontSize:12}}>Sin recargos — agrega filas</td></tr>}
        {ordenRecargos(rows).map((i)=>{const r=rows[i];const hasSizes=r.montos&&Object.values(r.montos).some(v=>v!==""&&v!=null);return (<React.Fragment key={i}>
        <tr style={{borderBottom:openSize[i]?"none":"1px solid "+C.sep}}>
          <td style={td}><ClaveAutocomplete value={r.c} catalog={cat} cellStyle={cell} onChange={(v)=>onClave(i,v)} onPick={(x)=>set(i,{c:x.c,d:tx(rows[i].d)?rows[i].d:x.d})}/></td>
          <td style={td}><input value={r.d} onChange={e=>set(i,{d:e.target.value})} placeholder="Descripción" style={cell}/></td>
          <td style={td}><input value={r.monto} onChange={e=>set(i,{monto:e.target.value})} onFocus={e=>e.target.select()} inputMode="decimal" placeholder="0" style={{...cell,textAlign:"right"}}/><div><span onClick={()=>setOpenSize(o=>({...o,[i]:!o[i]}))} title="Montos distintos por tipo de contenedor" style={{cursor:"pointer",fontSize:9,fontWeight:"bold",color:hasSizes?C.red:C.label}}>⊞ por tamaño{hasSizes?" ✓":""}</span></div></td>
          <td style={td}><input list="monedas-dl" value={r.moneda} onChange={e=>set(i,{moneda:e.target.value.toUpperCase()})} placeholder="USD" style={{...cell,padding:"5px 6px",textTransform:"uppercase"}}/></td>
          <td style={td}><select value={r.basis||"contenedor"} onChange={e=>set(i,{basis:e.target.value})} style={{...cell,padding:"5px 4px"}}><option value="contenedor">Contenedor</option><option value="teu">TEU</option><option value="bl">BL</option></select></td>
          <td style={{...td,textAlign:"center"}}><input type="checkbox" checked={!r.incluido} onChange={()=>set(i,{incluido:false})} title="No incluido por la naviera (si es Prepaid, se suma al costo)"/></td>
          <td style={{...td,textAlign:"center"}}><input type="checkbox" checked={!!r.incluido} onChange={()=>set(i,{incluido:true})} title="Incluido en la tarifa base (no se suma)"/></td>
          <td style={{...td,textAlign:"center"}}><input type="checkbox" checked={r.desplegar!==false} onChange={e=>set(i,{desplegar:e.target.checked})} title="Mostrar en el PDF (sección Incluyen / No incluyen)"/></td>
          <td style={td}><select value={r.pago} onChange={e=>set(i,{pago:e.target.value})} style={{...cell,padding:"5px 4px"}}><option value="prepaid">Prepaid</option><option value="collect">Collect</option></select></td>
          <td style={{...td,textAlign:"center"}}>{editable&&onPropagar&&tx(r.c)&&<span onClick={()=>onPropagar(r)} title="Propagar este recargo a otros borradores (misma naviera + países)" style={{cursor:"pointer",color:C.slate,fontWeight:"bold",marginRight:8}}>⇄</span>}{editable&&<span onClick={()=>del(i)} style={{cursor:"pointer",color:C.label,fontWeight:"bold"}}>✕</span>}</td>
        </tr>
        {openSize[i]&&<tr style={{borderBottom:"1px solid "+C.sep,background:C.soft}}><td colSpan={10} style={{padding:"6px 10px"}}>
          <span style={{fontSize:10,color:C.label,fontWeight:"bold",marginRight:10}}>Monto por tamaño (vacío = usa el general{r.monto?" $"+r.monto:""}):</span>
          {eqsQ.length===0&&<span style={{fontSize:11,color:C.label}}>Selecciona equipos arriba para capturar por tamaño.</span>}
          {eqsQ.map(eq=>(<span key={eq.k} style={{display:"inline-flex",alignItems:"center",gap:4,marginRight:12,marginBottom:2}}><span style={{fontSize:11,color:C.slate}}>{eq.t}</span><input value={(r.montos&&r.montos[eq.k])||""} onChange={e=>set(i,{montos:{...(r.montos||{}),[eq.k]:e.target.value}})} onFocus={e=>e.target.select()} inputMode="decimal" placeholder={r.monto||"0"} style={{...cell,width:60,textAlign:"right",padding:"3px 6px"}}/></span>))}
        </td></tr>}
        </React.Fragment>);})}
      </tbody>
    </table>
    <datalist id="monedas-dl">{MONEDAS.map(m=><option key={m.code} value={m.code}>{m.code+" · "+m.name}</option>)}</datalist>
    <div style={{padding:"7px 9px",borderTop:"1px solid "+C.sep2,background:C.soft,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
      {editable&&<span onClick={add} style={{cursor:"pointer",color:C.red,fontWeight:"bold",fontSize:12.5}}>＋ Agregar recargo</span>}
      <span style={{fontSize:11,color:C.label}}>
        <span style={{color:C.green,fontWeight:"bold"}}>Incluidos:</span> <b style={{color:C.slate}}>{money(inclPorCont(rows,e20))}</b>/20' · <b style={{color:C.slate}}>{money(inclPorCont(rows,e40))}</b>/40'{inclBL(rows)>0&&<span> · BL <b style={{color:C.slate}}>{money(inclBL(rows))}</b></span>}
        <span style={{margin:"0 8px",color:C.sep2}}>|</span>
        <span style={{color:C.red,fontWeight:"bold"}}>No incluidos (suman):</span> <b style={{color:C.slate}}>{money(adicPorCont(rows,e20,dir))}</b>/20' · <b style={{color:C.slate}}>{money(adicPorCont(rows,e40,dir))}</b>/40'{cargosBL(rows,dir)>0&&<span> · BL <b style={{color:C.slate}}>{money(cargosBL(rows,dir))}</b></span>}
      </span>
    </div>
  </div>);
}

function NavierasSection({quoteNav,setQuoteNav,rutas,catalog,onAlta,dir,equipos,onGenerar,foco,editable,onPropagarRec}){
  const [altaOpen,setAltaOpen]=useState(false);
  const [secCol,setSecCol]=useState(true);
  const [q,setQ]=useState("");
  const secColEff = q ? false : secCol;
  const [nc,setNc]=useState(""); const [nd,setNd]=useState("");
  const doAlta=async()=>{ const c=nc.trim().toUpperCase(); if(!c) return; await onAlta(c,nd.trim()); setNc(""); setNd(""); setAltaOpen(false); };
  // Bloques automáticos: uno por cada (naviera × tradelane país POL→POD) presente en las rutas
  const blocks=[]; const seen=new Set();
  (rutas||[]).forEach(r=>{ const tl=tlDe(r); (r.opciones||[]).forEach(o=>{ if(!o.navScac) return; const k=o.navScac+"|"+tl; if(seen.has(k)) return; seen.add(k); blocks.push({scac:o.navScac,tl}); }); });
  blocks.sort((a,b)=> a.scac===b.scac ? ((a.tl||"")<(b.tl||"")?-1:1) : (a.scac<b.scac?-1:1));
  const matchBlk=(b)=>{ const s=q.trim().toLowerCase(); if(!s) return true; return ((b.scac||"")+" "+navName(b.scac)+" "+tlLabel(b.tl)+" "+(b.tl||"")).toLowerCase().includes(s); };
  const blocksVis=blocks.filter(matchBlk);
  const surOf=(scac,tl)=>(quoteNav.find(q=>q.scac===scac&&(q.tl||"")===(tl||""))||{}).surcharges||[];
  // updater funcional: evita perder cambios si se encadenan dos ediciones seguidas
  const setSurs=(scac,tl,s)=>setQuoteNav(prev=>{ const arr=prev||[]; const idx=arr.findIndex(q=>q.scac===scac&&(q.tl||"")===(tl||"")); return idx>=0 ? arr.map((q,j)=>j===idx?{...q,surcharges:s}:q) : [...arr,{scac,tl,surcharges:s}]; });
  // Regresar del detalle de recargos a la primera tarifa de ese lane
  const irATarifa=(tl)=>{ const el=document.getElementById(eidTarifa(tl)); if(!el) return; el.scrollIntoView({behavior:"smooth",block:"center"}); const prev=el.style.boxShadow; el.style.transition="box-shadow .25s"; el.style.boxShadow="inset 0 0 0 2px "+C.red; setTimeout(()=>{ el.style.boxShadow=prev||""; },1400); };
  const copyFrom=(scac,tl,fromTl)=>{ if(!fromTl) return; const src=surOf(scac,fromTl); if(!src.length) return; if(surOf(scac,tl).length && !confirm("¿Reemplazar los recargos actuales con los de "+tlLabel(fromTl)+"?")) return; setSurs(scac,tl,src.map(x=>({...x}))); };
  const [colap,setColap]=useState({});
  const bkey=(b)=>b.scac+"|"+(b.tl||"");
  const eid=(b)=>"blk_"+b.scac+"_"+String(b.tl||"nl").replace(/[^A-Za-z0-9]/g,"_");
  // Arranca colapsado cuando hay más de 2 bloques (una sola vez, al aparecer)
  const colapInit=React.useRef(false);
  useEffect(()=>{ if(colapInit.current) return; if(blocks.length>0){ const m={}; blocks.forEach(b=>{m[bkey(b)]=true;}); setColap(m); colapInit.current=true; } },[blocks.length]);
  const toggle=(b)=>setColap(c=>({...c,[bkey(b)]:!c[bkey(b)]}));
  const setAll=(v)=>{ const m={}; blocks.forEach(b=>{m[bkey(b)]=v;}); setColap(m); };
  const allCol=blocks.length>0 && blocks.every(b=>colap[bkey(b)]);
  useEffect(()=>{ if(!foco||!foco.scac) return; const b={scac:foco.scac,tl:foco.tl}; setColap(c=>({...c,[bkey(b)]:false})); const t=setTimeout(()=>{ const el=document.getElementById(eid(b)); if(el) el.scrollIntoView({behavior:"smooth",block:"center"}); },60); return ()=>clearTimeout(t); },[foco]);
  return (<div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:12,padding:16,marginBottom:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:secColEff?0:10,flexWrap:"wrap",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <span onClick={()=>setSecCol(!secCol)} style={{fontSize:13,fontWeight:"bold",color:C.ink,cursor:"pointer",userSelect:"none"}}><span style={{color:C.label,marginRight:6}}>{secColEff?"▸":"▾"}</span>Navieras y recargos {secColEff?<span style={{fontWeight:"normal",color:C.label,fontSize:12}}>· {blocks.length} bloque(s) — clic para expandir</span>:<span style={{fontWeight:"normal",color:C.label,fontSize:12}}>· un bloque por naviera × lane (país POL → país POD), según tus rutas</span>}</span>
        {blocks.length>1&&<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar naviera, país origen/destino…" style={{...inS,fontSize:12,padding:"6px 9px",width:230}}/>}
        {q&&<span onClick={()=>setQ("")} title="Limpiar" style={{cursor:"pointer",fontSize:11,color:C.red}}>Limpiar</span>}
      </div>
      {!secColEff&&<div style={{display:"flex",gap:8,alignItems:"center"}}>
        {editable&&<Btn kind="ghost" small onClick={()=>setAltaOpen(!altaOpen)}>{altaOpen?"Cancelar":"＋ Alta de recargo"}</Btn>}
      </div>}
    </div>
    {!secColEff&&(<fieldset disabled={!editable} style={{border:"none",padding:0,margin:0,minWidth:0}}>
    {altaOpen&&(<div style={{display:"flex",gap:8,alignItems:"flex-end",background:C.soft,border:"1px solid "+C.sep2,borderRadius:8,padding:10,marginBottom:12}}>
      <Field label="Clave nueva" w={.6}><TI value={nc} onChange={e=>setNc(e.target.value.toUpperCase())} placeholder="EJ. ABC"/></Field>
      <Field label="Descripción"><TI value={nd} onChange={e=>setNd(e.target.value)} placeholder="Descripción del recargo"/></Field>
      <Btn kind="green" small onClick={doAlta}>Dar de alta</Btn>
      <span style={{fontSize:11,color:C.label,marginBottom:6}}>Queda en el catálogo y disponible en el autocompletado.</span>
    </div>)}
    {blocks.length===0&&<div style={{fontSize:12,color:C.label,padding:"6px 0"}}>Define rutas con naviera y POL/POD; por cada naviera y lane aparecerá aquí un bloque de recargos.</div>}
    {blocks.length>0&&blocksVis.length===0&&<div style={{fontSize:12,color:C.label,padding:"6px 0"}}>Sin coincidencias para "{q}".</div>}
    {blocksVis.map(b=>{ const surs=surOf(b.scac,b.tl); const others=blocks.filter(x=>x.scac===b.scac&&(x.tl||"")!==(b.tl||"")); const col=!!colap[bkey(b)]; return (
      <div key={b.scac+"|"+b.tl} id={eid(b)} style={{marginBottom:12,border:"1px solid "+C.sep,borderRadius:8,padding:"8px 10px",background:col?C.soft:"#fff"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span onClick={()=>toggle(b)} title={col?"Expandir":"Colapsar"} style={{cursor:"pointer",fontSize:13,color:C.label,fontWeight:"bold",width:14,display:"inline-block"}}>{col?"▸":"▾"}</span>
          <span onClick={()=>toggle(b)} style={{cursor:"pointer",fontSize:11,fontWeight:"bold",color:"#fff",background:C.slate,borderRadius:4,padding:"2px 8px",letterSpacing:1}}>{b.scac}</span>
          <span onClick={()=>toggle(b)} style={{cursor:"pointer",fontSize:13,fontWeight:"bold",color:C.slate}}>{navName(b.scac)}</span>
          <span onClick={()=>irATarifa(b.tl)} title="Regresar a la tarifa de este lane" style={{cursor:"pointer",fontSize:11,fontWeight:"bold",color:"#fff",background:C.red,borderRadius:4,padding:"2px 8px"}}>↩ {tlLabel(b.tl)}</span>
          {col&&<span style={{fontSize:11,color:C.label}}>· {surs.length?(surs.length+" recargo(s)"):"sin recargos"}</span>}
          {editable&&onGenerar&&<span onClick={()=>onGenerar(b.scac,b.tl)} title="Buscar coincidencias o generar recargos para esta naviera × lane" style={{cursor:"pointer",fontSize:11,fontWeight:"bold",color:surs.length?C.slate:"#fff",background:surs.length?C.soft:C.red,border:surs.length?("1px solid "+C.sep2):"none",borderRadius:6,padding:"3px 9px",marginLeft:col?8:4}}>⚡ {surs.length?"Regenerar":"Generar recargos"}</span>}
          {!col&&others.length>0&&<select value="" onChange={e=>copyFrom(b.scac,b.tl,e.target.value)} style={{...inS,padding:"4px 6px",fontSize:11.5,marginLeft:"auto",maxWidth:240}}>
            <option value="">⧉ Copiar recargos de otro lane…</option>
            {others.map(x=><option key={x.tl} value={x.tl}>{tlLabel(x.tl)}</option>)}
          </select>}
        </div>
        {!col&&<div style={{marginTop:6}}><SurchargeGrid surs={surs} catalog={catalog} dir={dir} equipos={equipos} editable={editable} onChange={(s)=>setSurs(b.scac,b.tl,s)} onPropagar={onPropagarRec?(sur)=>onPropagarRec(b.scac,b.tl,sur):null}/></div>}
      </div>);
    })}
    </fieldset>)}
  </div>);
}

// id del ancla de tarifas por lane (para regresar desde el bloque de recargos)
export const eidTarifa=(tl)=>"trf_"+String(tl||"nl").replace(/[^A-Za-z0-9]/g,"_");
function TarifasGrid({rutas,setRutas,quoteNav,equipos,dir,onFoco,editarProp,filtro,editable=true,onPropagar,onSimilares}){
  // primera ruta de cada lane: ahí ponemos el ancla
  const tlAnchor={}; (rutas||[]).forEach((r,ri)=>{ const t=tlDe(r); if(tlAnchor[t]==null) tlAnchor[t]=ri; });
  const navOpts=[{v:"",t:"— naviera —"},...NAVIERAS.map(x=>({v:x.scac,t:x.scac+" · "+x.nombre}))];
  const surOf=(scac,tl)=>(quoteNav.find(q=>q.scac===scac&&(q.tl||"")===(tl||""))||{}).surcharges||[];
  const eqs=EQUIPOS.filter(e=>equipos.includes(e.k));
  const getP=(o,k)=>(o.precios&&o.precios[k])||{};
  const setP=(ri,oi,k,patch)=>setRutas(rutas.map((r,i)=>i!==ri?r:{...r,opciones:r.opciones.map((o,j)=>j!==oi?o:{...o,precios:{...(o.precios||{}),[k]:{...getP(o,k),...patch}}})}));
  const setOpt=(ri,oi,patch)=>setRutas(rutas.map((r,i)=>i!==ri?r:{...r,opciones:r.opciones.map((o,j)=>j===oi?{...o,...patch}:o)}));
  const addOpt=(ri)=>setRutas(rutas.map((r,i)=>i!==ri?r:{...r,opciones:[...r.opciones,{navScac:"",transito:"",precios:{}}],elegida:r.elegida??0}));
  const delOpt=(ri,oi)=>setRutas(rutas.map((r,i)=>i!==ri?r:{...r,opciones:r.opciones.filter((_,j)=>j!==oi)}));
  const totCosto=(o,r)=>eqs.reduce((a,e)=>a+n(getP(o,e.k).base)+adicPorCont(surOf(o.navScac,tlDe(r)),e,dir),0);
  const sugerida=(r)=>{if(!r.opciones.length)return -1;let bi=0,bc=Infinity;r.opciones.forEach((o,i)=>{const c=totCosto(o,r);if(c<bc){bc=c;bi=i;}});return bi;};
  const HDR=25; // alto aprox. de la 1ª fila del header (para anclar la 2ª debajo)
  const th={fontSize:9.5,letterSpacing:.3,textTransform:"uppercase",color:"#fff",fontWeight:"bold",padding:"6px 5px",whiteSpace:"nowrap",position:"sticky",top:0,background:C.ink,zIndex:2};
  const td={padding:"5px 5px",verticalAlign:"middle",borderBottom:"1px solid "+C.sep};
  const cell={...inS,padding:"5px 5px",fontSize:12,width:54,textAlign:"right"};
  return (<div style={{border:"1px solid "+C.sep2,borderRadius:10,overflow:"auto",background:"#fff",maxHeight:"72vh"}}>
    <table style={{borderCollapse:"collapse",width:"100%",minWidth:620+eqs.length*178}}>
      <thead>
        <tr style={{background:C.ink}}>
          <th rowSpan={2} style={{...th,textAlign:"left",zIndex:3}}>Ruta</th><th rowSpan={2} style={{...th,textAlign:"center",zIndex:3}}>Scope</th><th rowSpan={2} style={{...th,textAlign:"left",zIndex:3}}>Naviera</th><th rowSpan={2} style={{...th,textAlign:"center",zIndex:3}}>T.T.</th>
          {eqs.map(e=><th key={e.k} colSpan={4} style={{...th,textAlign:"center",borderLeft:"1px solid #333"}}>{e.t} <span style={{color:"#9aa4ae",fontWeight:"normal"}}>· {e.teu} TEU</span></th>)}
          <th rowSpan={2} style={{...th,textAlign:"left",borderLeft:"1px solid #333",zIndex:3}}>Subject to</th><th rowSpan={2} style={{...th,textAlign:"center",zIndex:3}}></th>
        </tr>
        <tr style={{background:C.ink}}>{eqs.map(e=>[<th key={e.k+"b"} style={{...th,top:HDR,textAlign:"right",borderLeft:"1px solid #333"}}>Base</th>,<th key={e.k+"r"} style={{...th,top:HDR,textAlign:"right"}}>Recargos</th>,<th key={e.k+"p"} style={{...th,top:HDR,textAlign:"right"}}>Profit</th>,<th key={e.k+"v"} style={{...th,top:HDR,textAlign:"right"}}>Venta</th>])}</tr>
      </thead>
      <tbody>
        {rutas.map((r,ri)=>{if(filtro&&!filtro(r)) return null;const sug=sugerida(r);const _tl=tlDe(r);const _anc=tlAnchor[_tl]===ri;
          return ordenOpciones(r,eqs,dir,surOf).map((oi,pos)=>{const o=r.opciones[oi];const surs=surOf(o.navScac,tlDe(r)),st=surs.filter(s=>esSubjectTo(s,dir)&&s.desplegar!==false).map(s=>s.c),bl=cargosBL(surs,dir),first=pos===0;
            return (<tr key={ri+"-"+oi} id={(first&&_anc)?eidTarifa(_tl):undefined} style={{background:first?"#fff":C.soft}}>
              <td style={{...td,borderTop:first?"2px solid "+C.sep2:"none"}}>{first?<div style={{fontSize:12.5}}><b style={{color:C.slate}}>{r.pol}</b><span style={{color:"#C0C7CE",margin:"0 4px"}}>›</span><b style={{color:C.slate}}>{r.pod}</b><div style={{fontSize:10.5,color:C.label,marginTop:1,lineHeight:1.25}}>{r.origen?r.origen+" › ":""}{puertoNombre(r.pol)} › {puertoNombre(r.pod)}{r.destino?" › "+r.destino:""}</div></div>:<span style={{fontSize:11,color:C.label}}>↳ alt.</span>}</td>
              <td style={{...td,textAlign:"center",borderTop:first?"2px solid "+C.sep2:"none"}}>{first&&<span><Chip>{serviceMode(r)}</Chip>{transportMode(r)&&<div style={{fontSize:9,color:C.label,marginTop:2,fontWeight:"bold"}}>{transportMode(r)}</div>}</span>}</td>
              <td style={td}><select value={o.navScac} onChange={e=>setOpt(ri,oi,{navScac:e.target.value})} style={{...inS,padding:"5px 4px",fontSize:11.5,fontWeight:"bold",width:126,maxWidth:140}}>{navOpts.map(x=><option key={x.v} value={x.v}>{x.t}</option>)}</select></td>
              <td style={{...td,textAlign:"center"}}><input value={o.transito||""} onChange={e=>setOpt(ri,oi,{transito:e.target.value})} inputMode="numeric" placeholder="días" style={{...inS,padding:"5px 4px",fontSize:12,width:42,textAlign:"center"}}/></td>
              {eqs.map(e=>{const p=getP(o,e.k);const base=n(p.base),prof=n(p.profit);const adic=adicPorCont(surs,e,dir);const venta=base+adic+prof;const _best=mejorOpcionEq(r,e.k,e,dir,surOf);const _act=opcionActivaEq(r,e.k,e,dir,surOf)===oi;const _isBest=_act&&oi===_best;const _razon=ovRazon(r.elegidaEq&&r.elegidaEq[e.k]);
                const _summ=surs.filter(s=>!s.incluido&&enPrecio(s,dir)&&(s.basis||"contenedor")!=="bl");
                const _contrib=(s)=>{const perEq=s.montos&&s.montos[e.k]!=null&&s.montos[e.k]!=="";const bas=s.basis||"contenedor";return perEq?n(s.montos[e.k]):n(s.monto)*(bas==="teu"?e.teu:1);};
                const _tip=o.navScac?(o.navScac+" · "+tlLabel(tlDe(r))+"\nRecargos que suman ("+e.t+"):\n"+(_summ.length?_summ.map(s=>"• "+(s.c||"")+"  "+money(_contrib(s),s.moneda||"USD")).join("\n"):"(ninguno)")+"\n= "+money(adic)):"";
                const _ancla=(r.ventaAncla&&r.ventaAncla[e.k]!=null)?Number(r.ventaAncla[e.k]):null;
                const _anchored=_ancla!=null;
                const _hasBase=base>0;
                const _profitR=_anchored?(_hasBase?(_ancla-base-adic):null):prof;
                const _pcol=(_profitR==null)?C.label:(_profitR<=0?"#C8202E":(_profitR<250?"#8A6D1F":"#0B7A3B"));
                const _locked=_anchored&&!editarProp;
                const _modif=_anchored&&editarProp&&round10(venta)!==_ancla;
                return [<td key={e.k+"b"} style={{...td,borderLeft:"1px solid "+C.sep2}}><input value={p.base||""} onFocus={ev=>ev.target.select()} onChange={ev=>setP(ri,oi,e.k,{base:ev.target.value})} inputMode="decimal" placeholder="0" style={cell}/></td>,
                  <td key={e.k+"r"} onClick={()=>{ if(o.navScac&&onFoco) onFoco(o.navScac,tlDe(r)); }} style={{...td,textAlign:"right",fontVariantNumeric:"tabular-nums",color:adic>0?C.slate:C.label,cursor:o.navScac?"pointer":"default",textDecoration:o.navScac?"underline dotted":"none"}} title={o.navScac?(_tip+"\n\n(clic: ir a editar estos recargos)"):""}>{o.navScac?money(adic):""}</td>,
                  ((_anchored && !editarProp)
                    ? <td key={e.k+"p"} style={{...td,textAlign:"right"}} title={_hasBase?("Profit resultante = venta anclada − costo. Propuesta bloqueada en "+money(_ancla)+"."):"Sin tarifa base: no hay profit que calcular."}>{_profitR==null?<span style={{color:C.label,fontSize:12.5}}>—</span>:<><b style={{color:_pcol,fontSize:12.5}}>{money(_profitR)}</b><div style={{fontSize:8,color:C.label,whiteSpace:"nowrap"}}>🔒 propuesta</div></>}</td>
                    : <td key={e.k+"p"} style={td}><input value={p.profit||""} onFocus={ev=>ev.target.select()} onChange={ev=>setP(ri,oi,e.k,{profit:ev.target.value})} inputMode="decimal" placeholder="0" style={cell}/></td>),
                  <td key={e.k+"v"} onClick={()=>{ if(!base||base<=0) return; setRutas(rutas.map((x,i)=>{ if(i!==ri) return x; const ne={...(x.elegidaEq||{})}; if(oi===_best){ delete ne[e.k]; return {...x,elegidaEq:ne}; } const razon=prompt("Eliges una naviera que NO es la de menor costo para "+e.t+".\nEscribe la razón (tránsito, servicio, etc.):", ovRazon(ne[e.k])||""); if(razon===null) return x; ne[e.k]={nav:o.navScac,razon:(razon||"").trim()}; return {...x,elegidaEq:ne}; })); }} title={base?(_act?(_isBest?"Mejor costo para "+e.t:"Selección manual (no es el menor costo)"+(_razon?" — Razón: "+_razon:"")):("Clic para elegir "+(o.navScac||"esta naviera")+" en "+e.t)):""} style={{...td,textAlign:"right",fontVariantNumeric:"tabular-nums",cursor:base>0?"pointer":"default",background:_act?(_isBest?"#E8F5EC":"#FBF4E0"):"transparent"}}>{base?<span style={{display:"inline-flex",alignItems:"center",gap:5,justifyContent:"flex-end"}}><span style={{fontSize:12,color:_act?(_isBest?"#0B7A3B":"#8A6D1F"):"#C0C7CE"}}>{_act?"●":"○"}</span><span><b style={{color:_locked?C.ink:(_modif?"#C77800":(_act?(_isBest?"#0B7A3B":"#8A6D1F"):C.slate)),fontWeight:(_act||_anchored)?"bold":"normal"}}>{money(_locked?_ancla:round10(venta))}{_locked?<span style={{fontSize:8,marginLeft:2}}>🔒</span>:(_modif?<span style={{fontSize:8,marginLeft:2,color:"#C77800"}}>▲</span>:null)}</b><div style={{fontSize:9,color:C.label,whiteSpace:"nowrap"}}>{money(base+adic)}{_locked?<span> · <b style={{color:_pcol}}>{money(_profitR)}</b></span>:(_modif?<span> · antes {money(_ancla)}</span>:((prof>0&&(base+adic)>0)?" · "+Math.round(prof/(base+adic)*100)+"%":""))}</div></span></span>:""}</td>];})}
              <td style={{...td,borderLeft:"1px solid "+C.sep2}}>{o.navScac?(st.length?<span style={{fontSize:11}}><b style={{color:C.slate}}>{st.join(" · ")}</b>{bl>0&&<div style={{color:C.label,marginTop:1}}>+ BL {money(bl)}</div>}</span>:<Chip kind="green">ALL-IN</Chip>):""}</td>
              <td style={{...td,textAlign:"center"}}>{editable&&r.opciones.length>1&&<span onClick={()=>delOpt(ri,oi)} title="Quitar naviera alterna" style={{cursor:"pointer",color:C.label,fontSize:12}}>✕</span>}</td>
            </tr>);
          }).concat(<tr key={ri+"-add"}><td colSpan={4+eqs.length*4+2} style={{padding:"4px 8px",borderBottom:"1px solid "+C.sep}}>{editable&&<span onClick={()=>addOpt(ri)} style={{cursor:"pointer",color:C.red,fontSize:11.5,fontWeight:"bold"}}>＋ naviera alterna para esta ruta</span>}{editable&&onPropagar&&(r.pol&&r.pod)&&<span onClick={()=>onPropagar(r)} title="Copiar un recargo de esta naviera/país a otros borradores" style={{cursor:"pointer",color:C.slate,fontSize:11.5,fontWeight:"bold",marginLeft:12}}>⇄ Propagar recargo</span>}{editable&&onSimilares&&(r.pol&&r.pod)&&<span onClick={()=>onSimilares(ri)} title="Buscar tarifas de rutas similares (mismo POL/POD) en otros borradores para usarlas de base" style={{cursor:"pointer",color:"#1F6FB2",fontSize:11.5,fontWeight:"bold",marginLeft:12}}>🔎 Buscar tarifas similares</span>}{r.opciones.length>1&&<span style={{fontSize:11,color:C.label,marginLeft:editable?12:0}}>Mejor por equipo: {eqs.map(e=>{const bi=mejorOpcionEq(r,e.k,e,dir,surOf);return e.t+" "+((bi>=0&&r.opciones[bi].navScac)||"—");}).join(" · ")}{editable&&r.elegidaEq&&Object.keys(r.elegidaEq).length>0&&<span style={{color:C.red,marginLeft:8,cursor:"pointer"}} onClick={()=>setRutas(rutas.map((x,i)=>i===ri?{...x,elegidaEq:{}}:x))}>· volver todo a auto</span>}</span>}</td></tr>);
        })}
      </tbody>
    </table>
  </div>);
}

export function Cotizador({ loadId, onDirty, role }){
  const isAdmin = role==="admin";
  const [corrigiendo,setCorrigiendo]=useState(false);
  const [clientes,setClientes]=useState([]);
  const [comms,setComms]=useState([]);
  const [cliente,setCliente]=useState("");
  const [modo,setModo]=useState("maritimo");
  const [direccion,setDireccion]=useState("I");
  const [tradelane,setTradelane]=useState("");
  const [noAcuerdo,setNoAcuerdo]=useState("");
  const [amendment,setAmendment]=useState(1);
  const [cambiosLog,setCambiosLog]=useState([]);
  const [cambiosOpen,setCambiosOpen]=useState(false);
  const [commodityId,setCommodityId]=useState("");
  const [vigDesde,setVigDesde]=useState("");
  const [prevVigHasta,setPrevVigHasta]=useState("");
  const avisoVig=(()=>{ if(!prevVigHasta||!vigDesde) return null; const p=new Date(prevVigHasta+"T00:00:00"), d=new Date(vigDesde+"T00:00:00"); if(isNaN(p)||isNaN(d)) return null; const dias=Math.round((d-p)/86400000); if(dias>1) return {tipo:"hueco",txt:"Quedan "+(dias-1)+" día(s) sin cubrir entre el AM anterior (termina "+prevVigHasta+") y este (empieza "+vigDesde+")."}; return null; })();
  const traslapeVig=(prevVigHasta&&vigDesde&&vigDesde<=prevVigHasta)?(()=>{ const d=new Date(vigDesde+"T00:00:00"); d.setDate(d.getDate()-1); const cierre=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); return "Al enviar, el AM anterior (vigente hasta "+prevVigHasta+") se cerrará automáticamente el "+cierre+" (un día antes de que empiece este) para que no se empalmen. Puedes seguir editando."; })():null;
  const [vigHasta,setVigHasta]=useState("");
  const [notas,setNotas]=useState("");
  const [notasInternas,setNotasInternas]=useState("");
  const [prop,setProp]=useState(null); // {route,scac,clave,monto,coinc,sel,busy}
  const [sim,setSim]=useState(null); // {ri, busy, exactas, aproximadas}
  const abrirSimilares=async(ri)=>{
    const r=rutas[ri]; if(!r||!r.pol||!r.pod){ alert("Captura POL y POD en la ruta antes de buscar tarifas similares."); return; }
    setSim({ ri, busy:true, exactas:null, aproximadas:null });
    try{ const res=await buscarRutasSimilares({ pol:r.pol, pod:r.pod, versionExcluir:versionId });
      setSim({ ri, busy:false, exactas:res.exactas||[], aproximadas:res.aproximadas||[] });
    }catch(ex){ setSim({ ri, busy:false, exactas:[], aproximadas:[] }); alert("Error al buscar: "+ex.message); }
  };
  const importarSimilar=(match)=>{
    if(!sim) return; const ri=sim.ri; const r=rutas[ri]; if(!r) return;
    const tlDest=tlDe(r);
    // 1) navieras (base+profit+transito) -> opciones de la ruta actual (evita duplicar SCAC)
    const nuevasOps=[...(r.opciones||[])];
    // 2) recargos -> quoteNav bajo (scac, tl de la ruta actual)
    const nuevoQN=quoteNav.map(q=>({...q,surcharges:[...(q.surcharges||[])]}));
    let addedNav=0;
    (match.navieras||[]).forEach(nv=>{
      if(!nv.scac) return;
      const yaOp=nuevasOps.some(o=>o.navScac===nv.scac);
      if(!yaOp){ nuevasOps.push({ navScac:nv.scac, transito:nv.transito||"", precios:JSON.parse(JSON.stringify(nv.precios||{})) }); addedNav++; }
      // recargos al bloque (scac, tlDest)
      let blk=nuevoQN.find(q=>q.scac===nv.scac&&(q.tl||"")===(tlDest||""));
      if(!blk){ blk={scac:nv.scac,tl:tlDest||"",surcharges:[]}; nuevoQN.push(blk); }
      (nv.recargos||[]).forEach(s=>{ if(!blk.surcharges.some(x=>String(x.c||"").toUpperCase()===String(s.c||"").toUpperCase())) blk.surcharges.push({...s}); });
    });
    setQuoteNav(nuevoQN);
    setRutas(rutas.map((x,i)=>i===ri?{...x,opciones:nuevasOps}:x));
    setSim(null);
    alert("Importado: "+addedNav+" naviera(s) con sus recargos"+(addedNav<(match.navieras||[]).length?" (algunas ya existían y se conservaron)":"")+".\n\nRevisa base, recargos y profit; el POL/POD se conservó.");
  };
  const _surObj=(scac,r,clave)=> (surOfMain(scac,tlDe(r))||[]).find(s=>s.c===clave)||{};
  const _locR=(v)=>{ const nm=puertoNombre(v)||String(v||""); return nm; };
  const paresDeNaviera=(scac,tl)=>{ const seen={}; (rutas||[]).forEach(r=>{ if(tlDe(r)!==(tl||"")) return; if(!(r.opciones||[]).some(o=>o.navScac===scac)) return; const pp=paisOrigen(r), pd=paisDestino(r); if(!pp||!pd) return; const k=pp+">"+pd; if(!seen[k]) seen[k]={paisPol:pp,paisPod:pd,label:_locR(r.pol)+" → "+_locR(r.pod)}; }); return Object.values(seen); };
  const abrirPropagar=(r)=>{  // desde una ruta (Tarifas)
    const navs=[...new Set((r.opciones||[]).map(o=>o.navScac).filter(Boolean))];
    const scac0=navs[0]||""; const tl=tlDe(r);
    const surs=surOfMain(scac0,tl); const s0=surs.find(s=>s.c===((surs[0]&&surs[0].c)||""))||{};
    const pares=[{paisPol:paisOrigen(r),paisPod:paisDestino(r),label:_locR(r.pol)+" → "+_locR(r.pod)}];
    setProp({ scac:scac0, tl, navs, clave:s0.c||"", monto:String(s0.monto||""), montos:{...(s0.montos||{})}, pares, paisIdx:0, coinc:null, sel:{}, busy:false });
  };
  const abrirPropagarNav=(scac,tl,sur)=>{  // desde un recargo en Navieras y recargos
    const pares=paresDeNaviera(scac,tl);
    setProp({ scac, tl, navs:[scac], clave:sur.c||"", monto:String(sur.monto||""), montos:{...(sur.montos||{})}, pares, paisIdx:0, coinc:null, sel:{}, busy:false });
  };
  const propRecargos=()=> prop ? surOfMain(prop.scac,prop.tl) : [];
  const _rkey=(x)=> x.versionId+"|"+(x.pol||"")+"|"+(x.pod||"");
  const propBuscar=async()=>{
    if(!prop) return;
    const par=(prop.pares||[])[prop.paisIdx||0]; if(!par){ alert("No se pudo determinar el país origen/destino."); return; }
    setProp(p=>({...p,busy:true,coinc:null}));
    try{ const { rows }=await buscarCoincidenciasRecargo({ scac:prop.scac, paisPol:par.paisPol, paisPod:par.paisPod, clave:prop.clave, versionExcluir:versionId });
      const sel={}; (rows||[]).forEach(x=>{ sel[_rkey(x)]=true; });
      setProp(p=>({...p,busy:false,coinc:rows||[],sel}));
    }catch(ex){ setProp(p=>({...p,busy:false,coinc:[]})); alert("Error al buscar: "+ex.message); }
  };
  const propAplicar=async(todos)=>{
    if(!prop||!prop.coinc) return;
    const targets=(prop.coinc||[]).filter(x=>todos||prop.sel[_rkey(x)]).map(x=>({versionId:x.versionId,pol:x.pol,pod:x.pod}));
    if(!targets.length){ alert("No hay rutas seleccionadas."); return; }
    const nBorr=new Set(targets.map(t=>t.versionId)).size;
    const montosTxt=(prop.montos&&Object.values(prop.montos).some(v=>v!==""&&v!=null))?(" (por tamaño: "+Object.entries(prop.montos).filter(([k,v])=>v!==""&&v!=null).map(([k,v])=>k+" $"+v).join(", ")+")"):"";
    if(!confirm("¿Aplicar el recargo "+prop.clave+" = $"+(prop.monto||0)+montosTxt+" a "+targets.length+" ruta(s) en "+nBorr+" borrador(es)?\n\nSe conserva la tarifa al cliente (el profit absorbe el cambio de costo).")) return;
    setProp(p=>({...p,busy:true}));
    try{ const res=await aplicarRecargoEnBorradores({ targets, scac:prop.scac, clave:prop.clave, nuevoMonto:prop.monto, nuevosMontos:prop.montos||null, origenFolio:(codigo||codigoPreview) });
      setProp(null);
      alert("Aplicado a "+res.aplicados+" ruta(s)."+(res.errores&&res.errores.length?("\n\nAvisos:\n• "+res.errores.join("\n• ")):""));
    }catch(ex){ setProp(p=>({...p,busy:false})); alert("Error al aplicar: "+ex.message); }
  };
  const [equipos,setEquipos]=useState(["20DV","40HC"]);
  const [impSheets,setImpSheets]=useState(null);
  const [focoRecargo,setFocoRecargo]=useState(null);
  const [editarPropuesta,setEditarPropuesta]=useState(false);
  const impWbRef=React.useRef(null);
  const impInputRef=React.useRef(null);
  const bajarPlantillaTarifario=async()=>{
    const HDR=["Customer","Origen","Transp Mode Origen","POL","POD","Destination","Transp Mode Destino","T.T.","Tarifa Base 20'","Tarifa Base 40'/40HC","Carrier","Tradelane","Srvc. Mode"];
    const MODO=["All Truck","Rail+Truck","Rail Ramp","Truck Ramp","Barge"], CARR=["CMA","Hapag","Maersk","MSC"], SRV=["CY-CY","DR-CY","CY-DR","DR-DR"];
    const TL=TRADELANES.map(t=>t.code);
    const wb=new ExcelJS.Workbook();
    const ws=wb.addWorksheet("Tarifario",{views:[{state:"frozen",ySplit:1}]});
    ws.columns=HDR.map((h,i)=>({ header:h, width:[13,15,17,15,15,15,17,7,14,16,10,11,11][i]||14 }));
    const hr=ws.getRow(1); hr.height=22;
    hr.eachCell((c)=>{ c.font={name:"Arial",bold:true,size:9,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1A1A1A"}}; c.alignment={horizontal:"center",vertical:"middle"}; });
    const ej=["Deacero","EJEMPLO Guadalajara","All Truck","Manzanillo, MX","Ningbo","","","28","","1650","Maersk","TPWB","DR-CY"];
    const er=ws.getRow(2); ej.forEach((v,i)=>{ er.getCell(i+1).value=v; });
    er.eachCell((c)=>{ c.font={name:"Arial",italic:true,size:9,color:{argb:"FF8A939C"}}; });
    const dv=(col,opts)=>{ for(let r=2;r<=400;r++){ ws.getCell(r,col).dataValidation={ type:"list", allowBlank:true, formulae:['"'+opts.join(",")+'"'] }; } };
    dv(3,MODO); dv(7,MODO); dv(11,CARR); dv(12,TL); dv(13,SRV);
    ws.autoFilter="A1:"+ws.getColumn(HDR.length).letter+"1";
    const buf=await wb.xlsx.writeBuffer();
    const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="Plantilla_tarifario.xlsx"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const onTarifarioFile=async(e)=>{ const f=e.target.files&&e.target.files[0]; if(e.target) e.target.value=""; if(!f) return; try{ const buf=await f.arrayBuffer(); const wb=XLSX.read(buf,{type:"array"}); impWbRef.current=wb; if(wb.SheetNames.length===1) aplicarTarifario(wb.SheetNames[0]); else setImpSheets(wb.SheetNames); }catch(ex){ alert("No se pudo leer el archivo: "+ex.message); } };
  const aplicarTarifario=(sheet)=>{ const wb=impWbRef.current; setImpSheets(null); if(!wb) return; let nuevas=[]; try{ const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:null}); nuevas=parseTarifario(rows); }catch(ex){ alert("Error al interpretar la hoja: "+ex.message); return; } if(!nuevas.length){ alert("No encontré rutas en la hoja \""+sheet+"\"."); return; } setEquipos(prev=>{ const s=new Set(prev); s.add("20DV"); s.add("40HC"); return [...s]; }); const hay=(rutas||[]).some(r=>tx(r.pol)||tx(r.pod)||(r.opciones||[]).some(o=>tx(o.navScac))); if(hay){ const rep=confirm("Importé "+nuevas.length+" ruta(s) de \""+sheet+"\".\n\nAceptar = REEMPLAZAR las rutas actuales.\nCancelar = AGREGAR al final."); setRutas(ordenarRutas(rep?nuevas:[...rutas,...nuevas],direccion)); } else setRutas(ordenarRutas(nuevas,direccion)); };
  const [started,setStarted]=useState(false);
  const [rutas,setRutas]=useState([]);
  const [qTar,setQTar]=useState("");
  const matchTar=(r)=>{ const s=qTar.trim().toLowerCase(); if(!s) return true; return ((r.origen||"")+" "+(r.destino||"")+" "+(r.pol||"")+" "+(r.pod||"")+" "+puertoNombre(r.pol)+" "+puertoNombre(r.pod)).toLowerCase().includes(s); };
  const [quoteNav,setQuoteNav]=useState([]);
  const [editRutas,setEditRutas]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(null);
  const [versionId,setVersionId]=useState(null);
  const [codigo,setCodigo]=useState(null);
  const [estatus,setEstatus]=useState("borrador");
  const [loading,setLoading]=useState(false);
  const [extraCat,setExtraCat]=useState([]);
  const [nuevoOpen,setNuevoOpen]=useState(false);
  const [nuevoNombre,setNuevoNombre]=useState("");
  const [nuevoTipo,setNuevoTipo]=useState("prospecto");
  const [creando,setCreando]=useState(false);

  const mergedCat=useMemo(()=>{const have=new Set(CATALOG.map(x=>x.c.toUpperCase()));return [...CATALOG,...extraCat.filter(x=>!have.has((x.c||"").toUpperCase()))];},[extraCat]);
  useEffect(()=>{ listSurcharges().then(setExtraCat); },[]);

  const recargarClientes=()=>supabase.from("clientes").select("id,no_cliente,nombre,tipo").order("nombre").then(({data})=>setClientes(data||[]));
  const guardarNuevoCliente=async()=>{
    const nm=nuevoNombre.trim(); if(!nm){ alert("Escribe el nombre."); return; }
    setCreando(true);
    const { cliente, error }=await crearCliente({nombre:nm,tipo:nuevoTipo});
    setCreando(false);
    if(error){ alert("No se pudo crear: "+error); return; }
    await recargarClientes();
    if(cliente){ setCliente(cliente.id); }
    setNuevoNombre(""); setNuevoOpen(false);
  };
  const altaRecargo=async(clave,desc)=>{ const r=await altaSurcharge({clave,descripcion:desc}); if(r.ok){ setExtraCat(c=>[...c,{c:r.clave,d:desc||"",g:"Otros"}]); } else if(r.error){ alert("Alta de recargo: "+r.error); } };

  // #2 Auto-poblar recargos desde la última cotización con misma combinación País→País
  const [autoMsg,setAutoMsg]=useState("");
  const [autoBusy,setAutoBusy]=useState(false);
  const autoTried=React.useRef("");
  const rutaPaises=()=>{ for(const r of rutas){ const o=paisOrigen(r), d=paisDestino(r); if(o&&d) return {o,d}; } return null; };
  // Generar/sugerir recargos de un bloque (naviera × lane): 1) exacto historial, 2) misma naviera otro lane, 4) plantilla
  const generarRecargos=async(scac,tl)=>{
    if(!scac) return;
    const [o,d]=String(tl||"").split(">");
    setAutoBusy(true); setAutoMsg("");
    let applied=null, src="";
    // 1) Exacto: misma naviera + mismo lane (historial)
    if(o&&d){ const res=await recargosDeRutaSimilarPorNaviera(o,d,[scac],versionId); if(res&&res.quoteNav&&res.quoteNav.length){ applied=res.quoteNav[0].surcharges; src="exacto de historial ("+scac+" "+rutaPaisLabel(o,d)+")"; } }
    // 2) Misma naviera, otro lane — primero en esta cotización, luego historial
    if(!applied){ const other=quoteNav.find(q=>q.scac===scac&&(q.tl||"")!==(tl||"")&&q.surcharges&&q.surcharges.length); if(other){ applied=other.surcharges.map(x=>({...x})); src="copiado de "+tlLabel(other.tl)+" (misma naviera, en esta cotización)"; } }
    if(!applied){ const r2=await recargosDeNaviera(scac,versionId); if(r2&&r2.surcharges&&r2.surcharges.length){ applied=r2.surcharges; src="copiado de otro lane de "+scac+" (historial)"; } }
    // 4) Plantilla genérica
    if(!applied){ applied=PLANTILLA_RECARGOS(); src="plantilla genérica (captura montos)"; }
    const key=scac+"|"+(tl||""); const map={}; quoteNav.forEach(q=>{ map[q.scac+"|"+(q.tl||"")]=q; }); map[key]={scac,tl,surcharges:applied};
    setQuoteNav(Object.values(map));
    setAutoBusy(false);
    setAutoMsg("Recargos "+scac+" · "+tlLabel(tl)+": "+src+" — editables.");
  };
  const jalarRecargos=async(force=false)=>{
    // Agrupa las rutas por tradelane (país POL→POD) y junta las navieras de cada uno
    const groups={};
    (rutas||[]).forEach(r=>{ const o=paisOrigen(r), d=paisDestino(r); if(!o||!d) return; const tl=o+">"+d; (groups[tl]=groups[tl]||{o,d,navs:new Set()}); (r.opciones||[]).forEach(op=>{ if(op.navScac) groups[tl].navs.add(op.navScac); }); });
    const tls=Object.keys(groups);
    if(!tls.length){ if(force) alert("Primero define las rutas (POL/POD u Origen/Destino) para identificar los tradelanes."); return; }
    const hasSurs=quoteNav.some(q=>q.surcharges&&q.surcharges.length);
    if(hasSurs && !force){ return; } // no piso lo que ya hay salvo que sea forzado
    if(hasSurs && force && !confirm("Ya hay recargos cargados. ¿Reemplazarlos con los de rutas similares (por naviera y tradelane)?")) return;
    setAutoBusy(true); setAutoMsg("");
    const map={}; quoteNav.forEach(q=>{ map[q.scac+"|"+(q.tl||"")]=q; });
    const jaladas=[], faltantes=[];
    for(const tl of tls){
      const g=groups[tl]; const navList=[...g.navs];
      const res=await recargosDeRutaSimilarPorNaviera(g.o, g.d, navList, versionId);
      const carriers = navList.length ? navList : (res? res.quoteNav.map(q=>q.scac) : []);
      carriers.forEach(scac=>{
        const key=scac+"|"+tl; const hit=res && res.quoteNav.find(q=>q.scac===scac);
        if(hit){ map[key]={scac,tl,surcharges:hit.surcharges}; jaladas.push(scac+" "+rutaPaisLabel(g.o,g.d)); }
        else { if(!map[key]) map[key]={scac,tl,surcharges:[]}; faltantes.push(scac+" "+rutaPaisLabel(g.o,g.d)); }
      });
    }
    setQuoteNav(Object.values(map));
    setAutoBusy(false);
    setAutoMsg("Jalado por naviera × tradelane."+(jaladas.length?(" OK: "+jaladas.join(" · ")):"")+(faltantes.length?(" · sin historial: "+faltantes.join(" · ")):"")+" — editables.");
  };
  useEffect(()=>{
    if(!started || !editable) return;
    const pp=rutaPaises(); if(!pp) return;
    const key=pp.o+">"+pp.d;
    if(quoteNav.length===0 && autoTried.current!==key){ autoTried.current=key; jalarRecargos(false); }
  // eslint-disable-next-line
  },[rutas,started]);

  useEffect(()=>{ supabase.from("clientes").select("id,no_cliente,nombre,tipo").order("nombre").then(({data})=>setClientes(data||[])); },[]);
  useEffect(()=>{ supabase.from("commodities").select("id,industria,commodity").eq("activo",true).order("industria").order("commodity").then(({data})=>setComms(data||[])); },[]);
  useEffect(()=>{
    if(!loadId) return; setLoading(true); hydrating.current=true;
    loadVersion(loadId).then(st=>{
      setVersionId(st.versionId); setCodigo(st.codigo); setEstatus(st.estatus);
      setCliente(st.cliente||""); setModo(st.modo||"maritimo"); setDireccion(st.direccion||"I");
      setTradelane(st.tradelane||""); setNoAcuerdo(st.no_acuerdo||""); setAmendment(st.amendment||1); setCambiosLog(st.cambiosLog||[]);
      setCommodityId(st.commodity_id||""); setVigDesde(st.vigDesde||""); setVigHasta(st.vigHasta||""); setNotas(st.notas||""); setNotasInternas(st.correcciones||""); setPrevVigHasta(st.prevVigHasta||"");
      setEquipos(st.equipos&&st.equipos.length?st.equipos:["20DV","40HC"]);
      setRutas(st.rutas&&st.rutas.length?st.rutas:[mkRuta()]);
      setQuoteNav(st.quoteNav||[]); setStarted(true); setLoading(false);
      setTimeout(()=>{ hydrating.current=false; },0);
    });
  },[loadId]);

  // ===== Aviso de cambios sin guardar (dirty) =====
  const onDirtyRef=React.useRef(onDirty); onDirtyRef.current=onDirty;
  const firstRun=React.useRef(true);
  const hydrating=React.useRef(false);
  useEffect(()=>{ onDirtyRef.current&&onDirtyRef.current(false); },[]); // montaje limpio
  useEffect(()=>{
    if(firstRun.current){ firstRun.current=false; return; }
    if(hydrating.current) return;
    onDirtyRef.current&&onDirtyRef.current(true);
  },[cliente,modo,direccion,tradelane,commodityId,vigDesde,vigHasta,notas,equipos,rutas,quoteNav,started]);

  const editable = estatus==="borrador" || corrigiendo;
  const comLabel=(comms.find(c=>c.id===commodityId)||{}).commodity||"";
  const folio = (noAcuerdo||codigo) ? ((noAcuerdo||codigo)+(tradelane?(" · "+tradelane):"")+(amendment?(" · AM"+amendment):"")+(comLabel?(" · "+comLabel):"")) : null;
  const codigoPreview=useMemo(()=>{const p=modo==="maritimo"?"M":modo==="terrestre"?"T":"A";return p+direccion+"?";},[modo,direccion]);
  const mkRuta=()=>({origen:"",precarriage_mode:"",pol:"",pod:"",oncarriage_mode:"",destino:"",opciones:[{navScac:"",transito:"",precios:{}}],elegida:0});
  const toggleEq=(k)=>setEquipos(equipos.includes(k)?equipos.filter(x=>x!==k):[...equipos,k]);

  const guardar=async()=>{
    if(!cliente){ alert("Elige un cliente."); return; }
    if(vigDesde&&vigHasta&&vigDesde>vigHasta){ alert("La vigencia está invertida: \"desde\" ("+vigDesde+") es posterior a \"hasta\" ("+vigHasta+"). Corrige las fechas antes de guardar."); return; }
    const falt=faltanPOLPOD(); if(falt.length){ alert("Faltan datos obligatorios en las rutas (POL, POD, naviera y modo si hay ciudad):\n\n• "+falt.join("\n• ")); return; }
    const cn=(clientes.find(c=>c.id===cliente)||{}).nombre;
    const st={versionId,codigo,cliente,clienteNombre:cn,modo,direccion,tradelane,commodity:comLabel,commodity_id:commodityId||null,vigDesde,vigHasta,notas,origen:"cero",equipos,rutas:derivarAnclaje(rutas),quoteNav};
    // #5 Conflicto: misma ruta + misma vigencia con tarifa distinta
    try{
      const conf=await checkConflictoTarifa(st);
      if(conf.length){
        const lista=conf.slice(0,4).map(c=>"• "+c.folio+" ("+c.cliente+") "+c.ruta+": existe "+money(c.tarifaExistente)+" vs nueva "+money(c.tarifaNueva)).join("\n");
        if(!confirm("⚠ Conflicto de tarifa\n\nYa existe otra cotización con la MISMA ruta y MISMA vigencia pero TARIFA distinta:\n\n"+lista+"\n\n¿Guardar de todas formas?")) return;
      }
    }catch(e){ /* si la verificación falla, no bloquea el guardado */ }
    setSaving(true); setSaved(null);
    const res=await saveCotizacion(st);
    setSaving(false); setSaved(res);
    if(res.versionId){ setVersionId(res.versionId); setCodigo(res.codigo); setEstatus("borrador"); if(res.cambiosLog) setCambiosLog(res.cambiosLog); }
    onDirtyRef.current&&onDirtyRef.current(false);
    if(res.errores.length) alert("⚠ Guardado con avisos ("+res.errores.length+"):\n\n• "+res.errores.slice(0,5).join("\n• ")+(res.errores.length>5?"\n\n…y "+(res.errores.length-5)+" más.":""));
    // Si se editó un precio fijo, recargar para mostrar el precio nuevo ya congelado y salir del modo edición.
    else if(editarPropuesta && (res.versionId||versionId)){ try{ const st2=await loadVersion(res.versionId||versionId); if(st2&&st2.rutas) setRutas(st2.rutas); }catch(_){} setEditarPropuesta(false); }
  };
  const surOfMain=(scac,tl)=>(quoteNav.find(q=>q.scac===scac&&(q.tl||"")===(tl||""))||{}).surcharges||[];
  const derivarAnclaje=(rts,ep=editarPropuesta)=>(rts||[]).map(r=>{
    const nr={...r,opciones:(r.opciones||[]).map(o=>{ const precios={...(o.precios||{})}; Object.keys(precios).forEach(ek=>{ const eqObj=EQUIPOS.find(x=>x.k===ek); const pr=precios[ek]; if(!eqObj||!pr||pr.base==null||pr.base==="") return; const base=n(pr.base); const adic=adicPorCont(surOfMain(o.navScac,tlDe(r)),eqObj,direccion); const anchored=r.ventaAncla&&r.ventaAncla[ek]!=null; const target=(anchored&&!ep)?Number(r.ventaAncla[ek]):(base+adic+n(pr.profit)); const vround=round10(target); precios[ek]={...pr,profit:String(vround-base-adic)}; }); return {...o,precios}; })};
    // Al editar el precio fijo (ep=true), el precio nuevo pasa a ser el ancla: se recalcula
    // desde la naviera activa de cada equipo con el profit editado, para que se guarde de verdad.
    if(ep && r.ventaAncla){ const na={...r.ventaAncla}; Object.keys(na).forEach(ek=>{ const eqObj=EQUIPOS.find(x=>x.k===ek); if(!eqObj) return; const oi=opcionActivaEq(nr,ek,eqObj,direccion,surOfMain); const o=(nr.opciones||[])[oi]; if(!o) return; const pr=(o.precios||{})[ek]||{}; if(pr.base==null||pr.base==="") return; na[ek]=round10(n(pr.base)+adicPorCont(surOfMain(o.navScac,tlDe(r)),eqObj,direccion)+n(pr.profit)); }); nr.ventaAncla=na; }
    return nr;
  });
  const bajoProfit=()=>{ const eqObjs=EQUIPOS.filter(e=>equipos.includes(e.k)); const out=[]; (rutas||[]).forEach(r=>{ eqObjs.forEach(e=>{ const oi=opcionActivaEq(r,e.k,e,direccion,surOfMain); const o=(r.opciones||[])[oi]; if(!o) return; const pr=(o.precios||{})[e.k]||{}; if(pr.base==null||pr.base===""||n(pr.base)<=0) return; const prof=n(pr.profit); if(prof<250) out.push((r.pol||r.origen||"?")+"→"+(r.pod||r.destino||"?")+" "+e.t+" ("+(o.navScac||"—")+"): "+(prof>0?("$"+prof):"SIN PROFIT")); }); }); return out; };
  const confirmProfit=()=>{ const low=bajoProfit(); if(!low.length) return true; return confirm("⚠ Profit bajo o nulo (menor a $250 USD) en:\n\n• "+low.slice(0,12).join("\n• ")+"\n\n¿Continuar de todas formas?"); };
  const faltanPOLPOD=()=>{ const out=[]; (rutas||[]).forEach((r,i)=>{ const f=[]; if(!tx(r.pol))f.push("POL"); if(!tx(r.pod))f.push("POD"); if(!(r.opciones||[]).some(o=>tx(o.navScac)))f.push("naviera"); if(tx(r.origen)&&!tx(r.precarriage_mode))f.push("modo (origen)"); if(tx(r.destino)&&!tx(r.oncarriage_mode))f.push("modo (destino)"); if(f.length) out.push("R"+(i+1)+": falta "+f.join(", ")); }); return out; };
  const enviar=async()=>{ if(!versionId) return; if(vigDesde&&vigHasta&&vigDesde>vigHasta){ alert("La vigencia está invertida: \"desde\" ("+vigDesde+") es posterior a \"hasta\" ("+vigHasta+"). Corrige las fechas antes de enviar."); return; } if(!confirmProfit()) return; await markEnviada(versionId); setEstatus("enviada"); };
  const guardarCorreccionUI=async()=>{
    if(!versionId) return;
    if(vigDesde&&vigHasta&&vigDesde>vigHasta){ alert("La vigencia está invertida. Corrige las fechas antes de guardar."); return; }
    const cn=(clientes.find(c=>c.id===cliente)||{}).nombre;
    const st={versionId,codigo,cliente,clienteNombre:cn,modo,direccion,tradelane,commodity:comLabel,commodity_id:commodityId||null,vigDesde,vigHasta,notas,origen:"cero",equipos,rutas:derivarAnclaje(rutas),quoteNav};
    setSaving(true);
    let r; try{ r=await guardarCorreccion(st,""); }catch(ex){ setSaving(false); alert("Error: "+ex.message); return; }
    if(r&&r.needNota){
      setSaving(false);
      const resumen=(r.cliente&&r.cliente.length)?("\n\nCambios visibles al cliente:\n• "+r.cliente.join("\n• ")):"\n\n(Sin cambios de precio ni rutas; solo internos.)";
      const nota=window.prompt("CORRECCIÓN de un AM enviado.\n\nEscribe el MOTIVO (obligatorio). Se anexará a la nota junto con el detalle del cambio."+resumen);
      if(!nota||!nota.trim()){ alert("Cancelado: la corrección requiere una nota."); return; }
      setSaving(true);
      try{ r=await guardarCorreccion(st,nota.trim()); }catch(ex){ setSaving(false); alert("Error: "+ex.message); return; }
    }
    setSaving(false);
    if(r&&r.ok){
      try{ const st2=await loadVersion(versionId); if(st2){ if(st2.rutas) setRutas(st2.rutas); if(st2.notas!=null) setNotas(st2.notas); setNotasInternas(st2.correcciones||""); } }catch(_){}
      setCorrigiendo(false);
      alert(r.sinCambios?"No hubo cambios que registrar.":"Corrección guardada. El cambio quedó en la nota (y en el registro interno).");
    }
  };
  const nueva=async()=>{ if(!versionId) return; if(!confirm("¿Crear un nuevo Amendment (AM"+((amendment||1)+1)+")? Se copia el actual para que edites las diferencias; el AM anterior queda superseded.")) return; setSaving(true); const res=await nuevaVersion(versionId); setSaving(false); if(res.errores&&res.errores.length){ alert("Error: "+res.errores.join(" · ")); return; } if(res.versionId){ setVersionId(res.versionId); setCodigo(res.codigo); setAmendment(res.amendment||((amendment||1)+1)); if(res.vigDesde) setVigDesde(res.vigDesde); setCambiosLog([]); setEstatus("borrador"); setSaved(res); } };
  const stCotiz=()=>{ const cn=(clientes.find(c=>c.id===cliente)||{}).nombre; return {clienteNombre:cn,codigo:codigo||codigoPreview,no_acuerdo:noAcuerdo,tradelane,amendment,commodity:comLabel,direccion,equipos,rutas:derivarAnclaje(rutas),quoteNav,vigDesde,vigHasta,notas,correcciones:notasInternas||""}; };
  const generar=()=>{ const falt=faltanPOLPOD(); if(falt.length){ alert("Faltan datos obligatorios en las rutas (POL, POD, naviera y modo si hay ciudad):\n\n• "+falt.join("\n• ")); return; } if(!confirmProfit()) return; abrirCotizacion(stCotiz()); };
  const exportarXlsx=async(interno)=>{ const falt=faltanPOLPOD(); if(falt.length){ alert("Faltan datos obligatorios en las rutas (POL, POD, naviera y modo si hay ciudad):\n\n• "+falt.join("\n• ")); return; } if(!interno&&!confirmProfit()) return; try{ await exportarExcel(stCotiz(),{interno:!!interno}); }catch(ex){ alert("Error al exportar a Excel: "+ex.message); } };
  const toggleEditProp=()=>{ const next=!editarPropuesta;
    if(next){
      // Entrar a "Editar precio": conservar los profits tal como quedaron con la tarifa fija
      // (venta anclada − base − recargos), para no revertir al profit anterior. La venta se mantiene.
      const baked=(rutas||[]).map(r=>{ if(!r.ventaAncla) return r;
        return {...r, opciones:(r.opciones||[]).map(o=>{ const precios={...(o.precios||{})}; Object.keys(precios).forEach(ek=>{ const a=r.ventaAncla[ek]; if(a==null||a==="") return; const eqObj=EQUIPOS.find(x=>x.k===ek); const pr=precios[ek]; if(!eqObj||!pr||pr.base==null||pr.base==="") return; const base=n(pr.base); const adic=adicPorCont(surOfMain(o.navScac,tlDe(r)),eqObj,direccion); precios[ek]={...pr, profit:String(round10(Number(a))-base-adic)}; }); return {...o,precios}; }) };
      });
      setRutas(baked); setEditarPropuesta(true);
    } else { setRutas(derivarAnclaje(rutas,false)); setEditarPropuesta(false); }
  };
  const lineasPropModificada=()=>{ const out=[]; (rutas||[]).forEach(r=>{ if(!r.ventaAncla) return; Object.keys(r.ventaAncla).forEach(ek=>{ const eqObj=EQUIPOS.find(x=>x.k===ek); if(!eqObj) return; const oi=opcionActivaEq(r,ek,eqObj,direccion,surOfMain); const o=(r.opciones||[])[oi]; if(!o) return; const pr=(o.precios||{})[ek]||{}; if(pr.base==null||pr.base==="") return; const venta=round10(n(pr.base)+adicPorCont(surOfMain(o.navScac,tlDe(r)),eqObj,direccion)+n(pr.profit)); if(venta!==Math.round(Number(r.ventaAncla[ek]))) out.push((r.pol||r.origen||"?")+"→"+(r.pod||r.destino||"?")+" "+eqObj.t+": "+money(Number(r.ventaAncla[ek]))+" → "+money(venta)); }); }); return out; };
  const anclar=async()=>{ if(!versionId){ alert("Guarda la cotización antes de fijar el precio al cliente."); return; } if(faltanPOLPOD().length){ alert("Completa POL, POD y naviera antes de fijar el precio."); return; } if(!confirm("¿Fijar el precio actual al cliente?\n\nEl precio queda congelado: al ajustar costos cambia tu profit, no el precio. Para cambiarlo después usa \"Editar precio\" o crea un nuevo Amendment.")) return; setSaving(true);
    try{
      // 1) Toma el precio que se ve AHORA (base + recargos + profit de la naviera activa) por equipo y fíjalo como ancla.
      const conAncla=(rutas||[]).map(r=>{ const na={...(r.ventaAncla||{})}; (equipos||[]).forEach(ek=>{ const eqObj=EQUIPOS.find(x=>x.k===ek); if(!eqObj) return; const oi=opcionActivaEq(r,ek,eqObj,direccion,surOfMain); const o=(r.opciones||[])[oi]; if(!o) return; const pr=(o.precios||{})[ek]||{}; if(pr.base==null||pr.base==="") return; na[ek]=round10(n(pr.base)+adicPorCont(surOfMain(o.navScac,tlDe(r)),eqObj,direccion)+n(pr.profit)); }); return {...r,ventaAncla:na}; });
      // 2) Bloquea: los profits de cada opción se ajustan para dar exactamente ese ancla nuevo.
      const locked=derivarAnclaje(conAncla,false);
      // 3) Guarda ese estado ya anclado.
      const cn=(clientes.find(c=>c.id===cliente)||{}).nombre;
      const st={versionId,codigo,cliente,clienteNombre:cn,modo,direccion,tradelane,commodity:comLabel,commodity_id:commodityId||null,vigDesde,vigHasta,notas,origen:"cero",equipos,rutas:locked,quoteNav};
      const res=await saveCotizacion(st);
      setEditarPropuesta(false);
      const st2=await loadVersion(res.versionId||versionId); if(st2){ if(st2.rutas) setRutas(st2.rutas); setCambiosLog(st2.cambiosLog||[]); }
      let cnt=0; locked.forEach(r=>{ if(r.ventaAncla) cnt+=Object.keys(r.ventaAncla).length; });
      alert("Precio fijado en "+cnt+" línea(s).");
    }catch(ex){ alert("Error al fijar el precio: "+ex.message); }
    setSaving(false); };
  const hayAncla=(rutas||[]).some(r=>r.ventaAncla&&Object.keys(r.ventaAncla).length>0);

  return (<div style={{maxWidth:1160,margin:"0 auto"}}>
    {loading&&<div style={{color:C.label,fontSize:13,padding:10}}>Cargando cotización…</div>}
    {folio&&(<div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,padding:"10px 14px",background:"#fff",border:"1px solid "+C.sep2,borderRadius:10}}>
      <span style={{fontSize:15,fontWeight:"bold",color:C.ink}}>{folio}</span>
      <span style={{fontSize:11,fontWeight:"bold",color:editable?C.label:"#8A6D1F",background:editable?C.soft:"#FBF4E0",border:"1px solid "+C.sep2,borderRadius:4,padding:"2px 8px"}}>{estatus}</span>
      {!editable&&<span style={{fontSize:11,color:C.label}}>Versión congelada — crea un nuevo Amendment para editar.</span>}
      {corrigiendo&&<span style={{fontSize:11,fontWeight:"bold",color:"#C77800"}}>✎ Modo corrección (admin) — al guardar deberás poner una nota del cambio.</span>}
      {estatus==="enviada"&&isAdmin&&!corrigiendo&&<span style={{marginLeft:"auto"}}><Btn kind="ghost" small onClick={()=>{ if(confirm("¿Corregir este AM enviado?\n\nEsto es para arreglar errores nuestros SIN mandarle un nuevo Amendment al cliente. Al guardar se te pedirá una nota y el sistema registrará qué cambió. Conserva el mismo folio y vigencia.")) setCorrigiendo(true); }}>✎ Corregir enviada (admin)</Btn></span>}
    </div>)}
    {cambiosLog&&cambiosLog.length>0&&(()=>{ const fmtF=(f)=>{ if(!f) return ""; const d=new Date(f+"T00:00:00"); if(isNaN(d)) return f; const ms=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]; return d.getDate()+"-"+ms[d.getMonth()]+"-"+d.getFullYear(); }; const total=cambiosLog.reduce((a,e)=>a+((e.items&&e.items.length)||0),0); const orden=[...cambiosLog].reverse(); return (
      <div style={{marginBottom:12,background:"#FFF9E9",border:"1px solid #EAD9A0",borderRadius:10,overflow:"hidden"}}>
        <div onClick={()=>setCambiosOpen(o=>!o)} style={{padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:"#8A6D1F",fontSize:12}}>{cambiosOpen?"▾":"▸"}</span>
          <span style={{fontSize:12,fontWeight:"bold",color:"#8A6D1F"}}>Control de cambios ({total})</span>
          {!cambiosOpen&&<span style={{fontSize:11,color:C.label}}>· {cambiosLog.length} registro(s) · clic para ver</span>}
        </div>
        {cambiosOpen&&<div style={{padding:"0 14px 12px 14px"}}>{orden.map((e,ei)=>{ const us=e.usuario?String(e.usuario).split("@")[0]:"—"; const esProp=e.tipo==="propagacion"; return (
          <div key={ei} style={{marginBottom:10}}>
            <div style={{fontWeight:"bold",color:esProp?C.slate:"#8A6D1F",fontSize:11.5,marginBottom:2}}>{fmtF(e.fecha)}{esProp?(" · ↳ Propagación"+(e.origen?" desde "+e.origen:"")+" · por "+us):(" · por "+us)}:</div>
            <ul style={{margin:0,paddingLeft:18,fontSize:11.5,color:C.slate,lineHeight:1.5}}>{(e.items||[]).slice(0,60).map((c,i)=><li key={i}>{c}</li>)}</ul>
          </div>
        ); })}</div>}
      </div>); })()}
    {editarPropuesta&&(()=>{ const pm=lineasPropModificada(); return (<div style={{marginBottom:12,padding:"10px 14px",background:"#FFF3E0",border:"1px solid #F0C79A",borderRadius:10}}>
      <div style={{fontSize:12,fontWeight:"bold",color:"#C77800",marginBottom:pm.length?6:0}}>✎ Editando el precio al cliente — el precio ya no está congelado y puede cambiar al ajustar costos.{pm.length?" Cambios de precio ("+pm.length+"):":" (aún sin cambios de precio)"}</div>
      {pm.length>0&&<ul style={{margin:0,paddingLeft:18,fontSize:11.5,color:C.slate,lineHeight:1.5}}>{pm.slice(0,20).map((c,i)=><li key={i}>{c}</li>)}</ul>}
      {pm.length>0&&<div style={{fontSize:11,color:C.label,marginTop:6}}>Dale <b>🔒 Fijar este nuevo precio</b> para congelar este precio, o <b>Cancelar</b> para volver al anterior. Para formalizarlo con el cliente, crea un <b>Nuevo Amendment</b>.</div>}
    </div>); })()}
    <div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:12,padding:16,marginBottom:16,opacity:editable?1:.7,pointerEvents:editable?"auto":"none"}}>
      <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
        <Field label="Cliente / Prospecto" w={2}>
          <ComboBox value={cliente} display={(clientes.find(c=>c.id===cliente)||{}).nombre||""} allowFree={false}
            placeholder="Buscar cliente o prospecto…"
            items={clientes.map(c=>({v:c.id,label:c.no_cliente+" · "+c.nombre,sub:c.tipo}))}
            onChange={(v)=>setCliente(v)}/>
          <span onClick={()=>setNuevoOpen(!nuevoOpen)} style={{cursor:"pointer",color:C.red,fontSize:11,fontWeight:"bold",marginTop:3,display:"inline-block"}}>{nuevoOpen?"Cancelar":"＋ Nuevo cliente / prospecto"}</span>
        </Field>
        <Field label="Modo"><Sel value={modo} onChange={e=>setModo(e.target.value)} options={[{v:"maritimo",t:"Marítimo"},{v:"terrestre",t:"Terrestre"},{v:"aereo",t:"Aéreo"}]}/></Field>
        <Field label="Dirección" w={.9}><Sel value={direccion} onChange={e=>setDireccion(e.target.value)} options={[{v:"E",t:"Exportación"},{v:"I",t:"Importación"}]}/></Field>
        <Field label="Tradelane" w={1.3}><Sel value={tradelane} onChange={e=>setTradelane(e.target.value)} options={[{v:"",t:"— tradelane —"},...TRADELANES.map(t=>({v:t.code,t:t.code+" · "+t.name}))]}/></Field>
        <Field label="Commodity" w={1.4}>
          <select value={commodityId} onChange={e=>setCommodityId(e.target.value)} style={inS}>
            <option value="">— selecciona commodity —</option>
            {COMMODITY_INDUSTRIAS.filter(ind=>comms.some(c=>c.industria===ind)).map(ind=>(
              <optgroup key={ind} label={ind}>
                {comms.filter(c=>c.industria===ind).map(c=><option key={c.id} value={c.id}>{c.commodity}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Vigencia desde"><TI type="date" value={vigDesde} onChange={e=>setVigDesde(e.target.value)}/></Field>
        <Field label="Vigencia hasta"><TI type="date" value={vigHasta} onChange={e=>setVigHasta(e.target.value)}/></Field>
      </div>
      {traslapeVig&&<div style={{fontSize:11.5,color:"#8A6D1F",background:"#FBF4E0",border:"1px solid #EAD9A0",borderRadius:8,padding:"7px 10px",marginBottom:10}}>ℹ {traslapeVig}</div>}
      {avisoVig&&<div style={{fontSize:11.5,color:"#8A6D1F",background:"#FBF4E0",border:"1px solid #EAD9A0",borderRadius:8,padding:"7px 10px",marginBottom:10}}>⚠ {avisoVig.txt} Es solo un aviso, no bloquea.</div>}
      {nuevoOpen&&(<div style={{display:"flex",gap:8,alignItems:"flex-end",background:C.soft,border:"1px solid "+C.sep2,borderRadius:8,padding:10,marginTop:10}}>
        <Field label="Nombre del cliente / prospecto" w={2}><TI value={nuevoNombre} onChange={e=>setNuevoNombre(e.target.value)} placeholder="Razón social" onKeyDown={e=>e.key==="Enter"&&guardarNuevoCliente()}/></Field>
        <Field label="Tipo" w={.8}><Sel value={nuevoTipo} onChange={e=>setNuevoTipo(e.target.value)} options={[{v:"prospecto",t:"Prospecto"},{v:"cliente",t:"Cliente"}]}/></Field>
        <Btn kind="green" small onClick={guardarNuevoCliente} disabled={creando}>{creando?"Creando…":"Crear y seleccionar"}</Btn>
      </div>)}
      <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+C.sep}}>
        <Lbl>Equipos a cotizar (columnas)</Lbl>
        <div style={{display:"flex",gap:24,flexWrap:"wrap",marginTop:4}}>
          {EQUIPO_CATS.map(cat=>(<div key={cat} style={{minWidth:160}}>
            <div style={{fontSize:10,fontWeight:"bold",color:C.red,letterSpacing:.5,textTransform:"uppercase",marginBottom:4}}>{cat}</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {EQUIPOS.filter(e=>e.cat===cat).map(e=>(<label key={e.k} style={{display:"flex",alignItems:"center",gap:5,fontSize:12.5,color:C.slate,cursor:"pointer"}}><input type="checkbox" checked={equipos.includes(e.k)} onChange={()=>toggleEq(e.k)}/>{e.t}</label>))}
            </div>
          </div>))}
        </div>
      </div>
    </div>

    {!started&&(<div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:12,padding:20,marginBottom:16,textAlign:"center"}}>
      <Btn kind="dark" onClick={()=>{setStarted(true);setRutas([mkRuta()]);}}>Empezar cotización</Btn>
    </div>)}

    {started&&(<>
      <fieldset disabled={!editable} style={{border:"none",padding:0,margin:0,minWidth:0,opacity:editable?1:.75}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <Btn kind="ghost" small onClick={()=>jalarRecargos(true)} disabled={autoBusy}>{autoBusy?"Buscando…":"⟲ Jalar recargos de ruta similar"}</Btn>
        {(()=>{const pp=rutaPaises();return pp?<span style={{fontSize:11,color:C.label}}>Ruta detectada: <b style={{color:C.slate}}>{rutaPaisLabel(pp.o,pp.d)}</b></span>:<span style={{fontSize:11,color:C.label}}>Define POL/POD para detectar países y autocompletar recargos.</span>;})()}
        {autoMsg&&<span style={{fontSize:11,color:autoMsg.startsWith("No")?C.label:C.green,fontWeight:"bold"}}>{autoMsg}</span>}
      </div>
      {tradelane && (()=>{ const off=(rutas||[]).filter(r=>(tx(r.pol)||tx(r.origen))&&(tx(r.pod)||tx(r.destino))&&!rutaEnTradelane(tradelane,r)); return off.length?(<div style={{fontSize:11.5,color:"#8A6D1F",background:"#FBF4E0",border:"1px solid #EAD9A0",borderRadius:8,padding:"7px 10px",marginBottom:10}}>⚠ {off.length} ruta(s) parecen fuera del tradelane <b>{tradelane}</b> ({tradeLabel(tradelane)}). Es solo un aviso, no bloquea.</div>):null; })()}
      </fieldset>
      <NavierasSection quoteNav={quoteNav} setQuoteNav={setQuoteNav} rutas={rutas} catalog={mergedCat} onAlta={altaRecargo} dir={direccion} equipos={equipos} onGenerar={generarRecargos} foco={focoRecargo} editable={editable} onPropagarRec={abrirPropagarNav}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:"bold",color:C.ink}}>Tarifas <span style={{fontWeight:"normal",color:C.label,fontSize:12}}>· base y profit por tamaño; costo, venta y subject-to salen solos</span></span>
          <input value={qTar} onChange={e=>setQTar(e.target.value)} placeholder="Buscar origen, destino, POL, POD…" style={{...inS,fontSize:12,padding:"6px 9px",width:220}}/>{qTar&&<span onClick={()=>setQTar("")} title="Limpiar" style={{cursor:"pointer",fontSize:11,color:C.red}}>Limpiar</span>}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}><input type="file" ref={impInputRef} accept=".xlsx,.xls" style={{display:"none"}} onChange={onTarifarioFile}/><Btn kind="ghost" small disabled={!editable} onClick={()=>impInputRef.current&&impInputRef.current.click()}>⇪ Importar tarifario</Btn><Btn kind="ghost" small onClick={bajarPlantillaTarifario} title="Descarga la plantilla con encabezados, ejemplo y listas">⬇ Plantilla</Btn><Btn kind="ghost" small onClick={()=>setEditRutas(!editRutas)}>{editRutas?"Ocultar rutas":"Editar rutas"}</Btn><Btn kind="ghost" small disabled={!editable} onClick={()=>setRutas(ordenarRutas(rutas,direccion))} title="Ordenar por ciudad origen · país POL · región POD · país POD">↕ Ordenar rutas</Btn><Btn kind="ghost" small disabled={!editable} onClick={()=>setRutas([...rutas,mkRuta()])}>＋ Agregar ruta</Btn></div>
      </div>
      <fieldset disabled={!editable} style={{border:"none",padding:0,margin:0,minWidth:0,opacity:editable?1:.75}}>
      {impSheets&&<div style={{background:"#FFF9E9",border:"1px solid #EAD9A0",borderRadius:8,padding:"8px 10px",marginBottom:10}}>
        <span style={{fontSize:12,fontWeight:"bold",color:"#8A6D1F",marginRight:8}}>¿Qué hoja/ciudad importar?</span>
        {impSheets.map(s=><span key={s} onClick={()=>aplicarTarifario(s)} style={{cursor:"pointer",fontSize:12,fontWeight:"bold",color:"#fff",background:C.red,borderRadius:6,padding:"3px 10px",marginRight:6,marginTop:2,display:"inline-block"}}>{s}</span>)}
        <span onClick={()=>setImpSheets(null)} style={{cursor:"pointer",fontSize:11,color:C.label,marginLeft:6}}>cancelar</span>
      </div>}
      {editRutas&&(<div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:10,padding:14,marginBottom:12}}>
        {rutas.map((r,ri)=>{if(!matchTar(r)) return null;return (<div key={ri} style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:8,paddingBottom:8,borderBottom:ri<rutas.length-1?"1px solid "+C.sep:"none"}}>
          <span style={{fontSize:11,fontWeight:"bold",color:"#fff",background:C.ink,borderRadius:5,padding:"3px 8px",marginBottom:4}}>R{ri+1}</span>
          <Field label="Origen (ciudad)"><ComboBox value={r.origen} items={optCiudades()} placeholder="Ciudad…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,origen:v}:x))}/></Field>
          <Field label="Modo" w={.8}><Sel value={r.precarriage_mode} onChange={e=>setRutas(rutas.map((x,i)=>i===ri?{...x,precarriage_mode:e.target.value}:x))} options={["","All Truck","Rail+Truck","Rail Ramp","Truck Ramp","Barge"]}/></Field>
          <Field label="POL"><ComboBox value={r.pol} items={optPuertos()} placeholder="Puerto / UNLOCODE…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,pol:v}:x))}/>{tx(r.pol)&&<div style={{fontSize:10,color:C.label,marginTop:2,lineHeight:1.2}} title={puertoNombre(r.pol)}>{puertoNombre(r.pol)}</div>}</Field>
          <Field label="POD"><ComboBox value={r.pod} items={optPuertos()} placeholder="Puerto / UNLOCODE…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,pod:v}:x))}/>{tx(r.pod)&&<div style={{fontSize:10,color:C.label,marginTop:2,lineHeight:1.2}} title={puertoNombre(r.pod)}>{puertoNombre(r.pod)}</div>}</Field>
          <Field label="Modo" w={.8}><Sel value={r.oncarriage_mode} onChange={e=>setRutas(rutas.map((x,i)=>i===ri?{...x,oncarriage_mode:e.target.value}:x))} options={["","All Truck","Rail+Truck","Rail Ramp","Truck Ramp","Barge"]}/></Field>
          <Field label="Destino (ciudad)"><ComboBox value={r.destino} items={optCiudades()} placeholder="Ciudad…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,destino:v}:x))}/></Field>
          <Chip>{serviceMode(r)}</Chip>{transportMode(r)&&<span style={{fontSize:10,color:C.label,fontWeight:"bold",marginLeft:6}}>{transportMode(r)}</span>}
          <span onClick={()=>setRutas(rutas.filter((_,i)=>i!==ri))} style={{cursor:"pointer",color:C.label,fontSize:11,marginBottom:6}}>✕</span>
        </div>);})}
      </div>)}
      <TarifasGrid rutas={rutas} setRutas={setRutas} quoteNav={quoteNav} equipos={equipos} dir={direccion} editarProp={editarPropuesta} filtro={matchTar} editable={editable} onPropagar={abrirPropagar} onSimilares={abrirSimilares} onFoco={(scac,tl)=>setFocoRecargo({scac,tl,ts:Date.now()})}/>
      </fieldset>
      <div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:12,padding:14,marginTop:14,opacity:editable?1:.7,pointerEvents:editable?"auto":"none"}}>
        <Lbl>Notas <span style={{fontWeight:"normal",color:C.label,textTransform:"none"}}>· texto libre que aparece en el PDF (condiciones, comentarios, etc.)</span></Lbl>
        <textarea value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Ej. Tarifas sujetas a disponibilidad de espacio y equipo. No incluye seguro de la mercancía…" rows={3} style={{...inS,marginTop:4,resize:"vertical",minHeight:64,fontFamily:F,lineHeight:1.45}}/>
        {notasInternas&&<div style={{marginTop:12}}>
          <Lbl>Notas internas <span style={{fontWeight:"normal",color:C.label,textTransform:"none"}}>· correcciones y propagaciones (uso interno, NO sale al cliente)</span></Lbl>
          <div style={{marginTop:4,padding:"8px 10px",background:"#FBF4E0",border:"1px solid #EAD9A0",borderRadius:8,fontSize:11.5,color:C.slate,whiteSpace:"pre-wrap",fontFamily:F,lineHeight:1.5}}>{notasInternas}</div>
        </div>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,padding:"6px 0"}}>
        <span style={{fontSize:12,color:saved?C.green:C.label}}>{saved?("Guardado "+(saved.codigo||codigo||"")+" · "+saved.lineas+" líneas, "+saved.opciones+" opciones, "+saved.surcharges+" recargos"):""}</span>
        <div style={{display:"flex",gap:10}}>
          <Btn kind="ghost" onClick={generar}>Generar cotización (PDF)</Btn>
          <Btn kind="ghost" onClick={()=>exportarXlsx(false)}>Exportar a Excel</Btn>
          <Btn kind="ghost" onClick={()=>exportarXlsx(true)} title="Mismo formato + profit por equipo. No enviar al cliente.">Excel interno (profits)</Btn>
          {corrigiendo&&<Btn kind="primary" onClick={guardarCorreccionUI} disabled={saving}>{saving?"Guardando…":"✎ Guardar corrección"}</Btn>}
          {corrigiendo&&<Btn kind="ghost" onClick={async()=>{ setCorrigiendo(false); try{ const st2=await loadVersion(versionId); if(st2){ if(st2.rutas) setRutas(st2.rutas); if(st2.notas!=null) setNotas(st2.notas); } }catch(_){} }} disabled={saving}>Cancelar corrección</Btn>}
          {editable&&!corrigiendo&&<Btn kind="green" onClick={guardar} disabled={saving}>{saving?"Guardando…":(versionId?"Guardar cambios":"Guardar cotización")}</Btn>}
          {editable&&!corrigiendo&&versionId&&<Btn kind="dark" onClick={enviar} disabled={saving}>Marcar enviada</Btn>}
          {editable&&versionId&&!hayAncla&&<Btn kind="ghost" onClick={anclar} disabled={saving} title="Congela el precio al cliente. Al ajustar costos cambia tu profit, no el precio.">🔒 Fijar precio al cliente</Btn>}
          {editable&&hayAncla&&!editarPropuesta&&<Btn kind="ghost" onClick={toggleEditProp} disabled={saving}>✎ Editar precio</Btn>}
          {editable&&hayAncla&&editarPropuesta&&<Btn kind="primary" onClick={async()=>{ await anclar(); setEditarPropuesta(false); }} disabled={saving}>🔒 Fijar este nuevo precio</Btn>}
          {editable&&hayAncla&&editarPropuesta&&<Btn kind="ghost" onClick={toggleEditProp} disabled={saving}>Cancelar</Btn>}
          {hayAncla&&!editarPropuesta&&<span style={{fontSize:11,fontWeight:"bold",color:"#0B7A3B",background:"#E8F5EC",border:"1px solid #BFE3CB",borderRadius:6,padding:"4px 9px",alignSelf:"center"}}>🔒 Precio fijo al cliente</span>}
          {hayAncla&&!editarPropuesta&&<span style={{fontSize:10.5,color:C.label,alignSelf:"center",maxWidth:280,lineHeight:1.3}}>El cliente ve un precio congelado; al ajustar costos cambia tu profit, no el precio.</span>}
          {!editable&&versionId&&<Btn kind="primary" onClick={nueva} disabled={saving}>{saving?"Creando…":"＋ Nuevo Amendment"}</Btn>}
        </div>
      </div>
    </>)}
    {sim&&<div onClick={()=>!sim.busy&&setSim(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.06)",display:"flex",justifyContent:"flex-end",zIndex:1000}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",width:"min(560px,96vw)",height:"100%",overflow:"auto",boxShadow:"-8px 0 32px rgba(0,0,0,0.22)",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
          <div style={{fontSize:15,fontWeight:"bold",color:C.ink}}>\U0001F50E Tarifas de rutas similares</div>
          <span onClick={()=>setSim(null)} style={{cursor:"pointer",color:C.label,fontSize:18,lineHeight:1}}>\u2715</span>
        </div>
        <div style={{fontSize:11.5,color:C.label,marginBottom:12,lineHeight:1.45}}>Rutas en otros borradores con el mismo POL/POD (o puerto de nombre similar). Importa navieras + base + recargos + profit; se conserva tu POL/POD.</div>
        {sim.busy&&<div style={{fontSize:12.5,color:C.label,padding:"14px 0"}}>Buscando\u2026</div>}
        {!sim.busy&&(()=>{
          const dirActual=direccion||"E";
          const filaEq=(nv,dirRef)=>{ const eqk=Object.keys(nv.precios||{}).filter(k=>{const p=nv.precios[k]||{};return p.base!=null&&p.base!=="";}); return eqk.map(ek=>{ const eqObj=EQUIPOS.find(e=>e.k===ek); if(!eqObj) return null; const pr=nv.precios[ek]||{}; const base=n(pr.base); const rec=adicPorCont(nv.recargos||[],eqObj,dirRef); const prof=n(pr.profit); const venta=round10(base+rec+prof); return {ek,eqT:eqObj.t,base,recN:(nv.recargos||[]).length,rec,prof,venta}; }).filter(Boolean); };
          const render=(lista,titulo,badge)=> (lista&&lista.length>0)&&(<div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:"bold",color:C.slate,marginBottom:6}}>{titulo} ({lista.length})</div>
            {lista.map((m,mi)=>{ const dirRef=m.direccion||dirActual; return (<div key={mi} style={{border:"1px solid "+C.sep2,borderRadius:8,padding:"9px 11px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginBottom:2}}>
                <span style={{fontSize:9.5,fontWeight:"bold",color:badge.c,background:badge.bg,border:"1px solid "+C.sep2,borderRadius:4,padding:"1px 6px"}}>{badge.t}</span>
                <span style={{fontWeight:"bold",color:C.ink,fontSize:12.5}}>{m.folio}</span>
                <span style={{color:C.slate,fontSize:12}}>{m.cliente}</span>
                {m.producto&&<span style={{color:C.label,fontSize:11}}>\u00b7 {m.producto}</span>}
              </div>
              <div style={{fontSize:11,color:C.label,marginBottom:7}}>{m.polNombre} \u2192 {m.podNombre}</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{color:C.label,textAlign:"right"}}>
                  <th style={{textAlign:"left",fontWeight:"normal",padding:"2px 4px"}}>Equipo</th>
                  <th style={{textAlign:"left",fontWeight:"normal",padding:"2px 4px"}}>Naviera</th>
                  <th style={{fontWeight:"normal",padding:"2px 4px"}}>Base</th>
                  <th style={{fontWeight:"normal",padding:"2px 4px"}}>Recargos</th>
                  <th style={{fontWeight:"normal",padding:"2px 4px"}}>Profit</th>
                  <th style={{fontWeight:"normal",padding:"2px 4px"}}>Tarifa cliente</th>
                </tr></thead>
                <tbody>{(m.navieras||[]).map((nv,ni)=> filaEq(nv,dirRef).map((ff,fi)=>(
                  <tr key={ni+"-"+fi} style={{borderTop:"1px solid "+C.sep,textAlign:"right"}}>
                    <td style={{textAlign:"left",padding:"3px 4px",color:C.slate}}>{ff.eqT}</td>
                    <td style={{textAlign:"left",padding:"3px 4px",fontWeight:"bold",color:C.ink}}>{nv.scac}</td>
                    <td style={{padding:"3px 4px"}}>${ff.base.toLocaleString()}</td>
                    <td style={{padding:"3px 4px"}}>${ff.rec.toLocaleString()} <span style={{color:C.label}}>({ff.recN})</span></td>
                    <td style={{padding:"3px 4px",color:ff.prof<250?C.red:C.slate}}>${ff.prof.toLocaleString()}</td>
                    <td style={{padding:"3px 4px",fontWeight:"bold",color:C.ink}}>${ff.venta.toLocaleString()}</td>
                  </tr>
                )))}</tbody>
              </table>
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}><Btn kind="primary" small onClick={()=>importarSimilar(m)}>Importar a mi ruta</Btn></div>
            </div>); })}
          </div>);
          const hay=(sim.exactas&&sim.exactas.length)||(sim.aproximadas&&sim.aproximadas.length);
          return (<div>
            {render(sim.exactas,"Coincidencia exacta (mismo POL y POD)",{t:"EXACTA",c:"#0B7A3B",bg:"#E8F5EC"})}
            {render(sim.aproximadas,"Coincidencia aproximada (puerto de nombre similar)",{t:"SIMILAR",c:"#1F6FB2",bg:"#E7F1FB"})}
            {!hay&&<div style={{fontSize:12.5,color:C.label,padding:"12px 0"}}>No se encontraron rutas similares en otros borradores.</div>}
          </div>); })()}
      </div>
    </div>}
    {prop&&<div onClick={()=>!prop.busy&&setProp(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:12,padding:20,width:"min(680px,94vw)",maxHeight:"88vh",overflow:"auto",boxShadow:"0 12px 44px rgba(0,0,0,0.28)"}}>
        <div style={{fontSize:15,fontWeight:"bold",color:C.ink,marginBottom:4}}>⇄ Propagar recargo a otros borradores</div>
        <div style={{fontSize:11.5,color:C.label,marginBottom:14,lineHeight:1.45}}>Copia un recargo de esta naviera y par de países a otros borradores (de cualquier cliente). Los amendments enviados no se tocan. Se conserva la <b>tarifa al cliente</b>: el profit absorbe el cambio de costo.</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end",marginBottom:12}}>
          <div><Lbl>Naviera</Lbl><Sel value={prop.scac} onChange={e=>{const scac=e.target.value; const surs=surOfMain(scac,prop.tl); const s=surs[0]||{}; setProp(p=>({...p,scac,clave:s.c||"",monto:String(s.monto||""),montos:{...(s.montos||{})},coinc:null}));}} options={prop.navs.map(s=>({v:s,t:s+" · "+navName(s)}))} style={{minWidth:150}}/></div>
          {(prop.pares||[]).length>1&&<div><Lbl>País origen → destino</Lbl><Sel value={String(prop.paisIdx||0)} onChange={e=>setProp(p=>({...p,paisIdx:Number(e.target.value),coinc:null}))} options={(prop.pares||[]).map((pp,i)=>({v:String(i),t:pp.paisPol+" → "+pp.paisPod}))} style={{minWidth:150}}/></div>}
          <div><Lbl>Recargo</Lbl><Sel value={prop.clave} onChange={e=>{const clave=e.target.value; const s=propRecargos().find(x=>x.c===clave)||{}; setProp(p=>({...p,clave,monto:String(s.monto||""),montos:{...(s.montos||{})},coinc:null}));}} options={propRecargos().map(s=>({v:s.c,t:s.c+(s.d?" · "+s.d:"")}))} style={{minWidth:170}}/></div>
          <div><Lbl>Monto general</Lbl><TI value={prop.monto} onChange={e=>setProp(p=>({...p,monto:e.target.value}))} inputMode="decimal" style={{width:100}}/></div>
          <Btn kind="dark" onClick={propBuscar} disabled={prop.busy||!prop.scac||!prop.clave}>{prop.busy?"Buscando…":"Buscar coincidencias"}</Btn>
        </div>
        {(equipos||[]).length>0&&<div style={{marginBottom:12,padding:"8px 10px",background:C.soft,border:"1px solid "+C.sep2,borderRadius:8}}>
          <div style={{fontSize:10.5,color:C.label,fontWeight:"bold",marginBottom:4}}>Monto por tamaño <span style={{fontWeight:"normal"}}>(vacío = usa el general{prop.monto?" $"+prop.monto:""})</span></div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{(equipos||[]).map(ek=>{const eqObj=EQUIPOS.find(x=>x.k===ek);return (<span key={ek} style={{display:"inline-flex",alignItems:"center",gap:4}}><span style={{fontSize:11,color:C.slate}}>{eqObj?eqObj.t:ek}</span><TI value={(prop.montos&&prop.montos[ek])||""} onChange={e=>setProp(p=>({...p,montos:{...(p.montos||{}),[ek]:e.target.value}}))} inputMode="decimal" placeholder={prop.monto||"0"} style={{width:70}}/></span>);})}</div>
        </div>}
        <div style={{fontSize:11,color:C.label,marginBottom:10}}>Buscar en: <b>{(prop.pares||[])[prop.paisIdx||0]?((prop.pares[prop.paisIdx||0].paisPol)+" → "+(prop.pares[prop.paisIdx||0].paisPod)):"—"}</b> · naviera <b>{prop.scac}</b> · recargo <b>{prop.clave}</b></div>
        {prop.coinc!=null&&(prop.coinc.length===0?<div style={{fontSize:12.5,color:C.label,padding:"12px 0"}}>No hay otros borradores con esa naviera, esos países y ese recargo.</div>:
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:12,fontWeight:"bold",color:C.slate}}>{prop.coinc.length} coincidencia(s)</div>
              <span onClick={()=>{const all=prop.coinc.every(x=>prop.sel[_rkey(x)]); const sel={}; if(!all) prop.coinc.forEach(x=>sel[_rkey(x)]=true); setProp(p=>({...p,sel}));}} style={{fontSize:11,color:C.red,cursor:"pointer"}}>{prop.coinc.every(x=>prop.sel[_rkey(x)])?"Quitar todas":"Seleccionar todas"}</span>
            </div>
            <div style={{border:"1px solid "+C.sep2,borderRadius:8,overflow:"hidden"}}>
              {prop.coinc.map((x,i)=><label key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"7px 10px",borderBottom:i<prop.coinc.length-1?"1px solid "+C.sep:"none",fontSize:12,cursor:"pointer"}}>
                <input type="checkbox" checked={!!prop.sel[_rkey(x)]} onChange={e=>setProp(p=>({...p,sel:{...p.sel,[_rkey(x)]:e.target.checked}}))}/>
                <span style={{fontWeight:"bold",color:C.ink,minWidth:64}}>{x.folio}</span>
                <span style={{color:C.slate,flex:1,minWidth:120}}>{x.cliente}</span>
                <span style={{color:C.label,flex:1.4}}>{x.rutaLabel}</span>
                <span style={{color:C.label,whiteSpace:"nowrap"}}>actual ${x.montoActual||0}</span>
              </label>)}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12,flexWrap:"wrap"}}>
              <Btn kind="ghost" onClick={()=>setProp(null)} disabled={prop.busy}>Cancelar</Btn>
              <Btn kind="primary" onClick={()=>propAplicar(false)} disabled={prop.busy}>{prop.busy?"Aplicando…":"Aplicar a seleccionadas"}</Btn>
              <Btn kind="dark" onClick={()=>propAplicar(true)} disabled={prop.busy}>Aplicar a todas</Btn>
            </div>
          </div>
        )}
        {prop.coinc==null&&<div style={{display:"flex",justifyContent:"flex-end",marginTop:6}}><Btn kind="ghost" onClick={()=>setProp(null)}>Cerrar</Btn></div>}
      </div>
    </div>}
  </div>);
}
