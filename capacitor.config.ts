import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.craft.android',
  appName: 'Craft',
  webDir: 'dist',
  android: { allowMixedContent: false, loggingBehavior: 'none' },
}

export default config
