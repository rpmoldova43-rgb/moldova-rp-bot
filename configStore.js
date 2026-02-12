function getGuildConfig(guildId) {
  const all = readAll();
  return (
    all[guildId] || {
      site: null,
      panel: null,
      uiChannelId: null,
      uiMessageId: null,
      logoUrl: null, // optional, dacă vrei logo custom
    }
  );
}
