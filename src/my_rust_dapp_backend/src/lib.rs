// Rust ICP canister for Virtual BTC Lottery with ckBTC integration
// This canister integrates with ckBTC for real Bitcoin transactions on the Internet Computer

use candid::{CandidType, Principal};
use ic_cdk::api::time;
use ic_cdk_macros::*;
use ic_cdk_timers::set_timer_interval;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

// ICRC-1 related types for ckBTC integration
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct Account {
    owner: Principal,
    subaccount: Option<Vec<u8>>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct TransferArgs {
    to: Account,
    amount: u64,
    fee: Option<u64>,
    memo: Option<Vec<u8>>,
    from_subaccount: Option<Vec<u8>>,
    created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum TransferError {
    BadFee { expected_fee: u64 },
    BadBurn { min_burn_amount: u64 },
    InsufficientFunds { balance: u64 },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: u64 },
    TemporarilyUnavailable,
    GenericError { error_code: u64, message: String },
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum TransferResult {
    Ok(u64),
    Err(TransferError),
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct Transaction {
    amount: u64,
    timestamp: u64,
    transaction_type: String,
    tx_hash: Option<String>, // For ckBTC transactions
    ckbtc_address: Option<String>, // ckBTC address used
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
    ckbtc_address: Option<String>, // User's unique ckBTC address
    principal: String, // Store as text for Candid compatibility
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
    total_ckbtc_deposits: u64,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct CkBtcDeposit {
    principal: String, // Store as text for Candid compatibility
    amount: u64,
    tx_hash: String,
    timestamp: u64,
    status: String, // "pending", "confirmed", "failed"
}

const TICKET_PRICE: u64 = 1; // 0.00000001 ckBTC
const ROUND_DURATION: u64 = 300_000_000_000; // 5 minutes
const CKBTC_CANISTER_ID: &str = "mxzaz-hqaaa-aaaar-qaada-cai"; // Mainnet ckBTC canister

// ICRC-1 ckBTC canister interface
type CkBtcCanister = candid::Principal;

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
        total_ckbtc_deposits: 0,
    });
    static TIMER_INITIALIZED: std::cell::RefCell<bool> = std::cell::RefCell::new(false);
    static CKBTC_DEPOSITS: std::cell::RefCell<HashMap<String, CkBtcDeposit>> = std::cell::RefCell::new(HashMap::new());
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
        current_time >= round.end_time // 不再判断是否有参与者
    });
    
    if should_draw {
        // Auto draw
        auto_draw_winner();
    }
}

fn auto_draw_winner() {
    let winner = CURRENT_ROUND.with(|r| {
        let mut round = r.borrow_mut();
        // 如果没人参与，直接新建一轮，不发奖
        if round.participants.is_empty() {
            // 只递增轮次，不发奖
            return Some(round.clone());
        }
        let idx = time() as usize % round.participants.len();
        let winner = round.participants[idx];
        round.winners = vec![winner];
        Some(round.clone())
    });
    
    if let Some(winner) = winner {
        // 只有有参与者时才发奖
        if !winner.participants.is_empty() {
            USERS.with(|users| {
                let mut users_ref = users.borrow_mut();
                if let Some(user) = users_ref.get_mut(&winner.winners[0]) {
                    user.balance += winner.prize_pool;
                    user.transaction_history.push(Transaction {
                        amount: winner.prize_pool,
                        timestamp: time(),
                        transaction_type: "Win".to_string(),
                        tx_hash: None,
                        ckbtc_address: None,
                    });
                    user.winning_history.push(Winning {
                        amount: winner.prize_pool,
                        timestamp: time(),
                        round_id: winner.id,
                    });
                }
            });
        }

        // Update statistics
        STATS.with(|s| {
            let mut stats = s.borrow_mut();
            stats.total_rounds += 1;
            if !winner.participants.is_empty() {
                stats.total_winnings += winner.prize_pool;
            }
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
pub fn create_user(principal_str: String) {
    let caller = ic_cdk::caller();
    ic_cdk::println!("👤 [CREATE_USER] Creating user for caller: {}", caller);
    ic_cdk::println!("👤 [CREATE_USER] Requested principal: {}", principal_str);
    
    // Parse the requested principal
    let requested_principal = match Principal::from_text(&principal_str) {
        Ok(p) => p,
        Err(e) => {
            ic_cdk::println!("❌ [CREATE_USER] Invalid principal format: {}", e);
            ic_cdk::trap("Invalid principal format");
        }
    };
    
    ic_cdk::println!("👤 [CREATE_USER] Parsed requested principal: {}", requested_principal);
    
    USERS.with(|users| {
        let mut users_ref = users.borrow_mut();
        
        // Create user with the requested principal
        if !users_ref.contains_key(&requested_principal) {
            ic_cdk::println!("🧪 [CREATE_USER] Creating user with requested principal");
            users_ref.insert(requested_principal, User {
                balance: 100_000_000, // 1 ckBTC
                transaction_history: vec![],
                winning_history: vec![],
                ckbtc_address: None,
                principal: requested_principal.to_string(),
            });
            STATS.with(|s| s.borrow_mut().active_users += 1);
            ic_cdk::println!("✅ [CREATE_USER] User created successfully, active users: {}", 
                           STATS.with(|s| s.borrow().active_users));
        } else {
            ic_cdk::println!("🧪 [CREATE_USER] User already exists: {}", requested_principal);
        }
    });
    
    // Verify user was created
    USERS.with(|users| {
        if users.borrow().contains_key(&requested_principal) {
            ic_cdk::println!("✅ [CREATE_USER] User verification successful");
        } else {
            ic_cdk::println!("❌ [CREATE_USER] User verification failed");
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
                ckbtc_address: None,
                principal: caller.to_string(),
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
                tx_hash: None,
                ckbtc_address: None,
            });
        }
    });
}

#[update]
pub fn place_bet(principal_str: String, tx_hash: String) {
    let caller = ic_cdk::caller();
    ic_cdk::println!("🎲 [PLACE_BET] Caller: {}", caller);
    ic_cdk::println!("🎲 [PLACE_BET] Requested principal: {}", principal_str);
    
    // Parse the requested principal
    let requested_principal = match Principal::from_text(&principal_str) {
        Ok(p) => p,
        Err(e) => {
            ic_cdk::println!("❌ [PLACE_BET] Invalid principal format: {}", e);
            ic_cdk::trap("Invalid principal format");
        }
    };
    
    ic_cdk::println!("🎲 [PLACE_BET] Starting bet placement for user: {}", requested_principal);
    ic_cdk::println!("🎲 [PLACE_BET] Transaction hash: {}", tx_hash);
    ic_cdk::println!("🎲 [PLACE_BET] Ticket price: {} e8s ({} ckBTC)", TICKET_PRICE, TICKET_PRICE as f64 / 100_000_000.0);
    

    // Check if user has sufficient balance and deduct the bet amount
    USERS.with(|users| {
        let mut users_ref = users.borrow_mut();
        if let Some(user) = users_ref.get_mut(&requested_principal) {
            ic_cdk::println!("🎲 [PLACE_BET] User balance before bet: {} e8s ({} ckBTC)", 
                           user.balance, user.balance as f64 / 100_000_000.0);
            ic_cdk::println!("🎲 [PLACE_BET] Required balance: {} e8s ({} ckBTC)", 
                           TICKET_PRICE, TICKET_PRICE as f64 / 100_000_000.0);
            
            if user.balance < TICKET_PRICE {
                ic_cdk::println!("❌ [PLACE_BET] INSUFFICIENT BALANCE: User has {} but needs {}", user.balance, TICKET_PRICE);
                ic_cdk::trap("Insufficient balance for bet");
            }
            
            // Deduct the bet amount from user's balance
            let old_balance = user.balance;
            user.balance -= TICKET_PRICE;
            ic_cdk::println!("🎲 [PLACE_BET] Balance deducted: {} -> {} e8s", old_balance, user.balance);
            
            // Record the bet transaction
            let transaction = Transaction {
                amount: TICKET_PRICE,
                timestamp: time(),
                transaction_type: "Bet".to_string(),
                tx_hash: Some(tx_hash.clone()),
                ckbtc_address: user.ckbtc_address.clone(),
            };
            user.transaction_history.push(transaction);
            ic_cdk::println!("🎲 [PLACE_BET] Transaction recorded: amount={}, type=Bet, tx_hash={}", 
                           TICKET_PRICE, tx_hash);
            ic_cdk::println!("🎲 [PLACE_BET] User transaction history count: {}", user.transaction_history.len());
        } else {
            ic_cdk::println!("❌ [PLACE_BET] ERROR: User not found: {}", requested_principal);
            ic_cdk::trap("User not found");
        }
    });

    // Add user to current round
    CURRENT_ROUND.with(|r| {
        let mut round = r.borrow_mut();
        ic_cdk::println!("🎲 [PLACE_BET] Current round info: ID={}, participants={}, prize_pool={} e8s", 
                       round.id, round.participants.len(), round.prize_pool);
        
        if !round.participants.contains(&requested_principal) {
            round.participants.push(requested_principal);
            let old_prize_pool = round.prize_pool;
            round.prize_pool += TICKET_PRICE;
            ic_cdk::println!("🎲 [PLACE_BET] User added to round participants: {}", requested_principal);
            ic_cdk::println!("🎲 [PLACE_BET] Prize pool updated: {} -> {} e8s", old_prize_pool, round.prize_pool);
            ic_cdk::println!("🎲 [PLACE_BET] Total participants in round: {}", round.participants.len());
        } else {
            ic_cdk::println!("🎲 [PLACE_BET] User already in round participants: {}", requested_principal);
        }
    });

    // Update statistics
    STATS.with(|s| {
        let mut stats = s.borrow_mut();
        let old_total_bets = stats.total_bets;
        stats.total_bets += 1;
        ic_cdk::println!("🎲 [PLACE_BET] Statistics updated: total_bets {} -> {}", old_total_bets, stats.total_bets);
    });

    // Final confirmation
    ic_cdk::println!("✅ [PLACE_BET] Bet placement successful for user: {}", requested_principal);
    ic_cdk::println!("✅ [PLACE_BET] Final user balance: {} e8s", 
                   USERS.with(|users| users.borrow().get(&requested_principal).map(|u| u.balance).unwrap_or(0)));
    ic_cdk::println!("✅ [PLACE_BET] Final prize pool: {} e8s", 
                   CURRENT_ROUND.with(|r| r.borrow().prize_pool));
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
                tx_hash: None,
                ckbtc_address: None,
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
    ic_cdk::println!("🔍 [GET_USER] Looking up user: {}", principal);
    let result = USERS.with(|users| users.borrow().get(&principal).cloned());
    if result.is_some() {
        ic_cdk::println!("✅ [GET_USER] User found: {}", principal);
    } else {
        ic_cdk::println!("❌ [GET_USER] User not found: {}", principal);
    }
    result
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

#[query]
pub fn get_all_users_debug() -> Vec<String> {
    USERS.with(|users| {
        users.borrow().keys().map(|p| p.to_string()).collect()
    })
}

/// Record a ckBTC deposit transaction
#[update]
pub fn record_ckbtc_deposit(tx_hash: String, amount: u64) {
    let caller = ic_cdk::caller();
    
    // Create user if it doesn't exist
    USERS.with(|users| {
        let mut users_ref = users.borrow_mut();
        if !users_ref.contains_key(&caller) {
            users_ref.insert(caller, User {
                balance: 0,
                transaction_history: vec![],
                winning_history: vec![],
                ckbtc_address: None,
                principal: caller.to_string(),
            });
            STATS.with(|s| s.borrow_mut().active_users += 1);
        }
    });
    
    // Record the deposit
    CKBTC_DEPOSITS.with(|deposits| {
        deposits.borrow_mut().insert(tx_hash.clone(), CkBtcDeposit {
            principal: caller.to_string(),
            amount,
            tx_hash: tx_hash.clone(),
            timestamp: time(),
            status: "pending".to_string(),
        });
    });
    
    // Add to user's balance and transaction history
    USERS.with(|users| {
        if let Some(user) = users.borrow_mut().get_mut(&caller) {
            user.balance += amount;
            user.transaction_history.push(Transaction {
                amount,
                timestamp: time(),
                transaction_type: "CkBtcDeposit".to_string(),
                tx_hash: Some(tx_hash),
                ckbtc_address: user.ckbtc_address.clone(),
            });
        }
    });
    
    // Update stats
    STATS.with(|s| {
        s.borrow_mut().total_ckbtc_deposits += amount;
    });
}

/// Get all ckBTC deposits for a user
#[query]
pub fn get_user_ckbtc_deposits(principal: Principal) -> Vec<CkBtcDeposit> {
    CKBTC_DEPOSITS.with(|deposits| {
        deposits.borrow()
            .values()
            .filter(|deposit| deposit.principal == principal.to_string())
            .cloned()
            .collect()
    })
}

/// Get all pending ckBTC deposits
#[query]
pub fn get_pending_ckbtc_deposits() -> Vec<CkBtcDeposit> {
    CKBTC_DEPOSITS.with(|deposits| {
        deposits.borrow()
            .values()
            .filter(|deposit| deposit.status == "pending")
            .cloned()
            .collect()
    })
}

/// Confirm a ckBTC deposit (admin function)
#[update]
pub fn confirm_ckbtc_deposit(tx_hash: String) {
    assert_admin();
    
    CKBTC_DEPOSITS.with(|deposits| {
        if let Some(deposit) = deposits.borrow_mut().get_mut(&tx_hash) {
            deposit.status = "confirmed".to_string();
        }
    });
}

/// Receive ckBTC transfer directly to the lottery canister
#[update]
pub fn receive_ckbtc_transfer(amount: u64, from_principal: String) {
    let caller = ic_cdk::caller();
    
    // Create user if it doesn't exist
    USERS.with(|users| {
        let mut users_ref = users.borrow_mut();
        if !users_ref.contains_key(&caller) {
            users_ref.insert(caller, User {
                balance: 0,
                transaction_history: vec![],
                winning_history: vec![],
                ckbtc_address: None,
                principal: caller.to_string(),
            });
            STATS.with(|s| s.borrow_mut().active_users += 1);
        }
    });
    
    // Add to user's balance and transaction history
    USERS.with(|users| {
        if let Some(user) = users.borrow_mut().get_mut(&caller) {
            user.balance += amount;
            user.transaction_history.push(Transaction {
                amount,
                timestamp: time(),
                transaction_type: "CkBtcTransfer".to_string(),
                tx_hash: Some(format!("transfer_{}_{}", from_principal, time())),
                ckbtc_address: None,
            });
        }
    });
    
    // Update stats
    STATS.with(|s| {
        s.borrow_mut().total_ckbtc_deposits += amount;
    });
    
    ic_cdk::println!("Received ckBTC transfer: {} from {}", amount, from_principal);
}

thread_local! {
    static LAST_ERROR_LOG: std::cell::RefCell<Option<String>> = std::cell::RefCell::new(None);
}

fn log_error(msg: String) {
    ic_cdk::println!("[ERROR] {}", msg); // 仍然保留本地开发输出
    LAST_ERROR_LOG.with(|log| {
        *log.borrow_mut() = Some(msg);
    });
}

#[query]
pub fn get_last_error_log() -> Option<String> {
    LAST_ERROR_LOG.with(|log| log.borrow().clone())
}

/// Get detailed user information for debugging
#[query]
pub fn get_user_debug_info(principal: Principal) -> String {
    let mut debug_info = String::new();
    
    // Get user info
    USERS.with(|users| {
        if let Some(user) = users.borrow().get(&principal) {
            debug_info.push_str(&format!("User Principal: {}\n", principal));
            debug_info.push_str(&format!("Balance: {} e8s ({} ckBTC)\n", 
                                       user.balance, user.balance as f64 / 100_000_000.0));
            debug_info.push_str(&format!("Transaction History Count: {}\n", user.transaction_history.len()));
            debug_info.push_str(&format!("Winning History Count: {}\n", user.winning_history.len()));
            debug_info.push_str(&format!("CkBTC Address: {:?}\n", user.ckbtc_address));
            
            // Show recent transactions
            debug_info.push_str("\nRecent Transactions:\n");
            for (i, tx) in user.transaction_history.iter().rev().take(5).enumerate() {
                debug_info.push_str(&format!("  {}. Type: {}, Amount: {} e8s, Time: {}\n", 
                                           i + 1, tx.transaction_type, tx.amount, tx.timestamp));
            }
        } else {
            debug_info.push_str(&format!("User not found: {}\n", principal));
        }
    });
    
    // Get current round info
    CURRENT_ROUND.with(|r| {
        let round = r.borrow();
        debug_info.push_str(&format!("\nCurrent Round Info:\n"));
        debug_info.push_str(&format!("Round ID: {}\n", round.id));
        debug_info.push_str(&format!("Participants: {}\n", round.participants.len()));
        debug_info.push_str(&format!("Prize Pool: {} e8s ({} ckBTC)\n", 
                                   round.prize_pool, round.prize_pool as f64 / 100_000_000.0));
        debug_info.push_str(&format!("Start Time: {}\n", round.start_time));
        debug_info.push_str(&format!("End Time: {}\n", round.end_time));
        
        // Check if user is in current round
        let is_participant = round.participants.contains(&principal);
        debug_info.push_str(&format!("User in current round: {}\n", is_participant));
    });
    
    // Get system stats
    STATS.with(|s| {
        let stats = s.borrow();
        debug_info.push_str(&format!("\nSystem Stats:\n"));
        debug_info.push_str(&format!("Total Rounds: {}\n", stats.total_rounds));
        debug_info.push_str(&format!("Total Bets: {}\n", stats.total_bets));
        debug_info.push_str(&format!("Total Winnings: {} e8s\n", stats.total_winnings));
        debug_info.push_str(&format!("Active Users: {}\n", stats.active_users));
        debug_info.push_str(&format!("Total ckBTC Deposits: {} e8s\n", stats.total_ckbtc_deposits));
    });
    
    debug_info
}

use candid::{Nat};

#[update]
pub async fn get_user_ckbtc_balance(principal: Principal) -> Nat {
    let account = Account {
        owner: principal,
        subaccount: None,
    };

    let ckbtc_canister: Principal = Principal::from_text("mxzaz-hqaaa-aaaar-qaada-cai").unwrap();

    match ic_cdk::call::<(Account,), (Nat,)>(ckbtc_canister, "icrc1_balance_of", (account,)).await {
        Ok((balance_nat,)) => {
            ic_cdk::println!("✅ ckBTC balance of {:?}: {}", principal, balance_nat.0);
            balance_nat
        },
        Err(e) => {
            let msg = format!("❌ Failed to get ckBTC balance for {}: {:?}", principal, e);
            log_error(msg.clone());
     
            ic_cdk::println!("❌ Error calling ckBTC canister: {:?}", e);
            Nat::from(0u64)
        }
    }
}

/// Check for new ckBTC deposits and update user balances
#[update]
pub async fn check_ckbtc_deposits() {
    let caller = ic_cdk::caller();
    
    // In a real implementation, this would:
    // 1. Query the ckBTC canister for transactions to our address
    // 2. Check if any new deposits have arrived
    // 3. Update user balances accordingly
    
    // For now, we'll just log that this was called
    ic_cdk::println!("Checking ckBTC deposits for user: {}", caller);
}

/// Get ckBTC canister ID for frontend integration
#[query]
pub fn get_ckbtc_canister_id() -> String {
    CKBTC_CANISTER_ID.to_string()
}
