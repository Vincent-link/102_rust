// Rust ICP canister for Virtual BTC Lottery with ckBTC integration
// This canister integrates with ckBTC for real Bitcoin transactions on the Internet Computer

use candid::{CandidType, Principal, Nat};
use ic_cdk::api::time;
use ic_cdk_macros::*;
use ic_cdk_timers::set_timer_interval;
use ic_cdk::storage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

// ICRC-1 related types for ckBTC integration
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct Account {
    owner: Principal,
    subaccount: Option<Vec<u8>>,
}

impl Default for Account {
    fn default() -> Self {
        Self {
            owner: Principal::anonymous(),
            subaccount: None,
        }
    }
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
    deposit_account: Account, // User's unique deposit account
    principal_text: String, // Store as text for Candid compatibility
    last_balance_check: u64, // Last time balance was checked
}

impl Default for User {
    fn default() -> Self {
        Self {
            balance: 0,
            transaction_history: vec![],
            winning_history: vec![],
            deposit_account: Account {
                owner: Principal::anonymous(),
                subaccount: None,
            },
            principal_text: String::new(),
            last_balance_check: 0,
        }
    }
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

impl Default for Round {
    fn default() -> Self {
        Self {
            id: 0,
            participants: vec![],
            prize_pool: 0,
            start_time: time(),
            end_time: time() + ROUND_DURATION,
            winners: vec![],
        }
    }
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
pub struct SystemStats {
    total_rounds: u64,
    total_bets: u64,
    total_winnings: u64,
    active_users: u64,
    total_ckbtc_deposits: u64,
}

impl Default for SystemStats {
    fn default() -> Self {
        Self {
            total_rounds: 0,
            total_bets: 0,
            total_winnings: 0,
            active_users: 0,
            total_ckbtc_deposits: 0,
        }
    }
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
const BALANCE_CHECK_INTERVAL: u64 = 60_000_000_000; // 1 minute in nanoseconds

// ICRC-1 ckBTC canister interface
type CkBtcCanister = candid::Principal;

// 稳定的数据结构，用于持久化存储
#[derive(CandidType, Deserialize, Serialize)]
struct StableStorage {
    users: HashMap<Principal, User>,
    current_round: Round,
    stats: SystemStats,
    admin: Option<Principal>,
    ckbtc_deposits: HashMap<String, CkBtcDeposit>,
    treasury_account: Account, // 统一资金账户
}

impl Default for StableStorage {
    fn default() -> Self {
        Self {
            users: HashMap::new(),
            current_round: Round::default(),
            stats: SystemStats::default(),
            admin: None,
            ckbtc_deposits: HashMap::new(),
            treasury_account: Account {
                owner: Principal::anonymous(), // 临时设置，后续会更新为实际的管理员账户
                subaccount: None,
            },
        }
    }
}

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
    static TREASURY_ACCOUNT: std::cell::RefCell<Account> = std::cell::RefCell::new(Account {
        owner: Principal::anonymous(),
        subaccount: None,
    });
}

// 稳定的存储变量
static mut STABLE_STORAGE: Option<StableStorage> = None;

// 获取稳定存储的引用
fn get_stable_storage() -> &'static mut StableStorage {
    unsafe {
        if STABLE_STORAGE.is_none() {
            STABLE_STORAGE = Some(StableStorage::default());
        }
        STABLE_STORAGE.as_mut().unwrap()
    }
}

// 从稳定存储加载数据到线程本地存储
fn load_from_stable_storage() {
    let stable = get_stable_storage();
    
    // 加载用户数据
    USERS.with(|users| {
        *users.borrow_mut() = stable.users.clone();
    });
    
    // 加载当前轮次
    CURRENT_ROUND.with(|round| {
        *round.borrow_mut() = stable.current_round.clone();
    });
    
    // 加载统计信息
    STATS.with(|stats| {
        *stats.borrow_mut() = stable.stats.clone();
    });
    
    // 加载管理员
    ADMIN.with(|admin| {
        *admin.borrow_mut() = stable.admin;
    });
    
    // 加载 ckBTC 存款记录
    CKBTC_DEPOSITS.with(|deposits| {
        *deposits.borrow_mut() = stable.ckbtc_deposits.clone();
    });
    
    // 加载统一资金账户
    TREASURY_ACCOUNT.with(|treasury| {
        *treasury.borrow_mut() = stable.treasury_account.clone();
    });
}

// 保存数据到稳定存储
fn save_to_stable_storage() {
    let stable = get_stable_storage();
    
    // 保存用户数据
    USERS.with(|users| {
        stable.users = users.borrow().clone();
    });
    
    // 保存当前轮次
    CURRENT_ROUND.with(|round| {
        stable.current_round = round.borrow().clone();
    });
    
    // 保存统计信息
    STATS.with(|stats| {
        stable.stats = stats.borrow().clone();
    });
    
    // 保存管理员
    ADMIN.with(|admin| {
        stable.admin = *admin.borrow();
    });
    
    // 保存 ckBTC 存款记录
    CKBTC_DEPOSITS.with(|deposits| {
        stable.ckbtc_deposits = deposits.borrow().clone();
    });
    
    // 保存统一资金账户
    TREASURY_ACCOUNT.with(|treasury| {
        stable.treasury_account = treasury.borrow().clone();
    });
}

#[pre_upgrade]
fn pre_upgrade() {
    // 在升级前保存数据到稳定存储
    save_to_stable_storage();
    
    // 将稳定存储序列化到 stable memory
    let stable = get_stable_storage();
    storage::stable_save((stable,)).expect("Failed to save to stable memory");
}

#[post_upgrade]
fn post_upgrade() {
    // 尝试从 stable memory 反序列化数据，如果失败则用默认值
    let stable_result: Result<(StableStorage,), _> = storage::stable_restore();
    let stable = match stable_result {
        Ok((stable,)) => stable,
        Err(_) => StableStorage::default(),
    };
    unsafe {
        STABLE_STORAGE = Some(stable);
    }
    load_from_stable_storage();
    ensure_timer_initialized();
}

#[update]
pub fn initialize_auth() {
    let caller = ic_cdk::caller();
    ADMIN.with(|a| {
        if a.borrow().is_none() {
            *a.borrow_mut() = Some(caller);
        }
    });
    
    // 设置统一资金账户为管理员账户
    TREASURY_ACCOUNT.with(|treasury| {
        *treasury.borrow_mut() = Account {
            owner: caller,
            subaccount: None,
        };
    });
    
    // Initialize timer
    initialize_timer();
    
    // 保存数据到稳定存储
    save_to_stable_storage();
}

// 自动初始化定时器，确保轮次能正常进行
fn ensure_timer_initialized() {
    TIMER_INITIALIZED.with(|initialized| {
        if !*initialized.borrow() {
            initialize_timer();
        }
    });
}

fn initialize_timer() {
    TIMER_INITIALIZED.with(|initialized| {
        if !*initialized.borrow() {
            // Set timer to check round status every 30 seconds (更频繁的检查)
            set_timer_interval(Duration::from_secs(30), || {
                ic_cdk::spawn(async {
                    check_and_auto_draw().await;
                });
            });
            
            // Set timer to auto consolidate accounts every 10 minutes
            set_timer_interval(Duration::from_secs(600), || {
                ic_cdk::spawn(async {
                    auto_consolidate_accounts().await;
                });
            });
            
            *initialized.borrow_mut() = true;
        }
    });
}

async fn check_and_auto_draw() {
    let current_time = time();
    let round_info = CURRENT_ROUND.with(|r| {
        let round = r.borrow();
        (round.clone(), current_time >= round.end_time)
    });
    
    let (round, should_draw) = round_info;
    
    if should_draw {
        ic_cdk::println!("🎲 [AUTO_DRAW] Round {} ended, starting auto draw...", round.id);
        auto_draw_winner();
        
        // 保存数据到稳定存储
        save_to_stable_storage();
        
        ic_cdk::println!("✅ [AUTO_DRAW] Auto draw completed, new round {} started", round.id + 1);
    }
}

fn auto_draw_winner() {
    let winner = CURRENT_ROUND.with(|r| {
        let mut round = r.borrow_mut();
        if round.participants.is_empty() {
            ic_cdk::println!("🎲 [AUTO_DRAW] No participants in round {}, starting new round", round.id);
            return Some(round.clone());
        }
        let idx = time() as usize % round.participants.len();
        let winner = round.participants[idx];
        round.winners = vec![winner];
        ic_cdk::println!("🎲 [AUTO_DRAW] Winner selected: {} from {} participants", winner, round.participants.len());
        Some(round.clone())
    });
    
    if let Some(winner) = winner {
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
                    ic_cdk::println!("🎉 [AUTO_DRAW] Winner {} received {} e8s prize", winner.winners[0], winner.prize_pool);
                }
            });
        }

        STATS.with(|s| {
            let mut stats = s.borrow_mut();
            stats.total_rounds += 1;
            if !winner.participants.is_empty() {
                stats.total_winnings += winner.prize_pool;
            }
        });

        // 创建新轮次
        let new_round = Round {
            id: winner.id + 1,
            participants: vec![],
            prize_pool: 0,
            start_time: time(),
            end_time: time() + ROUND_DURATION,
            winners: vec![],
        };
        
        CURRENT_ROUND.with(|r| {
            *r.borrow_mut() = new_round.clone();
        });
        
        ic_cdk::println!("🔄 [AUTO_DRAW] New round {} started: start_time={}, end_time={}", 
                       new_round.id, new_round.start_time, new_round.end_time);
    }
}

// 检查所有用户余额
async fn check_all_user_balances() {
    ic_cdk::println!("🔄 [BALANCE_CHECK] Starting balance check for all users");
    
    let users_to_check = USERS.with(|users| {
        users.borrow().iter()
            .filter(|(_, user)| {
                time() - user.last_balance_check > BALANCE_CHECK_INTERVAL
            })
            .map(|(principal, user)| (*principal, user.deposit_account.clone()))
            .collect::<Vec<_>>()
    });
    
    for (principal, account) in users_to_check {
        ic_cdk::spawn(async move {
            update_user_balance(principal, account).await;
        });
    }
}

// 更新单个用户余额并自动归集到统一账户
async fn update_user_balance(principal: Principal, account: Account) {
    ic_cdk::println!("💰 [UPDATE_BALANCE] Checking balance for user: {}", principal);
    let ckbtc_canister: CkBtcCanister = CKBTC_CANISTER_ID.parse().unwrap();
    let account_for_call = account.clone();
    match ic_cdk::call::<_, (Nat,)>(ckbtc_canister, "icrc1_balance_of", (account_for_call,)).await {
        Ok((balance,)) => {
            let balance_u64: u64 = balance.0.try_into().unwrap_or(0);
            USERS.with(|users| {
                let mut users_ref = users.borrow_mut();
                if let Some(user) = users_ref.get_mut(&principal) {
                    let old_balance = user.balance;
                    user.last_balance_check = time();
                    if balance_u64 > old_balance {
                        let deposit_amount = balance_u64 - old_balance;
                        user.balance += deposit_amount;
                        ic_cdk::println!("✅ [UPDATE_BALANCE] User {} deposited {} e8s", principal, deposit_amount);
                        user.transaction_history.push(Transaction {
                            amount: deposit_amount,
                            timestamp: time(),
                            transaction_type: "Deposit".to_string(),
                            tx_hash: None,
                            ckbtc_address: Some(format!("{:?}", account)),
                        });
                        STATS.with(|s| s.borrow_mut().total_ckbtc_deposits += deposit_amount);
                        
                        // 自动归集到统一账户
                        ic_cdk::spawn(async move {
                            auto_consolidate_to_treasury(principal, deposit_amount, account).await;
                        });
                    }
                }
            });
        },
        Err(error) => {
            ic_cdk::println!("❌ [UPDATE_BALANCE] Failed to get balance for user {}: {:?}", principal, error);
        }
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
pub fn create_user(principal: String) {
    // 确保定时器已初始化
    ensure_timer_initialized();
    
    let caller = ic_cdk::caller();
    ic_cdk::println!("👤 [CREATE_USER] Creating user for caller: {}", caller);
    ic_cdk::println!("👤 [CREATE_USER] Requested principal: {}", principal);
    
    let requested_principal = match Principal::from_text(&principal) {
        Ok(p) => p,
        Err(e) => {
            ic_cdk::println!("❌ [CREATE_USER] Invalid principal format: {}", e);
            ic_cdk::trap("Invalid principal format");
        }
    };
    
    USERS.with(|users| {
        let mut users_ref = users.borrow_mut();
        
        if !users_ref.contains_key(&requested_principal) {
            // 为用户创建唯一的充值账户
            let deposit_account = Account {
                owner: requested_principal,
                subaccount: Some(requested_principal.as_slice().to_vec()),
            };
            
            ic_cdk::println!("🧪 [CREATE_USER] Creating user with deposit account: {:?}", deposit_account);
            
            users_ref.insert(requested_principal, User {
                balance: 0,
                transaction_history: vec![],
                winning_history: vec![],
                deposit_account,
                principal_text: requested_principal.to_string(),
                last_balance_check: time(),
            });
            
            STATS.with(|s| s.borrow_mut().active_users += 1);
            ic_cdk::println!("✅ [CREATE_USER] User created successfully, active users: {}", 
                           STATS.with(|s| s.borrow().active_users));
        } else {
            ic_cdk::println!("🧪 [CREATE_USER] User already exists: {}", requested_principal);
        }
    });
    
    // 保存数据到稳定存储
    save_to_stable_storage();
}

#[query]
pub fn get_user_deposit_account(principal_str: String) -> Option<Account> {
    let requested_principal = match Principal::from_text(&principal_str) {
        Ok(p) => p,
        Err(_) => return None,
    };
    
    USERS.with(|users| {
        users.borrow().get(&requested_principal).map(|user| user.deposit_account.clone())
    })
}

#[update]
pub fn update_balance(principal_str: String) {
    let caller = ic_cdk::caller();
    ic_cdk::println!("🔄 [UPDATE_BALANCE] Manual balance update requested by: {}", caller);
    
    let requested_principal = match Principal::from_text(&principal_str) {
        Ok(p) => p,
        Err(e) => {
            ic_cdk::println!("❌ [UPDATE_BALANCE] Invalid principal format: {}", e);
            ic_cdk::trap("Invalid principal format");
        }
    };
    
    let account = USERS.with(|users| {
        users.borrow().get(&requested_principal).map(|user| user.deposit_account.clone())
    });
    
    if let Some(account) = account {
        ic_cdk::spawn(async move {
            update_user_balance(requested_principal, account).await;
        });
    } else {
        ic_cdk::trap("User not found");
    }
}

// 新增：直接检查 Principal 的 ckBTC 余额
#[update]
pub fn update_balance_from_principal(principal_str: String) {
    let caller = ic_cdk::caller();
    ic_cdk::println!("🔄 [UPDATE_BALANCE_PRINCIPAL] Manual balance update from principal requested by: {}", caller);
    
    let requested_principal = match Principal::from_text(&principal_str) {
        Ok(p) => p,
        Err(e) => {
            ic_cdk::println!("❌ [UPDATE_BALANCE_PRINCIPAL] Invalid principal format: {}", e);
            ic_cdk::trap("Invalid principal format");
        }
    };
    
    // 创建用户的 deposit account（如果不存在）
    USERS.with(|users| {
        let mut users_ref = users.borrow_mut();
        if !users_ref.contains_key(&requested_principal) {
            let deposit_account = Account {
                owner: requested_principal,
                subaccount: Some(requested_principal.as_slice().to_vec()),
            };
            
            users_ref.insert(requested_principal, User {
                balance: 0,
                transaction_history: vec![],
                winning_history: vec![],
                deposit_account,
                principal_text: requested_principal.to_string(),
                last_balance_check: time(),
            });
            
            STATS.with(|s| s.borrow_mut().active_users += 1);
            ic_cdk::println!("✅ [UPDATE_BALANCE_PRINCIPAL] User created for principal: {}", requested_principal);
        }
    });
    
    // 检查 Principal 的 ckBTC 余额
    ic_cdk::spawn(async move {
        update_principal_balance(requested_principal).await;
    });
}

// 新增：更新 Principal 余额的函数
async fn update_principal_balance(principal: Principal) {
    ic_cdk::println!("💰 [UPDATE_PRINCIPAL_BALANCE] Checking ckBTC balance for principal: {}", principal);
    let ckbtc_canister: CkBtcCanister = CKBTC_CANISTER_ID.parse().unwrap();
    let main_account = Account {
        owner: principal,
        subaccount: None,
    };
    match ic_cdk::call::<_, (Nat,)>(ckbtc_canister, "icrc1_balance_of", (main_account,)).await {
        Ok((balance,)) => {
            let balance_u64: u64 = balance.0.try_into().unwrap_or(0);
            ic_cdk::println!("✅ [UPDATE_PRINCIPAL_BALANCE] Principal {} has {} e8s in main account", principal, balance_u64);
            USERS.with(|users| {
                let mut users_ref = users.borrow_mut();
                if let Some(user) = users_ref.get_mut(&principal) {
                    let old_balance = user.balance;
                    user.last_balance_check = time();
                    if balance_u64 > old_balance {
                        let deposit_amount = balance_u64 - old_balance;
                        user.balance += deposit_amount;
                        ic_cdk::println!("✅ [UPDATE_PRINCIPAL_BALANCE] User {} balance updated: {} -> {} e8s", principal, old_balance, user.balance);
                        user.transaction_history.push(Transaction {
                            amount: deposit_amount,
                            timestamp: time(),
                            transaction_type: "PrincipalDeposit".to_string(),
                            tx_hash: None,
                            ckbtc_address: Some(format!("Principal: {}", principal)),
                        });
                        STATS.with(|s| s.borrow_mut().total_ckbtc_deposits += deposit_amount);
                    }
                }
            });
        },
        Err(error) => {
            ic_cdk::println!("❌ [UPDATE_PRINCIPAL_BALANCE] Failed to get balance for principal {}: {:?}", principal, error);
        }
    }
}

#[update]
pub fn place_bet(principal_str: String) {
    // 确保定时器已初始化
    ensure_timer_initialized();
    
    let caller = ic_cdk::caller();
    ic_cdk::println!("🎲 [PLACE_BET] Caller: {}", caller);
    ic_cdk::println!("🎲 [PLACE_BET] Requested principal: {}", principal_str);
    
    let requested_principal = match Principal::from_text(&principal_str) {
        Ok(p) => p,
        Err(e) => {
            ic_cdk::println!("❌ [PLACE_BET] Invalid principal format: {}", e);
            ic_cdk::trap("Invalid principal format");
        }
    };
    
    ic_cdk::println!("🎲 [PLACE_BET] Starting bet placement for user: {}", requested_principal);
    ic_cdk::println!("🎲 [PLACE_BET] Ticket price: {} e8s ({} ckBTC)", TICKET_PRICE, TICKET_PRICE as f64 / 100_000_000.0);

    // 检查用户余额并扣除下注金额
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
            
            // 扣除下注金额
            let old_balance = user.balance;
            user.balance -= TICKET_PRICE;
            ic_cdk::println!("🎲 [PLACE_BET] Balance deducted: {} -> {} e8s", old_balance, user.balance);
            
            // 记录下注交易
            let transaction = Transaction {
                amount: TICKET_PRICE,
                timestamp: time(),
                transaction_type: "Bet".to_string(),
                tx_hash: None,
                ckbtc_address: Some(format!("{:?}", user.deposit_account)),
            };
            user.transaction_history.push(transaction);
            ic_cdk::println!("🎲 [PLACE_BET] Transaction recorded: amount={}, type=Bet", TICKET_PRICE);
        } else {
            ic_cdk::println!("❌ [PLACE_BET] ERROR: User not found: {}", requested_principal);
            ic_cdk::trap("User not found");
        }
    });

    // 添加用户到当前轮次（支持多次下注）
    CURRENT_ROUND.with(|r| {
        let mut round = r.borrow_mut();
        ic_cdk::println!("🎲 [PLACE_BET] Current round info: ID={}, participants={}, prize_pool={} e8s", 
                       round.id, round.participants.len(), round.prize_pool);
        
        // 允许用户多次下注：每次下注都添加到参与者列表
        round.participants.push(requested_principal);
        let old_prize_pool = round.prize_pool;
        round.prize_pool += TICKET_PRICE;
        
        // 计算用户在本轮的下注次数
        let user_bet_count = round.participants.iter()
            .filter(|&&p| p == requested_principal)
            .count();
        
        ic_cdk::println!("🎲 [PLACE_BET] User added to round participants: {} (bet #{})", requested_principal, user_bet_count);
        ic_cdk::println!("🎲 [PLACE_BET] Prize pool updated: {} -> {} e8s", old_prize_pool, round.prize_pool);
        ic_cdk::println!("🎲 [PLACE_BET] Total participants in round: {}", round.participants.len());
    });

    // 更新统计
    STATS.with(|s| {
        let mut stats = s.borrow_mut();
        stats.total_bets += 1;
    });

    ic_cdk::println!("✅ [PLACE_BET] Bet placement successful for user: {}", requested_principal);
    
    // 保存数据到稳定存储
    save_to_stable_storage();
}

#[update]
pub async fn withdraw_balance(principal_str: String, amount: u64) -> Result<String, String> {
    let caller = ic_cdk::caller();
    ic_cdk::println!("💸 [WITHDRAW] Withdrawal requested by: {}", caller);
    ic_cdk::println!("💸 [WITHDRAW] Requested principal: {}", principal_str);
    ic_cdk::println!("💸 [WITHDRAW] Amount: {} e8s", amount);
    
    let requested_principal = match Principal::from_text(&principal_str) {
        Ok(p) => p,
        Err(e) => {
            ic_cdk::println!("❌ [WITHDRAW] Invalid principal format: {}", e);
            return Err(format!("Invalid principal format: {}", e));
        }
    };
    
    // 检查用户余额
    let user_info = USERS.with(|users| {
        users.borrow().get(&requested_principal).cloned()
    });
    
    if let Some(user) = user_info {
        if user.balance < amount {
            ic_cdk::println!("❌ [WITHDRAW] INSUFFICIENT BALANCE: User has {} but wants to withdraw {}", user.balance, amount);
            return Err(format!("Insufficient balance for withdrawal. User has {} but wants to withdraw {}", user.balance, amount));
        }
        
        // 🔄 提现前先自动归集用户的充值账户
        ic_cdk::println!("🔄 [WITHDRAW] Auto consolidating user accounts before withdrawal");
        match auto_consolidate_user_accounts(requested_principal).await {
            Ok(consolidated_amount) => {
                ic_cdk::println!("✅ [WITHDRAW] Auto consolidation completed: {} e8s consolidated", consolidated_amount);
            },
            Err(error) => {
                ic_cdk::println!("⚠️ [WITHDRAW] Auto consolidation failed: {}", error);
                // 继续提现流程，不因为归集失败而阻止提现
            }
        }
        
        // 从统一账户提现给用户
        let treasury_account = TREASURY_ACCOUNT.with(|treasury| treasury.borrow().clone());
        let ckbtc_canister: CkBtcCanister = CKBTC_CANISTER_ID.parse().unwrap();
        
        // 创建转账参数 - 从统一账户转给用户
        let transfer_args = TransferArgs {
            to: Account {
                owner: requested_principal,
                subaccount: None,
            },
            amount,
            fee: Some(1_000), // 0.00001 ckBTC fee (降低费用)
            memo: Some(format!("Lottery withdrawal from treasury").into_bytes()),
            from_subaccount: treasury_account.subaccount.clone(),
            created_at_time: Some(time()),
        };
        
        match ic_cdk::call::<_, (TransferResult,)>(ckbtc_canister, "icrc1_transfer", (transfer_args,)).await {
            Ok((result,)) => {
                match result {
                    TransferResult::Ok(block_index) => {
                        ic_cdk::println!("✅ [WITHDRAW] Withdrawal from treasury successful! Block index: {}", block_index);
                        
                        // 更新用户余额
                        USERS.with(|users| {
                            let mut users_ref = users.borrow_mut();
                            if let Some(user) = users_ref.get_mut(&requested_principal) {
                                user.balance -= amount;
                                
                                // 记录提现交易
                                user.transaction_history.push(Transaction {
                                    amount,
                                    timestamp: time(),
                                    transaction_type: "Withdraw".to_string(),
                                    tx_hash: Some(format!("withdraw_{}", block_index)),
                                    ckbtc_address: Some(format!("Treasury: {:?}", treasury_account)),
                                });
                            }
                        });
                        
                        // 保存数据到稳定存储
                        save_to_stable_storage();
                        
                        Ok(format!("Withdrawal successful! Block index: {}", block_index))
                    },
                    TransferResult::Err(error) => {
                        ic_cdk::println!("❌ [WITHDRAW] Transfer from treasury failed: {:?}", error);
                        Err(format!("Transfer from treasury failed: {:?}", error))
                    }
                }
            },
            Err(error) => {
                ic_cdk::println!("❌ [WITHDRAW] Call to ckBTC canister failed: {:?}", error);
                Err(format!("Call to ckBTC canister failed: {:?}", error))
            }
        }
    } else {
        Err("User not found".to_string())
    }
}

#[query]
pub fn get_user(principal: Principal) -> Option<User> {
    ic_cdk::println!("🔍 [GET_USER] Looking up user: {}", principal);
    let result = USERS.with(|users| users.borrow().get(&principal).cloned());
    if let Some(ref user) = result {
        ic_cdk::println!("✅ [GET_USER] User found: {}", principal);
        ic_cdk::println!("✅ [GET_USER] User balance: {} e8s ({} ckBTC)", 
                       user.balance, user.balance as f64 / 100_000_000.0);
    } else {
        ic_cdk::println!("❌ [GET_USER] User not found: {}", principal);
    }
    result
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
                ckbtc_address: Some(format!("{:?}", user.deposit_account)),
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
    
    // 保存数据到稳定存储
    save_to_stable_storage();
}

#[query]
pub fn get_round() -> Round {
    // 确保定时器已初始化
    ensure_timer_initialized();
    
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
                deposit_account: Account {
                    owner: caller,
                    subaccount: None,
                },
                principal_text: caller.to_string(),
                last_balance_check: time(),
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
                ckbtc_address: Some(format!("{:?}", user.deposit_account)),
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
                deposit_account: Account {
                    owner: caller,
                    subaccount: None,
                },
                principal_text: caller.to_string(),
                last_balance_check: time(),
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
                ckbtc_address: Some(format!("{:?}", user.deposit_account)),
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
            debug_info.push_str(&format!("CkBTC Address: {:?}\n", user.deposit_account));
            
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

#[update]
pub async fn get_user_ckbtc_balance(principal: Principal) -> Nat {
    let account = Account {
        owner: principal,
        subaccount: None,
    };

    let ckbtc_canister: Principal = Principal::from_text("mxzaz-hqaaa-aaaar-qaada-cai").unwrap();

    match ic_cdk::call::<_, (Nat,)>(ckbtc_canister, "icrc1_balance_of", (account,)).await {
        Ok((balance,)) => {
            ic_cdk::println!("✅ ckBTC balance of {:?}: {}", principal, balance.0);
            balance
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

// 新增：查询特定 ckBTC 账户余额
#[update]
pub async fn get_ckbtc_account_balance(owner: String, subaccount_hex: Option<String>) -> Result<u64, String> {
    ic_cdk::println!("💰 [GET_CKBTC_ACCOUNT_BALANCE] Checking balance for owner: {}, subaccount: {:?}", owner, subaccount_hex);
    
    let owner_principal = match Principal::from_text(&owner) {
        Ok(p) => p,
        Err(e) => {
            ic_cdk::println!("❌ [GET_CKBTC_ACCOUNT_BALANCE] Invalid owner principal: {}", e);
            return Err(format!("Invalid owner principal: {}", e));
        }
    };
    
    // 解析 subaccount
    let subaccount_bytes = if let Some(hex_str) = subaccount_hex {
        // 将十六进制字符串转换为字节数组
        if hex_str.len() % 2 != 0 {
            return Err("Invalid hex string length".to_string());
        }
        
        let mut bytes = Vec::new();
        for i in (0..hex_str.len()).step_by(2) {
            let byte_str = &hex_str[i..i+2];
            match u8::from_str_radix(byte_str, 16) {
                Ok(byte) => bytes.push(byte),
                Err(_) => return Err(format!("Invalid hex character in: {}", byte_str)),
            }
        }
        Some(bytes)
    } else {
        None
    };
    
    // 创建账户
    let account = Account {
        owner: owner_principal,
        subaccount: subaccount_bytes,
    };
    
    ic_cdk::println!("💰 [GET_CKBTC_ACCOUNT_BALANCE] Account: {:?}", account);
    
    let ckbtc_canister: CkBtcCanister = CKBTC_CANISTER_ID.parse().unwrap();
    
    match ic_cdk::call::<_, (Nat,)>(ckbtc_canister, "icrc1_balance_of", (account,)).await {
        Ok((balance,)) => {
            let balance_u64: u64 = balance.0.try_into().unwrap_or(0);
            ic_cdk::println!("✅ [GET_CKBTC_ACCOUNT_BALANCE] Account balance: {} e8s", balance_u64);
            Ok(balance_u64)
        },
        Err(error) => {
            ic_cdk::println!("❌ [GET_CKBTC_ACCOUNT_BALANCE] Failed to get balance: {:?}", error);
            Err(format!("Failed to get balance: {:?}", error))
        }
    }
}

// 新增：自动归集到统一账户
async fn auto_consolidate_to_treasury(principal: Principal, amount: u64, from_account: Account) {
    ic_cdk::println!("🔄 [AUTO_CONSOLIDATE_TREASURY] Consolidating {} e8s from user {} to treasury", amount, principal);
    
    let treasury_account = TREASURY_ACCOUNT.with(|treasury| treasury.borrow().clone());
    let ckbtc_canister: CkBtcCanister = CKBTC_CANISTER_ID.parse().unwrap();
    
    // 创建转账参数
    let transfer_args = TransferArgs {
        to: treasury_account.clone(),
        amount,
        fee: Some(1_000), // 0.00001 ckBTC fee (降低费用)
        memo: Some(format!("Auto consolidation from user {}", principal).into_bytes()),
        from_subaccount: from_account.subaccount.clone(),
        created_at_time: Some(time()),
    };
    
    match ic_cdk::call::<_, (TransferResult,)>(ckbtc_canister, "icrc1_transfer", (transfer_args,)).await {
        Ok((result,)) => {
            match result {
                TransferResult::Ok(block_index) => {
                    ic_cdk::println!("✅ [AUTO_CONSOLIDATE_TREASURY] Successfully consolidated {} e8s to treasury (Block: {})", amount, block_index);
                    
                    // 记录归集交易
                    USERS.with(|users| {
                        let mut users_ref = users.borrow_mut();
                        if let Some(user) = users_ref.get_mut(&principal) {
                            user.transaction_history.push(Transaction {
                                amount,
                                timestamp: time(),
                                transaction_type: "TreasuryConsolidation".to_string(),
                                tx_hash: Some(format!("treasury_consolidation_{}", block_index)),
                                ckbtc_address: Some(format!("Treasury: {:?}", treasury_account)),
                            });
                        }
                    });
                },
                TransferResult::Err(error) => {
                    ic_cdk::println!("❌ [AUTO_CONSOLIDATE_TREASURY] Transfer to treasury failed: {:?}", error);
                }
            }
        },
        Err(error) => {
            ic_cdk::println!("❌ [AUTO_CONSOLIDATE_TREASURY] Call to ckBTC canister failed: {:?}", error);
        }
    }
}

// 新增：查询用户所有相关账户的余额
#[update]
pub async fn get_user_all_balances(principal_str: String) -> Result<Vec<(String, u64)>, String> {
    ic_cdk::println!("💰 [GET_USER_ALL_BALANCES] Checking all balances for user: {}", principal_str);
    
    let principal = match Principal::from_text(&principal_str) {
        Ok(p) => p,
        Err(e) => {
            ic_cdk::println!("❌ [GET_USER_ALL_BALANCES] Invalid principal: {}", e);
            return Err(format!("Invalid principal: {}", e));
        }
    };
    
    let mut balances = Vec::new();
    let ckbtc_canister: CkBtcCanister = CKBTC_CANISTER_ID.parse().unwrap();
    
    // 1. 检查主账户余额（没有 subaccount）
    let main_account = Account {
        owner: principal,
        subaccount: None,
    };
    
    match ic_cdk::call::<_, (Nat,)>(ckbtc_canister, "icrc1_balance_of", (main_account,)).await {
        Ok((balance,)) => {
            let balance_u64: u64 = balance.0.try_into().unwrap_or(0);
            balances.push(("Main Account".to_string(), balance_u64));
            ic_cdk::println!("✅ [GET_USER_ALL_BALANCES] Main account balance: {} e8s", balance_u64);
        },
        Err(error) => {
            ic_cdk::println!("❌ [GET_USER_ALL_BALANCES] Failed to get main account balance: {:?}", error);
        }
    }
    
    // 2. 检查用户的 deposit account 余额
    let user = USERS.with(|users| {
        users.borrow().get(&principal).cloned()
    });
    
    if let Some(user) = user {
        let deposit_account = user.deposit_account;
        match ic_cdk::call::<_, (Nat,)>(ckbtc_canister, "icrc1_balance_of", (deposit_account.clone(),)).await {
            Ok((balance,)) => {
                let balance_u64: u64 = balance.0.try_into().unwrap_or(0);
                let account_name = if deposit_account.subaccount.is_some() {
                    "Deposit Account (with subaccount)".to_string()
                } else {
                    "Deposit Account".to_string()
                };
                balances.push((account_name, balance_u64));
                ic_cdk::println!("✅ [GET_USER_ALL_BALANCES] Deposit account balance: {} e8s", balance_u64);
            },
            Err(error) => {
                ic_cdk::println!("❌ [GET_USER_ALL_BALANCES] Failed to get deposit account balance: {:?}", error);
            }
        }
    }
    
    Ok(balances)
}



// 新增：查询统一账户余额
#[update]
pub async fn get_treasury_balance() -> Result<u64, String> {
    let treasury_account = TREASURY_ACCOUNT.with(|treasury| treasury.borrow().clone());
    let ckbtc_canister: CkBtcCanister = CKBTC_CANISTER_ID.parse().unwrap();
    
    match ic_cdk::call::<_, (Nat,)>(ckbtc_canister, "icrc1_balance_of", (treasury_account,)).await {
        Ok((balance,)) => {
            let balance_u64: u64 = balance.0.try_into().unwrap_or(0);
            ic_cdk::println!("💰 [TREASURY_BALANCE] Treasury balance: {} e8s", balance_u64);
            Ok(balance_u64)
        },
        Err(error) => {
            ic_cdk::println!("❌ [TREASURY_BALANCE] Failed to get treasury balance: {:?}", error);
            Err(format!("Failed to get treasury balance: {:?}", error))
        }
    }
}

// 新增：获取统一账户信息
#[query]
pub fn get_treasury_account() -> Account {
    TREASURY_ACCOUNT.with(|treasury| treasury.borrow().clone())
}



// 新增：内部自动归集用户账户函数
async fn auto_consolidate_user_accounts(principal: Principal) -> Result<u64, String> {
    ic_cdk::println!("🔄 [AUTO_CONSOLIDATE_USER] Consolidating accounts for user: {}", principal);
    
    // 获取用户信息
    let user = USERS.with(|users| {
        users.borrow().get(&principal).cloned()
    });
    
    if user.is_none() {
        return Err("User not found".to_string());
    }
    
    let user = user.unwrap();
    let ckbtc_canister: CkBtcCanister = CKBTC_CANISTER_ID.parse().unwrap();
    let mut total_consolidated = 0u64;
    
    // 1. 检查 deposit account 余额
    let deposit_balance = match ic_cdk::call::<_, (Nat,)>(ckbtc_canister, "icrc1_balance_of", (user.deposit_account.clone(),)).await {
        Ok((balance,)) => {
            let balance_u64: u64 = balance.0.try_into().unwrap_or(0);
            ic_cdk::println!("💰 [AUTO_CONSOLIDATE_USER] Deposit account balance: {} e8s", balance_u64);
            balance_u64
        },
        Err(error) => {
            ic_cdk::println!("❌ [AUTO_CONSOLIDATE_USER] Failed to get deposit account balance: {:?}", error);
            0
        }
    };
    
    // 2. 如果 deposit account 有余额，转移到统一账户
    if deposit_balance > 0 {
        let treasury_account = TREASURY_ACCOUNT.with(|treasury| treasury.borrow().clone());
        let transfer_args = TransferArgs {
            to: treasury_account,
            amount: deposit_balance,
            fee: Some(1_000), // 0.00001 ckBTC fee (降低费用)
            memo: Some(format!("Auto consolidation from user {}", principal).into_bytes()),
            from_subaccount: user.deposit_account.subaccount.clone(),
            created_at_time: Some(time()),
        };
        
        match ic_cdk::call::<_, (TransferResult,)>(ckbtc_canister, "icrc1_transfer", (transfer_args,)).await {
            Ok((result,)) => {
                match result {
                    TransferResult::Ok(block_index) => {
                        total_consolidated += deposit_balance;
                        ic_cdk::println!("✅ [AUTO_CONSOLIDATE_USER] Deposit account consolidated: {} e8s (Block: {})", deposit_balance, block_index);
                    },
                    TransferResult::Err(error) => {
                        ic_cdk::println!("❌ [AUTO_CONSOLIDATE_USER] Deposit account transfer failed: {:?}", error);
                    }
                }
            },
            Err(error) => {
                ic_cdk::println!("❌ [AUTO_CONSOLIDATE_USER] Call to ckBTC canister failed: {:?}", error);
            }
        }
    }
    
    // 3. 检查其他可能的 subaccount
    let other_subaccounts = vec![
        Some(principal.as_slice().to_vec()),
    ];
    
    for subaccount in other_subaccounts {
        if let Some(subaccount_bytes) = subaccount {
            let account = Account {
                owner: principal,
                subaccount: Some(subaccount_bytes.clone()),
            };
            
            let balance = match ic_cdk::call::<_, (Nat,)>(ckbtc_canister, "icrc1_balance_of", (account,)).await {
                Ok((balance,)) => {
                    let balance_u64: u64 = balance.0.try_into().unwrap_or(0);
                    balance_u64
                },
                Err(_) => 0,
            };
            
            if balance > 0 {
                let treasury_account = TREASURY_ACCOUNT.with(|treasury| treasury.borrow().clone());
                let transfer_args = TransferArgs {
                    to: treasury_account,
                    amount: balance,
                    fee: Some(1_000), // 0.00001 ckBTC fee (降低费用)
                    memo: Some(format!("Auto consolidation from user {}", principal).into_bytes()),
                    from_subaccount: Some(subaccount_bytes),
                    created_at_time: Some(time()),
                };
                
                match ic_cdk::call::<_, (TransferResult,)>(ckbtc_canister, "icrc1_transfer", (transfer_args,)).await {
                    Ok((result,)) => {
                        match result {
                            TransferResult::Ok(block_index) => {
                                total_consolidated += balance;
                                ic_cdk::println!("✅ [AUTO_CONSOLIDATE_USER] Subaccount consolidated: {} e8s (Block: {})", balance, block_index);
                            },
                            TransferResult::Err(error) => {
                                ic_cdk::println!("❌ [AUTO_CONSOLIDATE_USER] Subaccount transfer failed: {:?}", error);
                            }
                        }
                    },
                    Err(error) => {
                        ic_cdk::println!("❌ [AUTO_CONSOLIDATE_USER] Subaccount transfer call failed: {:?}", error);
                    }
                }
            }
        }
    }
    
    // 4. 更新用户余额记录
    if total_consolidated > 0 {
        USERS.with(|users| {
            let mut users_ref = users.borrow_mut();
            if let Some(user) = users_ref.get_mut(&principal) {
                user.balance += total_consolidated;
                user.transaction_history.push(Transaction {
                    amount: total_consolidated,
                    timestamp: time(),
                    transaction_type: "AutoConsolidation".to_string(),
                    tx_hash: Some(format!("auto_consolidation_{}", time())),
                    ckbtc_address: Some(format!("Treasury: {}", principal)),
                });
            }
        });
        
        // 更新统计
        STATS.with(|s| {
            s.borrow_mut().total_ckbtc_deposits += total_consolidated;
        });
        
        // 保存数据到稳定存储
        save_to_stable_storage();
    }
    
    ic_cdk::println!("✅ [AUTO_CONSOLIDATE_USER] Auto consolidation completed for user: {} (Total: {} e8s)", principal, total_consolidated);
    Ok(total_consolidated)
}

// 新增：定时自动归集功能
async fn auto_consolidate_accounts() {
    ic_cdk::println!("🔄 [AUTO_CONSOLIDATE_TIMER] Starting scheduled account consolidation");
    
    let users = USERS.with(|users| {
        users.borrow().keys().cloned().collect::<Vec<_>>()
    });
    
    for principal in users {
        ic_cdk::spawn(async move {
            match auto_consolidate_user_accounts(principal).await {
                Ok(amount) => {
                    ic_cdk::println!("✅ [AUTO_CONSOLIDATE_TIMER] User {}: Consolidated {} e8s", principal, amount);
                },
                Err(error) => {
                    ic_cdk::println!("❌ [AUTO_CONSOLIDATE_TIMER] User {}: Error - {}", principal, error);
                }
            }
        });
    }
}

// 新增：自动归集所有用户的账户（管理员功能）
#[update]
pub async fn auto_consolidate_all_accounts() -> Result<String, String> {
    assert_admin();
    
    ic_cdk::println!("🔄 [AUTO_CONSOLIDATE] Starting automatic consolidation for all users");
    
    let users = USERS.with(|users| {
        users.borrow().keys().cloned().collect::<Vec<_>>()
    });
    
    let users_count = users.len();
    let mut total_consolidated = 0u64;
    let mut success_count = 0;
    let mut error_count = 0;
    let mut consolidation_log = Vec::new();
    
    for principal in users.clone() {
        ic_cdk::println!("🔄 [AUTO_CONSOLIDATE] Processing user: {}", principal);
        
        // 直接调用内部自动归集函数
        match auto_consolidate_user_accounts(principal).await {
            Ok(amount) => {
                success_count += 1;
                if amount > 0 {
                    total_consolidated += amount;
                    consolidation_log.push(format!("User {}: Consolidated {} e8s", principal, amount));
                } else {
                    consolidation_log.push(format!("User {}: No funds to consolidate", principal));
                }
            },
            Err(error) => {
                error_count += 1;
                consolidation_log.push(format!("User {}: Error - {}", principal, error));
            }
        }
    }
    
    let result_message = format!(
        "🔄 Auto consolidation completed!\n\n\
        Total users processed: {}\n\
        Successful consolidations: {}\n\
        Errors: {}\n\
        Total amount consolidated: {} e8s\n\n\
        Details:\n{}",
        users_count,
        success_count,
        error_count,
        total_consolidated,
        consolidation_log.join("\n")
    );
    
    ic_cdk::println!("✅ [AUTO_CONSOLIDATE] Auto consolidation completed");
    Ok(result_message)
}

// 新增：手动触发轮次自动开始（管理员功能）
#[update]
pub fn manual_trigger_round_auto_start() -> Result<String, String> {
    assert_admin();
    
    ic_cdk::println!("🎲 [MANUAL_TRIGGER] Manual round auto-start triggered by admin");
    
    let current_time = time();
    let round_info = CURRENT_ROUND.with(|r| {
        let round = r.borrow();
        (round.clone(), current_time >= round.end_time)
    });
    
    let (round, should_draw) = round_info;
    
    if should_draw {
        ic_cdk::println!("🎲 [MANUAL_TRIGGER] Round {} ended, starting auto draw...", round.id);
        auto_draw_winner();
        
        // 保存数据到稳定存储
        save_to_stable_storage();
        
        ic_cdk::println!("✅ [MANUAL_TRIGGER] Auto draw completed, new round {} started", round.id + 1);
        Ok(format!("Round {} auto-started successfully! New round {} is now active.", round.id, round.id + 1))
    } else {
        let remaining_time = round.end_time - current_time;
        let remaining_seconds = remaining_time / 1_000_000_000;
        let remaining_minutes = remaining_seconds / 60;
        let remaining_secs = remaining_seconds % 60;
        
        Ok(format!("Round {} is still active. {}:{} remaining.", 
                  round.id, remaining_minutes, remaining_secs))
    }
}
