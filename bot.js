const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ========== SERVER UNTUK RENDER ==========
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});

// ========== DISCORD CLIENT ==========
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ========== ENVIRONMENT VARIABLES ==========
const TOKEN = process.env.DISCORD_TOKEN;
const PROMETHEUS_PATH = process.env.PROMETHEUS_PATH || '/app/Prometheus-master';

if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN tidak ditemukan!');
    process.exit(1);
}

// ========== PROMETHEUS PRESETS ==========
const PRESETS = {
    // 🟢 Minify - Hanya memperkecil ukuran
    minify: {
        name: 'Minify',
        value: 'Minify',
        emoji: '🟢',
        description: 'Hanya memperkecil ukuran, hapus whitespace & comments'
    },
    
    // 🔵 Weak - Obfuscation ringan
    weak: {
        name: 'Weak',
        value: 'Weak',
        emoji: '🔵',
        description: 'Obfuscation ringan, rename variables'
    },
    
    // 🟡 Medium - Obfuscation sedang
    medium: {
        name: 'Medium',
        value: 'Medium',
        emoji: '🟡',
        description: 'Obfuscation sedang, string encryption + control flow'
    },
    
    // 🟠 Strong - Obfuscation kuat
    strong: {
        name: 'Strong',
        value: 'Strong',
        emoji: '🟠',
        description: 'Obfuscation kuat, multiple layers + anti-debug'
    },
    
    // 🔴 VM - Virtual Machine (Terkuat)
    vm: {
        name: 'Virtual Machine',
        value: 'Vm',
        emoji: '🔴',
        description: 'Convert ke bytecode + VM, sangat sulit di-reverse'
    }
};

// ========== DISCORD EVENTS ==========

client.on('ready', () => {
    console.log(`✅ Bot ${client.user.tag} sudah online!`);
    console.log(`📁 Prometheus Path: ${PROMETHEUS_PATH}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase().trim();

    try {
        if (message.content.startsWith('!obfuscate')) {
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
        console.error('[Command Error]', err);
        await message.reply({
            embeds: [{
                color: 0xe74c3c,
                title: '❌ Error',
                description: `\`${err.message}\``
            }]
        }).catch(() => {});
    }
});

// ========== OBFUSCATE HANDLER ==========

async function handleObfuscate(message) {
    // Check attachment
    if (message.attachments.size === 0) {
        return message.reply({
            embeds: [{
                color: 0x3498db,
                title: '📌 Cara Menggunakan',
                description: 'Kirim file `.lua` bersama dengan command!',
                fields: [
                    {
                        name: '💡 Format',
                        value: '```\n!obfuscate [preset] + attach file.lua\n```'
                    },
                    {
                        name: '🎨 Presets',
                        value: 
                            '🟢 `minify` - Perkecil ukuran saja\n' +
                            '🔵 `weak` - Obfuscation ringan\n' +
                            '🟡 `medium` - Obfuscation sedang\n' +
                            '🟠 `strong` - Obfuscation kuat\n' +
                            '🔴 `vm` - Virtual Machine (terkuat)'
                    },
                    {
                        name: '📝 Contoh',
                        value: 
                            '`!obfuscate` (default: minify)\n' +
                            '`!obfuscate strong`\n' +
                            '`!obfuscate vm`'
                    }
                ],
                footer: { text: 'Gunakan !presets untuk info detail' }
            }]
        });
    }

    const attachment = message.attachments.first();

    // Validate file extension
    const validExtensions = ['.lua', '.txt'];
    const hasValidExt = validExtensions.some(ext => attachment.name.toLowerCase().endsWith(ext));
    
    if (!hasValidExt) {
        return message.reply({
            embeds: [{
                color: 0xe74c3c,
                title: '❌ Format Salah',
                description: 'File harus berformat `.lua` atau `.txt`!'
            }]
        });
    }

    // Validate file size (max 5MB)
    if (attachment.size > 5 * 1024 * 1024) {
        return message.reply({
            embeds: [{
                color: 0xe74c3c,
                title: '❌ File Terlalu Besar',
                description: 'Maksimal ukuran file: **5MB**'
            }]
        });
    }

    // Parse preset
    const args = message.content.split(/\s+/).slice(1);
    const presetKey = args[0]?.toLowerCase() || 'minify';
    const preset = PRESETS[presetKey] || PRESETS.minify;

    const timestamp = Date.now();
    const inputPath = path.join(PROMETHEUS_PATH, `temp_${timestamp}_input.lua`);
    const outputPath = path.join(PROMETHEUS_PATH, `temp_${timestamp}_output.lua`);

    let statusMsg;

    try {
        // Download file
        console.log(`[Obfuscate] Downloading: ${attachment.name}`);
        const luaCode = await downloadFile(attachment.url);
        
        if (!luaCode || luaCode.length < 5) {
            return message.reply({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ File Kosong',
                    description: 'File Lua tidak boleh kosong!'
                }]
            });
        }

        const cleanedCode = cleanLuaCode(luaCode);
        
        // Save input file
        fs.writeFileSync(inputPath, cleanedCode, 'utf8');
        console.log(`[Obfuscate] Saved: ${inputPath} (${cleanedCode.length} bytes)`);

        // Send status message
        statusMsg = await message.reply({
            embeds: [{
                color: 0xf39c12,
                title: `${preset.emoji} Processing...`,
                description: `Obfuscating dengan preset: **${preset.name}**`,
                fields: [
                    { name: '📄 File', value: attachment.name, inline: true },
                    { name: '📊 Size', value: `${(cleanedCode.length / 1024).toFixed(2)} KB`, inline: true },
                    { name: '🎨 Preset', value: preset.name, inline: true }
                ],
                footer: { text: 'Mohon tunggu...' }
            }]
        });

        // Run Prometheus
        let success = false;
        let usedPreset = preset.name;
        let errorOutput = '';

        // Try with selected preset
        try {
            const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset.value} "${inputPath}" --out "${outputPath}" 2>&1`;
            console.log(`[Prometheus] Command: ${command}`);
            
            const { stdout, stderr } = await execAsync(command, { timeout: 120000 });
            
            if (stdout) console.log(`[Prometheus] stdout: ${stdout}`);
            if (stderr) console.log(`[Prometheus] stderr: ${stderr}`);

            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                success = true;
            } else {
                errorOutput = stdout || stderr || 'No output generated';
            }
        } catch (err) {
            console.log(`[Prometheus] Error:`, err.message);
            errorOutput = err.stderr || err.stdout || err.message;
        }

        // Fallback to default if failed
        if (!success) {
            console.log('[Prometheus] Trying fallback...');
            try {
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                
                const fallbackCommand = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua "${inputPath}" --out "${outputPath}" 2>&1`;
                const { stdout, stderr } = await execAsync(fallbackCommand, { timeout: 120000 });

                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                    success = true;
                    usedPreset = 'Default';
                } else {
                    errorOutput = stdout || stderr || errorOutput;
                }
            } catch (err) {
                errorOutput = err.stderr || err.stdout || err.message || errorOutput;
            }
        }

        // Send result
        if (success) {
            const originalSize = Buffer.byteLength(cleanedCode, 'utf8');
            const obfuscatedSize = fs.statSync(outputPath).size;
            const ratio = ((obfuscatedSize / originalSize) * 100).toFixed(0);

            const outputFile = new AttachmentBuilder(outputPath, {
                name: `obfuscated_${attachment.name.replace('.txt', '.lua')}`
            });

            await statusMsg.edit({
                embeds: [{
                    color: 0x2ecc71,
                    title: `${preset.emoji} Obfuscation Berhasil!`,
                    fields: [
                        { name: '📄 Original', value: `${(originalSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: '🔒 Obfuscated', value: `${(obfuscatedSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: '📊 Ratio', value: `${ratio}%`, inline: true },
                        { name: '🎨 Preset', value: usedPreset, inline: true }
                    ],
                    footer: { text: 'Prometheus Obfuscator' },
                    timestamp: new Date()
                }],
                files: [outputFile]
            });
        } else {
            await statusMsg.edit({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ Obfuscation Gagal',
                    description: `\`\`\`${errorOutput.substring(0, 800)}\`\`\``,
                    fields: [
                        { 
                            name: '💡 Kemungkinan Penyebab', 
                            value: 
                                '• Script memiliki syntax error\n' +
                                '• Gunakan preset yang lebih ringan\n' +
                                '• Cek script di Roblox Studio dulu'
                        }
                    ]
                }]
            });
        }

    } catch (err) {
        console.error('[Obfuscate] Error:', err);
        
        const errorEmbed = {
            color: 0xe74c3c,
            title: '❌ Error',
            description: `\`${err.message}\``
        };
        
        if (statusMsg) {
            await statusMsg.edit({ embeds: [errorEmbed] }).catch(() => {});
        } else {
            await message.reply({ embeds: [errorEmbed] }).catch(() => {});
        }
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
}

// ========== HELP HANDLER ==========

async function handleHelp(message) {
    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '📖 Prometheus Obfuscator Bot',
            description: 'Bot untuk obfuscate script Lua/Roblox menggunakan Prometheus',
            fields: [
                {
                    name: '📌 Commands',
                    value: 
                        '`!obfuscate [preset]` - Obfuscate file Lua\n' +
                        '`!presets` - Lihat detail semua preset\n' +
                        '`!test` - Test apakah bot berfungsi\n' +
                        '`!example` - Download contoh script\n' +
                        '`!help` - Tampilkan bantuan ini'
                },
                {
                    name: '🎨 Presets',
                    value: 
                        '🟢 `minify` - Perkecil ukuran\n' +
                        '🔵 `weak` - Ringan\n' +
                        '🟡 `medium` - Sedang\n' +
                        '🟠 `strong` - Kuat\n' +
                        '🔴 `vm` - Virtual Machine'
                },
                {
                    name: '💡 Contoh Penggunaan',
                    value: 
                        '```\n' +
                        '!obfuscate\n' +
                        '!obfuscate strong\n' +
                        '!obfuscate vm\n' +
                        '```\n' +
                        '+ attach file .lua'
                }
            ],
            footer: { text: 'Max file size: 5MB | Format: .lua, .txt' }
        }]
    });
}

// ========== PRESETS HANDLER ==========

async function handlePresets(message) {
    await message.reply({
        embeds: [{
            color: 0x9b59b6,
            title: '🎨 Prometheus Presets',
            description: 'Pilih preset sesuai kebutuhan proteksi script Anda:',
            fields: [
                {
                    name: '🟢 Minify',
                    value: 
                        '**Command:** `!obfuscate minify`\n' +
                        '• Hanya memperkecil ukuran file\n' +
                        '• Hapus whitespace & comments\n' +
                        '• Output paling kecil\n' +
                        '• **Cocok untuk:** Script publik'
                },
                {
                    name: '🔵 Weak',
                    value: 
                        '**Command:** `!obfuscate weak`\n' +
                        '• Rename semua variables\n' +
                        '• Obfuscation dasar\n' +
                        '• Mudah di-reverse\n' +
                        '• **Cocok untuk:** Testing'
                },
                {
                    name: '🟡 Medium',
                    value: 
                        '**Command:** `!obfuscate medium`\n' +
                        '• String encryption\n' +
                        '• Control flow changes\n' +
                        '• Lebih sulit dibaca\n' +
                        '• **Cocok untuk:** Script umum'
                },
                {
                    name: '🟠 Strong',
                    value: 
                        '**Command:** `!obfuscate strong`\n' +
                        '• Multiple layers encryption\n' +
                        '• Anti-debug features\n' +
                        '• Sulit di-reverse\n' +
                        '• **Cocok untuk:** Script penting'
                },
                {
                    name: '🔴 Virtual Machine (VM)',
                    value: 
                        '**Command:** `!obfuscate vm`\n' +
                        '• Convert ke bytecode\n' +
                        '• Custom Virtual Machine\n' +
                        '• Sangat sulit di-reverse\n' +
                        '• Output lebih besar\n' +
                        '• **Cocok untuk:** Script premium/berbayar'
                }
            ],
            footer: { text: 'Default preset: minify' }
        }]
    });
}

// ========== TEST HANDLER ==========

async function handleTest(message) {
    const statusMsg = await message.reply({
        embeds: [{
            color: 0xf39c12,
            title: '⏳ Testing Prometheus...',
            description: 'Mohon tunggu...'
        }]
    });

    const testCode = 'print("Hello World")\nlocal x = 10\nif x > 5 then print("OK") end';
    const timestamp = Date.now();
    const testPath = path.join(PROMETHEUS_PATH, `test_${timestamp}.lua`);
    const testOut = path.join(PROMETHEUS_PATH, `test_${timestamp}_out.lua`);

    try {
        fs.writeFileSync(testPath, testCode, 'utf8');
        
        const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset Minify "${testPath}" --out "${testOut}" 2>&1`;
        const { stdout, stderr } = await execAsync(command, { timeout: 15000 });
        
        let status, color, output;

        if (fs.existsSync(testOut) && fs.statSync(testOut).size > 0) {
            status = '✅ Prometheus Berfungsi!';
            color = 0x2ecc71;
            output = fs.readFileSync(testOut, 'utf8').substring(0, 300);
        } else {
            status = '❌ Prometheus Gagal';
            color = 0xe74c3c;
            output = stdout || stderr || 'No output';
        }

        await statusMsg.edit({
            embeds: [{
                color: color,
                title: '🧪 Test Result',
                fields: [
                    { name: 'Status', value: status },
                    { name: '📥 Input', value: `\`\`\`lua\n${testCode}\n\`\`\`` },
                    { name: '📤 Output', value: `\`\`\`lua\n${output}\n\`\`\`` }
                ],
                timestamp: new Date()
            }]
        });

    } catch (err) {
        await statusMsg.edit({
            embeds: [{
                color: 0xe74c3c,
                title: '❌ Test Gagal',
                description: `\`\`\`${err.message}\`\`\``
            }]
        });
    } finally {
        cleanupFiles(testPath, testOut);
    }
}

// ========== EXAMPLE HANDLER ==========

async function handleExample(message) {
    const example = `-- ==============================
-- Contoh Script Roblox
-- Cocok untuk test obfuscation
-- ==============================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Variables
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- Function sederhana
local function greet(name)
    print("Hello, " .. name .. "!")
    return true
end

-- Function dengan logic
local function calculateDamage(baseDamage, multiplier)
    local finalDamage = baseDamage * multiplier
    if finalDamage > 100 then
        finalDamage = 100
    end
    return finalDamage
end

-- Panggil functions
greet(player.Name)
local damage = calculateDamage(25, 3)
print("Damage: " .. damage)

-- Loop example
for i = 1, 10 do
    print("Count: " .. i)
    wait(0.1)
end

-- Table example
local playerData = {
    name = player.Name,
    level = 1,
    exp = 0,
    coins = 100,
    inventory = {}
}

-- Event example
Players.PlayerAdded:Connect(function(newPlayer)
    print(newPlayer.Name .. " joined the game!")
end)

print("Script loaded successfully!")`;

    const buffer = Buffer.from(example, 'utf8');
    const file = new AttachmentBuilder(buffer, { name: 'example_script.lua' });

    await message.reply({
        embeds: [{
            color: 0x2ecc71,
            title: '📝 Contoh Script Roblox',
            description: 'Download file ini dan coba obfuscate!',
            fields: [
                {
                    name: '💡 Cara Menggunakan',
                    value: 
                        '1. Download file dibawah\n' +
                        '2. Upload kembali dengan command:\n' +
                        '```\n' +
                        '!obfuscate minify\n' +
                        '!obfuscate strong\n' +
                        '!obfuscate vm\n' +
                        '```'
                },
                {
                    name: '🎯 Rekomendasi Preset',
                    value: 
                        '• Script kecil → `minify`\n' +
                        '• Script biasa → `medium`\n' +
                        '• Script penting → `strong`\n' +
                        '• Script premium → `vm`'
                }
            ]
        }],
        files: [file]
    });
}

// ========== HELPER FUNCTIONS ==========

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        console.log('[Download] URL:', url.substring(0, 80) + '...');
        
        const makeRequest = (targetUrl, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects'));
                return;
            }

            const urlObj = new URL(targetUrl);
            const protocol = urlObj.protocol === 'https:' ? https : http;

            const req = protocol.get(targetUrl, (res) => {
                // Handle redirects
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
                res.on('end', () => {
                    const data = Buffer.concat(chunks).toString('utf8');
                    console.log('[Download] Success:', data.length, 'bytes');
                    resolve(data);
                });
                res.on('error', reject);
            });

            req.on('error', reject);
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Download timeout'));
            });
        };

        makeRequest(url);
    });
}

function cleanLuaCode(code) {
    if (!code) return '';
    
    // Remove BOM
    code = code.replace(/^\uFEFF/, '');
    code = code.replace(/^\xEF\xBB\xBF/, '');
    
    // Normalize line endings
    code = code.replace(/\r\n/g, '\n');
    code = code.replace(/\r/g, '\n');
    
    // Remove null bytes
    code = code.replace(/\x00/g, '');
    
    // Trim
    code = code.trim();
    
    // Remove weird starting characters
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
                console.log('[Cleanup] Deleted:', file);
            }
        } catch (err) {
            console.error('[Cleanup] Error:', err.message);
        }
    }
}

// ========== ERROR HANDLING ==========

client.on('error', (error) => {
    console.error('[Discord Error]', error);
});

process.on('unhandledRejection', (error) => {
    console.error('[Unhandled Rejection]', error);
});

process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', error);
});

// ========== LOGIN ==========

console.log('🚀 Starting Prometheus Bot...');
client.login(TOKEN).then(() => {
    console.log('✅ Login successful!');
}).catch((err) => {
    console.error('❌ Login failed:', err.message);
    process.exit(1);
});
