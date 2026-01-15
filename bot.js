const{Client,GatewayIntentBits,AttachmentBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle}=require('discord.js');
const{exec}=require('child_process');const fs=require('fs');const path=require('path');const http=require('http');const https=require('https');const{promisify}=require('util');const execAsync=promisify(exec);

const PORT=process.env.PORT||3000;
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');}).listen(PORT);

const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});

const TOKEN=process.env.DISCORD_TOKEN;
const PROMETHEUS_PATH=process.env.PROMETHEUS_PATH||'/app/prometheus';
const JNKIE_API_KEY=process.env.JNKIE_API_KEY;
const LUAFREE_API_KEY=process.env.LUAFREE_API_KEY||'';
const SERVICE_ID=process.env.JNKIE_SERVICE_ID||'4532';

if(!TOKEN){console.error('TOKEN NOT FOUND');process.exit(1);}

// Store pending operations
const pendingObf=new Map();
const pendingKey=new Map();

// Lua Free Plugins
const LUAFREE_PLUGINS=[
{id:'MinifiyAll',name:'Minifier',desc:'Reduce code size',emoji:'📦'},
{id:'Minifier2',name:'Minifier V2',desc:'Better minification',emoji:'📦'},
{id:'EncryptStrings',name:'Encrypt Strings',desc:'Encrypt all strings',emoji:'🔐'},
{id:'Virtualize',name:'Virtualize',desc:'VM protection',emoji:'🛡️'},
{id:'ConstantArray',name:'Constant Array',desc:'Hide constants',emoji:'📊'},
{id:'BytecodeShuffle',name:'Bytecode Shuffle',desc:'Shuffle bytecode',emoji:'🔀'},
{id:'WatermarkCheck',name:'Watermark Check',desc:'Add watermark',emoji:'💧'},
{id:'JunkCode',name:'Junk Code',desc:'Add junk code',emoji:'🗑️'},
{id:'AntiTamper',name:'Anti Tamper',desc:'Anti modification',emoji:'🔒'},
{id:'ProxifyLocals',name:'Proxify Locals',desc:'Proxy local vars',emoji:'🔄'}
];

// Prometheus Presets  
const PROMETHEUS_PRESETS=[
{id:'Minify',name:'Minify',desc:'Fast & small',emoji:'🟢'},
{id:'Weak',name:'Weak',desc:'Light protection',emoji:'🔵'},
{id:'Medium',name:'Medium',desc:'Balanced',emoji:'🟡'}
];

client.on('ready',()=>console.log(`Bot ${client.user.tag} online`));

// ========== MESSAGE HANDLER ==========
client.on('messageCreate',async msg=>{
if(msg.author.bot)return;
const cmd=msg.content.trim().toLowerCase().split(/\s+/)[0];

try{
if(cmd==='!menu'||cmd==='!start')await showMainMenu(msg);
else if(cmd==='!obf'||cmd==='!lua')await showObfMenu(msg);
else if(cmd==='!key')await showKeyMenu(msg);
else if(cmd==='!service')await showServiceMenu(msg);
else if(cmd==='!provider')await showProviderMenu(msg);
else if(cmd==='!integration')await showIntegrationMenu(msg);
else if(cmd==='!status')await showStatus(msg);
else if(cmd==='!help')await showHelp(msg);
}catch(e){console.error(e);safeSend(msg.channel,`❌ ${e.message}`);}
});

// ========== INTERACTION HANDLER ==========
client.on('interactionCreate',async interaction=>{
try{
if(interaction.isButton())await handleButton(interaction);
else if(interaction.isStringSelectMenu())await handleSelect(interaction);
else if(interaction.isModalSubmit())await handleModal(interaction);
}catch(e){
console.error(e);
const reply=interaction.replied||interaction.deferred?interaction.followUp:interaction.reply;
reply.call(interaction,{content:`❌ ${e.message}`,ephemeral:true}).catch(()=>{});
}
});

// ========== MAIN MENU ==========
async function showMainMenu(msg){
const embed=new EmbedBuilder()
.setTitle('🤖 Bot Control Panel')
.setColor(0x5865F2)
.setDescription('Pilih menu yang ingin diakses:')
.addFields(
{name:'🔮 Obfuscator',value:'Prometheus & Lua Free',inline:true},
{name:'🔑 Keys',value:'Manage license keys',inline:true},
{name:'📦 Services',value:'Manage services',inline:true}
);

const row1=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('menu_obf').setLabel('🔮 Obfuscator').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('menu_key').setLabel('🔑 Keys').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('menu_service').setLabel('📦 Services').setStyle(ButtonStyle.Secondary)
);

const row2=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('menu_provider').setLabel('📦 Providers').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('menu_integration').setLabel('🔗 Integrations').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('menu_status').setLabel('📊 Status').setStyle(ButtonStyle.Danger)
);

safeSend(msg.channel,{embeds:[embed],components:[row1,row2]});
}

// ========== OBFUSCATOR MENU ==========
async function showObfMenu(msg){
const embed=new EmbedBuilder()
.setTitle('🔮 Obfuscator')
.setColor(0x9b59b6)
.setDescription('Upload file .lua lalu pilih metode obfuscate:')
.addFields(
{name:'⚡ Prometheus',value:'Local obfuscator (fast)',inline:true},
{name:'🌐 Lua Free',value:'Online API (more options)',inline:true}
);

const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('obf_prometheus').setLabel('⚡ Prometheus').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('obf_luafree').setLabel('🌐 Lua Free').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️ Back').setStyle(ButtonStyle.Secondary)
);

safeSend(msg.channel,{embeds:[embed],components:[row]});
}

// ========== KEY MENU ==========  
async function showKeyMenu(msg){
const embed=new EmbedBuilder()
.setTitle('🔑 Key Management')
.setColor(0x2ecc71)
.setDescription(`Service ID: \`${SERVICE_ID}\`\n\nPilih aksi:`)
.addFields(
{name:'📋 List',value:'View all keys',inline:true},
{name:'➕ Create',value:'Create new key',inline:true},
{name:'📦 Batch',value:'Create multiple',inline:true}
);

const row1=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_list').setLabel('📋 List Keys').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('key_create').setLabel('➕ Create Key').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('key_batch').setLabel('📦 Batch Create').setStyle(ButtonStyle.Success)
);

const row2=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_delete').setLabel('🗑️ Delete Key').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('key_reset').setLabel('🔄 Reset HWID').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️ Back').setStyle(ButtonStyle.Secondary)
);

safeSend(msg.channel,{embeds:[embed],components:[row1,row2]});
}

// ========== SERVICE MENU ==========
async function showServiceMenu(msg){
const r=await jnkieReq('GET','/services');
let items=r.data?.services||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);

const embed=new EmbedBuilder()
.setTitle('📦 Services')
.setColor(0x3498db)
.setDescription(items.map(s=>`\`${s.id}\` **${s.name||'?'}** - ${(s.description||'').substring(0,30)}`).join('\n')||'No services');

const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('service_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('service_create').setLabel('➕ Create').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('service_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️ Back').setStyle(ButtonStyle.Secondary)
);

safeSend(msg.channel,{embeds:[embed],components:[row]});
}

// ========== PROVIDER MENU ==========
async function showProviderMenu(msg){
const r=await jnkieReq('GET','/providers');
let items=r.data?.providers||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);

const embed=new EmbedBuilder()
.setTitle('📦 Providers')
.setColor(0xe67e22)
.setDescription(items.map(p=>`\`${p.id}\` **${p.name||'?'}** (${p.key_valid_minutes||0}min)`).join('\n')||'No providers');

const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('provider_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('provider_create').setLabel('➕ Create').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️ Back').setStyle(ButtonStyle.Secondary)
);

safeSend(msg.channel,{embeds:[embed],components:[row]});
}

// ========== INTEGRATION MENU ==========
async function showIntegrationMenu(msg){
const r=await jnkieReq('GET','/integrations');
let items=r.data?.integrations||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);

const embed=new EmbedBuilder()
.setTitle('🔗 Integrations')
.setColor(0x9b59b6)
.setDescription(items.map(i=>`\`${i.id}\` **${i.name||'?'}** (${i.type||'?'})`).join('\n')||'No integrations');

const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('integration_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('integration_types').setLabel('📋 Types').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️ Back').setStyle(ButtonStyle.Secondary)
);

safeSend(msg.channel,{embeds:[embed],components:[row]});
}

// ========== BUTTON HANDLER ==========
async function handleButton(i){
const id=i.customId;

// Navigation
if(id==='menu_main')return i.update(await buildMainMenu());
if(id==='menu_obf')return i.update(await buildObfMenu());
if(id==='menu_key')return i.update(await buildKeyMenu());
if(id==='menu_service')return i.update(await buildServiceMenu());
if(id==='menu_provider')return i.update(await buildProviderMenu());
if(id==='menu_integration')return i.update(await buildIntegrationMenu());
if(id==='menu_status')return i.update(await buildStatus());

// Obfuscator
if(id==='obf_prometheus')return i.update(await buildPrometheusMenu());
if(id==='obf_luafree')return i.update(await buildLuaFreeMenu(i.user.id));
if(id.startsWith('prom_')){
const preset=id.replace('prom_','');
pendingObf.set(i.user.id,{type:'prometheus',preset});
return i.update({content:`⚡ **Prometheus [${preset}]**\n\n📤 **Upload file .lua sekarang!**\n\nBot akan otomatis memproses file yang kamu upload.`,embeds:[],components:[backBtn('menu_obf')]});
}
if(id==='luafree_process')return processLuaFree(i);
if(id==='luafree_clear'){
const data=pendingObf.get(i.user.id)||{type:'luafree',plugins:[]};
data.plugins=[];
pendingObf.set(i.user.id,data);
return i.update(await buildLuaFreeMenu(i.user.id));
}

// Keys
if(id==='key_list')return i.update(await buildKeyList());
if(id==='key_create')return showKeyCreateModal(i);
if(id==='key_batch')return showKeyBatchModal(i);
if(id==='key_delete')return showKeyDeleteModal(i);
if(id==='key_reset')return showKeyResetModal(i);

// Service
if(id==='service_refresh')return i.update(await buildServiceMenu());
if(id==='service_create')return showServiceCreateModal(i);
if(id==='service_delete')return showServiceDeleteModal(i);

// Provider
if(id==='provider_refresh')return i.update(await buildProviderMenu());
if(id==='provider_create')return showProviderCreateModal(i);

// Integration
if(id==='integration_refresh')return i.update(await buildIntegrationMenu());
if(id==='integration_types')return i.reply({content:await getIntegrationTypes(),ephemeral:true});

await i.deferUpdate();
}

// ========== SELECT HANDLER ==========
async function handleSelect(i){
const id=i.customId;

if(id==='luafree_plugins'){
const data=pendingObf.get(i.user.id)||{type:'luafree',plugins:[]};
data.plugins=i.values;
pendingObf.set(i.user.id,data);
return i.update(await buildLuaFreeMenu(i.user.id));
}

await i.deferUpdate();
}

// ========== MODAL HANDLER ==========
async function handleModal(i){
const id=i.customId;

if(id==='modal_key_create'){
const sid=i.fields.getTextInputValue('service_id')||SERVICE_ID;
const note=i.fields.getTextInputValue('note')||'Bot created';
await i.deferReply();
const r=await jnkieReq('POST','/keys',{serviceId:parseInt(sid),note,maxHwids:3});
const key=r.data?.key?.key_value||r.data?.key_value||r.data?.key;
return i.editReply(r.ok?`✅ **Key Created!**\n\`\`\`${key||JSON.stringify(r.data)}\`\`\``:`❌ ${r.raw?.substring(0,500)}`);
}

if(id==='modal_key_batch'){
const sid=i.fields.getTextInputValue('service_id')||SERVICE_ID;
const count=parseInt(i.fields.getTextInputValue('count'))||5;
await i.deferReply();
const r=await jnkieReq('POST','/keys/batch',{serviceId:parseInt(sid),count,note:'Batch',maxHwids:3});
if(!r.ok)return i.editReply(`❌ ${r.raw?.substring(0,500)}`);
let keys=r.data?.keys||r.data||[];
const list=keys.slice(0,15).map(k=>`\`${k.key_value||k.key||k}\``).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`✅ ${keys.length} Keys Created`).setColor(0x2ecc71).setDescription(list)]});
}

if(id==='modal_key_delete'){
const keyId=i.fields.getTextInputValue('key_id');
await i.deferReply();
const r=await jnkieReq('DELETE',`/keys/${keyId}`);
return i.editReply(r.ok?'✅ Key Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

if(id==='modal_key_reset'){
const keyId=i.fields.getTextInputValue('key_id');
await i.deferReply();
const r=await jnkieReq('POST',`/keys/${keyId}/reset-hwid`);
return i.editReply(r.ok?'✅ HWID Reset':`❌ ${r.raw?.substring(0,300)}`);
}

if(id==='modal_service_create'){
const name=i.fields.getTextInputValue('name');
const desc=i.fields.getTextInputValue('description')||'Created via bot';
await i.deferReply();
const r=await jnkieReq('POST','/services',{name,description:desc,is_premium:false,keyless_mode:false});
const svcId=r.data?.service?.id||r.data?.id;
return i.editReply(r.ok?`✅ Service Created: \`${svcId}\``:`❌ ${r.raw?.substring(0,400)}`);
}

if(id==='modal_service_delete'){
const svcId=i.fields.getTextInputValue('service_id');
await i.deferReply();
const r=await jnkieReq('DELETE',`/services/${svcId}`);
return i.editReply(r.ok?'✅ Service Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

if(id==='modal_provider_create'){
const name=i.fields.getTextInputValue('name');
const mins=parseInt(i.fields.getTextInputValue('minutes'))||60;
await i.deferReply();
const r=await jnkieReq('POST','/providers',{name,key_valid_minutes:mins,is_active:true});
const pId=r.data?.provider?.id||r.data?.id;
return i.editReply(r.ok?`✅ Provider Created: \`${pId}\``:`❌ ${r.raw?.substring(0,300)}`);
}
}

// ========== BUILD MENUS ==========
async function buildMainMenu(){
const embed=new EmbedBuilder()
.setTitle('🤖 Bot Control Panel')
.setColor(0x5865F2)
.setDescription('Pilih menu:');

const row1=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('menu_obf').setLabel('🔮 Obfuscator').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('menu_key').setLabel('🔑 Keys').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('menu_service').setLabel('📦 Services').setStyle(ButtonStyle.Secondary)
);
const row2=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('menu_provider').setLabel('📦 Providers').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('menu_integration').setLabel('🔗 Integrations').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('menu_status').setLabel('📊 Status').setStyle(ButtonStyle.Danger)
);
return{embeds:[embed],components:[row1,row2]};
}

async function buildObfMenu(){
const embed=new EmbedBuilder()
.setTitle('🔮 Obfuscator')
.setColor(0x9b59b6)
.setDescription('Pilih metode obfuscate:');

const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('obf_prometheus').setLabel('⚡ Prometheus').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('obf_luafree').setLabel('🌐 Lua Free').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️ Back').setStyle(ButtonStyle.Secondary)
);
return{embeds:[embed],components:[row]};
}

async function buildPrometheusMenu(){
const embed=new EmbedBuilder()
.setTitle('⚡ Prometheus Obfuscator')
.setColor(0x3498db)
.setDescription('Pilih preset:');

const row1=new ActionRowBuilder().addComponents(
...PROMETHEUS_PRESETS.map(p=>
new ButtonBuilder().setCustomId(`prom_${p.id}`).setLabel(`${p.emoji} ${p.name}`).setStyle(ButtonStyle.Primary)
)
);
const row2=backBtn('menu_obf');
return{embeds:[embed],components:[row1,row2]};
}

async function buildLuaFreeMenu(userId){
const data=pendingObf.get(userId)||{type:'luafree',plugins:[]};
const selected=data.plugins||[];

const embed=new EmbedBuilder()
.setTitle('🌐 Lua Free Obfuscator')
.setColor(0x2ecc71)
.setDescription(`**Selected Plugins (${selected.length}):**\n${selected.length?selected.map(p=>`✅ ${p}`).join('\n'):'_None selected_'}\n\n📤 Upload file .lua setelah memilih plugin!`)
.setFooter({text:'Pilih plugins dari dropdown dibawah'});

const selectRow=new ActionRowBuilder().addComponents(
new StringSelectMenuBuilder()
.setCustomId('luafree_plugins')
.setPlaceholder('🔧 Pilih Plugins...')
.setMinValues(0)
.setMaxValues(LUAFREE_PLUGINS.length)
.addOptions(LUAFREE_PLUGINS.map(p=>({
label:p.name,
description:p.desc,
value:p.id,
emoji:p.emoji,
default:selected.includes(p.id)
})))
);

const btnRow=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('luafree_process').setLabel('🚀 Process').setStyle(ButtonStyle.Success).setDisabled(selected.length===0),
new ButtonBuilder().setCustomId('luafree_clear').setLabel('🗑️ Clear').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('menu_obf').setLabel('◀️ Back').setStyle(ButtonStyle.Secondary)
);

pendingObf.set(userId,data);
return{embeds:[embed],components:[selectRow,btnRow]};
}

async function buildKeyMenu(){
const embed=new EmbedBuilder()
.setTitle('🔑 Key Management')
.setColor(0x2ecc71)
.setDescription(`Service: \`${SERVICE_ID}\``);

const row1=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_list').setLabel('📋 List').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('key_create').setLabel('➕ Create').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('key_batch').setLabel('📦 Batch').setStyle(ButtonStyle.Success)
);
const row2=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('key_reset').setLabel('🔄 Reset HWID').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️ Back').setStyle(ButtonStyle.Secondary)
);
return{embeds:[embed],components:[row1,row2]};
}

async function buildKeyList(){
const r=await jnkieReq('GET',`/keys?serviceId=${SERVICE_ID}&limit=25`);
let items=r.data?.keys||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[];

const list=items.slice(0,15).map(k=>{
const key=String(k.key_value||k.key||k.id||'?');
const exp=k.expires_at?new Date(k.expires_at).toLocaleDateString():'∞';
const icon=k.is_invalidated?'🚫':'🔑';
return`${icon} \`${key.substring(0,20)}...\` exp:${exp}`;
}).join('\n');

const embed=new EmbedBuilder()
.setTitle(`🔑 Keys (${SERVICE_ID})`)
.setColor(0x2ecc71)
.setDescription(list||'No keys')
.setFooter({text:`Total: ${items.length}`});

return{embeds:[embed],components:[backBtn('menu_key')]};
}

async function buildServiceMenu(){
const r=await jnkieReq('GET','/services');
let items=r.data?.services||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);

const embed=new EmbedBuilder()
.setTitle('📦 Services')
.setColor(0x3498db)
.setDescription(items.map(s=>`\`${s.id}\` **${s.name||'?'}**`).join('\n')||'No services');

const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('service_refresh').setLabel('🔄').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('service_create').setLabel('➕ Create').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('service_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️').setStyle(ButtonStyle.Secondary)
);
return{embeds:[embed],components:[row]};
}

async function buildProviderMenu(){
const r=await jnkieReq('GET','/providers');
let items=r.data?.providers||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);

const embed=new EmbedBuilder()
.setTitle('📦 Providers')
.setColor(0xe67e22)
.setDescription(items.map(p=>`\`${p.id}\` **${p.name||'?'}** (${p.key_valid_minutes||0}min)`).join('\n')||'No providers');

const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('provider_refresh').setLabel('🔄').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('provider_create').setLabel('➕ Create').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️').setStyle(ButtonStyle.Secondary)
);
return{embeds:[embed],components:[row]};
}

async function buildIntegrationMenu(){
const r=await jnkieReq('GET','/integrations');
let items=r.data?.integrations||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);

const embed=new EmbedBuilder()
.setTitle('🔗 Integrations')
.setColor(0x9b59b6)
.setDescription(items.map(i=>`\`${i.id}\` **${i.name||'?'}** (${i.type||'?'})`).join('\n')||'No integrations');

const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('integration_refresh').setLabel('🔄').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('integration_types').setLabel('📋 Types').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️').setStyle(ButtonStyle.Secondary)
);
return{embeds:[embed],components:[row]};
}

async function buildStatus(){
const s=await jnkieReq('GET','/services');
const p=await jnkieReq('GET','/providers');
const i=await jnkieReq('GET','/integrations');

const embed=new EmbedBuilder()
.setTitle('📊 Status')
.setColor(0x2ecc71)
.addFields(
{name:'🤖 Bot',value:'✅ Online',inline:true},
{name:'🔑 jnkie',value:JNKIE_API_KEY?`✅ (${s.status})`:'❌',inline:true},
{name:'🔮 LuaFree',value:LUAFREE_API_KEY?'✅':'❌',inline:true},
{name:'📦 Services',value:String((s.data?.services||s.data||[]).length||0),inline:true},
{name:'📦 Providers',value:String((p.data?.providers||p.data||[]).length||0),inline:true},
{name:'🔗 Integrations',value:String((i.data?.integrations||i.data||[]).length||0),inline:true}
);
return{embeds:[embed],components:[backBtn('menu_main')]};
}

// ========== MODALS ==========
function showKeyCreateModal(i){
const modal=new ModalBuilder().setCustomId('modal_key_create').setTitle('Create Key');
modal.addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('service_id').setLabel('Service ID').setStyle(TextInputStyle.Short).setValue(SERVICE_ID).setRequired(true)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note').setStyle(TextInputStyle.Short).setPlaceholder('Optional note').setRequired(false))
);
i.showModal(modal);
}

function showKeyBatchModal(i){
const modal=new ModalBuilder().setCustomId('modal_key_batch').setTitle('Batch Create Keys');
modal.addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('service_id').setLabel('Service ID').setStyle(TextInputStyle.Short).setValue(SERVICE_ID).setRequired(true)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('count').setLabel('Count').setStyle(TextInputStyle.Short).setValue('5').setRequired(true))
);
i.showModal(modal);
}

function showKeyDeleteModal(i){
const modal=new ModalBuilder().setCustomId('modal_key_delete').setTitle('Delete Key');
modal.addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_id').setLabel('Key ID').setStyle(TextInputStyle.Short).setPlaceholder('Enter key ID').setRequired(true))
);
i.showModal(modal);
}

function showKeyResetModal(i){
const modal=new ModalBuilder().setCustomId('modal_key_reset').setTitle('Reset HWID');
modal.addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_id').setLabel('Key ID').setStyle(TextInputStyle.Short).setPlaceholder('Enter key ID').setRequired(true))
);
i.showModal(modal);
}

function showServiceCreateModal(i){
const modal=new ModalBuilder().setCustomId('modal_service_create').setTitle('Create Service');
modal.addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false))
);
i.showModal(modal);
}

function showServiceDeleteModal(i){
const modal=new ModalBuilder().setCustomId('modal_service_delete').setTitle('Delete Service');
modal.addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('service_id').setLabel('Service ID').setStyle(TextInputStyle.Short).setRequired(true))
);
i.showModal(modal);
}

function showProviderCreateModal(i){
const modal=new ModalBuilder().setCustomId('modal_provider_create').setTitle('Create Provider');
modal.addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('minutes').setLabel('Key Valid Minutes').setStyle(TextInputStyle.Short).setValue('60').setRequired(true))
);
i.showModal(modal);
}

async function getIntegrationTypes(){
const r=await jnkieReq('GET','/integrations/types');
return`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``;
}

// ========== PROCESS LUA FREE ==========
async function processLuaFree(i){
const data=pendingObf.get(i.user.id);
if(!data||!data.plugins||data.plugins.length===0){
return i.reply({content:'❌ Pilih plugins terlebih dahulu!',ephemeral:true});
}

await i.update({content:`🌐 **Lua Free Ready!**\n\n**Plugins:** ${data.plugins.join(', ')}\n\n📤 **Upload file .lua sekarang!**`,embeds:[],components:[backBtn('menu_obf')]});
}

// ========== FILE UPLOAD HANDLER ==========
client.on('messageCreate',async msg=>{
if(msg.author.bot)return;
if(msg.attachments.size===0)return;

const att=msg.attachments.first();
if(!att.name.endsWith('.lua'))return;

const data=pendingObf.get(msg.author.id);
if(!data)return;

try{
const script=await downloadFile(att.url);

if(data.type==='prometheus'){
await processPrometheus(msg,script,att.name,data.preset);
}else if(data.type==='luafree'){
await processLuaFreeFile(msg,script,att.name,data.plugins);
}

pendingObf.delete(msg.author.id);
}catch(e){
safeSend(msg.channel,`❌ ${e.message}`);
}
});

async function processPrometheus(msg,script,filename,preset){
const status=await safeSend(msg.channel,`⚡ **Prometheus [${preset}]** Processing...`);
const ts=Date.now();
const inp=path.join(PROMETHEUS_PATH,`in_${ts}.lua`);
const out=path.join(PROMETHEUS_PATH,`out_${ts}.lua`);

try{
fs.writeFileSync(inp,script.replace(/^\uFEFF/,'').trim(),'utf8');
await execAsync(`cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset} "${inp}" --out "${out}" 2>&1`,{timeout:120000});

if(fs.existsSync(out)){
const result=`-- Prometheus [${preset}]\n`+fs.readFileSync(out,'utf8');
await status.edit({content:'✅ **Prometheus Success!**',files:[new AttachmentBuilder(Buffer.from(result),{name:`prom_${filename}`})]});
}else{
await status.edit('❌ Failed to generate output');
}
}finally{
[inp,out].forEach(f=>{try{fs.unlinkSync(f);}catch(e){}});
}
}

async function processLuaFreeFile(msg,script,filename,plugins){
if(!LUAFREE_API_KEY)return safeSend(msg.channel,'❌ LUAFREE_API_KEY not set');

const status=await safeSend(msg.channel,`🌐 **Lua Free** Processing...\nPlugins: ${plugins.join(', ')}`);

try{
// Step 1: Create session
await status.edit('🌐 [1/2] Creating session...');
const step1=await luaFreeNewScript(script);

if(!step1.sessionId){
return status.edit(`❌ Session Failed:\n\`\`\`json\n${JSON.stringify(step1,null,2).substring(0,1000)}\n\`\`\``);
}

// Step 2: Obfuscate with selected plugins
await status.edit(`🌐 [2/2] Obfuscating...\nSession: ${step1.sessionId.substring(0,20)}...`);

const options={};
plugins.forEach(p=>options[p]=true);

const step2=await luaFreeObfuscate(step1.sessionId,options);

if(!step2.code){
return status.edit(`❌ Obfuscate Failed:\n\`\`\`json\n${JSON.stringify(step2,null,2).substring(0,1000)}\n\`\`\``);
}

const header=`-- Lua Free Obfuscator\n-- Plugins: ${plugins.join(', ')}\n\n`;
await status.edit({content:'✅ **Lua Free Success!**',files:[new AttachmentBuilder(Buffer.from(header+step2.code),{name:`luafree_${filename}`})]});

}catch(e){
await status.edit(`❌ ${e.message}`);
}
}

// ========== LUA FREE API ==========
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
'Content-Length':Buffer.byteLength(script,'utf8')
}
},res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{try{resolve(JSON.parse(d));}catch(e){resolve({error:'Parse failed',raw:d});}});
});
req.on('error',e=>resolve({error:e.message}));
req.setTimeout(60000,()=>{req.destroy();resolve({error:'Timeout'});});
req.write(script,'utf8');
req.end();
});
}

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
res.on('end',()=>{try{resolve(JSON.parse(d));}catch(e){resolve({error:'Parse failed',raw:d});}});
});
req.on('error',e=>resolve({error:e.message}));
req.setTimeout(120000,()=>{req.destroy();resolve({error:'Timeout'});});
req.write(body);
req.end();
});
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
...(body?{'Content-Length':Buffer.byteLength(data)}:{})
}
},res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{try{resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:JSON.parse(d),raw:d});}catch(e){resolve({ok:false,status:res.statusCode,raw:d});}});
});
req.on('error',e=>resolve({ok:false,error:e.message}));
req.setTimeout(15000,()=>{req.destroy();resolve({ok:false,error:'Timeout'});});
if(body)req.write(data);
req.end();
});
}

// ========== HELPERS ==========
function backBtn(target){
return new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId(target).setLabel('◀️ Back').setStyle(ButtonStyle.Secondary)
);
}

function downloadFile(url){
return new Promise((r,j)=>{https.get(url,res=>{const d=[];res.on('data',c=>d.push(c));res.on('end',()=>r(Buffer.concat(d).toString('utf8')));}).on('error',j);});
}

async function safeSend(channel,content){
try{return await channel.send(content);}catch(e){console.error('Send failed:',e.message);return null;}
}

async function showStatus(msg){
const r=await buildStatus();
safeSend(msg.channel,r);
}

async function showHelp(msg){
const embed=new EmbedBuilder()
.setTitle('📖 Help')
.setColor(0x5865F2)
.setDescription('Gunakan `!menu` untuk membuka control panel interaktif!')
.addFields(
{name:'Commands',value:'`!menu` - Main menu\n`!obf` - Obfuscator\n`!key` - Keys\n`!service` - Services\n`!status` - Status'}
);
safeSend(msg.channel,{embeds:[embed]});
}

client.login(TOKEN);
