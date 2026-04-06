// ====================== STABILITY ======================
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

/* ================= ENV ================= */

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

/* ================= PERMISSION ================= */

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

  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (!category) throw new Error(`Categoria nu există: ${categoryId}`);

  const me = await getMe(guild);

  const factionRoleIdRaw = String(DEPT_ROLE[deptKey] ?? '').trim();
  const factionRoleId = factionRoleIdRaw ? mustSnowflake(`${deptKey}_ROLE_ID`, factionRoleIdRaw) : null;

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
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },

      ...(factionRoleId ? [{
        id: factionRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ],
      }] : []),

      {
        id: staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ],
      },

      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels
        ],
      }
    ],
  });

  return channel;
}

/* ================= AUTO DELETE ================= */

const AUTO_DELETE_MS = 24 * 60 * 60 * 1000;

function scheduleAutoDelete(channel) {
  setTimeout(async () => {
    const live = await channel.guild.channels.fetch(channel.id).catch(() => null);
    if (live) await live.delete().catch(() => {});
  }, AUTO_DELETE_MS);
}

/* ================= LOG ================= */

async function sendApplicationToLog(guild, deptKey, applicantUser, data, privateChannelId) {
  const logChannelMap = {
    POLITIE: process.env.POLICE_LOG_CHANNEL_ID,
    MEDIC: process.env.MEDIC_LOG_CHANNEL_ID,
    PRIMARIE: process.env.PRIMARIE_LOG_CHANNEL_ID
  };

  const logCh = await guild.channels.fetch(logChannelMap[deptKey]).catch(() => null);
  if (!logCh) throw new Error(`Log channel lipsă pentru ${deptKey}`);

  const embed = new EmbedBuilder()
    .setTitle(`📄 Aplicație – ${DEPT_NAME[deptKey]}`)
    .setColor(DEPT_COLOR[deptKey])
    .addFields(
      { name: 'Status', value: '🕒 În proces' },
      { name: 'Aplicant', value: `<@${applicantUser.id}>` },
      { name: 'Nume', value: data.nameAge },
      { name: 'Experiență', value: data.experience },
      { name: 'Program', value: data.schedule },
      { name: 'Motivație', value: data.why },
      { name: 'Telefon', value: data.contact }
    )
    .setFooter({ text: `privateChannelId:${privateChannelId}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app_accept:${deptKey}:${applicantUser.id}`).setLabel('Acceptă').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`app_reject:${deptKey}:${applicantUser.id}`).setLabel('Respinge').setStyle(ButtonStyle.Danger)
  );

  await logCh.send({ embeds: [embed], components: [row] });
}

/* ================= READY ================= */

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ================= INTERACTIONS ================= */

client.on('interactionCreate', async interaction => {
  try {
    const guild = interaction.guild;
    if (!guild) return;

    if (interaction.isButton()) {

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
            new TextInputBuilder().setCustomId('name_age').setLabel('Nume + Vârstă').setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('experience').setLabel('Experiență').setStyle(TextInputStyle.Paragraph)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('schedule').setLabel('Program').setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('why').setLabel('Motivație').setStyle(TextInputStyle.Paragraph)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('contact').setLabel('Telefon (7 cifre)').setStyle(TextInputStyle.Short)
          )
        );

        return interaction.showModal(modal);
      }
    }

    if (interaction.isModalSubmit()) {
      await interaction.deferReply({ ephemeral: true });

      const deptKey = interaction.customId.replace('apply_', '');

      const data = {
        nameAge: interaction.fields.getTextInputValue('name_age'),
        experience: interaction.fields.getTextInputValue('experience'),
        schedule: interaction.fields.getTextInputValue('schedule'),
        why: interaction.fields.getTextInputValue('why'),
        contact: interaction.fields.getTextInputValue('contact')
      };

      if (!/^[0-9]{7}$/.test(data.contact)) {
        return interaction.editReply({ content: 'Telefon invalid (7 cifre).' });
      }

      const ch = await createPrivateApplicationChannel(guild, deptKey, interaction.member);
      scheduleAutoDelete(ch);

      await sendApplicationToLog(guild, deptKey, interaction.user, data, ch.id);

      return interaction.editReply({ content: `Canal creat: ${ch}` });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'linkuri') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('apply_police').setLabel('Poliție').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('apply_medic').setLabel('Medic').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('apply_primarie').setLabel('Primărie').setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ content: 'Aplică:', components: [row] });
    }

  } catch (err) {
    console.error(err);
  }
});

/* ================= LOGIN ================= */

client.login(process.env.DISCORD_TOKEN);
