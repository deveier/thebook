use sails_rs::prelude::*;

extern crate alloc;
use alloc::string::String;

#[derive(Encode, Decode, TypeInfo, Clone, Copy, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum Asset {
    BTC,
    ETH,
    VARA,
}

impl Asset {
    pub fn name(&self) -> &'static str {
        match self {
            Asset::BTC => "BTC",
            Asset::ETH => "ETH",
            Asset::VARA => "VARA",
        }
    }
}

#[derive(Encode, Decode, TypeInfo, Clone, Copy, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Encode, Decode, TypeInfo, Clone, Copy, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum OrderStatus {
    Open,
    Partial,
    Filled,
    Cancelled,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Order {
    pub id: u64,
    pub trader: ActorId,
    pub side: Side,
    pub asset: Asset,
    pub price: u64,
    pub qty: u64,
    pub filled: u64,
    pub status: OrderStatus,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct TradeInfo {
    pub id: u64,
    pub price: u64,
    pub qty: u64,
    pub buyer: ActorId,
    pub seller: ActorId,
    pub asset: Asset,
}

pub type PoolId = u64;
pub type LpAmount = u64;

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Pool {
    pub id: PoolId,
    pub asset_a: Asset,
    pub asset_b: Asset,
    pub reserve_a: u64,
    pub reserve_b: u64,
    pub total_lp: LpAmount,
    pub creator: ActorId,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct LpPosition {
    pub pool_id: PoolId,
    pub provider: ActorId,
    pub amount: LpAmount,
    pub share_a: u64,
    pub share_b: u64,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Agent {
    pub id: ActorId,
    pub usd: u64,
    pub btc: u64,
    pub eth: u64,
    pub vara: u64,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct LeaderEntry {
    pub id: ActorId,
    pub usd: u64,
    pub net_worth: u64,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct OracleFeed {
    pub oracle: ActorId,
    pub label: String,
    pub data: u64,
}

#[derive(Encode, Decode, TypeInfo, Clone, Copy, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum ContractError {
    NotAuthorized,
    NotAdmin,
    BadParams,
    JoinFirst,
    InsufficientUsd,
    InsufficientAsset,
    OrderNotFound,
    OrderAlreadyDone,
    NoLiquidity,
    NoBuyers,
    PoolExists,
    PoolNotFound,
    SameAssetPool,
    InsufficientLiquidity,
    SlippageExceeded,
    ZeroAmount,
    AgentCallFailed,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct PoolCreatedEvent {
    pub pool_id: PoolId,
    pub asset_a: Asset,
    pub asset_b: Asset,
    pub creator: ActorId,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct LiquidityAddedEvent {
    pub pool_id: PoolId,
    pub provider: ActorId,
    pub amount_a: u64,
    pub amount_b: u64,
    pub lp_minted: LpAmount,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct LiquidityRemovedEvent {
    pub pool_id: PoolId,
    pub provider: ActorId,
    pub amount_a: u64,
    pub amount_b: u64,
    pub lp_burned: LpAmount,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct SwapExecutedEvent {
    pub pool_id: PoolId,
    pub trader: ActorId,
    pub asset_in: Asset,
    pub amount_in: u64,
    pub asset_out: Asset,
    pub amount_out: u64,
    pub fee: u64,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct OrderPlacedEvent {
    pub trader: ActorId,
    pub side: Side,
    pub asset: Asset,
    pub price: u64,
    pub qty: u64,
    pub order_id: u64,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct OrderCancelledEvent {
    pub trader: ActorId,
    pub order_id: u64,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct TradeEvent {
    pub trade_id: u64,
    pub asset: Asset,
    pub price: u64,
    pub qty: u64,
    pub buyer: ActorId,
    pub seller: ActorId,
}

pub const INITIAL_USD: u64 = 1_000_00;
pub const INITIAL_BTC: u64 = 100_000;
pub const INITIAL_ETH: u64 = 1_000_000;
pub const INITIAL_VARA: u64 = 10_000_000_00;
pub const SWAP_FEE_NUM: u64 = 3;
pub const SWAP_FEE_DEN: u64 = 1_000;
pub const MAX_PAGE: u32 = 50;
