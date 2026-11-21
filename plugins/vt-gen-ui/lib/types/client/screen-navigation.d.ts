export interface ScreenNavigation {
    /** Switch to a declared screen id; invalid ids are ignored. */
    go(target: string): void;
    /** Return to the previous screen; no-op at the root. */
    back(): void;
    readonly canGoBack: boolean;
}
export declare const ScreenNavigationContext: import("react").Context<ScreenNavigation | undefined>;
/** Current screen navigation, or undefined outside a screen-based block. */
export declare function useScreenNavigation(): ScreenNavigation | undefined;
