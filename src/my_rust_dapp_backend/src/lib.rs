// Rust ICP canister for Virtual BTC Lottery
// This is a basic structure; details such as full authentication via Internet Identity, randomness via threshold signatures,
// and front-end integration should be added in a real deployment.

use candid::{CandidType, Principal};
use ic_cdk::api::time;
use ic_cdk_macros::*;
use ic_cdk_timers::set_timer_interval;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct Transaction {
    amount: u64,
    timestamp: u64,
    transaction_type: String,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct Winning {
    amount: u64,
    timestamp: u64,
    round_id: u64,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct User {
    balance: u64,
    transaction_history: Vec<Transaction>,
    winning_history: Vec<Winning>,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct Round {
    id: u64,
    participants: Vec<Principal>,
    prize_pool: u64,
    start_time: u64,
    end_time: u64,
    winners: Vec<Principal>,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct SystemStats {
    total_rounds: u64,
    total_bets: u64,
    total_winnings: u64,
    active_users: u64,
}

const TICKET_PRICE: u64 = 1_000_000;
const ROUND_DURATION: u64 = 300_000_000_000; // 5 minutes (300 seconds * 1,000,000,000 nanoseconds)

thread_local! {
    static ADMIN: std::cell::RefCell<Option<Principal>> = std::cell::RefCell::new(None);
    static USERS: std::cell::RefCell<HashMap<Principal, User>> = std::cell::RefCell::new(HashMap::new());
    static CURRENT_ROUND: std::cell::RefCell<Round> = std::cell::RefCell::new(Round {
        id: 0,
        participants: vec![],
        prize_pool: 0,
        start_time: time(),
        end_time: time() + ROUND_DURATION,
        winners: vec![],
    });
    static STATS: std::cell::RefCell<SystemStats> = std::cell::RefCell::new(SystemStats {
        total_rounds: 0,
        total_bets: 0,
        total_winnings: 0,
        active_users: 0,
    });
    static TIMER_INITIALIZED: std::cell::RefCell<bool> = std::cell::RefCell::new(false);
}

#[update]
pub fn initialize_auth() {
    let caller = ic_cdk::caller();
    ADMIN.with(|a| {
        if a.borrow().is_none() {
            *a.borrow_mut() = Some(caller);
        }
    });
    
    // Initialize timer
    initialize_timer();
}

fn initialize_timer() {
    TIMER_INITIALIZED.with(|initialized| {
        if !*initialized.borrow() {
            // Set timer to check round status every 5 minutes
            set_timer_interval(Duration::from_secs(300), || {
                ic_cdk::spawn(async {
                    check_and_auto_draw().await;
                });
            });
            *initialized.borrow_mut() = true;
        }
    });
}

async fn check_and_auto_draw() {
    let current_time = time();
    let should_draw = CURRENT_ROUND.with(|r| {
        let round = r.borrow();
        current_time >= round.end_time && !round.participants.is_empty()
    });
    
    if should_draw {
        // Auto draw
        auto_draw_winner();
    }
}

fn auto_draw_winner() {
    let winner = CURRENT_ROUND.with(|r| {
        let mut round = r.borrow_mut();
        if round.participants.is_empty() {
            return None;
        }
        let idx = time() as usize % round.participants.len();
        let winner = round.participants[idx];
        round.winners = vec![winner];
        Some(round.clone())
    });
    
    if let Some(winner) = winner {
        // Award prize to winner
        USERS.with(|users| {
            let mut users_ref = users.borrow_mut();
            if let Some(user) = users_ref.get_mut(&winner.winners[0]) {
                user.balance += winner.prize_pool;
                user.transaction_history.push(Transaction {
                    amount: winner.prize_pool,
                    timestamp: time(),
                    transaction_type: "Win".to_string(),
                });
                user.winning_history.push(Winning {
                    amount: winner.prize_pool,
                    timestamp: time(),
                    round_id: winner.id,
                });
            }
        });

        // Update statistics
        STATS.with(|s| {
            let mut stats = s.borrow_mut();
            stats.total_rounds += 1;
            stats.total_winnings += winner.prize_pool;
        });

        // Create new round
        CURRENT_ROUND.with(|r| {
            *r.borrow_mut() = Round {
                id: winner.id + 1,
                participants: vec![],
                prize_pool: 0,
                start_time: time(),
                end_time: time() + ROUND_DURATION,
                winners: vec![],
            }
        });
    }
}

fn assert_admin() {
    let caller = ic_cdk::caller();
    ADMIN.with(|a| {
        if a.borrow().as_ref() != Some(&caller) {
            ic_cdk::trap("Unauthorized");
        }
    });
}

#[update]
pub fn create_user() {
    let caller = ic_cdk::caller();
    USERS.with(|users| {
        if !users.borrow().contains_key(&caller) {
            users.borrow_mut().insert(caller, User {
                balance: 0,
                transaction_history: vec![],
                winning_history: vec![],
            });
            STATS.with(|s| s.borrow_mut().active_users += 1);
        }
    });
}

#[update]
pub fn deposit(amount: u64) {
    let caller = ic_cdk::caller();
    USERS.with(|users| {
        let mut users_ref = users.borrow_mut();
        
        // Create user if it doesn't exist
        if !users_ref.contains_key(&caller) {
            users_ref.insert(caller, User {
                balance: 0,
                transaction_history: vec![],
                winning_history: vec![],
            });
            STATS.with(|s| s.borrow_mut().active_users += 1);
        }
        
        // Now deposit the amount
        if let Some(user) = users_ref.get_mut(&caller) {
            user.balance += amount;
            user.transaction_history.push(Transaction {
                amount,
                timestamp: time(),
                transaction_type: "Deposit".to_string(),
            });
        }
    });
}

#[update]
pub fn place_bet(tx_hash: String) {
    let caller = ic_cdk::caller();
    
    // Create user if it doesn't exist
    USERS.with(|users| {
        let mut users_ref = users.borrow_mut();
        if !users_ref.contains_key(&caller) {
            users_ref.insert(caller, User {
                balance: 0,
                transaction_history: vec![],
                winning_history: vec![],
            });
            STATS.with(|s| s.borrow_mut().active_users += 1);
        }
    });
    
    // Add user to current round
    CURRENT_ROUND.with(|r| {
        let mut round = r.borrow_mut();
        if !round.participants.contains(&caller) {
            round.participants.push(caller);
            round.prize_pool += 1_000_000; // Add 1 BTC to prize pool
        }
    });
    
    // Record the bet
    ic_cdk::println!("User {:?} placed a bet, tx_hash: {}", caller, tx_hash);
}

#[update]
pub fn trigger_draw() {
    assert_admin();

    let winner = CURRENT_ROUND.with(|r| {
        let mut round = r.borrow_mut();
        if round.participants.is_empty() {
            ic_cdk::trap("No participants");
        }
        let idx = time() as usize % round.participants.len();
        let winner = round.participants[idx];
        round.winners = vec![winner];
        round.clone()
    });

    USERS.with(|users| {
        let mut users_ref = users.borrow_mut();
        if let Some(user) = users_ref.get_mut(&winner.winners[0]) {
            user.balance += winner.prize_pool;
            user.transaction_history.push(Transaction {
                amount: winner.prize_pool,
                timestamp: time(),
                transaction_type: "Win".to_string(),
            });
            user.winning_history.push(Winning {
                amount: winner.prize_pool,
                timestamp: time(),
                round_id: winner.id,
            });
        }
    });

    STATS.with(|s| {
        let mut stats = s.borrow_mut();
        stats.total_rounds += 1;
        stats.total_winnings += winner.prize_pool;
    });

    CURRENT_ROUND.with(|r| {
        *r.borrow_mut() = Round {
            id: winner.id + 1,
            participants: vec![],
            prize_pool: 0,
            start_time: time(),
            end_time: time() + ROUND_DURATION,
            winners: vec![],
        }
    });
}

#[query]
pub fn get_user(principal: Principal) -> Option<User> {
    USERS.with(|users| users.borrow().get(&principal).cloned())
}

#[query]
pub fn get_round() -> Round {
    CURRENT_ROUND.with(|r| r.borrow().clone())
}

#[query]
pub fn get_stats() -> SystemStats {
    STATS.with(|s| s.borrow().clone())
}

#[query]
pub fn get_canister_address() -> String {
    ic_cdk::id().to_string()
}
