/** Audit module public API. */
export { SalesforceClient } from './client.js';
export { runQuery, runToolingQuery, countFrom, recordsFrom } from './query-helper.js';
export { runBaseline } from './baseline.js';
export { validate } from './validation.js';
export { score } from './scoring.js';
export { prescribe } from './prescription.js';
export {
  createCuriosityState,
  observeOrientation,
  observeAdoption,
  observeCustomisation,
  observeDataHealth,
  isSufficient,
  nextQuestion,
  recordAnswer,
} from './curiosity.js';
export type * from './types.js';
