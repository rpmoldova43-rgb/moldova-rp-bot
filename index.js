require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require("discord.js");

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Lipsesc DISCORD_TOKEN / CLIENT_ID / GUILD_ID în .env");
  process.exit(1);
}

const STORE_FILE = path.join(__dirname, "guild-config.json");

/* ================= STORAGE ================= */

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getDefaultConfig() {
  return {
    site: null,
    panel: null,
    discord: null,
    wiki: null,
    rules: null,
    donate: null,
    thumbUrl: null,
    bannerUrl: null,
    uiChannelId: null,
    uiMessageId: null,
  };
}

function getGuildConfig(guildId) {
  const all = readAll();
  return { ...getDefaultConfig(), ...(all[guildId] || {}) };
}

function setGuildConfig(guildId, patch) {
  const all = readAll();
  const current = getGuildConfig(guildId);
  all[guildId] = { ...current, ...patch };
  writeAll(all);
  return all[guildId];
}

/* ================= CLIENT ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

/* ================= HELPERS ================= */

function safeUrl(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!/^https?:\/\/.+/i.test(s)) return null;
  return s;
}

function requireValidUrl(value) {
  const url = safeUrl(value);
  if (!url) {
    return null;
  }
  return url;
}

function buildEmbed(guild, cfg) {
  const thumb = safeUrl(cfg.thumbUrl);
  const banner = safeUrl(cfg.bannerUrl);

  const embed = new EmbedBuilder()
    .setColor(0xff7a00)
    .setAuthor({
      name: guild?.name || "Moldova Roleplay",
      iconURL: thumb || undefined,
    })
    .setTitle("Linkuri Oficiale")
    .setDescription("Accesează rapid informațiile serverului folosind butoanele de mai jos.")
    .addFields(
      {
        name: "🌐 Site",
        value: safeUrl(cfg.site) ? `[Deschide](${cfg.site})` : "❌ Nesetat",
        inline: true,
      },
      {
        name: "🧩 Panel",
        value: safeUrl(cfg.panel) ? `[Deschide](${cfg.panel})` : "❌ Nesetat",
        inline: true,
      },
      {
        name: "💬 Discord",
        value: safeUrl(cfg.discord) ? `[Deschide](${cfg.discord})` : "❌ Nesetat",
        inline: true,
      },
      {
        name: "📘 Wiki",
        value: safeUrl(cfg.wiki) ? `[Deschide](${cfg.wiki})` : "❌ Nesetat",
        inline: true,
      },
      {
        name: "📜 Regulament",
        value: safeUrl(cfg.rules) ? `[Deschide](${cfg.rules})` : "❌ Nesetat",
        inline: true,
      },
      {
        name: "💸 Donații",
        value: safeUrl(cfg.donate) ? `[Deschide](${cfg.donate})` : "❌ Nesetat",
        inline: true,
      }
    )
    .setFooter({
      text: `Actualizat • ${new Date().toLocaleString("ro-RO")}`,
    })
    .setTimestamp();

  if (thumb) embed.setThumbnail(thumb);
  if (banner) embed.setImage(banner);

  return embed;
}

function buildButtons(cfg) {
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  if (safeUrl(cfg.site)) {
    row1.addComponents(
      new ButtonBuilder()
        .setLabel("🌐 Site")
        .setStyle(ButtonStyle.Link)
        .setURL(cfg.site)
    );
  }

  if (safeUrl(cfg.panel)) {
    row1.addComponents(
      new ButtonBuilder()
        .setLabel("🧩 Panel")
        .setStyle(ButtonStyle.Link)
        .setURL(cfg.panel)
    );
  }

  if (safeUrl(cfg.discord)) {
    row1.addComponents(
      new ButtonBuilder()
        .setLabel("💬 Discord")
        .setStyle(ButtonStyle.Link)
        .setURL(cfg.discord)
    );
  }

  if (safeUrl(cfg.wiki)) {
    row2.addComponents(
      new ButtonBuilder()
        .setLabel("📘 Wiki")
        .setStyle(ButtonStyle.Link)
        .setURL(cfg.wiki)
    );
  }

  if (safeUrl(cfg.rules)) {
    row2.addComponents(
      new ButtonBuilder()
        .setLabel("📜 Regulament")
        .setStyle(ButtonStyle.Link)
        .setURL(cfg.rules)
    );
  }

  if (safeUrl(cfg.donate)) {
    row2.addComponents(
      new ButtonBuilder()
        .setLabel("💸 Donații")
        .setStyle(ButtonStyle.Link)
        .setURL(cfg.donate)
    );
  }

  const components = [];
  if (row1.components.length > 0) components.push(row1);
  if (row2.components.length > 0) components.push(row2);

  return components;
}

function buildPanelPayload(guild, cfg) {
  return {
    embeds: [buildEmbed(guild, cfg)],
    components: buildButtons(cfg),
  };
}

async function ensurePanel(guild) {
  const cfg = getGuildConfig(guild.id);
  if (!cfg.uiChannelId) return;

  const channel = await guild.channels.fetch(cfg.uiChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const payload = buildPanelPayload(guild, cfg);

  if (cfg.uiMessageId) {
    const oldMessage = await channel.messages.fetch(cfg.uiMessageId).catch(() => null);
    if (oldMessage) {
      await oldMessage.edit(payload).catch(() => {});
      return;
    }
  }

  const sent = await channel.send(payload).catch(() => null);
  if (sent) {
    setGuildConfig(guild.id, { uiMessageId: sent.id });
  }
}

/* ================= COMMANDS ================= */

const commands = [
  new SlashCommandBuilder()
    .setName("set")
    .setDescription("Setări pentru panoul de linkuri")
    .addSubcommand(sc =>
      sc
        .setName("site")
        .setDescription("Setează linkul site-ului")
        .addStringOption(o =>
          o.setName("url").setDescription("https://...").setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("panel")
        .setDescription("Setează linkul panel-ului")
        .addStringOption(o =>
          o.setName("url").setDescription("https://...").setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("discord")
        .setDescription("Setează linkul de Discord")
        .addStringOption(o =>
          o.setName("url").setDescription("https://...").setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("wiki")
        .setDescription("Setează linkul de Wiki")
        .addStringOption(o =>
          o.setName("url").setDescription("https://...").setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("rules")
        .setDescription("Setează linkul de Regulament")
        .addStringOption(o =>
          o.setName("url").setDescription("https://...").setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("donate")
        .setDescription("Setează linkul de Donații")
        .addStringOption(o =>
          o.setName("url").setDescription("https://...").setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("thumb")
        .setDescription("Setează logo-ul mic din embed")
        .addStringOption(o =>
          o.setName("url").setDescription("https://...png/jpg/webp").setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("banner")
        .setDescription("Setează bannerul mare din embed")
        .addStringOption(o =>
          o.setName("url").setDescription("https://...png/jpg/webp").setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("channel")
        .setDescription("Setează canalul în care se postează panoul")
        .addChannelOption(o =>
          o
            .setName("canal")
            .setDescription("Alege canalul text")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("links")
    .setDescription("Arată panoul de linkuri"),

  new SlashCommandBuilder()
    .setName("postlinks")
    .setDescription("Postează manual panoul în canalul setat")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Slash commands registered (guild).");
}

/* ================= EVENTS ================= */

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  await registerCommands();

  for (const guild of client.guilds.cache.values()) {
    await ensurePanel(guild);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guild) return;

  const guildId = interaction.guild.id;
  const cfg = getGuildConfig(guildId);

  if (interaction.commandName === "set") {
    const sub = interaction.options.getSubcommand();

    if (sub === "channel") {
      const ch = interaction.options.getChannel("canal");

      if (!ch || !ch.isTextBased()) {
        return interaction.reply({
          content: "❌ Canal invalid.",
          ephemeral: true,
        });
      }

      setGuildConfig(guildId, {
        uiChannelId: ch.id,
        uiMessageId: null,
      });

      await ensurePanel(interaction.guild);

      return interaction.reply({
        content: `✅ Canalul panoului a fost setat pe ${ch}.`,
        ephemeral: true,
      });
    }

    const rawUrl = interaction.options.getString("url");
    const validUrl = requireValidUrl(rawUrl);

    if (!validUrl) {
      return interaction.reply({
        content: "❌ Link invalid. Folosește un link complet care începe cu `https://`.",
        ephemeral: true,
      });
    }

    if (sub === "site") setGuildConfig(guildId, { site: validUrl });
    if (sub === "panel") setGuildConfig(guildId, { panel: validUrl });
    if (sub === "discord") setGuildConfig(guildId, { discord: validUrl });
    if (sub === "wiki") setGuildConfig(guildId, { wiki: validUrl });
    if (sub === "rules") setGuildConfig(guildId, { rules: validUrl });
    if (sub === "donate") setGuildConfig(guildId, { donate: validUrl });
    if (sub === "thumb") setGuildConfig(guildId, { thumbUrl: validUrl });
    if (sub === "banner") setGuildConfig(guildId, { bannerUrl: validUrl });

    await ensurePanel(interaction.guild);

    return interaction.reply({
      content: `✅ Linkul pentru \`${sub}\` a fost salvat.`,
      ephemeral: true,
    });
  }

  if (interaction.commandName === "links") {
    return interaction.reply({
      ...buildPanelPayload(interaction.guild, cfg),
      ephemeral: false,
    });
  }

  if (interaction.commandName === "postlinks") {
    const latestCfg = getGuildConfig(guildId);

    if (!latestCfg.uiChannelId) {
      return interaction.reply({
        content: "❌ Nu ai setat încă un canal. Folosește `/set channel`.",
        ephemeral: true,
      });
    }

    const channel = await interaction.guild.channels
      .fetch(latestCfg.uiChannelId)
      .catch(() => null);

    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        content: "❌ Canalul setat nu mai există sau nu este valid.",
        ephemeral: true,
      });
    }

    const sent = await channel.send(buildPanelPayload(interaction.guild, latestCfg)).catch(() => null);

    if (!sent) {
      return interaction.reply({
        content: "❌ Nu am putut posta panoul în canal.",
        ephemeral: true,
      });
    }

    setGuildConfig(guildId, { uiMessageId: sent.id });

    return interaction.reply({
      content: `✅ Panoul a fost postat în ${channel}.`,
      ephemeral: true,
    });
  }
});

client.login(DISCORD_TOKEN);
