import React, { useEffect, useRef } from "react";
import { mountTerminal } from "@phantom/terminal";

interface TerminalIslandProps {
  command?: string;
}

export function TerminalIsland({ command }: TerminalIslandProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const dispose = mountTerminal(containerRef.current, { command });
    return () => dispose();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    />
  );
}
