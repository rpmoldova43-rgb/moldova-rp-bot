process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

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
  ARMATA: 'Armată'
};

const DEPT_COLOR = {
  POLITIE: 0x2f80ed,
  MEDIC: 0x27ae60,
  ARMATA: 0xeb5757
};

const DEPT_ROLE = {
  POLITIE: process.env.POLICE_ROLE_ID,
  MEDIC: process.env.MEDIC_ROLE_ID,
  ARMATA: process.env.ARMY_ROLE_ID
};

/* ================= PERMISSION CHECK ================= */

function isDecisionAllowed(member) {
  return (
    member.roles.cache.has(process.env.STAFF_ROLE_ID) ||
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
  // nu te baza pe cache (guild.members.me poate fi null)
  return guild.members.me ?? (await guild.members.fetchMe());
}

async function createPrivateApplicationChannel(guild, deptKey, member) {
  const categoryId = process.env.APPLICATIONS_CATEGORY_ID;
  if (!categoryId) throw new Error('Lipsește APPLICATIONS_CATEGORY_ID în .env');

  // validează categoria
  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (!category) throw new Error(`APPLICATIONS_CATEGORY_ID invalid / categoria nu există: ${categoryId}`);

  const me = await getMe(guild);
  const factionRoleId = DEPT_ROLE[deptKey];

  const channelName = slugify(`aplicatie-${deptKey}-${member.user.username}`);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId,
    // topic simplu pentru debug
    topic: `Aplicație ${deptKey} | user:${member.id}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },

      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
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
        id: process.env.STAFF_ROLE_ID,
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
/* ================= AUTO DELETE 30H ================= */

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
    POLITIE: process.env.POLICE_LOG_CHANNEL_ID,
    MEDIC: process.env.MEDIC_LOG_CHANNEL_ID,
    ARMATA: process.env.ARMY_LOG_CHANNEL_ID
  };

  const logCh = await guild.channels.fetch(logChannelMap[deptKey]).catch(() => null);
  if (!logCh) throw new Error(`Log channel missing pentru ${deptKey}. Verifică *_LOG_CHANNEL_ID în .env`);

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

  // 🔔 TAG automat la rolul facțiunii (Poliție / Medic / Armată)
  const roleIdToPing = DEPT_ROLE[deptKey];

  if (roleIdToPing) {
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
      if (['apply_police', 'apply_medic', 'apply_army'].includes(interaction.customId)) {
        const map = {
          apply_police: 'POLITIE',
          apply_medic: 'MEDIC',
          apply_army: 'ARMATA'
        };

        const deptKey = map[interaction.customId];

        const modal = new ModalBuilder()
          .setCustomId(`apply_${deptKey}`)
          .setTitle(`Aplicație – ${DEPT_NAME[deptKey]}`);

        modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name_age')
            .setLabel('Nume RP + Vârstă')
            .setPlaceholder('Ex: Andrei Popescu - 24 ani')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('experience')
            .setLabel('Experiență RP')
            .setPlaceholder('Ex: 2 ani experiență pe servere RP, fost agent de poliție...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('schedule')
            .setLabel('Program')
            .setPlaceholder('Ex: Luni-Vineri 18:00-23:00')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('why')
            .setLabel('Motivație')
            .setPlaceholder('Ex: Doresc să contribui la menținerea ordinii pe server...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('contact')
            .setLabel('Număr telefon')
            .setPlaceholder('Ex: 079123456')
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

        // update embed in log
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(DEPT_COLOR[deptKey]);

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

        Felicitări! 🎉 În curând vei fi contactat **IC** pentru următorii pași ai procesului de recrutare.  
        Te rugăm să fii disponibil și atent la mesajele primite.

        ⏳ Dacă în termen de **24 de ore** nu ești contactat IC, te rugăm să revii cu o nouă aplicație.

        Îți urăm mult succes în continuare! 🚔`
          : `❌ **Aplicația ta la ${DEPT_NAME[deptKey]} a fost RESPINSĂ.**

        Momentan cererea ta nu a fost aprobată.  
        Te încurajăm să îți îmbunătățești aplicația și să revii cu o nouă cerere în viitor.

        Mult succes! 🍀`;

        // ✅ ia canalul privat din footer
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

        // DM (opțional)
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) await user.send(decisionText).catch(() => {});

        return interaction.editReply({ content: '✅ Decizie aplicată.' });
      }
    }

    /* ================= MODAL SUBMIT ================= */

    if (interaction.isModalSubmit() && interaction.customId.startsWith('apply_')) {
      await interaction.deferReply({ ephemeral: true }); // important: evită timeout

      const deptKey = interaction.customId.replace('apply_', '');

      const data = {
        nameAge: interaction.fields.getTextInputValue('name_age'),
        experience: interaction.fields.getTextInputValue('experience'),
        schedule: interaction.fields.getTextInputValue('schedule'),
        why: interaction.fields.getTextInputValue('why'),
        contact: interaction.fields.getTextInputValue('contact')
      };

    // 🔒 validare număr telefon (7–10 cifre)
    if (!/^[0-9]{7,7}$/.test(data.contact)) {
      return interaction.editReply({
        content: '❌ Numărul de telefon trebuie să conțină doar cifre și să fie format doar din 7 caractere.',
      });
    }

      // 1) creează canal privat
      const privateChannel = await createPrivateApplicationChannel(guild, deptKey, interaction.member);
      scheduleAutoDelete(privateChannel);
      // 2) trimite mesaj în canalul privat
      await privateChannel.send(
        `📄 Salut <@${interaction.user.id}>!\n` +
        `Aplicația ta la **${DEPT_NAME[deptKey]}** a fost trimisă.\n\n` +
        `📌 Vei primi un răspuns aici dacă cererea ta va fi acceptată sau respinsă. Fii pe fază! 🔔`
      );

      // 3) trimite aplicația în log (cu ID canal privat)
      await sendApplicationToLog(guild, deptKey, interaction.user, data, privateChannel.id);

      // 4) confirmare către user
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
        .setThumbnail(process.env.BRAND_THUMB)
        .setImage(process.env.BRAND_IMAGE);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('apply_police').setLabel('Aplicație Poliție').setEmoji('🚔').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('apply_medic').setLabel('Aplicație Medic').setEmoji('🏥').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('apply_army').setLabel('Aplicație Armată').setEmoji('🪖').setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

  } catch (err) {
    console.error('interactionCreate error:', err);

    const msg =
      `⚠️ Eroare: ${err?.message || 'necunoscut'}\n` +
      `Verifică: APPLICATIONS_CATEGORY_ID + permisiuni bot în categoria aplicațiilor (Manage Channels).`;

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    } else if (interaction.isRepliable()) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
