import {
  TweetV2UserTimelineParams,
  TTweetv2Expansion,
  TTweetv2TweetField,
  TTweetv2UserField,
  TTweetv2MediaField,
  TTweetv2PlaceField,
  TTweetv2PollField,
} from 'twitter-api-v2';

const tweetFields: TTweetv2TweetField[] = [
  'id',
  'text',
  'author_id',
  'conversation_id',
  'created_at',
  'public_metrics',
  'lang',
  'context_annotations',
  'entities',
  'referenced_tweets',
  'note_tweet',
  'attachments',
  'in_reply_to_user_id',
  'reply_settings',
  'source',
  'possibly_sensitive',
  'withheld',
  'geo',
  'edit_controls',
  'edit_history_tweet_ids',
];

const expansions: TTweetv2Expansion[] = [
  'author_id',
  'attachments.media_keys',
  'referenced_tweets.id',
  'referenced_tweets.id.author_id',
  'geo.place_id',
];

const userFields: TTweetv2UserField[] = [
  'id',
  'name',
  'username',
  'verified',
  'profile_image_url',
  'created_at',
  'description',
  'location',
  'public_metrics',
  'protected',
  'url',
];

const mediaFields: TTweetv2MediaField[] = [
  'media_key',
  'type',
  'url',
  'preview_image_url',
  'duration_ms',
  'variants',
  'height',
  'width',
  'public_metrics',
  'alt_text',
];

const placeFields: TTweetv2PlaceField[] = [
  'full_name',
  'country',
  'country_code',
  'geo',
  'id',
  'name',
  'place_type',
];

const pollFields: TTweetv2PollField[] = [
  'duration_minutes',
  'end_datetime',
  'id',
  'options',
  'voting_status',
];

export const twitterTimelineFields: Partial<TweetV2UserTimelineParams> = {
  'tweet.fields': tweetFields,
  expansions,
  'user.fields': userFields,
  'media.fields': mediaFields,
  'place.fields': placeFields,
  'poll.fields': pollFields,
};
