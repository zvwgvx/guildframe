import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

// Phân trang embed bằng nút Prev/Next. Yêu cầu interaction đã deferReply (ephemeral).
// render(page) phải trả về 1 EmbedBuilder.
export async function paginate(interaction, { totalPages, startPage = 0, render, timeoutMs = 120_000 }) {
  let page = Math.min(Math.max(startPage, 0), Math.max(totalPages - 1, 0));

  const row = () =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pg_prev')
        .setLabel('◀ Trước')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId('pg_next')
        .setLabel('Sau ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
    );

  const message = await interaction.editReply({
    embeds: [render(page)],
    components: totalPages > 1 ? [row()] : [],
  });
  if (totalPages <= 1) return;

  const collector = message.createMessageComponentCollector({ time: timeoutMs });
  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: 'Chỉ người gọi lệnh mới điều khiển được phân trang.', flags: MessageFlags.Ephemeral });
      return;
    }
    page = i.customId === 'pg_prev' ? Math.max(0, page - 1) : Math.min(totalPages - 1, page + 1);
    await i.update({ embeds: [render(page)], components: [row()] });
  });
  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
