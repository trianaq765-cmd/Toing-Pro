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
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    // Split tapi pertahankan JSON body jika ada
    const firstSpace = content.indexOf(' ');
    const cmd = firstSpace === -1 ? content.toLowerCase() : content.substring(0, firstSpace).toLowerCase();
    
    // Args parsing yang lebih cerdas untuk JSON
    const rest = firstSpace === -1 ? '' : content.substring(firstSpace + 1);
    const args = rest.split(/\s+/);

    try {
        // Prometheus
        if (cmd === '!obf') await handleObfuscate(message);
        else if (cmd === '!presets') await handlePresets(message);
        
        // jnkie API Explorer (BARU)
        else if (cmd === '!api') await handleApiTest(message, rest);
        else if (cmd === '!discover') await handleDiscovery(message);
        
        // jnkie Standard (Services/Keys)
        else if (cmd === '!service') await handleService(message, args);
        else if (cmd === '!key') await handleKey(message, args);
        else if (cmd === '!help') await handleHelp(message);
        
    } catch (err) {
        console.error(err);
        message.reply(`❌ System Error: ${err.message}`);
    }
});

// ================================================================
// 🕵️ API EXPLORER & DISCOVERY (FITUR BARU)
// ================================================================

// Command: !api [METHOD] [ENDPOINT] [JSON_BODY]
// Contoh: !api GET /scripts
// Contoh: !api POST /scripts {"name":"test"}
async function handleApiTest(message, rawArgs) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const args = rawArgs.split(/\s+/);
    const method = args[0]?.toUpperCase();
    const endpoint = args[1];
    
    // Ambil JSON body jika ada
    let body = null;
    const bodyStartIndex = rawArgs.indexOf('{');
    if (bodyStartIndex !== -1 && ['POST', 'PUT', 'PATCH'].includes(method)) {
        try {
            const jsonStr = rawArgs.substring(bodyStartIndex);
            body = JSON.parse(jsonStr);
        } catch (e) {
            return message.reply('❌ Format JSON body salah');
        }
    }

    if (!method || !endpoint) {
        return message.reply({
            embeds: [{
                color: 0x3498db,
                title: '🕵️ API Explorer',
                description: 'Kirim request manual ke jnkie API',
                fields: [
                    { name: 'Syntax', value: '`!api [METHOD] [ENDPOINT] [JSON]`' },
                    { name: 'Contoh GET', value: '`!api GET /services`\n`!api GET /scripts`' },
                    { name: 'Contoh POST', value: '`!api POST /services {"name":"Test"}`' }
                ]
            }]
        });
    }

    const statusMsg = await message.reply(`🔄 **${method}** \`/api/v2${endpoint}\`...`);

    const result = await jnkieRequestDebug(method, endpoint, body);

    // Format output
    let color = result.statusCode >= 200 && result.statusCode < 300 ? 0x2ecc71 : 0xe74c3c;
    let description = `**Status:** \`${result.statusCode}\`\n**Time:** \`${result.time}ms\``;
    
    // Potong output jika terlalu panjang
    let responseStr = JSON.stringify(result.data, null, 2);
    if (responseStr.length > 1500) {
        // Kirim sebagai file jika panjang
        const file = new AttachmentBuilder(Buffer.from(responseStr), { name: 'response.json' });
        await statusMsg.edit({
            embeds: [{ color, title: '📡 API Response', description }],
            files: [file]
        });
    } else {
        // Kirim dalam code block
        await statusMsg.edit({
            embeds: [{
                color,
                title: '📡 API Response',
                description: description + `\n\`\`\`json\n${responseStr}\n\`\`\``
            }]
        });
    }
}

// Command: !discover
// Mencoba daftar endpoint umum untuk mencari fitur script/obfuscator
async function handleDiscovery(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply('🕵️ **Scanning endpoints...** Mencoba menebak endpoint script/obfuscator.');

    // Daftar tebakan endpoint
    const guesses = [
        '/scripts',
        '/script',
        '/loader',
        '/loaders',
        '/obfuscate',
        '/obfuscator',
        '/obfuscation',
        '/projects',
        '/apps',
        '/products',
        '/files',
        '/assets'
    ];

    let found = [];
    let notFound = [];

    for (const ep of guesses) {
        const result = await jnkieRequest('GET', ep);
        // 404 = Tidak ada
        // 401/403 = Ada tapi butuh izin/salah method
        // 200 = Ada dan sukses
        // 405 = Method Not Allowed (Berarti endpoint ADA, tapi mungkin butuh POST)
        
        if (result.statusCode !== 404) {
            found.push({ path: ep, status: result.statusCode });
        } else {
            notFound.push(ep);
        }
    }

    let desc = '';
    if (found.length > 0) {
        desc += '**✅ Endpoint Ditemukan (Potential):**\n';
        desc += found.map(f => `\`${f.path}\` (Status: ${f.status})`).join('\n');
    } else {
        desc += '❌ Tidak ada endpoint umum yang ditemukan.';
    }

    desc += '\n\n**Note:**\n`200` = Akses OK\n`401/403` = Butuh izin/scope\n`405` = Salah method (Coba POST)';

    await statusMsg.edit({
        embeds: [{
            color: found.length > 0 ? 0x2ecc71 : 0xe74c3c,
            title: '🕵️ Discovery Results',
            description: desc
        }]
    });
}

// ================================================================
// JNKIE API HELPER (DEBUG VERSION)
// ================================================================
function jnkieRequestDebug(method, endpoint, body = null) {
    return new Promise((resolve) => {
        const start = Date.now();
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
                const time = Date.now() - start;
                try {
                    const json = JSON.parse(data);
                    resolve({ 
                        statusCode: res.statusCode, 
                        data: json,
                        time: time
                    });
                } catch (e) {
                    resolve({ 
                        statusCode: res.statusCode, 
                        data: data, // Return raw text if not JSON
                        time: time
                    });
                }
            });
        });

        req.on('error', (e) => resolve({ statusCode: 0, data: e.message, time: 0 }));
        req.setTimeout(15000, () => { req.destroy(); resolve({ statusCode: 408, data: 'Timeout', time: 15000 }); });

        if (body) req.write(postData);
        req.end();
    });
}

// Standard Request Helper (untuk command biasa)
function jnkieRequest(method, endpoint, body = null) {
    return new Promise((resolve) => {
        const postData = body ? JSON.stringify(body) : '';
        const options = {
            hostname: 'api.jnkie.com',
            port: 443,
            path: `/api/v2${endpoint}`,
            method: method,
            headers: { 'Authorization': `Bearer ${JNKIE_API_KEY}`, 'Content-Type': 'application/json' }
        };
        if (body) options.headers['Content-Length'] = Buffer.byteLength(postData);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ success: res.statusCode >= 200 && res.statusCode < 300, data: json.data || json, error: json.message, statusCode: res.statusCode });
                } catch (e) { resolve({ success: false, statusCode: res.statusCode }); }
            });
        });
        req.on('error', (e) => resolve({ success: false, error: e.message }));
        if (body) req.write(postData);
        req.end();
    });
}

// ================================================================
// OBFUSCATOR (PROMETHEUS)
// ================================================================
async function handleObfuscate(message) {
    if (message.attachments.size === 0) return message.reply('❌ Attach file');
    const attachment = message.attachments.first();
    const presetKey = message.content.split(/\s+/)[1] || 'minify';
    const preset = PRESETS[presetKey.toLowerCase()] || PRESETS.minify;
    
    const timestamp = Date.now();
    const inputPath = path.join(PROMETHEUS_PATH, `in_${timestamp}.lua`);
    const outputPath = path.join(PROMETHEUS_PATH, `out_${timestamp}.lua`);

    try {
        const luaCode = await downloadFile(attachment.url);
        fs.writeFileSync(inputPath, cleanLuaCode(luaCode), 'utf8');
        
        const msg = await message.reply(`🔄 Processing ${preset.emoji}...`);
        
        const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset.value} "${inputPath}" --out "${outputPath}" 2>&1`;
        await execAsync(command, { timeout: 120000 });

        if (fs.existsSync(outputPath)) {
            const finalCode = HEADER + fs.readFileSync(outputPath, 'utf8');
            const file = new AttachmentBuilder(Buffer.from(finalCode), { name: `protected_${attachment.name}` });
            await msg.edit({ content: '✅ Success', files: [file] });
        } else {
            await msg.edit('❌ Failed to generate output');
        }
    } catch (err) {
        message.reply(`❌ Error: ${err.message}`);
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
}

// ================================================================
// STANDARD COMMANDS (Service/Key/Help)
// ================================================================
async function handleService(message, args) {
    if (args[0] === 'list') {
        const res = await jnkieRequest('GET', '/services');
        if (!res.success) return message.reply(`❌ Error: ${res.statusCode}`);
        const list = (Array.isArray(res.data) ? res.data : []).map(s => `• ${s.name} (\`${s.id}\`)`).join('\n') || 'No services';
        return message.reply({ embeds: [{ title: '📦 Services', description: list, color: 0x3498db }] });
    }
    message.reply('Usage: `!service list` (More commands in `!help`)');
}

async function handleKey(message, args) {
    if (args[0] === 'list') {
        const res = await jnkieRequest('GET', '/keys?limit=10');
        if (!res.success) return message.reply(`❌ Error: ${res.statusCode}`);
        const list = (Array.isArray(res.data) ? res.data : []).map(k => `• \`${k.key || k.id}\``).join('\n') || 'No keys';
        return message.reply({ embeds: [{ title: '🔑 Keys', description: list, color: 0x2ecc71 }] });
    }
    message.reply('Usage: `!key list` (More commands in `!help`)');
}

async function handleHelp(message) {
    message.reply({
        embeds: [{
            title: '📖 Bot Commands',
            color: 0x9b59b6,
            fields: [
                { name: '🕵️ Explorer (New)', value: '`!discover` - Cari endpoint otomatis\n`!api [GET/POST] [endpoint] [json]` - Test manual' },
                { name: '🔧 Obfuscator', value: '`!obf [preset]` + file' },
                { name: '📦 Management', value: '`!service list`\n`!key list`' }
            ]
        }]
    });
}

async function handlePresets(message) {
    message.reply('Presets: 🟢 `minify` | 🔵 `weak` | 🟡 `medium`');
}

// ================================================================
// HELPERS
// ================================================================
function downloadFile(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const data = [];
            res.on('data', c => data.push(c));
            res.on('end', () => resolve(Buffer.concat(data).toString()));
        }).on('error', reject);
    });
}

function cleanLuaCode(code) {
    return code.replace(/^\uFEFF/, '').trim();
}

function cleanupFiles(...files) {
    files.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} });
}

client.login(TOKEN);
