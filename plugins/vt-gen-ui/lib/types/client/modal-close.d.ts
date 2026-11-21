export interface ModalClose {
    /** Close the containing modal panel. */
    close(): void;
}
export declare const ModalCloseContext: import("react").Context<ModalClose | undefined>;
/** The close channel of the enclosing modal, or undefined outside one. */
export declare function useModalClose(): ModalClose | undefined;
