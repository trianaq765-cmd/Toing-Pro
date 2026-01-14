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
const JNKIE_SERVICE_ID = process.env.JNKIE_SERVICE_ID;

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
    console.log(`Default Service ID: ${JNKIE_SERVICE_ID || 'NOT SET'}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const args = content.split(/\s+/).slice(1);
    const cmd = content.toLowerCase();

    try {
        if (cmd.startsWith('!obf')) await handleObfuscate(message);
        else if (cmd === '!presets') await handlePresets(message);
        else if (cmd.startsWith('!service')) await handleService(message, args);
        else if (cmd.startsWith('!provider')) await handleProvider(message, args);
        else if (cmd.startsWith('!integration')) await handleIntegration(message, args);
        else if (cmd.startsWith('!key')) await handleKey(message, args);
        else if (cmd === '!help') await handleHelp(message);
        else if (cmd === '!status') await handleStatus(message);
        else if (cmd === '!debug') await handleDebug(message);
    } catch (err) {
        console.error(err);
    }
});

// ================================================================
// DEBUG HANDLER - Lihat raw response dari API
// ================================================================
async function handleDebug(message) {
    if (!JNKIE_API_KEY) {
        return message.reply('❌ API Key belum di-set');
    }

    const statusMsg = await message.reply('🔍 Testing jnkie API...');

    const endpoints = [
        { name: 'Services', path: '/services' },
        { name: 'Providers', path: '/providers' },
        { name: 'Integrations', path: '/integrations' },
        { name: 'Integration Types', path: '/integrations/types' },
        { name: 'Keys', path: '/keys?limit=5' }
    ];

    let results = [];

    for (const ep of endpoints) {
        const result = await jnkieRequestDebug('GET', ep.path);
        results.push({
            name: ep.name,
            status: result.statusCode,
            success: result.success,
            dataType: typeof result.data,
            isArray: Array.isArray(result.data),
            length: Array.isArray(result.data) ? result.data.length : 'N/A',
            sample: JSON.stringify(result.data).substring(0, 200)
        });
    }

    const fields = results.map(r => ({
        name: `${r.success ? '✅' : '❌'} ${r.name}`,
        value: `Status: ${r.status}\nType: ${r.dataType}\nArray: ${r.isArray}\nLength: ${r.length}\nSample: \`${r.sample}...\``
    }));

    await statusMsg.edit({
        embeds: [{
            color: 0x3498db,
            title: '🔍 API Debug',
            fields: fields.slice(0, 5),
            footer: { text: `API Key: ${JNKIE_API_KEY.substring(0, 10)}...` },
            timestamp: new Date()
        }]
    });

    // Send full raw response in separate message
    const fullDebug = results.map(r => `=== ${r.name} ===\n${r.sample}`).join('\n\n');
    await message.channel.send(`\`\`\`json\n${fullDebug.substring(0, 1900)}\n\`\`\``);
}

// ================================================================
// JNKIE API WITH DEBUG
// ================================================================
function jnkieRequestDebug(method, endpoint, body = null) {
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

        console.log(`[JNKIE DEBUG] ${method} ${endpoint}`);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[JNKIE DEBUG] Status: ${res.statusCode}`);
                console.log(`[JNKIE DEBUG] Raw Response: ${data.substring(0, 500)}`);
                
                try {
                    const json = JSON.parse(data);
                    resolve({ 
                        success: res.statusCode >= 200 && res.statusCode < 300,
                        statusCode: res.statusCode,
                        data: json,
                        raw: data
                    });
                } catch (e) {
                    resolve({ 
                        success: false, 
                        statusCode: res.statusCode,
                        data: data,
                        raw: data,
                        parseError: e.message
                    });
                }
            });
        });

        req.on('error', (e) => {
            console.log(`[JNKIE DEBUG] Error: ${e.message}`);
            resolve({ success: false, error: e.message });
        });
        
        req.setTimeout(30000, () => { 
            req.destroy(); 
            resolve({ success: false, error: 'Timeout' }); 
        });

        if (body) req.write(postData);
        req.end();
    });
}

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
                    
                    // Handle various response formats
                    let responseData = json;
                    let errorMsg = null;

                    // Check for nested data
                    if (json.data !== undefined) {
                        responseData = json.data;
                    }

                    // Check for error messages
                    if (json.message) errorMsg = json.message;
                    if (json.error) errorMsg = typeof json.error === 'string' ? json.error : JSON.stringify(json.error);
                    if (json.errors) errorMsg = JSON.stringify(json.errors);

                    resolve({ 
                        success: res.statusCode >= 200 && res.statusCode < 300, 
                        data: responseData,
                        error: errorMsg,
                        statusCode: res.statusCode
                    });
                } catch (e) {
                    resolve({ success: false, error: `Parse error: ${data.substring(0, 100)}` });
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
// OBFUSCATOR
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
        if (statusMsg) {
            await statusMsg.edit({ 
                embeds: [{ color: 0xe74c3c, title: '❌ Error', description: `\`${err.message}\`` }] 
            }).catch(() => {});
        }
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
}

// ================================================================
// SERVICES
// ================================================================
async function handleService(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/services');
        
        if (!result.success) {
            return message.reply({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ Error',
                    description: `Status: ${result.statusCode}\nError: ${result.error || 'Unknown'}`,
                    footer: { text: 'Gunakan !debug untuk info lebih lanjut' }
                }]
            });
        }

        const services = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []);
        
        if (services.length === 0) {
            return message.reply({ 
                embeds: [{ 
                    color: 0x3498db, 
                    title: '📦 Services', 
                    description: 'Tidak ada service.\n\nBuat dengan: `!service create [name]`' 
                }] 
            });
        }

        const list = services.map((s, i) => {
            const id = s.id || s._id || 'N/A';
            const name = s.name || 'Unnamed';
            return `**${i+1}. ${name}**\nID: \`${id}\``;
        }).join('\n\n');

        return message.reply({ 
            embeds: [{ 
                color: 0x3498db, 
                title: '📦 Services', 
                description: list,
                footer: { text: `Total: ${services.length}` }
            }] 
        });
    }

    if (action === 'create') {
        const name = args[1];
        if (!name) return message.reply('❌ Usage: `!service create [name] [description]`');
        
        const description = args.slice(2).join(' ') || 'No description';

        const result = await jnkieRequest('POST', '/services', {
            name: name,
            description: description,
            is_premium: false,
            slug: name.toLowerCase().replace(/\s+/g, '-'),
            keyless_mode: false
        });

        if (result.success) {
            const id = result.data?.id || result.data?._id || 'N/A';
            return message.reply({ 
                embeds: [{ 
                    color: 0x2ecc71, 
                    title: '✅ Service Created', 
                    description: `**Name:** ${name}\n**ID:** \`${id}\`\n\n💡 Untuk set default, tambah env:\n\`JNKIE_SERVICE_ID=${id}\``
                }] 
            });
        }
        return message.reply(`❌ Error: ${result.error || 'Unknown error'}`);
    }

    if (action === 'get') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!service get [id]`');

        const result = await jnkieRequest('GET', `/services/${id}`);
        if (result.success && result.data) {
            const s = result.data;
            return message.reply({ 
                embeds: [{ 
                    color: 0x3498db, 
                    title: '📦 Service Details', 
                    description: `**Name:** ${s.name || 'N/A'}\n**ID:** \`${s.id || s._id}\`\n**Description:** ${s.description || 'N/A'}\n**Slug:** ${s.slug || 'N/A'}\n**Premium:** ${s.is_premium ? 'Yes' : 'No'}\n**Keyless:** ${s.keyless_mode ? 'Yes' : 'No'}`
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error || 'Not found'}`);
    }

    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!service delete [id]`');

        const result = await jnkieRequest('DELETE', `/services/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Service Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error || 'Failed'}`);
    }

    return message.reply('❌ Usage: `!service [list|create|get|delete]`');
}

// ================================================================
// PROVIDERS
// ================================================================
async function handleProvider(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/providers');
        
        if (!result.success) {
            return message.reply(`❌ Error: ${result.error || 'Unknown'}`);
        }

        const items = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []);
        
        if (items.length === 0) {
            return message.reply({ embeds: [{ color: 0x9b59b6, title: '🔌 Providers', description: 'Tidak ada provider' }] });
        }

        const list = items.map((p, i) => `**${i+1}. ${p.name || 'Unnamed'}**\nID: \`${p.id || p._id}\``).join('\n\n');
        return message.reply({ embeds: [{ color: 0x9b59b6, title: '🔌 Providers', description: list }] });
    }

    if (action === 'create') {
        const name = args[1];
        if (!name) return message.reply('❌ Usage: `!provider create [name]`');

        const result = await jnkieRequest('POST', '/providers', { name: name });
        if (result.success) {
            const id = result.data?.id || result.data?._id || 'N/A';
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Provider Created', description: `ID: \`${id}\`` }] });
        }
        return message.reply(`❌ Error: ${result.error || 'Failed'}`);
    }

    if (action === 'get') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!provider get [id]`');

        const result = await jnkieRequest('GET', `/providers/${id}`);
        if (result.success && result.data) {
            const p = result.data;
            return message.reply({ 
                embeds: [{ 
                    color: 0x9b59b6, 
                    title: '🔌 Provider', 
                    description: `**Name:** ${p.name}\n**ID:** \`${p.id || p._id}\``
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error || 'Not found'}`);
    }

    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!provider delete [id]`');

        const result = await jnkieRequest('DELETE', `/providers/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error || 'Failed'}`);
    }

    return message.reply('❌ Usage: `!provider [list|create|get|delete]`');
}

// ================================================================
// INTEGRATIONS
// ================================================================
async function handleIntegration(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/integrations');
        
        if (!result.success) {
            return message.reply(`❌ Error: ${result.error || 'Unknown'}`);
        }

        const items = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []);
        
        if (items.length === 0) {
            return message.reply({ embeds: [{ color: 0xe67e22, title: '🔗 Integrations', description: 'Tidak ada integration' }] });
        }

        const list = items.map((i, idx) => `**${idx+1}. ${i.type || i.name || 'Unnamed'}**\nID: \`${i.id || i._id}\``).join('\n\n');
        return message.reply({ embeds: [{ color: 0xe67e22, title: '🔗 Integrations', description: list }] });
    }

    if (action === 'types') {
        const result = await jnkieRequest('GET', '/integrations/types');
        if (result.success) {
            const types = Array.isArray(result.data) ? result.data : [];
            const list = types.map(t => `• \`${typeof t === 'string' ? t : (t.type || t.name || JSON.stringify(t))}\``).join('\n') || 'Tidak ada';
            return message.reply({ embeds: [{ color: 0xe67e22, title: '🔗 Integration Types', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error || 'Failed'}`);
    }

    if (action === 'create') {
        const type = args[1];
        if (!type) return message.reply('❌ Usage: `!integration create [type]`');

        const result = await jnkieRequest('POST', '/integrations', { type: type });
        if (result.success) {
            const id = result.data?.id || result.data?._id || 'N/A';
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Integration Created', description: `ID: \`${id}\`` }] });
        }
        return message.reply(`❌ Error: ${result.error || 'Failed'}`);
    }

    if (action === 'get') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!integration get [id]`');

        const result = await jnkieRequest('GET', `/integrations/${id}`);
        if (result.success && result.data) {
            const i = result.data;
            return message.reply({ 
                embeds: [{ 
                    color: 0xe67e22, 
                    title: '🔗 Integration', 
                    description: `**Type:** ${i.type || 'N/A'}\n**ID:** \`${i.id || i._id}\``
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error || 'Not found'}`);
    }

    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!integration delete [id]`');

        const result = await jnkieRequest('DELETE', `/integrations/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error || 'Failed'}`);
    }

    return message.reply('❌ Usage: `!integration [list|types|create|get|delete]`');
}

// ================================================================
// KEYS
// ================================================================
async function handleKey(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const serviceId = args[1] || JNKIE_SERVICE_ID;
        
        let endpoint = '/keys?limit=15';
        if (serviceId) endpoint += `&service_id=${serviceId}`;

        const result = await jnkieRequest('GET', endpoint);
        
        if (!result.success) {
            return message.reply({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ Error',
                    description: `${result.error || 'Unknown'}\n\n💡 Gunakan \`!debug\` untuk melihat raw response`
                }]
            });
        }

        const keys = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []);
        
        if (keys.length === 0) {
            return message.reply({ 
                embeds: [{ 
                    color: 0x2ecc71, 
                    title: '🔑 Keys', 
                    description: `${serviceId ? `Service: \`${serviceId}\`\n\n` : ''}Tidak ada key.\n\nBuat dengan: \`!key create [serviceId] [duration]\``
                }] 
            });
        }

        const list = keys.slice(0, 10).map((k, i) => {
            const keyStr = k.key || k.id || k._id || 'N/A';
            const status = k.status || 'active';
            return `**${i+1}.** \`${keyStr.substring(0, 25)}...\`\nStatus: ${status}`;
        }).join('\n\n');

        return message.reply({ 
            embeds: [{ 
                color: 0x2ecc71, 
                title: '🔑 Keys', 
                description: `${serviceId ? `Service: \`${serviceId}\`\n\n` : ''}${list}`,
                footer: { text: `Showing ${Math.min(10, keys.length)} of ${keys.length}` }
            }] 
        });
    }

    if (action === 'create') {
        let serviceId = args[1] || JNKIE_SERVICE_ID;
        let duration = args[2] || '7d';
        let note = args.slice(3).join(' ') || `By ${message.author.username}`;

        // Auto-detect jika args[1] adalah duration
        if (args[1] && /^\d+[dhm]$/.test(args[1])) {
            serviceId = JNKIE_SERVICE_ID;
            duration = args[1];
            note = args.slice(2).join(' ') || `By ${message.author.username}`;
        }

        if (!serviceId) {
            return message.reply({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ Service ID Required',
                    description: 'Usage: `!key create [serviceId] [duration] [note]`\n\nContoh: `!key create abc123 7d My key`\n\nLihat services: `!service list`'
                }]
            });
        }

        const result = await jnkieRequest('POST', '/keys', {
            service_id: serviceId,
            duration: duration,
            note: note,
            max_hwids: 1
        });

        if (result.success && result.data) {
            const key = result.data.key || result.data.id || result.data._id || 'N/A';
            await message.reply({ 
                embeds: [{ 
                    color: 0x2ecc71, 
                    title: '✅ Key Created', 
                    fields: [
                        { name: '🔑 Key', value: `\`${key}\`` },
                        { name: 'Service', value: `\`${serviceId}\``, inline: true },
                        { name: 'Duration', value: duration, inline: true }
                    ]
                }]
            });
            try { await message.author.send(`🔑 Your Key: \`${key}\``); } catch (e) {}
            return;
        }
        return message.reply(`❌ Error: ${result.error || 'Failed to create key'}`);
    }

    if (action === 'batch') {
        let serviceId = args[1] || JNKIE_SERVICE_ID;
        let count = parseInt(args[2]) || 5;
        let duration = args[3] || '7d';

        // Auto-detect
        if (args[1] && !isNaN(parseInt(args[1]))) {
            serviceId = JNKIE_SERVICE_ID;
            count = parseInt(args[1]);
            duration = args[2] || '7d';
        }

        if (!serviceId) {
            return message.reply('❌ Service ID required. Usage: `!key batch [serviceId] [count] [duration]`');
        }

        const result = await jnkieRequest('POST', '/keys/batch', {
            service_id: serviceId,
            count: count,
            duration: duration,
            max_hwids: 1
        });

        if (result.success) {
            return message.reply({ 
                embeds: [{ 
                    color: 0x2ecc71, 
                    title: `✅ ${count} Keys Created`,
                    description: `Service: \`${serviceId}\`\nDuration: ${duration}`
                }] 
            });
        }
        return message.reply(`❌ Error: ${result.error || 'Failed'}`);
    }

    if (action === 'get') {
        const keyId = args[1];
        if (!keyId) return message.reply('❌ Usage: `!key get [keyId]`');

        const result = await jnkieRequest('GET', `/keys/${keyId}`);
        if (result.success && result.data) {
            const k = result.data;
            return message.reply({ 
                embeds: [{ 
                    color: 0x2ecc71, 
                    title: '🔑 Key Details', 
                    description: `**Key:** \`${k.key || k.id || k._id}\`\n**Status:** ${k.status || 'N/A'}\n**Service:** \`${k.service_id || 'N/A'}\`\n**Expires:** ${k.expires_at || 'N/A'}\n**HWIDs:** ${k.hwids?.length || 0}/${k.max_hwids || 1}\n**Note:** ${k.note || 'N/A'}`
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error || 'Not found'}`);
    }

    if (action === 'verify') {
        const key = args[1];
        if (!key) return message.reply('❌ Usage: `!key verify [key]`');

        const result = await jnkieRequest('GET', `/keys?key=${encodeURIComponent(key)}`);
        if (result.success) {
            const keys = Array.isArray(result.data) ? result.data : [result.data];
            if (keys.length > 0 && keys[0]) {
                const k = keys[0];
                const valid = k.status === 'active';
                return message.reply({ 
                    embeds: [{ 
                        color: valid ? 0x2ecc71 : 0xe74c3c, 
                        title: valid ? '✅ Key Valid' : '❌ Key Invalid',
                        description: `**Status:** ${k.status || 'N/A'}\n**Expires:** ${k.expires_at || 'N/A'}`
                    }]
                });
            }
        }
        return message.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Key Not Found' }] });
    }

    if (action === 'reset') {
        const keyId = args[1];
        if (!keyId) return message.reply('❌ Usage: `!key reset [keyId]`');

        const result = await jnkieRequest('POST', `/keys/${keyId}/reset-hwid`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ HWID Reset' }] });
        }
        return message.reply(`❌ Error: ${result.error || 'Failed'}`);
    }

    if (action === 'delete') {
        const keyId = args[1];
        if (!keyId) return message.reply('❌ Usage: `!key delete [keyId]`');

        const result = await jnkieRequest('DELETE', `/keys/${keyId}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Key Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error || 'Failed'}`);
    }

    if (action === 'bulk-delete') {
        const keysStr = args[1];
        if (!keysStr) return message.reply('❌ Usage: `!key bulk-delete [k1,k2,...]`');

        const keys = keysStr.split(',').map(k => k.trim());
        const result = await jnkieRequest('POST', '/keys/bulk-delete', { keys: keys });
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: `✅ ${keys.length} Keys Deleted` }] });
        }
        return message.reply(`❌ Error: ${result.error || 'Failed'}`);
    }

    return message.reply({
        embeds: [{
            color: 0x2ecc71,
            title: '🔑 Key Commands',
            description: '`!key list [serviceId]`\n`!key create [serviceId] [duration]`\n`!key batch [serviceId] [count] [duration]`\n`!key get [keyId]`\n`!key verify [key]`\n`!key reset [keyId]`\n`!key delete [keyId]`'
        }]
    });
}

// ================================================================
// STATUS & HELP
// ================================================================
async function handleStatus(message) {
    const fields = [
        { name: 'API Key', value: JNKIE_API_KEY ? '✅ Set' : '❌ Not Set', inline: true },
        { name: 'Default Service', value: JNKIE_SERVICE_ID ? `\`${JNKIE_SERVICE_ID}\`` : '❌ Not Set', inline: true }
    ];

    if (JNKIE_API_KEY) {
        const result = await jnkieRequest('GET', '/services');
        fields.push({ 
            name: 'API Connection', 
            value: result.success ? '✅ Connected' : `❌ Error: ${result.error}`, 
            inline: true 
        });
    }

    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '📊 Status',
            fields: fields,
            footer: { text: 'Gunakan !debug untuk test semua endpoints' },
            timestamp: new Date()
        }]
    });
}

async function handleHelp(message) {
    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '📖 Commands',
            fields: [
                { name: '🔧 Obfuscator', value: '`!obf [preset]` + file\n`!presets`' },
                { name: '📦 Services', value: '`!service [list|create|get|delete]`' },
                { name: '🔌 Providers', value: '`!provider [list|create|get|delete]`' },
                { name: '🔗 Integrations', value: '`!integration [list|types|create|get|delete]`' },
                { name: '🔑 Keys', value: '`!key [list|create|batch|get|verify|reset|delete]`' },
                { name: '🔍 Debug', value: '`!debug` - Test semua API endpoints\n`!status` - Cek koneksi' }
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

client.login(TOKEN);
