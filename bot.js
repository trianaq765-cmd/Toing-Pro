const{Client,GatewayIntentBits,AttachmentBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,StringSelectMenuBuilder,SlashCommandBuilder,REST,Routes}=require('discord.js');
const{exec}=require('child_process');const fs=require('fs');const path=require('path');const http=require('http');const https=require('https');const{promisify}=require('util');const execAsync=promisify(exec);

// ========== HTTP SERVER ==========
const PORT=process.env.PORT||3000;
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');}).listen(PORT,()=>console.log(`[HTTP] Port ${PORT}`));

// ========== CLIENT ==========
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});

// ========== CONFIG ==========
const TOKEN=process.env.DISCORD_TOKEN;
const CLIENT_ID=process.env.CLIENT_ID;
const PROMETHEUS_PATH=process.env.PROMETHEUS_PATH||'/app/prometheus';
const JNKIE_API_KEY=process.env.JNKIE_API_KEY||'';
const SERVICE_ID=process.env.JNKIE_SERVICE_ID||'';
const PROVIDER_ID=process.env.JNKIE_PROVIDER_ID||'';
const DISCORD_LINK=process.env.DISCORD_LINK||'https://discord.gg/yourinvite';
const ADMIN_IDS=(process.env.ADMIN_IDS||'').split(',').filter(Boolean);
const AUTO_REGISTER=process.env.AUTO_REGISTER!=='false';

if(!TOKEN){console.error('❌ DISCORD_TOKEN NOT FOUND');process.exit(1);}
if(!CLIENT_ID){console.error('❌ CLIENT_ID NOT FOUND');process.exit(1);}

// ========== HELPERS ==========
function safeInt(val,def=0){if(!val||val==='')return def;const p=parseInt(String(val).trim(),10);return isNaN(p)?def:p;}
function isAdmin(uid){return ADMIN_IDS.length===0||ADMIN_IDS.includes(String(uid));}
function checkConfig(){const e=[];if(!JNKIE_API_KEY)e.push('JNKIE_API_KEY');if(!SERVICE_ID)e.push('JNKIE_SERVICE_ID');if(!PROVIDER_ID)e.push('JNKIE_PROVIDER_ID');return{valid:e.length===0,missing:e};}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function log(tag,msg){console.log(`[${new Date().toISOString().substr(11,8)}][${tag}] ${msg}`);}
function formatDate(d){if(!d)return'Never';try{return new Date(d).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});}catch(e){return d;}}
function formatSize(b){return b<1024?b+'B':b<1048576?(b/1024).toFixed(1)+'KB':(b/1048576).toFixed(1)+'MB';}

// ========== COLORS ==========
const COLORS={success:0x00ff00,error:0xff0000,warning:0xff9900,info:0x5865F2,primary:0x2ecc71};
const HEADER={prometheus:`-- Protected by Prometheus Obfuscator\n-- ${DISCORD_LINK}\n\n`};

// ========== SLASH COMMANDS ==========
function buildCommands(){
return[
// Public
new SlashCommandBuilder().setName('menu').setDescription('📚 Main Menu'),
new SlashCommandBuilder().setName('help').setDescription('❓ Help'),
new SlashCommandBuilder().setName('status').setDescription('📊 Status'),
new SlashCommandBuilder().setName('invite').setDescription('🔗 Get bot invite link'),

// Obfuscator
new SlashCommandBuilder().setName('obf').setDescription('🔒 Prometheus Obfuscator')
  .addAttachmentOption(o=>o.setName('file').setDescription('.lua file').setRequired(true))
  .addStringOption(o=>o.setName('preset').setDescription('Preset').addChoices(
    {name:'Minify',value:'Minify'},
    {name:'Weak',value:'Weak'},
    {name:'Medium',value:'Medium'}
  )),

// Panel
new SlashCommandBuilder().setName('panel').setDescription('🎛️ Jnkie Panel'),
new SlashCommandBuilder().setName('keys').setDescription('🔑 View all keys'),
new SlashCommandBuilder().setName('createkey').setDescription('🔑 Quick create key'),
new SlashCommandBuilder().setName('config').setDescription('⚙️ View configuration'),

// Key Commands
new SlashCommandBuilder().setName('searchkey').setDescription('🔍 Search key by value')
  .addStringOption(o=>o.setName('value').setDescription('Key value to search').setRequired(true)),
new SlashCommandBuilder().setName('keyinfo').setDescription('📋 View key detail')
  .addStringOption(o=>o.setName('key').setDescription('Key ID or key value').setRequired(true)),
new SlashCommandBuilder().setName('deletekey').setDescription('🗑️ Delete key')
  .addStringOption(o=>o.setName('key').setDescription('Key ID or key value').setRequired(true)),
new SlashCommandBuilder().setName('resetkey').setDescription('🔄 Reset key HWID')
  .addStringOption(o=>o.setName('key').setDescription('Key ID or key value').setRequired(true)),
new SlashCommandBuilder().setName('invalidate').setDescription('🚫 Invalidate key')
  .addStringOption(o=>o.setName('key').setDescription('Key ID or key value').setRequired(true)),
new SlashCommandBuilder().setName('revalidate').setDescription('✅ Revalidate key')
  .addStringOption(o=>o.setName('key').setDescription('Key ID or key value').setRequired(true)),
].map(c=>c.toJSON());
}

// ========== COMMAND REGISTRATION ==========
async function registerGlobal(){
log('REG','Registering global commands...');
const rest=new REST({version:'10'}).setToken(TOKEN);
try{
const cmds=buildCommands();
await rest.put(Routes.applicationCommands(CLIENT_ID),{body:cmds});
log('REG',`${cmds.length} global commands registered`);
return{success:true,count:cmds.length};
}catch(e){return{success:false,error:e.message};}
}

async function registerGuild(guildId){
log('REG',`Registering to guild ${guildId}...`);
const rest=new REST({version:'10'}).setToken(TOKEN);
try{
const cmds=buildCommands();
await rest.put(Routes.applicationGuildCommands(CLIENT_ID,guildId),{body:cmds});
log('REG',`${cmds.length} commands registered to ${guildId}`);
return{success:true,count:cmds.length};
}catch(e){return{success:false,error:e.message};}
}

async function autoRegister(){
log('REG','=== AUTO REGISTRATION ===');
const r=await registerGlobal();
if(r.success)return log('REG','✅ Global registration success!');
log('REG','Global failed, trying per-guild...');
for(const[guildId]of client.guilds.cache){
await registerGuild(guildId);
await sleep(1000);
}
}

// ========== READY ==========
client.once('ready',async()=>{
console.log('');
console.log('╔════════════════════════════════════════╗');
console.log(`║  Bot: ${client.user.tag.padEnd(31)}║`);
console.log(`║  Servers: ${String(client.guilds.cache.size).padEnd(28)}║`);
console.log(`║  Jnkie: ${(JNKIE_API_KEY?'✅':'❌').padEnd(30)}║`);
console.log(`║  Service: ${(SERVICE_ID||'NOT SET').padEnd(28)}║`);
console.log(`║  Provider: ${(PROVIDER_ID||'NOT SET').padEnd(27)}║`);
console.log('╚════════════════════════════════════════╝');
console.log('');
if(AUTO_REGISTER){await sleep(2000);await autoRegister();}
client.user.setActivity('/menu | /help',{type:0});
});

client.on('guildCreate',async guild=>{
log('GUILD',`Joined: ${guild.name}`);
await sleep(1000);
await registerGuild(guild.id);
});

// ========== MESSAGE COMMANDS ==========
client.on('messageCreate',async msg=>{
if(msg.author.bot)return;
const c=msg.content.trim().toLowerCase();
if(!isAdmin(msg.author.id))return;

if(c==='!register'){const m=await msg.reply('⏳');const r=await registerGuild(msg.guild.id);await m.edit(r.success?`✅ ${r.count} commands registered!`:`❌ ${r.error}`);}
if(c==='!global'){const m=await msg.reply('⏳');const r=await registerGlobal();await m.edit(r.success?`✅ ${r.count} commands registered globally!`:`❌ ${r.error}`);}
if(c==='!info'){const ch=checkConfig();await msg.reply(`\`\`\`\nJnkie: ${JNKIE_API_KEY?'✅':'❌'}\nService: ${SERVICE_ID||'❌'}\nProvider: ${PROVIDER_ID||'❌'}\nStatus: ${ch.valid?'✅':'❌ '+ch.missing.join(',')}\n\`\`\``);}
});

// ========== INTERACTION HANDLER ==========
client.on('interactionCreate',async i=>{
try{
if(i.isChatInputCommand())await handleSlash(i);
else if(i.isButton())await handleButton(i);
else if(i.isModalSubmit())await handleModal(i);
else if(i.isStringSelectMenu())await handleSelect(i);
}catch(e){
log('ERR',e.message);
const fn=i.replied||i.deferred?i.followUp.bind(i):i.reply.bind(i);
fn({content:`❌ ${e.message}`,ephemeral:true}).catch(()=>{});
}
});

// ========== SLASH HANDLER ==========
async function handleSlash(i){
const cmd=i.commandName;

// === PUBLIC ===
if(cmd==='menu'){
const adm=isAdmin(i.user.id);
return i.reply({embeds:[new EmbedBuilder().setTitle('📚 Menu').setColor(COLORS.info)
.setDescription(adm?`**🔒 Obfuscation**
\`/obf\` - Prometheus

**🔑 Key Management**
\`/panel\` - Main Panel
\`/keys\` - View Keys
\`/createkey\` - Quick Create
\`/searchkey\` - Search Key
\`/keyinfo\` - Key Detail
\`/deletekey\` - Delete Key
\`/resetkey\` - Reset HWID
\`/invalidate\` - Invalidate
\`/revalidate\` - Revalidate

**⚙️ Config**
\`/config\` - Configuration
\`/status\` - Status`:`\`/help\` \`/status\` \`/invite\``)]});
}

if(cmd==='help')return i.reply({embeds:[new EmbedBuilder().setTitle('❓ Help').setColor(COLORS.info).setDescription('Use `/menu` to see all commands')]});

if(cmd==='status'){
await i.deferReply();
const r=checkConfig().valid?await jnkieReq('GET','/services'):{ok:false};
return i.editReply({embeds:[new EmbedBuilder().setTitle('📊 Status').setColor(COLORS.primary).addFields({name:'Bot',value:'✅',inline:true},{name:'Jnkie',value:r.ok?'✅':'❌',inline:true})]});
}

if(cmd==='invite')return i.reply({embeds:[new EmbedBuilder().setTitle('🔗 Invite').setColor(COLORS.info).setDescription(`[Click to invite](https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands)`)]});

// === ADMIN CHECK ===
if(!isAdmin(i.user.id))return i.reply({content:'❌ Admin only',ephemeral:true});

// === CONFIG ===
if(cmd==='config'){
const c=checkConfig();
return i.reply({embeds:[new EmbedBuilder().setTitle('⚙️ Config').setColor(c.valid?COLORS.success:COLORS.error)
.addFields(
{name:'Jnkie API',value:JNKIE_API_KEY?'✅ Set':'❌',inline:true},
{name:'Service ID',value:SERVICE_ID||'❌',inline:true},
{name:'Provider ID',value:PROVIDER_ID||'❌',inline:true},
{name:'Status',value:c.valid?'✅ Ready':'❌ Missing: '+c.missing.join(', ')}
)],ephemeral:true});
}

// === PROMETHEUS ===
if(cmd==='obf'){
const file=i.options.getAttachment('file');
const preset=i.options.getString('preset')||'Minify';
if(!file.name.endsWith('.lua'))return i.reply({content:'❌ .lua only',ephemeral:true});
await i.deferReply();
const script=await downloadFile(file.url);
const r=await prometheusObf(script,preset);
if(r.success){
const code=HEADER.prometheus+r.code;
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Prometheus').setColor(COLORS.success).addFields({name:'Preset',value:preset,inline:true},{name:'Size',value:`${formatSize(script.length)} → ${formatSize(code.length)}`,inline:true})],files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`obf_${Date.now()}.lua`})]});
}
return i.editReply(`❌ ${r.error}`);
}

// === PANEL ===
if(cmd==='panel'){
const c=checkConfig();
if(!c.valid)return i.reply({content:`⚠️ Missing: ${c.missing.join(', ')}`,ephemeral:true});
return i.reply({embeds:[new EmbedBuilder().setTitle('🎛️ Jnkie Panel').setColor(COLORS.info).setDescription(`**Service ID:** \`${SERVICE_ID}\`\n**Provider ID:** \`${PROVIDER_ID}\``)],components:panelButtons()});
}

// === KEYS LIST ===
if(cmd==='keys'){
const c=checkConfig();
if(!c.valid)return i.reply({content:`⚠️ Missing: ${c.missing.join(', ')}`,ephemeral:true});
await i.deferReply();
return i.editReply(await getKeysEmbed());
}

// === CREATE KEY ===
if(cmd==='createkey'){
const c=checkConfig();
if(!c.valid)return i.reply({content:`⚠️ Missing: ${c.missing.join(', ')}`,ephemeral:true});
await i.deferReply();
const r=await jnkieReq('POST','/keys',{
  service_id:safeInt(SERVICE_ID),
  provider_id:safeInt(PROVIDER_ID),
  key_name:'Quick Create',
  hwid_limit:3
});
if(!r.ok)return i.editReply(`❌ Error: ${JSON.stringify(r.data)}`);
const key=r.data?.key?.key_value||r.data?.key_value||'N/A';
const keyId=r.data?.key?.id||r.data?.id||'N/A';
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Key Created').setColor(COLORS.success).setDescription(`\`\`\`${key}\`\`\``).addFields({name:'ID',value:String(keyId),inline:true},{name:'HWID Limit',value:'3',inline:true})]});
}

// === SEARCH KEY ===
if(cmd==='searchkey'){
const c=checkConfig();
if(!c.valid)return i.reply({content:`⚠️ Missing: ${c.missing.join(', ')}`,ephemeral:true});
const value=i.options.getString('value');
await i.deferReply();
const r=await jnkieReq('GET',`/keys?service_id=${safeInt(SERVICE_ID)}&key=${encodeURIComponent(value)}`);
if(!r.ok)return i.editReply(`❌ Error: ${r.error||JSON.stringify(r.data)}`);
const keys=r.data?.keys||[];
if(!keys.length)return i.editReply({embeds:[new EmbedBuilder().setTitle('🔍 Search Result').setColor(COLORS.warning).setDescription('No keys found')]});
return i.editReply(buildKeyDetailEmbed(keys[0]));
}

// === KEY INFO ===
if(cmd==='keyinfo'){
const c=checkConfig();
if(!c.valid)return i.reply({content:`⚠️ Missing: ${c.missing.join(', ')}`,ephemeral:true});
const key=i.options.getString('key');
await i.deferReply();
const r=await jnkieReq('GET',`/keys/${encodeURIComponent(key)}`);
if(!r.ok)return i.editReply(`❌ Key not found or error`);
return i.editReply(buildKeyDetailEmbed(r.data?.key||r.data));
}

// === DELETE KEY ===
if(cmd==='deletekey'){
const key=i.options.getString('key');
await i.deferReply();
const r=await jnkieReq('DELETE',`/keys/${encodeURIComponent(key)}`);
return i.editReply(r.ok?{embeds:[new EmbedBuilder().setTitle('✅ Deleted').setColor(COLORS.success).setDescription(`Key \`${key}\` has been deleted`)]}:`❌ Failed: ${JSON.stringify(r.data)}`);
}

// === RESET KEY HWID ===
if(cmd==='resetkey'){
const key=i.options.getString('key');
await i.deferReply();
const r=await jnkieReq('POST',`/keys/${encodeURIComponent(key)}/reset-hwid`);
return i.editReply(r.ok?{embeds:[new EmbedBuilder().setTitle('✅ HWID Reset').setColor(COLORS.success).setDescription(`All HWIDs removed from key \`${key}\``)]}:`❌ Failed: ${JSON.stringify(r.data)}`);
}

// === INVALIDATE KEY ===
if(cmd==='invalidate'){
const key=i.options.getString('key');
await i.deferReply();
const r=await jnkieReq('PUT',`/keys/${encodeURIComponent(key)}`,{is_invalidated:true});
return i.editReply(r.ok?{embeds:[new EmbedBuilder().setTitle('🚫 Invalidated').setColor(COLORS.warning).setDescription(`Key \`${key}\` is now invalid`)]}:`❌ Failed: ${JSON.stringify(r.data)}`);
}

// === REVALIDATE KEY ===
if(cmd==='revalidate'){
const key=i.options.getString('key');
await i.deferReply();
const r=await jnkieReq('PUT',`/keys/${encodeURIComponent(key)}`,{is_invalidated:false});
return i.editReply(r.ok?{embeds:[new EmbedBuilder().setTitle('✅ Revalidated').setColor(COLORS.success).setDescription(`Key \`${key}\` is now active`)]}:`❌ Failed: ${JSON.stringify(r.data)}`);
}
}

// ========== BUTTON BUILDERS ==========
function panelButtons(){
return[
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('p_keys').setLabel('🔑 Keys').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('p_services').setLabel('📦 Services').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('p_providers').setLabel('🏭 Providers').setStyle(ButtonStyle.Primary)
)
];
}

function keyButtons(){
return[
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('k_create').setLabel('➕ Create').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('k_batch').setLabel('📦 Batch').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('k_advanced').setLabel('⚙️ Advanced').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('k_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
),
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('k_search').setLabel('🔍 Search').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('k_detail').setLabel('📋 Detail').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('k_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('k_export').setLabel('📤 Export').setStyle(ButtonStyle.Secondary)
),
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('k_invalidate').setLabel('🚫 Invalidate').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('k_revalidate').setLabel('✅ Revalidate').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('k_resethwid').setLabel('🔄 Reset HWID').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('k_bulkdelete').setLabel('🗑️ Bulk Delete').setStyle(ButtonStyle.Danger)
),
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('k_filter').setLabel('🔽 Filter').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('p_back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
)
];
}

function serviceButtons(){
return[new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('s_list').setLabel('📋 List').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('s_create').setLabel('➕ Create').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('s_detail').setLabel('📋 Detail').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('s_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('p_back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
)];
}

function providerButtons(){
return[new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('pr_list').setLabel('📋 List').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('pr_create').setLabel('➕ Create').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('pr_detail').setLabel('📋 Detail').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('pr_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('p_back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
)];
}

function keyActionButtons(keyId){
return[new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId(`ka_reset_${keyId}`).setLabel('🔄 Reset HWID').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId(`ka_inv_${keyId}`).setLabel('🚫 Invalidate').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId(`ka_val_${keyId}`).setLabel('✅ Revalidate').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId(`ka_del_${keyId}`).setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('k_refresh').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
)];
}

function filterSelectMenu(){
return[new ActionRowBuilder().addComponents(
new StringSelectMenuBuilder().setCustomId('k_filter_select').setPlaceholder('Select filter...').addOptions(
{label:'All Keys',value:'all',emoji:'📋'},
{label:'Active Only',value:'active',emoji:'✅'},
{label:'Used',value:'used',emoji:'📌'},
{label:'Expired',value:'expired',emoji:'⏰'},
{label:'Invalidated',value:'invalidated',emoji:'🚫'}
)
)];
}

// ========== EMBEDS ==========
async function getKeysEmbed(filter='all'){
let endpoint=`/keys?service_id=${safeInt(SERVICE_ID)}&limit=100`;
if(filter&&filter!=='all')endpoint+=`&status=${filter}`;

const r=await jnkieReq('GET',endpoint);
if(!r.ok)return{content:`❌ Error: ${r.error||JSON.stringify(r.data)}`};
const keys=r.data?.keys||[];
if(!keys.length)return{embeds:[new EmbedBuilder().setTitle('🔑 Keys').setColor(COLORS.warning).setDescription(`No keys found${filter!=='all'?` (filter: ${filter})`:''}`).setFooter({text:`Filter: ${filter}`})],components:keyButtons()};

const active=keys.filter(k=>!k.is_invalidated&&!isExpired(k)).length;
const used=keys.filter(k=>k.used_at).length;
const expired=keys.filter(k=>isExpired(k)).length;
const invalid=keys.filter(k=>k.is_invalidated).length;

const preview=keys.slice(0,10).map((k,idx)=>{
const status=k.is_invalidated?'🚫':isExpired(k)?'⏰':'✅';
const hwid=k.hwids?.length||0;
const limit=k.hwid_limit||'∞';
const premium=k.is_premium?'👑':'';
return`${status}${premium} \`${k.id}\` | \`${k.key_value.substring(0,16)}...\` | HWID: ${hwid}/${limit}`;
}).join('\n');

const file=keys.map(k=>`ID: ${k.id}\nKey: ${k.key_value}\nStatus: ${k.is_invalidated?'Invalid':isExpired(k)?'Expired':'Active'}\nPremium: ${k.is_premium?'Yes':'No'}\nHWID: ${k.hwids?.length||0}/${k.hwid_limit||'∞'}\nExpires: ${k.expires_at||'Never'}\nCreated: ${k.created_at}\n`).join('\n---\n');

return{
embeds:[new EmbedBuilder().setTitle(`🔑 Keys (${keys.length})`).setColor(COLORS.primary)
.addFields(
{name:'✅ Active',value:String(active),inline:true},
{name:'📌 Used',value:String(used),inline:true},
{name:'⏰ Expired',value:String(expired),inline:true},
{name:'🚫 Invalid',value:String(invalid),inline:true},
{name:'📊 Total',value:String(keys.length),inline:true},
{name:'🔽 Filter',value:filter,inline:true}
)
.setDescription(preview)],
files:[new AttachmentBuilder(Buffer.from(file,'utf8'),{name:'keys.txt'})],
components:keyButtons()
};
}

function isExpired(key){
if(!key.expires_at)return false;
return new Date(key.expires_at)<new Date();
}

function buildKeyDetailEmbed(key){
if(!key)return{content:'❌ Key not found'};

const status=key.is_invalidated?'🚫 Invalidated':isExpired(key)?'⏰ Expired':'✅ Active';
const premium=key.is_premium?'✅ Yes':'❌ No';
const oneTime=key.one_time_use?'✅ Yes':'❌ No';
const noHwid=key.no_hwid?'✅ Yes':'❌ No';
const expiryFirst=key.expiry_on_first_use?'✅ Yes':'❌ No';

const hwids=key.hwids||[];
const hwidList=hwids.length?hwids.map(h=>`• \`${h.hwid.substring(0,20)}${h.hwid.length>20?'...':''}\`\n  └ ${h.bound_by} | ${formatDate(h.bound_at)}`).join('\n'):'No HWIDs bound';

const embed=new EmbedBuilder()
.setTitle(`🔑 Key Detail`)
.setColor(key.is_invalidated?COLORS.error:isExpired(key)?COLORS.warning:COLORS.success)
.setDescription(`\`\`\`${key.key_value}\`\`\``)
.addFields(
{name:'🆔 ID',value:String(key.id),inline:true},
{name:'📊 Status',value:status,inline:true},
{name:'👑 Premium',value:premium,inline:true},
{name:'📦 Service',value:key.service_name||String(key.service_id||'N/A'),inline:true},
{name:'🏭 Provider',value:key.provider_name||String(key.provider_id||'N/A'),inline:true},
{name:'🔢 HWID Limit',value:key.hwid_limit?String(key.hwid_limit):'Unlimited',inline:true},
{name:'1️⃣ One-Time',value:oneTime,inline:true},
{name:'🚫 No HWID',value:noHwid,inline:true},
{name:'⏱️ Expiry First Use',value:expiryFirst,inline:true},
{name:'⏳ Validity',value:key.validity_minutes?`${key.validity_minutes} mins`:'Forever',inline:true},
{name:'📅 Expires At',value:formatDate(key.expires_at),inline:true},
{name:'✅ Used At',value:formatDate(key.used_at),inline:true},
{name:'🎮 Discord ID',value:key.discord_id||'None',inline:true},
{name:'📝 Key Name',value:key.key_name||'None',inline:true},
{name:'📆 Created',value:formatDate(key.created_at),inline:true},
{name:`📱 HWIDs (${hwids.length}/${key.hwid_limit||'∞'})`,value:hwidList.substring(0,1024)}
);

return{embeds:[embed],components:keyActionButtons(key.id)};
}

// ========== BUTTON HANDLER ==========
async function handleButton(i){
const id=i.customId;
if(!isAdmin(i.user.id))return i.reply({content:'❌ Admin only',ephemeral:true});

// Panel Navigation
if(id==='p_keys'){await i.deferUpdate();return i.editReply(await getKeysEmbed());}
if(id==='p_services')return i.update({embeds:[new EmbedBuilder().setTitle('📦 Services').setColor(COLORS.info).setDescription('Manage your services')],components:serviceButtons()});
if(id==='p_providers')return i.update({embeds:[new EmbedBuilder().setTitle('🏭 Providers').setColor(COLORS.info).setDescription('Manage your providers')],components:providerButtons()});
if(id==='p_back')return i.update({embeds:[new EmbedBuilder().setTitle('🎛️ Panel').setColor(COLORS.info).setDescription(`**Service:** \`${SERVICE_ID}\`\n**Provider:** \`${PROVIDER_ID}\``)],components:panelButtons()});

// Keys Actions
if(id==='k_refresh'){await i.deferUpdate();return i.editReply(await getKeysEmbed());}
if(id==='k_filter')return i.update({embeds:[new EmbedBuilder().setTitle('🔽 Filter Keys').setColor(COLORS.info).setDescription('Select a filter option')],components:filterSelectMenu()});

if(id==='k_export'){
await i.deferUpdate();
const r=await jnkieReq('GET',`/keys?service_id=${safeInt(SERVICE_ID)}&limit=1000`);
const keys=r.data?.keys||[];
const csv='ID,Key,Status,Premium,HWID_Count,HWID_Limit,Expires,Created\n'+keys.map(k=>`${k.id},"${k.key_value}",${k.is_invalidated?'Invalid':isExpired(k)?'Expired':'Active'},${k.is_premium?'Yes':'No'},${k.hwids?.length||0},${k.hwid_limit||'unlimited'},${k.expires_at||'never'},${k.created_at}`).join('\n');
return i.followUp({files:[new AttachmentBuilder(Buffer.from(csv,'utf8'),{name:`keys_export_${Date.now()}.csv`})]});
}

// Modal Triggers
if(id==='k_create')return showModal(i,'m_k_create','➕ Create Key',[{id:'key_name',label:'Key Name (optional)',required:false}]);
if(id==='k_batch')return showModal(i,'m_k_batch','📦 Batch Create',[{id:'amount',label:'Amount (max 100)',value:'5'},{id:'key_name',label:'Key Name (optional)',required:false}]);
if(id==='k_search')return showModal(i,'m_k_search','🔍 Search Key',[{id:'value',label:'Key Value (partial match)'}]);
if(id==='k_detail')return showModal(i,'m_k_detail','📋 Key Detail',[{id:'key',label:'Key ID or Key Value'}]);
if(id==='k_delete')return showModal(i,'m_k_delete','🗑️ Delete Key',[{id:'key',label:'Key ID or Key Value'}]);
if(id==='k_invalidate')return showModal(i,'m_k_invalidate','🚫 Invalidate Key',[{id:'key',label:'Key ID or Key Value'}]);
if(id==='k_revalidate')return showModal(i,'m_k_revalidate','✅ Revalidate Key',[{id:'key',label:'Key ID or Key Value'}]);
if(id==='k_resethwid')return showModal(i,'m_k_resethwid','🔄 Reset HWID',[{id:'key',label:'Key ID or Key Value'}]);
if(id==='k_bulkdelete')return showModal(i,'m_k_bulkdelete','🗑️ Bulk Delete',[{id:'keys',label:'Key IDs or Values (comma separated)',style:'paragraph'}]);
if(id==='k_advanced')return showAdvancedKeyModal(i);

// Quick Actions from Detail
if(id.startsWith('ka_reset_')){
const keyId=id.replace('ka_reset_','');
await i.deferUpdate();
const r=await jnkieReq('POST',`/keys/${keyId}/reset-hwid`);
return i.followUp({content:r.ok?'✅ HWID Reset successfully':'❌ Failed to reset HWID',ephemeral:true});
}
if(id.startsWith('ka_inv_')){
const keyId=id.replace('ka_inv_','');
await i.deferUpdate();
const r=await jnkieReq('PUT',`/keys/${keyId}`,{is_invalidated:true});
return i.followUp({content:r.ok?'🚫 Key invalidated':'❌ Failed to invalidate',ephemeral:true});
}
if(id.startsWith('ka_val_')){
const keyId=id.replace('ka_val_','');
await i.deferUpdate();
const r=await jnkieReq('PUT',`/keys/${keyId}`,{is_invalidated:false});
return i.followUp({content:r.ok?'✅ Key revalidated':'❌ Failed to revalidate',ephemeral:true});
}
if(id.startsWith('ka_del_')){
const keyId=id.replace('ka_del_','');
await i.deferUpdate();
const r=await jnkieReq('DELETE',`/keys/${keyId}`);
if(r.ok)return i.editReply(await getKeysEmbed());
return i.followUp({content:'❌ Failed to delete',ephemeral:true});
}

// Services
if(id==='s_list'){
await i.deferUpdate();
const r=await jnkieReq('GET','/services');
const list=(r.data?.services||[]).map(s=>`\`${s.id}\` - **${s.name}** ${s.is_premium?'👑':''}\n└ ${s.description||'No description'}`).join('\n\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle('📦 Services').setColor(COLORS.info).setDescription(list||'No services found')],components:serviceButtons()});
}
if(id==='s_create')return showModal(i,'m_s_create','➕ Create Service',[{id:'name',label:'Service Name'},{id:'desc',label:'Description',required:false}]);
if(id==='s_detail')return showModal(i,'m_s_detail','📋 Service Detail',[{id:'id',label:'Service ID'}]);
if(id==='s_delete')return showModal(i,'m_s_delete','🗑️ Delete Service',[{id:'id',label:'Service ID'}]);

// Providers
if(id==='pr_list'){
await i.deferUpdate();
const r=await jnkieReq('GET','/providers');
const list=(r.data?.providers||[]).map(p=>`\`${p.id}\` - **${p.name}** ${p.is_active?'✅':'❌'}\n└ Valid: ${p.key_valid_minutes?p.key_valid_minutes+' mins':'Forever'}`).join('\n\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle('🏭 Providers').setColor(COLORS.info).setDescription(list||'No providers found')],components:providerButtons()});
}
if(id==='pr_create')return showModal(i,'m_pr_create','➕ Create Provider',[{id:'name',label:'Provider Name'},{id:'validity',label:'Key Valid Minutes (empty=forever)',required:false}]);
if(id==='pr_detail')return showModal(i,'m_pr_detail','📋 Provider Detail',[{id:'id',label:'Provider ID'}]);
if(id==='pr_delete')return showModal(i,'m_pr_delete','🗑️ Delete Provider',[{id:'id',label:'Provider ID'}]);

await i.deferUpdate();
}

// ========== SELECT MENU HANDLER ==========
async function handleSelect(i){
const id=i.customId;
if(!isAdmin(i.user.id))return i.reply({content:'❌ Admin only',ephemeral:true});

if(id==='k_filter_select'){
const filter=i.values[0];
await i.deferUpdate();
return i.editReply(await getKeysEmbed(filter));
}
}

// ========== MODAL HELPER ==========
function showModal(i,customId,title,fields){
const modal=new ModalBuilder().setCustomId(customId).setTitle(title);
fields.forEach(f=>{
const input=new TextInputBuilder()
.setCustomId(f.id)
.setLabel(f.label)
.setStyle(f.style==='paragraph'?TextInputStyle.Paragraph:TextInputStyle.Short)
.setRequired(f.required!==false);
if(f.value)input.setValue(f.value);
if(f.placeholder)input.setPlaceholder(f.placeholder);
modal.addComponents(new ActionRowBuilder().addComponents(input));
});
return i.showModal(modal);
}

function showAdvancedKeyModal(i){
return i.showModal(new ModalBuilder().setCustomId('m_k_advanced').setTitle('⚙️ Advanced Key Create')
.addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_name').setLabel('Key Name (optional)').setStyle(TextInputStyle.Short).setRequired(false)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hwid_limit').setLabel('HWID Limit (0=unlimited, default=3)').setStyle(TextInputStyle.Short).setValue('3').setRequired(false)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('validity').setLabel('Validity Minutes (empty=forever)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('1440 = 1 day, 10080 = 1 week')),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID (optional)').setStyle(TextInputStyle.Short).setRequired(false)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('options').setLabel('Options: premium,onetime,nohwid,expiryfirst').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Example: premium,expiryfirst'))
));
}

// ========== MODAL HANDLER ==========
async function handleModal(i){
const id=i.customId;
const sid=safeInt(SERVICE_ID),pid=safeInt(PROVIDER_ID);

// === KEYS ===
if(id==='m_k_create'){
await i.deferReply();
const keyName=i.fields.getTextInputValue('key_name')||null;
const body={service_id:sid,provider_id:pid,hwid_limit:3};
if(keyName)body.key_name=keyName;
const r=await jnkieReq('POST','/keys',body);
if(!r.ok)return i.editReply(`❌ ${JSON.stringify(r.data)}`);
const key=r.data?.key?.key_value||r.data?.key_value;
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Key Created').setColor(COLORS.success).setDescription(`\`\`\`${key}\`\`\``)]});
}

if(id==='m_k_batch'){
await i.deferReply();
const amount=Math.min(100,Math.max(1,safeInt(i.fields.getTextInputValue('amount'),5)));
const keyName=i.fields.getTextInputValue('key_name')||null;
const body={service_id:sid,provider_id:pid,amount,hwid_limit:3};
if(keyName)body.key_name=keyName;
const r=await jnkieReq('POST','/keys/batch',body);
if(!r.ok)return i.editReply(`❌ ${JSON.stringify(r.data)}`);
const keys=r.data?.keys||[];
const file=keys.map(k=>k.key_value).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Batch Created').setColor(COLORS.success).setDescription(`Created **${keys.length}** keys`)],files:[new AttachmentBuilder(Buffer.from(file,'utf8'),{name:`batch_${Date.now()}.txt`})]});
}

if(id==='m_k_advanced'){
await i.deferReply();
const keyName=i.fields.getTextInputValue('key_name')||null;
const hwidLimit=safeInt(i.fields.getTextInputValue('hwid_limit'),3);
const validity=i.fields.getTextInputValue('validity');
const discordId=i.fields.getTextInputValue('discord_id')||null;
const options=i.fields.getTextInputValue('options')?.toLowerCase()||'';

const body={service_id:sid,provider_id:pid};
if(keyName)body.key_name=keyName;
if(hwidLimit>0)body.hwid_limit=hwidLimit;
if(validity)body.validity_minutes=safeInt(validity);
if(discordId&&/^\d{17,19}$/.test(discordId))body.discord_id=discordId;
if(options.includes('premium'))body.is_premium=true;
if(options.includes('onetime'))body.one_time_use=true;
if(options.includes('nohwid'))body.no_hwid=true;
if(options.includes('expiryfirst'))body.expiry_on_first_use=true;

const r=await jnkieReq('POST','/keys',body);
if(!r.ok)return i.editReply(`❌ ${JSON.stringify(r.data)}`);
return i.editReply(buildKeyDetailEmbed(r.data?.key||r.data));
}

if(id==='m_k_search'){
await i.deferReply();
const value=i.fields.getTextInputValue('value');
const r=await jnkieReq('GET',`/keys?service_id=${sid}&key=${encodeURIComponent(value)}`);
const keys=r.data?.keys||[];
if(!keys.length)return i.editReply({embeds:[new EmbedBuilder().setTitle('🔍 Not Found').setColor(COLORS.warning).setDescription(`No keys matching: \`${value}\``)]});
if(keys.length===1)return i.editReply(buildKeyDetailEmbed(keys[0]));
// Multiple results
const list=keys.slice(0,10).map(k=>`\`${k.id}\` - \`${k.key_value.substring(0,20)}...\` ${k.is_invalidated?'🚫':'✅'}`).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`🔍 Found ${keys.length} Keys`).setColor(COLORS.info).setDescription(list+'\n\nUse `/keyinfo <id>` for details')]});
}

if(id==='m_k_detail'){
await i.deferReply();
const key=i.fields.getTextInputValue('key');
const r=await jnkieReq('GET',`/keys/${encodeURIComponent(key)}`);
if(!r.ok)return i.editReply('❌ Key not found');
return i.editReply(buildKeyDetailEmbed(r.data?.key||r.data));
}

if(id==='m_k_delete'){
await i.deferReply();
const key=i.fields.getTextInputValue('key');
const r=await jnkieReq('DELETE',`/keys/${encodeURIComponent(key)}`);
return i.editReply(r.ok?`✅ Key \`${key}\` deleted`:`❌ ${JSON.stringify(r.data)}`);
}

if(id==='m_k_invalidate'){
await i.deferReply();
const key=i.fields.getTextInputValue('key');
const r=await jnkieReq('PUT',`/keys/${encodeURIComponent(key)}`,{is_invalidated:true});
return i.editReply(r.ok?`🚫 Key \`${key}\` invalidated`:`❌ ${JSON.stringify(r.data)}`);
}

if(id==='m_k_revalidate'){
await i.deferReply();
const key=i.fields.getTextInputValue('key');
const r=await jnkieReq('PUT',`/keys/${encodeURIComponent(key)}`,{is_invalidated:false});
return i.editReply(r.ok?`✅ Key \`${key}\` revalidated`:`❌ ${JSON.stringify(r.data)}`);
}

if(id==='m_k_resethwid'){
await i.deferReply();
const key=i.fields.getTextInputValue('key');
const r=await jnkieReq('POST',`/keys/${encodeURIComponent(key)}/reset-hwid`);
return i.editReply(r.ok?`✅ All HWIDs removed from key \`${key}\``:`❌ ${JSON.stringify(r.data)}`);
}

if(id==='m_k_bulkdelete'){
await i.deferReply();
const input=i.fields.getTextInputValue('keys');
const keys=input.split(',').map(k=>k.trim()).filter(Boolean);
if(!keys.length)return i.editReply('❌ No keys provided');
if(keys.length>1000)return i.editReply('❌ Maximum 1000 keys');

// Convert to proper format (numbers stay numbers, strings stay strings)
const keysArray=keys.map(k=>/^\d+$/.test(k)?parseInt(k):k);
const r=await jnkieReq('POST','/keys/bulk-delete',{keys:keysArray});
return i.editReply(r.ok?`✅ Bulk delete completed`:`❌ ${JSON.stringify(r.data)}`);
}

// === SERVICES ===
if(id==='m_s_create'){
await i.deferReply();
const name=i.fields.getTextInputValue('name');
const desc=i.fields.getTextInputValue('desc')||null;
const body={name};
if(desc)body.description=desc;
const r=await jnkieReq('POST','/services',body);
return i.editReply(r.ok?`✅ Service created (ID: \`${r.data?.service?.id||r.data?.id}\`)`:`❌ ${JSON.stringify(r.data)}`);
}

if(id==='m_s_detail'){
await i.deferReply();
const sId=safeInt(i.fields.getTextInputValue('id'));
const r=await jnkieReq('GET',`/services/${sId}`);
if(!r.ok)return i.editReply('❌ Service not found');
const s=r.data?.service||r.data;
return i.editReply({embeds:[new EmbedBuilder().setTitle(`📦 Service: ${s.name}`).setColor(COLORS.info)
.addFields(
{name:'ID',value:String(s.id),inline:true},
{name:'Premium',value:s.is_premium?'✅':'❌',inline:true},
{name:'Keyless Mode',value:s.keyless_mode?'✅':'❌',inline:true},
{name:'Description',value:s.description||'None'},
{name:'Created',value:formatDate(s.created_at)}
)]});
}

if(id==='m_s_delete'){
await i.deferReply();
const sId=safeInt(i.fields.getTextInputValue('id'));
const r=await jnkieReq('DELETE',`/services/${sId}`);
return i.editReply(r.ok?`✅ Service \`${sId}\` deleted`:`❌ ${JSON.stringify(r.data)}`);
}

// === PROVIDERS ===
if(id==='m_pr_create'){
await i.deferReply();
const name=i.fields.getTextInputValue('name');
const validity=i.fields.getTextInputValue('validity');
const body={name,service_id:sid};
if(validity)body.key_valid_minutes=safeInt(validity);
const r=await jnkieReq('POST','/providers',body);
return i.editReply(r.ok?`✅ Provider created (ID: \`${r.data?.provider?.id||r.data?.id}\`)`:`❌ ${JSON.stringify(r.data)}`);
}

if(id==='m_pr_detail'){
await i.deferReply();
const pId=safeInt(i.fields.getTextInputValue('id'));
const r=await jnkieReq('GET',`/providers/${pId}`);
if(!r.ok)return i.editReply('❌ Provider not found');
const p=r.data?.provider||r.data;
return i.editReply({embeds:[new EmbedBuilder().setTitle(`🏭 Provider: ${p.name}`).setColor(COLORS.info)
.addFields(
{name:'ID',value:String(p.id),inline:true},
{name:'Active',value:p.is_active?'✅':'❌',inline:true},
{name:'Key Validity',value:p.key_valid_minutes?`${p.key_valid_minutes} mins`:'Forever',inline:true},
{name:'Created',value:formatDate(p.created_at)}
)]});
}

if(id==='m_pr_delete'){
await i.deferReply();
const pId=safeInt(i.fields.getTextInputValue('id'));
const r=await jnkieReq('DELETE',`/providers/${pId}`);
return i.editReply(r.ok?`✅ Provider \`${pId}\` deleted`:`❌ ${JSON.stringify(r.data)}`);
}
}

// ========== API FUNCTIONS ==========
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
'Content-Length':Buffer.byteLength(data)
}
},res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
try{
const parsed=JSON.parse(d);
log('API',`${method} ${endpoint} → ${res.statusCode}`);
resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:parsed});
}catch(e){
log('API',`${method} ${endpoint} → Parse Error`);
resolve({ok:false,error:'Parse error',raw:d});
}
});
});
req.on('error',e=>{
log('API',`${method} ${endpoint} → Error: ${e.message}`);
resolve({ok:false,error:e.message});
});
req.setTimeout(15000,()=>{
req.destroy();
log('API',`${method} ${endpoint} → Timeout`);
resolve({ok:false,error:'Timeout'});
});
if(body)req.write(data);
req.end();
});
}

async function prometheusObf(script,preset){
const ts=Date.now();
const inp=path.join(PROMETHEUS_PATH,`i${ts}.lua`);
const out=path.join(PROMETHEUS_PATH,`o${ts}.lua`);
try{
fs.writeFileSync(inp,script.replace(/^\uFEFF/,'').trim(),'utf8');
await execAsync(`cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset} "${inp}" --out "${out}"`,{timeout:120000});
if(!fs.existsSync(out))return{success:false,error:'No output file'};
return{success:true,code:fs.readFileSync(out,'utf8')};
}catch(e){return{success:false,error:e.message};}
finally{[inp,out].forEach(f=>{try{fs.unlinkSync(f);}catch(e){}});}
}

function downloadFile(url){
return new Promise((resolve,reject)=>{
https.get(url,res=>{
const chunks=[];
res.on('data',c=>chunks.push(c));
res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
}).on('error',reject);
});
}

// ========== LOGIN ==========
client.login(TOKEN);
