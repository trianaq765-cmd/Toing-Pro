const{Client,GatewayIntentBits,AttachmentBuilder}=require('discord.js');const{exec}=require('child_process');const fs=require('fs');const path=require('path');const http=require('http');const https=require('https');const{promisify}=require('util');const execAsync=promisify(exec);
const PORT=process.env.PORT||3000;http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');}).listen(PORT);
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
const TOKEN=process.env.DISCORD_TOKEN;
const PROMETHEUS_PATH=process.env.PROMETHEUS_PATH||'/app/prometheus';
const JNKIE_API_KEY=process.env.JNKIE_API_KEY;
const LUAFREE_API_KEY=process.env.LUAFREE_API_KEY||'';
const SERVICE_ID=process.env.JNKIE_SERVICE_ID||'4532';
if(!TOKEN){console.error('TOKEN NOT FOUND');process.exit(1);}

const PRESETS={minify:{v:'Minify',e:'🟢'},weak:{v:'Weak',e:'🔵'},medium:{v:'Medium',e:'🟡'}};
const LUAFREE_PRESETS=['Minifier','Minifier2','Beautify','Basic Minimal','Basic Good','OBFUSCATE (old)','OBFUSCATE V1','Chaotic Good','Chaotic Evil','Dystropic Malevolence'];

client.on('ready',()=>console.log(`Bot ${client.user.tag} online`));
client.on('messageCreate',async(msg)=>{
if(msg.author.bot)return;
const c=msg.content.trim();
const args=c.split(/\s+/).slice(1);
const cmd=c.split(/\s+/)[0].toLowerCase();
try{
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
}catch(e){console.error(e);msg.reply(`❌ ${e.message}`);}
});

// ========== LUA FREE OBFUSCATOR (FIXED V3) ==========
async function obfLuaFree(msg,args){
if(!LUAFREE_API_KEY)return msg.reply('❌ `LUAFREE_API_KEY` not set\nGet at: https://luaobfuscator.com/dashboard');

if(msg.attachments.size===0){
if(args[0]==='list')return msg.reply({embeds:[{title:'🔮 Lua Free Presets',color:0x9b59b6,description:LUAFREE_PRESETS.map((p,i)=>`\`${i+1}\` ${p}`).join('\n'),footer:{text:'Usage: !lua [number] + attach file'}}]});
return msg.reply({embeds:[{title:'🔮 Lua Free',color:0x9b59b6,description:'Attach .lua file',fields:[{name:'Usage',value:'`!lua` + file\n`!lua 1` + file\n`!lua list`'}]}]});
}

let preset='Minifier';
if(args[0]){
const n=parseInt(args[0]);
if(n>=1&&n<=LUAFREE_PRESETS.length)preset=LUAFREE_PRESETS[n-1];
else{const f=LUAFREE_PRESETS.find(p=>p.toLowerCase().includes(args[0].toLowerCase()));if(f)preset=f;}
}

const att=msg.attachments.first();
const status=await msg.reply(`🔮 **Processing...**\n📄 ${att.name}\n⚙️ ${preset}`);

try{
const script=await downloadFile(att.url);

// Step 1: New Script
await status.edit(`🔮 [1/2] Creating session...`);
const step1=await luaFreeReq('POST','/v1/obfuscator/newscript',{script});

if(!step1.sessionId){
return status.edit(`❌ Step1 Failed:\n\`\`\`json\n${JSON.stringify(step1,null,2).substring(0,1500)}\n\`\`\``);}

const sid=step1.sessionId;
await status.edit(`🔮 [2/2] Obfuscating...\n🆔 ${sid.substring(0,20)}...`);

// Step 2: Obfuscate - Multiple attempts with different body formats
let result=null;
const bodies=[
{sessionId:sid,preset},
{sessionId:sid,preset,options:{}},
{sessionId:sid,preset:preset,node:false},
{sessionId:sid}
];

for(const body of bodies){
const step2=await luaFreeReq('POST','/v1/obfuscator/obfuscate',body);
if(step2.code||step2.script||step2.result){
result=step2.code||step2.script||step2.result;
break;
}
if(step2.message&&step2.message.includes('success')){
result=step2.code||step2.script||'-- Obfuscated (check response)';
break;
}
}

if(!result){
// Try alternative endpoint
const alt=await luaFreeReq('GET',`/v1/obfuscator/download/${sid}`);
if(alt.code||alt.script||typeof alt==='string'){
result=alt.code||alt.script||alt;
}
}

if(!result){
return status.edit(`❌ Obfuscate Failed\n\nTry these:\n1. Check API key valid\n2. Try simpler preset\n3. Use \`!obf\` (Prometheus)`);}

const file=new AttachmentBuilder(Buffer.from(`-- LuaFree [${preset}]\n${result}`),{name:`obf_${att.name}`});
await status.edit({content:`✅ **Success!**\n⚙️ ${preset}`,files:[file]});

}catch(e){await status.edit(`❌ ${e.message}`);}
}

function luaFreeReq(method,endpoint,body=null){
return new Promise(resolve=>{
const data=body?JSON.stringify(body):'';
const opts={
hostname:'api.luaobfuscator.com',
port:443,
path:endpoint,
method,
headers:{
'Content-Type':'application/json',
'Accept':'application/json',
'apikey':LUAFREE_API_KEY,
'User-Agent':'Mozilla/5.0'
}
};
if(body)opts.headers['Content-Length']=Buffer.byteLength(data);

const req=https.request(opts,res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
try{resolve(JSON.parse(d));}
catch(e){resolve({error:'Parse failed',raw:d,status:res.statusCode});}
});
});
req.on('error',e=>resolve({error:e.message}));
req.setTimeout(120000,()=>{req.destroy();resolve({error:'Timeout'});});
if(body)req.write(data);
req.end();
});
}

// ========== PROMETHEUS ==========
async function obfPrometheus(msg){
if(msg.attachments.size===0)return msg.reply('❌ Attach .lua file\n`!obf [minify|weak|medium]`');
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
await st.edit({content:'✅ Success',files:[new AttachmentBuilder(Buffer.from(r),{name:`prom_${att.name}`})]});
}else await st.edit('❌ Failed');
}catch(e){msg.reply(`❌ ${e.message}`);}
finally{[inp,out].forEach(f=>{try{fs.unlinkSync(f);}catch(e){}});}
}

// ========== JNKIE API (FIXED PARSING) ==========
function jnkieReq(method,endpoint,body=null){
return new Promise(resolve=>{
const data=body?JSON.stringify(body):'';
const opts={
hostname:'api.jnkie.com',
port:443,
path:`/api/v2${endpoint}`,
method,
headers:{
'Authorization':`Bearer ${JNKIE_API_KEY}`,
'Content-Type':'application/json',
'Accept':'application/json'
}
};
if(body)opts.headers['Content-Length']=Buffer.byteLength(data);

const req=https.request(opts,res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
try{
const j=JSON.parse(d);
resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:j,raw:d});
}catch(e){resolve({ok:false,status:res.statusCode,error:'Parse error',raw:d});}
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
const ep=args[0]||'/services';
const m=(args[1]||'GET').toUpperCase();
const r=await jnkieReq(m,ep);
msg.reply(`**${m}** \`${ep}\` (${r.status})\n\`\`\`json\n${r.raw?.substring(0,1850)||'empty'}\n\`\`\``);
}

// ========== SERVICE (FIXED) ==========
async function handleService(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

if(!sub||sub==='list'){
const r=await jnkieReq('GET','/services');
if(!r.ok)return msg.reply(`❌ ${r.status}: ${r.raw?.substring(0,500)}`);
// Parse nested: {"services":[...]} atau langsung [...]
let items=[];
if(Array.isArray(r.data))items=r.data;
else if(r.data?.services)items=r.data.services;
else if(r.data?.data)items=r.data.data;
const list=items.map(s=>`📦 \`${s.id}\` **${s.name||'?'}** - ${(s.description||'').substring(0,30)}`).join('\n');
return msg.reply({embeds:[{title:'📦 Services',color:0x3498db,description:list||'No services',footer:{text:`Total: ${items.length}`}}]});
}

if(sub==='get'){
const id=args[1]||SERVICE_ID;
const r=await jnkieReq('GET',`/services/${id}`);
// Response: {"service":{...}}
const svc=r.data?.service||r.data;
return msg.reply(`**Service ${id}**\n\`\`\`json\n${JSON.stringify(svc,null,2).substring(0,1850)}\n\`\`\``);
}

if(sub==='create'){
const name=args.slice(1).join(' ')||'New Service';
const r=await jnkieReq('POST','/services',{name,description:'Bot created',is_premium:false,keyless_mode:false});
const id=r.data?.service?.id||r.data?.id||JSON.stringify(r.data);
return msg.reply(r.ok?`✅ Created: \`${id}\``:`❌ ${r.raw?.substring(0,500)}`);
}

if(sub==='delete'&&args[1]){
const r=await jnkieReq('DELETE',`/services/${args[1]}`);
return msg.reply(r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

msg.reply('`!service list/get/create/delete`');
}

// ========== KEY (FIXED) ==========
async function handleKey(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

if(!sub||sub==='list'){
const sid=args[1]||SERVICE_ID;
const r=await jnkieReq('GET',`/keys?serviceId=${sid}&limit=25`);
if(!r.ok)return msg.reply(`❌ ${r.status}: ${r.raw?.substring(0,500)}`);
// Response: {"keys":[...]}
let items=[];
if(Array.isArray(r.data))items=r.data;
else if(r.data?.keys)items=r.data.keys;
else if(r.data?.data)items=r.data.data;

const list=items.slice(0,20).map(k=>{
const key=k.key_value||k.key||k.id||'?';
const display=String(key).substring(0,28);
const exp=k.expires_at?new Date(k.expires_at).toLocaleDateString():'∞';
const icon=k.is_invalidated?'🚫':'🔑';
return`${icon} \`${display}...\` exp:${exp}`;
}).join('\n');

return msg.reply({embeds:[{title:`🔑 Keys (Service ${sid})`,color:0x2ecc71,description:list||'No keys',footer:{text:`Total: ${items.length}`}}]});
}

if(sub==='create'){
const sid=parseInt(args[1])||parseInt(SERVICE_ID);
const note=args.slice(2).join(' ')||'Bot';
const r=await jnkieReq('POST','/keys',{serviceId:sid,note,maxHwids:3});
const key=r.data?.key?.key_value||r.data?.key_value||r.data?.key||JSON.stringify(r.data);
return msg.reply(r.ok?`✅ **Key Created!**\n\`\`\`${key}\`\`\``:`❌ ${r.raw?.substring(0,500)}`);
}

if(sub==='batch'){
const sid=parseInt(args[1])||parseInt(SERVICE_ID);
const count=parseInt(args[2])||5;
const r=await jnkieReq('POST','/keys/batch',{serviceId:sid,count,note:'Batch',maxHwids:3});
if(!r.ok)return msg.reply(`❌ ${r.raw?.substring(0,500)}`);
let keys=r.data?.keys||r.data||[];
const list=keys.slice(0,15).map(k=>`\`${k.key_value||k.key||k}\``).join('\n');
return msg.reply({embeds:[{title:`✅ ${keys.length} Keys Created`,color:0x2ecc71,description:list}]});
}

if(sub==='get'&&args[1]){
const r=await jnkieReq('GET',`/keys/${args[1]}`);
const key=r.data?.key||r.data;
return msg.reply(`\`\`\`json\n${JSON.stringify(key,null,2).substring(0,1850)}\n\`\`\``);
}

if(sub==='delete'&&args[1]){
const r=await jnkieReq('DELETE',`/keys/${args[1]}`);
return msg.reply(r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='bulkdelete'||sub==='bulk'){
const ids=args.slice(1).map(i=>parseInt(i)).filter(i=>!isNaN(i));
if(!ids.length)return msg.reply('`!key bulkdelete <id1> <id2>...`');
const r=await jnkieReq('POST','/keys/bulk-delete',{ids});
return msg.reply(r.ok?`✅ Deleted ${ids.length}`:`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='reset'&&args[1]){
const r=await jnkieReq('POST',`/keys/${args[1]}/reset-hwid`);
return msg.reply(r.ok?'✅ HWID Reset':`❌ ${r.raw?.substring(0,300)}`);
}

msg.reply({embeds:[{title:'🔑 Key Commands',color:0x2ecc71,description:`\`!key list [serviceId]\`
\`!key create [serviceId] [note]\`
\`!key batch [serviceId] [count]\`
\`!key get <keyId>\`
\`!key delete <keyId>\`
\`!key bulkdelete <ids...>\`
\`!key reset <keyId>\``,footer:{text:`Default: ${SERVICE_ID}`}}]});
}

// ========== PROVIDER (FIXED) ==========
async function handleProvider(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

if(!sub||sub==='list'){
const r=await jnkieReq('GET','/providers');
if(!r.ok)return msg.reply(`❌ ${r.raw?.substring(0,500)}`);
let items=r.data?.providers||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items];
const list=items.map(p=>`📦 \`${p.id}\` **${p.name||'?'}** (${p.key_valid_minutes||0}min)`).join('\n');
return msg.reply({embeds:[{title:'📦 Providers',color:0xe67e22,description:list||'No providers'}]});
}

if(sub==='get'&&args[1]){
const r=await jnkieReq('GET',`/providers/${args[1]}`);
const p=r.data?.provider||r.data;
return msg.reply(`\`\`\`json\n${JSON.stringify(p,null,2).substring(0,1850)}\n\`\`\``);
}

if(sub==='create'){
const name=args[1]||'New Provider';
const r=await jnkieReq('POST','/providers',{name,key_valid_minutes:60,is_active:true});
const id=r.data?.provider?.id||r.data?.id;
return msg.reply(r.ok?`✅ Created: \`${id}\``:`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='delete'&&args[1]){
const r=await jnkieReq('DELETE',`/providers/${args[1]}`);
return msg.reply(r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

msg.reply('`!provider list/get/create/delete`');
}

// ========== INTEGRATION (FIXED) ==========
async function handleIntegration(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

if(!sub||sub==='list'){
const r=await jnkieReq('GET','/integrations');
if(!r.ok)return msg.reply(`❌ ${r.raw?.substring(0,500)}`);
let items=r.data?.integrations||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items];
const list=items.map(i=>`🔗 \`${i.id}\` **${i.name||'?'}** (${i.type||'?'})`).join('\n');
return msg.reply({embeds:[{title:'🔗 Integrations',color:0x9b59b6,description:list||'No integrations'}]});
}

if(sub==='types'){
const r=await jnkieReq('GET','/integrations/types');
return msg.reply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1850)}\n\`\`\``);
}

if(sub==='get'&&args[1]){
const r=await jnkieReq('GET',`/integrations/${args[1]}`);
const i=r.data?.integration||r.data;
return msg.reply(`\`\`\`json\n${JSON.stringify(i,null,2).substring(0,1850)}\n\`\`\``);
}

if(sub==='delete'&&args[1]){
const r=await jnkieReq('DELETE',`/integrations/${args[1]}`);
return msg.reply(r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

msg.reply('`!integration list/types/get/delete`');
}

// ========== HELP & STATUS ==========
async function showPresets(msg){
msg.reply({embeds:[{title:'⚙️ Presets',color:0x9b59b6,fields:[
{name:'🔮 Lua Free (!lua)',value:LUAFREE_PRESETS.map((p,i)=>`\`${i+1}\` ${p}`).join('\n')},
{name:'⚡ Prometheus (!obf)',value:'`minify` `weak` `medium`'}
]}]});
}

async function showHelp(msg){
msg.reply({embeds:[{title:'📖 Commands',color:0x3498db,fields:[
{name:'🔮 Obfuscate',value:'`!obf` + file → Prometheus\n`!lua [1-10]` + file → LuaFree\n`!presets`'},
{name:'📦 Service',value:'`!service list/get/create/delete`'},
{name:'🔑 Key',value:'`!key list/create/batch/get/delete/reset`'},
{name:'📦 Provider',value:'`!provider list/get/create/delete`'},
{name:'🔗 Integration',value:'`!integration list/types/get/delete`'},
{name:'🔧 Debug',value:'`!raw [endpoint]` `!status`'}
],footer:{text:`Service: ${SERVICE_ID}`}}]});
}

async function showStatus(msg){
const s=await jnkieReq('GET','/services');
const k=await jnkieReq('GET',`/keys?serviceId=${SERVICE_ID}&limit=1`);
const p=await jnkieReq('GET','/providers');
const i=await jnkieReq('GET','/integrations');

const sItems=s.data?.services||s.data||[];
const kItems=k.data?.keys||k.data||[];
const pItems=p.data?.providers||p.data||[];
const iItems=i.data?.integrations||i.data||[];

msg.reply({embeds:[{title:'📊 Status',color:0x2ecc71,fields:[
{name:'🤖 Bot',value:'✅ Online',inline:true},
{name:'🔑 jnkie',value:JNKIE_API_KEY?`✅ (${s.status})`:'❌',inline:true},
{name:'🔮 LuaFree',value:LUAFREE_API_KEY?'✅':'❌',inline:true},
{name:'📦 Services',value:String(Array.isArray(sItems)?sItems.length:1),inline:true},
{name:'📦 Providers',value:String(Array.isArray(pItems)?pItems.length:1),inline:true},
{name:'🔗 Integrations',value:String(Array.isArray(iItems)?iItems.length:1),inline:true}
],footer:{text:`Default Service: ${SERVICE_ID}`}}]});
}

// ========== HELPER ==========
function downloadFile(url){
return new Promise((r,j)=>{https.get(url,res=>{const d=[];res.on('data',c=>d.push(c));res.on('end',()=>r(Buffer.concat(d).toString()));}).on('error',j);});
}

client.login(TOKEN);
