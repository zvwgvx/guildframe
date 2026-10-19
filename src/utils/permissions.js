import { MessageFlags, PermissionsBitField } from 'discord.js';
import { getGuildConfig } from '../db.js';
import { errorEmbed } from './embeds.js';

// Gửi phản hồi lỗi (tự xử lý trường hợp đã reply/defer).
export async function replyEphemeral(interaction, embed) {
  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply({ embeds: [embed] });
  } else if (interaction.replied) {
    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// Kiểm tra người gọi lệnh: Administrator, role moderator đã cấu hình, hoặc có quyền cụ thể.
// Trả về false (và đã trả lời lỗi) nếu không đủ quyền.
export async function ensureModerator(interaction, permissionFlag, permissionLabel) {
  const member = interaction.member;
  const cfg = getGuildConfig(interaction.guildId);
  const allowed =
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    (cfg.mod_role_id && member.roles.cache.has(cfg.mod_role_id)) ||
    member.permissions.has(permissionFlag);

  if (allowed) return true;
  await replyEphemeral(
    interaction,
    errorEmbed(
      `Bạn cần quyền **${permissionLabel}** (hoặc role moderator đã cấu hình) để dùng lệnh này.`,
    ),
  );
  return false;
}

// Kiểm tra bot có đủ quyền cần thiết.
export async function ensureBotPermissions(interaction, permissionFlag, permissionLabel) {
  const me = interaction.guild.members.me;
  if (me.permissions.has(permissionFlag)) return true;
  await replyEphemeral(
    interaction,
    errorEmbed(`Bot thiếu quyền **${permissionLabel}** để thực hiện thao tác này.`),
  );
  return false;
}

// Kiểm tra có thể áp dụng biện pháp lên thành viên mục tiêu (chủ server, bot, role hierarchy).
export async function canModerateMember(interaction, targetMember) {
  const me = interaction.guild.members.me;
  const deny = async (text) => {
    await replyEphemeral(interaction, errorEmbed(text));
    return false;
  };

  if (targetMember.id === interaction.user.id) return deny('Bạn không thể áp dụng biện pháp cho chính mình.');
  if (targetMember.id === me.id) return deny('Bot không thể áp dụng biện pháp cho chính nó.');
  if (targetMember.id === interaction.guild.ownerId) return deny('Không thể áp dụng biện pháp cho chủ server.');
  if (targetMember.roles.highest.position >= me.roles.highest.position) {
    return deny('Role cao nhất của người này cao hơn hoặc bằng role cao nhất của bot.');
  }
  return true;
}
