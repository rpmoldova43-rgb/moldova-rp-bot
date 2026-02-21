process.on('unhandledRejection', (err) => {
  console.error(err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error(err);
  process.exit(1);
});

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

/* ===================== CONFIG ===================== */

const DEPT_NAME = {
  POLITIE: 'Poliție',
  MEDIC: 'Medic',
  ARMATA: 'Armată'
};

const DEPT_ROLE = {
  POLITIE: (process.env.POLICE_ROLE_ID || '').trim(),
  MEDIC: (process.env.MEDIC_ROLE_ID || '').trim(),
  ARMATA: (process.env.ARMY_ROLE_ID || '').trim()
};

const STAFF_ROLE_ID = (process.env.STAFF_ROLE_ID || '').trim();
const APPLICATIONS_CATEGORY_ID = (process.env.APPLICATIONS_CATEGORY_ID || '').trim();

/* ===================== VALIDARE ===================== */

function mustSnowflake(name, value) {
  const v = String(value ?? '').trim();
  if (!/^\d{17,20}$/.test(v)) {
    throw new Error(`${name} INVALID: "${value}"`);
  }
  return v;
}

/* ===================== PERMISSION CHECK ===================== */

function isDecisionAllowed(member) {
  return (
    member.roles.cache.has(STAFF_ROLE_ID) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

/* ===================== CREATE PRIVATE CHANNEL ===================== */

async function createPrivateApplicationChannel(guild, deptKey, member) {

  const categoryId = mustSnowflake('APPLICATIONS_CATEGORY_ID', APPLICATIONS_CATEGORY_ID);
  const staffRoleId = mustSnowflake('STAFF_ROLE_ID', STAFF_ROLE_ID);

  const factionRoleIdRaw = DEPT_ROLE[deptKey];
  const factionRoleId = factionRoleIdRaw
    ? mustSnowflake(`${deptKey}_ROLE_ID`, factionRoleIdRaw)
    : null;

  if (!guild.roles.cache.has(staffRoleId)) {
    throw new Error(`STAFF_ROLE_ID nu există în server`);
  }

  if (factionRoleId && !guild.roles.cache.has(factionRoleId)) {
    throw new Error(`${deptKey}_ROLE_ID nu există în server`);
  }

  const channel = await guild.channels.create({
    name: `aplicatie-${deptKey.toLowerCase()}-${member.user.username}`,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      ...(factionRoleId ? [{
        id: factionRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      }] : []),
      {
        id: staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      }
    ]
  });

  return channel;
}

/* ===================== READY ===================== */

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ===================== LOGIN ===================== */

client.login(process.env.DISCORD_TOKEN);
