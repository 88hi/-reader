<template>
  <div
    ref="resultsContainerRef"
    class="search-results"
    :class="{ 'is-switch-mode': isSwitchMode }"
  >
    <div class="search-header">
      <div class="search-header-main">
        <h2>
          <template v-if="isSwitchMode">
            切换书源
            <span v-if="currentBook?.name" class="switch-book-badge" :title="currentBook.name">
              《{{ currentBook.name }}》
            </span>
          </template>
          <template v-else>
            搜索 "{{ searchKey }}"
          </template>
          <span v-if="switchLoading" class="searching-indicator">
            <span class="dot-pulse"></span>
            正在切换书源…
          </span>
          <span v-else-if="isSearching" class="searching-indicator">
            <span class="dot-pulse"></span>
            {{ searchProgressText }}
          </span>
          <span v-else class="result-count">
            ({{ rankedResults.length }} 个结果<template v-if="searchProgress.totalSources > 0"> · 已扫 {{ searchProgress.totalSources }} 个书源</template>)
          </span>
          <!-- 结果来自会话缓存时标一下；点它可重搜。 -->
          <button
            v-if="resultsFromCache && !isSearching"
            type="button"
            class="cache-badge"
            title="结果来自上次搜索，点击重新搜索"
            @click="refreshSearch"
          >缓存 ⟳</button>
        </h2>
        <div v-if="isSwitchMode && currentBook" class="switch-current-meta">
          <span>当前书源：{{ currentSourceLabel }}</span>
          <span v-if="currentBook.author">· {{ currentBook.author }}</span>
        </div>
      </div>

      <div class="search-header-actions">
        <form v-if="isSwitchMode" class="switch-search-form" @submit.prevent="submitSwitchSearch">
          <input
            v-model="switchInputKey"
            type="text"
            class="switch-search-input"
            placeholder="输入书名搜索书源..."
          />
          <button
            v-if="isSearching"
            type="button"
            class="back-btn"
            @click="stopCurrentSearch"
          >停止</button>
          <button
            v-else
            type="submit"
            class="back-btn primary"
          >搜索</button>
        </form>
        <button v-if="isSwitchMode" type="button" class="back-btn" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          关闭
        </button>
        <button v-else type="button" class="back-btn" @click="backToShelf">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          返回书架
        </button>
      </div>
    </div>

    <div class="search-filters">
      <div class="filter-tabs" role="tablist" aria-label="搜索范围">
        <button
          type="button"
          class="filter-tab"
          :class="{ active: searchScope === 'group' }"
          @click="searchScope = 'group'"
        >
          按分组
        </button>
        <button
          type="button"
          class="filter-tab"
          :class="{ active: searchScope === 'all' }"
          @click="searchScope = 'all'"
        >
          全部书源
        </button>
        <button
          type="button"
          class="filter-tab"
          :class="{ active: searchScope === 'source' }"
          @click="searchScope = 'source'"
        >
          单个书源
        </button>
      </div>

      <div v-if="searchScope === 'group'" class="filter-select-wrap">
        <select v-model="selectedGroup" class="filter-select" :disabled="sourceGroups.length === 0">
          <option v-if="sourceGroups.length === 0" value="">暂无书源分组</option>
          <option v-for="group in sourceGroups" :key="group" :value="group">
            {{ group }}
          </option>
        </select>
      </div>

      <div v-else-if="searchScope === 'source'" class="filter-select-wrap">
        <select v-model="selectedSourceUrl" class="filter-select">
          <option v-for="source in sourceOptions" :key="source.bookSourceUrl" :value="source.bookSourceUrl">
            {{ source.bookSourceName }}
          </option>
        </select>
      </div>
    </div>

    <div class="search-body-layout">
      <!-- 第一列：命中书源 -->
      <aside v-if="resultSourceSummaries.length > 0" class="search-sources-sidebar" aria-label="命中书源列表">
        <div class="sidebar-header">
          <span>命中书源</span>
          <span class="sidebar-hint">右键可管理</span>
        </div>
        <div class="sidebar-source-list">
          <button
            type="button"
            class="sidebar-source-item"
            :class="{ active: activeResultSourceUrl === '' }"
            @click="selectResultSource('')"
          >
            <span class="sidebar-source-name">全部书源</span>
            <span class="sidebar-source-count">{{ rankedResults.length }}</span>
          </button>
          <button
            v-for="item in resultSourceSummaries"
            :key="item.origin"
            type="button"
            class="sidebar-source-item"
            :class="{ active: activeResultSourceUrl === item.origin }"
            :title="`${item.name}（右键管理书源）`"
            @click="selectResultSource(item.origin)"
            @contextmenu.prevent="handleSourceContextMenu(item, $event)"
          >
            <span class="sidebar-source-name">{{ item.name }}</span>
            <span class="sidebar-source-count">{{ item.count }}</span>
          </button>
        </div>
      </aside>

      <!-- 第二列：单列长条书籍列表（独立滚动 + 分批渲染，避免书多时切换书源卡顿） -->
      <div
        ref="booksPaneRef"
        class="search-books-pane"
        :class="{ 'is-split': Boolean(previewBook) }"
        @scroll="handleResultsScroll"
      >
        <div v-if="isSearching && rankedResults.length === 0" class="books-empty-state">
          <span class="dot-pulse"></span>
          <span>{{ searchProgressText }}</span>
        </div>
        <div v-else-if="displayedResults.length === 0" class="books-empty-state">
          <span>未找到相关书籍</span>
        </div>
        <div v-else class="search-book-list" role="list">
          <div
            v-for="book in renderedResults"
            :key="`${book.origin}::${book.bookUrl}`"
            class="search-book-row"
            :class="{
              active: isPreviewBook(book),
              current: isCurrentSourceBook(book),
            }"
            role="listitem"
            @click="openBookTocPreview(book)"
            @contextmenu.prevent="handleBookContextMenu({ book, event: $event })"
          >
            <div class="search-book-cover">
              <img
                v-if="book.coverUrl && !failedCoverKeys.has(`${book.origin}::${book.bookUrl}`)"
                :src="getCoverUrl(book.coverUrl, book.origin)"
                :alt="book.name"
                loading="lazy"
                @error="markCoverFailed(book)"
              />
              <div v-else class="search-book-cover-fallback">
                <span>{{ (book.name || '书').slice(0, 1) }}</span>
              </div>
            </div>

            <div class="search-book-info">
              <div class="search-book-title-line">
                <span class="search-book-title" :title="book.name">{{ book.name }}</span>
                <span v-if="isCurrentSourceBook(book)" class="search-book-chip current">当前书源</span>
              </div>
              <div class="search-book-meta-line">
                <span class="search-book-author">{{ book.author || '未知作者' }}</span>
                <span class="search-book-chip source" :title="book.originName || book.origin">
                  {{ book.originName || book.origin }}
                </span>
                <span v-if="book.originGroup" class="search-book-chip group" :title="book.originGroup">
                  {{ book.originGroup }}
                </span>
                <span
                  v-if="book.sourceCandidates && book.sourceCandidates.length > 1"
                  class="search-book-chip multi"
                >
                  {{ book.sourceCandidates.length }} 源
                </span>
              </div>
              <div v-if="book.lastChapter" class="search-book-latest" :title="book.lastChapter">
                最新：{{ book.lastChapter }}
              </div>
            </div>

            <div class="search-book-actions" @click.stop>
              <template v-if="isSwitchMode">
                <button
                  type="button"
                  class="row-action-btn"
                  :class="{ primary: !isCurrentSourceBook(book), muted: isCurrentSourceBook(book) }"
                  :disabled="switchLoading || isCurrentSourceBook(book)"
                  @click="handleSwitchToBook(book)"
                >
                  {{ isCurrentSourceBook(book) ? '当前源' : '切换此源' }}
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="row-action-btn"
                  :class="{ muted: isInShelf(book), primary: !isInShelf(book) }"
                  :disabled="isInShelf(book)"
                  @click="handleAddToShelf(book)"
                >
                  {{ isInShelf(book) ? '已加入' : '+ 书架' }}
                </button>
              </template>
            </div>
          </div>
          <button
            v-if="renderedResults.length < displayedResults.length"
            type="button"
            class="books-load-more-btn"
            @click="showMoreRenderedBooks"
          >
            显示更多（已显示 {{ renderedResults.length }} / {{ displayedResults.length }} 本）
          </button>
        </div>
      </div>

      <!-- 第三列：点击书籍后显示目录，点击章节加载正文预览 -->
      <aside v-if="previewBook" class="search-toc-pane" aria-label="书籍目录预览">
        <div class="sidebar-header">
          <span class="toc-pane-title" :title="previewBook.name">{{ previewBook.name }}</span>
          <div class="toc-pane-actions">
            <button
              v-if="isSwitchMode"
              type="button"
              class="toc-mini-btn primary"
              :disabled="switchLoading || isCurrentSourceBook(previewBook)"
              @click="handleSwitchToBook(previewBook)"
            >{{ isCurrentSourceBook(previewBook) ? '当前源' : '切换此源' }}</button>
            <button
              v-else
              type="button"
              class="toc-mini-btn"
              @click="handleBookClick(previewBook)"
            >详情</button>
            <button type="button" class="toc-mini-btn" title="关闭目录" @click="closeBookTocPreview">✕</button>
          </div>
        </div>
        <div v-if="previewTocLoading" class="pane-placeholder">正在加载目录...</div>
        <div v-else-if="previewTocError" class="pane-placeholder">
          <span>{{ previewTocError }}</span>
          <button type="button" class="toc-mini-btn" @click="openBookTocPreview(previewBook)">重试</button>
        </div>
        <div v-else-if="!previewChapters.length" class="pane-placeholder">暂无目录</div>
        <div v-else class="sidebar-source-list">
          <button
            v-for="chapter in previewChapters"
            :key="`${chapter.index}-${chapter.url}`"
            type="button"
            class="sidebar-source-item"
            :class="{ active: selectedSearchChapter?.url === chapter.url && selectedSearchChapter?.index === chapter.index }"
            @click="selectSearchChapter(chapter)"
          >
            <span class="sidebar-source-name">{{ chapter.title }}</span>
          </button>
        </div>
      </aside>

      <!-- 第四列：点击章节后加载并预览正文 -->
      <section v-if="previewBook && selectedSearchChapter" class="search-content-pane" aria-label="章节正文预览">
        <div class="sidebar-header">
          <span class="toc-pane-title" :title="selectedSearchChapter.title">{{ selectedSearchChapter.title }}</span>
          <button
            v-if="isSwitchMode"
            type="button"
            class="toc-mini-btn primary"
            :disabled="switchLoading"
            @click="handleSwitchToBook(previewBook, selectedSearchChapter)"
          >切换到本章阅读</button>
          <button
            v-else
            type="button"
            class="toc-mini-btn primary"
            @click="handleBookClick(previewBook)"
          >打开阅读</button>
        </div>
        <div v-if="selectedSearchLoading" class="pane-placeholder">正在加载正文预览...</div>
        <div v-else-if="selectedSearchError" class="pane-placeholder">{{ selectedSearchError }}</div>
        <div v-else class="search-preview-body">
          <p v-for="(line, idx) in selectedSearchParagraphs" :key="idx">{{ line }}</p>
        </div>
      </section>
    </div>

    <BookDetailModal
      v-if="!isSwitchMode"
      v-model="showBookDetail"
      :book="selectedBook"
    />

    <!-- 右键书源「移动分组」弹窗 -->
    <Teleport to="body">
      <div
        v-if="moveGroupTarget"
        class="move-group-overlay"
        @click.self="closeMoveGroupModal"
      >
        <div class="move-group-dialog" role="dialog" aria-modal="true" aria-label="移动书源分组">
          <div class="move-group-header">
            <h3>移动书源分组</h3>
            <button type="button" class="toc-mini-btn" @click="closeMoveGroupModal">✕</button>
          </div>
          <div class="move-group-source-info">
            <span class="move-group-source-name">{{ moveGroupTarget.name }}</span>
            <span class="move-group-source-current">
              当前分组：{{ moveGroupTarget.currentGroup || '未分组' }}
            </span>
          </div>
          <div class="move-group-field">
            <label for="move-group-input">目标分组（留空表示移出分组）</label>
            <input
              id="move-group-input"
              v-model="moveGroupInput"
              type="text"
              class="move-group-input"
              placeholder="输入分组名或点击下方已有分组..."
              @keydown.enter.prevent="confirmMoveSourceGroup"
            />
          </div>
          <div class="move-group-chips">
            <button
              type="button"
              class="move-group-chip"
              :class="{ active: moveGroupInput.trim() === '' }"
              @click="moveGroupInput = ''"
            >未分组</button>
            <button
              v-for="group in sourceGroups"
              :key="group"
              type="button"
              class="move-group-chip"
              :class="{ active: moveGroupInput.trim() === group }"
              @click="moveGroupInput = group"
            >{{ group }}</button>
          </div>
          <div class="move-group-footer">
            <button type="button" class="back-btn" @click="closeMoveGroupModal">取消</button>
            <button
              type="button"
              class="back-btn primary"
              :disabled="moveGroupSaving"
              @click="confirmMoveSourceGroup"
            >{{ moveGroupSaving ? '保存中…' : '确定移动' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useBookshelfStore } from '../stores/bookshelf'
import { useAppStore } from '../stores/app'
import { useSourceStore } from '../stores/source'
import { searchBookMultiSSE } from '../api/search'
import { deleteBookSource, pinBookSource, saveBookSource } from '../api/source'
import type { SseLike } from '../api/sse'
import { getBookContent, getBookInfo, getChapterList, getCoverUrl, saveBook } from '../api/bookshelf'
import { createCoverCacheSession } from '../utils/coverCacheSession'
import { getSearchSessionCache, searchSessionKey } from '../utils/searchSessionCache'
import { shouldResearchForSourceChange } from '../utils/searchSourceChange'
import { isBookOnShelf } from '../utils/bookEdit'
import {
  initializeSearchResult,
  isSearchResultRelevant,
  mergeSearchResult,
  rankSearchResults,
  searchMergeKey,
  shelfMatchKey,
} from '../utils/searchRank'
import BookDetailModal from './BookDetailModal.vue'
import { showContextMenu } from '../composables/useContextMenu'
import type { Book, BookChapter, SearchBook } from '../types'

const props = withDefaults(defineProps<{
  mode?: 'search' | 'switch-source'
  currentBook?: Book | null
  switchLoading?: boolean
}>(), {
  mode: 'search',
  currentBook: null,
  switchLoading: false,
})

const emit = defineEmits<{
  back: []
  close: []
  'switch-source': [payload: { book: Book | SearchBook; chapter?: BookChapter | null }]
}>()

const shelfStore = useBookshelfStore()
const appStore = useAppStore()
const sourceStore = useSourceStore()

const isSwitchMode = computed(() => props.mode === 'switch-source')

// 换源模式使用独立局部状态，避免污染书架的搜索状态
const localSearchKey = ref(props.currentBook?.name?.trim() || '')
const localSearchResults = ref<SearchBook[]>([])
const localIsSearching = ref(false)
const localSearchScope = ref<'all' | 'group' | 'source'>('group')
const localSelectedGroup = ref('')
const localSelectedSourceUrl = ref('')
const switchInputKey = ref(props.currentBook?.name?.trim() || '')
const failedCoverKeys = ref<Set<string>>(new Set())

const searchKey = computed({
  get: () => (isSwitchMode.value ? localSearchKey.value : shelfStore.searchKey),
  set: (v: string) => {
    if (isSwitchMode.value) localSearchKey.value = v
    else shelfStore.searchKey = v
  },
})

const results = computed<SearchBook[]>({
  get: () => (isSwitchMode.value ? localSearchResults.value : shelfStore.searchResults),
  set: (v: SearchBook[]) => {
    if (isSwitchMode.value) localSearchResults.value = v
    else shelfStore.searchResults = v
  },
})

const isSearching = computed({
  get: () => (isSwitchMode.value ? localIsSearching.value : shelfStore.isSearching),
  set: (v: boolean) => {
    if (isSwitchMode.value) localIsSearching.value = v
    else shelfStore.isSearching = v
  },
})

const searchScope = computed<'all' | 'group' | 'source'>({
  get: () => (isSwitchMode.value ? localSearchScope.value : shelfStore.searchScope),
  set: (v: 'all' | 'group' | 'source') => {
    if (isSwitchMode.value) localSearchScope.value = v
    else shelfStore.searchScope = v
  },
})

const selectedGroup = computed({
  get: () => (isSwitchMode.value ? localSelectedGroup.value : shelfStore.searchGroup),
  set: (v: string) => {
    if (isSwitchMode.value) localSelectedGroup.value = v
    else shelfStore.searchGroup = v
  },
})

const selectedSourceUrl = computed({
  get: () => (isSwitchMode.value ? localSelectedSourceUrl.value : shelfStore.searchSourceUrl),
  set: (v: string) => {
    if (isSwitchMode.value) localSelectedSourceUrl.value = v
    else shelfStore.searchSourceUrl = v
  },
})

watch(() => props.currentBook?.name, (name) => {
  if (!isSwitchMode.value) return
  const trimmed = (name || '').trim()
  switchInputKey.value = trimmed
  localSearchKey.value = trimmed
})

const currentSourceLabel = computed(() => {
  const book = props.currentBook
  if (!book) return ''
  return book.originName || sourceByUrl.value.get(book.origin)?.bookSourceName || book.origin
})

function markCoverFailed(book: Book | SearchBook) {
  const key = `${book.origin}::${book.bookUrl}`
  if (failedCoverKeys.value.has(key)) return
  const next = new Set(failedCoverKeys.value)
  next.add(key)
  failedCoverKeys.value = next
}

function isPreviewBook(book: Book | SearchBook) {
  return Boolean(
    previewBook.value
    && previewBook.value.origin === book.origin
    && previewBook.value.bookUrl === book.bookUrl,
  )
}

function isCurrentSourceBook(book: Book | SearchBook) {
  const cur = props.currentBook
  if (!isSwitchMode.value || !cur) return false
  return cur.origin === book.origin && cur.bookUrl === book.bookUrl
}

function isInShelf(book: Book | SearchBook) {
  return shelfBookUrls.value.has(book.bookUrl) || shelfBookKeys.value.has(shelfMatchKey(book))
}

function submitSwitchSearch() {
  const next = switchInputKey.value.trim()
  if (!next) return
  if (localSearchKey.value === next) {
    doSearch(next, true)
  } else {
    localSearchKey.value = next
  }
}

function stopCurrentSearch() {
  searchGeneration += 1
  closeEventSource()
  isSearching.value = false
}

function handleSwitchToBook(book: Book | SearchBook, chapter?: BookChapter | null) {
  emit('switch-source', { book, chapter: chapter ?? null })
}

let eventSource: SseLike | null = null
let searchGeneration = 0
/**
 * 当前这轮搜索已经收到第几个书源（后端 `lastIndex`）。
 *
 * 续搜断点：搜索进行中进阅读页会关流，回来时从这里接着要后面的批次。
 * 每轮新搜索开始时置 -1。
 */
let searchLastIndex = -1
/**
 * 当前已经拉到的搜索页（每个书源各自的 page）。
 *
 * 多源搜索的“更多”有两层：书源清单还没走完（`lastIndex < 总数`），以及
 * 同一批书源还有下一页（legado 滚动到底 `searchPage++`）。第二层以前完全
 * 缺失，所以 JSON 接口站点（如搬山人）只能看到第 1 页。
 */
const searchPage = ref(1)
/** 本次搜索后端是否报告「这一页还有结果」。 */
const hasMorePages = ref(false)
/** 后端是否还有未扫描的书源（分批续扫时用）。 */
const hasMoreSources = ref(false)
/** 当前页（可能分几次扫完书源）是否已经收到过任意结果。 */
let pageHadResults = false
const coverCacheSession = createCoverCacheSession()
/**
 * 搜索结果的会话缓存。
 *
 * **注意 `<script setup>` 的顶层代码在 `setup()` 里执行，每个实例一份** ——
 * 这里写 `createSearchSessionCache()` 会是「每次挂载一个新的空缓存」，进阅读页
 * 卸载后就没了，返回时命中不了。所以必须从 utils 里取模块级单例。
 */
const searchSessionCache = getSearchSessionCache()
/** 本次结果是不是直接来自缓存（决定要不要提示「已显示上次结果」）。 */
const resultsFromCache = ref(false)
const resultsContainerRef = ref<HTMLElement | null>(null)
const booksPaneRef = ref<HTMLElement | null>(null)
const showBookDetail = ref(false)
const selectedBook = ref<Book | SearchBook | null>(null)

const sourceByUrl = computed(() => {
  return new Map(sourceStore.sources.map((source) => [source.bookSourceUrl, source]))
})

// 已在书架的书 URL 集合，用于搜索卡片显示「已加入」。
const shelfBookUrls = computed(() => {
  return new Set(shelfStore.books.map((book) => book.bookUrl))
})

const shelfBookKeys = computed(() => {
  // 用 shelfMatchKey 而不是 searchMergeKey: 后者会把本地《遮天》和网络《遮天》
  // 并成一本, 导致搜索卡片错误地显示「已加入」。
  return new Set(shelfStore.books.map((book) => shelfMatchKey(book)))
})

const sourceGroups = computed(() => {
  const groups = new Set<string>()
  for (const source of sourceStore.sources.filter((item) => item.enabled !== false)) {
    const parts = (source.bookSourceGroup || '')
      .split(/[;,，；、|/]/)
      .map((item) => item.trim())
      .filter(Boolean)
    for (const group of parts) {
      groups.add(group)
    }
  }
  return Array.from(groups).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
})

const sourceOptions = computed(() => {
  return [...sourceStore.sources]
    .filter((source) => source.enabled !== false)
    .sort((a, b) => {
      const orderDiff = (a.customOrder ?? 0) - (b.customOrder ?? 0)
      if (orderDiff !== 0) return orderDiff
      return a.bookSourceName.localeCompare(b.bookSourceName, 'zh-Hans-CN')
    })
})

const enabledSourceUrls = computed(() => {
  return new Set(sourceOptions.value.map((source) => source.bookSourceUrl))
})

const enabledSourceSignature = computed(() => {
  return sourceOptions.value.map((source) => source.bookSourceUrl).join('\n')
})

/** 全部命中结果(已完成按书源可用性与相关度过滤排序)。 */
const rankedResults = computed<SearchBook[]>(() => {
  const enriched: SearchBook[] = []
  for (const book of results.value) {
    const validCandidates = book.sourceCandidates?.filter((candidate) => (
      enabledSourceUrls.value.has(candidate.origin)
    ))
    const validUrls = book.bookSourceUrls?.filter((url) => enabledSourceUrls.value.has(url))
    let activeBook: SearchBook | null = null
    if (enabledSourceUrls.value.has(book.origin)) {
      activeBook = book
    } else if (validCandidates && validCandidates.length > 0) {
      // 原主书源被禁用/删除时，自动提升剩余可用候选书源，无需重新搜索
      activeBook = {
        ...book,
        ...validCandidates[0],
      }
    }
    if (!activeBook) continue
    const source = sourceByUrl.value.get(activeBook.origin)
    enriched.push({
      ...activeBook,
      bookSourceUrls: validUrls,
      sourceCandidates: validCandidates,
      originName: activeBook.originName || source?.bookSourceName || activeBook.origin,
      originGroup: source?.bookSourceGroup ?? activeBook.originGroup,
    })
  }
  return rankSearchResults(enriched, searchKey.value)
})

type ResultSourceSummary = {
  origin: string
  name: string
  count: number
}

const activeResultSourceUrl = ref('')
const INITIAL_VISIBLE_BOOKS = 60
const VISIBLE_BOOKS_STEP = 60
const visibleBookLimit = ref(INITIAL_VISIBLE_BOOKS)

const resultSourceSummaries = computed<ResultSourceSummary[]>(() => {
  const counts = new Map<string, number>()
  for (const book of rankedResults.value) {
    const origins = new Set<string>()
    if (book.sourceCandidates?.length) {
      for (const c of book.sourceCandidates) {
        if (c.origin) origins.add(c.origin)
      }
    } else if (book.bookSourceUrls?.length) {
      for (const u of book.bookSourceUrls) {
        if (u) origins.add(u)
      }
    }
    if (book.origin) origins.add(book.origin)
    for (const origin of origins) {
      counts.set(origin, (counts.get(origin) || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([origin, count]) => ({
      origin,
      name: sourceByUrl.value.get(origin)?.bookSourceName || origin,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'))
})

function selectResultSource(origin: string) {
  if (activeResultSourceUrl.value === origin) return
  activeResultSourceUrl.value = origin
  visibleBookLimit.value = INITIAL_VISIBLE_BOOKS
  nextTick(() => {
    booksPaneRef.value?.scrollTo({ top: 0 })
  })
}

watch(resultSourceSummaries, (list) => {
  if (activeResultSourceUrl.value && !list.some((item) => item.origin === activeResultSourceUrl.value)) {
    selectResultSource('')
  }
})

watch(searchKey, () => {
  activeResultSourceUrl.value = ''
  visibleBookLimit.value = INITIAL_VISIBLE_BOOKS
})

const displayedResults = computed<SearchBook[]>(() => {
  const targetOrigin = activeResultSourceUrl.value
  if (!targetOrigin) return rankedResults.value
  const matched: SearchBook[] = []
  for (const book of rankedResults.value) {
    if (book.origin === targetOrigin) {
      matched.push(book)
      continue
    }
    const candidate = book.sourceCandidates?.find((c) => c.origin === targetOrigin)
    if (candidate) {
      const source = sourceByUrl.value.get(targetOrigin)
      matched.push({
        ...book,
        ...candidate,
        originName: candidate.originName || source?.bookSourceName || targetOrigin,
        originGroup: source?.bookSourceGroup ?? candidate.originGroup,
        bookSourceUrls: book.bookSourceUrls,
        sourceCandidates: book.sourceCandidates,
      })
      continue
    }
    if (book.bookSourceUrls?.includes(targetOrigin)) {
      matched.push(book)
    }
  }
  return matched
})

const renderedResults = computed<SearchBook[]>(() => {
  return displayedResults.value.slice(0, visibleBookLimit.value)
})

function showMoreRenderedBooks() {
  visibleBookLimit.value += VISIBLE_BOOKS_STEP
}

const moveGroupTarget = ref<{ origin: string; name: string; currentGroup: string } | null>(null)
const moveGroupInput = ref('')
const moveGroupSaving = ref(false)

function openMoveGroupModal(item: ResultSourceSummary) {
  const source = sourceByUrl.value.get(item.origin)
  if (!source) return
  const currentGroup = (source.bookSourceGroup || '').trim()
  moveGroupTarget.value = {
    origin: item.origin,
    name: item.name,
    currentGroup,
  }
  moveGroupInput.value = currentGroup
}

function closeMoveGroupModal() {
  if (moveGroupSaving.value) return
  moveGroupTarget.value = null
  moveGroupInput.value = ''
}

async function confirmMoveSourceGroup() {
  const target = moveGroupTarget.value
  if (!target || moveGroupSaving.value) return
  const source = sourceByUrl.value.get(target.origin)
  if (!source) {
    closeMoveGroupModal()
    return
  }
  const nextGroup = moveGroupInput.value.trim()
  moveGroupSaving.value = true
  try {
    await saveBookSource({ ...source, bookSourceGroup: nextGroup })
    await sourceStore.fetchSources(true)
    appStore.showToast(
      `已将「${target.name}」移动到「${nextGroup || '未分组'}」`,
      'success',
    )
    moveGroupTarget.value = null
    moveGroupInput.value = ''
  } catch (e: unknown) {
    appStore.showToast((e as Error).message || '移动分组失败', 'error')
  } finally {
    moveGroupSaving.value = false
  }
}

function handleSourceContextMenu(item: ResultSourceSummary, event: MouseEvent) {
  const source = sourceByUrl.value.get(item.origin)
  showContextMenu(event, [
    {
      label: '置顶书源',
      action: async () => {
        try {
          await pinBookSource(item.origin)
          await sourceStore.fetchSources(true)
          appStore.showToast(`已置顶「${item.name}」`, 'success')
        } catch (e: unknown) {
          appStore.showToast((e as Error).message || '置顶书源失败', 'error')
        }
      },
    },
    {
      label: '移动到分组…',
      disabled: !source,
      action: () => {
        openMoveGroupModal(item)
      },
    },
    {
      label: '禁用此书源',
      disabled: !source,
      action: async () => {
        if (!source) return
        try {
          await saveBookSource({ ...source, enabled: false })
          await sourceStore.fetchSources(true)
          appStore.showToast(`已禁用「${item.name}」`, 'success')
        } catch (e: unknown) {
          appStore.showToast((e as Error).message || '禁用书源失败', 'error')
        }
      },
    },
    {
      label: '打开书源管理',
      action: () => {
        appStore.showSourceManager = true
      },
    },
    { divider: true },
    {
      label: '删除此书源',
      danger: true,
      action: async () => {
        const ok = await appStore.confirmDialog(`确定删除书源「${item.name}」？此操作不可撤销。`, {
          title: '删除书源',
          danger: true,
        })
        if (!ok) return
        try {
          await deleteBookSource(item.origin)
          await sourceStore.fetchSources(true)
          appStore.showToast(`已删除「${item.name}」`, 'success')
        } catch (e: unknown) {
          appStore.showToast((e as Error).message || '删除书源失败', 'error')
        }
      },
    },
  ])
}

const searchProgress = ref({ scanned: 0, totalSources: 0, failedCount: 0 })

const searchProgressText = computed(() => {
  const { scanned, totalSources, failedCount } = searchProgress.value
  const foundCount = rankedResults.value.length
  if (totalSources > 0) {
    const failPart = failedCount > 0 ? `，失败/超时 ${failedCount}` : ''
    return `搜索中… 已扫 ${Math.min(scanned, totalSources)} / ${totalSources} 个书源 · 找到 ${foundCount} 本${failPart}`
  }
  return foundCount > 0 ? `搜索中… 已找到 ${foundCount} 本` : '搜索中...'
})

const previewBook = ref<Book | SearchBook | null>(null)
const previewChapters = ref<BookChapter[]>([])
const previewTocLoading = ref(false)
const previewTocError = ref('')
let previewTocToken = 0

const selectedSearchChapter = ref<BookChapter | null>(null)
const selectedSearchContent = ref('')
const selectedSearchLoading = ref(false)
const selectedSearchError = ref('')
const searchPreviewCache = new Map<string, string>()
let searchPreviewToken = 0

const selectedSearchParagraphs = computed(() =>
  selectedSearchContent.value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean),
)

function resetSearchChapterPreview() {
  searchPreviewToken += 1
  selectedSearchChapter.value = null
  selectedSearchContent.value = ''
  selectedSearchLoading.value = false
  selectedSearchError.value = ''
}

function closeBookTocPreview() {
  previewBook.value = null
  previewChapters.value = []
  previewTocLoading.value = false
  previewTocError.value = ''
  previewTocToken += 1
  resetSearchChapterPreview()
}

async function openBookTocPreview(book: Book | SearchBook) {
  previewBook.value = book
  previewChapters.value = []
  previewTocError.value = ''
  previewTocLoading.value = true
  resetSearchChapterPreview()
  const token = ++previewTocToken
  try {
    let tocUrl = book.bookUrl
    try {
      const info = await getBookInfo(book.bookUrl, book.origin)
      if (token !== previewTocToken) return
      if (info?.tocUrl) tocUrl = info.tocUrl
    } catch {
      // 详情解析失败时仍尝试直接用 bookUrl 获取目录
    }
    const chapters = await getChapterList({
      bookUrl: book.bookUrl,
      tocUrl,
      bookSourceUrl: book.origin,
    })
    if (token !== previewTocToken) return
    previewChapters.value = Array.isArray(chapters) ? chapters : []
  } catch (e: unknown) {
    if (token !== previewTocToken) return
    previewTocError.value = (e as Error).message || '目录加载失败'
  } finally {
    if (token === previewTocToken) {
      previewTocLoading.value = false
    }
  }
}

async function selectSearchChapter(chapter: BookChapter) {
  const book = previewBook.value
  if (!book) return
  if (selectedSearchChapter.value?.url === chapter.url && selectedSearchChapter.value?.index === chapter.index) {
    return
  }
  selectedSearchChapter.value = chapter
  selectedSearchError.value = ''

  const cacheKey = `${book.origin}::${chapter.url}`
  const cached = searchPreviewCache.get(cacheKey)
  if (cached !== undefined) {
    selectedSearchContent.value = cached
    selectedSearchLoading.value = false
    return
  }

  selectedSearchLoading.value = true
  selectedSearchContent.value = ''
  const token = ++searchPreviewToken
  try {
    const content = await getBookContent({
      bookUrl: book.bookUrl,
      chapterUrl: chapter.url,
      bookSourceUrl: book.origin,
      chapterTitle: chapter.title,
      index: chapter.index,
    })
    if (token !== searchPreviewToken) return
    const text = typeof content === 'string' ? content : ''
    searchPreviewCache.set(cacheKey, text)
    selectedSearchContent.value = text || '（本章暂无正文内容）'
  } catch (e: unknown) {
    if (token !== searchPreviewToken) return
    selectedSearchError.value = (e as Error).message || '正文加载失败'
  } finally {
    if (token === searchPreviewToken) {
      selectedSearchLoading.value = false
    }
  }
}

watch(searchKey, () => {
  searchProgress.value = { scanned: 0, totalSources: 0, failedCount: 0 }
  closeBookTocPreview()
})

onUnmounted(() => {
  resetSearchChapterPreview()
})

/**
 * 拉下一批书源搜索结果。
 *
 * 先续完当前页剩余书源；全部书源都搜过且本页有结果时，再把每个书源的
 * `page` 加一并从第一个书源重新扫一遍 —— 与 legado `SearchModel.search()`
 * 的 `searchPage++` 语义一致。
 */
function loadMore() {
  if (isSearching.value) return
  const key = searchKey.value
  if (!key) return
  // 书源清单可能按分组/单源过滤，前端拿不到后端实际列表长度，
  // 因此只以后端的 `hasMore` 为准，不用 sourceOptions 猜。
  if (hasMoreSources.value) {
    continueSearchFrom(searchLastIndex + 1)
    return
  }
  if (!hasMorePages.value) return
  searchPage.value += 1
  // 新的一页必须从第一个书源重新扫: 沿用上一页的 lastIndex 会跳过
  // 新页前面的书源。
  searchLastIndex = -1
  pageHadResults = false
  continueSearchFrom(-1)
}

/** 从指定书源下标续拉当前搜索页（-1 = 从头开始）。 */
function continueSearchFrom(startIndex: number) {
  const key = searchKey.value
  if (!key) return
  const sessionKey = currentSearchSessionKey(key)
  isSearching.value = true
  streamSearch(key, sessionKey, startIndex, searchPage.value)
}

/** 滚动接近底部时先扩展本地渲染批次，已全部展示后再自动续拉后端下一页。 */
function handleResultsScroll() {
  const el = booksPaneRef.value || resultsContainerRef.value
  if (!el) return
  const { scrollTop, scrollHeight, clientHeight } = el
  if (scrollTop + clientHeight >= scrollHeight - 240) {
    if (visibleBookLimit.value < displayedResults.value.length) {
      visibleBookLimit.value += VISIBLE_BOOKS_STEP
      return
    }
    if (!isSearching.value) loadMore()
  }
}

function closeEventSource() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

/** 用户主动重搜当前条件（丢掉这份缓存）。 */
function refreshSearch() {
  const key = searchKey.value
  if (!key) return
  const sessionKey = currentSearchSessionKey(key)
  // 只丢当前这一组条件的结果；别把其它关键词的缓存也清掉。
  if (sessionKey) searchSessionCache.delete(sessionKey)
  doSearch(key, true)
}

/**
 * 「返回书架」= 主动结束这次搜索。
 *
 * 与「进阅读页」不同：那是临时离开，结果要留着（对齐 Legado 搜索页留在返回栈里）；
 * 用户点返回书架就是这次搜索看完了，缓存没有继续留着的意义 —— 下次再搜同一个词
 * 本来就该拿最新结果，而不是先给一份旧列表。
 *
 * 清「搜索会话缓存」统一由 `shelfStore.clearSearch()` 负责（顶栏的「清空搜索」
 * 也走同一条路径）；**封面缓存必须在这里释放** —— `onUnmounted` 为了支持
 * 「进阅读页再返回」故意不释放，如果这里也不放，离开搜索页后这批封面图就再也
 * 没有回收点了（后端 `public/cover` 磁盘缓存会一直留着）。
 */
function backToShelf() {
  resultsFromCache.value = false
  releaseSearchCovers()
  emit('back')
}

/** Release the previous search's covers without blocking the new search. */
function releaseSearchCovers() {
  coverCacheSession.release(shelfStore.books)
}

function ensureSearchSelection() {
  if (searchScope.value === 'group') {
    const selectedGroupStillValid = selectedGroup.value && sourceGroups.value.includes(selectedGroup.value)
    if (!selectedGroupStillValid && sourceGroups.value.length > 0) {
      selectedGroup.value = sourceGroups.value[0]
    } else if (sourceGroups.value.length === 0 && sourceOptions.value.length > 0) {
      // 没有任何书源分组时自动回落到全部书源，避免卡在空分组
      searchScope.value = 'all'
    }
  }
  if (searchScope.value === 'source') {
    const selectedSourceStillValid = sourceOptions.value.some((source) => source.bookSourceUrl === selectedSourceUrl.value)
    if (!selectedSourceStillValid && sourceOptions.value.length > 0) {
      selectedSourceUrl.value = sourceOptions.value[0].bookSourceUrl
    }
  }
}

/** 当前搜索条件对应的缓存键。 */
function currentSearchSessionKey(key = searchKey.value): string {
  return searchSessionKey({
    keyword: key,
    scope: searchScope.value,
    group: selectedGroup.value,
    sourceUrl: selectedSourceUrl.value,
  })
}

/**
 * 填充搜索结果。
 *
 *  `force = false`（打开搜索页 / 回到搜索页）：命中会话缓存就直接铺出来，
 *  **不发任何请求** —— 从阅读页返回时不该重新搜一遍。
 *  `force = true`（改关键词/改范围/点刷新）：真正发请求，并覆盖缓存。
 */
function doSearch(key: string, force = false) {
  closeEventSource()
  // 这里的自增只是为了**作废在途回调**（关流前发出去的消息不该再写状态）。
  // 真正的 `generation` 在 `streamSearch()` 里再取一次，两处语义不同，别合并。
  searchGeneration += 1
  searchLastIndex = -1
  searchPage.value = 1
  hasMorePages.value = false
  hasMoreSources.value = false
  pageHadResults = false

  if (searchScope.value === 'group' && !selectedGroup.value) {
    releaseSearchCovers()
    results.value = []
    isSearching.value = false
    return
  }

  if (searchScope.value === 'source' && !selectedSourceUrl.value) {
    releaseSearchCovers()
    results.value = []
    isSearching.value = false
    return
  }

  const sessionKey = currentSearchSessionKey(key)
  if (!force && sessionKey) {
    const cached = searchSessionCache.get(sessionKey)
    if (cached) {
      // 直接复用离开前的结果：用户从阅读页退回时看到的还是同一批书，
      // 不会又等一次全量搜索、也不会因为批次没回来而少一半。
      // **不能在这里 releaseSearchCovers()** —— 那会把刚复用的封面也清掉，
      // 结果页会整屏重新下载图片。
      results.value = cached.results.slice()
      resultsFromCache.value = true
      // 断点要在续搜前恢复：`streamSearch` 里每次落库都读它。
      searchLastIndex = cached.lastIndex
      // 旧缓存条目没有这些字段（热更新/老进程内条目），不能直接参与
      // Math.max —— `Math.max(1, undefined)` 是 NaN，会让请求页码变成 NaN。
      const cachedPage = Number.isFinite(cached.page) ? Math.floor(cached.page) : 1
      searchPage.value = Math.max(1, cachedPage)
      hasMorePages.value = Boolean(cached.morePages)
      hasMoreSources.value = Boolean(cached.moreSources)
      // 续搜只覆盖剩余书源: 之前批次已拿到的结果无法从缓存字段区分,
      // 按「有」处理, 避免剩余批次恰好为空时误判整页无结果。
      const resumedMidPage = !cached.complete && cached.lastIndex >= 0 && hasMoreSources.value
      pageHadResults = resumedMidPage || hasMorePages.value
      // 未完成 + 已过保质期：断点续搜没有意义了（那个 key 是对旧书源列表算的，
      // 隔太久书源可能已经增删过），直接按新搜索重跑，别拿过期结果垫底。
      const expiredAndIncomplete = !cached.complete && searchSessionCache.isStale(cached)
      if (cached.complete) {
        isSearching.value = false
      } else if (expiredAndIncomplete) {
        searchSessionCache.delete(sessionKey)
        resultsFromCache.value = false
        results.value = []
        isSearching.value = true
        searchLastIndex = -1
        searchPage.value = 1
        hasMorePages.value = false
        hasMoreSources.value = false
        pageHadResults = false
        streamSearch(key, sessionKey, -1, 1)
      } else {
        // 上次还没搜完就离开了（典型：搜索进行中点书进阅读页）。
        // 手机端这时搜索仍在 SearchViewModel 里继续跑，回来接着看即可；
        // 本项目的搜索页组件会被卸载、流也随之关闭，所以这里**续搜**：
        // 先把已有结果摆出来，再从断点接着要后面的批次，而不是从头再来。
        isSearching.value = true
        streamSearch(key, sessionKey, cached.lastIndex, Math.max(1, cached.page))
      }
      nextTick(() => {
        resultsContainerRef.value?.scrollTo({ top: 0 })
        // 缓存里可能还有下一页且结果不足一屏: 没有分页按钮后, 只能靠
        // 这里补一次触底判断。
        handleResultsScroll()
      })
      return
    }
  }

  // 走到这里才是真正的重新搜索: 上一批结果的封面此时可以释放了。
  releaseSearchCovers()
  resultsFromCache.value = false

  results.value = []
  isSearching.value = true
  streamSearch(key, sessionKey, -1, 1)
}

/**
 * 跑一轮书源搜索（从 `startIndex` 开始，-1 表示第一页）。
 *
 * 抽成独立函数是因为两个入口都要用：全新搜索，以及「上次没搜完」的续搜。
 *
 * 与 Legado 的对照：手机端搜索跑在 `SearchViewModel` + `SearchModel` 里，页面
 * 离开只是 `pause()`，回来 `resume()` 接着推。这里没有常驻 ViewModel，只能在
 * 重新挂载时根据缓存里的 `lastIndex` 续上 —— 用户看到的连续性是一样的。
 */
function streamSearch(key: string, sessionKey: string, startIndex: number, pageNo = searchPage.value) {
  const generation = ++searchGeneration

  const stream = searchBookMultiSSE({
    key,
    page: pageNo,
    concurrentCount: 24,
    bookSourceGroup: searchScope.value === 'group' ? selectedGroup.value : undefined,
    bookSourceUrl: searchScope.value === 'source' ? selectedSourceUrl.value : undefined,
    lastIndex: startIndex,
  })
  eventSource = stream

  const isCurrentSearch = () => (
    generation === searchGeneration
    && eventSource === stream
    && searchKey.value === key
  )

  /** 落缓存。
   *
   *  **每收到一批就写一次**（而不是等 end）：这样搜索进行中进阅读页、组件卸载，
   *  已经拿到的结果也不会丢 —— 这正是「搜索没完就离开、回来又要重搜」的根因。
   *  手机端是靠 ViewModel 常驻实现的，这里靠边收边存。
   *
   *  `complete` 为 false 时记下 `lastIndex`，回来可以续搜。
   *
   *  **不能复用 `isCurrentSearch()`**：它含 `eventSource === stream`，而调用点
   *  多在 `eventSource = null` 之后，一判就 false —— 缓存会静默地写不进去。 */
  const commitSession = (
    complete: boolean,
    lastIndex: number,
    page = searchPage.value,
    morePages = hasMorePages.value,
    moreSources = hasMoreSources.value,
  ) => {
    if (!sessionKey || generation !== searchGeneration) return
    if (searchKey.value !== key) return
    searchSessionCache.set(
      sessionKey,
      key,
      results.value.slice(),
      complete,
      lastIndex,
      page,
      morePages,
      moreSources,
    )
  }

  stream.onmessage = (event) => {
    if (!isCurrentSearch()) return
    try {
      const data = event.data as {
        data?: SearchBook[]
        lastIndex?: number
        scanned?: number
        totalSources?: number
        failedCount?: number
      }
      if (typeof data.scanned === 'number') {
        searchProgress.value.scanned = Math.max(searchProgress.value.scanned, data.scanned)
      }
      if (typeof data.totalSources === 'number') {
        searchProgress.value.totalSources = data.totalSources
      }
      if (typeof data.failedCount === 'number') {
        searchProgress.value.failedCount = Math.max(searchProgress.value.failedCount, data.failedCount)
      }
      if (data.data && Array.isArray(data.data)) {
        if (data.data.length > 0) pageHadResults = true
        const byKey = new Map(results.value.map((r) => [searchMergeKey(r), r]))
        coverCacheSession.collect(data.data)
        for (const b of data.data) {
          if (!isSearchResultRelevant(b, key)) continue
          const mergeKey = searchMergeKey(b)
          const existing = byKey.get(mergeKey)
          if (existing) {
            byKey.set(mergeKey, mergeSearchResult(existing, b))
          } else {
            byKey.set(mergeKey, initializeSearchResult(b))
          }
        }
        results.value = Array.from(byKey.values())
        // 边收边存：中途离开也不至于什么都没有。
        const nextIndex = typeof data.lastIndex === 'number' ? data.lastIndex : searchLastIndex
        // 书源按完成顺序到达, 断点只能前进不能回退。
        searchLastIndex = Math.max(searchLastIndex, nextIndex)
        commitSession(false, searchLastIndex, searchPage.value, false)
      }
    } catch { /* skip */ }
  }

  stream.addEventListener('end', (event) => {
    if (!isCurrentSearch()) return
    const payload = event.data as {
      lastIndex?: number
      hasMore?: boolean
      hasMorePages?: boolean
      scanned?: number
      totalSources?: number
      failedCount?: number
    }
    if (typeof payload?.scanned === 'number') {
      searchProgress.value.scanned = Math.max(searchProgress.value.scanned, payload.scanned)
    }
    if (typeof payload?.totalSources === 'number') {
      searchProgress.value.totalSources = payload.totalSources
    }
    if (typeof payload?.failedCount === 'number') {
      searchProgress.value.failedCount = Math.max(searchProgress.value.failedCount, payload.failedCount)
    }
    if (typeof payload?.lastIndex === 'number') {
      searchLastIndex = Math.max(searchLastIndex, payload.lastIndex)
    }
    isSearching.value = false
    stream.close()
    eventSource = null
    // 单次续拉只覆盖部分书源时, `hasMorePages` 仅代表这一批; 同一页
    // 可能分多批扫完, 所以只要本页任一批有结果就算“这页还有下一页”。
    // 与 legado `SearchModel` 的 `hasMore = hasMore || items.isNotEmpty()`
    // 一致: 搜索结果不做“重复页”推断, 空页才停。
    hasMorePages.value = pageHadResults || payload?.hasMorePages === true
    hasMoreSources.value = payload?.hasMore === true
    // 还有更多（后端分页）时不能标 complete，否则回来不会再续。
    // 「这一页的书源已经全部扫完」就是一个可复用的完整快照；是否还有
    // 下一页由 hasMorePages 单独携带，不应让缓存一直处于 incomplete 而
    // 在从阅读页返回时多发一次空请求。
    commitSession(!hasMoreSources.value, searchLastIndex)
    // 结果不足一屏时滚动事件不会触发, 这里主动补一次加载, 否则用户
    // 看不到任何继续加载的入口。
    nextTick(() => handleResultsScroll())
  })

  stream.addEventListener('error', () => {
    if (!isCurrentSearch()) return
    isSearching.value = false
    stream.close()
    eventSource = null
    commitSession(false, searchLastIndex)
  })

  stream.onerror = () => {
    if (!isCurrentSearch()) return
    isSearching.value = false
    stream.close()
    eventSource = null
    commitSession(false, searchLastIndex)
  }
}

/**
 * 是否还允许读会话缓存。
 *
 * `immediate: true` 的首次触发代表「进入/返回搜索页」—— 这时优先复用上次结果，
 * 这是本次改动的核心（从阅读页退回不该重搜）。之后任何一次触发都源于用户改了
 * 关键词/范围，那本来就该重新搜。
 *
 * 每个组件实例初始为 true：从阅读页返回时组件是新建的，于是又会先读缓存。
 *
 * 注意不能一进 watch 就把它置 false：`ensureSearchSelection()` 会在书源列表
 * 到位后补一个 group/source 选项，那会再触发一次本 watch。若那时已经置 false，
 * 首次挂载就变成了"强制重搜"，缓存等于没用。所以只在**真正发起搜索**后才
 * 关闭，并且用 `lastSearchedSessionKey` 让同一条件不重复搜。
 */
let mayUseSessionCache = true
/** 上一次真正发起请求（或命中缓存）所对应的条件键，用于去重。 */
let lastSessionKey = ''

watch(
  [searchKey, searchScope, selectedGroup, selectedSourceUrl],
  ([key]) => {
    ensureSearchSelection()
    if (key) {
      const sessionKey = currentSearchSessionKey(key)
      // 同一条件被重复触发（ensureSearchSelection 补齐选项导致的重入）时直接
      // 跳过：结果已经在屏幕上了，没有任何理由再搜一次。
      if (sessionKey && sessionKey === lastSessionKey) return
      doSearch(key, !mayUseSessionCache)
      mayUseSessionCache = false
      lastSessionKey = sessionKey
    } else {
      lastSessionKey = ''
      mayUseSessionCache = true
      searchGeneration += 1
      closeEventSource()
      results.value = []
      isSearching.value = false
      resultsFromCache.value = false
    }
  },
  { immediate: true }
)

watch([searchScope, sourceGroups, sourceOptions], () => {
  ensureSearchSelection()
}, { immediate: true })

/**
 * 是否需要因为「书源清单变化」而重搜。
 *
 * 两个坑都要避开：
 * 1. `onMounted` 里 `fetchSources(true)` 是**每次都拉**，首次挂载时签名会从
 *    空串变成完整清单 —— 若直接重搜，刚命中缓存的页面立刻又发起一次全量
 *    搜索，「返回不重搜」当场失效。
 * 2. 书源列表本来就还没加载完（签名是空）时也不能当成"变了"。
 *
 * 所以只在「两边都非空、且真的不同」时才重搜。
 */
let mountedSourceSignature = ''

watch(enabledSourceSignature, (next, previous) => {
  if (previewBook.value && !enabledSourceUrls.value.has(previewBook.value.origin)) {
    closeBookTocPreview()
  }
  const baseline = mountedSourceSignature
  if (!shouldResearchForSourceChange({
    hasSearchKey: Boolean(searchKey.value),
    previous,
    next,
    baseline,
  })) {
    // 禁用/删除/重排书源不触发重搜，同时同步基线，以便后续重新启用时仍能识别为新增。
    if (next) mountedSourceSignature = next
    return
  }
  mountedSourceSignature = next
  // 仅在新增/启用了新书源时重搜。
  doSearch(searchKey.value, true)
})

onMounted(async () => {
  // Always refresh the source list on mount so the group/source dropdowns
  // reflect any add/delete/edit done in the source manager since last visit.
  await sourceStore.fetchSources(true).catch(() => undefined)
  ensureSearchSelection()
  mountedSourceSignature = enabledSourceSignature.value
})

onUnmounted(() => {
  // 卸载前补一次落库：虽然每收到一批就写过了，但「最后一批刚 push 完就切走」
  // 这种时刻，响应式赋值与写缓存之间可能还没轮到执行 —— 补这一次能兜住。
  // 此刻仍然 `isSearching` 说明搜索没跑完，标 incomplete 让回来时续搜。
  const key = searchKey.value
  if (key) {
    const sessionKey = currentSearchSessionKey(key)
    if (sessionKey && results.value.length) {
      searchSessionCache.set(
        sessionKey,
        key,
        results.value.slice(),
        !isSearching.value
          && searchLastIndex >= 0
          && !hasMoreSources.value,
        searchLastIndex,
        searchPage.value,
        hasMorePages.value,
        hasMoreSources.value,
      )
    }
  }
  searchGeneration += 1
  closeEventSource()
  // 封面缓存要不要释放，看**这次卸载是不是搜索结束**：
  // - `searchKey` 已清空 = `clearSearch()`（返回书架 / 顶栏清空搜索）导致的卸载，
  //   这轮搜索结束了，封面没有留着的理由 → 释放，否则这批图再没有回收点。
  // - `searchKey` 还在 = 进阅读页/详情页的临时离开，组件会重建。此时释放会让
  //   返回后整屏几十上百张封面重新下载（看起来像"又搜了一遍"，还更卡）→ 保留。
  if (!isSwitchMode.value && !searchKey.value) releaseSearchCovers()
})

// Clicking a search result (card body or cover) always opens the detail modal.
// Reading only happens via the "开始阅读" button in the modal.
function handleBookClick(book: Book | SearchBook) {
  selectedBook.value = book
  showBookDetail.value = true
}

function handleBookInfo(book: Book | SearchBook) {
  selectedBook.value = book
  showBookDetail.value = true
}

async function handleAddToShelf(book: Book | SearchBook) {
  // 函数级判重, 不能只靠 UI 置灰: 卡片禁用与右键菜单都依赖 shelfStore.books
  // 已加载, 一旦它还是空(启动竞态/加载失败被静默吞掉), 两层拦截都会失效,
  // 点下去就会走 save_book 的整条覆盖分支 —— 这里只提交 6 个字段, 会把用户
  // 自定义的封面、简介、original_* 等一并清空。
  if (isBookOnShelf(book, shelfStore.books)) {
    appStore.showToast(`"${book.name}" 已在书架中`, 'warning')
    return
  }
  try {
    await saveBook({
      name: book.name,
      author: book.author,
      bookUrl: book.bookUrl,
      origin: book.origin,
      coverUrl: book.coverUrl,
      sourceCandidates: (book as SearchBook).sourceCandidates,
    })
    await shelfStore.fetchBooks()
    appStore.showToast('成功加入书架', 'success')
  } catch (e: unknown) {
    appStore.showToast((e as Error).message, 'error')
  }
}

function handleBookContextMenu({ book, event }: { book: Book | SearchBook; event: MouseEvent }) {
  if (isSwitchMode.value) {
    const isCurrent = isCurrentSourceBook(book)
    showContextMenu(event, [
      { label: '查看目录', action: () => openBookTocPreview(book) },
      { divider: true },
      isCurrent
        ? { label: '已是当前书源', disabled: true }
        : { label: '切换到此书源', action: () => handleSwitchToBook(book) },
    ], book)
    return
  }
  const inShelf = isInShelf(book)
  const menuItems = [
    { label: '查看目录', action: () => openBookTocPreview(book) },
    { label: '查看详情', action: () => handleBookInfo(book) },
    { divider: true },
    inShelf
      ? { label: '已在书架', disabled: true }
      : { label: '加入书架', action: () => handleAddToShelf(book) },
  ]
  showContextMenu(event, menuItems, book)
}
</script>

<style scoped>
.search-results {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 var(--space-6) var(--space-4);
}

.search-results.is-switch-mode {
  padding: 0 var(--space-4) var(--space-4);
  background: var(--color-bg);
  color: var(--color-text);
}

.search-results .search-body-layout {
  flex: 1;
  min-height: 0;
  align-items: stretch;
  overflow: hidden;
}

.search-results .search-sources-sidebar,
.search-results .search-toc-pane,
.search-results .search-content-pane {
  position: static;
  max-height: none;
  height: 100%;
}

.search-results .search-books-pane {
  height: 100%;
  overflow-y: auto;
  padding-right: 4px;
}

.search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) 0;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.search-header-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-header h2 {
  font-size: var(--text-xl);
  font-weight: 700;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.switch-book-badge {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-primary);
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.switch-current-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.search-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.switch-search-form {
  display: flex;
  align-items: center;
  gap: 6px;
}

.switch-search-input {
  width: 200px;
  height: 34px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  font-size: var(--text-sm);
}

.switch-search-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.result-count {
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--color-text-tertiary);
}

.searching-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--color-primary);
}

.dot-pulse {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary);
  animation: pulse 1.2s infinite ease-in-out;
}

@keyframes pulse {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.back-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  transition: all var(--duration-fast);
  cursor: pointer;
  background: transparent;
}

.back-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.back-btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.back-btn.primary:hover {
  opacity: 0.92;
  color: #fff;
}

/* 「缓存」角标：标出结果来自上次搜索，不是刚搜的；点它重新搜索。
   原来是单独一行提示条，既多占一行又容易重复渲染，收成一枚角标。 */
.cache-badge {
  display: inline-block;
  margin-left: var(--space-2);
  padding: 1px 6px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-tertiary);
  font-family: inherit;
  font-size: var(--text-xs);
  font-weight: 400;
  line-height: 1.6;
  vertical-align: middle;
  cursor: pointer;
  transition: color var(--duration-fast), border-color var(--duration-fast);
}

.cache-badge:hover {
  color: var(--color-primary);
  border-color: var(--color-primary-border);
}

.search-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.filter-tabs {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px;
  border-radius: var(--radius-full);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-light);
}

.filter-tab {
  min-height: 34px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  transition: all var(--duration-fast);
}

.filter-tab:hover {
  color: var(--color-text);
  background: var(--color-bg-hover);
}

.filter-tab.active {
  color: var(--color-primary-soft-text);
  background: var(--color-primary-soft-bg);
}

.filter-select-wrap {
  min-width: min(100%, 280px);
}

.filter-select {
  width: 100%;
  min-height: 40px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  font-size: var(--text-sm);
}

.search-body-layout {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  min-height: 0;
}

.search-sources-sidebar {
  width: 210px;
  flex-shrink: 0;
  position: sticky;
  top: var(--space-3);
  max-height: calc(100vh - 200px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border-light);
}

.sidebar-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-tertiary);
}

.sidebar-source-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-source-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-fast), color var(--duration-fast);
}

.sidebar-source-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.sidebar-source-item.active {
  background: var(--color-primary-soft-bg);
  color: var(--color-primary-soft-text);
  font-weight: 600;
}

.sidebar-source-name {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-source-count {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, var(--color-border) 55%, transparent);
  color: var(--color-text-secondary);
}

.sidebar-source-item.active .sidebar-source-count {
  background: color-mix(in srgb, var(--color-primary) 22%, transparent);
  color: var(--color-primary-soft-text);
}

.search-books-pane {
  flex: 1;
  min-width: 0;
}

.search-books-pane.is-split {
  flex: 0 0 350px;
  width: 350px;
}

.books-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 180px;
  padding: 28px 16px;
  border: 1px dashed var(--color-border-light);
  border-radius: var(--radius-lg);
  color: var(--color-text-tertiary);
  font-size: var(--text-sm);
}

.search-book-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-book-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-elevated);
  cursor: pointer;
  transition: border-color var(--duration-fast), background var(--duration-fast), box-shadow var(--duration-fast);
}

.search-book-row:hover {
  border-color: var(--color-primary-border);
  background: var(--color-bg-hover);
}

.search-book-row.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft-bg);
  box-shadow: 0 2px 10px color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.search-book-row.current {
  border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border-light));
}

.search-book-cover {
  width: 44px;
  height: 62px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--color-bg-hover);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.search-book-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.search-book-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(155deg, #2b4c6f 0%, #1c3148 100%);
  color: rgba(255, 255, 255, 0.9);
  font-size: 16px;
  font-weight: 700;
}

.search-book-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-book-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.search-book-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-book-meta-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.search-book-author {
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-book-chip {
  display: inline-flex;
  align-items: center;
  max-width: 130px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-book-chip.source {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
}

.search-book-chip.group {
  background: color-mix(in srgb, var(--color-border) 50%, transparent);
  color: var(--color-text-secondary);
}

.search-book-chip.multi {
  background: color-mix(in srgb, #10b981 14%, transparent);
  color: #059669;
}

.search-book-chip.current {
  background: var(--color-primary);
  color: #fff;
  flex-shrink: 0;
}

.search-book-latest {
  font-size: 12px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-book-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.row-action-btn {
  padding: 5px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--duration-fast);
}

.row-action-btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.row-action-btn.primary:hover:not(:disabled) {
  opacity: 0.9;
}

.row-action-btn.muted {
  background: color-mix(in srgb, var(--color-border) 40%, transparent);
  border-color: transparent;
  color: var(--color-text-tertiary);
  cursor: default;
}

.row-action-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.search-toc-pane {
  flex: 0 0 260px;
  width: 260px;
  position: sticky;
  top: var(--space-3);
  max-height: calc(100vh - 200px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  overflow: hidden;
}

.search-content-pane {
  flex: 1;
  min-width: 260px;
  position: sticky;
  top: var(--space-3);
  max-height: calc(100vh - 200px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  overflow: hidden;
}

.toc-pane-title {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toc-pane-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.toc-mini-btn {
  padding: 2px 8px;
  border-radius: 5px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.toc-mini-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.toc-mini-btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.pane-placeholder {
  padding: 28px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.search-preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 28px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-text);
}

.search-preview-body p {
  margin: 0 0 0.9em;
  text-indent: 2em;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 1080px) {
  .search-content-pane {
    display: none;
  }
}

@media (max-width: 720px) {
  .search-body-layout {
    flex-direction: column;
  }

  .search-sources-sidebar {
    width: 100%;
    position: static;
    max-height: none;
  }

  .sidebar-source-list {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .sidebar-source-item {
    width: auto;
    flex-shrink: 0;
  }

  .search-results {
    padding: 0 var(--space-4);
  }

  .search-header {
    flex-direction: column;
    align-items: stretch;
  }

  .search-header h2 {
    flex-wrap: wrap;
  }

  .back-btn {
    justify-content: center;
  }

  .filter-tabs {
    width: 100%;
    justify-content: space-between;
  }

  .filter-tab {
    flex: 1;
    padding: 0 var(--space-2);
  }

  .filter-select-wrap {
    width: 100%;
    min-width: 0;
  }
}

.books-load-more-btn {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--duration-fast), color var(--duration-fast), border-color var(--duration-fast);
}

.books-load-more-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
  border-color: var(--color-primary-border);
}

.move-group-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-toast) + 30);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.move-group-dialog {
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  box-shadow: var(--shadow-xl);
}

.move-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.move-group-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.move-group-source-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--color-bg-hover);
}

.move-group-source-name {
  font-size: 14px;
  font-weight: 600;
}

.move-group-source-current {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.move-group-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.move-group-field label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.move-group-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 13px;
  box-sizing: border-box;
}

.move-group-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.move-group-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 140px;
  overflow-y: auto;
}

.move-group-chip {
  padding: 4px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--duration-fast);
}

.move-group-chip:hover {
  border-color: var(--color-primary-border);
  color: var(--color-text);
}

.move-group-chip.active {
  background: var(--color-primary-soft-bg);
  border-color: var(--color-primary);
  color: var(--color-primary-soft-text);
  font-weight: 600;
}

.move-group-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}
</style>
