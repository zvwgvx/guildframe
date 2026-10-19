import { buildHistoryCommand, executeHistory } from '../services/historyCommand.js';

export const data = buildHistoryCommand('punishments');
export const execute = executeHistory;
