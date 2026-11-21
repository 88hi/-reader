<template>
  <header class="source-manager-header">
    <div class="title-block">
      <h2>书源管理</h2>
      <p>
        共 {{ total }} 个 · 启用 {{ enabled }} 个 · 当前筛选 {{ filtered }} 个
        <span v-if="selected > 0"> · 已选 {{ selected }} 个</span>
        <span v-if="testing"> · {{ testModeLabel }}进度 {{ testCompleted }} / {{ testTotal }}（{{ testPercent }}%）</span>
        <span v-if="stopping" class="stopping-hint"> · 正在中止…</span>
      </p>
    </div>
    <div class="header-actions">
      <button class="icon-btn" :class="{ spinning: loading }" type="button" title="刷新" @click="$emit('refresh')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 16h5v5" />
        </svg>
      </button>
      <button class="action-btn" type="button" @click="$emit('import-local')">本地导入</button>
      <button class="action-btn" type="button" @click="$emit('open-subscriptions')">网络导入</button>
      <button class="action-btn" type="button" @click="$emit('export')">导出</button>
      <button
        class="action-btn"
        :class="{ danger: testing && activeMode === 'all' }"
        :disabled="(testing ? activeMode !== 'all' : total === 0) || stopping"
        type="button"
        @click="testing && activeMode === 'all' ? $emit('cancel-test') : $emit('test-sources', 'all')"
      >
        {{ testing && activeMode === 'all' ? (stopping ? '正在中止…' : '中止测试') : '测试书源' }}
      </button>
      <button
        class="action-btn"
        :class="{ danger: testing && activeMode === 'search' }"
        :disabled="(testing ? activeMode !== 'search' : total === 0) || stopping"
        type="button"
        @click="testing && activeMode === 'search' ? $emit('cancel-test') : $emit('test-sources', 'search')"
      >
        {{ testing && activeMode === 'search' ? (stopping ? '正在中止…' : '中止测试') : '测试搜索' }}
      </button>
      <button
        class="action-btn"
        :class="{ danger: testing && activeMode === 'toc' }"
        :disabled="(testing ? activeMode !== 'toc' : total === 0) || stopping"
        type="button"
        @click="testing && activeMode === 'toc' ? $emit('cancel-test') : $emit('test-sources', 'toc')"
      >
        {{ testing && activeMode === 'toc' ? (stopping ? '正在中止…' : '中止测试') : '测试目录' }}
      </button>
      <div class="threshold-wrap">
        <button
          class="action-btn"
          :disabled="testing"
          type="button"
          title="调整书源测试超时、并发与关键词阈值"
          @click="thresholdOpen = !thresholdOpen"
        >
          阈值 {{ testTimeoutSecs }}s/{{ testConcurrent }}
        </button>
        <div v-if="thresholdOpen" class="threshold-popover" @click.stop>
          <div class="threshold-row">
            <label>单源超时 (秒)</label>
            <input
              type="number"
              min="5"
              max="120"
              :value="testTimeoutSecs"
              @input="$emit('update:testTimeoutSecs', clampNumber(($event.target as HTMLInputElement).value, 5, 120, 30))"
            />
          </div>
          <div class="threshold-row">
            <label>并发数量 (1-8)</label>
            <input
              type="number"
              min="1"
              max="8"
              :value="testConcurrent"
              @input="$emit('update:testConcurrent', clampNumber(($event.target as HTMLInputElement).value, 1, 8, 4))"
            />
          </div>
          <div class="threshold-row">
            <label>搜索关键词</label>
            <input
              type="text"
              placeholder="留空用默认/兜底词"
              :value="testKeyword"
              @input="$emit('update:testKeyword', ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="threshold-footer">
            <button type="button" class="action-btn primary" @click="thresholdOpen = false">完成</button>
          </div>
        </div>
      </div>
      <button
        class="action-btn danger"
        :disabled="testing || invalidCount === 0"
        type="button"
        @click="$emit('delete-invalid')"
      >
        删除失效<span v-if="invalidCount"> {{ invalidCount }}</span>
      </button>
      <button class="action-btn primary" type="button" @click="$emit('create')">新增</button>
      <button class="icon-btn close-btn" type="button" title="关闭" @click="$emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BookSourceTestMode } from '../../api/source'

const props = withDefaults(defineProps<{
  total: number
  enabled: number
  filtered: number
  selected: number
  loading: boolean
  testing: boolean
  testMode?: BookSourceTestMode
  testCompleted: number
  testTotal: number
  invalidCount: number
  testTimeoutSecs?: number
  testConcurrent?: number
  testKeyword?: string
  /** 已发出中止请求、还在等后端收尾(写回已完成的结果)。 */
  stopping?: boolean
}>(), {
  testTimeoutSecs: 30,
  testConcurrent: 4,
  testKeyword: '',
})

const thresholdOpen = ref(false)

function clampNumber(raw: string, min: number, max: number, fallback: number): number {
  const num = Number(raw)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, Math.round(num)))
}

const activeMode = computed<BookSourceTestMode>(() => props.testMode ?? 'all')
const testModeLabel = computed(() => {
  if (activeMode.value === 'search') return '测试搜索'
  if (activeMode.value === 'toc') return '测试目录'
  return '测试'
})

const testPercent = computed(() => (
  props.testTotal > 0 ? Math.round((props.testCompleted / props.testTotal) * 100) : 0
))

defineEmits<{
  refresh: []
  'import-local': []
  'open-subscriptions': []
  export: []
  'test-sources': [mode: BookSourceTestMode]
  'cancel-test': []
  'delete-invalid': []
  'update:testTimeoutSecs': [value: number]
  'update:testConcurrent': [value: number]
  'update:testKeyword': [value: string]
  create: []
  close: []
}>()
</script>

<style scoped>
.source-manager-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: calc(var(--space-5) + var(--safe-area-top)) var(--space-6) var(--space-5);
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-bg-elevated);
  flex-shrink: 0;
}

.title-block {
  min-width: 0;
}

.title-block h2 {
  font-size: var(--text-lg);
  font-weight: 700;
}

.title-block p {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.stopping-hint {
  color: var(--color-primary);
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.action-btn,
.icon-btn {
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: transparent;
  cursor: pointer;
  transition: all var(--duration-fast);
}

.action-btn {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  font-size: 13px;
  /* 显式回到常规字重。`styles/global.css` 里有一份**不限定作用域**的
   * `.action-btn`(给设置抽屉、WebDAV 等处的粗体方案按钮用), 它会命中这里的
   * 按钮 —— 本组件原本没写 font-weight, 继承 body 的 400, 于是整排工具栏按钮
   * 被悄悄加粗了。scoped 只是把选择器变成 `.action-btn[data-v-*]`, 特异性更高,
   * 但**不声明这个属性就压不住**全局那条。 */
  font-weight: 400;
  white-space: nowrap;
}

.action-btn.primary {
  background: var(--color-primary-soft-bg);
  border-color: var(--color-primary-soft-border);
  color: var(--color-primary-soft-text);
}

.action-btn.danger {
  color: var(--color-danger);
  border-color: rgba(245, 34, 45, 0.26);
}

.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
}

.icon-btn svg {
  width: 18px;
  height: 18px;
}

.action-btn:hover:not(.primary),
.icon-btn:hover {
  background: var(--color-bg-hover);
}

/* 主按钮的 hover 必须单独写: 上面那条与 .action-btn.primary 特异性相同(0,2,0),
 * 而它更靠后, 会把主按钮的淡橙底换成中性灰, 主次视觉断裂。 */
.action-btn.primary:hover {
  background: var(--color-primary-soft-bg-hover);
  border-color: var(--color-primary);
}

.icon-btn.spinning svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .source-manager-header {
    position: relative;
    flex-direction: column;
    padding: calc(var(--space-4) + var(--safe-area-top)) var(--space-4) var(--space-4);
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .close-btn {
    position: absolute;
    top: calc(var(--space-4) + var(--safe-area-top));
    right: var(--space-4);
  }
}

.threshold-wrap {
  position: relative;
}

.threshold-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 80;
  width: 240px;
  padding: 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.threshold-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.threshold-row label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.threshold-row input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-sunken);
  color: var(--color-text);
  font-size: 13px;
}

.threshold-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
