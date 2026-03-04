/**
 * Utilities for detecting the VS Code environment and performing
 * environment-aware path handling (e.g. Windows → WSL path conversion).
 *
 * VS Code can run in many different environments:
 *  - Local: Windows, macOS, Linux
 *  - Remote WSL:       VS Code + Remote-WSL extension (extension host runs in WSL Linux)
 *  - Remote SSH:       VS Code connected via SSH to a remote machine
 *  - Dev Container:    VS Code + Dev Containers extension (extension host runs in Docker)
 *  - Codespaces web:   GitHub Codespaces accessed via the browser (vscode.dev/github.dev)
 *  - Codespaces desktop: Local VS Code desktop connected to a GitHub Codespace
 *  - VS Code Tunnel:   Local VS Code or browser connected via vscode.dev tunnels
 */

import * as vscode from 'vscode';
import { windowsPathToWsl } from './pathUtils';
export { windowsPathToWsl };  // Re-export so existing callers don't need to change

/** All VS Code environments where the SWAT+ Dataset Selector may run. */
export type VsCodeEnvironment =
    | 'local-windows'
    | 'local-macos'
    | 'local-linux'
    | 'remote-wsl'
    | 'remote-ssh'
    | 'remote-container'
    | 'codespaces-browser'
    | 'codespaces-desktop'
    | 'tunnel'
    | 'unknown';

export interface EnvironmentInfo {
    /** The detected environment type. */
    type: VsCodeEnvironment;
    /** Short human-readable label shown in the UI. */
    label: string;
    /** VS Code codicon name (without $()). */
    icon: string;
    /** Longer description shown as a tooltip or detail text. */
    description: string;
    /**
     * True when the extension host runs on Linux but the user may have
     * Windows-format paths (C:\...) to datasets on mounted Windows drives.
     * Currently true only for Remote WSL.
     */
    mayHaveWindowsPaths: boolean;
    /** True when the extension host process runs on Linux (remote or local). */
    isRemoteLinux: boolean;
    /**
     * True when the environment is a browser-based UI where a native folder
     * picker cannot browse the local machine's filesystem.
     * Currently true only for `codespaces-browser`.
     */
    isBrowserUI: boolean;
}

/** Returns true when at least one workspace folder is open. */
export function hasWorkspace(): boolean {
    return (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
}

/**
 * Returns true when the CMake Tools extension (`ms-vscode.cmake-tools`) is
 * installed in this VS Code instance.
 *
 * When false, the Debug button and CMake-related UI should be hidden or
 * disabled — the user is operating in a "data examination only" mode.
 */
export function isCmakeToolsInstalled(): boolean {
    return vscode.extensions.getExtension('ms-vscode.cmake-tools') !== undefined;
}

/**
 * Detect the current VS Code environment by inspecting `vscode.env.remoteName`,
 * `vscode.env.uiKind`, and `process.platform`.
 */
export function detectEnvironment(): EnvironmentInfo {
    const remoteName = vscode.env.remoteName;  // 'wsl' | 'ssh-remote' | 'dev-container' | 'codespaces' | 'tunnel' | undefined
    const uiKind    = vscode.env.uiKind;       // UIKind.Desktop | UIKind.Web
    const platform  = process.platform;        // 'win32' | 'darwin' | 'linux'

    if (remoteName === 'wsl') {
        const distro = process.env['WSL_DISTRO_NAME'] || 'Ubuntu';
        return {
            type: 'remote-wsl',
            label: `WSL: ${distro}`,
            icon: 'vm',
            description: `Remote WSL (${distro}) — Windows drives are accessible at /mnt/<drive>/. ` +
                         `You can paste Windows paths (C:\\...) and they will be converted automatically.`,
            mayHaveWindowsPaths: true,
            isRemoteLinux: true,
            isBrowserUI: false
        };
    }

    if (remoteName === 'codespaces') {
        if (uiKind === vscode.UIKind.Web) {
            return {
                type: 'codespaces-browser',
                label: 'Codespaces (browser)',
                icon: 'cloud',
                description: 'GitHub Codespaces via browser — upload datasets using the Explorer ' +
                             'upload option (right-click → Upload) and select them here.',
                mayHaveWindowsPaths: false,
                isRemoteLinux: true,
                isBrowserUI: true
            };
        }
        return {
            type: 'codespaces-desktop',
            label: 'Codespaces (desktop)',
            icon: 'cloud',
            description: 'GitHub Codespaces via VS Code desktop — upload datasets using the ' +
                         'Explorer upload option or drag-and-drop from your local machine.',
            mayHaveWindowsPaths: false,
            isRemoteLinux: true,
            isBrowserUI: false
        };
    }

    if (remoteName === 'ssh-remote') {
        return {
            type: 'remote-ssh',
            label: 'Remote SSH',
            icon: 'remote',
            description: 'VS Code Remote SSH — paths are relative to the remote machine filesystem.',
            mayHaveWindowsPaths: false,
            isRemoteLinux: platform === 'linux',
            isBrowserUI: false
        };
    }

    if (remoteName === 'dev-container') {
        return {
            type: 'remote-container',
            label: 'Dev Container',
            icon: 'package',
            description: 'Dev Container (Docker) — paths are inside the container filesystem.',
            mayHaveWindowsPaths: false,
            isRemoteLinux: true,
            isBrowserUI: false
        };
    }

    if (remoteName === 'tunnel') {
        return {
            type: 'tunnel',
            label: 'VS Code Tunnel',
            icon: 'remote-explorer',
            description: 'VS Code Tunnel — paths are relative to the tunnel host filesystem.',
            mayHaveWindowsPaths: false,
            isRemoteLinux: platform === 'linux',
            isBrowserUI: false
        };
    }

    // Local (no remote)
    if (platform === 'win32') {
        return {
            type: 'local-windows',
            label: 'Windows (local)',
            icon: 'vm',
            description: 'Local Windows — use standard Windows paths (C:\\...).',
            mayHaveWindowsPaths: false,   // native Windows, no conversion needed
            isRemoteLinux: false,
            isBrowserUI: false
        };
    }
    if (platform === 'darwin') {
        return {
            type: 'local-macos',
            label: 'macOS (local)',
            icon: 'vm',
            description: 'Local macOS — use standard POSIX paths (/Users/...).',
            mayHaveWindowsPaths: false,
            isRemoteLinux: false,
            isBrowserUI: false
        };
    }
    if (platform === 'linux') {
        return {
            type: 'local-linux',
            label: 'Linux (local)',
            icon: 'vm',
            description: 'Local Linux — use standard POSIX paths (/home/...).',
            mayHaveWindowsPaths: false,
            isRemoteLinux: false,
            isBrowserUI: false
        };
    }

    return {
        type: 'unknown',
        label: 'Unknown environment',
        icon: 'question',
        description: 'Could not detect the VS Code environment.',
        mayHaveWindowsPaths: false,
        isRemoteLinux: false,
        isBrowserUI: false
    };
}

/**
 * Resolve a user-supplied path for the current environment.
 * In WSL (when `env.mayHaveWindowsPaths` is true) Windows-format paths
 * (`C:\...` / `C:/...`) are automatically converted to their `/mnt/<drive>/`
 * equivalent so the extension can read them on the Linux side.
 */
export function resolvePathForEnvironment(inputPath: string, env: EnvironmentInfo): string {
    if (env.mayHaveWindowsPaths && /^[A-Za-z]:[\\\/]/.test(inputPath)) {
        return windowsPathToWsl(inputPath);
    }
    return inputPath;
}
