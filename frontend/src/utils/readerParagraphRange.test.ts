import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseReaderParagraph } from './readerParagraphRange'

class MockNode {
  nodeType: number
  parentNode: MockElement | null = null
  childNodes: MockNode[] = []
  textContent: string | null = null

  constructor(nodeType: number) {
    this.nodeType = nodeType
  }

  appendChild(child: MockNode) {
    child.parentNode = this as unknown as MockElement
    this.childNodes.push(child)
    return child
  }

  cloneNode(deep = false): MockNode {
    const copy = new MockNode(this.nodeType)
    copy.textContent = this.textContent
    if (deep) {
      this.childNodes.forEach((c) => copy.appendChild(c.cloneNode(true)))
    }
    return copy
  }
}

class MockText extends MockNode {
  constructor(text: string) {
    super(3)
    this.textContent = text
  }

  override cloneNode(): MockText {
    return new MockText(this.textContent || '')
  }
}

class MockElement extends MockNode {
  tagName: string
  attrs = new Map<string, string>()

  constructor(tagName: string) {
    super(1)
    this.tagName = tagName.toUpperCase()
  }

  set innerHTML(html: string) {
    this.childNodes = []
    const match = html.match(/^<([a-zA-Z0-9-]+)([^>]*)>([\s\S]*)<\/\1>$/)
    if (match) {
      const el = new MockElement(match[1])
      const attrRegex = /([a-zA-Z0-9-]+)="([^"]*)"/g
      let m: RegExpExecArray | null
      while ((m = attrRegex.exec(match[2])) !== null) {
        el.setAttribute(m[1], m[2])
      }
      if (match[3]) {
        el.appendChild(new MockText(match[3]))
      }
      this.appendChild(el)
    } else if (html.startsWith('<img')) {
      this.appendChild(new MockElement('img'))
    }
  }

  get firstElementChild(): MockElement | null {
    return (this.childNodes.find((n) => n instanceof MockElement) as MockElement | undefined) ?? null
  }

  get className(): string {
    return this.getAttribute('class') || ''
  }

  set className(val: string) {
    if (val) this.setAttribute('class', val)
    else this.removeAttribute('class')
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  removeAttribute(name: string) {
    this.attrs.delete(name)
  }

  get outerHTML(): string {
    const tag = this.tagName.toLowerCase()
    const attrStr = [...this.attrs.entries()]
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('')
    const inner = this.childNodes
      .map((c) => (c instanceof MockElement ? c.outerHTML : c.textContent || ''))
      .join('')
    return `<${tag}${attrStr}>${inner}</${tag}>`
  }

  override cloneNode(deep = false): MockElement {
    const copy = new MockElement(this.tagName)
    this.attrs.forEach((v, k) => copy.setAttribute(k, v))
    if (deep) {
      this.childNodes.forEach((c) => copy.appendChild(c.cloneNode(true)))
    }
    return copy
  }
}

function setupMockDom() {
  vi.stubGlobal('Node', { TEXT_NODE: 3 })
  vi.stubGlobal('Element', MockElement)
  vi.stubGlobal('HTMLElement', MockElement)
  vi.stubGlobal('document', {
    createElement: (tag: string) => new MockElement(tag),
    createRange: () => {
      let startNode: MockNode
      let startOffset = 0
      let endNode: MockNode
      let endOffset = 0
      return {
        setStart(node: MockNode, offset: number) {
          startNode = node
          startOffset = offset
        },
        setEnd(node: MockNode, offset: number) {
          endNode = node
          endOffset = offset
        },
        cloneContents() {
          const frag = new MockNode(11)
          const textNode = startNode instanceof MockText
            ? startNode
            : endNode instanceof MockText
              ? endNode
              : (startNode.childNodes[0] as MockText)
          const full = textNode?.textContent || ''
          const from = startNode instanceof MockText ? startOffset : 0
          const to = endNode instanceof MockText ? endOffset : full.length
          frag.appendChild(new MockText(full.slice(from, to)))
          return frag
        },
      }
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseReaderParagraph', () => {
  it('splits <p> paragraphs into character slices', () => {
    setupMockDom()
    const parsed = parseReaderParagraph('<p style="margin-bottom: 1em;">你好世界</p>')
    expect(parsed).not.toBeNull()
    expect(parsed!.tokens).toEqual(['你', '好', '世', '界'])
    expect(parsed!.slice(0, 2, '', 'reader-indent')).toBe('<p class="reader-indent">你好</p>')
    expect(parsed!.slice(2, 4, '', '')).toBe('<p>世界</p>')
  })

  it('splits <div>, <section>, <article>, and <blockquote> containers when oversized', () => {
    setupMockDom()
    const parsed = parseReaderParagraph('<div id="nr1">第一段第二段</div>')
    expect(parsed).not.toBeNull()
    expect(parsed!.tokens).toEqual(['第', '一', '段', '第', '二', '段'])
    expect(parsed!.slice(0, 3, '', '')).toBe('<div id="nr1">第一段</div>')
    expect(parsed!.slice(3, 6, '', '')).toBe('<div>第二段</div>')

    expect(parseReaderParagraph('<section>内容</section>')).not.toBeNull()
    expect(parseReaderParagraph('<article>内容</article>')).not.toBeNull()
    expect(parseReaderParagraph('<blockquote>引文</blockquote>')).not.toBeNull()
  })

  it('returns null for non-splittable elements like <table> or <img>', () => {
    setupMockDom()
    expect(parseReaderParagraph('<table><tr><td>cell</td></tr></table>')).toBeNull()
    expect(parseReaderParagraph('<img src="cover.jpg">')).toBeNull()
  })
})
