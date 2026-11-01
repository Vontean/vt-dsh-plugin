export interface TemplateDrawerProps {
    /** Try it: insert the template instruction into the composer draft. */
    onUse: (instruction: string) => void;
    /** Which drawer is open (template center / trophies), driven by the header. */
    tab: 'templates' | 'achievements';
}
export declare function TemplateDrawer({ onUse, tab }: TemplateDrawerProps): import("react").JSX.Element;
