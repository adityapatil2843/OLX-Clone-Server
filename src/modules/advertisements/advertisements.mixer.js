/**
 * Feed mixing policy for sponsored content.
 * Interleaves sponsored items at defined intervals without mutating underlying models.
 */

/**
 * Mixes sponsored listings into the public listings feed.
 * Placement rule: 1 sponsored listing after every 4 normal listings.
 *
 * @param {Array<object>} normalItems - Formatted listings
 * @param {Array<object>} sponsoredItems - Eligible sponsored listings (with isSponsored: true)
 * @returns {Array<object>} Mixed feed items
 */
export const mixListingsFeed = (normalItems = [], sponsoredItems = []) => {
  if (!sponsoredItems || sponsoredItems.length === 0) {
    return normalItems;
  }

  // Deduplicate to avoid repeating the same item on a single page
  const sponsoredIds = new Set(sponsoredItems.map((item) => item.id));
  const dedupedNormal = normalItems.filter((item) => !sponsoredIds.has(item.id));

  const result = [];
  let sponsoredIndex = 0;
  const interval = 4;

  for (let i = 0; i < dedupedNormal.length; i++) {
    result.push(dedupedNormal[i]);

    // Insert 1 sponsored item after every `interval` normal items
    if ((i + 1) % interval === 0 && sponsoredIndex < sponsoredItems.length) {
      result.push(sponsoredItems[sponsoredIndex]);
      sponsoredIndex++;
    }
  }

  // If there are fewer than interval normal items, or remaining sponsored items
  while (sponsoredIndex < sponsoredItems.length) {
    result.push(sponsoredItems[sponsoredIndex]);
    sponsoredIndex++;
  }

  return result;
};

/**
 * Mixes sponsored reels into the public reels feed.
 * Placement rule: 1 sponsored reel after every 6 normal reels.
 *
 * @param {Array<object>} normalItems - Formatted reels
 * @param {Array<object>} sponsoredItems - Eligible sponsored reels (with isSponsored: true)
 * @returns {Array<object>} Mixed feed items
 */
export const mixReelsFeed = (normalItems = [], sponsoredItems = []) => {
  if (!sponsoredItems || sponsoredItems.length === 0) {
    return normalItems;
  }

  const sponsoredIds = new Set(sponsoredItems.map((item) => item.id));
  const dedupedNormal = normalItems.filter((item) => !sponsoredIds.has(item.id));

  const result = [];
  let sponsoredIndex = 0;
  const interval = 6;

  for (let i = 0; i < dedupedNormal.length; i++) {
    result.push(dedupedNormal[i]);

    // Insert 1 sponsored item after every `interval` normal items
    if ((i + 1) % interval === 0 && sponsoredIndex < sponsoredItems.length) {
      result.push(sponsoredItems[sponsoredIndex]);
      sponsoredIndex++;
    }
  }

  while (sponsoredIndex < sponsoredItems.length) {
    result.push(sponsoredItems[sponsoredIndex]);
    sponsoredIndex++;
  }

  return result;
};
