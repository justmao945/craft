import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'

declare global {
  interface Window {
    CRAFT_CONTEXT?: { giftId: string; environment: 'draft' | 'release' }
  }
}

const key = (name: string) => {
  const context = window.CRAFT_CONTEXT ?? { giftId: 'unknown', environment: 'draft' }
  return `craft:${context.giftId}:${context.environment}:${name}`
}

const storage = {
  async get<T>(name: string, fallback: T): Promise<T> {
    const value = localStorage.getItem(key(name))
    if (value === null) return fallback
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  },
  async set<T>(name: string, value: T): Promise<void> {
    localStorage.setItem(key(name), JSON.stringify(value))
  },
  async remove(name: string): Promise<void> {
    localStorage.removeItem(key(name))
  },
}

const craftRuntime = {
  React,
  createRootModule: { createRoot },
  jsxRuntime: { Fragment, jsx, jsxs },
  sdk: { storage },
}

window.CraftRuntime = craftRuntime

declare global {
  interface Window {
    CraftRuntime: typeof craftRuntime
  }
}
