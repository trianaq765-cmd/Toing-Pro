const{Client,GatewayIntentBits,AttachmentBuilder}=require('discord.js');const{exec}=require('child_process');const fs=require('fs');const path=require('path');const http=require('http');const https=require('https');const{promisify}=require('util');const execAsync=promisify(exec);
const PORT=process.env.PORT||3000;http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');}).listen(PORT);
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
const TOKEN=process.env.DISCORD_TOKEN;const PROMETHEUS_PATH=process.env.PROMETHEUS_PATH||'/app/prometheus';const JNKIE_API_KEY=process.env.JNKIE_API_KEY;const LUAFREE_API_KEY=process.env.LUAFREE_API_KEY||'';const SERVICE_ID=process.env.JNKIE_SERVICE_ID||'4532';
if(!TOKEN){console.error('TOKEN NOT FOUND');process.exit(1);}
const PRESETS={minify:{v:'Minify',e:'🟢'},weak:{v:'Weak',e:'🔵'},medium:{v:'Medium',e:'🟡'}};
const LUAFREE_PRESETS=['Dystropic Malevolence','Chaotic Evil','Chaotic Good','OBFUSCATE V1','OBFUSCATE (old)','Basic Good','Basic Minimal','Beautify'];
const LUAFREE_PLUGINS=['CachedEncryptStrings','CallRetAssignment','ControlFlowFlattenV1','ControlFlowFlattenV2','ConstMaker','DisableLuraphMacros','DummyFunctionArgs','EncryptFuncDeclaration','EncryptStrings','FuncChopper','JunkifyAllIfStatements','JunkifyBlockToIf','MakeGlobalsLookups','MixedBooleanArithmetic','Minifier','Minifier2','MutateAllLiterals','MutateAllLiteralsIntoDeclarations','OptimizeDeadLocals','VirtualizeLua51','WowPacker','RevertAllIfStatements','RewriteToLua5','SwizzleLookups','TableIndirection','WriteLuaBit32'];
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

// ========== LUA FREE OBFUSCATOR ==========
async function obfLuaFree(msg,args){
if(!LUAFREE_API_KEY)return msg.reply('❌ LUAFREE_API_KEY belum di-set di environment');
if(msg.attachments.size===0)return msg.reply({embeds:[{title:'🔮 Lua Free Obfuscator',color:0x9b59b6,description:'Upload file .lua untuk obfuscate',fields:[{name:'Usage',value:'`!lua [preset]` + file\n`!lua list` - Lihat presets'},{name:'Presets',value:LUAFREE_PRESETS.map((p,i)=>`${i+1}. ${p}`).join('\n')}]}]});
if(args[0]==='list')return msg.reply({embeds:[{title:'🔮 Lua Free Presets',color:0x9b59b6,fields:[{name:'Presets',value:LUAFREE_PRESETS.map((p,i)=>`\`${i+1}\` ${p}`).join('\n')},{name:'Plugins',value:LUAFREE_PLUGINS.slice(0,15).map(p=>`• ${p}`).join('\n')+'\n...dan lainnya'}]}]});
const preset=args[0]?LUAFREE_PRESETS[parseInt(args[0])-1]||LUAFREE_PRESETS.find(p=>p.toLowerCase().includes(args[0].toLowerCase()))||'Basic Minimal':'Basic Minimal';
const att=msg.attachments.first();const status=await msg.reply(`🔮 **Lua Free Obfuscating...**\n📄 ${att.name}\n⚙️ Preset: ${preset}`);
try{
const script=await downloadFile(att.url);
// Step 1: Create new script session
const newScriptRes=await luaFreeRequest('/v1/obfuscator/newscript',{script});
if(!newScriptRes.success)return status.edit(`❌ NewScript failed: ${newScriptRes.error||JSON.stringify(newScriptRes)}`);
const sessionId=newScriptRes.sessionId||newScriptRes.data?.sessionId;
if(!sessionId)return status.edit(`❌ No sessionId returned: ${JSON.stringify(newScriptRes)}`);
await status.edit(`🔮 Session: \`${sessionId}\`\nObfuscating with **${preset}**...`);
// Step 2: Obfuscate
const obfRes=await luaFreeRequest('/v1/obfuscator/obfuscate',{sessionId,preset,plugins:[]});
if(!obfRes.success)return status.edit(`❌ Obfuscate failed: ${obfRes.error||JSON.stringify(obfRes)}`);
const result=obfRes.script||obfRes.code||obfRes.result||obfRes.data?.script||JSON.stringify(obfRes);
const file=new AttachmentBuilder(Buffer.from(`-- Obfuscated with Lua Free [${preset}]\n${result}`),{name:`luafree_${att.name}`});
await status.edit({content:`✅ **Lua Free Success!**\n⚙️ Preset: ${preset}`,files:[file]});
}catch(e){await status.edit(`❌ Error: ${e.message}`);}}

function luaFreeRequest(endpoint,body){return new Promise(resolve=>{
const data=JSON.stringify(body);
const opts={hostname:'api.luaobfuscator.com',port:443,path:endpoint,method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','apikey':LUAFREE_API_KEY,'Content-Length':Buffer.byteLength(data)}};
const req=https.request(opts,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d));}catch(e){resolve({success:false,error:d});}});});
req.on('error',e=>resolve({success:false,error:e.message}));req.setTimeout(60000,()=>{req.destroy();resolve({success:false,error:'Timeout'});});req.write(data);req.end();});}

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

// ========== KEY COMMANDS ==========
async function handleKey(msg,args){
if(!JNKIE_API_KEY)return msg.reply('❌ JNKIE_API_KEY not set');
const sub=args[0]?.toLowerCase();
if(!sub||sub==='list'){const sid=args[1]||SERVICE_ID;const r=await jnkieReq('GET',`/keys?serviceId=${sid}&limit=20`);if(!r.ok)return msg.reply(`❌ ${r.status}: ${r.error}`);const items=Array.isArray(r.data)?r.data:r.data?.keys||[];return msg.reply({embeds:[{title:`🔑 Keys (Service: ${sid})`,color:0x2ecc71,description:items.slice(0,15).map(k=>`• \`${(k.key||k.id||'?').substring(0,30)}\`${k.note?` - ${k.note}`:''}`).join('\n')||'No keys',footer:{text:`Total: ${items.length}`}}]});}
if(sub==='create'){const sid=args[1]||SERVICE_ID;const note=args.slice(2).join(' ')||'Created via bot';const r=await jnkieReq('POST','/keys',{serviceId:parseInt(sid),note,expiresAt:null,maxHwids:3});return msg.reply(r.ok?`✅ Key Created:\n\`\`\`${r.data?.key||JSON.stringify(r.data)}\`\`\``:`❌ ${r.error}`);}
if(sub==='batch'){const sid=args[1]||SERVICE_ID;const count=parseInt(args[2])||5;const r=await jnkieReq('POST','/keys/batch',{serviceId:parseInt(sid),count,note:'Batch created',maxHwids:3});if(!r.ok)return msg.reply(`❌ ${r.error}`);const keys=r.data?.keys||r.data||[];return msg.reply({embeds:[{title:`✅ ${keys.length} Keys Created`,color:0x2ecc71,description:keys.slice(0,20).map(k=>`\`${k.key||k}\``).join('\n')}]});}
if(sub==='delete'&&args[1]){const r=await jnkieReq('DELETE',`/keys/${args[1]}`);return msg.reply(r.ok?'✅ Deleted':`❌ ${r.error}`);}
if(sub==='bulkdelete'){const ids=args.slice(1);if(ids.length===0)return msg.reply('❌ Provide key IDs');const r=await jnkieReq('POST','/keys/bulk-delete',{ids:ids.map(i=>parseInt(i))});return msg.reply(r.ok?`✅ Deleted ${ids.length} keys`:`❌ ${r.error}`);}
if(sub==='get'&&args[1]){const r=await jnkieReq('GET',`/keys/${args[1]}`);return msg.reply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``);}
if(sub==='reset'&&args[1]){const r=await jnkieReq('POST',`/keys/${args[1]}/reset-hwid`);return msg.reply(r.ok?'✅ HWID Reset':`❌ ${r.error}`);}
msg.reply('Usage:\n`!key list [serviceId]`\n`!key create [serviceId] [note]`\n`!key batch [serviceId] [count]`\n`!key get <keyId>`\n`!key delete <keyId>`\n`!key bulkdelete <id1> <id2>...`\n`!key reset <keyId>`');}

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
async function showHelp(msg){msg.reply({embeds:[{title:'📖 Bot Commands',color:0x3498db,fields:[{name:'🔮 Obfuscator',value:'`!obf [preset]` + file → Prometheus\n`!lua [preset]` + file → Lua Free\n`!presets` → List presets'},{name:'📦 Services',value:'`!service list/get/create/delete`'},{name:'🔑 Keys',value:'`!key list/create/batch/get/delete/reset`'},{name:'📦 Providers',value:'`!provider list/get/create/delete`'},{name:'🔗 Integrations',value:'`!integration list/types/get/delete`'}],footer:{text:`Service ID: ${SERVICE_ID}`}}]});}
async function showStatus(msg){const r=await jnkieReq('GET','/services');msg.reply(`✅ **Bot Online**\n📦 Service ID: \`${SERVICE_ID}\`\n🔑 jnkie API: ${JNKIE_API_KEY?'✅':'❌'}\n🔮 Lua Free API: ${LUAFREE_API_KEY?'✅':'❌'}\n📊 Services: ${Array.isArray(r.data)?r.data.length:0}`);}

// ========== HELPERS ==========
function downloadFile(url){return new Promise((resolve,reject)=>{https.get(url,res=>{const d=[];res.on('data',c=>d.push(c));res.on('end',()=>resolve(Buffer.concat(d).toString()));}).on('error',reject);});}
client.login(TOKEN);
