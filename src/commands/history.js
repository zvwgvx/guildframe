import { buildHistoryCommand, executeHistory } from '../services/historyCommand.js';

export const data = buildHistoryCommand('history');
export const execute = executeHistory;
