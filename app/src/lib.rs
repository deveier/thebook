#![no_std]

use sails_rs::cell::RefCell;
use sails_rs::prelude::*;

pub mod amm;
pub mod orderbook;
pub mod state;
pub mod types;

pub use amm::AmmService;
pub use orderbook::OrderbookService;
pub use state::DexState;

pub struct Program {
    state: RefCell<DexState>,
}

#[sails_rs::program]
impl Program {
    pub fn new() -> Self {
        Self {
            state: RefCell::new(DexState::default()),
        }
    }

    pub fn orderbook(&self) -> OrderbookService<'_> {
        OrderbookService::new(&self.state)
    }

    pub fn amm(&self) -> AmmService<'_> {
        AmmService::new(&self.state)
    }
}
