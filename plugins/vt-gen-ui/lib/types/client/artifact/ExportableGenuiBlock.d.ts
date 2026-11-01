import type { GenuiBlockProps } from '../blocks/state.ts';
export interface ExportableGenuiBlockProps extends GenuiBlockProps {
    exportEnabled?: boolean;
}
/** 在完成态 GenUI 外层显示 artifact 导出菜单。 */
export declare function ExportableGenuiBlock(props: ExportableGenuiBlockProps): import("react").JSX.Element;
