import { Injectable, Logger } from "@nestjs/common";
import { Tweet } from "src/modules/integrations/twitter/models/twitter.model";
import { TwitterApiService } from "src/modules/integrations/twitter/twitter-api.service";
import { OrchestratorService } from "src/modules/orchestrator/orchestrator.service";

const KASPA_BOT_USER_ID = '1946644555027070976';

@Injectable()
export class TwitterService {

    private readonly logger = new Logger(TwitterService.name);

    constructor(
        private readonly twitterApiService: TwitterApiService,
        private readonly orchestratorService: OrchestratorService,
    ) { }



    async checkForBotMentionsAndRespondIfNeeded(): Promise<any> {

        try {
            this.logger.log('Checking for bot mentions and responding if needed');

            // Get the most recent mention
            const mentions = await this.twitterApiService.getMentions({
                userId: KASPA_BOT_USER_ID,
                maxResults: 10, // Only get the most recent mention
            });

            if (!mentions || mentions.length === 0) {
                this.logger.log('No new mentions found');
                return;
            }

            const latestMention = mentions[0];

            await this.respondToTweetIfNeeded(latestMention);
            return;

        } catch (error) {
            const errorMsg = `Error checking/responding to mentions: ${error.message}`;
            this.logger.error(errorMsg, error.stack);
        }
    }

    protected async respondToTweetIfNeeded(tweet: Tweet) {
        const authorName = tweet.author ? `@${(tweet.author as any).username}` : 'unknown';
        this.logger.log(`Found mention from ${authorName}: ${tweet.text}`);


        const orchestratorResponse = await this.orchestratorService.processMessage(
            tweet.metadata?.raw_tweet?.referenced_tweets?.[0]?.id || tweet.id,
            tweet.text,
            {
                platform: 'twitter',
                messageId: tweet.id,
                isChannel: false,
                channelTitle: tweet.author ? `@${(tweet.author as any).username}` : 'unknown',
                chatId: tweet.author ? (tweet.author as any).id : 'unknown',
            },
            true,
        );


        console.log(
            `Orchestrator response: "${orchestratorResponse.response?.substring(0, 100)}..."`,
        );


        if (!orchestratorResponse.messageNotRequireAnswer) {
            await this.twitterApiService.postComment(orchestratorResponse.response, tweet.id);
        }
    }
}
