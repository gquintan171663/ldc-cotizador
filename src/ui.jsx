import React, { useState, useMemo } from "react";
import { C, F, CATALOG } from "./lib.js";

export const inS={width:"100%",boxSizing:"border-box",padding:"7px 9px",border:"1px solid "+C.sep2,borderRadius:6,fontSize:13,color:C.slate,fontFamily:F,background:"#fff"};
export function Lbl({children}){return <div style={{fontSize:10,letterSpacing:.8,textTransform:"uppercase",color:C.label,marginBottom:3}}>{children}</div>;}
export function Field({label,children,w}){return <div style={{flex:w||1,minWidth:0}}><Lbl>{label}</Lbl>{children}</div>;}
export function TI(p){return <input {...p} style={{...inS,...(p.style||{})}}/>;}
export function Sel({value,onChange,options,style}){return <select value={value} onChange={onChange} style={{...inS,...style}}>{options.map(o=>typeof o==="string"?<option key={o} value={o}>{o}</option>:<option key={o.v} value={o.v}>{o.t}</option>)}</select>;}
export function Chip({children,kind}){const st=kind==="green"?{color:C.green,background:C.greenBg,border:"1px solid "+C.greenBd}:{color:C.red,background:C.redSoft,border:"1px solid "+C.redBd};return <span style={{display:"inline-block",fontSize:10,fontWeight:"bold",letterSpacing:.4,borderRadius:4,padding:"2px 7px",whiteSpace:"nowrap",...st}}>{children}</span>;}
export function Btn({children,onClick,kind,small,disabled}){const base={cursor:disabled?"default":"pointer",opacity:disabled?.55:1,fontFamily:F,fontWeight:"bold",borderRadius:6,border:"none",fontSize:small?12:13,padding:small?"6px 10px":"9px 14px"};const k={primary:{background:C.red,color:"#fff"},dark:{background:C.slate,color:"#fff"},ghost:{background:"#fff",color:C.slate,border:"1px solid "+C.sep2},green:{background:C.green,color:"#fff"},danger:{background:"#9E1B26",color:"#fff"}};return <button onClick={onClick} disabled={disabled} style={{...base,...(k[kind]||k.ghost)}}>{children}</button>;}

export function ClaveAutocomplete({value,onChange,onPick,cellStyle,catalog}){
  const cat=catalog||CATALOG;
  const [open,setOpen]=useState(false);
  const q=(value||"").trim().toUpperCase();
  const matches=useMemo(()=>{const base=!q?cat:cat.filter(x=>x.c.toUpperCase().includes(q)||x.d.toUpperCase().includes(q));return base.slice(0,80);},[q,cat]);
  const exact=cat.find(x=>x.c.toUpperCase()===q);
  return (<div style={{position:"relative"}}>
    <input value={value} onChange={e=>{onChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),160)} placeholder="BAF" style={{...cellStyle,fontWeight:"bold",textTransform:"uppercase"}}/>
    {open&&(matches.length>0||(q&&!exact))&&(<div style={{position:"absolute",top:"100%",left:0,minWidth:300,zIndex:60,background:"#fff",border:"1px solid "+C.sep2,borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,.14)",maxHeight:230,overflowY:"auto",marginTop:3}}>
      {q&&!exact&&(<div onMouseDown={()=>{onPick({c:q,d:"",g:"nuevo",nuevo:true});setOpen(false);}} style={{padding:"7px 10px",cursor:"pointer",borderBottom:"1px solid "+C.sep,fontSize:12.5,background:C.redSoft}}>
        <b style={{color:C.red}}>＋ Usar "{q}"</b> <span style={{color:C.label}}>— recargo nuevo</span></div>)}
      {matches.map(x=>(<div key={x.c} onMouseDown={()=>{onPick(x);setOpen(false);}} style={{padding:"7px 10px",cursor:"pointer",borderBottom:"1px solid "+C.sep,fontSize:12.5,display:"flex",justifyContent:"space-between",gap:8}}>
        <span><b style={{color:C.slate}}>{x.c}</b> <span style={{color:C.label}}>— {x.d}</span></span><span style={{fontSize:10,color:C.label,whiteSpace:"nowrap"}}>{x.g}</span></div>))}
    </div>)}
  </div>);
}

// ComboBox con búsqueda + scroll. items: [{v,label,sub}]. Permite valor libre.
export function ComboBox({value,onChange,items,placeholder,allowFree=true,display}){
  const [open,setOpen]=React.useState(false);
  const [q,setQ]=React.useState("");
  const cur=display!=null?display:(value||"");
  const text=open?q:cur;
  const qq=(q||"").trim().toUpperCase();
  const matches=React.useMemo(()=>{
    const base=!qq?items:items.filter(x=>(x.v+" "+x.label+" "+(x.sub||"")).toUpperCase().includes(qq));
    return base.slice(0,120);
  },[qq,items]);
  const pick=(v)=>{onChange(v);setOpen(false);setQ("");};
  return (<div style={{position:"relative"}}>
    <input value={text} placeholder={placeholder||"Buscar…"}
      onChange={e=>{setQ(e.target.value);if(!open)setOpen(true);}}
      onFocus={()=>{setQ("");setOpen(true);}}
      onBlur={()=>setTimeout(()=>{ if(open&&allowFree&&q.trim()!=="") onChange(q.trim()); setOpen(false); },160)}
      style={{...inS}}/>
    {open&&(<div style={{position:"absolute",top:"100%",left:0,right:0,minWidth:240,zIndex:70,background:"#fff",border:"1px solid "+C.sep2,borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,.14)",maxHeight:240,overflowY:"auto",marginTop:3}}>
      {qq&&allowFree&&!items.find(x=>x.v.toUpperCase()===qq)&&(
        <div onMouseDown={()=>pick(q.trim())} style={{padding:"7px 10px",cursor:"pointer",borderBottom:"1px solid "+C.sep,fontSize:12.5,background:C.redSoft}}>
          <b style={{color:C.red}}>＋ Usar "{q.trim()}"</b></div>)}
      {matches.length===0&&!qq&&<div style={{padding:"8px 10px",color:C.label,fontSize:12}}>Escribe para buscar…</div>}
      {matches.map(x=>(<div key={x.v} onMouseDown={()=>pick(x.v)} style={{padding:"7px 10px",cursor:"pointer",borderBottom:"1px solid "+C.sep,fontSize:12.5,display:"flex",justifyContent:"space-between",gap:8}}>
        <span><b style={{color:C.slate}}>{x.label}</b></span><span style={{fontSize:10,color:C.label,whiteSpace:"nowrap"}}>{x.sub||""}</span></div>))}
    </div>)}
  </div>);
}
