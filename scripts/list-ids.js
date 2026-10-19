// One-off helper: prints every role and channel ID of the configured guild,
// so they can be copied into config.json. Run: npm run ids
import { Client, GatewayIntentBits } from 'discord.js';
import { assertConfig, config } from '../src/config.js';

assertConfig({ requireGuild: true });

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

await client.login(config.token);
const guild = await client.guilds.fetch(config.guildId);

const roles = [...(await guild.roles.fetch()).values()].sort((a, b) => b.position - a.position);
console.log(`\nRoles in "${guild.name}" (${guild.id}):`);
for (const role of roles) {
  const suffix = role.id === guild.id ? '  <- @everyone' : '';
  console.log(`  ${role.position.toString().padStart(3)}  ${role.name}  |  id: ${role.id}${suffix}`);
}

const channels = [...(await guild.channels.fetch()).values()]
  .filter((c) => c.isTextBased())
  .sort((a, b) => a.rawPosition - b.rawPosition);
console.log(`\nText channels:`);
for (const channel of channels) {
  console.log(`  #${channel.name}  |  id: ${channel.id}`);
}
console.log('\nCopy the IDs you need into config.json, then restart the bot.');

await client.destroy();
process.exit(0);
