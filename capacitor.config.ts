import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.craft.android',
  appName: 'Craft',
  webDir: 'dist',
  android: { allowMixedContent: false, loggingBehavior: 'none' },
  plugins: {
    SplashScreen: {
      // 0 = the plugin does not take over the launch splash. Its Android 12 path holds
      // the system splash with a preDraw block, which defers Chromium's first render to
      // after the release and shows a blank window there. With 0, the system splash
      // retires normally over live content while the window background carries the mark.
      launchShowDuration: 0,
      backgroundColor: '#F8F9FC',
      // The plugin paints the resource as a full-bleed background, so it must be the
      // layered drawable (flat color + centered 54dp mark), not the bare mark vector.
      androidSplashResourceName: 'boot_background',
      launchFadeOutDuration: 0,
      showSpinner: false,
    },
  },
}

export default config
