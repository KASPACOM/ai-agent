import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AgentBuilder, BuiltAgent } from '../agent-builder.service';

/**
 * UserManagementAgentFactory - Creates user management agent
 *
 * NOTE: All user management operations require wallet authentication.
 * These are commented out until we implement agent wallet authentication system.
 */
@Injectable()
export class UserManagementAgentFactory {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  createAgent(): BuiltAgent {
    return (
      AgentBuilder.create(
        this.httpService,
        this.configService,
        'user-management-agent',
      )
        .withDescription(
          'User authentication and account management (auth required)',
        )
        .withVersion('2.0.0')
        .withApiConfig('USER_API_BASE_URL')
        .withCategory('user')

        /*
        TODO: WALLET-AUTH-REQUIRED USER MANAGEMENT CAPABILITIES
        
        All user management operations require wallet authentication according to kaspacom.md:
        
        === User Data (All require wallet session) ===
        - user_get_notifications: GET /notifications - requires wallet session
        - user_get_wallet_activity: GET /wallet-activity - requires wallet session  
        - user_get_trading_data: GET /wallet-activity/trading-data - requires wallet session
        - user_get_contact_info: GET /referrals/contact-info - requires wallet session
        - user_update_contact_info: PATCH /referrals/contact-info - requires wallet session
        
        === Notification Management (All require wallet session) ===
        - user_mark_notifications_read: PATCH /notifications/mark-all-read - requires wallet session
        - user_clear_notifications: PATCH /notifications/clear - requires wallet session
        
        === Authentication Management ===
        - user_wallet_signin: POST /auth/wallet-signin - creates auth (no auth required for this endpoint)
        - user_create_otp: POST /auth/create-otp - requires partial wallet session
        - user_logout: POST /auth/logout - requires active session
        - user_submit_referral: POST /auth/referral - requires wallet session
        
        Implementation notes:
        - All endpoints require: Authorization: Bearer <token> or session cookies
        - Authentication flow: wallet signature -> session token -> subsequent requests
        - Error responses: 401 Unauthorized, 403 Forbidden
        - Session management needed for token refresh
        
        Headers required for authenticated requests:
        {
          "Content-Type": "application/json",
          "Authorization": "Bearer <jwt_token>"
          // OR session cookies handled automatically
        }
        */

        .build()
    );
  }
}
