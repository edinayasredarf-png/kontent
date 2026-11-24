/** A portalled picker is logically inside the panel containing its input. */
const owners = new WeakMap<Node, HTMLElement>();
export function registerFloatingLayer(layer: HTMLElement, owner: HTMLElement): () => void {
 owners.set(layer, owner);
 return () => owners.delete(layer);
}
export function containsFloatingTarget(container: HTMLElement | null, target: Node | null): boolean {
 if (!container || !target) return false;
 const visited = new Set<Node>();
 let current: Node | null = target;
 while (current && !visited.has(current)) {
  if (container.contains(current)) return true;
  visited.add(current);
  let node: Node | null = current, owner: HTMLElement | undefined;
  while (node) { owner = owners.get(node); if (owner) break; node = node.parentNode; }
  current = owner ?? null;
 }
 return false;
}
