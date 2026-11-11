export type ItemData={id:number;name:string;quality:string;item_level:number;required_level:number;slot:string;icon_url?:string;stats:{name:string;value:number}[];build?:string;effects?:unknown[];weapon?:unknown;links?:{html:string}};
export type ItemResult={status:'resolved'|'unresolved'|'unavailable';item?:ItemData;checkedAt:number};
const memory=new Map<number,ItemResult>();let queue=Promise.resolve();let lastRequest=0;let bundled:Promise<void>|undefined;
const API='https://thewowdb.com/api/v1/forever/item/';
export function itemLink(id:number){return `https://thewowdb.com/wow-forever/item/${id}`;}
export function safeIcon(url?:string){try{const u=new URL(url||'');return u.protocol==='https:'&&['render.worldofwarcraft.com','wow.zamimg.com','thewowdb.com'].includes(u.hostname)?u.href:undefined;}catch{return undefined;}}
export async function getItem(id:number):Promise<ItemResult>{
 if(!Number.isSafeInteger(id)||id<=0)throw new Error('Invalid item ID');
 bundled ||= fetch(`${import.meta.env.BASE_URL}data/items.json`).then(r=>r.ok?r.json():null).then(data=>{if(data?.items)for(const [key,result]of Object.entries(data.items)){const r=result as ItemResult;if(r.status!=='unavailable')memory.set(Number(key),r);}}).catch(()=>{});await bundled;
 let cached=memory.get(id);try{cached ||= JSON.parse(localStorage.getItem(`onslaught:item:${id}`)||'null');}catch{/* Storage unavailable */}
 if(cached&&Date.now()-cached.checkedAt<3600000)return cached;
 let result:ItemResult={status:'unavailable',checkedAt:Date.now()};
 const work=async()=>{const wait=550-(Date.now()-lastRequest);if(wait>0)await new Promise(r=>setTimeout(r,wait));lastRequest=Date.now();
  try{const r=await fetch(`${API}${id}`,{signal:AbortSignal.timeout(10000),referrerPolicy:'no-referrer'});
   if(r.status===404)result={status:'unresolved',checkedAt:Date.now()};
   else if(r.status===429){const delay=Number(r.headers.get('Retry-After')||'30');lastRequest=Date.now()+Math.min(60000,Math.max(1000,delay*1000));}
   else if(r.ok){const item=await r.json() as ItemData;if(item.id===id&&typeof item.name==='string'&&Array.isArray(item.stats))result={status:'resolved',item,checkedAt:Date.now()};}
  }catch{/* Offline retains the character snapshot. */}
  if(result.status!=='unavailable'){memory.set(id,result);try{localStorage.setItem(`onslaught:item:${id}`,JSON.stringify(result));}catch{/* Cache is optional */}}
 };queue=queue.then(work,work);await queue;return result;
}
