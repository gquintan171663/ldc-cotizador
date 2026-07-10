import { supabase } from "./supabaseClient.js";
import { matchCommodity, paisDe, tlDe, n, adicPorCont, tx, eqMeta, prefijoCliente, numeroAcuerdo, hayCambioCosto } from "./lib.js";

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
  for(const r of rutas){
    for(const ek of equipos){
      let { data: lin, error: le } = await supabase.from("lineas")
        .insert({version_id:versionId,origen:r.origen||"",precarriage_mode:r.precarriage_mode||"",pol:r.pol||"",pod:r.pod||"",oncarriage_mode:r.oncarriage_mode||"",destino:r.destino||"",equipo:ek,validez_desde:vigDesde||null,validez_hasta:vigHasta||null,elegida_eq:r.elegidaEq||null})
        .select("id").single();
      if(le){ sum.errores.push("linea: "+le.message); continue; }
      sum.lineas++;
      let elegidaOpcionId=null;
      for(let oi=0; oi<r.opciones.length; oi++){
        const o=r.opciones[oi];
        const pr=(o.precios&&o.precios[ek])||{};
        let { data: opt, error: oe } = await supabase.from("opciones_costo")
          .insert({linea_id:lin.id,naviera:o.navScac||"",costo_base:parseFloat(pr.base)||0,profit:parseFloat(pr.profit)||0,transito_dias:parseInt(o.transito)||null,sugerida:(r.elegida??0)===oi})
          .select("id").single();
        if(oe){ sum.errores.push("opcion: "+oe.message); continue; }
        sum.opciones++;
        if((r.elegida??0)===oi) elegidaOpcionId=opt.id;
        const surs=surOf(o.navScac, tlDe(r));
        if(surs.length){
          const rows=surs.map((s,idx)=>({opcion_id:opt.id,clave:s.c||"",descripcion:s.d||"",monto:parseFloat(s.monto)||0,moneda:s.moneda||"USD",incluido:!!s.incluido,desplegar:s.desplegar!==false,pago:s.pago||"prepaid",basis:s.basis||"contenedor",montos:s.montos||null,orden:idx}));
          let { error: se } = await supabase.from("opcion_surcharges").insert(rows);
          if(se) sum.errores.push("surcharges: "+se.message); else sum.surcharges+=rows.length;
        }
      }
      if(elegidaOpcionId) await supabase.from("lineas").update({opcion_elegida_id:elegidaOpcionId}).eq("id",lin.id);
    }
  }
}

// ===== Control de cambios: diff legible de un amendment vs la versión anterior =====
const _rk=(r)=>((r.pol||r.origen||"?")+" → "+(r.pod||r.destino||"?"));
const _chosen=(r)=>((r.opciones||[])[r.elegida??0]||(r.opciones||[])[0]||{precios:{}});
export function resumenCambios(nuevo, previo){
  const out=[]; const nz=(v)=>String(v==null||v===""?0:v);
  if((nuevo.vigDesde||"")!==(previo.vigDesde||"")||(nuevo.vigHasta||"")!==(previo.vigHasta||""))
    out.push("Vigencia: "+(previo.vigDesde||"—")+" a "+(previo.vigHasta||"—")+"  ⇒  "+(nuevo.vigDesde||"—")+" a "+(nuevo.vigHasta||"—"));
  const rN={}, rP={};
  (nuevo.rutas||[]).forEach(r=>rN[_rk(r)]=r); (previo.rutas||[]).forEach(r=>rP[_rk(r)]=r);
  Object.keys(rN).forEach(k=>{ if(!rP[k]) out.push("Nueva ruta: "+k); });
  Object.keys(rP).forEach(k=>{ if(!rN[k]) out.push("Ruta eliminada: "+k); });
  Object.keys(rN).forEach(k=>{ if(!rP[k]) return; const on=_chosen(rN[k]), op=_chosen(rP[k]);
    if((on.navScac||"")!==(op.navScac||"")) out.push("Naviera "+k+": "+(op.navScac||"—")+" → "+(on.navScac||"—"));
    const eqs=new Set([...Object.keys(on.precios||{}),...Object.keys(op.precios||{})]);
    eqs.forEach(ek=>{ const pn=(on.precios||{})[ek]||{}, pp=(op.precios||{})[ek]||{};
      if(nz(pn.base)!==nz(pp.base)) out.push("Tarifa "+k+" ("+ek+") base: "+nz(pp.base)+" → "+nz(pn.base));
      if(nz(pn.profit)!==nz(pp.profit)) out.push("Tarifa "+k+" ("+ek+") profit: "+nz(pp.profit)+" → "+nz(pn.profit));
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

export async function saveCotizacion(state){
  const sum={versiones:0,lineas:0,opciones:0,surcharges:0,errores:[],codigo:null,versionId:null};
  const { versionId, cliente, clienteNombre, modo, direccion, commodity, commodity_id, origen, notas, tradelane, vigDesde, vigHasta } = state;

  if(versionId){
    // EDITAR borrador existente: actualiza versión y reemplaza hijos
    await supabase.from("versiones").update({direccion,commodity:commodity||"",commodity_id:commodity_id||null,notas:notas||null,tradelane:tradelane||null,vig_desde:parseDate(vigDesde),vig_hasta:parseDate(vigHasta)}).eq("id",versionId);
    await supabase.from("lineas").delete().eq("version_id",versionId); // cascade -> opciones + recargos
    sum.versionId=versionId; sum.codigo=state.codigo;
    await insertChildren(versionId, state, sum);
    // Control de cambios si es amendment (tiene reemplaza_a)
    try{
      const { data: vrow } = await supabase.from("versiones").select("reemplaza_a").eq("id",versionId).maybeSingle();
      if(vrow && vrow.reemplaza_a){
        const prev = await loadVersion(vrow.reemplaza_a);
        const cambios = resumenCambios(state, prev||{});
        await supabase.from("versiones").update({cambios}).eq("id",versionId);
        sum.cambios=cambios;
      }
    }catch(e){ /* el diff no debe romper el guardado */ }
    return sum;
  }

  // NUEVA cotización
  let acuerdo_id;
  let { data: acu } = await supabase.from("acuerdos").select("id").eq("cliente_id",cliente).eq("modo",modo).maybeSingle();
  if(acu) acuerdo_id=acu.id;
  else{
    const { no_acuerdo, prefijo, vig_desde, vig_hasta } = await nuevoNoAcuerdo(clienteNombre||cliente);
    let { data: ai, error } = await supabase.from("acuerdos").insert({no_acuerdo,prefijo,vig_desde,vig_hasta,cliente_id:cliente,modo}).select("id").single();
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
    .select("id,codigo,direccion,estatus,commodity,owner_email,updated_at,reemplaza_a,origen,acuerdos(modo,clientes(nombre,no_cliente)),lineas(validez_desde,validez_hasta)")
    .order("updated_at",{ascending:false}).limit(300);
  if(error) return { rows:[], error:error.message };
  return { rows:(data||[]).map(v=>{
    const l=(v.lineas||[]).find(x=>x.validez_desde||x.validez_hasta)||{};
    return {
      id:v.id, codigo:v.codigo, folio:(v.codigo||"")+(v.commodity?(" · "+v.commodity):""),
      cliente:v.acuerdos?.clientes?.nombre||"—", direccion:v.direccion, estatus:v.estatus,
      commodity:v.commodity, owner:v.owner_email, updated_at:v.updated_at, origen:v.origen, superseded_by:null,
      vigDesde:l.validez_desde||null, vigHasta:l.validez_hasta||null
    };
  }) };
}

// ===== Reconstruir el estado del cotizador desde una versión =====
export async function loadVersion(versionId){
  const { data: ver } = await supabase.from("versiones").select("*, acuerdos(id,no_acuerdo,modo,cliente_id,clientes(nombre))").eq("id",versionId).single();
  const { data: lineas } = await supabase.from("lineas").select("*").eq("version_id",versionId).order("created_at");
  const lids=(lineas||[]).map(l=>l.id);
  const { data: opciones } = lids.length ? await supabase.from("opciones_costo").select("*").in("linea_id",lids) : { data:[] };
  const oids=(opciones||[]).map(o=>o.id);
  const { data: surs } = oids.length ? await supabase.from("opcion_surcharges").select("*").in("opcion_id",oids).order("orden") : { data:[] };

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
    return {origen:l0.origen||"",precarriage_mode:l0.precarriage_mode||"",pol:l0.pol||"",pod:l0.pod||"",oncarriage_mode:l0.oncarriage_mode||"",destino:l0.destino||"",opciones:ops.length?ops:[{navScac:"",precios:{}}],elegida,elegidaEq:l0.elegida_eq||null};
  });
  const anyL=(lineas||[])[0]||{};
  return {
    versionId, codigo:ver.codigo, estatus:ver.estatus, acuerdo_id:ver.acuerdos?.id,
    no_acuerdo:ver.acuerdos?.no_acuerdo||"", tradelane:ver.tradelane||"", amendment:ver.amendment||1,
    cambios:ver.cambios||null, reemplaza_a:ver.reemplaza_a||null,
    cliente:ver.acuerdos?.cliente_id, clienteNombre:ver.acuerdos?.clientes?.nombre,
    modo:ver.acuerdos?.modo||"maritimo", direccion:ver.direccion,
    commodity:ver.commodity, commodity_id:ver.commodity_id, notas:ver.notas||"",
    vigDesde:anyL.validez_desde||"", vigHasta:anyL.validez_hasta||"",
    equipos:[...equiposSet], rutas:rutas.length?rutas:[], quoteNav:Object.values(quoteNavMap),
  };
}

export async function markEnviada(versionId){
  const res = await supabase.from("versiones").update({estatus:"enviada"}).eq("id",versionId);
  // Reglas de vigencia: si es amendment con cambio de costo, el AM anterior expira hoy y el nuevo arranca mañana (sin huecos ni empalmes).
  try{
    const { data: vrow } = await supabase.from("versiones").select("reemplaza_a").eq("id",versionId).maybeSingle();
    if(vrow && vrow.reemplaza_a){
      const cur = await loadVersion(versionId);
      const prev = await loadVersion(vrow.reemplaza_a);
      if(cur && prev && hayCambioCosto(cur, prev, cur.direccion||"E")){
        const hoy=new Date().toISOString().slice(0,10);
        const man=new Date(Date.now()+86400000).toISOString().slice(0,10);
        await supabase.from("versiones").update({vig_hasta:hoy}).eq("id",vrow.reemplaza_a);
        await supabase.from("lineas").update({validez_hasta:hoy}).eq("version_id",vrow.reemplaza_a);
        await supabase.from("versiones").update({vig_desde:man}).eq("id",versionId);
        await supabase.from("lineas").update({validez_desde:man}).eq("version_id",versionId);
      }
    }
  }catch(e){ /* el ajuste de vigencias no debe romper el envío */ }
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
  await supabase.from("versiones").update({estatus:"superseded"}).eq("id",versionId);
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
  const { versionId, vigDesde, vigHasta, rutas, equipos, quoteNav, direccion } = state;
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
    .select("pol,pod,validez_desde,validez_hasta,version_id,opcion_elegida_id,versiones(id,codigo,estatus,direccion,acuerdos(clientes(nombre)))")
    .eq("validez_desde", vigDesde||null).eq("validez_hasta", vigHasta||null).limit(500);
  if(!data || !data.length) return [];
  const lids=data.filter(l=>l.opcion_elegida_id).map(l=>l.opcion_elegida_id);
  const { data: ops } = lids.length ? await supabase.from("opciones_costo").select("id,costo_base,profit").in("id",lids) : { data:[] };
  const opMap={}; (ops||[]).forEach(o=>{ opMap[o.id]={base:n(o.costo_base),profit:n(o.profit)}; });
  // surcharges de esas opciones para sumar adicional
  const { data: surExist } = lids.length ? await supabase.from("opcion_surcharges").select("opcion_id,monto,incluido,pago,basis,montos").in("opcion_id",lids) : { data:[] };
  const surByOp={}; (surExist||[]).forEach(s=>{ (surByOp[s.opcion_id]=surByOp[s.opcion_id]||[]).push({monto:s.monto,incluido:s.incluido,pago:s.pago,basis:s.basis,montos:s.montos,c:""}); });
  const conflictos=[];
  for(const l of data){
    if(l.version_id===versionId) continue;
    const mine=rutasReq.find(x=>x.pol===l.pol && x.pod===l.pod);
    if(!mine) continue;
    const op=opMap[l.opcion_elegida_id]; if(!op) continue;
    const ventaExist=op.base+op.profit+adicPorCont(surByOp[l.opcion_elegida_id]||[],eqMeta("20DV"),l.versiones?.direccion||"E");
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
