#!/usr/bin/env node

/**
 * Telegram Session Generator
 * 
 * This script generates a Telegram session file for production use.
 * Run this once to authenticate and generate the session file.
 * 
 * Usage: node scripts/generate-telegram-session.js
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: 'development.env' });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

function questionHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    let input = '';
    process.stdin.on('data', function(char) {
      char = char.toString();
      
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(input);
          break;
        case '\u0003':
          process.exit();
          break;
        case '\u007f': // backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          input += char;
          process.stdout.write('*');
          break;
      }
    });
  });
}

async function generateSession() {
  console.log('🔐 Telegram Session Generator');
  console.log('=============================\n');
  
  // Get API credentials
  const apiId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  
  if (!apiId || !apiHash) {
    console.error('❌ Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in environment');
    console.error('');
    console.error('1. Go to https://my.telegram.org');
    console.error('2. Create a new app');
    console.error('3. Add TELEGRAM_API_ID and TELEGRAM_API_HASH to your .env file');
    process.exit(1);
  }
  
  console.log('✅ API credentials found');
  console.log(`📱 API ID: ${apiId}`);
  console.log(`🔑 API Hash: ${apiHash.substring(0, 8)}...`);
  console.log('');
  
  // Initialize client
  const client = new TelegramClient(
    new StringSession(''), 
    parseInt(apiId), 
    apiHash,
    { connectionRetries: 5 }
  );
  
  try {
    console.log('📞 Connecting to Telegram...');
    await client.connect();
    
    // Get phone number
    const phoneNumber = await question('📱 Enter your phone number (with country code, e.g., +1234567890): ');
    
    console.log('\n📤 Sending authentication code...');
    
    // Start authentication
    await client.start({
      phoneNumber: async () => phoneNumber,
      password: async () => {
        console.log('\n🔐 2FA password required');
        return await questionHidden('Enter your 2FA password: ');
      },
      phoneCode: async () => {
        console.log('\n💬 Check your Telegram app for the verification code');
        return await question('Enter the verification code: ');
      },
      onError: (err) => {
        console.error('❌ Authentication error:', err.message);
      },
    });
    
    // Get session string
    const sessionString = client.session.save();
    
    // Save to file
    const sessionFilePath = path.join(process.cwd(), 'telegram-session.txt');
    fs.writeFileSync(sessionFilePath, sessionString, 'utf8');
    
    console.log('\n✅ Authentication successful!');
    console.log(`💾 Session saved to: ${sessionFilePath}`);
    console.log('');
    console.log('🚀 You can now run your application with Telegram indexing enabled');
    console.log('');
    console.log('📝 Add telegram-session.txt to your .gitignore file for security');
    
  } catch (error) {
    console.error('\n❌ Session generation failed:', error.message);
    process.exit(1);
  } finally {
    await client.disconnect();
    rl.close();
  }
}

// Handle process interruption
process.on('SIGINT', () => {
  rl.close();
  process.exit(0);
});

// Run the generator
generateSession().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 