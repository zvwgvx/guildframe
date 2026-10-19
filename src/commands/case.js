import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { createCase, getCaseByNumber, hideCase } from '../db.js';
import { logCase } from '../services/log.js';
import { buildCaseEmbed, errorEmbed } from '../utils/embeds.js';
import { ensureModerator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('case')
  .setDescription('View or delete a case by its number')
  .addSubcommand((s) =>
    s
      .setName('view')
      .setDescription('View a single case')
      .addIntegerOption((o) => o.setName('number').setDescription('Case number').setRequired(true).setMinValue(1)),
  )
  .addSubcommand((s) =>
    s
      .setName('delete')
      .setDescription('Hide a case from the history (audit trail is kept)')
      .addIntegerOption((o) => o.setName('number').setDescription('Case number').setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName('reason').setDescription('Reason for deleting')),
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();

  if (sub === 'view') {
    if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageMessages, 'Manage Messages'))) return;

    const caseRow = getCaseByNumber(interaction.guildId, interaction.options.getInteger('number'));
    if (!caseRow || caseRow.hidden) {
      await interaction.editReply({ embeds: [errorEmbed('Case not found.')] });
      return;
    }
    await interaction.editReply({ embeds: [buildCaseEmbed(caseRow, { clientId: client.user.id })] });
    return;
  }

  // delete
  if (!(await ensureModerator(interaction, PermissionsBitField.Flags.ManageGuild, 'Manage Server'))) return;

  const caseRow = getCaseByNumber(interaction.guildId, interaction.options.getInteger('number'));
  if (!caseRow || caseRow.hidden) {
    await interaction.editReply({ embeds: [errorEmbed('Case not found.')] });
    return;
  }

  hideCase(caseRow.id);
  const reason = interaction.options.getString('reason');
  const noteCase = createCase({
    guildId: interaction.guildId,
    userId: caseRow.user_id,
    moderatorId: interaction.user.id,
    type: 'note',
    reason: `Deleted Case #${caseRow.case_number} (${caseRow.type})${reason ? `: ${reason}` : ''}`,
  });
  await logCase(interaction.guild, noteCase, { clientId: client.user.id });

  await interaction.editReply({ embeds: [buildCaseEmbed(noteCase, { clientId: client.user.id })] });
}
