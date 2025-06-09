/**
 * Single-file, prefix-based Discord bot (no slash commands)
 * • Tracks points per character "slot" (1–3) in progress.json
 * • Commands: !help, !givepoints, !takepoints, !progress, !leaderboard, !classinfo, !mystats, !renameslot
 * • Embedded, fantasy-themed replies, with teacher portraits/flavor text
 * • Select-menu for !mystats to choose slot via dropdown
 */
console.log('=== BOT SCRIPT STARTING ===');

const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

// ---------- Configuration ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoints for uptime monitoring
app.get('/', (req, res) => {
    res.json({
        status: 'Point Bot is running',
        uptime: process.uptime(),
        botStatus: client.user ? client.user.tag : 'Not ready',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/ping', (req, res) => {
    res.status(200).json({ 
        message: 'pong', 
        bot: client.user ? client.user.tag : 'Not ready',
        status: 'alive'
    });
});

// Start the web server
app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

const PROGRESS_FILE = path.resolve(__dirname, 'progress.json');
const SLOT_NAMES_FILE = path.resolve(__dirname, 'slotNames.json');
const LEADERBOARD_CACHE_FILE = path.resolve(__dirname, 'leaderboardMessage.json');
const FIRST_PLACE_FILE = path.resolve(__dirname, 'firstPlace.json');

const MAX_POINTS = 100;
const BOT_PREFIX = '!';
const LEADERBOARD_CHANNEL_ID = '1380695276527943680';
const LEADER_ANNOUNCE_CHANNEL_ID = '1380752765403529257';
const LEADERBOARD_UPDATE_DELAY = 15000; // 15 seconds
const ANNOUNCEMENTS_CHANNEL_ID = '1380752765403529257';

const ANNOUNCEMENT_GIFS = [
  'https://tenor.com/view/ahs-coven-gif-21197408',
  'https://tenor.com/view/dumbledore-frustrated-harry-potter-i-give-up-gif-3482214',
  'https://tenor.com/view/wizard-cat-wizard-cat-by-demonwolf-mage-cat-magic-cat-gif-2835561615176791073',
  'https://tenor.com/view/wizard-cat-by-demonwolf-wizard-cat-gif-12906617261522464996',
  'https://tenor.com/view/bewitched-sprinkles-salty-gif-13413006327347905573',
  'https://tenor.com/view/bette-midler-step-back-hocus-pocus-omg-shocked-gif-11347018',
  'https://tenor.com/view/casting-spells-magical-halloween-witch-gif-12769129',
  'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExdTYybTVoYW5mOTV4anozbTlqb3luNzNxMmF2anJndzExNjkybng4MiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/PXvCWUnmqVdks/200.webp',
  'https://tenor.com/view/cat-accept-as-ruler-salem-gif-7361778'
];

const LIBRARIAN_PORTRAIT = 'https://cdn.discordapp.com/attachments/1116595332244054079/1380304023604695122/75e8f83f2ef560fba82f3e082f509f55.jpg?ex=684363cc&is=6842124c&hm=dd8116df29c1ded7ba4b587e943ab5a81a5af44a09d86dc104ad09bdba0f87f9&';

// Kill any existing processes
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// ---------- Data Structures ----------
let points = {};
let slotNames = {};
let leaderboardUpdateTimeout = null;

const classData = {
  hexcraft: { name: 'Hex Warden', color: 0x8e44ad, icon: '🧿' },
  alchemy: { name: 'Master Alchemist', color: 0xf1c40f, icon: '⚗️' },
  arts: { name: 'Sinbound Enchanter', color: 0xe67e22, icon: '🎨' },
  history: { name: 'Coven Chronicler', color: 0x2980b9, icon: '📚' },
  flora: { name: 'Nature\'s Friend', color: 0x27ae60, icon: '🌿' },
  oddities: { name: 'Oddity Hunter', color: 0x95a5a6, icon: '🔮' }
};

const classTeachers = {
  hexcraft: {
    name: 'Rowena Dove, The Hex Warden',
    portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074112525013082/474a4930f9a230eeaecc6cd3e5ecf1fd.jpg',
    flavor: '"Excellent progress! Your wards shimmer brighter with each lesson." ✨'
  },
  alchemy: {
    name: 'Alaric Spellweaver, Master Alchemist',
    portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074111425843280/80830-the-academys-professor-is-overpowered.png',
    flavor: '"A potion\'s perfection grows with your dedication. Keep stirring!" 🧪'
  },
  arts: {
    name: 'Silas de Lioncourt, Sinbound Enchanter',
    portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074111677632512/IMG_2055.jpg',
    flavor: '"Your creative spells paint the ether with vibrant hues." 🎨'
  },
  history: {
    name: 'Lena Dreamer, Coven Chronicler',
    portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074111899926620/06b6aa487fe5138d409a42ce244278fb.jpg',
    flavor: '"The stories you preserve echo through time. Keep your quill sharp." 📜'
  },
  flora: {
    name: 'Florence Thistlewhim, Nature\'s Friend',
    portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074112189206581/d0a0d9a5d5bda80fefe1a5afe91307aa.jpg',
    flavor: '"The flora responds to your touch. Let your connection grow." 🌿'
  },
  oddities: {
    name: 'Delayna Morwyn, Oddity Hunter',
    portrait: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380074111203807282/Copy_of_Copy_of_Character_Music_20250530_122224_0000.png',
    flavor: '"Strange magic stirs where others see nothing. Trust your instincts." 🔮'
  }
};

const teacherMessages = {
  hexcraft: { scold: "This is beneath the sigils you've drawn. I expected more." },
  alchemy: { scold: "Even spoiled brews teach us something. Barely." },
  arts: { scold: "Art without intention is just noise." },
  history: { scold: "Forgetting the past? Dangerous mistake." },
  flora: { scold: "Even the roots recoil from your carelessness." },
  oddities: { scold: "Some oddities cannot be tamed by half-measures." }
};

const classDescriptions = {
  hexcraft: 'Masters of mystical warding and arcane secrets.',
  alchemy: 'Experts in potions and transformative magic.',
  arts: 'Creators of enchantments and mystical artistry.',
  history: 'Keepers of knowledge and ancient lore.',
  flora: 'Friends of nature and plant magic.',
  oddities: 'Seekers of the strange and unusual.'
};

// ---------- Utility Functions ----------
async function loadData() {
  try {
    if (fsSync.existsSync(PROGRESS_FILE)) {
      const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
      points = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading progress.json:', err);
    points = {};
  }

  try {
    if (fsSync.existsSync(SLOT_NAMES_FILE)) {
      const data = await fs.readFile(SLOT_NAMES_FILE, 'utf-8');
      slotNames = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading slotNames.json:', err);
    slotNames = {};
  }
}

async function savePoints() {
  try {
    await fs.writeFile(PROGRESS_FILE, JSON.stringify(points, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving points:', err);
  }
}

async function saveSlotNames() {
  try {
    await fs.writeFile(SLOT_NAMES_FILE, JSON.stringify(slotNames, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving slot names:', err);
  }
}

function isValidSlot(slot) {
  return ['1', '2', '3'].includes(slot);
}

function isValidClass(classKey) {
  return classData.hasOwnProperty(classKey);
}

function getSlotDisplayName(userId, slot) {
  const key = `${userId}_slotname${slot}`;
  return slotNames[key] || `Character ${slot}`;
}

function hasPermission(member) {
  return member.permissions.has(PermissionsBitField.Flags.ManageRoles);
}

// ---------- Leaderboard Functions ----------
function scheduleLeaderboardUpdate() {
  if (leaderboardUpdateTimeout) return;

  leaderboardUpdateTimeout = setTimeout(async () => {
    try {
      await updateLeaderboard();
    } catch (err) {
      console.error('Error updating leaderboard:', err);
    }
    leaderboardUpdateTimeout = null;
  }, LEADERBOARD_UPDATE_DELAY);
}

async function updateLeaderboard() {
  const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error('❌ Leaderboard channel not found.');
    return;
  }

  const announceChannel = await client.channels.fetch(LEADER_ANNOUNCE_CHANNEL_ID).catch(() => null);

  // Collect total points per user (across all slots and classes)
  const leaderboardData = {};

  for (const key in points) {
    const [userId] = key.split('_slot');
    leaderboardData[userId] = leaderboardData[userId] || 0;
    const profile = points[key];
    for (const classKey in profile) {
      leaderboardData[userId] += profile[classKey];
    }
  }

  const sorted = Object.entries(leaderboardData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Load previous first place
  let prevFirstPlaceId = null;
  try {
    if (fsSync.existsSync(FIRST_PLACE_FILE)) {
      const data = JSON.parse(fsSync.readFileSync(FIRST_PLACE_FILE, 'utf8'));
      prevFirstPlaceId = data.firstPlaceId;
    }
  } catch (err) {
    console.error('Error loading first place data:', err);
  }

  // Build leaderboard embed
  const embed = new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle('🏆 The House Ledger')
    .setDescription('✨ The top scholars of the realm, inscribed in gilded ink...')
    .setThumbnail('https://cdn.discordapp.com/attachments/1116595332244054079/1380074111203807282/Copy_of_Copy_of_Character_Music_20250530_122224_0000.png')
    .setFooter({ text: 'Updated by magic every time points are granted.' })
    .setTimestamp();

  const medals = ['🥇', '🥈', '🥉'];

  for (let i = 0; i < sorted.length; i++) {
    const [userId, totalPoints] = sorted[i];
    const userTag = await client.users.fetch(userId).then(u => u.tag).catch(() => `Unknown (${userId})`);
    const medal = medals[i] || `#${i + 1}`;
    embed.addFields({
      name: `${medal} — ${userTag}`,
      value: `**${totalPoints} points**`,
      inline: false
    });
  }

  // Update or send leaderboard message
    let messageId = null;
    if (fsSync.existsSync(LEADERBOARD_CACHE_FILE)) {
      const saved = JSON.parse(fsSync.readFileSync(LEADERBOARD_CACHE_FILE, 'utf8'));
      messageId = saved.messageId;
    }

    let message;
    try {
      if (messageId) {
        message = await channel.messages.fetch(messageId);
        await message.edit({ embeds: [embed] });
      } else {
        throw new Error('No saved message ID — send new message');
      }
    } catch (err) {
      console.warn('Leaderboard message not found or failed to edit, sending new one.');
      message = await channel.send({ embeds: [embed] });
      fsSync.writeFileSync(LEADERBOARD_CACHE_FILE, JSON.stringify({ messageId: message.id }, null, 2));
    }

  // Check for new first place and announce if changed
  if (sorted.length > 0) {
    const newFirstPlaceId = sorted[0][0];
    if (prevFirstPlaceId !== newFirstPlaceId && announceChannel) {
      const newChampionUser = await client.users.fetch(newFirstPlaceId).catch(() => null);
      if (newChampionUser) {
        const randomGif = ANNOUNCEMENT_GIFS[Math.floor(Math.random() * ANNOUNCEMENT_GIFS.length)];

        const announceEmbed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle('📣 A New Champion Emerges!')
          .setDescription(
            `**${newChampionUser.tag}** has ascended to the **top of the House Ledger**!\n\n` +
            `"By the stars and scrolls, their brilliance shines brighter than ever. Let all scholars aspire to their glory."\n\n` +
            `— Headmistress Delayna Morwyn ✨`
          )
          .setTimestamp();

        // Send the embed first
        await announceChannel.send({
          content: '@everyone',
          embeds: [announceEmbed],
          allowedMentions: { parse: ['everyone'] }
        });

        // Then send the GIF as a separate message
        await announceChannel.send({
          content: randomGif
        });

        // Save new first place
        fsSync.writeFileSync(FIRST_PLACE_FILE, JSON.stringify({ firstPlaceId: newFirstPlaceId }, null, 2));
      }
    }
  }
}

// ---------- Command Handlers ----------
async function handleHelp(message) {
  const helpEmbed = new EmbedBuilder()
    .setTitle('📜 Command Guide')
    .setColor(0xc0392b)
    .addFields(
      {
        name: '🎓 Student Commands',
        value:
          '`!mystats` — View your characters in a dropdown menu.\n' +
          '`!progress <slot>` — View your own slot\'s progress.\n' +
          '`!classinfo <class>` — Learn about a class.\n' +
          '`!renameslot <slot> <new name>` — Rename your character slot.',
      },
      {
        name: '🧙 Admin Extras',
        value:
          '`!givepoints @user <slot> <class> <amount>` — Give points to a specific character slot.\n' +
          '`!takepoints @user <slot> <class> <amount>` — Remove points from a character slot.\n' +
          '`!removeuser @user` — Completely remove a user from the leaderboard.\n' +
          '`!mystats @user` — View another user\'s slots.\n' +
          '`!progress @user <slot>` — View another user\'s slot progress.\n' +
          '`!leaderboard <class>` — Show the top 10 users for a class.',
      }
    )
    .setFooter({
      text: 'All classes cap at 100 points. 📚',
      iconURL: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380309908678901933/100d0d9e119c8ae848aedaa556e7111e.jpg?ex=68436947&is=684217c7&hm=a505815c04b223cadc022a93cbee9319d36ad298da8a03561b3b94a0d43ece88&'
    })
    .setTimestamp();

  return message.channel.send({ embeds: [helpEmbed] });
}

async function handleGivePoints(message, parts) {
  if (!hasPermission(message.member)) {
    return message.reply("🚫 You don't have permission to give points.");
  }

  const user = message.mentions.users.first();
  const slot = parts[1];
  const classKey = parts[2]?.toLowerCase();
  const amount = parseInt(parts[3], 10);

  if (!user || !isValidSlot(slot) || !isValidClass(classKey) || isNaN(amount)) {
    return message.channel.send("ℹ️ Usage: `!givepoints @user <slot 1-3> <class> <amount>`");
  }

  const key = `${user.id}_slot${slot}`;
  points[key] = points[key] || {};
  const oldTotal = points[key][classKey] || 0;
  points[key][classKey] = Math.min((points[key][classKey] || 0) + amount, MAX_POINTS);
  const newTotal = points[key][classKey];

  try {
    await savePoints();
    scheduleLeaderboardUpdate();
  } catch (err) {
    console.error('Error updating points/leaderboard:', err);
  }

  const teacher = classTeachers[classKey];
  const embed = new EmbedBuilder()
    .setColor(classData[classKey].color)
    .setTitle(`${classData[classKey].icon} ${classData[classKey].name}`)
    .setDescription(
      `Gave **${amount} points** to <@${user.id}>'s slot ${slot}.\n` +
      `New total: **${newTotal} / ${MAX_POINTS}**\n\n` +
      `*${teacher.flavor}*`
    )
    .setThumbnail(teacher.portrait)
    .setFooter({ text: `From your mentor, ${teacher.name}` })
    .setTimestamp();

  // Send announcement to announcements channel
  try {
    const announcementChannel = message.guild.channels.cache.get(ANNOUNCEMENTS_CHANNEL_ID);
    if (announcementChannel && amount >= 5) { // Only announce for 5+ points
      const announceEmbed = new EmbedBuilder()
        .setColor(0x27ae60) // Green for positive
        .setTitle('🌟 Points Awarded!')
        .setDescription(
          `<@${user.id}> has been awarded **${amount} ${classData[classKey].name}** points!\n\n` +
          `*"Excellence recognized and rewarded."*\n\n` +
          `— Awarded by ${teacher.name}`
        )
        .addFields(
          { name: '📚 Subject', value: classData[classKey].name, inline: true },
          { name: '🎯 Amount', value: `+${amount}`, inline: true },
          { name: '🏆 New Total', value: `${newTotal}/${MAX_POINTS}`, inline: true },
          { name: '📋 Slot', value: slot, inline: true }
        )
        .setThumbnail(teacher.portrait)
        .setTimestamp();

      await announcementChannel.send({ 
        content: `🎉 <@${user.id}> congratulations!`,
        embeds: [announceEmbed] 
      });
    }
  } catch (error) {
    console.error('Error sending givepoints announcement:', error);
  }

  return message.channel.send({ embeds: [embed] });
}

async function handleTakePoints(message, parts) {
  if (!hasPermission(message.member)) {
    return message.reply("🚫 You don't have permission to take points.");
  }

  const user = message.mentions.users.first();
  const slot = parts[1];
  const classKey = parts[2]?.toLowerCase();
  const amount = parseInt(parts[3], 10);

  if (!user || !isValidSlot(slot) || !isValidClass(classKey) || isNaN(amount)) {
    return message.channel.send("ℹ️ Usage: `!takepoints @user <slot 1-3> <class> <amount>`");
  }

  const key = `${user.id}_slot${slot}`;
  points[key] = points[key] || {};
  const oldTotal = points[key][classKey] || 0;
  points[key][classKey] = Math.max((points[key][classKey] || 0) - amount, 0);
  const newTotal = points[key][classKey];

  try {
    await savePoints();
    scheduleLeaderboardUpdate();
  } catch (err) {
    console.error('Error updating points/leaderboard:', err);
  }

  const teacher = classTeachers[classKey];
  const embed = new EmbedBuilder()
    .setColor(classData[classKey].color)
    .setTitle(`${classData[classKey].icon} ${classData[classKey].name}`)
    .setDescription(
      `Removed **${amount} points** from <@${user.id}>'s slot ${slot}.\n` +
      `New total: **${newTotal} / ${MAX_POINTS}**\n\n` +
      `*${teacherMessages[classKey].scold}*`
    )
    .setThumbnail(teacher.portrait)
    .setTimestamp();

  // Send announcement to announcements channel
  try {
    const announcementChannel = message.guild.channels.cache.get(ANNOUNCEMENTS_CHANNEL_ID);
    if (announcementChannel && amount >= 3) { // Announce takeaways of 3+ points
      const announceEmbed = new EmbedBuilder()
        .setColor(0xe74c3c) // Red for negative
        .setTitle('⚠️ Points Deducted')
        .setDescription(
          `<@${user.id}> has had **${amount} ${classData[classKey].name}** points deducted.\n\n` +
          `*"Actions have consequences in the halls of learning."*\n\n` +
          `— Deducted by ${teacher.name}`
        )
        .addFields(
          { name: '📚 Subject', value: classData[classKey].name, inline: true },
          { name: '🎯 Amount', value: `-${amount}`, inline: true },
          { name: '🏆 Remaining', value: `${newTotal}/${MAX_POINTS}`, inline: true },
          { name: '📋 Slot', value: slot, inline: true }
        )
        .setThumbnail(teacher.portrait)
        .setTimestamp();

      await announcementChannel.send({ 
        content: `⚠️ <@${user.id}> - points deducted`,
        embeds: [announceEmbed] 
      });
    }
  } catch (error) {
    console.error('Error sending takepoints announcement:', error);
  }

  return message.channel.send({ embeds: [embed] });
}
  
  async function handleRenameSlot(message, parts) {
    const slot = parts[0];
    const newName = parts.slice(1).join(' ');

    if (!isValidSlot(slot) || !newName) {
      return message.channel.send("ℹ️ Usage: `!renameslot <slot 1-3> <new name>`");
    }

    const key = `${message.author.id}_slotname${slot}`;
    slotNames[key] = newName;

    try {
      await saveSlotNames();
    } catch (err) {
      console.error('Error saving slot name:', err);
      return message.channel.send("❌ Failed to save slot name. Try again.");
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('✏️ Slot Renamed')
      .setDescription(`Slot ${slot} is now called **${newName}**.`)
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

// Optional: Add a configuration object for easier customization
const ANNOUNCEMENT_CONFIG = {
  channelId: 'YOUR_ANNOUNCEMENTS_CHANNEL_ID_HERE',
  minGiveAmount: 5,    // Minimum points to announce when giving
  minTakeAmount: 3,    // Minimum points to announce when taking
  enabled: true
    };

async function handleProgress(message, parts) {
  let targetUser = message.author;
  let slot;

  if (message.mentions.users.size > 0) {
    targetUser = message.mentions.users.first();
    slot = parts[1];
  } else {
    slot = parts[0];
  }

  if (!isValidSlot(slot)) {
    return message.channel.send("ℹ️ Usage: `!progress [@user] <slot 1-3>`");
  }

  const key = `${targetUser.id}_slot${slot}`;
  const profile = points[key] || {};

  const hasAnyPoints = Object.values(profile).some((v) => v > 0);
  if (!hasAnyPoints) {
    return message.channel.send(`${targetUser.username} has no points recorded in slot ${slot}.`);
  }

  const slotDisplayName = getSlotDisplayName(targetUser.id, slot);
  const embed = new EmbedBuilder()
    .setColor(0x7d3c98)
    .setTitle(`📘 ${targetUser.username} — ${slotDisplayName} Progress`)
    .setDescription('⚗️ These scores are inked by glowing hand and whispered ink…\n')
    .setFooter({ text: 'Grimoire sealed upon reading 📌' })
    .setTimestamp();

  for (const classKey in classData) {
    const { icon, name } = classData[classKey];
    const value = profile[classKey] || 0;
    embed.addFields({
      name: `${icon} ${name}`,
      value: `**${value} / ${MAX_POINTS}**`,
      inline: true
    });
  }

  return message.channel.send({ embeds: [embed] });
}

  async function handleRemoveUser(message, parts) {
    if (!hasPermission(message.member)) {
      return message.reply("🚫 You don't have permission to remove users from the leaderboard.");
    }

    const user = message.mentions.users.first();
    if (!user) {
      return message.channel.send("ℹ️ Usage: `!removeuser @user`");
    }

    let removedEntries = 0;
    let totalPointsRemoved = 0;
    const removedSlots = [];

    // Debug: Log what we're looking for and what exists
    console.log(`Looking for entries for user ID: ${user.id}`);
    console.log(`Available keys in points:`, Object.keys(points));

    // Find and remove all entries for this user across all slots and classes
    const keysToDelete = [];

    for (const key in points) {
      console.log(`Checking key: ${key}, starts with ${user.id}_slot? ${key.startsWith(`${user.id}_slot`)}`);

      if (key.startsWith(`${user.id}_slot`)) {
        const slotNumber = key.split('_slot')[1];
        const profile = points[key];
        let slotTotal = 0;

        console.log(`Found matching key: ${key}, profile:`, profile);

        // Calculate total points being removed from this slot
        for (const classKey in profile) {
          slotTotal += profile[classKey];
          totalPointsRemoved += profile[classKey];
        }

        if (slotTotal > 0) {
          removedSlots.push({ slot: slotNumber, points: slotTotal });
        }

        keysToDelete.push(key);
        removedEntries++;
      }
    }

    console.log(`Keys to delete:`, keysToDelete);
    console.log(`Total entries found: ${removedEntries}`);

    if (keysToDelete.length === 0) {
      return message.channel.send(`ℹ️ ${user.tag} has no entries in the leaderboard to remove.`);
    }

    // Delete the entries
    keysToDelete.forEach(key => {
      delete points[key];
    });

    // Save the updated points data
    try {
      if (typeof savePoints === 'function') {
        await savePoints();
      } else {
        // Fallback if savePoints function doesn't exist
        const fs = require('fs').promises;
        await fs.writeFile('points.json', JSON.stringify(points, null, 2)); // Adjust filename as needed
      }
    } catch (err) {
      console.error('Error saving points file after removal:', err);
      return message.channel.send('❌ Failed to save changes. Please try again.');
    }

    // Check if the removed user was first place and handle accordingly
    let wasFirstPlace = false;
    try {
      const fsSync = require('fs');
      const FIRST_PLACE_FILE = 'first_place.json'; // Adjust path as needed

      if (fsSync.existsSync(FIRST_PLACE_FILE)) {
        const data = JSON.parse(fsSync.readFileSync(FIRST_PLACE_FILE, 'utf8'));
        if (data.firstPlaceId === user.id) {
          wasFirstPlace = true;
          // Clear the first place file since we need to recalculate
          fsSync.unlinkSync(FIRST_PLACE_FILE);
        }
      }
    } catch (err) {
      console.error('Error checking/updating first place file:', err);
    }

    // Schedule leaderboard update to reflect changes
    scheduleLeaderboardUpdate();

    // Build response embed
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🗑️ User Removed from House Ledger')
      .setDescription(`**${user.tag}** has been completely removed from the House Ledger.`)
      .addFields({
        name: '📊 Removal Summary',
        value: `• **${removedEntries}** character slots cleared\n• **${totalPointsRemoved}** total points removed${wasFirstPlace ? '\n• Was previously **first place** 👑' : ''}`,
        inline: false
      })
      .setTimestamp()
      .setFooter({ text: `Removed by ${message.author.tag}` });

    // Add details about each slot if there were any
    if (removedSlots.length > 0) {
      const slotDetails = removedSlots
        .map(slot => `Slot ${slot.slot}: ${slot.points} points`)
        .join('\n');

      embed.addFields({
        name: '🎭 Slots Affected',
        value: slotDetails,
        inline: false
      });
    }

    // Send announcement to announcements channel
    try {
      const ANNOUNCEMENTS_CHANNEL_ID = 'YOUR_ANNOUNCEMENTS_CHANNEL_ID'; // Replace with your actual channel ID
      const announcementChannel = message.guild.channels.cache.get(ANNOUNCEMENTS_CHANNEL_ID);
      if (announcementChannel && totalPointsRemoved > 0) {
        const announceEmbed = new EmbedBuilder()
          .setColor(0x95a5a6) // Gray for neutral/administrative
          .setTitle('📋 Administrative Action')
          .setDescription(
            `**${user.tag}** has been removed from the House Ledger by administrative decision.\n\n` +
            `*"Sometimes the slate must be wiped clean for a fresh beginning."*\n\n` +
            `— Headmistress Delayna Morwyn ✨`
          )
          .addFields(
            { name: '🎭 Slots Cleared', value: removedEntries.toString(), inline: true },
            { name: '📊 Points Removed', value: totalPointsRemoved.toString(), inline: true },
            { name: '👤 Removed By', value: message.author.tag, inline: true }
          )
          .setTimestamp();

        await announcementChannel.send({ embeds: [announceEmbed] });
      }
    } catch (error) {
      console.error('Error sending removal announcement:', error);
      // Don't fail the whole command if announcement fails
    }

    return message.channel.send({ embeds: [embed] });
  }
  async function handleDiagnostic(message, parts) {
    if (!hasPermission(message.member)) {
      return message.reply("🚫 You don't have permission to use diagnostic commands.");
    }

    const user = message.mentions.users.first();
    if (!user) {
      return message.channel.send("ℹ️ Usage: `!diagnostic @user`");
    }

    console.log('=== DIAGNOSTIC INFO ===');
    console.log(`Looking for user: ${user.tag} (ID: ${user.id})`);
    console.log('All points keys:', Object.keys(points));

    // Check for any keys containing this user ID
    const userKeys = Object.keys(points).filter(key => key.includes(user.id));
    console.log(`Keys containing user ID ${user.id}:`, userKeys);

    // Show the actual data for this user
    userKeys.forEach(key => {
      console.log(`Key: ${key}`);
      console.log(`Data:`, points[key]);
    });

    // Show first few entries in points for comparison
    console.log('First 5 entries in points object:');
    Object.entries(points).slice(0, 5).forEach(([key, value]) => {
      console.log(`  ${key}:`, value);
    });

    message.channel.send(`🔍 Diagnostic complete! Check console for details about ${user.tag}'s data.`);
  }
  
async function handleLeaderboard(message, parts) {
  const classKey = parts[0]?.toLowerCase();
  if (!isValidClass(classKey)) {
    return message.channel.send("ℹ️ Invalid class. Use `!classinfo <class>` for valid options.");
  }

  const entries = Object.entries(points)
    .map(([compositeKey, record]) => {
      return { compositeKey, value: record[classKey] || 0 };
    })
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setColor(classData[classKey].color)
    .setTitle(`🏆 Leaderboard — ${classData[classKey].name}`)
    .setTimestamp();

  for (const entry of entries) {
    const [userId, slotLabel] = entry.compositeKey.split('_slot');
    let userTag = `Unknown User (Slot ${slotLabel})`;
    try {
      const fetched = await client.users.fetch(userId);
      userTag = `${fetched.username} (Slot ${slotLabel})`;
    } catch (err) {
      console.error('Error fetching user for leaderboard:', err);
    }
    embed.addFields({ name: userTag, value: `**${entry.value} pts**`, inline: false });
  }

  return message.channel.send({ embeds: [embed] });
}

async function handleClassInfo(message, parts) {
  const classKey = parts[0]?.toLowerCase();
  if (!isValidClass(classKey)) {
    return message.channel.send(
      "ℹ️ Invalid class. Options: " + Object.keys(classData).join(', ')
    );
  }

  const embed = new EmbedBuilder()
    .setColor(classData[classKey].color)
    .setTitle(`${classData[classKey].icon} ${classData[classKey].name}`)
    .setDescription(classDescriptions[classKey])
    .setTimestamp();

  return message.channel.send({ embeds: [embed] });
}

async function handleMyStats(message) {
  const targetUser = message.mentions.users.first() || message.author;
  const userSlotNames = {};

  // Get slot names for this user
  for (let i = 1; i <= 3; i++) {
    const key = `${targetUser.id}_slotname${i}`;
    userSlotNames[i] = slotNames[key] || `Character ${i}`;
  }

  const options = [1, 2, 3].map(slotNum => ({
    label: `Slot ${slotNum} — ${userSlotNames[slotNum]}`,
    value: slotNum.toString(),
    emoji: slotNum === 1 ? '🔮' : slotNum === 2 ? '📚' : '🌙'
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`select_slot_${targetUser.id}`)
      .setPlaceholder('📜 Choose a character to reveal their magical record…')
      .addOptions(options)
  );

  const embed = new EmbedBuilder()
    .setColor(0xb49fcc)
    .setTitle('📖 ━━ Grimoire of Achievements ━━')
    .setDescription(
      `✨ Within this living book are the records of ${targetUser.username}'s enchanted studies.\n\n` +
      `📂 Use the dropdown below to unveil their progress.`
    )
    .setFooter({ 
      text: 'Inscribed by the Academy\'s Recordkeeper ✎', 
      iconURL: 'https://cdn.discordapp.com/attachments/1116595332244054079/1380309908678901933/100d0d9e119c8ae848aedaa556e7111e.jpg?ex=68436947&is=684217c7&hm=a505815c04b223cadc022a93cbee9319d36ad298da8a03561b3b94a0d43ece88&' 
    })
    .setTimestamp();

  return message.channel.send({ embeds: [embed], components: [row] });
}

// ---------- Event Handlers ----------
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content || !message.content.startsWith(BOT_PREFIX)) {
      return;
    }
    console.log(`Received message from ${message.author.tag}: ${message.content}`);
    const parts = message.content.slice(BOT_PREFIX.length).trim().split(/\s+/);
    const command = parts.shift().toLowerCase();
  
    try {
      switch (command) {
        case 'help':
          await handleHelp(message);
          break;
        case 'givepoints':
          await handleGivePoints(message, parts);
          break;
        case 'takepoints':
          await handleTakePoints(message, parts);
          break;
        case 'removeuser':
          await handleRemoveUser(message, parts);
          break;
        case 'renameslot':
          await handleRenameSlot(message, parts);
          break;
        case 'progress':
          await handleProgress(message, parts);
          break;
        case 'leaderboard':
          await handleLeaderboard(message, parts);
          break;
        case 'classinfo':
          await handleClassInfo(message, parts);
          break;
        case 'mystats':
          await handleMyStats(message);
          break;
          case 'diagnostic':
          await handleDiagnostic(message, parts);
          break;
        default:
          // Unknown command - do nothing
          break;
         
      }
    } catch (error) {
      console.error(`Error handling command ${command}:`, error);
      message.channel.send('⚠️ An error occurred while processing your command. Please try again.');
    }
  });

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('select_slot_')) {
    return;
  }

  const selectedUserId = interaction.customId.split('_').pop();

  // Only allow the target user to interact with their own dropdown
  if (interaction.user.id !== selectedUserId) {
    return interaction.reply({ content: "🕯️ Only you may open your own record.", ephemeral: true });
  }

  const slot = interaction.values[0]; // '1', '2', or '3'
const key = `${selectedUserId}_slot${slot}`;
const profile = points[key] || {};
const slotNameKey = `${selectedUserId}_slotname${slot}`;
const slotName = slotNames[slotNameKey] || `Slot ${slot}`;

// Check if user has any points recorded for this slot
const hasAnyPoints = Object.values(profile).some(v => v > 0);

if (!profile || !hasAnyPoints) {
  const noRecordEmbed = new EmbedBuilder()
    .setColor(0x7f8c8d)
    .setTitle('📕 Nothing Yet…')
    .setDescription(`Slot ${slot} holds no known record.\n\n✨ Perhaps it is waiting to be written.`)
    .setTimestamp();

  return interaction.update({
    embeds: [noRecordEmbed],
    components: []
  });
}

// Build the progress embed for the selected slot
const embed = new EmbedBuilder()
  .setColor(0x7d3c98)
  .setTitle(`📘 ${interaction.user.username} — ${slotName} Progress`)
  .setDescription('⚗️ These scores are inked by glowing hand and whispered ink…\n')
  .setFooter({ text: 'Grimoire sealed upon reading 📌' })
  .setTimestamp();

// Add fields for each class with their progress
for (const classKey in classData) {
  const { icon, name } = classData[classKey];
  const value = profile[classKey] || 0;

  embed.addFields({
    name: `${icon} ${name}`,
    value: `**${value} / ${MAX_POINTS}**`,
    inline: true
  });
}

return interaction.update({
  embeds: [embed],
  components: []
  });

  });
// ────────────────────────────────────────────────────────────
// Bot Login & Graceful Shutdown
// ────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);

// Replace your current error handling with this:
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise);
  console.log('Reason:', reason);

  // Don't crash on Discord connection errors
  if (reason?.message?.includes('Unexpected server response')) {
    console.log('Discord connection error - bot will attempt to reconnect automatically');
    return;
  }
});