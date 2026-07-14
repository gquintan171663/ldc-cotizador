import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import { C, F, EQUIPOS, EQUIPO_CATS, NAVIERAS, navName, CATALOG, COMMODITY_INDUSTRIAS, tx, scopeFull, serviceMode, transportMode, n, round10, adicPorCont, cargosBL, inclPorCont, inclBL, subjectTo, enPrecio, esSubjectTo, money, MONEDAS, optPuertos, optCiudades, puertoNombre, paisOrigen, paisDestino, rutaPaisLabel, tlDe, tlLabel, TRADELANES, tradeLabel, rutaEnTradelane, opcionActivaEq, mejorOpcionEq, ovRazon, PLANTILLA_RECARGOS, parseTarifario, ordenarRutas } from "./lib.js";
import { inS, Lbl, Field, TI, Sel, Chip, Btn, ClaveAutocomplete, ComboBox } from "./ui.jsx";
import { saveCotizacion, loadVersion, markEnviada, nuevaVersion, crearCliente, altaSurcharge, listSurcharges, recargosDeRutaSimilar, recargosDeRutaSimilarPorNaviera, recargosDeNaviera, anclarVenta, checkConflictoTarifa } from "./db.js";
import { abrirCotizacion } from "./quote.js";
import * as XLSX from "xlsx";

function SurchargeGrid({surs,onChange,catalog,dir,equipos}){
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
        {rows.map((r,i)=>{const hasSizes=r.montos&&Object.values(r.montos).some(v=>v!==""&&v!=null);return (<React.Fragment key={i}>
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
          <td style={{...td,textAlign:"center"}}><span onClick={()=>del(i)} style={{cursor:"pointer",color:C.label,fontWeight:"bold"}}>✕</span></td>
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
      <span onClick={add} style={{cursor:"pointer",color:C.red,fontWeight:"bold",fontSize:12.5}}>＋ Agregar recargo</span>
      <span style={{fontSize:11,color:C.label}}>
        <span style={{color:C.green,fontWeight:"bold"}}>Incluidos:</span> <b style={{color:C.slate}}>{money(inclPorCont(rows,e20))}</b>/20' · <b style={{color:C.slate}}>{money(inclPorCont(rows,e40))}</b>/40'{inclBL(rows)>0&&<span> · BL <b style={{color:C.slate}}>{money(inclBL(rows))}</b></span>}
        <span style={{margin:"0 8px",color:C.sep2}}>|</span>
        <span style={{color:C.red,fontWeight:"bold"}}>No incluidos (suman):</span> <b style={{color:C.slate}}>{money(adicPorCont(rows,e20,dir))}</b>/20' · <b style={{color:C.slate}}>{money(adicPorCont(rows,e40,dir))}</b>/40'{cargosBL(rows,dir)>0&&<span> · BL <b style={{color:C.slate}}>{money(cargosBL(rows,dir))}</b></span>}
      </span>
    </div>
  </div>);
}

function NavierasSection({quoteNav,setQuoteNav,rutas,catalog,onAlta,dir,equipos,onGenerar,foco}){
  const [altaOpen,setAltaOpen]=useState(false);
  const [nc,setNc]=useState(""); const [nd,setNd]=useState("");
  const doAlta=async()=>{ const c=nc.trim().toUpperCase(); if(!c) return; await onAlta(c,nd.trim()); setNc(""); setNd(""); setAltaOpen(false); };
  // Bloques automáticos: uno por cada (naviera × tradelane país POL→POD) presente en las rutas
  const blocks=[]; const seen=new Set();
  (rutas||[]).forEach(r=>{ const tl=tlDe(r); (r.opciones||[]).forEach(o=>{ if(!o.navScac) return; const k=o.navScac+"|"+tl; if(seen.has(k)) return; seen.add(k); blocks.push({scac:o.navScac,tl}); }); });
  blocks.sort((a,b)=> a.scac===b.scac ? ((a.tl||"")<(b.tl||"")?-1:1) : (a.scac<b.scac?-1:1));
  const surOf=(scac,tl)=>(quoteNav.find(q=>q.scac===scac&&(q.tl||"")===(tl||""))||{}).surcharges||[];
  const setSurs=(scac,tl,s)=>{ const idx=quoteNav.findIndex(q=>q.scac===scac&&(q.tl||"")===(tl||"")); if(idx>=0) setQuoteNav(quoteNav.map((q,j)=>j===idx?{...q,surcharges:s}:q)); else setQuoteNav([...quoteNav,{scac,tl,surcharges:s}]); };
  const copyFrom=(scac,tl,fromTl)=>{ if(!fromTl) return; const src=surOf(scac,fromTl); if(!src.length) return; if(surOf(scac,tl).length && !confirm("¿Reemplazar los recargos actuales con los de "+tlLabel(fromTl)+"?")) return; setSurs(scac,tl,src.map(x=>({...x}))); };
  const [colap,setColap]=useState({});
  const bkey=(b)=>b.scac+"|"+(b.tl||"");
  const eid=(b)=>"blk_"+b.scac+"_"+String(b.tl||"nl").replace(/[^A-Za-z0-9]/g,"_");
  // Arranca colapsado cuando hay más de 2 bloques (una sola vez, al aparecer)
  const colapInit=React.useRef(false);
  useEffect(()=>{ if(colapInit.current) return; if(blocks.length>2){ const m={}; blocks.forEach(b=>{m[bkey(b)]=true;}); setColap(m); } if(blocks.length>0) colapInit.current=true; },[blocks.length]);
  const toggle=(b)=>setColap(c=>({...c,[bkey(b)]:!c[bkey(b)]}));
  const setAll=(v)=>{ const m={}; blocks.forEach(b=>{m[bkey(b)]=v;}); setColap(m); };
  const allCol=blocks.length>0 && blocks.every(b=>colap[bkey(b)]);
  useEffect(()=>{ if(!foco||!foco.scac) return; const b={scac:foco.scac,tl:foco.tl}; setColap(c=>({...c,[bkey(b)]:false})); const t=setTimeout(()=>{ const el=document.getElementById(eid(b)); if(el) el.scrollIntoView({behavior:"smooth",block:"center"}); },60); return ()=>clearTimeout(t); },[foco]);
  return (<div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:12,padding:16,marginBottom:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
      <span style={{fontSize:13,fontWeight:"bold",color:C.ink}}>Navieras y recargos <span style={{fontWeight:"normal",color:C.label,fontSize:12}}>· un bloque por naviera × lane (país POL → país POD), según tus rutas</span></span>
      <div style={{display:"flex",gap:8}}>
        {blocks.length>1&&<Btn kind="ghost" small onClick={()=>setAll(!allCol)}>{allCol?"Expandir todo":"Colapsar todo"}</Btn>}
        <Btn kind="ghost" small onClick={()=>setAltaOpen(!altaOpen)}>{altaOpen?"Cancelar":"＋ Alta de recargo"}</Btn>
      </div>
    </div>
    {altaOpen&&(<div style={{display:"flex",gap:8,alignItems:"flex-end",background:C.soft,border:"1px solid "+C.sep2,borderRadius:8,padding:10,marginBottom:12}}>
      <Field label="Clave nueva" w={.6}><TI value={nc} onChange={e=>setNc(e.target.value.toUpperCase())} placeholder="EJ. ABC"/></Field>
      <Field label="Descripción"><TI value={nd} onChange={e=>setNd(e.target.value)} placeholder="Descripción del recargo"/></Field>
      <Btn kind="green" small onClick={doAlta}>Dar de alta</Btn>
      <span style={{fontSize:11,color:C.label,marginBottom:6}}>Queda en el catálogo y disponible en el autocompletado.</span>
    </div>)}
    {blocks.length===0&&<div style={{fontSize:12,color:C.label,padding:"6px 0"}}>Define rutas con naviera y POL/POD; por cada naviera y lane aparecerá aquí un bloque de recargos.</div>}
    {blocks.map(b=>{ const surs=surOf(b.scac,b.tl); const others=blocks.filter(x=>x.scac===b.scac&&(x.tl||"")!==(b.tl||"")); const col=!!colap[bkey(b)]; return (
      <div key={b.scac+"|"+b.tl} id={eid(b)} style={{marginBottom:12,border:"1px solid "+C.sep,borderRadius:8,padding:"8px 10px",background:col?C.soft:"#fff"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span onClick={()=>toggle(b)} title={col?"Expandir":"Colapsar"} style={{cursor:"pointer",fontSize:13,color:C.label,fontWeight:"bold",width:14,display:"inline-block"}}>{col?"▸":"▾"}</span>
          <span onClick={()=>toggle(b)} style={{cursor:"pointer",fontSize:11,fontWeight:"bold",color:"#fff",background:C.slate,borderRadius:4,padding:"2px 8px",letterSpacing:1}}>{b.scac}</span>
          <span onClick={()=>toggle(b)} style={{cursor:"pointer",fontSize:13,fontWeight:"bold",color:C.slate}}>{navName(b.scac)}</span>
          <span style={{fontSize:11,fontWeight:"bold",color:"#fff",background:C.red,borderRadius:4,padding:"2px 8px"}}>{tlLabel(b.tl)}</span>
          {col&&<span style={{fontSize:11,color:C.label}}>· {surs.length?(surs.length+" recargo(s)"):"sin recargos"}</span>}
          {onGenerar&&<span onClick={()=>onGenerar(b.scac,b.tl)} title="Buscar coincidencias o generar recargos para esta naviera × lane" style={{cursor:"pointer",fontSize:11,fontWeight:"bold",color:surs.length?C.slate:"#fff",background:surs.length?C.soft:C.red,border:surs.length?("1px solid "+C.sep2):"none",borderRadius:6,padding:"3px 9px",marginLeft:col?8:4}}>⚡ {surs.length?"Regenerar":"Generar recargos"}</span>}
          {!col&&others.length>0&&<select value="" onChange={e=>copyFrom(b.scac,b.tl,e.target.value)} style={{...inS,padding:"4px 6px",fontSize:11.5,marginLeft:"auto",maxWidth:240}}>
            <option value="">⧉ Copiar recargos de otro lane…</option>
            {others.map(x=><option key={x.tl} value={x.tl}>{tlLabel(x.tl)}</option>)}
          </select>}
        </div>
        {!col&&<div style={{marginTop:6}}><SurchargeGrid surs={surs} catalog={catalog} dir={dir} equipos={equipos} onChange={(s)=>setSurs(b.scac,b.tl,s)}/></div>}
      </div>);
    })}
  </div>);
}

function TarifasGrid({rutas,setRutas,quoteNav,equipos,dir,onFoco,editarProp}){
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
  const th={fontSize:9.5,letterSpacing:.3,textTransform:"uppercase",color:"#fff",fontWeight:"bold",padding:"6px 5px",whiteSpace:"nowrap"};
  const td={padding:"5px 5px",verticalAlign:"middle",borderBottom:"1px solid "+C.sep};
  const cell={...inS,padding:"5px 5px",fontSize:12,width:54,textAlign:"right"};
  return (<div style={{border:"1px solid "+C.sep2,borderRadius:10,overflow:"auto",background:"#fff"}}>
    <table style={{borderCollapse:"collapse",width:"100%",minWidth:620+eqs.length*178}}>
      <thead>
        <tr style={{background:C.ink}}>
          <th rowSpan={2} style={{...th,textAlign:"left"}}>Ruta</th><th rowSpan={2} style={{...th,textAlign:"center"}}>Scope</th><th rowSpan={2} style={{...th,textAlign:"left"}}>Naviera</th><th rowSpan={2} style={{...th,textAlign:"center"}}>T.T.</th>
          {eqs.map(e=><th key={e.k} colSpan={4} style={{...th,textAlign:"center",borderLeft:"1px solid #333"}}>{e.t} <span style={{color:"#9aa4ae",fontWeight:"normal"}}>· {e.teu} TEU</span></th>)}
          <th rowSpan={2} style={{...th,textAlign:"left",borderLeft:"1px solid #333"}}>Subject to</th><th rowSpan={2} style={{...th,textAlign:"center"}}></th>
        </tr>
        <tr style={{background:C.ink}}>{eqs.map(e=>[<th key={e.k+"b"} style={{...th,textAlign:"right",borderLeft:"1px solid #333"}}>Base</th>,<th key={e.k+"r"} style={{...th,textAlign:"right"}}>Recargos</th>,<th key={e.k+"p"} style={{...th,textAlign:"right"}}>Profit</th>,<th key={e.k+"v"} style={{...th,textAlign:"right"}}>Venta</th>])}</tr>
      </thead>
      <tbody>
        {rutas.map((r,ri)=>{const sug=sugerida(r);
          return r.opciones.map((o,oi)=>{const surs=surOf(o.navScac,tlDe(r)),st=surs.filter(s=>esSubjectTo(s,dir)&&s.desplegar!==false).map(s=>s.c),bl=cargosBL(surs,dir),first=oi===0;
            return (<tr key={ri+"-"+oi} style={{background:first?"#fff":C.soft}}>
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
                const _profitR=_anchored?(_ancla-base-adic):prof;
                const _pcol=_profitR<=0?"#C8202E":(_profitR<250?"#8A6D1F":"#0B7A3B");
                const _locked=_anchored&&!editarProp;
                const _modif=_anchored&&editarProp&&round10(venta)!==_ancla;
                return [<td key={e.k+"b"} style={{...td,borderLeft:"1px solid "+C.sep2}}><input value={p.base||""} onFocus={ev=>ev.target.select()} onChange={ev=>setP(ri,oi,e.k,{base:ev.target.value})} inputMode="decimal" placeholder="0" style={cell}/></td>,
                  <td key={e.k+"r"} onClick={()=>{ if(o.navScac&&onFoco) onFoco(o.navScac,tlDe(r)); }} style={{...td,textAlign:"right",fontVariantNumeric:"tabular-nums",color:adic>0?C.slate:C.label,cursor:o.navScac?"pointer":"default",textDecoration:o.navScac?"underline dotted":"none"}} title={o.navScac?(_tip+"\n\n(clic: ir a editar estos recargos)"):""}>{o.navScac?money(adic):""}</td>,
                  ((_anchored && !editarProp)
                    ? <td key={e.k+"p"} style={{...td,textAlign:"right"}} title={"Profit resultante = venta anclada − costo. Propuesta bloqueada en "+money(_ancla)+"."}><b style={{color:_pcol,fontSize:12.5}}>{money(_profitR)}</b><div style={{fontSize:8,color:C.label,whiteSpace:"nowrap"}}>🔒 propuesta</div></td>
                    : <td key={e.k+"p"} style={td}><input value={p.profit||""} onFocus={ev=>ev.target.select()} onChange={ev=>setP(ri,oi,e.k,{profit:ev.target.value})} inputMode="decimal" placeholder="0" style={cell}/></td>),
                  <td key={e.k+"v"} onClick={()=>{ if(!base||base<=0) return; setRutas(rutas.map((x,i)=>{ if(i!==ri) return x; const ne={...(x.elegidaEq||{})}; if(oi===_best){ delete ne[e.k]; return {...x,elegidaEq:ne}; } const razon=prompt("Eliges una naviera que NO es la de menor costo para "+e.t+".\nEscribe la razón (tránsito, servicio, etc.):", ovRazon(ne[e.k])||""); if(razon===null) return x; ne[e.k]={nav:o.navScac,razon:(razon||"").trim()}; return {...x,elegidaEq:ne}; })); }} title={base?(_act?(_isBest?"Mejor costo para "+e.t:"Selección manual (no es el menor costo)"+(_razon?" — Razón: "+_razon:"")):("Clic para elegir "+(o.navScac||"esta naviera")+" en "+e.t)):""} style={{...td,textAlign:"right",fontVariantNumeric:"tabular-nums",cursor:base>0?"pointer":"default",background:_act?(_isBest?"#E8F5EC":"#FBF4E0"):"transparent"}}>{base?<span style={{display:"inline-flex",alignItems:"center",gap:5,justifyContent:"flex-end"}}><span style={{fontSize:12,color:_act?(_isBest?"#0B7A3B":"#8A6D1F"):"#C0C7CE"}}>{_act?"●":"○"}</span><span><b style={{color:_locked?C.ink:(_modif?"#C77800":(_act?(_isBest?"#0B7A3B":"#8A6D1F"):C.slate)),fontWeight:(_act||_anchored)?"bold":"normal"}}>{money(_locked?_ancla:round10(venta))}{_locked?<span style={{fontSize:8,marginLeft:2}}>🔒</span>:(_modif?<span style={{fontSize:8,marginLeft:2,color:"#C77800"}}>▲</span>:null)}</b><div style={{fontSize:9,color:C.label,whiteSpace:"nowrap"}}>{money(base+adic)}{_locked?<span> · <b style={{color:_pcol}}>{money(_profitR)}</b></span>:(_modif?<span> · antes {money(_ancla)}</span>:((prof>0&&(base+adic)>0)?" · "+Math.round(prof/(base+adic)*100)+"%":""))}</div></span></span>:""}</td>];})}
              <td style={{...td,borderLeft:"1px solid "+C.sep2}}>{o.navScac?(st.length?<span style={{fontSize:11}}><b style={{color:C.slate}}>{st.join(" · ")}</b>{bl>0&&<div style={{color:C.label,marginTop:1}}>+ BL {money(bl)}</div>}</span>:<Chip kind="green">ALL-IN</Chip>):""}</td>
              <td style={{...td,textAlign:"center"}}>{r.opciones.length>1&&<span onClick={()=>delOpt(ri,oi)} title="Quitar naviera alterna" style={{cursor:"pointer",color:C.label,fontSize:12}}>✕</span>}</td>
            </tr>);
          }).concat(<tr key={ri+"-add"}><td colSpan={4+eqs.length*4+2} style={{padding:"4px 8px",borderBottom:"1px solid "+C.sep}}><span onClick={()=>addOpt(ri)} style={{cursor:"pointer",color:C.red,fontSize:11.5,fontWeight:"bold"}}>＋ naviera alterna para esta ruta</span>{r.opciones.length>1&&<span style={{fontSize:11,color:C.label,marginLeft:12}}>Mejor por equipo: {eqs.map(e=>{const bi=mejorOpcionEq(r,e.k,e,dir,surOf);return e.t+" "+((bi>=0&&r.opciones[bi].navScac)||"—");}).join(" · ")}{r.elegidaEq&&Object.keys(r.elegidaEq).length>0&&<span style={{color:C.red,marginLeft:8,cursor:"pointer"}} onClick={()=>setRutas(rutas.map((x,i)=>i===ri?{...x,elegidaEq:{}}:x))}>· volver todo a auto</span>}</span>}</td></tr>);
        })}
      </tbody>
    </table>
  </div>);
}

export function Cotizador({ loadId, onDirty }){
  const [clientes,setClientes]=useState([]);
  const [comms,setComms]=useState([]);
  const [cliente,setCliente]=useState("");
  const [modo,setModo]=useState("maritimo");
  const [direccion,setDireccion]=useState("I");
  const [tradelane,setTradelane]=useState("");
  const [noAcuerdo,setNoAcuerdo]=useState("");
  const [amendment,setAmendment]=useState(1);
  const [cambios,setCambios]=useState(null);
  const [commodityId,setCommodityId]=useState("");
  const [vigDesde,setVigDesde]=useState("");
  const [vigHasta,setVigHasta]=useState("");
  const [notas,setNotas]=useState("");
  const [equipos,setEquipos]=useState(["20DV","40HC"]);
  const [impSheets,setImpSheets]=useState(null);
  const [focoRecargo,setFocoRecargo]=useState(null);
  const [editarPropuesta,setEditarPropuesta]=useState(false);
  const impWbRef=React.useRef(null);
  const impInputRef=React.useRef(null);
  const onTarifarioFile=async(e)=>{ const f=e.target.files&&e.target.files[0]; if(e.target) e.target.value=""; if(!f) return; try{ const buf=await f.arrayBuffer(); const wb=XLSX.read(buf,{type:"array"}); impWbRef.current=wb; if(wb.SheetNames.length===1) aplicarTarifario(wb.SheetNames[0]); else setImpSheets(wb.SheetNames); }catch(ex){ alert("No se pudo leer el archivo: "+ex.message); } };
  const aplicarTarifario=(sheet)=>{ const wb=impWbRef.current; setImpSheets(null); if(!wb) return; let nuevas=[]; try{ const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:null}); nuevas=parseTarifario(rows); }catch(ex){ alert("Error al interpretar la hoja: "+ex.message); return; } if(!nuevas.length){ alert("No encontré rutas en la hoja \""+sheet+"\"."); return; } setEquipos(prev=>{ const s=new Set(prev); s.add("20DV"); s.add("40HC"); return [...s]; }); const hay=(rutas||[]).some(r=>tx(r.pol)||tx(r.pod)||(r.opciones||[]).some(o=>tx(o.navScac))); if(hay){ const rep=confirm("Importé "+nuevas.length+" ruta(s) de \""+sheet+"\".\n\nAceptar = REEMPLAZAR las rutas actuales.\nCancelar = AGREGAR al final."); setRutas(ordenarRutas(rep?nuevas:[...rutas,...nuevas])); } else setRutas(ordenarRutas(nuevas)); };
  const [started,setStarted]=useState(false);
  const [rutas,setRutas]=useState([]);
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
      setTradelane(st.tradelane||""); setNoAcuerdo(st.no_acuerdo||""); setAmendment(st.amendment||1); setCambios(st.cambios||null);
      setCommodityId(st.commodity_id||""); setVigDesde(st.vigDesde||""); setVigHasta(st.vigHasta||""); setNotas(st.notas||"");
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

  const editable = estatus==="borrador";
  const comLabel=(comms.find(c=>c.id===commodityId)||{}).commodity||"";
  const folio = (noAcuerdo||codigo) ? ((noAcuerdo||codigo)+(tradelane?(" · "+tradelane):"")+(amendment?(" · AM"+amendment):"")+(comLabel?(" · "+comLabel):"")) : null;
  const codigoPreview=useMemo(()=>{const p=modo==="maritimo"?"M":modo==="terrestre"?"T":"A";return p+direccion+"?";},[modo,direccion]);
  const mkRuta=()=>({origen:"",precarriage_mode:"",pol:"",pod:"",oncarriage_mode:"",destino:"",opciones:[{navScac:"",transito:"",precios:{}}],elegida:0});
  const toggleEq=(k)=>setEquipos(equipos.includes(k)?equipos.filter(x=>x!==k):[...equipos,k]);

  const guardar=async()=>{
    if(!cliente){ alert("Elige un cliente."); return; }
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
    if(res.versionId){ setVersionId(res.versionId); setCodigo(res.codigo); setEstatus("borrador"); if(res.cambios) setCambios(res.cambios); }
    onDirtyRef.current&&onDirtyRef.current(false);
    if(res.errores.length) alert("Guardado con avisos: "+res.errores.slice(0,3).join(" · "));
  };
  const surOfMain=(scac,tl)=>(quoteNav.find(q=>q.scac===scac&&(q.tl||"")===(tl||""))||{}).surcharges||[];
  const derivarAnclaje=(rts,ep=editarPropuesta)=>(rts||[]).map(r=>({...r,opciones:(r.opciones||[]).map(o=>{ const precios={...(o.precios||{})}; Object.keys(precios).forEach(ek=>{ const eqObj=EQUIPOS.find(x=>x.k===ek); const pr=precios[ek]; if(!eqObj||!pr||pr.base==null||pr.base==="") return; const base=n(pr.base); const adic=adicPorCont(surOfMain(o.navScac,tlDe(r)),eqObj,direccion); const anchored=r.ventaAncla&&r.ventaAncla[ek]!=null; const target=(anchored&&!ep)?Number(r.ventaAncla[ek]):(base+adic+n(pr.profit)); const vround=round10(target); precios[ek]={...pr,profit:String(vround-base-adic)}; }); return {...o,precios}; })}));
  const bajoProfit=()=>{ const eqObjs=EQUIPOS.filter(e=>equipos.includes(e.k)); const out=[]; (rutas||[]).forEach(r=>{ eqObjs.forEach(e=>{ const oi=opcionActivaEq(r,e.k,e,direccion,surOfMain); const o=(r.opciones||[])[oi]; if(!o) return; const pr=(o.precios||{})[e.k]||{}; if(pr.base==null||pr.base===""||n(pr.base)<=0) return; const prof=n(pr.profit); if(prof<250) out.push((r.pol||r.origen||"?")+"→"+(r.pod||r.destino||"?")+" "+e.t+" ("+(o.navScac||"—")+"): "+(prof>0?("$"+prof):"SIN PROFIT")); }); }); return out; };
  const confirmProfit=()=>{ const low=bajoProfit(); if(!low.length) return true; return confirm("⚠ Profit bajo o nulo (menor a $250 USD) en:\n\n• "+low.slice(0,12).join("\n• ")+"\n\n¿Continuar de todas formas?"); };
  const faltanPOLPOD=()=>{ const out=[]; (rutas||[]).forEach((r,i)=>{ const f=[]; if(!tx(r.pol))f.push("POL"); if(!tx(r.pod))f.push("POD"); if(!(r.opciones||[]).some(o=>tx(o.navScac)))f.push("naviera"); if(tx(r.origen)&&!tx(r.precarriage_mode))f.push("modo (origen)"); if(tx(r.destino)&&!tx(r.oncarriage_mode))f.push("modo (destino)"); if(f.length) out.push("R"+(i+1)+": falta "+f.join(", ")); }); return out; };
  const enviar=async()=>{ if(!versionId) return; if(!confirmProfit()) return; await markEnviada(versionId); setEstatus("enviada"); };
  const nueva=async()=>{ if(!versionId) return; if(!confirm("¿Crear un nuevo Amendment (AM"+((amendment||1)+1)+")? Se copia el actual para que edites las diferencias; el AM anterior queda superseded.")) return; setSaving(true); const res=await nuevaVersion(versionId); setSaving(false); if(res.errores&&res.errores.length){ alert("Error: "+res.errores.join(" · ")); return; } if(res.versionId){ setVersionId(res.versionId); setCodigo(res.codigo); setAmendment(res.amendment||((amendment||1)+1)); if(res.vigDesde) setVigDesde(res.vigDesde); setCambios(null); setEstatus("borrador"); setSaved(res); } };
  const generar=()=>{ const falt=faltanPOLPOD(); if(falt.length){ alert("Faltan datos obligatorios en las rutas (POL, POD, naviera y modo si hay ciudad):\n\n• "+falt.join("\n• ")); return; } if(!confirmProfit()) return; const cn=(clientes.find(c=>c.id===cliente)||{}).nombre; abrirCotizacion({clienteNombre:cn,codigo:codigo||codigoPreview,no_acuerdo:noAcuerdo,tradelane,amendment,commodity:comLabel,direccion,equipos,rutas:derivarAnclaje(rutas),quoteNav,vigDesde,vigHasta,notas}); };
  const toggleEditProp=()=>{ const next=!editarPropuesta; setRutas(derivarAnclaje(rutas,next)); setEditarPropuesta(next); };
  const lineasPropModificada=()=>{ const out=[]; (rutas||[]).forEach(r=>{ if(!r.ventaAncla) return; Object.keys(r.ventaAncla).forEach(ek=>{ const eqObj=EQUIPOS.find(x=>x.k===ek); if(!eqObj) return; const oi=opcionActivaEq(r,ek,eqObj,direccion,surOfMain); const o=(r.opciones||[])[oi]; if(!o) return; const pr=(o.precios||{})[ek]||{}; if(pr.base==null||pr.base==="") return; const venta=round10(n(pr.base)+adicPorCont(surOfMain(o.navScac,tlDe(r)),eqObj,direccion)+n(pr.profit)); if(venta!==Math.round(Number(r.ventaAncla[ek]))) out.push((r.pol||r.origen||"?")+"→"+(r.pod||r.destino||"?")+" "+eqObj.t+": "+money(Number(r.ventaAncla[ek]))+" → "+money(venta)); }); }); return out; };
  const anclar=async()=>{ if(!versionId){ alert("Guarda la cotización antes de anclar la venta como propuesta."); return; } if(faltanPOLPOD().length){ alert("Completa POL, POD y naviera antes de anclar."); return; } if(!confirm("¿Anclar la venta actual como propuesta (modo vivo)?\n\nDespués, al mover costos verás el profit resultante contra este precio. Para cambiarle el precio al cliente, usa un nuevo Amendment.")) return; setSaving(true); try{ await guardar(); const res=await anclarVenta(versionId); const st=await loadVersion(versionId); if(st&&st.rutas) setRutas(st.rutas); alert("Venta anclada en "+((res&&res.anclados)||0)+" línea(s). Modo vivo activo."); }catch(ex){ alert("Error al anclar: "+ex.message); } setSaving(false); };
  const hayAncla=(rutas||[]).some(r=>r.ventaAncla&&Object.keys(r.ventaAncla).length>0);

  return (<div style={{maxWidth:1160,margin:"0 auto"}}>
    {loading&&<div style={{color:C.label,fontSize:13,padding:10}}>Cargando cotización…</div>}
    {folio&&(<div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,padding:"10px 14px",background:"#fff",border:"1px solid "+C.sep2,borderRadius:10}}>
      <span style={{fontSize:15,fontWeight:"bold",color:C.ink}}>{folio}</span>
      <span style={{fontSize:11,fontWeight:"bold",color:editable?C.label:"#8A6D1F",background:editable?C.soft:"#FBF4E0",border:"1px solid "+C.sep2,borderRadius:4,padding:"2px 8px"}}>{estatus}</span>
      {!editable&&<span style={{fontSize:11,color:C.label}}>Versión congelada — crea un nuevo Amendment para editar.</span>}
    </div>)}
    {cambios&&cambios.length>0&&(<div style={{marginBottom:12,padding:"10px 14px",background:"#FFF9E9",border:"1px solid #EAD9A0",borderRadius:10}}>
      <div style={{fontSize:12,fontWeight:"bold",color:"#8A6D1F",marginBottom:6}}>Control de cambios vs. amendment anterior ({cambios.length})</div>
      <ul style={{margin:0,paddingLeft:18,fontSize:11.5,color:C.slate,lineHeight:1.5}}>{cambios.slice(0,40).map((c,i)=><li key={i}>{c}</li>)}</ul>
    </div>)}
    {editarPropuesta&&(()=>{ const pm=lineasPropModificada(); return (<div style={{marginBottom:12,padding:"10px 14px",background:"#FFF3E0",border:"1px solid #F0C79A",borderRadius:10}}>
      <div style={{fontSize:12,fontWeight:"bold",color:"#C77800",marginBottom:pm.length?6:0}}>✎ Editar propuesta activo — el profit está desbloqueado y la venta puede cambiar.{pm.length?" Cambios de precio ("+pm.length+"):":" (aún sin cambios de precio)"}</div>
      {pm.length>0&&<ul style={{margin:0,paddingLeft:18,fontSize:11.5,color:C.slate,lineHeight:1.5}}>{pm.slice(0,20).map((c,i)=><li key={i}>{c}</li>)}</ul>}
      {pm.length>0&&<div style={{fontSize:11,color:C.label,marginTop:6}}>Para formalizar el nuevo precio con el cliente: crea un <b>Nuevo Amendment</b> (al enviarlo se re-ancla), o dale <b>Re-anclar venta</b> para fijar este precio como la nueva base viva.</div>}
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
      <NavierasSection quoteNav={quoteNav} setQuoteNav={setQuoteNav} rutas={rutas} catalog={mergedCat} onAlta={altaRecargo} dir={direccion} equipos={equipos} onGenerar={generarRecargos} foco={focoRecargo}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:13,fontWeight:"bold",color:C.ink}}>Tarifas <span style={{fontWeight:"normal",color:C.label,fontSize:12}}>· base y profit por tamaño; costo, venta y subject-to salen solos</span></span>
        <div style={{display:"flex",gap:8}}><input type="file" ref={impInputRef} accept=".xlsx,.xls" style={{display:"none"}} onChange={onTarifarioFile}/><Btn kind="ghost" small onClick={()=>impInputRef.current&&impInputRef.current.click()}>⇪ Importar tarifario</Btn><Btn kind="ghost" small onClick={()=>setEditRutas(!editRutas)}>{editRutas?"Ocultar rutas":"Editar rutas"}</Btn><Btn kind="ghost" small onClick={()=>setRutas(ordenarRutas(rutas))} title="Ordenar por origen · país POL · país POD">↕ Ordenar rutas</Btn><Btn kind="ghost" small onClick={()=>setRutas([...rutas,mkRuta()])}>＋ Agregar ruta</Btn></div>
      </div>
      {impSheets&&<div style={{background:"#FFF9E9",border:"1px solid #EAD9A0",borderRadius:8,padding:"8px 10px",marginBottom:10}}>
        <span style={{fontSize:12,fontWeight:"bold",color:"#8A6D1F",marginRight:8}}>¿Qué hoja/ciudad importar?</span>
        {impSheets.map(s=><span key={s} onClick={()=>aplicarTarifario(s)} style={{cursor:"pointer",fontSize:12,fontWeight:"bold",color:"#fff",background:C.red,borderRadius:6,padding:"3px 10px",marginRight:6,marginTop:2,display:"inline-block"}}>{s}</span>)}
        <span onClick={()=>setImpSheets(null)} style={{cursor:"pointer",fontSize:11,color:C.label,marginLeft:6}}>cancelar</span>
      </div>}
      {editRutas&&(<div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:10,padding:14,marginBottom:12}}>
        {rutas.map((r,ri)=>(<div key={ri} style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:8,paddingBottom:8,borderBottom:ri<rutas.length-1?"1px solid "+C.sep:"none"}}>
          <span style={{fontSize:11,fontWeight:"bold",color:"#fff",background:C.ink,borderRadius:5,padding:"3px 8px",marginBottom:4}}>R{ri+1}</span>
          <Field label="Origen (ciudad)"><ComboBox value={r.origen} items={optCiudades()} placeholder="Ciudad…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,origen:v}:x))}/></Field>
          <Field label="Modo" w={.8}><Sel value={r.precarriage_mode} onChange={e=>setRutas(rutas.map((x,i)=>i===ri?{...x,precarriage_mode:e.target.value}:x))} options={["","All Truck","Rail+Truck","Rail Ramp","Truck Ramp","Barge"]}/></Field>
          <Field label="POL"><ComboBox value={r.pol} items={optPuertos()} placeholder="Puerto / UNLOCODE…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,pol:v}:x))}/>{tx(r.pol)&&<div style={{fontSize:10,color:C.label,marginTop:2,lineHeight:1.2}} title={puertoNombre(r.pol)}>{puertoNombre(r.pol)}</div>}</Field>
          <Field label="POD"><ComboBox value={r.pod} items={optPuertos()} placeholder="Puerto / UNLOCODE…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,pod:v}:x))}/>{tx(r.pod)&&<div style={{fontSize:10,color:C.label,marginTop:2,lineHeight:1.2}} title={puertoNombre(r.pod)}>{puertoNombre(r.pod)}</div>}</Field>
          <Field label="Modo" w={.8}><Sel value={r.oncarriage_mode} onChange={e=>setRutas(rutas.map((x,i)=>i===ri?{...x,oncarriage_mode:e.target.value}:x))} options={["","All Truck","Rail+Truck","Rail Ramp","Truck Ramp","Barge"]}/></Field>
          <Field label="Destino (ciudad)"><ComboBox value={r.destino} items={optCiudades()} placeholder="Ciudad…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,destino:v}:x))}/></Field>
          <Chip>{serviceMode(r)}</Chip>{transportMode(r)&&<span style={{fontSize:10,color:C.label,fontWeight:"bold",marginLeft:6}}>{transportMode(r)}</span>}
          <span onClick={()=>setRutas(rutas.filter((_,i)=>i!==ri))} style={{cursor:"pointer",color:C.label,fontSize:11,marginBottom:6}}>✕</span>
        </div>))}
      </div>)}
      <TarifasGrid rutas={rutas} setRutas={setRutas} quoteNav={quoteNav} equipos={equipos} dir={direccion} editarProp={editarPropuesta} onFoco={(scac,tl)=>setFocoRecargo({scac,tl,ts:Date.now()})}/>
      </fieldset>
      <div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:12,padding:14,marginTop:14,opacity:editable?1:.7,pointerEvents:editable?"auto":"none"}}>
        <Lbl>Notas <span style={{fontWeight:"normal",color:C.label,textTransform:"none"}}>· texto libre que aparece en el PDF (condiciones, comentarios, etc.)</span></Lbl>
        <textarea value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Ej. Tarifas sujetas a disponibilidad de espacio y equipo. No incluye seguro de la mercancía…" rows={3} style={{...inS,marginTop:4,resize:"vertical",minHeight:64,fontFamily:F,lineHeight:1.45}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,padding:"6px 0"}}>
        <span style={{fontSize:12,color:saved?C.green:C.label}}>{saved?("Guardado "+(saved.codigo||codigo||"")+" · "+saved.lineas+" líneas, "+saved.opciones+" opciones, "+saved.surcharges+" recargos"):""}</span>
        <div style={{display:"flex",gap:10}}>
          <Btn kind="ghost" onClick={generar}>Generar cotización (PDF)</Btn>
          {editable&&<Btn kind="green" onClick={guardar} disabled={saving}>{saving?"Guardando…":(versionId?"Guardar cambios":"Guardar cotización")}</Btn>}
          {editable&&versionId&&<Btn kind="dark" onClick={enviar} disabled={saving}>Marcar enviada</Btn>}
          {editable&&versionId&&<Btn kind="ghost" onClick={anclar} disabled={saving}>{hayAncla?"Re-anclar venta":"Anclar venta (modo vivo)"}</Btn>}
          {editable&&hayAncla&&<Btn kind={editarPropuesta?"primary":"ghost"} onClick={toggleEditProp}>{editarPropuesta?"🔒 Bloquear propuesta":"✎ Editar propuesta"}</Btn>}
          {hayAncla&&<span style={{fontSize:11,fontWeight:"bold",color:"#0B7A3B",background:"#E8F5EC",border:"1px solid #BFE3CB",borderRadius:6,padding:"4px 9px",alignSelf:"center"}}>🔒 Modo vivo · venta anclada</span>}
          {!editable&&versionId&&<Btn kind="primary" onClick={nueva} disabled={saving}>{saving?"Creando…":"＋ Nuevo Amendment"}</Btn>}
        </div>
      </div>
    </>)}
  </div>);
}
