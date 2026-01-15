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
}catch(e){console.error(e);safeReply(msg,`❌ ${e.message}`);}
});

// ========== SAFE REPLY (Handle deleted messages) ==========
async function safeReply(msg,content){
try{return await msg.reply(content);}
catch(e){
if(e.code===50035||e.message.includes('Unknown message')){
return await msg.channel.send(content);
}
throw e;
}}

async function safeEdit(statusMsg,content){
try{return await statusMsg.edit(content);}
catch(e){
if(e.code===50035||e.message.includes('Unknown message')){
return await statusMsg.channel.send(typeof content==='string'?content:content.content||'Updated');
}
throw e;
}}

// ========== LUA FREE OBFUSCATOR (CORRECT API FORMAT) ==========
async function obfLuaFree(msg,args){
if(!LUAFREE_API_KEY)return safeReply(msg,'❌ `LUAFREE_API_KEY` not set\nGet at: https://luaobfuscator.com/dashboard');

if(msg.attachments.size===0){
if(args[0]==='list')return safeReply(msg,{embeds:[{title:'🔮 Lua Free Options',color:0x9b59b6,description:'**Plugins:**\n`Minifier` `Minifier2` `EncryptStrings`\n`Virtualize` `ConstantArray` `BytecodeShuffle`\n`WatermarkCheck` `JunkCode`',fields:[{name:'Usage',value:'`!lua` + file → Default (Minifier)\n`!lua vm` + file → Virtualize\n`!lua strong` + file → Strong protection'}]}]});
return safeReply(msg,{embeds:[{title:'🔮 Lua Free',color:0x9b59b6,description:'Attach .lua file',fields:[{name:'Commands',value:'`!lua` + file\n`!lua vm` + file (Virtualize)\n`!lua strong` + file\n`!lua list`'}]}]});
}

// Parse options
let options={MinifiyAll:true};
const arg=args[0]?.toLowerCase();
if(arg==='vm'||arg==='virtualize'){
options={MinifiyAll:true,Virtualize:true};
}else if(arg==='strong'||arg==='max'){
options={MinifiyAll:true,Virtualize:true,EncryptStrings:true,ConstantArray:true};
}else if(arg==='encrypt'){
options={MinifiyAll:true,EncryptStrings:true};
}

const att=msg.attachments.first();
const status=await safeReply(msg,`🔮 **Lua Free Processing...**\n📄 ${att.name}`);

try{
const script=await downloadFile(att.url);

// Step 1: Create session - CORRECT FORMAT (content-type: text, raw script body)
await safeEdit(status,'🔮 [1/2] Creating session...');
const step1=await luaFreeNewScript(script);

if(!step1.sessionId){
return safeEdit(status,`❌ Session Failed:\n\`\`\`json\n${JSON.stringify(step1,null,2).substring(0,1500)}\n\`\`\``);}

const sessionId=step1.sessionId;
await safeEdit(status,`🔮 [2/2] Obfuscating...\n🆔 ${sessionId.substring(0,20)}...`);

// Step 2: Obfuscate - CORRECT FORMAT (sessionId in header, options in body)
const step2=await luaFreeObfuscate(sessionId,options);

if(!step2.code){
return safeEdit(status,`❌ Obfuscate Failed:\n\`\`\`json\n${JSON.stringify(step2,null,2).substring(0,1500)}\n\`\`\``);}

const header=`-- Obfuscated with LuaFree\n-- Options: ${Object.keys(options).join(', ')}\n\n`;
const file=new AttachmentBuilder(Buffer.from(header+step2.code),{name:`obf_${att.name}`});
await safeEdit(status,{content:`✅ **Success!**\n⚙️ ${Object.keys(options).join(', ')}`,files:[file]});

}catch(e){await safeEdit(status,`❌ ${e.message}`);}
}

// Step 1: New Script - content-type: text, raw script body
function luaFreeNewScript(script){
return new Promise(resolve=>{
const req=https.request({
hostname:'api.luaobfuscator.com',
port:443,
path:'/v1/obfuscator/newscript',
method:'POST',
headers:{
'Content-Type':'text/plain',
'apikey':LUAFREE_API_KEY,
'Content-Length':Buffer.byteLength(script)
}
},res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
try{resolve(JSON.parse(d));}
catch(e){resolve({error:'Parse failed',raw:d});}
});
});
req.on('error',e=>resolve({error:e.message}));
req.setTimeout(60000,()=>{req.destroy();resolve({error:'Timeout'});});
req.write(script);
req.end();
});
}

// Step 2: Obfuscate - sessionId in header, options in body
function luaFreeObfuscate(sessionId,options){
return new Promise(resolve=>{
const body=JSON.stringify(options);
const req=https.request({
hostname:'api.luaobfuscator.com',
port:443,
path:'/v1/obfuscator/obfuscate',
method:'POST',
headers:{
'Content-Type':'application/json',
'apikey':LUAFREE_API_KEY,
'sessionId':sessionId,
'Content-Length':Buffer.byteLength(body)
}
},res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
try{resolve(JSON.parse(d));}
catch(e){resolve({error:'Parse failed',raw:d});}
});
});
req.on('error',e=>resolve({error:e.message}));
req.setTimeout(120000,()=>{req.destroy();resolve({error:'Timeout'});});
req.write(body);
req.end();
});
}

// ========== PROMETHEUS ==========
async function obfPrometheus(msg){
if(msg.attachments.size===0)return safeReply(msg,'❌ Attach .lua\n`!obf [minify|weak|medium]`');
const att=msg.attachments.first();
const pk=msg.content.split(/\s+/)[1]||'minify';
const preset=PRESETS[pk.toLowerCase()]||PRESETS.minify;
const ts=Date.now();
const inp=path.join(PROMETHEUS_PATH,`in_${ts}.lua`);
const out=path.join(PROMETHEUS_PATH,`out_${ts}.lua`);
try{
const code=await downloadFile(att.url);
fs.writeFileSync(inp,code.replace(/^\uFEFF/,'').trim(),'utf8');
const st=await safeReply(msg,`🔄 Prometheus ${preset.e}...`);
await execAsync(`cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset.v} "${inp}" --out "${out}" 2>&1`,{timeout:120000});
if(fs.existsSync(out)){
const r=`-- Prometheus [${preset.v}]\n`+fs.readFileSync(out,'utf8');
await safeEdit(st,{content:'✅ Success',files:[new AttachmentBuilder(Buffer.from(r),{name:`prom_${att.name}`})]});
}else await safeEdit(st,'❌ Failed');
}catch(e){safeReply(msg,`❌ ${e.message}`);}
finally{[inp,out].forEach(f=>{try{fs.unlinkSync(f);}catch(e){}});}
}

// ========== JNKIE API ==========
function jnkieReq(method,endpoint,body=null){
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
try{resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:JSON.parse(d),raw:d});}
catch(e){resolve({ok:false,status:res.statusCode,error:'Parse',raw:d});}
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
if(!JNKIE_API_KEY)return safeReply(msg,'❌ JNKIE_API_KEY not set');
const ep=args[0]||'/services';
const m=(args[1]||'GET').toUpperCase();
const r=await jnkieReq(m,ep);
safeReply(msg,`**${m}** \`${ep}\` (${r.status})\n\`\`\`json\n${r.raw?.substring(0,1850)||'empty'}\n\`\`\``);
}

// ========== SERVICE ==========
async function handleService(msg,args){
if(!JNKIE_API_KEY)return safeReply(msg,'❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

if(!sub||sub==='list'){
const r=await jnkieReq('GET','/services');
if(!r.ok)return safeReply(msg,`❌ ${r.status}: ${r.raw?.substring(0,500)}`);
let items=r.data?.services||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items];
const list=items.map(s=>`📦 \`${s.id}\` **${s.name||'?'}**`).join('\n');
return safeReply(msg,{embeds:[{title:'📦 Services',color:0x3498db,description:list||'No services'}]});
}

if(sub==='get'){
const id=args[1]||SERVICE_ID;
const r=await jnkieReq('GET',`/services/${id}`);
const svc=r.data?.service||r.data;
return safeReply(msg,`\`\`\`json\n${JSON.stringify(svc,null,2).substring(0,1850)}\n\`\`\``);
}

if(sub==='create'){
const name=args.slice(1).join(' ')||'New Service';
const r=await jnkieReq('POST','/services',{name,description:'Bot',is_premium:false,keyless_mode:false});
const id=r.data?.service?.id||r.data?.id;
return safeReply(msg,r.ok?`✅ Created: \`${id}\``:`❌ ${r.raw?.substring(0,400)}`);
}

if(sub==='delete'&&args[1]){
const r=await jnkieReq('DELETE',`/services/${args[1]}`);
return safeReply(msg,r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

safeReply(msg,'`!service list/get/create/delete`');
}

// ========== KEY ==========
async function handleKey(msg,args){
if(!JNKIE_API_KEY)return safeReply(msg,'❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

if(!sub||sub==='list'){
const sid=args[1]||SERVICE_ID;
const r=await jnkieReq('GET',`/keys?serviceId=${sid}&limit=25`);
if(!r.ok)return safeReply(msg,`❌ ${r.status}: ${r.raw?.substring(0,500)}`);
let items=r.data?.keys||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[];
const list=items.slice(0,20).map(k=>{
const key=String(k.key_value||k.key||k.id||'?');
const exp=k.expires_at?new Date(k.expires_at).toLocaleDateString():'∞';
return`🔑 \`${key.substring(0,25)}...\` exp:${exp}`;
}).join('\n');
return safeReply(msg,{embeds:[{title:`🔑 Keys (${sid})`,color:0x2ecc71,description:list||'No keys',footer:{text:`Total: ${items.length}`}}]});
}

if(sub==='create'){
const sid=parseInt(args[1])||parseInt(SERVICE_ID);
const note=args.slice(2).join(' ')||'Bot';
const r=await jnkieReq('POST','/keys',{serviceId:sid,note,maxHwids:3});
const key=r.data?.key?.key_value||r.data?.key_value||r.data?.key;
return safeReply(msg,r.ok?`✅ **Key Created!**\n\`\`\`${key||JSON.stringify(r.data)}\`\`\``:`❌ ${r.raw?.substring(0,500)}`);
}

if(sub==='batch'){
const sid=parseInt(args[1])||parseInt(SERVICE_ID);
const count=parseInt(args[2])||5;
const r=await jnkieReq('POST','/keys/batch',{serviceId:sid,count,note:'Batch',maxHwids:3});
if(!r.ok)return safeReply(msg,`❌ ${r.raw?.substring(0,500)}`);
let keys=r.data?.keys||r.data||[];
const list=keys.slice(0,15).map(k=>`\`${k.key_value||k.key||k}\``).join('\n');
return safeReply(msg,{embeds:[{title:`✅ ${keys.length} Keys`,color:0x2ecc71,description:list}]});
}

if(sub==='get'&&args[1]){
const r=await jnkieReq('GET',`/keys/${args[1]}`);
const k=r.data?.key||r.data;
return safeReply(msg,`\`\`\`json\n${JSON.stringify(k,null,2).substring(0,1850)}\n\`\`\``);
}

if(sub==='delete'&&args[1]){
const r=await jnkieReq('DELETE',`/keys/${args[1]}`);
return safeReply(msg,r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='bulkdelete'||sub==='bulk'){
const ids=args.slice(1).map(i=>parseInt(i)).filter(i=>!isNaN(i));
if(!ids.length)return safeReply(msg,'`!key bulkdelete <id1> <id2>...`');
const r=await jnkieReq('POST','/keys/bulk-delete',{ids});
return safeReply(msg,r.ok?`✅ Deleted ${ids.length}`:`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='reset'&&args[1]){
const r=await jnkieReq('POST',`/keys/${args[1]}/reset-hwid`);
return safeReply(msg,r.ok?'✅ HWID Reset':`❌ ${r.raw?.substring(0,300)}`);
}

safeReply(msg,{embeds:[{title:'🔑 Key Commands',color:0x2ecc71,description:`\`!key list [sid]\`\n\`!key create [sid] [note]\`\n\`!key batch [sid] [count]\`\n\`!key get <id>\`\n\`!key delete <id>\`\n\`!key reset <id>\``,footer:{text:`Default: ${SERVICE_ID}`}}]});
}

// ========== PROVIDER ==========
async function handleProvider(msg,args){
if(!JNKIE_API_KEY)return safeReply(msg,'❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

if(!sub||sub==='list'){
const r=await jnkieReq('GET','/providers');
if(!r.ok)return safeReply(msg,`❌ ${r.raw?.substring(0,500)}`);
let items=r.data?.providers||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items];
const list=items.map(p=>`📦 \`${p.id}\` **${p.name||'?'}** (${p.key_valid_minutes||0}min)`).join('\n');
return safeReply(msg,{embeds:[{title:'📦 Providers',color:0xe67e22,description:list||'No providers'}]});
}

if(sub==='get'&&args[1]){
const r=await jnkieReq('GET',`/providers/${args[1]}`);
const p=r.data?.provider||r.data;
return safeReply(msg,`\`\`\`json\n${JSON.stringify(p,null,2).substring(0,1850)}\n\`\`\``);
}

if(sub==='create'){
const name=args[1]||'New';
const r=await jnkieReq('POST','/providers',{name,key_valid_minutes:60,is_active:true});
const id=r.data?.provider?.id||r.data?.id;
return safeReply(msg,r.ok?`✅ Created: \`${id}\``:`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='delete'&&args[1]){
const r=await jnkieReq('DELETE',`/providers/${args[1]}`);
return safeReply(msg,r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

safeReply(msg,'`!provider list/get/create/delete`');
}

// ========== INTEGRATION ==========
async function handleIntegration(msg,args){
if(!JNKIE_API_KEY)return safeReply(msg,'❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

if(!sub||sub==='list'){
const r=await jnkieReq('GET','/integrations');
if(!r.ok)return safeReply(msg,`❌ ${r.raw?.substring(0,500)}`);
let items=r.data?.integrations||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items];
const list=items.map(i=>`🔗 \`${i.id}\` **${i.name||'?'}** (${i.type||'?'})`).join('\n');
return safeReply(msg,{embeds:[{title:'🔗 Integrations',color:0x9b59b6,description:list||'No integrations'}]});
}

if(sub==='types'){
const r=await jnkieReq('GET','/integrations/types');
return safeReply(msg,`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1850)}\n\`\`\``);
}

if(sub==='get'&&args[1]){
const r=await jnkieReq('GET',`/integrations/${args[1]}`);
const i=r.data?.integration||r.data;
return safeReply(msg,`\`\`\`json\n${JSON.stringify(i,null,2).substring(0,1850)}\n\`\`\``);
}

if(sub==='delete'&&args[1]){
const r=await jnkieReq('DELETE',`/integrations/${args[1]}`);
return safeReply(msg,r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

safeReply(msg,'`!integration list/types/get/delete`');
}

// ========== HELP & STATUS ==========
async function showPresets(msg){
safeReply(msg,{embeds:[{title:'⚙️ Presets',color:0x9b59b6,fields:[
{name:'🔮 Lua Free (!lua)',value:'`!lua` → Minifier\n`!lua vm` → Virtualize\n`!lua strong` → Full protection\n`!lua encrypt` → EncryptStrings'},
{name:'⚡ Prometheus (!obf)',value:'`minify` `weak` `medium`'}
]}]});
}

async function showHelp(msg){
safeReply(msg,{embeds:[{title:'📖 Commands',color:0x3498db,fields:[
{name:'🔮 Obfuscate',value:'`!obf` + file → Prometheus\n`!lua` + file → LuaFree\n`!lua vm` + file → Virtualize\n`!presets`'},
{name:'📦 Service',value:'`!service list/get/create/delete`'},
{name:'🔑 Key',value:'`!key list/create/batch/get/delete/reset`'},
{name:'📦 Provider',value:'`!provider list/get/create/delete`'},
{name:'🔗 Integration',value:'`!integration list/types/get/delete`'},
{name:'🔧 Debug',value:'`!raw [endpoint]` `!status`'}
],footer:{text:`Service: ${SERVICE_ID}`}}]});
}

async function showStatus(msg){
const s=await jnkieReq('GET','/services');
const p=await jnkieReq('GET','/providers');
const i=await jnkieReq('GET','/integrations');
const sLen=(s.data?.services||s.data||[]).length||(s.ok?1:0);
const pLen=(p.data?.providers||p.data||[]).length||(p.ok?1:0);
const iLen=(i.data?.integrations||i.data||[]).length||(i.ok?1:0);
safeReply(msg,{embeds:[{title:'📊 Status',color:0x2ecc71,fields:[
{name:'🤖 Bot',value:'✅',inline:true},
{name:'🔑 jnkie',value:JNKIE_API_KEY?`✅(${s.status})`:'❌',inline:true},
{name:'🔮 LuaFree',value:LUAFREE_API_KEY?'✅':'❌',inline:true},
{name:'📦 Services',value:String(sLen),inline:true},
{name:'📦 Providers',value:String(pLen),inline:true},
{name:'🔗 Integrations',value:String(iLen),inline:true}
],footer:{text:`Service: ${SERVICE_ID}`}}]});
}

// ========== HELPER ==========
function downloadFile(url){
return new Promise((r,j)=>{https.get(url,res=>{const d=[];res.on('data',c=>d.push(c));res.on('end',()=>r(Buffer.concat(d).toString()));}).on('error',j);});
}

client.login(TOKEN);
