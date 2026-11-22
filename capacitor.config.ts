import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.craft.android',
  appName: 'Craft',
  webDir: 'dist',
  android: { allowMixedContent: false, loggingBehavior: 'none' },
  plugins: {
    SplashScreen: {
      // One-phase launch per the Capacitor standard: the launch splash stays until
      // the web app calls SplashScreen.hide() after its first committed frame.
      launchAutoHide: false,
      backgroundColor: '#F8F9FC',
      // The plugin paints the resource as a full-bleed background, so it must be the
      // layered drawable (flat color + centered 54dp mark), not the bare mark vector.
      androidSplashResourceName: 'boot_background',
      launchFadeOutDuration: 200,
      showSpinner: false,
    },
  },
}

export default config
