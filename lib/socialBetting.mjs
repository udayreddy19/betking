/**
 * Enterprise Social Betting Engine — OddsYra Enterprise Platform (lib/socialBetting.mjs)
 * Enables social features: friends list, shared slip links, bet community feeds, likes, comments.
 */

const SOCIAL_FEEDS = [];

export function shareBetToCommunity(userId, betSlipRecord = {}, comment = '') {
  const post = {
    postId: `post_${Date.now()}`,
    userId,
    betSlip: betSlipRecord,
    comment,
    likesCount: 0,
    commentsCount: 0,
    timestamp: Date.now(),
  };
  SOCIAL_FEEDS.push(post);
  if (SOCIAL_FEEDS.length > 500) SOCIAL_FEEDS.shift();
  return post;
}

export function getCommunityFeed() {
  return SOCIAL_FEEDS.slice(-50);
}
