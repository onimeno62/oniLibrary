# oniLibrary — Product Requirements Document (PRD)
**Product Requirements Document | Version 1.0 | Product Baseline**

- **Date:** 2026-10-12 (October 12, 2026)
- **Target platform:** Android phones and tablets
- **Interface languages:** Persian (fa) and English (en)
- **Document status:** Product baseline; ready for review and planning
- **Scope:** Product requirements and behavior; excludes system architecture and technology selection

## Table of Contents
1. Executive Summary
2. Vision, Goals & Principles
3. Target Users & Use Cases
4. Content Types & Formats
5. Navigation & Visual UX
6. Persian & English Localization
7. Library, Search & Discovery
8. Reading Engine
9. Local Files & PDF
10. Online Sources & Extensions
11. Download Manager
12. Updates & Notifications
13. Private Vault
14. Tracking, Notes & Statistics
15. Backup, Restore & Sync
16. Personal Servers & Network Libraries
17. Accessibility & Device Support
18. Privacy & Security
19. Performance, Reliability & Quality
20. MVP Acceptance Criteria
21. Release Priorities
22. Product Success Metrics
23. Risks, Dependencies & Open Decisions
24. Glossary
25. Reference Sources

## 1. Executive Summary

oniLibrary is a comprehensive Android library and reading environment that brings manga, manhwa, Webtoon, comics, PDFs, e-books, and image archives together in one integrated experience. The product must support both local files and online content, covering the library, Reader, downloads, updates, source management, reading tracking, backup, and a private Vault.

The target version supports both English and Persian from the outset. Persian must have a genuine right-to-left (RTL) experience, while the reading direction of manga or comic content must be selectable independently of the interface language.

This document is the reference for product scope and expected behavior. Architecture, frameworks, programming languages, databases, internal API design, and other architectural decisions are outside its scope.

## 2. Vision, Goals & Principles

**Vision:** Make oniLibrary a personal, modern, secure, and extensible reading environment that presents a user’s scattered content in one coherent, manageable library.

### Product Goals

- **[VIS-001] [P0]** Provide a single experience for reading local files and online content.
  - **Acceptance criteria:** Users can open a local file or an online work from the library and retain reading progress in both cases.
- **[VIS-002] [P0]** Support offline reading for local files and downloaded chapters.
  - **Acceptance criteria:** After the internet connection is lost, downloaded content opens without a connection and its status is displayed correctly.
- **[VIS-003] [P0]** Make library, download, and update management transparent and controllable.
  - **Acceptance criteria:** Users can see active operations, the result of the most recent check, and actionable errors.
- **[VIS-004] [P0]** Address privacy through a Hidden Library and a secure Vault.
  - **Acceptance criteria:** The product explicitly distinguishes hiding content in the interface from actually encrypting files.
- **[VIS-005] [P0]** Provide a complete, usable Persian and English interface.
  - **Acceptance criteria:** All primary flows can be completed in both languages, and Persian is correctly right-aligned.
- **[VIS-006] [P0]** Maintain a modern, attractive, consistent, reading-friendly visual design.
  - **Acceptance criteria:** The library and Reader use a unified visual language, and controls do not obstruct content during reading.
- **[VIS-007] [P1]** Make product capabilities extensible from the user’s perspective.
  - **Acceptance criteria:** Adding a source, tracking service, or content type does not require redesigning the primary navigation.

### Out of Scope for the Initial Release

- **[NONS-001] [P0]** An internal social network, public user feed, and user-to-user messaging are not part of the initial release.
  - **Acceptance criteria:** No core MVP flow depends on creating a social account or following other users.
- **[NONS-002] [P0]** Unauthorized hosting or distribution of copyrighted content is not a product goal.
  - **Acceptance criteria:** Online features rely on sources and access the user is authorized to use; the product does not claim to license content supplied by a source.
- **[NONS-003] [P0]** Compatibility with every Mihon extension or extension from a similar app is not guaranteed without verification.
  - **Acceptance criteria:** The compatibility status of each supported format or extension is explicitly stated in feature listings and extension screens.

## 3. Target Users & Use Cases

oniLibrary is designed for casual readers, users with large archives, people who use multiple online sources, PDF and book readers, and users who keep private content or maintain a server-hosted library.

### Primary Use Cases

- **[USR-001] [P0]** A new user can choose the interface language on first launch, import a local folder or file, and begin reading.
  - **Acceptance criteria:** A supported file opens without requiring account creation, and the last reading position is restored after leaving the app.
- **[USR-002] [P0]** A manga reader can install/enable a source, add a work to the library, download a chapter, and read it offline later.
  - **Acceptance criteria:** The work is added to the library; the download is visible in Download Manager; and the downloaded chapter opens offline.
- **[USR-003] [P0]** A user with a large archive can manage the library using search, filters, categories, and sorting.
  - **Acceptance criteria:** Search, filtering, and sorting can be used without losing reading status.
- **[USR-004] [P0]** A user can move selected works into the Vault and keep them hidden from the public library.
  - **Acceptance criteria:** After a successful move, the work is hidden from the public view and is accessible only through an authenticated route or an authorized operation.
- **[USR-005] [P1]** A user with multiple devices can back up or synchronize reading data and permitted settings.
  - **Acceptance criteria:** Conflicts and items that will not be synchronized are made clear before the operation is finalized.

## 4. Content Types & Formats

The formats listed here define product commitments, not a technical library or implementation method. Each format must be tested with representative files, large files, malformed files, and Unicode filenames.

### Target Formats

- **[FMT-001] [P0]** Support PDF for digital and scanned documents.
  - **Acceptance criteria:** Multi-page PDFs open, page navigation and zoom work, and the last reading position is restored.
- **[FMT-002] [P0]** Support EPUB for reflowable books.
  - **Acceptance criteria:** Users can open a book, navigate its contents, and restore their reading position; book-specific limitations are handled clearly.
- **[FMT-003] [P0]** Support CBZ, CBR, ZIP, and image folders for comic and manga archives.
  - **Acceptance criteria:** Pages appear in natural filename order, and unreadable files produce a clear error.
- **[FMT-004] [P0]** Support JPG/JPEG, PNG, and WebP for single-image reading and local image collections.
  - **Acceptance criteria:** Images display at original size and in Fit modes, and a corrupt image does not stop the entire library.
- **[FMT-005] [P1]** Evaluate support for CBT, CB7, RAR, 7Z, TAR, DJVU, TXT, HTML, GIF, and BMP, and provide it where feasible.
  - **Acceptance criteria:** Each format has a clear status on the supported-formats page; unsupported formats are reported without being falsely advertised as supported.
- **[FMT-006] [P1]** Handle filenames and folder names containing Persian and English characters, spaces, punctuation, and mixed digits.
  - **Acceptance criteria:** Persian names are not corrupted or rendered as unreadable strings, and multi-digit numbers are sorted naturally.
- **[FMT-007] [P2]** Evaluate OCR as an add-on for image-based PDFs.
  - **Acceptance criteria:** Users know which languages OCR supports and which documents have been processed; OCR is not guaranteed for every file.

## 5. Navigation & Visual UX

The interface should be modern and uncluttered. A work’s cover is the primary visual element of the library, and the Reader must prioritize content. No change in feature priority permits readability, accessibility, or privacy to be sacrificed.

### Screens & Navigation

- **[UX-001] [P0]** Home provides a summary of Continue Reading, recent works, new items, and important statuses.
  - **Acceptance criteria:** Users can return to their most recent work from Home, and essential sections are accessible without deep navigation.
- **[UX-002] [P0]** Primary navigation includes Home, Library, Discover, Updates, Downloads, and protected access to the Vault.
  - **Acceptance criteria:** All primary routes follow a predictable navigation pattern; the Vault does not reveal private content without authorization.
- **[UX-003] [P0]** Library offers Grid and List views and adjustable card sizes.
  - **Acceptance criteria:** Users can switch views while sorting, filters, and selection state are preserved.
- **[UX-004] [P0]** Empty, loading, offline, error, and success states are deliberately designed and displayed.
  - **Acceptance criteria:** Every important error has an understandable explanation or next action; a raw technical error is not the only user-facing message.
- **[UX-005] [P0]** Reader controls can auto-hide, and a usable full-screen mode is available.
  - **Acceptance criteria:** Users can reveal controls through a defined tap/gesture, while readable content retains the main screen area.
- **[UX-006] [P0]** Provide Light, Dark, and Follow System themes.
  - **Acceptance criteria:** Changing themes does not lose the current screen or reading position.
- **[UX-007] [P1]** Provide configurable color themes, accent colors, and alternative visual modes.
  - **Acceptance criteria:** Custom themes retain readable contrast and apply consistently across all primary screens.
- **[UX-008] [P1]** Allow customization of navigation items, shortcuts, and quick actions.
  - **Acceptance criteria:** User settings persist after restart and do not obstruct access to core features.

## 6. Persian & English Localization

Persian (fa) and English (en) are mandatory requirements for the primary release, not add-on features. The interface language, the language of the content being read, and each work’s reading direction are three separate concepts.

### Language and RTL/LTR

- **[BIL-001] [P0]** Deliver the full user interface in Persian and English.
  - **Acceptance criteria:** All MVP screens, buttons, menus, notifications, errors, empty-state messages, and help text are translated into both languages.
- **[BIL-002] [P0]** Suggest the system language on first launch and allow users to select a language manually.
  - **Acceptance criteria:** If the system language is not supported, English is used as the fallback; manual selection takes precedence over automatic detection.
- **[BIL-003] [P0]** Make language switching available in Settings and preserve the user’s choice.
  - **Acceptance criteria:** Changing language does not lose data or reading status, and all visible screens switch to the selected language.
- **[BIL-004] [P0]** Use a right-to-left (RTL) layout for Persian and a left-to-right (LTR) layout for English.
  - **Acceptance criteria:** Text alignment, navigation placement, and directional components are displayed correctly in each language, with no overlap or clipping.
- **[BIL-005] [P0]** Correctly display mixed Persian/English text, URLs, filenames, IDs, volume numbers, and multilingual titles.
  - **Acceptance criteria:** Mixed strings retain logical order, and punctuation, parentheses, numbers, and addresses are not reordered incorrectly.
- **[BIL-006] [P0]** Keep a work’s reading direction independent from the interface language.
  - **Acceptance criteria:** LTR content can be read in the Persian interface and RTL manga can be read in the English interface; changing the interface language does not unexpectedly change a work’s reading direction.
- **[BIL-007] [P0]** Keep translation content separate from UI display strings in code and data.
  - **Acceptance criteria:** No primary-screen string remains without a registered translation; missing translation keys are reported by internal tests.
- **[BIL-008] [P0]** Validate fonts, text size, and spacing for Persian letter shaping and marks.
  - **Acceptance criteria:** Persian letters are not displayed separately, clipped, or joined incorrectly; text remains readable at accessibility scaling levels.
- **[BIL-009] [P0]** Separate content language from interface language and display source language/country as metadata.
  - **Acceptance criteria:** An English/Japanese work title or description remains intact in the Persian interface, while UI labels remain Persian.
- **[BIL-010] [P1]** Localize date, time, number, and numeric-separator formats; evaluate display of the Solar Hijri calendar.
  - **Acceptance criteria:** Important dates are not ambiguous and users can understand the date format; if the Solar Hijri calendar is provided, conversion and display are tested.
- **[BIL-011] [P1]** Support searching by Persian title, original title, and alternate work names.
  - **Acceptance criteria:** Searching a registered title by a reliable alternate name returns the relevant result; matching behavior is transparent.

## 7. Library, Search & Discovery

The library must remain manageable for both a few dozen works and large archives. All library views, filters, and searches must work with local data and online works.

### Library Management

- **[LIB-001] [P0]** Provide Continue Reading, Recently Read, Recently Added, Favorites, and Unread sections.
  - **Acceptance criteria:** Each section displays only items that meet its rule, and opening a card leads to the correct work.
- **[LIB-002] [P0]** Provide the reading statuses Planned, Reading, Completed, On Hold, and Dropped.
  - **Acceptance criteria:** Users can change status, and the status remains consistent between the library and work details screen.
- **[LIB-003] [P0]** Provide global search across the local library, known online titles, and saved metadata.
  - **Acceptance criteria:** Results show their source and content type, and lack of internet does not prevent local search.
- **[LIB-004] [P0]** Provide sorting by title, last read, date added, progress, latest chapter, and file size.
  - **Acceptance criteria:** Ordering is stable, with natural numeric sorting for volume/chapter numbers.
- **[LIB-005] [P0]** Provide filters by content type, source, language, reading status, download status, and category.
  - **Acceptance criteria:** Combined filters produce predictable results, and users can clear filters.
- **[LIB-006] [P0]** Support user-created categories and assigning a work to multiple categories.
  - **Acceptance criteria:** Creating, renaming, moving, or deleting a category does not unintentionally delete the work itself.
- **[LIB-007] [P0]** Provide bulk selection to add multiple works to a category, change status, download, or delete.
  - **Acceptance criteria:** Appropriate confirmation is required before deletion or irreversible operations, and bulk-operation results are reported.
- **[LIB-008] [P1]** Provide smart categories with savable conditions, such as “downloaded and unread.”
  - **Acceptance criteria:** Smart-category results update when work data changes, and users can inspect the active rules.
- **[LIB-009] [P1]** Detect duplicate works across sources and allow versions to be linked in one shared profile.
  - **Acceptance criteria:** Progress and files are not merged or deleted without user confirmation; similar titles alone are not considered definitive matches.
- **[LIB-010] [P1]** Support custom covers, personal tags, short notes, and manual collection ordering.
  - **Acceptance criteria:** Source metadata updates do not unintentionally overwrite personal changes.
- **[LIB-011] [P1]** Allow frequently used filters and searches to be saved and pinned.
  - **Acceptance criteria:** Users can rerun a saved filter and rename or delete it.

## 8. Reading Engine

The Reader must be fast, stable, and customizable. Default settings for content types must be independent, while remaining user-adjustable.

### Display Modes and Page Navigation

- **[RDR-001] [P0]** Support paged reading, continuous vertical scrolling, Webtoon, single-page, and double-page modes.
  - **Acceptance criteria:** Each mode is available for compatible formats and content; changing modes does not lose the current page.
- **[RDR-002] [P0]** Allow right-to-left and left-to-right reading directions.
  - **Acceptance criteria:** Page navigation and next/previous gestures follow the selected direction.
- **[RDR-003] [P0]** Provide Fit to Width, Fit to Height, Fit to Screen, and Original Size.
  - **Acceptance criteria:** Display sizing changes take effect immediately, and images are not cropped or stretched incorrectly.
- **[RDR-004] [P0]** Support gesture zoom, panning within zoomed images, and resetting to original size.
  - **Acceptance criteria:** Zooming allows the user to inspect different image areas without losing access to controls.
- **[RDR-005] [P0]** Provide page/chapter number or progress, direct jumping, and a chapter list.
  - **Acceptance criteria:** Users can jump to a specific page or chapter, and the Reader saves the final position.
- **[RDR-006] [P0]** Persist reading progress after page/chapter navigation.
  - **Acceptance criteria:** Force-closing and reopening the app restores the last saved position; saving must not cause a noticeable Reader pause.
- **[RDR-007] [P0]** Allow independent Reader settings for each series.
  - **Acceptance criteria:** Changing direction or mode for one series does not affect other series unless the user explicitly selects it as the default.
- **[RDR-008] [P0]** Allow adjustment of white-margin cropping and spacing between pages when supported by the content.
  - **Acceptance criteria:** Users can toggle cropping, and content near an edge is not removed in a way that makes it unusable.
- **[RDR-009] [P0]** Provide brightness control, background options, full-screen mode, and prevention of screen timeout.
  - **Acceptance criteria:** Settings can be changed during reading, and preventing timeout can be disabled.
- **[RDR-010] [P0]** Make gestures, touch zones, volume-key controls, and one-handed controls customizable.
  - **Acceptance criteria:** Each action can be disabled or changed to avoid conflicts with user needs and preferences.
- **[RDR-011] [P0]** Make automatic navigation to the next chapter optional and clearly show chapter completion.
  - **Acceptance criteria:** Users can turn off automatic transition; the next chapter does not start unexpectedly.
- **[RDR-012] [P1]** Provide automatic splitting of wide pages, auto-scroll, and preloading of subsequent pages.
  - **Acceptance criteria:** Behavior is tested with very wide pages, weak networks, and offline content, and memory usage is controlled.
- **[RDR-013] [P1]** Provide bookmarks, notes, page tags, and a history of reading positions.
  - **Acceptance criteria:** Bookmarks are independent of the current reading position, and deleting a bookmark does not erase reading history.
- **[RDR-014] [P1]** Provide presets for Manga, Western Comics, Webtoon, PDF, and One-Handed reading.
  - **Acceptance criteria:** Selecting a preset applies documented settings that can be reset; users can modify them afterward.

## 9. Local Files & PDF

Users must have clear control over files added to the library. Opening a file temporarily, adding it to the library, and moving it to the Vault are separate operations.

### File Management

- **[LOC-001] [P0]** Open or import files through Share/Open With from other apps and through the Android file picker.
  - **Acceptance criteria:** A selected file can be opened without requiring a broad scan of the entire device storage.
- **[LOC-002] [P0]** Support scanning selected folders and adding folders to the library.
  - **Acceptance criteria:** Users know exactly which folders are scanned and can remove a folder from the scan list.
- **[LOC-003] [P0]** Display file information, including name, location, size, date added, and page count when available.
  - **Acceptance criteria:** Information is obtained from the file or system; unknown values are not fabricated.
- **[LOC-004] [P0]** Show a clear error for corrupted, incomplete, password-protected, or unsupported files.
  - **Acceptance criteria:** The error shows the filename and a probable reason or remedy without damaging other library data.
- **[LOC-005] [P0]** Handle page order and volume/chapter numbering naturally.
  - **Acceptance criteria:** Files such as page-2 and page-10 are ordered numerically, and users can manually correct the order.
- **[LOC-006] [P0]** Delete, rename, move, and copy files only within the permissions granted for the selected files.
  - **Acceptance criteria:** Deletion requires confirmation, and permission errors are clearly reported.
- **[LOC-007] [P1]** Support grouping multiple files as a series or multi-part volume.
  - **Acceptance criteria:** Users can set file order, and changes to a collection do not rewrite original files without consent.

### PDF and Book Tools

- **[PDF-001] [P0]** PDF supports page navigation, zoom, rotation, and single-/double-page modes.
  - **Acceptance criteria:** Multi-page PDFs open and users can move quickly between pages without losing position.
- **[PDF-002] [P0]** For text-based PDFs, provide text search and selection/copy where permitted.
  - **Acceptance criteria:** For image-based PDFs without searchable text, the app does not present the feature as available.
- **[PDF-003] [P1]** Provide bookmarks, notes, highlights, and sharing of selected excerpts if supported by the PDF engine.
  - **Acceptance criteria:** Users know whether a note is saved in the app or modifies the PDF itself; the file is not changed without notice.
- **[PDF-004] [P1]** Preserve the last reading position and document history for PDF/EPUB.
  - **Acceptance criteria:** Reopening a file returns to the last saved position, and document history can be deleted.
- **[PDF-005] [P2]** Offer optional OCR for scanned PDFs.
  - **Acceptance criteria:** Before processing, users are informed about supported languages, approximate time, and any possible online-processing or data-storage requirements.

## 10. Online Sources & Extensions

The source system must be understandable, observable, and extensible. Running third-party extensions introduces a separate trust and risk level; compatibility must not be assumed based on a name or repository alone.

### Source Discovery and Management

- **[SRC-001] [P0]** Display a source list with name, language, connection status, last check, and supported content type.
  - **Acceptance criteria:** Broken or disabled sources are not shown as healthy, and their latest status is visible.
- **[SRC-002] [P0]** Provide work search within one source and global search across active sources.
  - **Acceptance criteria:** Results are labeled with source and language, and an error in one source does not break results from other sources.
- **[SRC-003] [P0]** Allow online works to be added to the library and retain their original source and reference link.
  - **Acceptance criteria:** Users can reach the work page and chapters from that source through the library card.
- **[SRC-004] [P0]** Allow sources to be enabled, disabled, or pinned.
  - **Acceptance criteria:** Disabling a source does not delete library data or existing files.
- **[SRC-005] [P0]** Clearly report connection errors, source restrictions, and possible changes to website structure.
  - **Acceptance criteria:** Where detection is possible, errors distinguish connection failure, removed content, and an incompatible source.

### Extension Management

- **[EXT-001] [P0]** Support installing, updating, disabling, and removing supported extensions.
  - **Acceptance criteria:** The extension version and the sources it provides are displayed, and removing an extension does not delete library data.
- **[EXT-002] [P0]** Make each extension’s compatibility with oniLibrary formats and versions explicit.
  - **Acceptance criteria:** Warn users before installing or running an incompatible extension; do not claim unverified compatibility.
- **[EXT-003] [P0]** Identify an extension’s origin and trust level, and warn about unknown sources.
  - **Acceptance criteria:** Before installation, users can see which repository provides the extension, and installation is never performed unintentionally.
- **[EXT-004] [P0]** Explain the permissions and risks of third-party extensions in plain language.
  - **Acceptance criteria:** Users can decline or later disable an extension, and the security warning is more than vague wording.
- **[EXT-005] [P1]** Provide an extension repository, version checks, deprecated-status information, and diagnostic error reports.
  - **Acceptance criteria:** Installed and available versions are compared, and recent errors are visible for troubleshooting.
- **[EXT-006] [P1]** Allow a work to be moved to an alternative source using controlled title and metadata matching.
  - **Acceptance criteria:** Reading progress is transferred only when a match is established and technically feasible; otherwise, users can match the work manually.
- **[EXT-007] [P1]** Evaluate the ability to add personal sources or trusted servers.
  - **Acceptance criteria:** Sources can be added only through supported routes, and unknown addresses or types are not accepted without explanation.

## 11. Download Manager

Downloads must be queue-based and recoverable. The product must not falsely guarantee that a download can resume if its source does not support resumption.

### Download Controls

- **[DWN-001] [P0]** Allow downloading one chapter, selected chapters, and an entire series when the source supports it.
  - **Acceptance criteria:** The number of selected items and any available estimate are shown before starting.
- **[DWN-002] [P0]** Provide a download queue with pause, resume, cancel, and prioritization.
  - **Acceptance criteria:** An operation on one row does not unintentionally affect other rows, and status persists after reopening the app.
- **[DWN-003] [P0]** Display progress percentage, downloaded size, speed, and download result; show remaining time only when it can be calculated.
  - **Acceptance criteria:** Values update as status changes, and estimates are identified as estimates.
- **[DWN-004] [P0]** Support retrying failed downloads and detecting incomplete files.
  - **Acceptance criteria:** An incomplete file is not labeled as fully downloaded, and users can retry or remove it.
- **[DWN-005] [P0]** Provide Wi-Fi-only rules, mobile-data limits, and a maximum number of concurrent downloads.
  - **Acceptance criteria:** Settings are applied before a download starts, and active restrictions are visible in the interface.
- **[DWN-006] [P0]** Support background downloads with controllable notifications and behavior compatible with operating-system limits.
  - **Acceptance criteria:** Users can see download status through a notification or Downloads screen and manage related notifications.
- **[DWN-007] [P1]** Allow download speed limits and scheduled downloads to be configured.
  - **Acceptance criteria:** Speed limits and operating hours are applied predictably.
- **[DWN-008] [P1]** Provide automatic downloads of new chapters for selected works or categories.
  - **Acceptance criteria:** By default, automatic downloading is enabled only for items explicitly selected by the user.
- **[DWN-009] [P1]** Make pre-downloading upcoming chapters and automatic cleanup of read downloads configurable.
  - **Acceptance criteria:** The number of chapters to retain and storage impact are clear before cleanup; excluded works are not deleted.
- **[DWN-010] [P0]** Warn about low storage and show space used by downloads, cache, and temporary files.
  - **Acceptance criteria:** Clearing cache is not confused with deleting permanent downloaded files.

## 12. Updates & Notifications

The product experience must distinguish four types of updates: source content, extensions, the app itself, and data/synchronization.

### Content and Extension Updates

- **[UPD-001] [P0]** Check existing library works for new chapters and changes, and distinguish them from unread items.
  - **Acceptance criteria:** Users can view newly discovered items, and a duplicate chapter does not trigger duplicate notifications.
- **[UPD-002] [P0]** Provide manual and scheduled library checks.
  - **Acceptance criteria:** The time and result of the last check are displayed, and scheduling is controllable in Settings.
- **[UPD-003] [P0]** Separate content checks, extension updates, and downloads by status and notifications.
  - **Acceptance criteria:** Users know which operation a notification concerns and can configure each type separately.
- **[UPD-004] [P1]** Run automatic checks at selected times, on selected networks, and at selected intervals.
  - **Acceptance criteria:** Wi-Fi and time-window settings are respected, and overlapping operations do not create duplicate work.
- **[UPD-005] [P1]** Repeated source errors must trigger a clear warning and configurable controls.
  - **Acceptance criteria:** A broken source does not retry indefinitely without notice, and temporary disabling is possible.

### Notifications

- **[NTF-001] [P0]** Notify users about new chapters, completed downloads, and important download errors.
  - **Acceptance criteria:** A notification leads to the correct work or operation; disabling that notification type prevents it from being sent.
- **[NTF-002] [P0]** Consolidate duplicate notifications and allow control by notification type.
  - **Acceptance criteria:** One chapter in the same state does not generate multiple duplicate notifications.
- **[NTF-003] [P0]** Allow titles and details of sensitive content to be hidden in notifications.
  - **Acceptance criteria:** Notification privacy mode does not reveal the title of a private work.
- **[NTF-004] [P1]** Optionally notify users about new app/extension versions and provide periodic summaries.
  - **Acceptance criteria:** Notifications appear only when a verifiable version source or new information is available.

## 13. Private & Encrypted Vault

The Vault is an independent security feature. The word “hidden” alone does not mean a file is encrypted or confidential; the interface must accurately indicate the active protection level.

### Hiding and Locking

- **[VLT-001] [P0]** Allow users to hide a work or category from the public library.
  - **Acceptance criteria:** A hidden work does not appear in public views, public filters, Home, or public search results unless the user reveals it.
- **[VLT-002] [P0]** Protect the Vault with a PIN or password and, on compatible devices, biometric authentication.
  - **Acceptance criteria:** Entering the protected space requires an allowed authentication method; provide a secure alternative when biometrics are unavailable.
- **[VLT-003] [P0]** Allow automatic locking based on leaving the app or a period of inactivity.
  - **Acceptance criteria:** After locking, Vault content cannot be reopened without authentication.
- **[VLT-004] [P0]** Prevent covers, notifications, recent images, and previews from revealing sensitive Vault information.
  - **Acceptance criteria:** When the privacy option is enabled, the names and images of private works do not appear in public areas.
- **[VLT-005] [P0]** Clearly distinguish Hidden Library, a locked Vault, and an encrypted Vault in the interface.
  - **Acceptance criteria:** The protection-status screen does not claim encryption unless the relevant files are actually encrypted.
- **[VLT-006] [P1]** Encrypt files moved into the Vault while stored.
  - **Acceptance criteria:** In product testing, the stored Vault copy cannot be read outside the app without a valid key.
- **[VLT-007] [P1]** Include Vault-related cache, thumbnails, and temporary copies in the protection model.
  - **Acceptance criteria:** Locking or removing the Vault does not leave recognizable previews in the public library.
- **[VLT-008] [P1]** Provide encrypted Vault backups and controlled restoration.
  - **Acceptance criteria:** The key or password required for recovery is clearly explained, and encrypted backups are not confused with ordinary backups.
- **[VLT-009] [P1]** Require suitable confirmation before exiting the Vault or deleting content.
  - **Acceptance criteria:** Permanent deletion is distinguished from removing an item from the library, and file-deletion consequences are explained.
- **[VLT-010] [P2]** Evaluate a decoy mode or emergency lock only after reviewing the threat model and limitations.
  - **Acceptance criteria:** No decoy interface is presented as an absolute security guarantee, and its behavior is documented.

## 14. Tracking, Notes & Statistics

 These features should add value without requiring an external account for ordinary reading.

### Status and History

- **[TRK-001] [P0]** Record reading status, last chapter/page, last-read date, and the user’s personal rating for each work.
  - **Acceptance criteria:** Information is consistent between the library and work details, and users can correct the status manually.
- **[TRK-002] [P0]** Allow viewing and clearing reading history for local and online works.
  - **Acceptance criteria:** Clearing history removes current progress only when the user confirms that consequence.
- **[TRK-003] [P1]** Allow personal notes, bookmarks, and selected excerpts to be saved for a work or page.
  - **Acceptance criteria:** A note is linked to the correct work/chapter/page and is included in exports or backups according to user choice.
- **[TRK-004] [P1]** Provide daily, weekly, monthly, and yearly statistics and reading goals.
  - **Acceptance criteria:** Statistics are calculated from recorded events, with the time range and unit of measurement specified.
- **[TRK-005] [P1]** Make reading streaks and the next-reading queue optional.
  - **Acceptance criteria:** Reminders or goals do not create mandatory notifications or social pressure, and users can disable them.

### External Trackers

- **[TRK-006] [P1]** Evaluate integration with AniList first, followed by other suitable services such as MyAnimeList or Kitsu.
  - **Acceptance criteria:** A service appears as supported only after its API, authentication, and limitations have been verified.
- **[TRK-007] [P1]** Provide mapping of a local/online work to the correct external-service entry and manual synchronization.
  - **Acceptance criteria:** The target entry and data to be sent are visible and can be cancelled before external changes are made.
- **[TRK-008] [P1]** Provide an offline synchronization queue and conflict resolution between local and external status.
  - **Acceptance criteria:** Conflicts are not silently overwritten without an explainable policy, and the latest synchronization result is recorded.

## 15. Backup, Restore & Sync

The contents of a backup must be defined precisely. The product must explain the difference between library data, downloaded files, extensions, account tokens, and Vault content.

### Backup & Restore

- **[BKP-001] [P0]** Back up the library, categories, reading status, relevant history, settings, and bookmarks.
  - **Acceptance criteria:** The interface shows which items are included and excluded before creating a backup.
- **[BKP-002] [P0]** Support manual backups and full or selective restoration.
  - **Acceptance criteria:** Validate a backup before restoration and stop with a clear error when invalid; do not overwrite existing data without warning.
- **[BKP-003] [P0]** Display the status and time of the most recent backup.
  - **Acceptance criteria:** Users can see whether it succeeded or failed, and a failed backup is never marked as successful.
- **[BKP-004] [P1]** Provide scheduled automatic backups and encrypted backups.
  - **Acceptance criteria:** Users know the destination, schedule, and encryption status, and recovery passwords/keys are managed securely.
- **[BKP-005] [P1]** Evaluate importing backups from other apps after analyzing the relevant format.
  - **Acceptance criteria:** Before import, preview the changes and report items that cannot be transferred.

### Multi-Device Synchronization

- **[SYNC-001] [P1]** Evaluate synchronizing reading status, categories, bookmarks, and selected notes across devices.
  - **Acceptance criteria:** Users can choose the scope of synchronization, and excluded data is not sent.
- **[SYNC-002] [P1]** Evaluate user cloud storage, WebDAV, or a personal server as possible destinations.
  - **Acceptance criteria:** A destination is called supported only after testing authentication, disconnection behavior, and conflict handling.
- **[SYNC-003] [P1]** Keep synchronization of the Vault and sensitive content restricted and transparent by default.
  - **Acceptance criteria:** Obtain informed consent before sending Vault content or sensitive information, and make the disabled state clear.

## 16. Personal Servers & Network Libraries

Support for a home server is a professional capability for users who keep their collections on a computer or NAS, and is planned for a later release.

### External Servers

- **[SRV-001] [P1]** Evaluate connections to Komga and OPDS-based sources and offer them within a clearly supported scope.
  - **Acceptance criteria:** Users can register a server address, test the connection, and browse the server library.
- **[SRV-002] [P1]** Support the server’s required authentication and encrypted connections.
  - **Acceptance criteria:** Credentials are entered through a secure interface, and certificate/authentication errors are clearly reported.
- **[SRV-003] [P1]** Manage multiple servers and their connection status independently from the local library.
  - **Acceptance criteria:** A server outage does not hide or delete local works, and the latest connection error is visible.
- **[SRV-004] [P1]** Support offline downloads from a server where permitted and supported by the protocol.
  - **Acceptance criteria:** Downloaded works can be read offline without violating the server’s access policy.

## 17. Accessibility & Device Support

Usability must not be limited to flagship phones or users without accessibility needs.

### Accessibility

- **[ACC-001] [P0]** Provide suitable contrast, touch-target size, and visual hierarchy for primary controls.
  - **Acceptance criteria:** Essential text and controls are readable and tappable in Light and Dark modes.
- **[ACC-002] [P0]** Make primary controls identifiable through TalkBack and accessibility labels.
  - **Acceptance criteria:** Essential operations can be completed without relying solely on visually recognizing an icon.
- **[ACC-003] [P0]** Support system text size and display scaling to a reasonable extent.
  - **Acceptance criteria:** Increasing text size does not cover key buttons or truncate essential text.
- **[ACC-004] [P1]** Provide reduced animation, dim/low-light mode, and one-handed use.
  - **Acceptance criteria:** Accessibility settings can reduce nonessential visual effects.
- **[ACC-005] [P1]** Make the interface adaptive to phones, tablets, and landscape orientation.
  - **Acceptance criteria:** No primary action is off-screen at different sizes, and additional space is used effectively.
- **[ACC-006] [P2]** Evaluate enhanced behavior for E-ink displays.
  - **Acceptance criteria:** If released, redraw behavior, contrast, and animations are tested separately on target devices.

## 18. Privacy & Security

Security must be visible in product behavior rather than limited to broad claims. Users must understand which data stays local, which data uses the network, and how they can delete or export it.

### Data Protection

- **[SEC-001] [P0]** Normal use of the library and Reader must not require account creation.
  - **Acceptance criteria:** Users can open local files and save reading progress without signing in to an external service.
- **[SEC-002] [P0]** Request file and notification permissions only when needed.
  - **Acceptance criteria:** Each permission request explains its purpose, and denying permission provides an alternative path where possible.
- **[SEC-003] [P0]** Do not expose external-account tokens, Vault passwords, or sensitive information in ordinary logs.
  - **Acceptance criteria:** Reviewing error reports reveals no passwords, tokens, or unnecessary sensitive paths.
- **[SEC-004] [P0]** Let users manage or delete history, cache, local data, and external-service connections.
  - **Acceptance criteria:** The scope of deletion is specified before confirmation, and the result is reported clearly.
- **[SEC-005] [P0]** Make the permissions and origin of third-party extensions transparent.
  - **Acceptance criteria:** Users are informed of significant risks and trust level during installation or activation.
- **[SEC-006] [P1]** Handle network communications and authentication according to the destination service’s secure methods.
  - **Acceptance criteria:** Tokens and passwords are not exposed in URLs or logs, and secure certificate errors are not silently ignored.
- **[SEC-007] [P1]** Provide an exportable diagnostic report that excludes personal data and library content.
  - **Acceptance criteria:** Before export, users can review a summary of shareable data, and unnecessary sensitive information is excluded.

## 19. Performance, Reliability & Quality

The numerical targets in this section are initial test criteria and must be validated against a reference device and representative test dataset. They are not architectural commitments or guarantees independent of hardware.

### Performance and Reliability

- **[NFR-001] [P0]** The library must remain browsable with a large collection without loading all covers or data at once.
  - **Acceptance criteria:** Test with at least 1,000 library entries on a reference device; scrolling and search must not experience long stalls.
- **[NFR-002] [P0]** The initial target is for a stored library to become usable within 2 seconds on the reference test device.
  - **Acceptance criteria:** Timing is recorded against a fixed, defined test collection; worse results are documented and optimized.
- **[NFR-003] [P0]** Open large files with controlled memory use, and do not let one file-loading failure stop other areas of the app.
  - **Acceptance criteria:** Test several large and corrupted files; failure to open one file must not prevent opening the next.
- **[NFR-004] [P0]** Restore reading progress and the download queue after force-closing and restarting the app.
  - **Acceptance criteria:** Abrupt-interruption scenarios are tested at different points, and confirmed data is not lost.
- **[NFR-005] [P0]** Fully support offline behavior for local features and provide understandable errors for network-dependent features.
  - **Acceptance criteria:** Users can read downloaded files, while online sections clearly indicate offline status.
- **[NFR-006] [P0]** Log source and file errors and present them in an actionable form.
  - **Acceptance criteria:** Logs record the status, time, and context of an error without unnecessarily recording confidential information.
- **[NFR-007] [P1]** The beta quality target is at least 99.5% crash-free sessions across a sufficiently large test sample.
  - **Acceptance criteria:** The rate is calculated using a documented tool and definition; results from a small sample are not reported as conclusive.
- **[NFR-008] [P1]** Rebuild a corrupted index or cache without deleting original files.
  - **Acceptance criteria:** Rebuilding recreates derived data and does not delete original files without confirmation.

## 20. MVP Acceptance Criteria

The MVP is product-acceptable only when the following critical end-to-end flows have been tested on target devices in both Persian and English.

### Acceptance Flows

- **[MVP-001] [P0]** A fresh installation and initial setup can be completed by choosing Persian or English.
  - **Acceptance criteria:** After setup, all primary screens, settings, and simulated errors appear in the selected language with the correct layout direction.
- **[MVP-002] [P0]** Supported PDF, EPUB, CBZ/CBR, and image files can be opened and read.
  - **Acceptance criteria:** Each format is tested with valid and corrupted samples; page state and reading position are restored after exiting.
- **[MVP-003] [P0]** Local and online works can be added to the library, searched, filtered, sorted, and categorized.
  - **Acceptance criteria:** Core operations do not unintentionally alter files or reading status.
- **[MVP-004] [P0]** Downloads can be started, paused, resumed, cancelled, and opened from the Downloads screen when complete.
  - **Acceptance criteria:** The download queue persists after restart, and incomplete files are not treated as complete.
- **[MVP-005] [P0]** New-content checks, new-chapter display, and controllable notifications work.
  - **Acceptance criteria:** A new chapter is notified only once for a given state, and a source error is distinguished from a download error.
- **[MVP-006] [P0]** Before installation, the extension system displays compatibility status, origin, and a security warning.
  - **Acceptance criteria:** Unknown extensions or formats are not presented as confirmed compatible and secure.
- **[MVP-007] [P0]** Hidden Library and the Vault lock behave as specified.
  - **Acceptance criteria:** Hidden works do not appear in public views, and encryption claims match the product’s actual protection level.
- **[MVP-008] [P0]** Basic backup and restore work with a preview of included items.
  - **Acceptance criteria:** After restore, categories and progress within the backup scope return, and excluded items are clearly identified.
- **[MVP-009] [P0]** Offline mode, denied permissions, corrupted files, and unavailable sources have understandable behavior.
  - **Acceptance criteria:** None of these scenarios permanently locks the app or unintentionally deletes other data.
- **[MVP-010] [P0]** A bilingual and accessibility test suite runs across all critical flows.
  - **Acceptance criteria:** No untranslated text, major UI clipping, or unusable critical control remains.

## 21. Release Priorities

Priorities express product importance and do not replace a project schedule. P0 capabilities must meet acceptance criteria before public release; P1 is considered after core flows stabilize, and P2 is evaluated for the future roadmap.

### Priority Definitions

- **[PRI-001] [P0]** P0 is required for the primary release; without it, the product’s core identity is incomplete.
  - **Acceptance criteria:** Every P0 requirement has tested acceptance criteria and a recorded result status.
- **[PRI-002] [P1]** P1 is a professional/post-MVP priority; it offers high value but may be released after core flows stabilize.
  - **Acceptance criteria:** Before planning, every P1 capability is evaluated for dependencies and risks.
- **[PRI-003] [P2]** P2 is future/differentiating: an advanced, experimental, or insufficiently validated capability.
  - **Acceptance criteria:** A P2 capability is not added to the MVP without assessing cost, privacy, and actual value.

### Suggested Product Delivery Sequence

- **[REL-001] [P0]** Stage 1: library foundation, bilingual interface, local-file Reader, reading progress, and basic categories.
  - **Acceptance criteria:** Users can use the app in both languages to read local content without an account.
- **[REL-002] [P0]** Stage 2: online sources, extensions with verified compatibility, downloads, and content updates.
  - **Acceptance criteria:** The search-to-download flow, offline reading, and new-chapter display meet acceptance criteria.
- **[REL-003] [P0]** Stage 3: basic Hidden Library/Vault, backup, notifications, security, and stability.
  - **Acceptance criteria:** Private content and reading data are tested in failure and recovery scenarios.
- **[REL-004] [P1]** Stage 4: full Vault encryption, external tracking, synchronization, and personal servers.
  - **Acceptance criteria:** Each external-service integration is released only after API, permission, authentication, and conflict testing.
- **[REL-005] [P2]** Stage 5: OCR, smart recommendations, optional social features, and E-ink support.
  - **Acceptance criteria:** The value and cost of each feature are validated separately, with privacy remaining an acceptance criterion.

## 22. Product Success Metrics

These metrics evaluate product quality. Any telemetry collection must be consent-based, data-minimized, and clearly explained; local and anonymized metrics are preferred where possible.

### Suggested Metrics

- **[MET-001] [P0]** Measure the success rate for opening P0 formats.
  - **Acceptance criteria:** Tests run on a defined sample set, with results recorded separately for each format.
- **[MET-002] [P0]** Measure the percentage of successful reading-position restores after reopening and abrupt interruption.
  - **Acceptance criteria:** The test suite is repeatable, and failures are recorded with the stage at which they occurred.
- **[MET-003] [P0]** Monitor time until the library is usable on a reference device.
  - **Acceptance criteria:** Network conditions, number of works, and cache state are identical or specified in test reports.
- **[MET-004] [P0]** Record download and update success/error rates in simulated scenarios.
  - **Acceptance criteria:** Source, network, storage-space, and file errors are distinguished.
- **[MET-005] [P0]** Check translation coverage and RTL/LTR testing for critical flows.
  - **Acceptance criteria:** All P0 strings and every critical screen are reviewed in fa/en.
- **[MET-006] [P1]** Measure successful backup rate, synchronization quality, and conflict-resolution errors.
  - **Acceptance criteria:** Collection of these metrics complies with notification and privacy policy.
- **[MET-007] [P1]** Assess user satisfaction with the Reader, library, and initial settings through optional feedback.
  - **Acceptance criteria:** Feedback can be submitted without exposing library contents.

## 23. Risks, Dependencies & Open Decisions

The following items must be examined before committing to delivery of dependent features. Listing a capability in this PRD does not confirm compatibility or guarantee unrestricted operation.

### Risks and Required Actions

- **[RSK-001] [P0]** Compatibility with Mihon and other projects’ extensions is uncertain and may require changes, adaptation, or a decision not to support them.
  - **Acceptance criteria:** Test a real example of each extension model; verify compatibility, software license, and permissions before announcing support.
- **[RSK-002] [P0]** Online sources may change their structure, access, or terms of use.
  - **Acceptance criteria:** Sources must be able to be disabled, errors must be logged, and limitations must be disclosed; continuous availability is not guaranteed.
- **[RSK-003] [P0]** Vault encryption depends on protecting the original file, cache, temporary copies, and backups.
  - **Acceptance criteria:** Security claims are published only after end-to-end file-lifecycle testing and threat review.
- **[RSK-004] [P0]** Archive formats may have library, legal, performance, or corrupted-file limitations.
  - **Acceptance criteria:** Support for each format depends on a test suite, review of applicable licenses, and acceptable error behavior.
- **[RSK-005] [P1]** Synchronization can create conflicts between devices and external services.
  - **Acceptance criteria:** A priority rule and conflict-resolution method are defined for each data type and explained in the interface.
- **[RSK-006] [P1]** External APIs may impose rate limits, change versions, or change authentication requirements.
  - **Acceptance criteria:** Each integration enters the release scope only after initial API testing and an error-management plan.

### Open Decisions for the Next Stage

- **[OPEN-001] [P0]** The exact scope of Mihon extension compatibility versus an independent source system must be determined after sample testing.
  - **Acceptance criteria:** Documented decision lists compatible and incompatible items, security risks, and maintenance requirements.
- **[OPEN-002] [P0]** The minimum Android version and reference-device list must be specified.
  - **Acceptance criteria:** Supported OS versions and reference devices are documented before final product testing.
- **[OPEN-003] [P0]** The exact protection level of the Vault in the MVP must be finalized: lock/hide versus file encryption.
  - **Acceptance criteria:** Product wording and acceptance criteria match the actual level of protection.
- **[OPEN-004] [P1]** The account, synchronization, and dedicated cloud-service model must be assessed based on actual product needs.
  - **Acceptance criteria:** The base release remains usable without a mandatory account unless a separate product decision is made.
- **[OPEN-005] [P1]** Solar Hijri calendar support, less-common formats, and OCR must be prioritized based on cost and user value.
  - **Acceptance criteria:** Each decision is documented against value, quality, and maintenance criteria.

## 24. Glossary

- **Library:** The library of all registered works and files.
- **Reader:** The environment for opening and reading a work or document.
- **Source:** An online source or external library that provides a catalog of works.
- **Extension:** An add-on or package that adds a source/integration capability to the product; compatibility and trust level must be specified.
- **Vault:** A protected space that may, depending on the product level, be hidden only or actually encrypted.
- **RTL/LTR:** Right-to-left and left-to-right direction of the interface or content.
- **MVP:** Minimum Viable Product released to validate core flows.
- **P0/P1/P2:** Required, professional/post-MVP, and future/differentiating priorities.

## 25. Reference Sources

These sources were used for product inspiration and to verify reference capabilities. They are not requirements or guarantees of oniLibrary compatibility. In particular, licenses and terms must be reviewed separately before reusing code, extensions, or protocols.

1. Mihon — repository and documentation: https://github.com/mihonapp/mihon | https://mihon.app/docs/ | Backup guide: https://mihon.app/docs/guides/backups
2. Komikku — project repository: https://github.com/komikku-app/komikku
3. CDisplayEx — Google Play page: https://play.google.com/store/apps/details?id=com.progdigy.cdisplay
4. Challenger Comics Viewer — Google Play page: https://play.google.com/store/apps/details?id=org.kill.geek.bdviewer
5. ReadEra — Google Play page: https://play.google.com/store/apps/details?id=org.readera
6. Moon+ Reader — Google Play page: https://play.google.com/store/apps/details?id=com.flyersoft.moonreader
7. Komga — repository and API: https://github.com/gotson/komga | https://komga.org/docs/openapi/komga-api/
8. Android Developers — files and documents: https://developer.android.com/training/data-storage/shared/documents-files
9. Android Developers — biometric authentication: https://developer.android.com/identity/sign-in/biometric-auth | Keystore: https://developer.android.com/privacy-and-security/keystore
10. AniList API — official documentation: https://docs.anilist.co/
