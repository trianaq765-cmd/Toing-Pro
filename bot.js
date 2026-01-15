const{Client,GatewayIntentBits,AttachmentBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,SlashCommandBuilder,REST,Routes,PermissionFlagsBits}=require('discord.js');
const{exec}=require('child_process');const fs=require('fs');const path=require('path');const http=require('http');const https=require('https');const{promisify}=require('util');const execAsync=promisify(exec);

const PORT=process.env.PORT||3000;
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');}).listen(PORT);

const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});

const TOKEN=process.env.DISCORD_TOKEN;
const CLIENT_ID=process.env.CLIENT_ID;
const PROMETHEUS_PATH=process.env.PROMETHEUS_PATH||'/app/prometheus';
const JNKIE_API_KEY=process.env.JNKIE_API_KEY;
const LUAFREE_API_KEY=process.env.LUAFREE_API_KEY||'';
const SERVICE_ID=process.env.JNKIE_SERVICE_ID||'4532';

if(!TOKEN){console.error('TOKEN NOT FOUND');process.exit(1);}

// Lua Free Plugins
const LUAFREE_PLUGINS=[
{id:'MinifiyAll',name:'Minifier'},
{id:'Minifier2',name:'Minifier V2'},
{id:'EncryptStrings',name:'Encrypt Strings'},
{id:'Virtualize',name:'Virtualize'},
{id:'ConstantArray',name:'Constant Array'},
{id:'BytecodeShuffle',name:'Bytecode Shuffle'},
{id:'WatermarkCheck',name:'Watermark Check'},
{id:'JunkCode',name:'Junk Code'},
{id:'AntiTamper',name:'Anti Tamper'},
{id:'ProxifyLocals',name:'Proxify Locals'}
];

// ========== SLASH COMMANDS DEFINITION ==========
const commands=[
new SlashCommandBuilder()
.setName('obf')
.setDescription('🔮 Obfuscate dengan Prometheus')
.addAttachmentOption(opt=>opt.setName('file').setDescription('File .lua untuk di-obfuscate').setRequired(true))
.addStringOption(opt=>opt.setName('preset').setDescription('Pilih preset').setRequired(false)
.addChoices({name:'🟢 Minify (Fast)',value:'Minify'},{name:'🔵 Weak (Light)',value:'Weak'},{name:'🟡 Medium (Balanced)',value:'Medium'})),

new SlashCommandBuilder()
.setName('lua')
.setDescription('🌐 Obfuscate dengan Lua Free')
.addAttachmentOption(opt=>opt.setName('file').setDescription('File .lua untuk di-obfuscate').setRequired(true))
.addBooleanOption(opt=>opt.setName('minifier').setDescription('Minifier').setRequired(false))
.addBooleanOption(opt=>opt.setName('virtualize').setDescription('Virtualize (VM Protection)').setRequired(false))
.addBooleanOption(opt=>opt.setName('encrypt_strings').setDescription('Encrypt Strings').setRequired(false))
.addBooleanOption(opt=>opt.setName('constant_array').setDescription('Constant Array').setRequired(false))
.addBooleanOption(opt=>opt.setName('bytecode_shuffle').setDescription('Bytecode Shuffle').setRequired(false))
.addBooleanOption(opt=>opt.setName('junk_code').setDescription('Junk Code').setRequired(false))
.addBooleanOption(opt=>opt.setName('anti_tamper').setDescription('Anti Tamper').setRequired(false)),

new SlashCommandBuilder()
.setName('key')
.setDescription('🔑 Key Management')
.addSubcommand(sub=>sub.setName('list').setDescription('List all keys').addStringOption(opt=>opt.setName('service_id').setDescription('Service ID').setRequired(false)))
.addSubcommand(sub=>sub.setName('create').setDescription('Create a key').addStringOption(opt=>opt.setName('service_id').setDescription('Service ID').setRequired(false)).addStringOption(opt=>opt.setName('note').setDescription('Note').setRequired(false)))
.addSubcommand(sub=>sub.setName('batch').setDescription('Create multiple keys').addIntegerOption(opt=>opt.setName('count').setDescription('Number of keys').setRequired(true)).addStringOption(opt=>opt.setName('service_id').setDescription('Service ID').setRequired(false)))
.addSubcommand(sub=>sub.setName('delete').setDescription('Delete a key').addStringOption(opt=>opt.setName('key_id').setDescription('Key ID').setRequired(true)))
.addSubcommand(sub=>sub.setName('reset').setDescription('Reset HWID').addStringOption(opt=>opt.setName('key_id').setDescription('Key ID').setRequired(true)))
.addSubcommand(sub=>sub.setName('get').setDescription('Get key detail').addStringOption(opt=>opt.setName('key_id').setDescription('Key ID').setRequired(true))),

new SlashCommandBuilder()
.setName('service')
.setDescription('📦 Service Management')
.addSubcommand(sub=>sub.setName('list').setDescription('List all services'))
.addSubcommand(sub=>sub.setName('create').setDescription('Create a service').addStringOption(opt=>opt.setName('name').setDescription('Service name').setRequired(true)).addStringOption(opt=>opt.setName('description').setDescription('Description').setRequired(false)))
.addSubcommand(sub=>sub.setName('delete').setDescription('Delete a service').addStringOption(opt=>opt.setName('service_id').setDescription('Service ID').setRequired(true)))
.addSubcommand(sub=>sub.setName('get').setDescription('Get service detail').addStringOption(opt=>opt.setName('service_id').setDescription('Service ID').setRequired(true))),

new SlashCommandBuilder()
.setName('provider')
.setDescription('📦 Provider Management')
.addSubcommand(sub=>sub.setName('list').setDescription('List all providers'))
.addSubcommand(sub=>sub.setName('create').setDescription('Create a provider').addStringOption(opt=>opt.setName('name').setDescription('Provider name').setRequired(true)).addIntegerOption(opt=>opt.setName('minutes').setDescription('Key valid minutes').setRequired(false)))
.addSubcommand(sub=>sub.setName('delete').setDescription('Delete a provider').addStringOption(opt=>opt.setName('provider_id').setDescription('Provider ID').setRequired(true)))
.addSubcommand(sub=>sub.setName('get').setDescription('Get provider detail').addStringOption(opt=>opt.setName('provider_id').setDescription('Provider ID').setRequired(true))),

new SlashCommandBuilder()
.setName('integration')
.setDescription('🔗 Integration Management')
.addSubcommand(sub=>sub.setName('list').setDescription('List all integrations'))
.addSubcommand(sub=>sub.setName('types').setDescription('Get available types'))
.addSubcommand(sub=>sub.setName('get').setDescription('Get integration detail').addStringOption(opt=>opt.setName('integration_id').setDescription('Integration ID').setRequired(true)))
.addSubcommand(sub=>sub.setName('delete').setDescription('Delete an integration').addStringOption(opt=>opt.setName('integration_id').setDescription('Integration ID').setRequired(true))),

new SlashCommandBuilder().setName('menu').setDescription('🎮 Open interactive menu'),
new SlashCommandBuilder().setName('status').setDescription('📊 Check bot status'),
new SlashCommandBuilder().setName('help').setDescription('📖 Show help')
].map(cmd=>cmd.toJSON());

// ========== REGISTER COMMANDS ==========
client.once('ready',async()=>{
console.log(`Bot ${client.user.tag} online`);

try{
const rest=new REST({version:'10'}).setToken(TOKEN);
console.log('Registering slash commands...');

if(CLIENT_ID){
await rest.put(Routes.applicationCommands(CLIENT_ID),{body:commands});
console.log('Slash commands registered globally!');
}else{
// Register per guild jika tidak ada CLIENT_ID
for(const guild of client.guilds.cache.values()){
await rest.put(Routes.applicationGuildCommands(client.user.id,guild.id),{body:commands});
console.log(`Commands registered for ${guild.name}`);
}
}
}catch(e){console.error('Failed to register commands:',e);}
});

// ========== SLASH COMMAND HANDLER ==========
client.on('interactionCreate',async interaction=>{
try{
if(interaction.isChatInputCommand())await handleSlashCommand(interaction);
else if(interaction.isButton())await handleButton(interaction);
else if(interaction.isStringSelectMenu())await handleSelect(interaction);
else if(interaction.isModalSubmit())await handleModal(interaction);
}catch(e){
console.error(e);
const reply=interaction.replied||interaction.deferred?interaction.followUp.bind(interaction):interaction.reply.bind(interaction);
reply({content:`❌ ${e.message}`,ephemeral:true}).catch(()=>{});
}
});

async function handleSlashCommand(i){
const cmd=i.commandName;

// ===== OBFUSCATE PROMETHEUS =====
if(cmd==='obf'){
const file=i.options.getAttachment('file');
const preset=i.options.getString('preset')||'Minify';

if(!file.name.endsWith('.lua'))return i.reply({content:'❌ File harus .lua',ephemeral:true});

await i.deferReply();

try{
const script=await downloadFile(file.url);
const result=await prometheusObfuscate(script,preset);

if(result.success){
const att=new AttachmentBuilder(Buffer.from(result.code),{name:`prom_${file.name}`});
await i.editReply({content:`✅ **Prometheus [${preset}]** Success!`,files:[att]});
}else{
await i.editReply(`❌ Failed: ${result.error}`);
}
}catch(e){await i.editReply(`❌ ${e.message}`);}
return;
}

// ===== OBFUSCATE LUA FREE =====
if(cmd==='lua'){
if(!LUAFREE_API_KEY)return i.reply({content:'❌ LUAFREE_API_KEY not set',ephemeral:true});

const file=i.options.getAttachment('file');
if(!file.name.endsWith('.lua'))return i.reply({content:'❌ File harus .lua',ephemeral:true});

// Collect plugins
const plugins={};
if(i.options.getBoolean('minifier'))plugins.MinifiyAll=true;
if(i.options.getBoolean('virtualize'))plugins.Virtualize=true;
if(i.options.getBoolean('encrypt_strings'))plugins.EncryptStrings=true;
if(i.options.getBoolean('constant_array'))plugins.ConstantArray=true;
if(i.options.getBoolean('bytecode_shuffle'))plugins.BytecodeShuffle=true;
if(i.options.getBoolean('junk_code'))plugins.JunkCode=true;
if(i.options.getBoolean('anti_tamper'))plugins.AntiTamper=true;

// Default jika tidak ada yang dipilih
if(Object.keys(plugins).length===0)plugins.MinifiyAll=true;

await i.deferReply();

try{
const script=await downloadFile(file.url);
const result=await luaFreeObfuscateFull(script,plugins);

if(result.success){
const header=`-- Lua Free Obfuscator\n-- Plugins: ${Object.keys(plugins).join(', ')}\n\n`;
const att=new AttachmentBuilder(Buffer.from(header+result.code),{name:`luafree_${file.name}`});
await i.editReply({content:`✅ **Lua Free** Success!\n⚙️ Plugins: ${Object.keys(plugins).join(', ')}`,files:[att]});
}else{
await i.editReply(`❌ Failed: ${result.error}`);
}
}catch(e){await i.editReply(`❌ ${e.message}`);}
return;
}

// ===== KEY MANAGEMENT =====
if(cmd==='key'){
if(!JNKIE_API_KEY)return i.reply({content:'❌ JNKIE_API_KEY not set',ephemeral:true});

const sub=i.options.getSubcommand();

if(sub==='list'){
const sid=i.options.getString('service_id')||SERVICE_ID;
await i.deferReply();
const r=await jnkieReq('GET',`/keys?serviceId=${sid}&limit=25`);
if(!r.ok)return i.editReply(`❌ ${r.raw?.substring(0,500)}`);

let items=r.data?.keys||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[];

const list=items.slice(0,20).map(k=>{
const key=String(k.key_value||k.key||k.id||'?');
const exp=k.expires_at?new Date(k.expires_at).toLocaleDateString():'∞';
return`🔑 \`${key.substring(0,25)}...\` | ID:\`${k.id}\` | Exp:${exp}`;
}).join('\n');

const embed=new EmbedBuilder().setTitle(`🔑 Keys (Service: ${sid})`).setColor(0x2ecc71).setDescription(list||'No keys').setFooter({text:`Total: ${items.length}`});
return i.editReply({embeds:[embed]});
}

if(sub==='create'){
const sid=i.options.getString('service_id')||SERVICE_ID;
const note=i.options.getString('note')||'Bot created';
await i.deferReply();
const r=await jnkieReq('POST','/keys',{serviceId:parseInt(sid),note,maxHwids:3});
const key=r.data?.key?.key_value||r.data?.key_value||r.data?.key;
return i.editReply(r.ok?`✅ **Key Created!**\n\`\`\`${key||JSON.stringify(r.data)}\`\`\``:`❌ ${r.raw?.substring(0,500)}`);
}

if(sub==='batch'){
const sid=i.options.getString('service_id')||SERVICE_ID;
const count=i.options.getInteger('count')||5;
await i.deferReply();
const r=await jnkieReq('POST','/keys/batch',{serviceId:parseInt(sid),count,note:'Batch',maxHwids:3});
if(!r.ok)return i.editReply(`❌ ${r.raw?.substring(0,500)}`);

let keys=r.data?.keys||r.data||[];
const list=keys.slice(0,20).map(k=>`\`${k.key_value||k.key||k}\``).join('\n');
const embed=new EmbedBuilder().setTitle(`✅ ${keys.length} Keys Created`).setColor(0x2ecc71).setDescription(list);
return i.editReply({embeds:[embed]});
}

if(sub==='delete'){
const keyId=i.options.getString('key_id');
await i.deferReply();
const r=await jnkieReq('DELETE',`/keys/${keyId}`);
return i.editReply(r.ok?'✅ Key Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='reset'){
const keyId=i.options.getString('key_id');
await i.deferReply();
const r=await jnkieReq('POST',`/keys/${keyId}/reset-hwid`);
return i.editReply(r.ok?'✅ HWID Reset':`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='get'){
const keyId=i.options.getString('key_id');
await i.deferReply();
const r=await jnkieReq('GET',`/keys/${keyId}`);
const k=r.data?.key||r.data;
return i.editReply(`\`\`\`json\n${JSON.stringify(k,null,2).substring(0,1900)}\n\`\`\``);
}
return;
}

// ===== SERVICE MANAGEMENT =====
if(cmd==='service'){
if(!JNKIE_API_KEY)return i.reply({content:'❌ JNKIE_API_KEY not set',ephemeral:true});

const sub=i.options.getSubcommand();

if(sub==='list'){
await i.deferReply();
const r=await jnkieReq('GET','/services');
let items=r.data?.services||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);
const list=items.map(s=>`📦 \`${s.id}\` **${s.name||'?'}** - ${(s.description||'').substring(0,40)}`).join('\n');
const embed=new EmbedBuilder().setTitle('📦 Services').setColor(0x3498db).setDescription(list||'No services');
return i.editReply({embeds:[embed]});
}

if(sub==='create'){
const name=i.options.getString('name');
const desc=i.options.getString('description')||'Created via bot';
await i.deferReply();
const r=await jnkieReq('POST','/services',{name,description:desc,is_premium:false,keyless_mode:false});
const id=r.data?.service?.id||r.data?.id;
return i.editReply(r.ok?`✅ Service Created: \`${id}\``:`❌ ${r.raw?.substring(0,400)}`);
}

if(sub==='delete'){
const sid=i.options.getString('service_id');
await i.deferReply();
const r=await jnkieReq('DELETE',`/services/${sid}`);
return i.editReply(r.ok?'✅ Service Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='get'){
const sid=i.options.getString('service_id');
await i.deferReply();
const r=await jnkieReq('GET',`/services/${sid}`);
const s=r.data?.service||r.data;
return i.editReply(`\`\`\`json\n${JSON.stringify(s,null,2).substring(0,1900)}\n\`\`\``);
}
return;
}

// ===== PROVIDER MANAGEMENT =====
if(cmd==='provider'){
if(!JNKIE_API_KEY)return i.reply({content:'❌ JNKIE_API_KEY not set',ephemeral:true});

const sub=i.options.getSubcommand();

if(sub==='list'){
await i.deferReply();
const r=await jnkieReq('GET','/providers');
let items=r.data?.providers||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);
const list=items.map(p=>`📦 \`${p.id}\` **${p.name||'?'}** (${p.key_valid_minutes||0}min)`).join('\n');
const embed=new EmbedBuilder().setTitle('📦 Providers').setColor(0xe67e22).setDescription(list||'No providers');
return i.editReply({embeds:[embed]});
}

if(sub==='create'){
const name=i.options.getString('name');
const mins=i.options.getInteger('minutes')||60;
await i.deferReply();
const r=await jnkieReq('POST','/providers',{name,key_valid_minutes:mins,is_active:true});
const id=r.data?.provider?.id||r.data?.id;
return i.editReply(r.ok?`✅ Provider Created: \`${id}\``:`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='delete'){
const pid=i.options.getString('provider_id');
await i.deferReply();
const r=await jnkieReq('DELETE',`/providers/${pid}`);
return i.editReply(r.ok?'✅ Provider Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

if(sub==='get'){
const pid=i.options.getString('provider_id');
await i.deferReply();
const r=await jnkieReq('GET',`/providers/${pid}`);
const p=r.data?.provider||r.data;
return i.editReply(`\`\`\`json\n${JSON.stringify(p,null,2).substring(0,1900)}\n\`\`\``);
}
return;
}

// ===== INTEGRATION MANAGEMENT =====
if(cmd==='integration'){
if(!JNKIE_API_KEY)return i.reply({content:'❌ JNKIE_API_KEY not set',ephemeral:true});

const sub=i.options.getSubcommand();

if(sub==='list'){
await i.deferReply();
const r=await jnkieReq('GET','/integrations');
let items=r.data?.integrations||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);
const list=items.map(x=>`🔗 \`${x.id}\` **${x.name||'?'}** (${x.type||'?'})`).join('\n');
const embed=new EmbedBuilder().setTitle('🔗 Integrations').setColor(0x9b59b6).setDescription(list||'No integrations');
return i.editReply({embeds:[embed]});
}

if(sub==='types'){
await i.deferReply();
const r=await jnkieReq('GET','/integrations/types');
return i.editReply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``);
}

if(sub==='get'){
const iid=i.options.getString('integration_id');
await i.deferReply();
const r=await jnkieReq('GET',`/integrations/${iid}`);
const x=r.data?.integration||r.data;
return i.editReply(`\`\`\`json\n${JSON.stringify(x,null,2).substring(0,1900)}\n\`\`\``);
}

if(sub==='delete'){
const iid=i.options.getString('integration_id');
await i.deferReply();
const r=await jnkieReq('DELETE',`/integrations/${iid}`);
return i.editReply(r.ok?'✅ Integration Deleted':`❌ ${r.raw?.substring(0,300)}`);
}
return;
}

// ===== MENU =====
if(cmd==='menu'){
return i.reply(await buildMainMenu());
}

// ===== STATUS =====
if(cmd==='status'){
await i.deferReply();
return i.editReply(await buildStatus());
}

// ===== HELP =====
if(cmd==='help'){
const embed=new EmbedBuilder()
.setTitle('📖 Help - Slash Commands')
.setColor(0x5865F2)
.addFields(
{name:'🔮 Obfuscate',value:'`/obf file: preset:` - Prometheus\n`/lua file: [options]` - Lua Free'},
{name:'🔑 Keys',value:'`/key list` `/key create` `/key batch count:`\n`/key delete` `/key reset` `/key get`'},
{name:'📦 Service',value:'`/service list` `/service create` `/service delete`'},
{name:'📦 Provider',value:'`/provider list` `/provider create` `/provider delete`'},
{name:'🔗 Integration',value:'`/integration list` `/integration types` `/integration get`'},
{name:'🎮 Others',value:'`/menu` - Interactive menu\n`/status` - Bot status'}
)
.setFooter({text:`Service ID: ${SERVICE_ID}`});
return i.reply({embeds:[embed]});
}
}

// ========== BUTTON HANDLER ==========
async function handleButton(i){
const id=i.customId;

if(id==='menu_main')return i.update(await buildMainMenu());
if(id==='menu_status')return i.update(await buildStatus());
if(id==='menu_key')return i.update(await buildKeyMenu());
if(id==='menu_service')return i.update(await buildServiceMenu());
if(id==='menu_provider')return i.update(await buildProviderMenu());
if(id==='menu_integration')return i.update(await buildIntegrationMenu());

if(id==='key_list'){await i.deferUpdate();return i.editReply(await buildKeyList());}
if(id==='key_create')return showKeyCreateModal(i);
if(id==='key_batch')return showKeyBatchModal(i);
if(id==='key_delete')return showKeyDeleteModal(i);
if(id==='key_reset')return showKeyResetModal(i);

if(id==='service_refresh'){await i.deferUpdate();return i.editReply(await buildServiceMenu());}
if(id==='service_create')return showServiceCreateModal(i);
if(id==='service_delete')return showServiceDeleteModal(i);

if(id==='provider_refresh'){await i.deferUpdate();return i.editReply(await buildProviderMenu());}
if(id==='provider_create')return showProviderCreateModal(i);

if(id==='integration_refresh'){await i.deferUpdate();return i.editReply(await buildIntegrationMenu());}
if(id==='integration_types'){const r=await jnkieReq('GET','/integrations/types');return i.reply({content:`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``,ephemeral:true});}

await i.deferUpdate();
}

// ========== SELECT HANDLER ==========
async function handleSelect(i){await i.deferUpdate();}

// ========== MODAL HANDLER ==========
async function handleModal(i){
const id=i.customId;

if(id==='modal_key_create'){
const sid=i.fields.getTextInputValue('service_id')||SERVICE_ID;
const note=i.fields.getTextInputValue('note')||'Bot';
await i.deferReply();
const r=await jnkieReq('POST','/keys',{serviceId:parseInt(sid),note,maxHwids:3});
const key=r.data?.key?.key_value||r.data?.key_value;
return i.editReply(r.ok?`✅ **Key Created!**\n\`\`\`${key||JSON.stringify(r.data)}\`\`\``:`❌ ${r.raw?.substring(0,500)}`);
}

if(id==='modal_key_batch'){
const sid=i.fields.getTextInputValue('service_id')||SERVICE_ID;
const count=parseInt(i.fields.getTextInputValue('count'))||5;
await i.deferReply();
const r=await jnkieReq('POST','/keys/batch',{serviceId:parseInt(sid),count,note:'Batch',maxHwids:3});
if(!r.ok)return i.editReply(`❌ ${r.raw?.substring(0,500)}`);
let keys=r.data?.keys||r.data||[];
return i.editReply({embeds:[new EmbedBuilder().setTitle(`✅ ${keys.length} Keys`).setColor(0x2ecc71).setDescription(keys.slice(0,15).map(k=>`\`${k.key_value||k}\``).join('\n'))]});
}

if(id==='modal_key_delete'){
const keyId=i.fields.getTextInputValue('key_id');
await i.deferReply();
const r=await jnkieReq('DELETE',`/keys/${keyId}`);
return i.editReply(r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

if(id==='modal_key_reset'){
const keyId=i.fields.getTextInputValue('key_id');
await i.deferReply();
const r=await jnkieReq('POST',`/keys/${keyId}/reset-hwid`);
return i.editReply(r.ok?'✅ HWID Reset':`❌ ${r.raw?.substring(0,300)}`);
}

if(id==='modal_service_create'){
const name=i.fields.getTextInputValue('name');
const desc=i.fields.getTextInputValue('description')||'Bot';
await i.deferReply();
const r=await jnkieReq('POST','/services',{name,description:desc,is_premium:false,keyless_mode:false});
return i.editReply(r.ok?`✅ Created: \`${r.data?.service?.id||r.data?.id}\``:`❌ ${r.raw?.substring(0,400)}`);
}

if(id==='modal_service_delete'){
const sid=i.fields.getTextInputValue('service_id');
await i.deferReply();
const r=await jnkieReq('DELETE',`/services/${sid}`);
return i.editReply(r.ok?'✅ Deleted':`❌ ${r.raw?.substring(0,300)}`);
}

if(id==='modal_provider_create'){
const name=i.fields.getTextInputValue('name');
const mins=parseInt(i.fields.getTextInputValue('minutes'))||60;
await i.deferReply();
const r=await jnkieReq('POST','/providers',{name,key_valid_minutes:mins,is_active:true});
return i.editReply(r.ok?`✅ Created: \`${r.data?.provider?.id||r.data?.id}\``:`❌ ${r.raw?.substring(0,300)}`);
}
}

// ========== BUILD MENUS ==========
async function buildMainMenu(){
const embed=new EmbedBuilder()
.setTitle('🤖 Bot Control Panel')
.setColor(0x5865F2)
.setDescription('Gunakan **Slash Commands** untuk akses cepat!\n\n`/obf` - Prometheus\n`/lua` - Lua Free\n`/key` - Key management\n`/service` - Service management')
.addFields({name:'📌 Tip',value:'Slash commands memudahkan upload file langsung!'});

const row1=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('menu_key').setLabel('🔑 Keys').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('menu_service').setLabel('📦 Services').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('menu_provider').setLabel('📦 Providers').setStyle(ButtonStyle.Secondary)
);
const row2=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('menu_integration').setLabel('🔗 Integrations').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('menu_status').setLabel('📊 Status').setStyle(ButtonStyle.Danger)
);
return{embeds:[embed],components:[row1,row2]};
}

async function buildKeyMenu(){
const embed=new EmbedBuilder().setTitle('🔑 Key Management').setColor(0x2ecc71).setDescription(`Service: \`${SERVICE_ID}\`\n\n💡 Gunakan \`/key\` untuk akses lebih mudah!`);
const row1=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_list').setLabel('📋 List').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('key_create').setLabel('➕ Create').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('key_batch').setLabel('📦 Batch').setStyle(ButtonStyle.Success)
);
const row2=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('key_reset').setLabel('🔄 Reset').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️').setStyle(ButtonStyle.Secondary)
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
return`🔑 \`${key.substring(0,20)}...\` ID:\`${k.id}\` Exp:${exp}`;
}).join('\n');
const embed=new EmbedBuilder().setTitle(`🔑 Keys (${SERVICE_ID})`).setColor(0x2ecc71).setDescription(list||'No keys').setFooter({text:`Total: ${items.length}`});
return{embeds:[embed],components:[backBtn('menu_key')]};
}

async function buildServiceMenu(){
const r=await jnkieReq('GET','/services');
let items=r.data?.services||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);
const embed=new EmbedBuilder().setTitle('📦 Services').setColor(0x3498db).setDescription(items.map(s=>`\`${s.id}\` **${s.name||'?'}**`).join('\n')||'No services');
const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('service_refresh').setLabel('🔄').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('service_create').setLabel('➕').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('service_delete').setLabel('🗑️').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️').setStyle(ButtonStyle.Secondary)
);
return{embeds:[embed],components:[row]};
}

async function buildProviderMenu(){
const r=await jnkieReq('GET','/providers');
let items=r.data?.providers||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);
const embed=new EmbedBuilder().setTitle('📦 Providers').setColor(0xe67e22).setDescription(items.map(p=>`\`${p.id}\` **${p.name||'?'}** (${p.key_valid_minutes||0}min)`).join('\n')||'No providers');
const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('provider_refresh').setLabel('🔄').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('provider_create').setLabel('➕').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('menu_main').setLabel('◀️').setStyle(ButtonStyle.Secondary)
);
return{embeds:[embed],components:[row]};
}

async function buildIntegrationMenu(){
const r=await jnkieReq('GET','/integrations');
let items=r.data?.integrations||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);
const embed=new EmbedBuilder().setTitle('🔗 Integrations').setColor(0x9b59b6).setDescription(items.map(x=>`\`${x.id}\` **${x.name||'?'}** (${x.type||'?'})`).join('\n')||'No integrations');
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
const x=await jnkieReq('GET','/integrations');
const embed=new EmbedBuilder().setTitle('📊 Status').setColor(0x2ecc71).addFields(
{name:'🤖 Bot',value:'✅ Online',inline:true},
{name:'🔑 jnkie',value:JNKIE_API_KEY?`✅ (${s.status})`:'❌',inline:true},
{name:'🔮 LuaFree',value:LUAFREE_API_KEY?'✅':'❌',inline:true},
{name:'📦 Services',value:String((s.data?.services||s.data||[]).length||0),inline:true},
{name:'📦 Providers',value:String((p.data?.providers||p.data||[]).length||0),inline:true},
{name:'🔗 Integrations',value:String((x.data?.integrations||x.data||[]).length||0),inline:true}
).setFooter({text:`Service: ${SERVICE_ID}`});
return{embeds:[embed],components:[backBtn('menu_main')]};
}

// ========== MODALS ==========
function showKeyCreateModal(i){
const modal=new ModalBuilder().setCustomId('modal_key_create').setTitle('Create Key').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('service_id').setLabel('Service ID').setStyle(TextInputStyle.Short).setValue(SERVICE_ID).setRequired(true)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note').setStyle(TextInputStyle.Short).setRequired(false))
);i.showModal(modal);}

function showKeyBatchModal(i){
const modal=new ModalBuilder().setCustomId('modal_key_batch').setTitle('Batch Create').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('service_id').setLabel('Service ID').setStyle(TextInputStyle.Short).setValue(SERVICE_ID).setRequired(true)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('count').setLabel('Count').setStyle(TextInputStyle.Short).setValue('5').setRequired(true))
);i.showModal(modal);}

function showKeyDeleteModal(i){
const modal=new ModalBuilder().setCustomId('modal_key_delete').setTitle('Delete Key').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_id').setLabel('Key ID').setStyle(TextInputStyle.Short).setRequired(true))
);i.showModal(modal);}

function showKeyResetModal(i){
const modal=new ModalBuilder().setCustomId('modal_key_reset').setTitle('Reset HWID').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_id').setLabel('Key ID').setStyle(TextInputStyle.Short).setRequired(true))
);i.showModal(modal);}

function showServiceCreateModal(i){
const modal=new ModalBuilder().setCustomId('modal_service_create').setTitle('Create Service').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false))
);i.showModal(modal);}

function showServiceDeleteModal(i){
const modal=new ModalBuilder().setCustomId('modal_service_delete').setTitle('Delete Service').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('service_id').setLabel('Service ID').setStyle(TextInputStyle.Short).setRequired(true))
);i.showModal(modal);}

function showProviderCreateModal(i){
const modal=new ModalBuilder().setCustomId('modal_provider_create').setTitle('Create Provider').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('minutes').setLabel('Key Valid Minutes').setStyle(TextInputStyle.Short).setValue('60').setRequired(true))
);i.showModal(modal);}

function backBtn(target){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(target).setLabel('◀️ Back').setStyle(ButtonStyle.Secondary));}

// ========== OBFUSCATE FUNCTIONS ==========
async function prometheusObfuscate(script,preset){
const ts=Date.now();
const inp=path.join(PROMETHEUS_PATH,`in_${ts}.lua`);
const out=path.join(PROMETHEUS_PATH,`out_${ts}.lua`);
try{
fs.writeFileSync(inp,script.replace(/^\uFEFF/,'').trim(),'utf8');
await execAsync(`cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset} "${inp}" --out "${out}" 2>&1`,{timeout:120000});
if(fs.existsSync(out)){
return{success:true,code:`-- Prometheus [${preset}]\n`+fs.readFileSync(out,'utf8')};
}
return{success:false,error:'Failed to generate output'};
}catch(e){return{success:false,error:e.message};}
finally{[inp,out].forEach(f=>{try{fs.unlinkSync(f);}catch(e){}});}
}

async function luaFreeObfuscateFull(script,plugins){
// Step 1: Create session
const step1=await new Promise(resolve=>{
const req=https.request({hostname:'api.luaobfuscator.com',port:443,path:'/v1/obfuscator/newscript',method:'POST',
headers:{'Content-Type':'text/plain','apikey':LUAFREE_API_KEY,'Content-Length':Buffer.byteLength(script,'utf8')}
},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d));}catch(e){resolve({error:d});}});});
req.on('error',e=>resolve({error:e.message}));
req.setTimeout(60000,()=>{req.destroy();resolve({error:'Timeout'});});
req.write(script,'utf8');req.end();
});

if(!step1.sessionId)return{success:false,error:step1.message||step1.error||JSON.stringify(step1)};

// Step 2: Obfuscate
const body=JSON.stringify(plugins);
const step2=await new Promise(resolve=>{
const req=https.request({hostname:'api.luaobfuscator.com',port:443,path:'/v1/obfuscator/obfuscate',method:'POST',
headers:{'Content-Type':'application/json','apikey':LUAFREE_API_KEY,'sessionId':step1.sessionId,'Content-Length':Buffer.byteLength(body)}
},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d));}catch(e){resolve({error:d});}});});
req.on('error',e=>resolve({error:e.message}));
req.setTimeout(120000,()=>{req.destroy();resolve({error:'Timeout'});});
req.write(body);req.end();
});

if(!step2.code)return{success:false,error:step2.message||step2.error||JSON.stringify(step2)};
return{success:true,code:step2.code};
}

// ========== JNKIE API ==========
function jnkieReq(method,endpoint,body=null){
return new Promise(resolve=>{
const data=body?JSON.stringify(body):'';
const req=https.request({hostname:'api.jnkie.com',port:443,path:`/api/v2${endpoint}`,method,
headers:{'Authorization':`Bearer ${JNKIE_API_KEY}`,'Content-Type':'application/json',...(body?{'Content-Length':Buffer.byteLength(data)}:{})}
},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:JSON.parse(d),raw:d});}catch(e){resolve({ok:false,status:res.statusCode,raw:d});}});});
req.on('error',e=>resolve({ok:false,error:e.message}));
req.setTimeout(15000,()=>{req.destroy();resolve({ok:false,error:'Timeout'});});
if(body)req.write(data);req.end();
});
}

// ========== HELPERS ==========
function downloadFile(url){return new Promise((r,j)=>{https.get(url,res=>{const d=[];res.on('data',c=>d.push(c));res.on('end',()=>r(Buffer.concat(d).toString('utf8')));}).on('error',j);});}

client.login(TOKEN);
