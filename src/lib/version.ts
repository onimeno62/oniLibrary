/**
 * Single source of truth for the app version as shown in the UI.
 *
 * Audit D6: the Settings badge hardcoded "v1.1.1 (4)" and the More footer
 * hardcoded "v1.0.0" while the shipped manifest said 1.5.0 (14). All UI
 * surfaces now read these constants, and a regression test
 * (tests/version.test.ts) keeps them in lockstep with the Android manifest
 * so a release bump cannot drift again.
 *
 * When cutting a release: bump BOTH values here AND
 * android/app/AndroidManifest.xml (versionName / versionCode). The test
 * fails if they disagree.
 */
export const APP_VERSION = "1.5.0";
export const APP_VERSION_CODE = 14;
export const APP_REPO_URL = "https://github.com/onimeno62/oniLibrary";
