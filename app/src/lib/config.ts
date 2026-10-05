// The few facts about this build that are not code.

/**
 * Where the source code of THIS app can be had.
 *
 * Evergreen is built on openGym, which is licensed under the GNU AGPL 3.0. That licence asks
 * one thing of anyone who gives the app to other people, or runs it for them on a website: they
 * must be able to get the source of the version they are using — this one, with its changes,
 * not only the original it started from.
 *
 * So this has to point at a public copy of this repository, and that copy has to be kept up to
 * date with what is published.
 */
export const SOURCE_URL = 'https://github.com/LinaMahrouch/evergreen'

/**
 * Where exercise animations and thumbnails are loaded from: the dataset openGym uses, pinned to
 * one commit. They are third-party content, not part of this app or its licence (NOTICE.md in
 * the repository), which is why they are fetched and never bundled, and why Settings can turn
 * them off.
 */
export const MEDIA_BASE = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/'

/** The setup guide the "Plan with an AI assistant" screen links to. */
export const ASSISTANT_GUIDE_URL = 'https://github.com/LinaMahrouch/evergreen/blob/main/mcp/README.md'
