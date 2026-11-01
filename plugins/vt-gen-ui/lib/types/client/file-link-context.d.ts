import { type ReactNode } from 'react';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
interface SidebarRightService {
    openResource(address: string, options?: {
        params: {
            line: number;
        };
    }): void;
}
interface FileLinkHostContext {
    get(name: 'sidebarRight', strict?: false): SidebarRightService | undefined;
    sessions: {
        list: {
            getSnapshot(): unknown;
        };
        retainInfo(sessionId: SessionId): {
            getSnapshot(): {
                retainedBy: {
                    mainView?: number;
                };
            };
        };
    };
}
interface FileLinkScope {
    get(name: 'sidebarRight'): SidebarRightService | undefined;
    effect(callback: () => void | (() => void), name?: string): unknown;
}
export interface FileLinkCordisContext extends FileLinkHostContext {
    inject(services: ['sidebarRight'], callback: (scope: FileLinkScope) => void): unknown;
}
export interface FileLinkAvailability {
    subscribe(listener: () => void): () => void;
    getSnapshot(): boolean;
}
/** Track an optional host service through arrival, removal, and plugin unload. */
export declare function createFileLinkAvailability(ctx: FileLinkCordisContext): FileLinkAvailability;
/** Render a file link as an accessible host navigation button when available. */
export declare function FileLink({ path, line, label, children }: {
    path: string;
    line?: number;
    label: string;
    children?: ReactNode;
}): import("react").DetailedReactHTMLElement<{
    title: string;
}, HTMLElement>;
/** Add session-scoped file navigation to one fence render tree. */
export declare function withFileLinkContext(ctx: FileLinkHostContext, availability: FileLinkAvailability, sessionId: string | undefined, streaming: boolean, children: ReactNode): ReactNode;
export {};
