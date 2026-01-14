const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

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

// Presets configuration
const PRESETS = {
    minify: 'Minify',
    weak: 'Weak', 
    medium: 'Medium',
    strong: 'Strong',
    vm: 'Vm'
};

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} sudah online!`);
    client.user.setActivity('!help | Obfuscator', { type: 'WATCHING' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Command: !obfuscate [preset]
    if (message.content.startsWith('!obfuscate')) {
        
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

        // Check file size (max 5MB)
        if (attachment.size > 5 * 1024 * 1024) {
            return message.reply({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ File Terlalu Besar',
                    description: 'Maksimal ukuran file: 5MB'
                }]
            });
        }

        // Get preset from command
        const args = message.content.split(' ');
        const presetName = args[1]?.toLowerCase() || 'minify';
        const preset = PRESETS[presetName] || 'Minify';

        try {
            const statusMsg = await message.reply({
                embeds: [{
                    color: 0xffff00,
                    title: '⏳ Processing',
                    description: `Downloading file...`,
                    fields: [
                        { name: 'File', value: attachment.name, inline: true },
                        { name: 'Size', value: `${(attachment.size / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Preset', value: preset, inline: true }
                    ]
                }]
            });

            // Download file
            const response = await fetch(attachment.url);
            let luaCode = await response.text();
            
            // Clean encoding issues
            luaCode = luaCode.replace(/^\uFEFF/, ''); // Remove BOM
            luaCode = luaCode.replace(/\r\n/g, '\n'); // Normalize line endings
            luaCode = luaCode.trim(); // Remove extra whitespace
            
            // Check for common issues
            if (luaCode.startsWith('?') || luaCode.charCodeAt(0) === 63) {
                luaCode = luaCode.substring(1);
            }
            
            // Save to temp file
            const timestamp = Date.now();
            const inputPath = `/app/Prometheus-master/temp_${timestamp}_input.lua`;
            const outputPath = `/app/Prometheus-master/temp_${timestamp}_output.lua`;
            
            fs.writeFileSync(inputPath, luaCode, 'utf8');
            
            // Update status
            await statusMsg.edit({
                embeds: [{
                    color: 0xffff00,
                    title: '⏳ Processing',
                    description: `Validating Lua syntax...`
                }]
            });
            
            // Validate syntax
            exec(`lua5.1 -p ${inputPath}`, async (syntaxError, syntaxStdout, syntaxStderr) => {
                if (syntaxError) {
                    await statusMsg.edit({
                        embeds: [{
                            color: 0xff0000,
                            title: '❌ Syntax Error',
                            description: 'File Lua memiliki error syntax!',
                            fields: [
                                {
                                    name: 'Error:',
                                    value: `\`\`\`${syntaxStderr || syntaxError.message}\`\`\``.substring(0, 1024)
                                },
                                {
                                    name: 'Tips:',
                                    value: '• Pastikan semua `if`, `for`, `while`, `function` memiliki `end`\n• Cek tanda kutip tidak ada yang kurang\n• Pastikan tidak ada karakter aneh'
                                }
                            ]
                        }]
                    });
                    
                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    return;
                }
                
                // Update status
                await statusMsg.edit({
                    embeds: [{
                        color: 0xffff00,
                        title: '⏳ Processing',
                        description: `Obfuscating with preset: ${preset}...`
                    }]
                });
                
                // Run Prometheus
                const command = `cd /app/Prometheus-master && lua5.1 cli.lua --preset ${preset} temp_${timestamp}_input.lua --out temp_${timestamp}_output.lua 2>&1`;
                
                exec(command, async (error, stdout, stderr) => {
                    console.log(`[Prometheus] stdout: ${stdout}`);
                    console.log(`[Prometheus] stderr: ${stderr}`);
                    
                    // If preset fails, try without preset
                    if (error || !fs.existsSync(outputPath)) {
                        console.log('[Prometheus] Trying without preset...');
                        
                        const fallbackCommand = `cd /app/Prometheus-master && lua5.1 cli.lua temp_${timestamp}_input.lua --out temp_${timestamp}_output.lua 2>&1`;
                        
                        exec(fallbackCommand, async (error2, stdout2, stderr2) => {
                            if (error2 || !fs.existsSync(outputPath)) {
                                await statusMsg.edit({
                                    embeds: [{
                                        color: 0xff0000,
                                        title: '❌ Obfuscation Failed',
                                        description: 'Tidak dapat meng-obfuscate file!',
                                        fields: [
                                            {
                                                name: 'Error:',
                                                value: `\`\`\`${stderr2 || stderr || error2?.message || error?.message}\`\`\``.substring(0, 1024)
                                            },
                                            {
                                                name: 'Coba:',
                                                value: '• Gunakan preset `minify` untuk file sederhana\n• Pastikan tidak ada fungsi yang terlalu kompleks'
                                            }
                                        ]
                                    }]
                                });
                                
                                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                                return;
                            }
                            
                            await sendResult('Default');
                        });
                        return;
                    }
                    
                    await sendResult(preset);
                });
                
                async function sendResult(usedPreset) {
                    try {
                        const stats = fs.statSync(outputPath);
                        const originalSize = fs.statSync(inputPath).size;
                        
                        const obfuscatedFile = new AttachmentBuilder(outputPath, { 
                            name: `obfuscated_${attachment.name}` 
                        });
                        
                        await statusMsg.edit({ 
                            embeds: [{
                                color: 0x00ff00,
                                title: '✅ Obfuscation Berhasil!',
                                fields: [
                                    { name: 'Original Size', value: `${(originalSize / 1024).toFixed(2)} KB`, inline: true },
                                    { name: 'Obfuscated Size', value: `${(stats.size / 1024).toFixed(2)} KB`, inline: true },
                                    { name: 'Preset Used', value: usedPreset, inline: true }
                                ],
                                footer: {
                                    text: 'Prometheus Obfuscator'
                                },
                                timestamp: new Date()
                            }],
                            files: [obfuscatedFile] 
                        });
                        
                    } catch (err) {
                        console.error('[SendResult] Error:', err);
                        await statusMsg.edit('❌ Error saat mengirim file hasil');
                    } finally {
                        // Cleanup
                        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    }
                }
            });

        } catch (err) {
            console.error('[Main] Error:', err);
            await message.reply({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ Error',
                    description: err.message
                }]
            });
        }
    }

    // Command: !test
    if (message.content === '!test') {
        const testCode = `-- Test Script
print("Hello World")
local x = 10
if x > 5 then
    print("X is greater than 5")
end`;
        
        const testPath = '/app/Prometheus-master/test_sample.lua';
        const testOutput = '/app/Prometheus-master/test_sample_out.lua';
        
        fs.writeFileSync(testPath, testCode);
        
        exec(`cd /app/Prometheus-master && lua5.1 cli.lua --preset Minify test_sample.lua --out test_sample_out.lua`, async (error, stdout, stderr) => {
            let status = '❌ Failed';
            let outputContent = 'No output generated';
            
            if (fs.existsSync(testOutput)) {
                status = '✅ Success';
                outputContent = fs.readFileSync(testOutput, 'utf8').substring(0, 500);
                fs.unlinkSync(testOutput);
            }
            
            if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
            
            await message.reply({
                embeds: [{
                    color: status === '✅ Success' ? 0x00ff00 : 0xff0000,
                    title: 'Prometheus Test',
                    fields: [
                        { name: 'Status', value: status },
                        { name: 'Input', value: `\`\`\`lua\n${testCode}\n\`\`\`` },
                        { name: 'Output', value: `\`\`\`lua\n${outputContent}\n\`\`\`` }
                    ]
                }]
            });
        });
    }

    // Command: !help
    if (message.content === '!help') {
        await message.reply({
            embeds: [{
                color: 0x0099ff,
                title: '📖 Prometheus Obfuscator Bot',
                description: 'Bot untuk obfuscate script Lua menggunakan Prometheus',
                fields: [
                    {
                        name: '📌 Commands',
                        value: `
\`!obfuscate [preset]\` - Obfuscate file Lua
\`!test\` - Test Prometheus installation
\`!help\` - Tampilkan bantuan
                        `
                    },
                    {
                        name: '🎨 Presets',
                        value: `
\`minify\` - Minify code (paling ringan)
\`weak\` - Obfuscation lemah
\`medium\` - Obfuscation sedang
\`strong\` - Obfuscation kuat
\`vm\` - Virtual Machine (paling kuat)
                        `
                    },
                    {
                        name: '💡 Contoh',
                        value: `
\`!obfuscate\` - Gunakan preset default
\`!obfuscate strong\` - Gunakan preset strong
                        `
                    }
                ],
                footer: {
                    text: 'Max file size: 5MB | Format: .lua'
                }
            }]
        });
    }
});

// Handle errors
client.on('error', console.error);
process.on('unhandledRejection', console.error);

client.login(TOKEN);
