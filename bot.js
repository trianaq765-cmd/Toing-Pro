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
    const args = content.split(/\s+/).slice(1);
    const cmd = content.split(/\s+/)[0].toLowerCase();

    try {
        if (cmd === '!obf') await handleObfuscate(message);
        else if (cmd === '!presets') await handlePresets(message);
        else if (cmd === '!scan') await handleScan(message, args); // Fitur Baru!
        else if (cmd === '!debug') await handleDebug(message);
        else if (cmd === '!status') await handleStatus(message);
        else if (cmd === '!help') await handleHelp(message);
        
        // Standard jnkie commands
        else if (cmd === '!service') await handleService(message, args);
        else if (cmd === '!key') await handleKey(message, args);
    } catch (err) {
        console.error(err);
        message.reply(`❌ System Error: ${err.message}`);
    }
});

// ================================================================
// 🕵️ SUPER SCANNER (!scan)
// ================================================================
async function handleScan(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const filter = args[0] ? args[0].toLowerCase() : null;
    const statusMsg = await message.reply(`🕵️ **Scanning API Endpoints...** ${filter ? `(Filter: ${filter})` : '(Full Scan)'}`);

    // Daftar 100+ endpoint umum
    const keywords = [
        // Core
        'script', 'scripts', 'loader', 'loaders', 'loadstring',
        'obfuscate', 'obfuscator', 'obfuscation', 'protect', 'protection',
        'upload', 'download', 'file', 'files', 'asset', 'assets',
        'project', 'projects', 'app', 'apps', 'application', 'applications',
        'product', 'products', 'item', 'items',
        
        // Config & Settings
        'config', 'configs', 'setting', 'settings', 'option', 'options',
        'variable', 'variables', 'var', 'vars', 'env', 'environment',
        'secret', 'secrets', 'key', 'keys', 'license', 'licenses',
        
        // User & Auth
        'user', 'users', 'me', 'profile', 'account', 'auth', 'login',
        'session', 'sessions', 'token', 'tokens',
        
        // System
        'log', 'logs', 'analytic', 'analytics', 'stat', 'stats',
        'version', 'versions', 'update', 'updates', 'build', 'builds',
        'webhook', 'webhooks', 'integration', 'integrations',
        
        // Specific
        'whitelist', 'blacklist', 'hwid', 'hwids', 'ip', 'ips',
        'execute', 'executor', 'execution', 'run', 'runner',
        'compile', 'compiler', 'build', 'builder',
        'luraph', 'ironbrew', 'psu', 'synapse', 'xen'
    ];

    let targets = [];

    // Generate endpoint list
    keywords.forEach(w => {
        // Root endpoints
        targets.push(`/${w}`);
        targets.push(`/v1/${w}`); // Versi 1
        targets.push(`/api/${w}`); // Common prefix
        
        // Plural/Singular check (manual simple)
        if (!w.endsWith('s')) targets.push(`/${w}s`);
    });

    // Nested endpoints (jika ada Service ID)
    if (JNKIE_SERVICE_ID) {
        keywords.forEach(w => {
            targets.push(`/services/${JNKIE_SERVICE_ID}/${w}`);
            targets.push(`/service/${JNKIE_SERVICE_ID}/${w}`);
        });
    }

    // Filter list
    if (filter) {
        targets = targets.filter(t => t.includes(filter));
    }

    // Hapus duplikat
    targets = [...new Set(targets)];

    // Scan process
    const batchSize = 20; // Jangan terlalu agresif
    let found = [];
    
    for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        const progress = Math.round((i / targets.length) * 100);
        
        await statusMsg.edit(`🕵️ Scanning... ${progress}% (${found.length} found)`);

        const promises = batch.map(path => jnkieRequest('GET', path).then(res => ({ path, ...res })));
        const results = await Promise.all(promises);

        results.forEach(res => {
            // Kita cari status code selain 404 (Not Found)
            if (res.statusCode !== 404) {
                found.push({
                    path: res.path,
                    status: res.statusCode,
                    method: 'GET' // Default probe method
                });
            }
        });
        
        // Delay kecil untuk menghindari rate limit
        await new Promise(r => setTimeout(r, 500));
    }

    if (found.length === 0) {
        await statusMsg.edit('❌ **Scan Selesai:** Tidak ada endpoint yang ditemukan.');
    } else {
        // Sort by status code (200 first)
        found.sort((a, b) => a.status - b.status);

        const list = found.map(f => {
            let icon = '❓';
            let note = '';
            
            if (f.status >= 200 && f.status < 300) { icon = '✅'; note = 'Active'; }
            else if (f.status === 401) { icon = '🔒'; note = 'Auth Required'; }
            else if (f.status === 403) { icon = '🚫'; note = 'Forbidden'; }
            else if (f.status === 405) { icon = '✋'; note = 'Method Not Allowed (Try POST)'; }
            else if (f.status === 500) { icon = '🔥'; note = 'Server Error'; }
            
            return `${icon} \`${f.path}\` (${f.status}) - ${note}`;
        }).join('\n');

        await statusMsg.edit({
            content: null,
            embeds: [{
                color: 0x2ecc71,
                title: '🕵️ Scan Results',
                description: list.substring(0, 4000),
                footer: { text: `Total Scanned: ${targets.length} | Found: ${found.length}` },
                timestamp: new Date()
            }]
        });
    }
}

// ================================================================
// JNKIE API HELPER (Standard)
// ================================================================
function jnkieRequest(method, endpoint, body = null) {
    return new Promise((resolve) => {
        const postData = body ? JSON.stringify(body) : '';
        
        const options = {
            hostname: 'api.jnkie.com',
            port: 443,
            path: `/api/v2${endpoint}`, // Base path v2
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
                        error: json.message || json.error,
                        statusCode: res.statusCode
                    });
                } catch (e) {
                    resolve({ success: false, error: 'Invalid JSON', statusCode: res.statusCode });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message, statusCode: 0 }));
        req.setTimeout(15000, () => { req.destroy(); resolve({ success: false, error: 'Timeout', statusCode: 408 }); });

        if (body) req.write(postData);
        req.end();
    });
}

// ================================================================
// DEBUG MANUAL (!debug)
// ================================================================
async function handleDebug(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const statusMsg = await message.reply('🔍 Checking base endpoints...');
    
    const endpoints = [
        '/services', 
        '/providers', 
        '/integrations',
        '/keys',
        '/me',
        '/user'
    ];

    let resultTxt = '';
    for (const ep of endpoints) {
        const res = await jnkieRequest('GET', ep);
        const icon = res.success ? '✅' : '❌';
        resultTxt += `${icon} \`${ep}\` (${res.statusCode})\n`;
    }

    await statusMsg.edit({
        embeds: [{
            title: '🔍 API Debug',
            description: resultTxt,
            color: 0x3498db
        }]
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
// STANDARD HANDLERS (Service/Key/Help)
// ================================================================
async function handleService(message, args) {
    if (args[0] === 'list') {
        const res = await jnkieRequest('GET', '/services');
        const list = (Array.isArray(res.data) ? res.data : []).map(s => `• ${s.name} (\`${s.id}\`)`).join('\n') || 'No services';
        return message.reply({ embeds: [{ title: '📦 Services', description: list, color: 0x3498db }] });
    }
    message.reply('Usage: `!service list`');
}

async function handleKey(message, args) {
    if (args[0] === 'list') {
        const res = await jnkieRequest('GET', '/keys?limit=10');
        const list = (Array.isArray(res.data) ? res.data : []).map(k => `• \`${k.key || k.id}\``).join('\n') || 'No keys';
        return message.reply({ embeds: [{ title: '🔑 Keys', description: list, color: 0x2ecc71 }] });
    }
    message.reply('Usage: `!key list`');
}

async function handleHelp(message) {
    message.reply({
        embeds: [{
            title: '📖 Bot Commands',
            color: 0x9b59b6,
            fields: [
                { name: '🕵️ Explorer', value: '`!scan` - Scan semua endpoint\n`!scan [word]` - Scan spesifik (misal `!scan script`)' },
                { name: '🔧 Obfuscator', value: '`!obf [preset]` + file' },
                { name: '📦 Management', value: '`!service list`\n`!key list`' }
            ]
        }]
    });
}

async function handlePresets(message) {
    message.reply('Presets: 🟢 `minify` | 🔵 `weak` | 🟡 `medium`');
}

function handleStatus(message) {
    message.reply('Bot Online ✅');
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
