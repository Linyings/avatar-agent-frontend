import '@testing-library/jest-dom/vitest'

// jsdom does not expose the Font Loading API used by Mantine autosizing fields.
if (!document.fonts) {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: new EventTarget(),
  })
}

if (!globalThis.localStorage?.getItem) {
  const memory = new Map<string, string>()
  const storage = {
    get length() {
      return memory.size
    },
    clear() {
      memory.clear()
    },
    getItem(key: string) {
      return memory.has(key) ? memory.get(key)! : null
    },
    key(index: number) {
      return [...memory.keys()][index] ?? null
    },
    removeItem(key: string) {
      memory.delete(key)
    },
    setItem(key: string, value: string) {
      memory.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
}

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

if (!window.ResizeObserver) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
  })
}

Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
})

Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: vi.fn(),
})

if (!URL.createObjectURL) {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:mock-object-url'),
  })
}

if (!URL.revokeObjectURL) {
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
}
