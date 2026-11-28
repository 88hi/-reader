import { describe, expect, it } from 'vitest'
import { parseReaderParagraph } from './readerParagraphRange'

describe('parseReaderParagraph', () => {
  it('splits <p> paragraphs into character slices', () => {
    const parsed = parseReaderParagraph('<p style="margin-bottom: 1em;">你好世界</p>')
    expect(parsed).not.toBeNull()
    expect(parsed!.tokens).toEqual(['你', '好', '世', '界'])
    expect(parsed!.slice(0, 2, '', 'reader-indent')).toBe('<p class="reader-indent">你好</p>')
    expect(parsed!.slice(2, 4, '', '')).toBe('<p>世界</p>')
  })

  it('splits <div>, <section>, <article>, and <blockquote> containers when oversized', () => {
    const parsed = parseReaderParagraph('<div id="nr1">第一段第二段</div>')
    expect(parsed).not.toBeNull()
    expect(parsed!.tokens).toEqual(['第', '一', '段', '第', '二', '段'])
    expect(parsed!.slice(0, 3, '', '')).toBe('<div id="nr1">第一段</div>')
    expect(parsed!.slice(3, 6, '', '')).toBe('<div>第二段</div>')

    expect(parseReaderParagraph('<section>内容</section>')).not.toBeNull()
    expect(parseReaderParagraph('<blockquote>引文</blockquote>')).not.toBeNull()
  })

  it('returns null for non-splittable elements like <table> or <img>', () => {
    expect(parseReaderParagraph('<table><tr><td>cell</td></tr></table>')).toBeNull()
    expect(parseReaderParagraph('<img src="cover.jpg">')).toBeNull()
  })
})
