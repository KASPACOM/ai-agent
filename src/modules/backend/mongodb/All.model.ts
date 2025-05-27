import { Schema } from 'mongoose';

export class Krc20Type {
    ticker: string;
    total_holders: number;
    holders: string[];
    pre: number;
    total_trades: number;
    max_supply: number;
    minted_supply_percent: string;
    state: string;
    mint_limit: string[];
    creation_date: number;
    timestamp: number;
    active: boolean;
}

export const Krc20TypeSchema = new Schema(
    {
        ticker: { type: Schema.Types.String },
        total_holders: { type: Schema.Types.Number },
        holders: { type: Schema.Types.Array },
        pre: { type: Schema.Types.Number },
        total_trades: { type: Schema.Types.Number },
        max_supply: { type: Schema.Types.Number },
        minted_supply_percent: { type: Schema.Types.String },
        state: { type: Schema.Types.String },
        mint_limit: { type: Schema.Types.Array },
        creation_date: { type: Schema.Types.Number },
        timestamp: { type: Schema.Types.Number },
        active: { type: Schema.Types.Boolean },
    },
    { versionKey: false },
);

export class Krc20MetadataType {
    ticker: string;
    description: string;
    logo: string;
    website: string;
    x_url: string;
    discord_url: string;
    telegram_url: string;
    banner: string;
    timestamp: number;
}

export const Krc20MetadataTypeSchema = new Schema(
    {
        ticker: { type: Schema.Types.String },
        description: { type: Schema.Types.String },
        logo: { type: Schema.Types.String },
        website: { type: Schema.Types.String },
        x_url: { type: Schema.Types.String },
        discord_url: { type: Schema.Types.String },
        telegram_url: { type: Schema.Types.String },
        banner: { type: Schema.Types.String },
        timestamp: { type: Schema.Types.Number },
    },
    { versionKey: false },
);

export class WalletTrackingType {
    user_wallet: string;
    tracking_wallet: string;
    ticker: string;
    tracking_wallet_balance: string;
    timestamp: number;
    rules: string[];
}

export const WalletTrackingTypeSchema = new Schema(
    {
        user_wallet: { type: Schema.Types.String },
        tracking_wallet: { type: Schema.Types.String },
        ticker: { type: Schema.Types.String },
        tracking_wallet_balance: { type: Schema.Types.String },
        timestamp: { type: Schema.Types.Number },
        rules: { type: Schema.Types.Array },
    },
    { versionKey: false },
);

export class UserOperationType {
    user_wallet: string;
    ticker: string;
    balance: string;
    timestamp: number;
    operation: string; //Buy, Sell, transfer
    quantity: string;
    price?: string;
}

export const UserOperationTypeSchema = new Schema(
    {
        user_wallet: { type: Schema.Types.String },
        ticker: { type: Schema.Types.String },
        balance: { type: Schema.Types.String },
        timestamp: { type: Schema.Types.Number },
        operation: { type: Schema.Types.String },
        quantity: { type: Schema.Types.String },
        price: { type: Schema.Types.String },
    },
    { versionKey: false },
);
        




export const Constants = {
    KAS_MONGO_URL: 'kasMongoUrl',
    KRC20_COLLECTION: 'krc20_collection',
    KRC20_METADATA_COLLECTION: 'krc20_metadata_collection',
    WALLET_TRACKING_COLLECTION: 'wallet_tracking_collection',
    PORTFOLIO_COLLECTION: 'portfolio_collection',
};