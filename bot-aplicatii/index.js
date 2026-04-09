// ====================== STABILITY (NU MAI OMORÎ BOTUL) ======================
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));
process.on('uncaughtException', (err) => console.error('uncaughtException:', err));

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits
} from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

/* ================= MAPS ================= */

const DEPT_NAME = {
  POLITIE: 'Poliție',
  MEDIC: 'Medic',
  PRIMARIE: 'Primărie'
};

const DEPT_COLOR = {
  POLITIE: 0x2f80ed,
  MEDIC: 0x27ae60,
  PRIMARIE: 0xf2c94c
};

/* ================= ENV (TRIM) + VALIDARE ================= */

const STAFF_ROLE_ID = String(process.env.STAFF_ROLE_ID ?? '').trim();
const APPLICATIONS_CATEGORY_ID = String(process.env.APPLICATIONS_CATEGORY_ID ?? '').trim();

const DEPT_ROLE = {
  POLITIE: String(process.env.POLICE_ROLE_ID ?? '').trim(),
  MEDIC: String(process.env.MEDIC_ROLE_ID ?? '').trim(),
  PRIMARIE: String(process.env.PRIMARIE_ROLE_ID ?? '').trim()
};

function mustSnowflake(name, value) {
  const v = String(value ?? '').trim();
  if (!/^\d{17,20}$/.test(v)) throw new Error(`${name} invalid: "${value}"`);
  return v;
}

/* ================= PERMISSION CHECK ================= */

function isDecisionAllowed(member) {
  return (
    (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID)) ||
    member.permissions.has(PermissionsBitField.Flags.Administrator)
  );
}

/* ================= HELPERS ================= */

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 90);
}

async function getMe(guild) {
  return guild.members.me ?? (await guild.members.fetchMe());
}

async function createPrivateApplicationChannel(guild, deptKey, member) {
  const categoryId = mustSnowflake('APPLICATIONS_CATEGORY_ID', APPLICATIONS_CATEGORY_ID);
  const staffRoleId = mustSnowflake('STAFF_ROLE_ID', STAFF_ROLE_ID);

  // validează categoria
  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (!category) throw new Error(`APPLICATIONS_CATEGORY_ID invalid / categoria nu există: ${categoryId}`);

  const me = await getMe(guild);

  const factionRoleIdRaw = String(DEPT_ROLE[deptKey] ?? '').trim();
  const factionRoleId = factionRoleIdRaw ? mustSnowflake(`${deptKey}_ROLE_ID`, factionRoleIdRaw) : null;

  // verifică dacă rolurile chiar există în server
  if (!guild.roles.cache.has(staffRoleId)) {
    throw new Error(`STAFF_ROLE_ID nu există în server: ${staffRoleId}`);
  }
  if (factionRoleId && !guild.roles.cache.has(factionRoleId)) {
    throw new Error(`${deptKey}_ROLE_ID nu există în server: ${factionRoleId}`);
  }

  const channelName = slugify(`aplicatie-${deptKey}-${member.user.username}`);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: `Aplicație ${deptKey} | user:${member.id}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },

      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory
        ],
        deny: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ],
      },

      ...(factionRoleId
        ? [{
            id: factionRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageMessages
            ],
          }]
        : []),

      {
        id: staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ],
      },

      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages
        ],
      }
    ],
  });

  return channel;
}

/* ================= AUTO DELETE 24H ================= */

const AUTO_DELETE_HOURS = 24;
const AUTO_DELETE_MS = AUTO_DELETE_HOURS * 60 * 60 * 1000;

function scheduleAutoDelete(channel) {
  setTimeout(async () => {
    const guild = channel.guild;
    const live = await guild.channels.fetch(channel.id).catch(() => null);
    if (live) {
      await live.delete(`Auto delete after ${AUTO_DELETE_HOURS} hours`).catch(() => {});
    }
  }, AUTO_DELETE_MS);
}

/* ================= SEND APPLICATION ================= */

async function sendApplicationToLog(guild, deptKey, applicantUser, data, privateChannelId) {
  const logChannelMap = {
    POLITIE: String(process.env.POLICE_LOG_CHANNEL_ID ?? '').trim(),
    MEDIC: String(process.env.MEDIC_LOG_CHANNEL_ID ?? '').trim(),
    PRIMARIE: String(process.env.PRIMARIE_LOG_CHANNEL_ID ?? '').trim()
  };

  const logChannelId = mustSnowflake(`${deptKey}_LOG_CHANNEL_ID`, logChannelMap[deptKey]);
  const logCh = await guild.channels.fetch(logChannelId).catch(() => null);
  if (!logCh) throw new Error(`Log channel missing pentru ${deptKey}. Verifică *_LOG_CHANNEL_ID în .env`);
  if (!logCh.isTextBased()) throw new Error(`Log channel pentru ${deptKey} nu este text channel.`);

  const embed = new EmbedBuilder()
    .setTitle(`📄 Aplicație – ${DEPT_NAME[deptKey]}`)
    .setColor(DEPT_COLOR[deptKey])
    .addFields(
      { name: 'Status', value: '🕒 **În proces**' },
      { name: 'Aplicant', value: `<@${applicantUser.id}> (\`${applicantUser.id}\`)` },
      { name: 'Nume RP + Vârstă', value: data.nameAge },
      { name: 'Experiență RP', value: data.experience },
      { name: 'Program', value: data.schedule },
      { name: 'Motivație', value: data.why },
      { name: 'Număr telefon', value: data.contact }
    )
    .setFooter({ text: `privateChannelId:${privateChannelId}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_accept:${deptKey}:${applicantUser.id}`)
      .setLabel('Acceptă')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`app_reject:${deptKey}:${applicantUser.id}`)
      .setLabel('Respinge')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );

  // 🔔 TAG automat la rolul facțiunii (doar dacă e valid și există)
  const roleIdToPingRaw = String(DEPT_ROLE[deptKey] ?? '').trim();
  const roleIdToPing = roleIdToPingRaw && /^\d{17,20}$/.test(roleIdToPingRaw) ? roleIdToPingRaw : null;

  if (roleIdToPing && guild.roles.cache.has(roleIdToPing)) {
    await logCh.send({
      content: `📢 <@&${roleIdToPing}> Ai o aplicație nouă la **${DEPT_NAME[deptKey]}**!`,
      allowedMentions: { roles: [roleIdToPing] }
    }).catch(() => {});
  }

  await logCh.send({ embeds: [embed], components: [row] });
}

/* ================= READY ================= */

client.once('clientReady', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

/* ================= INTERACTIONS ================= */

client.on('interactionCreate', async interaction => {
  try {
    const guild = interaction.guild;
    if (!guild) return;

    /* ================= BUTTONS ================= */

    if (interaction.isButton()) {

      // ===== APPLY BUTTONS =====
      if (['apply_police', 'apply_medic', 'apply_primarie'].includes(interaction.customId)) {
        const map = {
          apply_police: 'POLITIE',
          apply_medic: 'MEDIC',
          apply_primarie: 'PRIMARIE'
        };

        const deptKey = map[interaction.customId];

        const modal = new ModalBuilder()
          .setCustomId(`apply_${deptKey}`)
          .setTitle(`Aplicație – ${DEPT_NAME[deptKey]}`);

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('name_age')
              .setLabel('Nume (IC) + Vârstă (OOC)')
              .setPlaceholder('Ex: Andrei Popescu - 24 ani')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('experience')
              .setLabel('Experiență (IC)')
              .setPlaceholder('Ex: 2 ani experiență pe servere RP, fost agent de poliție...')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('schedule')
              .setLabel('Program (OOC)')
              .setPlaceholder('Ex: Luni-Vineri 18:00-23:00')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('why')
              .setLabel('Motivație (IC)')
              .setPlaceholder('Ex: Doresc să contribui la menținerea ordinii publice pe oras')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('contact')
              .setLabel('Număr telefon (IC) (7 cifre)')
              .setPlaceholder('Ex: 0791234')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      // ===== ACCEPT / REJECT =====
      if (interaction.customId.startsWith('app_accept') || interaction.customId.startsWith('app_reject')) {
        await interaction.deferReply({ ephemeral: true });

        if (!isDecisionAllowed(interaction.member))
          return interaction.editReply({ content: '⛔ Nu ai permisiune.' });

        const [action, deptKey, userId] = interaction.customId.split(':');
        const accepted = action === 'app_accept';

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(DEPT_COLOR[deptKey] ?? 0xffffff);

        embed.data.fields = (embed.data.fields || []).filter(f => f.name !== 'Status');
        embed.data.fields.unshift({
          name: 'Status',
          value: accepted ? '✅ **ACCEPTAT**' : '❌ **RESPINS**'
        });

        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('disabled_accept')
            .setLabel('Acceptă')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('disabled_reject')
            .setLabel('Respinge')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );

        await interaction.message.edit({ embeds: [embed], components: [disabledRow] });

        const decisionText = accepted
          ? `✅ **Aplicația ta la ${DEPT_NAME[deptKey]} a fost ACCEPTATĂ!**

Felicitări! 🎉 În curând vei fi contactat **IC** pentru următorii pași.
Te rugăm să fii disponibil și atent la mesajele primite.

⏳ Dacă în termen de **24 de ore** nu ești contactat IC, te rugăm să revii cu o nouă aplicație.

Mult succes!`
          : `❌ **Aplicația ta la ${DEPT_NAME[deptKey]} a fost RESPINSĂ.**

Momentan cererea ta nu a fost aprobată.
Te încurajăm să îți îmbunătățești aplicația și să revii cu o nouă cerere în viitor.

Mult succes! 🍀`;

        const footerText = interaction.message.embeds?.[0]?.footer?.text || '';
        const match = footerText.match(/privateChannelId:(\d{17,20})/);
        const privateChannelId = match?.[1];

        if (privateChannelId) {
          const appCh = await guild.channels.fetch(privateChannelId).catch(() => null);
          if (appCh && appCh.isTextBased()) {
            await appCh.send({
              content: `<@${userId}> ${decisionText}`,
              allowedMentions: { users: [userId] }
            }).catch(() => {});
          }
        }

        const user = await client.users.fetch(userId).catch(() => null);
        if (user) await user.send(decisionText).catch(() => {});

        return interaction.editReply({ content: '✅ Decizie aplicată.' });
      }
    }

    /* ================= MODAL SUBMIT ================= */

    if (interaction.isModalSubmit() && interaction.customId.startsWith('apply_')) {
      await interaction.deferReply({ ephemeral: true });

      const deptKey = interaction.customId.replace('apply_', '');

      const data = {
        nameAge: interaction.fields.getTextInputValue('name_age'),
        experience: interaction.fields.getTextInputValue('experience'),
        schedule: interaction.fields.getTextInputValue('schedule'),
        why: interaction.fields.getTextInputValue('why'),
        contact: interaction.fields.getTextInputValue('contact')
      };

      // 🔒 validare număr telefon (exact 7 cifre)
      if (!/^[0-9]{7}$/.test(String(data.contact ?? '').trim())) {
        return interaction.editReply({
          content: '❌ Numărul de telefon trebuie să conțină doar cifre și să fie format din exact 7 caractere.',
        });
      }

      const privateChannel = await createPrivateApplicationChannel(guild, deptKey, interaction.member);
      scheduleAutoDelete(privateChannel);

      await privateChannel.send(
        `📄 Salut <@${interaction.user.id}>!\n` +
        `Aplicația ta la **${DEPT_NAME[deptKey]}** a fost trimisă.\n\n` +
        `📌 Vei primi un răspuns aici dacă cererea ta va fi acceptată sau respinsă. Fii pe fază! 🔔`
      ).catch(() => {});

      await sendApplicationToLog(guild, deptKey, interaction.user, data, privateChannel.id);

      return interaction.editReply({
        content: `✅ Ți-am creat canal privat: ${privateChannel}`
      });
    }

    /* ================= /linkuri ================= */

    if (interaction.isChatInputCommand() && interaction.commandName === 'linkuri') {
      const embed = new EmbedBuilder()
        .setTitle('Moldova Roleplay')
        .setDescription(
          'Aplică direct la departamente folosind butoanele de mai jos.\n' +
          '📌 Completează corect toate câmpurile. Vei primi răspuns în privat.'
        )
        .setColor(0xff8c00)
        .setThumbnail(process.env.BRAND_THUMB ?? null)
        .setImage(process.env.BRAND_IMAGE ?? null);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('apply_police').setLabel('Aplicație Poliție').setEmoji('🚔').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('apply_medic').setLabel('Aplicație Medic').setEmoji('🏥').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('apply_primarie').setLabel('Aplicație Primărie').setEmoji('🏛️').setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

  } catch (err) {
    console.error('interactionCreate error:', err);

    const msg =
      `⚠️ Eroare: ${err?.message || 'necunoscut'}\n` +
      `Verifică: APPLICATIONS_CATEGORY_ID + rolurile/ID-urile + permisiuni bot (Manage Channels).`;

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    } else if (interaction.isRepliable()) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

/* ================= BOOT (CHECK ENV + LOGIN) ================= */

async function main() {
  const token = String(process.env.DISCORD_TOKEN ?? '').trim();

  console.log('ENV CHECK:', {
    hasToken: Boolean(token),
    tokenLen: token.length,
    hasCategory: Boolean(String(process.env.APPLICATIONS_CATEGORY_ID ?? '').trim()),
    hasStaffRole: Boolean(String(process.env.STAFF_ROLE_ID ?? '').trim()),
    hasPrimarieLog: Boolean(String(process.env.PRIMARIE_LOG_CHANNEL_ID ?? '').trim()),
  });

  if (!token) throw new Error('DISCORD_TOKEN lipsește în Railway Variables!');

  await client.login(token);
}

main().catch((e) => {
  console.error('BOOT ERROR:', e);
});
