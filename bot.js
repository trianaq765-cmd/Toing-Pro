const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
}).listen(PORT);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const PROMETHEUS_PATH = process.env.PROMETHEUS_PATH || '/app/prometheus';
const JNKIE_API_KEY = process.env.JNKIE_API_KEY;

if (!TOKEN) {
    console.error('TOKEN NOT FOUND');
    process.exit(1);
}

const HEADER = `-- This file was protected using Prometheus Obfuscator [https://discord.gg/QarfX8ua2]\n\n`;

const PRESETS = {
    minify: { value: 'Minify', emoji: '🟢' },
    weak: { value: 'Weak', emoji: '🔵' },
    medium: { value: 'Medium', emoji: '🟡' }
};

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} online`);
    console.log(`jnkie API: ${JNKIE_API_KEY ? 'Configured' : 'NOT SET'}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const args = content.split(/\s+/).slice(1);
    const cmd = content.toLowerCase();

    try {
        // ========== OBFUSCATOR ==========
        if (cmd.startsWith('!obf')) await handleObfuscate(message);
        else if (cmd === '!presets') await handlePresets(message);
        
        // ========== SERVICES ==========
        else if (cmd.startsWith('!service')) await handleService(message, args);
        
        // ========== PROVIDERS ==========
        else if (cmd.startsWith('!provider')) await handleProvider(message, args);
        
        // ========== INTEGRATIONS ==========
        else if (cmd.startsWith('!integration')) await handleIntegration(message, args);
        
        // ========== KEYS ==========
        else if (cmd.startsWith('!key')) await handleKey(message, args);
        
        // ========== HELP ==========
        else if (cmd === '!help') await handleHelp(message);
        
    } catch (err) {
        console.error(err);
    }
});

// ================================================================
// OBFUSCATOR HANDLER
// ================================================================
async function handleObfuscate(message) {
    if (message.attachments.size === 0) {
        return message.reply({
            embeds: [{
                color: 0x3498db,
                title: '📌 Obfuscator',
                description: '`!obf [preset]` + attach file',
                fields: [{ name: 'Presets', value: '🟢 `minify` | 🔵 `weak` | 🟡 `medium`' }]
            }]
        });
    }

    const attachment = message.attachments.first();
    if (!attachment.name.endsWith('.lua') && !attachment.name.endsWith('.txt')) {
        return message.reply('❌ File harus `.lua` atau `.txt`');
    }

    const args = message.content.split(/\s+/).slice(1);
    const presetKey = args[0]?.toLowerCase() || 'minify';
    const preset = PRESETS[presetKey] || PRESETS.minify;

    const timestamp = Date.now();
    const inputPath = path.join(PROMETHEUS_PATH, `in_${timestamp}.lua`);
    const outputPath = path.join(PROMETHEUS_PATH, `out_${timestamp}.lua`);

    let statusMsg;

    try {
        const luaCode = await downloadFile(attachment.url);
        fs.writeFileSync(inputPath, cleanLuaCode(luaCode), 'utf8');

        statusMsg = await message.reply({
            embeds: [{ color: 0xf39c12, title: `${preset.emoji} Processing...` }]
        });

        const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset.value} "${inputPath}" --out "${outputPath}" 2>&1`;
        await execAsync(command, { timeout: 120000 });

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            const finalCode = HEADER + fs.readFileSync(outputPath, 'utf8');
            const file = new AttachmentBuilder(Buffer.from(finalCode, 'utf8'), {
                name: `obfuscated_${attachment.name.replace('.txt', '.lua')}`
            });

            await statusMsg.edit({
                embeds: [{ color: 0x2ecc71, title: `${preset.emoji} Berhasil`, timestamp: new Date() }],
                files: [file]
            });
        } else {
            await statusMsg.edit({ embeds: [{ color: 0xe74c3c, title: '❌ Gagal' }] });
        }
    } catch (err) {
        if (statusMsg) await statusMsg.edit({ embeds: [{ color: 0xe74c3c, title: '❌ Error', description: `\`${err.message}\`` }] }).catch(() => {});
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
}

// ================================================================
// SERVICES HANDLER
// ================================================================
async function handleService(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    // !service list
    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/services');
        if (result.success) {
            const services = Array.isArray(result.data) ? result.data : [result.data];
            const list = services.length > 0 
                ? services.map((s, i) => `${i+1}. **${s.name}** (ID: \`${s.id}\`)`).join('\n')
                : 'Tidak ada service';
            return message.reply({ embeds: [{ color: 0x3498db, title: '📦 Services', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !service create [name] [description]
    if (action === 'create') {
        const name = args[1];
        const description = args.slice(2).join(' ') || 'No description';
        if (!name) return message.reply('❌ Usage: `!service create [name] [description]`');

        const result = await jnkieRequest('POST', '/services', {
            name: name,
            description: description,
            is_premium: false,
            slug: name.toLowerCase().replace(/\s+/g, '-'),
            keyless_mode: false
        });

        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Service Created', description: `Name: **${name}**\nID: \`${result.data?.id || 'N/A'}\`` }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !service get [id]
    if (action === 'get') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!service get [serviceId]`');

        const result = await jnkieRequest('GET', `/services/${id}`);
        if (result.success) {
            const s = result.data;
            return message.reply({ embeds: [{ color: 0x3498db, title: '📦 Service Details', fields: [
                { name: 'Name', value: s.name || 'N/A', inline: true },
                { name: 'ID', value: s.id || 'N/A', inline: true },
                { name: 'Description', value: s.description || 'N/A' }
            ]}]});
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !service delete [id]
    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!service delete [serviceId]`');

        const result = await jnkieRequest('DELETE', `/services/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Service Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply('❌ Usage: `!service [list|create|get|delete]`');
}

// ================================================================
// PROVIDERS HANDLER
// ================================================================
async function handleProvider(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    // !provider list
    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/providers');
        if (result.success) {
            const providers = Array.isArray(result.data) ? result.data : [result.data];
            const list = providers.length > 0 
                ? providers.map((p, i) => `${i+1}. **${p.name}** (ID: \`${p.id}\`)`).join('\n')
                : 'Tidak ada provider';
            return message.reply({ embeds: [{ color: 0x9b59b6, title: '🔌 Providers', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !provider create [name]
    if (action === 'create') {
        const name = args[1];
        if (!name) return message.reply('❌ Usage: `!provider create [name]`');

        const result = await jnkieRequest('POST', '/providers', { name: name });
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Provider Created', description: `Name: **${name}**` }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !provider get [id]
    if (action === 'get') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!provider get [providerId]`');

        const result = await jnkieRequest('GET', `/providers/${id}`);
        if (result.success) {
            const p = result.data;
            return message.reply({ embeds: [{ color: 0x9b59b6, title: '🔌 Provider Details', fields: [
                { name: 'Name', value: p.name || 'N/A', inline: true },
                { name: 'ID', value: p.id || 'N/A', inline: true }
            ]}]});
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !provider delete [id]
    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!provider delete [providerId]`');

        const result = await jnkieRequest('DELETE', `/providers/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Provider Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply('❌ Usage: `!provider [list|create|get|delete]`');
}

// ================================================================
// INTEGRATIONS HANDLER
// ================================================================
async function handleIntegration(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    // !integration list
    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/integrations');
        if (result.success) {
            const integrations = Array.isArray(result.data) ? result.data : [result.data];
            const list = integrations.length > 0 
                ? integrations.map((i, idx) => `${idx+1}. **${i.type || i.name}** (ID: \`${i.id}\`)`).join('\n')
                : 'Tidak ada integration';
            return message.reply({ embeds: [{ color: 0xe67e22, title: '🔗 Integrations', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !integration types
    if (action === 'types') {
        const result = await jnkieRequest('GET', '/integrations/types');
        if (result.success) {
            const types = Array.isArray(result.data) ? result.data : [result.data];
            const list = types.map(t => `• \`${t.type || t.name || t}\``).join('\n') || 'Tidak ada types';
            return message.reply({ embeds: [{ color: 0xe67e22, title: '🔗 Integration Types', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !integration create [type]
    if (action === 'create') {
        const type = args[1];
        if (!type) return message.reply('❌ Usage: `!integration create [type]`');

        const result = await jnkieRequest('POST', '/integrations', { type: type });
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Integration Created', description: `Type: **${type}**` }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !integration get [id]
    if (action === 'get') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!integration get [integrationId]`');

        const result = await jnkieRequest('GET', `/integrations/${id}`);
        if (result.success) {
            const i = result.data;
            return message.reply({ embeds: [{ color: 0xe67e22, title: '🔗 Integration Details', fields: [
                { name: 'Type', value: i.type || 'N/A', inline: true },
                { name: 'ID', value: i.id || 'N/A', inline: true }
            ]}]});
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !integration delete [id]
    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!integration delete [integrationId]`');

        const result = await jnkieRequest('DELETE', `/integrations/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Integration Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply('❌ Usage: `!integration [list|types|create|get|delete]`');
}

// ================================================================
// KEYS HANDLER
// ================================================================
async function handleKey(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    // !key list
    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/keys?limit=15');
        if (result.success) {
            const keys = Array.isArray(result.data) ? result.data : [result.data];
            const list = keys.length > 0 
                ? keys.map((k, i) => `${i+1}. \`${(k.key || k.id).substring(0, 20)}...\` - ${k.status || 'active'}`).join('\n')
                : 'Tidak ada key';
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '🔑 Keys (Last 15)', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key create [duration] [note]
    if (action === 'create') {
        const duration = args[1] || '7d';
        const note = args.slice(2).join(' ') || `By ${message.author.username}`;

        const result = await jnkieRequest('POST', '/keys', {
            duration: duration,
            note: note,
            max_hwids: 1
        });

        if (result.success) {
            const key = result.data?.key || result.data?.id || 'N/A';
            await message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Key Created', fields: [
                { name: '🔑 Key', value: `\`${key}\`` },
                { name: '⏱️ Duration', value: duration, inline: true }
            ]}]});
            
            // DM key
            try { await message.author.send(`🔑 Your Key: \`${key}\``); } catch (e) {}
            return;
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key batch [count] [duration]
    if (action === 'batch') {
        const count = parseInt(args[1]) || 5;
        const duration = args[2] || '7d';

        const result = await jnkieRequest('POST', '/keys/batch', {
            count: count,
            duration: duration,
            max_hwids: 1
        });

        if (result.success) {
            const keys = result.data?.keys || result.data || [];
            const keyList = Array.isArray(keys) ? keys.map(k => `\`${k.key || k}\``).join('\n') : 'Keys created';
            return message.reply({ embeds: [{ color: 0x2ecc71, title: `✅ ${count} Keys Created`, description: keyList.substring(0, 2000) }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key get [keyId]
    if (action === 'get') {
        const keyId = args[1];
        if (!keyId) return message.reply('❌ Usage: `!key get [keyId]`');

        const result = await jnkieRequest('GET', `/keys/${keyId}`);
        if (result.success) {
            const k = result.data;
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '🔑 Key Details', fields: [
                { name: 'Key', value: `\`${k.key || k.id}\`` },
                { name: 'Status', value: k.status || 'N/A', inline: true },
                { name: 'Expires', value: k.expires_at || 'N/A', inline: true },
                { name: 'HWIDs', value: `${k.hwids?.length || 0}/${k.max_hwids || 1}`, inline: true }
            ]}]});
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key verify [key]
    if (action === 'verify') {
        const key = args[1];
        if (!key) return message.reply('❌ Usage: `!key verify [key]`');

        const result = await jnkieRequest('GET', `/keys?key=${encodeURIComponent(key)}`);
        if (result.success && result.data) {
            const keys = Array.isArray(result.data) ? result.data : [result.data];
            if (keys.length > 0) {
                const k = keys[0];
                const valid = k.status === 'active' || k.is_valid;
                return message.reply({ embeds: [{ 
                    color: valid ? 0x2ecc71 : 0xe74c3c, 
                    title: valid ? '✅ Key Valid' : '❌ Key Invalid',
                    fields: [
                        { name: 'Status', value: k.status || 'N/A', inline: true },
                        { name: 'Expires', value: k.expires_at || 'N/A', inline: true }
                    ]
                }]});
            }
        }
        return message.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Key Not Found' }] });
    }

    // !key reset [keyId]
    if (action === 'reset') {
        const keyId = args[1];
        if (!keyId) return message.reply('❌ Usage: `!key reset [keyId]`');

        const result = await jnkieRequest('POST', `/keys/${keyId}/reset-hwid`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ HWID Reset' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key delete [keyId]
    if (action === 'delete') {
        const keyId = args[1];
        if (!keyId) return message.reply('❌ Usage: `!key delete [keyId]`');

        const result = await jnkieRequest('DELETE', `/keys/${keyId}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Key Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key bulk-delete [key1,key2,...]
    if (action === 'bulk-delete') {
        const keysStr = args[1];
        if (!keysStr) return message.reply('❌ Usage: `!key bulk-delete [key1,key2,...]`');

        const keys = keysStr.split(',').map(k => k.trim());
        const result = await jnkieRequest('POST', '/keys/bulk-delete', { keys: keys });
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: `✅ ${keys.length} Keys Deleted` }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply('❌ Usage: `!key [list|create|batch|get|verify|reset|delete|bulk-delete]`');
}

// ================================================================
// HELP HANDLER
// ================================================================
async function handleHelp(message) {
    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '📖 Bot Commands',
            fields: [
                {
                    name: '🔧 Obfuscator',
                    value: '`!obf [preset]` + attach file\n`!presets` - Lihat presets'
                },
                {
                    name: '📦 Services',
                    value: '`!service list` - List services\n`!service create [name] [desc]`\n`!service get [id]`\n`!service delete [id]`'
                },
                {
                    name: '🔌 Providers',
                    value: '`!provider list`\n`!provider create [name]`\n`!provider get [id]`\n`!provider delete [id]`'
                },
                {
                    name: '🔗 Integrations',
                    value: '`!integration list`\n`!integration types`\n`!integration create [type]`\n`!integration get [id]`\n`!integration delete [id]`'
                },
                {
                    name: '🔑 Keys',
                    value: '`!key list` - List keys\n`!key create [duration] [note]`\n`!key batch [count] [duration]`\n`!key get [id]`\n`!key verify [key]`\n`!key reset [id]`\n`!key delete [id]`\n`!key bulk-delete [k1,k2]`'
                }
            ]
        }]
    });
}

async function handlePresets(message) {
    await message.reply({
        embeds: [{
            color: 0x9b59b6,
            title: '🎨 Presets',
            fields: [
                { name: '🟢 minify', value: 'Perkecil ukuran' },
                { name: '🔵 weak', value: 'Variable rename' },
                { name: '🟡 medium', value: 'Encryption + Control flow' }
            ]
        }]
    });
}

// ================================================================
// JNKIE API HELPER
// ================================================================
function jnkieRequest(method, endpoint, body = null) {
    return new Promise((resolve) => {
        const postData = body ? JSON.stringify(body) : '';
        
        const options = {
            hostname: 'api.jnkie.com',
            port: 443,
            path: `/api/v2${endpoint}`,
            method: method,
            headers: {
                'Authorization': `Bearer ${JNKIE_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        if (body) options.headers['Content-Length'] = Buffer.byteLength(postData);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ 
                        success: res.statusCode >= 200 && res.statusCode < 300, 
                        data: json.data || json, 
                        error: json.message || json.error 
                    });
                } catch (e) {
                    resolve({ success: false, error: `Invalid response: ${data.substring(0, 100)}` });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.setTimeout(30000, () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });

        if (body) req.write(postData);
        req.end();
    });
}

// ================================================================
// HELPERS
// ================================================================
function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const makeRequest = (targetUrl, redirects = 0) => {
            if (redirects > 5) return reject(new Error('Too many redirects'));
            const protocol = targetUrl.startsWith('https') ? https : http;
            protocol.get(targetUrl, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return makeRequest(res.headers.location, redirects + 1);
                }
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                res.on('error', reject);
            }).on('error', reject);
        };
        makeRequest(url);
    });
}

function cleanLuaCode(code) {
    if (!code) return '';
    return code.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x00/g, '').trim();
}

function cleanupFiles(...files) {
    files.forEach(f => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} });
}

client.on('error', () => {});
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

client.login(TOKEN);                fields: [{
                    name: 'Presets',
                    value: '🟢 `minify` | 🔵 `weak` | 🟡 `medium`'
                }]
            }]
        });
    }

    const attachment = message.attachments.first();
    
    if (!attachment.name.endsWith('.lua') && !attachment.name.endsWith('.txt')) {
        return message.reply('❌ File harus `.lua` atau `.txt`');
    }

    if (attachment.size > 5 * 1024 * 1024) {
        return message.reply('❌ Max 5MB');
    }

    const args = message.content.split(/\s+/).slice(1);
    const presetKey = args[0]?.toLowerCase() || 'minify';
    const preset = PRESETS[presetKey] || PRESETS.minify;

    const timestamp = Date.now();
    const inputPath = path.join(PROMETHEUS_PATH, `in_${timestamp}.lua`);
    const outputPath = path.join(PROMETHEUS_PATH, `out_${timestamp}.lua`);

    let statusMsg;

    try {
        const luaCode = await downloadFile(attachment.url);
        
        if (!luaCode || luaCode.length < 5) {
            return message.reply('❌ File kosong');
        }

        const cleanedCode = cleanLuaCode(luaCode);
        fs.writeFileSync(inputPath, cleanedCode, 'utf8');

        statusMsg = await message.reply({
            embeds: [{
                color: 0xf39c12,
                title: `${preset.emoji} Processing...`,
                fields: [
                    { name: 'File', value: attachment.name, inline: true },
                    { name: 'Preset', value: presetKey, inline: true }
                ]
            }]
        });

        const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset.value} "${inputPath}" --out "${outputPath}" 2>&1`;
        const { stdout, stderr } = await execAsync(command, { timeout: 120000 });

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            const obfuscatedCode = fs.readFileSync(outputPath, 'utf8');
            const originalSize = Buffer.byteLength(cleanedCode, 'utf8');
            const finalCode = HEADER + obfuscatedCode;
            const obfuscatedSize = Buffer.byteLength(finalCode, 'utf8');
            const ratio = ((obfuscatedSize / originalSize) * 100).toFixed(0);

            const buffer = Buffer.from(finalCode, 'utf8');
            const file = new AttachmentBuilder(buffer, {
                name: `obfuscated_${attachment.name.replace('.txt', '.lua')}`
            });

            await statusMsg.edit({
                embeds: [{
                    color: 0x2ecc71,
                    title: `${preset.emoji} Berhasil`,
                    fields: [
                        { name: 'Original', value: `${(originalSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Obfuscated', value: `${(obfuscatedSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Ratio', value: `${ratio}%`, inline: true }
                    ],
                    timestamp: new Date()
                }],
                files: [file]
            });
        } else {
            await statusMsg.edit({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ Gagal',
                    description: `\`\`\`${(stdout || stderr || 'Unknown error').substring(0, 500)}\`\`\``
                }]
            });
        }

    } catch (err) {
        console.error(err);
        if (statusMsg) {
            await statusMsg.edit({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ Error',
                    description: `\`${err.message}\``
                }]
            }).catch(() => {});
        }
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
}

async function handleHelp(message) {
    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '📖 Prometheus Bot',
            fields: [
                {
                    name: 'Commands',
                    value: '`!obf [preset]` + attach file\n`!presets` - Lihat presets\n`!help` - Bantuan'
                },
                {
                    name: 'Presets',
                    value: '🟢 `minify` | 🔵 `weak` | 🟡 `medium`'
                }
            ]
        }]
    });
}

async function handlePresets(message) {
    await message.reply({
        embeds: [{
            color: 0x9b59b6,
            title: '🎨 Presets',
            fields: [
                { name: '🟢 minify', value: 'Perkecil ukuran saja' },
                { name: '🔵 weak', value: 'Variable rename' },
                { name: '🟡 medium', value: 'String encryption + Control flow\n*(Tertinggi & paling aman untuk Roblox)*' }
            ]
        }]
    });
}

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const makeRequest = (targetUrl, redirects = 0) => {
            if (redirects > 5) return reject(new Error('Too many redirects'));
            
            const protocol = targetUrl.startsWith('https') ? https : http;
            
            protocol.get(targetUrl, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return makeRequest(res.headers.location, redirects + 1);
                }
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
                
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                res.on('error', reject);
            }).on('error', reject);
        };
        
        makeRequest(url);
    });
}

function cleanLuaCode(code) {
    if (!code) return '';
    code = code.replace(/^\uFEFF/, '');
    code = code.replace(/\r\n/g, '\n');
    code = code.replace(/\r/g, '\n');
    code = code.replace(/\x00/g, '');
    code = code.trim();
    return code;
}

function cleanupFiles(...files) {
    files.forEach(file => {
        try {
            if (file && fs.existsSync(file)) fs.unlinkSync(file);
        } catch (err) {}
    });
}

client.on('error', () => {});
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

client.login(TOKEN);
