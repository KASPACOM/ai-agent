import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

// === Crossmint Core Service ===
import { CrossmintService } from './crossmint.service';

/**
 * CrossmintModule
 *
 * Handles Crossmint financial integration including:
 * - Agent wallet creation and management
 * - Cross-chain transfers and swaps
 * - Fiat payment processing and funding
 * - Real-world purchase capabilities
 * - Product catalog integration
 *
 * All functions use real Crossmint SDK - NO MOCK IMPLEMENTATIONS
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  providers: [
    // === Crossmint Financial Service ===
    CrossmintService,
  ],
  exports: [
    // === Crossmint Financial Service ===
    CrossmintService,
  ],
})
export class CrossmintModule {}
