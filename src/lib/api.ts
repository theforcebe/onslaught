import { StateSchema } from './model';
import type { RaidState, ChangeRequest, Identity } from './model';
export const REPOSITORY='theforcebe/onslaught';
export const REPO_URL=`https://github.com/${REPOSITORY}`;
export const API_URL=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
let sessionToken='';
export async function loadGuild():Promise<{state:RaidState;isCurrent:boolean}>{
 const url=`https://raw.githubusercontent.com/${REPOSITORY}/main/public/data/raid-state.json?v=${Date.now()}`;
 try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(r.ok)return {state:StateSchema.parse(await r.json()),isCurrent:true};}catch{/* Bundled snapshot is the offline fallback */}
 const r=await fetch(`${import.meta.env.BASE_URL}data/raid-state.json`,{cache:'no-store'});if(!r.ok)throw new Error('The guild data could not be loaded. Check your connection and reload.');return {state:StateSchema.parse(await r.json()),isCurrent:false};
}
export function issueBody(request:ChangeRequest){return `Ønslaught shared change. GitHub Actions checks the submitting account and character ownership before committing.\n\n\`\`\`json\n${JSON.stringify(request,null,2)}\n\`\`\`\n`;}
export async function loginBattleNet():Promise<Identity>{
 if(!API_URL)throw new Error('Battle.net sign-in needs the guild’s secure gateway. The setup guide explains the three server secrets required. You can use GitHub submissions in the meantime.');
 const popup=window.open('about:blank','onslaught-signin','width=600,height=740');if(!popup)throw new Error('Allow pop-ups to sign in with Battle.net.');
 const verifier=crypto.randomUUID()+crypto.randomUUID();const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));const challenge=btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 return new Promise((resolve,reject)=>{
  const clean=()=>{window.removeEventListener('message',listener);clearInterval(closed);clearTimeout(timeout);};
  const listener=async(e:MessageEvent)=>{if(e.origin!==new URL(API_URL).origin||e.source!==popup||e.data?.type!=='onslaught-auth')return;clean();popup.close();
   try{if(e.data.error)throw new Error('Battle.net sign-in could not be completed. Try again or contact a guild admin.');const r=await fetch(`${API_URL}/auth/exchange`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:e.data.code,verifier})});const data=await r.json();if(!r.ok)throw new Error(data.accountId?`Your account needs a guild invitation. Give your account ID ${data.accountId} to the guild owner privately.`:data.error||'Sign-in expired. Try again.');sessionToken=data.token;resolve(data.identity);}catch(error){reject(error);}
  };
  window.addEventListener('message',listener);const closed=setInterval(()=>{if(popup.closed){clean();reject(new Error('Sign-in window closed.'));}},500);const timeout=setTimeout(()=>{clean();popup.close();reject(new Error('Sign-in timed out. Please try again.'));},300000);
  popup.location.href=`${API_URL}/auth/start?challenge=${encodeURIComponent(challenge)}`;
 });
}
export async function logout(){try{if(sessionToken)await fetch(`${API_URL}/auth/logout`,{method:'POST',headers:{Authorization:`Bearer ${sessionToken}`}});}finally{sessionToken='';}}
export async function saveShared(request:ChangeRequest):Promise<RaidState>{
 if(!sessionToken)throw new Error('Sign in before saving to the guild.');
 const r=await fetch(`${API_URL}/api/change`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${sessionToken}`},body:JSON.stringify(request)});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'The change could not be saved.');return StateSchema.parse(data);
}
