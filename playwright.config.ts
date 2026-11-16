import { defineConfig, devices } from '@playwright/test';

// Mobilní sada má vlastní soubor i vlastní projekt: emulovaný telefon (dotyk, meta viewport, poměr pixelů),
// ne jen úzké okno počítače. Bez toho by se netestovalo nic z dotykového chování a držely by hover stavy.
const MOBILNI_SADA = /mobil\.spec\.ts/;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  use: { baseURL: 'http://localhost:4321', trace: 'retain-on-failure' },
  globalTeardown: './tests/e2e/snimky-index.ts',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: MOBILNI_SADA },
    // reducedMotion: úvodní animace se přeskočí, takže snímky jsou ustálené a běh rychlejší
    { name: 'mobil', use: { ...devices['Pixel 5'], reducedMotion: 'reduce' }, testMatch: MOBILNI_SADA },
  ],
  webServer: [
    { command: 'npx serve dist-e2e -l 4321 --no-clipboard', port: 4321, reuseExistingServer: !process.env.CI },
    { command: 'npx serve dist-prazdny -l 4322 --no-clipboard', port: 4322, reuseExistingServer: !process.env.CI },
  ],
});
