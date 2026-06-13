import React, { useState } from "react";
import { C, F } from "./lib.js";
import { Btn } from "./ui.jsx";
import { useAuth, LoginGate } from "./Auth.jsx";
import { Cotizador } from "./Cotizador.jsx";
import { Cotizaciones } from "./Cotizaciones.jsx";
import { Importador } from "./Importador.jsx";

export default function App(){
  const { session, role, ready, signOut } = useAuth();
  const [tab,setTab]=useState("lista");
  const [openId,setOpenId]=useState(null);
  const [cotizKey,setCotizKey]=useState(0); // fuerza remount del cotizador

  if(!ready) return null;
  if(!session) return <LoginGate role={role} />;

  const canQuote = role==="admin" || role==="pricing";
  const openVersion=(id)=>{ setOpenId(id); setCotizKey(k=>k+1); setTab("cotizador"); };
  const nuevaCotiz=()=>{ setOpenId(null); setCotizKey(k=>k+1); setTab("cotizador"); };

  return (<div style={{fontFamily:F,background:"#F0F2F5",minHeight:"100vh",color:C.slate}}>
    <div style={{background:"#fff",borderBottom:"1px solid "+C.sep2,padding:"12px 20px",display:"flex",alignItems:"center",gap:16}}>
      <div style={{height:18,width:4,background:C.red,borderRadius:2}}/>
      <div style={{fontSize:16,fontWeight:"bold",color:C.ink}}>Cotizador · Pricing</div>
      {canQuote&&(<div style={{display:"flex",gap:6,marginLeft:12}}>
        <Btn kind={tab==="lista"?"dark":"ghost"} small onClick={()=>setTab("lista")}>Mis cotizaciones</Btn>
        <Btn kind={tab==="cotizador"?"dark":"ghost"} small onClick={()=>setTab("cotizador")}>Cotizador</Btn>
        <Btn kind={tab==="importar"?"dark":"ghost"} small onClick={()=>setTab("importar")}>Importar Excel</Btn>
      </div>)}
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:12,color:C.label}}>{session.user?.email} · <b style={{color:C.slate}}>{role||"…"}</b></span>
        <Btn kind="ghost" small onClick={signOut}>Salir</Btn>
      </div>
    </div>
    <div style={{padding:20}}>
      {!canQuote&&(<div style={{maxWidth:560,margin:"60px auto",textAlign:"center",color:C.label,fontSize:14}}>Este módulo es de Pricing. Tu rol ({role||"sin rol"}) no tiene acceso a cotizaciones.</div>)}
      {canQuote&&tab==="lista" && <Cotizaciones onOpen={openVersion} onNew={nuevaCotiz} />}
      {canQuote&&tab==="cotizador" && <Cotizador key={cotizKey} loadId={openId} />}
      {canQuote&&tab==="importar" && (<div style={{maxWidth:1160,margin:"0 auto",background:"#fff",border:"1px solid "+C.sep2,borderRadius:12,padding:16}}><Importador onBack={()=>setTab("lista")} /></div>)}
    </div>
  </div>);
}
