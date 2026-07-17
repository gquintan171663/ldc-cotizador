import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import { C, F } from "./lib.js";
import { inS, Btn, Lbl } from "./ui.jsx";

// Acceso restringido al dominio corporativo.
// OJO: esta validación es sólo de conveniencia (mensaje claro al usuario).
// El bloqueo REAL vive en la base de datos: trigger enforce_ldc_domain()
// sobre auth.users + RLS contra public.allowed_users.
const DOMINIO = "ldcorporation.com";
const esCorreoLDC = (e) => String(e || "").trim().toLowerCase().split("@")[1] === DOMINIO;

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
    // Cinturón extra: si por lo que sea hay una sesión fuera del dominio, se cierra.
    if(!esCorreoLDC(email)){ supabase.auth.signOut(); setRole(null); return; }
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

  const limpio=()=>email.trim().toLowerCase();

  const sendCode=async()=>{
    const e=limpio();
    if(!e) return;
    if(!esCorreoLDC(e)){ setMsg("Acceso restringido al personal de LDC: usa tu correo @"+DOMINIO+"."); return; }
    setBusy(true); setMsg("");
    const { error }=await supabase.auth.signInWithOtp({ email:e, options:{ shouldCreateUser:true } });
    setBusy(false);
    if(error) setMsg(error.message); else { setStage("code"); setMsg("Te enviamos un código a "+e); }
  };
  const verify=async()=>{
    if(!code) return; setBusy(true); setMsg("");
    const { error }=await supabase.auth.verifyOtp({ email:limpio(), token:code.trim(), type:"email" });
    setBusy(false);
    if(error) setMsg(error.message);
  };

  if(role===undefined) return null;
  return (
    <div style={{fontFamily:F,minHeight:"100vh",background:"#F0F2F5",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:14,padding:28,width:360,boxShadow:"0 10px 30px rgba(0,0,0,.06)"}}>
        <div style={{height:4,width:56,background:C.red,borderRadius:2,marginBottom:14}}/>
        <div style={{fontSize:18,fontWeight:"bold",color:C.ink}}>Cotizador · Pricing</div>
        <div style={{fontSize:12,color:C.label,marginBottom:18}}>Acceso exclusivo LDC · uso interno</div>
        {stage==="email"?(<>
          <Lbl>Correo LDC</Lbl>
          <input value={email} onChange={e=>{setEmail(e.target.value);if(msg)setMsg("");}} placeholder={"nombre@"+DOMINIO} autoComplete="email" style={{...inS,marginBottom:6}} onKeyDown={e=>e.key==="Enter"&&sendCode()}/>
          <div style={{fontSize:10.5,color:C.label,marginBottom:12}}>Solo correos @{DOMINIO}</div>
          <Btn kind="primary" onClick={sendCode} disabled={busy}>{busy?"Enviando…":"Enviar código"}</Btn>
        </>):(<>
          <Lbl>Código de 6–8 dígitos</Lbl>
          <input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" maxLength={8} placeholder="123456" autoComplete="one-time-code" style={{...inS,marginBottom:12,letterSpacing:3,fontWeight:"bold"}} onKeyDown={e=>e.key==="Enter"&&verify()}/>
          <div style={{display:"flex",gap:8}}>
            <Btn kind="primary" onClick={verify} disabled={busy}>{busy?"Verificando…":"Entrar"}</Btn>
            <Btn kind="ghost" onClick={()=>{setStage("email");setCode("");setMsg("");}}>Cambiar correo</Btn>
          </div>
        </>)}
        {msg&&<div style={{fontSize:12,color:C.slate,marginTop:12}}>{msg}</div>}
      </div>
    </div>
  );
}
