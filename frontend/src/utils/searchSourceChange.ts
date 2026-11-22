/**
 * 「书源清单变化要不要重搜」的判定。
 *
 * 这段逻辑原来写在 SearchResults 的 watch 里，有个会直接毁掉搜索缓存的坑：
 * `onMounted` 每次都 `fetchSources(true)`，首次挂载时签名从空串变成完整清单，
 * 若无条件重搜，刚命中缓存的页面马上又发起一次全量搜索 —— 用户看到的还是
 * 「返回后又搜索中」。抽成纯函数以便把几条分支都钉住。
 */
export function shouldResearchForSourceChange(params: {
  hasSearchKey: boolean
  previous: string
  next: string
  /** 本次挂载时记录的基线签名。 */
  baseline: string
}): boolean {
  if (!params.hasSearchKey) return false
  // 还没拿到清单（或第一次拿到）都不算「变化」。
  if (!params.next || !params.previous) return false
  if (params.next === params.previous) return false
  // 回到基线意味着只是重新拉了一遍同样的书源。
  if (params.next === params.baseline) return false
  // 禁用、删除、置顶重排书源时，前端 rankedResults 会直接响应式过滤掉已禁用/删除的书源，
  // 无需推倒重来发起新一轮搜索；仅当新增/重新启用了之前不在清单里的书源时才需要重搜。
  const prevSet = new Set(params.previous.split('\n').filter(Boolean))
  const nextUrls = params.next.split('\n').filter(Boolean)
  return nextUrls.some((url) => !prevSet.has(url))
}
