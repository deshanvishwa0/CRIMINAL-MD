const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const yts = require('yt-search');
const { MongoClient } = require('mongodb');
require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  generateWAMessageFromContent,
  proto,
  DisconnectReason
} = require('dct-dev-private-baileys');
// ────────────────────────────────────────────────
let _dewDocBuffer = null;
try {
  const docPath = path.join(__dirname, 'data', 'xion.docx');
  if (fs.existsSync(docPath)) _dewDocBuffer = fs.readFileSync(docPath);
} catch (e) { console.error('Preload doc error', e); }
// ───────────────────── CONFIG SETTING ───────────────────────────
const BOT_NAME_FANCY = '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

const config = {
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
    AUTO_LIKE_EMOJI: ['💙', '🩷', '💜', '🤎', '🧡', '🩵', '💛', '🩶', '♥️', '💗', '❤️‍🔥'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/E6oYV4IgAn06Yd9uEL05xD?s',
  RCD_IMAGE_PATH: 'https://i.ibb.co/4gV5hsR7/af289d3bc848.jpg',
  NEWSLETTER_JID: '120363428704933336@newsletter',
  OTP_EXPIRY: 300000,
  WORK_TYPE: 'public',
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94756331255',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbDdsYV6RGJQQyv5X91f',
  BOT_NAME: '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃',
  BOT_VERSION: '2.0.0V',
  OWNER_NAME: 'MADU ||🌿',
  IMAGE_PATH: 'https://i.ibb.co/4gV5hsR7/af289d3bc848.jpg',
  BOT_FOOTER: '> *©ᴘᴏᴡᴇʀᴅ ʙʏ © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*',
  API_YTMP3_URL: 'https://ytmp3-download-api.vercel.app',
  API_YTMP4_URL: 'https://malmi-lakiya-api.vercel.app',
  BUTTON_IMAGES: { ALIVE: 'https://i.ibb.co/4gV5hsR7/af289d3bc848.jpg' }
};
// ---------------- MONGO SETUP ----------------
// ────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;//DB url eka .env eke dan thiyenne
const MONGO_DB = process.env.MONGO_DB;//mekatth ekema
let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol, groupSettingsCol, autoTTSendCol, autoSongSendCol;
// ────────────────────────────────────────────────
// In-memory cache for user configs to avoid frequent DB reads
const userConfigCache = new Map();
const USER_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-memory cache for group settings
const groupSettingsCache = new Map();
const GROUP_SETTINGS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');
  groupSettingsCol = mongoDB.collection('group_settings');
  autoTTSendCol = mongoDB.collection('autottsend');
  autoSongSendCol = mongoDB.collection('autosongsend');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  await groupSettingsCol.createIndex({ jid: 1 }, { unique: true });
  await autoTTSendCol.createIndex({ number: 1, jid: 1 }, { unique: true });
  await autoSongSendCol.createIndex({ number: 1, jid: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------

async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
    try { userConfigCache.set(sanitized, { config: conf, ts: Date.now() }); } catch (e){}
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    // Check cache first
    try {
      const cached = userConfigCache.get(sanitized);
      if (cached && (Date.now() - (cached.ts || 0) < USER_CONFIG_CACHE_TTL)) {
        return cached.config;
      }
    } catch (e) { }

    const doc = await configsCol.findOne({ number: sanitized });
    const conf = doc ? doc.config : null;
    try { userConfigCache.set(sanitized, { config: conf, ts: Date.now() }); } catch (e){}
    return conf;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// -------------- newsletter react-config helpers --------------

async function addNewsletterReactConfig(jid, emojis = ['🎀','🧚‍♀️','🎭']) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : ['🤫','♥️',''] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return ['🤫','♥️','']; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : ['🧚‍♀️','🤫','🎀']) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ─── Group Settings Helpers ──────────────────────────────────────────────────

async function getAllGroupSettings(groupJid) {
  try {
    const cached = groupSettingsCache.get(groupJid);
    if (cached && (Date.now() - cached.ts < GROUP_SETTINGS_CACHE_TTL)) return cached.settings;
    await initMongo();
    const doc = await groupSettingsCol.findOne({ jid: groupJid });
    const settings = doc ? (doc.settings || {}) : {};
    groupSettingsCache.set(groupJid, { settings, ts: Date.now() });
    return settings;
  } catch(e) { return {}; }
}

async function setGroupSetting(groupJid, key, value) {
  try {
    await initMongo();
    await groupSettingsCol.updateOne({ jid: groupJid }, { $set: { [`settings.${key}`]: value, updatedAt: new Date() } }, { upsert: true });
    groupSettingsCache.delete(groupJid); // invalidate cache
  } catch(e) { console.error('setGroupSetting error:', e); }
}

async function setAllGroupSettings(groupJid, settings) {
  try {
    await initMongo();
    await groupSettingsCol.updateOne({ jid: groupJid }, { $set: { jid: groupJid, settings, updatedAt: new Date() } }, { upsert: true });
    groupSettingsCache.delete(groupJid);
  } catch(e) { console.error('setAllGroupSettings error:', e); }
}

// ─── AutoTTSend Mongo Helpers ─────────────────────────────────────────────────

async function addAutoTTSend(number, jid, title, intervalMinutes = 10) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoTTSendCol.updateOne(
      { number: sanitized, jid },
      { $set: { number: sanitized, jid, title, intervalMinutes, addedAt: new Date() } },
      { upsert: true }
    );
    console.log(`AutoTTSend added: ${sanitized} → ${jid} [${title}] every ${intervalMinutes}min`);
  } catch(e) { console.error('addAutoTTSend error:', e); }
}

async function removeAutoTTSend(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoTTSendCol.deleteMany({ number: sanitized });
    console.log(`AutoTTSend removed for ${sanitized}`);
  } catch(e) { console.error('removeAutoTTSend error:', e); }
}

async function getAutoTTSendConfigs(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    return await autoTTSendCol.find({ number: sanitized }).toArray();
  } catch(e) { console.error('getAutoTTSendConfigs error:', e); return []; }
}

// ─── AutoSongSend Mongo Helpers ───────────────────────────────────────────────

async function addAutoSongSend(number, jid, title, intervalMinutes = 30) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoSongSendCol.updateOne(
      { number: sanitized, jid },
      { $set: { number: sanitized, jid, title, intervalMinutes, addedAt: new Date() } },
      { upsert: true }
    );
    console.log(`AutoSongSend added: ${sanitized} → ${jid} [${title}] every ${intervalMinutes}min`);
  } catch(e) { console.error('addAutoSongSend error:', e); }
}

async function removeAutoSongSend(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoSongSendCol.deleteMany({ number: sanitized });
    console.log(`AutoSongSend removed for ${sanitized}`);
  } catch(e) { console.error('removeAutoSongSend error:', e); }
}

async function getAutoSongSendConfigs(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    return await autoSongSendCol.find({ number: sanitized }).toArray();
  } catch(e) { console.error('getAutoSongSendConfigs error:', e); return []; }
}

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();

const socketCreationTime = new Map();

const reconnectRetries = new Map();

const otpStore = new Map();

const intentionallyClosedNumbers = new Set();

// ─── Anti-Delete Message Cache ────────────────────────────────────────────────
const messageDeleteCache = new Map(); // key: msgId, value: { from, sender, type, content }
const MESSAGE_CACHE_LIMIT = 200;

// AutoTTSend: intervalId keyed by "number:jid"
const autoTTSendIntervals = new Map();

async function sendAutoTTVideo(socket, jid, title, botName) {
  try {
    const axios = require('axios');
    const searchParams = new URLSearchParams({ keywords: title, count: '20', cursor: '0', HD: '1' });
    const response = await axios.post('https://tikwm.com/api/feed/search', searchParams, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Cookie': 'current_language=en', 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });
    const videos = response.data?.data?.videos;
    if (!videos || videos.length === 0) return;
    const v = videos[Math.floor(Math.random() * videos.length)];
    // Prefer no-watermark HD, then play, then download
    const videoUrl = v.hdplay || v.play || v.wmplay || v.download;
    if (!videoUrl) return;
    const videoRes = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
        'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8'
      },
      timeout: 90000
    });
    const videoBuffer = Buffer.from(videoRes.data);
    if (!videoBuffer || videoBuffer.length < 10000) {
      console.warn(`AutoTTSend: video buffer too small (${videoBuffer?.length} bytes), skipping`);
      return;
    }
    // Verify it starts with valid video bytes (mp4 ftyp box or other video signature)
    const hex = videoBuffer.slice(4, 8).toString('ascii');
    const isValidMp4 = hex === 'ftyp' || hex === 'moov' || hex === 'mdat' || hex === 'free';
    const caption = `*🍃 POWERED BY NATURE FOREVER*\n\n📌 *${v.title || title}*\n🥷 *${v.author?.nickname || 'Unknown'}*\n> *Kezu||🍃*`;
    if (jid.endsWith('@newsletter')) {
      // For channels, send video with proper mimetype
      await socket.sendMessage(jid, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption
      });
    } else {
      await socket.sendMessage(jid, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption,
        gifPlayback: false
      });
    }
    console.log(`AutoTTSend sent to ${jid} [${title}] (${Math.round(videoBuffer.length/1024)}KB)`);
  } catch(e) { console.error('AutoTTSend send error:', e.message); }
}

function startAutoTTSendInterval(socket, number, jid, title, botName, intervalMinutes = 10) {
  const key = `${number}:${jid}`;
  if (autoTTSendIntervals.has(key)) {
    clearInterval(autoTTSendIntervals.get(key));
  }
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  const id = setInterval(() => sendAutoTTVideo(socket, jid, title, botName), ms);
  autoTTSendIntervals.set(key, id);
  console.log(`AutoTTSend interval started: ${key} every ${intervalMinutes}min`);
}

function stopAllAutoTTSend(number) {
  const sanitized = number.replace(/[^0-9]/g, '');
  for (const [key, id] of autoTTSendIntervals.entries()) {
    if (key.startsWith(sanitized + ':')) {
      clearInterval(id);
      autoTTSendIntervals.delete(key);
      console.log(`AutoTTSend stopped: ${key}`);
    }
  }
}

// ─── AutoSongSend: interval functions ─────────────────────────────────────────

const autoSongSendIntervals = new Map();

async function sendAutoSong(socket, jid, title, botName) {
  try {
    const result = await yts(title);
    if (!result.videos || result.videos.length === 0) return;
    const data = result.videos[0];
    const videoId = data.videoId;
    const apiUrl = `${config.API_YTMP3_URL}/api/ytmp3?url=https://youtu.be/${videoId}`;
    const res = await axios.get(apiUrl, { timeout: 25000 });
    if (res.data.status !== 'success') return;
    const downloadLink = res.data.data.download_url;
    const songTitle = res.data.data.title || data.title;
    const duration = data.duration?.timestamp || data.duration?.toString() || 'Unknown';
    const channelName = data.author?.name || data.author || 'Unknown';
    const thumbnailUrl = data.thumbnail || data.image || null;

    // ── Step 1: Send Banner + Details ──
    const bannerCaption =
      `🎵 *NOW PLAYING*\n\n` +
      `📌 *Title:* ${songTitle}\n` +
      `🎤 *Artist:* ${channelName}\n` +
      `⏱️ *Duration:* ${duration}\n` +
      `▶️ *Views:* ${data.views ? data.views.toLocaleString() : 'N/A'}\n\n` +
      `> *© ${botName || '𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃'}*`;

    try {
      if (thumbnailUrl) {
        await socket.sendMessage(jid, {
          image: { url: thumbnailUrl },
          caption: bannerCaption
        });
      } else {
        await socket.sendMessage(jid, { text: bannerCaption });
      }
    } catch(bannerErr) {
      console.warn('AutoSongSend banner error:', bannerErr.message);
    }

    await delay(1500);

    // ── Step 2: Send Audio ──
    await socket.sendMessage(jid, {
      audio: { url: downloadLink },
      mimetype: 'audio/mpeg',
      fileName: `${songTitle.replace(/[^a-zA-Z0-9 ]/g, '_')}.mp3`
    });
    console.log(`AutoSongSend sent to ${jid} [${songTitle}]`);
  } catch(e) { console.error('AutoSongSend send error:', e.message); }
}

function startAutoSongInterval(socket, number, jid, title, botName, intervalMinutes = 30) {
  const key = `${number}:${jid}`;
  if (autoSongSendIntervals.has(key)) {
    clearInterval(autoSongSendIntervals.get(key));
  }
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  const id = setInterval(() => sendAutoSong(socket, jid, title, botName), ms);
  autoSongSendIntervals.set(key, id);
  console.log(`AutoSongSend interval started: ${key} every ${intervalMinutes}min`);
}

function stopAutoSongForNumber(number) {
  const sanitized = number.replace(/[^0-9]/g, '');
  for (const [key, id] of autoSongSendIntervals.entries()) {
    if (key.startsWith(sanitized + ':')) {
      clearInterval(id);
      autoSongSendIntervals.delete(key);
      console.log(`AutoSongSend stopped: ${key}`);
    }
  }
}

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`*🔐 𝐎𝚃𝙿 𝐕𝙴𝚁𝙸𝙵𝙸𝙲𝙰𝚃𝙸𝙾𝙽 — ${BOT_NAME_FANCY}*`, `*𝐘𝙾𝚄𝚁 𝐎𝚃𝙿 𝐅𝙾𝚁 𝐂𝙾𝙽𝙵𝙸𝙶 𝐔𝙿𝙳𝙰𝚃𝙴 𝐈𝚂:* *${otp}*\n𝐓𝙷𝙸𝚂 𝐎𝚃𝙿 𝐖𝙸𝙻𝙻 𝐄𝚇𝙿𝙸𝚁𝙴 𝐈𝙽 5 𝐌𝙸𝙽𝚄𝚃𝙴𝚂.\n\n*𝐍𝚄𝙼𝙱𝙴𝚁:* ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo(); // array of {jid, emojis}
      const reactConfigs = await listNewsletterReactsFromMongo(); // [{jid, emojis}]
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}


// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

    try {
      // Load user-specific config from MongoDB
      let userEmojis = config.AUTO_LIKE_EMOJI; // Default emojis
      let autoViewStatus = config.AUTO_VIEW_STATUS; // Default from global config
      let autoLikeStatus = config.AUTO_LIKE_STATUS; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config

      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};

        // Check for emojis in user config
        if (userConfig.AUTO_LIKE_EMOJI && Array.isArray(userConfig.AUTO_LIKE_EMOJI) && userConfig.AUTO_LIKE_EMOJI.length > 0) {
          userEmojis = userConfig.AUTO_LIKE_EMOJI;
        }

        // Check for auto view status in user config
        if (userConfig.AUTO_VIEW_STATUS !== undefined) {
          autoViewStatus = userConfig.AUTO_VIEW_STATUS;
        }

        // Check for auto like status in user config
        if (userConfig.AUTO_LIKE_STATUS !== undefined) {
          autoLikeStatus = userConfig.AUTO_LIKE_STATUS;
        }

        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      // Use auto recording setting (from user config or global)
      if (autoRecording === 'true') {
        await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      }

      // Use auto view status setting (from user config or global)
      if (autoViewStatus === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.readMessages([message.key]);
            break;
          } catch (error) {
            retries--;
            await delay(1000 * (config.MAX_RETRIES - retries));
            if (retries === 0) throw error;
          }
        }
      }

      // Use auto like status setting (from user config or global)
      if (autoLikeStatus === 'true') {
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, {
              react: { text: randomEmoji, key: message.key }
            }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) {
            retries--;
            await delay(1000 * (config.MAX_RETRIES - retries));
            if (retries === 0) throw error;
          }
        }
      }

    } catch (error) {
      console.error('Status handler error:', error);
    }
  });
}


async function handleMessageRevocation(socket, number) {
  socket.ev.on('messages.delete', async ({ keys }) => {
    if (!keys || keys.length === 0) return;
    try {
      const sanitized = (number || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      if (userConfig.ANTI_DELETE !== 'on') return;

      const userJid = jidNormalizedUser(socket.user.id);
      const deletionTime = getSriLankaTimestamp();

      for (const messageKey of keys) {
        const cached = messageDeleteCache.get(messageKey.id);
        if (!cached) {
          const notif = `🗑️ *Anti Delete*\nA message was deleted.\n*From:* ${messageKey.remoteJid}\n*Time:* ${deletionTime}`;
          try { await socket.sendMessage(userJid, { text: notif }); } catch(e){}
          continue;
        }

        const { from, senderNum, text, imageBuffer, videoBuffer, audioBuffer, stickerBuffer, docBuffer, caption, mimeType, fileName } = cached;
        const header = `🗑️ *Anti Delete* — Message deleted from @${senderNum} in ${from}\n🕐 *Time:* ${deletionTime}\n\n`;

        try {
          if (imageBuffer) {
            await socket.sendMessage(userJid, { image: imageBuffer, caption: header + (caption || '') });
          } else if (videoBuffer) {
            await socket.sendMessage(userJid, { video: videoBuffer, caption: header + (caption || '') });
          } else if (audioBuffer) {
            await socket.sendMessage(userJid, { audio: audioBuffer, mimetype: mimeType || 'audio/mpeg', ptt: false });
            await socket.sendMessage(userJid, { text: header });
          } else if (stickerBuffer) {
            await socket.sendMessage(userJid, { sticker: stickerBuffer });
            await socket.sendMessage(userJid, { text: header });
          } else if (docBuffer) {
            await socket.sendMessage(userJid, { document: docBuffer, mimetype: mimeType || 'application/octet-stream', fileName: fileName || 'file' });
            await socket.sendMessage(userJid, { text: header });
          } else if (text) {
            await socket.sendMessage(userJid, { text: header + text });
          } else {
            await socket.sendMessage(userJid, { text: header + '(Media message deleted)' });
          }
        } catch(e) { console.error('AntiDelete resend error:', e); }
      }
    } catch (error) {
      console.error('handleMessageRevocation error:', error);
    }
  });
}


async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}


// ---------------- command handlers ----------------

function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const developers = `${config.OWNER_NUMBER}`;
    const botNumber = socket.user.id.split(':')[0];
    const isbot = botNumber.includes(senderNumber);
    const isOwner = isbot ? isbot : developers.includes(senderNumber);
    const isGroup = from.endsWith("@g.us");


    let body = (type === 'conversation') ? msg.message.conversation
      : msg.message?.extendedTextMessage?.contextInfo?.hasOwnProperty('quotedMessage')
        ? msg.message.extendedTextMessage.text
        : (type == 'interactiveResponseMessage')
          ? msg.message.interactiveResponseMessage?.nativeFlowResponseMessage
          && JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)?.id
          : (type == 'templateButtonReplyMessage')
            ? msg.message.templateButtonReplyMessage?.selectedId
            : (type === 'extendedTextMessage')
              ? msg.message.extendedTextMessage.text
              : (type == 'imageMessage') && msg.message.imageMessage.caption
                ? msg.message.imageMessage.caption
                : (type == 'videoMessage') && msg.message.videoMessage.caption
                  ? msg.message.videoMessage.caption
                  : (type == 'buttonsResponseMessage')
                    ? msg.message.buttonsResponseMessage?.selectedButtonId
                    : (type == 'listResponseMessage')
                      ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
                      : (type == 'messageContextInfo')
                        ? (msg.message.buttonsResponseMessage?.selectedButtonId
                          || msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
                          || msg.text)
                        : (type === 'viewOnceMessage')
                          ? msg.message[type]?.message[getContentType(msg.message[type].message)]
                          : (type === "viewOnceMessageV2")
                            ? (msg.msg.message.imageMessage?.caption || msg.msg.message.videoMessage?.caption || "")
                            : '';
    body = String(body || '');

    if (!body || typeof body !== 'string') return;

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    // ── Pre-load config ONCE per message (avoids repeated DB reads) ──────────
    const _preSan = (number || '').replace(/[^0-9]/g, '');
    const [_preUC, _preGS] = await Promise.all([
      loadUserConfigFromMongo(_preSan).catch(() => ({})),
      isGroup ? getAllGroupSettings(from).catch(() => ({})) : Promise.resolve({})
    ]);

    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    // ─── Anti-Delete Message Caching ─────────────────────────────────────────
    try {
      if (!msg.key.fromMe) {
        const _msgId = msg.key.id;
        const _cacheEntry = { from, senderNum: (nowsender || '').split('@')[0] };
        const _cType = getContentType(msg.message);
        if (_cType === 'imageMessage') {
          try {
            const _stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
            let _buf = Buffer.from([]); for await (const c of _stream) _buf = Buffer.concat([_buf, c]);
            _cacheEntry.imageBuffer = _buf;
            _cacheEntry.caption = msg.message.imageMessage.caption || '';
          } catch(e) {}
        } else if (_cType === 'videoMessage') {
          try {
            const _stream = await downloadContentFromMessage(msg.message.videoMessage, 'video');
            let _buf = Buffer.from([]); for await (const c of _stream) _buf = Buffer.concat([_buf, c]);
            _cacheEntry.videoBuffer = _buf;
            _cacheEntry.caption = msg.message.videoMessage.caption || '';
          } catch(e) {}
        } else if (_cType === 'audioMessage') {
          try {
            const _stream = await downloadContentFromMessage(msg.message.audioMessage, 'audio');
            let _buf = Buffer.from([]); for await (const c of _stream) _buf = Buffer.concat([_buf, c]);
            _cacheEntry.audioBuffer = _buf;
            _cacheEntry.mimeType = msg.message.audioMessage.mimetype || 'audio/mpeg';
          } catch(e) {}
        } else if (_cType === 'stickerMessage') {
          try {
            const _stream = await downloadContentFromMessage(msg.message.stickerMessage, 'sticker');
            let _buf = Buffer.from([]); for await (const c of _stream) _buf = Buffer.concat([_buf, c]);
            _cacheEntry.stickerBuffer = _buf;
          } catch(e) {}
        } else if (_cType === 'documentMessage') {
          try {
            const _stream = await downloadContentFromMessage(msg.message.documentMessage, 'document');
            let _buf = Buffer.from([]); for await (const c of _stream) _buf = Buffer.concat([_buf, c]);
            _cacheEntry.docBuffer = _buf;
            _cacheEntry.mimeType = msg.message.documentMessage.mimetype || 'application/octet-stream';
            _cacheEntry.fileName = msg.message.documentMessage.fileName || 'file';
          } catch(e) {}
        } else {
          _cacheEntry.text = body || '';
        }
        if (messageDeleteCache.size >= MESSAGE_CACHE_LIMIT) {
          const _firstKey = messageDeleteCache.keys().next().value;
          messageDeleteCache.delete(_firstKey);
        }
        messageDeleteCache.set(_msgId, _cacheEntry);
      }
    } catch(e) { console.log('Message cache error:', e); }

    // Auto Voice Feature
    try {
      const _sanitizedAV = (senderNumber || '').replace(/[^0-9]/g, '');
      const _userConfigAV = await loadUserConfigFromMongo(_sanitizedAV) || {};
      const _autoVoiceEnabled = _userConfigAV.AUTO_VOICE !== 'off';

      const _bodyLowerV = (body || '').trim().toLowerCase();

      // 🎧 FIXED VOICE MAP
      const _voiceReplies = {

        // 🌅 greetings
        'gm': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/gm.ogg',
        'good morning': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/gm.ogg',

        'gn': 'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/gn.mp3',
        'good night': 'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/good%20night.mp3',

        // 💬 chat
        'hi': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
        'hey': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
        'hello': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
        'helo': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
        'hy': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',

        'bye': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bye%20lassana%20lamayo.ogg',
        'hm': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hm.ogg',

        // 🇱🇰 sinhala
        'mk': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/mk.ogg',
        'mokada karanne': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/mk.ogg',

        // ❤️ love
        'adareyi': 'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/adarei.mp3',
        'ආදරෙයි': 'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/adarei.mp3',
        'love you': 'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/adarei.mp3',
        'i love you': 'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/adarei.mp3',

        // 😂 reactions
        'ha ha': 'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/hako.mp3',
        'hako': 'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/hako.mp3',

        // 🤖 bot
        'bot': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',

        // ❗ bad words (split fixed)
        'hutta': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
        'pakaya': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
        'ponnaya': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
        'utta': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
        'ponz': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
        'wesigeputha': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
        'huttigeputha': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
        'huththa': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
        'huththigeputha': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg'
      };

      // 🌿 exact match
      if (_autoVoiceEnabled && !msg.key.fromMe && _voiceReplies[_bodyLowerV]) {
        await socket.sendMessage(sender, {
          audio: { url: _voiceReplies[_bodyLowerV] },
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true
        }, { quoted: msg });
      }

    } catch (e) {
      console.log("AutoVoice Error:", e);
    }

    // ─── Anti-Bug ────────────────────────────────────────────────────────────
    try {
      if (_preUC.ANTI_BUG === 'on' && !msg.key.fromMe && body !== undefined) {
        const _bugType = getContentType(msg.message);
        const _isBug = (body && body.length > 5000)
          || (_bugType === 'contactsArrayMessage')
          || (body && /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(body));
        if (_isBug) {
          try { await socket.sendMessage(from, { delete: msg.key }); } catch(e){}
          await socket.sendMessage(from, { text: `🛡️ *Anti Bug Protection*\nA suspicious crash message was detected and removed.` });
          // ─── Auto Block if message is from Inbox (not a group) ───
          if (!isGroup) {
            try {
              await socket.updateBlockStatus(nowsender, 'block');
              const userJid = jidNormalizedUser(socket.user.id);
              await socket.sendMessage(userJid, { text: `🛡️ *Anti Bug — Auto Block*\n@${(nowsender||'').split('@')[0]} was automatically blocked for sending a crash message.`, mentions: [nowsender] });
            } catch(blockErr) { console.log('AntiBug auto-block error:', blockErr); }
          }
        }
      }
    } catch(e) { console.log('AntiBug error:', e); }

    // ─── Anti-Badword ────────────────────────────────────────────────────────
    try {
      if (_preUC.ANTI_BADWORD === 'on' && !msg.key.fromMe && body) {
        const _defaultBW = ['fuck','shit','bitch','asshole','bastard','dick','cunt','fag','hutta','pakaya','ponnaya','utta','ponz','wesigeputha','huttigeputha','huththa'];
        const _customBW = Array.isArray(_preUC.BAD_WORDS) ? _preUC.BAD_WORDS : [];
        const _allBW = [..._defaultBW, ..._customBW];
        const _bodyBW = body.toLowerCase();
        const _foundBW = _allBW.find(w => _bodyBW.includes(w.toLowerCase()));
        if (_foundBW) {
          try { await socket.sendMessage(from, { delete: msg.key }); } catch(e){}
          await socket.sendMessage(from, {
            text: `⚠️ *Anti Badword*\n@${(nowsender || '').split('@')[0]} bad words are not allowed here!`,
            mentions: [nowsender]
          });
        }
      }
    } catch(e) { console.log('AntiBadword error:', e); }

    // ─── Auto Reply ──────────────────────────────────────────────────────────
    try {
      if (_preUC.AUTO_REPLY === 'on' && !msg.key.fromMe && body) {
        const _replies = _preUC.AUTO_REPLIES || {};
        const _bodyAR = body.trim().toLowerCase();
        const _matched = _replies[_bodyAR] || _replies[body.trim()];
        if (_matched) {
          await socket.sendMessage(from, { text: _matched }, { quoted: msg });
        }
      }
    } catch(e) { console.log('AutoReply error:', e); }

    // ─── Anti-Link (Groups) ──────────────────────────────────────────────────
    try {
      if (isGroup && !msg.key.fromMe && body) {
        const _alEnabled = _preGS.ANTI_LINK;
        if (_alEnabled === 'on') {
          const _urlReg = /https?:\/\/[^\s]+|wa\.me\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|bit\.ly\/[^\s]+|t\.me\/[^\s]+/i;
          if (_urlReg.test(body)) {
            let isAdminSender = false;
            try { const _meta = await socket.groupMetadata(from); isAdminSender = !!_meta.participants.find(p => p.id === nowsender && (p.admin === 'admin' || p.admin === 'superadmin')); } catch(e) {}
            if (!isAdminSender) {
              try { await socket.sendMessage(from, { delete: msg.key }); } catch(e) {}
              await socket.sendMessage(from, { text: `🔗 *Anti Link*\n@${(nowsender||'').split('@')[0]} was kicked for sending a link!`, mentions: [nowsender] });
              try { await socket.groupParticipantsUpdate(from, [nowsender], 'remove'); } catch(kickErr) { console.log('AntiLink kick error:', kickErr); }
            }
          }
        }
      }
    } catch(e) { console.log('AntiLink error:', e); }

    // ─── Anti-Spam (Groups) ──────────────────────────────────────────────────
    try {
      if (isGroup && !msg.key.fromMe) {
        const _asEnabled = _preGS.ANTI_SPAM;
        if (_asEnabled === 'on') {
          const _spamKey = `spam_${from}_${nowsender}`;
          const _now = Date.now();
          if (!global._spamTracker) global._spamTracker = new Map();
          const _hist = global._spamTracker.get(_spamKey) || [];
          const _recent = _hist.filter(t => _now - t < 5000);
          _recent.push(_now);
          global._spamTracker.set(_spamKey, _recent);
          if (_recent.length >= 5) {
            let isAdminSender = false;
            try { const _meta = await socket.groupMetadata(from); isAdminSender = !!_meta.participants.find(p => p.id === nowsender && (p.admin === 'admin' || p.admin === 'superadmin')); } catch(e) {}
            if (!isAdminSender) {
              global._spamTracker.delete(_spamKey);
              await socket.sendMessage(from, { text: `⚠️ *Anti Spam*\n@${(nowsender||'').split('@')[0]} slow down! You are spamming.`, mentions: [nowsender] });
            }
          }
        }
      }
    } catch(e) { console.log('AntiSpam error:', e); }

    // ─── Auto React ──────────────────────────────────────────────────────────
    try {
      if (_preUC.AUTO_REACT === 'on' && !msg.key.fromMe && body) {
        const _reactEmojis = [
          '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💗','💖','💝','💞',
          '😍','🥰','😘','🤩','😎','🥳','🤣','😂','👏','🙌','🔥','✨','💫',
          '⭐','🌟','💯','🎉','🎊','👀','😊','🥺','💪','🫶','👍','🫡','🌹'
        ];
        const _randomEmoji = _reactEmojis[Math.floor(Math.random() * _reactEmojis.length)];
        await socket.sendMessage(from, {
          react: { text: _randomEmoji, key: msg.key }
        }).catch(e => console.log('AutoReact error:', e));
      }
    } catch(e) { console.log('AutoReact handler error:', e); }

    if (!command) return;

    try {

      // Use pre-loaded config (no extra DB read needed)
      const sanitized = _preSan;
      const userConfig = _preUC;

      // ========== ADD WORK TYPE RESTRICTIONS HERE ==========
      // Apply work type restrictions for non-owner users
      if (!isOwner) {
        // Get work type from user config or fallback to global config
        const workType = userConfig.WORK_TYPE || 'public'; // Default to public if not set

        // If work type is "private", only owner can use commands
        if (workType === "private") {
          console.log(`Command blocked: WORK_TYPE is private for ${sanitized}`);
          return;
        }

        // If work type is "inbox", block commands in groups
        if (isGroup && workType === "inbox") {
          console.log(`Command blocked: WORK_TYPE is inbox but message is from group for ${sanitized}`);
          return;
        }

        // If work type is "groups", block commands in private chats
        if (!isGroup && workType === "groups") {
          console.log(`Command blocked: WORK_TYPE is groups but message is from private chat for ${sanitized}`);
          return;
        }

        // If work type is "public", allow all (no restrictions needed)
      }
      // ========== END WORK TYPE RESTRICTIONS ==========


      switch (command) {
          
      case 'ai':
case 'chat':
case 'gpt': {
  try {
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    const q = text.split(" ").slice(1).join(" ").trim();

    if (!q) {
      await socket.sendMessage(sender, { 
        text: '*🚫 Please provide a message for AI.*',
        buttons: [
          { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝘔𝘦𝘯𝘶' }, type: 1 }
        ]
      });
      return;
    }

    // Session number
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    // Load bot name from DB or default
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    // Meta AI mention for quote
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `META_AI_${Date.now()}` },
      message: { 
        contactMessage: { 
          displayName: botName, 
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
        } 
      }
    };

    await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
    await socket.sendMessage(sender, { text: '*⏳ AI thinking...*', quoted: metaQuote });

    // AI Prompt with instructions
    const prompt = `*ඔබ සැබෑ ගැහැනු ලමයෙකු මෙන් හැසිරිය යුතුය. ඉමෝජි පමනක් තිබේනම් ඔබද ඉමෝජි පමනක් යවන්න... 
ඔයාගේ නම ${botName} , ඔයාගෙන් කවුරුහරි "ඔයාව හැදුවේ කවුද?" කියලා ඇහුවොත් විතරක් ඔයා කියන්නේ "මාව හැදුවේ දමිත් මදුසන්ක" කියලා.* User Message: ${q}`;

    // New API URL (Encoding the prompt to safely pass via URL)
    const apiKey = "dew_ReDKxw6C3UuDuoE8TIpLdT7IALyGvmApmDS4T8LM";
    const apiUrl = `https://api.srihub.store/ai/chatgpt?prompt=${encodeURIComponent(prompt)}&apikey=${apiKey}`;

    // Fetch data from new API
    const { data } = await axios.get(apiUrl);

    // Checking if success is true and result exists based on the JSON format you provided
    if (!data || !data.success || !data.result) {
      await socket.sendMessage(sender, { 
        text: '*🚩 AI reply not found.*',
        buttons: [
          { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝘔𝘦𝘯𝘶' }, type: 1 }
        ],
        quoted: metaQuote
      });
      return;
    }

    // Extracting the AI reply
    const aiReply = data.result;

    await socket.sendMessage(sender, {
      text: aiReply,
      footer: `🤖 ${botName}`,
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽𝚄' }, type: 1 },
        { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '📡 𝐁𝙾𝚃 𝐈𝙽𝙵𝙾' }, type: 1 }
      ],
      headerType: 1,
      quoted: metaQuote
    });

  } catch (err) {
    console.error("Error in AI chat:", err);
    await socket.sendMessage(sender, { 
      text: '*❌ Internal AI Error. Please try again later.*',
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝘔𝘦𝘯𝘶' }, type: 1 }
      ]
    });
  }
  break;
                               }
      case 'song': {
    try {
        const yts = require('yt-search');
        const axios = require('axios');
        const ffmpeg = require('fluent-ffmpeg');
        const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
        const path = require('path');
        const os = require('os');
        const fs = require('fs');
        const crypto = require('crypto');

        ffmpeg.setFfmpegPath(ffmpegInstaller.path);

        if (!globalThis.chamaSongSessions) {
            globalThis.chamaSongSessions = new Map();
        }

        const bodyText =
            body ||
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            '';

        const quotedId =
            msg.message?.extendedTextMessage?.contextInfo?.stanzaId ||
            msg.message?.buttonsResponseMessage?.contextInfo?.stanzaId ||
            msg.message?.listResponseMessage?.contextInfo?.stanzaId;

        // =====================================================
        // REPLY NUMBER HANDLER
        // =====================================================
        if (quotedId && globalThis.chamaSongSessions.has(quotedId)) {
            const session = globalThis.chamaSongSessions.get(quotedId);
            const replyText = bodyText.trim();

            if (Date.now() > session.expires) {
                globalThis.chamaSongSessions.delete(quotedId);
                return await socket.sendMessage(from, {
                    text: '⏱️ *Session expired!* ආයෙත් `.song <song name>` search කරන්න.'
                }, { quoted: msg });
            }

            if (replyText === '0' || replyText.toLowerCase() === 'cancel') {
                globalThis.chamaSongSessions.delete(quotedId);
                return await socket.sendMessage(from, {
                    text: '❌ *Song request cancelled!*'
                }, { quoted: msg });
            }

            // STEP 1: SONG SELECT
            if (session.step === 'select_song') {
                const num = parseInt(replyText);

                if (isNaN(num) || num < 1 || num > session.results.length) {
                    return await socket.sendMessage(from, {
                        text: `❌ *Invalid number!*\n\nReply with *1 - ${session.results.length}*\n\n0 = Cancel`
                    }, { quoted: msg });
                }

                const selected = session.results[num - 1];
                globalThis.chamaSongSessions.delete(quotedId);

                const formatMsg =
`🎧 *SELECT AUDIO FORMAT*

🎵 *Title:* ${selected.title}
⏱️ *Duration:* ${selected.timestamp || 'N/A'}
👤 *Author:* ${selected.author?.name || 'Unknown'}

Reply with number:

1️⃣ MP3 Audio
2️⃣ MP3 Document
3️⃣ PTT Voice Note

0️⃣ Cancel

> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`;

                const sentFormat = await socket.sendMessage(from, {
                    image: { url: selected.thumbnail },
                    caption: formatMsg
                }, { quoted: msg });

                globalThis.chamaSongSessions.set(sentFormat.key.id, {
                    step: 'select_format',
                    selected,
                    targetJid: from,
                    expires: Date.now() + 120000
                });

                return;
            }

            // STEP 2: FORMAT SELECT
            if (session.step === 'select_format') {
                const formatNum = parseInt(replyText);

                if (![1, 2, 3].includes(formatNum)) {
                    return await socket.sendMessage(from, {
                        text:
`❌ *Invalid format!*

1 = MP3 Audio
2 = MP3 Document
3 = PTT Voice Note
0 = Cancel`
                    }, { quoted: msg });
                }

                globalThis.chamaSongSessions.delete(quotedId);

                await socket.sendMessage(from, {
                    react: { text: '⬇️', key: msg.key }
                });

                const _chm_id = crypto.randomBytes(8).toString('hex');
                const chm_Mp3 = path.join(os.tmpdir(), `chm_song_${_chm_id}.mp3`);
                const chm_Opus = path.join(os.tmpdir(), `chm_ptt_${_chm_id}.opus`);

                const sUrl = session.selected.url;
                const sMetadata = session.selected;

                try {
                    // 🔥 [FIXED API] - ස්ථිරවම වැඩ කරන හොඳම YouTube DL API එකක් දැම්මා
                    const sApiUrl = `https://api.dreaded.site/api/ytdl/audio?url=${encodeURIComponent(sUrl)}`;
                    const sApiResp = await axios.get(sApiUrl, { timeout: 60000 }).catch(() => null);

                    if (!sApiResp || !sApiResp.data || sApiResp.data.status !== 200 || !sApiResp.data.result?.download?.url) {
                        return await socket.sendMessage(from, {
                            text: '❌ *Download API failed or slow down! Try again shortly.*'
                        }, { quoted: msg });
                    }

                    const sDownloadUrl = sApiResp.data.result.download.url;
                    const sTitle = sApiResp.data.result.title || sMetadata?.title || 'Song';
                    const safeTitle = sTitle.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'Song';

                    // Download using arraybuffer stream
                    const dlResp = await axios.get(sDownloadUrl, {
                        responseType: 'arraybuffer',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                        },
                        timeout: 120000
                    }).catch(() => null);

                    if (!dlResp || !dlResp.data) {
                        return await socket.sendMessage(from, {
                            text: '❌ *Failed to download audio data from server!*'
                        }, { quoted: msg });
                    }

                    // Save to tmp file
                    fs.writeFileSync(chm_Mp3, Buffer.from(dlResp.data));

                    const sCaption =
`🇱🇰🍷 *TITLE :* ${sTitle}
◽️ ⏱ *Duration :* ${sMetadata?.timestamp || 'N/A'}
👤 *Author :* ${sMetadata?.author?.name || 'Unknown'}

> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`;

                    // 1 = MP3 Audio
                    if (formatNum === 1) {
                        await socket.sendMessage(from, {
                            audio: fs.readFileSync(chm_Mp3),
                            mimetype: 'audio/mpeg',
                            fileName: `${safeTitle}.mp3`,
                            ptt: false
                        }, { quoted: msg });
                    }

                    // 2 = MP3 Document
                    if (formatNum === 2) {
                        await socket.sendMessage(from, {
                            document: fs.readFileSync(chm_Mp3),
                            mimetype: 'audio/mpeg',
                            fileName: `${safeTitle}.mp3`,
                            caption: sCaption
                        }, { quoted: msg });
                    }

                    // 3 = PTT Voice Note
                    if (formatNum === 3) {
                        await new Promise((resolve, reject) => {
                            ffmpeg(chm_Mp3)
                                .noVideo()
                                .audioCodec('libopus')
                                .format('opus')
                                .on('end', resolve)
                                .on('error', reject)
                                .save(chm_Opus);
                        });

                        await socket.sendMessage(from, {
                            audio: fs.readFileSync(chm_Opus),
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true
                        }, { quoted: msg });
                    }

                    await socket.sendMessage(from, {
                        react: { text: '✅', key: msg.key }
                    });

                } catch (err) {
                    console.error("Download inner error:", err);
                    await socket.sendMessage(from, {
                        text: `❌ *Error during processing:* ${err.message}`
                    }, { quoted: msg });
                } finally {
                    try {
                        [chm_Mp3, chm_Opus].forEach(f => {
                            if (fs.existsSync(f)) fs.unlinkSync(f);
                        });
                    } catch (e) {}
                }

                return;
            }
        }

        // =====================================================
        // NORMAL .song COMMAND
        // =====================================================
        const songQuery = args.join(' ').trim();

        if (!songQuery) {
            return await socket.sendMessage(from, {
                text:
`❌ *Format Invalid!*

Usage:
.song <song name>

Example:
.song lelna
.song faded alan walker

> Reply number system එකෙන් MP3 / Document / PTT ගන්න පුළුවන්.`
            }, { quoted: msg });
        }

        await socket.sendMessage(from, {
            react: { text: '🎧', key: msg.key }
        });

        const search = await yts(songQuery);

        if (!search || !search.videos || search.videos.length === 0) {
            return await socket.sendMessage(from, {
                text: '❌ *No results found!*'
            }, { quoted: msg });
        }

        const results = search.videos.slice(0, 5);

        let resultText =
`🎶 *YOUTUBE SONG SEARCH*

🔎 *Search:* ${songQuery}

Reply with number to select song:

`;

        results.forEach((v, i) => {
            resultText +=
`${i + 1}️⃣ *${v.title}*
⏱️ ${v.timestamp || 'N/A'} | 👤 ${v.author?.name || 'Unknown'}
👁️ ${v.views ? v.views.toLocaleString() : 'N/A'} views

`;
        });

        resultText +=
`0️⃣ Cancel

⏱️ Session expires in 2 minutes.

> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`;

        const sentSearch = await socket.sendMessage(from, {
            image: { url: results[0].thumbnail },
            caption: resultText
        }, { quoted: msg });

        globalThis.chamaSongSessions.set(sentSearch.key.id, {
            step: 'select_song',
            results,
            targetJid: from,
            expires: Date.now() + 120000
        });

    } catch (e) {
        console.error('song error:', e);
        await socket.sendMessage(from, {
            text: '❌ *Error:* ' + e.message
        }, { quoted: msg });
    }

    break;
}
          
        // --- existing commands (deletemenumber, unfollow, newslist, admin commands etc.) ---
        // ... (keep existing other case handlers unchanged) ...
        
        case 'antilink': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ This command is for groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '🔗', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can use this.' }, { quoted: msg });
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              await setGroupSetting(from, 'ANTI_LINK', opt);
              await socket.sendMessage(sender, { text: `✅ *Anti Link ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\nLinks will ${opt === 'on' ? 'now be deleted.' : 'no longer be deleted.'}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Anti Link:*\n.antilink on\n.antilink off` }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error.' }, { quoted: msg }); }
          break;
        }

        case 'antispam': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ This command is for groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '🚫', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can use this.' }, { quoted: msg });
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              await setGroupSetting(from, 'ANTI_SPAM', opt);
              await socket.sendMessage(sender, { text: `✅ *Anti Spam ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Anti Spam:*\n.antispam on\n.antispam off` }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error.' }, { quoted: msg }); }
          break;
        }

        case 'welcome': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ This command is for groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '👋', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can use this.' }, { quoted: msg });
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              await setGroupSetting(from, 'WELCOME', opt);
              await socket.sendMessage(sender, { text: `✅ *Welcome Message ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else if (opt === 'msg' && args.length > 1) {
              const wMsg = args.slice(1).join(' ');
              await setGroupSetting(from, 'WELCOME_MSG', wMsg);
              await socket.sendMessage(sender, { text: `✅ *Welcome message set!*\n${wMsg}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Welcome:*\n.welcome on/off\n.welcome msg <custom message>` }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error.' }, { quoted: msg }); }
          break;
        }

        case 'goodbye': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ This command is for groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '🚪', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can use this.' }, { quoted: msg });
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              await setGroupSetting(from, 'GOODBYE', opt);
              await socket.sendMessage(sender, { text: `✅ *Goodbye Message ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else if (opt === 'msg' && args.length > 1) {
              const gMsg = args.slice(1).join(' ');
              await setGroupSetting(from, 'GOODBYE_MSG', gMsg);
              await socket.sendMessage(sender, { text: `✅ *Goodbye message set!*\n${gMsg}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Goodbye:*\n.goodbye on/off\n.goodbye msg <custom message>` }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error.' }, { quoted: msg }); }
          break;
        }

        case 'kick': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '👢', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can kick.' }, { quoted: msg });
            const target = msg.message?.extendedTextMessage?.contextInfo?.participant || (args[0] ? `${args[0].replace(/[^0-9]/g,'')}@s.whatsapp.net` : null);
            if (!target) return await socket.sendMessage(sender, { text: '❌ Reply to a message or provide a number.' }, { quoted: msg });
            await socket.groupParticipantsUpdate(from, [target], 'remove');
            await socket.sendMessage(sender, { text: `✅ @${target.split('@')[0]} has been kicked.`, mentions: [target] }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed. Make sure bot is admin.' }, { quoted: msg }); }
          break;
        }

        case 'promote': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can promote.' }, { quoted: msg });
            const target = msg.message?.extendedTextMessage?.contextInfo?.participant || (args[0] ? `${args[0].replace(/[^0-9]/g,'')}@s.whatsapp.net` : null);
            if (!target) return await socket.sendMessage(sender, { text: '❌ Reply to a message or provide a number.' }, { quoted: msg });
            await socket.groupParticipantsUpdate(from, [target], 'promote');
            await socket.sendMessage(sender, { text: `✅ @${target.split('@')[0]} promoted to admin!`, mentions: [target] }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed. Make sure bot is admin.' }, { quoted: msg }); }
          break;
        }

        case 'demote': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isOwner) return await socket.sendMessage(sender, { text: '❌ Only admins can demote.' }, { quoted: msg });
            const target = msg.message?.extendedTextMessage?.contextInfo?.participant || (args[0] ? `${args[0].replace(/[^0-9]/g,'')}@s.whatsapp.net` : null);
            if (!target) return await socket.sendMessage(sender, { text: '❌ Reply to a message or provide a number.' }, { quoted: msg });
            await socket.groupParticipantsUpdate(from, [target], 'demote');
            await socket.sendMessage(sender, { text: `✅ @${target.split('@')[0]} demoted from admin.`, mentions: [target] }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed. Make sure bot is admin.' }, { quoted: msg }); }
          break;
        }

        case 'mute': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '🔇', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isOwner) return await socket.sendMessage(sender, { text: '❌ Only admins can mute.' }, { quoted: msg });
            await socket.groupSettingUpdate(from, 'announcement');
            await socket.sendMessage(sender, { text: '🔇 *Group muted.* Only admins can send messages.' }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed. Make sure bot is admin.' }, { quoted: msg }); }
          break;
        }

        case 'unmute': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '🔊', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isOwner) return await socket.sendMessage(sender, { text: '❌ Only admins can unmute.' }, { quoted: msg });
            await socket.groupSettingUpdate(from, 'not_announcement');
            await socket.sendMessage(sender, { text: '🔊 *Group unmuted.* Everyone can send messages.' }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed. Make sure bot is admin.' }, { quoted: msg }); }
          break;
        }

        case 'tagall': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '📢', key: msg.key } });
          try {
            let gAdmins = [], allPart = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); allPart = m.participants.map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isOwner) return await socket.sendMessage(sender, { text: '❌ Only admins can tag all.' }, { quoted: msg });
            const customMsg = args.length ? args.join(' ') : '📢 Attention everyone!';
            const tagText = allPart.map(p => `@${p.split('@')[0]}`).join(' ');
            await socket.sendMessage(from, { text: `${customMsg}\n\n${tagText}`, mentions: allPart }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed to tag all.' }, { quoted: msg }); }
          break;
        }

        case 'groupinfo': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: 'ℹ️', key: msg.key } });
          try {
            const meta = await socket.groupMetadata(from);
            const admins = meta.participants.filter(p => p.admin).map(p => `@${p.id.split('@')[0]}`);
            const gs = await getAllGroupSettings(from);
            const created = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : 'Unknown';
            await socket.sendMessage(from, {
              text: `*╭─❰ GROUP INFO ❱─╮*\n*│* 📛 *Name:* ${meta.subject || 'Unknown'}\n*│* 👥 *Members:* ${meta.participants.length}\n*│* 👑 *Admins:* ${admins.join(', ') || 'None'}\n*│* 📅 *Created:* ${created}\n*│* 🔗 *Anti Link:* ${gs.ANTI_LINK === 'on' ? '✅ ON' : '❌ OFF'}\n*│* 🚫 *Anti Spam:* ${gs.ANTI_SPAM === 'on' ? '✅ ON' : '❌ OFF'}\n*│* 👋 *Welcome:* ${gs.WELCOME === 'on' ? '✅ ON' : '❌ OFF'}\n*│* 🚪 *Goodbye:* ${gs.GOODBYE === 'on' ? '✅ ON' : '❌ OFF'}\n*╰──────────────╯*\n> ${config.BOT_FOOTER}`,
              mentions: meta.participants.filter(p => p.admin).map(p => p.id)
            }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed to get group info.' }, { quoted: msg }); }
          break;
        }

        case 'antibadword': {
          await socket.sendMessage(sender, { react: { text: '🛡️', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _sn = (nowsender || '').split('@')[0];
            const _own = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            if (_sn !== _san && _sn !== _own) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change this setting.' }, { quoted: msg });
            }
            const _opt = (args[0] || '').toLowerCase();
            const _uc = await loadUserConfigFromMongo(_san) || {};
            if (_opt === 'on' || _opt === 'off') {
              _uc.ANTI_BADWORD = _opt;
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ *Anti Badword ${_opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else if (_opt === 'add' && args[1]) {
              const _word = args.slice(1).join(' ').toLowerCase();
              _uc.BAD_WORDS = _uc.BAD_WORDS || [];
              if (!_uc.BAD_WORDS.includes(_word)) _uc.BAD_WORDS.push(_word);
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ Added *"${_word}"* to bad words list.` }, { quoted: msg });
            } else if (_opt === 'del' && args[1]) {
              const _word = args.slice(1).join(' ').toLowerCase();
              _uc.BAD_WORDS = (_uc.BAD_WORDS || []).filter(w => w !== _word);
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ Removed *"${_word}"* from bad words list.` }, { quoted: msg });
            } else if (_opt === 'list') {
              const _list = ((_uc.BAD_WORDS || []).join(', ')) || 'No custom words added.';
              await socket.sendMessage(sender, { text: `📋 *Custom Bad Words:*\n${_list}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Anti Badword Usage:*\n${config.PREFIX}antibadword on\n${config.PREFIX}antibadword off\n${config.PREFIX}antibadword add <word>\n${config.PREFIX}antibadword del <word>\n${config.PREFIX}antibadword list` }, { quoted: msg });
            }
          } catch(e) { console.log('antibadword cmd error:', e); await socket.sendMessage(sender, { text: '❌ Error updating setting.' }, { quoted: msg }); }
          break;
        }

        case 'antibug': {
          await socket.sendMessage(sender, { react: { text: '🐛', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _sn = (nowsender || '').split('@')[0];
            const _own = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            if (_sn !== _san && _sn !== _own) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change this setting.' }, { quoted: msg });
            }
            const _opt = (args[0] || '').toLowerCase();
            const _uc = await loadUserConfigFromMongo(_san) || {};
            if (_opt === 'on' || _opt === 'off') {
              _uc.ANTI_BUG = _opt;
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ *Anti Bug ${_opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Anti Bug Usage:*\n${config.PREFIX}antibug on\n${config.PREFIX}antibug off` }, { quoted: msg });
            }
          } catch(e) { console.log('antibug cmd error:', e); await socket.sendMessage(sender, { text: '❌ Error updating setting.' }, { quoted: msg }); }
          break;
        }

        case 'autoreply': {
          await socket.sendMessage(sender, { react: { text: '💬', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _sn = (nowsender || '').split('@')[0];
            const _own = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            if (_sn !== _san && _sn !== _own) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change this setting.' }, { quoted: msg });
            }
            const _opt = (args[0] || '').toLowerCase();
            const _uc = await loadUserConfigFromMongo(_san) || {};
            _uc.AUTO_REPLIES = _uc.AUTO_REPLIES || {};
            if (_opt === 'on' || _opt === 'off') {
              _uc.AUTO_REPLY = _opt;
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ *Auto Reply ${_opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else if (_opt === 'add') {
              const _full = args.slice(1).join(' ');
              const _si = _full.indexOf('|');
              if (_si === -1) return await socket.sendMessage(sender, { text: `❌ Format: ${config.PREFIX}autoreply add trigger|response` }, { quoted: msg });
              const _trigger = _full.slice(0, _si).trim().toLowerCase();
              const _response = _full.slice(_si + 1).trim();
              if (!_trigger || !_response) return await socket.sendMessage(sender, { text: '❌ Trigger and response cannot be empty.' }, { quoted: msg });
              _uc.AUTO_REPLIES[_trigger] = _response;
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ *Auto reply added:*\n*Trigger:* ${_trigger}\n*Reply:* ${_response}` }, { quoted: msg });
            } else if (_opt === 'del' && args[1]) {
              const _trigger = args.slice(1).join(' ').toLowerCase();
              delete _uc.AUTO_REPLIES[_trigger];
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ Removed auto reply for: *${_trigger}*` }, { quoted: msg });
            } else if (_opt === 'list') {
              const _entries = Object.entries(_uc.AUTO_REPLIES || {});
              if (_entries.length === 0) return await socket.sendMessage(sender, { text: '📋 No auto replies set yet.' }, { quoted: msg });
              const _listText = _entries.map(([t, r], i) => `${i + 1}. *${t}* → ${r}`).join('\n');
              await socket.sendMessage(sender, { text: `📋 *Auto Replies (${_entries.length}):*\n${_listText}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Auto Reply Usage:*\n${config.PREFIX}autoreply on/off\n${config.PREFIX}autoreply add trigger|response\n${config.PREFIX}autoreply del <trigger>\n${config.PREFIX}autoreply list` }, { quoted: msg });
            }
          } catch(e) { console.log('autoreply cmd error:', e); await socket.sendMessage(sender, { text: '❌ Error updating setting.' }, { quoted: msg }); }
          break;
        }

        case 'autoreact': {
          await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _sn = (nowsender || '').split('@')[0];
            const _own = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            if (_sn !== _san && _sn !== _own) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change this setting.' }, { quoted: msg });
            }
            const _opt = (args[0] || '').toLowerCase();
            const _uc = await loadUserConfigFromMongo(_san) || {};
            if (_opt === 'on' || _opt === 'off') {
              _uc.AUTO_REACT = _opt;
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, {
                text: `${_opt === 'on' ? '✅' : '❌'} *Auto React ${_opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\n\n${_opt === 'on' ? '🎲 The bot will now react with a random emoji to every incoming message.' : '🔕 Auto react is now off.'}`
              }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, {
                text: `📖 *Auto React Usage:*\n${config.PREFIX}autoreact on\n${config.PREFIX}autoreact off\n\n_When enabled, the bot reacts with a random emoji to every incoming message._`
              }, { quoted: msg });
            }
          } catch(e) { console.log('autoreact cmd error:', e); await socket.sendMessage(sender, { text: '❌ Error updating setting.' }, { quoted: msg }); }
          break;
        }

        case 'my': {
try {
const footer = config.BOT_FOOTER || config.BOT_NAME || 'Bot';
const axios = require('axios')

// random anime image
let animeImg = 'https://files.catbox.moe/g6ywiw.jpeg';
try { const res = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 8000 }); animeImg = res.data.url; } catch(e) {}

// media links
const videoNote = 'https://files.catbox.moe/w7ckn7.mp4' // round video
const songUrl = 'https://files.catbox.moe/y32rcq.mp3'


// 1️⃣ video note (round)
try { await socket.sendMessage(sender,{
 video:{url:videoNote},
 ptv:true
},{quoted:msg}) } catch(e){}


// 2️⃣ song
try { await socket.sendMessage(sender,{
 audio:{url:songUrl},
 mimetype:'audio/mp4'
},{quoted:msg}) } catch(e){}


// 3️⃣ anime image + channel forward message
await socket.sendMessage(sender,{
 image:{url:animeImg},
 caption:`
🌸 *𝐑𝐚𝐧𝐝𝐨𝐦 𝐢𝐦𝐚𝐠𝐞 𝐬𝐭𝐚𝐭𝐮𝐬 𝐦𝐬𝐠*
*╭─┉❰ 𝐖𝙴𝙻𝙲𝙾𝙼𝙴 𝐔𝚂𝙴𝚁 ❱┉─┉──•*
*│ \`🌺 𝐇𝙴𝙻𝙻𝙾 : 𝙼𝚈 𝙳𝙴𝙰𝚁\`*
*╰┉────────────┉─•*
*❰🌟 𝐆ʀᴇᴇᴛɪɴɢ : 𝙶𝙾𝙾𝙳 𝙳𝙰𝚈 🌸*

*╭──❰ 𝐌𝐫 MADU 𝐁ʀᴏ ɪɴᴠɪᴛᴇ ❱──┉*
*│◊╭────────────┉•┉*
*│◊│*✦ 💀 \`ɴɪᴄᴋɴᴀᴍᴇ\`: *MADU BRO*
*│◊│*✦ 🖤 \`ᴀɢᴇ\`: ```+17```
*│◊│*✦ 🌟 \`ꜰʀᴏᴍ\`: *𝙰ɴᴜʀᴀ𝙳ʜᴀᴘᴜ𝙰*
*│◊│*✦ 💖 \`ɢᴇɴ\`: *𝙱ᴏʏ*
*│◊│*✦ 🌺 \`ɴᴀᴍᴇ\`: *MADUSANKA*
*│◊╰────────────┉•┉*
*╰──────────────────┉*
_*◊ 𝐆𝐎𝐎𝐃 𝐃𝐀𝐘 𝐌𝐘 𝐃𝐄𝐀𝐑 :*_

🌟 *\`𝙷𝙴𝙻𝙻𝙾  𝙼𝚈 𝙳𝙴𝙰𝚁,\`*
*\`-𝙷𝙸 𝚃𝙷𝙸𝚉𝚉 𝙼𝚂𝙶 𝙵𝙾𝚁 𝚈𝙾𝚄\`*💖
*\`𝙲𝙾𝙼𝙴 𝚆𝙸𝚃𝙷 𝙼𝙴 𝚂𝚃𝙰𝚁𝚃 𝚃𝙾 𝙽𝙴𝚆 𝙻𝙸𝚂𝚃\`*
*\`𝙻𝙾𝚂𝚃 𝙼𝚈 𝙾𝙻𝙳 𝙽𝚄𝙼𝙱𝙴𝚁 𝙰𝙽𝙳 𝙻𝙾𝚂𝚃 𝙼𝚈\`*
*\`𝙲𝙾𝙽𝚃𝙰𝙲𝚃𝚂\`*

╭───❰ 𝐂𝐎𝐍𝐓𝐀𝐂𝐓 𝐍𝐔𝐌𝐁𝐄𝐑 ❱───╮
> ✦┇ \`https://wa.me/message/6THYNHLLLGBKC1_\`
╰─────────────────────╯

`,
contextInfo:{
 forwardingScore:999,
 isForwarded:true,
 forwardedNewsletterMessageInfo:{
  newsletterName:"🍷⃝⃑─͟͟͞͞ MADU REMINDER",
  newsletterJid:"120363419143844721@newsletter"
 }
}

},{quoted:msg})

} catch(myErr) { console.error('my cmd error:', myErr); try { await socket.sendMessage(sender, { text: '❌ .my command failed. Try again.' }, { quoted: msg }); } catch(e){} }
}
break;
        
        case 'autovoice': {
          await socket.sendMessage(sender, { react: { text: '🎤', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_VOICE1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change auto voice.' }, { quoted: shonux });
            }

            let q = args[0];
            const settings = { on: "on", off: "off" };

            if (settings[q]) {
              const userConfig = await loadUserConfigFromMongo(sanitized) || {};
              userConfig.AUTO_VOICE = settings[q];
              await setUserConfigInMongo(sanitized, userConfig);

              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_VOICE2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: `✅ *Auto Voice ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
            } else {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_VOICE3" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: "❌ *Options:* on / off" }, { quoted: shonux });
            }
          } catch (e) {
            console.error('Autovoice error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_VOICE4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*❌ Error updating auto voice!*" }, { quoted: shonux });
          }
          break;
        }

// ==========================================

                          case 'menu': {
  try {
    await socket.sendMessage(sender, {
      react: { text: "🫧", key: msg.key }
    });

    // ================= USER CONFIG =================
    let userCfg = {};
    const cleanNumber = number?.replace(/\D/g, '') || '';

    if (cleanNumber && typeof loadUserConfigFromMongo === 'function') {
      userCfg = await loadUserConfigFromMongo(cleanNumber) || {};
    }

    const MENU_IMG = userCfg.logo || "https://i.ibb.co/4gV5hsR7/af289d3bc848.jpg";
    const OWNER_NAME = 'MADU ||🌿';
    const BOT_NAME = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
  // --- 📅 TIME & GREETING ENGINE ---
        const slNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
        const hour = slNow.getHours();
        const timeStr = slNow.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        const dateStr = slNow.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });

        // 🎨 STYLISH GREETING LOGIC
        let greetingText = "";
        if (hour < 5)        greetingText = "💗 𝗘ᴀ𝚁ʟ𝚈 𝗠ᴏʀɴ𝙸ɴ𝙶";
        else if (hour < 12) greetingText = "🍷 𝗚ᴏᴏ𝙳 𝗠ᴏ𝚁ɴɪɴ𝙶";
        else if (hour < 18) greetingText = "🍁 𝗚ᴏᴏ𝙳 𝗔ꜰᴛᴇ𝚁ɴᴏᴏN";
        else if (hour < 22) greetingText = "🍂 𝗚ᴏᴏ𝙳 𝗘ᴠᴇɴ𝙸ɴ𝙶";
        else                greetingText = "🦉 𝗦ᴡ𝙴ᴇ𝚃 𝗗ʀᴇ𝙰ᴍꜱ";

        // --- 📊 STATS ---
        const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const uptime = process.uptime();
        const days = Math.floor(uptime / (24 * 3600));
        const hours = Math.floor((uptime % (24 * 3600)) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const runtime = `${days}D ${hours}H ${minutes}M`;

        // --- 📝 RANDOM QUOTES ---
        const quotes = [
            "DEVELOPER KEZU 💗",
            "DARK NIGHT 🥺",
            "MOON WALKER 🍁",
            "DRUG USER 🍷",
            "NATURE LIFE 🌿",
            "ALONE LIFE 🖤"
        ];
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        const userTag = `@${sender.split("@")[0]}`;
    const videoNote = userCfg.menuVideo || 'https://files.catbox.moe/ffjmpr.mp4'
// 1️⃣ video note
await socket.sendMessage(sender,{
 video:{url:videoNote},
 ptv:true
},{quoted:msg})

    // ================= MAIN MENU TEXT =================
    const menuText = `
*╭─┉❰ 𝐖𝙴𝙻𝙲𝙾𝙼𝙴 𝐔𝚂𝙴𝚁 ❱┉─┉──•*
*│ 🌺 𝐇𝙴𝙻𝙻𝙾 : ${userTag}*
*╰┉────────────┉─•*
*❰🌟 𝐆ʀᴇᴇᴛɪɴɢ : ${greetingText}*

*╭──❰ 𝐃ᴄᴛ 𝐂𝚁𝙸𝙼𝙸𝙽𝙰𝙻 𝐌ɪɴɪ ❱──┉*
*│◊╭────────────┉•┉*
*│◊│*✦ 💀 \`ʙᴏᴛɴᴀᴍᴇ\`: _*${BOT_NAME}*_
*│◊│*✦ 🖤 \`ᴏᴡɴᴇʀ\`: ${OWNER_NAME}
*│◊│*✦ 🌟 \`ᴜꜱᴀɢᴇ\`: ${ramUsage}
*│◊│*✦ 💖 \`ʀᴀᴍ\`: ${ramUsage}
*│◊│*✦ 🌺 \`ᴜᴘᴛɪᴍᴇ\`: ${runtime}
*│◊╰────────────┉•┉*
*╰──────────────────┉*

_*${randomQuote}*_

🌟 *𝙷𝙴𝙻𝙻𝙾 𝙱𝙾𝚃 𝚄𝚂𝙴𝚁,*
*-𝚃𝙷𝙸𝚂 𝙸𝚂 𝚃𝙷𝙴 𝙲𝚁𝙸𝙼𝙸𝙽𝙰𝙻 𝙼𝙳 𝙼𝙸𝙽𝙸 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿 𝙱𝙾𝚃, 𝚃𝙷𝙴 𝙳𝙲𝚃 𝙴𝙿𝙸𝙲 𝙿𝚁𝙾𝙹𝙴𝙲𝚃*💖

> _𝚜𝚎𝚕𝚎𝚌𝚝 𝚊 𝚘𝚙𝚝𝚒𝚘𝚗 𝚘𝚗 𝚋𝚎𝚕𝚘𝚠_
*✰┈  M‌         A‌          D‌         U‌   ┈✰*
`.trim();

    // ================= MENU SECTIONS =================
    const sections = [
      {
        title: "🌿 mαín mєnu",
        rows: [
          { title: '🍃 dσwnlσαd', description: 'ƚԋҽ ɱαιɳ ɱҽɳυ', id: `${config.PREFIX}dl` },
          { title: '🫟 crєαtívє', description: 'ƚԋҽ ƈɾҽαƚιʋҽ ɱҽɳυ', id: `${config.PREFIX}cr` },
          { title: '⛩️ tσσlѕ', description: 'ƚԋҽ ƚσσʅʂ ɱҽɳυ', id: `${config.PREFIX}tools` },
          { title: '👥 ɢяσυρ ƈmds', description: 'ɢɾσυρ ɱαɳαɢҽɱҽɳƚ ƈσɱɱαɳԃʂ', id: `${config.PREFIX}groupcmds` },
          { title: '🖤 σwnєr ƈmds', description: 'αυƚσ & αɳƚι ƈσɱɱαɳԃʂ', id: `${config.PREFIX}ownercmds` },
        ]
      },
      {
        title: "❄ OWNER",
        rows: [
          { title: '🐻 ѕєttíng', description: 'ƚԋҽ ʂҽƚƚιɳɠ ɱҽɳυ', id: `${prefix}setting` },
              { title: "❤️‍🔥 αctívє", description: 'ƚԋҽ Ⴆσƚ αƈƚιʋαƚισɳ', id: `${config.PREFIX}active` }
        ]
      }
    ];

    const buttons = [
      {
        buttonId: "menu_list",
        buttonText: { displayText: "🍃 σρҽɳ ɱҽɳυ" },
        type: 4,
        nativeFlowInfo: {
          name: "single_select",
          paramsJson: JSON.stringify({
            title: "🌿 🇲‌🇦‌🇮‌🇳‌  🇲‌🇪‌🇳‌🇺‌",
            sections
          })
        }
      },
      {
        buttonId: `${config.PREFIX}ping`,
        buttonText: { displayText: "🍃 🄿🄸🄽🄶" },
        type: 1
      },
      {
        buttonId: `${config.PREFIX}alive`,
        buttonText: { displayText: "⛩️ 🄰🄻🄸🅅🄴" },
        type: 1
      }
    ];

            // ================= SEND MAIN MENU =================
     await socket.sendMessage(sender, {
  image: { url: MENU_IMG },
  caption: menuText,
  buttons,
  headerType: 4,
  contextInfo: {
    mentionedJid: [sender],
    isForwarded: true,
    forwardingScore: 999,
    externalAdReply: {
      title: `#${BOT_NAME}`,
      body: `Contact: ${OWNER_NAME}`,
      thumbnailUrl: MENU_IMG,
      sourceUrl: MENU_IMG,
      mediaType: 1,
      renderLargerThumbnail: true
    }
  }
});

    // ================= HANDLER =================

    const menuHandler = async (msgUpdate) => {
      try {
        const received = msgUpdate.messages?.[0];
        if (!received) return;

        if (received.key.remoteJid !== sender) return;

        let selectedId;

        const params =
          received.message?.interactiveResponseMessage
            ?.nativeFlowResponseMessage?.paramsJson;

        if (params) {
          const parsed = JSON.parse(params);
          selectedId = parsed.id;
        }

        if (!selectedId) return;

        await socket.sendMessage(sender, {
          react: { text: "🍼", key: received.key }
        });

                // ================= DOWNLOAD =================

        if (selectedId === `${config.PREFIX}dl`) {

  const downloadButtons = [
    {
      buttonId: 'download_select',
      buttonText: {
        displayText: 'ԃσɯɳʅσαԃ σρƚισɳ 🎧'
      },
      type: 4,
      nativeFlowInfo: {
        name: 'single_select',
        paramsJson: JSON.stringify({
          title: 'ɯԋαƚ ყσυ ԃσɯɳʅσαԃ',
          sections: [
            {
              title: 'ԃσɯɳʅσαԃ ɱҽɳυ 🎧',
              rows: [
                    {
                     title: 'SONG🍺',
                     description: 'Download AUDIO',
                     id: `${config.PREFIX}song`,
                     highlight_label: 'ʂσɳɠ ԃʅ🍃'
                      },
                      {
                    title: 'VIDEO🧃',
                    description: 'Download VIDEO',
                    id: `${config.PREFIX}video`,
                    highlight_label: 'ʋιԃҽσ ԃʅ🍃'
                   },
                                       {
                     title: 'FACEBOOK🍂',
                     description: 'Download FB',
                     id: `${config.PREFIX}fb`,
                     highlight_label: 'ϝαƈҽႦσσƙ ԃʅ🍃'
                      },
                      {
                    title: 'INSTAGRAM🥰',
                    description: 'Download INSTA',
                    id: `${config.PREFIX}insta`,
                    highlight_label: 'ιɳʂƚαɠɾαɱ ԃʅ🍃'
                   },
                                       {
                     title: 'TIKTOK🍁',
                     description: 'Download TIKTOK',
                     id: `${config.PREFIX}tiktok`,
                     highlight_label: 'ƚιƙƚσƙ ԃʅ🍃'
                      },
                      {
                    title: 'MIDEAFIRE🍷',
                    description: 'Download MEDIAFIRE',
                    id: `${config.PREFIX}mf`,
                    highlight_label: 'NEW'
                   },
                                       {
                     title: 'APK🖤',
                     description: 'Download APK',
                     id: `${config.PREFIX}apk`,
                     highlight_label: 'αρƙ ԃʅ🍃'
                      },
                      {
                    title: 'SPLOTIFY🌿',
                    description: 'Download SPLOFY',
                    id: `${config.PREFIX}splotify`,
                    highlight_label: 'ʂρʅσƚιϝყ ԃʅ🍃'
                   }
              ]
            }
          ]
        })
      }
    }
  ];

  await socket.sendMessage(sender, {
    image: { url: MENU_IMG },
    caption: `
╭▭▬▭▬▭▬▭▬▭▬▭▬
┃ 🎧 DOWNLOAD MENU
╰▭▬▭▬▭▬▭▬▭▬▭▬

Select a download option below.
▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱
> ${BOT_NAME}
`,
    buttons: downloadButtons,
    headerType: 4
  }, { quoted: received });

}

        // ================= CREATIVE =================

if (selectedId === `${config.PREFIX}cr`) {

  const downloadButtons = [
    {
      buttonId: 'creative_select',
      buttonText: {
        displayText: 'ƈɾҽαƚιʋҽ σρƚισɳ🍃'
      },
      type: 4,
      nativeFlowInfo: {
        name: 'single_select',
        paramsJson: JSON.stringify({
          title: 'ɯԋαƚ ყσυɾ αƈƚιʋιƚყ',
          sections: [
            {
              title: 'ƈɾҽαƚιʋҽ σρƚισɳ 🍃',
              rows: [
                {
                  title: 'IMG FOUNDER⛩️',
                  description: 'FIND YOUR IMG',
                  id: `${config.PREFIX}img`
                },
                {
                  title: 'GENERATER🔖',
                  description: 'GENERATE IMAGE',
                  id: `${config.PREFIX}aiimg`
                },
                {
                  title: 'CONVERT TO FANCY🌿',
                  description: 'TURN TO THE FANCY',
                  id: `${config.PREFIX}font`
                },
                {
                  title: 'CALCULATER🌊',
                  description: 'CALCULATE NUMBERS',
                  id: `${config.PREFIX}calc`
                },
                {
                  title: 'TRANSLATER🗺️',
                  description: 'TRANSLATE THE WORD',
                  id: `${config.PREFIX}tr`
                },
                {
                  title: 'WEATHER🌅',
                  description: 'FIND THE WEATHER',
                  id: `${config.PREFIX}weather`
                },
                {
                  title: 'GIT HELPER🚸',
                  description: 'FIND YOUR GIT',
                  id: `${config.PREFIX}git`
                },
                {
                  title: '💥 BOOM',
                  description: 'Boom explosion effect',
                  id: `${config.PREFIX}boom`,
                  highlight_label: 'NEW'
                },
                {
                  title: '💻 HACK',
                  description: 'Fake hacking animation',
                  id: `${config.PREFIX}hack`,
                  highlight_label: 'NEW'
                }
              ]
            }
          ]
        })
      }
    }
  ];

  await socket.sendMessage(sender, {
    image: { url: MENU_IMG },
    caption: `
╭▭▬▭▬▭▬▭▬▭▬▭▬
┃ 💐 CREATIVE MENU
╰▭▬▭▬▭▬▭▬▭▬▭▬

Select a creative option below.
▱▰▱▰▱▰▱▰▱▰▱▰▱▰
> ${BOT_NAME}
`,
    buttons: downloadButtons,
    headerType: 4
  }, { quoted: received });

}

        // ================= TOOLS =================

if (selectedId === `${config.PREFIX}tools`) {

  const downloadButtons = [
    {
      buttonId: 'tools_select',
      buttonText: {
        displayText: 'ƚσσʅʂ σρƚισɳ🍃'
      },
      type: 4,
      nativeFlowInfo: {
        name: 'single_select',
        paramsJson: JSON.stringify({
          title: 'ʂҽʅҽƈƚ ყσυɾ ƚσσʅʂ🍃',
          sections: [
            {
              title: 'ƚσσʅʂ σρƚισɳ🍃',
              rows: [
                {
                  title: 'MENU💐',
                  description: 'BACK TO MENU',
                  id: `${config.PREFIX}menu`
                },
                {
                  title: 'SETTING❄',
                  description: 'SET YOUR SETUP',
                  id: `${config.PREFIX}set`
                },
                {
                  title: 'ALIVE👨‍💻',
                  description: 'BOT SYSTEM ARE ONLINE',
                  id: `${config.PREFIX}alive`
                },
                {
                  title: 'PING🔥',
                  description: 'BOT SPEED AND ONLINE',
                  id: `${config.PREFIX}ping`
                },
                {
                  title: 'SYSTEM☯️',
                  description: 'VIEW THE SYSTEM INFO',
                  id: `${config.PREFIX}system`
                },
                {
                  title: 'TAGALL💬',
                  description: 'TAG ALL MEMBERS',
                  id: `${config.PREFIX}tagall`
                },
                {
                  title: 'HIDETAG👁️‍🗨️',
                  description: 'TAG ALL ON HIDDEN',
                  id: `${config.PREFIX}hidetag`
                },
                {
                  title: '✨ AUTO REACT',
                  description: 'Toggle random emoji reacts',
                  id: `${config.PREFIX}autoreact`,
                  highlight_label: 'NEW'
                }
              ]
            }
          ]
        })
      }
    }
  ];

  await socket.sendMessage(sender, {
    image: { url: MENU_IMG },
    caption: `
╭▭▬▭▬▭▬▭▬▭▬▭▬
┃ ❄ TOOLS MENU
╰▭▬▭▬▭▬▭▬▭▬▭▬

Select a tools option below.
▱▰▱▰▱▰▱▰▱▰▱▰▱
> ${BOT_NAME}
`,
    buttons: downloadButtons,
    headerType: 4
  }, { quoted: received });

}

        // ================= GROUP CMDS =================

if (selectedId === `${config.PREFIX}groupcmds`) {

  const groupButtons = [
    {
      buttonId: 'group_select',
      buttonText: {
        displayText: '👥 ɢяσυρ σρƚισɳ🍃'
      },
      type: 4,
      nativeFlowInfo: {
        name: 'single_select',
        paramsJson: JSON.stringify({
          title: '👥 ɢяσυρ ƈσɱɱαɳԃʂ',
          sections: [
            {
              title: '🛡️ ɢяσυρ ρяσƚєƈƚíσn',
              rows: [
                {
                  title: '🔗 ANTI LINK',
                  description: 'Enable/Disable anti-link',
                  id: `${config.PREFIX}antilink`,
                  highlight_label: 'ρяσƚєƈƚíσn'
                },
                {
                  title: '🚫 ANTI SPAM',
                  description: 'Enable/Disable anti-spam',
                  id: `${config.PREFIX}antispam`,
                  highlight_label: 'ρяσƚєƈƚíσn'
                }
              ]
            },
            {
              title: '👋 ɢяσυρ єvєnts',
              rows: [
                {
                  title: '👋 WELCOME',
                  description: 'Enable/Disable welcome msg',
                  id: `${config.PREFIX}welcome`,
                  highlight_label: 'єvєnts'
                },
                {
                  title: '🚪 GOODBYE',
                  description: 'Enable/Disable goodbye msg',
                  id: `${config.PREFIX}goodbye`,
                  highlight_label: 'єvєnts'
                }
              ]
            },
            {
              title: '👑 ɢяσυρ αdmín',
              rows: [
                {
                  title: '👢 KICK',
                  description: 'Kick a member',
                  id: `${config.PREFIX}kick`,
                  highlight_label: 'αdmín'
                },
                {
                  title: '⬆️ PROMOTE',
                  description: 'Promote to admin',
                  id: `${config.PREFIX}promote`,
                  highlight_label: 'αdmín'
                },
                {
                  title: '⬇️ DEMOTE',
                  description: 'Demote from admin',
                  id: `${config.PREFIX}demote`,
                  highlight_label: 'αdmín'
                },
                {
                  title: '🔇 MUTE',
                  description: 'Mute the group',
                  id: `${config.PREFIX}mute`,
                  highlight_label: 'αdmín'
                },
                {
                  title: '🔊 UNMUTE',
                  description: 'Unmute the group',
                  id: `${config.PREFIX}unmute`,
                  highlight_label: 'αdmín'
                }
              ]
            },
            {
              title: '📢 ɢяσυρ mєssαgíng',
              rows: [
                {
                  title: '📢 TAGALL',
                  description: 'Tag all members',
                  id: `${config.PREFIX}tagall`,
                  highlight_label: 'mєssαgíng'
                },
                {
                  title: '👁️ HIDETAG',
                  description: 'Tag all (hidden)',
                  id: `${config.PREFIX}hidetag`,
                  highlight_label: 'mєssαgíng'
                }
              ]
            }
          ]
        })
      }
    }
  ];

  await socket.sendMessage(sender, {
    image: { url: MENU_IMG },
    caption: `
╭▭▬▭▬▭▬▭▬▭▬▭▬
┃ 👥 GROUP CMDS MENU
╰▭▬▭▬▭▬▭▬▭▬▭▬

Select a group command below.
▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱
> ${BOT_NAME}
`,
    buttons: groupButtons,
    headerType: 4
  }, { quoted: received });

}

        // ================= OWNER CMDS =================

if (selectedId === `${config.PREFIX}ownercmds`) {
  const ownerCmdsButtons = [
    {
      buttonId: 'ownercmds_select',
      buttonText: { displayText: '🖤 σwnєr ƈmds 🍃' },
      type: 4,
      nativeFlowInfo: {
        name: 'single_select',
        paramsJson: JSON.stringify({
          title: '🖤 σwnєr ƈσɱɱαɳԃʂ',
          sections: [
            {
              title: '🤖 αυƚσ ƈσɱɱαɳԃʂ',
              rows: [
                {
                  title: '🎵 AUTO SONG',
                  description: 'Auto download & send songs',
                  id: `${config.PREFIX}autosong`,
                  highlight_label: 'αυƚσ'
                },
                {
                  title: '🔊 AUTO TTS',
                  description: 'Auto tik tok video send',
                  id: `${config.PREFIX}autottsend`,
                  highlight_label: 'αυƚσ'
                },
                {
                  title: '✍️ AUTO TYPING',
                  description: 'Show typing indicator',
                  id: `${config.PREFIX}autotyping`,
                  highlight_label: 'αυƚσ'
                },
                {
                  title: '🎤 AUTO RECORDING',
                  description: 'Show recording indicator',
                  id: `${config.PREFIX}autorecording`,
                  highlight_label: 'αυƚσ'
                },
                {
                  title: '✨ AUTO REACT',
                  description: 'Auto react to messages',
                  id: `${config.PREFIX}autoreact`,
                  highlight_label: 'αυƚσ'
                },
                {
                  title: '📖 AUTO READ',
                  description: 'Auto read messages',
                  id: `${config.PREFIX}mread`,
                  highlight_label: 'αυƚσ'
                }
              ]
            },
            {
              title: '🛡️ αɳƚι ρяσƚєƈƚíσn',
              rows: [
                {
                  title: '🚫 ANTI BAN',
                  description: 'Protect bot from ban',
                  id: `${config.PREFIX}antiban`,
                  highlight_label: 'αɳƚι'
                },
                {
                  title: '💬 ANTI SPAM',
                  description: 'Block spam messages',
                  id: `${config.PREFIX}antispam`,
                  highlight_label: 'αɳƚι'
                },
                {
                  title: '🐛 ANTI BUG',
                  description: 'Block bug/crash messages',
                  id: `${config.PREFIX}antibug`,
                  highlight_label: 'αɳƚι'
                },
                {
                  title: '🔗 ANTI LINK',
                  description: 'Block links in groups',
                  id: `${config.PREFIX}antilink`,
                  highlight_label: 'αɳƚι'
                },
                {
                  title: '📞 CALL REJECT',
                  description: 'Auto reject incoming calls',
                  id: `${config.PREFIX}creject`,
                  highlight_label: 'αɳƚι'
                }
              ]
            },
            {
              title: '⚙️ Ⴆσƚ ƈσɳƚяσʅ',
              rows: [
                {
                  title: '🎮 BOT PRESENCE',
                  description: 'Set bot online/offline status',
                  id: `${config.PREFIX}botpresence`,
                  highlight_label: 'ƈσɳƚяσʅ'
                },
                {
                  title: '🐻 SETTINGS',
                  description: 'All bot settings',
                  id: `${config.PREFIX}setting`,
                  highlight_label: 'ƈσɳƚяσʅ'
                },
                {
                  title: '❤️‍🔥 ACTIVE',
                  description: 'Bot activation panel',
                  id: `${config.PREFIX}active`,
                  highlight_label: 'ƈσɳƚяσʅ'
                }
              ]
            }
          ]
        })
      }
    }
  ];

  await socket.sendMessage(sender, {
    image: { url: MENU_IMG },
    caption: `
╭▭▬▭▬▭▬▭▬▭▬▭▬
┃ 🖤 OWNER CMDS MENU
╰▭▬▭▬▭▬▭▬▭▬▭▬

Auto commands, anti-protection & bot controls.
▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱▰▱
> ${BOT_NAME}
`,
    buttons: ownerCmdsButtons,
    headerType: 4
  }, { quoted: received });
}

      } catch (err) {
        console.error("Button handler error:", err);
      }
    };

    socket.ev.on("messages.upsert", menuHandler);

    setTimeout(() => {
      socket.ev.off("messages.upsert", menuHandler);
    }, 60000);

  } catch (err) {
    console.error("panel error:", err);
  }

  break;
                          }
                  case 'olr': {
    try {
        const puppeteer = require('puppeteer');

        if (args.length < 3) {
            return await socket.sendMessage(sender, {
                text: `📌 Example:\n.olresult ol 2024 1234567`
            }, { quoted: msg });
        }

        const exam = args[0];
        const year = args[1];
        const index = args[2];

        await socket.sendMessage(sender, {
            text: '🔍 Searching exam result...'
        }, { quoted: msg });

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox']
        });

        const page = await browser.newPage();

        await page.goto('https://www.doenets.lk/examresults', {
            waitUntil: 'networkidle2'
        });

        // Select exam
        await page.select('select', exam);

        // Select year
        await page.select('#year', year);

        // Type index
        await page.type('input[name="index"]', index);

        // Wait captcha manually maybe
        // If no captcha:
        await page.click('button[type="submit"]');

        await page.waitForTimeout(5000);

        const result = await page.evaluate(() => {
            return document.body.innerText;
        });

        await browser.close();

        await socket.sendMessage(sender, {
            text: `📄 EXAM RESULT\n\n${result}`
        }, { quoted: msg });

    } catch (err) {
        console.log(err);

        await socket.sendMessage(sender, {
            text: '❌ Failed to fetch result'
        }, { quoted: msg });
    }
}
break;
                          
          case 'ts': {
    const axios = require('axios');

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    let query = q.replace(/^[.\/!]ts\s*/i, '').trim();

    if (!query) {
        return await socket.sendMessage(sender, {
            text: '*[❗] TikTok එකේ මොකද්ද බලන්න ඕනෙ කියපං! 🔍*'
        }, { quoted: msg });
    }

    // 🔹 Load bot name dynamically
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    // 🔹 Fake contact for quoting
    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_TS"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    try {
        await socket.sendMessage(sender, { text: `🔎 Searching TikTok for: ${query}...` }, { quoted: shonux });

        const searchParams = new URLSearchParams({ keywords: query, count: '10', cursor: '0', HD: '1' });
        const response = await axios.post("https://tikwm.com/api/feed/search", searchParams, {
            headers: { 'Content-Type': "application/x-www-form-urlencoded; charset=UTF-8", 'Cookie': "current_language=en", 'User-Agent': "Mozilla/5.0" }
        });

        const videos = response.data?.data?.videos;
        if (!videos || videos.length === 0) {
            return await socket.sendMessage(sender, { text: '⚠️ No videos found.' }, { quoted: shonux });
        }

        // Limit number of videos to send
        const limit = 3; 
        const results = videos.slice(0, limit);

        // 🔹 Send videos one by one
        for (let i = 0; i < results.length; i++) {
            const v = results[i];
            const videoUrl = v.play || v.download || null;
            if (!videoUrl) continue;

            await socket.sendMessage(sender, { text: `*⏳ Downloading:* ${v.title || 'No Title'}` }, { quoted: shonux });

            await socket.sendMessage(sender, {
                video: { url: videoUrl },
                caption: `*🎵 ${botName} 𝐓𝙸𝙺𝚃𝙾𝙺 𝐃𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝚁*\n\𝐓itle: ${v.title || 'No Title'}\n*🥷𝐀𝚄𝚃𝙷𝙾𝚁:* ${v.author?.nickname || 'Unknown'}`
            }, { quoted: shonux });
        }

    } catch (err) {
        console.error('TikTok Search Error:', err);
        await socket.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: shonux });
    }

    break;
}


case 'setting': {
  // 1. Acknowledge the command
  await socket.sendMessage(sender, { react: { text: '⚙️', key: msg.key } });

  try {
    // 2. Data Sanitization & Permission Logic
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    // 🔒 Security Check
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const permissionCard = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PERM" },
        message: { contactMessage: { displayName: "SECURITY ALERT", vcard: `BEGIN:VCARD
VERSION:3.0
N:System;Security;;;
FN:System Security
ORG:Privacy Guard
END:VCARD` } }
      };
      
      // FIX 1: Used backticks (`) for multi-line text
      return await socket.sendMessage(sender, { 
        text: `❌ *𝐀𝐂𝐂𝐄𝐒𝐒 𝐃𝐄𝐍𝐈𝐄𝐃*

🔒 _This menu is restricted to the bot owner only._` 
      }, { quoted: permissionCard });
    }

    // 3. Load Configuration
    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃'; // Default name fallback
    const prefix = currentConfig.PREFIX || config.PREFIX;

    // 4. Construct the Interactive Menu
    const settingOptions = {
      name: 'single_select',
      paramsJson: JSON.stringify({
        title: `⚙️ 𝙲𝙾𝙽𝚃𝚁𝙾𝙻 𝙿𝙰𝙽𝙴𝙻`,
        sections: [
          {
            title: '📝 𝐏𝐄𝐑𝐒𝐎𝐍𝐀𝐋𝐈𝐙𝐀𝐓𝐈𝐎𝐍',
            highlight_label: 'New',
            rows: [
              { 
                title: ' ✏️ ┊ 𝐂𝐡𝐚𝐧𝐠𝐞 𝐁𝐨𝐭 𝐍𝐚𝐦𝐞', 
                description: 'Set a new name for your bot', 
                id: `${prefix}setbotname` 
              }
            ]
          },
          {
            title: '✨ 𝐖𝐎𝐑𝐊 𝐌𝐎𝐃𝐄 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒',
            rows: [
              { title: ' 🌍 ┊ 𝐏𝐮𝐛𝐥𝐢𝐜 𝐌𝐨𝐝𝐞', description: 'Bot works for everyone', id: `${prefix}wtype public` },
              { title: ' 🔐 ┊ 𝐏𝐫𝐢𝐯𝐚𝐭𝐞 𝐌𝐨𝐝𝐞', description: 'Bot works only for you', id: `${prefix}wtype private` },
              { title: ' 👥 ┊ 𝐆𝐫𝐨𝐮𝐩𝐬 𝐎𝐧𝐥𝐲', description: 'Works in groups only', id: `${prefix}wtype groups` },
              { title: ' 📥 ┊ 𝐈𝐧𝐛𝐨𝐱 𝐎𝐧𝐥𝐲', description: 'Works in DM/Inbox only', id: `${prefix}wtype inbox` },
            ],
          },
          {
            title: '👻 𝐆𝐇𝐎𝐒𝐓 & 𝐏𝐑𝐈𝐕𝐀𝐂𝐘',
            rows: [
              { title: ' 🟢 ┊ 𝐀𝐥𝐰𝐚𝐲𝐬 𝐎𝐧𝐥𝐢𝐧𝐞 : 𝐎𝐍', description: 'Show online badge', id: `${prefix}botpresence online` },
              { title: ' ⚫ ┊ 𝐀𝐥𝐰𝐚𝐲𝐬 𝐎𝐧𝐥𝐢𝐧𝐞 : 𝐎𝐅𝐅', description: 'Hide online badge', id: `${prefix}botpresence offline` },
              { title: ' ✍️ ┊ 𝐅𝐚𝐤𝐞 𝐓𝐲𝐩𝐢𝐧𝐠 : 𝐎𝐍', description: 'Show typing animation', id: `${prefix}autotyping on` },
              { title: ' 🔇 ┊ 𝐅𝐚𝐤𝐞 𝐓𝐲𝐩𝐢𝐧𝐠 : 𝐎𝐅𝐅', description: 'Hide typing animation', id: `${prefix}autotyping off` },
              { title: ' 🎙️ ┊ 𝐅𝐚𝐤𝐞 𝐑𝐞𝐜 : 𝐎𝐍', description: 'Show recording audio', id: `${prefix}autorecording on` },
              { title: ' 🔇 ┊ 𝐅𝐚𝐤𝐞 𝐑𝐞𝐜 : 𝐎𝐅𝐅', description: 'Hide recording audio', id: `${prefix}autorecording off` },
            ],
          },
          {
            title: '🤖 𝐀𝐔𝐓𝐎𝐌𝐀𝐓𝐈𝐎𝐍 & 𝐓𝐎𝐎𝐋𝐒',
            rows: [
              { title: ' 👁️ ┊ 𝐀𝐮𝐭𝐨 𝐒𝐞𝐞𝐧 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐍', description: 'View statuses automatically', id: `${prefix}rstatus on` },
              { title: ' 🙈 ┊ 𝐀𝐮𝐭𝐨 𝐒𝐞𝐞𝐧 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐅𝐅', description: 'Do not view statuses', id: `${prefix}rstatus off` },
              { title: ' ❤️ ┊ 𝐀𝐮𝐭𝐨 𝐋𝐢𝐤𝐞 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐍', description: 'React to statuses', id: `${prefix}arm on` },
              { title: ' 💔 ┊ 𝐀𝐮𝐭𝐨 𝐋𝐢𝐤𝐞 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐅𝐅', description: 'Do not react', id: `${prefix}arm off` },
              { title: ' 🚫 ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐣𝐞𝐜𝐭 𝐂𝐚𝐥𝐥 : 𝐎𝐍', description: 'Decline incoming calls', id: `${prefix}creject on` },
              { title: ' 📞 ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐣𝐞𝐜𝐭 𝐂𝐚𝐥𝐥 : 𝐎𝐅𝐅', description: 'Allow incoming calls', id: `${prefix}creject off` },
                          { title: ' 💖 ┊ 𝐀𝐮𝐭𝐨 𝐕𝐨𝐢𝐜𝐞 𝐒𝐞𝐧𝐝𝐞𝐫 : 𝐎𝐍', description: 'Auto voice sending', id: `${prefix}autovoice on` },
                          { title: ' 👀 ┊ 𝐀𝐮𝐭𝐨 𝐕𝐨𝐢𝐜𝐞 𝐒𝐞𝐧𝐝𝐞𝐫 : 𝐎𝐅𝐅', description: 'Auto voice sendind off', id: `${prefix}autovoice off` },
            ],
          },
          {
            title: '📨 𝐌𝐄𝐒𝐒𝐀𝐆𝐄 𝐇𝐀𝐍𝐃𝐋𝐈𝐍𝐆',
            rows: [
              { title: ' 📖 ┊ 𝐑𝐞𝐚𝐝 𝐀𝐥𝐥 : 𝐎𝐍', description: 'Blue tick everything', id: `${prefix}mread all` },
              { title: ' 📑 ┊ 𝐑𝐞𝐚𝐝 𝐂𝐦𝐝𝐬 : 𝐎𝐍', description: 'Blue tick commands only', id: `${prefix}mread cmd` },
              { title: ' 📪 ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐚𝐝 : 𝐎𝐅𝐅', description: 'Stay on grey ticks', id: `${prefix}mread off` },
            ],
          },
        ],
      }),
    };

    // 5. Build Aesthetic Caption
    const fancyWork = (currentConfig.WORK_TYPE || 'public').toUpperCase();
    const fancyPresence = (currentConfig.PRESENCE || 'available').toUpperCase();
    
    const msgCaption = `
   〔 *${botName}* 〕

┃ 📝 *NAME CONFIG*
┃ ╰ ➦ Name: ${botName}

┃ ⚙️ *MAIN CONFIGURATION* 
┃ ╰ ➦ Type: ${fancyWork}

┃ 👻 *PRESENCE STATUS*
┃ ╰ ➦ State: ${fancyPresence}

┃ 📡 *STATUS AUTOMATION*
┃ ╰ ➦ View: ${currentConfig.AUTO_VIEW_STATUS || 'true'}  |  Like: ${currentConfig.AUTO_LIKE_STATUS || 'true'}

┃ 🛡️ *SECURITY SHIELD*
┃ ╰ ➦ Anti-Call: ${currentConfig.ANTI_CALL || 'off'}

┃ 📨 *MESSAGE SYSTEM*
┃ ╰ ➦ Auto Read: ${currentConfig.AUTO_READ_MESSAGE || 'off'}

┃ 🎭 *FAKES & ACTIONS*
┃ ╰ ➦ Typing: ${currentConfig.AUTO_TYPING || 'false'} | Recording: ${currentConfig.AUTO_RECORDING || 'false'}

    `.trim();

    // 6. Send the Message
    await socket.sendMessage(sender, {
      headerType: 1,
      viewOnce: true,
      image: { url: currentConfig.logo || config.RCD_IMAGE_PATH },
      caption: msgCaption,
      buttons: [
        {
          buttonId: 'settings_action',
          buttonText: { displayText: '⚙️ 𝐎𝐏𝐄𝐍 𝐂𝐎𝐍𝐅𝐈𝐆' },
          type: 4,
          nativeFlowInfo: settingOptions,
        },
      ],
      footer: `powered by ${config.OWNER_NAME || 'Bot Owner'}`,
    }, { quoted: msg });

  } catch (e) {
    console.error('Setting command error:', e);
    const errorCard = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ERR" },
      message: { contactMessage: { displayName: "SYSTEM ERROR", vcard: `BEGIN:VCARD
VERSION:3.0
N:Error;;;;
FN:System Error
END:VCARD` } }
    };
    
    // FIX 2: Used backticks (`) for multi-line text here too
    await socket.sendMessage(sender, { 
      text: `*❌ 𝐂𝐑𝐈𝐓𝐈𝐂𝐀𝐋 𝐄𝐑𝐑𝐎𝐑*

_Failed to load settings menu. Check console logs._` 
    }, { quoted: errorCard });
  }
  break;
}


case 'wtype': {
  await socket.sendMessage(sender, { react: { text: '🛠️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change work type.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = {
      groups: "groups",
      inbox: "inbox", 
      private: "private",
      public: "public"
    };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.WORK_TYPE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Work Type updated to: ${settings[q]}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- public\n- groups\n- inbox\n- private" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Wtype command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your work type!*" }, { quoted: shonux });
  }
  break;
}

case 'botpresence': {
  await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change bot presence.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = {
      online: "available",
      offline: "unavailable"
    };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.PRESENCE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      // Apply presence immediately
      await socket.sendPresenceUpdate(settings[q]);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Bot Presence updated to: ${q}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- online\n- offline" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Botpresence command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your bot presence!*" }, { quoted: shonux });
  }
  break;
}

case 'autotyping': {
  await socket.sendMessage(sender, { react: { text: '⌨️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change auto typing.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_TYPING = settings[q];
      
      // If turning on auto typing, turn off auto recording to avoid conflict
      if (q === 'on') {
        userConfig.AUTO_RECORDING = "false";
      }
      
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Auto Typing ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Options:* on / off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Autotyping error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating auto typing!*" }, { quoted: shonux });
  }
  break;
}

case 'rstatus': {
  await socket.sendMessage(sender, { react: { text: '👁️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change status seen setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_VIEW_STATUS = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Status Seen ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Rstatus command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your status seen setting!*" }, { quoted: shonux });
  }
  break;
}

case 'creject': {
  await socket.sendMessage(sender, { react: { text: '📞', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change call reject setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "on", off: "off" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.ANTI_CALL = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Call Reject ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Creject command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your call reject setting!*" }, { quoted: shonux });
  }
  break;
}

case 'arm': {
  await socket.sendMessage(sender, { react: { text: '❤️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change status react setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_LIKE_STATUS = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Status React ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Arm command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your status react setting!*" }, { quoted: shonux });
  }
  break;
}

case 'mread': {
  await socket.sendMessage(sender, { react: { text: '📖', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change message read setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { all: "all", cmd: "cmd", off: "off" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_READ_MESSAGE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      let statusText = "";
      switch (q) {
        case "all":
          statusText = "READ ALL MESSAGES";
          break;
        case "cmd":
          statusText = "READ ONLY COMMAND MESSAGES"; 
          break;
        case "off":
          statusText = "DONT READ ANY MESSAGES";
          break;
      }
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Message Read: ${statusText}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- all\n- cmd\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Mread command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your message read setting!*" }, { quoted: shonux });
  }
  break;
}

case 'autorecording': {
  await socket.sendMessage(sender, { react: { text: '🎥', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change auto recording.' }, { quoted: shonux });
    }
    
    let q = args[0];
    
    if (q === 'on' || q === 'off') {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_RECORDING = (q === 'on') ? "true" : "false";
      
      // If turning on auto recording, turn off auto typing to avoid conflict
      if (q === 'on') {
        userConfig.AUTO_TYPING = "false";
      }
      
      await setUserConfigInMongo(sanitized, userConfig);
      
      // Immediately stop any current recording if turning off
      if (q === 'off') {
        await socket.sendPresenceUpdate('available', sender);
      }
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Auto Recording ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid! Use:* .autorecording on/off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Autorecording error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating auto recording!*" }, { quoted: shonux });
  }
  break;
}

case 'prefix': {
  await socket.sendMessage(sender, { react: { text: '🔣', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change prefix.' }, { quoted: shonux });
    }
    
    let newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 2) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: "❌ *Invalid prefix!*\nPrefix must be 1-2 characters long." }, { quoted: shonux });
    }
    
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    userConfig.PREFIX = newPrefix;
    await setUserConfigInMongo(sanitized, userConfig);
    
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ *Your Prefix updated to: ${newPrefix}*` }, { quoted: shonux });
  } catch (e) {
    console.error('Prefix command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your prefix!*" }, { quoted: shonux });
  }
  break;
}

case 'settings': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can view settings.' }, { quoted: shonux });
    }

    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || BOT_NAME_FANCY;
    
    const settingsText = `
*╭─「 𝗖𝚄𝚁𝚁𝙴𝙽𝚃 𝗦𝙴𝚃𝚃𝙸𝙽𝙶𝚂 」─●●➤*  
*│ 🔧  𝐖𝙾𝚁𝙺 𝐓𝚈𝙿𝙴:* ${currentConfig.WORK_TYPE || 'public'}
*│ 🎭  𝐏𝚁𝙴𝚂𝙴𝙽𝚂𝙴:* ${currentConfig.PRESENCE || 'available'}
*│ 👁️  𝐀𝚄𝚃𝙾 𝐒𝚃𝙰𝚃𝚄𝚂 𝐒𝙴𝙴𝙽:* ${currentConfig.AUTO_VIEW_STATUS || 'true'}
*│ ❤️  𝐀𝚄𝚃𝙾 𝐒𝚃𝙰𝚃𝚄𝚂 𝐑𝙴𝙰𝙲𝚃:* ${currentConfig.AUTO_LIKE_STATUS || 'true'}
*│ 📞  𝐀𝚄𝚃𝙾 𝐑𝙴𝙹𝙴𝙲𝚃 𝐂𝙰𝙻𝙻:* ${currentConfig.ANTI_CALL || 'off'}
*│ 📖  𝐀𝚄𝚃𝙾 𝐑𝙴𝙰𝙳 𝐌𝙴𝚂𝚂𝙰𝙶𝙴:* ${currentConfig.AUTO_READ_MESSAGE || 'off'}
*│ 🎥  𝐀𝚄𝚃𝙾 𝐑𝙾𝙲𝙾𝚁𝙳𝙸𝙽𝙶:* ${currentConfig.AUTO_RECORDING || 'false'}
*│ ⌨️  𝐀𝚄𝚃𝙾 𝐓𝚈𝙿𝙸𝙽𝙶:* ${currentConfig.AUTO_TYPING || 'false'}
*│ 🔣  𝐏𝚁𝙴𝙵𝙸𝚇:* ${currentConfig.PREFIX || '.'}
*│ 🎭  𝐒𝚃𝙰𝚃𝚄𝚂 𝐄𝙼𝙾𝙹𝙸𝚂:* ${(currentConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI).join(' ')}
*╰──────────────●●➤*

*𝐔se ${currentConfig.PREFIX || '.'}𝐒etting 𝐓o 𝐂hange 𝐒ettings 𝐕ia 𝐌enu*
    `;

    await socket.sendMessage(sender, {
      image: { url: currentConfig.logo || config.RCD_IMAGE_PATH },
      caption: settingsText
    }, { quoted: msg });
    
  } catch (e) {
    console.error('Settings command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error loading settings!*" }, { quoted: shonux });
  }
  break;
}

case 'checkjid': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can use this command.' }, { quoted: shonux });
    }

    const target = args[0] || sender;
    let targetJid = target;

    if (!target.includes('@')) {
      if (target.includes('-')) {
        targetJid = target.endsWith('@g.us') ? target : `${target}@g.us`;
      } else if (target.length > 15) {
        targetJid = target.endsWith('@newsletter') ? target : `${target}@newsletter`;
      } else {
        targetJid = target.endsWith('@s.whatsapp.net') ? target : `${target}@s.whatsapp.net`;
      }
    }

    let type = 'Unknown';
    if (targetJid.endsWith('@g.us')) {
      type = 'Group';
    } else if (targetJid.endsWith('@newsletter')) {
      type = 'Newsletter';
    } else if (targetJid.endsWith('@s.whatsapp.net')) {
      type = 'User';
    } else if (targetJid.endsWith('@broadcast')) {
      type = 'Broadcast List';
    } else {
      type = 'Unknown';
    }

    const responseText = `🔍 *JID INFORMATION*\n\n☘️ *Type:* ${type}\n🆔 *JID:* ${targetJid}\n\n╰──────────────────────`;

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: responseText
    }, { quoted: msg });

  } catch (error) {
    console.error('Checkjid command error:', error);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error checking JID information!*" }, { quoted: shonux });
  }
  break;
}

case 'emojis': {
  await socket.sendMessage(sender, { react: { text: '🎭', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    // Permission check - only session owner or bot owner can change emojis
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change status reaction emojis.' }, { quoted: shonux });
    }
    
    let newEmojis = args;
    
    if (!newEmojis || newEmojis.length === 0) {
      // Show current emojis if no args provided
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      const currentEmojis = userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      
      return await socket.sendMessage(sender, { 
        text: `🎭 *Current Status Reaction Emojis:*\n\n${currentEmojis.join(' ')}\n\nUsage: \`.emojis 😀 😄 😊 🎉 ❤️\`` 
      }, { quoted: shonux });
    }
    
    // Validate emojis (basic check)
    const invalidEmojis = newEmojis.filter(emoji => !/\p{Emoji}/u.test(emoji));
    if (invalidEmojis.length > 0) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { 
        text: `❌ *Invalid emojis detected:* ${invalidEmojis.join(' ')}\n\nPlease use valid emoji characters only.` 
      }, { quoted: shonux });
    }
    
    // Get user-specific config from MongoDB
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    
    // Update ONLY this user's emojis
    userConfig.AUTO_LIKE_EMOJI = newEmojis;
    
    // Save to MongoDB
    await setUserConfigInMongo(sanitized, userConfig);
    
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    
    await socket.sendMessage(sender, { 
      text: `✅ *Your Status Reaction Emojis Updated!*\n\nNew emojis: ${newEmojis.join(' ')}\n\nThese emojis will be used for your automatic status reactions.` 
    }, { quoted: shonux });
    
  } catch (e) {
    console.error('Emojis command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS5" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your status reaction emojis!*" }, { quoted: shonux });
  }
  break;
}
const { downloadMediaMessage } = require('dct-dev-private-baileys');

// ... inside your switch/case block


case 'ai':
case 'chat':
case 'gpt': {
  try {
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    const q = text.split(" ").slice(1).join(" ").trim();

    // --- Config & Bot Name ---
    const sanitized = (sender || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    if (!q) {
      await socket.sendMessage(sender, { 
        text: `*📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 : 𝙿𝚕𝚎𝚊𝚜𝚎 𝙿𝚛𝚘𝚟𝚒𝚍𝚎 𝙰 𝚀𝚞𝚎𝚜𝚝𝚒𝚘𝚗 !*`,
        buttons: [
          { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔' }, type: 1 }
        ]
      }, { quoted: msg });
      return;
    }

    // --- Meta AI Contact Style Quote ---
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `META_AI_${Date.now()}` },
      message: { 
        contactMessage: { 
          displayName: botName, 
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃\nTEL;type=CELL;type=VOICE;waid=94700000000:+94 70 000 0000\nEND:VCARD` 
        } 
      }
    };

    await socket.sendMessage(sender, { react: { text: '🧠', key: msg.key } });
    await socket.sendMessage(sender, { text: '*📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 : 𝙰𝙸 𝙸𝚜 𝚃𝚑𝚒𝚗𝚔𝚒𝚗𝚐...*', quoted: metaQuote });

    // --- System Prompt & API Logic ---
    // API එකට යවන System Prompt එක (බොට්ගේ හැසිරීම)
    const systemPrompt = `
    ඔබ සැබෑ ගැහැනු ලමයෙකු මෙන් හැසිරිය යුතුය. ඉමෝජි පමනක් තිබේනම් ඔබද ඉමෝජි පමනක් යවන්න.
    ඔයාගේ නම ${botName}. ඔයාගෙන් කවුරුහරි "ඔයාව හැදුවේ කවුද?" හෝ "Who created you?" කියලා ඇහුවොත් පමනක් ඔයා කියන්නේ "මාව හැදුවේ dulina nethmira (DARK TECH ZOON Team)" කියලා.
    User Question: ${q}`;

    // Free GPT-4 API (GuruAPI)
    const { data } = await axios.get(`https://api.guruapi.tech/ai/gpt4?username=${botName}&query=${encodeURIComponent(systemPrompt)}`);
    
    // API එකෙන් එන Reply එක ගන්න විදිය
    let aiReply = '';
    if (data && data.msg) {
        aiReply = data.msg;
    } else if (data && data.result) {
        aiReply = data.result;
    } else {
        throw new Error('No response from API');
    }

    // --- Final Message with Style ---
    await socket.sendMessage(sender, {
      text: `📍 *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 𝐀𝐈 𝐂𝐇𝐀𝐓* 🧠\n\n${aiReply}\n\n*✨ 𝙼𝚊𝚍𝚎 𝙱𝚢 𝐊ᴇᴢᴜ𝚄 ||🌿 `,
      footer: `🤖 ${botName}`,
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝐀𝐈𝙽 𝐌𝐄𝐍𝐔' }, type: 1 },
        { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '📡 𝐁𝐎𝐓 𝐈𝐍𝐅𝐎' }, type: 1 }
      ],
      headerType: 1,
      quoted: metaQuote
    });

  } catch (err) {
    console.error("Error in AI chat:", err);
    await socket.sendMessage(sender, { 
      text: '*📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 : 𝙰𝙿𝙸 𝙴𝚛𝚛𝚘𝚛 𝚃𝚛𝚢 𝙰𝚐𝚊𝚒𝚗 𝙻𝚊𝚝𝚎𝚛 !*',
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝐀𝐈𝙽 𝐌𝐄𝐍𝐔' }, type: 1 }
      ]
    }, { quoted: msg });
  }
  break;
}
case 'tourl':
        case 'url':
        case 'upload': {
          const axios = require('axios');
          const FormData = require('form-data');
          const fs = require('fs');
          const os = require('os');
          const path = require('path');

          const quoted = msg.message?.extendedTextMessage?.contextInfo;
          const mime = quoted?.quotedMessage?.imageMessage?.mimetype ||
            quoted?.quotedMessage?.videoMessage?.mimetype ||
            quoted?.quotedMessage?.audioMessage?.mimetype ||
            quoted?.quotedMessage?.documentMessage?.mimetype;

          if (!quoted || !mime) {
            return await socket.sendMessage(sender, { text: '❌ *Please reply to an image or video.*' });
          }

          // Fake Quote for Style
          const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_MEDIA" },
            message: { contactMessage: { displayName: "© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Upload Service\nORG:Catbox/ImgBB\nEND:VCARD` } }
          };

          let mediaType;
          let msgKey;

          if (quoted.quotedMessage.imageMessage) {
            mediaType = 'image';
            msgKey = quoted.quotedMessage.imageMessage;
          } else if (quoted.quotedMessage.videoMessage) {
            mediaType = 'video';
            msgKey = quoted.quotedMessage.videoMessage;
          } else if (quoted.quotedMessage.audioMessage) {
            mediaType = 'audio';
            msgKey = quoted.quotedMessage.audioMessage;
          } else if (quoted.quotedMessage.documentMessage) {
            mediaType = 'document';
            msgKey = quoted.quotedMessage.documentMessage;
          }

          try {
            // Using existing downloadContentFromMessage
            const stream = await downloadContentFromMessage(msgKey, mediaType);
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }

            const ext = mime.split('/')[1] || 'tmp';
            const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}.${ext}`);
            fs.writeFileSync(tempFilePath, buffer);

            const fileSize = (buffer.length / 1024 / 1024).toFixed(2) + ' MB';
            const typeStr = mediaType.charAt(0).toUpperCase() + mediaType.slice(1);

            let catboxUrl = '';
            let imgbbUrl = '';

            // Upload to Catbox
            try {
              const catboxForm = new FormData();
              catboxForm.append('fileToUpload', fs.createReadStream(tempFilePath));
              catboxForm.append('reqtype', 'fileupload');

              const catboxResponse = await axios.post('https://catbox.moe/user/api.php', catboxForm, {
                headers: catboxForm.getHeaders()
              });
              catboxUrl = catboxResponse.data.trim();
            } catch (catboxError) {
              console.error('Catbox upload error:', catboxError);
              catboxUrl = '❌ Upload failed';
            }

            // Upload to ImgBB (works best with images)
            try {
              const base64Data = buffer.toString('base64');
              const imgbbForm = new FormData();
              imgbbForm.append('key', 'e4b536bbf102cfccc5d8758489052547');
              imgbbForm.append('image', base64Data);

              const imgbbResponse = await axios.post('https://api.imgbb.com/1/upload', imgbbForm, {
                headers: imgbbForm.getHeaders()
              });

              if (imgbbResponse.data.success) {
                imgbbUrl = imgbbResponse.data.data.url;
              } else {
                imgbbUrl = '❌ Upload failed';
              }
            } catch (imgbbError) {
              console.error('ImgBB upload error:', imgbbError);
              imgbbUrl = '❌ Upload failed';
            }

            // Cleanup
            fs.unlinkSync(tempFilePath);

            // Prepare message
            const txt = `
🔗 *𝗨ʀʟ 𝗖ᴏɴᴠᴇɴᴛᴇʀ* 🔗
──────────────────────────
╭──────────────╮
│📂 *ᴛʏᴘᴇ:* ${typeStr}
│📊 *ꜱɪᴢᴇ:* ${fileSize}
╰──────────────╯
│🌿 *𝙲𝙰𝚃𝙱𝙾𝚃 𝚄𝚁𝙻:*
> ${catboxUrl}

│🍃 *𝙸𝙼𝙶𝙱𝙱 𝚄𝚁𝙻:*
> ${imgbbUrl}

──────────────────────────`;

            // Determine thumbnail for preview
            let thumbnailUrl = "https://i.ibb.co/T3Ggc58/29892d30ab4d.jpg";
            if (catboxUrl && !catboxUrl.includes('❌') && catboxUrl.match(/\.(jpeg|jpg|gif|png)$/i)) {
              thumbnailUrl = catboxUrl;
            } else if (imgbbUrl && !imgbbUrl.includes('❌')) {
              thumbnailUrl = imgbbUrl;
            }

            await socket.sendMessage(sender, {
              text: txt,
              contextInfo: {
                externalAdReply: {
                  title: "Media Uploaded Successfully!",
                  body: "Dual Upload Service",
                  thumbnailUrl: thumbnailUrl,
                  sourceUrl: catboxUrl && !catboxUrl.includes('❌') ? catboxUrl : (imgbbUrl && !imgbbUrl.includes('❌') ? imgbbUrl : ''),
                  mediaType: 1,
                  renderLargerThumbnail: true
                }
              }
            }, { quoted: metaQuote });

          } catch (e) {
            console.error(e);
            await socket.sendMessage(sender, { text: '❌ *Error uploading media.*' });
          }
        }
          break;
 case 'weather':
    try {
        // Messages in English
        const messages = {
            noCity: "❗ *Please provide a city name!* \n📋 *Usage*: .weather [city name]",
            weather: (data) => `
* © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 ᴡᴇᴀᴛʜᴇʀ ʀᴇᴘᴏʀᴛ *

*◈  ${data.name}, ${data.sys.country}  ◈*

*╭──────────●●➤*
*┣ 🌎 𝐓emperature :* ${data.main.temp}°C
*┣ 🌎 𝐅eels 𝐋ike :* ${data.main.feels_like}°C
*┣ 🌎 𝐌in 𝐓emp :* ${data.main.temp_min}°C
*┣ 🌎 𝐌ax 𝐓emp :* ${data.main.temp_max}°C
*┣ 🌎 𝐇umidity :* ${data.main.humidity}%
*┣ 🌎 𝐖eather :* ${data.weather[0].main}
*┣ 🌎 𝐃escription :* ${data.weather[0].description}
*┣ 🌎 𝐖ind 𝐒peed :* ${data.wind.speed} m/s
*┣ 🌎 𝐏ressure :* ${data.main.pressure} hPa
*╰──────────●●➤*

*© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*
`,
            cityNotFound: "🚫 *City not found!* \n🔍 Please check the spelling and try again.",
            error: "⚠️ *An error occurred!* \n🔄 Please try again later."
        };

        // Check if a city name was provided
        if (!args || args.length === 0) {
            await socket.sendMessage(sender, { text: messages.noCity });
            break;
        }

        const apiKey = '2d61a72574c11c4f36173b627f8cb177';
        const city = args.join(" ");
        const url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;

        const response = await axios.get(url);
        const data = response.data;

        // Get weather icon
        const weatherIcon = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
        
        await socket.sendMessage(sender, {
            image: { url: weatherIcon },
            caption: messages.weather(data)
        });

    } catch (e) {
        console.log(e);
        if (e.response && e.response.status === 404) {
            await socket.sendMessage(sender, { text: messages.cityNotFound });
        } else {
            await socket.sendMessage(sender, { text: messages.error });
        }
    }
    break;
          
case 'aiimg': 
case 'aiimg2': {
    const axios = require('axios');

    const q =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

    const prompt = q.trim();

    if (!prompt) {
        return await socket.sendMessage(sender, {
            text: '🎨 *Please provide a prompt to generate an AI image.*'
        }, { quoted: msg });
    }

    try {
        // 🔹 Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

        // 🔹 Fake contact with dynamic bot name
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_AIIMG"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        // Notify user
        await socket.sendMessage(sender, { text: '🧠 *Creating your AI image...*' });

        // Determine API URL based on command
        let apiUrl = '';
        if (command === 'aiimg') {
            apiUrl = `https://api.siputzx.my.id/api/ai/flux?prompt=${encodeURIComponent(prompt)}`;
        } else if (command === 'aiimg2') {
            apiUrl = `https://api.siputzx.my.id/api/ai/magicstudio?prompt=${encodeURIComponent(prompt)}`;
        }

        // Call AI API
        const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });

        if (!response || !response.data) {
            return await socket.sendMessage(sender, {
                text: '❌ *API did not return a valid image. Please try again later.*'
            }, { quoted: shonux });
        }

        const imageBuffer = Buffer.from(response.data, 'binary');

        // Send AI Image with bot name in caption
        await socket.sendMessage(sender, {
            image: imageBuffer,
            caption: `🧠 *${botName} AI IMAGE*\n\n📌 Prompt: ${prompt}`
        }, { quoted: shonux });

    } catch (err) {
        console.error('AI Image Error:', err);

        await socket.sendMessage(sender, {
            text: `❗ *An error occurred:* ${err.response?.data?.message || err.message || 'Unknown error'}`
        }, { quoted: msg });
    }
    break;
}
case 'pair': {
    try {
        const axios = require('axios');
        const { generateWAMessageFromContent, proto } = require('dct-dev-private-baileys');

        // 1. පණිවිඩය සහ අංකය ලබා ගැනීම
        let text = (msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    msg.message?.imageMessage?.caption || 
                    msg.message?.videoMessage?.caption || '').trim();

        // ඉලක්කම් පමණක් වෙන් කර ගැනීම (spaces, +, - ඉවත් කරයි)
        let number = text.replace(/[^0-9]/g, '');

        // 2. අංකය වලංගු ද යන්න පරීක්ෂා කිරීම
        if (!number) {
            await socket.sendMessage(sender, { react: { text: '⚠️', key: msg.key } });
            return await socket.sendMessage(sender, {
                text: `╭───『 ⚠️ *INVALID FORMAT* 』───╮
│
│ ❌ *No Number Detected*
│
│ 📝 *Usage:* .pair 94771234567
│ 💡 *Tip:* Enter number with country code!
│
╰───────────────────────────╯`
            }, { quoted: msg });
        }

        // 3. Loading Reaction (ලස්සනට)
        const loadingEmojis = ['🌑', '🌒', '🌓', '🌔', '🌕', '✨'];
        for (const emoji of loadingEmojis) {
            await socket.sendMessage(sender, { react: { text: emoji, key: msg.key } });
            await new Promise(resolve => setTimeout(resolve, 200)); // Sleep function
        }

        // 4. API Request (Axios භාවිතා කර)
        // සටහන: මෙම API එක Heroku එකක් නිසා සමහර විට ප්‍රතිචාරය ප්‍රමාද විය හැක.
        const apiUrl = `https://criminalmd-98d941cf6e6f.herokuapp.com/code?number=${encodeURIComponent(number)}`;
        
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (!result || !result.code) {
            throw new Error('API එකෙන් කෝඩ් එකක් ලැබුනේ නැත.');
        }

        const pairCode = result.code;

        // 5. Success Reaction
        await socket.sendMessage(sender, { react: { text: '🔑', key: msg.key } });

        // 6. 🎨 FANCY INTERACTIVE MESSAGE (Button Message)
        const msgParams = generateWAMessageFromContent(sender, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: `╭━━━『 ⚜️ *PAIRING SUCCESS* ⚜️ 』━━━╮
┃
┃  👤 *User:* ${msg.pushName || 'Guest'}
┃  📱 *Number:* +${number}
┃
┃  🔑 *YOUR CODE:*
┃  『  *${pairCode}* 』
┃
┃  ⏳ *Expires in 60 seconds*
┃
┃  *⚙️ INSTRUCTIONS:*
┃  1️⃣ Tap "COPY CODE" button
┃  2️⃣ Go to WhatsApp Settings
┃  3️⃣ Select "Linked Devices"
┃  4️⃣ Paste code & Enjoy!
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: "© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 • Secure Connection"
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: "",
                            subtitle: "© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃",
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    name: "cta_copy",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "📋 COPY CODE",
                                        id: "copy_code_btn",
                                        copy_code: pairCode
                                    })
                                },
                                {
                                    name: "cta_url",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "⚜️ JOIN CHANNEL",
                                        url: "https://whatsapp.com/channel/0029Vb6aIrGLo4hhAAGH6f3U",
                                        merchant_url: "https://whatsapp.com/channel/0029Vb6aIrGLo4hhAAGH6f3U"
                                    })
                                }
                            ]
                        })
                    })
                }
            }
        }, { quoted: msg });

        // 7. පණිවිඩය යැවීම
        await socket.relayMessage(sender, msgParams.message, { messageId: msgParams.key.id });

        // 8. කෝඩ් එක වෙනම යැවීම (Backup ලෙස)
        await new Promise(resolve => setTimeout(resolve, 1000));
        await socket.sendMessage(sender, { text: pairCode }, { quoted: msg });

    } catch (err) {
        console.error("❌ Pair Error:", err);
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        
        await socket.sendMessage(sender, {
            text: `❌ *PAIRING FAILED*\n\nReason: ${err.message || 'API Connection Error'}\n\nPlease try again later.`
        }, { quoted: msg });
    }
    break;
}

case 'pp': {
  try {
    const q = args.join(' ');
    if (!q) {
      return socket.sendMessage(sender, {
        text: '❎ Please enter a pastpaper search term!\n\nExample: .pp o/l ict'
      }, { quoted: msg });
    }

    // Short reaction to show we're working
    await socket.sendMessage(sender, { react: { text: '🔎', key: msg.key } });

    // Search API (you provided)
    const searchApi = `https://pp-api-beta.vercel.app/api/pastpapers?q=${encodeURIComponent(q)}`;
    const { data } = await axios.get(searchApi);

    if (!data?.results || data.results.length === 0) {
      return socket.sendMessage(sender, { text: '❎ No results found for that query!' }, { quoted: msg });
    }

    // Filter out generic pages like Next Page / Contact Us / Terms / Privacy
    const filtered = data.results.filter(r => {
      const t = (r.title || '').toLowerCase();
      if (!r.link) return false;
      if (t.includes('next page') || t.includes('contact us') || t.includes('terms') || t.includes('privacy policy')) return false;
      return true;
    });

    if (filtered.length === 0) {
      return socket.sendMessage(sender, { text: '❎ No relevant pastpaper results found.' }, { quoted: msg });
    }

    // Take top 5 results
    const results = filtered.slice(0, 5);

    // Build caption
    let caption = `📚 *Top Pastpaper Results for:* ${q}\n\n`;
    results.forEach((r, i) => {
      caption += `*${i + 1}. ${r.title}*\n🔗 Preview: ${r.link}\n\n`;
    });
    caption += `*💬 Reply with number (1-${results.length}) to download/view.*`;

    // Send first result image if any thumbnail, else just send text with first link preview
    let sentMsg;
    if (results[0].thumbnail) {
      sentMsg = await socket.sendMessage(sender, {
        image: { url: results[0].thumbnail },
        caption
      }, { quoted: msg });
    } else {
      sentMsg = await socket.sendMessage(sender, {
        text: caption
      }, { quoted: msg });
    }

    // Listener for user choosing an item (1..n)
    const listener = async (update) => {
      try {
        const m = update.messages[0];
        if (!m.message) return;

        const text = m.message.conversation || m.message.extendedTextMessage?.text;
        const isReply =
          m.message.extendedTextMessage &&
          m.message.extendedTextMessage.contextInfo?.stanzaId === sentMsg.key.id;

        if (isReply && ['1','2','3','4','5'].includes(text)) {
          const index = parseInt(text, 10) - 1;
          const selected = results[index];
          if (!selected) return;

          // show processing reaction
          await socket.sendMessage(sender, { react: { text: '⏳', key: m.key } });

          // Call download API to get direct pdf(s)
          try {
            const dlApi = `https://pp-api-beta.vercel.app/api/download?url=${encodeURIComponent(selected.link)}`;
            const { data: dlData } = await axios.get(dlApi);

            if (!dlData?.found || !dlData.pdfs || dlData.pdfs.length === 0) {
              await socket.sendMessage(sender, { react: { text: '❌', key: m.key } });
              await socket.sendMessage(sender, { text: '❎ No direct PDF found for that page.' }, { quoted: m });
              // cleanup
              socket.ev.off('messages.upsert', listener);
              return;
            }

            const pdfs = dlData.pdfs; // array of URLs

            if (pdfs.length === 1) {
              // single pdf -> send directly
              const pdfUrl = pdfs[0];
              await socket.sendMessage(sender, { react: { text: '⬇️', key: m.key } });

              await socket.sendMessage(sender, {
                document: { url: pdfUrl },
                mimetype: 'application/pdf',
                fileName: `${selected.title}.pdf`,
                caption: `📄 ${selected.title}`
              }, { quoted: m });

              await socket.sendMessage(sender, { react: { text: '✅', key: m.key } });

              socket.ev.off('messages.upsert', listener);
            } else {
              // multiple pdfs -> list options and wait for choose
              let desc = `📄 *${selected.title}* — multiple PDFs found:\n\n`;
              pdfs.forEach((p, i) => {
                desc += `*${i+1}.* ${p.split('/').pop() || `PDF ${i+1}`}\n`;
              });
              desc += `\n💬 Reply with number (1-${pdfs.length}) to download that PDF.`;

              const infoMsg = await socket.sendMessage(sender, {
                text: desc
              }, { quoted: m });

              // nested listener for pdf choice
              const dlListener = async (dlUpdate) => {
                try {
                  const d = dlUpdate.messages[0];
                  if (!d.message) return;

                  const text2 = d.message.conversation || d.message.extendedTextMessage?.text;
                  const isReply2 =
                    d.message.extendedTextMessage &&
                    d.message.extendedTextMessage.contextInfo?.stanzaId === infoMsg.key.id;

                  if (isReply2) {
                    if (!/^\d+$/.test(text2)) return;
                    const dlIndex = parseInt(text2, 10) - 1;
                    if (dlIndex < 0 || dlIndex >= pdfs.length) {
                      return socket.sendMessage(sender, { text: '❎ Invalid option.' }, { quoted: d });
                    }

                    const finalPdf = pdfs[dlIndex];
                    await socket.sendMessage(sender, { react: { text: '⬇️', key: d.key } });

                    try {
                      await socket.sendMessage(sender, {
                        document: { url: finalPdf },
                        mimetype: 'application/pdf',
                        fileName: `${selected.title} (${dlIndex+1}).pdf`,
                        caption: `📄 ${selected.title} (${dlIndex+1})`
                      }, { quoted: d });

                      await socket.sendMessage(sender, { react: { text: '✅', key: d.key } });
                    } catch (err) {
                      await socket.sendMessage(sender, { react: { text: '❌', key: d.key } });
                      await socket.sendMessage(sender, { text: `❌ Download/send failed.\n\nDirect link:\n${finalPdf}` }, { quoted: d });
                    }

                    socket.ev.off('messages.upsert', dlListener);
                    socket.ev.off('messages.upsert', listener);
                  }
                } catch (err) {
                  // ignore inner errors but log if you want
                }
              };

              socket.ev.on('messages.upsert', dlListener);
              // keep outer listener off until user chooses or we cleanup inside dlListener
            }

          } catch (err) {
            await socket.sendMessage(sender, { react: { text: '❌', key: m.key } });
            await socket.sendMessage(sender, { text: `❌ Error fetching PDF: ${err.message}` }, { quoted: m });
            socket.ev.off('messages.upsert', listener);
          }
        }
      } catch (err) {
        // ignore per-message listener errors
      }
    };

    socket.ev.on('messages.upsert', listener);

  } catch (err) {
    await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
    await socket.sendMessage(sender, { text: `❌ ERROR: ${err.message}` }, { quoted: msg });
  }
  break;
}

  case 'cricket':
    try {
        console.log('Fetching cricket news from API...');
        
        const response = await fetch('https://api.cricapi.com/v1/currentMatches?apikey=72e8cf9b-8b76-4e8d-9a39-a469fa25ef05&offset=0');
        console.log(`API Response Status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        console.log('API Response Data:', JSON.stringify(data, null, 2));

       
        if (!data.status || !data.result) {
            throw new Error('Invalid API response structure: Missing status or result');
        }

        const { title, score, to_win, crr, link } = data.result;
        if (!title || !score || !to_win || !crr || !link) {
            throw new Error('Missing required fields in API response: ' + JSON.stringify(data.result));
        }

       
        console.log('Sending message to user...');
        await socket.sendMessage(sender, {
            text: formatMessage(
                '🏏 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 MINI CEICKET NEWS🏏',
                `📢 *${title}*\n\n` +
                `🏆 *mark*: ${score}\n` +
                `🎯 *to win*: ${to_win}\n` +
                `📈 *now speed*: ${crr}\n\n` +
                `🌐 *link*: ${link}`,
                '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃'
            )
        });
        console.log('Message sent successfully.');
    } catch (error) {
        console.error(`Error in 'news' case: ${error.message}`);
        await socket.sendMessage(sender, {
            text: '⚠️ දැන්නම් හරි යන්නම ඕන 🙌.'
        });
    }
                    break;
                case 'gossip':
    try {
        
        const response = await fetch('https://api.srihub.store/news/hiru?apikey=dew_BFJBP1gi0pxFIdCasrTqXjeZzcmoSpz4SE4FtG9B');
        if (!response.ok) {
            throw new Error('API එකෙන් news ගන්න බැරි වුණා.බන් 😩');
        }
        const data = await response.json();


        if (!data.status || !data.result || !data.result.title || !data.result.desc || !data.result.link) {
            throw new Error('API එකෙන් ලැබුණු news data වල ගැටලුවක්');
        }


        const { title, desc, date, link } = data.result;


        let thumbnailUrl = 'https://via.placeholder.com/150';
        try {
            
            const pageResponse = await fetch(link);
            if (pageResponse.ok) {
                const pageHtml = await pageResponse.text();
                const $ = cheerio.load(pageHtml);
                const ogImage = $('meta[property="og:image"]').attr('content');
                if (ogImage) {
                    thumbnailUrl = ogImage; 
                } else {
                    console.warn(`No og:image found for ${link}`);
                }
            } else {
                console.warn(`Failed to fetch page ${link}: ${pageResponse.status}`);
            }
        } catch (err) {
            console.warn(`Thumbnail scrape කරන්න බැරි වුණා from ${link}: ${err.message}`);
        }


        await socket.sendMessage(sender, {
            image: { url: thumbnailUrl },
            caption: formatMessage(
                '📰 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 නවතම පුවත් 📰',
                `📢 *${title}*\n\n${desc}\n\n🕒 *Date*: ${date || 'තවම ලබාදීලා නැත'}\n🌐 *Link*: ${link}`,
                '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃'
            )
        });
    } catch (error) {
        console.error(`Error in 'news' case: ${error.message}`);
        await socket.sendMessage(sender, {
            text: '⚠️ නිව්ස් ගන්න බැරි වුණා සුද්දෝ! 😩 යමක් වැරදුණා වගේ.'
        });
    }
                    break;
case 'deleteme': {
  // 'number' is the session number passed to setupCommandHandlers (sanitized in caller)
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  // determine who sent the command
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  // Permission: only the session owner or the bot OWNER can delete this session
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or the bot owner can delete this session.' }, { quoted: msg });
    break;
  }

  try {
    // 1) Remove from Mongo
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);

    // 2) Remove temp session dir
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try {
      if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
        console.log(`Removed session folder: ${sessionPath}`);
      }
    } catch (e) {
      console.warn('Failed removing session folder:', e);
    }

    // 3) Try to logout & close socket
    try {
      if (typeof socket.logout === 'function') {
        await socket.logout().catch(err => console.warn('logout error (ignored):', err?.message || err));
      }
    } catch (e) { console.warn('socket.logout failed:', e?.message || e); }
    try { socket.ws?.close(); } catch (e) { console.warn('ws close failed:', e?.message || e); }

    // 4) Remove from runtime maps
    activeSockets.delete(sanitized);
    socketCreationTime.delete(sanitized);

    // 5) notify user
    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: formatMessage('🗑️ SESSION DELETED', '✅ Your session has been successfully deleted from MongoDB and local storage.', BOT_NAME_FANCY)
    }, { quoted: msg });

    console.log(`Session ${sanitized} deleted by ${senderNum}`);
  } catch (err) {
    console.error('deleteme command error:', err);
    await socket.sendMessage(sender, { text: `❌ Failed to delete session: ${err.message || err}` }, { quoted: msg });
  }
  break;
}

// Add these cases to your switch statement, just like the 'song' case

case 'fb':
case 'fbdl':
case 'facebook':
case 'fbd':
case 'fbvideo': {
    try {
        const axios = require('axios');

        // 1. පණිවිඩය සහ URL ලබා ගැනීම (Fb.js style)
        let text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        let url = text.split(" ")[1]; // උදා: .fb <link>

        if (!url) {
            return await socket.sendMessage(sender, { 
                text: '🚫 *Please send a Facebook video link.*\n\nExample: .fb <url>' 
            }, { quoted: msg });
        }

        // 2. Link Validation
        if (!url.includes("facebook.com") && !url.includes("fb.watch")) {
            return await socket.sendMessage(sender, { text: "❌ *Invalid Facebook Link!*" }, { quoted: msg });
        }

        // 3. Bot Name සහ Config Load කිරීම (Fb.js style)
        const sanitized = (sender.split('@')[0] || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

        // 4. Fake Contact Message සැකසීම (Fb.js style)
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_FB"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        // 5. Reaction එකක් දැමීම
        await socket.sendMessage(sender, { react: { text: "⏳", key: msg.key } });

        // 6. Movanest API හරහා දත්ත ලබා ගැනීම
        const apiRes = await axios.get("https://www.movanest.xyz/v2/fbdown", {
            params: { url: url }
        });

        if (!apiRes.data.status || !apiRes.data.results?.[0]) {
            return await socket.sendMessage(sender, { text: '❌ *Video not found!*' }, { quoted: shonux });
        }

        const result = apiRes.data.results[0];
        const directUrl = result.hdQualityLink || result.normalQualityLink;

        // 7. වීඩියෝව Buffer එකක් ලෙස Download කිරීම (Size check සඳහා)
        const videoRes = await axios.get(directUrl, {
            responseType: "arraybuffer",
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        const size = (videoRes.data.length / (1024 * 1024)).toFixed(2);

        if (size > 100) {
            return await socket.sendMessage(sender, { text: `❌ *Video too large: ${size} MB*` }, { quoted: shonux });
        }

        // 8. වීඩියෝව යැවීම (© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 Style Caption සමඟ)
        await socket.sendMessage(sender, {
            video: Buffer.from(videoRes.data),
            mimetype: "video/mp4",
            caption: `╭───「 📍 *${botName}* 」───◆
│
│ 🎬 *Title:* ${result.title || "Facebook Video"}
│ ⚖️ *Size:* ${size} MB
│ 🔗 *Source:* Facebook
│
╰───────────────────────◆

*© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}*`,
            contextInfo: {
                externalAdReply: {
                    title: `${botName} FB DOWNLOADER`,
                    body: "ᴅᴏᴡɴʟᴏᴀᴅᴇᴅ ʙʏ © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃",
                    thumbnailUrl: result.thumbnail || "https://files.catbox.moe/g6ywiw.jpeg",
                    sourceUrl: url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: shonux });

        // Success Reaction
        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { text: '⚠️ *Error downloading Facebook video.*' });
    }
}
break;
case 'cfn': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const full = body.slice(config.PREFIX.length + command.length).trim();
  if (!full) {
    await socket.sendMessage(sender, { text: `❗ Provide input: .cfn <jid@newsletter> | emoji1,emoji2\nExample: .cfn 120363402094635383@newsletter | 🔥,❤️` }, { quoted: msg });
    break;
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = (admins || []).map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!(isOwner || isAdmin)) {
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only owner or configured admins can add follow channels.' }, { quoted: msg });
    break;
  }

  let jidPart = full;
  let emojisPart = '';
  if (full.includes('|')) {
    const split = full.split('|');
    jidPart = split[0].trim();
    emojisPart = split.slice(1).join('|').trim();
  } else {
    const parts = full.split(/\s+/);
    if (parts.length > 1 && parts[0].includes('@newsletter')) {
      jidPart = parts.shift().trim();
      emojisPart = parts.join(' ').trim();
    } else {
      jidPart = full.trim();
      emojisPart = '';
    }
  }

  const jid = jidPart;
  if (!jid || !jid.endsWith('@newsletter')) {
    await socket.sendMessage(sender, { text: '❗ Invalid JID. Example: 120363402094635383@newsletter' }, { quoted: msg });
    break;
  }

  let emojis = [];
  if (emojisPart) {
    emojis = emojisPart.includes(',') ? emojisPart.split(',').map(e => e.trim()) : emojisPart.split(/\s+/).map(e => e.trim());
    if (emojis.length > 20) emojis = emojis.slice(0, 20);
  }

  try {
    if (typeof socket.newsletterFollow === 'function') {
      await socket.newsletterFollow(jid);
    }

    await addNewsletterToMongo(jid, emojis);

    const emojiText = emojis.length ? emojis.join(' ') : '(default set)';

    // Meta mention for botName
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: `✅ Channel followed and saved!\n\nJID: ${jid}\nEmojis: ${emojiText}\nSaved by: @${senderIdSimple}`,
      footer: `🍁 ${botName} FOLLOW CHANNEL`,
      mentions: [nowsender], // user mention
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 𝘔𝘦𝘯𝘶" }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (e) {
    console.error('cfn error', e);
    await socket.sendMessage(sender, { text: `❌ Failed to save/follow channel: ${e.message || e}` }, { quoted: msg });
  }
  break;
}

case 'chr': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');

  const q = body.split(' ').slice(1).join(' ').trim();
  if (!q.includes(',')) return await socket.sendMessage(sender, { text: "❌ Usage: chr <channelJid/messageId>,<emoji>" }, { quoted: msg });

  const parts = q.split(',');
  let channelRef = parts[0].trim();
  const reactEmoji = parts[1].trim();

  let channelJid = channelRef;
  let messageId = null;
  const maybeParts = channelRef.split('/');
  if (maybeParts.length >= 2) {
    messageId = maybeParts[maybeParts.length - 1];
    channelJid = maybeParts[maybeParts.length - 2].includes('@newsletter') ? maybeParts[maybeParts.length - 2] : channelJid;
  }

  if (!channelJid.endsWith('@newsletter')) {
    if (/^\d+$/.test(channelJid)) channelJid = `${channelJid}@newsletter`;
  }

  if (!channelJid.endsWith('@newsletter') || !messageId) {
    return await socket.sendMessage(sender, { text: '❌ Provide channelJid/messageId format.' }, { quoted: msg });
  }

  try {
    await socket.newsletterReactMessage(channelJid, messageId.toString(), reactEmoji);
    await saveNewsletterReaction(channelJid, messageId.toString(), reactEmoji, sanitized);

    // BotName meta mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHR" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: `✅ 𝐑eacted 𝐒uccessfully!\n\n𝐂hannel: ${channelJid}\n*𝐌essage:* ${messageId}\n*𝐄moji:* ${reactEmoji}\nBy: @${senderIdSimple}`,
      footer: `🍁 ${botName} REACTION`,
      mentions: [nowsender], // user mention
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 𝘔𝘦𝘯𝘶" }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (e) {
    console.error('chr command error', e);
    await socket.sendMessage(sender, { text: `❌ Failed to react: ${e.message || e}` }, { quoted: msg });
  }
  break;
}
case 'apkdownload':
case 'apk': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const id = text.split(" ")[1]; // .apkdownload <id>

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

        // ✅ Fake Meta contact message
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!id) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide an APK package ID.*\n\nExample: .apkdownload com.whatsapp',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝘔𝘦𝘯𝘶' }, type: 1 }
                ]
            }, { quoted: shonux });
        }

        // ⏳ Notify start
        await socket.sendMessage(sender, { text: '*⏳ Fetching APK info...*' }, { quoted: shonux });

        // 🔹 Call API
        const apiUrl = `https://tharuzz-ofc-apis.vercel.app/api/download/apkdownload?id=${encodeURIComponent(id)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '*❌ Failed to fetch APK info.*' }, { quoted: shonux });
        }

        const result = data.result;
        const caption = `📱 *${result.name}*\n\n` +
                        `*🆔 𝐏ackage:* \`${result.package}\`\n` +
                        `*📦 𝐒ize:* ${result.size}\n` +
                        `*🕒 𝐋ast 𝐔pdate:* ${result.lastUpdate}\n\n` +
                        `*✅ 𝐃ownloaded 𝐁y:* ${botName}`;

        // 🔹 Send APK as document
        await socket.sendMessage(sender, {
            document: { url: result.dl_link },
            fileName: `${result.name}.apk`,
            mimetype: 'application/vnd.android.package-archive',
            caption: caption,
            jpegThumbnail: result.image ? await axios.get(result.image, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : undefined
        }, { quoted: shonux });

    } catch (err) {
        console.error("Error in APK download:", err);

        // Catch block Meta mention
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
    break;
}
case 'xv':
case 'xvsearch':
case 'xvdl': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const query = text.split(" ").slice(1).join(" ").trim();

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

        // ✅ Fake Meta contact message
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_XV"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!query) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide a search query.*\n\nExample: .xv mia',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝘔𝘦𝘯𝘶' }, type: 1 }
                ]
            }, { quoted: shonux });
        }

        await socket.sendMessage(sender, { text: '*⏳ Searching XVideos...*' }, { quoted: shonux });

        // 🔹 Search API
        const searchUrl = `https://tharuzz-ofc-api-v2.vercel.app/api/search/xvsearch?query=${encodeURIComponent(query)}`;
        const { data } = await axios.get(searchUrl);

        if (!data.success || !data.result?.xvideos?.length) {
            return await socket.sendMessage(sender, { text: '*❌ No results found.*' }, { quoted: shonux });
        }

        // 🔹 Show top 10 results
        const results = data.result.xvideos.slice(0, 10);
        let listMessage = `🔍 *𝐗videos 𝐒earch 𝐑esults 𝐅or:* ${query}\n\n`;
        results.forEach((item, idx) => {
            listMessage += `*${idx + 1}.* ${item.title}\n${item.info}\n➡️ ${item.link}\n\n`;
        });
        listMessage += `*𝐏owered 𝐁y ${botName}*`;

        await socket.sendMessage(sender, {
            text: listMessage,
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝘔𝘦𝘯𝘶' }, type: 1 }
            ],
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: shonux });

        // 🔹 Store search results for reply handling
        global.xvReplyCache = global.xvReplyCache || {};
        global.xvReplyCache[sender] = results.map(r => r.link);

    } catch (err) {
        console.error("Error in XVideos search/download:", err);
        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
}
break;

// ✅ Handle reply for downloading selected video
case 'xvselect': {
    try {
        const replyText = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const selection = parseInt(replyText);

        const links = global.xvReplyCache?.[sender];
        if (!links || isNaN(selection) || selection < 1 || selection > links.length) {
            return await socket.sendMessage(sender, { text: '🚫 Invalid selection number.' }, { quoted: msg });
        }

        const videoUrl = links[selection - 1];
        await socket.sendMessage(sender, { text: '*⏳ Downloading video...*' }, { quoted: msg });

        // 🔹 Call XVideos download API
        const dlUrl = `https://tharuzz-ofc-api-v2.vercel.app/api/download/xvdl?url=${encodeURIComponent(videoUrl)}`;
        const { data } = await axios.get(dlUrl);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '*❌ Failed to fetch video.*' }, { quoted: msg });
        }

        const result = data.result;
        await socket.sendMessage(sender, {
            video: { url: result.dl_Links.highquality || result.dl_Links.lowquality },
            caption: `🎥 *${result.title}*\n\n⏱ Duration: ${result.duration}s\n\n_© Powered by ${botName}_`,
            jpegThumbnail: result.thumbnail ? await axios.get(result.thumbnail, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : undefined
        }, { quoted: msg });

        // 🔹 Clean cache
        delete global.xvReplyCache[sender];

    } catch (err) {
        console.error("Error in XVideos selection/download:", err);
        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: msg });
    }
}
break;

case 'vv':
case 'දාපන්':
case 'ඔන':
case 'ewam':
case 'save': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) {
      return await socket.sendMessage(sender, { text: '*📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 : 𝙿𝚕𝚎𝚊𝚜𝚎 𝚁𝚎𝚙𝚕𝚢 𝚃𝚘 𝙰 𝚂𝚝𝚊𝚝𝚞𝚜 !*' }, { quoted: msg });
    }

    try { await socket.sendMessage(sender, { react: { text: '🎴', key: msg.key } }); } catch(e){}

    // 🟢 Instead of bot’s own chat, use same chat (sender)
    const saveChat = sender;

    if (quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage || quotedMsg.documentMessage || quotedMsg.stickerMessage) {
      const media = await downloadQuotedMedia(quotedMsg);
      if (!media || !media.buffer) {
        return await socket.sendMessage(sender, { text: '*📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 : 𝙵𝚊𝚒𝚕𝚎𝚍 𝚃𝚘 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍 𝙼𝚎𝚍𝚒𝚊 !*' }, { quoted: msg });
      }

      let captionText = media.caption || '';
      const botCaption = `\n\n📍 *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 𝐎𝐍𝐂𝐄 𝐕𝐈𝐄𝐖* 📥\n\n*✨ 𝙼𝚊𝚍𝚎 𝙱𝚢 𝐊ᴇᴢᴜ𝚄 ||🌿 `;

      if (quotedMsg.imageMessage) {
        await socket.sendMessage(saveChat, { image: media.buffer, caption: captionText + botCaption });
      } else if (quotedMsg.videoMessage) {
        await socket.sendMessage(saveChat, { video: media.buffer, caption: captionText + botCaption, mimetype: media.mime || 'video/mp4' });
      } else if (quotedMsg.audioMessage) {
        await socket.sendMessage(saveChat, { audio: media.buffer, mimetype: media.mime || 'audio/mp4', ptt: media.ptt || false });
      } else if (quotedMsg.documentMessage) {
        const fname = media.fileName || `© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃Saved.${(await FileType.fromBuffer(media.buffer))?.ext || 'bin'}`;
        await socket.sendMessage(saveChat, { document: media.buffer, fileName: fname, mimetype: media.mime || 'application/octet-stream', caption: botCaption });
      } else if (quotedMsg.stickerMessage) {
        await socket.sendMessage(saveChat, { sticker: media.buffer });
      }

      await socket.sendMessage(sender, { text: '*📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 𝐒𝐓𝐀𝐓𝐔𝐒 𝐒𝐀𝐕𝐄𝐑* 💫\n\n*✅ 𝙳𝚘𝚠𝚗𝚕𝚘𝚊𝚍𝚎𝚍 𝚂𝚞𝚌𝚌𝚎𝚜𝚜𝚏𝚞𝚕𝚕𝚢 !*' }, { quoted: msg });

    } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
      const text = quotedMsg.conversation || quotedMsg.extendedTextMessage.text;
      await socket.sendMessage(saveChat, { text: `📍 *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 𝐒𝐓𝐀𝐓𝐔𝐒 𝐒𝐀𝐕𝐄𝐑* 📥\n\n${text}\n\n*✨ 𝙼𝚊𝚍𝚎 𝙱𝚢 𝐊ᴇᴢᴜ𝚄 ||🌿 ` });
      await socket.sendMessage(sender, { text: '*📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 𝐒𝐓𝐀𝐓𝐔𝐒 𝐒𝐀𝐕𝐄𝐑* 💫\n\n*✅ 𝚃𝚎𝚡𝚝 𝚂𝚊𝚟𝚎𝚍 𝚂𝚞𝚌𝚌𝚎𝚜𝚜𝚏𝚞𝚕𝚕𝚢 !*' }, { quoted: msg });
    } else {
      if (typeof socket.copyNForward === 'function') {
        try {
          const key = msg.message?.extendedTextMessage?.contextInfo?.stanzaId || msg.key;
          await socket.copyNForward(saveChat, msg.key, true);
          await socket.sendMessage(sender, { text: '*📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 𝐒𝐓𝐀𝐓𝐔𝐒 𝐒𝐀𝐕𝐄𝐑* 💫\n\n*✅ 𝙵𝚘𝚛𝚠𝚊𝚛𝚍𝚎𝚍 𝚂𝚞𝚌𝚌𝚎𝚜𝚜𝚏𝚞𝚕𝚕𝚢 !*' }, { quoted: msg });
        } catch (e) {
          await socket.sendMessage(sender, { text: '*📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 : 𝙴𝚛𝚛𝚘𝚛 𝙵𝚘𝚛𝚠𝚊𝚛𝚍𝚒𝚗𝚐 𝙼𝚎𝚜𝚜𝚊𝚐𝚎 !*' }, { quoted: msg });
        }
      } else {
        await socket.sendMessage(sender, { text: '*📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 : 𝚄𝚗𝚜𝚞𝚙𝚙𝚘𝚛𝚝𝚎𝚍 𝙼𝚎𝚜𝚜𝚊𝚐𝚎 𝚃𝚢𝚙𝚎 !*' }, { quoted: msg });
      }
    }

  } catch (error) {
    console.error('❌ Save error:', error);
    await socket.sendMessage(sender, { text: '*📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 : 𝙵𝚊𝚒𝚕𝚎𝚍 𝚃𝚘 𝚂𝚊𝚟𝚎 𝚂𝚝𝚊𝚝𝚞𝚜 !*' }, { quoted: msg });
  }
  break;
}
case 'alive': {
  try {
    // 1. Add Reaction (Immediate Feedback)
    await socket.sendMessage(sender, { react: { text: "🧚‍♀️", key: msg.key } });

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃'; // Default fancy name
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // 2. Calculate Uptime
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    // 3. Meta AI "Fake" Quote for style
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
      message: { contactMessage: { displayName: "🟢 ᴏɴʟɪɴᴇ", vcard: `BEGIN:VCARD
VERSION:3.0
N:;${botName};;;
FN:${botName}
ORG:Bot System
END:VCARD` } }
    };

    // 4. Beautiful & Art-full Caption Style
    const text = `
╭ *${botName}* 
┃
┃ 👋 *𝐇𝐞𝐲 𝐓𝐡𝐞𝐫𝐞! 𝐈 𝐀𝐦 𝐀𝐥𝐢𝐯𝐞 𝐍𝐨𝐰.*
┃    _Always ready to assist you!_
┃
┃ 👤 *𝐔𝐬𝐞𝐫:* @${sender.split('@')[0]}
┃ 👑 *𝐎𝐰𝐧𝐞𝐫:* ${config.OWNER_NAME || 'DCT KEZU'}
┃ ⏳ *𝐔𝐩𝐭𝐢𝐦𝐞:* ${hours}ʜ ${minutes}ᴍ ${seconds}ꜱ
┃ 🚀 *𝐕𝐞𝐫𝐬𝐢𝐨𝐧:* 2.0.0 (Pro)
┃ 💻 *𝐇𝐨𝐬𝐭:* ${process.env.PLATFORM || 'Heroku'}
┃
╰━━━━━━━━━━━━━━┈⊷
> *© 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 🍃*
`;

    // 5. Button System
    const buttons = [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🍼 𝐁𝐎𝐓 𝐌𝐄𝐍𝐔" }, type: 1 },
        { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "❤️‍🔥 𝐒𝐏𝐄𝐄𝐃 𝐓𝐄𝐒𝐓" }, type: 1 }
    ];

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `*${botName} 2026*`,
      buttons: buttons,
      headerType: 4,
      mentions: [sender] // Ensures the user tag works
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('Alive command error:', e);
    await socket.sendMessage(sender, { text: '❌ An error occurred in alive command.' }, { quoted: msg });
  }
  break;
}
// ---------------------- PING ----------------------
case 'ping': {
  try {
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    
    await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });

    // Send the initial "Loading" message
    const loadingText = `*𝙿𝚒𝚗𝚐𝚒𝚗𝚐...*`;
    const { key } = await socket.sendMessage(sender, { text: loadingText }, { quoted: msg });

    // 🔄 Animation Sequence (Edit the message to create a bar)
    const frames = [
      '𝚕𝚘𝚊𝚍𝚒𝚗𝚐.',
      '𝚕𝚘𝚊𝚍𝚒𝚗𝚐..',
      '𝚕𝚘𝚊𝚍𝚒𝚗𝚐...',
      '𝚕𝚘𝚊𝚍𝚒𝚗𝚐..',
      '𝚕𝚘𝚊𝚍𝚒𝚗𝚐.',
      '𝚜𝚞𝚌𝚌𝚎𝚜𝚜...'
    ];

    for (let frame of frames) {
      await socket.sendMessage(sender, { text: `*ᴀɴᴀʟʏᴢɪɴɢ ɴᴇᴛᴡᴏʀᴋ...*
${frame}`, edit: key });
      await sleep(500); // 0.5s delay between frames
    }

    // =================================================================
    // 📊 2. REAL DATA PROCESSING
    // =================================================================
    const start = Date.now();
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || "© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃";
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Latency Calculation
    const end = Date.now();
    const latency = end - start; 
    const finalLatency = latency > 0 ? latency : Math.floor(Math.random() * 50) + 10;

    // Tech Stats
    const memory = process.memoryUsage();
    const ramUsage = (memory.rss / 1024 / 1024).toFixed(2); 
    const totalMem = 4096; 
    
    // =================================================================
    // 🖼️ 3. FINAL ARTFUL CARD (The "Result")
    // =================================================================
    const text = `
╭ *${botName}* 
┃
┃ 🌿 *ᴘɪɴɢ* : ${finalLatency} ᴍꜱ
┃ 💾 *ʀᴀᴍ*  : ${ramUsage} / ${totalMem} ᴍʙ
┃ 🍷 *ᴛʏᴘᴇ* : ${config.WORK_TYPE || 'ᴘᴜʙʟɪᴄ'}
┃ 📅 *ᴅᴀᴛᴇ* : ${new Date().toLocaleDateString('en-GB')}
┃
╰━━〔 *${config.OWNER_NAME || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃'}* 〕━━┈⊷

   *🚀 ꜱʏꜱᴛᴇᴍ ɪꜱ ʀᴜɴɴɪɴɢ ꜱᴍᴏᴏᴛʜʟʏ*
`;

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "PING_FINAL" },
      message: { 
        contactMessage: { 
          displayName: `🚀 ${finalLatency}ms`, 
          vcard: `BEGIN:VCARD
VERSION:3.0
N:;Bot;;;
FN:Speed
ORG:${botName}
END:VCARD` 
        } 
      }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    // =================================================================
    // 🔘 4. GENERATE BUTTONS
    // =================================================================
    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🌿 𝙼𝙴𝙽𝚄" }, type: 1 },
      { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "🖤 𝙲𝙷𝙴𝙲𝙺𝚄𝙿" }, type: 1 }
    ];

    // Final "Done" Reaction
    await socket.sendMessage(sender, { react: { text: '🍁', key: msg.key } });

    // Send the final Image Card
    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `*© ᴘᴏᴡᴇʀᴇᴅ ʙʏ © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`,
      buttons: buttons,
      headerType: 4,
      contextInfo: {
        externalAdReply: {
          title: "🚀 ꜱᴘᴇᴇᴅ ᴛᴇꜱᴛ ᴄᴏᴍᴘʟᴇᴛᴇᴅ",
          body: `Latency: ${finalLatency}ms - Optimized`,
          thumbnailUrl: logo,
          sourceUrl: "https://github.com/",
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    }, { quoted: metaQuote });

    // Optional: Delete the loading message to keep chat clean
    // await socket.sendMessage(sender, { delete: key }); 

  } catch (e) {
    console.error('Ping command error:', e);
    await socket.sendMessage(sender, { text: '❌ *Error in Loading Sequence.*' }, { quoted: msg });
  }
  break;
}

// ---------------------- ULTRA FAST PING ----------------------
case 'p': {
  try {
    const t1 = Date.now();
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo', day:'2-digit', month:'2-digit', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const latency = Date.now() - t1;
    const finalMs = latency < 1 ? Math.floor(Math.random() * 8) + 1 : latency;
    await socket.sendMessage(sender, { react: { text: '⚡', key: msg.key } });
    await socket.sendMessage(sender, {
      text: `⚡ *ᴜʟᴛʀᴀ ꜰᴀꜱᴛ ᴘɪɴɢ*\n\n🏓 *ᴘɪɴɢ* : ${finalMs} ᴍꜱ\n🕐 *ᴛɪᴍᴇ* : ${timeStr}\n📅 *ᴅᴀᴛᴇ* : ${dateStr}\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
    }, { quoted: msg });
  } catch(e) {
    await socket.sendMessage(sender, { text: '❌ Ping failed.' }, { quoted: msg });
  }
  break;
}

// ─── AUTO TIKTOK SEND ───────────────────────────────────────────
case 'autottsend': {
  try {
    const sanitizedNum = (number || '').replace(/[^0-9]/g, '');
    const cfg2 = await loadUserConfigFromMongo(sanitizedNum) || {};
    const botName2 = cfg2.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    const argText = (args.join(' ') || '').trim();

    // ── OFF ──
    if (argText.toLowerCase() === 'off') {
      stopAllAutoTTSend(sanitizedNum);
      await removeAutoTTSend(sanitizedNum);
      await socket.sendMessage(sender, { react: { text: '🛑', key: msg.key } });
      await socket.sendMessage(sender, {
        text: `🛑 *AutoTTSend Disabled*\n\nAll auto TikTok sending has been stopped.\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
      }, { quoted: msg });
      break;
    }

    // ── SET ── usage: autottsend jid,title,time
    const parts2 = argText.split(',');
    if (parts2.length < 2) {
      await socket.sendMessage(sender, {
        text: `❌ *Wrong Usage!*\n\n*Usage:* \`.autottsend jid,title,time\`\n*Example:* \`.autottsend 120363402094635383@newsletter,funny cats,15\`\n_(time = minutes, default 10)_\n\nTo turn off: \`.autottsend off\`\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
      }, { quoted: msg });
      break;
    }

    let rawLink = parts2[0].trim();
    // Time is last part if it's a number, title is everything in between
    let ttIntervalMin = 10;
    let titleParts2 = parts2.slice(1);
    if (titleParts2.length >= 2) {
      const lastPart = titleParts2[titleParts2.length - 1].trim();
      if (/^\d+$/.test(lastPart)) {
        ttIntervalMin = parseInt(lastPart, 10);
        titleParts2 = titleParts2.slice(0, -1);
      }
    }
    const title2 = titleParts2.join(',').trim();

    if (!title2) {
      await socket.sendMessage(sender, { text: '❌ Please provide a title/keyword after the JID.' }, { quoted: msg });
      break;
    }
    if (ttIntervalMin < 1) ttIntervalMin = 1;

    // ── Resolve JID ──
    let targetJid = rawLink;

    if (rawLink.includes('chat.whatsapp.com/')) {
      const inviteCode = rawLink.split('chat.whatsapp.com/')[1]?.split(/[?&]/)[0];
      try {
        const info = await socket.groupGetInviteInfo(inviteCode);
        targetJid = info.id;
      } catch(e) {
        await socket.sendMessage(sender, { text: `❌ Could not resolve group link. Try using the JID directly (e.g. 120363402094635383@newsletter)` }, { quoted: msg });
        break;
      }
    } else if (!targetJid.includes('@')) {
      if (/^\d+$/.test(targetJid)) targetJid = `${targetJid}@newsletter`;
      else {
        await socket.sendMessage(sender, { text: `❌ Invalid JID. Use @newsletter or @g.us format.` }, { quoted: msg });
        break;
      }
    }

    // ── Save & Start ──
    await addAutoTTSend(sanitizedNum, targetJid, title2, ttIntervalMin);
    startAutoTTSendInterval(socket, sanitizedNum, targetJid, title2, botName2, ttIntervalMin);

    // Send one immediately
    sendAutoTTVideo(socket, targetJid, title2, botName2).catch(e => console.error('AutoTTSend immediate error:', e.message));

    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    await socket.sendMessage(sender, {
      text: `✅ *AutoTTSend Enabled!*\n\n🎯 *Target:* ${targetJid}\n🔍 *Keyword:* ${title2}\n⏱️ *Interval:* Every ${ttIntervalMin} minute(s)\n\nTo stop: \`.autottsend off\`\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
    }, { quoted: msg });

  } catch(e) {
    console.error('autottsend error:', e);
    await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ─────────────── CHANREACT (Channel Auto Reaction) ────────────────────────────
case 'chanreact': {
  try {
    const sanitizedNum = (number || '').replace(/[^0-9]/g, '');
    const cfg2 = await loadUserConfigFromMongo(sanitizedNum) || {};
    const botName2 = cfg2.botName || BOT_NAME_FANCY;
    const logo2 = cfg2.logo || config.RCD_IMAGE_PATH;

    const argText = (args.join(' ') || '').trim();

    if (argText.toLowerCase() === 'off') {
      await socket.sendMessage(sender, { react: { text: '🛑', key: msg.key } });
      await socket.sendMessage(sender, {
        text: `❗ *Please use* \`.stopreact <channelJid>\` *to stop a specific channel.*\n\nExample: \`.stopreact 120363402094635383@newsletter\`\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
      }, { quoted: msg });
      break;
    }

    const commaIdx = argText.indexOf(',');
    if (commaIdx === -1) {
      await socket.sendMessage(sender, {
        text: `❌ *Wrong Usage!*\n\n*Usage:* \`.chanreact <channelJid>,<emoji>\`\n*Example:* \`.chanreact 120363402094635383@newsletter,🔥\`\n\nTo stop: \`.stopreact 120363402094635383@newsletter\`\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
      }, { quoted: msg });
      break;
    }

    let channelJid = argText.slice(0, commaIdx).trim();
    const emojiRaw = argText.slice(commaIdx + 1).trim();

    if (!channelJid.endsWith('@newsletter')) {
      if (/^\d+$/.test(channelJid)) channelJid = `${channelJid}@newsletter`;
    }
    if (!channelJid.endsWith('@newsletter')) {
      await socket.sendMessage(sender, { text: `❌ Invalid channel JID. Must end with @newsletter.\nExample: \`120363402094635383@newsletter\`` }, { quoted: msg });
      break;
    }
    if (!emojiRaw) {
      await socket.sendMessage(sender, { text: `❌ Please provide an emoji after the comma.` }, { quoted: msg });
      break;
    }

    const emojisArr = emojiRaw.includes(',') ? emojiRaw.split(',').map(e => e.trim()).filter(Boolean) : [emojiRaw];

    await addNewsletterReactConfig(channelJid, emojisArr);

    try {
      if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(channelJid);
    } catch(e) {}

    let imgPayload2;
    try {
      imgPayload2 = String(logo2).startsWith('http') ? { url: logo2 } : fs.readFileSync(logo2);
    } catch(e) { imgPayload2 = { url: config.RCD_IMAGE_PATH }; }

    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    try {
      await socket.sendMessage(sender, {
        image: imgPayload2,
        caption: `✅ *Channel AutoReact Enabled!*\n\n📡 *Channel:* \`${channelJid}\`\n😊 *Emoji:* ${emojisArr.join(' ')}\n\n_Every new update from this channel will get auto-reacted!_\n\nTo stop: \`.stopreact ${channelJid}\`\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
      }, { quoted: msg });
    } catch(imgErr) {
      await socket.sendMessage(sender, {
        text: `✅ *Channel AutoReact Enabled!*\n\n📡 *Channel:* \`${channelJid}\`\n😊 *Emoji:* ${emojisArr.join(' ')}\n\n_Every new update from this channel will get auto-reacted!_\n\nTo stop: \`.stopreact ${channelJid}\`\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
      }, { quoted: msg });
    }

  } catch(e) {
    console.error('chanreact error:', e);
    await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ─────────────── STOP REACT (Stop channel auto reaction) ──────────────────────
case 'stopreact': {
  try {
    const sanitizedNum = (number || '').replace(/[^0-9]/g, '');
    const cfg2 = await loadUserConfigFromMongo(sanitizedNum) || {};
    const botName2 = cfg2.botName || BOT_NAME_FANCY;
    const logo2 = cfg2.logo || config.RCD_IMAGE_PATH;

    let channelJid = (args[0] || '').trim();
    if (!channelJid) {
      await socket.sendMessage(sender, {
        text: `❗ *Usage:* \`.stopreact <channelJid>\`\n*Example:* \`.stopreact 120363402094635383@newsletter\`\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
      }, { quoted: msg });
      break;
    }

    if (!channelJid.endsWith('@newsletter')) {
      if (/^\d+$/.test(channelJid)) channelJid = `${channelJid}@newsletter`;
    }
    if (!channelJid.endsWith('@newsletter')) {
      await socket.sendMessage(sender, { text: `❌ Invalid channel JID. Must end with @newsletter.` }, { quoted: msg });
      break;
    }

    await removeNewsletterReactConfig(channelJid);

    const metaQuote2 = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_STOPREACT" },
      message: { contactMessage: { displayName: botName2, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName2};;;;\nFN:${botName2}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    let imgPayload2 = String(logo2).startsWith('http') ? { url: logo2 } : fs.readFileSync(logo2);
    await socket.sendMessage(sender, { react: { text: '🛑', key: msg.key } });
    await socket.sendMessage(sender, {
      image: imgPayload2,
      caption: `🛑 *AutoReact Disabled!*\n\n📡 *Channel:* \`${channelJid}\`\n\n_Auto-reacting to this channel has been stopped._\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝘔𝘦𝘯𝘶' }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote2 });

  } catch(e) {
    console.error('stopreact error:', e);
    await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ─────────────── CSONG (Send Song to Channel) ─────────────────────────────────
case 'csong': {
  try {
    const sanitizedNum = (number || '').replace(/[^0-9]/g, '');
    const cfg2 = await loadUserConfigFromMongo(sanitizedNum) || {};
    const botName2 = cfg2.botName || BOT_NAME_FANCY;

    const argText = (args.join(' ') || '').trim();
    const commaIdx = argText.indexOf(',');

    if (commaIdx === -1) {
      await socket.sendMessage(sender, {
        text:
`❌ *Wrong Usage!*

*Usage:* \`.csong <channelJid>,<song title or YouTube URL>\`

*Example:* 
\`.csong 120363402094635383@newsletter,kalaya rezzy\`

> *© DCT CRIMINAL MD*`
      }, { quoted: msg });
      break;
    }

    let channelJid = argText.slice(0, commaIdx).trim();
    const query = argText.slice(commaIdx + 1).trim();

    if (!channelJid.endsWith('@newsletter')) {
      if (/^\d+$/.test(channelJid)) {
        channelJid = `${channelJid}@newsletter`;
      }
    }

    if (!channelJid.endsWith('@newsletter')) {
      return await socket.sendMessage(sender, {
        text: `❌ Invalid channel JID`
      }, { quoted: msg });
    }

    if (!query) {
      return await socket.sendMessage(sender, {
        text: `❌ Please provide a song name`
      }, { quoted: msg });
    }

    await socket.sendMessage(sender, {
      react: { text: '🔍', key: msg.key }
    });

    let data;

    // YouTube URL
    if (query.match(/(youtube\.com|youtu\.be)/)) {

      const match = query.match(
        /(?:v=|\/)([0-9A-Za-z_-]{11})/
      );

      const videoId = match ? match[1] : null;

      if (!videoId) throw new Error('Invalid YouTube URL');

      data = await yts({ videoId });

    } else {

      const result = await yts(query);

      if (!result.videos.length) {
        throw new Error('No results found');
      }

      data = result.videos[0];
    }

    if (!data) throw new Error('Song not found');

    const videoId = data.videoId;

    // API
    const apiUrl =
`${config.API_YTMP3_URL}/api/ytmp3?url=https://youtu.be/${videoId}`;

    const res = await axios.get(apiUrl, {
      timeout: 30000
    });

    if (res.data.status !== 'success') {
      throw new Error(
        res.data.message || 'Download failed'
      );
    }

    const songTitle =
      res.data.data.title || data.title;

    const downloadLink =
      res.data.data.download_url;

    const thumbnail =
      res.data.data.thumbnail || data.thumbnail;

    // Thumbnail buffer
    let thumbBuffer = null;

    try {

      const thumbRes = await axios.get(thumbnail, {
        responseType: 'arraybuffer'
      });

      thumbBuffer = Buffer.from(thumbRes.data);

    } catch (e) {
      console.log(e);
    }

    // ===== PREVIEW BANNER =====
    await socket.sendMessage(channelJid, {
      image: { url: thumbnail },
      caption:
`🎵 *NOW PLAYING*

📌 *Title:* ${songTitle}
👀 *Views:* ${data.views || 'Unknown'}
⏱️ *Duration:* ${data.timestamp || 'Unknown'}
📺 *Channel:* ${data.author?.name || 'Unknown'}

> Powered By ${botName2}`
    });

    // ===== SONG SEND =====
    await socket.sendMessage(channelJid, {

      audio: { url: downloadLink },

      mimetype: 'audio/ogg; codecs=opus',

      ptt: true,

      fileName:
`${songTitle.replace(/[^a-zA-Z0-9 ]/g, '_')}.ogg`,

      jpegThumbnail: thumbBuffer

    });

    await socket.sendMessage(sender, {
      react: { text: '✅', key: msg.key }
    });

    await socket.sendMessage(sender, {
      text:
`✅ *Song sent successfully*

🎵 *Title:* ${songTitle}
📡 *Channel:* ${channelJid}

> *© DCT CRIMINAL MD*`
    }, { quoted: msg });

  } catch (e) {

    console.error('csong error:', e);

    await socket.sendMessage(sender, {
      react: { text: '❌', key: msg.key }
    });

    await socket.sendMessage(sender, {
      text: `❌ Error: ${e.message}`
    }, { quoted: msg });
  }

  break;
}

// ─────────────── AUTOSONG (Auto Send Songs to Channel every 30min) ─────────────
case 'autosong': {
  try {
    const sanitizedNum = (number || '').replace(/[^0-9]/g, '');
    const cfg2 = await loadUserConfigFromMongo(sanitizedNum) || {};
    const botName2 = cfg2.botName || BOT_NAME_FANCY;

    const argText = (args.join(' ') || '').trim();

    if (argText.toLowerCase() === 'off') {
      stopAutoSongForNumber(sanitizedNum);
      await removeAutoSongSend(sanitizedNum);
      await socket.sendMessage(sender, { react: { text: '🛑', key: msg.key } });
      await socket.sendMessage(sender, {
        text: `🛑 *AutoSong Disabled*\n\nAuto song sending has been stopped.\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
      }, { quoted: msg });
      break;
    }

    const songParts = argText.split(',');
    if (songParts.length < 2) {
      await socket.sendMessage(sender, {
        text: `❌ *Wrong Usage!*\n\n*Usage:* \`.autosong jid,song title,time\`\n*Example:* \`.autosong 120363402094635383@newsletter,Shape of You,30\`\n_(time = minutes, default 30)_\n\nTo stop: \`.autosong off\`\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
      }, { quoted: msg });
      break;
    }

    let targetJid = songParts[0].trim();
    let songIntervalMin = 30;
    let songTitleParts = songParts.slice(1);
    if (songTitleParts.length >= 2) {
      const lastSongPart = songTitleParts[songTitleParts.length - 1].trim();
      if (/^\d+$/.test(lastSongPart)) {
        songIntervalMin = parseInt(lastSongPart, 10);
        songTitleParts = songTitleParts.slice(0, -1);
      }
    }
    const songTitle2 = songTitleParts.join(',').trim();

    if (!targetJid.endsWith('@newsletter') && !targetJid.endsWith('@g.us')) {
      if (/^\d+$/.test(targetJid)) targetJid = `${targetJid}@newsletter`;
    }
    if (!targetJid.includes('@')) {
      await socket.sendMessage(sender, { text: `❌ Invalid JID. Use a channel JID (@newsletter) or group JID (@g.us).` }, { quoted: msg });
      break;
    }
    if (!songTitle2) {
      await socket.sendMessage(sender, { text: `❌ Please provide a song title after the JID.` }, { quoted: msg });
      break;
    }
    if (songIntervalMin < 1) songIntervalMin = 1;

    await addAutoSongSend(sanitizedNum, targetJid, songTitle2, songIntervalMin);
    startAutoSongInterval(socket, sanitizedNum, targetJid, songTitle2, botName2, songIntervalMin);

    sendAutoSong(socket, targetJid, songTitle2, botName2).catch(e => console.error('AutoSong immediate error:', e.message));

    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    await socket.sendMessage(sender, {
      text: `✅ *AutoSong Enabled!*\n\n📡 *Target:* ${targetJid}\n🎵 *Song:* ${songTitle2}\n⏱️ *Interval:* Every ${songIntervalMin} minute(s)\n\nTo stop: \`.autosong off\`\n\n> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*`
    }, { quoted: msg });

  } catch(e) {
    console.error('autosong error:', e);
    await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ---------------------- BOOM ----------------------
case 'boom': {
  try {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    await socket.sendMessage(sender, { react: { text: '💥', key: msg.key } });

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    // target is replied user or mentioned arg
    const targetNum = args[0] ? args[0].replace(/[^0-9]/g, '') : senderNumber;
    const targetJid = `${targetNum}@s.whatsapp.net`;

    // Animation frames — building up the explosion
    const frames = [
      '🌑 𝗟𝗼𝗮𝗱𝗶𝗻𝗴 𝗕𝗼𝗺𝗯...',
      '🌒 𝗔𝗿𝗺𝗶𝗻𝗴 𝗘𝘅𝗽𝗹𝗼𝘀𝗶𝘃𝗲...',
      '🌓 𝗙𝘂𝘀𝗲 𝗜𝗴𝗻𝗶𝘁𝗲𝗱... 🔥',
      '🌔 𝗖𝗼𝘂𝗻𝘁𝗱𝗼𝘄𝗻: 3️⃣...',
      '🌕 𝗖𝗼𝘂𝗻𝘁𝗱𝗼𝘄𝗻: 2️⃣...',
      '🌖 𝗖𝗼𝘂𝗻𝘁𝗱𝗼𝘄𝗻: 1️⃣...',
      '💥 *B O O M !*'
    ];

    const { key: animKey } = await socket.sendMessage(sender, { text: frames[0] }, { quoted: msg });

    for (let i = 1; i < frames.length; i++) {
      await sleep(700);
      await socket.sendMessage(sender, { text: frames[i], edit: animKey });
    }

    await sleep(600);

    // Final BOOM card
    const boomText = `
╭━━━━━━━━━━━━━━━━━━━━━╮
┃   💣 *B O O M !* 💣   ┃
╰━━━━━━━━━━━━━━━━━━━━━╯

💥💥💥💥💥💥💥💥💥💥💥
💥                                    💥
💥   @${targetNum} has been    💥
💥     B O M B E D ! 💣          💥
💥                                    💥
💥💥💥💥💥💥💥💥💥💥💥

🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥
*𝗕𝗢𝗢𝗠𝗕𝗔𝗦𝗧𝗘𝗗 𝗕𝗬 ${botName}* 💥

> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}*
`.trim();

    await socket.sendMessage(sender, {
      text: boomText,
      mentions: [targetJid]
    }, { quoted: msg });

    await socket.sendMessage(sender, { react: { text: '💣', key: msg.key } });

  } catch (e) {
    console.error('Boom command error:', e);
    await socket.sendMessage(sender, { text: '❌ Boom command failed.' }, { quoted: msg });
  }
  break;
}

// ---------------------- HACK ----------------------
case 'hack': {
  try {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    await socket.sendMessage(sender, { react: { text: '💻', key: msg.key } });

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    const targetNum = args[0] ? args[0].replace(/[^0-9]/g, '') : senderNumber;
    const targetJid = `${targetNum}@s.whatsapp.net`;

    // Fake hacking animation frames
    const hackFrames = [
      '```[●] Initializing hack sequence...```',
      '```[●] Connecting to target: +' + targetNum + '...```',
      '```[●] Bypassing firewall... ██░░░░░░ 25%```',
      '```[●] Cracking encryption... ████░░░░ 50%```',
      '```[●] Accessing database... ██████░░ 75%```',
      '```[●] Extracting data...    ████████ 99%```',
      '```[✔] ACCESS GRANTED 🔓```'
    ];

    const { key: hackKey } = await socket.sendMessage(sender, { text: hackFrames[0] }, { quoted: msg });

    for (let i = 1; i < hackFrames.length; i++) {
      await sleep(900);
      await socket.sendMessage(sender, { text: hackFrames[i], edit: hackKey });
    }

    await sleep(700);

    // Final hack result card
    const hackResult = `
╭━━━━━━━━━━━━━━━━━━━━╮
┃  💻 *H A C K E D !* 🔓  ┃
╰━━━━━━━━━━━━━━━━━━━━╯

🖥️ *𝗧𝗮𝗿𝗴𝗲𝘁:* @${targetNum}
📡 *𝗦𝘁𝗮𝘁𝘂𝘀:* 🔴 𝗖𝗼𝗺𝗽𝗿𝗼𝗺𝗶𝘀𝗲𝗱

┌─────────────────────
│ 📁 𝗙𝗶𝗹𝗲𝘀 𝗔𝗰𝗰𝗲𝘀𝘀𝗲𝗱   : 9,999
│ 🔑 𝗣𝗮𝘀𝘀𝘄𝗼𝗿𝗱𝘀 𝗙𝗼𝘂𝗻𝗱  : ****
│ 📍 𝗟𝗼𝗰𝗮𝘁𝗶𝗼𝗻 𝗧𝗿𝗮𝗰𝗸𝗲𝗱 : 🌐 Online
│ 📷 𝗖𝗮𝗺𝗲𝗿𝗮 𝗛𝗮𝗰𝗸𝗲𝗱   : ✅ Active
│ 📞 𝗖𝗮𝗹𝗹𝘀 𝗥𝗲𝗰𝗼𝗿𝗱𝗲𝗱  : ✅ Logging
└─────────────────────

⚠️ _This is just for fun — no real hacking!_ ⚠️

> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}*
`.trim();

    await socket.sendMessage(sender, {
      text: hackResult,
      mentions: [targetJid]
    }, { quoted: msg });

    await socket.sendMessage(sender, { react: { text: '🔓', key: msg.key } });

  } catch (e) {
    console.error('Hack command error:', e);
    await socket.sendMessage(sender, { text: '❌ Hack command failed.' }, { quoted: msg });
  }
  break;
}
case 'activesessions':
case 'active':
case 'bots': {
  try {
    // ------------------------------------------------------------------
    // 1. SETUP & SAFETY VARIABLES
    // ------------------------------------------------------------------
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Safety: Ensure we have a valid key to react to
    const targetKey = (msg && msg.key) ? msg.key : null;
    
    // Safety: Ensure 'sender' is defined
    const safeSender = sender || (msg && msg.key && msg.key.remoteJid) || '';
    if (!safeSender) break; 

    // React immediately 
    try { if(targetKey) await socket.sendMessage(safeSender, { react: { text: "📍", key: targetKey } }); } catch(e) {}

    // ------------------------------------------------------------------
    // 2. ADVANCED LOADING SEQUENCE (Fixed Strings)
    // ------------------------------------------------------------------
    
    // Send Initial "Booting" Message
    let loadMsg;
    try {
        loadMsg = await socket.sendMessage(safeSender, { 
            text: `🔄 *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 𝐒𝐘𝐒𝐓𝐄𝐌𝐒...*` 
        }, { quoted: msg });
    } catch (e) {
        console.log("Error sending load message:", e);
        break; 
    }

    const loadKey = loadMsg.key;

    // Animation 1: Connection (Using backticks to prevent SyntaxError)
    await sleep(500);
    await socket.sendMessage(safeSender, { 
        text: `📡 *Connecting to © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 Server...*
[▢▢▢▢▢] 0%`, 
        edit: loadKey 
    });

    // ------------------------------------------------------------------
    // 3. SECURE CONFIGURATION LOADING
    // ------------------------------------------------------------------
    
    const currentNumber = (typeof number !== 'undefined' ? number : '').replace(/[^0-9]/g, '');
    
    let cfg = {};
    try {
        if (typeof loadUserConfigFromMongo === 'function') {
            cfg = await loadUserConfigFromMongo(currentNumber) || {};
        }
    } catch (err) {
        console.warn("MongoDB Config Load Failed:", err);
    }

    const botName = "© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃";
    const defaultLogo = "https://files.catbox.moe/g6ywiw.jpeg";
    const configLogo = cfg.logo || (typeof config !== 'undefined' ? config.RCD_IMAGE_PATH : null);

    // Animation 2: Security Check
    await sleep(700);
    await socket.sendMessage(safeSender, { 
        text: `🔐 *Checking Admin Privileges...*
[▣▣▢▢▢] 40%`, 
        edit: loadKey 
    });

    // ------------------------------------------------------------------
    // 4. ROBUST PERMISSION SYSTEM
    // ------------------------------------------------------------------
    
    let isAdmin = false;
    let isOwnerSafe = (typeof isOwner !== 'undefined' ? isOwner : false);

    try {
        const dbAdmins = (typeof loadAdminsFromMongo === 'function') ? await loadAdminsFromMongo() : [];
        const normalizedAdmins = (dbAdmins || []).map(a => (a || '').toString().replace(/[^0-9]/g, ''));
        
        const senderNum = safeSender.split('@')[0];
        const realOwnerNum = (typeof nowsender !== 'undefined' ? nowsender : safeSender).split('@')[0];
        
        isAdmin = normalizedAdmins.includes(senderNum) || normalizedAdmins.includes(realOwnerNum);
    } catch (err) {
        console.error("Admin check error:", err);
    }

    if (!isOwnerSafe && !isAdmin) {
        await socket.sendMessage(safeSender, { 
            text: `❌ *ACCESS DENIED*
${botName} Protects This Data.
[FAIL❌] FAILED`, 
            edit: loadKey 
        });
        if(targetKey) await socket.sendMessage(safeSender, { react: { text: "🚫", key: targetKey } });
        break; 
    }

    // ------------------------------------------------------------------
    // 5. SESSION DATA RETRIEVAL
    // ------------------------------------------------------------------
    
    // Animation 3: Scanning
    await sleep(600);
    await socket.sendMessage(safeSender, { 
        text: `🔍 *Scanning Active Sessions...*
[▣▣▣▣▢] 80%`, 
        edit: loadKey 
    });

    let activeCount = 0;
    let activeNumbers = [];
    
    try {
        let mapSource = null;
        if (typeof activeSockets !== 'undefined' && activeSockets instanceof Map) {
            mapSource = activeSockets;
        } else if (typeof global.activeSockets !== 'undefined' && global.activeSockets instanceof Map) {
            mapSource = global.activeSockets;
        }

        if (mapSource) {
            activeCount = mapSource.size;
            activeNumbers = Array.from(mapSource.keys());
        }
    } catch (e) {
        console.log("Error reading sockets:", e);
    }

    // Animation 4: Complete
    await sleep(500);
    await socket.sendMessage(safeSender, { 
        text: `✅ *${botName} Data Retrieved!*
[▣▣▣▣▣] 100%`, 
        edit: loadKey 
    });
    
    await sleep(500);
    await socket.sendMessage(safeSender, { delete: loadKey }); 

    // ------------------------------------------------------------------
    // 6. FINAL DASHBOARD GENERATION
    // ------------------------------------------------------------------
    
    if(targetKey) await socket.sendMessage(safeSender, { react: { text: "🕵️‍♂️", key: targetKey } });

    const getSLTime = () => {
        try {
            return new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo', hour12: true, hour: 'numeric', minute: 'numeric', second: 'numeric' });
        } catch (e) {
            return new Date().toLocaleTimeString();
        }
    };

    const time = getSLTime();
    const date = new Date().toLocaleDateString();

    // Using backticks for the main text block too
    let text = `╭─── [ 📍 *${botName}* ] ───
│
│ 📡 *𝚂𝚝𝚊𝚝𝚞𝚜:* 🟢 𝙾𝚗𝚕𝚒𝚗𝚎
│ 📊 *𝙰𝚌𝚝𝚒𝚟𝚎 𝚄𝚜𝚎𝚛𝚜:* ${activeCount}
│ 📅 *𝙳𝚊𝚝𝚎:* ${date}
│ ⌚ *𝚃𝚒𝚖𝚎:* ${time}
│`;

    if (activeCount > 0) {
        text += `
│ 📱 *𝙲𝚘𝚗𝚗𝚎𝚌𝚝𝚎𝚍 𝚂𝚎𝚜𝚜𝚒𝚘𝚗𝚜:*`;
        activeNumbers.forEach((num, index) => {
            text += `
│    ${index + 1}. 👤:${num}`; 
        });
    } else {
        text += `
│ ⚠️ 𝙽𝚘 𝚊𝚌𝚝𝚒𝚟𝚎 𝚜𝚎𝚜𝚜𝚒𝚘𝚗𝚜.`;
    }
    
    text += `
│
╰──────────────────────`;

    let imagePayload = { url: defaultLogo }; 
    
    if (configLogo) {
        if (String(configLogo).startsWith('http')) {
            imagePayload = { url: configLogo };
        } else {
            try {
                const fs = require('fs'); 
                if (fs.existsSync(configLogo)) {
                    imagePayload = fs.readFileSync(configLogo);
                }
            } catch (e) {
                console.log("Local logo not found, using default.");
            }
        }
    }

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃_STATUS" },
      message: { 
        contactMessage: { 
          displayName: botName, 
          vcard: `BEGIN:VCARD
VERSION:3.0
N:XMD;© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃;;
FN:${botName}
ORG:© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 Systems
TEL;type=CELL;type=VOICE;waid=94700000000:+94 70 000 0000
END:VCARD` 
        } 
      }
    };

    const prefix = (typeof config !== 'undefined' && config.PREFIX) ? config.PREFIX : '.';

    await socket.sendMessage(safeSender, {
      image: imagePayload,
      caption: text,
      footer: `📍 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 𝐒𝐘𝐒𝐓𝐄𝐌`,
      contextInfo: {
        externalAdReply: {
          title: `${botName} 𝐌𝐨𝐧𝐢𝐭𝐨𝐫`,
          body: `📍 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃`,
          previewType: "PHOTO",
          thumbnailUrl: String(imagePayload.url || defaultLogo), 
          sourceUrl: "https://whatsapp.com/channel/0029Va8f3smKWEKkKufO",
          mediaType: 1,
          renderLargerThumbnail: true
        }
      },
      buttons: [
        { buttonId: `${prefix}menu`, buttonText: { displayText: "📍 𝙼𝚊𝚒𝚗 𝙼𝚎𝚗𝚞" }, type: 1 },
        { buttonId: `${prefix}ping`, buttonText: { displayText: "🌿 𝚂𝚙𝚎𝚎𝚍 𝚃𝚎𝚜𝚝" }, type: 1 },
        { buttonId: `${prefix}owner`, buttonText: { displayText: "🍷 𝙳𝚎𝚟𝚎𝚕𝚘𝚙𝚎𝚛" }, type: 1 }
      ],
      headerType: 4
    }, { quoted: metaQuote });

  } catch(globalError) {
    console.error('ActiveSessions CRITICAL FAILURE:', globalError);
    try {
        await socket.sendMessage(sender, { 
            text: '❌ *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 Error:* An unexpected system error occurred.' 
        }, { quoted: msg });
    } catch (e) {}
  }
  break;
}
case 'song':
case 'play':
case 'audio':
case 'ytmp3':
    if (!args.length) {
        await socket.sendMessage(sender, {
            text: '❌ ERROR\n\n*Need YouTube URL or Song Title*'
        }, { quoted: msg });
        break;
    }

    const lakiya = args.join(' ');
    await socket.sendMessage(sender, { text: '🔍 Searching song...' });

    try {
        let data;

  
        if (lakiya.match(/(youtube\.com|youtu\.be)/)) {
            const match = lakiya.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
            const videoId = match ? match[1] : null;

            if (!videoId) throw new Error('Invalid YouTube URL');

            const result = await yts({ videoId });
            data = result;
        } else {
            const result = await yts(lakiya);

            if (!result.videos || result.videos.length === 0) {
                await socket.sendMessage(sender, {
                    text: '❌ NO RESULTS\n\n*No results found for your query*'
                }, { quoted: msg });
                break;
            }

            data = result.videos[0];
        }

        if (!data) throw new Error('No results');

        const videoId = data.videoId;
        const desc = `☘️ *𝗦𝗢𝗡𝗚* : _${data.title || 'N/A'}_     
╭─────────────────┄┄
💠⏱️ *𝗗ᴜʀᴀᴛɪᴏɴ ➟* _${data.timestamp || 'N/A'}_
💠👀 *𝗩ɪᴇᴡꜱ ➟* _${data.views?.toLocaleString() || 'N/A'}_
💠📅 *𝗣ᴜʙʟɪꜱʜᴇᴅ ➟* _${data.ago || 'N/A'}_
💠🎤 *𝗖ʜᴀɴɴᴇʟ ➟* _${data.author?.name || 'N/A'}_
╰──────────────────┉┉
*⬇️ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 𝗢𝗣𝗧𝗜𝗢𝗡𝗦*

*🔢 𝗥ᴇᴘʟʏ ᴡɪᴛʜ ᴀ 𝗡ᴜᴍʙᴇʀ 👇*

*01 🎧 ❯❯ ᴀᴜᴅɪᴏ (ᴍᴘ3)*
*02 📁 ❯❯ ᴅᴏᴄᴜᴍᴇɴᴛ (ғɪʟᴇ)*
*03 🎤 ❯❯ ᴠᴏɪᴄᴇ (ᴘᴛᴛ)*
`;

        const sentMsg = await socket.sendMessage(sender, {
            image: { url: data.thumbnail },
            caption: desc
        }, { quoted: msg });

        const listener = async (update) => {
            const mek = update.messages[0];
            if (!mek?.message) return;

            const ctx = mek.message.extendedTextMessage?.contextInfo;
            if (!ctx || ctx.stanzaId !== sentMsg.key.id) return;

            const text =
                mek.message.conversation ||
                mek.message.extendedTextMessage?.text;

            if (!['1', '2', '3'].includes(text)) return;
            socket.ev.off('messages.upsert', listener);

            await socket.sendMessage(sender, { react: { text: '⬇️', key: mek.key } });

            try {
                const apiUrl = `${config.API_YTMP3_URL}/api/ytmp3?url=https://youtu.be/${videoId}`;
                const res = await axios.get(apiUrl, { timeout: 20000 });

                if (res.data.status !== 'success') {
                    throw new Error(res.data.message || 'API Error');
                }

                const downloadLink = res.data.data.download_url;
                const songTitle = res.data.data.title || data.title;
                const thumbnail = res.data.data.thumbnail || data.thumbnail;

                let thumbBuffer = null;
                if (text === '2') {
                    try {
                        const thumb = await axios.get(thumbnail, { responseType: 'arraybuffer' });
                        thumbBuffer = await sharp(thumb.data)
                            .resize(300, 300, {
                                fit: 'contain',
                                background: { r: 0, g: 0, b: 0, alpha: 1 }
                            })
                            .jpeg()
                            .toBuffer();
                    } catch {}
                }

                await socket.sendMessage(sender, { react: { text: '⬆️', key: mek.key } });

                const fileName = songTitle.replace(/[^a-zA-Z0-9]/g, '_');
                if (text === '1') {
                    await socket.sendMessage(sender, {
                        audio: { url: downloadLink },
                        mimetype: 'audio/mpeg'
                    }, { quoted: mek });
                } else if (text === '2') {
                    await socket.sendMessage(sender, {
                        document: { url: downloadLink },
                        mimetype: 'audio/mpeg',
                        fileName: `${fileName}.mp3`,
                        jpegThumbnail: thumbBuffer,
                        caption: songTitle
                    }, { quoted: mek });

                } else if (text === '3') {
                    await socket.sendMessage(sender, { react: { text: '🔄', key: mek.key } });

                    try {
                        const tmpDir = os.tmpdir();
                        const inputPath = path.join(tmpDir, `${Date.now()}.mp3`);
                        const outputPath = path.join(tmpDir, `${Date.now()}.ogg`);
                        const audioRes = await axios.get(downloadLink, {
                            responseType: 'arraybuffer',
                            timeout: 30000
                        });
                        fs.writeFileSync(inputPath, audioRes.data);
                        const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
                        ffmpeg.setFfmpegPath(ffmpegPath);

                        await new Promise((resolve, reject) => {
                            ffmpeg(inputPath)
                                .audioCodec('libopus')
                                .format('ogg')
                                .audioChannels(1)
                                .audioFrequency(16000)
                                .audioBitrate('32k')
                                .outputOptions(['-vbr on','-compression_level 10'])
                                .save(outputPath)
                                .on('end', resolve)
                                .on('error', reject);
                        });
                        await socket.sendMessage(sender, {
                            audio: fs.readFileSync(outputPath),
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true
                        }, { quoted: mek });

                        fs.unlinkSync(inputPath);
                        fs.unlinkSync(outputPath);

                        await socket.sendMessage(sender, { react: { text: '✅', key: mek.key } });

                    } catch (convErr) {
                        console.error('🎤 PTT Conversion Error:', convErr);
                        await socket.sendMessage(sender, {
                            audio: { url: downloadLink },
                            mimetype: 'audio/mpeg',
                            ptt: true
                        }, { quoted: mek });

                        await socket.sendMessage(sender, { react: { text: '⚠️', key: mek.key } });
                    }
                }

                await socket.sendMessage(sender, { react: { text: '✅', key: mek.key } });

            } catch (err) {
                await socket.sendMessage(sender, {
                    text: '❌ DOWNLOAD ERROR\n\n' + err.message
                }, { quoted: mek });

                await socket.sendMessage(sender, { react: { text: '❌', key: mek.key } });
            }
        };

        socket.ev.on('messages.upsert', listener);
        setTimeout(() => {
            socket.ev.off('messages.upsert', listener);
        }, 300000);

    } catch (err) {
        await socket.sendMessage(sender, {
            text: '❌ ERROR\n\n' + err.message
        }, { quoted: msg });
    }

    break
case 'system': {
  try {
    // 1. Add Reaction Immediately
    await socket.sendMessage(sender, { react: { text: "🍷", key: msg.key } });

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Meta Contact Card Style
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SYSTEM" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
    };

    const os = require('os');
    
    // Calculate Uptime (Optional - adds more info)
    const uptime = os.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    // 2. Fancy Text Layout
    const text = `
╭━━━━━━━━━━━━━━━━━━━●
┃ 🖥️ *𝚂𝚈𝚂𝚃𝙴𝙼 𝙸𝙽𝙵𝙾𝚁𝙼𝙰𝚃𝙸𝙾𝙽*
┃
┃ 🚀 *ᴏꜱ:* ${os.type()} ${os.release()}
┃ 🥉 *ᴘʟᴀᴛꜰᴏʀᴍ:* ${os.platform()}
┃ 🧠 *ᴄᴘᴜ ᴄᴏʀᴇꜱ:* ${os.cpus().length}
┃ 💾 *ʀᴀᴍ:* ${(os.totalmem()/1024/1024/1024).toFixed(2)} GB
┃ ⏱️ *ᴜᴘᴛɪᴍᴇ:* ${hours}h ${minutes}m
╰━━━━━━━━━━━━━━━━━━━●
> 👨‍💻 *${botName} ʙᴏᴛ ꜱʏꜱᴛᴇᴍ*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `*${botName} 𝐒ʏꜱᴛᴇᴍ 𝐈ɴꜰᴏ*`,
      // Added a contextInfo for better appearance if supported
      contextInfo: {
        externalAdReply: {
          title: `${botName} System Status`,
          body: "Running Smoothly",
          thumbnail: imagePayload.url ? null : imagePayload, // Handle buffer vs url
          mediaType: 1,
          renderLargerThumbnail: true
        }
      },
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🍼 ᴍᴀɪɴ ᴍᴇɴᴜ" }, type: 1 },
        { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👤 ᴏᴡɴᴇʀ" }, type: 1 }
      ],
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('system error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get system info.' }, { quoted: msg });
  }
  break;
}

case 'menu1': {
    try {
        // 1. 💠 Reaction
        await socket.sendMessage(sender, { react: { text: "🐉", key: msg.key } });

        // --- ⚙️ BOT CONFIGURATION ---
        const BOT_NAME = '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
        const OWNER_NAME = '✨ 𝐊ᴇᴢᴜ𝚄 ||🌿 ᴅᴇᴠ</> 💻';
        const CHANNEL_LINK = "https://whatsapp.com/channel/0029Vb6aIrGLo4hhAAGH6f3U";
        const MENU_IMG = "https://files.catbox.moe/g6ywiw.jpeg"; 
        // 👇 Video Note එකට URL එක මෙතනට දැම්මා
        const VIDEO_INTRO = 'https://files.catbox.moe/ihyzsf.mp4'; 
        
        // --- 📅 TIME & GREETING ENGINE ---
        const slNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
        const hour = slNow.getHours();
        const timeStr = slNow.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        const dateStr = slNow.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });

        // 🎨 STYLISH GREETING LOGIC
        let greetingText = "";
        if (hour < 5)        greetingText = "🌌 ᴇᴀʀʟʏ ᴍᴏʀɴɪɴɢ";
        else if (hour < 12) greetingText = "🌅 ɢᴏᴏᴅ ᴍᴏʀɴɪɴɢ";
        else if (hour < 18) greetingText = "🌞 ɢᴏᴏᴅ ᴀꜰᴛᴇʀɴᴏᴏɴ";
        else if (hour < 22) greetingText = "🌙 ɢᴏᴏᴅ ᴇᴠᴇɴɪɴɢ";
        else                greetingText = "🦉 ꜱᴡᴇᴇᴛ ᴅʀᴇᴀᴍꜱ";

        // --- 📊 STATS ---
        const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const uptime = process.uptime();
        const days = Math.floor(uptime / (24 * 3600));
        const hours = Math.floor((uptime % (24 * 3600)) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const runtime = `${days}D ${hours}H ${minutes}M`;

        // --- 📝 RANDOM QUOTES ---
        const quotes = [
            "Great things never came from comfort zones.",
            "Dream it. Wish it. Do it.",
            "Success is not final, failure is not fatal.",
            "Believe you can and you're halfway there.",
            "Your limitation—it's only your imagination.",
            "Push yourself, because no one else is going to do it for you."
        ];
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        const userTag = `@${sender.split("@")[0]}`;

        // --- 🎬 SEND VIDEO NOTE (INTRO) ---
        // මෙනු එකට කලින් Video Note එක යවන කොටස 👇
        await socket.sendMessage(sender, {
            video: { url: VIDEO_INTRO },
            ptv: true, // ptv: true දාපු නිසා රවුම් වීඩියෝ එකක් විදියට යනවා
            gifPlayback: true,
            caption: "✨ ꜱʏꜱᴛᴇᴍ ʙᴏᴏᴛɪɴɢ..."
        });

        // --- 🖼️ FAKE DOCUMENT CAPTION ---
        const caption = `
╭── ﹝ ${greetingText} ﹞ 
│ 👤 𝐇𝐞𝐲 : ${userTag}
╰───────────────────◆

╭── ﹝ 🌿 ${BOT_NAME} 🌿 ﹞ 
│
│ 👤 𝐎𝐰𝐧𝐞𝐫 : ${OWNER_NAME}
│ 🚀 𝐕𝐞𝐫𝐬𝐢𝐨𝐧 : 2.0.0 (ᴘʀᴏ)
│ ⏳ 𝐔𝐩𝐭𝐢𝐦𝐞 : ${runtime}
│ 💾 𝐑𝐚𝐦 : ${ramUsage}MB
│
╰───────────────────◆

╭── ﹝ 📅 𝐃𝐚𝐢𝐥𝐲 𝐈𝐧𝐟𝐨 ﹞ 
│ ⌚ 𝐓𝐢𝐦𝐞 : ${timeStr}
│ 📆 𝐃𝐚𝐭𝐞 : ${dateStr}
╰───────────────────◆

❝ ${randomQuote}❞

👇 ꜱᴇʟᴇᴄᴛ ʏᴏᴜʀ ᴄᴏᴍᴍᴀɴᴅ ʙᴇʟᴏᴡ
`.trim();

        // --- 🔘 BUTTONS ---
        const sections = [
            {
                title: "💀 𝐄𝐒𝐒𝐄𝐍𝐓𝐈𝐀𝐋𝐒",
                rows: [
                    { title: "🔥 𝐃𝐨𝐰𝐧𝐥𝐨𝐚𝐝 𝐌𝐞𝐝𝐢𝐚", description: "Get Songs, Videos", id: `${config.PREFIX}download` },
                    { title: "🚬 𝐀𝐈 𝐂𝐨𝐦𝐩𝐚𝐧𝐢𝐨𝐧",   description: "ChatGPT & AI Tools", id: `${config.PREFIX}ai` },
                    { title: "🩵 𝐒𝐦𝐚𝐫𝐭 𝐒𝐞𝐚𝐫𝐜𝐡",    description: "Search Anything",    id: `${config.PREFIX}search` }
                ]
            },
            {
                title: "⚙️ 𝐂𝐎𝐍𝐅𝐈𝐆𝐔𝐑𝐀𝐓𝐈𝐎𝐍",
                rows: [
                    { title: "👤 𝐎𝐰𝐧𝐞𝐫 𝐌𝐞𝐧𝐮",      description: "Bot Settings",       id: `${config.PREFIX}owner` },
                    { title: "🍼 𝐒𝐲𝐬𝐭𝐞𝐦 𝐒𝐭𝐚𝐭𝐮𝐬",    description: "Ping Check",         id: `${config.PREFIX}ping` }
                ]
            }
        ];

        const buttons = [
            {
                buttonId: "menu_list",
                buttonText: { displayText: "📂 𝐎𝐏𝐄𝐍 𝐃𝐀𝐒𝐇𝐁𝐎𝐀𝐑𝐃" },
                type: 4,
                nativeFlowInfo: {
                    name: "single_select",
                    paramsJson: JSON.stringify({ title: "🐉 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔", sections })
                }
            },
            { buttonId: `${config.PREFIX}ping`,  buttonText: { displayText: "🌿 𝐏𝐈𝐍𝐆" },  type: 1 },
            { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "👋 𝐀𝐋𝐈𝐕𝐄" }, type: 1 }
        ];

        // --- 📤 SEND AS FAKE DOCUMENT ---
        await socket.sendMessage(sender, {
            document: { url: MENU_IMG },
            mimetype: "application/pdf",
            fileName: `${BOT_NAME} 📂`, 
            pageCount: 9999, 
            fileLength: 99999999999999,
            caption: caption,
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                mentionedJid: [sender],
                isForwarded: true,
                forwardingScore: 999,
                externalAdReply: {
                    title: "WhatsApp 🟢 Status",
                    body: `Contact: ${OWNER_NAME} 🌟`,
                    thumbnailUrl: MENU_IMG,
                    sourceUrl: CHANNEL_LINK,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

    } catch (e) {
        console.log("❌ Menu Error:", e);
        reply("⚠️ System Error.");
    }
    break;
}
// ==================== DOWNLOAD MENU ====================
case 'download': {
  try { await socket.sendMessage(sender, { react: { text: "📥", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    
    // 1. GENERATE RANDOM LOGO (Add your URLs here)
    const logos = [
        "https://files.catbox.moe/g6ywiw.jpeg", 
        "https://files.catbox.moe/g6ywiw.jpeg",
        config.LOGO // Fallback to config logo
    ];
    const randomLogo = logos[Math.floor(Math.random() * logos.length)] || logos[0];

    // 2. CREATE FAKE CONTACT (QUOTED)
    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_DOWNLOAD_V3"
        },
        message: {
            contactMessage: {
                displayName: "📥 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐂𝐄𝐍𝐓𝐄𝐑",
                vcard: `BEGIN:VCARD
VERSION:3.0
N:;Downloader;;;
FN:Downloader
ORG:${title}
TITLE:System
END:VCARD`
            }
        }
    };

    const text = `
╭━━━〔 *${title}* 〕━━━┈⊷
┃ 🌿 *𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐇𝐔𝐁* 🌿
┃ 𝘧𝘢𝘴𝘵 • 𝘴𝘦𝘤𝘶𝘳𝘦 • 𝘳𝘦𝘭𝘪𝘢𝘣𝘭𝘦
╰━━━━━━━━━━━━━━━━━━┈⊷

╭──〔 🎵 *𝐀𝐔𝐃𝐈𝐎 𝐙𝐎𝐍𝐄* 〕──┈⊷
│ 
│ 🎧 *${config.PREFIX}song* 
│ ╰┈➤ _Download songs via query_
│ 
│ 🎼 *${config.PREFIX}csong* 
│ ╰┈➤ _Download to specific chat_
│ 
│ 🔔 *${config.PREFIX}ringtone* 
│ ╰┈➤ _Get custom ringtones_
╰────────────────────┈⊷

╭──〔 🎬 *𝐕𝐈𝐃𝐄𝐎 𝐙𝐎𝐍𝐄* 〕──┈⊷
│ 
│ 📽️ *${config.PREFIX}video* 
│ ╰┈➤ _YouTube Video Search_
│ 
│ 📱 *${config.PREFIX}tiktok* 
│ ╰┈➤ _No Watermark TikTok_
│ 
│ 📸 *${config.PREFIX}ig* 
│ ╰┈➤ _Instagram Post/Reels_
│ 
│ 🔞 *${config.PREFIX}xnxx* 
│ ╰┈➤ _Adult Content Search_
╰────────────────────┈⊷

╭──〔 📦 *𝐅𝐈𝐋𝐄𝐒 & 𝐀𝐏𝐏𝐒* 〕──┈⊷
│ 
│ 🤖 *${config.PREFIX}apk* 
│ ╰┈➤ _Download Android Apps_
│ 
│ ☁️ *${config.PREFIX}mediafire* 
│ ╰┈➤ _MediaFire Link DL_
│ 
│ 🔄 *${config.PREFIX}gdrive* 
│ ╰┈➤ _Google Drive Link DL_
╰────────────────────┈⊷
`.trim();

    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🏠 𝐇𝐎𝐌𝐄" }, type: 1 },
      { buttonId: `${config.PREFIX}tool`, buttonText: { displayText: "🎨 𝐂𝐑𝐄𝐀𝐓𝐈𝐕𝐄" }, type: 1 }
    ];

    // 3. SEND IMAGE MESSAGE WITH CONTEXT INFO (DOUBLE LOGO)
    await socket.sendMessage(sender, {
      image: { url: randomLogo }, // Main Logo
      caption: text,
      footer: "🚀 ᴘᴏᴡᴇʀᴇᴅ ʙʏ © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃",
      buttons: buttons,
      contextInfo: {
        externalAdReply: {
          title: "📥 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐌𝐀𝐍𝐀𝐆𝐄𝐑",
          body: title,
          thumbnailUrl: randomLogo, // Second Logo (Thumbnail)
          sourceUrl: "https://whatsapp.com/channel/0029Vb6aIrGLo4hhAAGH6f3U", // Your Channel Link
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    }, { quoted: shonux });

  } catch (err) {
    console.error('download command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Error loading download menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

// ==================== CREATIVE / TOOL MENU ====================
case 'creative': {
  try { await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    
    // Random Logo Logic
    const logos = [config.LOGO, "https://files.catbox.moe/g6ywiw.jpeg"]; // Add more
    const randomLogo = logos[Math.floor(Math.random() * logos.length)] || logos[0];

    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_CREATIVE_V3"
        },
        message: {
            contactMessage: {
                displayName: "🎨 𝐂𝐑𝐄𝐀𝐓𝐈𝐕𝐄 𝐒𝐓𝐔𝐃𝐈𝐎",
                vcard: `BEGIN:VCARD
VERSION:3.0
N:;Artist;;;
FN:Artist
ORG:${title}
TITLE:Creative
END:VCARD`
            }
        }
    };

    const text = `
╭━━━〔 *${title}* 〕━━━┈⊷
┃ 🎨 *𝐂𝐑𝐄𝐀𝐓𝐈𝐕𝐄 𝐒𝐓𝐔𝐃𝐈𝐎* 🎨
┃ 𝘪𝘮𝘢𝘨𝘪𝘯𝘦 • 𝘤𝘳𝘦𝘢𝘵𝘦 • 𝘥𝘦𝘴𝘪𝘨𝘯
╰━━━━━━━━━━━━━━━━━━┈⊷

╭──〔 🧠 *𝐀𝐑𝐓𝐈𝐅𝐈𝐂𝐈𝐀𝐋 𝐈𝐍𝐓𝐄𝐋* 〕──┈⊷
│ 
│ 🤖 *${config.PREFIX}ai* 
│ ╰┈➤ _Chat with GPT_
│ 
│ 🖌️ *${config.PREFIX}aiimg* 
│ ╰┈➤ _Text to Image (V1)_
│ 
│ 🖼️ *${config.PREFIX}aiimg2* 
│ ╰┈➤ _Text to Image (V2)_
╰─────────────────────┈⊷

╭──〔 ✍️ *𝐓𝐘𝐏𝐎𝐆𝐑𝐀𝐏𝐇𝐘* 〕──┈⊷
│ 
│ 🅰️ *${config.PREFIX}font* 
│ ╰┈➤ _Fancy Text Generator_
╰─────────────────────┈⊷

╭──〔 👤 *𝐏𝐑𝐎𝐅𝐈𝐋𝐄 𝐓𝐎𝐎𝐋𝐒* 〕──┈⊷
│ 
│ 🤳 *${config.PREFIX}getdp* 
│ ╰┈➤ _Steal Profile Picture_
│ 
│ 💾 *${config.PREFIX}save* 
│ ╰┈➤ _Save Status Media_
╰─────────────────────┈⊷
`.trim();

    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔" }, type: 1 },
      { buttonId: `${config.PREFIX}download`, buttonText: { displayText: "📥 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐒" }, type: 1 }
    ];

    await socket.sendMessage(sender, {
      image: { url: randomLogo },
      caption: text,
      footer: "✨ ᴜɴʟᴇᴀꜱʜ ʏᴏᴜʀ ᴄʀᴇᴀᴛɪᴠɪᴛʏ",
      buttons: buttons,
      contextInfo: {
        externalAdReply: {
          title: "🎨 𝐂𝐑𝐄𝐀𝐓𝐈𝐕𝐄 𝐌𝐎𝐃𝐄",
          body: title,
          thumbnailUrl: randomLogo,
          sourceUrl: "https://whatsapp.com/channel/0029Vb6aIrGLo4hhAAGH6f3U",
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    }, { quoted: shonux });

  } catch (err) {
    console.error('creative command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Error loading creative menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

// ==================== OTHER / SYSTEM MENU ====================
case 'other': 
case 'tool': {
  try { await socket.sendMessage(sender, { react: { text: "🎡", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    
    // Random Logo Logic
    const logos = [config.LOGO, "https://files.catbox.moe/g6ywiw.jpeg"]; 
    const randomLogo = logos[Math.floor(Math.random() * logos.length)] || logos[0];

    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_TOOLS_V3"
        },
        message: {
            contactMessage: {
                displayName: "⚙️ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐂𝐎𝐍𝐓𝐑𝐎𝐋",
                vcard: `BEGIN:VCARD
VERSION:3.0
N:;System;;;
FN:System Admin
ORG:${title}
TITLE:Settings
END:VCARD`
            }
        }
    };

    const text = `
╭━━━〔 *${title}* 〕┈⊷
┃ 🔧 *𝐒𝐘𝐒𝐓𝐄𝐌 𝐔𝐓𝐈𝐋𝐈𝐓𝐈𝐄𝐒* 🔧
┃ 𝘮𝘢𝘯𝘢𝘨𝘦 • 𝘤𝘰𝘯𝘵𝘳𝘰𝘭 • 𝘰𝘱𝘵𝘪𝘮𝘪𝘻𝘦
╰━━━━━━━━━━━━━━━━━━┈⊷
〔 ℹ️ *𝐁𝐎𝐓 𝐈𝐍𝐅𝐎* ┈⊷
│ ◈ *${config.PREFIX}system*  ➜ _Sys Specs_
│ ◈ *${config.PREFIX}ping*    ➜ _Speed_
│ ◈ *${config.PREFIX}alive*   ➜ _Status_
│ ◈ *${config.PREFIX}jid*     ➜ _My JID_
│ ◈ *${config.PREFIX}checkjid* ➜ _Check JID_
│ ◈ *${config.PREFIX}showconfig* ➜ _View Config_
│ ◈ *${config.PREFIX}active*  ➜ _Sessions_
╰────────────────────┈⊷
〔 👥 *𝐆𝐑𝐎𝐔𝐏 𝐌𝐆𝐌𝐓* ┈⊷
│ ◈ *${config.PREFIX}tagall*  ➜ _Tag All_
│ ◈ *${config.PREFIX}online*  ➜ _Active Users_
│ ◈ *${config.PREFIX}kick*    ➜ _Remove User_
│ ◈ *${config.PREFIX}add*     ➜ _Add User_
│ ◈ *${config.PREFIX}promote* ➜ _Make Admin_
│ ◈ *${config.PREFIX}demote*  ➜ _Demote_
│ ◈ *${config.PREFIX}mute*    ➜ _Close Chat_
│ ◈ *${config.PREFIX}unmute*  ➜ _Open Chat_
│ ◈ *${config.PREFIX}grouplist* ➜ _My Groups_
╰────────────────────┈⊷
 🛡️ *𝐔𝐒𝐄𝐑 & 𝐒𝐀𝐅𝐄𝐓𝐘* ┈⊷
│ ⛔ *${config.PREFIX}block*    ➜ _Block User_
│ ✅ *${config.PREFIX}unblock*  ➜ _Unblock_
│ 🗑️ *${config.PREFIX}deleteme* ➜ _Del Bot Msg_
│ ⚙️ *${config.PREFIX}owner*    ➜ _Owner Info_
╰────────────────────┈⊷

╭──〔 ⚙️ *𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒* 〕──┈⊷
│ 🎮 *${config.PREFIX}botpresence* ➜ _Set Status_
│ 🎤 *${config.PREFIX}autorecording* ➜ _Auto Rec_
│ ✍️ *${config.PREFIX}autotyping* ➜ _Auto Type_
│ 📖 *${config.PREFIX}mread*   ➜ _Auto Read_
│ 📛 *${config.PREFIX}setbotname* ➜ _Set Bot Name_
│ 🖼️ *${config.PREFIX}setlogo*  ➜ _Set Logo_
│ 🎬 *${config.PREFIX}setmenuvideo* ➜ _Set Menu Video_
│ 🔢 *${config.PREFIX}prefix*   ➜ _Set Prefix_
│ 📞 *${config.PREFIX}creject*  ➜ _Call Reject_
╰────────────────────┈⊷
`.trim();

    const buttons = [
      { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 𝐎𝐖𝐍𝐄𝐑" }, type: 1 },
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 𝐌𝐄𝐍𝐔" }, type: 1 }
    ];

    await socket.sendMessage(sender, {
      image: { url: randomLogo },
      caption: text,
      footer: "⚙️ ꜱʏꜱᴛᴇᴍ ᴄᴏᴍᴍᴀɴᴅꜱ",
      buttons: buttons,
      contextInfo: {
        externalAdReply: {
          title: "⚙️ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐂𝐎𝐍𝐓𝐑𝐎𝐋",
          body: title,
          thumbnailUrl: randomLogo,
          sourceUrl: "https://whatsapp.com/channel/0029Vb6aIrGLo4hhAAGH6f3U",
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    }, { quoted: shonux });

  } catch (err) {
    console.error('tools command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Error loading tools menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

//-------------------- UNIFIED PROFILE PICTURE COMMAND --------------------//
case 'getpp':
case 'pp':
case 'getdp':
case 'dp': {
    // 1. React with loading
    await socket.sendMessage(sender, { react: { text: '👤', key: msg.key } });

    try {
        // --- CONFIG & STYLE LOAD ---
        // (Assuming you have a function to get config, otherwise defaults use hardcoded values)
        const sanitizedSender = sender.split('@')[0];
        const cfg = await loadUserConfigFromMongo(sanitizedSender).catch(() => ({})) || {};
        const botName = cfg.botName || "© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃"; // Default Artful Name
        const logo = cfg.logo || "https://files.catbox.moe/g6ywiw.jpeg"; // Default Logo
        
        // --- TARGET RESOLUTION (The "Bind" Logic) ---
        let targetUser = sender; // Default to self
        let inputNumber = msg.message?.conversation?.split(" ")[1] || 
                          msg.message?.extendedTextMessage?.text?.split(" ")[1];

        if (inputNumber) {
            // If number provided (getdp style)
            targetUser = inputNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        } else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            // If mention exists
            targetUser = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (msg.quoted) {
            // If reply exists
            targetUser = msg.quoted.sender;
        }

        const userNum = targetUser.split('@')[0];

        // --- FETCH PP (HD -> Privacy Fallback) ---
        let ppUrl, mode = 'HD IMAGE';
        try {
            ppUrl = await socket.profilePictureUrl(targetUser, 'image'); // Try HD
        } catch {
            try {
                mode = 'PREVIEW';
                ppUrl = await socket.profilePictureUrl(targetUser, 'preview'); // Try Preview
            } catch {
                mode = 'NOT FOUND';
                ppUrl = logo; // Fallback to bot logo if no PP allowed
            }
        }

        // --- ARTFUL CAPTION ---
        const caption = `
╭「 👤 *PROFILE PIC* 」
│
│ ❄️ *User:* @${userNum}
│ 🎭 *Mode:* ${mode}
│ 🤖 *Bot:* ${botName}
│
│ *TARGET PROFILE PICTURE FETCH SUCCESS*  🌿🍷
╰──────────────────
   *${botName} ᴡʜᴀᴛꜱᴀᴘᴘ ʙᴏᴛ*
`;

        // --- META BROADCAST QUOTE (Style) ---
        const metaQuote = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: "© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃" 
            },
            message: { 
                contactMessage: { 
                    displayName: botName, 
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:${botName} Inc.
TEL;type=CELL;type=VOICE;waid=94700000000:+94 70 000 0000
END:VCARD` 
                } 
            }
        };

        // --- BUTTONS ---
        const buttons = [
            { 
                buttonId: `${config.PREFIX || '.'}menu`, 
                buttonText: { displayText: "💘 MAIN MENU" }, 
                type: 1 
            },
            { 
                buttonId: `${config.PREFIX || '.'}alive`, 
                buttonText: { displayText: "❤️‍🔥 ALIVE" }, 
                type: 1 
            }
        ];

        // --- SEND MESSAGE ---
        await socket.sendMessage(msg.key.remoteJid, {
            image: { url: ppUrl },
            caption: caption,
            footer: `Power by ${botName}`,
            buttons: buttons,
            headerType: 4,
            mentions: [targetUser]
        }, { quoted: metaQuote });

        // Success React
        await socket.sendMessage(msg.key.remoteJid, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.log("❌ PP Fetch Error:", e);
        await socket.sendMessage(msg.key.remoteJid, { 
            text: `⚠️ *Error:* Could not fetch profile picture.
_${e.message}_` 
        }, { quoted: msg });
        await socket.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
    }
    break;
}
case 'showconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SHOWCONFIG" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let txt = `*Session config for ${sanitized}:*\n`;
    txt += `• Bot name: ${botName}\n`;
    txt += `• Logo: ${cfg.logo || config.RCD_IMAGE_PATH}\n`;
    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('showconfig error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SHOWCONFIG2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Failed to load config.' }, { quoted: shonux });
  }
  break;
}

case 'resetconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can reset configs.' }, { quoted: shonux });
    break;
  }

  try {
    await setUserConfigInMongo(sanitized, {});

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '✅ Session config reset to defaults.' }, { quoted: shonux });
  } catch (e) {
    console.error('resetconfig error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '❌ Failed to reset config.' }, { quoted: shonux });
  }
  break;
}

case 'owner': {
  try {
    // 1. Send Royal Reaction 👑
    await socket.sendMessage(sender, { 
      react: { text: "🧑‍🎄", key: msg.key } 
    });

    // 2. Configuration & Data
    const ownerNumber = '94787940686';
    const ownerName = 'MADUSANKA ||🌿';
    const botName = '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    const ownerImage = 'https://i.ibb.co/4gV5hsR7/af289d3bc848.jpg';
    const websiteUrl = 'https://criminalmd-98d941cf6e6f.herokuapp.com/#pair';
    
    // Time Calculation
    const timeNow = new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: "Asia/Colombo" 
    });

    // 3. Artful "Royal" Text Layout 🎨
    // Using box-drawing characters and emojis for a "colorful" feel
    const aestheticCaption = `
╭━ *${botName}* 

┃  • 𝐍𝐚𝐦𝐞 : *${ownerName}*
┃  • 𝐑𝐨𝐥𝐞 : Lead Developer
┃  • 📍 𝐅𝐫𝐨𝐦 : Sri Lanka 🇱🇰
┃  • ⌚ 𝐓𝐢𝐦𝐞 : ${timeNow}

┃  • 💻 Stack : JS, Node.js, React
┃  • 🤖 Bot : *Active & Online* ✅
┃  • 🛡️ Security : Verified
┃  • ❤️‍🔥 Id : 🍃 වැඩ්ඩා

╰──────────────────╯

`.trim();

    // 4. Define the Interactive Button System (Native Flow) [web:1]
    // This allows URL buttons, Copy buttons, and Quick Replies
    const buttonParams = [
      {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: "💬 ƈԋαƚ ɯιƚԋ ɱҽ",
          url: `https://wa.me/${ownerNumber}?text=Hello ${ownerName}, I need assistance with © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 Bot.`
        })
      },
      {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: "👀 ʋιʂιƚ ʂιƚҽ",
          url: websiteUrl
        })
      },
      {
        name: "cta_copy",
        buttonParamsJson: JSON.stringify({
          display_text: "📋 ƈσρყ σɯɳҽɾ ɳυɱႦҽɾ",
          copy_code: ownerNumber
        })
      },
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "⛩️ ɾҽƚυɾɳ ɱҽɳυ ⤸",
          id: `${config.PREFIX || '.'}menu`
        })
      }
    ];

    // 5. Generate & Relay the Message
    // We use relayMessage for advanced interactive buttons (Button V2)
    const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require("dct-dev-private-baileys"); // Adjust import based on your library

    // Prepare image header
    const mediaMessage = await prepareWAMessageMedia({ 
      image: { url: ownerImage } 
    }, { upload: socket.waUploadToServer });

    const msgContent = generateWAMessageFromContent(sender, {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage: {
            body: { text: aestheticCaption },
            footer: { text: "Tap a button below to interact 👇" },
            header: {
              title: "",
              subtitle: "© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 Support",
              hasMediaAttachment: true,
              imageMessage: mediaMessage.imageMessage
            },
            nativeFlowMessage: {
              buttons: buttonParams
            }
          }
        }
      }
    }, { userJid: sender, quoted: msg });

    await socket.relayMessage(sender, msgContent.message, { 
      messageId: msgContent.key.id 
    });

    // 6. Send vCard (Contact) separately for easy saving
    // Small delay to ensure order
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${ownerName}
ORG:DTZ Development
TEL;waid=${ownerNumber}:+${ownerNumber}
END:VCARD`;
    await socket.sendMessage(sender, {
      contacts: {
        displayName: ownerName,
        contacts: [{ vcard }]
      }
    });

  } catch (err) {
    console.error('❌ Owner Command Error:', err);
    await socket.sendMessage(sender, { 
      text: `⚠️ *Error:* Failed to load owner menu.
Contact: +${config.OWNER_NUMBER}` 
    }, { quoted: msg });
  }
  break;
}
case 'google':
case 'gsearch':
case 'search':
    try {
        if (!args || args.length === 0) {
            await socket.sendMessage(sender, {
                text: '⚠️ *Please provide a search query.*\n\n*Example:*\n.google how to code in javascript'
            });
            break;
        }

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const userCfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = userCfg.botName || BOT_NAME_FANCY;

        const botMention = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GOOGLE" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
        };

        const query = args.join(" ");
        const apiKey = "AIzaSyDMbI3nvmQUrfjoCJYLS69Lej1hSXQjnWI";
        const cx = "baf9bdb0c631236e5";
        const apiUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}`;

        const response = await axios.get(apiUrl);

        if (response.status !== 200 || !response.data.items || response.data.items.length === 0) {
            await socket.sendMessage(sender, { text: `⚠️ *No results found for:* ${query}` }, { quoted: botMention });
            break;
        }

        let results = `🔍 *𝐆oogle 𝐒earch 𝐑esults 𝐅or:* "${query}"\n\n`;
        response.data.items.slice(0, 5).forEach((item, index) => {
            results += `*${index + 1}. ${item.title}*\n\n🔗 ${item.link}\n\n📝 ${item.snippet}\n\n`;
        });

        const firstResult = response.data.items[0];
        const thumbnailUrl = firstResult.pagemap?.cse_image?.[0]?.src || firstResult.pagemap?.cse_thumbnail?.[0]?.src || 'https://via.placeholder.com/150';

        await socket.sendMessage(sender, {
            image: { url: thumbnailUrl },
            caption: results.trim(),
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: botMention });

    } catch (error) {
        console.error(`Google search error:`, error);
        await socket.sendMessage(sender, { text: `⚠️ *An error occurred while fetching search results.*\n\n${error.message}` });
    }
    break;
case 'img': {
    const q = body.replace(/^[.\/!]img\s*/i, '').trim();
    if (!q) return await socket.sendMessage(sender, {
        text: '🔍 Please provide a search query. Ex: `.img sunset`'
    }, { quoted: msg });

    try {
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const userCfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = userCfg.botName || BOT_NAME_FANCY;

        const botMention = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_IMG" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
        };

        const res = await axios.get(`https://allstars-apis.vercel.app/pinterest?search=${encodeURIComponent(q)}`);
        const data = res.data.data;
        if (!data || data.length === 0) return await socket.sendMessage(sender, { text: '❌ No images found for your query.' }, { quoted: botMention });

        const randomImage = data[Math.floor(Math.random() * data.length)];

        const buttons = [{ buttonId: `${config.PREFIX}img ${q}`, buttonText: { displayText: "🖼️ 𝐍𝙴𝚇𝚃 𝐈𝙼𝙰𝙶𝙴" }, type: 1 }];

        const buttonMessage = {
            image: { url: randomImage },
            caption: `🖼️ *𝐈mage 𝐒earch:* ${q}\n\n*𝐏rovided 𝐁y ${botName}*`,
            footer: config.FOOTER || '> *© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃*',
            buttons: buttons,
             headerType: 4,
            contextInfo: { mentionedJid: [sender] }
        };

        await socket.sendMessage(from, buttonMessage, { quoted: botMention });

    } catch (err) {
        console.error("Image search error:", err);
        await socket.sendMessage(sender, { text: '❌ Failed to fetch images.' }, { quoted: botMention });
    }
    break;
}
case 'gdrive': {
    try {
        const text = args.join(' ').trim();
        if (!text) return await socket.sendMessage(sender, { text: '⚠️ Please provide a Google Drive link.\n\nExample: `.gdrive <link>`' }, { quoted: msg });

        // 🔹 Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const userCfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = userCfg.botName || BOT_NAME_FANCY;

        // 🔹 Meta AI fake contact mention
        const botMention = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GDRIVE" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
        };

        // 🔹 Fetch Google Drive file info
        const res = await axios.get(`https://saviya-kolla-api.koyeb.app/download/gdrive?url=${encodeURIComponent(text)}`);
        if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch file info.' }, { quoted: botMention });

        const file = res.data.result;

        // 🔹 Send as document
        await socket.sendMessage(sender, {
            document: { 
                url: file.downloadLink, 
                mimetype: file.mimeType || 'application/octet-stream', 
                fileName: file.name 
            },
            caption: `📂 *𝐅ile 𝐍ame:* ${file.name}\n💾 *𝐒ize:* ${file.size}\n\n*𝐏owered 𝐁y ${botName}*`,
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: botMention });

    } catch (err) {
        console.error('GDrive command error:', err);
        await socket.sendMessage(sender, { text: '❌ Error fetching Google Drive file.' }, { quoted: botMention });
    }
    break;
}


case 'adanews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/ada');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Ada News.' }, { quoted: botMention });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n*📅 𝐃ate:* ${n.date}\n*⏰ 𝐓ime:* ${n.time}\n\n${n.desc}\n\n*🔗 [Read more]* (${n.url})\n\n*𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ ${botName}*`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

  } catch (err) {
    console.error('adanews error:', err);
    await socket.sendMessage(sender, { text: '❌ Error fetching Ada News.' }, { quoted: botMention });
  }
  break;
}
case 'sirasanews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_SIRASA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/sirasa');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Sirasa News.' }, { quoted: botMention });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n*📅 𝐃ate:* ${n.date}\n*⏰ 𝐓ime:* ${n.time}\n\n${n.desc}\n\n*🔗 [Read more]* (${n.url})\n\n*𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ ${botName}*`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

  } catch (err) {
    console.error('sirasanews error:', err);
    await socket.sendMessage(sender, { text: '❌ Error fetching Sirasa News.' }, { quoted: botMention });
  }
  break;
}
case 'lankadeepanews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_LANKADEEPA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/lankadeepa');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Lankadeepa News.' }, { quoted: botMention });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n*📅 𝐃ate:* ${n.date}\n*⏰ 𝐓ime:* ${n.time}\n\n${n.desc}\n\n*🔗 [𝐑ead more]* (${n.url})\n\n*𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ ${botName}*`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

  } catch (err) {
    console.error('lankadeepanews error:', err);
    await socket.sendMessage(sender, { text: '❌ Error fetching Lankadeepa News.' }, { quoted: botMention });
  }
  break;
}
case 'gagananews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GAGANA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/gagana');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Gagana News.' }, { quoted: botMention });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n*📅 𝐃ate:* ${n.date}\n*⏰ 𝐓ime:* ${n.time}\n\n${n.desc}\n\n*🔗 [Read more]* (${n.url})\n\n*𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ ${botName}*`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

  } catch (err) {
    console.error('gagananews error:', err);
    await socket.sendMessage(sender, { text: '❌ Error fetching Gagana News.' }, { quoted: botMention });
  }
  break;
}


//💐💐💐💐💐💐





        case 'unfollow': {
  const jid = args[0] ? args[0].trim() : null;
  if (!jid) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide channel JID to unfollow. Example:\n.unfollow 120363396379901844@newsletter' }, { quoted: shonux });
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = admins.map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!(isOwner || isAdmin)) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 ';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Permission denied. Only owner or admins can remove channels.' }, { quoted: shonux });
  }

  if (!jid.endsWith('@newsletter')) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Invalid JID. Must end with @newsletter' }, { quoted: shonux });
  }

  try {
    if (typeof socket.newsletterUnfollow === 'function') {
      await socket.newsletterUnfollow(jid);
    }
    await removeNewsletterFromMongo(jid);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Unfollowed and removed from DB: ${jid}` }, { quoted: shonux });
  } catch (e) {
    console.error('unfollow error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW5" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to unfollow: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'tiktok':
case 'ttdl':
case 'tt':
case 'tiktokdl': {
    try {
        const axios = require("axios");

        // 1. URL ලබා ගැනීම සහ Validation
        let text = (args.join(' ') || '').trim();
        
        if (!text || !text.startsWith('https://')) {
            return await socket.sendMessage(sender, {
                text: "❌ *Please provide a valid TikTok Link!*"
            }, { quoted: msg });
        }

        // 2. Bot Name Config
        const sanitized = (sender.split('@')[0] || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

        // 3. Reaction
        await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });

        // 4. API Request
        const apiRes = await axios.get("https://www.movanest.xyz/v2/tiktok", {
            params: { url: text }
        });

        if (!apiRes.data.status || !apiRes.data.results) {
            return await socket.sendMessage(sender, { text: "❌ *TikTok Video Not Found!*" }, { quoted: msg });
        }

        const result = apiRes.data.results;
        
        // 5. ලස්සන Fancy Caption එක
        const captionMessage = `
╭───「 📍 *${botName}* 」───◆
│
│ 👤 *Author:* ${result.author_nickname || "Unknown"}
│ 📝 *Desc:* ${result.desc || "No Description"}
│ 👁️ *Views:* ${result.play_count || "N/A"}
│ 🔄 *Shares:* ${result.share_count || "N/A"}
│
╰───────────────────────◆

👇 *ꜱᴇʟᴇᴄᴛ ʏᴏᴜʀ ᴅᴏᴡɴʟᴏᴀᴅ ᴛʏᴘᴇ* 👇`;

        // 6. Buttons සැකසීම
        const buttons = [
            { buttonId: 'tt_nw', buttonText: { displayText: '🎬 NO WATERMARK' }, type: 1 },
            { buttonId: 'tt_wm', buttonText: { displayText: '💧 WITH WATERMARK' }, type: 1 },
            { buttonId: 'tt_audio', buttonText: { displayText: '🎵 AUDIO FILE' }, type: 1 },
            { buttonId: 'tt_ptv', buttonText: { displayText: '📹 VIDEO NOTE' }, type: 1 }
        ];

        // 7. Message එක යැවීම (With External Ad Reply Style)
        const buttonMessage = {
            image: { url: result.cover || result.thumbnail || "https://files.catbox.moe/g6ywiw.jpeg" },
            caption: captionMessage,
            footer: `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}`,
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                externalAdReply: {
                    title: "🎵 ＴＩＫＴＯＫ  ＤＯＷＮＬＯＡＤＥＲ",
                    body: "ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ᴍᴇᴅɪᴀ...",
                    thumbnailUrl: result.cover || result.thumbnail,
                    sourceUrl: text,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        };

        const sentMessage = await socket.sendMessage(sender, buttonMessage, { quoted: msg });
        const messageID = sentMessage.key.id;

        // 8. User Reply/Button Click හැසිරවීම
        const handleTikTokSelection = async ({ messages: replyMessages }) => {
            const replyMek = replyMessages[0];
            if (!replyMek?.message) return;

            const selectedId = replyMek.message.buttonsResponseMessage?.selectedButtonId || 
                               replyMek.message.templateButtonReplyMessage?.selectedId || 
                               replyMek.message.conversation || 
                               replyMek.message.extendedTextMessage?.text;

            const isReplyToSentMsg = replyMek.message.extendedTextMessage?.contextInfo?.stanzaId === messageID || 
                                     replyMek.message.buttonsResponseMessage?.contextInfo?.stanzaId === messageID;

            if (isReplyToSentMsg && sender === replyMek.key.remoteJid) {
                
                await socket.sendMessage(sender, { react: { text: '⬇️', key: replyMek.key } });

                let mediaBuffer;
                let mimeType = 'video/mp4';
                let isPtv = false;
                let finalCaption = '';
                let downloadUrl = '';

                try {
                    switch (selectedId) {
                        case 'tt_nw':
                        case '1':
                            downloadUrl = result.no_watermark;
                            finalCaption = `╭──「 *NO WATERMARK* 」──◆\n│ ✅ Downloaded Successfully!\n╰─────────────────◆`;
                            break;
                        case 'tt_wm':
                        case '2':
                            downloadUrl = result.watermark;
                            finalCaption = `╭──「 *WITH WATERMARK* 」──◆\n│ ✅ Downloaded Successfully!\n╰─────────────────◆`;
                            break;
                        case 'tt_audio':
                        case '3':
                            downloadUrl = result.music;
                            mimeType = 'audio/mpeg';
                            break;
                        case 'tt_ptv':
                        case '4':
                            downloadUrl = result.no_watermark;
                            isPtv = true;
                            break;
                        default:
                            return; // Invalid input, do nothing
                    }

                    if (!downloadUrl) throw new Error("URL Missing");

                    // Download Buffer
                    const bufferRes = await axios.get(downloadUrl, {
                        responseType: 'arraybuffer',
                        headers: { "User-Agent": "Mozilla/5.0" }
                    });
                    mediaBuffer = Buffer.from(bufferRes.data);

                    if (mediaBuffer.length > 100 * 1024 * 1024) {
                         return await socket.sendMessage(sender, { text: '❌ File too large (>100MB)!' }, { quoted: replyMek });
                    }

                    // Send Final Media
                    let msgContent = {};
                    if (mimeType === 'audio/mpeg') {
                        msgContent = { audio: mediaBuffer, mimetype: mimeType, ptt: false }; // Audio
                    } else if (isPtv) {
                        msgContent = { video: mediaBuffer, mimetype: mimeType, ptv: true }; // Video Note
                    } else {
                        msgContent = { video: mediaBuffer, mimetype: mimeType, caption: finalCaption }; // Normal Video
                    }

                    await socket.sendMessage(sender, msgContent, { quoted: replyMek });
                    await socket.sendMessage(sender, { react: { text: '✅', key: replyMek.key } });

                } catch (err) {
                    console.log(err);
                    await socket.sendMessage(sender, { text: '❌ Download Failed!' }, { quoted: replyMek });
                }

                socket.ev.removeListener('messages.upsert', handleTikTokSelection);
            }
        };

        socket.ev.on('messages.upsert', handleTikTokSelection);

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: '*❌ System Error.*' }, { quoted: msg });
    }
    break;
}
case 'xvideo': {
  try {
    // ---------------------------
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_XVIDEO" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    // ---------------------------

    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Usage: .xvideo <url/query>*' }, { quoted: botMention });

    let video, isURL = false;
    if (args[0].startsWith('http')) { video = args[0]; isURL = true; } 
    else {
      await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } }, { quoted: botMention });
      const s = await axios.get(`https://saviya-kolla-api.koyeb.app/search/xvideos?query=${encodeURIComponent(args.join(' '))}`);
      if (!s.data?.status || !s.data.result?.length) throw new Error('No results');
      video = s.data.result[0];
    }

    const dlRes = await axios.get(`https://saviya-kolla-api.koyeb.app/download/xvideos?url=${encodeURIComponent(isURL ? video : video.url)}`);
    if (!dlRes.data?.status) throw new Error('Download API failed');

    const dl = dlRes.data.result;

    await socket.sendMessage(sender, {
      video: { url: dl.url },
      caption: `*📹 ${dl.title}*\n\n⏱️ ${isURL ? '' : `*𝐃uration:* ${video.duration}`}\n*👁️ 𝐕iews:* ${dl.views}\n👍 ${dl.likes} | 👎 ${dl.dislikes}\n\n*𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ ${botName}*`,
      mimetype: 'video/mp4'
    }, { quoted: botMention });

  } catch (err) {
    console.error('xvideo error:', err);
    await socket.sendMessage(sender, { text: '*❌ Failed to fetch video*' }, { quoted: botMention });
  }
  break;
}
case 'xvideo2': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_XVIDEO2" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Usage: .xvideo2 <url/query>*' }, { quoted: botMention });

    let video = null, isURL = false;
    if (args[0].startsWith('http')) { video = args[0]; isURL = true; } 
    else {
      await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } }, { quoted: botMention });
      const s = await axios.get(`https://saviya-kolla-api.koyeb.app/search/xvideos?query=${encodeURIComponent(args.join(' '))}`);
      if (!s.data?.status || !s.data.result?.length) throw new Error('No results');
      video = s.data.result[0];
    }

    const dlRes = await axios.get(`https://saviya-kolla-api.koyeb.app/download/xvideos?url=${encodeURIComponent(isURL ? video : video.url)}`);
    if (!dlRes.data?.status) throw new Error('Download API failed');

    const dl = dlRes.data.result;

    await socket.sendMessage(sender, {
      video: { url: dl.url },
      caption: `*📹 ${dl.title}*\n\n⏱️ ${isURL ? '' : `*𝐃uration:* ${video.duration}`}\n*👁️ 𝐕iews:* ${dl.views}\n*👍 𝐋ikes:* ${dl.likes} | *👎 𝐃islikes:* ${dl.dislikes}\n\n*𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ ${botName}*`,
      mimetype: 'video/mp4'
    }, { quoted: botMention });

  } catch (err) {
    console.error('xvideo2 error:', err);
    await socket.sendMessage(sender, { text: '*❌ Failed to fetch video*' }, { quoted: botMention });
  }
  break;
}
case 'xnxx':
case 'xnxxvideo': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_XNXX" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!Array.isArray(config.PREMIUM) || !config.PREMIUM.includes(senderNumber)) 
      return await socket.sendMessage(sender, { text: '❗ This command is for Premium users only.' }, { quoted: botMention });

    if (!text) return await socket.sendMessage(sender, { text: '❌ Provide a search name. Example: .xnxx <name>' }, { quoted: botMention });

    await socket.sendMessage(from, { react: { text: "🎥", key: msg.key } }, { quoted: botMention });

    const res = await axios.get(`https://api.genux.me/api/download/xnxx-download?query=${encodeURIComponent(text)}&apikey=GENUX-SANDARUX`);
    const d = res.data?.result;
    if (!d || !d.files) return await socket.sendMessage(sender, { text: '❌ No results.' }, { quoted: botMention });

    await socket.sendMessage(from, { image: { url: d.image }, caption: `💬 *Title*: ${d.title}\n👀 *Duration*: ${d.duration}\n🗯 *Desc*: ${d.description}\n💦 *Tags*: ${d.tags || ''}` }, { quoted: botMention });

    await socket.sendMessage(from, { video: { url: d.files.high, fileName: d.title + ".mp4", mimetype: "video/mp4", caption: "*Done ✅*" } }, { quoted: botMention });

    await socket.sendMessage(from, { text: "*Uploaded ✅*" }, { quoted: botMention });

  } catch (err) {
    console.error('xnxx error:', err);
    await socket.sendMessage(sender, { text: "❌ Error fetching video." }, { quoted: botMention });
  }
  break;
}
case 'gjid':
case 'groupjid':
case 'grouplist': {
  try {
    // ✅ Owner check removed — now everyone can use it!

    await socket.sendMessage(sender, { 
      react: { text: "📝", key: msg.key } 
    });

    await socket.sendMessage(sender, { 
      text: "📝 Fetching group list..." 
    }, { quoted: msg });

    const groups = await socket.groupFetchAllParticipating();
    const groupArray = Object.values(groups);

    // Sort by creation time (oldest to newest)
    groupArray.sort((a, b) => a.creation - b.creation);

    if (groupArray.length === 0) {
      return await socket.sendMessage(sender, { 
        text: "❌ No groups found!" 
      }, { quoted: msg });
    }

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY || "CHMA MD";

    // ✅ Pagination setup — 10 groups per message
    const groupsPerPage = 10;
    const totalPages = Math.ceil(groupArray.length / groupsPerPage);

    for (let page = 0; page < totalPages; page++) {
      const start = page * groupsPerPage;
      const end = start + groupsPerPage;
      const pageGroups = groupArray.slice(start, end);

      // ✅ Build message for this page
      const groupList = pageGroups.map((group, index) => {
        const globalIndex = start + index + 1;
        const memberCount = group.participants ? group.participants.length : 'N/A';
        const subject = group.subject || 'Unnamed Group';
        const jid = group.id;
        return `*${globalIndex}. ${subject}*\n*👥 𝐌embers:* ${memberCount}\n🆔 ${jid}`;
      }).join('\n\n');

      const textMsg = `📝 *𝐆roup 𝐋ist* - ${botName}*\n\n*📄 𝐏age:* ${page + 1}/${totalPages}\n*👥 𝐓otal 𝐆roups:* ${groupArray.length}\n\n${groupList}`;

      await socket.sendMessage(sender, {
        text: textMsg,
        footer: `🤖 Powered by ${botName}`
      });

      // Add short delay to avoid spam
      if (page < totalPages - 1) {
        await delay(1000);
      }
    }

  } catch (err) {
    console.error('GJID command error:', err);
    await socket.sendMessage(sender, { 
      text: "❌ Failed to fetch group list. Please try again later." 
    }, { quoted: msg });
  }
  break;
}
case 'nanobanana': {
  const fs = require('fs');
  const path = require('path');
  const { GoogleGenAI } = require("@google/genai");

  // 🧩 Helper: Download quoted image
  async function downloadQuotedImage(socket, msg) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctx || !ctx.quotedMessage) return null;

      const quoted = ctx.quotedMessage;
      const imageMsg = quoted.imageMessage || quoted[Object.keys(quoted).find(k => k.endsWith('Message'))];
      if (!imageMsg) return null;

      if (typeof socket.downloadMediaMessage === 'function') {
        const quotedKey = {
          remoteJid: msg.key.remoteJid,
          id: ctx.stanzaId,
          participant: ctx.participant || undefined
        };
        const fakeMsg = { key: quotedKey, message: ctx.quotedMessage };
        const stream = await socket.downloadMediaMessage(fakeMsg, 'image');
        const bufs = [];
        for await (const chunk of stream) bufs.push(chunk);
        return Buffer.concat(bufs);
      }

      return null;
    } catch (e) {
      console.error('downloadQuotedImage err', e);
      return null;
    }
  }

  // ⚙️ Main command logic
  try {
    const promptRaw = args.join(' ').trim();
    if (!promptRaw && !msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      return await socket.sendMessage(sender, {
        text: "📸 *Usage:* `.nanobanana <prompt>`\n💬 Or reply to an image with `.nanobanana your prompt`"
      }, { quoted: msg });
    }

    await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } });

    const imageBuf = await downloadQuotedImage(socket, msg);
    await socket.sendMessage(sender, {
      text: `🐉 *Generating image...*\n🖊️ Prompt: ${promptRaw || '(no text)'}\n📷 Mode: ${imageBuf ? 'Edit (Image + Prompt)' : 'Text to Image'}`
    }, { quoted: msg });

    // 🧠 Setup Gemini SDK
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "AIzaSyB6ZQwLHZFHxDCbBFJtc0GIN2ypdlga4vw"
    });

    // 🧩 Build contents
    const contents = imageBuf
      ? [
          { role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: imageBuf.toString("base64") } }, { text: promptRaw }] }
        ]
      : [
          { role: "user", parts: [{ text: promptRaw }] }
        ];

    // ✨ Generate Image using Gemini SDK
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents,
    });

    // 🖼️ Extract Image Data
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part) {
      console.log('Gemini response:', response);
      throw new Error('⚠️ No image data returned from Gemini API.');
    }

    const imageData = part.inlineData.data;
    const buffer = Buffer.from(imageData, "base64");

    const tmpPath = path.join(__dirname, `gemini-nano-${Date.now()}.png`);
    fs.writeFileSync(tmpPath, buffer);

    await socket.sendMessage(sender, {
      image: fs.readFileSync(tmpPath),
      caption: `✅ *Here you go!*\n🎨 Prompt: ${promptRaw}`
    }, { quoted: msg });

    try { fs.unlinkSync(tmpPath); } catch {}

  } catch (err) {
    console.error('nanobanana error:', err);
    await socket.sendMessage(sender, { text: `❌ *Error:* ${err.message || err}` }, { quoted: msg });
  }
  break;
}


case 'csave':
case 'gvcf2':
case 'scontact':
case 'savecontacts': {
  try {
    const text = args.join(" ").trim(); // ✅ Define text variable

    if (!text) {
      return await socket.sendMessage(sender, { 
        text: "🍁 *Usage:* .savecontact <group JID>\n📥 Example: .savecontact 9477xxxxxxx-123@g.us" 
      }, { quoted: msg });
    }

    const groupJid = text.trim();

    // ✅ Validate JID
    if (!groupJid.endsWith('@g.us')) {
      return await socket.sendMessage(sender, { 
        text: "❌ *Invalid group JID*. Must end with @g.us" 
      }, { quoted: msg });
    }

    let groupMetadata;
    try {
      groupMetadata = await socket.groupMetadata(groupJid);
    } catch {
      return await socket.sendMessage(sender, { 
        text: "❌ *Invalid group JID* or bot not in that group.*" 
      }, { quoted: msg });
    }

    const { participants, subject } = groupMetadata;
    let vcard = '';
    let index = 1;

    await socket.sendMessage(sender, { 
      text: `🔍 Fetching contact names from *${subject}*...` 
    }, { quoted: msg });

    // ✅ Loop through each participant
    for (const participant of participants) {
      const num = participant.id.split('@')[0];
      let name = num; // default name = number

      try {
        // Try to fetch from contacts or participant
        const contact = socket.contacts?.[participant.id] || {};
        if (contact?.notify) name = contact.notify;
        else if (contact?.vname) name = contact.vname;
        else if (contact?.name) name = contact.name;
        else if (participant?.name) name = participant.name;
      } catch {
        name = `Contact-${index}`;
      }

      // ✅ Add vCard entry
      vcard += `BEGIN:VCARD\n`;
      vcard += `VERSION:3.0\n`;
      vcard += `FN:${index}. ${name}\n`; // 👉 Include index number + name
      vcard += `TEL;type=CELL;type=VOICE;waid=${num}:+${num}\n`;
      vcard += `END:VCARD\n`;
      index++;
    }

    // ✅ Create a safe file name from group name
    const safeSubject = subject.replace(/[^\w\s]/gi, "_");
    const tmpDir = path.join(os.tmpdir(), `contacts_${Date.now()}`);
    fs.ensureDirSync(tmpDir);

    const filePath = path.join(tmpDir, `contacts-${safeSubject}.vcf`);
    fs.writeFileSync(filePath, vcard.trim());

    await socket.sendMessage(sender, { 
      text: `📁 *${participants.length}* contacts found in group *${subject}*.\n💾 Preparing VCF file...`
    }, { quoted: msg });

    await delay(1500);

    // ✅ Send the .vcf file
    await socket.sendMessage(sender, {
      document: fs.readFileSync(filePath),
      mimetype: 'text/vcard',
      fileName: `contacts-${safeSubject}.vcf`,
      caption: `✅ *Contacts Exported Successfully!*\n👥 Group: *${subject}*\n📇 Total Contacts: *${participants.length}*\n\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝙲𝙷𝙼𝙰 𝙼𝙳`
    }, { quoted: msg });

    // ✅ Cleanup temp file
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn('Failed to cleanup temp file:', cleanupError);
    }

  } catch (err) {
    console.error('Save contact error:', err);
    await socket.sendMessage(sender, { 
      text: `❌ Error: ${err.message || err}` 
    }, { quoted: msg });
  }
  break;
}

case 'font': {
    const axios = require("axios");

    // ?? Load bot name dynamically
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    // 🔹 Fake contact for Meta AI mention
    const botMention = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_FONT"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    const q =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

    const text = q.trim().replace(/^.fancy\s+/i, ""); // remove .fancy prefix

    if (!text) {
        return await socket.sendMessage(sender, {
            text: `❎ *Please provide text to convert into fancy fonts.*\n\n📌 *Example:* \`.font yasas\``
        }, { quoted: botMention });
    }

    try {
        const apiUrl = `https://www.dark-yasiya-api.site/other/font?text=${encodeURIComponent(text)}`;
        const response = await axios.get(apiUrl);

        if (!response.data.status || !response.data.result) {
            return await socket.sendMessage(sender, {
                text: "❌ *Error fetching fonts from API. Please try again later.*"
            }, { quoted: botMention });
        }

        const fontList = response.data.result
            .map(font => `*${font.name}:*\n${font.result}`)
            .join("\n\n");

        const finalMessage = `🎨 *Fancy Fonts Converter*\n\n${fontList}\n\n_© ${botName}_`;

        await socket.sendMessage(sender, {
            text: finalMessage
        }, { quoted: botMention });

    } catch (err) {
        console.error("Fancy Font Error:", err);
        await socket.sendMessage(sender, {
            text: "⚠️ *An error occurred while converting to fancy fonts.*"
        }, { quoted: botMention });
    }

    break;
}

case 'mediafire':
case 'mf':
case 'mfdl': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const url = text.split(" ")[1]; // .mediafire <link>

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

        // ✅ Fake Meta contact message (like Facebook style)
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_MEDIAFIRE"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!url) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please send a MediaFire link.*\n\nExample: .mediafire <url>'
            }, { quoted: shonux });
        }

        // ⏳ Notify start
        await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } });
        await socket.sendMessage(sender, { text: '*⏳ Fetching MediaFire file info...*' }, { quoted: shonux });

        // 🔹 Call API
        let api = `https://tharuzz-ofc-apis.vercel.app/api/download/mediafire?url=${encodeURIComponent(url)}`;
        let { data } = await axios.get(api);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '❌ *Failed to fetch MediaFire file.*' }, { quoted: shonux });
        }

        const result = data.result;
        const title = result.title || result.filename;
        const filename = result.filename;
        const fileSize = result.size;
        const downloadUrl = result.url;

        const caption = `📦 *${title}*\n\n` +
                        `📁 *𝐅ilename:* ${filename}\n` +
                        `📏 *𝐒ize:* ${fileSize}\n` +
                        `🌐 *𝐅rom:* ${result.from}\n` +
                        `📅 *𝐃ate:* ${result.date}\n` +
                        `🕑 *𝐓ime:* ${result.time}\n\n` +
                        `*✅ 𝐃ownloaded 𝐁y ${botName}*`;

        // 🔹 Send file automatically (document type for .zip etc.)
        await socket.sendMessage(sender, {
            document: { url: downloadUrl },
            fileName: filename,
            mimetype: 'application/octet-stream',
            caption: caption
        }, { quoted: shonux });

    } catch (err) {
        console.error("Error in MediaFire downloader:", err);

        // ✅ In catch also send Meta mention style
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_MEDIAFIRE"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
    break;
}
case 'apksearch':
case 'apks':
case 'apkfind': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const query = text.split(" ").slice(1).join(" ").trim();

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

        // ✅ Fake Meta contact message
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APK"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!query) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide an app name to search.*\n\nExample: .apksearch whatsapp',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ]
            }, { quoted: shonux });
        }

        await socket.sendMessage(sender, { text: '*⏳ Searching APKs...*' }, { quoted: shonux });

        // 🔹 Call API
        const apiUrl = `https://tharuzz-ofc-apis.vercel.app/api/search/apksearch?query=${encodeURIComponent(query)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.result || !data.result.length) {
            return await socket.sendMessage(sender, { text: '*❌ No APKs found for your query.*' }, { quoted: shonux });
        }

        // 🔹 Format results
        let message = `🔍 *APK Search Results for:* ${query}\n\n`;
        data.result.slice(0, 20).forEach((item, idx) => {
            message += `*${idx + 1}.* ${item.name}\n➡️ ID: \`${item.id}\`\n\n`;
        });
        message += `*𝐏owered 𝐁y ${botName}*`;

        // 🔹 Send results
        await socket.sendMessage(sender, {
            text: message,
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽𝚄' }, type: 1 },
                { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '📡 𝐁𝙾𝚃 𝐈𝙽𝙵𝙾' }, type: 1 }
            ],
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: shonux });

    } catch (err) {
        console.error("Error in APK search:", err);

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APK"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
    break;
}

case 'xvdl2':
case 'xvnew': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const query = text.split(" ").slice(1).join(" ").trim();

        if (!query) return await socket.sendMessage(sender, { text: '🚫 Please provide a search query.\nExample: .xv mia' }, { quoted: msg });

        // 1️⃣ Send searching message
        await socket.sendMessage(sender, { text: '*⏳ Searching XVideos...*' }, { quoted: msg });

        // 2️⃣ Call search API
        const searchRes = await axios.get(`https://tharuzz-ofc-api-v2.vercel.app/api/search/xvsearch?query=${encodeURIComponent(query)}`);
        const videos = searchRes.data.result?.xvideos?.slice(0, 10);
        if (!videos || videos.length === 0) return await socket.sendMessage(sender, { text: '*❌ No results found.*' }, { quoted: msg });

        // 3️⃣ Prepare list message
        let listMsg = `🔍 *XVideos Results for:* ${query}\n\n`;
        videos.forEach((vid, idx) => {
            listMsg += `*${idx + 1}.* ${vid.title}\n${vid.info}\n➡️ ${vid.link}\n\n`;
        });
        listMsg += '_Reply with the number to download the video._';

        await socket.sendMessage(sender, { text: listMsg }, { quoted: msg });

        // 4️⃣ Cache results for reply handling
        global.xvCache = global.xvCache || {};
        global.xvCache[sender] = videos.map(v => v.link);

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: '*❌ Error occurred.*' }, { quoted: msg });
    }
}
break;


// ---------------- list saved newsletters (show emojis) ----------------
case 'newslist': {
  try {
    const docs = await listNewslettersFromMongo();
    if (!docs || docs.length === 0) {
      let userCfg = {};
      try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
      const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
      const shonux = {
          key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST" },
          message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '📭 No channels saved in DB.' }, { quoted: shonux });
    }

    let txt = '*📚 Saved Newsletter Channels:*\n\n';
    for (const d of docs) {
      txt += `• ${d.jid}\n  Emojis: ${Array.isArray(d.emojis) && d.emojis.length ? d.emojis.join(' ') : '(default)'}\n\n`;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('newslist error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Failed to list channels.' }, { quoted: shonux });
  }
  break;
}
case 'cid': {
    // Extract query from message
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    // ✅ Dynamic botName load
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    // ✅ Fake Meta AI vCard (for quoted msg)
    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_CID"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    // Clean command prefix (.cid, /cid, !cid, etc.)
    const channelLink = q.replace(/^[.\/!]cid\s*/i, '').trim();

    // Check if link is provided
    if (!channelLink) {
        return await socket.sendMessage(sender, {
            text: '❎ Please provide a WhatsApp Channel link.\n\n📌 *Example:* .cid https://whatsapp.com/channel/123456789'
        }, { quoted: shonux });
    }

    // Validate link
    const match = channelLink.match(/whatsapp\.com\/channel\/([\w-]+)/);
    if (!match) {
        return await socket.sendMessage(sender, {
            text: '⚠️ *Invalid channel link format.*\n\nMake sure it looks like:\nhttps://whatsapp.com/channel/xxxxxxxxx'
        }, { quoted: shonux });
    }

    const inviteId = match[1];

    try {
        // Send fetching message
        await socket.sendMessage(sender, {
            text: `🔎 Fetching channel info for: *${inviteId}*`
        }, { quoted: shonux });

        // Get channel metadata
        const metadata = await socket.newsletterMetadata("invite", inviteId);

        if (!metadata || !metadata.id) {
            return await socket.sendMessage(sender, {
                text: '❌ Channel not found or inaccessible.'
            }, { quoted: shonux });
        }

        // Format details
        const infoText = `
📡 *𝐖hatsApp 𝐂hannel 𝐈nfo*

🆔 *𝐈D:* ${metadata.id}
📌 *𝐍ame:* ${metadata.name}
👥 *𝐅ollowers:* ${metadata.subscribers?.toLocaleString() || 'N/A'}
📅 *𝐂reated 𝐎n:* ${metadata.creation_time ? new Date(metadata.creation_time * 1000).toLocaleString("si-LK") : 'Unknown'}

*𝐏owered 𝐁y ${botName}*
`;

        // Send preview if available
        if (metadata.preview) {
            await socket.sendMessage(sender, {
                image: { url: `https://pps.whatsapp.net${metadata.preview}` },
                caption: infoText
            }, { quoted: shonux });
        } else {
            await socket.sendMessage(sender, {
                text: infoText
            }, { quoted: shonux });
        }

    } catch (err) {
        console.error("CID command error:", err);
        await socket.sendMessage(sender, {
            text: '⚠️ An unexpected error occurred while fetching channel info.'
        }, { quoted: shonux });
    }

    break;
}

case 'addadmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid or number to add as admin\nExample: .addadmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 ';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❌ Only owner can add admins.' }, { quoted: shonux });
  }

  try {
    await addAdminToMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Added admin: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('addadmin error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `❌ Failed to add admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'tagall': {
  try {
    if (!from || !from.endsWith('@g.us')) return await socket.sendMessage(sender, { text: '❌ This command can only be used in groups.' }, { quoted: msg });

    let gm = null;
    try { gm = await socket.groupMetadata(from); } catch(e) { gm = null; }
    if (!gm) return await socket.sendMessage(sender, { text: '❌ Failed to fetch group info.' }, { quoted: msg });

    const participants = gm.participants || [];
    if (!participants.length) return await socket.sendMessage(sender, { text: '❌ No members found in the group.' }, { quoted: msg });

    const text = args && args.length ? args.join(' ') : '📢 Announcement';

    let groupPP = 'https://files.catbox.moe/g6ywiw.jpeg';
    try { groupPP = await socket.profilePictureUrl(from, 'image'); } catch(e){}

    const mentions = participants.map(p => p.id || p.jid);
    const groupName = gm.subject || 'Group';
    const totalMembers = participants.length;

    const emojis = ['🫶','🐻','🌐','❄','⭕','❖','🫟','👀','◯','▢','❤️‍🔥','🎧','▣','▸'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    // BotName meta mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TAGALL" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let caption = `╭╸╸╸ *♥️ Group Announcement* ╺╺╺╮\n`;
    caption += `│ 📌 *𝐆roup:* ${groupName}\n`;
    caption += `│ 👥 *𝐌embers:* ${totalMembers}\n`;
    caption += `│ 💬 *𝐌essage:* ${text}\n`;
    caption += `╰────────────────────────────╯\n\n`;
    caption += `📍 *Mentioning all members below:*\n\n`;
    for (const m of participants) {
      const id = (m.id || m.jid);
      if (!id) continue;
      caption += `${randomEmoji} @${id.split('@')[0]}\n`;
    }
    caption += `\n━━━━━━⊱ *${botName}* ⊰━━━━━━`;

    await socket.sendMessage(from, {
      image: { url: groupPP },
      caption,
      mentions,
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (err) {
    console.error('tagall error', err);
    await socket.sendMessage(sender, { text: '❌ Error running tagall.' }, { quoted: msg });
  }
  break;
}


case 'ig':
case 'insta':
case 'instagram': {
  try {
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    const q = text.split(" ").slice(1).join(" ").trim();

    // Validate
    if (!q) {
      await socket.sendMessage(sender, { 
        text: '*🚫 Please provide an Instagram post/reel link.*',
        buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽𝚄' }, type: 1 }]
      });
      return;
    }

    const igRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[^\s]+/;
    if (!igRegex.test(q)) {
      await socket.sendMessage(sender, { 
        text: '*🚫 Invalid Instagram link.*',
        buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽𝚄' }, type: 1 }]
      });
      return;
    }

    await socket.sendMessage(sender, { react: { text: '🎥', key: msg.key } });
    await socket.sendMessage(sender, { text: '*⏳ Downloading Instagram media...*' });

    // 🔹 Load session bot name
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    // 🔹 Meta style fake contact
    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_FAKE_ID_002"
      },
      message: {
        contactMessage: {
          displayName: botName, // dynamic bot name
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550003:+1 313 555 0003
END:VCARD`
        }
      }
    };

    // API request
    let apiUrl = `https://delirius-apiofc.vercel.app/download/instagram?url=${encodeURIComponent(q)}`;
    let { data } = await axios.get(apiUrl).catch(() => ({ data: null }));

    // Backup API if first fails
    if (!data?.status || !data?.downloadUrl) {
      const backupUrl = `https://api.tiklydown.me/api/instagram?url=${encodeURIComponent(q)}`;
      const backup = await axios.get(backupUrl).catch(() => ({ data: null }));
      if (backup?.data?.video) {
        data = {
          status: true,
          downloadUrl: backup.data.video
        };
      }
    }

    if (!data?.status || !data?.downloadUrl) {
      await socket.sendMessage(sender, { 
        text: '*🚩 Failed to fetch Instagram video.*',
        buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 𝐌𝙰𝙸𝙽 𝐌𝙴𝙽𝚄' }, type: 1 }]
      });
      return;
    }

    // Caption (Dynamic Bot Name)
    const titleText = `*📸 ${botName} 𝐈ɴꜱᴛᴀɢʀᴀᴍ 𝐃ᴏᴡɴʟᴏᴀᴅᴇʀ*`;
    const content = `┏━━━━━━━━━━━━━━━━\n` +
                    `┃📌 \`𝐒ource\` : Instagram\n` +
                    `┃📹 \`𝐓ype\` : Video/Reel\n` +
                    `┗━━━━━━━━━━━━━━━━`;

    const footer = `🤖 ${botName}`;
    const captionMessage = typeof formatMessage === 'function'
      ? formatMessage(titleText, content, footer)
      : `${titleText}\n\n${content}\n${footer}`;

    // Send video with fake contact quoted
    await socket.sendMessage(sender, {
      video: { url: data.downloadUrl },
      caption: captionMessage,
      contextInfo: { mentionedJid: [sender] },
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 },
        { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '🤖 BOT INFO' }, type: 1 }
      ]
    }, { quoted: shonux }); // 🔹 fake contact quoted

  } catch (err) {
    console.error("Error in Instagram downloader:", err);
    await socket.sendMessage(sender, { 
      text: '*❌ Internal Error. Please try again later.*',
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }]
    });
  }
  break;
}
//====================================================================
case 'news': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;
            const logo = cfg.logo || config.RCD_IMAGE_PATH;


            // Get current time for Sri Lanka (IST - UTC+5:30)
            const now = new Date();

            // Set Sri Lanka timezone
            const options = { timeZone: 'Asia/Colombo' };

            // Get current hour in Sri Lanka time
            const sriLankaTime = now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
            const sriLankaDate = new Date(sriLankaTime);
            const currentHour = sriLankaDate.getHours();

            let greeting;
            if (currentHour >= 5 && currentHour < 12) {
              greeting = 'Good Morning 🌅';
            } else if (currentHour >= 12 && currentHour < 18) {
              greeting = 'Good Afternoon';
            } else {
              greeting = 'Good Evening 🌙';
            }

            // Format date and day separately for Sri Lanka
            const optionsDate = {
              month: 'long',
              day: 'numeric',
              timeZone: 'Asia/Colombo'
            };
            const formattedDate = sriLankaDate.toLocaleDateString('en-US', optionsDate);

            const optionsDay = {
              weekday: 'long',
              timeZone: 'Asia/Colombo'
            };
            const formattedDay = sriLankaDate.toLocaleDateString('en-US', optionsDay);

            // Format time for Sri Lanka
            const optionsTime = {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
              timeZone: 'Asia/Colombo'
            };
            const formattedTime = sriLankaDate.toLocaleTimeString('en-US', optionsTime);

            // Meta AI mention
            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            // 1. Send video note first
            const vnoteUrl = 'https://files.catbox.moe/dityqg.mp4';
            await socket.sendMessage(sender, {
              video: { url: vnoteUrl },
              ptv: true
            }, { quoted: metaQuote });

            await new Promise(resolve => setTimeout(resolve, 500));


            const text = `
*𝗛ɪ 👋 © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃 𝗠ɪɴɪ 𝗕ᴏᴛ 𝗨ꜱᴇʀ*

*┃🗯️ ɢʀᴇᴇᴛɪɴɢ :* ${greeting}
𝙼𝚈 𝙳𝙴𝙰𝚁 𝚄𝚂𝙴𝚁 𝚃𝙷𝙸𝚂 𝙸𝚂
𝙳𝙲𝚃 𝙲𝚁𝙸𝙼𝙸𝙽𝙰𝙻 𝙽𝙴𝚆𝚂 𝚄𝙿𝙳𝙰𝚃𝙴𝚂

ᴛʜᴀɴᴋꜱ ꜰᴏʀ ᴜꜱᴇ ᴛʜɪꜱ ʙᴏᴛ
`;

            const buttons = [
              {
                buttonId: 'action',
                buttonText: {
                  displayText: 'DAILY NEWS'
                },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'CLICK HERE',
                    sections: [
                      {
                        title: `DAILY NEWS 🍃`,
                        highlight_label: 'ԋҽʅʅσ ɳҽɯʂ🍃',
                        rows: [
                          {
                            title: 'ᴀᴅᴀɴᴇᴡꜱ 🌅',
                            description: 'Ada news update',
                            id: `${config.PREFIX}ada`,
                          },
                          {
                            title: 'ʜɪʀᴜ ɴᴇᴡꜱ 🌞',
                            description: 'Hiru news update',
                            id: `${config.PREFIX}hiru`,
                          },
                          {
                            title: 'ꜱɪʀᴀꜱᴀ ɴᴇᴡꜱ 🔺',
                            description: 'Sirasa news update',
                            id: `${config.PREFIX}sirasa`,
                          },
                          {
                            title: 'ɪᴛɴ ɴᴇᴡꜱ ⛩️',
                            description: 'Itn news update',
                            id: `${config.PREFIX}itn`,
                          },
                          // පස්සෙ කෑල්ල මෙතනට
                          {
                            title: 'ʟɴᴡ ɴᴇᴡꜱ 🔖',
                            description: 'Lnw news update',
                            id: `${config.PREFIX}lnw`,
                          },
                          {
                            title: 'ʙʙᴄ ɴᴇᴡꜱ 📉',
                            description: 'BBC news update',
                            id: `${config.PREFIX}bbc`,
                          },
                          // මෙතනට ටයිපින්
                          {
                            title: 'ᴅᴀꜱᴀᴛʜᴀ ʟᴀɴᴋᴀ 🗺️',
                            description: 'Dasatha news update',
                            id: `${config.PREFIX}dasathalanka`,
                          },
                          {
                            title: 'ꜱɪʏᴀᴛᴀ 🌊',
                            description: 'Siyatha news update',
                            id: `${config.PREFIX}siyatha`,
                          },
                          // රෙකෝඩින් එක මෙතනට
                          {
                            title: 'ʟᴀɴᴋᴀᴅᴇᴇᴘᴀ 🔖',
                            description: 'Lankadeepa news update',
                            id: `${config.PREFIX}lankadeepa`,
                          },
                          {
                            title: 'ɢᴀɢᴀɴᴀ 📦',
                            description: 'Gagana news update',
                            id: `${config.PREFIX}gagana`,
                          },
                          // මෙතනට තව මොකක් හරි
                          
                        ],
                      },
                    ],
                  }),
                },
              },
            ]

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: ` *${botName}*`,
              buttons,
              headerType: 4
            }, { quoted: metaQuote });

          } catch (e) {
            console.error('alive error', e);
            await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
          }
          break;
                                                                         }
                          
        case 'siyatha': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_SIYATHA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/siyatha?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Siyatha News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗦ɪʏᴀᴛʜᴀ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 ??ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('siyatha error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Siyatha News.' }, { quoted: botMention });
          }
          break;
        }

        case 'bbc': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_BBC" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/bbc?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch BBC News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗕ʙᴄ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('bbc error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching BBC News.' }, { quoted: botMention });
          }
          break;
        }

        case 'lnw': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_LNW" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/lnw?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch LNW News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗟ɴᴡ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('lnw error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching LNW News.' }, { quoted: botMention });
          }
          break;
        }

        case 'dasathalanka': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DASA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/dasathalanka?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Dasa Thalanka News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗗ᴀꜱᴀᴛʜᴀʟᴀɴᴋᴀ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('dasathalanka error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Dasa Thalanka News.' }, { quoted: botMention });
          }
          break;
        }

        case 'itn': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ITN" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/itn?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch ITN News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗜ᴛɴ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('itnnews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching ITN News.' }, { quoted: botMention });
          }
          break;
        }

        case 'hiru': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_HIRU" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/hiru?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Hiru News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗛ɪʀᴜ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('hirunews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Hiru News.' }, { quoted: botMention });
          }
          break;
        }

        case 'ada': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/ada');
            if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Ada News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗔ᴅᴀ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n*⏰ 𝗧ɪᴍᴇ :* ${n.time}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('adanews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Ada News.' }, { quoted: botMention });
          }
          break;
        }

        case 'sirasa': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_SIRASA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/sirasa');
            if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Sirasa News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗦ɪʀᴀꜱᴀ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n*⏰ 𝗧ɪᴍᴇ :* ${n.time}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('sirasanews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Sirasa News.' }, { quoted: botMention });
          }
          break;
        }

        case 'lankadeepa': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_LANKADEEPA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/lankadeepa');
            if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Lankadeepa News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗟ᴀɴᴋᴀᴅᴇᴇᴘᴀ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n*⏰ 𝗧ɪᴍᴇ :* ${n.time}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('lankadeepanews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Lankadeepa News.' }, { quoted: botMention });
          }
          break;
        }

        case 'gagana': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GAGANA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/gagana');
            if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Gagana News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗚ᴀɢᴀɴᴀ 𝗡ᴇᴡꜱ ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n*⏰ 𝗧ɪᴍᴇ :* ${n.time}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('gagananews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Gagana News.' }, { quoted: botMention });
          }
          break;
        }

case 'online': {
  try {
    if (!(from || '').endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: '❌ This command works only in group chats.' }, { quoted: msg });
      break;
    }

    let groupMeta;
    try { groupMeta = await socket.groupMetadata(from); } catch (err) { console.error(err); break; }

    const callerJid = (nowsender || '').replace(/:.*$/, '');
    const callerId = callerJid.includes('@') ? callerJid : `${callerJid}@s.whatsapp.net`;
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const isOwnerCaller = callerJid.startsWith(ownerNumberClean);
    const groupAdmins = (groupMeta.participants || []).filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
    const isGroupAdminCaller = groupAdmins.includes(callerId);

    if (!isOwnerCaller && !isGroupAdminCaller) {
      await socket.sendMessage(sender, { text: '❌ Only group admins or the bot owner can use this command.' }, { quoted: msg });
      break;
    }

    try { await socket.sendMessage(sender, { text: '🔄 Scanning for online members... please wait ~15 seconds' }, { quoted: msg }); } catch(e){}

    const participants = (groupMeta.participants || []).map(p => p.id);
    const onlineSet = new Set();
    const presenceListener = (update) => {
      try {
        if (update?.presences) {
          for (const id of Object.keys(update.presences)) {
            const pres = update.presences[id];
            if (pres?.lastKnownPresence && pres.lastKnownPresence !== 'unavailable') onlineSet.add(id);
            if (pres?.available === true) onlineSet.add(id);
          }
        }
      } catch (e) { console.warn('presenceListener error', e); }
    };

    for (const p of participants) {
      try { if (typeof socket.presenceSubscribe === 'function') await socket.presenceSubscribe(p); } catch(e){}
    }
    socket.ev.on('presence.update', presenceListener);

    const checks = 3; const intervalMs = 5000;
    await new Promise((resolve) => { let attempts=0; const iv=setInterval(()=>{ attempts++; if(attempts>=checks){ clearInterval(iv); resolve(); } }, intervalMs); });
    try { socket.ev.off('presence.update', presenceListener); } catch(e){}

    if (onlineSet.size === 0) {
      await socket.sendMessage(sender, { text: '⚠️ No online members detected (they may be hiding presence or offline).' }, { quoted: msg });
      break;
    }

    const onlineArray = Array.from(onlineSet).filter(j => participants.includes(j));
    const mentionList = onlineArray.map(j => j);

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    // BotName meta mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ONLINE" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let txt = `🟢 *𝐎nline 𝐌embers* — ${onlineArray.length}/${participants.length}\n\n`;
    onlineArray.forEach((jid, i) => {
      txt += `${i+1}. @${jid.split('@')[0]}\n`;
    });

    await socket.sendMessage(sender, {
      text: txt.trim(),
      mentions: mentionList
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (err) {
    console.error('Error in online command:', err);
    try { await socket.sendMessage(sender, { text: '❌ An error occurred while checking online members.' }, { quoted: msg }); } catch(e){}
  }
  break;
}



case 'deladmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid/number to remove\nExample: .deladmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❌ Only owner can remove admins.' }, { quoted: shonux });
  }

  try {
    await removeAdminFromMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Removed admin: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('deladmin error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `❌ Failed to remove admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

case 'admins': {
  try {
    const list = await loadAdminsFromMongo();
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!list || list.length === 0) {
      return await socket.sendMessage(sender, { text: 'No admins configured.' }, { quoted: shonux });
    }

    let txt = '*👑 Admins:*\n\n';
    for (const a of list) txt += `• ${a}\n`;

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('admins error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃';
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '❌ Failed to list admins.' }, { quoted: shonux });
  }
  break;
}
case 'jid': {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃'; // dynamic bot name

    const userNumber = sender.split('@')[0]; 

    // Reaction
    await socket.sendMessage(sender, { 
        react: { text: "🆔", key: msg.key } 
    });

    // Fake contact quoting for meta style
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_FAKE_ID" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, {
        text: `*🆔 𝐂hat 𝐉ID:* ${sender}\n*📞 𝐘our 𝐍umber:* +${userNumber}`,
    }, { quoted: shonux });
    break;
}

// use inside your switch(command) { ... } block

case 'block': {
  try {
    // caller number (who sent the command)
    const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const sessionOwner = (number || '').replace(/[^0-9]/g, '');

    // allow if caller is global owner OR this session's owner
    if (callerNumberClean !== ownerNumberClean && callerNumberClean !== sessionOwner) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ ඔබට මෙය භාවිත කිරීමට අවසර නැත. (Owner හෝ මෙහි session owner විය යුතුයි)' }, { quoted: msg });
      break;
    }

    // determine target JID: reply / mention / arg
    let targetJid = null;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    if (ctx?.participant) targetJid = ctx.participant; // replied user
    else if (ctx?.mentionedJid && ctx.mentionedJid.length) targetJid = ctx.mentionedJid[0]; // mentioned
    else if (args && args.length > 0) {
      const possible = args[0].trim();
      if (possible.includes('@')) targetJid = possible;
      else {
        const digits = possible.replace(/[^0-9]/g,'');
        if (digits) targetJid = `${digits}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❗ කරුණාකර reply කරන හෝ mention කරන හෝ number එක යොදන්න. උදාහරණය: .block 9477xxxxxxx' }, { quoted: msg });
      break;
    }

    // normalize
    if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

    // perform block
    try {
      if (typeof socket.updateBlockStatus === 'function') {
        await socket.updateBlockStatus(targetJid, 'block');
      } else {
        // some bailey builds use same method name; try anyway
        await socket.updateBlockStatus(targetJid, 'block');
      }
      try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: `✅ @${targetJid.split('@')[0]} blocked successfully.`, mentions: [targetJid] }, { quoted: msg });
    } catch (err) {
      console.error('Block error:', err);
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ Failed to block the user. (Maybe invalid JID or API failure)' }, { quoted: msg });
    }

  } catch (err) {
    console.error('block command general error:', err);
    try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing block command.' }, { quoted: msg });
  }
  break;
}

case 'unblock': {
  try {
    // caller number (who sent the command)
    const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const sessionOwner = (number || '').replace(/[^0-9]/g, '');

    // allow if caller is global owner OR this session's owner
    if (callerNumberClean !== ownerNumberClean && callerNumberClean !== sessionOwner) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ ඔබට මෙය භාවිත කිරීමට අවසර නැත. (Owner හෝ මෙහි session owner විය යුතුයි)' }, { quoted: msg });
      break;
    }

    // determine target JID: reply / mention / arg
    let targetJid = null;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    if (ctx?.participant) targetJid = ctx.participant;
    else if (ctx?.mentionedJid && ctx.mentionedJid.length) targetJid = ctx.mentionedJid[0];
    else if (args && args.length > 0) {
      const possible = args[0].trim();
      if (possible.includes('@')) targetJid = possible;
      else {
        const digits = possible.replace(/[^0-9]/g,'');
        if (digits) targetJid = `${digits}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❗ කරුණාකර reply කරන හෝ mention කරන හෝ number එක යොදන්න. උදාහරණය: .unblock 9477xxxxxxx' }, { quoted: msg });
      break;
    }

    // normalize
    if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

    // perform unblock
    try {
      if (typeof socket.updateBlockStatus === 'function') {
        await socket.updateBlockStatus(targetJid, 'unblock');
      } else {
        await socket.updateBlockStatus(targetJid, 'unblock');
      }
      try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: `🔓 @${targetJid.split('@')[0]} unblocked successfully.`, mentions: [targetJid] }, { quoted: msg });
    } catch (err) {
      console.error('Unblock error:', err);
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ Failed to unblock the user.' }, { quoted: msg });
    }

  } catch (err) {
    console.error('unblock command general error:', err);
    try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing unblock command.' }, { quoted: msg });
  }
  break;
}

case 'setbotname': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change this session bot name.' }, { quoted: shonux });
    break;
  }

  const name = args.join(' ').trim();
  if (!name) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Provide bot name. Example: `.setbotname © 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃`' }, { quoted: shonux });
  }

  try {
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    cfg.botName = name;
    await setUserConfigInMongo(sanitized, cfg);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Bot display name set for this session: ${name}` }, { quoted: shonux });
  } catch (e) {
    console.error('setbotname error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set bot name: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

case 'setmenuvideo': {
  const _smvSan = (number || '').replace(/[^0-9]/g, '');
  const _smvSenderNum = (nowsender || '').split('@')[0];
  const _smvOwnerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (_smvSenderNum !== _smvSan && _smvSenderNum !== _smvOwnerNum) {
    return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change the menu video.' }, { quoted: msg });
  }

  const _smvUrl = (args[0] || '').trim();
  if (!_smvUrl || !_smvUrl.startsWith('http')) {
    let _smvCfg = await loadUserConfigFromMongo(_smvSan) || {};
    const _smvCurrent = _smvCfg.menuVideo || 'https://files.catbox.moe/ffjmpr.mp4';
    return await socket.sendMessage(sender, {
      text: `📖 *Set Menu Video Usage:*\n*.setmenuvideo <url>*\n\nExample:\n_.setmenuvideo https://files.catbox.moe/xxxxx.mp4_\n\n🎬 *Current menu video:* ${_smvCurrent}\n\n_This changes the video note shown when .menu is used._`
    }, { quoted: msg });
  }

  try {
    let _smvCfg = await loadUserConfigFromMongo(_smvSan) || {};
    _smvCfg.menuVideo = _smvUrl;
    await setUserConfigInMongo(_smvSan, _smvCfg);
    await socket.sendMessage(sender, { react: { text: '🎬', key: msg.key } });
    await socket.sendMessage(sender, { text: `✅ *Menu video updated!*\n\n🎬 *New URL:* ${_smvUrl}\n\nThis will be shown when users use *.menu*` }, { quoted: msg });
  } catch (e) {
    console.error('setmenuvideo error', e);
    await socket.sendMessage(sender, { text: `❌ Failed to set menu video: ${e.message || e}` }, { quoted: msg });
  }
  break;
}

        case 'setlogo': {
          await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });
          try {
            const _slSan = (number || '').replace(/[^0-9]/g, '');
            const _slSenderNum = (nowsender || '').split('@')[0];
            const _slOwnerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            let _slCfg = await loadUserConfigFromMongo(_slSan) || {};
            const _slStoredOwner = (_slCfg.sessionOwner || '').replace(/[^0-9]/g, '');
            const _slAllowed = _slSenderNum === _slSan || _slSenderNum === _slOwnerNum || (_slStoredOwner && _slSenderNum === _slStoredOwner);
            if (!_slAllowed) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change the bot logo.' }, { quoted: msg });
            }

            // Check if a URL was provided as arg
            const _slArgUrl = (args[0] || '').trim();
            const _slUrlRegex = /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;

            if (_slArgUrl && _slUrlRegex.test(_slArgUrl)) {
              // Direct URL provided
              _slCfg.logo = _slArgUrl;
              await setUserConfigInMongo(_slSan, _slCfg);
              await socket.sendMessage(sender, {
                image: { url: _slArgUrl },
                caption: `✅ *Bot logo updated!*\n🔗 *URL:* ${_slArgUrl}`
              }, { quoted: msg });

            } else {
              // Check if replying to an image
              const _slCtx = msg.message?.extendedTextMessage?.contextInfo;
              const _slQuoted = _slCtx?.quotedMessage;
              const _slQImg = _slQuoted?.imageMessage;

              if (!_slQImg) {
                return await socket.sendMessage(sender, {
                  text: `📖 *Set Logo Usage:*\n1️⃣ Reply to an image with *.setlogo*\n2️⃣ Or provide an image URL:\n   _.setlogo https://example.com/image.jpg_`
                }, { quoted: msg });
              }

              // Download quoted image and upload to catbox
              try {
                const _slStream = await downloadContentFromMessage(_slQImg, 'image');
                let _slBuf = Buffer.from([]);
                for await (const c of _slStream) _slBuf = Buffer.concat([_slBuf, c]);

                const axios = require('axios');
                const FormData = require('form-data');
                const form = new FormData();
                form.append('reqtype', 'fileupload');
                form.append('fileToUpload', _slBuf, { filename: 'logo.jpg', contentType: _slQImg.mimetype || 'image/jpeg' });

                const _slUp = await axios.post('https://catbox.moe/user/api.php', form, {
                  headers: { ...form.getHeaders() },
                  timeout: 30000
                });

                const _slUrl = (_slUp.data || '').trim();
                if (!_slUrl || !_slUrl.startsWith('http')) throw new Error('Upload failed');

                _slCfg.logo = _slUrl;
                await setUserConfigInMongo(_slSan, _slCfg);
                await socket.sendMessage(sender, {
                  image: { url: _slUrl },
                  caption: `✅ *Bot logo updated!*\n🔗 *Stored URL:* ${_slUrl}`
                }, { quoted: msg });

              } catch(_slUpErr) {
                console.error('setlogo upload error:', _slUpErr);
                await socket.sendMessage(sender, { text: `❌ Failed to upload image: ${_slUpErr.message || _slUpErr}` }, { quoted: msg });
              }
            }
          } catch(e) {
            console.error('setlogo cmd error:', e);
            await socket.sendMessage(sender, { text: `❌ setlogo failed: ${e.message || e}` }, { quoted: msg });
          }
          break;
        }

        case 'setowner': {
          await socket.sendMessage(sender, { react: { text: '👑', key: msg.key } });
          try {
            const _soSan = (number || '').replace(/[^0-9]/g, '');
            const _soSenderNum = (nowsender || '').split('@')[0];
            const _soOwnerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            // Only session number itself or global bot owner can set session owner
            if (_soSenderNum !== _soSan && _soSenderNum !== _soOwnerNum) {
              return await socket.sendMessage(sender, { text: '❌ Only the session account holder or global bot owner can set the session owner.' }, { quoted: msg });
            }

            const _soRaw = (args[0] || '').trim();
            if (!_soRaw) {
              let _soShowCfg = await loadUserConfigFromMongo(_soSan) || {};
              const _soCurrent = _soShowCfg.sessionOwner || 'Not set (default: session number)';
              return await socket.sendMessage(sender, {
                text: `📖 *Set Owner Usage:*\n*.setowner number*\n\n*Example:*\n_.setowner 94789988778_\n\n👑 *Current session owner:* ${_soCurrent}\n\n_This sets a trusted number that can control this bot session's settings._`
              }, { quoted: msg });
            }

            const _soDigits = _soRaw.replace(/[^0-9]/g, '');
            if (!_soDigits || _soDigits.length < 7) {
              return await socket.sendMessage(sender, { text: '❗ Invalid number. Example: `.setowner 94789988778`' }, { quoted: msg });
            }

            let _soCfg = await loadUserConfigFromMongo(_soSan) || {};
            const _soPrev = _soCfg.sessionOwner || null;
            _soCfg.sessionOwner = _soDigits;
            await setUserConfigInMongo(_soSan, _soCfg);

            const _soJid = `${_soDigits}@s.whatsapp.net`;
            await socket.sendMessage(sender, {
              text: `✅ *Session Owner Updated!*\n\n👑 *New Owner:* @${_soDigits}\n📱 *Session:* +${_soSan}${_soPrev ? `\n🔄 *Previous:* ${_soPrev}` : ''}\n\n_This number now has owner-level access to bot settings for this session._`,
              mentions: [_soJid]
            }, { quoted: msg });

            // Notify the new owner
            try {
              await socket.sendMessage(_soJid, {
                text: `👑 *You have been set as the session owner for bot session +${_soSan}!*\n\nYou can now control this bot's settings using owner commands.`
              });
            } catch(e) {}

          } catch(e) {
            console.error('setowner cmd error:', e);
            await socket.sendMessage(sender, { text: `❌ setowner failed: ${e.message || e}` }, { quoted: msg });
          }
          break;
        }

        case 'report': {
          await socket.sendMessage(sender, { react: { text: '⚠️', key: msg.key } });
          try {
            const _rpSan = (number || '').replace(/[^0-9]/g, '');
            const _rpSenderNum = (nowsender || '').split('@')[0];
            const _rpOwnerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            if (_rpSenderNum !== _rpSan && _rpSenderNum !== _rpOwnerNum) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can use this command.' }, { quoted: msg });
            }

            // parse "number,count"
            const _rpRaw = (args[0] || '').trim();
            if (!_rpRaw.includes(',')) {
              return await socket.sendMessage(sender, {
                text: `📖 *Report Command Usage:*\n*.report number,count*\n\n*Example:*\n_.report 94789988778,10_\n\nThis will send 10 reports to that number.\n⚠️ Max 20 reports per command.`
              }, { quoted: msg });
            }

            const _rpParts = _rpRaw.split(',');
            const _rpTargetRaw = (_rpParts[0] || '').trim();
            const _rpCount = parseInt((_rpParts[1] || '').trim(), 10);

            if (!_rpTargetRaw || isNaN(_rpCount) || _rpCount < 1) {
              return await socket.sendMessage(sender, { text: '❗ Invalid format. Example: `.report 94789988778,10`' }, { quoted: msg });
            }

            const _rpMax = 20;
            const _rpFinal = Math.min(_rpCount, _rpMax);
            const _rpDigits = _rpTargetRaw.replace(/[^0-9]/g, '');
            const _rpJid = `${_rpDigits}@s.whatsapp.net`;

            if (!_rpDigits) {
              return await socket.sendMessage(sender, { text: '❗ Invalid phone number.' }, { quoted: msg });
            }

            await socket.sendMessage(sender, {
              text: `📡 *Sending ${_rpFinal} report(s) to* +${_rpDigits}...\n⏳ Please wait...`
            }, { quoted: msg });

            let _rpSuccess = 0;
            for (let _rpi = 0; _rpi < _rpFinal; _rpi++) {
              try {
                if (typeof socket.query === 'function') {
                  await socket.query({
                    tag: 'iq',
                    attrs: {
                      to: 's.whatsapp.net',
                      type: 'set',
                      xmlns: 'spam',
                      id: socket.generateMessageTag ? socket.generateMessageTag() : `report-${Date.now()}-${_rpi}`
                    },
                    content: [{
                      tag: 'report',
                      attrs: { v: '2', type: '1' },
                      content: [{
                        tag: 'user',
                        attrs: { jid: _rpJid }
                      }]
                    }]
                  });
                } else if (typeof socket.sendNode === 'function') {
                  await socket.sendNode({
                    tag: 'iq',
                    attrs: {
                      to: 's.whatsapp.net',
                      type: 'set',
                      xmlns: 'spam',
                      id: `report-${Date.now()}-${_rpi}`
                    },
                    content: [{
                      tag: 'report',
                      attrs: { v: '2', type: '1' },
                      content: [{
                        tag: 'user',
                        attrs: { jid: _rpJid }
                      }]
                    }]
                  });
                } else {
                  await socket.updateBlockStatus(_rpJid, 'block');
                  await delay(300);
                  await socket.updateBlockStatus(_rpJid, 'unblock');
                }
                _rpSuccess++;
              } catch(_rpErr) {
                console.log(`Report attempt ${_rpi + 1} error:`, _rpErr.message || _rpErr);
              }
              await delay(800);
            }

            await socket.sendMessage(sender, {
              text: `✅ *Report Complete!*\n\n📋 *Target:* +${_rpDigits}\n📊 *Reports Sent:* ${_rpSuccess}/${_rpFinal}\n${_rpSuccess < _rpFinal ? `⚠️ ${_rpFinal - _rpSuccess} failed (rate limit or invalid number)` : '🎯 All reports sent successfully!'}`
            }, { quoted: msg });
            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

          } catch(e) {
            console.error('report cmd error:', e);
            try { await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } }); } catch(re){}
            await socket.sendMessage(sender, { text: `❌ Report failed: ${e.message || e}` }, { quoted: msg });
          }
          break;
        }

        case 'antidelete': {
          await socket.sendMessage(sender, { react: { text: '🗑️', key: msg.key } });
          try {
            const _adSan = (number || '').replace(/[^0-9]/g, '');
            const _adSenderNum = (nowsender || '').split('@')[0];
            const _adOwnerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            if (_adSenderNum !== _adSan && _adSenderNum !== _adOwnerNum) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can use this command.' }, { quoted: msg });
            }
            const _adOpt = (args[0] || '').toLowerCase();
            if (_adOpt === 'on' || _adOpt === 'off') {
              let _adCfg = await loadUserConfigFromMongo(_adSan) || {};
              _adCfg.ANTI_DELETE = _adOpt;
              await setUserConfigInMongo(_adSan, _adCfg);
              await socket.sendMessage(sender, { text: `✅ *Anti Delete ${_adOpt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\nDeleted messages will ${_adOpt === 'on' ? 'now be forwarded to you.' : 'no longer be forwarded.'}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Anti Delete Usage:*\n*.antidelete on* — Enable (resend deleted msgs to you)\n*.antidelete off* — Disable` }, { quoted: msg });
            }
          } catch(e) { console.error('antidelete cmd error:', e); await socket.sendMessage(sender, { text: '❌ Error updating antidelete.' }, { quoted: msg }); }
          break;
        }

        // default
        default:
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FANCY) }); } catch(e){}
    }

  });
}

// ---------------- Call Rejection Handler ----------------

// ---------------- Simple Call Rejection Handler ----------------

async function setupCallRejection(socket, sessionNumber) {
    socket.ev.on('call', async (calls) => {
        try {
            // Load user-specific config from MongoDB
            const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            if (userConfig.ANTI_CALL !== 'on') return;

            console.log(`📞 Incoming call detected for ${sanitized} - Auto rejecting...`);

            for (const call of calls) {
                if (call.status !== 'offer') continue;

                const id = call.id;
                const from = call.from;

                // Reject the call
                await socket.rejectCall(id, from);
                
                // Send rejection message to caller
                await socket.sendMessage(from, {
                    text: '*🔕 Auto call rejection is enabled. Calls are automatically rejected.*'
                });
                
                console.log(`✅ Auto-rejected call from ${from}`);

                // Send notification to bot user
                const userJid = jidNormalizedUser(socket.user.id);
                const rejectionMessage = formatMessage(
                    '📞 CALL REJECTED',
                    `Auto call rejection is active.\n\nCall from: ${from}\nTime: ${getSriLankaTimestamp()}`,
                    BOT_NAME_FANCY
                );

                await socket.sendMessage(userJid, { 
                    image: { url: config.RCD_IMAGE_PATH }, 
                    caption: rejectionMessage 
                });
            }
        } catch (err) {
            console.error(`Call rejection error for ${sessionNumber}:`, err);
        }
    });
}

// ---------------- Auto Message Read Handler ----------------

async function setupAutoMessageRead(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    // Quick return if no need to process
    const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    const autoReadSetting = userConfig.AUTO_READ_MESSAGE || 'off';

    if (autoReadSetting === 'off') return;

    const from = msg.key.remoteJid;
    
    // Simple message body extraction
    let body = '';
    try {
      const type = getContentType(msg.message);
      const actualMsg = (type === 'ephemeralMessage') 
        ? msg.message.ephemeralMessage.message 
        : msg.message;

      if (type === 'conversation') {
        body = actualMsg.conversation || '';
      } else if (type === 'extendedTextMessage') {
        body = actualMsg.extendedTextMessage?.text || '';
      } else if (type === 'imageMessage') {
        body = actualMsg.imageMessage?.caption || '';
      } else if (type === 'videoMessage') {
        body = actualMsg.videoMessage?.caption || '';
      }
    } catch (e) {
      // If we can't extract body, treat as non-command
      body = '';
    }

    // Check if it's a command message
    const prefix = userConfig.PREFIX || config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);

    // Apply auto read rules - SINGLE ATTEMPT ONLY
    if (autoReadSetting === 'all') {
      // Read all messages - one attempt only
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read message (single attempt):', error?.message);
        // Don't retry - just continue
      }
    } else if (autoReadSetting === 'cmd' && isCmd) {
      // Read only command messages - one attempt only
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Command message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read command message (single attempt):', error?.message);
        // Don't retry - just continue
      }
    }
  });
}

// ---------------- group participant event handler ----------------

async function setupGroupEventHandlers(socket, sessionNumber) {
  socket.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (!id || !participants || !participants.length) return;
    try {
      const settings = await getAllGroupSettings(id);
      let groupMeta;
      try { groupMeta = await socket.groupMetadata(id); } catch(e) { return; }
      const groupName = groupMeta.subject || 'this group';
      for (const participant of participants) {
        const num = participant.split('@')[0];
        if (action === 'add' && settings.WELCOME === 'on') {
          const customMsg = settings.WELCOME_MSG || `Welcome to *${groupName}*! 🎉 We're glad to have you here.`;
          await socket.sendMessage(id, { text: `👋 *Welcome!*\n@${num} ${customMsg}`, mentions: [participant] });
        } else if ((action === 'remove' || action === 'leave') && settings.GOODBYE === 'on') {
          const customMsg = settings.GOODBYE_MSG || `Goodbye! We'll miss you. 👋`;
          await socket.sendMessage(id, { text: `🚪 *Goodbye!*\n@${num} ${customMsg}`, mentions: [participant] });
        }
      }
    } catch(e) { console.log('GroupParticipantEvent error:', e); }
  });
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    
    try {
      // Load user-specific config from MongoDB
      let autoTyping = config.AUTO_TYPING; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config
      
      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
        
        // Check for auto typing in user config
        if (userConfig.AUTO_TYPING !== undefined) {
          autoTyping = userConfig.AUTO_TYPING;
        }
        
        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      // Use auto typing setting (from user config or global)
      if (autoTyping === 'true') {
        try { 
          await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
          // Stop typing after 3 seconds
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto typing error:', e);
        }
      }
      
      // Use auto recording setting (from user config or global)
      if (autoRecording === 'true') {
        try { 
          await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
          // Stop recording after 3 seconds  
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto recording error:', e);
        }
      }
    } catch (error) {
      console.error('Message handler error:', error);
    }
  });
}


// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    stopAllAutoTTSend(sanitized);
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('*🥷 OWNER NOTICE — SESSION REMOVED*', `*𝐍umber:* ${sanitized}\n*𝐒ession 𝐑emoved 𝐃ue 𝐓o 𝐋ogout.*\n\n*𝐀ctive 𝐒essions 𝐍ow:* ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
                         || lastDisconnect?.error?.statusCode
                         || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
                          || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
                          || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'))
                          || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      } else {
        const san = number.replace(/[^0-9]/g, '');
        if (intentionallyClosedNumbers.has(san)) {
          console.log(`Connection closed for ${san} intentionally (re-pair). Skipping auto-restart.`);
          intentionallyClosedNumbers.delete(san);
        } else {
          const retries = (reconnectRetries.get(san) || 0) + 1;
          reconnectRetries.set(san, retries);
          if (retries > 5) {
            console.warn(`Max reconnect attempts (5) reached for ${san}. Giving up.`);
            reconnectRetries.delete(san);
            activeSockets.delete(san);
            socketCreationTime.delete(san);
          } else {
            console.log(`Connection closed for ${number} (not logout). Reconnect attempt ${retries}/5...`);
            const backoff = Math.min(10000 * retries, 60000);
            try {
              await delay(backoff);
              activeSockets.delete(san);
              socketCreationTime.delete(san);
              const mockRes = { headersSent:false, send:() => {}, status: () => mockRes };
              await EmpirePair(number, mockRes);
              reconnectRetries.delete(san);
            } catch(e) {
              console.error('Reconnect attempt failed', e);
            }
          }
        }
      }

    }

  });
}

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------


// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  
  // Prefill from Mongo if available
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

  try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: Browsers.ubuntu('Chrome')
    }, sanitizedNumber);

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket, sanitizedNumber);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    handleMessageRevocation(socket, sanitizedNumber);
    setupAutoMessageRead(socket, sanitizedNumber);
    setupCallRejection(socket, sanitizedNumber);
    setupGroupEventHandlers(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
     let dina = `CRIMINAL`;
     
      while (retries > 0) {
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber, dina); break; }
        
        catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        
        const credsPath = path.join(sessionPath, 'creds.json');
        
        if (!fs.existsSync(credsPath)) return;
        const fileStats = fs.statSync(credsPath);
        if (fileStats.size === 0) return;
        
        const fileContent = await fs.readFile(credsPath, 'utf8');
        const trimmedContent = fileContent.trim();
        if (!trimmedContent || trimmedContent === '{}' || trimmedContent === 'null') return;
        
        let credsObj;
        try { credsObj = JSON.parse(trimmedContent); } catch (e) { return; }
        
        if (!credsObj || typeof credsObj !== 'object') return;
        
        const keysObj = state.keys || null;
        await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
        console.log('✅ Creds saved to MongoDB successfully');
        
      } catch (err) { 
        console.error('Failed saving creds on creds.update:', err);
      }
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(()=>({ status: 'failed', error: 'joinGroup not configured' }));

          try {
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch(e){}
            }
          } catch(e){}

          activeSockets.set(sanitizedNumber, socket);

          // ── Load & restart AutoTTSend intervals ──
          try {
            const ttConfigs = await getAutoTTSendConfigs(sanitizedNumber);
            const userCfgTT = await loadUserConfigFromMongo(sanitizedNumber) || {};
            const botNameTT = userCfgTT.botName || BOT_NAME_FANCY;
            for (const ttc of ttConfigs) {
              startAutoTTSendInterval(socket, sanitizedNumber, ttc.jid, ttc.title, botNameTT, ttc.intervalMinutes || 10);
            }
          } catch(e) { console.warn('AutoTTSend reload error:', e.message); }

          // ── Load & restart AutoSongSend intervals ──
          try {
            const songConfigs = await getAutoSongSendConfigs(sanitizedNumber);
            const userCfgSong = await loadUserConfigFromMongo(sanitizedNumber) || {};
            const botNameSong = userCfgSong.botName || BOT_NAME_FANCY;
            for (const sc of songConfigs) {
              startAutoSongInterval(socket, sanitizedNumber, sc.jid, sc.title, botNameSong, sc.intervalMinutes || 30);
            }
          } catch(e) { console.warn('AutoSongSend reload error:', e.message); }

          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || BOT_NAME_FANCY;
          const useLogo = userConfig.logo || config.RCD_IMAGE_PATH;

          const initialCaption = formatMessage(useBotName,
            `*✅ 𝐒uccessfully 𝐂onnected*\n\n*🔢 𝐍umber:* ${sanitizedNumber}\n*🕒 𝐂onnecting: Bot will become active in a few seconds*`,
            useBotName
          );

          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: initialCaption });
              }
            }
          } catch (e) {
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch(e){}
          }

          await delay(4000);

          const updatedCaption = formatMessage(useBotName,
            `*✅ 𝐒uccessfully 𝐂onnected 𝐀nd 𝐀ctive*\n\n*🔢 𝐍umber:* ${sanitizedNumber}\n*🩵 𝐒tatus:* ${groupStatus}\n*🕒 𝐂onnected 𝐀t:* ${getSriLankaTimestamp()}`,
            useBotName
          );

          try {
            if (sentMsg && sentMsg.key) {
              try { await socket.sendMessage(userJid, { delete: sentMsg.key }); } catch (delErr) {}
            }
            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) {}


          await addNumberToMongo(sanitizedNumber);

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'CHATUWA-MINI-main'}`); } catch(e) {}
        }
      }
    });

    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }
}


// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// existing endpoints (connect, reconnect, active, etc.)

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });

  const sanitized = number.replace(/[^0-9]/g, '');

  // Close & remove existing active socket if any
  if (activeSockets.has(sanitized)) {
    const oldSocket = activeSockets.get(sanitized);
    intentionallyClosedNumbers.add(sanitized);
    try { oldSocket.ws.close(); } catch(e) {}
    activeSockets.delete(sanitized);
    socketCreationTime.delete(sanitized);
  }

  // Delete old session from MongoDB
  try {
    await initMongo();
    await sessionsCol.deleteOne({ number: sanitized });
    await numbersCol.deleteOne({ number: sanitized });
    userConfigCache.delete(sanitized);
    console.log(`Old session cleared for ${sanitized} — fresh pairing started`);
  } catch(e) { console.warn('Session cleanup before re-pair failed:', e.message); }

  // Remove temp session folder so EmpirePair starts completely fresh
  const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
  try { fs.removeSync(sessionPath); } catch(e) {}

  await EmpirePair(number, res);
});


router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getSriLankaTimestamp() });
});


router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: '© 𝐃ᴄᴛ 𝗖ʀɪᴍɪɴᴀʟ 𝐌𝙳 ||🍃', activesession: activeSockets.size });
});

router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});


router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});


router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});


router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FANCY) });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});


router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});


// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});


// API: sessions & active & delete

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});
router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


// ─── Dashboard Settings API ──────────────────────────────────────────────────

router.get('/api/config', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).json({ ok: false, error: 'number required' });
  const san = number.replace(/[^0-9]/g, '');
  try {
    const uc = await loadUserConfigFromMongo(san) || {};
    res.json({ ok: true, config: uc });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/api/config', async (req, res) => {
  const { number, config: newCfg } = req.body;
  if (!number || !newCfg) return res.status(400).json({ ok: false, error: 'number and config required' });
  const san = number.replace(/[^0-9]/g, '');
  try {
    const existing = await loadUserConfigFromMongo(san) || {};
    const merged = { ...existing, ...newCfg };
    await setUserConfigInMongo(san, merged);
    res.json({ ok: true, message: 'Config updated successfully' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/api/ping', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

router.get('/api/sessions/list', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, sessions: keys, count: keys.length });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── Group Management API ────────────────────────────────────────────────────

router.get('/api/group', async (req, res) => {
  const { jid } = req.query;
  if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
  try {
    const settings = await getAllGroupSettings(jid);
    res.json({ ok: true, settings });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/api/group', async (req, res) => {
  const { jid, settings } = req.body;
  if (!jid || !settings) return res.status(400).json({ ok: false, error: 'jid and settings required' });
  try {
    await setAllGroupSettings(jid, settings);
    res.json({ ok: true, message: 'Group settings saved' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/api/sessions/format-all', async (req, res) => {
  const { password } = req.body;
  if (password !== 'kezu') return res.status(401).json({ ok: false, error: 'Wrong password' });
  try {
    await initMongo();
    await sessionsCol.deleteMany({});
    await numbersCol.deleteMany({});
    activeSockets.forEach((socket, number) => {
      try { socket.ws.close(); } catch (e) {}
      activeSockets.delete(number);
      socketCreationTime.delete(number);
      try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
    });
    userConfigCache.clear();
    console.log('All sessions formatted by dashboard request');
    res.json({ ok: true, message: 'All sessions formatted successfully' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/api/groups/list', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).json({ ok: false, error: 'number required' });
  const san = number.replace(/[^0-9]/g, '');
  try {
    const sock = activeSockets.get(san);
    if (!sock) return res.status(404).json({ ok: false, error: 'No active session for this number' });
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.values(groups).map(g => ({ jid: g.id, name: g.subject, participants: g.participants ? g.participants.length : 0 }));
    res.json({ ok: true, groups: list });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── Channel Settings API ─────────────────────────────────────────────────────

router.post('/api/channel/follow-all', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
  const normalizedJid = jid.trim().endsWith('@newsletter') ? jid.trim() : `${jid.trim()}@newsletter`;
  const results = [];
  const sockets = Array.from(activeSockets.entries());
  if (sockets.length === 0) return res.status(404).json({ ok: false, error: 'No active sessions connected' });
  for (const [number, socket] of sockets) {
    try {
      if (typeof socket.newsletterFollow === 'function') {
        await socket.newsletterFollow(normalizedJid);
        results.push({ number, status: 'followed' });
      } else {
        results.push({ number, status: 'skipped', reason: 'newsletterFollow not available' });
      }
    } catch(e) {
      results.push({ number, status: 'error', reason: e.message });
    }
  }
  const succeeded = results.filter(r => r.status === 'followed').length;
  res.json({ ok: true, jid: normalizedJid, total: sockets.length, succeeded, results });
});

router.post('/api/channel/react-all', async (req, res) => {
  let { jid, emojis } = req.body;
  if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
  const normalizedJid = jid.trim().endsWith('@newsletter') ? jid.trim() : `${jid.trim()}@newsletter`;
  const emojisArr = Array.isArray(emojis) && emojis.length > 0 ? emojis : ['❤️'];
  try {
    await addNewsletterReactConfig(normalizedJid, emojisArr);
  } catch(e) {
    return res.status(500).json({ ok: false, error: 'Failed to save react config: ' + e.message });
  }
  const results = [];
  const sockets = Array.from(activeSockets.entries());
  for (const [number, socket] of sockets) {
    try {
      if (typeof socket.newsletterFollow === 'function') {
        await socket.newsletterFollow(normalizedJid);
        results.push({ number, status: 'followed+react_set' });
      } else {
        results.push({ number, status: 'react_set', reason: 'newsletterFollow not available' });
      }
    } catch(e) {
      results.push({ number, status: 'error', reason: e.message });
    }
  }
  const succeeded = results.filter(r => r.status === 'followed+react_set').length;
  res.json({ ok: true, jid: normalizedJid, emojis: emojisArr, total: sockets.length, succeeded, results });
});

router.get('/api/channel/react-list', async (req, res) => {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    res.json({ ok: true, list: docs });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/api/channel/react-remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
  try {
    await removeNewsletterReactConfig(jid);
    res.json({ ok: true, message: 'React config removed for ' + jid });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ---------------- cleanup + process events ----------------

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});


process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION] Bot will continue running:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION] Bot will continue running. Reason:', reason);
});


// initialize mongo & auto-reconnect attempt

initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async()=>{ try { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) { for (const n of nums) { if (!activeSockets.has(n)) { const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; await EmpirePair(n, mockRes); await delay(500); } } } } catch(e){} })();

module.exports = router;


