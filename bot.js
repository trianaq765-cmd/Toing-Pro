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

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} sudah online!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!obfuscate')) {
        
        if (message.attachments.size === 0) {
            return message.reply('❌ Kirim file `.lua` untuk di-obfuscate!');
        }

        const attachment = message.attachments.first();
        
        if (!attachment.name.endsWith('.lua')) {
            return message.reply('❌ File harus berformat `.lua`!');
        }

        try {
            const statusMsg = await message.reply('⏳ Sedang memproses obfuscation...');

            const response = await fetch(attachment.url);
            const luaCode = await response.text();
            
            const inputPath = path.join(__dirname, 'temp_input.lua');
            const outputPath = path.join(__dirname, 'temp_output.lua');
            
            fs.writeFileSync(inputPath, luaCode);

            // FIX: Path yang benar ke Prometheus CLI
            const command = `cd /app/Prometheus-master && lua5.1 cli.lua --preset Medium ${inputPath} --out ${outputPath}`;
            
            exec(command, async (error, stdout, stderr) => {
                // Debug log
                console.log('stdout:', stdout);
                console.log('stderr:', stderr);
                
                if (error) {
                    console.error('Error:', error);
                    await statusMsg.edit(`❌ Gagal obfuscate:\n\`\`\`${error.message}\`\`\``);
                    
                    // Cleanup
                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    return;
                }

                // Check if output file exists
                if (!fs.existsSync(outputPath)) {
                    await statusMsg.edit('❌ File output tidak terbuat. Coba preset lain.');
                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    return;
                }

                const obfuscatedFile = new AttachmentBuilder(outputPath, { 
                    name: 'obfuscated.lua' 
                });
                
                await statusMsg.edit({ 
                    content: '✅ Berhasil di-obfuscate!', 
                    files: [obfuscatedFile] 
                });

                // Cleanup
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            });

        } catch (err) {
            console.error('Catch error:', err);
            await message.reply('❌ Terjadi error: ' + err.message);
        }
    }

    // Command test
    if (message.content === '!test') {
        exec('ls -la /app/Prometheus-master/', (error, stdout, stderr) => {
            message.reply(`\`\`\`${stdout || stderr || error}\`\`\``);
        });
    }

    if (message.content === '!help') {
        message.reply(`
**📖 Prometheus Bot Commands**
\`!obfuscate\` + attach file.lua → Obfuscate script Lua
\`!test\` → Test Prometheus installation
\`!help\` → Tampilkan bantuan
        `);
    }
});

client.login(TOKEN);
