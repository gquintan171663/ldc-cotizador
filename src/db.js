import { supabase } from "./supabaseClient.js";
import { matchCommodity, paisDe, tlDe, n, adicPorCont, tx, eqMeta, prefijoCliente, numeroAcuerdo, hayCambioCosto, ventaEq, mkSurOf, round10, opcionActivaEq, puertoNombre, abrevEstado, sonPuertosAlternos, sonPuertosBase } from "./lib.js";

// Mapa commodity(lower) -> id desde el catálogo
async function commodityMap(){
  const { data } = await supabase.from("commodities").select("id,commodity");
  const m={}; (data||[]).forEach(c=>{ m[c.commodity.toLowerCase()]=c.id; }); return m;
}

const slug=(s)=>String(s||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]/g,"").slice(0,16)||"CLI";
const parseDate=(s)=>{ if(s==null||s==="")return null; const d=new Date(s); return isNaN(d.getTime())?null:d.toISOString().slice(0,10); };
const preMode=(m)=>{ const x=String(m||"").toLowerCase(); if(x.includes("rail"))return "Rail"; if(x.includes("truck"))return "Truck"; if(x.includes("barge"))return "Barge"; return ""; };

// Número de acuerdo macro con prefijo del cliente (ROYCE -> ROY-00042) + vigencia ~1 año
async function nuevoNoAcuerdo(nombre){
  const { count } = await supabase.from("acuerdos").select("id",{count:"exact",head:true});
  const prefijo=prefijoCliente(nombre);
  const no_acuerdo=numeroAcuerdo(prefijo,(count||0)+1);
  const hoy=new Date();
  const vig_desde=hoy.toISOString().slice(0,10);
  const vig_hasta=new Date(hoy.getFullYear()+1,hoy.getMonth(),hoy.getDate()).toISOString().slice(0,10);
  return { no_acuerdo, prefijo, vig_desde, vig_hasta };
}

// Encuentra o crea cliente (por nombre) y su acuerdo (por modo)
async function ensureClienteAcuerdo(nombre, modo, sum){
  let cliente_id;
  let { data: ex } = await supabase.from("clientes").select("id").eq("nombre",nombre).limit(1).maybeSingle();
  if(ex) cliente_id=ex.id;
  else{
    const no_cliente="IMP-"+slug(nombre);
    let { data: ins, error } = await supabase.from("clientes").insert({no_cliente,nombre,tipo:"cliente"}).select("id").single();
    if(error){
      let { data: ex2 } = await supabase.from("clientes").select("id").eq("no_cliente",no_cliente).maybeSingle();
      if(ex2) cliente_id=ex2.id; else { sum.errores.push("cliente "+nombre+": "+error.message); return null; }
    } else { cliente_id=ins.id; sum.clientes++; }
  }
  let acuerdo_id;
  let { data: acu } = await supabase.from("acuerdos").select("id").eq("cliente_id",cliente_id).eq("modo",modo).maybeSingle();
  if(acu) acuerdo_id=acu.id;
  else{
    const { no_acuerdo, prefijo, vig_desde, vig_hasta } = await nuevoNoAcuerdo(nombre);
    let { data: ai, error } = await supabase.from("acuerdos").insert({no_acuerdo,prefijo,vig_desde,vig_hasta,cliente_id,modo}).select("id").single();
    if(error){ sum.errores.push("acuerdo "+nombre+": "+error.message); return null; }
    acuerdo_id=ai.id;
  }
  return { cliente_id, acuerdo_id };
}

// ===== Importar costos del Excel maestro como tarifa base =====
export async function importRates(recs, onProgress=()=>{}){
  const sum={clientes:0,versiones:0,lineas:0,opciones:0,errores:[]};
  const comMap=await commodityMap();
  const byName={}; recs.forEach(r=>{ (byName[r.cust]=byName[r.cust]||[]).push(r); });
  let done=0; const totalC=Object.keys(byName).length;
  for(const nombre of Object.keys(byName)){
    const ca=await ensureClienteAcuerdo(nombre,"maritimo",sum);
    if(ca){
      const byCom={}; byName[nombre].forEach(r=>{ (byCom[r.com||""]=byCom[r.com||""]||[]).push(r); });
      for(const com of Object.keys(byCom)){
        const mc=matchCommodity(com);
        const commodityLabel=mc?mc.com:com;
        const commodity_id=mc?(comMap[mc.com.toLowerCase()]||null):null;
        let { data: ver, error: ve } = await supabase.from("versiones")
          .insert({acuerdo_id:ca.acuerdo_id,direccion:"E",origen:"importado",commodity:commodityLabel,commodity_id,estatus:"borrador"}).select("id").single();
        if(ve){ sum.errores.push("version "+nombre+"/"+com+": "+ve.message); continue; }
        sum.versiones++;
        for(const r of byCom[com]){
          const sizes=[];
          if(r.cost20!=null) sizes.push({equipo:"20DV",costo:r.cost20,nav:r.nav20});
          if(r.cost40!=null) sizes.push({equipo:"40HC",costo:r.cost40,nav:r.nav40});
          for(const sz of sizes){
            let { data: lin, error: le } = await supabase.from("lineas")
              .insert({version_id:ver.id,origen:r.ori,precarriage_mode:preMode(r.mode),pol:r.pol,pod:r.dest,equipo:sz.equipo,validez_hasta:parseDate(r.exp)})
              .select("id").single();
            if(le){ sum.errores.push("linea: "+le.message); continue; }
            sum.lineas++;
            let { error: oe } = await supabase.from("opciones_costo")
              .insert({linea_id:lin.id,naviera:sz.nav||"",costo_base:sz.costo,sugerida:true});
            if(oe) sum.errores.push("opcion: "+oe.message); else sum.opciones++;
          }
        }
      }
    }
    done++; onProgress({done,totalC,...sum});
  }
  return sum;
}

// ===== Guardar cotización manual (cotizador) =====
// Inserta las líneas/opciones/recargos de un estado en una versión dada
async function insertChildren(versionId, state, sum){
  const { vigDesde, vigHasta, equipos, rutas, quoteNav } = state;
  const surOf=(scac,tl)=>((quoteNav||[]).find(q=>q.scac===scac&&(q.tl||"")===(tl||""))||{}).surcharges||[];

  // 1) LÍNEAS en un solo insert
  const lineaRows=[], lineaMeta=[];
  for(const r of (rutas||[])){ for(const ek of (equipos||[])){
    lineaRows.push({version_id:versionId,origen:r.origen||"",origen_estado:r.origenEstado||null,precarriage_mode:r.precarriage_mode||"",pol:r.pol||"",pod:r.pod||"",oncarriage_mode:r.oncarriage_mode||"",destino:r.destino||"",destino_estado:r.destinoEstado||null,equipo:ek,validez_desde:vigDesde||null,validez_hasta:vigHasta||null,elegida_eq:r.elegidaEq||null,venta_anclada:(r.ventaAncla&&r.ventaAncla[ek]!=null)?r.ventaAncla[ek]:null});
    lineaMeta.push({r, ek});
  }}
  if(!lineaRows.length) return;
  const { data: lins, error: le } = await supabase.from("lineas").insert(lineaRows).select("id");
  if(le || !lins){ sum.errores.push("lineas: "+(le&&le.message)); return; }
  sum.lineas+=lins.length;

  // 2) OPCIONES en un solo insert
  const opRows=[], opMeta=[];
  lins.forEach((lin, li)=>{ const {r, ek}=lineaMeta[li];
    (r.opciones||[]).forEach((o, oi)=>{ const pr=(o.precios&&o.precios[ek])||{};
      opRows.push({linea_id:lin.id,naviera:o.navScac||"",costo_base:parseFloat(pr.base)||0,profit:parseFloat(pr.profit)||0,transito_dias:parseInt(o.transito)||null,sugerida:(r.elegida??0)===oi});
      opMeta.push({lineaId:lin.id, r, oi, o});
    });
  });
  let ops=[];
  if(opRows.length){ const res=await supabase.from("opciones_costo").insert(opRows).select("id"); if(res.error){ sum.errores.push("opciones: "+res.error.message); } else { ops=res.data||[]; sum.opciones+=ops.length; } }

  // 3) SURCHARGES en un solo insert
  const surRows=[];
  ops.forEach((op, k)=>{ const {r, o}=opMeta[k]; const surs=surOf(o.navScac, tlDe(r));
    (surs||[]).forEach((s, idx)=>{ surRows.push({opcion_id:op.id,clave:s.c||"",descripcion:s.d||"",monto:parseFloat(s.monto)||0,moneda:s.moneda||"USD",incluido:!!s.incluido,desplegar:s.desplegar!==false,pago:s.pago||"prepaid",basis:s.basis||"contenedor",montos:s.montos||null,orden:idx}); });
  });
  if(surRows.length){ const res=await supabase.from("opcion_surcharges").insert(surRows); if(res.error) sum.errores.push("surcharges: "+res.error.message); else sum.surcharges+=surRows.length; }

  // 4) opcion_elegida_id por línea (en paralelo, no secuencial)
  const updates=[];
  ops.forEach((op, k)=>{ const {lineaId, r, oi}=opMeta[k]; if((r.elegida??0)===oi){ updates.push(supabase.from("lineas").update({opcion_elegida_id:op.id}).eq("id",lineaId)); } });
  if(updates.length) await Promise.all(updates);
}

// ===== Control de cambios: diff legible de un amendment vs la versión anterior =====
const _loc=(v)=>{ const nm=puertoNombre(v)||String(v||""); const pais=paisDe(v); return nm+(pais&&!/\(\s*[A-Z]{2}\s*\)\s*$/.test(nm)&&!/,\s*[A-Z]{2}\s*$/.test(nm)?" ("+pais+")":""); };
const _rk=(r)=> _loc(r.pol||r.origen)+" → "+_loc(r.pod||r.destino);
const _chosen=(r)=>((r.opciones||[])[r.elegida??0]||(r.opciones||[])[0]||{precios:{}});
// ===========================================================================
// CORRECCIÓN de un AM enviado (solo admin). Separa cambios visibles al cliente
// (precio de venta al cliente + rutas) de los internos (costo base, recargos, profit).
// ===========================================================================
const _money=(v)=>{ const x=Number(v)||0; return "$"+x.toLocaleString("en-US",{maximumFractionDigits:0}); };
export function resumenCorreccion(nuevo, previo, dir){
  const cliente=[], full=resumenCambios(nuevo, previo);
  const dr=dir||nuevo.direccion||"E";
  const soN=mkSurOf(nuevo), soP=mkSurOf(previo);
  const rk=(r)=>_loc(r.pol||r.origen)+" → "+_loc(r.pod||r.destino);
  const rN={}, rP={};
  (nuevo.rutas||[]).forEach(r=>rN[rk(r)]=r); (previo.rutas||[]).forEach(r=>rP[rk(r)]=r);
  Object.keys(rN).forEach(k=>{ if(!rP[k]) cliente.push("Ruta agregada: "+k); });
  Object.keys(rP).forEach(k=>{ if(!rN[k]) cliente.push("Ruta eliminada: "+k); });
  const equipos=(nuevo.equipos&&nuevo.equipos.length)?nuevo.equipos:["20DV","40HC"];
  Object.keys(rN).forEach(k=>{ if(!rP[k]) return; const rn=rN[k], rp=rP[k];
    equipos.forEach(ek=>{ const eqObj=eqMeta(ek); if(!eqObj) return;
      const _vc=(r,so)=>{ const a=r.ventaAncla&&r.ventaAncla[ek]; return (a!=null&&a!=="")?Number(a):round10(ventaEq(r,eqObj,dr,so)); };
      const vN=_vc(rn,soN), vP=_vc(rp,soP);
      if(vN!==vP && (vN||vP)) cliente.push("Precio "+ek+" "+k+": "+_money(vP)+" → "+_money(vN));
    });
  });
  return { cliente:[...new Set(cliente)], interno:full };
}

// Guarda una corrección sobre un AM ya enviado, conservando folio, vigencia y estatus.
// Devuelve {needNota:true,...} si hay cambios y falta la nota. Registra quién y qué cambió.
export async function guardarCorreccion(state, notaManual){
  const prev = await loadVersion(state.versionId);
  const dir = state.direccion||(prev&&prev.direccion)||"E";
  const dif = resumenCorreccion(state, prev||{}, dir);
  const hayCambios = dif.cliente.length>0 || dif.interno.length>0;
  if(hayCambios && !(notaManual && notaManual.trim())) return { needNota:true, cliente:dif.cliente, interno:dif.interno };
  const fecha=(()=>{ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); })();
  let notasNueva = state.notas||"";
  let correccionesNueva=null;
  if(hayCambios){
    // Cliente (sale en PDF/Excel del cliente): solo cambios visibles (precio/rutas), sin motivo ni correo.
    if(dif.cliente.length){ const selloCli="— Corrección "+fecha+": "+dif.cliente.join("; "); notasNueva=(notasNueva?notasNueva+"\n":"")+selloCli; }
    // Notas internas (registro completo, no sale al cliente): motivo + todos los cambios. Sin correo (ya queda en "actualizado por").
    const detalle=[...dif.cliente, ...dif.interno]; const selloInt="— Corrección "+fecha+": "+notaManual.trim()+(detalle.length?("\n    "+detalle.join("\n    ")):"");
    let prevCorr=""; try{ const { data:vrow }=await supabase.from("versiones").select("correcciones").eq("id",state.versionId).maybeSingle(); prevCorr=(vrow&&vrow.correcciones)||""; }catch(_){}
    correccionesNueva=(prevCorr?prevCorr+"\n\n":"")+selloInt;
  }
  const res = await saveCotizacion({...state, notas:notasNueva});   // mantiene estatus 'enviada', folio y vigencia
  if(hayCambios){ try{ await supabase.from("versiones").update({correcciones:correccionesNueva}).eq("id",state.versionId); }catch(_){} }
  return { ok:true, res, cliente:dif.cliente, interno:dif.interno, sinCambios:!hayCambios };
}

export function resumenCambios(nuevo, previo){
  const out=[]; const nz=(v)=>String(v==null||v===""?0:v);
  if((nuevo.vigDesde||"")!==(previo.vigDesde||"")||(nuevo.vigHasta||"")!==(previo.vigHasta||""))
    out.push("Vigencia: "+(previo.vigDesde||"—")+" a "+(previo.vigHasta||"—")+"  ⇒  "+(nuevo.vigDesde||"—")+" a "+(nuevo.vigHasta||"—"));
  const rN={}, rP={};
  (nuevo.rutas||[]).forEach(r=>rN[_rk(r)]=r); (previo.rutas||[]).forEach(r=>rP[_rk(r)]=r);
  Object.keys(rN).forEach(k=>{ if(!rP[k]) out.push("Nueva ruta: "+k); });
  Object.keys(rP).forEach(k=>{ if(!rN[k]) out.push("Ruta eliminada: "+k); });
  const _dir=nuevo.direccion||"E"; const _soN=mkSurOf(nuevo), _soP=mkSurOf(previo);
  const _eqs=(nuevo.equipos&&nuevo.equipos.length)?nuevo.equipos:["20DV","40HC"];
  Object.keys(rN).forEach(k=>{ if(!rP[k]) return; const rn=rN[k], rp=rP[k];
    _eqs.forEach(ek=>{ const eqObj=eqMeta(ek); if(!eqObj) return;
      const oiN=opcionActivaEq(rn,ek,eqObj,_dir,_soN), oiP=opcionActivaEq(rp,ek,eqObj,_dir,_soP);
      const on=(rn.opciones||[])[oiN]||{}, op=(rp.opciones||[])[oiP]||{};
      const pn=(on.precios||{})[ek]||{}, pp=(op.precios||{})[ek]||{};
      if((on.navScac||"")!==(op.navScac||"")) out.push("Naviera "+k+" ("+ek+"): "+(op.navScac||"—")+" → "+(on.navScac||"—"));
      if(nz(pn.base)!==nz(pp.base)) out.push("Tarifa "+k+" ("+ek+") base: "+nz(pp.base)+" → "+nz(pn.base));
      if(nz(pn.profit)!==nz(pp.profit)) out.push("Tarifa "+k+" ("+ek+") profit: "+nz(pp.profit)+" → "+nz(pn.profit));
      const _vc=(r,so)=>{ const a=r.ventaAncla&&r.ventaAncla[ek]; return (a!=null&&a!=="")?Number(a):round10(ventaEq(r,eqObj,_dir,so)); };
      const vN=_vc(rn,_soN), vP=_vc(rp,_soP);
      if(vN!==vP && (vN||vP)) out.push("Venta al cliente "+k+" ("+ek+"): "+vP+" → "+vN);
    });
  });
  const qN={}, qP={};
  (nuevo.quoteNav||[]).forEach(q=>qN[q.scac+"|"+(q.tl||"")]=q); (previo.quoteNav||[]).forEach(q=>qP[q.scac+"|"+(q.tl||"")]=q);
  const bks=new Set([...Object.keys(qN),...Object.keys(qP)]);
  bks.forEach(bk=>{ const bn=qN[bk], bp=qP[bk]; const label=bk.replace("|"," · ");
    const sN={}, sP={}; ((bn&&bn.surcharges)||[]).forEach(s=>sN[s.c]=s); ((bp&&bp.surcharges)||[]).forEach(s=>sP[s.c]=s);
    const sk=new Set([...Object.keys(sN),...Object.keys(sP)]);
    sk.forEach(c=>{ const a=sN[c], b=sP[c];
      if(a&&!b) out.push("Recargo alta "+label+": "+c+" "+nz(a.monto));
      else if(!a&&b) out.push("Recargo baja "+label+": "+c);
      else if(a&&b){
        if(nz(a.monto)!==nz(b.monto)) out.push("Recargo "+label+" "+c+": monto "+nz(b.monto)+" → "+nz(a.monto));
        if((a.pago||"")!==(b.pago||"")) out.push("Recargo "+label+" "+c+": "+(b.pago||"")+" → "+(a.pago||""));
        if(!!a.incluido!==!!b.incluido) out.push("Recargo "+label+" "+c+": "+(b.incluido?"Incl":"No incl")+" → "+(a.incluido?"Incl":"No incl"));
        if(JSON.stringify(a.montos||null)!==JSON.stringify(b.montos||null)) out.push("Recargo "+label+" "+c+": montos por tamaño actualizados");
      }
    });
  });
  return out;
}

export async function saveCotizacion(state, logInfo){
  const sum={versiones:0,lineas:0,opciones:0,surcharges:0,errores:[],codigo:null,versionId:null};
  const { versionId, cliente, clienteNombre, modo, direccion, commodity, commodity_id, origen, notas, tradelane, vigDesde, vigHasta } = state;

  if(versionId){
    // Estado previo de ESTE borrador (antes de sobrescribir) para el historial de cambios
    let prevSelfState=null; try{ prevSelfState=await loadVersion(versionId); }catch(_){}
    // EDITAR borrador existente: actualiza versión y reemplaza hijos
    await supabase.from("versiones").update({direccion,commodity:commodity||"",commodity_id:commodity_id||null,notas:notas||null,tradelane:tradelane||null,vig_desde:parseDate(vigDesde),vig_hasta:parseDate(vigHasta)}).eq("id",versionId);
    await supabase.from("lineas").delete().eq("version_id",versionId); // cascade -> opciones + recargos
    sum.versionId=versionId; sum.codigo=state.codigo;
    await insertChildren(versionId, state, sum);
    // Historial: registra los cambios de ESTA sesión (vs el guardado anterior) con fecha y usuario
    try{
      const items = prevSelfState ? resumenCambios(state, prevSelfState) : [];
      const { data: vlog } = await supabase.from("versiones").select("cambios_log").eq("id",versionId).maybeSingle();
      const log = Array.isArray(vlog&&vlog.cambios_log) ? vlog.cambios_log : [];
      if(items && items.length){
        let quien=""; try{ const { data:{ user } }=await supabase.auth.getUser(); quien=(user&&user.email)||""; }catch(_){}
        const fecha=(()=>{ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); })();
        log.push({ fecha, usuario:quien, tipo:(logInfo&&logInfo.tipo)||"manual", origen:(logInfo&&logInfo.origen)||null, items });
        await supabase.from("versiones").update({cambios_log:log}).eq("id",versionId);
      }
      sum.cambiosLog=log;
    }catch(_){}
    return sum;
  }

  // NUEVA cotización
  let acuerdo_id;
  let { data: acu } = await supabase.from("acuerdos").select("id").eq("cliente_id",cliente).eq("modo",modo).maybeSingle();
  if(acu) acuerdo_id=acu.id;
  else{
    const { no_acuerdo, prefijo, vig_desde, vig_hasta } = await nuevoNoAcuerdo(clienteNombre||cliente);
    let { data: ai, error } = await supabase.from("acuerdos").insert({no_acuerdo,prefijo,vig_desde,vig_hasta,cliente_id:cliente,modo,sales_rep_email:state.salesRep||null}).select("id").single();
    if(error){ sum.errores.push("acuerdo: "+error.message); return sum; }
    acuerdo_id=ai.id;
  }
  let { data: ver, error: ve } = await supabase.from("versiones")
    .insert({acuerdo_id,direccion,origen:origen==="rr"?"desde_rate_request":"desde_cero",commodity:commodity||"",commodity_id:commodity_id||null,notas:notas||null,tradelane:tradelane||null,vig_desde:parseDate(vigDesde),vig_hasta:parseDate(vigHasta),estatus:"borrador"})
    .select("id,codigo").single();
  if(ve){ sum.errores.push("version: "+ve.message); return sum; }
  sum.versiones++; sum.codigo=ver.codigo; sum.versionId=ver.id;
  await insertChildren(ver.id, state, sum);
  return sum;
}

// ===== Lista de cotizaciones (todo el equipo para pricing/admin; sales: propias por RLS) =====
export async function listCotizaciones(){
  const { data, error } = await supabase.from("versiones")
    .select("id,codigo,direccion,estatus,commodity,owner_email,updated_by_email,updated_at,reemplaza_a,origen,amendment,tradelane,vig_desde,vig_hasta,acuerdo_id,acuerdos(no_acuerdo,modo,vig_desde,vig_hasta,clientes(nombre,no_cliente)),lineas(validez_desde,validez_hasta)")
    .order("updated_at",{ascending:false}).limit(300);
  if(error) return { rows:[], error:error.message };
  return { rows:(data||[]).map(v=>{
    const l=(v.lineas||[]).find(x=>x.validez_desde||x.validez_hasta)||{};
    return {
      id:v.id, codigo:v.codigo, folio:(v.codigo||"")+(v.commodity?(" · "+v.commodity):""),
      cliente:v.acuerdos?.clientes?.nombre||"—", noCliente:v.acuerdos?.clientes?.no_cliente||"",
      acuerdoId:v.acuerdo_id||null, noAcuerdo:v.acuerdos?.no_acuerdo||"", modo:v.acuerdos?.modo||"",
      acuerdoVigDesde:v.acuerdos?.vig_desde||null, acuerdoVigHasta:v.acuerdos?.vig_hasta||null,
      amendment:v.amendment||1, tradelane:v.tradelane||"",
      direccion:v.direccion, estatus:v.estatus,
      commodity:v.commodity, owner:v.owner_email, actualizadoPor:v.updated_by_email||v.owner_email, updated_at:v.updated_at, origen:v.origen, superseded_by:null,
      // la vigencia del AM manda; si no está, caemos a la validez de las líneas
      vigDesde:v.vig_desde||l.validez_desde||null, vigHasta:v.vig_hasta||l.validez_hasta||null
    };
  }) };
}

// Trae TODAS las filas de un .in(col, ids): trocea los ids (evita URLs enormes)
// y pagina con .range() porque el API de Supabase corta en 1000 filas por consulta.
// Sin esto, en cotizaciones grandes se perdían los recargos con 'orden' más alto
// (los últimos que agregas), dando la impresión de que "no se guardan".
async function selectAllIn(table, sel, col, ids, orderBy){
  const out=[]; const CH=100, PAGE=1000;
  for(let i=0;i<ids.length;i+=CH){
    const chunk=ids.slice(i,i+CH);
    for(let from=0;;from+=PAGE){
      let q=supabase.from(table).select(sel).in(col,chunk);
      if(orderBy) q=q.order(orderBy);
      const { data, error } = await q.range(from, from+PAGE-1);
      if(error) throw error;
      out.push(...(data||[]));
      if(!data || data.length<PAGE) break;
    }
  }
  return out;
}
// Igual que arriba pero para un filtro .eq() simple
async function selectAllEq(table, sel, col, val, orderBy){
  const out=[]; const PAGE=1000;
  for(let from=0;;from+=PAGE){
    let q=supabase.from(table).select(sel).eq(col,val);
    if(orderBy) q=q.order(orderBy);
    const { data, error } = await q.range(from, from+PAGE-1);
    if(error) throw error;
    out.push(...(data||[]));
    if(!data || data.length<PAGE) break;
  }
  return out;
}

// ===== Reconstruir el estado del cotizador desde una versión =====
// ===========================================================================
// BUSCAR RUTAS SIMILARES (reusar tarifas) — busca en TODOS los borradores rutas
// con el mismo POL/POD (por clave) o con nombre de puerto similar (ej. Ningbo /
// Ningbo pt). Devuelve navieras con base + recargos + profit para importarlas
// como base de una nueva cotización, conservando el POL/POD ya capturado.
// ===========================================================================
const _norm=(s)=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const _nombreSimilar=(claveA, claveB)=>{
  if(!claveA||!claveB) return false;
  if(claveA===claveB) return true;
  const a=_norm(puertoNombre(claveA)||claveA), b=_norm(puertoNombre(claveB)||claveB);
  if(!a||!b) return false;
  if(a===b) return true;
  if(a.includes(b)||b.includes(a)) return true;            // "ningbo" ⊂ "ningbo pt"
  const a1=a.split(" ")[0], b1=b.split(" ")[0];
  return !!a1 && a1===b1 && a1.length>=3;                  // misma primera palabra
};
const _matchPuerto=(a,b)=> a===b || _nombreSimilar(a,b);

const _normCiudad=(s)=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").replace(/\b(mx|mex|mexico)\b/g,"").replace(/\s+/g," ").trim();

export async function buscarRutasSimilares({ pol, pod, origen, destino, origenEstado, destinoEstado, versionExcluir }){
  if(!pol || !pod) return { mismoEstado:[], otroEstado:[] };
  const { data: vers, error } = await supabase.from("versiones")
    .select("id,codigo,commodity,acuerdos(clientes(nombre))")
    .eq("estatus","borrador").limit(500);
  if(error) return { mismoEstado:[], otroEstado:[], error:error.message };
  const ocSrc=_normCiudad(origen), dcSrc=_normCiudad(destino);
  const oeSrc=(origenEstado||"").trim().toLowerCase(), deSrc=(destinoEstado||"").trim().toLowerCase();
  // nivel de coincidencia de un puerto candidato c vs referencia ref: 0 exacto, 1 alterno, 2 base, 3 nombre similar, 9 no
  const _rankPuerto=(c,ref)=>{ if(c===ref) return 0; if(sonPuertosAlternos(c,ref)) return 1; if(sonPuertosBase(c,ref)) return 2; if(_nombreSimilar(c,ref)) return 3; return 9; };
  const _tagPuerto=(rk)=> rk===0?"exacto":rk===1?"alterno":rk===2?"base":"aprox";
  const mismoEstado=[], otroEstado=[];
  for(const v of (vers||[])){
    if(v.id===versionExcluir) continue;
    let st; try{ st=await loadVersion(v.id); }catch(_){ continue; }
    if(!st) continue;
    const surOf=mkSurOf(st);
    (st.rutas||[]).forEach(r=>{
      if(!r.pol || !r.pod) return;
      const rkPol=_rankPuerto(r.pol,pol), rkPod=_rankPuerto(r.pod,pod);
      if(rkPol>=9 || rkPod>=9) return;                 // algún puerto no es compatible -> descartar
      const puertoRank=Math.max(rkPol,rkPod);          // el peor de los dos define el nivel de puerto
      const navieras=(r.opciones||[]).map(o=>({
        scac:o.navScac||"", transito:o.transito||"",
        precios:o.precios||{},
        recargos:(surOf(o.navScac,tlDe(r))||[]).map(s=>({...s})),
        tl:tlDe(r)
      })).filter(nv=>nv.scac);
      if(!navieras.length) return;
      const _oc=r.origen||"", _dc=r.destino||"", _om=r.precarriage_mode||"", _dm=r.oncarriage_mode||"", _oe=r.origenEstado||"", _de=r.destinoEstado||"";
      const rutaCompleta=(_oc?(_oc+(_oe?", "+abrevEstado(_oe):"")+(_om?" ["+_om+"]":"")+" › "):"")+_loc(r.pol)+" → "+_loc(r.pod)+(_dc?(" › "+(_dm?"["+_dm+"] ":"")+_dc+(_de?", "+abrevEstado(_de):"")):"");
      const ocIgual=(_normCiudad(_oc)===ocSrc), dcIgual=(_normCiudad(_dc)===dcSrc);
      const oeIgual = !ocSrc ? true : (_oe.trim().toLowerCase()===oeSrc && oeSrc!=="");
      const deIgual = !dcSrc ? true : (_de.trim().toLowerCase()===deSrc && deSrc!=="");
      const mismoEdo = oeIgual && deIgual && (oeSrc||deSrc);   // estado(s) coinciden
      const exactaTotal = (puertoRank===0 && ocIgual && dcIgual);
      const puertoTag=_tagPuerto(puertoRank);
      const row={ versionId:v.id, cliente:v.acuerdos?.clientes?.nombre||st.clienteNombre||"", folio:v.codigo||st.codigo||"",
        producto:v.commodity||st.commodity||"", direccion:st.direccion||"E", pol:r.pol, pod:r.pod, polNombre:_loc(r.pol), podNombre:_loc(r.pod),
        origen:_oc, destino:_dc, origenEstado:_oe, destinoEstado:_de, precarriage_mode:_om, oncarriage_mode:_dm, rutaCompleta,
        puertoRank, puertoTag, exactaTotal, navieras };
      (mismoEdo?mismoEstado:otroEstado).push(row);
    });
  }
  // ordenar cada sección: exacta total primero, luego por nivel de puerto (exacto<alterno<base<aprox)
  const _ord=(a,b)=> (b.exactaTotal-a.exactaTotal) || (a.puertoRank-b.puertoRank);
  mismoEstado.sort(_ord); otroEstado.sort(_ord);
  return { mismoEstado, otroEstado };
}

export async function loadVersion(versionId){
  const { data: ver } = await supabase.from("versiones").select("*, acuerdos(id,no_acuerdo,modo,cliente_id,sales_rep_email,clientes(nombre))").eq("id",versionId).single();
  const lineas = await selectAllEq("lineas","*","version_id",versionId,"created_at");
  const lids=(lineas||[]).map(l=>l.id);
  const opciones = lids.length ? await selectAllIn("opciones_costo","*","linea_id",lids) : [];
  const oids=(opciones||[]).map(o=>o.id);
  const surs = oids.length ? await selectAllIn("opcion_surcharges","*","opcion_id",oids,"orden") : [];

  const sig=(l)=>[l.origen,l.precarriage_mode,l.pol,l.pod,l.oncarriage_mode,l.destino].join("|");
  const opByLinea={}; (opciones||[]).forEach(o=>{ (opByLinea[o.linea_id]=opByLinea[o.linea_id]||[]).push(o); });
  const sursByOpcion={}; (surs||[]).forEach(s=>{ (sursByOpcion[s.opcion_id]=sursByOpcion[s.opcion_id]||[]).push(s); });

  const equiposSet=new Set(); const rutasMap={};
  (lineas||[]).forEach(l=>{ equiposSet.add(l.equipo); const s=sig(l); (rutasMap[s]=rutasMap[s]||{l,equipos:{}}); rutasMap[s].equipos[l.equipo]=l; });

  const lineById={}; (lineas||[]).forEach(l=>{ lineById[l.id]=l; });
  const quoteNavMap={};
  (opciones||[]).forEach(o=>{ if(!o.naviera) return; const l=lineById[o.linea_id]; const tl=l?tlDe(l):""; const key=o.naviera+"|"+tl;
    const surs=(sursByOpcion[o.id]||[]).map(s=>({c:s.clave,d:s.descripcion,monto:String(s.monto),moneda:s.moneda,incluido:s.incluido,desplegar:s.desplegar,pago:s.pago,basis:s.basis||"contenedor",montos:s.montos||null}));
    const ex=quoteNavMap[key];
    if(!ex){ quoteNavMap[key]={scac:o.naviera,tl,surcharges:surs}; }
    else if((!ex.surcharges||!ex.surcharges.length) && surs.length){ ex.surcharges=surs; } });

  const rutas=Object.values(rutasMap).map(rm=>{
    const l0=rm.l; const navSet=[];
    Object.values(rm.equipos).forEach(l=>{ (opByLinea[l.id]||[]).forEach(o=>{ if(!navSet.includes(o.naviera)) navSet.push(o.naviera); }); });
    const ops=navSet.map(nav=>{ const precios={}; let transito=""; Object.entries(rm.equipos).forEach(([eq,l])=>{ const op=(opByLinea[l.id]||[]).find(o=>o.naviera===nav); if(op){ precios[eq]={base:String(op.costo_base??""),profit:String(op.profit??"")}; if(op.transito_dias!=null) transito=String(op.transito_dias); } }); return {navScac:nav,transito,precios}; });
    let elegida=0; Object.values(rm.equipos).forEach(l=>{ if(l.opcion_elegida_id){ const op=(opByLinea[l.id]||[]).find(o=>o.id===l.opcion_elegida_id); if(op){ const idx=navSet.indexOf(op.naviera); if(idx>=0) elegida=idx; } } });
    const ventaAncla={}; Object.entries(rm.equipos).forEach(([ek,l])=>{ if(l.venta_anclada!=null&&l.venta_anclada!=="") ventaAncla[ek]=Number(l.venta_anclada); });
    return {origen:l0.origen||"",origenEstado:l0.origen_estado||"",precarriage_mode:l0.precarriage_mode||"",pol:l0.pol||"",pod:l0.pod||"",oncarriage_mode:l0.oncarriage_mode||"",destino:l0.destino||"",destinoEstado:l0.destino_estado||"",opciones:ops.length?ops:[{navScac:"",precios:{}}],elegida,elegidaEq:l0.elegida_eq||null,ventaAncla:Object.keys(ventaAncla).length?ventaAncla:null};
  });
  const anyL=(lineas||[])[0]||{};
  let prevVigDesde=null, prevVigHasta=null;
  if(ver.reemplaza_a){ try{ const { data:pv }=await supabase.from("versiones").select("vig_desde,vig_hasta").eq("id",ver.reemplaza_a).maybeSingle(); if(pv){ prevVigDesde=pv.vig_desde; prevVigHasta=pv.vig_hasta; } }catch(_){} }
  return {
    versionId, codigo:ver.codigo, estatus:ver.estatus, acuerdo_id:ver.acuerdos?.id,
    no_acuerdo:ver.acuerdos?.no_acuerdo||"", tradelane:ver.tradelane||"", amendment:ver.amendment||1,
    cambios:ver.cambios||null, cambiosLog:Array.isArray(ver.cambios_log)?ver.cambios_log:[], reemplaza_a:ver.reemplaza_a||null, updatedAt:ver.updated_at||null, updatedBy:ver.updated_by_email||null,
    prevVigDesde, prevVigHasta,
    cliente:ver.acuerdos?.cliente_id, clienteNombre:ver.acuerdos?.clientes?.nombre, acuerdoId:ver.acuerdo_id||null, salesRep:ver.acuerdos?.sales_rep_email||"",
    modo:ver.acuerdos?.modo||"maritimo", direccion:ver.direccion,
    commodity:ver.commodity, commodity_id:ver.commodity_id, notas:ver.notas||"", correcciones:ver.correcciones||"",
    vigDesde:anyL.validez_desde||"", vigHasta:anyL.validez_hasta||"",
    equipos:[...equiposSet], rutas:rutas.length?rutas:[], quoteNav:Object.values(quoteNavMap),
  };
}

// ===== Documento vivo: anclar la venta actual (por ruta+equipo) como propuesta =====
export async function anclarVenta(versionId){
  const st=await loadVersion(versionId); if(!st) return {ok:false,anclados:0};
  const dir=st.direccion||"E"; const so=mkSurOf(st);
  const rk=(x)=>((x.pol||x.origen||"")+"|"+(x.pod||x.destino||""));
  const rutaByKey={}; (st.rutas||[]).forEach(r=>{ rutaByKey[rk(r)]=r; });
  const { data: lins } = await supabase.from("lineas").select("id,pol,pod,origen,destino,equipo,venta_anclada").eq("version_id",versionId);
  let cnt=0;
  for(const l of (lins||[])){ if(l.venta_anclada!=null) continue; const r=rutaByKey[rk(l)]; if(!r) continue; const v=round10(ventaEq(r,eqMeta(l.equipo),dir,so)); await supabase.from("lineas").update({venta_anclada:v}).eq("id",l.id); cnt++; }
  return {ok:true,anclados:cnt};
}

export async function markEnviada(versionId){
  const res = await supabase.from("versiones").update({estatus:"enviada"}).eq("id",versionId);
  // Vigencias: si es amendment que reemplaza a otro, cerrar el AM anterior UN DÍA ANTES del
  // inicio del nuevo (respetando la vig_desde capturada del nuevo, sea hoy o una fecha futura
  // para envíos anticipados). Aplica siempre que haya reemplazo, no solo con cambio de costo.
  try{
    const { data: vrow } = await supabase.from("versiones").select("reemplaza_a").eq("id",versionId).maybeSingle();
    if(vrow && vrow.reemplaza_a){
      const cur = await loadVersion(versionId);
      if(cur){
        const hoy=(()=>{ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); })();
        const nuevoDesde = cur.vigDesde || hoy;   // respeta lo capturado; si no hay, hoy
        const cierreAnterior=(()=>{ const d=new Date(nuevoDesde+"T00:00:00"); d.setDate(d.getDate()-1); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); })();
        if(!cur.vigDesde){ await supabase.from("versiones").update({vig_desde:nuevoDesde}).eq("id",versionId); await supabase.from("lineas").update({validez_desde:nuevoDesde}).eq("version_id",versionId); }
        await supabase.from("versiones").update({vig_hasta:cierreAnterior}).eq("id",vrow.reemplaza_a);
        await supabase.from("lineas").update({validez_hasta:cierreAnterior}).eq("version_id",vrow.reemplaza_a);
        // Recién ahora (al enviar el nuevo) el AM anterior pasa a superseded
        await supabase.from("versiones").update({estatus:"superseded"}).eq("id",vrow.reemplaza_a);
      }
    }
  }catch(e){ /* el ajuste de vigencias no debe romper el envío */ }
  // Documento vivo: al enviar, la venta de esta propuesta queda anclada
  try{ await anclarVenta(versionId); }catch(e){ /* no romper el envío */ }
  return res;
}

// ===== Nuevo Amendment (AM1 -> AM2): copia, incrementa AM, supersede el anterior =====
export async function nuevaVersion(versionId){
  const sum={lineas:0,opciones:0,surcharges:0,errores:[],codigo:null,versionId:null,amendment:null};
  const st=await loadVersion(versionId);
  const nextAm=(st.amendment||1)+1;
  st.vigDesde=new Date(Date.now()+86400000).toISOString().slice(0,10); // el AM nuevo arranca mañana (editable)
  let { data: ver, error: ve } = await supabase.from("versiones")
    .insert({acuerdo_id:st.acuerdo_id,direccion:st.direccion,origen:"desde_cero",commodity:st.commodity||"",commodity_id:st.commodity_id||null,tradelane:st.tradelane||null,amendment:nextAm,vig_desde:parseDate(st.vigDesde),vig_hasta:parseDate(st.vigHasta),reemplaza_a:versionId,estatus:"borrador"})
    .select("id,codigo").single();
  if(ve){ sum.errores.push("nuevo amendment: "+ve.message); return sum; }
  sum.codigo=ver.codigo; sum.versionId=ver.id; sum.amendment=nextAm; sum.vigDesde=st.vigDesde;
  await insertChildren(ver.id, st, sum);
  // El AM anterior se conserva "enviada" y NO pasa a superseded hasta que se ENVÍE este nuevo AM (ver markEnviada).
  return sum;
}

// ===== Alta de cliente / prospecto desde el cotizador =====
export async function crearCliente({nombre, tipo="cliente"}){
  const nm=String(nombre||"").trim();
  if(!nm) return { error:"nombre vacío" };
  const pref = tipo==="prospecto" ? "PRO-" : "CLI-";
  const no_cliente = pref + slug(nm);
  let { data, error } = await supabase.from("clientes")
    .insert({ no_cliente, nombre:nm, tipo }).select("id,no_cliente,nombre,tipo").single();
  if(error){
    // si ya existe por no_cliente, lo recuperamos
    let { data: ex } = await supabase.from("clientes")
      .select("id,no_cliente,nombre,tipo").eq("no_cliente",no_cliente).maybeSingle();
    if(ex) return { cliente: ex };
    return { error: error.message };
  }
  return { cliente: data };
}

// ===== Alta de recargo en el catálogo (surcharges) =====
export async function altaSurcharge({clave, descripcion, categoria="Otros"}){
  const c=String(clave||"").trim().toUpperCase();
  if(!c) return { error:"clave vacía" };
  let { error } = await supabase.from("surcharges")
    .insert({ clave:c, descripcion:String(descripcion||c).trim(), categoria });
  if(error && !String(error.message).toLowerCase().includes("duplicate")) return { error: error.message };
  return { ok:true, clave:c };
}

// ===== Catálogo de recargos cargado de la BD (para fusionar con el estático) =====
export async function listSurcharges(){
  const { data } = await supabase.from("surcharges").select("clave,descripcion,categoria").order("clave");
  return (data||[]).map(s=>({ c:s.clave, d:s.descripcion||"", g:s.categoria||"" }));
}

// ===== #2 Recargos de la última cotización con misma combinación País→País =====
export async function recargosDeRutaSimilar(pais1, pais2, excludeVersionId){
  if(!pais1 || !pais2) return null;
  const { data } = await supabase.from("versiones")
    .select("id,updated_at,lineas(pol,pod,origen,destino)")
    .order("updated_at",{ascending:false}).limit(150);
  for(const v of (data||[])){
    if(v.id===excludeVersionId) continue;
    const hit=(v.lineas||[]).some(l=>{
      const o=paisDe(l.pol)||paisDe(l.origen);
      const d=paisDe(l.pod)||paisDe(l.destino);
      return o===pais1 && d===pais2;
    });
    if(hit){
      const st=await loadVersion(v.id);
      if(st && st.quoteNav && st.quoteNav.length) return { versionId:v.id, codigo:st.codigo, quoteNav:st.quoteNav };
    }
  }
  return null;
}

// #2b Auto-poblar recargos POR NAVIERA: para cada SCAC en navList, jala sus recargos
// de la cotización previa más reciente (misma combinación País→País) que haya usado ESA naviera.
// Cada naviera puede venir de una cotización distinta. Sin fallback a otra naviera.
export async function recargosDeRutaSimilarPorNaviera(pais1, pais2, navList, excludeVersionId){
  if(!pais1 || !pais2) return null;
  const targetTl=pais1+">"+pais2;
  const want=[...new Set((navList||[]).filter(Boolean))];
  const { data } = await supabase.from("versiones")
    .select("id,updated_at,lineas(pol,pod,origen,destino)")
    .order("updated_at",{ascending:false}).limit(150);
  const found={}, sources={};
  for(const v of (data||[])){
    if(v.id===excludeVersionId) continue;
    if(want.length && Object.keys(found).length>=want.length) break;
    const hit=(v.lineas||[]).some(l=>{
      const o=paisDe(l.pol)||paisDe(l.origen);
      const d=paisDe(l.pod)||paisDe(l.destino);
      return o===pais1 && d===pais2;
    });
    if(!hit) continue;
    const st=await loadVersion(v.id);
    if(!st || !st.quoteNav) continue;
    for(const q of st.quoteNav){
      if(found[q.scac]) continue;
      if(want.length && !want.includes(q.scac)) continue;
      if(q.tl && q.tl!==targetTl) continue;                 // mismo tradelane (versiones nuevas). Legacy sin tl: se acepta por naviera.
      if(q.surcharges && q.surcharges.length){ found[q.scac]=q.surcharges; sources[q.scac]=st.codigo||v.id; }
    }
  }
  const keys=Object.keys(found);
  if(!keys.length) return null;
  return { quoteNav: keys.map(scac=>({scac,tl:targetTl,surcharges:found[scac]})), sources };
}

// #2 (jerarquía): recargos de ESA naviera en CUALQUIER lane (historial), la más reciente con recargos
export async function recargosDeNaviera(scac, excludeVersionId){
  if(!scac) return null;
  const { data: ops } = await supabase.from("opciones_costo").select("id,created_at,lineas(version_id)").eq("naviera",scac).order("created_at",{ascending:false}).limit(120);
  for(const op of (ops||[])){
    if(op.lineas?.version_id===excludeVersionId) continue;
    const { data: srs } = await supabase.from("opcion_surcharges").select("*").eq("opcion_id",op.id).order("orden");
    if(srs && srs.length){
      return { surcharges: srs.map(s=>({c:s.clave,d:s.descripcion,monto:String(s.monto),moneda:s.moneda,incluido:s.incluido,desplegar:s.desplegar,pago:s.pago,basis:s.basis||"contenedor",montos:s.montos||null})) };
    }
  }
  return null;
}
// ===== #5 Conflicto: misma ruta + misma vigencia, tarifa distinta (otro cliente o no) =====
// Devuelve [{folio, cliente, ruta, vig, tarifaExistente, tarifaNueva}]
export async function checkConflictoTarifa(state){
  const { versionId, vigDesde, vigHasta, rutas, equipos, quoteNav, direccion, cliente } = state;
  if(!vigDesde && !vigHasta) return [];
  const surOf=(scac,tl)=>((quoteNav||[]).find(q=>q.scac===scac&&(q.tl||"")===(tl||""))||{}).surcharges||[];
  // venta (base+profit+recargos que suman según dirección) de la opción elegida, primer equipo
  const ventaNueva=(r)=>{
    const o=(r.opciones||[])[r.elegida??0]||r.opciones[0]||{}; const ek=equipos[0];
    const pr=(o.precios&&o.precios[ek])||{}; const surs=surOf(o.navScac, tlDe(r));
    return n(pr.base)+n(pr.profit)+adicPorCont(surs, eqMeta(ek), direccion);
  };
  const rutasReq=(rutas||[]).filter(r=>tx(r.pol)&&tx(r.pod)).map(r=>({pol:r.pol,pod:r.pod,venta:ventaNueva(r)}));
  if(!rutasReq.length) return [];
  // Trae versiones con misma vigencia (en lineas) y sus tarifas
  const { data } = await supabase.from("lineas")
    .select("pol,pod,validez_desde,validez_hasta,version_id,opcion_elegida_id,versiones(id,codigo,estatus,direccion,acuerdos(cliente_id,clientes(nombre)))")
    .eq("validez_desde", vigDesde||null).eq("validez_hasta", vigHasta||null).limit(500);
  if(!data || !data.length) return [];
  const lids=data.filter(l=>l.opcion_elegida_id).map(l=>l.opcion_elegida_id);
  const ops = lids.length ? await selectAllIn("opciones_costo","id,costo_base,profit","id",lids) : [];
  const opMap={}; (ops||[]).forEach(o=>{ opMap[o.id]={base:n(o.costo_base),profit:n(o.profit)}; });
  // surcharges de esas opciones para sumar adicional
  const surExist = lids.length ? await selectAllIn("opcion_surcharges","opcion_id,monto,incluido,pago,basis,montos","opcion_id",lids) : [];
  const surByOp={}; (surExist||[]).forEach(s=>{ (surByOp[s.opcion_id]=surByOp[s.opcion_id]||[]).push({monto:s.monto,incluido:s.incluido,pago:s.pago,basis:s.basis,montos:s.montos,c:""}); });
  const conflictos=[];
  for(const l of data){
    if(l.version_id===versionId) continue;
    if(cliente && l.versiones?.acuerdos?.cliente_id && l.versiones.acuerdos.cliente_id!==cliente) continue;  // solo mismo cliente
    const mine=rutasReq.find(x=>x.pol===l.pol && x.pod===l.pod);
    if(!mine) continue;
    if(mine.venta<=0) continue;   // tarifa nueva aún sin capturar: no comparar
    const op=opMap[l.opcion_elegida_id]; if(!op) continue;
    const ventaExist=op.base+op.profit+adicPorCont(surByOp[l.opcion_elegida_id]||[],eqMeta("20DV"),l.versiones?.direccion||"E");
    if(ventaExist<=0) continue;   // tarifa existente sin capturar: no comparar
    if(Math.abs(ventaExist-mine.venta) > 0.5){  // tarifa distinta
      conflictos.push({
        folio:l.versiones?.codigo||"?",
        cliente:l.versiones?.acuerdos?.clientes?.nombre||"—",
        ruta:l.pol+"→"+l.pod,
        vig:(vigDesde||"")+" — "+(vigHasta||""),
        tarifaExistente:ventaExist, tarifaNueva:mine.venta
      });
    }
  }
  // dedup por folio+ruta
  const seen=new Set(); return conflictos.filter(c=>{ const k=c.folio+c.ruta; if(seen.has(k))return false; seen.add(k); return true; });
}

// ===== Borrado de versiones =====
// Borra una versión (las líneas en cascada eliminan opciones y recargos)
export async function deleteVersion(versionId){
  await supabase.from("lineas").delete().eq("version_id", versionId);
  const { error } = await supabase.from("versiones").delete().eq("id", versionId);
  return { error: error ? error.message : null };
}

// Borra un contrato macro completo (acuerdo + amendments + rutas + costos + recargos).
// Usa una función en la BD (delete_acuerdo) que EXIGE admin y borra todo en una transacción.
// El CLIENTE no se borra (puede tener otros acuerdos de distinto modo).
// ===== Usuarios (para asignar sales rep) y asignación =====
export async function listUsuarios(){
  const { data, error } = await supabase.from("allowed_users").select("email,name,role").order("role").order("email");
  if(error) return { rows:[], error:error.message };
  return { rows:(data||[]) };
}
export async function asignarSalesRep(acuerdoId, email){
  if(!acuerdoId) return { error:"Falta el acuerdo." };
  const { error } = await supabase.from("acuerdos").update({ sales_rep_email: email||null }).eq("id", acuerdoId);
  return { error: error?error.message:null };
}

export async function deleteAcuerdo(acuerdoId){
  if(!acuerdoId) return { error:"Falta el identificador del acuerdo." };
  const { error } = await supabase.rpc("delete_acuerdo", { p_acuerdo: acuerdoId });
  return { error: error ? error.message : null };
}

// Cuenta de versiones importadas (todas y borradores)
export async function contarImportadas(){
  const { count: total } = await supabase.from("versiones").select("id",{count:"exact",head:true}).eq("origen","importado");
  const { count: borr } = await supabase.from("versiones").select("id",{count:"exact",head:true}).eq("origen","importado").eq("estatus","borrador");
  return { total: total||0, borradores: borr||0 };
}

// Borra lo importado: solo borradores, o todo lo importado
export async function deleteImportadas({ onlyBorradores=true }={}){
  let q=supabase.from("versiones").select("id").eq("origen","importado");
  if(onlyBorradores) q=q.eq("estatus","borrador");
  const { data, error } = await q;
  if(error) return { borradas:0, errores:[error.message] };
  let n=0; const errs=[];
  for(const v of (data||[])){ const r=await deleteVersion(v.id); if(r.error) errs.push(r.error); else n++; }
  return { borradas:n, errores:errs };
}

// ===========================================================================
// FLETES BASE — catálogo consultable (repositorio independiente)
// ===========================================================================
const _fbClean=(r)=>({
  origen:r.origen||"", pol:r.pol||"", pod:r.pod||"", destino:r.destino||"",
  equipo:r.equipo||"", naviera:r.naviera||"", producto:r.producto||"", flete_base:Number(r.flete_base)||0,
  moneda:r.moneda||"USD", tradelane:r.tradelane||"", precarriage_mode:r.precarriage_mode||"",
  oncarriage_mode:r.oncarriage_mode||"", tt:r.tt||"", vig_desde:r.vig_desde||null, vig_hasta:r.vig_hasta||null, notas:r.notas||""
});

// Alta masiva desde el Excel del catálogo (costos de naviera, sin cliente).
// REEMPLAZA todo el catálogo: la nueva carga sustituye a la anterior para las búsquedas.
export async function upsertFletesBase(registros){
  const regs=(registros||[]).map(_fbClean);
  if(!regs.length) return { guardados:0, errores:["No hay registros para guardar."] };
  // dedupe local por la llave natural (gana la última)
  const dedup=new Map();
  const K=(r)=>[r.origen,r.pol,r.pod,r.destino,r.equipo,r.naviera,r.producto].map(x=>String(x||"").trim().toUpperCase()).join("|");
  regs.forEach(r=>dedup.set(K(r),r));
  const filas=[...dedup.values()];
  // 1) vaciar el catálogo vigente
  const { error: eDel } = await supabase.from("fletes_base").delete().neq("id","00000000-0000-0000-0000-000000000000");
  if(eDel) return { guardados:0, errores:["No se pudo reemplazar el catálogo: "+eDel.message] };
  // 2) insertar la nueva versión
  const CH=200; let ok=0; const errs=[];
  for(let i=0;i<filas.length;i+=CH){
    const chunk=filas.slice(i,i+CH);
    const { error } = await supabase.from("fletes_base").insert(chunk);
    if(error) errs.push(error.message); else ok+=chunk.length;
  }
  return { guardados:ok, errores:errs };
}

// ---- Historial de archivos subidos (sólo consulta): se conservan las últimas 2 ----
export async function saveFletesArchivo({ nombre, b64, filas }){
  const { error } = await supabase.from("fletes_base_archivos").insert([{ nombre:nombre||"fletes_base.xlsx", filas:filas||0, contenido_b64:b64 }]);
  if(error) return { error:error.message };
  // podar: dejar sólo las 2 más recientes
  const { data } = await supabase.from("fletes_base_archivos").select("id").order("created_at",{ascending:false});
  const sobra=(data||[]).slice(2).map(x=>x.id);
  if(sobra.length) await supabase.from("fletes_base_archivos").delete().in("id",sobra);
  return { error:null };
}
export async function listFletesArchivos(){
  const { data, error } = await supabase.from("fletes_base_archivos")
    .select("id,nombre,filas,subido_por,created_at").order("created_at",{ascending:false}).limit(2);
  if(error) return { rows:[], error:error.message };
  return { rows:data||[] };
}
export async function getFletesArchivo(id){
  const { data, error } = await supabase.from("fletes_base_archivos").select("nombre,contenido_b64").eq("id",id).maybeSingle();
  if(error) return { error:error.message };
  return { nombre:data?.nombre, b64:data?.contenido_b64 };
}

export async function listFletesBase(){
  const out=[]; const PAGE=1000;
  for(let from=0;;from+=PAGE){
    const { data, error } = await supabase.from("fletes_base")
      .select("*").order("pol").order("pod").order("producto").order("equipo").order("naviera").range(from, from+PAGE-1);
    if(error) return { rows:[], error:error.message };
    out.push(...(data||[])); if(!data||data.length<PAGE) break;
  }
  return { rows:out };
}

export async function deleteFleteBase(id){
  const { error } = await supabase.from("fletes_base").delete().eq("id",id);
  return { error: error?error.message:null };
}
export async function deleteFletesBaseTodos(){
  const { error } = await supabase.from("fletes_base").delete().neq("id","00000000-0000-0000-0000-000000000000");
  return { error: error?error.message:null };
}

// Coincidencias para el enganche en el cotizador (general, sin importar cliente):
// devuelve, por (origen|pol|pod|destino|equipo), los fletes base que aplican.
export async function matchFletesBase(claves){
  if(!claves||!claves.length) return {};
  const pols=[...new Set(claves.map(k=>k.pol).filter(Boolean))];
  if(!pols.length) return {};
  const { data } = await supabase.from("fletes_base").select("*").in("pol",pols);
  const norm=(s)=>String(s||"").trim().toUpperCase();
  const key=(o)=>[norm(o.origen),norm(o.pol),norm(o.pod),norm(o.destino),norm(o.equipo)].join("|");
  const map={};
  (data||[]).forEach(f=>{ const k=key(f); (map[k]=map[k]||[]).push(f); });
  return map;
}

// ===========================================================================
// REPORTE: fletes base que están DENTRO de las cotizaciones (independiente del catálogo)
// Barre todas las versiones, sus líneas y opciones de costo, y devuelve una fila
// por (cotización × ruta × naviera × equipo) con su costo_base.
// ===========================================================================
// ===========================================================================
// PROPAGACIÓN DE RECARGOS (Fase 1) — al cambiar un recargo de una naviera para
// un par país-origen → país-destino, buscar OTROS borradores con la misma
// naviera + mismos países que tengan esa misma clave de recargo, y (con
// aprobación manual) copiarles el nuevo monto. Solo borradores; nunca enviados.
// Al aplicar, se conserva la tarifa al cliente: el profit absorbe el cambio de costo.
// ===========================================================================
export async function buscarCoincidenciasRecargo({ scac, paisPol, paisPod, clave, versionExcluir }){
  if(!scac || !clave) return { rows:[] };
  const { data: vers, error } = await supabase.from("versiones")
    .select("id,codigo,amendment,estatus,acuerdos(no_acuerdo,clientes(nombre))")
    .eq("estatus","borrador").limit(2000);
  if(error) return { rows:[], error:error.message };
  const cl=String(clave).toUpperCase();
  const out=[];
  for(const v of (vers||[])){
    if(v.id===versionExcluir) continue;
    let st; try{ st=await loadVersion(v.id); }catch(_){ continue; }
    if(!st) continue;
    const surOf=mkSurOf(st);
    (st.rutas||[]).forEach(r=>{
      if(!((r.opciones||[]).some(o=>o.navScac===scac))) return;        // usa esa naviera
      if(paisDe(r.pol)!==paisPol || paisDe(r.pod)!==paisPod) return;   // mismos países
      const s=(surOf(scac,tlDe(r))||[]).find(x=>String(x.c||"").toUpperCase()===cl);
      if(!s) return;                                                    // tiene esa clave
      const tieneSizes=s.montos&&Object.values(s.montos).some(x=>x!==""&&x!=null);
      out.push({ versionId:v.id, cliente:v.acuerdos?.clientes?.nombre||st.clienteNombre||"", folio:v.codigo||st.codigo||"",
        pol:r.pol, pod:r.pod, rutaLabel:_loc(r.pol)+" → "+_loc(r.pod), montoActual:tieneSizes?("por tamaño"):(s.monto!=null?s.monto:""), clave:s.c||clave });
    });
  }
  return { rows:out };
}

// Aplica el nuevo monto del recargo (clave) de la naviera scac en los borradores dados,
// conservando TODAS las ventas de cada borrador (el profit absorbe el cambio de costo).
export async function aplicarRecargoEnBorradores({ targets, versionIds, scac, clave, nuevoMonto, nuevosMontos, origenFolio }){
  const cl=String(clave||"").toUpperCase();
  // agrupar targets por versionId; cada target trae {versionId,pol,pod}. Compat: versionIds sueltos = todas sus rutas.
  const porVer={};
  (targets||[]).forEach(t=>{ (porVer[t.versionId]=porVer[t.versionId]||[]).push(t); });
  (versionIds||[]).forEach(vid=>{ if(!porVer[vid]) porVer[vid]=null; }); // null = aplicar a todo el borrador
  const montosLimpio=(()=>{ if(!nuevosMontos) return null; const o={}; Object.keys(nuevosMontos).forEach(k=>{ const v=nuevosMontos[k]; if(v!==""&&v!=null) o[k]=String(v); }); return Object.keys(o).length?o:null; })();
  let aplicados=0; const errores=[];
  for(const vid of Object.keys(porVer)){
    try{
      let st=await loadVersion(vid); if(!st){ errores.push(vid+": no encontrado"); continue; }
      if(st.estatus && st.estatus!=="borrador"){ errores.push((st.codigo||vid)+": no es borrador"); continue; }
      const dir=st.direccion||"E";
      // tls (tradelanes) de las rutas seleccionadas de este borrador (null = todas)
      const selRutas=porVer[vid];
      let tlsPermitidos=null;
      if(selRutas){ tlsPermitidos=new Set(); (st.rutas||[]).forEach(r=>{ if(selRutas.some(t=>t.pol===r.pol&&t.pod===r.pod)) tlsPermitidos.add(tlDe(r)); }); if(tlsPermitidos.size===0){ errores.push((st.codigo||vid)+": ruta no encontrada"); continue; } }
      // 1) capturar venta actual por opción×equipo
      const surOfOld=mkSurOf(st);
      const eqs=(st.equipos&&st.equipos.length?st.equipos:["20DV"]).map(k=>eqMeta(k)).filter(Boolean);
      const target={};
      (st.rutas||[]).forEach((r,ri)=>{ (r.opciones||[]).forEach((o,oi)=>{ eqs.forEach(eqObj=>{ const pr=(o.precios||{})[eqObj.k]||{}; if(pr.base==null||pr.base==="") return; const venta=n(pr.base)+adicPorCont(surOfOld(o.navScac,tlDe(r)),eqObj,dir)+n(pr.profit); target[ri+"|"+oi+"|"+eqObj.k]=venta; }); }); });
      // 2) cambiar el recargo (clave) en los bloques scac×tl permitidos
      let toco=false;
      (st.quoteNav||[]).forEach(q=>{ if(q.scac!==scac) return; if(tlsPermitidos && !tlsPermitidos.has(q.tl||"")) return; (q.surcharges||[]).forEach(s=>{ if(String(s.c||"").toUpperCase()===cl){ s.monto=String(nuevoMonto!=null?nuevoMonto:s.monto); if(montosLimpio) s.montos={...montosLimpio}; else if(nuevosMontos!==undefined) s.montos=null; toco=true; } }); });
      if(!toco){ errores.push((st.codigo||vid)+": sin esa clave"); continue; }
      // 3) reajustar profit para conservar cada venta
      const surOfNew=mkSurOf(st);
      (st.rutas||[]).forEach((r,ri)=>{ (r.opciones||[]).forEach((o,oi)=>{ eqs.forEach(eqObj=>{ const pr=(o.precios||{})[eqObj.k]; if(!pr||pr.base==null||pr.base==="") return; const t=target[ri+"|"+oi+"|"+eqObj.k]; if(t==null) return; const nuevoProfit=t-n(pr.base)-adicPorCont(surOfNew(o.navScac,tlDe(r)),eqObj,dir); pr.profit=String(Math.round(nuevoProfit)); }); }); });
      const stState={ versionId:vid, codigo:st.codigo, cliente:st.cliente, clienteNombre:st.clienteNombre, modo:st.modo, direccion:dir, tradelane:st.tradelane, commodity:st.commodity, commodity_id:st.commodity_id||null, vigDesde:st.vigDesde, vigHasta:st.vigHasta, notas:st.notas, origen:"cero", equipos:st.equipos, rutas:st.rutas, quoteNav:st.quoteNav };
      await saveCotizacion(stState, { tipo:"propagacion", origen:origenFolio||null });
      aplicados+= selRutas?selRutas.length:1;
    }catch(ex){ errores.push(vid+": "+ex.message); }
  }
  return { aplicados, errores };
}

export async function reporteFletesEnCotizaciones(){
  const { data: vers, error } = await supabase.from("versiones")
    .select("id,codigo,amendment,direccion,commodity,tradelane,estatus,updated_at,vig_desde,vig_hasta,acuerdos(no_acuerdo,modo,clientes(nombre))")
    .order("updated_at",{ascending:false}).limit(3000);
  if(error) return { rows:[], error:error.message };
  const rows=[];
  for(const v of (vers||[])){
    let st; try{ st=await loadVersion(v.id); }catch(_){ continue; }
    if(!st) continue;
    const dir=st.direccion||"E";
    const surOf=mkSurOf(st);
    const equiposV=st.equipos&&st.equipos.length?st.equipos:["20DV"];
    (st.rutas||[]).forEach(r=>{
      equiposV.forEach(ek=>{
        const eqObj=eqMeta(ek); if(!eqObj) return;
        const oi=opcionActivaEq(r,ek,eqObj,dir,surOf);
        const o=(r.opciones||[])[oi]; if(!o) return;
        const pr=(o.precios||{})[ek]||{}; const base=n(pr.base); if(base===0) return;   // ese equipo no se cotizó
        const recargos=adicPorCont(surOf(o.navScac,tlDe(r)),eqObj,dir);
        const costoTotal=base+recargos;
        const ventaAnc=(r.ventaAncla&&r.ventaAncla[ek]!=null)?Number(r.ventaAncla[ek]):null;
        const venta=ventaAnc!=null?ventaAnc:(costoTotal+n(pr.profit));
        const profit=venta-costoTotal;
        rows.push({
          cliente:v.acuerdos?.clientes?.nombre||st.clienteNombre||"", no_acuerdo:v.acuerdos?.no_acuerdo||st.no_acuerdo||"", modo:v.acuerdos?.modo||st.modo||"",
          codigo:v.codigo||"", am:v.amendment?("AM"+v.amendment):"", direccion:v.direccion, tradelane:v.tradelane||"", producto:v.commodity||"",
          origen:r.origen||"", pol:r.pol||"", pod:r.pod||"", destino:r.destino||"", equipo:ek,
          naviera:o.navScac||"", flete_base:base, recargos, profit, tarifa_cliente:venta, transito:o.transito,
          vig_desde:r.validez_desde||v.vig_desde||null, vig_hasta:r.validez_hasta||v.vig_hasta||null,
          estatus:v.estatus, updated_at:v.updated_at
        });
      });
    });
  }
  return { rows };
}

// ===========================================================================
// TARIFAS VIGENTES — solo AM "enviada" oficiales.
// Por cada contrato macro (acuerdo): si tiene enviada(s) vigente(s) hoy, se
// muestran esas; si NO hay vigente pero sí una enviada vencida, se muestra la
// última vencida marcada "Vencida" (para saber que el cliente ya no tiene tarifa).
// Borradores y reemplazadas se ignoran.
// Cada fila: ruta × equipo, con costo total (base+recargos) de la naviera elegida
// y de la segunda opción más barata.
// ===========================================================================
export async function tarifasVigentes(){
  const hoy=(()=>{ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); })();
  const { data: vers, error } = await supabase.from("versiones")
    .select("id,codigo,amendment,direccion,commodity,tradelane,estatus,updated_at,vig_desde,vig_hasta,acuerdo_id,acuerdos(no_acuerdo,clientes(nombre))")
    .in("estatus",["enviada","superseded"]).order("updated_at",{ascending:false}).limit(3000);
  if(error) return { rows:[], error:error.message };
  const futura=(v)=> v.vig_desde && v.vig_desde>hoy;
  const venc=(v)=> v.vig_hasta && v.vig_hasta<hoy;
  const cubreHoy=(v)=> !futura(v)&&!venc(v);
  // agrupar por acuerdo y elegir qué versiones incluir
  const porAcuerdo={}; (vers||[]).forEach(v=>{ const k=v.acuerdo_id||("v:"+v.id); (porAcuerdo[k]=porAcuerdo[k]||[]).push(v); });
  const elegidas=[];
  Object.values(porAcuerdo).forEach(arr=>{
    const vig=arr.filter(cubreHoy);                                   // cubren hoy (enviada o reemplazada aún válida)
    const fut=arr.filter(v=>v.estatus==="enviada"&&futura(v));        // enviadas que empiezan a futuro
    if(vig.length||fut.length){
      vig.forEach(v=>elegidas.push({v,estado:"Vigente"}));
      fut.forEach(v=>elegidas.push({v,estado:"Próxima"}));
    } else {
      const env=arr.filter(v=>v.estatus==="enviada");                 // fallback: última enviada vencida
      if(env.length) elegidas.push({v:env[0],estado:"Vencida"});
    }
  });
  const dir0=(d)=>d||"E";
  const rows=[]; const equiposUsados=new Set();
  for(const {v,estado} of elegidas){
    let st; try{ st=await loadVersion(v.id); }catch(_){ continue; }
    if(!st) continue;
    const dir=dir0(st.direccion);
    const surOf=mkSurOf(st);
    const scope=(r)=>((r.origen?"DR":"CY")+"-"+(r.destino?"DR":"CY"));
    (st.rutas||[]).forEach(r=>{
      const equiposV=st.equipos&&st.equipos.length?st.equipos:["20DV"];
      const eq={}; let tt="";
      equiposV.forEach(ek=>{
        const eqObj=eqMeta(ek);
        const totales=(r.opciones||[]).map((o,i)=>{ const pr=(o.precios||{})[ek]||{}; const b=n(pr.base); if(b===0) return null; const total=b+adicPorCont(surOf(o.navScac,tlDe(r)),eqObj,dir); return {i,scac:o.navScac||"",total,prof:n(pr.profit)}; }).filter(Boolean);
        if(!totales.length) return;   // ese tamaño no se cotizó -> no sale columna con dato
        const oiSel=opcionActivaEq(r,ek,eqObj,dir,surOf);
        const sel=totales.find(t=>t.i===oiSel)||totales.slice().sort((a,b)=>a.total-b.total)[0];
        const ventaAnc=(r.ventaAncla&&r.ventaAncla[ek]!=null)?Number(r.ventaAncla[ek]):null;
        const venta=ventaAnc!=null?ventaAnc:(sel.total+sel.prof);
        eq[ek]={costo:sel.total,profit:venta-sel.total,venta,scac:sel.scac};
        equiposUsados.add(ek);
        if(!tt) tt=((r.opciones||[])[sel.i]||{}).transito||"";
      });
      if(!Object.keys(eq).length) return;   // ruta sin ningún equipo cotizado -> se omite
      rows.push({
        cliente:st.clienteNombre||"", no_acuerdo:v.acuerdos?.no_acuerdo||st.no_acuerdo||"",
        folio:v.codigo||st.codigo||"", am:v.amendment?("AM"+v.amendment):"", direccion:dir, tradelane:st.tradelane||"", producto:st.commodity||"",
        origen:r.origen||"", pre:r.precarriage_mode||"", pol:r.pol||"", pod:r.pod||"", destino:r.destino||"", on:r.oncarriage_mode||"",
        srvc:scope(r), tt, eq,
        vig_desde:v.vig_desde||st.vigDesde||null, vig_hasta:v.vig_hasta||st.vigHasta||null,
        estado
      });
    });
  }
  const EQ_ORDER=["20DV","40DV","40HC","45HC","20RF","40RF","40HCRF","20OT","40OT","20FR","40FR","20PL","40PL","20TK","BB"];
  const equipos=EQ_ORDER.filter(k=>equiposUsados.has(k));
  return { rows, equipos };
}
