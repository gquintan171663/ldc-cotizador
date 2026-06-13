import * as XLSX from "xlsx";

// ====== Catálogo de recargos (74 claves) ======
const CATALOG = [{"c": "BAF", "d": "Bunker Adjustment Factor", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Fuel"}, {"c": "EBS", "d": "Emergency Bunker Surcharge", "n": ["CMA", "Hapag", "MSC"], "g": "Fuel"}, {"c": "LSS", "d": "Low Sulphur Surcharge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Fuel"}, {"c": "MFR", "d": "Marine Fuel Recovery", "n": ["Maersk"], "g": "Fuel"}, {"c": "EFF", "d": "Environmental Fuel Fee", "n": ["Maersk"], "g": "Fuel"}, {"c": "ETS", "d": "EU Emissions Trading System Surcharge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Regulatory"}, {"c": "GHG", "d": "Greenhouse Gas Surcharge", "n": ["CMA", "Hapag"], "g": "Regulatory"}, {"c": "PSS", "d": "Peak Season Surcharge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Commercial"}, {"c": "GRI", "d": "General Rate Increase", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Commercial"}, {"c": "PCS", "d": "Port Congestion Surcharge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Port"}, {"c": "ECS", "d": "Emergency Congestion Surcharge", "n": ["CMA", "MSC"], "g": "Port"}, {"c": "THC", "d": "Terminal Handling Charge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Port"}, {"c": "OHC", "d": "Origin Handling Charge", "n": ["Hapag", "Maersk"], "g": "Port"}, {"c": "DHC", "d": "Destination Handling Charge", "n": ["Hapag", "Maersk"], "g": "Port"}, {"c": "ISPS", "d": "International Ship & Port Security Charge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Security"}, {"c": "SEC", "d": "Security Charge", "n": ["CMA", "Hapag", "MSC"], "g": "Security"}, {"c": "WRS", "d": "War Risk Surcharge", "n": ["CMA", "Hapag", "MSC"], "g": "Security"}, {"c": "ERS", "d": "Emergency Risk Surcharge", "n": ["Maersk"], "g": "Security"}, {"c": "CRS", "d": "Crisis Recovery Surcharge", "n": ["CMA", "MSC"], "g": "Security"}, {"c": "PCC", "d": "Panama Canal Charge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Canal"}, {"c": "PCS-PAN", "d": "Panama Canal Surcharge", "n": ["CMA", "Hapag", "MSC"], "g": "Canal"}, {"c": "SCS", "d": "Suez Canal Surcharge", "n": ["CMA", "Hapag", "MSC"], "g": "Canal"}, {"c": "CAF", "d": "Currency Adjustment Factor", "n": ["CMA", "Hapag", "MSC"], "g": "Financial"}, {"c": "CIC", "d": "Container Imbalance Charge", "n": ["CMA", "Hapag", "MSC"], "g": "Equipment"}, {"c": "EQB", "d": "Equipment Balance Charge", "n": ["Maersk"], "g": "Equipment"}, {"c": "EIS", "d": "Equipment Imbalance Surcharge", "n": ["CMA", "Hapag"], "g": "Equipment"}, {"c": "ECR", "d": "Equipment Repositioning Charge", "n": ["CMA", "Hapag", "MSC"], "g": "Equipment"}, {"c": "OWS", "d": "Overweight Surcharge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Cargo"}, {"c": "HWS", "d": "Heavy Weight Surcharge", "n": ["CMA", "Hapag"], "g": "Cargo"}, {"c": "REEF", "d": "Reefer Service Charge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Reefer"}, {"c": "RMC", "d": "Reefer Monitoring Charge", "n": ["CMA", "Hapag", "MSC"], "g": "Reefer"}, {"c": "PHR", "d": "Plug-In / Power Charge Reefer", "n": ["CMA", "Hapag", "MSC"], "g": "Reefer"}, {"c": "GENS", "d": "Generator Set Charge", "n": ["CMA", "Hapag", "MSC"], "g": "Reefer"}, {"c": "DOC", "d": "Documentation Fee", "n": ["CMA", "Hapag", "MSC"], "g": "Documentation"}, {"c": "BLF", "d": "Bill of Lading Fee", "n": ["CMA", "Hapag", "MSC"], "g": "Documentation"}, {"c": "BLC", "d": "Bill of Lading Correction Fee", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Documentation"}, {"c": "ODF", "d": "Origin Documentation Fee", "n": ["Maersk"], "g": "Documentation"}, {"c": "DDF", "d": "Destination Documentation Fee", "n": ["Maersk"], "g": "Documentation"}, {"c": "AMS", "d": "Automated Manifest System Filing", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Regulatory"}, {"c": "ENS", "d": "Entry Summary Declaration", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Regulatory"}, {"c": "ACI", "d": "Advance Commercial Information", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Regulatory"}, {"c": "AFR", "d": "Advance Filing Rules", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Regulatory"}, {"c": "VGM", "d": "Verified Gross Mass Fee", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Regulatory"}, {"c": "SEAL", "d": "Seal Fee", "n": ["CMA", "Hapag", "MSC"], "g": "Documentation"}, {"c": "SPLT", "d": "Split Booking Fee", "n": ["CMA", "Hapag"], "g": "Customer Service"}, {"c": "RLS", "d": "Release Fee", "n": ["CMA", "Hapag", "MSC"], "g": "Documentation"}, {"c": "D/O", "d": "Delivery Order Fee", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Documentation"}, {"c": "DEM", "d": "Demurrage", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Equipment"}, {"c": "DET", "d": "Detention", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Equipment"}, {"c": "D&D", "d": "Combined Demurrage & Detention", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Equipment"}, {"c": "STO", "d": "Storage Charge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Port"}, {"c": "RAIL", "d": "Rail Surcharge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Inland"}, {"c": "IPI", "d": "Inland Point Intermodal Charge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Inland"}, {"c": "FAF", "d": "Fuel Adjustment Factor (Inland)", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Inland"}, {"c": "BUC", "d": "Bunker Charge Inland Haulage", "n": ["CMA", "Hapag"], "g": "Inland"}, {"c": "CHA", "d": "Chassis Fee", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Inland"}, {"c": "PTF", "d": "Port Facility Charge", "n": ["CMA", "Hapag", "MSC"], "g": "Port"}, {"c": "WHF", "d": "Wharfage Fee", "n": ["CMA", "Hapag", "MSC"], "g": "Port"}, {"c": "PEF", "d": "Port Enhancement Fee", "n": ["CMA", "MSC"], "g": "Port"}, {"c": "LFD", "d": "Late Free Day Charge", "n": ["CMA", "Hapag"], "g": "Equipment"}, {"c": "NO-SHOW", "d": "No Show Fee", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Customer Service"}, {"c": "ROLL", "d": "Roll-over Fee", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Customer Service"}, {"c": "CAN", "d": "Cancellation Fee", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Customer Service"}, {"c": "AMEND", "d": "Amendment Fee", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Customer Service"}, {"c": "BKG", "d": "Booking Fee", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Customer Service"}, {"c": "COD", "d": "Change of Destination", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Customer Service"}, {"c": "COR", "d": "Change of Route", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Customer Service"}, {"c": "IMO", "d": "Dangerous Goods Surcharge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Special Cargo"}, {"c": "DG DOC", "d": "Dangerous Goods Documentation Fee", "n": ["CMA", "Hapag", "MSC"], "g": "Special Cargo"}, {"c": "SURCH DG", "d": "Hazardous Cargo Surcharge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Special Cargo"}, {"c": "FLEX", "d": "Flexibag Handling Charge", "n": ["CMA", "Hapag"], "g": "Special Cargo"}, {"c": "OOG", "d": "Out of Gauge Surcharge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Special Cargo"}, {"c": "BBK", "d": "Breakbulk Surcharge", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Special Cargo"}, {"c": "SOC", "d": "Shipper Owned Container Administration Fee", "n": ["CMA", "Hapag", "Maersk", "MSC"], "g": "Equipment"}];
export { CATALOG };

// ====== Equipos con factor TEU (cat:Dry/Reefer/Special) ======
export const EQUIPOS=[
  {k:"20DV",t:"20' DV",teu:1,cat:"Dry"},{k:"40DV",t:"40' DV",teu:2,cat:"Dry"},{k:"40HC",t:"40' HC",teu:2,cat:"Dry"},
  {k:"45HC",t:"45' HC",teu:2,cat:"Dry"},
  {k:"20RF",t:"20' RF",teu:1,cat:"Reefer"},{k:"40RF",t:"40' RF",teu:2,cat:"Reefer"},{k:"40HCRF",t:"40' HC RF",teu:2,cat:"Reefer"},
  {k:"20OT",t:"20' OT",teu:1,cat:"Special"},{k:"40OT",t:"40' OT",teu:2,cat:"Special"},
  {k:"20FR",t:"20' FR",teu:1,cat:"Special"},{k:"40FR",t:"40' FR",teu:2,cat:"Special"},
  {k:"20PL",t:"20' PL",teu:1,cat:"Special"},{k:"40PL",t:"40' PL",teu:2,cat:"Special"},
  {k:"20TK",t:"20' TK",teu:1,cat:"Special"},
  {k:"BB",t:"Break Bulk",teu:1,cat:"Special"},
];
export const EQUIPO_CATS=["Dry","Reefer","Special"];
export const eqMeta=(k)=>EQUIPOS.find(e=>e.k===k)||{k,t:k,teu:1};

// ====== Catálogo de navieras (SCAC verificados) ======
export const NAVIERAS=[
  {scac:"MAEU",nombre:"Maersk"},{scac:"MSCU",nombre:"MSC — Mediterranean Shipping Co."},
  {scac:"CMDU",nombre:"CMA CGM"},{scac:"HLCU",nombre:"Hapag-Lloyd"},
  {scac:"COSU",nombre:"COSCO Shipping Lines"},{scac:"ONEY",nombre:"ONE — Ocean Network Express"},
  {scac:"EGLV",nombre:"Evergreen Line"},{scac:"YMLU",nombre:"Yang Ming"},
  {scac:"HDMU",nombre:"HMM — Hyundai"},{scac:"ZIMU",nombre:"ZIM"},
  {scac:"OOLU",nombre:"OOCL"},{scac:"WHLC",nombre:"Wan Hai Lines"},
  {scac:"SUDU",nombre:"Hamburg Süd"},{scac:"MATS",nombre:"Matson"},{scac:"SMLU",nombre:"Seaboard Marine"},
];
export const navName=(scac)=>(NAVIERAS.find(n=>n.scac===scac)||{}).nombre||scac;

// Abreviaturas usadas por Pricing -> SCAC
export const SCAC_MAP={HL:"HLCU",HAPAG:"HLCU","HAPAG-LLOYD":"HLCU",CMA:"CMDU","CMA CGM":"CMDU",CMACGM:"CMDU",MSC:"MSCU",MSK:"MAEU",MAERSK:"MAEU",MAE:"MAEU",COSCO:"COSU",COS:"COSU",ONE:"ONEY",EGL:"EGLV",EVERGREEN:"EGLV",YML:"YMLU","YANG MING":"YMLU",HMM:"HDMU",ZIM:"ZIMU",OOCL:"OOLU",WHL:"WHLC","WAN HAI":"WHLC",HBS:"SUDU","HAMBURG SUD":"SUDU","HAMBURG SÜD":"SUDU",SEABOARD:"SMLU",SML:"SMLU"};
// Limpia el string del carrier (quita "(Contrato)", guiones, etc.) y mapea a SCAC
export const cleanCarrier=(a)=>{ if(a==null) return ""; let s=String(a).split("(")[0].trim().toUpperCase(); return s; };
export const toScac=(a)=>{ const k=cleanCarrier(a); if(!k) return ""; return SCAC_MAP[k]||k; };
export const isKnownScac=(s)=>!!NAVIERAS.find(n=>n.scac===s);

// ====== Paleta ADN LDC ======
export const C={red:"#C8202E",ink:"#1A1A1A",slate:"#1F2D3A",label:"#7A8794",sep:"#EEF1F4",sep2:"#E4E8EC",soft:"#F7F8FA",green:"#0B7A3B",greenBg:"#E8F5EC",greenBd:"#BFE3CB",redSoft:"#FCEEF0",redBd:"#F0C9CD"};
export const F="Arial, Helvetica, sans-serif";

// ====== Lógica de costo (espejo de Supabase) ======
export const tx=(s)=>(s||"").trim();
export function scopeFull(l){const oPre=tx(l.origen)!=="",oOn=tx(l.destino)!=="";const left=oPre?"DR"+(tx(l.precarriage_mode)?"·"+tx(l.precarriage_mode):""):"CY";const right=oOn?"DR"+(tx(l.oncarriage_mode)?"·"+tx(l.oncarriage_mode):""):"CY";return left+"-"+right;}
export const n=(v)=>{const x=parseFloat(v);return isFinite(x)?x:0;};
export const adicPorCont=(surs,teu)=>(surs||[]).filter(s=>!s.incluido&&s.pago==="prepaid").reduce((a,s)=>{const bas=s.basis||"contenedor";if(bas==="bl")return a;return a+n(s.monto)*(bas==="teu"?teu:1);},0);
export const cargosBL=(surs)=>(surs||[]).filter(s=>!s.incluido&&s.pago==="prepaid"&&(s.basis||"contenedor")==="bl").reduce((a,s)=>a+n(s.monto),0);
export const subjectTo=(surs)=>(surs||[]).filter(s=>!s.incluido).map(s=>s.c);
// Monto de recargos INCLUIDOS por contenedor (informativo; ya van en la base)
export const inclPorCont=(surs,teu)=>(surs||[]).filter(s=>s.incluido).reduce((a,s)=>{const bas=s.basis||"contenedor";if(bas==="bl")return a;return a+n(s.monto)*(bas==="teu"?teu:1);},0);
export const inclBL=(surs)=>(surs||[]).filter(s=>s.incluido&&(s.basis||"contenedor")==="bl").reduce((a,s)=>a+n(s.monto),0);
// Formato de dinero con signo $ (USD -> "$1,234" · otras -> "$1,234 MXN")
export const money=(v,m="USD")=>{const num=Number(v||0).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:2});return m==="USD"?("$"+num):("$"+num+" "+m);};

// ====== Parser del Excel maestro de Pricing ======
const _norm=(s)=>String(s==null?"":s).trim().toLowerCase().replace(/\s+/g," ").replace(/[´’]/g,"'");
export function parseWorkbook(buf){
  const wb=XLSX.read(buf,{type:"array"});
  const recs=[]; const sheets=[]; let warns=0;
  wb.SheetNames.forEach(sn=>{
    const aoa=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true});
    let hi=-1; for(let i=0;i<15&&i<aoa.length;i++){const row=(aoa[i]||[]).map(_norm);if(row.includes("customer")){hi=i;break;}}
    if(hi<0){sheets.push({sn,n:0,nohdr:true});return;}
    const hdr=aoa[hi];const idx={};hdr.forEach((h,i)=>{const k=_norm(h);if(k&&idx[k]==null)idx[k]=i;});
    const pick=(...nm)=>{for(const x of nm){if(idx[x]!=null)return idx[x];}return -1;};
    const bests=[];hdr.forEach((h,i)=>{if(_norm(h)==="best cost")bests.push(i);});
    const cm={cust:pick("customer"),com:pick("commodity"),ori:pick("origin"),pol:pick("pol"),dest:pick("destination"),mode:pick("transp. mode","transp mode"),svc:pick("service"),exp:pick("expire date"),tr20:pick("total rate 20'","total rate 20"),tr40:pick("total rate 40'","total rate 40"),note:pick("note")};
    const b20=bests[0],b40=bests[1];
    let cnt=0; let lastCust="", lastCom="";
    for(let r=hi+1;r<aoa.length;r++){
      const row=aoa[r];if(!row)continue;
      // Arrastre de cliente: en los Excel de Pricing el nombre va sólo en la 1ª fila del bloque
      const rawCust=cm.cust>=0?row[cm.cust]:null; const cu=(rawCust==null?"":String(rawCust).trim());
      if(cu){ lastCust=cu; lastCom=""; }   // nuevo bloque de cliente -> reinicia commodity arrastrado
      const cust=cu||lastCust; if(!cust) continue;
      // Arrastre de commodity dentro del mismo cliente
      const rawCom=cm.com>=0?row[cm.com]:null; const co=(rawCom==null?"":String(rawCom).trim());
      if(co) lastCom=co; const com=co||lastCom;
      // ¿La fila tiene datos reales? (ruta o algún costo) — evita filas separadoras vacías
      const filled=(ci)=>ci!=null&&ci>=0&&row[ci]!=null&&String(row[ci]).trim()!=="";
      const hasData=filled(cm.pol)||filled(cm.dest)||filled(cm.ori)||filled(cm.tr20)||filled(cm.tr40)||(b20!=null&&filled(b20))||(b40!=null&&filled(b40));
      if(!hasData) continue;
      const svc=row[cm.svc];const side=(t)=>(String(t||"").trim().toUpperCase().startsWith("D"))?"DR":"CY";
      const sp=String(svc||"").split("/");const scope=side(sp[0])+"-"+side(sp[1]||"");
      const num=(v)=>{const x=parseFloat(v);return isFinite(x)?x:null;};
      const tr20=num(row[cm.tr20]),tr40=num(row[cm.tr40]);
      const best20=b20!=null?num(row[b20]):null,bn20=b20!=null?toScac(row[b20+1]):"";
      const best40=b40!=null?num(row[b40]):null,bn40=b40!=null?toScac(row[b40+1]):"";
      const noteScac=toScac(row[cm.note]);
      const cost20=best20!=null?best20:tr20, nav20=best20!=null?bn20:(noteScac||"");
      const cost40=best40!=null?best40:tr40, nav40=best40!=null?bn40:(noteScac||"");
      const w=[];
      if(cost20==null&&cost40==null)w.push("sin costo");
      [ {raw:b20!=null?row[b20+1]:null,s:nav20}, {raw:b40!=null?row[b40+1]:null,s:nav40} ].forEach(o=>{ if(o.raw&&!isKnownScac(o.s)) w.push("naviera '"+o.raw+"' sin SCAC"); });
      if(w.length)warns++;
      recs.push({sheet:sn,cust:cust,com:com||"",ori:row[cm.ori]||"",pol:row[cm.pol]||"",dest:row[cm.dest]||"",mode:row[cm.mode]||"",svc,scope,exp:row[cm.exp]||null,cost20,nav20,cost40,nav40,note:row[cm.note]||"",w});
      cnt++;
    }
    sheets.push({sn,n:cnt});
  });
  return {recs,sheets,warns};
}

// ====== Catálogo de commodities (taxonomía marítima) ======
export const COMMODITIES=[
 {ind:"Agriculture",com:"Agriculture & Agribusiness"},
 {ind:"Agriculture",com:"Fresh Produce"},
 {ind:"Food",com:"Food & Beverage"},
 {ind:"Food",com:"Reefer Cargo"},
 {ind:"Food",com:"Seafood"},
 {ind:"Automotive",com:"Automotive OEM"},
 {ind:"Automotive",com:"Automotive Aftermarket"},
 {ind:"Automotive",com:"Electric Vehicles & Batteries"},
 {ind:"Industrial",com:"Electronics"},
 {ind:"Industrial",com:"Electrical Equipment"},
 {ind:"Industrial",com:"Industrial Machinery"},
 {ind:"Industrial",com:"Construction & Infrastructure"},
 {ind:"Energy",com:"Oil & Gas Equipment"},
 {ind:"Energy",com:"Renewable Energy"},
 {ind:"Chemical",com:"Chemicals"},
 {ind:"Chemical",com:"Petrochemicals"},
 {ind:"Chemical",com:"Plastics & Resins"},
 {ind:"Healthcare",com:"Pharmaceuticals"},
 {ind:"Healthcare",com:"Healthcare & Medical Devices"},
 {ind:"Consumer",com:"Consumer Goods (FMCG)"},
 {ind:"Retail",com:"Retail"},
 {ind:"Retail",com:"E-Commerce"},
 {ind:"Consumer",com:"Textiles"},
 {ind:"Consumer",com:"Apparel & Fashion"},
 {ind:"Consumer",com:"Footwear"},
 {ind:"Consumer",com:"Furniture"},
 {ind:"Consumer",com:"Home Appliances"},
 {ind:"Industrial",com:"Paper & Packaging"},
 {ind:"Industrial",com:"Forest Products"},
 {ind:"Industrial",com:"Metals"},
 {ind:"Industrial",com:"Non-Ferrous Metals"},
 {ind:"Industrial",com:"Steel Products"},
 {ind:"Industrial",com:"Mining & Minerals"},
 {ind:"Consumer",com:"Luxury Goods"},
 {ind:"Consumer",com:"Toys & Leisure"},
 {ind:"Consumer",com:"Sports & Fitness"},
 {ind:"Consumer",com:"Cosmetics & Personal Care"},
 {ind:"Chemical",com:"Dangerous Goods (DG)"},
 {ind:"Industrial",com:"Project Cargo"},
 {ind:"Industrial",com:"Recycling Materials"}
];
export const COMMODITY_INDUSTRIAS=[...new Set(COMMODITIES.map(c=>c.ind))];
// Alias de strings que usa Pricing en el Excel -> commodity canónico
export const COMMODITY_ALIAS={"metal scrap":"Recycling Materials","scrap":"Recycling Materials","steel":"Steel Products","aluminio":"Non-Ferrous Metals"};
const _normc=(s)=>String(s||"").trim().toLowerCase();
// Devuelve {com,ind} canónico o null
export function matchCommodity(raw){
  const k=_normc(raw); if(!k) return null;
  let hit=COMMODITIES.find(c=>_normc(c.com)===k);
  if(hit) return hit;
  const al=COMMODITY_ALIAS[k];
  if(al){ hit=COMMODITIES.find(c=>c.com===al); if(hit) return hit; }
  return null;
}

// ====== Catálogo de PUERTOS marítimos (UN/LOCODE) para POL/POD ======
// Set base de los puertos más usados; ampliable. {code, name, country}
export const PUERTOS=[
 // México
 {code:"MXZLO",name:"Manzanillo",country:"MX"},{code:"MXLZC",name:"Lázaro Cárdenas",country:"MX"},
 {code:"MXVER",name:"Veracruz",country:"MX"},{code:"MXATM",name:"Altamira",country:"MX"},
 {code:"MXTAM",name:"Tampico",country:"MX"},{code:"MXTUX",name:"Tuxpan",country:"MX"},
 {code:"MXESE",name:"Ensenada",country:"MX"},{code:"MXMZT",name:"Mazatlán",country:"MX"},
 {code:"MXPGO",name:"Progreso",country:"MX"},{code:"MXCOA",name:"Coatzacoalcos",country:"MX"},
 {code:"MXGYM",name:"Guaymas",country:"MX"},
 // Estados Unidos
 {code:"USHOU",name:"Houston, TX",country:"US"},{code:"USLAX",name:"Los Angeles, CA",country:"US"},
 {code:"USLGB",name:"Long Beach, CA",country:"US"},{code:"USNYC",name:"New York/Newark, NJ",country:"US"},
 {code:"USSAV",name:"Savannah, GA",country:"US"},{code:"USCHS",name:"Charleston, SC",country:"US"},
 {code:"USORF",name:"Norfolk, VA",country:"US"},{code:"USOAK",name:"Oakland, CA",country:"US"},
 {code:"USSEA",name:"Seattle, WA",country:"US"},{code:"USTIW",name:"Tacoma, WA",country:"US"},
 {code:"USBAL",name:"Baltimore, MD",country:"US"},{code:"USMIA",name:"Miami, FL",country:"US"},
 {code:"USMSY",name:"New Orleans, LA",country:"US"},{code:"USMOB",name:"Mobile, AL",country:"US"},
 {code:"USGLS",name:"Galveston, TX",country:"US"},{code:"USPHL",name:"Philadelphia, PA",country:"US"},
 {code:"USJAX",name:"Jacksonville, FL",country:"US"},{code:"USBOS",name:"Boston, MA",country:"US"},
 {code:"USILM",name:"Wilmington, NC",country:"US"},
 // Canadá
 {code:"CAVAN",name:"Vancouver",country:"CA"},{code:"CAMTR",name:"Montreal",country:"CA"},
 {code:"CAPRR",name:"Prince Rupert",country:"CA"},{code:"CAHAL",name:"Halifax",country:"CA"},
 // Asia
 {code:"CNSHA",name:"Shanghai",country:"CN"},{code:"CNNGB",name:"Ningbo",country:"CN"},
 {code:"CNSZX",name:"Shenzhen/Yantian",country:"CN"},{code:"CNTAO",name:"Qingdao",country:"CN"},
 {code:"CNTXG",name:"Tianjin/Xingang",country:"CN"},{code:"CNCAN",name:"Guangzhou/Nansha",country:"CN"},
 {code:"CNXMN",name:"Xiamen",country:"CN"},{code:"HKHKG",name:"Hong Kong",country:"HK"},
 {code:"KRPUS",name:"Busan",country:"KR"},{code:"TWKHH",name:"Kaohsiung",country:"TW"},
 {code:"SGSIN",name:"Singapore",country:"SG"},{code:"MYPKG",name:"Port Klang",country:"MY"},
 {code:"MYTPP",name:"Tanjung Pelepas",country:"MY"},{code:"THLCH",name:"Laem Chabang",country:"TH"},
 {code:"VNSGN",name:"Ho Chi Minh/Cat Lai",country:"VN"},{code:"VNHPH",name:"Hai Phong",country:"VN"},
 {code:"IDJKT",name:"Jakarta/Tanjung Priok",country:"ID"},{code:"INNSA",name:"Nhava Sheva",country:"IN"},
 {code:"INMUN",name:"Mundra",country:"IN"},{code:"INMAA",name:"Chennai",country:"IN"},
 {code:"LKCMB",name:"Colombo",country:"LK"},{code:"JPTYO",name:"Tokyo",country:"JP"},
 {code:"JPYOK",name:"Yokohama",country:"JP"},{code:"JPNGO",name:"Nagoya",country:"JP"},
 {code:"JPUKB",name:"Kobe",country:"JP"},
 // Europa
 {code:"NLRTM",name:"Rotterdam",country:"NL"},{code:"BEANR",name:"Antwerp",country:"BE"},
 {code:"DEHAM",name:"Hamburg",country:"DE"},{code:"DEBRV",name:"Bremerhaven",country:"DE"},
 {code:"FRLEH",name:"Le Havre",country:"FR"},{code:"ESVLC",name:"Valencia",country:"ES"},
 {code:"ESALG",name:"Algeciras",country:"ES"},{code:"ESBCN",name:"Barcelona",country:"ES"},
 {code:"ITGOA",name:"Genoa",country:"IT"},{code:"ITGIT",name:"Gioia Tauro",country:"IT"},
 {code:"GRPIR",name:"Piraeus",country:"GR"},{code:"GBFXT",name:"Felixstowe",country:"GB"},
 {code:"GBLGP",name:"London Gateway",country:"GB"},{code:"PLGDN",name:"Gdansk",country:"PL"},
 {code:"PTSIE",name:"Sines",country:"PT"},
 // Medio Oriente / África
 {code:"AEJEA",name:"Jebel Ali",country:"AE"},{code:"SAJED",name:"Jeddah",country:"SA"},
 {code:"SAKAC",name:"King Abdullah",country:"SA"},{code:"ZADUR",name:"Durban",country:"ZA"},
 {code:"MAPTM",name:"Tangier Med",country:"MA"},
 // Latinoamérica
 {code:"BRSSZ",name:"Santos",country:"BR"},{code:"ARBUE",name:"Buenos Aires",country:"AR"},
 {code:"COCTG",name:"Cartagena",country:"CO"},{code:"PECLL",name:"Callao",country:"PE"},
 {code:"CLSAI",name:"San Antonio",country:"CL"},{code:"ECGYE",name:"Guayaquil",country:"EC"},
 {code:"PABLB",name:"Balboa",country:"PA"},{code:"PAONX",name:"Colón",country:"PA"},
 {code:"JMKIN",name:"Kingston",country:"JM"},{code:"DOCAU",name:"Caucedo",country:"DO"},
 // Oceanía
 {code:"AUSYD",name:"Sydney",country:"AU"},{code:"AUMEL",name:"Melbourne",country:"AU"},
];
export const PAIS_NOMBRE={MX:"México",US:"Estados Unidos",CA:"Canadá",CN:"China",HK:"Hong Kong",KR:"Corea",TW:"Taiwán",SG:"Singapur",MY:"Malasia",TH:"Tailandia",VN:"Vietnam",ID:"Indonesia",IN:"India",LK:"Sri Lanka",JP:"Japón",NL:"Países Bajos",BE:"Bélgica",DE:"Alemania",FR:"Francia",ES:"España",IT:"Italia",GR:"Grecia",GB:"Reino Unido",PL:"Polonia",PT:"Portugal",AE:"EAU",SA:"Arabia Saudita",ZA:"Sudáfrica",MA:"Marruecos",BR:"Brasil",AR:"Argentina",CO:"Colombia",PE:"Perú",CL:"Chile",EC:"Ecuador",PA:"Panamá",JM:"Jamaica",DO:"Rep. Dominicana",AU:"Australia"};

// ====== Catálogo de CIUDADES (origen/destino puerta) ======
export const CIUDADES=[
 // México
 {city:"Monterrey",country:"MX"},{city:"Guadalajara",country:"MX"},{city:"Ciudad de México",country:"MX"},
 {city:"Saltillo",country:"MX"},{city:"Apodaca",country:"MX"},{city:"Escobedo",country:"MX"},
 {city:"San Nicolás de los Garza",country:"MX"},{city:"Santa Catarina",country:"MX"},{city:"García",country:"MX"},
 {city:"Puebla",country:"MX"},{city:"Coronango",country:"MX"},{city:"Querétaro",country:"MX"},
 {city:"Toluca",country:"MX"},{city:"León",country:"MX"},{city:"Aguascalientes",country:"MX"},
 {city:"San Luis Potosí",country:"MX"},{city:"Chihuahua",country:"MX"},{city:"Ciudad Juárez",country:"MX"},
 {city:"Tijuana",country:"MX"},{city:"Mexicali",country:"MX"},{city:"Hermosillo",country:"MX"},
 {city:"Torreón",country:"MX"},{city:"Durango",country:"MX"},{city:"Celaya",country:"MX"},
 {city:"Irapuato",country:"MX"},{city:"Morelia",country:"MX"},{city:"Veracruz",country:"MX"},
 {city:"Mérida",country:"MX"},{city:"Reynosa",country:"MX"},{city:"Matamoros",country:"MX"},
 {city:"Nuevo Laredo",country:"MX"},{city:"Ramos Arizpe",country:"MX"},{city:"El Salto",country:"MX"},
 // Estados Unidos
 {city:"Houston, TX",country:"US"},{city:"Laredo, TX",country:"US"},{city:"Dallas, TX",country:"US"},
 {city:"San Antonio, TX",country:"US"},{city:"Miami, FL",country:"US"},{city:"Chicago, IL",country:"US"},
 {city:"Los Angeles, CA",country:"US"},{city:"Atlanta, GA",country:"US"},{city:"Charlotte, NC",country:"US"},
 {city:"Detroit, MI",country:"US"},{city:"Newark, NJ",country:"US"},{city:"Spring, TX",country:"US"},
 {city:"Phoenix, AZ",country:"US"},{city:"El Paso, TX",country:"US"},
 // Canadá / otros
 {city:"Montreal",country:"CA"},{city:"Toronto",country:"CA"},{city:"Vancouver",country:"CA"},
 {city:"Shanghai",country:"CN"},{city:"Rotterdam",country:"NL"},{city:"Hamburg",country:"DE"},
];

// Helpers de búsqueda (devuelven opciones {v,label,sub})
const _up=(s)=>String(s||"").toUpperCase();
export const optPuertos=()=>PUERTOS.map(p=>({v:p.code,label:p.code+" · "+p.name,sub:(PAIS_NOMBRE[p.country]||p.country)}));
export const optCiudades=()=>CIUDADES.map(c=>({v:c.city+", "+c.country,label:c.city,sub:(PAIS_NOMBRE[c.country]||c.country)}));
export const puertoLabel=(code)=>{const p=PUERTOS.find(x=>x.code===_up(code));return p?(p.code+" · "+p.name):code;};

// ====== Derivación de país (para auto-poblar recargos por ruta similar) ======
export const paisDe=(v)=>{
  const s=String(v||"").trim(); if(!s) return "";
  const m=s.match(/,\s*([A-Za-z]{2})\s*$/); if(m) return m[1].toUpperCase();         // "Ciudad, MX"
  const up=s.toUpperCase();
  const p=PUERTOS.find(x=>x.code===up); if(p) return p.country;                       // código de puerto exacto
  if(/^[A-Z]{2}[A-Z0-9]{2,3}$/.test(up) && PAIS_NOMBRE[up.slice(0,2)]) return up.slice(0,2); // UN/LOCODE genérico
  const c=CIUDADES.find(x=>x.city.toUpperCase()===up); if(c) return c.country;        // ciudad por nombre
  return "";
};
export const paisOrigen=(r)=>paisDe(r.pol)||paisDe(r.origen);
export const paisDestino=(r)=>paisDe(r.pod)||paisDe(r.destino);
export const rutaPaisLabel=(o,d)=>((PAIS_NOMBRE[o]||o||"?")+" → "+(PAIS_NOMBRE[d]||d||"?"));
