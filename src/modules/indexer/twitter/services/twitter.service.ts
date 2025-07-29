import { Injectable, Logger } from "@nestjs/common";
import { Tweet } from "src/modules/integrations/twitter/models/twitter.model";
import { TwitterApiService } from "src/modules/integrations/twitter/twitter-api.service";
import { OrchestratorService } from "src/modules/orchestrator/orchestrator.service";
import { SHOULD_ANSWER_QUESTIONS_ROLE } from "src/modules/prompt-builder/roles/should-answer-questions.role";

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

            // const latestMention = await this.twitterApiService.getTweetById(
            //     '1950039464643797295',
            // );

            await this.respondToTweetIfNeeded(latestMention);
            return;

        } catch (error) {
            const errorMsg = `Error checking/responding to mentions: ${error.message}`;
            this.logger.error(errorMsg, error.stack);
        }
    }

    protected async respondToTweetIfNeeded(tweet: Tweet) {
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
            SHOULD_ANSWER_QUESTIONS_ROLE.template,
        );


        console.log(
            `Orchestrator response: "${orchestratorResponse.response}"`,
        );


        if (!orchestratorResponse.messageNotRequireAnswer) {
            await this.twitterApiService.postComment(orchestratorResponse.response, tweet.id);
        }
    }

    transformTweetsToSendToOrchestrator(tweets: Tweet[]) {
        return tweets.map(tweet => {
            const username = tweet.author ? `@${(tweet.author)}` : 'unknown';
            const name = tweet.authorName ? (tweet.authorName) : 'unknown';
            return `${username} (Name: ${name}) posted at ${new Date(tweet.createdAt).toLocaleString()}: ${tweet.text}`;
        }).join('\n\n');
    }
}
