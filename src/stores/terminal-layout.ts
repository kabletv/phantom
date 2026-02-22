import { create } from "zustand";

export interface Pane {
  id: string;
  type: "terminal";
  sessionId?: number;
  title: string;
  /** Shell command to execute after session creation (e.g., "claude --model opus"). */
  command?: string;
  /** Working directory for the PTY shell process. */
  workingDir?: string;
}

export interface Split {
  id: string;
  direction: "horizontal" | "vertical";
  children: (Pane | Split)[];
  sizes: number[];
}

export type LayoutNode = Pane | Split;

function isSplit(node: LayoutNode): node is Split {
  return "direction" in node;
}

let nextId = 1;
function genId(): string {
  return `pane-${nextId++}`;
}

function createPane(options?: { title?: string; command?: string; workingDir?: string }): Pane {
  return {
    id: genId(),
    type: "terminal",
    title: options?.title ?? "Terminal",
    command: options?.command,
    workingDir: options?.workingDir,
  };
}

interface TerminalLayoutState {
  root: LayoutNode;
  activePane: string;
  setActivePane: (id: string) => void;
  splitPane: (paneId: string, direction: "horizontal" | "vertical") => void;
  closePane: (paneId: string) => void;
  updatePaneSession: (paneId: string, sessionId: number) => void;
  updateSplitSizes: (splitId: string, sizes: number[]) => void;
  /** Add a new pane by splitting the active pane. Returns the new pane ID. */
  addPane: (options?: { title?: string; command?: string; workingDir?: string }) => string;
}

function findAndReplace(
  node: LayoutNode,
  targetId: string,
  replacer: (node: LayoutNode) => LayoutNode,
): LayoutNode {
  if (node.id === targetId) return replacer(node);
  if (isSplit(node)) {
    return {
      ...node,
      children: node.children.map((child) => findAndReplace(child, targetId, replacer)),
    };
  }
  return node;
}

function removeNode(node: LayoutNode, targetId: string): LayoutNode | null {
  if (node.id === targetId) return null;
  if (isSplit(node)) {
    const newChildren: LayoutNode[] = [];
    const newSizes: number[] = [];
    for (let i = 0; i < node.children.length; i++) {
      const result = removeNode(node.children[i], targetId);
      if (result !== null) {
        newChildren.push(result);
        newSizes.push(node.sizes[i]);
      }
    }
    if (newChildren.length === 0) return null;
    if (newChildren.length === 1) return newChildren[0];
    // Normalize sizes
    const total = newSizes.reduce((a, b) => a + b, 0);
    return {
      ...node,
      children: newChildren,
      sizes: newSizes.map((s) => (s / total) * 100),
    };
  }
  return node;
}

function collectPaneIds(node: LayoutNode): string[] {
  if (isSplit(node)) {
    return node.children.flatMap(collectPaneIds);
  }
  return [node.id];
}

export const useTerminalLayout = create<TerminalLayoutState>((set) => ({
  root: createPane(),
  activePane: "pane-1",

  setActivePane: (id) => set({ activePane: id }),

  splitPane: (paneId, direction) =>
    set((state) => ({
      root: findAndReplace(state.root, paneId, (target) => {
        const newPane = createPane();
        return {
          id: genId(),
          direction,
          children: [target, newPane],
          sizes: [50, 50],
        } as Split;
      }),
    })),

  closePane: (paneId) =>
    set((state) => {
      const result = removeNode(state.root, paneId);
      if (!result) {
        // Don't close the last pane
        return state;
      }
      const paneIds = collectPaneIds(result);
      const activePane = paneIds.includes(state.activePane)
        ? state.activePane
        : paneIds[0] ?? state.activePane;
      return { root: result, activePane };
    }),

  updatePaneSession: (paneId, sessionId) =>
    set((state) => ({
      root: findAndReplace(state.root, paneId, (node) => ({
        ...node,
        sessionId,
      })),
    })),

  updateSplitSizes: (splitId, sizes) =>
    set((state) => ({
      root: findAndReplace(state.root, splitId, (node) => ({
        ...node,
        sizes,
      })),
    })),

  addPane: (options) => {
    const newPane = createPane(options);
    set((state) => ({
      root: findAndReplace(state.root, state.activePane, (target) => ({
        id: genId(),
        direction: "horizontal" as const,
        children: [target, newPane],
        sizes: [50, 50],
      })),
      activePane: newPane.id,
    }));
    return newPane.id;
  },
}));

export { isSplit };
