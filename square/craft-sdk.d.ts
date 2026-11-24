/** Host module every Gift may import; the project compiler resolves it from window.CraftRuntime. */
declare module '@craft/sdk' {
  export const storage: {
    /** Resolves the stored JSON value, or `fallback` when absent or unreadable. */
    get<T>(name: string, fallback: T): Promise<T>
    set<T>(name: string, value: T): Promise<void>
    remove(name: string): Promise<void>
  }
}
