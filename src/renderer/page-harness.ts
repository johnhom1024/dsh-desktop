import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

/**
 * Minimal fake DOM for unit-testing the host shell / settings pages without
 * launching Electron. Covers exactly the surface the inline page scripts use:
 * querySelector(All), innerHTML, textContent, value, checked, disabled,
 * classList, style, addEventListener/click/dispatchEvent, appendChild.
 */
export type HarnessElement = {
  readonly tagName: string
  textContent: string
  innerHTML: string
  className: string
  value: string
  checked: boolean
  disabled: boolean
  style: { display: string }
  classList: {
    add(name: string): void
    remove(name: string): void
    toggle(name: string, force?: boolean): void
  }
  querySelector(selector: string): HarnessElement | null
  querySelectorAll(selector: string): HarnessElement[]
  addEventListener(type: string, listener: () => void): void
  dispatchEvent(type: string): void
  click(): void
  appendChild(child: HarnessElement): void
}

export type HarnessDocument = {
  querySelector(selector: string): HarnessElement | null
  querySelectorAll(selector: string): HarnessElement[]
  createElement(tag: string): HarnessElement
}

type Attrs = Record<string, string>

type Rec = {
  tag: string
  attrs: Attrs
  children: Rec[]
  text: string
  listeners: Map<string, Array<() => void>>
  style: { display: string }
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr'])

function parseAttrs(raw: string): Attrs {
  const attrs: Attrs = {}
  const re = /([A-Za-z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
}

function parse(html: string): Rec[] {
  const root: Rec = { tag: '#root', attrs: {}, children: [], text: '', listeners: new Map(), style: { display: '' } }
  const stack = [root]
  const token = /<!--[\s\S]*?-->|<\/([A-Za-z0-9]+)[^>]*>|<([A-Za-z0-9]+)([^>]*)\/?>|([^<]+)/g
  let match: RegExpExecArray | null
  while ((match = token.exec(html))) {
    const cur = stack[stack.length - 1]
    if (!cur) continue
    if (match[0].startsWith('<!--')) continue
    if (match[1]) {
      while (stack.length > 1 && stack[stack.length - 1]?.tag !== match[1].toLowerCase()) stack.pop()
      if (stack.length > 1) stack.pop()
      continue
    }
    if (match[2]) {
      const tag = match[2].toLowerCase()
      const node: Rec = {
        tag,
        attrs: parseAttrs(match[3] ?? ''),
        children: [],
        text: '',
        listeners: new Map(),
        style: { display: '' },
      }
      cur.children.push(node)
      if (!VOID.has(tag) && !match[0].endsWith('/>')) stack.push(node)
      continue
    }
    cur.text += match[4] ?? ''
  }
  return root.children
}

function walk(nodes: Rec[], acc: Rec[] = []): Rec[] {
  for (const node of nodes) {
    acc.push(node)
    walk(node.children, acc)
  }
  return acc
}

function detach(node: Rec, registry: Rec[]): void {
  const index = registry.indexOf(node)
  if (index !== -1) registry.splice(index, 1)
  for (const child of node.children) detach(child, registry)
}

function textOf(node: Rec): string {
  return node.text + node.children.map(textOf).join('')
}

function matchSel(node: Rec, selector: string): boolean {
  if (selector.startsWith('#')) return node.attrs.id === selector.slice(1)
  const attr = selector.match(/^([A-Za-z0-9]+)?\[([A-Za-z0-9_-]+)(?:="([^"]*)")?\]$/)
  if (attr) {
    if (attr[1] && node.tag !== attr[1].toLowerCase()) return false
    if (!(attr[2] in node.attrs)) return false
    return attr[3] === undefined || node.attrs[attr[2]] === attr[3]
  }
  return node.tag === selector.toLowerCase()
}

function classParts(node: Rec): Set<string> {
  return new Set((node.attrs.class ?? '').split(/\s+/).filter(Boolean))
}

function wrap(node: Rec, registry: Rec[]): HarnessElement {
  const el: HarnessElement = {
    get tagName() {
      return node.tag.toUpperCase()
    },
    get textContent() {
      return textOf(node)
    },
    set textContent(value: string) {
      node.text = value
      node.children = []
    },
    get innerHTML() {
      return node.children.map((child) => `<${child.tag}>${textOf(child)}</${child.tag}>`).join('')
    },
    set innerHTML(value: string) {
      for (const child of node.children) detach(child, registry)
      node.children = parse(value)
      walk(node.children, registry)
      node.text = ''
    },
    get className() {
      return node.attrs.class ?? ''
    },
    set className(value: string) {
      node.attrs.class = value
    },
    get value() {
      return node.attrs.value ?? ''
    },
    set value(next: string) {
      node.attrs.value = String(next)
    },
    get checked() {
      return Object.hasOwn(node.attrs, 'checked')
    },
    set checked(next: boolean) {
      if (next) node.attrs.checked = ''
      else delete node.attrs.checked
    },
    get disabled() {
      return Object.hasOwn(node.attrs, 'disabled')
    },
    set disabled(next: boolean) {
      if (next) node.attrs.disabled = ''
      else delete node.attrs.disabled
    },
    style: node.style,
    classList: {
      add(name: string) {
        const parts = classParts(node)
        parts.add(name)
        node.attrs.class = [...parts].join(' ')
      },
      remove(name: string) {
        const parts = classParts(node)
        parts.delete(name)
        node.attrs.class = [...parts].join(' ')
      },
      toggle(name: string, force?: boolean) {
        const parts = classParts(node)
        const on = force ?? !parts.has(name)
        if (on) parts.add(name)
        else parts.delete(name)
        node.attrs.class = [...parts].join(' ')
      },
    },
    querySelector(selector: string) {
      const found = walk(node.children).find((item) => matchSel(item, selector))
      return found ? wrap(found, registry) : null
    },
    querySelectorAll(selector: string) {
      return walk(node.children)
        .filter((item) => matchSel(item, selector))
        .map((item) => wrap(item, registry))
    },
    addEventListener(type: string, listener: () => void) {
      const list = node.listeners.get(type) ?? []
      list.push(listener)
      node.listeners.set(type, list)
    },
    dispatchEvent(type: string) {
      for (const listener of node.listeners.get(type) ?? []) listener()
    },
    click() {
      for (const listener of node.listeners.get('click') ?? []) listener()
    },
    appendChild(child: HarnessElement) {
      const childNode = (child as { __node?: Rec }).__node
      if (!childNode) return
      node.children.push(childNode)
    },
  }
  Object.defineProperty(el, '__node', { value: node })
  return el
}

function makeDocument(roots: Rec[], registry: Rec[]): HarnessDocument {
  return {
    querySelector(selector: string) {
      const found = registry.find((item) => matchSel(item, selector))
      return found ? wrap(found, registry) : null
    },
    querySelectorAll(selector: string) {
      return registry.filter((item) => matchSel(item, selector)).map((item) => wrap(item, registry))
    },
    createElement(tag: string) {
      const node: Rec = {
        tag: tag.toLowerCase(),
        attrs: {},
        children: [],
        text: '',
        listeners: new Map(),
        style: { display: '' },
      }
      registry.push(node)
      return wrap(node, registry)
    },
  }
}

/**
 * Load a host page HTML file, run its inline <script> against a fake DOM and a
 * caller-supplied preload API, and return the document after the page's async
 * bootstrap (getState / refresh) has settled.
 */
export async function loadHostPage(opts: {
  file: string
  apiName: 'dshShell' | 'dshSettings'
  api: Record<string, unknown>
}): Promise<{ document: HarnessDocument }> {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), opts.file), 'utf8')
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((item) => item[1] ?? '')
  const roots = parse(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))
  const registry = walk(roots)
  const document = makeDocument(roots, registry)
  const windowObj: Record<string, unknown> = { [opts.apiName]: opts.api }

  for (const script of scripts) {
    runInNewContext(script, { window: windowObj, document, console, setTimeout, clearTimeout })
  }

  // Let the page's async bootstrap (api.getState / api.get / api.detect) settle.
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  return { document }
}
