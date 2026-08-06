import React, { useState } from "react";
import ExcelJS from "exceljs";
import { C, eqMeta } from "./lib.js";
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

    const equipos=res.equipos||[];
    const BASE=["Cliente","No. Acuerdo","Folio","AM","Dir","Tradelane","Producto","Origen","Transp Mode Origen","POL","POD","Destination","Transp Mode Destino","Srvc. Mode","T.T."];
    const TAIL=["Vig desde","Vig hasta","Estatus"];
    const baseW=[18,15,8,6,5,9,16,14,15,8,8,14,15,9,6];
    const totalCols=BASE.length+equipos.length*3+TAIL.length;
    const wb=new ExcelJS.Workbook();
    const ws=wb.addWorksheet("Tarifas vigentes",{views:[{state:"frozen",ySplit:2}]});

    const styleHdr=(c,bg)=>{ c.font={name:"Arial",bold:true,size:9,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:bg||"FF1A1A1A"}}; c.alignment={horizontal:"center",vertical:"middle",wrapText:true}; };
    const BLK=["FF1F3A66","FF8A6D1F"];        // encabezado bloques alternando azul / ámbar
    const S=["FFE8F0FE","FFFBF4E0"];          // fondo celdas alternando

    // Encabezado en 2 filas
    let ci=1;
    BASE.forEach((h,i)=>{ ws.mergeCells(1,ci,2,ci); const c=ws.getCell(1,ci); c.value=h; styleHdr(c); ws.getColumn(ci).width=baseW[i]||12; ci++; });
    equipos.forEach((ek,bi)=>{ const lab=eqMeta(ek).t+" container"; ws.mergeCells(1,ci,1,ci+2); const ch=ws.getCell(1,ci); ch.value=lab; styleHdr(ch,BLK[bi%2]); ["Costo Total","Profit","Venta"].forEach((s,j)=>{ const cc=ws.getCell(2,ci+j); cc.value=s; styleHdr(cc,BLK[bi%2]); ws.getColumn(ci+j).width=13; }); ci+=3; });
    TAIL.forEach((h)=>{ ws.mergeCells(1,ci,2,ci); const c=ws.getCell(1,ci); c.value=h; styleHdr(c); ws.getColumn(ci).width=11; ci++; });
    ws.getRow(1).height=20; ws.getRow(2).height=18;

    // Datos (desde fila 3)
    let rIdx=3;
    res.rows.forEach(r=>{
      const row=ws.getRow(rIdx); let ci=1;
      [r.cliente,r.no_acuerdo,r.folio,r.am,r.direccion==="I"?"Imp":"Exp",r.tradelane,r.producto,r.origen,r.pre,r.pol,r.pod,r.destino,r.on,r.srvc,r.tt].forEach(v=>{ row.getCell(ci).value=v; ci++; });
      equipos.forEach((ek,bi)=>{
        const e=r.eq[ek]; const cc=row.getCell(ci),cp=row.getCell(ci+1),cv=row.getCell(ci+2);
        if(e){ cc.value=e.costo; cc.numFmt="$#,##0"; cp.value=e.profit; cp.numFmt='$#,##0" ('+(e.scac||"—")+')"'; cv.value=e.venta; cv.numFmt="$#,##0"; }
        if(r.estado!=="Vencida"){ const f=S[bi%2]; [cc,cp,cv].forEach(x=>x.fill={type:"pattern",pattern:"solid",fgColor:{argb:f}}); }
        ci+=3;
      });
      [r.vig_desde||"",r.vig_hasta||"",r.estado].forEach(v=>{ row.getCell(ci).value=v; ci++; });
      row.font={name:"Arial",size:9};
      if(r.estado==="Vencida"){ for(let k=1;k<ci;k++){ row.getCell(k).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFDE7E7"}}; } const est=row.getCell(ci-1); est.font={name:"Arial",bold:true,size:9,color:{argb:"FFC8202E"}}; }
      else if(r.estado==="Próxima"){ const est=row.getCell(ci-1); est.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFE3F0FB"}}; est.font={name:"Arial",bold:true,size:9,color:{argb:"FF1F5FA6"}}; }
      rIdx++;
    });
    ws.autoFilter={from:{row:2,column:1},to:{row:2,column:totalCols}};
    const buf=await wb.xlsx.writeBuffer();
    const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="Tarifas_vigentes_"+hoyISO()+".xlsx"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    setMsg("Descargadas "+res.rows.length+" línea(s).");
  };

  return (<div style={{maxWidth:900,margin:"0 auto",background:"#fff",border:"1px solid "+C.sep2,borderRadius:12,padding:20}}>
    <div style={{fontSize:16,fontWeight:"bold",color:C.ink,marginBottom:4}}>Tarifas vigentes</div>
    <div style={{fontSize:12.5,color:C.label,marginBottom:16,lineHeight:1.5}}>
      Descarga en Excel las tarifas oficiales (amendments <b>enviados</b>). Marca cada ruta como <b>Vigente</b> (cubre hoy), <b>Próxima</b> (ya enviada, empieza a futuro — resaltada en azul) o <b>Vencida</b> (ya terminó y no hay reemplazo — en rojo). Incluye el <b>costo total</b> (base + recargos) y venta por equipo. Las reemplazadas no se incluyen.
    </div>
    <Btn kind="primary" onClick={bajar} disabled={busy}>{busy?"Generando…":"⬇ Descargar tarifas vigentes"}</Btn>
    {msg&&<div style={{fontSize:12,color:C.label,marginTop:12}}>{msg}</div>}
  </div>);
}
