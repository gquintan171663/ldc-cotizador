import React, { useState } from "react";
import ExcelJS from "exceljs";
import { C } from "./lib.js";
import { Btn } from "./ui.jsx";
import { tarifasVigentes } from "./db.js";

const hoyISO=()=>new Date().toISOString().slice(0,10);

export function TarifasVigentes(){
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");

  const bajar=async()=>{
    setBusy(true); setMsg("");
    let res; try{ res=await tarifasVigentes(); }catch(ex){ res={rows:[],error:ex.message}; }
    setBusy(false);
    if(res.error){ setMsg("Error: "+res.error); return; }
    if(!res.rows.length){ setMsg("No hay tarifas vigentes (AM enviadas) todavía."); return; }

    const HDR=["Cliente","No. Acuerdo","Folio","Dir","Tradelane","Producto","Origen","Transp Mode Origen","POL","POD","Destination","Transp Mode Destino","Srvc. Mode","Equipo","T.T.","Costo total","2ª opción","Vig desde","Vig hasta","Estatus"];
    const wb=new ExcelJS.Workbook();
    const ws=wb.addWorksheet("Tarifas vigentes",{views:[{state:"frozen",ySplit:1}]});
    ws.columns=HDR.map((h,i)=>({ header:h, width:[18,15,9,6,9,18,15,16,9,9,15,16,10,8,7,16,16,11,11,10][i]||12 }));
    const hr=ws.getRow(1); hr.height=22;
    hr.eachCell((c)=>{ c.font={name:"Arial",bold:true,size:9,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1A1A1A"}}; c.alignment={horizontal:"center",vertical:"middle"}; });

    res.rows.forEach(r=>{
      const row=ws.addRow([r.cliente,r.no_acuerdo,r.folio,r.direccion==="I"?"Imp":"Exp",r.tradelane,r.producto,r.origen,r.pre,r.pol,r.pod,r.destino,r.on,r.srvc,r.equipo,r.tt,r.costo_total,(r.costo_total2!=null?r.costo_total2:""),r.vig_desde||"",r.vig_hasta||"",r.vencida?"Vencida":"Vigente"]);
      row.font={name:"Arial",size:9};
      // Costo total (col 16) y 2ª opción (col 17): número operable + naviera entre paréntesis
      const cSel=row.getCell(16); cSel.numFmt='$#,##0" ('+(r.naviera||"—")+')"';
      if(r.costo_total2!=null){ const cSeg=row.getCell(17); cSeg.numFmt='$#,##0" ('+(r.naviera2||"—")+')"'; }
      // Filas vencidas: fondo rojo claro
      if(r.vencida){ row.eachCell((c)=>{ c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFDE7E7"}}; }); const est=row.getCell(20); est.font={name:"Arial",bold:true,size:9,color:{argb:"FFC8202E"}}; }
    });
    ws.autoFilter="A1:"+ws.getColumn(HDR.length).letter+"1";
    const buf=await wb.xlsx.writeBuffer();
    const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="Tarifas_vigentes_"+hoyISO()+".xlsx"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    setMsg("Descargadas "+res.rows.length+" línea(s).");
  };

  return (<div style={{maxWidth:900,margin:"0 auto",background:"#fff",border:"1px solid "+C.sep2,borderRadius:12,padding:20}}>
    <div style={{fontSize:16,fontWeight:"bold",color:C.ink,marginBottom:4}}>Tarifas vigentes</div>
    <div style={{fontSize:12.5,color:C.label,marginBottom:16,lineHeight:1.5}}>
      Descarga en Excel todas las tarifas oficiales (amendments <b>enviados</b>) que están vigentes hoy. Incluye el <b>costo total</b> (base + recargos) de la naviera elegida y de la segunda opción más barata. Si un contrato macro ya no tiene ninguna propuesta vigente, se incluye su última tarifa <b>vencida</b> resaltada en rojo.
    </div>
    <Btn kind="primary" onClick={bajar} disabled={busy}>{busy?"Generando…":"⬇ Descargar tarifas vigentes"}</Btn>
    {msg&&<div style={{fontSize:12,color:C.label,marginTop:12}}>{msg}</div>}
  </div>);
}
