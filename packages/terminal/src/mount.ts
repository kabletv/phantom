import { render } from "solid-js/web";
import Terminal from "./components/Terminal";

export interface MountOptions {
  /** Shell command to execute after session creation (e.g., "claude --model opus"). */
  command?: string;
}

/**
 * Mount the SolidJS terminal into a DOM node.
 * Returns a dispose function to unmount.
 */
export function mountTerminal(container: HTMLElement, options?: MountOptions): () => void {
  const dispose = render(() => Terminal({ command: options?.command }), container);
  return dispose;
}
