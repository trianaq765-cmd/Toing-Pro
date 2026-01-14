const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

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

    // Command: !obfuscate
    if (message.content.startsWith('!obfuscate')) {
        
        if (message.attachments.size === 0) {
            return message.reply('❌ Kirim file `.lua` untuk di-obfuscate!');
        }

        const attachment = message.attachments.first();
        
        if (!attachment.name.endsWith('.lua')) {
            return message.reply('❌ File harus berformat `.lua`!');
        }

        try {
            await message.reply('⏳ Sedang memproses obfuscation...');

            const response = await fetch(attachment.url);
            const luaCode = await response.text();
            
            const inputPath = path.join(__dirname, 'temp_input.lua');
            const outputPath = path.join(__dirname, 'temp_output.lua');
            
            fs.writeFileSync(inputPath, luaCode);

            // Menggunakan Lua 5.1 dan path Prometheus yang benar
            const command = `lua5.1 /app/Prometheus-master/cli.lua --preset Medium ${inputPath} --out ${outputPath}`;
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(error);
                    return message.reply('❌ Gagal obfuscate: ' + error.message);
                }

                const obfuscatedFile = new AttachmentBuilder(outputPath, { 
                    name: 'obfuscated.lua' 
                });
                
                message.reply({ 
                    content: '✅ Berhasil di-obfuscate!', 
                    files: [obfuscatedFile] 
                });

                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);
            });

        } catch (err) {
            console.error(err);
            message.reply('❌ Terjadi error: ' + err.message);
        }
    }

    // Command: !help
    if (message.content === '!help') {
        message.reply(`
**📖 Prometheus Bot Commands**
\`!obfuscate\` + attach file.lua → Obfuscate script Lua
\`!help\` → Tampilkan bantuan
        `);
    }
});

client.login(TOKEN);
