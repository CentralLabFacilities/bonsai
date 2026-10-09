import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/browser",
    fullyParallel: false,
    workers: 1,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    reporter: "list",
    outputDir: "test-results/browser",
    use: {
        baseURL: "http://127.0.0.1:1421",
        viewport: { width: 1440, height: 900 },
        colorScheme: "dark",
        reducedMotion: "reduce",
        locale: "en-US",
        timezoneId: "UTC",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.001 } },
    webServer: {
        command: "bun run --bun preview -- --host 127.0.0.1 --port 1421 --strictPort",
        url: "http://127.0.0.1:1421",
        reuseExistingServer: false,
        timeout: 30000,
    },
});
