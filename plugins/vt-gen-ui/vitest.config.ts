/**
 * 测试配置：只跑 src 下的单元/契约测试。
 * - jsdom 让 DOM 语义（角色、data-* 属性）可断言；
 * - CSS Modules 用非哈希类名，类名不参与断言，但导入不会失败；
 * - 测试不打视觉细节，视觉验收仍走 tools/visual/shot.sh。
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The host ui-primitives package is a peer that depends on host-only packages;
// tests only need the render graph to load, so alias it to an inert stub.
const hostPrimitivesStub = fileURLToPath(new URL('./src/client/__tests__/primitives-stub.tsx', import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@deepseek-ai/dsh-client-ui-primitives': hostPrimitivesStub },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    restoreMocks: true,
  },
})
