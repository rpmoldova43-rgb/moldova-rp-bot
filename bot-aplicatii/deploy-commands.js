import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('linkuri')
    .setDescription('Afișează panoul oficial + aplicații'),

  new SlashCommandBuilder()
    .setName('mdt')
    .setDescription('Caută un cetățean în baza MDT')
    .addStringOption(o => o.setName('query').setDescription('Discord ID / nume / fragment').setRequired(true)),

  new SlashCommandBuilder()
    .setName('cazier')
    .setDescription('Gestionează cazierul')
    .addSubcommand(sc =>
      sc.setName('add')
        .setDescription('Adaugă o intrare în cazier')
        .addUserOption(o => o.setName('user').setDescription('Cetățean').setRequired(true))
        .addStringOption(o => o.setName('motiv').setDescription('Motiv / articol').setRequired(true))
        .addStringOption(o => o.setName('detalii').setDescription('Detalii').setRequired(false))
    )
    .addSubcommand(sc =>
      sc.setName('view')
        .setDescription('Vezi cazierul unui cetățean')
        .addUserOption(o => o.setName('user').setDescription('Cetățean').setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName('amenda')
    .setDescription('Amenzi')
    .addSubcommand(sc =>
      sc.setName('issue')
        .setDescription('Emite o amendă')
        .addUserOption(o => o.setName('user').setDescription('Cetățean').setRequired(true))
        .addIntegerOption(o => o.setName('suma').setDescription('Suma (MDL)').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('motiv').setDescription('Motiv / articol').setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName('mandat')
    .setDescription('Mandate')
    .addSubcommand(sc =>
      sc.setName('issue')
        .setDescription('Emite mandat')
        .addUserOption(o => o.setName('user').setDescription('Cetățean').setRequired(true))
        .addStringOption(o => o.setName('motiv').setDescription('Motiv / articol').setRequired(true))
        .addStringOption(o => o.setName('nivel').setDescription('Nivel').setRequired(true)
          .addChoices(
            { name: 'Low', value: 'LOW' },
            { name: 'Medium', value: 'MEDIUM' },
            { name: 'High', value: 'HIGH' }
          ))
    )
    .addSubcommand(sc =>
      sc.setName('close')
        .setDescription('Închide un mandat')
        .addIntegerOption(o => o.setName('id').setDescription('ID mandat').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('rezolutie').setDescription('Cum s-a închis').setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Promovări / retrogradări')
    .addSubcommand(sc =>
      sc.setName('promote')
        .setDescription('Promovează un membru (rol)')
        .addUserOption(o => o.setName('user').setDescription('Membru').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Rol nou').setRequired(true))
        .addStringOption(o => o.setName('motiv').setDescription('Motiv').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('demote')
        .setDescription('Retrogradează un membru (scoate rol)')
        .addUserOption(o => o.setName('user').setDescription('Membru').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Rol de scos').setRequired(true))
        .addStringOption(o => o.setName('motiv').setDescription('Motiv').setRequired(true))
    )
].map(c => c.toJSON());

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('❌ Lipsesc variabile în .env: DISCORD_TOKEN / CLIENT_ID / GUILD_ID');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

try {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log('✅ Slash commands deployed.');
} catch (e) {
  console.error('❌ Deploy failed:', e);
  process.exit(1);
}
