import { Events, MessageFlags } from 'discord.js';
import { errorEmbed } from '../utils/embeds.js';

export const name = Events.InteractionCreate;

export async function execute(interaction, client) {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'Bot chỉ hoạt động trong server.', flags: MessageFlags.Ephemeral });
    return;
  }

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(`[command:${interaction.commandName}]`, err);
    const embed = errorEmbed('Có lỗi xảy ra khi thực thi lệnh. Kiểm tra log của bot để biết chi tiết.');
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: [embed] });
      else await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch {
      // interaction đã hết hạn — bỏ qua
    }
  }
}
