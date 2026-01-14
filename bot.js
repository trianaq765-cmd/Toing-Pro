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
        if (cmd.startsWith('!obf')) await handleObfuscate(message);
        else if (cmd === '!presets') await handlePresets(message);
        else if (cmd.startsWith('!service')) await handleService(message, args);
        else if (cmd.startsWith('!provider')) await handleProvider(message, args);
        else if (cmd.startsWith('!integration')) await handleIntegration(message, args);
        else if (cmd.startsWith('!key')) await handleKey(message, args);
        else if (cmd === '!help') await handleHelp(message);
    } catch (err) {
        console.error(err);
    }
});

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

async function handleService(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/services');
        if (result.success) {
            const services = Array.isArray(result.data) ? result.data : [];
            const list = services.length > 0 
                ? services.map((s, i) => `${i+1}. **${s.name}** (\`${s.id}\`)`).join('\n')
                : 'Tidak ada service';
            return message.reply({ embeds: [{ color: 0x3498db, title: '📦 Services', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

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
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Service Created', description: `Name: **${name}**` }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
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
                    title: '📦 Service', 
                    fields: [
                        { name: 'Name', value: s.name || 'N/A', inline: true },
                        { name: 'ID', value: s.id || 'N/A', inline: true },
                        { name: 'Description', value: s.description || 'N/A' }
                    ]
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!service delete [id]`');

        const result = await jnkieRequest('DELETE', `/services/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply('❌ Usage: `!service [list|create|get|delete]`');
}

async function handleProvider(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/providers');
        if (result.success) {
            const providers = Array.isArray(result.data) ? result.data : [];
            const list = providers.length > 0 
                ? providers.map((p, i) => `${i+1}. **${p.name}** (\`${p.id}\`)`).join('\n')
                : 'Tidak ada provider';
            return message.reply({ embeds: [{ color: 0x9b59b6, title: '🔌 Providers', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'create') {
        const name = args[1];
        if (!name) return message.reply('❌ Usage: `!provider create [name]`');

        const result = await jnkieRequest('POST', '/providers', { name: name });
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Provider Created' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
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
                    fields: [
                        { name: 'Name', value: p.name || 'N/A', inline: true },
                        { name: 'ID', value: p.id || 'N/A', inline: true }
                    ]
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!provider delete [id]`');

        const result = await jnkieRequest('DELETE', `/providers/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply('❌ Usage: `!provider [list|create|get|delete]`');
}

async function handleIntegration(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/integrations');
        if (result.success) {
            const items = Array.isArray(result.data) ? result.data : [];
            const list = items.length > 0 
                ? items.map((i, idx) => `${idx+1}. **${i.type || i.name}** (\`${i.id}\`)`).join('\n')
                : 'Tidak ada integration';
            return message.reply({ embeds: [{ color: 0xe67e22, title: '🔗 Integrations', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'types') {
        const result = await jnkieRequest('GET', '/integrations/types');
        if (result.success) {
            const types = Array.isArray(result.data) ? result.data : [];
            const list = types.map(t => `• \`${t.type || t.name || t}\``).join('\n') || 'Tidak ada';
            return message.reply({ embeds: [{ color: 0xe67e22, title: '🔗 Types', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'create') {
        const type = args[1];
        if (!type) return message.reply('❌ Usage: `!integration create [type]`');

        const result = await jnkieRequest('POST', '/integrations', { type: type });
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Integration Created' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
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
                    fields: [
                        { name: 'Type', value: i.type || 'N/A', inline: true },
                        { name: 'ID', value: i.id || 'N/A', inline: true }
                    ]
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!integration delete [id]`');

        const result = await jnkieRequest('DELETE', `/integrations/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply('❌ Usage: `!integration [list|types|create|get|delete]`');
}

async function handleKey(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/keys?limit=15');
        if (result.success) {
            const keys = Array.isArray(result.data) ? result.data : [];
            const list = keys.length > 0 
                ? keys.map((k, i) => `${i+1}. \`${(k.key || k.id).substring(0, 20)}...\``).join('\n')
                : 'Tidak ada key';
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '🔑 Keys', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'create') {
        const duration = args[1] || '7d';
        const note = args.slice(2).join(' ') || `By ${message.author.username}`;

        const result = await jnkieRequest('POST', '/keys', {
            duration: duration,
            note: note,
            max_hwids: 1
        });

        if (result.success && result.data) {
            const key = result.data.key || result.data.id || 'N/A';
            await message.reply({ 
                embeds: [{ 
                    color: 0x2ecc71, 
                    title: '✅ Key Created', 
                    fields: [
                        { name: '🔑 Key', value: `\`${key}\`` },
                        { name: '⏱️ Duration', value: duration, inline: true }
                    ]
                }]
            });
            try { await message.author.send(`🔑 Key: \`${key}\``); } catch (e) {}
            return;
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'batch') {
        const count = parseInt(args[1]) || 5;
        const duration = args[2] || '7d';

        const result = await jnkieRequest('POST', '/keys/batch', {
            count: count,
            duration: duration,
            max_hwids: 1
        });

        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: `✅ ${count} Keys Created` }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
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
                    fields: [
                        { name: 'Key', value: `\`${k.key || k.id}\`` },
                        { name: 'Status', value: k.status || 'N/A', inline: true },
                        { name: 'Expires', value: k.expires_at || 'N/A', inline: true }
                    ]
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'verify') {
        const key = args[1];
        if (!key) return message.reply('❌ Usage: `!key verify [key]`');

        const result = await jnkieRequest('GET', `/keys?key=${encodeURIComponent(key)}`);
        if (result.success && result.data) {
            const keys = Array.isArray(result.data) ? result.data : [result.data];
            if (keys.length > 0) {
                const k = keys[0];
                const valid = k.status === 'active';
                return message.reply({ 
                    embeds: [{ 
                        color: valid ? 0x2ecc71 : 0xe74c3c, 
                        title: valid ? '✅ Valid' : '❌ Invalid',
                        description: `Status: ${k.status || 'N/A'}`
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
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'delete') {
        const keyId = args[1];
        if (!keyId) return message.reply('❌ Usage: `!key delete [keyId]`');

        const result = await jnkieRequest('DELETE', `/keys/${keyId}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'bulk-delete') {
        const keysStr = args[1];
        if (!keysStr) return message.reply('❌ Usage: `!key bulk-delete [k1,k2,...]`');

        const keys = keysStr.split(',').map(k => k.trim());
        const result = await jnkieRequest('POST', '/keys/bulk-delete', { keys: keys });
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: `✅ ${keys.length} Deleted` }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply('❌ Usage: `!key [list|create|batch|get|verify|reset|delete|bulk-delete]`');
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
                { name: '🔑 Keys', value: '`!key [list|create|batch|get|verify|reset|delete|bulk-delete]`' }
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
                    resolve({ success: false, error: 'Invalid response' });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.setTimeout(30000, () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });

        if (body) req.write(postData);
        req.end();
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
    return code.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x00/g, '').trim();
}

function cleanupFiles(...files) {
    files.forEach(f => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} });
}

client.on('error', () => {});
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

client.login(TOKEN);
