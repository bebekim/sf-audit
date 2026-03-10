/**
 * DAG construction + topological sort by dependency level.
 *
 * Core algorithm from Mouyal thesis (2020): objects are sorted into
 * levels where Level 0 has no required dependencies, Level 1 depends
 * only on Level 0, etc. This determines safe insertion order.
 */
import { DependencyGraph, ObjectDiscovery } from './types.js';

interface Edge {
  from: string;
  to: string;
  required: boolean;
}

/**
 * Build a dependency graph from discovered objects.
 * Edges point from child → parent (the child references the parent).
 */
export function buildGraph(objects: ObjectDiscovery[]): DependencyGraph {
  const objectNames = new Set(objects.map((o) => o.name));
  const edges: Edge[] = [];

  for (const obj of objects) {
    for (const rel of obj.relationships) {
      if (objectNames.has(rel.referenceTo)) {
        edges.push({
          from: obj.name,
          to: rel.referenceTo,
          required: rel.required,
        });
      }
    }
  }

  const levels = topologicalSort(Array.from(objectNames), edges);

  return {
    nodes: Array.from(objectNames),
    edges,
    levels,
  };
}

/**
 * Detect circular dependencies among required edges.
 * Returns arrays of object names forming cycles.
 */
export function detectCircularDependencies(
  nodes: string[],
  edges: Edge[],
): string[][] {
  // Only required edges can block migration
  const requiredEdges = edges.filter((e) => e.required);
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const e of requiredEdges) {
    adj.get(e.from)!.push(e.to);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string): void {
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    stack.push(node);

    for (const neighbor of adj.get(node) ?? []) {
      if (inStack.has(neighbor)) {
        // Found cycle: extract from stack
        const cycleStart = stack.indexOf(neighbor);
        cycles.push(stack.slice(cycleStart));
      } else if (!visited.has(neighbor)) {
        dfs(neighbor);
      }
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const node of nodes) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}

/**
 * Topological sort by level using Kahn's algorithm.
 *
 * Level 0 = no required dependencies.
 * Level N = depends only on objects in levels 0..N-1.
 * Objects with only optional dependencies are placed as early as possible.
 *
 * If cycles exist among required edges, remaining nodes go into
 * a final "unresolvable" level.
 */
export function topologicalSort(
  nodes: string[],
  edges: Edge[],
): string[][] {
  // Build in-degree map for required edges only
  const requiredEdges = edges.filter((e) => e.required);
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // parent → children

  for (const n of nodes) {
    inDegree.set(n, 0);
    dependents.set(n, []);
  }

  for (const e of requiredEdges) {
    // Self-references don't count
    if (e.from === e.to) continue;
    inDegree.set(e.from, (inDegree.get(e.from) ?? 0) + 1);
    dependents.get(e.to)!.push(e.from);
  }

  const levels: string[][] = [];
  const placed = new Set<string>();

  // Kahn's: repeatedly find nodes with in-degree 0
  let remaining = new Set(nodes);

  while (remaining.size > 0) {
    const level: string[] = [];

    for (const node of remaining) {
      if ((inDegree.get(node) ?? 0) === 0) {
        level.push(node);
      }
    }

    if (level.length === 0) {
      // Remaining nodes are in cycles — push them all as last level
      levels.push(Array.from(remaining).sort());
      break;
    }

    level.sort(); // deterministic ordering within level
    levels.push(level);

    for (const node of level) {
      placed.add(node);
      remaining.delete(node);

      for (const dependent of dependents.get(node) ?? []) {
        if (!placed.has(dependent)) {
          inDegree.set(dependent, (inDegree.get(dependent) ?? 0) - 1);
        }
      }
    }
  }

  return levels;
}
