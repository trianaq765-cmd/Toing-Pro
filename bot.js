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
const IRONBREW_PATH = process.env.IRONBREW_PATH || '/app/ironbrew';

if (!TOKEN) {
    console.error('TOKEN NOT FOUND');
    process.exit(1);
}

const HEADER_PROM = `-- This file was protected using Prometheus Obfuscator [https://discord.gg/QarfX8ua2]\n\n`;
const HEADER_IRON = `-- This file was protected using IronBrew Obfuscator [https://discord.gg/QarfX8ua2]\n\n`;

const PRESETS = {
    minify: { value: 'Minify', emoji: '🟢' },
    weak: { value: 'Weak', emoji: '🔵' },
    medium: { value: 'Medium', emoji: '🟡' }
};

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} online`);
    console.log(`Prometheus: ${PROMETHEUS_PATH}`);
    console.log(`IronBrew: ${IRONBREW_PATH}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase().trim();

    try {
        if (content.startsWith('!obf')) {
            await handlePrometheus(message);
        } else if (content.startsWith('!iron')) {
            await handleIronBrew(message);
        } else if (content === '!help') {
            await handleHelp(message);
        } else if (content === '!presets') {
            await handlePresets(message);
        } else if (content === '!status') {
            await handleStatus(message);
        }
    } catch (err) {
        console.error(err);
    }
});

// ========== PROMETHEUS HANDLER (STABLE) ==========
async function handlePrometheus(message) {
    if (message.attachments.size === 0) {
        return message.reply({
            embeds: [{
                color: 0x3498db,
                title: '📌 Prometheus - Cara Pakai',
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
                title: `${preset.emoji} Prometheus Processing...`,
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
            const finalCode = HEADER_PROM + obfuscatedCode;
            const obfuscatedSize = Buffer.byteLength(finalCode, 'utf8');
            const ratio = ((obfuscatedSize / originalSize) * 100).toFixed(0);

            const buffer = Buffer.from(finalCode, 'utf8');
            const file = new AttachmentBuilder(buffer, {
                name: `prometheus_${attachment.name.replace('.txt', '.lua')}`
            });

            await statusMsg.edit({
                embeds: [{
                    color: 0x2ecc71,
                    title: `${preset.emoji} Prometheus Berhasil`,
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
                    title: '❌ Prometheus Gagal',
                    description: `\`\`\`${(stdout || stderr || 'Unknown error').substring(0, 500)}\`\`\``
                }]
            });
        }

    } catch (err) {
        console.error('[Prometheus]', err);
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

// ========== IRONBREW HANDLER (EXPERIMENTAL) ==========
async function handleIronBrew(message) {
    if (message.attachments.size === 0) {
        return message.reply({
            embeds: [{
                color: 0xe67e22,
                title: '⚙️ IronBrew - Experimental',
                description: '`!iron` + attach file .lua',
                fields: [{
                    name: '⚠️ Warning',
                    value: 'IronBrew adalah fitur eksperimental.\nJika gagal, gunakan `!obf` (Prometheus).'
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

    const timestamp = Date.now();
    const inputPath = path.join(IRONBREW_PATH, `in_${timestamp}.lua`);
    const outputPath = path.join(IRONBREW_PATH, `out_${timestamp}.lua`);

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
                color: 0xe67e22,
                title: '⚙️ IronBrew Processing...',
                description: 'Experimental - Mohon tunggu...',
                fields: [
                    { name: 'File', value: attachment.name, inline: true }
                ]
            }]
        });

        // Coba beberapa kemungkinan command IronBrew
        let success = false;
        let errorOutput = '';
        let obfuscatedCode = '';

        // Method 1: dotnet run dengan project
        const commands = [
            `cd "${IRONBREW_PATH}" && dotnet run --project . -- "${inputPath}" -o "${outputPath}" 2>&1`,
            `cd "${IRONBREW_PATH}" && dotnet run -- "${inputPath}" "${outputPath}" 2>&1`,
            `cd "${IRONBREW_PATH}/bin/Release/net6.0" && dotnet IronBrew.dll "${inputPath}" "${outputPath}" 2>&1`,
            `cd "${IRONBREW_PATH}/bin/Release/net6.0" && ./IronBrew "${inputPath}" "${outputPath}" 2>&1`
        ];

        for (const cmd of commands) {
            try {
                console.log(`[IronBrew] Trying: ${cmd}`);
                const { stdout, stderr } = await execAsync(cmd, { timeout: 180000 });
                
                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                    obfuscatedCode = fs.readFileSync(outputPath, 'utf8');
                    success = true;
                    console.log('[IronBrew] Success!');
                    break;
                }
                errorOutput = stdout || stderr || errorOutput;
            } catch (err) {
                errorOutput = err.stderr || err.message || errorOutput;
                console.log(`[IronBrew] Failed: ${err.message}`);
            }
        }

        if (success && obfuscatedCode) {
            const originalSize = Buffer.byteLength(cleanedCode, 'utf8');
            const finalCode = HEADER_IRON + obfuscatedCode;
            const obfuscatedSize = Buffer.byteLength(finalCode, 'utf8');
            const ratio = ((obfuscatedSize / originalSize) * 100).toFixed(0);

            const buffer = Buffer.from(finalCode, 'utf8');
            const file = new AttachmentBuilder(buffer, {
                name: `ironbrew_${attachment.name.replace('.txt', '.lua')}`
            });

            await statusMsg.edit({
                embeds: [{
                    color: 0x2ecc71,
                    title: '⚙️ IronBrew Berhasil!',
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
                    title: '❌ IronBrew Gagal',
                    description: `\`\`\`${errorOutput.substring(0, 400)}\`\`\``,
                    fields: [{
                        name: '💡 Alternatif',
                        value: 'Gunakan `!obf medium` (Prometheus)'
                    }]
                }]
            });
        }

    } catch (err) {
        console.error('[IronBrew]', err);
        if (statusMsg) {
            await statusMsg.edit({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ IronBrew Error',
                    description: `\`${err.message}\``,
                    fields: [{
                        name: '💡 Alternatif',
                        value: 'Gunakan `!obf medium` (Prometheus)'
                    }]
                }]
            }).catch(() => {});
        }
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
}

// ========== OTHER HANDLERS ==========
async function handleHelp(message) {
    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '📖 Obfuscator Bot',
            fields: [
                {
                    name: '🔧 Prometheus (Stable)',
                    value: '`!obf [preset]` + attach file\nPresets: `minify` `weak` `medium`'
                },
                {
                    name: '⚙️ IronBrew (Experimental)',
                    value: '`!iron` + attach file'
                },
                {
                    name: '📋 Other Commands',
                    value: '`!presets` - Lihat presets\n`!status` - Cek status bot\n`!help` - Bantuan'
                }
            ]
        }]
    });
}

async function handlePresets(message) {
    await message.reply({
        embeds: [{
            color: 0x9b59b6,
            title: '🎨 Prometheus Presets',
            fields: [
                { name: '🟢 minify', value: 'Perkecil ukuran' },
                { name: '🔵 weak', value: 'Variable rename' },
                { name: '🟡 medium', value: 'Encryption + Control flow (Max)' }
            ]
        }]
    });
}

async function handleStatus(message) {
    let promStatus = '❓ Unknown';
    let ironStatus = '❓ Unknown';

    // Check Prometheus
    try {
        if (fs.existsSync(path.join(PROMETHEUS_PATH, 'cli.lua'))) {
            promStatus = '✅ Ready';
        } else {
            promStatus = '❌ Not Found';
        }
    } catch (e) {
        promStatus = '❌ Error';
    }

    // Check IronBrew
    try {
        const ironFiles = fs.existsSync(IRONBREW_PATH);
        if (ironFiles) {
            // Check if built
            const hasBin = fs.existsSync(path.join(IRONBREW_PATH, 'bin'));
            const hasCsproj = fs.readdirSync(IRONBREW_PATH).some(f => f.endsWith('.csproj'));
            
            if (hasBin) {
                ironStatus = '✅ Built';
            } else if (hasCsproj) {
                ironStatus = '⚠️ Not Built';
            } else {
                ironStatus = '❌ Invalid';
            }
        } else {
            ironStatus = '❌ Not Found';
        }
    } catch (e) {
        ironStatus = '❌ Error';
    }

    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '📊 Bot Status',
            fields: [
                { name: '🔧 Prometheus', value: promStatus, inline: true },
                { name: '⚙️ IronBrew', value: ironStatus, inline: true }
            ],
            timestamp: new Date()
        }]
    });
}

// ========== HELPER FUNCTIONS ==========
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
