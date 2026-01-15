const{Client,GatewayIntentBits,AttachmentBuilder}=require('discord.js');const{exec}=require('child_process');const fs=require('fs');const path=require('path');const http=require('http');const https=require('https');const{promisify}=require('util');const execAsync=promisify(exec);
const PORT=process.env.PORT||3000;http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');}).listen(PORT);
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
const TOKEN=process.env.DISCORD_TOKEN;const PROMETHEUS_PATH=process.env.PROMETHEUS_PATH||'/app/prometheus';const JNKIE_API_KEY=process.env.JNKIE_API_KEY;const LUAFREE_API_KEY=process.env.LUAFREE_API_KEY||'';const SERVICE_ID=process.env.JNKIE_SERVICE_ID||'4532';
if(!TOKEN){console.error('TOKEN NOT FOUND');process.exit(1);}
const PRESETS={minify:{v:'Minify',e:'🟢'},weak:{v:'Weak',e:'🔵'},medium:{v:'Medium',e:'🟡'}};
const LUAFREE_PRESETS=['Minifier','Minifier2','Beautify','Basic Minimal','Basic Good','OBFUSCATE V1','Chaotic Good','Chaotic Evil','Dystropic Malevolence'];
client.on('ready',()=>{console.log(`Bot ${client.user.tag} online`);});
client.on('messageCreate',async(msg)=>{if(msg.author.bot)return;const c=msg.content.trim();const args=c.split(/\s+/).slice(1);const cmd=c.split(/\s+/)[0].toLowerCase();try{
if(cmd==='!obf')await obfPrometheus(msg);
else if(cmd==='!lua'||cmd==='!luafree')await obfLuaFree(msg,args);
else if(cmd==='!presets')await showPresets(msg);
else if(cmd==='!service')await handleService(msg,args);
else if(cmd==='!key')await handleKey(msg,args);
else if(cmd==='!provider')await handleProvider(msg,args);
else if(cmd==='!integration')await handleIntegration(msg,args);
else if(cmd==='!raw')await handleRaw(msg,args);
else if(cmd==='!help')await showHelp(msg);
else if(cmd==='!status')await showStatus(msg);
}catch(e){console.error(e);msg.reply(`❌ ${e.message}`);}});

// ========== LUA FREE OBFUSCATOR (FIXED V2) ==========
async function obfLuaFree(msg,args){
if(!LUAFREE_API_KEY)return msg.reply('❌ `LUAFREE_API_KEY` belum di-set\n\nDapatkan API key di: https://luaobfuscator.com');

if(msg.attachments.size===0){
if(args[0]==='list'||args[0]==='presets'){
return msg.reply({embeds:[{title:'🔮 Lua Free Presets',color:0x9b59b6,description:LUAFREE_PRESETS.map((p,i)=>`\`${i+1}\` ${p}`).join('\n'),fields:[{name:'Usage',value:'`!lua [number]` + attach file\nExample: `!lua 1` = Minifier'}]}]});}
return msg.reply({embeds:[{title:'🔮 Lua Free Obfuscator',color:0x9b59b6,description:'Attach file .lua untuk obfuscate',fields:[{name:'Commands',value:'`!lua` + file → Default (Minifier)\n`!lua [1-9]` + file → Pilih preset\n`!lua list` → Lihat presets'}]}]});}

// Parse preset
let presetName='Minifier';
if(args[0]){
const num=parseInt(args[0]);
if(num>=1&&num<=LUAFREE_PRESETS.length)presetName=LUAFREE_PRESETS[num-1];
else{const f=LUAFREE_PRESETS.find(p=>p.toLowerCase().includes(args[0].toLowerCase()));if(f)presetName=f;}}

const att=msg.attachments.first();
const status=await msg.reply(`🔮 **Lua Free Processing...**\n📄 File: ${att.name}\n⚙️ Preset: ${presetName}`);

try{
const script=await downloadFile(att.url);

// Step 1: New Script
await status.edit(`🔮 [1/2] Creating session...`);
const step1=await luaFreeAPI('/v1/obfuscator/newscript',{script});

if(!step1.sessionId){
return status.edit(`❌ Step 1 Failed:\n\`\`\`json\n${JSON.stringify(step1,null,2)}\n\`\`\``);}

const sid=step1.sessionId;
await status.edit(`🔮 [2/2] Obfuscating...\n🆔 Session: \`${sid.substring(0,16)}...\``);

// Step 2: Obfuscate - coba berbagai format
const step2=await luaFreeAPI('/v1/obfuscator/obfuscate',{
sessionId:sid,
preset:presetName,
options:{
Minifier:presetName.includes('Minif'),
EncryptStrings:presetName.includes('Chaotic')||presetName.includes('Dystropic')
}
});

// Check hasil
const result=step2.code||step2.script||step2.result||step2.output;
if(!result||step2.error){
// Coba format lain
const step2b=await luaFreeAPI('/v1/obfuscator/obfuscate',{sessionId:sid});
const result2=step2b.code||step2b.script||step2b.result;
if(!result2){
return status.edit(`❌ Obfuscate Failed:\n**Step2 Response:**\n\`\`\`json\n${JSON.stringify(step2,null,2).substring(0,800)}\n\`\`\`\n**Step2b Response:**\n\`\`\`json\n${JSON.stringify(step2b,null,2).substring(0,800)}\n\`\`\``);}
const file=new AttachmentBuilder(Buffer.from(`-- LuaFree [${presetName}]\n${result2}`),{name:`obf_${att.name}`});
return status.edit({content:`✅ **Success!** (fallback)\n⚙️ ${presetName}`,files:[file]});}

const file=new AttachmentBuilder(Buffer.from(`-- LuaFree [${presetName}]\n${result}`),{name:`obf_${att.name}`});
await status.edit({content:`✅ **Lua Free Success!**\n⚙️ Preset: ${presetName}`,files:[file]});

}catch(e){await status.edit(`❌ Error: ${e.message}`);}}

function luaFreeAPI(endpoint,body){
return new Promise(resolve=>{
const data=JSON.stringify(body);
const req=https.request({
hostname:'api.luaobfuscator.com',
port:443,
path:endpoint,
method:'POST',
headers:{
'Content-Type':'application/json',
'apikey':LUAFREE_API_KEY,
'Content-Length':Buffer.byteLength(data)
}
},res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
try{resolve(JSON.parse(d));}
catch(e){resolve({error:'Invalid JSON',raw:d});}
});
});
req.on('error',e=>resolve({error:e.message}));
req.setTimeout(120000,()=>{req.destroy();resolve({error:'Timeout'});});
req.write(data);
req.end();
});
}

// ========== PROMETHEUS ==========
async function obfPrometheus(msg){
if(msg.attachments.size===0)return msg.reply('❌ Attach file\n`!obf [minify|weak|medium]`');
const att=msg.attachments.first();
const pk=msg.content.split(/\s+/)[1]||'minify';
const preset=PRESETS[pk.toLowerCase()]||PRESETS.minify;
const ts=Date.now();
const inp=path.join(PROMETHEUS_PATH,`in_${ts}.lua`);
const out=path.join(PROMETHEUS_PATH,`out_${ts}.lua`);
try{
const code=await downloadFile(att.url);
fs.writeFileSync(inp,code.replace(/^\uFEFF/,'').trim(),'utf8');
const st=await msg.reply(`🔄 Prometheus ${preset.e}...`);
await execAsync(`cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset.v} "${inp}" --out "${out}" 2>&1`,{timeout:120000});
if(fs.existsSync(out)){
const r=`-- Prometheus [${preset.v}]\n`+fs.readFileSync(out,'utf8');
const f=new AttachmentBuilder(Buffer.from(r),{name:`prom_${att.name}`});
await st.edit({content:'✅ Success',files:[f]});
}else await st.edit('❌ Failed');
}catch(e){msg.reply(`❌ ${e.message}`);}
finally{[inp,out].forEach(f=>{try{fs.unlinkSync(f);}catch(e){}});}
}

// ========== JNKIE API ==========
function jnkieAPI(method,endpoint,body=null){
return new Promise(resolve=>{
const data=body?JSON.stringify(body):'';
const req=https.request({
hostname:'api.jnkie.com',
port:443,
path:`/api/v2${endpoint}`,
method,
headers:{
'Authorization':`Bearer ${JNKIE_API_KEY}`,
'Content-Type':'application/json',
'Accept':'application/json',
...(body?{'Content-Length':Buffer.byteLength(data)}:{})
}
},res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
try{
const j=JSON.parse(d);
resolve({
ok:res.statusCode>=200&&res.statusCode<300,
status:res.statusCode,
data:j,
raw:d
});
}catch(e){
resolve({ok:false,status:res.statusCode,data:null,raw:d,error:'Parse error'});
}
});
});
req.on('error',e=>resolve({ok:false,error:e.message}));
req.setTimeout(15000,()=>{req.destroy();resolve({ok:false,error:'Timeout'});});
if(body)req.write(data);
req.end();
});
}

// ========== RAW DEBUG ==========
async function handleRaw(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const endpoint=args[0]||'/services';
const method=(args[1]||'GET').toUpperCase();
const r=await jnkieAPI(method,endpoint);
msg.reply(`**${method}** \`${endpoint}\`\n**Status:** ${r.status}\n\`\`\`json\n${r.raw?.substring(0,1800)||'No data'}\n\`\`\``);
}

// ========== SERVICE ==========
async function handleService(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

// LIST
if(!sub||sub==='list'){
const r=await jnkieAPI('GET','/services');
if(!r.ok)return msg.reply(`❌ ${r.status}: ${r.raw?.substring(0,500)}`);

// Parse - handle berbagai format
let items=[];
if(Array.isArray(r.data))items=r.data;
else if(r.data?.data&&Array.isArray(r.data.data))items=r.data.data;
else if(r.data?.services)items=r.data.services;
else items=[r.data];

const list=items.filter(Boolean).map(s=>{
const id=s.id||s._id||'?';
const name=s.name||s.title||'Unnamed';
const desc=s.description?` - ${s.description.substring(0,40)}`:'';
return`📦 \`${id}\` **${name}**${desc}`;
}).join('\n');

return msg.reply({embeds:[{title:'📦 Services',color:0x3498db,description:list||'No services found',footer:{text:`Total: ${items.length}`}}]});
}

// GET
if(sub==='get'){
const id=args[1]||SERVICE_ID;
const r=await jnkieAPI('GET',`/services/${id}`);
return msg.reply(`**Service ${id}** (${r.status}):\n\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1800)}\n\`\`\``);
}

// CREATE
if(sub==='create'){
const name=args.slice(1).join(' ')||'New Service';
const r=await jnkieAPI('POST','/services',{name,description:'Created via bot',is_premium:false,keyless_mode:false});
if(r.ok){
const id=r.data?.id||r.data?.data?.id||JSON.stringify(r.data);
return msg.reply(`✅ Service Created!\nID: \`${id}\``);
}
return msg.reply(`❌ Failed:\n\`\`\`${r.raw?.substring(0,500)}\`\`\``);
}

// DELETE
if(sub==='delete'&&args[1]){
const r=await jnkieAPI('DELETE',`/services/${args[1]}`);
return msg.reply(r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

msg.reply('**Service Commands:**\n`!service list`\n`!service get [id]`\n`!service create <name>`\n`!service delete <id>`');
}

// ========== KEY ==========
async function handleKey(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

// LIST
if(!sub||sub==='list'){
const sid=args[1]||SERVICE_ID;
const r=await jnkieAPI('GET',`/keys?serviceId=${sid}&limit=25`);
if(!r.ok)return msg.reply(`❌ ${r.status}:\n\`\`\`${r.raw?.substring(0,500)}\`\`\``);

// Parse
let items=[];
if(Array.isArray(r.data))items=r.data;
else if(r.data?.data)items=r.data.data;
else if(r.data?.keys)items=r.data.keys;

const list=items.slice(0,20).map(k=>{
const key=typeof k.key==='string'?k.key:(typeof k.id==='string'?k.id:String(k.id||'?'));
const display=key.length>25?key.substring(0,25)+'...':key;
const note=k.note?` (${k.note.substring(0,15)})`:'';
const icon=k.is_banned?'🚫':k.is_expired?'⏰':'🔑';
return`${icon} \`${display}\`${note}`;
}).join('\n');

return msg.reply({embeds:[{title:`🔑 Keys - Service ${sid}`,color:0x2ecc71,description:list||'No keys',footer:{text:`Showing ${Math.min(items.length,20)} of ${items.length}`}}]});
}

// CREATE
if(sub==='create'){
const sid=args[1]||SERVICE_ID;
const note=args.slice(2).join(' ')||'Bot created';
const r=await jnkieAPI('POST','/keys',{serviceId:parseInt(sid),note,maxHwids:3});
if(r.ok){
const key=r.data?.key||r.data?.data?.key||JSON.stringify(r.data);
return msg.reply(`✅ **Key Created!**\n\`\`\`${key}\`\`\``);
}
return msg.reply(`❌ Failed:\n\`\`\`${r.raw?.substring(0,500)}\`\`\``);
}

// BATCH
if(sub==='batch'){
const sid=args[1]||SERVICE_ID;
const count=parseInt(args[2])||5;
const r=await jnkieAPI('POST','/keys/batch',{serviceId:parseInt(sid),count,note:'Batch',maxHwids:3});
if(!r.ok)return msg.reply(`❌ Failed:\n\`\`\`${r.raw?.substring(0,500)}\`\`\``);

let keys=[];
if(Array.isArray(r.data))keys=r.data;
else if(r.data?.keys)keys=r.data.keys;
else if(r.data?.data)keys=r.data.data;

const list=keys.slice(0,15).map(k=>{
const v=typeof k==='string'?k:(k.key||k.id||'?');
return`\`${v}\``;
}).join('\n');

return msg.reply({embeds:[{title:`✅ ${keys.length} Keys Created`,color:0x2ecc71,description:list}]});
}

// GET
if(sub==='get'&&args[1]){
const r=await jnkieAPI('GET',`/keys/${args[1]}`);
return msg.reply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1800)}\n\`\`\``);
}

// DELETE
if(sub==='delete'&&args[1]){
const r=await jnkieAPI('DELETE',`/keys/${args[1]}`);
return msg.reply(r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

// BULK DELETE
if(sub==='bulkdelete'||sub==='bulk'){
const ids=args.slice(1).map(i=>parseInt(i)).filter(i=>!isNaN(i));
if(!ids.length)return msg.reply('❌ `!key bulkdelete <id1> <id2> ...`');
const r=await jnkieAPI('POST','/keys/bulk-delete',{ids});
return msg.reply(r.ok?`✅ Deleted ${ids.length} keys`:`❌ ${r.raw?.substring(0,300)}`);
}

// RESET HWID
if(sub==='reset'&&args[1]){
const r=await jnkieAPI('POST',`/keys/${args[1]}/reset-hwid`);
return msg.reply(r.ok?'✅ HWID Reset':`❌ ${r.raw?.substring(0,300)}`);
}

msg.reply({embeds:[{title:'🔑 Key Commands',color:0x2ecc71,description:
`\`!key list [serviceId]\` - List keys
\`!key create [serviceId] [note]\` - Create 1 key
\`!key batch [serviceId] [count]\` - Create batch
\`!key get <keyId>\` - Get detail
\`!key delete <keyId>\` - Delete key
\`!key bulkdelete <ids...>\` - Delete multiple
\`!key reset <keyId>\` - Reset HWID`,footer:{text:`Default Service: ${SERVICE_ID}`}}]});
}

// ========== PROVIDER ==========
async function handleProvider(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

if(!sub||sub==='list'){
const r=await jnkieAPI('GET','/providers');
if(!r.ok)return msg.reply(`❌ ${r.raw?.substring(0,500)}`);
let items=Array.isArray(r.data)?r.data:(r.data?.data||[]);
const list=items.map(p=>`📦 \`${p.id}\` **${p.name||'?'}** (${p.type||'?'})`).join('\n');
return msg.reply({embeds:[{title:'📦 Providers',color:0xe67e22,description:list||'No providers'}]});
}

if(sub==='get'&&args[1]){
const r=await jnkieAPI('GET',`/providers/${args[1]}`);
return msg.reply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1800)}\n\`\`\``);
}

if(sub==='create'){
const name=args[1]||'New Provider';
const r=await jnkieAPI('POST','/providers',{name,type:'custom'});
return msg.reply(r.ok?`✅ Created: ${r.data?.id||JSON.stringify(r.data)}`:`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='delete'&&args[1]){
const r=await jnkieAPI('DELETE',`/providers/${args[1]}`);
return msg.reply(r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

msg.reply('`!provider list/get/create/delete`');
}

// ========== INTEGRATION ==========
async function handleIntegration(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

if(!sub||sub==='list'){
const r=await jnkieAPI('GET','/integrations');
if(!r.ok)return msg.reply(`❌ ${r.raw?.substring(0,500)}`);
let items=Array.isArray(r.data)?r.data:(r.data?.data||[]);
const list=items.map(i=>`🔗 \`${i.id}\` **${i.name||'?'}** (${i.type||'?'})`).join('\n');
return msg.reply({embeds:[{title:'🔗 Integrations',color:0x9b59b6,description:list||'No integrations'}]});
}

if(sub==='types'){
const r=await jnkieAPI('GET','/integrations/types');
return msg.reply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1800)}\n\`\`\``);
}

if(sub==='get'&&args[1]){
const r=await jnkieAPI('GET',`/integrations/${args[1]}`);
return msg.reply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1800)}\n\`\`\``);
}

if(sub==='delete'&&args[1]){
const r=await jnkieAPI('DELETE',`/integrations/${args[1]}`);
return msg.reply(r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

msg.reply('`!integration list/types/get/delete`');
}

// ========== HELP & STATUS ==========
async function showPresets(msg){
msg.reply({embeds:[{title:'⚙️ Presets',color:0x9b59b6,fields:[
{name:'🔮 Lua Free',value:LUAFREE_PRESETS.map((p,i)=>`\`${i+1}\` ${p}`).join('\n')},
{name:'⚡ Prometheus',value:'`minify` `weak` `medium`'}
]}]});
}

async function showHelp(msg){
msg.reply({embeds:[{title:'📖 Commands',color:0x3498db,fields:[
{name:'🔮 Obfuscate',value:'`!obf` + file → Prometheus\n`!lua [1-9]` + file → LuaFree\n`!presets` → List all'},
{name:'📦 Service',value:'`!service list/get/create/delete`'},
{name:'🔑 Keys',value:'`!key list/create/batch/get/delete/reset`'},
{name:'📦 Provider',value:'`!provider list/get/create/delete`'},
{name:'🔗 Integration',value:'`!integration list/types/get/delete`'},
{name:'🔧 Debug',value:'`!raw [endpoint] [method]`\n`!status`'}
],footer:{text:`Service: ${SERVICE_ID}`}}]});
}

async function showStatus(msg){
const s=await jnkieAPI('GET','/services');
const k=await jnkieAPI('GET',`/keys?serviceId=${SERVICE_ID}&limit=1`);
const p=await jnkieAPI('GET','/providers');
const i=await jnkieAPI('GET','/integrations');

const sCount=Array.isArray(s.data)?s.data.length:(s.data?.data?.length||0);
const pCount=Array.isArray(p.data)?p.data.length:(p.data?.data?.length||0);
const iCount=Array.isArray(i.data)?i.data.length:(i.data?.data?.length||0);

msg.reply({embeds:[{title:'📊 Status',color:0x2ecc71,fields:[
{name:'🤖 Bot',value:'Online ✅',inline:true},
{name:'🔑 jnkie API',value:JNKIE_API_KEY?`✅ (${s.status})`:'❌',inline:true},
{name:'🔮 LuaFree API',value:LUAFREE_API_KEY?'✅':'❌',inline:true},
{name:'📦 Services',value:String(sCount),inline:true},
{name:'📦 Providers',value:String(pCount),inline:true},
{name:'🔗 Integrations',value:String(iCount),inline:true}
],footer:{text:`Default Service ID: ${SERVICE_ID}`}}]});
}

// ========== HELPER ==========
function downloadFile(url){
return new Promise((resolve,reject)=>{
https.get(url,res=>{
const d=[];
res.on('data',c=>d.push(c));
res.on('end',()=>resolve(Buffer.concat(d).toString()));
}).on('error',reject);
});
}

client.login(TOKEN);
