import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

// Previous / page indicator / Next (like the reference design).
function buildRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pg_prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId('pg_indicator')
      .setLabel(`${page + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('pg_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

function attachCollector({ message, authorId, totalPages, render, timeoutMs, editMessage }) {
  let page = 0;
  const collector = message.createMessageComponentCollector({ time: timeoutMs });
  collector.on('collect', async (i) => {
    if (i.user.id !== authorId) {
      await i.reply({ content: 'Only the command author can flip through pages.', flags: MessageFlags.Ephemeral });
      return;
    }
    page = i.customId === 'pg_prev' ? Math.max(0, page - 1) : Math.min(totalPages - 1, page + 1);
    await i.update({ embeds: [render(page)], components: [buildRow(page, totalPages)] });
  });
  collector.on('end', () => {
    editMessage({ components: [] }).catch(() => {});
  });
}

// Paginated reply for slash commands (interaction must already be deferred).
export async function paginateInteraction(interaction, { totalPages, render, timeoutMs = 120_000 }) {
  const message = await interaction.editReply({
    embeds: [render(0)],
    components: totalPages > 1 ? [buildRow(0, totalPages)] : [],
  });
  if (totalPages <= 1) return;
  attachCollector({
    message,
    authorId: interaction.user.id,
    totalPages,
    render,
    timeoutMs,
    editMessage: (payload) => interaction.editReply(payload),
  });
}

// Paginated reply for prefix commands (plain channel message).
export async function paginateMessage(message, { totalPages, render, timeoutMs = 120_000, authorId = message.author?.id }) {
  if (totalPages <= 1) return message.edit({ embeds: [render(0)], components: [] });
  await message.edit({ embeds: [render(0)], components: [buildRow(0, totalPages)] });
  attachCollector({
    message,
    authorId,
    totalPages,
    render,
    timeoutMs,
    editMessage: (payload) => message.edit(payload),
  });
}
