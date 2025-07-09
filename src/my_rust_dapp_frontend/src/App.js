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
    this.userDepositAccount = null; // 用户充值账户

    this.pageState = 'connect'; // 'connect', 'dashboard', 'loading'
    this.lastCountdown = null; // Store the last countdown value
    this.renderScheduled = false; // Prevent multiple render calls
    this.debugMode = false; // Add debug mode flag to control logging
    
    // 移动端环境检测
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    this.isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    this.isFirefox = /Firefox/.test(navigator.userAgent);
    this.isEdge = /Edg/.test(navigator.userAgent);
    this.isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
    this.isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    this.isQQ = /QQ/i.test(navigator.userAgent);
    
    // 浏览器兼容性检测
    this.browserInfo = {
      isMobile: this.isMobile,
      isSafari: this.isSafari,
      isFirefox: this.isFirefox,
      isEdge: this.isEdge,
      isChrome: this.isChrome,
      isWeChat: this.isWeChat,
      isQQ: this.isQQ,
      userAgent: navigator.userAgent
    };
    
    console.log('Browser detection:', this.browserInfo);
    
    this.activePage = 'game'; // 'game' or 'profile'
    
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
      
      // Safari 移动端特殊处理：检查URL参数
      if (this.isMobile && this.isSafari) {
        const urlParams = new URLSearchParams(window.location.search);
        const safariReturn = urlParams.get('safari_return');
        if (safariReturn === 'true') {
          console.log('Detected Safari return from manual login');
          // 清除URL参数
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
          
          // 给Safari一些时间来恢复会话
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
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
        
        // 移除自动余额监控，用户需要手动更新余额
        console.log('Balance monitoring disabled - users must manually update balance');
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
        
        // 移除自动余额监控，用户需要手动更新余额
        console.log('Balance monitoring disabled - users must manually update balance');
        
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
      
      // 针对Safari的特殊错误处理
      if (this.isMobile && this.isSafari) {
        if (error.message.includes('direct navigation') || error.message.includes('timeout')) {
          this.showMessage('Safari移动端登录需要特殊处理。请点击页面上的"Click here to login manually"链接，完成登录后返回此页面。', 'error');
        } else {
          this.showMessage('Safari移动端登录失败: ' + error.message + '。请尝试使用手动登录链接。', 'error');
        }
      } else {
      this.showMessage('Identity connection failed: ' + error.message, 'error');
      }
      
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
      
      this.showMessage('🔄 Checking for new deposits and auto-consolidating...', 'info');
      
      // 调用新的后端方法
      await my_rust_dapp_backend.update_balance_from_principal(this.userPrincipal);
      
      // 轮询检查余额是否已更新
      let attempts = 0;
      const maxAttempts = 10;
      const checkBalance = async () => {
        attempts++;
        await this.loadUserData();
        
        if (this.currentUser && this.currentUser.balance > 0) {
          this.showMessage('✅ Balance updated and auto-consolidation completed!', 'success');
        this.loading = false;
        this.#render();
        } else if (attempts < maxAttempts) {
          console.log(`Balance not updated yet, attempt ${attempts}/${maxAttempts}`);
          setTimeout(checkBalance, 1000); // 每秒检查一次
        } else {
          this.showMessage('⚠️ Balance update may still be processing. Please refresh the page in a few seconds.', 'warning');
          this.loading = false;
          this.#render();
        }
      };
      
      // 开始轮询检查
      setTimeout(checkBalance, 2000); // 2秒后开始检查
      
    } catch (error) {
      console.error('Failed to update principal balance:', error);
      this.showMessage('Balance update failed: ' + error.message, 'error');
      this.loading = false;
      this.#render();
    }
  }





  // 查询所有资产余额（目前只查ckBTC，结构可扩展）
  async loadAllAssetBalances() {
    try {
      this.loading = true;
      this.#render();
      
      console.log('Checking all balances for user:', this.userPrincipal);
      
      const result = await my_rust_dapp_backend.get_user_all_balances(this.userPrincipal);
      
      if (result.Ok !== undefined) {
        const balances = result.Ok;
        let message = '💰 All Account Balances:\n\n';
        
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

      // 前端余额判断（兼容string/BigInt/number）
      const balanceNum = Number(this.currentUser && this.currentUser.balance);
      if (!this.currentUser || isNaN(balanceNum) || balanceNum < 1) {
        this.showMessage('余额不足，无法下注。请先充值 ckBTC。', 'error');
        return;
      }

      console.log('currentUser before bet:', this.currentUser);
      console.log('Balance before bet:', this.currentUser ? this.currentUser.balance : 'No user');
      
      console.log('Placing bet for user:', this.userPrincipal);
      await my_rust_dapp_backend.place_bet(this.userPrincipal);
      
      // Reload data to see updated round info
      console.log('Reloading user data after bet...');
      await this.loadUserData();
      console.log('User data reloaded, currentUser:', this.currentUser);
      console.log('Balance after bet:', this.currentUser ? this.currentUser.balance : 'No user');
      
      // Force refresh user data after a short delay to ensure backend state is updated
      setTimeout(async () => {
        console.log('Force refreshing user data...');
        await this.loadUserData();
        console.log('Force refreshed user data, currentUser:', this.currentUser);
        console.log('Force refreshed balance:', this.currentUser ? this.currentUser.balance : 'No user');
        this.#render();
      }, 1000);
      
      await this.loadRoundData();
      
      this.showMessage('Bet placed successfully! You can place more bets to increase your chances of winning!', 'success');
    } catch (error) {
      console.error('Failed to place bet:', error);
      let msg = error && error.message ? error.message : String(error);
      if (msg.includes('Insufficient balance for bet')) {
        this.showMessage('余额不足，无法下注。请先充值 ckBTC。', 'error');
      } else if (msg.includes('User not found')) {
        this.showMessage('用户不存在，请重新登录或注册。', 'error');
      } else if (msg.includes('Invalid principal format')) {
        this.showMessage('用户身份格式有误，请重新登录。', 'error');
      } else {
        this.showMessage('下注失败：' + msg, 'error');
      }
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
          console.log('User balance from backend:', this.currentUser.balance);
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
      this.countdown = '⏰ Round Ended';
      
      // 智能自动刷新轮次数据
      if (!this._autoRoundRefresh) {
        this._autoRoundRefresh = setInterval(async () => {
          try {
          await this.loadRoundData();
            
            // 检查是否新一轮已开始
          const newNow = Date.now() * 1_000_000;
          const newEndTime = typeof this.currentRound.end_time === 'bigint' 
            ? Number(this.currentRound.end_time) 
            : Number(this.currentRound.end_time);
            
          if (newNow < newEndTime) {
              // 新一轮已开始
            clearInterval(this._autoRoundRefresh);
            this._autoRoundRefresh = null;
            this.updateCountdown(); // 立即刷新倒计时
              
              // 显示新轮次开始的消息
              this.showMessage('🎉 New round started!', 'success');
              
              // 自动刷新用户数据
              await this.loadUserData();
            }
          } catch (error) {
            console.error('Auto round refresh error:', error);
          }
        }, 3000); // 每3秒检查一次，更频繁的检查
      }
    } else {
      // 正常倒计时时，清除自动刷新
      if (this._autoRoundRefresh) {
        clearInterval(this._autoRoundRefresh);
        this._autoRoundRefresh = null;
      }
      
      const remaining = endTime - now;
      const seconds = Math.floor(remaining / 1_000_000_000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      
      // 根据剩余时间添加不同的表情符号和颜色提示
      let emoji = '⏰';
      let urgency = '';
      
      if (minutes <= 1) {
        emoji = '⚡';
        urgency = 'final';
      } else if (minutes <= 2) {
        emoji = '🔥';
        urgency = 'urgent';
      } else if (minutes <= 5) {
        emoji = '🎯';
        urgency = 'active';
      }
      
      this.countdown = `${emoji} ${minutes}:${(remainingSeconds || 0).toString().padStart(2, '0')}`;
      
      // 在最后30秒显示特殊提示
      if (seconds <= 30 && seconds > 0) {
        this.countdown += ' ⚡';
      }
    }
    
    // Only re-render if countdown changed
    if (this.countdown !== this.lastCountdown) {
      this.lastCountdown = this.countdown;
      this.#render();
    }
  }

  getRoundStatus() {
    if (!this.currentRound) return '🔄 Loading...';
    
    const now = Date.now() * 1_000_000;
    const endTime = typeof this.currentRound.end_time === 'bigint' 
      ? Number(this.currentRound.end_time) 
      : Number(this.currentRound.end_time);
    
    if (now >= endTime) {
      return '⏰ Round Ended - Auto starting next round...';
    } else {
      const timeLeft = endTime - now;
      const minutesLeft = Math.floor(timeLeft / (60 * 1_000_000_000));
      const secondsLeft = Math.floor(timeLeft / 1_000_000_000);
      
      if (minutesLeft <= 1) {
        if (secondsLeft <= 30) {
          return '⚡ Final seconds!';
        }
        return '⚡ Final moments!';
      } else if (minutesLeft <= 2) {
        return '🔥 Almost time!';
      } else {
        return '🎯 Round Active';
      }
    }
  }

  cleanup() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    // 移除余额检查间隔清理，因为已经禁用了自动余额监控
  }

  // Start balance monitoring
  startBalanceMonitoring() {
    // 移除自动余额监控，用户需要手动更新余额
    console.log('Balance monitoring disabled - users must manually update balance');
  }

  // Stop balance monitoring
  stopBalanceMonitoring() {
    // 移除自动余额监控
    console.log('Balance monitoring already disabled');
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

  // 获取用户在当前轮次的下注次数
  getUserBetCount() {
    if (!this.currentRound || !this.userPrincipal) return 0;
    
    const userPrincipal = this.userPrincipal.toString();
    return this.currentRound.participants.filter(p => p.toString() === userPrincipal).length;
  }

  // 生成类似比特币地址格式的 ckBTC 地址（64字符十六进制）
  generateBitcoinStyleAddress() {
    if (!this.userDepositAccount || !this.userDepositAccount.owner) {
      return null;
    }
    
    const owner = this.userDepositAccount.owner.toString();
    const subaccount = this.userDepositAccount.subaccount;
    
    // 创建地址数据
    let addressData = owner;
    if (subaccount && Array.isArray(subaccount) && subaccount.length > 0) {
      // 将 subaccount 转换为十六进制字符串
      const subaccountHex = Array.from(subaccount).map(b => (b || 0).toString(16).padStart(2, '0')).join('');
      addressData = `${owner}_${subaccountHex}`;
    }
    
    // 使用 SHA256 哈希生成比特币风格的地址
    const hash = this.sha256Hash(addressData);
    
    // 将哈希转换为64字符的十六进制字符串
    const hexHash = Array.from(hash).map(char => 
      char.charCodeAt(0).toString(16).padStart(2, '0')
    ).join('');
    
    // 确保长度为64字符
    const bitcoinStyleAddress = hexHash.substring(0, 64);
    
    return bitcoinStyleAddress;
  }

  // 改进的 SHA256 哈希函数（生成64字符十六进制）
  sha256Hash(str) {
    // 简单的哈希实现（实际应用中应使用真实的 SHA256）
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    
    // 生成32字节的哈希数据
    const hashBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      hashBytes[i] = (hash >> (i % 4)) & 0xFF;
    }
    
    // 添加额外的熵以确保唯一性
    for (let i = 0; i < 32; i++) {
      hashBytes[i] = (hashBytes[i] + str.charCodeAt(i % str.length)) & 0xFF;
    }
    
    return String.fromCharCode(...hashBytes);
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

  // 格式化 subaccount 显示，在移动端显示更短
  formatSubaccount(subaccount) {
    if (!subaccount || !Array.isArray(subaccount)) return '';
    
    const fullHex = Array.from(subaccount).map(b => (b || 0).toString(16).padStart(2, '0')).join('');
    
    // 在移动端显示更短的版本
    if (this.isMobile) {
      // 移动端只显示前8位和后8位
      if (fullHex.length > 16) {
        return `${fullHex.substring(0, 8)}...${fullHex.substring(fullHex.length - 8)}`;
      }
      return fullHex;
    }
    
    // 桌面端显示完整版本，但如果太长也进行分段
    if (fullHex.length > 64) {
      return `${fullHex.substring(0, 32)}...${fullHex.substring(fullHex.length - 32)}`;
    }
    
    return fullHex;
  }

  // 格式化 Principal 显示，在移动端显示更短
  formatPrincipal(principal) {
    if (!principal) return '';
    
    // 在移动端显示更短的版本
    if (this.isMobile) {
      // 移动端只显示前12位和后8位
      if (principal.length > 20) {
        return `${principal.substring(0, 12)}...${principal.substring(principal.length - 8)}`;
      }
      return principal;
    }
    
    // 桌面端显示完整版本，但如果太长也进行分段
    if (principal.length > 50) {
      return `${principal.substring(0, 25)}...${principal.substring(principal.length - 25)}`;
    }
    
    return principal;
  }

  // 显示完整文本（用于移动端点击查看完整信息）
  showFullText(text) {
    const fallbackCopy = (txt) => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = txt;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        return successful;
      } catch (e) {
        return false;
      }
    };
    if (this.isMobile) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          alert(`完整信息已复制:\n${text}`);
        }).catch(() => {
          if (fallbackCopy(text)) {
            alert(`完整信息已复制:\n${text}`);
          } else {
            alert(`复制失败，请手动长按选择复制:\n${text}`);
          }
        });
      } else {
        if (fallbackCopy(text)) {
          alert(`完整信息已复制:\n${text}`);
        } else {
          alert(`复制失败，请手动长按选择复制:\n${text}`);
        }
      }
    } else {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          this.showMessage('已复制到剪贴板', 'success');
        }).catch(() => {
          if (fallbackCopy(text)) {
            this.showMessage('已复制到剪贴板', 'success');
          } else {
            this.showMessage('复制失败，请手动选择复制', 'error');
          }
        });
      } else {
        if (fallbackCopy(text)) {
          this.showMessage('已复制到剪贴板', 'success');
        } else {
          this.showMessage('复制失败，请手动选择复制', 'error');
        }
      }
    }
  }

  // 显示完整 subaccount
  showFullSubaccount(subaccount) {
    if (!subaccount || !Array.isArray(subaccount)) return;
    const fullHex = Array.from(subaccount).map(b => (b || 0).toString(16).padStart(2, '0')).join('');
    const fallbackCopy = (txt) => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = txt;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        return successful;
      } catch (e) {
        return false;
      }
    };
    if (this.isMobile) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullHex).then(() => {
          alert(`完整 Subaccount 已复制:\n${fullHex}`);
        }).catch(() => {
          if (fallbackCopy(fullHex)) {
            alert(`完整 Subaccount 已复制:\n${fullHex}`);
          } else {
            alert(`复制失败，请手动长按选择复制:\n${fullHex}`);
          }
        });
      } else {
        if (fallbackCopy(fullHex)) {
          alert(`完整 Subaccount 已复制:\n${fullHex}`);
        } else {
          alert(`复制失败，请手动长按选择复制:\n${fullHex}`);
        }
      }
    } else {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullHex).then(() => {
          this.showMessage('Subaccount 已复制到剪贴板', 'success');
        }).catch(() => {
          if (fallbackCopy(fullHex)) {
            this.showMessage('Subaccount 已复制到剪贴板', 'success');
          } else {
            this.showMessage('复制失败，请手动选择复制', 'error');
          }
        });
      } else {
        if (fallbackCopy(fullHex)) {
          this.showMessage('Subaccount 已复制到剪贴板', 'success');
        } else {
          this.showMessage('复制失败，请手动选择复制', 'error');
        }
      }
    }
  }

  copyPrincipal(principal) {
    if (!principal) return;
    const text = principal.toString();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.showMessage('复制成功', 'success');
      }, () => {
        this.showMessage('复制失败', 'error');
      });
    } else {
      // fallback
        const textarea = document.createElement('textarea');
      textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
      try {
        document.execCommand('copy');
        this.showMessage('复制成功', 'success');
      } catch (e) {
        this.showMessage('复制失败', 'error');
      }
      document.body.removeChild(textarea);
      }
  }


  // 新增：查询统一账户余额
  async checkTreasuryBalance() {
    try {
      this.loading = true;
      this.#render();
      
      console.log('Checking treasury balance');
      
      const result = await my_rust_dapp_backend.get_treasury_balance();
      
      if (result.Ok !== undefined) {
        const balance = result.Ok;
        const balanceFormatted = this.formatBalance(balance);
        this.showMessage(`Treasury balance: ${balanceFormatted}`, 'success');
        alert(`Treasury Balance: ${balanceFormatted}`);
      } else if (result.Err !== undefined) {
        this.showMessage('Failed to get treasury balance: ' + result.Err, 'error');
        }
      
    } catch (error) {
      console.error('Failed to check treasury balance:', error);
      this.showMessage('Failed to check treasury balance: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }



  async getTreasuryAccount() {
    try {
      this.loading = true;
      this.#render();
      
      console.log('Getting treasury account info');
      
      const treasuryAccount = await my_rust_dapp_backend.get_treasury_account();
      
      if (treasuryAccount) {
        const ownerText = treasuryAccount.owner.toString();
        const subaccountText = treasuryAccount.subaccount ? 
          Array.from(treasuryAccount.subaccount).map(b => (b || 0).toString(16).padStart(2, '0')).join('') : 
          'None';
        
        const accountInfo = `Treasury Account Info:\n\nOwner: ${ownerText}\nSubaccount: ${subaccountText}`;
        this.showMessage('Treasury account info retrieved successfully!', 'success');
        alert(accountInfo);
      } else {
        this.showMessage('Failed to get treasury account info', 'error');
      }
      
    } catch (error) {
      console.error('Failed to get treasury account:', error);
      this.showMessage('Failed to get treasury account: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }



  // 新增：手动触发轮次自动开始
  async manualTriggerRoundAutoStart() {
    try {
      this.loading = true;
      this.#render();
      
      console.log('Manually triggering round auto-start');
      
      const result = await my_rust_dapp_backend.manual_trigger_round_auto_start();
      
      this.showMessage('Round auto-start triggered successfully!', 'success');
      alert(result);
      
      // 刷新轮次数据
      await this.loadRoundData();
      
    } catch (error) {
      console.error('Failed to trigger round auto-start:', error);
      this.showMessage('Failed to trigger round auto-start: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }



  #render() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      render(html`
        <div class="nav-tabs">
          <button class="${this.activePage === 'game' ? 'active' : ''}" @click=${() => { this.activePage = 'game'; this.#render(); }}>Game</button>
          <button class="${this.activePage === 'profile' ? 'active' : ''}" @click=${() => { this.activePage = 'profile'; this.#render(); }}>${this.isConnected ? 'Profile' : 'Login'}</button>
        </div>
        ${this.activePage === 'game' ? html`
          <section class="main-right">
            <div class="round-section">
              <h2>🎲 Current Lottery Round</h2>
              ${this.currentRound ? html`
                <div class="round-info">
                  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align: center;">
                    <h3 style="margin: 0 0 10px 0; font-size: 1.5rem;">Round #${this.currentRound.id}</h3>
                    <div style="font-size: 2rem; font-weight: bold; margin: 10px 0; color: #ffd700;">
                      🏆 ${this.formatBalance(this.currentRound.prize_pool)}
                    </div>
                    <p style="margin: 5px 0; opacity: 0.9;">Prize Pool</p>
                  </div>
                  
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; text-align: center;">
                      <div style="font-size: 1.5rem; font-weight: bold; color: #2e7d32;">
                        ${(this.currentRound.participants || []).length}
                      </div>
                      <div style="font-size: 0.9rem; color: #666;">Total Bets</div>
                    </div>
                    <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center;">
                      <div style="font-size: 1.5rem; font-weight: bold; color: #1976d2;">
                        ${new Set((this.currentRound.participants || []).map(p => p.toString())).size}
                      </div>
                      <div style="font-size: 0.9rem; color: #666;">Unique Players</div>
                    </div>
                  </div>
                  
                  <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ff9800;">
                    <div style="text-align: center; margin-bottom: 10px;">
                      <span style="font-size: 0.9rem; color: #e65100;">⏰ Round Timer</span>
                    </div>
                    <div style="text-align: center; font-size: 1.8rem; font-weight: bold; color: #e65100; font-family: 'Courier New', monospace;">
                      ${this.countdown || '--:--'}
                    </div>
                    <div style="text-align: center; font-size: 0.8rem; color: #e65100; margin-top: 5px;">
                      ${this.getRoundStatus()}
                    </div>
                  </div>
                  ${(this.currentRound.winners || []).length > 0 ? html`
                    <div style="background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align: center; border: 3px solid #ffc107;">
                      <div style="font-size: 1.2rem; font-weight: bold; color: #b8860b; margin-bottom: 10px;">
                        🎉 CONGRATULATIONS! 🎉
                      </div>
                      <div style="font-size: 1rem; color: #8b6914;">
                        Winner: ${this.currentRound.winners[0] ? this.formatPrincipal(this.currentRound.winners[0].toString()) : 'Unknown'}
                      </div>
                      <div style="font-size: 0.9rem; color: #8b6914; margin-top: 5px;">
                        Prize: ${this.formatBalance(this.currentRound.prize_pool)}
                      </div>
                    </div>
                  ` : ''}
                  ${this.isConnected ? html`
                    <div class="round-actions">
                      <div style="background: linear-gradient(135deg, #4caf50 0%, #45a049 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align: center;">
                        <div style="font-size: 1.2rem; font-weight: bold; color: white; margin-bottom: 15px;">
                          🎯 Place Your Bet
                        </div>
                      <button 
                        class="btn btn-primary" 
                        @click=${() => {
                          if (!this.isConnected) {
                            this.showMessage('请先登录', 'error');
                            return;
                          }
                          const balanceNum = Number(this.currentUser && this.currentUser.balance);
                          if (isNaN(balanceNum) || balanceNum < 1) {
                            this.showMessage('余额不足，无法下注。请先充值 ckBTC。', 'error');
                            return;
                          }
                          this.placeBet();
                        }}
                        ?disabled=${this.loading}
                          style="width: 100%; margin-bottom: 15px; background: white; color: #4caf50; border: none; font-weight: bold; font-size: 1.1rem; padding: 15px; border-radius: 8px;"
                      >
                          ${this.loading ? '🎲 Placing Bet...' : '🎲 Place Bet (0.00000001 ckBTC)'}
                      </button>
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                          <div style="font-size: 1rem; color: white; font-weight: bold;">
                            💰 Remaining Bets: ${this.currentUser && this.currentUser.balance ? Math.floor(Number(this.currentUser.balance) / 1) : 0}
                      </div>
                        </div>
                                              <div style="background: rgba(255,255,255,0.9); padding: 15px; border-radius: 8px; margin-top: 15px; font-size: 0.9rem; color: #333;">
                          <p style="margin: 0 0 8px 0; font-weight: bold; color: #2e7d32;">💡 Betting Strategy</p>
                          <ul style="margin: 0; padding-left: 20px; font-size: 0.85rem; color: #555;">
                            <li>🎯 Multiple bets increase your winning chances</li>
                            <li>💰 Each bet costs only 0.00000001 ckBTC</li>
                            <li>🏆 More bets = higher probability to win the prize pool</li>
                            <li>⚡ Place as many bets as you can afford!</li>
                        </ul>
                        ${this.isConnected ? html`
                            <div style="margin-top: 10px; padding: 10px; background: #e3f2fd; border-radius: 6px; border-left: 4px solid #2196f3;">
                              <p style="margin: 0; font-size: 0.9rem; color: #1976d2; font-weight: bold;">
                                🎲 Your bets this round: ${this.getUserBetCount()} 
                              ${this.getUserBetCount() === 1 ? 'bet' : 'bets'}
                            </p>
                          </div>
                        ` : ''}
                      </div>
                      ${this.isAdmin ? html`
                        <button 
                          class="btn btn-secondary" 
                          @click=${this.triggerDraw.bind(this)}
                          ?disabled=${this.loading}
                          style="width: 100%; margin-top: 15px; background: #ff9800; color: white; border: none; font-weight: bold; padding: 12px; border-radius: 8px;"
                        >
                          ${this.loading ? '🎲 Triggering Draw...' : '🎲 Trigger Draw (Admin Only)'}
                        </button>
                        <button 
                          class="btn btn-info" 
                          @click=${this.checkTreasuryBalance.bind(this)}
                          ?disabled=${this.loading}
                          style="width: 100%; margin-top: 10px; background: #17a2b8; color: white; border: none; font-weight: bold; padding: 12px; border-radius: 8px;"
                        >
                          ${this.loading ? '💰 Checking Treasury...' : '💰 Check Treasury Balance (Admin)'}
                        </button>
                        <button 
                          class="btn btn-warning" 
                          @click=${this.getTreasuryAccount.bind(this)}
                          ?disabled=${this.loading}
                          style="width: 100%; margin-top: 10px; background: #ffc107; color: #212529; border: none; font-weight: bold; padding: 12px; border-radius: 8px;"
                        >
                          ${this.loading ? '📋 Getting Treasury Info...' : '📋 Treasury Account Info (Admin)'}
                        </button>
                      ` : html`
                        <div style="background: #fff3cd; padding: 12px; border-radius: 8px; margin-top: 15px; text-align: center; border-left: 4px solid #ffc107;">
                          <div style="font-size: 0.9rem; color: #856404;">
                            🔒 Admin access required to trigger draw
                          </div>
                        </div>
                      `}
                    </div>
                  ` : html`
                    <div style="background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%); padding: 30px; border-radius: 12px; text-align: center; border: 2px dashed #ccc;">
                      <div style="font-size: 2rem; margin-bottom: 15px;">🔐</div>
                      <div style="font-size: 1.2rem; font-weight: bold; color: #666; margin-bottom: 10px;">
                        Login Required
                      </div>
                      <div style="font-size: 0.9rem; color: #888;">
                        Please login to participate in the lottery and place your bets!
                      </div>
                      <div style="background: #fff3cd; padding: 12px; border-radius: 8px; margin-top: 15px; border-left: 4px solid #ffc107; text-align: left;">
                        <div style="font-size: 0.9rem; color: #856404; margin-bottom: 8px; font-weight: bold;">
                          🌐 Browser Compatibility
                        </div>
                        <div style="font-size: 0.8rem; color: #856404; line-height: 1.4;">
                          ${this.isMobile ? html`
                            ${this.isChrome ? html`
                              ✅ Mobile Chrome: Fully supported
                            ` : this.isSafari ? html`
                              ⚠️ Mobile Safari: May require multiple attempts
                              <br>
                              <span style="color: #d63384; font-weight: bold;">
                                🔧 Safari Alternative: 
                                <a href="#" @click=${(e) => { e.preventDefault(); this.handleSafariManualLogin(); }} style="color: #d63384; text-decoration: underline;">
                                  Click here to login manually
                                </a>
                              </span>
                            ` : this.isFirefox ? html`
                              ⚠️ Mobile Firefox: May require longer timeout
                            ` : this.isEdge ? html`
                              ⚠️ Mobile Edge: May require longer timeout
                            ` : html`
                              ⚠️ Other mobile browser: Compatibility may vary
                            `}
                          ` : html`
                            ${this.isChrome ? html`
                              ✅ Desktop Chrome: Fully supported
                            ` : this.isFirefox ? html`
                              ✅ Desktop Firefox: Fully supported
                            ` : this.isEdge ? html`
                              ✅ Desktop Edge: Fully supported
                            ` : html`
                              ⚠️ Other desktop browser: Compatibility may vary
                            `}
                          `}
                          <br>
                          <span style="font-size: 0.75rem; color: #856404;">
                            💡 Tip: If login fails, try refreshing the page or using a different browser
                          </span>
                </div>
                      </div>
                    </div>
                  `}
                </div>
              ` : html`
                <div style="background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%); padding: 40px; border-radius: 12px; text-align: center; border: 2px dashed #ccc;">
                  <div style="font-size: 3rem; margin-bottom: 20px;">🔄</div>
                  <div style="font-size: 1.2rem; font-weight: bold; color: #666; margin-bottom: 10px;">
                    Loading Round Info
                  </div>
                  <div style="font-size: 0.9rem; color: #888;">
                    Please wait while we fetch the latest lottery round...
                  </div>
                </div>
              `}
            </div>
            ${this.systemStats ? html`
              <div class="stats-section">
                <h2>📊 System Statistics</h2>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                  <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #2e7d32;">
                      ${this.systemStats.total_rounds}
                    </div>
                    <div style="font-size: 0.9rem; color: #666;">Total Rounds</div>
                  </div>
                  <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #1976d2;">
                      ${this.systemStats.total_bets}
                    </div>
                    <div style="font-size: 0.9rem; color: #666;">Total Bets</div>
                  </div>
                  <div style="background: #fff3e0; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #f57c00;">
                      ${this.formatBalance(this.systemStats.total_winnings)}
                    </div>
                    <div style="font-size: 0.9rem; color: #666;">Total Winnings</div>
                  </div>
                  <div style="background: #fce4ec; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #c2185b;">
                      ${this.systemStats.active_users}
                    </div>
                    <div style="font-size: 0.9rem; color: #666;">Active Users</div>
                  </div>
                </div>
                <div style="background: #f3e5f5; padding: 15px; border-radius: 8px; margin-top: 15px; text-align: center;">
                  <div style="font-size: 1.2rem; font-weight: bold; color: #7b1fa2;">
                    💰 Total ckBTC Deposits: ${this.formatBalance(this.systemStats.total_ckbtc_deposits)}
                  </div>
                </div>
              </div>
            ` : ''}
          </section>
        ` : html`
          <section class="profile-section" style="max-width: 600px; margin: 0 auto; padding: 24px 0;">
            <div class="profile-card" style="background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); padding: 24px 20px; margin-bottom: 24px;">
              <div class="profile-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px;">
                <h2 style="margin: 0;">👤 My Profile</h2>
              ${this.isConnected ? html`
                  <div class="profile-user-section" style="display: flex; align-items: center; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px; background: #f8f9fa; padding: 6px 10px; border-radius: 6px; border: 1px solid #e9ecef;">
                      <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">
                        ${this.userPrincipal ? this.userPrincipal.substring(0, 2).toUpperCase() : 'U'}
                      </div>
                      <span style="font-size: 0.8rem; color: #495057; font-weight: 500;">
                        ${this.userPrincipal ? this.formatPrincipal(this.userPrincipal) : 'User'}
                      </span>
                    </div>
                    <button 
                      class="btn btn-danger" 
                      style="background: #dc3545; color: white; border: none; padding: 4px 12px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;" 
                      @click=${this.disconnectIdentity.bind(this)} 
                      ?disabled=${this.loading}
                      title="Logout"
                    >
                      <span style="font-size:1.1em;">🚪</span> Logout
                </button>
                  </div>
                ` : html`
                  <button 
                    class="btn btn-primary" 
                    style="background: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 0.9rem;" 
                    @click=${this.connectIdentity.bind(this)} 
                    ?disabled=${this.loading}
                  >
                    ${this.loading ? 'Connecting...' : '🔐 Login'}
                  </button>
                `}
              </div>
              
              ${!this.isConnected ? html`
                <div style="background: #fff3cd; padding: 12px; border-radius: 8px; margin-top: 15px; border-left: 4px solid #ffc107;">
                  <div style="font-size: 0.9rem; color: #856404; margin-bottom: 8px; font-weight: bold;">
                    🌐 Browser Compatibility
                  </div>
                  <div style="font-size: 0.8rem; color: #856404; line-height: 1.4;">
                    ${this.isMobile ? html`
                      ${this.isChrome ? html`
                        ✅ Mobile Chrome: Fully supported
                      ` : this.isSafari ? html`
                        ⚠️ Mobile Safari: May require multiple attempts
                        <br>
                        <span style="color: #d63384; font-weight: bold;">
                          🔧 Safari Alternative: 
                          <a href="#" @click=${(e) => { e.preventDefault(); this.handleSafariManualLogin(); }} style="color: #d63384; text-decoration: underline;">
                            Click here to login manually
                          </a>
                              </span>
                      ` : this.isFirefox ? html`
                        ⚠️ Mobile Firefox: May require longer timeout
                      ` : this.isEdge ? html`
                        ⚠️ Mobile Edge: May require longer timeout
                      ` : html`
                        ⚠️ Other mobile browser: Compatibility may vary
                      `}
                    ` : html`
                      ${this.isChrome ? html`
                        ✅ Desktop Chrome: Fully supported
                      ` : this.isFirefox ? html`
                        ✅ Desktop Firefox: Fully supported
                      ` : this.isEdge ? html`
                        ✅ Desktop Edge: Fully supported
                      ` : html`
                        ⚠️ Other desktop browser: Compatibility may vary
                      `}
                    `}
                    <br>
                    <span style="font-size: 0.75rem; color: #856404;">
                      💡 Tip: If login fails, try refreshing the page or using a different browser
                    </span>
                            </div>
                          </div>
              ` : ''}
              <div class="profile-info-row" style="display: flex; align-items: center; margin-bottom: 12px;">
                <span class="profile-label" style="min-width: 110px; color: #888; font-weight: 500;">Principal:</span>
                <span class="profile-value" style="font-family: monospace; font-size: 1.1em; margin-right: 8px;">${this.userPrincipal ? this.formatPrincipal(this.userPrincipal.toString()) : '--'}</span>
                <button class="btn-small copy-btn" style="margin-left: 8px; padding: 2px 10px; font-size: 0.9em; border-radius: 6px; border: none; background: #f3f3f3; cursor: pointer;" @click=${() => this.copyPrincipal(this.userPrincipal)}>Copy</button>
                    </div>
              <div class="profile-info-row" style="display: flex; align-items: center; margin-bottom: 12px;">
                <span class="profile-label" style="min-width: 110px; color: #888; font-weight: 500;">Balance:</span>
                <span class="profile-balance" style="font-family: monospace; color: #38a169; font-weight: bold; font-size: 1.3em; margin-right: 8px;">${this.currentUser ? this.formatBalance(this.currentUser.balance) : '0.00000000 ckBTC'}</span>
                <button class="btn-small" style="margin-left: 8px; padding: 2px 10px; font-size: 0.9em; border-radius: 6px; border: none; background: #e3f2fd; color: #1976d2; cursor: pointer;" @click=${this.updateBalance.bind(this)} ?disabled=${this.loading}>${this.loading ? 'Refreshing...' : '🔄 Refresh'}</button>
              </div>


              

                    </div>

            <div class="profile-card" style="background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); padding: 24px 20px; margin-bottom: 24px;">
              <h3 style="margin-bottom: 14px;">💸 Withdraw</h3>
              <input type="number" placeholder="Amount (ckBTC)" style="width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid #ddd; border-radius: 4px;" @input=${(e) => this.withdrawAmount = e.target.value} />
              <button class="btn btn-warning" style="width: 100%;" @click=${this.withdrawBalance.bind(this)} ?disabled=${this.loading || !this.withdrawAmount}>${this.loading ? 'Withdrawing...' : 'Withdraw'}</button>
            </div>

            <div class="profile-card" style="background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); padding: 24px 20px; margin-bottom: 24px;">
              <h3 style="margin-bottom: 14px;">📜 Recent Transactions</h3>
              ${this.currentUser && this.currentUser.transaction_history && this.currentUser.transaction_history.length > 0
                ? html`
                  <ul class="tx-list" style="list-style: none; padding: 0; margin: 0;">
                    ${this.currentUser.transaction_history.slice(-5).reverse().map(tx => html`
                      <li style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 0.98em;">
                        <span class="tx-type" style="color: #888;">${tx.transaction_type}</span>
                        <span class="tx-amount" style="color: #1976d2; font-weight: bold;">${this.formatBalance(tx.amount)}</span>
                        <span class="tx-time" style="color: #aaa;">${this.formatTimestamp(tx.timestamp)}</span>
                      </li>
                    `)}
                  </ul>
                `
                : html`<p style="color: #aaa;">No transactions yet.</p>`
                }
              </div>

            <div class="profile-card" style="background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); padding: 24px 20px; margin-bottom: 24px;">
              <h3 style="margin-bottom: 14px;">🏆 Winning History</h3>
                ${this.currentUser && this.currentUser.winning_history && this.currentUser.winning_history.length > 0
                  ? html`
                  <ul class="win-list" style="list-style: none; padding: 0; margin: 0;">
                    ${this.currentUser.winning_history.slice(-5).reverse().map(win => html`
                      <li style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 0.98em;">
                        <span class="win-amount" style="color: #e67e22; font-weight: bold;">${this.formatBalance(win.amount)}</span>
                        <span class="win-time" style="color: #aaa;">${this.formatTimestamp(win.timestamp)}</span>
                        <span class="win-round" style="color: #888;">Round ${win.round_id}</span>
                      </li>
                      `)}
                  </ul>
                  `
                : html`<p style="color: #aaa;">No winnings yet.</p>`
                }
              </div>


          </section>
        `}
      `, document.getElementById('app'));
    });
  }

  // Safari 手动登录处理
  handleSafariManualLogin() {
    if (this.isMobile && this.isSafari) {
      // 打开新窗口进行登录
      const loginUrl = 'https://identity.ic0.app/';
      const newWindow = window.open(loginUrl, '_blank', 'width=400,height=600');
      
      if (newWindow) {
        // 监听窗口关闭事件
        const checkClosed = setInterval(() => {
          if (newWindow.closed) {
            clearInterval(checkClosed);
            console.log('Safari manual login window closed, checking session...');
            
            // 延迟检查会话状态
            setTimeout(async () => {
              try {
                const status = await identityCkBtcManager.getConnectionStatus();
                if (status.isConnected) {
                  console.log('Safari manual login successful');
                  this.userPrincipal = status.principal;
                  this.identityProvider = status.provider;
                  this.pageState = 'dashboard';
                  await this.createUserInternal();
                  await this.loadUserData();
                  this.showMessage('Safari manual login successful!', 'success');
                  this.#render();
                } else {
                  console.log('Safari manual login failed - no session found');
                  this.showMessage('Manual login failed. Please try again.', 'error');
                }
              } catch (error) {
                console.error('Safari manual login check failed:', error);
                this.showMessage('Failed to check login status. Please try again.', 'error');
              }
            }, 1000);
          }
        }, 500);
      } else {
        this.showMessage('Failed to open login window. Please allow popups and try again.', 'error');
      }
    }
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

// 在文件末尾追加移动端适配样式
const style = document.createElement('style');
style.innerHTML = `
@media (max-width: 600px) {
  body, .container, .dashboard-personal, .wallet-details-personal, .round-section, .bet-section, .deposit-account-info, .explanation, .comparison {
    padding: 8px !important;
    font-size: 16px !important;
  }
  .address-display, .address-code, code, .principal-id, .address-label {
    font-size: 14px !important;
    word-break: break-all !important;
    max-width: 100% !important;
    overflow-x: auto !important;
    display: block !important;
  }
  .btn, button, .btn-small, .btn-primary, .btn-secondary, .copy-btn {
    min-height: 44px !important;
    font-size: 16px !important;
    width: 100% !important;
    margin-bottom: 10px !important;
    padding: 12px 0 !important;
  }
  .deposit-account-info, .explanation, .comparison {
    padding: 10px !important;
    font-size: 15px !important;
  }
  .mobile-login-tip {
    font-size: 15px !important;
    padding: 8px 0 !important;
  }
  .address-details, .deposit-instructions {
    font-size: 14px !important;
    padding: 8px !important;
  }
  .main-flex, .main-left, .main-right {
    flex-direction: column !important;
    max-width: 100% !important;
    min-width: 0 !important;
    gap: 0 !important;
  }
  .transaction-item-personal, .winning-item-personal, .deposit-item-personal {
    font-size: 14px !important;
    padding: 10px !important;
  }
}
`;
document.head.appendChild(style);

// 样式追加
const styleTab = document.createElement('style');
styleTab.innerHTML = `
.nav-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}
.nav-tabs button {
  flex: 1;
  padding: 12px 0;
  font-size: 16px;
  border: none;
  background: #eee;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
}
.nav-tabs button.active {
  background: #3498db;
  color: #fff;
  font-weight: bold;
}

@media (max-width: 600px) {
  .nav-tabs {
    flex-direction: column;
    gap: 5px;
  }
  .nav-tabs button {
    border-radius: 6px;
  }
  
  /* 移动端用户头像区域适配 */
  .user-avatar-section {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }
  
  .user-avatar-section .btn {
    width: 100%;
    padding: 8px 12px;
    font-size: 0.9rem;
  }
  
  .user-info {
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 8px;
  }
  
  .user-avatar {
    width: 28px;
    height: 28px;
    font-size: 12px;
  }
  
  /* 个人中心页面标题区域移动端适配 */
  .profile-header {
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }
  
  .profile-header h2 {
    text-align: center;
    margin-bottom: 10px;
  }
  
  .profile-user-section {
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  
  .profile-user-section .btn {
    width: 100%;
    padding: 8px 12px;
    font-size: 0.9rem;
  }
}

.account-consolidation {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.account-consolidation h3 {
  margin: 0 0 16px 0;
  color: #495057;
  font-size: 18px;
}

.btn-warning {
  background: #ffc107;
  color: #212529;
  border: 1px solid #ffc107;
}

.btn-warning:hover {
  background: #e0a800;
  border-color: #d39e00;
}

.btn-warning:disabled {
  background: #ffc107;
  opacity: 0.6;
}

.btn-info {
  background: #17a2b8;
  color: #fff;
  border: 1px solid #17a2b8;
}

.btn-info:hover {
  background: #138496;
  border-color: #117a8b;
}

.btn-info:disabled {
  background: #17a2b8;
  opacity: 0.6;
}

.admin-actions h3 {
  margin: 0 0 16px 0;
  color: #495057;
  font-size: 18px;
}
`;
document.head.appendChild(styleTab);