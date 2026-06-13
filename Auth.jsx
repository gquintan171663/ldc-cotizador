import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import { C, F } from "./lib.js";
import { inS, Btn, Lbl } from "./ui.jsx";

export function useAuth(){
  const [session,setSession]=useState(null);
  const [role,setRole]=useState(null);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{ setSession(data.session); setReady(true); });
    const { data: sub }=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>sub.subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!session){ setRole(null); return; }
    const email=session.user?.email;
    supabase.from("allowed_users").select("role").eq("email",email).maybeSingle()
      .then(({data})=>setRole(data?.role||"none"));
  },[session]);
  return { session, role, ready, signOut:()=>supabase.auth.signOut() };
}

export function LoginGate({ children, role }){
  const [email,setEmail]=useState("");
  const [code,setCode]=useState("");
  const [stage,setStage]=useState("email");
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);

  const sendCode=async()=>{
    if(!email) return; setBusy(true); setMsg("");
    const { error }=await supabase.auth.signInWithOtp({ email, options:{ shouldCreateUser:true } });
    setBusy(false);
    if(error) setMsg(error.message); else { setStage("code"); setMsg("Te enviamos un código a "+email); }
  };
  const verify=async()=>{
    if(!code) return; setBusy(true); setMsg("");
    const { error }=await supabase.auth.verifyOtp({ email, token:code.trim(), type:"email" });
    setBusy(false);
    if(error) setMsg(error.message);
  };

  if(role===undefined) return null;
  return (
    <div style={{fontFamily:F,minHeight:"100vh",background:"#F0F2F5",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:14,padding:28,width:360,boxShadow:"0 10px 30px rgba(0,0,0,.06)"}}>
        <div style={{height:4,width:56,background:C.red,borderRadius:2,marginBottom:14}}/>
        <div style={{fontSize:18,fontWeight:"bold",color:C.ink}}>Cotizador · Pricing</div>
        <div style={{fontSize:12,color:C.label,marginBottom:18}}>Acceso LDC</div>
        {stage==="email"?(<>
          <Lbl>Correo LDC</Lbl>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="nombre@ldcorporation.com" style={{...inS,marginBottom:12}} onKeyDown={e=>e.key==="Enter"&&sendCode()}/>
          <Btn kind="primary" onClick={sendCode} disabled={busy}>{busy?"Enviando…":"Enviar código"}</Btn>
        </>):(<>
          <Lbl>Código de 6–8 dígitos</Lbl>
          <input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" maxLength={8} placeholder="123456" style={{...inS,marginBottom:12,letterSpacing:3,fontWeight:"bold"}} onKeyDown={e=>e.key==="Enter"&&verify()}/>
          <div style={{display:"flex",gap:8}}>
            <Btn kind="primary" onClick={verify} disabled={busy}>{busy?"Verificando…":"Entrar"}</Btn>
            <Btn kind="ghost" onClick={()=>setStage("email")}>Cambiar correo</Btn>
          </div>
        </>)}
        {msg&&<div style={{fontSize:12,color:C.slate,marginTop:12}}>{msg}</div>}
      </div>
    </div>
  );
}
