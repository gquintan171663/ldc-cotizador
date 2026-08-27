import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import { C, F } from "./lib.js";
import { inS, Btn, Lbl } from "./ui.jsx";

// Acceso restringido al dominio corporativo.
// El bloqueo REAL vive en la base de datos (RLS contra public.allowed_users).
// Alta de usuarios: SOLO por el admin desde el panel de Supabase (Authentication -> Add/Invite user).
// Registro público DESHABILITADO. Login por correo + contraseña.
const DOMINIO = "ldcorporation.com";
const esCorreoLDC = (e) => String(e || "").trim().toLowerCase().split("@")[1] === DOMINIO;

export function useAuth(){
  const [session,setSession]=useState(null);
  const [role,setRole]=useState(null);
  const [ready,setReady]=useState(false);
  const [recovery,setRecovery]=useState(false);
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{ setSession(data.session); setReady(true); });
    const { data: sub }=supabase.auth.onAuthStateChange((ev,s)=>{
      setSession(s);
      if(ev==="PASSWORD_RECOVERY") setRecovery(true);   // llegó por enlace de invitación / restablecer
    });
    return ()=>sub.subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!session){ setRole(null); return; }
    const email=session.user?.email;
    if(!esCorreoLDC(email)){ supabase.auth.signOut(); setRole(null); return; }
    supabase.from("allowed_users").select("role").eq("email",email).maybeSingle()
      .then(({data})=>setRole(data?.role||"none"));
  },[session]);
  return { session, role, ready, recovery, endRecovery:()=>setRecovery(false), signOut:()=>supabase.auth.signOut() };
}

// Pantalla para DEFINIR/CAMBIAR contraseña (tras invitación o "restablecer")
export function SetPassword({ onDone, email }){
  const [pw,setPw]=useState("");
  const [pw2,setPw2]=useState("");
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);
  const guardar=async()=>{
    if(pw.length<8){ setMsg("La contraseña debe tener al menos 8 caracteres."); return; }
    if(pw!==pw2){ setMsg("Las contraseñas no coinciden."); return; }
    setBusy(true); setMsg("");
    const { error }=await supabase.auth.updateUser({ password:pw });
    setBusy(false);
    if(error){ setMsg(error.message); return; }
    setMsg("Contraseña guardada. Ya puedes usar el sistema.");
    if(onDone) onDone();
  };
  return (
    <div style={{fontFamily:F,minHeight:"100vh",background:"#F0F2F5",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:14,padding:28,width:360,boxShadow:"0 10px 30px rgba(0,0,0,.06)"}}>
        <div style={{height:4,width:56,background:C.red,borderRadius:2,marginBottom:14}}/>
        <div style={{fontSize:18,fontWeight:"bold",color:C.ink}}>Define tu contraseña</div>
        <div style={{fontSize:12,color:C.label,marginBottom:18}}>{email?email:"Cuenta LDC"} · uso interno</div>
        <Lbl>Nueva contraseña</Lbl>
        <input type="password" value={pw} onChange={e=>{setPw(e.target.value);if(msg)setMsg("");}} placeholder="Mínimo 8 caracteres" autoComplete="new-password" style={{...inS,marginBottom:10}}/>
        <Lbl>Confirmar contraseña</Lbl>
        <input type="password" value={pw2} onChange={e=>{setPw2(e.target.value);if(msg)setMsg("");}} placeholder="Repite la contraseña" autoComplete="new-password" style={{...inS,marginBottom:12}} onKeyDown={e=>e.key==="Enter"&&guardar()}/>
        <Btn kind="primary" onClick={guardar} disabled={busy}>{busy?"Guardando…":"Guardar contraseña"}</Btn>
        {msg&&<div style={{fontSize:12,color:C.slate,marginTop:12}}>{msg}</div>}
      </div>
    </div>
  );
}

export function LoginGate({ children, role }){
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);
  const limpio=()=>email.trim().toLowerCase();

  const entrar=async()=>{
    const e=limpio();
    if(!e||!pw) return;
    if(!esCorreoLDC(e)){ setMsg("Acceso restringido al personal de LDC: usa tu correo @"+DOMINIO+"."); return; }
    setBusy(true); setMsg("");
    const { error }=await supabase.auth.signInWithPassword({ email:e, password:pw });
    setBusy(false);
    if(error) setMsg("Correo o contraseña incorrectos.");
  };
  const restablecer=async()=>{
    const e=limpio();
    if(!e){ setMsg("Escribe tu correo y luego presiona \"¿Olvidaste tu contraseña?\"."); return; }
    if(!esCorreoLDC(e)){ setMsg("Usa tu correo @"+DOMINIO+"."); return; }
    setBusy(true); setMsg("");
    const { error }=await supabase.auth.resetPasswordForEmail(e,{ redirectTo:window.location.origin });
    setBusy(false);
    if(error) setMsg(error.message); else setMsg("Si tu cuenta existe, te enviamos un enlace a "+e+" para definir tu contraseña.");
  };

  if(role===undefined) return null;
  return (
    <div style={{fontFamily:F,minHeight:"100vh",background:"#F0F2F5",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#fff",border:"1px solid "+C.sep2,borderRadius:14,padding:28,width:360,boxShadow:"0 10px 30px rgba(0,0,0,.06)"}}>
        <div style={{height:4,width:56,background:C.red,borderRadius:2,marginBottom:14}}/>
        <div style={{fontSize:18,fontWeight:"bold",color:C.ink}}>Cotizador · Pricing</div>
        <div style={{fontSize:12,color:C.label,marginBottom:18}}>Acceso exclusivo LDC · uso interno</div>
        <Lbl>Correo LDC</Lbl>
        <input value={email} onChange={e=>{setEmail(e.target.value);if(msg)setMsg("");}} placeholder={"nombre@"+DOMINIO} autoComplete="email" style={{...inS,marginBottom:10}} onKeyDown={e=>e.key==="Enter"&&entrar()}/>
        <Lbl>Contraseña</Lbl>
        <input type="password" value={pw} onChange={e=>{setPw(e.target.value);if(msg)setMsg("");}} placeholder="Tu contraseña" autoComplete="current-password" style={{...inS,marginBottom:12}} onKeyDown={e=>e.key==="Enter"&&entrar()}/>
        <Btn kind="primary" onClick={entrar} disabled={busy}>{busy?"Entrando…":"Entrar"}</Btn>
        <div style={{marginTop:12,textAlign:"center"}}>
          <span onClick={busy?undefined:restablecer} style={{fontSize:11.5,color:C.slate,cursor:"pointer",textDecoration:"underline"}}>¿Olvidaste tu contraseña? / Definir contraseña</span>
        </div>
        <div style={{fontSize:10.5,color:C.label,marginTop:14,textAlign:"center"}}>Las cuentas las da de alta el administrador. Solo correos @{DOMINIO}.</div>
        {msg&&<div style={{fontSize:12,color:C.slate,marginTop:12}}>{msg}</div>}
      </div>
    </div>
  );
}
