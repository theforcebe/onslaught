import { CLASSES, SLOTS, SnapshotSchema } from './model';
import type { Snapshot, Gear, WowClass } from './model';
const sensitive = /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:client_secret|access_token|refresh_token|password|authorization)\s*[:=]\s*\S+)/i;
export function rejectCredentials(value:unknown){if(sensitive.test(typeof value==='string'?value:JSON.stringify(value)))throw new Error('This text appears to contain a credential. Remove it before sharing.');}
export function parseSimc(input:string, now=new Date().toISOString()):Snapshot {
 if (!input.trim()) throw new Error('Paste a SimulationCraft character export first.');
 if (input.length>100000) throw new Error('This export exceeds the 100 KB limit.');
 rejectCredentials(input);
 const raw=input.replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
 const out:Snapshot={name:'',class:'warrior',level:0,race:'',region:'',server:'',spec:'',role:'',professions:'',talents:'',legacyTalents:'',gear:[],bagGear:[],bags:[],pet:{},stats:{},metadata:{addon:'',build:'',exportedAt:'',checksum:''},warnings:[],raw,importedAt:now};
 let section:'equipped'|'bags'|'info'='equipped', pending:{name:string,level?:number}|undefined, foundClass=false;
 for(const original of raw.split('\n')) {
  const line=original.trim(); if(!line)continue;
  if(/^### Gear from Bags/i.test(line)){section='bags';pending=undefined;continue;}
  if(/^### Additional Character Info/i.test(line)){section='info';pending=undefined;continue;}
  if(/^# SimC Addon /.test(line))out.metadata.addon=line.slice(2);
  if(/^# WoW /.test(line))out.metadata.build=line.slice(2);
  const exported=line.match(/^# .+ - (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) - /);if(exported)out.metadata.exportedAt=exported[1];
  if(/^# Checksum: /.test(line))out.metadata.checksum=line.slice(12);
  const commented=line.startsWith('#'); const clean=commented?line.replace(/^#\s?/,''):line;
  const eq=clean.match(/^([a-zA-Z0-9_]+)=(.*)$/);
  if(eq){const [,key,value]=eq;
   if(!commented && CLASSES.includes(key as WowClass)) {if(foundClass)throw new Error('Import one character at a time.');out.class=key as WowClass;out.name=value.replace(/^"|"$/g,'').trim();foundClass=true;}
   else if((SLOTS as readonly string[]).includes(key)||/^bag[1-5]$/.test(key)){
    if(commented&&section!=='bags')continue;
    const parts=Object.fromEntries(value.split(',').filter(Boolean).map(p=>{const at=p.indexOf('=');return at<0?['name',p]:[p.slice(0,at),p.slice(at+1)];}));
    const itemId=Number(parts.id); if(!Number.isSafeInteger(itemId)||itemId<=0){out.warnings.push(`Skipped ${key}: missing or invalid item ID.`);continue;}
    const {id:unused,...modifiers}=parts;void unused;
    const item:Gear={slot:key,id:itemId,name:pending?.name||`Item #${itemId}`,level:pending?.level,modifiers};
    const bucket=commented?out.bagGear:/^bag/.test(key)?out.bags:out.gear;
    if(bucket===out.gear&&bucket.some(g=>g.slot===key))throw new Error(`The export has two active ${key} entries. Keep one equipped item per slot.`);
    bucket.push(item);pending=undefined;
   }else if(key.startsWith('pet_')) {out.pet[key]=value;}
   else if(commented&&section==='info'){out.stats[key]=value;}
   else if(!commented){
    if(key==='level')out.level=Number(value);
    else if(['race','region','server','spec','role','professions','talents'].includes(key))Object.assign(out,{[key]:value});
    else if(key==='legacy_talents')out.legacyTalents=value;
   }
  }else if(commented){const name=line.match(/^# (.+?) \((\d+)\)$/);if(name)pending={name:name[1],level:Number(name[2])};else if(/^# [^#=]+$/.test(line)&&!line.includes(' - ')&&!/^# (Primary|SimC|WoW|Requires|Checksum)/.test(line))pending={name:line.slice(2)};}
 }
 if(!foundClass||!out.name)throw new Error('No supported character found. Expected a line such as hunter="Example Raider".');
 if(!Number.isInteger(out.level)||out.level<1||out.level>100)throw new Error('The export needs a valid character level.');
 if(!out.gear.length)out.warnings.push('No equipped items were found.');
 if(!out.role||out.spec==='unknown')out.warnings.push('Choose a raid role and specialization after importing.');
 if(out.gear.some(g=>g.modifiers.bonus_id||g.modifiers.enchant_id||g.modifiers.content_tuning))out.warnings.push('Variant, enchant and tuning IDs are preserved. Base item data may not include their effects.');
 return SnapshotSchema.parse(out);
}
export function numericStats(value=''):Record<string,number>{return Object.fromEntries(value.split('/').map(s=>s.split(':')).filter(([k,v])=>k&&v!==''&&Number.isFinite(Number(v))).map(([k,v])=>[k,Number(v)]));}
