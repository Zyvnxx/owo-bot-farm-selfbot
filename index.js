import { Client } from 'discord.js-selfbot-v13';
import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// ==================== KONFIGURASI ====================
const enableSound = process.argv.includes('--sound=true');
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000; // 24 jam

// Warna untuk console output
const colors = {
    reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m'
};

// ==================== CLASS BOT PER TOKEN ====================
class OwOBotInstance {
    constructor(token, index) {
        this.token = token;
        this.index = index;
        this.client = new Client({ checkUpdate: false });
        this.isFarming = false;
        this.farmChannel = null;
        this.captchaDetected = false;
        this.lastHuntTime = 0;
        this.lastBattleTime = 0;
        this.lastDailyTime = 0;
        this.dailyTimeout = null;
        this.currentCommandIndex = 0;
        this.farmSequence = ['owo hunt', 'owo battle'];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefixMap = {
            success: `${colors.green}[✓]${colors.reset}`,
            error: `${colors.red}[✗]${colors.reset}`,
            warning: `${colors.yellow}[!]${colors.reset}`,
            info: `${colors.blue}[i]${colors.reset}`,
            farm: `${colors.magenta}[🌾]${colors.reset}`,
            daily: `${colors.cyan}[📅]${colors.reset}`
        };
        const prefix = prefixMap[type] || `${colors.cyan}[*]${colors.reset}`;
        console.log(`${colors.dim}[${timestamp}]${colors.reset} ${colors.bright}[Akun ${this.index}]${colors.reset} ${prefix} ${message}`);
    }

    formatTimeRemaining(ms) {
        const hours = Math.floor(ms / (60 * 60 * 1000));
        const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((ms % (60 * 1000)) / 1000);
        return `${hours}j ${minutes}m ${seconds}d`;
    }

    async claimDaily() {
        if (!this.farmChannel) {
            this.log('Channel belum diset, skip daily', 'warning');
            this.scheduleNextDaily();
            return;
        }
        try {
            this.log('Mengklaim daily reward...', 'daily');
            await this.farmChannel.send('owo daily');
            this.lastDailyTime = Date.now();
            this.scheduleNextDaily();
        } catch (error) {
            this.log(`Error claim daily: ${error.message}`, 'error');
            this.scheduleNextDaily();
        }
    }

    scheduleNextDaily() {
        if (this.dailyTimeout) clearTimeout(this.dailyTimeout);
        const now = Date.now();
        let nextDailyTime = this.lastDailyTime === 0 ? now : this.lastDailyTime + DAILY_COOLDOWN;
        const timeUntilNext = nextDailyTime - now;
        
        if (timeUntilNext <= 0) {
            this.log('Waktunya claim daily!', 'daily');
            this.claimDaily();
        } else {
            this.log(`Daily berikutnya dalam: ${this.formatTimeRemaining(timeUntilNext)}`, 'daily');
            this.dailyTimeout = setTimeout(() => this.claimDaily(), timeUntilNext);
        }
    }

    async sendNextCommand() {
        if (!this.isFarming || !this.farmChannel || this.captchaDetected) return;
        
        const now = Date.now();
        const command = this.farmSequence[this.currentCommandIndex];
        
        if (command === 'owo hunt' && (now - this.lastHuntTime) < 30000) {
            setTimeout(() => this.sendNextCommand(), 5000);
            return;
        }
        if (command === 'owo battle' && (now - this.lastBattleTime) < 30000) {
            setTimeout(() => this.sendNextCommand(), 5000);
            return;
        }
        
        try {
            await this.farmChannel.send(command);
            this.log(`Sent: ${command}`, 'farm');
            
            if (command === 'owo hunt') this.lastHuntTime = now;
            if (command === 'owo battle') this.lastBattleTime = now;
            
            this.currentCommandIndex = (this.currentCommandIndex + 1) % this.farmSequence.length;
            setTimeout(() => this.sendNextCommand(), Math.random() * 10000 + 5000);
        } catch (error) {
            this.log(`Error: ${error.message}`, 'error');
            setTimeout(() => this.sendNextCommand(), 10000);
        }
    }

    playSound() {
        if (enableSound) process.stdout.write('\x07');
    }

    setupEventHandlers() {
        this.client.on('messageCreate', async (message) => {
            // Deteksi captcha
            if (message.author.id !== this.client.user.id) {
                const content = message.content.toLowerCase();
                if (content.includes('captcha') || content.includes('verification') || content.includes('human verification')) {
                    this.log('⚠️ CAPTCHA DETECTED! Stopping farm...', 'warning');
                    this.captchaDetected = true;
                    this.isFarming = false;
                    this.playSound();
                    if (this.farmChannel) {
                        await this.farmChannel.send('⚠️ Captcha detected! Please verify manually.');
                    }
                    return;
                }
                
                // Deteksi reward
                if (content.includes('you received') || content.includes('you found') || content.includes('you defeated')) {
                    this.log(`Reward: ${message.content.substring(0, 80)}`, 'success');
                }
                
                // Deteksi daily response
                if (content.includes('daily')) {
                    if (content.includes('already')) {
                        this.log('Daily sudah diklaim hari ini', 'daily');
                        this.lastDailyTime = Date.now();
                        this.scheduleNextDaily();
                    } else if (content.includes('claimed') || content.includes('received')) {
                        this.log('Daily reward claimed!', 'success');
                    }
                }
            }
            
            // Perintah in-chat
            if (message.author.id === this.client.user.id) {
                if (message.content === 'owo hh') {
                    this.farmChannel = message.channel;
                    this.isFarming = true;
                    this.captchaDetected = false;
                    this.log(`Farming started in #${message.channel.name}`, 'success');
                    if (this.lastDailyTime === 0 && !this.dailyTimeout) this.scheduleNextDaily();
                    setTimeout(() => this.sendNextCommand(), 5000);
                    await message.edit('✅ Auto-farming started!');
                }
                
                if (message.content === 'owo bb') {
                    this.isFarming = false;
                    this.log('Farming stopped', 'warning');
                    await message.edit('⏹️ Auto-farming stopped!');
                }
                
                if (message.content === 'owo stats') {
                    await message.edit(this.getStatsMessage());
                }
            }
        });
    }

    getStatsMessage() {
        return `📊 **Akun ${this.index} Stats**\nFarming: ${this.isFarming ? '✅ Active' : '⏹️ Stopped'}\nCaptcha: ${this.captchaDetected ? '⚠️ Detected' : '✅ Clear'}\nChannel: ${this.farmChannel ? `#${this.farmChannel.name}` : 'Not set'}\n\n📅 Daily: ${this.lastDailyTime ? new Date(this.lastDailyTime).toLocaleString() : 'Never'}`;
    }

    async start() {
        this.setupEventHandlers();
        
        this.client.once('ready', () => {
            this.log(`✅ Logged in as ${this.client.user.tag}`, 'success');
            this.log('Type "owo hh" in any channel to start farming', 'info');
        });
        
        await this.client.login(this.token).catch(err => {
            this.log(`Login failed: ${err.message}`, 'error');
        });
    }
}

// ==================== MANAJEMEN MULTI TOKEN ====================
// Baca tokens dari environment variable
const tokens = process.env.TOKENS ? process.env.TOKENS.split(',').map(t => t.trim()) : [];

if (tokens.length === 0) {
    console.error(`${colors.red}[ERROR]${colors.reset} No tokens found in .env file!`);
    console.log('Format TOKENS di .env: TOKENS=token1,token2,token3');
    process.exit(1);
}

console.log(`
${colors.bright}${colors.magenta}═══════════════════════════════════════════════════════${colors.reset}
${colors.bright}     OwO Bot Multi-Token Auto-Farm Script Active${colors.reset}
${colors.bright}     Total Akun: ${tokens.length}${colors.reset}
${colors.bright}${colors.magenta}═══════════════════════════════════════════════════════${colors.reset}

${colors.cyan}Informasi:${colors.reset}
  • Script akan menjalankan ${tokens.length} akun secara bersamaan
  • Setiap akun memiliki farming dan daily scheduler sendiri
  • Ketik "owo hh" di channel Discord masing-masing akun untuk start

${colors.yellow}⚠️  PERINGATAN:${colors.reset}
  • Self-bot melanggar ToS Discord!
  • Gunakan dengan risiko sendiri!
  • Pantau terus chat untuk captcha!

${colors.bright}${colors.magenta}═══════════════════════════════════════════════════════${colors.reset}
`);

// Buat instance untuk setiap token
const botInstances = [];
for (let i = 0; i < tokens.length; i++) {
    const bot = new OwOBotInstance(tokens[i], i + 1);
    botInstances.push(bot);
    bot.start();
}

// ==================== CONSOLE COMMANDS ====================
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function showConsoleMenu() {
    console.log(`
${colors.bright}Console Commands:${colors.reset}
  status      - Show all accounts status
  start all   - Start farming on all accounts
  stop all    - Stop farming on all accounts
  daily all   - Manual daily claim on all accounts
  help        - Show this help
  exit        - Exit script
`);
}

async function consoleCommands() {
    rl.question(`${colors.bright}${colors.cyan}[Console]➜${colors.reset} `, async (input) => {
        const cmd = input.toLowerCase().trim();
        
        switch(cmd) {
            case 'status':
                console.log(`\n${colors.bright}=== STATUS SEMUA AKUN ===${colors.reset}`);
                botInstances.forEach(bot => {
                    console.log(`  Akun ${bot.index}: Farming: ${bot.isFarming ? '✅' : '⭕'} | Captcha: ${bot.captchaDetected ? '⚠️' : '✅'} | Channel: ${bot.farmChannel ? '✅' : '❌'}`);
                });
                break;
                
            case 'start all':
                botInstances.forEach(bot => {
                    if (bot.farmChannel) {
                        bot.isFarming = true;
                        bot.captchaDetected = false;
                        bot.log('Farming started via console', 'success');
                        bot.sendNextCommand();
                    } else {
                        bot.log('Tidak bisa start: channel belum diset (kirim "owo hh" di Discord)', 'warning');
                    }
                });
                break;
                
            case 'stop all':
                botInstances.forEach(bot => {
                    bot.isFarming = false;
                    bot.log('Farming stopped via console', 'warning');
                });
                break;
                
            case 'daily all':
                console.log('Claiming daily for all accounts...');
                for (const bot of botInstances) {
                    await bot.claimDaily();
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                break;
                
            case 'help':
                showConsoleMenu();
                break;
                
            case 'exit':
                console.log('Shutting down all bots...');
                for (const bot of botInstances) {
                    if (bot.dailyTimeout) clearTimeout(bot.dailyTimeout);
                    bot.client.destroy();
                }
                process.exit(0);
                break;
                
            default:
                if (cmd) console.log(`Unknown command: ${cmd}. Type "help" for commands.`);
        }
        
        consoleCommands();
    });
}

showConsoleMenu();
consoleCommands();

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    for (const bot of botInstances) {
        if (bot.dailyTimeout) clearTimeout(bot.dailyTimeout);
        bot.client.destroy();
    }
    process.exit(0);
});