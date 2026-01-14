const{Client,GatewayIntentBits,AttachmentBuilder}=require('discord.js');const{exec}=require('child_process');const fs=require('fs');const path=require('path');const http=require('http');const https=require('https');const{promisify}=require('util');const execAsync=promisify(exec);
const PORT=process.env.PORT||3000;http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');}).listen(PORT);
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
const TOKEN=process.env.DISCORD_TOKEN;const PROMETHEUS_PATH=process.env.PROMETHEUS_PATH||'/app/prometheus';const JNKIE_API_KEY=process.env.JNKIE_API_KEY;const LUAFREE_API_KEY=process.env.LUAFREE_API_KEY||'';const SERVICE_ID=process.env.JNKIE_SERVICE_ID||'4532';
if(!TOKEN){console.error('TOKEN NOT FOUND');process.exit(1);}
const PRESETS={minify:{v:'Minify',e:'🟢'},weak:{v:'Weak',e:'🔵'},medium:{v:'Medium',e:'🟡'}};
const LUAFREE_PRESETS=['Dystropic Malevolence','Chaotic Evil','Chaotic Good','OBFUSCATE V1','OBFUSCATE (old)','Basic Good','Basic Minimal','Beautify'];
client.on('ready',()=>{console.log(`Bot ${client.user.tag} online | Service: ${SERVICE_ID}`);});
client.on('messageCreate',async(msg)=>{if(msg.author.bot)return;const c=msg.content.trim();const args=c.split(/\s+/).slice(1);const cmd=c.split(/\s+/)[0].toLowerCase();try{
if(cmd==='!obf')await obfPrometheus(msg);
else if(cmd==='!lua'||cmd==='!luafree')await obfLuaFree(msg,args);
else if(cmd==='!presets')await showPresets(msg);
else if(cmd==='!service')await handleService(msg,args);
else if(cmd==='!key')await handleKey(msg,args);
else if(cmd==='!provider')await handleProvider(msg,args);
else if(cmd==='!integration')await handleIntegration(msg,args);
else if(cmd==='!help')await showHelp(msg);
else if(cmd==='!status')await showStatus(msg);
}catch(e){console.error(e);msg.reply(`❌ ${e.message}`);}});

// ========== LUA FREE OBFUSCATOR (FIXED) ==========
async function obfLuaFree(msg,args){
if(!LUAFREE_API_KEY)return msg.reply('❌ LUAFREE_API_KEY belum di-set di environment');
if(msg.attachments.size===0){
if(args[0]==='list')return msg.reply({embeds:[{title:'🔮 Lua Free Presets',color:0x9b59b6,fields:[{name:'Presets',value:LUAFREE_PRESETS.map((p,i)=>`\`${i+1}\` ${p}`).join('\n')},{name:'Usage',value:'`!lua [preset]` + attach file\n`!lua 1` = Dystropic Malevolence\n`!lua 7` = Basic Minimal (default)'}]}]});
return msg.reply({embeds:[{title:'🔮 Lua Free Obfuscator',color:0x9b59b6,description:'Upload file .lua untuk obfuscate',fields:[{name:'Usage',value:'`!lua [preset]` + file\n`!lua list` - Lihat presets'},{name:'Presets',value:LUAFREE_PRESETS.map((p,i)=>`${i+1}. ${p}`).join('\n')}]}]});}

const presetArg=args[0];
let preset='Basic Minimal';
if(presetArg){
const num=parseInt(presetArg);
if(num>=1&&num<=LUAFREE_PRESETS.length){preset=LUAFREE_PRESETS[num-1];}
else{const found=LUAFREE_PRESETS.find(p=>p.toLowerCase().includes(presetArg.toLowerCase()));if(found)preset=found;}}

const att=msg.attachments.first();
const status=await msg.reply(`🔮 **Lua Free Obfuscating...**\n📄 ${att.name}\n⚙️ Preset: ${preset}`);

try{
const script=await downloadFile(att.url);

// Step 1: Create new script session
await status.edit(`🔮 Step 1/2: Creating session...`);
const newScriptRes=await luaFreeRequest('/v1/obfuscator/newscript',{script});

// 🔧 FIX: Check sessionId langsung, bukan success
const sessionId=newScriptRes.sessionId;
if(!sessionId){
return status.edit(`❌ NewScript failed:\n\`\`\`json\n${JSON.stringify(newScriptRes,null,2)}\n\`\`\``);}

await status.edit(`🔮 Step 2/2: Obfuscating...\n📝 Session: \`${sessionId.substring(0,20)}...\`\n⚙️ Preset: **${preset}**`);

// Step 2: Obfuscate
const obfRes=await luaFreeRequest('/v1/obfuscator/obfuscate',{sessionId,preset});

// 🔧 FIX: Check code/script langsung
const resultScript=obfRes.code||obfRes.script||obfRes.result;
if(!resultScript){
return status.edit(`❌ Obfuscate failed:\n\`\`\`json\n${JSON.stringify(obfRes,null,2).substring(0,1500)}\n\`\`\``);}

const header=`-- Obfuscated with Lua Free\n-- Preset: ${preset}\n-- https://luaobfuscator.com\n\n`;
const file=new AttachmentBuilder(Buffer.from(header+resultScript),{name:`luafree_${att.name}`});
await status.edit({content:`✅ **Lua Free Success!**\n⚙️ Preset: ${preset}\n📄 ${att.name}`,files:[file]});

}catch(e){await status.edit(`❌ Error: ${e.message}`);}}

function luaFreeRequest(endpoint,body){return new Promise(resolve=>{
const data=JSON.stringify(body);
const opts={hostname:'api.luaobfuscator.com',port:443,path:endpoint,method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','apikey':LUAFREE_API_KEY,'Content-Length':Buffer.byteLength(data)}};
const req=https.request(opts,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d));}catch(e){resolve({error:d});}});});
req.on('error',e=>resolve({error:e.message}));req.setTimeout(120000,()=>{req.destroy();resolve({error:'Timeout (120s)'});});req.write(data);req.end();});}

// ========== PROMETHEUS ==========
async function obfPrometheus(msg){
if(msg.attachments.size===0)return msg.reply('❌ Attach file .lua\nUsage: `!obf [minify|weak|medium]`');
const att=msg.attachments.first();const pk=msg.content.split(/\s+/)[1]||'minify';const preset=PRESETS[pk.toLowerCase()]||PRESETS.minify;
const ts=Date.now();const inp=path.join(PROMETHEUS_PATH,`in_${ts}.lua`);const out=path.join(PROMETHEUS_PATH,`out_${ts}.lua`);
try{const code=await downloadFile(att.url);fs.writeFileSync(inp,code.replace(/^\uFEFF/,'').trim(),'utf8');
const st=await msg.reply(`🔄 Prometheus ${preset.e}...`);
await execAsync(`cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset.v} "${inp}" --out "${out}" 2>&1`,{timeout:120000});
if(fs.existsSync(out)){const r=`-- Prometheus [${preset.v}]\n`+fs.readFileSync(out,'utf8');const f=new AttachmentBuilder(Buffer.from(r),{name:`prometheus_${att.name}`});await st.edit({content:'✅ Prometheus Success',files:[f]});}else{await st.edit('❌ Failed');}}
catch(e){msg.reply(`❌ ${e.message}`);}finally{[inp,out].forEach(f=>{try{fs.unlinkSync(f);}catch(e){}});}}

// ========== JNKIE API ==========
function jnkieReq(method,endpoint,body=null){return new Promise(resolve=>{
const data=body?JSON.stringify(body):'';
const opts={hostname:'api.jnkie.com',port:443,path:`/api/v2${endpoint}`,method,headers:{'Authorization':`Bearer ${JNKIE_API_KEY}`,'Content-Type':'application/json','Accept':'application/json'}};
if(body)opts.headers['Content-Length']=Buffer.byteLength(data);
const req=https.request(opts,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{const j=JSON.parse(d);resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:j.data||j,error:j.message||j.error});}catch(e){resolve({ok:false,status:res.statusCode,error:d});}});});
req.on('error',e=>resolve({ok:false,status:0,error:e.message}));req.setTimeout(15000,()=>{req.destroy();resolve({ok:false,status:408,error:'Timeout'});});if(body)req.write(data);req.end();});}

// ========== SERVICE COMMANDS ==========
async function handleService(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();
if(!sub||sub==='list'){const r=await jnkieReq('GET','/services');if(!r.ok)return msg.reply(`❌ ${r.status}: ${r.error}`);const items=Array.isArray(r.data)?r.data:[r.data];return msg.reply({embeds:[{title:'📦 Services',color:0x3498db,description:items.map(s=>`• \`${s.id}\` **${s.name||'Unnamed'}**${s.description?`\n  └ ${s.description.substring(0,50)}`:''}`).join('\n')||'No services'}]});}
if(sub==='get'&&args[1]){const r=await jnkieReq('GET',`/services/${args[1]}`);return msg.reply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``);}
if(sub==='create'){const name=args[1]||'New Service';const r=await jnkieReq('POST','/services',{name,description:'Created via bot',is_premium:false,keyless_mode:false});return msg.reply(r.ok?`✅ Created: \`${r.data?.id||JSON.stringify(r.data)}\``:`❌ ${r.error}`);}
if(sub==='delete'&&args[1]){const r=await jnkieReq('DELETE',`/services/${args[1]}`);return msg.reply(r.ok?'✅ Deleted':`❌ ${r.error}`);}
msg.reply('Usage:\n`!service list`\n`!service get <id>`\n`!service create <name>`\n`!service delete <id>`');}

// ========== KEY COMMANDS (FIXED) ==========
async function handleKey(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();

if(!sub||sub==='list'){
const sid=args[1]||SERVICE_ID;
const r=await jnkieReq('GET',`/keys?serviceId=${sid}&limit=20`);
if(!r.ok)return msg.reply(`❌ ${r.status}: ${r.error}`);

// 🔧 FIX: Handle berbagai format response
let items=[];
if(Array.isArray(r.data))items=r.data;
else if(r.data?.keys&&Array.isArray(r.data.keys))items=r.data.keys;
else if(r.data?.data&&Array.isArray(r.data.data))items=r.data.data;

const keyList=items.slice(0,15).map(k=>{
// 🔧 FIX: Safely get key value
let keyVal='unknown';
if(typeof k.key==='string')keyVal=k.key;
else if(typeof k.id==='string')keyVal=k.id;
else if(typeof k.id==='number')keyVal=String(k.id);
else if(typeof k.key==='object'&&k.key!==null)keyVal=JSON.stringify(k.key);

const displayKey=keyVal.length>30?keyVal.substring(0,30)+'...':keyVal;
const note=k.note?` - ${k.note}`:'';
const status=k.is_banned?'🚫':k.is_expired?'⏰':'✅';
return`${status} \`${displayKey}\`${note}`;
}).join('\n');

return msg.reply({embeds:[{title:`🔑 Keys (Service: ${sid})`,color:0x2ecc71,description:keyList||'No keys found',footer:{text:`Total: ${items.length} keys`}}]});}

if(sub==='create'){
const sid=args[1]||SERVICE_ID;
const note=args.slice(2).join(' ')||'Created via bot';
const r=await jnkieReq('POST','/keys',{serviceId:parseInt(sid),note,expiresAt:null,maxHwids:3});
if(!r.ok)return msg.reply(`❌ ${r.error}`);
// 🔧 FIX: Handle response properly
const keyVal=r.data?.key||r.data?.id||JSON.stringify(r.data);
return msg.reply(`✅ **Key Created!**\n\`\`\`${keyVal}\`\`\``);}

if(sub==='batch'){
const sid=args[1]||SERVICE_ID;
const count=parseInt(args[2])||5;
const r=await jnkieReq('POST','/keys/batch',{serviceId:parseInt(sid),count,note:'Batch created',maxHwids:3});
if(!r.ok)return msg.reply(`❌ ${r.error}`);

// 🔧 FIX: Handle berbagai format
let keys=[];
if(Array.isArray(r.data))keys=r.data;
else if(r.data?.keys)keys=r.data.keys;
else if(r.data?.data)keys=r.data.data;

const keyList=keys.slice(0,20).map(k=>{
if(typeof k==='string')return`\`${k}\``;
if(typeof k.key==='string')return`\`${k.key}\``;
return`\`${JSON.stringify(k)}\``;
}).join('\n');

return msg.reply({embeds:[{title:`✅ ${keys.length} Keys Created`,color:0x2ecc71,description:keyList||'Keys created'}]});}

if(sub==='delete'&&args[1]){const r=await jnkieReq('DELETE',`/keys/${args[1]}`);return msg.reply(r.ok?'✅ Key Deleted':`❌ ${r.error}`);}

if(sub==='bulkdelete'){
const ids=args.slice(1);
if(ids.length===0)return msg.reply('❌ Provide key IDs: `!key bulkdelete 123 456 789`');
const r=await jnkieReq('POST','/keys/bulk-delete',{ids:ids.map(i=>parseInt(i))});
return msg.reply(r.ok?`✅ Deleted ${ids.length} keys`:`❌ ${r.error}`);}

if(sub==='get'&&args[1]){
const r=await jnkieReq('GET',`/keys/${args[1]}`);
if(!r.ok)return msg.reply(`❌ ${r.error}`);
return msg.reply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``);}

if(sub==='reset'&&args[1]){
const r=await jnkieReq('POST',`/keys/${args[1]}/reset-hwid`);
return msg.reply(r.ok?'✅ HWID Reset!':`❌ ${r.error}`);}

msg.reply({embeds:[{title:'🔑 Key Commands',color:0x2ecc71,fields:[
{name:'List Keys',value:`\`!key list [serviceId]\`\nDefault: ${SERVICE_ID}`},
{name:'Create Key',value:'`!key create [serviceId] [note]`'},
{name:'Batch Create',value:'`!key batch [serviceId] [count]`'},
{name:'Get Detail',value:'`!key get <keyId>`'},
{name:'Delete',value:'`!key delete <keyId>`'},
{name:'Bulk Delete',value:'`!key bulkdelete <id1> <id2>...`'},
{name:'Reset HWID',value:'`!key reset <keyId>`'}
]}]});}

// ========== PROVIDER COMMANDS ==========
async function handleProvider(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();
if(!sub||sub==='list'){const r=await jnkieReq('GET','/providers');if(!r.ok)return msg.reply(`❌ ${r.error}`);const items=Array.isArray(r.data)?r.data:[];return msg.reply({embeds:[{title:'📦 Providers',color:0xe67e22,description:items.map(p=>`• \`${p.id}\` **${p.name||'Unnamed'}** (${p.type||'?'})`).join('\n')||'No providers'}]});}
if(sub==='get'&&args[1]){const r=await jnkieReq('GET',`/providers/${args[1]}`);return msg.reply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``);}
if(sub==='create'){const name=args[1]||'New Provider';const r=await jnkieReq('POST','/providers',{name,type:'custom'});return msg.reply(r.ok?`✅ Created: ${r.data?.id}`:`❌ ${r.error}`);}
if(sub==='delete'&&args[1]){const r=await jnkieReq('DELETE',`/providers/${args[1]}`);return msg.reply(r.ok?'✅ Deleted':`❌ ${r.error}`);}
msg.reply('Usage:\n`!provider list`\n`!provider get <id>`\n`!provider create <name>`\n`!provider delete <id>`');}

// ========== INTEGRATION COMMANDS ==========
async function handleIntegration(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();
if(!sub||sub==='list'){const r=await jnkieReq('GET','/integrations');if(!r.ok)return msg.reply(`❌ ${r.error}`);const items=Array.isArray(r.data)?r.data:[];return msg.reply({embeds:[{title:'🔗 Integrations',color:0x9b59b6,description:items.map(i=>`• \`${i.id}\` **${i.name||'Unnamed'}** (${i.type||'?'})`).join('\n')||'No integrations'}]});}
if(sub==='types'){const r=await jnkieReq('GET','/integrations/types');return msg.reply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``);}
if(sub==='get'&&args[1]){const r=await jnkieReq('GET',`/integrations/${args[1]}`);return msg.reply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``);}
if(sub==='delete'&&args[1]){const r=await jnkieReq('DELETE',`/integrations/${args[1]}`);return msg.reply(r.ok?'✅ Deleted':`❌ ${r.error}`);}
msg.reply('Usage:\n`!integration list`\n`!integration types`\n`!integration get <id>`\n`!integration delete <id>`');}

// ========== HELP & STATUS ==========
async function showPresets(msg){msg.reply({embeds:[{title:'⚙️ Obfuscator Presets',color:0x9b59b6,fields:[{name:'🔮 Lua Free (!lua)',value:LUAFREE_PRESETS.map((p,i)=>`\`${i+1}\` ${p}`).join('\n')},{name:'⚡ Prometheus (!obf)',value:'🟢 `minify`\n🔵 `weak`\n🟡 `medium`'}]}]});}

async function showHelp(msg){msg.reply({embeds:[{title:'📖 Bot Commands',color:0x3498db,fields:[
{name:'🔮 Obfuscator',value:'`!obf [preset]` + file → Prometheus\n`!lua [1-8]` + file → Lua Free\n`!lua list` → Lihat presets\n`!presets` → All presets'},
{name:'📦 Services',value:'`!service list/get/create/delete`'},
{name:'🔑 Keys',value:'`!key list/create/batch/get/delete/reset`'},
{name:'📦 Providers',value:'`!provider list/get/create/delete`'},
{name:'🔗 Integrations',value:'`!integration list/types/get/delete`'}
],footer:{text:`Service ID: ${SERVICE_ID}`}}]});}

async function showStatus(msg){
const r=await jnkieReq('GET','/services');
const svcCount=Array.isArray(r.data)?r.data.length:0;
msg.reply({embeds:[{title:'✅ Bot Status',color:0x2ecc71,fields:[
{name:'Service ID',value:`\`${SERVICE_ID}\``,inline:true},
{name:'jnkie API',value:JNKIE_API_KEY?'✅ Set':'❌ Not Set',inline:true},
{name:'Lua Free API',value:LUAFREE_API_KEY?'✅ Set':'❌ Not Set',inline:true},
{name:'Services',value:`${svcCount} found`,inline:true}
]}]});}

// ========== HELPERS ==========
function downloadFile(url){return new Promise((resolve,reject)=>{https.get(url,res=>{const d=[];res.on('data',c=>d.push(c));res.on('end',()=>resolve(Buffer.concat(d).toString()));}).on('error',reject);});}
client.login(TOKEN);
