<template>
  <div class="reader-source-host">
    <SearchResults
      mode="switch-source"
      :current-book="store.book"
      :switch-loading="isSwitchingSource"
      @close="store.closePanel()"
      @switch-source="handleSwitchSource"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useReaderStore } from '../../stores/reader'
import SearchResults from '../SearchResults.vue'
import type { Book, BookChapter, SearchBook } from '../../types'

const store = useReaderStore()

const isSwitchingSource = computed(() => Boolean(store.switchingSource))

async function handleSwitchSource(payload: { book: Book | SearchBook; chapter?: BookChapter | null }) {
  const { book, chapter } = payload
  if (!book?.bookUrl || !book?.origin) return
  if (isSwitchingSource.value) return
  try {
    await store.switchSource(book.bookUrl, book.origin, {
      keepPanelOpen: false,
      targetChapterIndex: chapter ? chapter.index : undefined,
    })
  } catch {
    // 切换失败的 toast 提示已由 store.switchSource 内部处理
  }
}
</script>

<style scoped>
.reader-source-host {
  height: 100%;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
