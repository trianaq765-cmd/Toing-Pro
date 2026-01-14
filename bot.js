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
        else if (cmd === '!scan') await handleScan(message, args);
        else if (cmd === '!debug') await handleDebug(message);
        else if (cmd === '!status') await handleStatus(message);
        else if (cmd === '!help') await handleHelp(message);
        
        else if (cmd === '!service') await handleService(message, args);
        else if (cmd === '!key') await handleKey(message, args);
        else if (cmd === '!api') await handleApiTest(message, args);
        
    } catch (err) {
        console.error(err);
        message.reply(`❌ System Error: ${err.message}`);
    }
});

// ================================================================
// JNKIE API HELPER (Robust Parsing)
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
                    
                    // Smart data extraction
                    let finalData = json;
                    if (json.data !== undefined) finalData = json.data;
                    if (json.results !== undefined) finalData = json.results;
                    if (json.services !== undefined) finalData = json.services;
                    if (json.keys !== undefined) finalData = json.keys;

                    resolve({ 
                        success: res.statusCode >= 200 && res.statusCode < 300, 
                        data: finalData, 
                        original: json, // Keep original for debug
                        error: json.message || json.error,
                        statusCode: res.statusCode
                    });
                } catch (e) {
                    resolve({ 
                        success: false, 
                        error: `Parse error: ${data.substring(0, 100)}`, 
                        statusCode: res.statusCode 
                    });
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
// SERVICE HANDLER (FIXED)
// ================================================================
async function handleService(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    // !service list (Default)
    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/services');
        
        // Debugging output jika format salah
        if (!result.success || !Array.isArray(result.data)) {
            const debug = JSON.stringify(result.original || result.data, null, 2).substring(0, 1500);
            return message.reply(`❌ **Format Error / API Gagal**\nStatus: ${result.statusCode}\n\`\`\`json\n${debug}\n\`\`\``);
        }

        const services = result.data;
        if (services.length === 0) return message.reply('📦 Tidak ada service.');

        const list = services.map((s, i) => {
            const name = s.name || 'Unnamed';
            const id = s.id || s._id || 'N/A';
            return `**${i+1}. ${name}**\n🆔 \`${id}\``;
        }).join('\n\n');

        return message.reply({ 
            embeds: [{ 
                title: '📦 Services List', 
                description: list, 
                color: 0x3498db,
                footer: { text: `Total: ${services.length}` }
            }] 
        });
    }
    
    message.reply('Usage: `!service list`');
}

// ================================================================
// KEY HANDLER
// ================================================================
async function handleKey(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    // !key list
    if (!action || action === 'list') {
        // Coba endpoint keys global dulu
        let result = await jnkieRequest('GET', '/keys?limit=15');
        
        // Jika butuh service_id dan gagal
        if (!result.success && JNKIE_SERVICE_ID) {
            result = await jnkieRequest('GET', `/keys?service_id=${JNKIE_SERVICE_ID}&limit=15`);
        }

        if (!result.success) {
            return message.reply(`❌ Error: ${result.statusCode} - ${result.error}`);
        }

        const keys = Array.isArray(result.data) ? result.data : [];
        if (keys.length === 0) return message.reply('🔑 Tidak ada key.');

        const list = keys.slice(0, 10).map((k, i) => {
            const keyStr = k.key || k.id || 'N/A';
            const status = k.status || 'active';
            return `**${i+1}.** \`${keyStr.substring(0, 25)}...\` (${status})`;
        }).join('\n');

        return message.reply({ 
            embeds: [{ 
                title: '🔑 Keys List', 
                description: list, 
                color: 0x2ecc71 
            }] 
        });
    }

    message.reply('Usage: `!key list`');
}

// ================================================================
// API EXPLORER & SCANNER
// ================================================================
async function handleApiTest(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    
    // Parse: !api GET /services
    const method = args[0]?.toUpperCase() || 'GET';
    const endpoint = args[1] || '/services';
    
    // Parse body jika ada JSON di args ke-3 dst
    let body = null;
    const bodyStr = args.slice(2).join(' ');
    if (bodyStr.startsWith('{')) {
        try { body = JSON.parse(bodyStr); } catch (e) {}
    }

    const msg = await message.reply(`🔄 ${method} ${endpoint}...`);
    const res = await jnkieRequest(method, endpoint, body);

    const json = JSON.stringify(res.original || res.data, null, 2);
    if (json.length > 1900) {
        const file = new AttachmentBuilder(Buffer.from(json), { name: 'response.json' });
        await msg.edit({ content: `✅ Status: ${res.statusCode}`, files: [file] });
    } else {
        await msg.edit(`✅ Status: ${res.statusCode}\n\`\`\`json\n${json}\n\`\`\``);
    }
}

async function handleScan(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const filter = args[0] ? args[0].toLowerCase() : null;
    const msg = await message.reply('🕵️ Scanning...');

    const keywords = ['script', 'loader', 'file', 'product', 'app', 'user', 'service', 'key'];
    let targets = [];
    
    keywords.forEach(w => {
        targets.push(`/${w}`);
        targets.push(`/${w}s`); // Plural
        if (JNKIE_SERVICE_ID) targets.push(`/services/${JNKIE_SERVICE_ID}/${w}s`);
    });

    if (filter) targets = targets.filter(t => t.includes(filter));

    let found = [];
    for (const t of targets) {
        const res = await jnkieRequest('GET', t);
        if (res.statusCode !== 404) {
            found.push(`\`${t}\` (${res.statusCode})`);
        }
    }

    await msg.edit({
        embeds: [{
            title: '🕵️ Scan Results',
            description: found.join('\n') || '❌ No endpoints found',
            color: found.length > 0 ? 0x2ecc71 : 0xe74c3c
        }]
    });
}

// ================================================================
// OBFUSCATOR
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
            await msg.edit('❌ Failed');
        }
    } catch (err) {
        message.reply(`❌ Error: ${err.message}`);
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
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

function cleanLuaCode(code) { return code.replace(/^\uFEFF/, '').trim(); }
function cleanupFiles(...files) { files.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} }); }

async function handleHelp(message) {
    message.reply('Commands:\n`!obf [preset]`\n`!service list`\n`!key list`\n`!scan`\n`!api [GET/POST] [endpoint]`');
}

async function handleStatus(message) {
    message.reply('✅ Bot Online');
}

async function handleDebug(message) {
    await handleApiTest(message, ['GET', '/services']);
}

async function handlePresets(message) {
    message.reply('Presets: 🟢 minify, 🔵 weak, 🟡 medium');
}

client.login(TOKEN);
