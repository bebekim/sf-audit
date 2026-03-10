/**
 * Migration module barrel export.
 */
export { buildGraph, detectCircularDependencies, topologicalSort } from './graph.js';
export { discover } from './discovery.js';
export {
  createMigrationCuriosityState,
  observeDiscovery,
  isMigrationSufficient,
  nextMigrationQuestion,
  recordMigrationAnswer,
} from './curiosity.js';
export { generatePlan } from './plan.js';
export { extract } from './extract.js';
export { transform, IdMap } from './transform.js';
export { load } from './load.js';
export type { DatabaseAdapter } from './load.js';
export type * from './types.js';
