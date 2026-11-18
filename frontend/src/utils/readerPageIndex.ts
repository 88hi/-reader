/** 左右分页的**页索引**工具。
 *
 *  这里刻意把两件事分开:
 *  - **屏宽** = 容器宽。一屏恰好一页, 翻页位移 = 索引 × 屏宽。
 *  - **行宽** = 设置里的「页面宽度」。只管页内正文列多宽; 窗口更宽时正文居中留白
 *    (见 `utils/readerTextWidth`)。
 *
 *  早期实现把两者混为一谈(屏宽 = min(容器宽, 页面宽度)): 1920 宽的窗口里每页只有
 *  800px, 一屏会同时露出当前页与下一页的左半, 右侧还留一大片空白。
 */

/** 启用双页显示所需的最小阅读容器宽度(像素)。窄屏下自动回落为单页, 避免两列过窄难以阅读。 */
export const READER_DUAL_PAGE_MIN_WIDTH = 560

/** 当前一屏并排显示的页数(单页 1 / 双页 2)。 */
export function getReaderSpreadSize(dualPage: boolean, containerWidth: number): 1 | 2 {
  if (!dualPage) return 1
  if (!Number.isFinite(containerWidth) || containerWidth < READER_DUAL_PAGE_MIN_WIDTH) return 1
  return 2
}

/** 把任意页索引对齐到所属屏(spread)的起始页索引。 */
export function getReaderSpreadStart(index: number, spreadSize: 1 | 2 = 1): number {
  const raw = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0
  if (spreadSize <= 1) return raw
  return Math.floor(raw / spreadSize) * spreadSize
}

/** 末页起始索引(单页为 页数 - 1, 双页为最后一屏的左页索引)。 */
export function getReaderLastPage(totalPages: number, spreadSize: 1 | 2 = 1): number {
  const total = Number.isFinite(totalPages) ? Math.floor(totalPages) : 0
  if (total <= 0) return 0
  if (spreadSize <= 1) return total - 1
  return Math.floor((total - 1) / spreadSize) * spreadSize
}

/** 把页索引夹进 `[0, 末页起始索引]` 并对齐到所属屏起始索引。
 *
 *  重建分页、滚动对齐、位置恢复都要过这一步: 页数变少后旧索引会指向不存在的页,
 *  画面会停在空白处。 */
export function clampReaderPageIndex(
  index: number,
  totalPages: number,
  spreadSize: 1 | 2 = 1,
): number {
  const lastPage = getReaderLastPage(totalPages, spreadSize)
  const raw = Number.isFinite(index) ? Math.floor(index) : 0
  const clamped = Math.max(0, Math.min(lastPage, raw))
  return getReaderSpreadStart(clamped, spreadSize)
}

/** 把阅读进度比例(0–1)换算成页索引。
 *
 *  排版参数或窗口尺寸变化后要重新分页, 此时按比例保留位置, 而不是跳回章首。 */
export function readerPageIndexFromProgress(
  progress: number,
  totalPages: number,
  spreadSize: 1 | 2 = 1,
): number {
  const total = Number.isFinite(totalPages) ? Math.floor(totalPages) : 0
  if (total <= 0) return 0
  const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  const lastPage = getReaderLastPage(total, spreadSize)
  if (lastPage <= 0) return 0
  const target = Math.round((safeProgress * lastPage) / spreadSize) * spreadSize
  return clampReaderPageIndex(target, total, spreadSize)
}

/** 「左右分页往前翻跨章」的落位页索引; 不该落位时返回 null。
 *
 *  往前翻到章首再翻一次会进上一章, 目标应是上一章的**末页** —— 新章第 0 页是标题页,
 *  落到那里看起来就像"翻页没生效"(用户会以为卡在标题页, 再翻一次又进了更上一章)。
 *
 *  两个必须同时满足的条件:
 *  - `intentIndex === currentIndex`: 换章才刚发生。若不比对, 残留的意图会在之后任意
 *    一次重建时把用户拽到末页。
 *  - `!loading`: 正文还在请求中时分页仍是**上一章**的, 此时落位会算错页数。 */
export function readerLandingPageIndexAfterPrevChapter(options: {
  intentIndex: number | null
  currentIndex: number
  loading: boolean
  totalPages: number
  spreadSize?: 1 | 2
}): number | null {
  const { intentIndex, currentIndex, loading, totalPages, spreadSize = 1 } = options
  if (intentIndex === null || loading) return null
  if (intentIndex !== currentIndex) return null
  return getReaderLastPage(totalPages, spreadSize)
}
