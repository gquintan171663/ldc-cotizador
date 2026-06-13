import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import { C, F, EQUIPOS, EQUIPO_CATS, NAVIERAS, navName, CATALOG, COMMODITY_INDUSTRIAS, tx, scopeFull, n, adicPorCont, cargosBL, inclPorCont, inclBL, subjectTo, money, optPuertos, optCiudades, paisOrigen, paisDestino, rutaPaisLabel } from "./lib.js";
import { inS, Lbl, Field, TI, Sel, Chip, Btn, ClaveAutocomplete, ComboBox } from "./ui.jsx";
import { saveCotizacion, loadVersion, markEnviada, nuevaVersion, crearCliente, altaSurcharge, listSurcharges, recargosDeRutaSimilar, checkConflictoTarifa } from "./db.js";
import { abrirCotizacion } from "./quote.js";

function SurchargeGrid({surs,onChange,catalog}){
  const cat=catalog||CATALOG;
  const rows=surs||[];
  const set=(i,p)=>onChange(rows.map((x,j)=>j===i?{...x,...p}:x));
  const add=()=>onChange([...rows,{c:"",d:"",monto:"",moneda:"USD",incluido:false,desplegar:true,pago:"prepaid",basis:"contenedor"}]);
  const del=(i)=>onChange(rows.filter((_,j)=>j!==i));
  const onClave=(i,val)=>{const h=cat.find(x=>x.c.toUpperCase()===val.trim().toUpperCase());set(i,(h&&!tx(rows[i].d))?{c:h.c,d:h.d}:{c:val});};
  const th={fontSize:9.5,letterSpacing:.5,textTransform:"uppercase",color:C.label,fontWeight:"bold",textAlign:"left",padding:"4px 6px"};
  const td={padding:"3px 6px"};const cell={...inS,padding:"5px 7px",fontSize:12.5};
  return (<div style={{border:"1px solid "+C.sep2,borderRadius:8,background:"#fff"}}>
    <table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr style={{background:C.soft,borderBottom:"1px solid "+C.sep2}}>
        <th style={{...th,width:"12%"}}>Clave</th><th style={{...th,width:"28%"}}>Descripción</th><th style={{...th,width:"11%"}}>Monto</th><th style={{...th,width:"8%"}}>Mon.</th>
        <th style={{...th,width:"13%"}}>Base cobro</th><th style={{...th,width:"8%",textAlign:"center"}}>Incl.</th><th style={{...th,width:"8%",textAlign:"center"}}>Mostrar</th><th style={{...th,width:"9%"}}>Pago</th><th style={{...th,width:"3%"}}></th></tr></thead>
      <tbody>
        {rows.length===0&&<tr><td colSpan={9} style={{padding:10,textAlign:"center",color:C.label,fontSize:12}}>Sin recargos — agrega filas</td></tr>}
        {rows.map((r,i)=>(<tr key={i} style={{borderBottom:"1px solid "+C.sep}}>
          <td style={td}><ClaveAutocomplete value={r.c} catalog={cat} cellStyle={cell} onChange={(v)=>onClave(i,v)} onPick={(x)=>set(i,{c:x.c,d:tx(rows[i].d)?rows[i].d:x.d})}/></td>
          <td style={td}><input value={r.d} onChange={e=>set(i,{d:e.target.value})} placeholder="Descripción" style={cell}/></td>
          <td style={td}><input value={r.monto} onChange={e=>set(i,{monto:e.target.value})} inputMode="decimal" placeholder="0" style={{...cell,textAlign:"right"}}/></td>
          <td style={td}><select value={r.moneda} onChange={e=>set(i,{moneda:e.target.value})} style={{...cell,padding:"5px 4px"}}><option>USD</option><option>MXN</option></select></td>
          <td style={td}><select value={r.basis||"contenedor"} onChange={e=>set(i,{basis:e.target.value})} style={{...cell,padding:"5px 4px"}}><option value="contenedor">Contenedor</option><option value="teu">TEU</option><option value="bl">BL</option></select></td>
          <td style={{...td,textAlign:"center"}}><input type="checkbox" checked={r.incluido} onChange={e=>set(i,{incluido:e.target.checked})}/></td>
          <td style={{...td,textAlign:"center"}}><input type="checkbox" checked={r.desplegar} onChange={e=>set(i,{desplegar:e.target.checked})}/></td>
          <td style={td}><select value={r.pago} onChange={e=>set(i,{pago:e.target.value})} style={{...cell,padding:"5px 4px"}}><option value="prepaid">Prepaid</option><option value="collect">Collect</option></select></td>
          <td style={{...td,textAlign:"center"}}><span onClick={()=>del(i)} style={{cursor:"pointer",color:C.label,fontWeight:"bold"}}>✕</span></td>
        </tr>))}
      </tbody>
    </table>
    <div style={{padding:"7px 9px",borderTop:"1px solid "+C.sep2,background:C.soft,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
      <span onClick={add} style={{cursor:"pointer",color:C.red,fontWeight:"bold",fontSize:12.5}}>＋ Agregar recargo</span>
      <span style={{fontSize:11,color:C.label}}>
        <span style={{color:C.green,fontWeight:"bold"}}>Incluidos:</span> <b style={{color:C.slate}}>{money(inclPorCont(rows,1))}</b>/20' · <b style={{color:C.slate}}>{money(inclPorCont(rows,2))}</b>/40'{inclBL(rows)>0&&<span> · BL <b style={{color:C.slate}}>{money(inclBL(rows))}</b></span>}
        <span style={{margin:"0 8px",color:C.sep2}}>|</span>
        <span style={{color:C.red,fontWeight:"bold"}}>No incluidos:</span> <b style={{color:C.slate}}>{money(adicPorCont(rows,1))}</b>/20' · <b style={{color:C.slate}}>{money(adicPorCont(rows,2))}</b>/40'{cargosBL(rows)>0&&<span> · BL <b style={{color:C.slate}}>{money(cargosBL(rows))}</b></span>}
      </span>
    </div>
  </div>);
}

function NavierasSection({quoteNav,setQuoteNav,catalog,onAlta}){
  const [add,setAdd]=useState("");
  const [altaOpen,setAltaOpen]=useState(false);
  const [nc,setNc]=useState(""); const [nd,setNd]=useState("");
  const addNav=()=>{if(add&&!quoteNav.find(q=>q.scac===add)){setQuoteNav([...quoteNav,{scac:add,surcharges:[]}]);setAdd("");}};
  const doAlta=async()=>{ const c=nc.trim().toUpperCase(); if(!c) return; await onAlta(c,nd.trim()); setNc(""); setNd(""); setAltaOpen(false); };
  const opts=[{v:"",t:"— elegir naviera —"},...NAVIERAS.filter(x=>!quoteNav.find(q=>q.scac===x.scac)).map(x=>({v:x.scac,t:x.scac+" · "+x.nombre}))];
  return (<div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:12,padding:16,marginBottom:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
      <span style={{fontSize:13,fontWeight:"bold",color:C.ink}}>Navieras y recargos <span style={{fontWeight:"normal",color:C.label,fontSize:12}}>· se definen una vez y aplican a todas sus tarifas</span></span>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <Btn kind="ghost" small onClick={()=>setAltaOpen(!altaOpen)}>{altaOpen?"Cancelar":"＋ Alta de recargo"}</Btn>
        <Sel value={add} onChange={e=>setAdd(e.target.value)} options={opts} style={{width:260}}/><Btn kind="dark" small onClick={addNav}>＋ Agregar naviera</Btn>
      </div>
    </div>
    {altaOpen&&(<div style={{display:"flex",gap:8,alignItems:"flex-end",background:C.soft,border:"1px solid "+C.sep2,borderRadius:8,padding:10,marginBottom:12}}>
      <Field label="Clave nueva" w={.6}><TI value={nc} onChange={e=>setNc(e.target.value.toUpperCase())} placeholder="EJ. ABC"/></Field>
      <Field label="Descripción"><TI value={nd} onChange={e=>setNd(e.target.value)} placeholder="Descripción del recargo"/></Field>
      <Btn kind="green" small onClick={doAlta}>Dar de alta</Btn>
      <span style={{fontSize:11,color:C.label,marginBottom:6}}>Queda en el catálogo y disponible en el autocompletado.</span>
    </div>)}
    {quoteNav.length===0&&<div style={{fontSize:12,color:C.label,padding:"6px 0"}}>Agrega las navieras que vas a cotizar; a cada una le defines sus recargos una sola vez.</div>}
    {quoteNav.map((q,i)=>(<div key={q.scac} style={{marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span style={{fontSize:11,fontWeight:"bold",color:"#fff",background:C.slate,borderRadius:4,padding:"2px 8px",letterSpacing:1}}>{q.scac}</span>
        <span style={{fontSize:13,fontWeight:"bold",color:C.slate}}>{navName(q.scac)}</span>
        <span onClick={()=>setQuoteNav(quoteNav.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:C.label,fontSize:11,marginLeft:"auto"}}>Quitar</span>
      </div>
      <SurchargeGrid surs={q.surcharges} catalog={catalog} onChange={(s)=>setQuoteNav(quoteNav.map((x,j)=>j===i?{...x,surcharges:s}:x))}/>
    </div>))}
  </div>);
}

function TarifasGrid({rutas,setRutas,quoteNav,equipos}){
  const navOpts=[{v:"",t:"—"},...quoteNav.map(q=>({v:q.scac,t:q.scac}))];
  const surOf=(scac)=>(quoteNav.find(q=>q.scac===scac)||{}).surcharges||[];
  const eqs=EQUIPOS.filter(e=>equipos.includes(e.k));
  const getP=(o,k)=>(o.precios&&o.precios[k])||{};
  const setP=(ri,oi,k,patch)=>setRutas(rutas.map((r,i)=>i!==ri?r:{...r,opciones:r.opciones.map((o,j)=>j!==oi?o:{...o,precios:{...(o.precios||{}),[k]:{...getP(o,k),...patch}}})}));
  const setOpt=(ri,oi,patch)=>setRutas(rutas.map((r,i)=>i!==ri?r:{...r,opciones:r.opciones.map((o,j)=>j===oi?{...o,...patch}:o)}));
  const addOpt=(ri)=>setRutas(rutas.map((r,i)=>i!==ri?r:{...r,opciones:[...r.opciones,{navScac:"",transito:"",precios:{}}],elegida:r.elegida??0}));
  const delOpt=(ri,oi)=>setRutas(rutas.map((r,i)=>i!==ri?r:{...r,opciones:r.opciones.filter((_,j)=>j!==oi)}));
  const totBase=(o)=>eqs.reduce((a,e)=>a+n(getP(o,e.k).base),0);
  const sugerida=(r)=>{if(!r.opciones.length)return -1;let bi=0,bc=Infinity;r.opciones.forEach((o,i)=>{const c=totBase(o);if(c<bc){bc=c;bi=i;}});return bi;};
  const th={fontSize:9.5,letterSpacing:.5,textTransform:"uppercase",color:"#fff",fontWeight:"bold",padding:"7px 8px",whiteSpace:"nowrap"};
  const td={padding:"6px 8px",verticalAlign:"middle",borderBottom:"1px solid "+C.sep};
  const cell={...inS,padding:"5px 7px",fontSize:12.5,width:72,textAlign:"right"};
  return (<div style={{border:"1px solid "+C.sep2,borderRadius:10,overflow:"auto",background:"#fff"}}>
    <table style={{borderCollapse:"collapse",minWidth:760+eqs.length*210}}>
      <thead>
        <tr style={{background:C.ink}}>
          <th rowSpan={2} style={{...th,textAlign:"left"}}>Ruta</th><th rowSpan={2} style={{...th,textAlign:"center"}}>Scope</th><th rowSpan={2} style={{...th,textAlign:"left"}}>Naviera</th><th rowSpan={2} style={{...th,textAlign:"center"}}>T.T.</th>
          {eqs.map(e=><th key={e.k} colSpan={3} style={{...th,textAlign:"center",borderLeft:"1px solid #333"}}>{e.t} <span style={{color:"#9aa4ae",fontWeight:"normal"}}>· {e.teu} TEU</span></th>)}
          <th rowSpan={2} style={{...th,textAlign:"left",borderLeft:"1px solid #333"}}>Subject to</th><th rowSpan={2} style={{...th,textAlign:"center"}}>Eleg.</th>
        </tr>
        <tr style={{background:C.ink}}>{eqs.map(e=>[<th key={e.k+"b"} style={{...th,textAlign:"right",borderLeft:"1px solid #333"}}>Base</th>,<th key={e.k+"p"} style={{...th,textAlign:"right"}}>Profit</th>,<th key={e.k+"v"} style={{...th,textAlign:"right"}}>Venta</th>])}</tr>
      </thead>
      <tbody>
        {rutas.map((r,ri)=>{const sug=sugerida(r);
          return r.opciones.map((o,oi)=>{const surs=surOf(o.navScac),st=subjectTo(surs),bl=cargosBL(surs),first=oi===0;
            return (<tr key={ri+"-"+oi} style={{background:first?"#fff":C.soft}}>
              <td style={{...td,borderTop:first?"2px solid "+C.sep2:"none"}}>{first?<div style={{fontSize:12.5}}><b style={{color:C.slate}}>{r.pol}</b><span style={{color:"#C0C7CE",margin:"0 4px"}}>›</span><b style={{color:C.slate}}>{r.pod}</b>{(r.origen||r.destino)&&<div style={{fontSize:11,color:C.label,marginTop:1}}>{r.origen?r.origen+" › ":""}{r.pol} › {r.pod}{r.destino?" › "+r.destino:""}</div>}</div>:<span style={{fontSize:11,color:C.label}}>↳ alt.</span>}</td>
              <td style={{...td,textAlign:"center",borderTop:first?"2px solid "+C.sep2:"none"}}>{first&&<Chip>{scopeFull(r)}</Chip>}</td>
              <td style={td}><select value={o.navScac} onChange={e=>setOpt(ri,oi,{navScac:e.target.value})} style={{...inS,padding:"5px 7px",fontSize:12.5,fontWeight:"bold",width:96}}>{navOpts.map(x=><option key={x.v} value={x.v}>{x.t}</option>)}</select></td>
              <td style={{...td,textAlign:"center"}}><input value={o.transito||""} onChange={e=>setOpt(ri,oi,{transito:e.target.value})} inputMode="numeric" placeholder="días" style={{...inS,padding:"5px 6px",fontSize:12.5,width:56,textAlign:"center"}}/></td>
              {eqs.map(e=>{const p=getP(o,e.k);const base=n(p.base),prof=n(p.profit);const adic=adicPorCont(surs,e.teu);const venta=base+adic+prof;
                return [<td key={e.k+"b"} style={{...td,borderLeft:"1px solid "+C.sep2}}><input value={p.base||""} onChange={ev=>setP(ri,oi,e.k,{base:ev.target.value})} inputMode="decimal" placeholder="0" style={cell}/></td>,
                  <td key={e.k+"p"} style={td}><input value={p.profit||""} onChange={ev=>setP(ri,oi,e.k,{profit:ev.target.value})} inputMode="decimal" placeholder="0" style={cell}/></td>,
                  <td key={e.k+"v"} style={{...td,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{base?<span><b style={{color:C.red}}>{money(venta)}</b><div style={{fontSize:10,color:C.label}}>costo {money(base+adic)}</div></span>:""}</td>];})}
              <td style={{...td,borderLeft:"1px solid "+C.sep2}}>{o.navScac?(st.length?<span style={{fontSize:11}}><b style={{color:C.slate}}>{st.join(" · ")}</b>{bl>0&&<div style={{color:C.label,marginTop:1}}>+ BL {money(bl)}</div>}</span>:<Chip kind="green">ALL-IN</Chip>):""}</td>
              <td style={{...td,textAlign:"center"}}><input type="radio" checked={(r.elegida??0)===oi} onChange={()=>setRutas(rutas.map((x,i)=>i===ri?{...x,elegida:oi}:x))}/>{r.opciones.length>1&&<div><span onClick={()=>delOpt(ri,oi)} style={{cursor:"pointer",color:C.label,fontSize:10}}>✕</span></div>}</td>
            </tr>);
          }).concat(<tr key={ri+"-add"}><td colSpan={4+eqs.length*3+2} style={{padding:"4px 8px",borderBottom:"1px solid "+C.sep}}><span onClick={()=>addOpt(ri)} style={{cursor:"pointer",color:C.red,fontSize:11.5,fontWeight:"bold"}}>＋ naviera alterna para esta ruta</span>{sug>=0&&r.opciones.length>1&&<span style={{fontSize:11,color:C.label,marginLeft:12}}>Sugerida (menor costo): <b style={{color:C.red}}>{r.opciones[sug].navScac||"—"}</b></span>}</td></tr>);
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
  const [commodityId,setCommodityId]=useState("");
  const [vigDesde,setVigDesde]=useState("");
  const [vigHasta,setVigHasta]=useState("");
  const [equipos,setEquipos]=useState(["20DV","40HC"]);
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
  const jalarRecargos=async(force=false)=>{
    const pp=rutaPaises();
    if(!pp){ if(force) alert("Primero define la ruta (POL/POD u Origen/Destino) para identificar los países."); return; }
    if(quoteNav.length && !force){ return; } // no piso lo que ya hay salvo que sea forzado
    if(quoteNav.length && force && !confirm("Ya hay recargos cargados. ¿Reemplazarlos con los de la ruta similar?")) return;
    setAutoBusy(true); setAutoMsg("");
    const res=await recargosDeRutaSimilar(pp.o, pp.d, versionId);
    setAutoBusy(false);
    if(res){ setQuoteNav(res.quoteNav); setAutoMsg("Recargos jalados de "+(res.codigo||"cotización previa")+" ("+rutaPaisLabel(pp.o,pp.d)+") — editables."); }
    else { setAutoMsg("No encontré cotización previa para "+rutaPaisLabel(pp.o,pp.d)+"."); }
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
      setCommodityId(st.commodity_id||""); setVigDesde(st.vigDesde||""); setVigHasta(st.vigHasta||"");
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
  },[cliente,modo,direccion,commodityId,vigDesde,vigHasta,equipos,rutas,quoteNav,started]);

  const editable = estatus==="borrador";
  const comLabel=(comms.find(c=>c.id===commodityId)||{}).commodity||"";
  const folio = codigo ? (codigo+(comLabel?(" · "+comLabel):"")) : null;
  const codigoPreview=useMemo(()=>{const p=modo==="maritimo"?"M":modo==="terrestre"?"T":"A";return p+direccion+"?";},[modo,direccion]);
  const mkRuta=()=>({origen:"",precarriage_mode:"",pol:"",pod:"",oncarriage_mode:"",destino:"",opciones:[{navScac:"",transito:"",precios:{}}],elegida:0});
  const toggleEq=(k)=>setEquipos(equipos.includes(k)?equipos.filter(x=>x!==k):[...equipos,k]);

  const guardar=async()=>{
    if(!cliente){ alert("Elige un cliente."); return; }
    const cn=(clientes.find(c=>c.id===cliente)||{}).nombre;
    const st={versionId,codigo,cliente,clienteNombre:cn,modo,direccion,commodity:comLabel,commodity_id:commodityId||null,vigDesde,vigHasta,origen:"cero",equipos,rutas,quoteNav};
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
    if(res.versionId){ setVersionId(res.versionId); setCodigo(res.codigo); setEstatus("borrador"); }
    onDirtyRef.current&&onDirtyRef.current(false);
    if(res.errores.length) alert("Guardado con avisos: "+res.errores.slice(0,3).join(" · "));
  };
  const enviar=async()=>{ if(!versionId) return; await markEnviada(versionId); setEstatus("enviada"); };
  const nueva=async()=>{ if(!versionId) return; setSaving(true); const res=await nuevaVersion(versionId); setSaving(false); if(res.versionId){ setVersionId(res.versionId); setCodigo(res.codigo); setEstatus("borrador"); setSaved(res); } };
  const generar=()=>{ const cn=(clientes.find(c=>c.id===cliente)||{}).nombre; abrirCotizacion({clienteNombre:cn,codigo:codigo||codigoPreview,commodity:comLabel,direccion,equipos,rutas,quoteNav,vigDesde,vigHasta}); };

  return (<div style={{maxWidth:1160,margin:"0 auto"}}>
    {loading&&<div style={{color:C.label,fontSize:13,padding:10}}>Cargando cotización…</div>}
    {folio&&(<div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,padding:"10px 14px",background:"#fff",border:"1px solid "+C.sep2,borderRadius:10}}>
      <span style={{fontSize:15,fontWeight:"bold",color:C.ink}}>{folio}</span>
      <span style={{fontSize:11,fontWeight:"bold",color:editable?C.label:"#8A6D1F",background:editable?C.soft:"#FBF4E0",border:"1px solid "+C.sep2,borderRadius:4,padding:"2px 8px"}}>{estatus}</span>
      {!editable&&<span style={{fontSize:11,color:C.label}}>Versión congelada — crea una nueva versión para editar.</span>}
    </div>)}
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
      <div style={{opacity:editable?1:.7,pointerEvents:editable?"auto":"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <Btn kind="ghost" small onClick={()=>jalarRecargos(true)} disabled={autoBusy}>{autoBusy?"Buscando…":"⟲ Jalar recargos de ruta similar"}</Btn>
        {(()=>{const pp=rutaPaises();return pp?<span style={{fontSize:11,color:C.label}}>Ruta detectada: <b style={{color:C.slate}}>{rutaPaisLabel(pp.o,pp.d)}</b></span>:<span style={{fontSize:11,color:C.label}}>Define POL/POD para detectar países y autocompletar recargos.</span>;})()}
        {autoMsg&&<span style={{fontSize:11,color:autoMsg.startsWith("No")?C.label:C.green,fontWeight:"bold"}}>{autoMsg}</span>}
      </div>
      <NavierasSection quoteNav={quoteNav} setQuoteNav={setQuoteNav} catalog={mergedCat} onAlta={altaRecargo}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:13,fontWeight:"bold",color:C.ink}}>Tarifas <span style={{fontWeight:"normal",color:C.label,fontSize:12}}>· base y profit por tamaño; costo, venta y subject-to salen solos</span></span>
        <div style={{display:"flex",gap:8}}><Btn kind="ghost" small onClick={()=>setEditRutas(!editRutas)}>{editRutas?"Ocultar rutas":"Editar rutas"}</Btn><Btn kind="ghost" small onClick={()=>setRutas([...rutas,mkRuta()])}>＋ Agregar ruta</Btn></div>
      </div>
      {editRutas&&(<div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:10,padding:14,marginBottom:12}}>
        {rutas.map((r,ri)=>(<div key={ri} style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:8,paddingBottom:8,borderBottom:ri<rutas.length-1?"1px solid "+C.sep:"none"}}>
          <span style={{fontSize:11,fontWeight:"bold",color:"#fff",background:C.ink,borderRadius:5,padding:"3px 8px",marginBottom:4}}>R{ri+1}</span>
          <Field label="Origen (ciudad)"><ComboBox value={r.origen} items={optCiudades()} placeholder="Ciudad…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,origen:v}:x))}/></Field>
          <Field label="Modo" w={.7}><Sel value={r.precarriage_mode} onChange={e=>setRutas(rutas.map((x,i)=>i===ri?{...x,precarriage_mode:e.target.value}:x))} options={["","Truck","Rail","Barge"]}/></Field>
          <Field label="POL"><ComboBox value={r.pol} items={optPuertos()} placeholder="Puerto / UNLOCODE…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,pol:v}:x))}/></Field>
          <Field label="POD"><ComboBox value={r.pod} items={optPuertos()} placeholder="Puerto / UNLOCODE…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,pod:v}:x))}/></Field>
          <Field label="Modo" w={.7}><Sel value={r.oncarriage_mode} onChange={e=>setRutas(rutas.map((x,i)=>i===ri?{...x,oncarriage_mode:e.target.value}:x))} options={["","Truck","Rail","Barge"]}/></Field>
          <Field label="Destino (ciudad)"><ComboBox value={r.destino} items={optCiudades()} placeholder="Ciudad…" onChange={(v)=>setRutas(rutas.map((x,i)=>i===ri?{...x,destino:v}:x))}/></Field>
          <Chip>{scopeFull(r)}</Chip>
          <span onClick={()=>setRutas(rutas.filter((_,i)=>i!==ri))} style={{cursor:"pointer",color:C.label,fontSize:11,marginBottom:6}}>✕</span>
        </div>))}
      </div>)}
      <TarifasGrid rutas={rutas} setRutas={setRutas} quoteNav={quoteNav} equipos={equipos}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,padding:"6px 0"}}>
        <span style={{fontSize:12,color:saved?C.green:C.label}}>{saved?("Guardado "+(saved.codigo||codigo||"")+" · "+saved.lineas+" líneas, "+saved.opciones+" opciones, "+saved.surcharges+" recargos"):""}</span>
        <div style={{display:"flex",gap:10}}>
          <Btn kind="ghost" onClick={generar}>Generar cotización (PDF)</Btn>
          {editable&&<Btn kind="green" onClick={guardar} disabled={saving}>{saving?"Guardando…":(versionId?"Guardar cambios":"Guardar cotización")}</Btn>}
          {editable&&versionId&&<Btn kind="dark" onClick={enviar} disabled={saving}>Marcar enviada</Btn>}
          {!editable&&versionId&&<Btn kind="primary" onClick={nueva} disabled={saving}>{saving?"Creando…":"Nueva versión"}</Btn>}
        </div>
      </div>
    </>)}
  </div>);
}
