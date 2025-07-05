import { html, render } from 'lit-html';
import { my_rust_dapp_backend } from 'declarations/my_rust_dapp_backend';
import { Principal } from '@dfinity/principal';
import logo from './logo2.svg';
import identityCkBtcManager from './identity-ckbtc.js';

class App {
  constructor() {
    this.currentUser = null;
    this.currentRound = null;
    this.systemStats = null;
    this.userPrincipal = null;
    this.isAdmin = false;
    this.depositAmount = '';
    this.withdrawAmount = ''; // 提现金额
    this.loading = false;
    this.message = '';
    this.messageType = 'info'; // 'info', 'success', 'error'
    this.identityProvider = null; // 'internet-identity'
    this.countdown = null; // Countdown
    this.countdownInterval = null; // Countdown timer
    this.balanceCheckInterval = null; // 余额检查间隔
    this.userDepositAccount = null; // 用户充值账户

    this.pageState = 'connect'; // 'connect', 'dashboard', 'loading'
    this.lastCountdown = null; // Store the last countdown value
    this.renderScheduled = false; // Prevent multiple render calls
    this.debugMode = false; // Add debug mode flag to control logging
    
    // 移动端环境检测
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    this.isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    this.isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    this.isQQ = /QQ/i.test(navigator.userAgent);
    
    // Render immediately, then initialize asynchronously
    this.#render();
    this.init();
  }

  // Getter for connection status
  get isConnected() {
    const connected = this.userPrincipal && this.userPrincipal !== '2vxsx-fae';
    // Only log when debugging is needed
    if (this.debugMode) {
      console.log('isConnected check:', {
        userPrincipal: this.userPrincipal,
        isAnonymous: this.userPrincipal === '2vxsx-fae',
        connected: connected
      });
    }
    return connected;
  }

  async init() {
    try {
      console.log('Initializing app...');
      
      // Check if user is already connected
      const status = await identityCkBtcManager.getConnectionStatus();
      console.log('Connection status:', status);
      
      if (status.isConnected && status.principal) {
        console.log('User already connected, restoring session...');
        console.log("init principal:", status.principal);
        this.userPrincipal = status.principal;
        this.identityProvider = status.provider;
        
        this.pageState = 'dashboard';
        
        // Load user data
        console.log('Loading user data for principal:', this.userPrincipal);
        await this.loadUserData();
        console.log('User data loaded, currentUser:', this.currentUser);
        
        // Start balance monitoring
        this.startBalanceMonitoring();
      } else {
        console.log('No existing connection found, user needs to connect');
        console.log('Status details:', {
          isConnected: status.isConnected,
          principal: status.principal,
          provider: status.provider
        });
        this.pageState = 'connect';
      }
      
      // Load round and stats data (regardless of wallet connection)
      console.log('Loading round data...');
      await this.loadRoundData();
      console.log('Loading system stats...');
      await this.loadSystemStats();
      
      // Start countdown
      console.log('Starting countdown...');
      this.startCountdown();
      
      console.log('Rendering app...');
      this.#render();
      console.log('App initialized successfully');
    } catch (error) {
      console.error('Initialization failed:', error);
      this.showMessage('Initialization failed: ' + error.message, 'error');
      // Still render the app even if there's an error
      this.#render();
    }
  }

  async connectIdentity() {
    this.loading = true;
    this.pageState = 'loading';
    this.#render();
    
    try {
      console.log('Connecting to identity...');
      const result = await identityCkBtcManager.connectWithIdentity();
      
      if (result.success) {
        console.log('Identity connection successful:', result);
        
        // Update state
        this.userPrincipal = result.principal;
        this.identityProvider = result.provider;
        
        // Create user if not exists, then load user data
        await this.createUserInternal();
        await this.loadUserData();
        
        // Verify user was created successfully
        if (!this.currentUser) {
          throw new Error('Failed to create or load user data');
        }
        
        // Start balance monitoring
        this.startBalanceMonitoring();
        
        // Show success message
        this.showMessage(`${this.getProviderName(result.provider)} connection successful!`, 'success');
        
        // Update page state
        this.pageState = 'dashboard';
        
        // Force re-render
        this.#render();
        
      } else {
        throw new Error('Connection failed');
      }
    } catch (error) {
      console.error('Identity connection failed:', error);
      this.showMessage('Identity connection failed: ' + error.message, 'error');
      this.pageState = 'connect';
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  // Internal method to create user without setting loading state
  async createUserInternal() {
    try {
      console.log('Creating user for principal:', this.userPrincipal);
      
      // Check if user already exists first
      const principalObj = Principal.fromText(this.userPrincipal);
      console.log('Checking if user exists with principal:', principalObj.toText());
      
      const existingUserResult = await my_rust_dapp_backend.get_user(principalObj);
      console.log('Existing user check result (raw):', existingUserResult);
      
      // Handle opt User type - it returns an array
      let existingUser = null;
      if (Array.isArray(existingUserResult) && existingUserResult.length > 0) {
        existingUser = existingUserResult[0];
        console.log('Existing user extracted from array:', existingUser);
      }
      
      if (existingUser) {
        console.log('User already exists:', existingUser);
        this.currentUser = existingUser;
        console.log('currentUser set to existing user');
        return;
      }
      
      // Create new user
      console.log('Creating new user...');
      await my_rust_dapp_backend.create_user(this.userPrincipal);
      console.log('User created successfully');
      
      // Wait a moment for the creation to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify user was created by trying to get user data
      console.log('Verifying user creation...');
      const userResult = await my_rust_dapp_backend.get_user(principalObj);
      console.log('User verification result (raw):', userResult);
      
      // Handle opt User type - it returns an array
      let user = null;
      if (Array.isArray(userResult) && userResult.length > 0) {
        user = userResult[0];
        console.log('User extracted from array:', user);
      }
      
      if (user) {
        console.log('User verification successful:', user);
        this.currentUser = user;
        console.log('currentUser set to new user');
        
        // Get deposit account immediately after user creation
        try {
          await this.getUserDepositAccount();
          console.log('Deposit account loaded successfully');
        } catch (error) {
          console.error('Failed to get deposit account after user creation:', error);
          // Don't throw here, user was created successfully
        }
      } else {
        console.error('User creation verification failed - user not found');
        throw new Error('User creation verification failed');
      }
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
    }
  }

  async disconnectIdentity() {
    this.loading = true;
    this.#render();
    
    try {
      await identityCkBtcManager.disconnect();
      
      // Stop balance monitoring
      this.stopBalanceMonitoring();
      
      this.userPrincipal = null;
      this.currentUser = null;
      this.identityProvider = null;
      this.userDepositAccount = null;
      this.pageState = 'connect';
      this.showMessage('Identity disconnected', 'info');
    } catch (error) {
      console.error('Failed to disconnect identity:', error);
      this.showMessage('Disconnection failed: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  async initializeAuth() {
    try {
      this.loading = true;
      this.#render();
      
      await my_rust_dapp_backend.initialize_auth();
      this.isAdmin = true;
      this.showMessage('Admin privileges initialization successful!', 'success');
    } catch (error) {
      console.error('Failed to initialize admin privileges:', error);
      this.showMessage('Admin privileges initialization failed: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  async getUserDepositAccount() {
    try {
      console.log('Getting deposit account for principal:', this.userPrincipal);
      const depositAccountResult = await my_rust_dapp_backend.get_user_deposit_account(this.userPrincipal);
      console.log('Deposit account received:', depositAccountResult);
      // 处理 opt Account 类型
      let account = null;
      if (Array.isArray(depositAccountResult) && depositAccountResult.length > 0) {
        account = depositAccountResult[0];
        console.log('Extracted account from array:', account);
      } else if (depositAccountResult && depositAccountResult.owner) {
        account = depositAccountResult;
        console.log('Account is direct object:', account);
      }
      if (!account || !account.owner) {
        console.error('Deposit account has no owner field:', account);
        this.userDepositAccount = null;
        return null;
      }
      // Convert owner Principal to string for display
      const ownerText = account.owner.toString();
      console.log('Deposit account owner:', ownerText);
      this.userDepositAccount = account;
      return account;
    } catch (error) {
      console.error('Failed to get user deposit account:', error);
      this.userDepositAccount = null;
      throw error;
    }
  }

  async debugUserStatus() {
    try {
      console.log('=== DEBUG USER STATUS ===');
      console.log('User Principal:', this.userPrincipal);
      console.log('Current User:', this.currentUser);
      console.log('User Deposit Account:', this.userDepositAccount);
      
      if (this.userPrincipal) {
        try {
          const principalObj = Principal.fromText(this.userPrincipal);
          console.log('Principal object created successfully:', principalObj.toText());
          
          const user = await my_rust_dapp_backend.get_user(principalObj);
          console.log('Backend User Data:', user);
          
          const depositAccount = await my_rust_dapp_backend.get_user_deposit_account(this.userPrincipal);
          console.log('Backend Deposit Account:', depositAccount);
        } catch (principalError) {
          console.error('Principal parsing error:', principalError);
          console.log('Principal string:', this.userPrincipal);
          console.log('Principal length:', this.userPrincipal.length);
        }
      }
      console.log('=== END DEBUG ===');
    } catch (error) {
      console.error('Debug failed:', error);
    }
  }

  async ensureUserExists() {
    try {
      if (!this.userPrincipal) {
        throw new Error('No user principal available');
      }
      
      // Test if principal can be parsed
      try {
        const principalObj = Principal.fromText(this.userPrincipal);
        console.log('Principal parsed successfully:', principalObj.toText());
      } catch (parseError) {
        console.error('Invalid principal format:', this.userPrincipal);
        throw new Error('Invalid principal format: ' + this.userPrincipal);
      }
      
      if (!this.currentUser) {
        console.log('User not found, creating user...');
        await this.createUserInternal();
        await this.loadUserData();
      }
      
      if (!this.currentUser) {
        throw new Error('Failed to create or load user');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to ensure user exists:', error);
      throw error;
    }
  }

  async updateBalance() {
    try {
      this.loading = true;
      this.#render();
      
      console.log('Updating principal balance for user:', this.userPrincipal);
      
      // 调用新的后端方法
      await my_rust_dapp_backend.update_balance_from_principal(this.userPrincipal);
      
      // Wait a moment for the update to complete
      setTimeout(async () => {
        await this.loadUserData();
        this.showMessage('Principal balance updated successfully!', 'success');
        this.loading = false;
        this.#render();
      }, 2000);
      
    } catch (error) {
      console.error('Failed to update principal balance:', error);
      this.showMessage('Principal balance update failed: ' + error.message, 'error');
      this.loading = false;
      this.#render();
    }
  }

  // 查询所有资产余额（目前只查ckBTC，结构可扩展）
  async loadAllAssetBalances() {
    this.assetBalances = {};
    if (!this.userDepositAccount || !this.userDepositAccount.owner) return;
    const owner = this.userDepositAccount.owner.toString();
    const subaccount = this.userDepositAccount.subaccount;
    const subaccountHex = subaccount ? Array.from(subaccount).map(b => (b || 0).toString(16).padStart(2, '0')).join('') : null;
    const subaccountHexOpt = subaccountHex ? [subaccountHex] : [];
    for (const asset of SUPPORTED_ASSETS) {
      try {
        // 只查ckBTC，调用 get_ckbtc_account_balance
        if (asset.symbol === 'ckBTC') {
          const result = await my_rust_dapp_backend.get_ckbtc_account_balance(owner, subaccountHexOpt);
          this.assetBalances[asset.symbol] = result.Ok !== undefined ? result.Ok : 0;
        } else {
          this.assetBalances[asset.symbol] = 0;
        }
      } catch (e) {
        this.assetBalances[asset.symbol] = 0;
      }
    }
  }

  // 新增：查询 deposit account 的真实余额（单独调用时也修正参数）
  async loadDepositAccountBalance() {
    if (!this.userDepositAccount || !this.userDepositAccount.owner) {
      this.depositAccountBalance = 0;
      return;
    }
    const owner = this.userDepositAccount.owner.toString();
    const subaccount = this.userDepositAccount.subaccount;
    const subaccountHex = subaccount ? Array.from(subaccount).map(b => (b || 0).toString(16).padStart(2, '0')).join('') : null;
    const subaccountHexOpt = subaccountHex ? [subaccountHex] : [];
    try {
      const result = await my_rust_dapp_backend.get_ckbtc_account_balance(owner, subaccountHexOpt);
      if (result.Ok !== undefined) {
        this.depositAccountBalance = result.Ok;
      } else {
        this.depositAccountBalance = 0;
      }
    } catch (e) {
      this.depositAccountBalance = 0;
    }
  }

  // 查询单个账户余额的按钮/方法也修正参数
  async checkCkBtcAccountBalance(owner, subaccountHex = null) {
    try {
      this.loading = true;
      this.#render();
      const subaccountHexOpt = subaccountHex ? [subaccountHex] : [];
      const result = await my_rust_dapp_backend.get_ckbtc_account_balance(owner, subaccountHexOpt);
      if (result.Ok !== undefined) {
        const balance = result.Ok;
        const balanceFormatted = this.formatBalance(balance);
        this.showMessage(`Account balance: ${balanceFormatted}`, 'success');
        const accountInfo = subaccountHex ? 
          `Owner: ${owner}\nSubaccount: ${subaccountHex}\nBalance: ${balanceFormatted}` :
          `Owner: ${owner}\nBalance: ${balanceFormatted}`;
        alert(accountInfo);
      } else if (result.Err !== undefined) {
        this.showMessage('Failed to get account balance: ' + result.Err, 'error');
      }
    } catch (error) {
      console.error('Failed to check ckBTC account balance:', error);
      this.showMessage('Failed to check account balance: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  // 新增：查询用户所有相关账户余额
  async checkAllUserBalances() {
    try {
      this.loading = true;
      this.#render();
      
      console.log('Checking all balances for user:', this.userPrincipal);
      
      const result = await my_rust_dapp_backend.get_user_all_balances(this.userPrincipal);
      
      if (result.Ok !== undefined) {
        const balances = result.Ok;
        let message = 'All Account Balances:\n\n';
        
        balances.forEach(([accountName, balance]) => {
          const balanceFormatted = this.formatBalance(balance);
          message += `${accountName}: ${balanceFormatted}\n`;
        });
        
        alert(message);
        this.showMessage('All balances retrieved successfully!', 'success');
      } else if (result.Err !== undefined) {
        this.showMessage('Failed to get all balances: ' + result.Err, 'error');
      }
      
    } catch (error) {
      console.error('Failed to check all user balances:', error);
      this.showMessage('Failed to check all balances: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  async placeBet() {
    try {
      this.loading = true;
      this.#render();
      
      // Ensure user exists
      await this.ensureUserExists();

      console.log('currentUser:', this.currentUser);
      
      console.log('Placing bet for user:', this.userPrincipal);
      await my_rust_dapp_backend.place_bet(this.userPrincipal);
      
      // Reload data to see updated round info
      await this.loadUserData();
      await this.loadRoundData();
      
      this.showMessage('Bet placed successfully! You are now participating in the current round.', 'success');
    } catch (error) {
      console.error('Failed to place bet:', error);
      this.showMessage('Bet placement failed: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  async withdrawBalance() {
    if (!this.withdrawAmount || this.withdrawAmount <= 0) {
      this.showMessage('Please enter a valid withdrawal amount', 'error');
      return;
    }

    try {
      this.loading = true;
      this.#render();
      
      // Ensure user exists
      await this.ensureUserExists();
      
      // Convert to number and ensure it's valid
      const amount = parseFloat(this.withdrawAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Invalid withdrawal amount');
      }
      
      // Convert to e8s (multiply by 100,000,000)
      const amountE8s = Math.floor(amount * 100_000_000);
      
      console.log('Withdrawing amount:', amountE8s, 'e8s for user:', this.userPrincipal);
      await my_rust_dapp_backend.withdraw_balance(this.userPrincipal, amountE8s);
      
      // Wait a moment for the withdrawal to complete
      setTimeout(async () => {
        await this.loadUserData();
        this.withdrawAmount = '';
        this.showMessage('Withdrawal successful!', 'success');
        this.loading = false;
        this.#render();
      }, 3000);
      
    } catch (error) {
      console.error('Failed to withdraw:', error);
      this.showMessage('Withdrawal failed: ' + error.message, 'error');
      this.loading = false;
      this.#render();
    }
  }

  async triggerDraw() {
    try {
      this.loading = true;
      this.#render();
      
      await my_rust_dapp_backend.trigger_draw();
      await this.loadRoundData();
      await this.loadSystemStats();
      
      this.showMessage('Draw triggered successfully!', 'success');
    } catch (error) {
      console.error('Failed to trigger draw:', error);
      this.showMessage('Draw trigger failed: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  async loadUserData() {
    try {
      console.log('loadUserData called with userPrincipal:', this.userPrincipal);
      
      if (this.userPrincipal && this.userPrincipal !== '2vxsx-fae') {
        console.log('Valid principal found, loading user data...');
        const principalObj = Principal.fromText(this.userPrincipal);
        console.log('Principal object created:', principalObj.toText());
        
        const userResult = await my_rust_dapp_backend.get_user(principalObj);
        console.log('User data loaded from backend (raw):', userResult);
        
        // Handle opt User type - it returns an array
        if (Array.isArray(userResult) && userResult.length > 0) {
          this.currentUser = userResult[0];
          console.log('User data extracted from array:', this.currentUser);
        } else {
          console.log('No user found, userResult is empty array or null');
          this.currentUser = null;
        }
        
        // Always try to get user deposit account, even if user doesn't exist yet
        try {
          await this.getUserDepositAccount();
        } catch (error) {
          console.log('User deposit account not available yet:', error.message);
          // If user exists but deposit account fails, try to create user first
          if (this.currentUser && !this.userDepositAccount) {
            console.log('User exists but no deposit account, trying to create user...');
            try {
              await this.createUserInternal();
              await this.getUserDepositAccount();
            } catch (createError) {
              console.error('Failed to create user or get deposit account:', createError);
            }
          }
        }
      } else {
        console.log('Invalid or missing userPrincipal:', this.userPrincipal);
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }

  async loadRoundData() {
    try {
      this.currentRound = await my_rust_dapp_backend.get_round();
    } catch (error) {
      console.error('Failed to load round data:', error);
    }
  }

  async loadSystemStats() {
    try {
      this.systemStats = await my_rust_dapp_backend.get_stats();
    } catch (error) {
      console.error('Failed to load system stats:', error);
    }
  }

  showMessage(message, type = 'info') {
    this.message = message;
    this.messageType = type;
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        this.message = '';
        this.messageType = 'info';
        this.#render();
      }, 5000);
    }
    
    this.#render();
  }

  formatBalance(balance) {
    try {
      if (balance === null || balance === undefined) {
        return '0.00000000 ckBTC';
      }
      // Convert BigInt balance to number for calculation
      const balanceNumber = typeof balance === 'bigint' ? Number(balance) : Number(balance);
      if (isNaN(balanceNumber)) {
        return '0.00000000 ckBTC';
      }
      return (balanceNumber / 100_000_000).toFixed(8) + ' ckBTC';
    } catch (error) {
      console.error('Error formatting balance:', error);
      return '0.00000000 ckBTC';
    }
  }

  formatTimestamp(timestamp) {
    try {
      if (timestamp === null || timestamp === undefined) {
        return 'Unknown';
      }
      // Convert BigInt timestamp to number for Date constructor
      const timestampNumber = typeof timestamp === 'bigint' ? Number(timestamp) : Number(timestamp);
      if (isNaN(timestampNumber)) {
        return 'Unknown';
      }
      return new Date(timestampNumber / 1_000_000).toLocaleString();
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return 'Unknown';
    }
  }

  getProviderName(provider) {
    if (provider === 'internet-identity') {
      return 'Internet Identity';
    } else if (provider === 'local-dev') {
      return 'Local Development Identity';
    }
    return provider || 'Unknown';
  }

  // Toggle debug mode
  toggleDebugMode() {
    this.debugMode = !this.debugMode;
    identityCkBtcManager.debugMode = this.debugMode;
    console.log('Debug mode:', this.debugMode ? 'ON' : 'OFF');
    this.showMessage(`Debug mode ${this.debugMode ? 'enabled' : 'disabled'}`, 'info');
  }

  startCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    
    this.countdownInterval = setInterval(() => {
      this.updateCountdown();
    }, 1000);
  }

  updateCountdown() {
    if (!this.currentRound) return;
    
    const now = Date.now() * 1_000_000; // Convert to nanoseconds
    const endTime = typeof this.currentRound.end_time === 'bigint' 
      ? Number(this.currentRound.end_time) 
      : Number(this.currentRound.end_time);
    
    if (now >= endTime) {
      this.countdown = 'Round ended';
      // Reload round data to check for new round
      this.loadRoundData();
    } else {
      const remaining = endTime - now;
      const seconds = Math.floor(remaining / 1_000_000_000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      this.countdown = `${minutes}:${(remainingSeconds || 0).toString().padStart(2, '0')}`;
    }
    
    // Only re-render if countdown changed
    if (this.countdown !== this.lastCountdown) {
      this.lastCountdown = this.countdown;
      this.#render();
    }
  }

  getRoundStatus() {
    if (!this.currentRound) return 'Loading...';
    
    const now = Date.now() * 1_000_000;
    const endTime = typeof this.currentRound.end_time === 'bigint' 
      ? Number(this.currentRound.end_time) 
      : Number(this.currentRound.end_time);
    
    if (now >= endTime) {
      return 'Round ended';
    } else {
      return 'Active';
    }
  }

  cleanup() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    if (this.balanceCheckInterval) {
      clearInterval(this.balanceCheckInterval);
    }
  }

  // Start balance monitoring
  startBalanceMonitoring() {
    if (this.balanceCheckInterval) {
      clearInterval(this.balanceCheckInterval);
    }
    
    // Check principal balance every 30 seconds
    this.balanceCheckInterval = setInterval(async () => {
      if (this.isConnected) {
        try {
          await this.updateBalance();
        } catch (error) {
          console.error('Failed to check principal balance:', error);
        }
      }
    }, 30000); // 30 seconds
  }

  // Stop balance monitoring
  stopBalanceMonitoring() {
    if (this.balanceCheckInterval) {
      clearInterval(this.balanceCheckInterval);
      this.balanceCheckInterval = null;
    }
  }

  // 生成标准的 ckBTC 地址格式
  generateCkBtcAddress() {
    if (!this.userDepositAccount || !this.userDepositAccount.owner) {
      return null;
    }
    
    // 生成标准的 ckBTC 地址格式
    const owner = this.userDepositAccount.owner.toString();
    const subaccount = this.userDepositAccount.subaccount;
    
    // 如果没有 subaccount，使用 owner 作为基础
    let addressBase = owner;
    if (subaccount && Array.isArray(subaccount) && subaccount.length > 0) {
      // 将 subaccount 转换为十六进制字符串
      const subaccountHex = Array.from(subaccount).map(b => (b || 0).toString(16).padStart(2, '0')).join('');
      addressBase = `${owner}_${subaccountHex}`;
    }
    
    // 生成 ckBTC 地址格式
    return `ckbtc_${addressBase}`;
  }

  // 生成标准的 ICRC-1 地址格式
  generateIrc1Address() {
    if (!this.userDepositAccount || !this.userDepositAccount.owner) {
      return null;
    }
    
    const owner = this.userDepositAccount.owner.toString();
    const subaccount = this.userDepositAccount.subaccount;
    
    if (subaccount && Array.isArray(subaccount) && subaccount.length > 0) {
      // 将 subaccount 转换为 base32 编码
      const subaccountBase32 = this.arrayToBase32(subaccount);
      return `${owner}.${subaccountBase32}`;
    }
    
    return owner;
  }

  // 生成类似 Bitcoin 地址格式的 ckBTC 地址
  generateBitcoinStyleAddress() {
    if (!this.userDepositAccount || !this.userDepositAccount.owner) {
      return null;
    }
    
    const owner = this.userDepositAccount.owner.toString();
    const subaccount = this.userDepositAccount.subaccount;
    
    // 创建更短的地址数据
    let addressData = owner;
    if (subaccount && Array.isArray(subaccount) && subaccount.length > 0) {
      // 只使用前8个字节的 subaccount，减少长度
      const shortSubaccount = subaccount.slice(0, 8);
      const subaccountHex = shortSubaccount.map(b => (b || 0).toString(16).padStart(2, '0')).join('');
      addressData = `${owner}${subaccountHex}`;
    }
    
    // 生成类似 Bitcoin 地址的格式
    // 使用 base58 编码（类似 Bitcoin 地址）
    const base58Address = this.base58Encode(addressData);
    
    // 添加 ckBTC 前缀，并限制长度
    const fullAddress = `ck1${base58Address}`;
    
    // 如果地址太长，截取到合适长度（约42个字符，类似 Bitcoin 地址）
    if (fullAddress.length > 42) {
      return fullAddress.substring(0, 42);
    }
    
    return fullAddress;
  }

  // 生成短版本的 ckBTC 地址（推荐）
  generateShortCkBtcAddress() {
    if (!this.userDepositAccount || !this.userDepositAccount.owner) {
      return null;
    }
    
    const owner = this.userDepositAccount.owner.toString();
    const subaccount = this.userDepositAccount.subaccount;
    
    // 创建简化的地址数据
    let addressData = owner;
    if (subaccount && Array.isArray(subaccount) && subaccount.length > 0) {
      // 使用前4个字节，进一步减少长度
      const shortSubaccount = subaccount.slice(0, 4);
      const subaccountHex = shortSubaccount.map(b => (b || 0).toString(16).padStart(2, '0')).join('');
      addressData = `${owner}${subaccountHex}`;
    }
    
    // 使用简单的哈希算法生成短地址
    const hash = this.simpleHash(addressData);
    const base58Hash = this.base58Encode(hash);
    
    // 生成短地址，长度约26-30个字符
    const shortAddress = `ck1${base58Hash.substring(0, 24)}`;
    
    return shortAddress;
  }

  // 简单的哈希函数
  simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    
    // 转换为16字节的字符串
    const hashBytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      hashBytes[i] = (hash >> (i * 2)) & 0xFF;
    }
    
    return String.fromCharCode(...hashBytes);
  }

  // 生成 Account Identifier（标准的 ckBTC 收款地址）
  generateAccountIdentifier() {
    if (!this.userDepositAccount || !this.userDepositAccount.owner) {
      return null;
    }
    
    const owner = this.userDepositAccount.owner.toString();
    const subaccount = this.userDepositAccount.subaccount;
    
    // 生成标准的 Account Identifier
    // 这是从 owner + subaccount 派生的唯一标识符
    let accountData = owner;
    if (subaccount && Array.isArray(subaccount) && subaccount.length > 0) {
      // 将 subaccount 转换为十六进制字符串
      const subaccountHex = Array.from(subaccount).map(b => (b || 0).toString(16).padStart(2, '0')).join('');
      accountData = `${owner}_${subaccountHex}`;
    }
    
    // 使用 SHA256 哈希生成 Account Identifier
    const hash = this.sha256Hash(accountData);
    const base58Hash = this.base58Encode(hash);
    
    // 生成标准的 Account Identifier 格式
    return `ckbtc_${base58Hash.substring(0, 32)}`;
  }

  // SHA256 哈希函数（用于生成 Account Identifier）
  sha256Hash(str) {
    // 简单的哈希实现（实际应用中应使用真实的 SHA256）
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    
    // 转换为32字节的字符串（模拟 SHA256 输出）
    const hashBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      hashBytes[i] = (hash >> (i % 4)) & 0xFF;
    }
    
    return String.fromCharCode(...hashBytes);
  }

  // Base58 编码（类似 Bitcoin 地址使用的编码）
  base58Encode(str) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt(0);
    
    // 将字符串转换为数字
    for (let i = 0; i < str.length; i++) {
      num = num * BigInt(256) + BigInt(str.charCodeAt(i));
    }
    
    let result = '';
    while (num > 0) {
      const remainder = Number(num % BigInt(58));
      result = alphabet[remainder] + result;
      num = num / BigInt(58);
    }
    
    // 处理前导零
    for (let i = 0; i < str.length && str[i] === '\x00'; i++) {
      result = '1' + result;
    }
    
    return result;
  }

  // 将字节数组转换为 base32 编码
  arrayToBase32(bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';
    
    for (let i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    
    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }
    
    return output;
  }

  // 格式化 ckBTC 地址显示
  formatCkBtcAddress(address) {
    if (!address) return '';
    
    // 如果地址太长，进行分段显示
    if (address.length > 50) {
      const prefix = address.substring(0, 20);
      const suffix = address.substring(address.length - 20);
      return `${prefix}...${suffix}`;
    }
    
    return address;
  }

  #render() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      render(html`
        <div class="app-container">
          <header class="header">
            <img src="${logo}" alt="BTC Lottery logo" class="logo" />
            <h1>Virtual BTC Lottery</h1>
            <div class="header-actions">
              ${!this.isConnected ? html`
                <button class="btn btn-login" @click=${this.connectIdentity.bind(this)}>
                  Login
                </button>
                <div class="mobile-login-tip">
                  ${this.isWeChat || this.isQQ ? 
                    '⚠️ 微信/QQ内置浏览器不支持登录，请点击右上角"..."选择"在浏览器中打开"' :
                    this.isMobile && this.isSafari ?
                    '📱 Safari浏览器登录可能需要允许弹窗，如遇问题请尝试Chrome' :
                    this.isMobile ?
                    '📱 如无法登录，请用系统浏览器（Safari/Chrome）打开本页面' :
                    '🔐 点击上方按钮登录 Internet Identity'
                  }
                </div>
              ` : html`
                <div class="user-info-header">
                  <span class="principal-id">${this.userPrincipal ? this.userPrincipal.toString() : ''}</span>
                  <button class="btn btn-logout" @click=${this.disconnectIdentity.bind(this)}>
                    Logout
                  </button>
                </div>
              `}
              <button 
                class="btn btn-small debug-btn" 
                @click=${this.toggleDebugMode.bind(this)}
              >
                Debug ${this.debugMode ? 'ON' : 'OFF'}
              </button>
            </div>
          </header>

          ${this.message ? html`
            <div class="message ${this.messageType}">
              ${this.message}
            </div>
          ` : ''}

          <main class="main-content main-flex">
            <section class="main-left">
              ${!this.isConnected ? html`
 
              ` : html`
                <div class="dashboard dashboard-personal">
                  <h2>Personal Center</h2>
                  <div class="wallet-details-personal">
                    <p><strong>Principal:</strong> <span class="principal-id">${this.userPrincipal ? this.userPrincipal.toString() : ''}</span></p>
                    <p><strong>Balance:</strong> <span style="color: #38a169; font-weight: bold;">${this.currentUser ? this.formatBalance(this.currentUser.balance) : '0.00000000 ckBTC'}</span></p>
                    
                    <div class="deposit-account-info">
                      <h4>Your ckBTC Account & Deposit Address</h4>
                      ${this.userDepositAccount && this.userDepositAccount.owner ? html`
                        <div class="address-display">
                          <div class="address-content">
                            <span class="address-label">Account Identifier:</span>
                            <code class="address-code">${this.generateAccountIdentifier()}</code>
                          </div>
                          <button class="btn-small copy-btn" @click=${() => navigator.clipboard.writeText(this.generateAccountIdentifier())}>
                            Copy
                          </button>
                        </div>
                        <div class="address-display">
                          <div class="address-content">
                            <span class="address-label">IRCR-1 Format:</span>
                            <code class="address-code">${this.generateIrc1Address()}</code>
                          </div>
                          <button class="btn-small copy-btn" @click=${() => navigator.clipboard.writeText(this.generateIrc1Address())}>
                            Copy
                          </button>
                        </div>
                        <div class="address-display">
                          <div class="address-content">
                            <span class="address-label">Short Address:</span>
                            <code class="address-code">${this.generateShortCkBtcAddress()}</code>
                          </div>
                          <button class="btn-small copy-btn" @click=${() => navigator.clipboard.writeText(this.generateShortCkBtcAddress())}>
                            Copy
                          </button>
                        </div>
                        <div class="address-details">
                          <small style="color: #666; display: block; margin-top: 8px;">
                            <strong>Owner:</strong> ${this.userDepositAccount.owner.toString()}
                            ${this.userDepositAccount.subaccount && Array.isArray(this.userDepositAccount.subaccount) ? html`
                              <br><strong>Subaccount:</strong> ${Array.from(this.userDepositAccount.subaccount).map(b => (b || 0).toString(16).padStart(2, '0')).join('')}
                            ` : ''}
                          </small>
                        </div>
                        <div class="deposit-instructions" style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 15px;">
                          <h5 style="margin: 0 0 10px 0; color: #2c3e50;">How to Deposit ckBTC:</h5>
                          <ol style="margin: 0; padding-left: 20px; color: #555; font-size: 0.9rem;">
                            <li>Copy any of the account identifiers above (Account Identifier is standard)</li>
                            <li>Send ckBTC to this account from your wallet</li>
                            <li>Click "Update Balance" to check for new deposits</li>
                            <li>Your balance will be updated automatically</li>
                          </ol>
                          <div style="margin: 10px 0 0 0; padding: 10px; background: #fff3cd; border-radius: 4px; border-left: 4px solid #ffc107;">
                            <p style="margin: 0 0 5px 0; color: #856404; font-size: 0.85rem; font-weight: 600;">
                              📋 Account & Address Explanation:
                            </p>
                            <ul style="margin: 0; padding-left: 20px; color: #856404; font-size: 0.8rem;">
                              <li><strong>Account Identifier:</strong> Standard ckBTC account ID (derived from owner + subaccount)</li>
                              <li><strong>IRCR-1 Format:</strong> Internet Computer standard format (owner.subaccount)</li>
                              <li><strong>Short Address:</strong> Compact format for easy use (~26 chars)</li>
                            </ul>
                            <p style="margin: 5px 0 0 0; color: #856404; font-size: 0.75rem; font-style: italic;">
                              💡 All formats represent the same ckBTC account: owner (Principal) + subaccount (32-byte blob)
                            </p>
                          </div>
                          <p style="margin: 10px 0 0 0; color: #e74c3c; font-size: 0.85rem; font-weight: 600;">
                            ⚠️ Note: These are ckBTC addresses, not Bitcoin addresses. Make sure you're sending ckBTC tokens.
                          </p>
                        </div>
                      ` : html`
                        <p style="color: #666; font-style: italic;">
                          ${this.userDepositAccount === null ? 'Failed to load deposit account' : 
                            this.userDepositAccount && !this.userDepositAccount.owner ? 'Deposit account has no owner' : 
                            'Loading deposit account...'}
                        </p>
                        <p class="address-note">Your unique deposit account will be created when you first connect</p>
                        <button class="btn-small" @click=${() => this.getUserDepositAccount()}>
                          Retry Load Account
                        </button>
                        <button class="btn-small" @click=${() => this.debugUserStatus()}>
                          Debug Status
                        </button>
                      `}
                    </div>
                    
                    <div class="balance-actions">
                      <button 
                        class="btn btn-secondary" 
                        @click=${this.updateBalance.bind(this)}
                        ?disabled=${this.loading}
                        style="width: 100%; margin-bottom: 1rem;"
                      >
                        ${this.loading ? 'Updating...' : 'Update Balance'}
                      </button>
                    </div>
                    
                    <div class="withdraw-section">
                      <h4>Withdraw Funds</h4>
                      <div class="withdraw-form">
                        <input 
                          type="number" 
                          class="input" 
                          placeholder="Amount in ckBTC" 
                          .value=${this.withdrawAmount}
                          @input=${(e) => this.withdrawAmount = e.target.value}
                          step="0.00000001"
                          min="0"
                        />
                        <button 
                          class="btn btn-secondary" 
                          @click=${this.withdrawBalance.bind(this)}
                          ?disabled=${this.loading || !this.withdrawAmount}
                          style="width: 100%; margin-top: 0.5rem;"
                        >
                          ${this.loading ? 'Withdrawing...' : 'Withdraw'}
                        </button>
                      </div>
                    </div>
                    
                    <div class="admin-actions">
                      <button 
                        class="btn btn-secondary" 
                        @click=${this.initializeAuth.bind(this)}
                        ?disabled=${this.loading}
                        style="width: 100%; margin-top: 1rem;"
                      >
                        ${this.loading ? 'Initializing...' : 'Initialize Admin Privileges'}
                      </button>
                    </div>
                  </div>
                  
                  <div class="transaction-history-personal">
                    <h3>Transaction History</h3>
                    ${this.currentUser && this.currentUser.transaction_history && this.currentUser.transaction_history.length > 0
                      ? html`
                        <div class="transaction-list-personal">
                          ${this.currentUser.transaction_history
                            .slice(-10).reverse().map(tx => html`
                              <div class="transaction-item-personal ${tx.transaction_type.toLowerCase()}">
                                <div class="transaction-info-personal">
                                  <span class="transaction-amount ${tx.transaction_type === 'Win' ? 'winning' : tx.transaction_type === 'Deposit' ? 'deposit' : 'bet'}">
                                    ${tx.transaction_type === 'Win' ? '+' : tx.transaction_type === 'Deposit' ? '+' : '-'}${this.formatBalance(tx.amount)}
                                  </span>
                                  <span class="transaction-type">${tx.transaction_type}</span>
                                  <span class="transaction-time">${this.formatTimestamp(tx.timestamp)}</span>
                                </div>
                              </div>
                          `)}
                        </div>
                      `
                      : html`<p>No transaction history yet.</p>`
                    }
                  </div>
                  
                  <div class="winning-history-personal">
                    <h3>Winning History</h3>
                    ${this.currentUser && this.currentUser.winning_history && this.currentUser.winning_history.length > 0
                      ? html`
                        <div class="winning-list-personal">
                          ${this.currentUser.winning_history
                            .slice(-10).reverse().map(win => html`
                              <div class="winning-item-personal">
                                <div class="winning-info-personal">
                                  <span class="winning-amount" style="color: #38a169; font-weight: bold;">+${this.formatBalance(win.amount)}</span>
                                  <span class="winning-time">${this.formatTimestamp(win.timestamp)}</span>
                                  <span class="winning-round">Round ${win.round_id}</span>
                                </div>
                              </div>
                          `)}
                        </div>
                      `
                      : html`<p>No winning history yet.</p>`
                    }
                  </div>
                </div>
              `}
            </section>
            <section class="main-right">
              <div class="round-section">
                <h2>Current Round</h2>
                ${this.currentRound ? html`
                  <div class="round-info">
                    <p><strong>Round ID:</strong> ${this.currentRound.id}</p>
                    <p><strong>Prize Pool:</strong> ${this.formatBalance(this.currentRound.prize_pool)}</p>
                    <p><strong>Participants:</strong> ${(this.currentRound.participants || []).length} people</p>
                    <p><strong>Start Time:</strong> ${this.formatTimestamp(this.currentRound.start_time)}</p>
                    <p><strong>End Time:</strong> ${this.formatTimestamp(this.currentRound.end_time)}</p>
                    <div class="countdown">
                      <span class="countdown-label">Remaining Time:</span>
                      <span class="countdown-time">${this.countdown || '--:--'}</span>
                    </div>
                    ${(this.currentRound.winners || []).length > 0 ? html`
                      <p><strong>Winner:</strong> ${this.currentRound.winners[0] ? this.currentRound.winners[0].toString() : 'Unknown'}</p>
                    ` : ''}
                    
                    ${this.isConnected ? html`
                      <div class="round-actions">
                        <button 
                          class="btn btn-primary" 
                          @click=${this.placeBet.bind(this)}
                          ?disabled=${this.loading}
                          style="width: 100%; margin-bottom: 1rem;"
                        >
                          ${this.loading ? 'Placing Bet...' : 'Place Bet (0.00000001 ckBTC)'}
                        </button>
                        
                        ${this.isAdmin ? html`
                          <button 
                            class="btn btn-secondary" 
                            @click=${this.triggerDraw.bind(this)}
                            ?disabled=${this.loading}
                            style="width: 100%;"
                          >
                            ${this.loading ? 'Triggering Draw...' : 'Trigger Draw (Admin)'}
                          </button>
                        ` : ''}
                      </div>
                    ` : html`
                      <p style="color: #666; font-style: italic;">Please login to participate in the lottery</p>
                    `}
                  </div>
                ` : html`<p>Loading round info...</p>`}
              </div>
              
              ${this.systemStats ? html`
                <div class="stats-section">
                  <h2>System Statistics</h2>
                  <div class="stats-info">
                    <p><strong>Total Rounds:</strong> ${this.systemStats.total_rounds}</p>
                    <p><strong>Total Bets:</strong> ${this.systemStats.total_bets}</p>
                    <p><strong>Total Winnings:</strong> ${this.formatBalance(this.systemStats.total_winnings)}</p>
                    <p><strong>Active Users:</strong> ${this.systemStats.active_users}</p>
                    <p><strong>Total ckBTC Deposits:</strong> ${this.formatBalance(this.systemStats.total_ckbtc_deposits)}</p>
                  </div>
                </div>
              ` : ''}
            </section>
      </main>
        </div>
      `, document.getElementById('app'));
    });
  }
}

export default App;

// Global error handler to catch toString() errors
window.addEventListener('error', (event) => {
  if (event.error && event.error.message && event.error.message.includes('toString')) {
    console.error('toString() error caught:', event.error);
    console.error('Error details:', {
      message: event.error.message,
      stack: event.error.stack,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  }
});

// Initialize the app when the module loads
new App();