/**
 * Howlthorne Point Bot — Cleaned & Fully Functional
 * • Prefix-based commands (no slash)
 * • Supports: !givepoints, !takepoints, !progress, !leaderboard, !mystats, !renameslot, !classinfo, !help
 * • Fantasy-themed embeds + automatic leaderboard updates + announcements
 */

const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ---------- Bot Setup ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const BOT_PREFIX = '!';
const MAX_POINTS = 100;
const PROGRESS_FILE = path.resolve(__dirname, 'progress.json');
const LEADERBOARD_CHANNEL_ID = '1380352063279464458';
const LEADER_ANNOUNCE_CHANNEL_ID = '1380371009592627320';
let leaderboardUpdateTimeout = null;

let points = {};
if (fs.existsSync(PROGRESS_FILE)) {
  try { points = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } 
  catch { points = {}; }
}

let slotNames = {};
try {
  slotNames = JSON.parse(fs.readFileSync('./slotNames.json', 'utf8'));
} catch { slotNames = {}; }

const announcementGifs = [
'https://media.giphy.com/media/KXGltmsUaqkVi/giphy.gif',
  'https://media.giphy.com/media/EizX1bK3LlD20/giphy.gif',
  'https://media.giphy.com/media/tESfFtsS3sGCk/giphy.gif',
  'https://media.giphy.com/media/mSKMcT3Xqe8s8/giphy.gif',
  'https://media.giphy.com/media/720g7C1jz13wI/giphy.gif',
  'https://media.giphy.com/media/zeeYz6iGGoaA0/giphy.gif',
  'https://media.giphy.com/media/1127pePUDTiKAg/giphy.gif',
  'https://media.giphy.com/media/3otPoTggaYFNd1FdAI/giphy.gif',
  'https://media.giphy.com/media/QaVl2PZGYsxBC/giphy.gif'
  ];


// ---------- Class & Teacher Data ----------
const classData = {
  hexcraft: { name: 'Hex Warden', color: 0x8e44ad, icon: '🧿' },
  alchemy: { name: 'Master Alchemist', color: 0xf1c40f, icon: '⚗️' },
  arts: { name: 'Sinbound Enchanter', color: 0xe67e22, icon: '🩸' },
  history: { name: 'Coven Chronicler', color: 0x2980b9, icon: '📚' },
  flora: { name: 'Nature’s Friend', color: 0x27ae60, icon: '🌿' },
  oddities: { name: 'Oddity Hunter', color: 0x95a5a6, icon: '🔮' },
};

const classTeachers = {
  hexcraft: { name: 'Rowena Dove', portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074112525013082/474a4930f9a230eeaecc6cd3e5ecf1fd.jpg?ex=6843df2c&is=68428dac&hm=0a2dcf68c80129ad2ea18771c929c845d861185f9e05d693572628f52584877d&', flavor: '“Your wards shimmer brighter with each lesson.”' },
  alchemy: { name: 'Alaric Spellweaver', portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074111425843280/80830-the-academys-professor-is-overpowered.png?ex=6843df2c&is=68428dac&hm=6f5adbb5e1900e16e5bb3eb3c6fd2bfac4f160e6e909baac30b83f92ca320522&', flavor: '“Your potions are improving. Keep stirring!”' },
  arts: { name: 'Silas de Lioncourt', portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074111677632512/IMG_2055.jpg?ex=6843df2c&is=68428dac&hm=26546693726593dbe6e2de3d7b6e481ed191d6dfd74844cc31daf7d6db3070dd&', flavor: '“Paint the ether with enchantments.”' },
  history: { name: 'Lena Dreamer', portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074111899926620/06b6aa487fe5138d409a42ce244278fb.jpg?ex=6843df2c&is=68428dac&hm=04fa9dfbf00a8f2f013f7afaac05a17348a6279434a6078ce288ea52288559bb&', flavor: '“Keep your quill sharp.”' },
  flora: { name: 'Florence Thistlewhim', portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074112189206581/d0a0d9a5d5bda80fefe1a5afe91307aa.jpg?ex=6843df2c&is=68428dac&hm=5c986d49512e0e0f56a2abced348238264344b5aab940c20bec0cc352a8d12b7&', flavor: '“Let your bond with nature grow.”' },
  oddities: { name: 'Delayna Morwyn', portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074111203807282/Copy_of_Copy_of_Character_Music_20250530_122224_0000.png?ex=6843df2c&is=68428dac&hm=f10eabfcb2a828d32a31ca2128274dacbc8ebdf5f23fea8f050489ac5e78d023&', flavor: '“The oddities speak to you, don’t they?”' },
};

const librarianPortrait = 'https://cdn.discordapp.com/attachments/1116595332244054079/1380309908678901933/100d0d9e119c8ae848aedaa556e7111e.jpg?ex=68441207&is=6842c087&hm=f8c13095f9f84cf9c1db11f53cffb46185cba03d0e96f7590a910940238f79a1&';

const teacherMessages = {
  hexcraft: { scold: "This is beneath the sigils you've drawn." },
  alchemy: { scold: 'Even spoiled brews teach us something. Barely.' },
  arts: { scold: 'Art without intention is just noise.' },
  history: { scold: 'Forgetting the past? Dangerous mistake.' },
  flora: { scold: 'Even the roots recoil from your carelessness.' },
  oddities: { scold: 'Some oddities cannot be tamed by half-measures.' },
};

function savePoints() {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(points, null, 2));
}
function saveSlotNames() {
  fs.writeFileSync('./slotNames.json', JSON.stringify(slotNames, null, 2));
}

// Leaderboard Update (with announcement)
async function updateLeaderboard() {
  const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID).catch(() => null);
  const announceChannel = await client.channels.fetch(LEADER_ANNOUNCE_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const leaderboardData = {};
  for (const key in points) {
    const [userId] = key.split('_slot');
    leaderboardData[userId] = leaderboardData[userId] || 0;
    for (const classKey in points[key]) {
      leaderboardData[userId] += points[key][classKey];
    }
  }

  const sorted = Object.entries(leaderboardData).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const embed = new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle('🏆 The House Ledger')
    .setDescription('✨ The top scholars of the realm...')
    .setThumbnail(classTeachers.oddities.portrait)
    .setFooter({ text: 'Updated by magic every time points are granted.' })
    .setTimestamp();

  const medals = ['🥇', '🥈', '🥉'];
  for (let i = 0; i < sorted.length; i++) {
    const [userId, totalPoints] = sorted[i];
    const user = await client.users.fetch(userId).catch(() => null);
    const tag = user?.tag || `Unknown (${userId})`;
    embed.addFields({ name: `${medals[i] || `#${i + 1}`} — ${tag}`, value: `**${totalPoints} points**`, inline: false });
  }

  // Announce if first place changes
  const firstPlaceFile = './firstPlace.json';
  let prev = null;

  if (fs.existsSync(firstPlaceFile)) {
    try {
      prev = JSON.parse(fs.readFileSync(firstPlaceFile)).firstPlaceId;
    } catch {
      prev = null;
    }
  }

  const newChampId = sorted[0]?.[0];

  if (newChampId && newChampId !== prev && announceChannel) {
    const newChamp = await client.users.fetch(newChampId).catch(() => null);

    if (newChamp) {
      const gif = announcementGifs[Math.floor(Math.random() * announcementGifs.length)];

      const ann = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('📣 A New Champion Emerges!')
        .setDescription(
          `@everyone\n\n` +
          `**${newChamp.tag}** has risen to the top of the House Ledger! 🏆\n\n` +
          `“By the stars and scrolls, their brilliance now lights the path. Let all scholars strive to match their spark.”\n\n` +
          `— Headmistress Delayna Morwyn ✨`
        )
        .setTimestamp();

      const gifEmbed = new EmbedBuilder()
        .setImage(gif);

      // Send both embeds together - announcement + gif
      await announceChannel.send({
        content: '@everyone',
        embeds: [ann, gifEmbed],
        allowedMentions: { parse: ['everyone'] }
      });

      fs.writeFileSync(firstPlaceFile, JSON.stringify({ firstPlaceId: newChampId }, null, 2));
    }
  }

  const cacheFile = './leaderboardMessage.json';
  try {
    let msg = null;
    if (fs.existsSync(cacheFile)) {
      const id = JSON.parse(fs.readFileSync(cacheFile)).messageId;
      msg = await channel.messages.fetch(id).catch(() => null);
    }
    if (msg) {
      await msg.edit({ embeds: [embed] });
    } else {
      const sent = await channel.send({ embeds: [embed] });
      fs.writeFileSync(cacheFile, JSON.stringify({ messageId: sent.id }, null, 2));
    }
  } catch (err) {
    console.error('🛑 Leaderboard update error:', err);
  }
}

// Server Keep-Alive (for Replit/Glitch)
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running');
}).listen(process.env.PORT || 3000);

client.once('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);
});

// ---------- Leaderboard Update Scheduler ----------
function scheduleLeaderboardUpdate() {
  if (leaderboardUpdateTimeout) return; // Already scheduled, skip

  leaderboardUpdateTimeout = setTimeout(async () => {
    try {
      await updateLeaderboard();
    } catch (err) {
      console.error('Error updating leaderboard:', err);
    }
    leaderboardUpdateTimeout = null; // Reset so new updates can be scheduled
  }, 15000); // 15 seconds cooldown
}

exports = {
  updateLeaderboard,
  scheduleLeaderboardUpdate,
  classData,
  classTeachers,
  teacherMessages,
  librarianPortrait,
  MAX_POINTS,
  slotNames,
  saveSlotNames,
  points,
  savePoints
};

// ──────────────────────────────────────────────────────────
// Bot Ready + Keep-Alive (for Replit/Glitch/Heroku)
// ──────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);
});

const PORT = process.env.PORT || 3001;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running');
}).listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(BOT_PREFIX)) return;

  const parts = message.content.slice(BOT_PREFIX.length).trim().split(/\s+/);
  const command = parts.shift().toLowerCase();

  if (command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📜 Command Guide')
      .setColor(0xc0392b)
      .addFields(
        {
          name: '🎓 Student Commands',
          value:
            '`!mystats` — View your characters in a dropdown menu.\n' +
            '`!progress <slot>` — View your own slot’s progress.\n' +
            '`!classinfo <class>` — Learn about a class.\n' +
            '`!renameslot <slot> <new name>` — Rename your character slot.'
        },
        {
          name: '🧙 Admin Extras',
          value:
            '`!givepoints @user <slot> <class> <amount>` — Give points.\n' +
            '`!takepoints @user <slot> <class> <amount>` — Remove points.\n' +
            '`!mystats @user` — View another user’s slots.\n' +
            '`!progress @user <slot>` — View another user’s slot progress.\n' +
            '`!leaderboard <class>` — Show the top users for a class.'
        }
      )
      .setFooter({
        text: 'All classes cap at 100 points.',
        iconURL: librarianPortrait
      })
      .setTimestamp();
    return message.channel.send({ embeds: [helpEmbed] });
  }

  if (command === 'givepoints' || command === 'takepoints') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
      return message.reply("🚫 You don’t have permission.");

    const user = message.mentions.users.first();
    const slot = parts[1];
    const classKey = parts[2]?.toLowerCase();
    const amount = parseInt(parts[3], 10);

    if (!user || !['1', '2', '3'].includes(slot) || !classData[classKey] || isNaN(amount))
      return message.channel.send("ℹ️ Usage: `!givepoints @user <slot> <class> <amount>`");

    const key = `${user.id}_slot${slot}`;
    points[key] = points[key] || {};
    const prev = points[key][classKey] || 0;

    if (command === 'givepoints') {
      points[key][classKey] = Math.min(prev + amount, MAX_POINTS);
    } else {
      points[key][classKey] = Math.max(prev - amount, 0);
    }

    await savePoints();
    scheduleLeaderboardUpdate();
    
    const isGive = command === 'givepoints'
    const teacher = classTeachers[classKey];
    const flavor = isGive
      ? (teacher?.flavor || "No teacher flavor found.")
      : (teacherMessages[classKey]?.scold || "Scold message missing.");

    const embed = new EmbedBuilder()
      .setColor(classData[classKey].color)
      .setTitle(`${classData[classKey].icon} ${classData[classKey].name}`)
      .setDescription(
        `${isGive ? 'Gave' : 'Removed'} **${amount} points** ${isGive ? 'to' : 'from'} <@${user.id}>’s slot ${slot}.\n` +
        `New total: **${points[key][classKey] || 0} / ${MAX_POINTS}**\n\n*${flavor}*`
      )
      .setTimestamp();

    // Add thumbnail and footer only if teacher data exists
    if (teacher) {
      console.log('ClassKey:', classKey);
      console.log('Teacher:', teacher);
      embed.setThumbnail(teacher.portrait);
      embed.setFooter({ text: `From your mentor, ${teacher.name}` });
    }

    return message.channel.send({ embeds: [embed] });
  }
  
  if (command === 'progress') {
    const user = message.mentions.users.first() || message.author;
    const slot = message.mentions.users.first() ? parts[1] : parts[0];
    if (!['1', '2', '3'].includes(slot)) return message.channel.send("ℹ️ Usage: `!progress [@user] <slot>`");

    const key = `${user.id}_slot${slot}`;
    const profile = points[key] || {};
    if (!Object.values(profile).some(v => v > 0)) return message.channel.send(`${user.username} has no points in slot ${slot}.`);

    const embed = new EmbedBuilder()
      .setColor(0x7d3c98)
      .setTitle(`📘 ${user.username} — Slot ${slot} Progress`)
      .setDescription('⚗️ These scores are inked by glowing hand and whispered ink…')
      .setFooter({ text: 'Grimoire sealed upon reading 📌' })
      .setTimestamp();

    for (const classKey in classData) {
      const { icon, name } = classData[classKey];
      embed.addFields({ name: `${icon} ${name}`, value: `**${profile[classKey] || 0} / ${MAX_POINTS}**`, inline: true });
    }
    return message.channel.send({ embeds: [embed] });
  }

  if (command === 'classinfo') {
    const classKey = parts[0]?.toLowerCase();
    if (!classData[classKey]) return message.channel.send("ℹ️ Invalid class name.");

    const descriptions = {
      hexcraft: 'Masters of mystical warding and arcane secrets.',
      alchemy:  'Experts in potions and transformative magic.',
      arts:     'Creators of enchantments and mystical artistry.',
      history:  'Keepers of knowledge and ancient lore.',
      flora:    'Friends of nature and plant magic.',
      oddities: 'Seekers of the strange and unusual.'
    };

    const embed = new EmbedBuilder()
      .setColor(classData[classKey].color)
      .setTitle(`${classData[classKey].icon} ${classData[classKey].name}`)
      .setDescription(descriptions[classKey])
      .setTimestamp();

    return message.channel.send({ embeds: [embed] });
  }

  if (command === 'renameslot') {
    const slot = parts[0];
    const newName = parts.slice(1).join(' ');
    if (!['1','2','3'].includes(slot) || !newName) return message.channel.send("ℹ️ Usage: `!renameslot <slot> <new name>`");
    slotNames[`${message.author.id}_slotname${slot}`] = newName;
    await saveSlotNames();
    return message.channel.send(`✅ Slot ${slot} has been renamed to **${newName}**.`);
  }

  if (command === 'mystats') {
    const user = message.mentions.users.first() || message.author;
    const slotLabels = [1, 2, 3].map(slot => {
      const name = slotNames[`${user.id}_slotname${slot}`] || `Character ${slot}`;
      return {
        label: `Slot ${slot} — ${name}`,
        value: slot.toString(),
        emoji: slot === 1 ? '🔮' : slot === 2 ? '📚' : '🌙'
      };
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`select_slot_${user.id}`)
      .setPlaceholder('📜 Choose a character to reveal their magical record…')
      .addOptions(slotLabels);

    const row = new ActionRowBuilder().addComponents(menu);
    const embed = new EmbedBuilder()
      .setColor(0xb49fcc)
      .setTitle('📖 ━━ Grimoire of Achievements ━━')
      .setDescription(`✨ Within this living book are the records of ${user.username}’s enchanted studies.`)
      .setFooter({ text: 'Inscribed by the Academy’s Recordkeeper ✎', iconURL: librarianPortrait })
      .setTimestamp();

    return message.channel.send({ embeds: [embed], components: [row] });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isSelectMenu()) return;
  if (!interaction.customId.startsWith('select_slot_')) return;

  const userId = interaction.customId.split('_').pop();
  if (interaction.user.id !== userId) return interaction.reply({ content: '🕯️ Only you may open your own record.', ephemeral: true });

  const slot = interaction.values[0];
  const key = `${userId}_slot${slot}`;
  const profile = points[key] || {};
  const slotName = slotNames[`${userId}_slotname${slot}`] || `Slot ${slot}`;

  if (!Object.values(profile).some(v => v > 0)) {
    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(0x7f8c8d)
        .setTitle('📕 Nothing Yet…')
        .setDescription(`Slot ${slot} holds no known record.`)
        .setTimestamp()
      ],
      components: []
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x7d3c98)
    .setTitle(`📘 ${interaction.user.username} — ${slotName} Progress`)
    .setDescription('⚗️ These scores are inked by glowing hand and whispered ink…')
    .setFooter({ text: 'Grimoire sealed upon reading 📌' })
    .setTimestamp();

  for (const classKey in classData) {
    embed.addFields({
      name: `${classData[classKey].icon} ${classData[classKey].name}`,
      value: `**${profile[classKey] || 0} / ${MAX_POINTS}**`,
      inline: true
    });
  }

  return interaction.update({ embeds: [embed], components: [] });
});

client.login(process.env.DISCORD_TOKEN);

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});