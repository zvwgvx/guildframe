import { Events } from 'discord.js';
import { handleVoiceJoin, handleVoiceLeave } from '../services/createvoice.js';

export const name = Events.VoiceStateUpdate;

export async function execute(oldState, newState) {
  try {
    // Joined the lobby (or moved into it): spawn / reconnect.
    if (newState.channelId && newState.channelId !== oldState.channelId) {
      await handleVoiceJoin(oldState, newState);
    }

    // Left a spawned channel: delete when empty, else promote a new owner.
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      await handleVoiceLeave(oldState);
    }
  } catch (err) {
    console.error('[voice] voiceStateUpdate failed:', err.message);
  }
}
