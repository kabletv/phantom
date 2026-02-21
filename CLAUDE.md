# Phantom Terminal Emulator

Cross-platform terminal emulator built with Tauri v2 and SolidJS.

## Tech Stack

- **Desktop shell**: Tauri v2
- **Frontend**: SolidJS + TypeScript + Vite
- **Terminal emulation**: alacritty_terminal (Rust crate)
- **PTY**: portable-pty
- **Language**: Rust (backend), TypeScript (frontend)

## Build Commands

- `just dev` - Start development mode (cargo tauri dev)
- `just build` - Build for production (cargo tauri build)
- `cargo check` - Type-check the Rust workspace

## Directory Structure

```
phantom/
  src/                     # Frontend (SolidJS + TypeScript)
    components/            # UI components
    renderer/              # Terminal renderer
    stores/                # State management
    lib/                   # Shared utilities
    App.tsx                # Root component
    index.html             # HTML entry point
  crates/
    phantom-app/           # Tauri v2 binary crate (desktop shell)
    phantom-vt/            # Terminal emulation wrapper (alacritty_terminal)
    phantom-pty/           # PTY spawn/read/write/resize
    phantom-git/           # Git operations
  package.json             # Node dependencies
  Cargo.toml               # Rust workspace root
  justfile                 # Task runner
```

## Conventions

- Binary cell format is 16 bytes per cell
