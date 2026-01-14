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
const PROMETHEUS_PATH = process.env.PROMETHEUS_PATH || '/app/Prometheus-master';

if (!TOKEN) {
    console.error('TOKEN NOT FOUND');
    process.exit(1);
}

const HEADER = `-- This file was protected using Prometheus Obfuscator [https://discord.gg/QarfX8ua2]\n\n`;

const PRESETS = {
    minify: { value: 'Minify', emoji: '🟢', desc: 'Perkecil ukuran' },
    weak: { value: 'Weak', emoji: '🔵', desc: 'Variable rename' },
    medium: { value: 'Medium', emoji: '🟡', desc: 'Encryption + Control flow (Max)' }
};

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} online`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase().trim();
    
    try {
        if (content.startsWith('!obf')) {
            await handleObfuscate(message);
        } else if (content === '!presets') {
            await handlePresets(message);
        } else if (content === '!help') {
            await handleHelp(message);
        }
    } catch (err) {
        console.error(err);
    }
});

async function handleObfuscate(message) {
    if (message.attachments.size === 0) {
        return message.reply({
            embeds: [{
                color: 0x3498db,
                title: '📌 Cara Pakai',
                description: '`!obf [preset]` + attach file',
                fields: [{
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
