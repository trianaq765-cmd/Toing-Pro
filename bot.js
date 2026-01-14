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

const HEADER = `-- This file was protected using Prometheus Obfuscator [https://discord.gg/QarfX8ua2]

`;

const PRESETS = {
    minify: {
        name: 'Minify',
        value: 'Minify',
        emoji: '🟢'
    },
    weak: {
        name: 'Weak',
        value: 'Weak',
        emoji: '🔵'
    },
    medium: {
        name: 'Medium',
        value: 'Medium',
        emoji: '🟡'
    },
    strong: {
        name: 'Strong',
        value: 'Strong',
        emoji: '🟠'
    },
    vm: {
        name: 'Virtual Machine',
        value: 'Vm',
        emoji: '🔴'
    },
    max: {
        name: 'Maximum',
        value: 'Max',
        emoji: '💀',
        custom: true,
        steps: ['Strong', 'Vm']
    },
    custom: {
        name: 'Custom (Roblox)',
        value: 'Custom',
        emoji: '⚡',
        custom: true,
        steps: ['Minify', 'Weak', 'Medium', 'Strong']
    }
};

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} online`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase().trim();

    try {
        if (message.content.startsWith('!obf')) {
            await handleObfuscate(message);
        } else if (content === '!help') {
            await handleHelp(message);
        } else if (content === '!presets') {
            await handlePresets(message);
        } else if (content === '!test') {
            await handleTest(message);
        } else if (content === '!example') {
            await handleExample(message);
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
                title: '📌 Cara Menggunakan',
                fields: [
                    {
                        name: 'Format',
                        value: '`!obf [preset]` + attach file'
                    },
                    {
                        name: 'Presets',
                        value: 
                            '🟢 `minify` 🔵 `weak` 🟡 `medium`\n' +
                            '🟠 `strong` 🔴 `vm` 💀 `max`\n' +
                            '⚡ `custom` (Roblox)'
                    }
                ]
            }]
        });
    }

    const attachment = message.attachments.first();

    const validExtensions = ['.lua', '.txt'];
    const hasValidExt = validExtensions.some(ext => attachment.name.toLowerCase().endsWith(ext));
    
    if (!hasValidExt) {
        return message.reply({
            embeds: [{
                color: 0xe74c3c,
                title: '❌ Format Salah',
                description: 'File harus `.lua` atau `.txt`'
            }]
        });
    }

    if (attachment.size > 5 * 1024 * 1024) {
        return message.reply({
            embeds: [{
                color: 0xe74c3c,
                title: '❌ File Terlalu Besar',
                description: 'Max 5MB'
            }]
        });
    }

    const args = message.content.split(/\s+/).slice(1);
    const presetKey = args[0]?.toLowerCase() || 'minify';
    const preset = PRESETS[presetKey] || PRESETS.minify;

    const timestamp = Date.now();
    const inputPath = path.join(PROMETHEUS_PATH, `temp_${timestamp}_input.lua`);
    const outputPath = path.join(PROMETHEUS_PATH, `temp_${timestamp}_output.lua`);
    const tempPaths = [];

    for (let i = 0; i < 5; i++) {
        tempPaths.push(path.join(PROMETHEUS_PATH, `temp_${timestamp}_step${i}.lua`));
    }

    let statusMsg;

    try {
        const luaCode = await downloadFile(attachment.url);
        
        if (!luaCode || luaCode.length < 5) {
            return message.reply({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ File Kosong'
                }]
            });
        }

        const cleanedCode = cleanLuaCode(luaCode);
        fs.writeFileSync(inputPath, cleanedCode, 'utf8');

        statusMsg = await message.reply({
            embeds: [{
                color: 0xf39c12,
                title: `${preset.emoji} Processing...`,
                description: `Preset: **${preset.name}**`,
                fields: [
                    { name: 'File', value: attachment.name, inline: true },
                    { name: 'Size', value: `${(cleanedCode.length / 1024).toFixed(2)} KB`, inline: true }
                ]
            }]
        });

        let success = false;
        let usedPreset = preset.name;
        let errorOutput = '';

        if (preset.custom && preset.steps) {
            try {
                let currentInput = inputPath;
                let currentOutput;
                
                for (let i = 0; i < preset.steps.length; i++) {
                    const step = preset.steps[i];
                    currentOutput = (i === preset.steps.length - 1) ? outputPath : tempPaths[i];
                    
                    await statusMsg.edit({
                        embeds: [{
                            color: 0xf39c12,
                            title: `${preset.emoji} Processing...`,
                            description: `Step ${i + 1}/${preset.steps.length}: **${step}**`
                        }]
                    });

                    const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${step} "${currentInput}" --out "${currentOutput}" 2>&1`;
                    await execAsync(command, { timeout: 120000 });

                    if (!fs.existsSync(currentOutput) || fs.statSync(currentOutput).size === 0) {
                        throw new Error(`Step ${step} failed`);
                    }

                    currentInput = currentOutput;
                }

                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                    success = true;
                }
            } catch (err) {
                errorOutput = err.message;
            }

            if (!success) {
                try {
                    cleanupFiles(outputPath);
                    const fallback = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset Strong "${inputPath}" --out "${outputPath}" 2>&1`;
                    await execAsync(fallback, { timeout: 120000 });

                    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                        success = true;
                        usedPreset = 'Strong (Fallback)';
                    }
                } catch (err) {
                    errorOutput = err.message || errorOutput;
                }
            }
        } else {
            try {
                const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset.value} "${inputPath}" --out "${outputPath}" 2>&1`;
                const { stdout, stderr } = await execAsync(command, { timeout: 120000 });

                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                    success = true;
                } else {
                    errorOutput = stdout || stderr || 'No output';
                }
            } catch (err) {
                errorOutput = err.stderr || err.message;
            }

            if (!success) {
                try {
                    cleanupFiles(outputPath);
                    const fallback = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua "${inputPath}" --out "${outputPath}" 2>&1`;
                    const { stdout, stderr } = await execAsync(fallback, { timeout: 120000 });

                    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                        success = true;
                        usedPreset = 'Default';
                    } else {
                        errorOutput = stdout || stderr || errorOutput;
                    }
                } catch (err) {
                    errorOutput = err.message || errorOutput;
                }
            }
        }

        if (success) {
            const originalSize = Buffer.byteLength(cleanedCode, 'utf8');
            const obfuscatedCode = fs.readFileSync(outputPath, 'utf8');
            const finalCode = HEADER + obfuscatedCode;
            const obfuscatedSize = Buffer.byteLength(finalCode, 'utf8');
            const ratio = ((obfuscatedSize / originalSize) * 100).toFixed(0);

            const buffer = Buffer.from(finalCode, 'utf8');
            const outputFile = new AttachmentBuilder(buffer, {
                name: `obfuscated_${attachment.name.replace('.txt', '.lua')}`
            });

            await statusMsg.edit({
                embeds: [{
                    color: 0x2ecc71,
                    title: `${preset.emoji} Berhasil`,
                    fields: [
                        { name: 'Original', value: `${(originalSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Obfuscated', value: `${(obfuscatedSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Ratio', value: `${ratio}%`, inline: true },
                        { name: 'Preset', value: usedPreset, inline: true }
                    ],
                    timestamp: new Date()
                }],
                files: [outputFile]
            });
        } else {
            await statusMsg.edit({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ Gagal',
                    description: `\`\`\`${errorOutput.substring(0, 500)}\`\`\``
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
        cleanupFiles(inputPath, outputPath, ...tempPaths);
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
                    value: 
                        '`!obf [preset]` - Obfuscate file\n' +
                        '`!presets` - Lihat presets\n' +
                        '`!test` - Test bot\n' +
                        '`!example` - Contoh script'
                },
                {
                    name: 'Presets',
                    value: 
                        '🟢 `minify` 🔵 `weak` 🟡 `medium`\n' +
                        '🟠 `strong` 🔴 `vm` 💀 `max`\n' +
                        '⚡ `custom` (Roblox)'
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
                {
                    name: '🟢 Minify',
                    value: 'Perkecil ukuran saja'
                },
                {
                    name: '🔵 Weak',
                    value: 'Rename variables'
                },
                {
                    name: '🟡 Medium',
                    value: 'String encryption + control flow'
                },
                {
                    name: '🟠 Strong',
                    value: 'Multiple layers + anti-debug'
                },
                {
                    name: '🔴 VM',
                    value: 'Virtual Machine protection'
                },
                {
                    name: '💀 Max',
                    value: 'Strong + VM'
                },
                {
                    name: '⚡ Custom (Roblox)',
                    value: 'Minify → Weak → Medium → Strong\n(Best untuk Roblox scripts)'
                }
            ]
        }]
    });
}

async function handleTest(message) {
    const testCode = 'print("test")\nlocal x=10\nif x>5 then print("ok") end';
    const timestamp = Date.now();
    const testPath = path.join(PROMETHEUS_PATH, `test_${timestamp}.lua`);
    const testOut = path.join(PROMETHEUS_PATH, `test_${timestamp}_out.lua`);

    try {
        fs.writeFileSync(testPath, testCode, 'utf8');
        
        const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset Minify "${testPath}" --out "${testOut}" 2>&1`;
        await execAsync(command, { timeout: 15000 });
        
        let status, color;

        if (fs.existsSync(testOut) && fs.statSync(testOut).size > 0) {
            status = '✅ Working';
            color = 0x2ecc71;
        } else {
            status = '❌ Failed';
            color = 0xe74c3c;
        }

        await message.reply({
            embeds: [{
                color: color,
                title: '🧪 Test',
                description: status
            }]
        });

    } catch (err) {
        await message.reply({
            embeds: [{
                color: 0xe74c3c,
                title: '❌ Error',
                description: err.message
            }]
        });
    } finally {
        cleanupFiles(testPath, testOut);
    }
}

async function handleExample(message) {
    const example = `local Players = game:GetService("Players")
local player = Players.LocalPlayer

local function greet(name)
    print("Hello, " .. name)
end

greet(player.Name)

for i = 1, 10 do
    print(i)
end

local data = {
    name = "Test",
    value = 100
}

print(data.name)`;

    const buffer = Buffer.from(example, 'utf8');
    const file = new AttachmentBuilder(buffer, { name: 'example.lua' });

    await message.reply({
        embeds: [{
            color: 0x2ecc71,
            title: '📝 Example',
            description: 'Download dan obfuscate dengan:\n`!obf custom`'
        }],
        files: [file]
    });
}

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const makeRequest = (targetUrl, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects'));
                return;
            }

            const urlObj = new URL(targetUrl);
            const protocol = urlObj.protocol === 'https:' ? https : http;

            const req = protocol.get(targetUrl, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    makeRequest(res.headers.location, redirectCount + 1);
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                res.on('error', reject);
            });

            req.on('error', reject);
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
        };

        makeRequest(url);
    });
}

function cleanLuaCode(code) {
    if (!code) return '';
    code = code.replace(/^\uFEFF/, '');
    code = code.replace(/^\xEF\xBB\xBF/, '');
    code = code.replace(/\r\n/g, '\n');
    code = code.replace(/\r/g, '\n');
    code = code.replace(/\x00/g, '');
    code = code.trim();
    while (code.length > 0 && code.charCodeAt(0) < 32) {
        code = code.substring(1);
    }
    return code;
}

function cleanupFiles(...files) {
    for (const file of files) {
        try {
            if (file && fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        } catch (err) {}
    }
}

client.on('error', () => {});
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

client.login(TOKEN);
