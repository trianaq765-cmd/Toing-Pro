const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Dummy server untuk Render
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

// Validasi TOKEN sebelum login
if (!TOKEN) {
    console.error('❌ ERROR: DISCORD_TOKEN tidak ditemukan di environment variables!');
    process.exit(1);
}

const PRESETS = {
    minify: 'Minify',
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong',
    vm: 'Vm'
};

// Path Prometheus - bisa diubah sesuai environment
const PROMETHEUS_PATH = process.env.PROMETHEUS_PATH || '/app/Prometheus-master';

client.on('ready', () => {
    console.log(`✅ Bot ${client.user.tag} sudah online!`);
    console.log(`📁 Prometheus path: ${PROMETHEUS_PATH}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Command: !obfuscate [preset]
    if (message.content.startsWith('!obfuscate')) {
        await handleObfuscate(message);
    }

    // Command: !example
    if (message.content === '!example') {
        await handleExample(message);
    }

    // Command: !test
    if (message.content === '!test') {
        await handleTest(message);
    }

    // Command: !help
    if (message.content === '!help') {
        await handleHelp(message);
    }

    // Command: !presets
    if (message.content === '!presets') {
        await handlePresets(message);
    }
});

// ========== HANDLER FUNCTIONS ==========

async function handleObfuscate(message) {
    if (message.attachments.size === 0) {
        return message.reply({
            embeds: [{
                color: 0xff0000,
                title: '❌ File Tidak Ditemukan',
                description: 'Kirim file `.lua` untuk di-obfuscate!',
                fields: [
                    {
                        name: 'Cara Pakai:',
                        value: '`!obfuscate [preset]` + attach file.lua'
                    },
                    {
                        name: 'Presets:',
                        value: '`minify`, `weak`, `medium`, `strong`, `vm`\nDefault: `minify`'
                    }
                ]
            }]
        });
    }

    const attachment = message.attachments.first();

    if (!attachment.name.endsWith('.lua')) {
        return message.reply({
            embeds: [{
                color: 0xff0000,
                title: '❌ Format File Salah',
                description: 'File harus berformat `.lua`!'
            }]
        });
    }

    if (attachment.size > 5 * 1024 * 1024) {
        return message.reply({
            embeds: [{
                color: 0xff0000,
                title: '❌ File Terlalu Besar',
                description: 'Maksimal ukuran file: 5MB'
            }]
        });
    }

    const args = message.content.split(' ');
    const presetName = args[1]?.toLowerCase() || 'minify';
    const preset = PRESETS[presetName] || 'Minify';

    const timestamp = Date.now();
    const inputPath = path.join(PROMETHEUS_PATH, `temp_${timestamp}_input.lua`);
    const outputPath = path.join(PROMETHEUS_PATH, `temp_${timestamp}_output.lua`);

    let statusMsg;

    try {
        // Status: Downloading
        statusMsg = await message.reply({
            embeds: [{
                color: 0xffff00,
                title: '⏳ Processing',
                description: 'Downloading file...',
                fields: [
                    { name: 'File', value: attachment.name, inline: true },
                    { name: 'Size', value: `${(attachment.size / 1024).toFixed(2)} KB`, inline: true },
                    { name: 'Preset', value: preset, inline: true }
                ]
            }]
        });

        // Download file
        const response = await fetch(attachment.url);
        
        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status}`);
        }

        let luaCode = await response.text();

        // Clean encoding issues
        luaCode = cleanLuaCode(luaCode);

        // Save input file
        fs.writeFileSync(inputPath, luaCode, 'utf8');

        // Status: Obfuscating
        await statusMsg.edit({
            embeds: [{
                color: 0xffff00,
                title: '⏳ Processing',
                description: `Obfuscating with preset: **${preset}**...\n\n` +
                    `> ℹ️ Langsung proses tanpa validasi syntax\n` +
                    `> ✅ Support Roblox Luau 2025`
            }]
        });

        // Run Prometheus - TANPA VALIDASI loadfile()!
        let success = false;
        let usedPreset = preset;
        let errorOutput = '';

        // Try dengan preset yang dipilih
        try {
            const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset} "${inputPath}" --out "${outputPath}" 2>&1`;
            const { stdout, stderr } = await execAsync(command, { timeout: 60000 });
            
            console.log(`[Prometheus] stdout: ${stdout}`);
            if (stderr) console.log(`[Prometheus] stderr: ${stderr}`);

            if (fs.existsSync(outputPath)) {
                success = true;
            } else {
                errorOutput = stdout || stderr || 'Unknown error';
            }
        } catch (err) {
            console.log(`[Prometheus] Preset ${preset} failed:`, err.message);
            errorOutput = err.message;
        }

        // Fallback ke tanpa preset jika gagal
        if (!success) {
            try {
                const fallbackCommand = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua "${inputPath}" --out "${outputPath}" 2>&1`;
                const { stdout, stderr } = await execAsync(fallbackCommand, { timeout: 60000 });
                
                if (fs.existsSync(outputPath)) {
                    success = true;
                    usedPreset = 'Default';
                } else {
                    errorOutput = stdout || stderr || errorOutput;
                }
            } catch (err) {
                errorOutput = err.message;
            }
        }

        // Handle result
        if (success && fs.existsSync(outputPath)) {
            const originalSize = fs.statSync(inputPath).size;
            const obfuscatedSize = fs.statSync(outputPath).size;

            const obfuscatedFile = new AttachmentBuilder(outputPath, {
                name: `obfuscated_${attachment.name}`
            });

            await statusMsg.edit({
                embeds: [{
                    color: 0x00ff00,
                    title: '✅ Obfuscation Berhasil!',
                    fields: [
                        { name: 'Original Size', value: `${(originalSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Obfuscated Size', value: `${(obfuscatedSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Preset Used', value: usedPreset, inline: true }
                    ],
                    footer: {
                        text: 'Prometheus Obfuscator | Support Roblox Luau 2025'
                    },
                    timestamp: new Date()
                }],
                files: [obfuscatedFile]
            });
        } else {
            // Obfuscation failed
            await statusMsg.edit({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ Obfuscation Failed',
                    description: 'Prometheus tidak dapat memproses file ini.',
                    fields: [
                        {
                            name: 'Error:',
                            value: `\`\`\`${errorOutput.substring(0, 900)}\`\`\``
                        },
                        {
                            name: '💡 Kemungkinan Penyebab:',
                            value: '• Syntax error dalam script\n' +
                                   '• Script terlalu kompleks\n' +
                                   '• Gunakan syntax Lua/Luau yang valid'
                        }
                    ]
                }]
            });
        }

    } catch (err) {
        console.error('[Obfuscate] Error:', err);
        
        const errorEmbed = {
            color: 0xff0000,
            title: '❌ Error',
            description: err.message
        };

        if (statusMsg) {
            await statusMsg.edit({ embeds: [errorEmbed] });
        } else {
            await message.reply({ embeds: [errorEmbed] });
        }
    } finally {
        // Cleanup files
        cleanupFiles(inputPath, outputPath);
    }
}

async function handleExample(message) {
    const examples = `-- =============================================
-- CONTOH SCRIPT ROBLOX YANG BISA DI-OBFUSCATE
-- =============================================

-- ✅ CONTOH 1: Print Sederhana
print("Hello World")

-- ✅ CONTOH 2: Variables
local name = "Player"
local health = 100
print(name .. " has " .. health .. " HP")

-- ✅ CONTOH 3: If Statement
local x = 10
if x > 5 then
    print("X lebih besar dari 5")
end

-- ✅ CONTOH 4: Function
local function greet(playerName)
    return "Hello, " .. playerName
end
print(greet("World"))

-- ✅ CONTOH 5: Loop
for i = 1, 5 do
    print("Loop ke-" .. i)
end

-- ✅ CONTOH 6: Table
local player = {
    name = "John",
    level = 50,
    health = 100
}
print(player.name)

-- ✅ CONTOH 7: While Loop
local count = 0
while count < 3 do
    print("Count: " .. count)
    count = count + 1
end

-- ✅ CONTOH 8: Nested Functions
local function outer()
    local function inner()
        return "Inner function"
    end
    return inner()
end
print(outer())

-- ✅ CONTOH 9: Roblox-style (akan diproses langsung oleh Prometheus)
local Players = game:GetService("Players")
local player = Players.LocalPlayer

local function onPlayerJoin(plr)
    print(plr.Name .. " joined!")
end

Players.PlayerAdded:Connect(onPlayerJoin)`;

    const buffer = Buffer.from(examples, 'utf8');
    const file = new AttachmentBuilder(buffer, { name: 'contoh_roblox.lua' });

    await message.reply({
        embeds: [{
            color: 0x00ff00,
            title: '📝 Contoh Script Roblox untuk Obfuscate',
            description: 'Download file dibawah untuk melihat contoh lengkap!',
            fields: [
                {
                    name: '✅ Support Roblox Luau 2025',
                    value: 'Bot ini langsung memproses ke Prometheus tanpa validasi Lua 5.1,\n' +
                           'sehingga syntax Roblox modern bisa diproses.'
                },
                {
                    name: '💡 Tips:',
                    value: '• Pastikan script tidak ada typo\n' +
                           '• Test script di Roblox Studio terlebih dahulu\n' +
                           '• Gunakan `!presets` untuk lihat perbedaan preset'
                }
            ]
        }],
        files: [file]
    });
}

async function handleTest(message) {
    const testCode = `print("Hello World")
local x = 10
if x > 5 then
    print("X is greater than 5")
end

local function test()
    return "Prometheus is working!"
end
print(test())`;

    const timestamp = Date.now();
    const testPath = path.join(PROMETHEUS_PATH, `test_${timestamp}.lua`);
    const testOutput = path.join(PROMETHEUS_PATH, `test_${timestamp}_out.lua`);

    const statusMsg = await message.reply({
        embeds: [{
            color: 0xffff00,
            title: '⏳ Testing Prometheus...',
            description: 'Mohon tunggu...'
        }]
    });

    try {
        fs.writeFileSync(testPath, testCode);

        const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset Minify "${testPath}" --out "${testOutput}" 2>&1`;
        const { stdout, stderr } = await execAsync(command, { timeout: 30000 });

        let status, outputContent, color;

        if (fs.existsSync(testOutput)) {
            status = '✅ Success';
            outputContent = fs.readFileSync(testOutput, 'utf8').substring(0, 500);
            color = 0x00ff00;
        } else {
            status = '❌ Failed';
            outputContent = stdout || stderr || 'No output generated';
            color = 0xff0000;
        }

        await statusMsg.edit({
            embeds: [{
                color: color,
                title: '🧪 Prometheus Test Result',
                fields: [
                    { name: 'Status', value: status },
                    { name: 'Input', value: `\`\`\`lua\n${testCode.substring(0, 300)}\n\`\`\`` },
                    { name: 'Output', value: `\`\`\`lua\n${outputContent}\n\`\`\`` }
                ]
            }]
        });

    } catch (err) {
        await statusMsg.edit({
            embeds: [{
                color: 0xff0000,
                title: '❌ Test Failed',
                description: `\`\`\`${err.message}\`\`\``
            }]
        });
    } finally {
        cleanupFiles(testPath, testOutput);
    }
}

async function handleHelp(message) {
    await message.reply({
        embeds: [{
            color: 0x0099ff,
            title: '📖 Prometheus Obfuscator Bot',
            description: 'Bot untuk obfuscate script Lua/Roblox menggunakan Prometheus\n\n' +
                         '**✅ Support Roblox Luau 2025!**',
            fields: [
                {
                    name: '📌 Commands',
                    value: `\`!obfuscate [preset]\` - Obfuscate file Lua
\`!presets\` - Info detail tentang presets
\`!example\` - Download contoh script
\`!test\` - Test Prometheus installation
\`!help\` - Tampilkan bantuan ini`
                },
                {
                    name: '🎨 Presets',
                    value: `\`minify\` - Minify code (default)
\`weak\` - Obfuscation ringan
\`medium\` - Obfuscation sedang
\`strong\` - Obfuscation kuat
\`vm\` - Virtual Machine (terkuat)`
                },
                {
                    name: '💡 Contoh Penggunaan',
                    value: `\`!obfuscate\` + attach file.lua
\`!obfuscate strong\` + attach file.lua
\`!obfuscate vm\` + attach file.lua`
                }
            ],
            footer: {
                text: 'Max file size: 5MB | Format: .lua | Support Roblox Luau 2025'
            }
        }]
    });
}

async function handlePresets(message) {
    await message.reply({
        embeds: [{
            color: 0x9b59b6,
            title: '🎨 Prometheus Presets',
            description: 'Penjelasan detail setiap preset obfuscation:',
            fields: [
                {
                    name: '📦 Minify (Default)',
                    value: '• Hanya memperkecil ukuran code\n• Hapus whitespace & comments\n• Paling cepat, output terkecil\n• **Recommended untuk:** Script kecil'
                },
                {
                    name: '🔓 Weak',
                    value: '• Obfuscation dasar\n• Rename variables\n• Mudah di-reverse\n• **Recommended untuk:** Testing'
                },
                {
                    name: '🔒 Medium',
                    value: '• Obfuscation sedang\n• String encryption\n• Control flow changes\n• **Recommended untuk:** Script biasa'
                },
                {
                    name: '🔐 Strong',
                    value: '• Obfuscation kuat\n• Multiple layers encryption\n• Anti-debug features\n• **Recommended untuk:** Script penting'
                },
                {
                    name: '🛡️ VM (Virtual Machine)',
                    value: '• Paling kuat & kompleks\n• Convert ke bytecode + VM\n• Sangat sulit di-reverse\n• Output lebih besar\n• **Recommended untuk:** Script premium'
                }
            ]
        }]
    });
}

// ========== UTILITY FUNCTIONS ==========

function cleanLuaCode(code) {
    // Remove BOM
    code = code.replace(/^\uFEFF/, '');
    // Normalize line endings
    code = code.replace(/\r\n/g, '\n');
    code = code.replace(/\r/g, '\n');
    // Trim
    code = code.trim();
    // Remove weird starting characters
    if (code.charCodeAt(0) === 63) { // '?'
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
        } catch (err) {
            console.error(`[Cleanup] Failed to delete ${file}:`, err.message);
        }
    }
}

// ========== ERROR HANDLING ==========

client.on('error', (error) => {
    console.error('[Discord Client Error]:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('[Unhandled Rejection]:', error);
});

process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]:', error);
});

// ========== LOGIN ==========

client.login(TOKEN).catch((err) => {
    console.error('❌ Failed to login:', err.message);
    process.exit(1);
});
