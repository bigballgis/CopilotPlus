/** Pending consistency change queue — R-DOCS-12.2 */

export class ConsistencyQueue {
  private readonly byComponent = new Map<string, Set<string>>();

  enqueue(componentId: string, filePath: string): void {
    const norm = filePath.replace(/\\/g, '/');
    let set = this.byComponent.get(componentId);
    if (!set) {
      set = new Set();
      this.byComponent.set(componentId, set);
    }
    set.add(norm);
  }

  pendingCount(): number {
    let total = 0;
    for (const set of this.byComponent.values()) {
      total += set.size;
    }
    return total;
  }

  componentCount(componentId: string): number {
    return this.byComponent.get(componentId)?.size ?? 0;
  }

  shouldFlush(componentId: string, threshold = 20): boolean {
    return this.componentCount(componentId) >= threshold;
  }

  flush(componentId?: string): string[] {
    if (componentId) {
      const set = this.byComponent.get(componentId);
      this.byComponent.delete(componentId);
      return set ? [...set] : [];
    }
    const all: string[] = [];
    for (const set of this.byComponent.values()) {
      all.push(...set);
    }
    this.byComponent.clear();
    return all;
  }
}
