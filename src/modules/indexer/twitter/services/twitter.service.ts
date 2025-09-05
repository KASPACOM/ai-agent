import { Injectable, Logger } from "@nestjs/common";
import { BotReply, QdrantBotRepliesRepository } from "src/modules/database/qdrant/services/qdrant-bot-replies.repository";
import { Tweet } from "src/modules/integrations/twitter/models/twitter.model";
import { TwitterApiService } from "src/modules/integrations/twitter/twitter-api.service";
import { OrchestratorService } from "src/modules/orchestrator/orchestrator.service";
import { SHOULD_ANSWER_QUESTIONS_ROLE } from "src/modules/prompt-builder/roles/should-answer-questions.role";

const KASPA_BOT_USER_ID = '1946644555027070976';
const MINUTES_TO_CHECK_MENTIONS = 5;
@Injectable()
export class TwitterService {

    private readonly logger = new Logger(TwitterService.name);

    constructor(
        private readonly twitterApiService: TwitterApiService,
        private readonly orchestratorService: OrchestratorService,
        private readonly qdrantBotRepliesRepository: QdrantBotRepliesRepository,
    ) { }


    async getTweetById(tweetId: string): Promise<Tweet> {
        return this.twitterApiService.getTweetById(tweetId);
    }


    async checkForBotMentionsAndRespondIfNeeded(): Promise<any> {
        try {
            this.logger.log('Checking for bot mentions and responding if needed');

            // Get the most recent mention
            let mentions = await this.twitterApiService.getMentions({
                userId: KASPA_BOT_USER_ID,
                maxResults: 10, // Only get the most recent mention
                startTime: new Date(Date.now() - MINUTES_TO_CHECK_MENTIONS * 60 * 1000),
            })

            mentions = mentions.filter(m => m.authorId !== KASPA_BOT_USER_ID);

            if (!mentions || mentions.length === 0) {
                this.logger.log('No new mentions found');
                return;
            }

            const alreadyRespondedTweets = await this.qdrantBotRepliesRepository.findRepliesByInResponseTo(mentions.map(m => m.id));

            const notRespondedMentions = mentions.filter(m => !alreadyRespondedTweets.some(r => r.in_respond_to === m.id));


            for (let mention of notRespondedMentions) {
                await this.respondToTweet(mention, true);
            }

            return;

        } catch (error) {
            const errorMsg = `Error checking/responding to mentions: ${error.message}`;
            this.logger.error(errorMsg, error.stack);
        }
    }

    async respondToTweet(tweet: Tweet, onlyIfNeeded?: boolean): Promise<BotReply> {
        const authorName = tweet.author;
        this.logger.log(`Found mention from ${authorName}: ${tweet.text}`);

        let tweetsToProcess = [tweet];

        const isReply = tweet.metadata?.raw_tweet?.referenced_tweets?.length;

        if (isReply) {
            tweetsToProcess = await this.twitterApiService.getThreadByConversationId(tweet.conversationId, tweet);
        }

        const textToProcess = this.transformTweetsToSendToOrchestrator(tweetsToProcess);

        console.log('textToProcess', textToProcess);

        const orchestratorResponse = await this.orchestratorService.processMessage(
            isReply?.id || tweet.id,
            textToProcess,
            {
                platform: 'twitter',
                messageId: tweet.id,
                isChannel: false,
                channelTitle: tweet.author,
                chatId: tweet.author,
            },
            onlyIfNeeded ? SHOULD_ANSWER_QUESTIONS_ROLE.template : undefined,
        );


        console.log(
            `Orchestrator response: "${orchestratorResponse.response}"`,
        );

        let response_twit_id = null;

        if (!orchestratorResponse.messageNotRequireAnswer) {
            const responseTwitData = await this.twitterApiService.postComment(orchestratorResponse.response, tweet.id);
            response_twit_id = responseTwitData.id;
        }

        const replyToStore: BotReply = {
            twit_id: response_twit_id,
            twit_text: response_twit_id ? orchestratorResponse.response : undefined,
            is_responded: response_twit_id ? true : false,
            is_from_mentions: true,
            date: new Date().toISOString(),
            in_respond_to: tweet.id,
        };

        await this.qdrantBotRepliesRepository.storeReply(replyToStore);

        return replyToStore;
    }

    transformTweetsToSendToOrchestrator(tweets: Tweet[]) {
        return tweets.map(tweet => {
            const username = tweet.author ? `@${(tweet.author)}` : 'unknown';
            const name = tweet.authorName ? (tweet.authorName) : 'unknown';
            return `${username} (Name: ${name}) posted at ${new Date(tweet.createdAt).toLocaleString()}: ${tweet.text}`;
        }).join('\n\n');
    }
}
