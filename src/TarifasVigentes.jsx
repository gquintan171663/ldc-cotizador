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

    const HDR=["Cliente","No. Acuerdo","Folio","Dir","Tradelane","Producto","Origen","Transp Mode Origen","POL","POD","Destination","Transp Mode Destino","Srvc. Mode","Equipo","T.T.","Costo (1ª opción)","Profit (1ª)","Venta (1ª)","Costo (2ª opción)","Profit (2ª)","Venta (2ª)","Vig desde","Vig hasta","Estatus"];
    const S1="FFE8F0FE", S2="FFFBF4E0";   // fondos: set 1 azul claro, set 2 ámbar claro
    const H1="FF1F3A66", H2="FF8A6D1F";   // encabezados de cada set
    const wb=new ExcelJS.Workbook();
    const ws=wb.addWorksheet("Tarifas vigentes",{views:[{state:"frozen",ySplit:1}]});
    ws.columns=HDR.map((h,i)=>({ header:h, width:[18,15,8,5,9,16,14,15,8,8,14,15,9,7,6, 13,13,13, 13,13,13, 11,11,9][i]||12 }));
    const hr=ws.getRow(1); hr.height=24;
    hr.eachCell((c,col)=>{ const bg = (col>=16&&col<=18)?H1 : (col>=19&&col<=21)?H2 : "FF1A1A1A"; c.font={name:"Arial",bold:true,size:9,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:bg}}; c.alignment={horizontal:"center",vertical:"middle",wrapText:true}; });

    res.rows.forEach(r=>{
      const row=ws.addRow([r.cliente,r.no_acuerdo,r.folio,r.direccion==="I"?"Imp":"Exp",r.tradelane,r.producto,r.origen,r.pre,r.pol,r.pod,r.destino,r.on,r.srvc,r.equipo,r.tt,
        r.opt1.costo, r.opt1.profit, r.opt1.venta,
        r.opt2?r.opt2.costo:"", r.opt2?r.opt2.profit:"", r.opt2?r.opt2.venta:"",
        r.vig_desde||"",r.vig_hasta||"",r.vencida?"Vencida":"Vigente"]);
      row.font={name:"Arial",size:9};
      const money=(cell)=>{ if(typeof cell.value==="number") cell.numFmt="$#,##0"; };
      const c16=row.getCell(16),c17=row.getCell(17),c18=row.getCell(18);
      const c19=row.getCell(19),c20=row.getCell(20),c21=row.getCell(21);
      money(c16); money(c18);
      if(typeof c17.value==="number") c17.numFmt='$#,##0" ('+(r.opt1.scac||"—")+')"';
      money(c19); money(c21);
      if(r.opt2&&typeof c20.value==="number") c20.numFmt='$#,##0" ('+(r.opt2.scac||"—")+')"';
      if(r.vencida){ row.eachCell((c)=>{ c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFDE7E7"}}; }); const est=row.getCell(24); est.font={name:"Arial",bold:true,size:9,color:{argb:"FFC8202E"}}; }
      else { [c16,c17,c18].forEach(c=>c.fill={type:"pattern",pattern:"solid",fgColor:{argb:S1}}); [c19,c20,c21].forEach(c=>c.fill={type:"pattern",pattern:"solid",fgColor:{argb:S2}}); }
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
