import { html, render } from 'lit-html';
import { my_rust_dapp_backend } from 'declarations/my_rust_dapp_backend';
import { Principal } from '@dfinity/principal';
import logo from './logo2.svg';
import { 
  createOisyWallet, 
  isOisyAvailable, 
  getOisyInstallGuide 
} from './oisy-wallet.js';

class App {
  constructor() {
    this.currentUser = null;
    this.currentRound = null;
    this.systemStats = null;
    this.userPrincipal = null;
    this.isAdmin = false;
    this.depositAmount = '';
    this.loading = false;
    this.message = '';
    this.messageType = 'info'; // 'info', 'success', 'error'
    this.walletType = null; // 'oisy'
    this.countdown = null; // Countdown
    this.countdownInterval = null; // Countdown timer
    this.canisterAddress = null;
    this.walletBalance = null; // Wallet BTC balance
    
    // Render immediately, then initialize asynchronously
    this.#render();
    this.init();
  }

  async init() {
    try {
      console.log('Initializing app...');
      
      // Try to auto-connect to already connected Oisy wallet
      console.log('Checking Oisy wallet availability...');
      const oisyAvailable = isOisyAvailable();
      console.log('Oisy available:', oisyAvailable);
      
      if (oisyAvailable) {
        await this.autoConnectWallet();
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

  async autoConnectWallet() {
    try {
      console.log('Attempting auto-connect to Oisy wallet...');
      
      // Check if Oisy wallet is available and connected
      if (isOisyAvailable()) {
        console.log('Oisy wallet is available, creating wallet instance...');
        const oisyWallet = createOisyWallet();
        
        console.log('Checking connection status...');
        const isConnected = await oisyWallet.getConnectionStatus();
        console.log('Connection status:', isConnected);
        
        if (isConnected) {
          console.log('Wallet is connected, getting connection details...');
          const result = await oisyWallet.connect();
          console.log('Connection result:', result);
          
          if (result.success) {
            this.userPrincipal = result.principal;
            this.walletType = 'oisy';
            await this.loadUserData();
            console.log('Automatically connected to Oisy wallet');
            return;
          }
        } else {
          console.log('Wallet is not connected');
        }
      } else {
        console.log('Oisy wallet is not available');
      }
    } catch (error) {
      console.warn('Error occurred during automatic wallet connection:', error);
    }
  }

  async connectWallet() {
    this.loading = true;
    this.#render();
    
    try {
      const result = await this.connectOisyWallet();
      if (result.success) {
        this.userPrincipal = result.principal;
        this.walletType = 'oisy';
        await this.loadUserData();
        this.showMessage('Oisy wallet connection successful!', 'success');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Wallet connection failed:', error);
      this.showMessage('Wallet connection failed: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  async connectOisyWallet() {
    try {
      const oisyWallet = createOisyWallet();
      const result = await oisyWallet.connect();
      
      if (result.success) {
        return {
          success: true,
          principal: result.principal,
          name: 'Oisy'
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async disconnectWallet() {
    this.loading = true;
    this.#render();
    
    try {
      const oisyWallet = createOisyWallet();
      await oisyWallet.disconnect();
      
      this.userPrincipal = null;
      this.currentUser = null;
      this.walletType = null;
      this.showMessage('Wallet disconnected', 'info');
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      this.showMessage('Disconnection failed: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  async createUser() {
    try {
      this.loading = true;
      this.#render();
      
      await my_rust_dapp_backend.create_user();
      await this.loadUserData();
      this.showMessage('User created successfully!', 'success');
    } catch (error) {
      console.error('Failed to create user:', error);
      this.showMessage('User creation failed: ' + error.message, 'error');
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

  async deposit() {
    if (!this.depositAmount || this.depositAmount <= 0) {
      this.showMessage('Please enter a valid deposit amount', 'error');
      return;
    }

    try {
      this.loading = true;
      this.#render();
      
      // 将BTC转换为最小单位 (1 BTC = 1,000,000 最小单位)
      const amount = BigInt(Math.floor(parseFloat(this.depositAmount) * 1000000));
      await my_rust_dapp_backend.deposit(amount);
      await this.loadUserData();
      this.depositAmount = '';
      this.showMessage('Deposit successful!', 'success');
    } catch (error) {
      console.error('Deposit failed:', error);
      this.showMessage('Deposit failed: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  async getCanisterAddress() {
    if (!this.canisterAddress) {
      this.canisterAddress = await my_rust_dapp_backend.get_canister_address();
    }
    return this.canisterAddress;
  }

  async placeBet() {
    try {
      this.loading = true;
      this.#render();

      // 1. 获取 canister 地址
      const canisterAddress = await this.getCanisterAddress();
      const amount = 1_000_000n; // 1 BTC（最小单位）

      // 2. 用钱包转账
      const wallet = createOisyWallet();
      const transferResult = await wallet.transfer(canisterAddress, amount);

      if (!transferResult.success) {
        throw new Error(transferResult.error || "Wallet transfer failed");
      }

      // 3. 通知 canister 下注，传入交易 hash
      const txHash = `mock-tx-${Date.now()}`;
      await my_rust_dapp_backend.place_bet(txHash);

      this.showMessage('Bet placed successfully!', 'success');
      await this.loadUserData();
      await this.loadRoundData();
    } catch (error) {
      console.error('Bet placement failed:', error);
      this.showMessage('Bet placement failed: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  async triggerDraw() {
    try {
      this.loading = true;
      this.#render();
      
      await my_rust_dapp_backend.trigger_draw();
      await this.loadUserData();
      await this.loadRoundData();
      await this.loadSystemStats();
      this.showMessage('Draw triggered successfully!', 'success');
    } catch (error) {
      console.error('Draw trigger failed:', error);
      this.showMessage('Draw trigger failed: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  async loadUserData() {
    if (!this.userPrincipal) return;
    
    try {
      this.currentUser = await my_rust_dapp_backend.get_user(this.userPrincipal);
      
      // Also load wallet balance if connected
      if (this.walletType === 'oisy') {
        await this.loadWalletBalance();
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }

  async loadWalletBalance() {
    try {
      const wallet = createOisyWallet();
      const balanceResult = await wallet.getBalance();
      
      if (balanceResult.success) {
        this.walletBalance = balanceResult.balance;
        console.log('Wallet balance loaded:', this.walletBalance);
      } else {
        console.error('Failed to load wallet balance:', balanceResult.error);
      }
    } catch (error) {
      console.error('Error loading wallet balance:', error);
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
    this.#render();
    
    setTimeout(() => {
      this.message = '';
      this.#render();
    }, 5000);
  }

  formatBalance(balance) {
    // Convert BTC to minimum unit (1 BTC = 1,000,000 minimum units)
    const btcAmount = Number(balance) / 1_000_000;
    return btcAmount.toFixed(6);
  }

  formatTimestamp(timestamp) {
    const date = new Date(Number(timestamp) / 1000000);
    return date.toLocaleString();
  }

  getWalletName() {
    switch (this.walletType) {
      case 'oisy': return 'Oisy';
      default: return 'Unknown';
    }
  }

  startCountdown() {
    // Clear previous timer
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    
    // Update countdown
    this.updateCountdown();
    
    // Set timer to update every second
    this.countdownInterval = setInterval(() => {
      this.updateCountdown();
      this.#render();
    }, 1000);
  }

  updateCountdown() {
    if (!this.currentRound) return;
    
    const now = Date.now();
    const endTime = Number(this.currentRound.end_time) / 1000000; // Convert to milliseconds
    const timeLeft = Math.max(0, endTime - now);
    
    if (timeLeft <= 0) {
      // Round ended, reload data
      this.loadRoundData();
      this.loadSystemStats();
    } else {
      // Calculate remaining time
      const minutes = Math.floor(timeLeft / 60000);
      const seconds = Math.floor((timeLeft % 60000) / 1000);
      this.countdown = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  getRoundStatus() {
    if (!this.currentRound) return 'loading';
    
    const now = Date.now();
    const endTime = Number(this.currentRound.end_time) / 1000000;
    const timeLeft = endTime - now;
    
    if (timeLeft <= 0) {
      return 'ended';
    } else if (timeLeft <= 60000) { // Last 1 minute
      return 'ending-soon';
    } else {
      return 'active';
    }
  }

  #render() {
    render(html`
      <div class="app-container">
        <header class="header">
          <img src="${logo}" alt="DFINITY logo" class="logo" />
          <h1>Virtual BTC Lottery</h1>
        </header>

        ${this.message ? html`
          <div class="message ${this.messageType}">
            ${this.message}
          </div>
        ` : ''}

        <main class="main-content">
          ${!this.userPrincipal ? html`
            <div class="connect-section">
              <h2>Welcome to the Virtual BTC Lottery</h2>
              <p>Connect your wallet to start playing</p>
              
              <div class="wallet-connect">
                <h4>🚀 Ready to Play?</h4>
                <p>Click the button below to connect your wallet and start playing the lottery!</p>
                
                <div class="connect-button">
                  <button 
                    @click=${this.connectWallet.bind(this)} 
                    ?disabled=${this.loading}
                    class="btn btn-primary"
                  >
                    ${this.loading ? 'Connecting...' : 'Connect Wallet & Start Playing'}
                  </button>
                </div>
                
                <div class="wallet-info">
                  <h5>About Our Wallet:</h5>
                  <ul>
                    <li>🔐 Secure built-in wallet</li>
                    <li>✍️ No browser extension required</li>
                    <li>💰 Easy deposit and betting</li>
                    <li>🎨 Simple and intuitive</li>
                    <li>⚡ Fast and reliable</li>
                  </ul>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- Round information - displayed regardless of wallet connection -->
          ${this.currentRound ? html`
            <div class="round-section ${this.getRoundStatus()}">
              <h3>Current Round</h3>
              <div class="round-info">
                <div class="round-header">
                  <p><strong>Round ID:</strong> ${this.currentRound.id}</p>
                  <div class="countdown ${this.getRoundStatus()}">
                    <span class="countdown-label">Remaining Time:</span>
                    <span class="countdown-time">${this.countdown || '--:--'}</span>
                  </div>
                </div>
                <p><strong>Prize Pool:</strong> ${this.formatBalance(this.currentRound.prize_pool)} BTC</p>
                <p><strong>Participants:</strong> ${(this.currentRound.participants || []).length} people</p>
                <p><strong>Start Time:</strong> ${this.formatTimestamp(this.currentRound.start_time)}</p>
                <p><strong>End Time:</strong> ${this.formatTimestamp(this.currentRound.end_time)}</p>
                ${(this.currentRound.winners || []).length > 0 ? html`
                  <p><strong>Winner:</strong> ${this.currentRound.winners[0].toString()}</p>
                ` : ''}
                ${!this.userPrincipal ? html`
                  <div class="connect-prompt">
                    <p>💡 Connect your wallet to participate in the current round!</p>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}

          <!-- System statistics - displayed regardless of wallet connection -->
          ${this.systemStats ? html`
            <div class="stats-section">
              <h3>System Stats</h3>
              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-label">Total Rounds</span>
                  <span class="stat-value">${this.systemStats.total_rounds}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Total Bets</span>
                  <span class="stat-value">${this.systemStats.total_bets}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Total Winnings</span>
                  <span class="stat-value">${this.formatBalance(this.systemStats.total_winnings)} BTC</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Active Users</span>
                  <span class="stat-value">${this.systemStats.active_users}</span>
                </div>
              </div>
            </div>
          ` : ''}

          ${this.userPrincipal ? html`
            <div class="dashboard">
              <div class="wallet-info">
                <h3>Wallet Information</h3>
                <div class="wallet-details">
                  <p><strong>Wallet Type:</strong> ${this.getWalletName()}</p>
                  <p><strong>Principal ID:</strong> <span class="principal-id">${this.userPrincipal ? this.userPrincipal.toString() : '-'}</span></p>
                  ${this.walletBalance !== null ? html`
                    <p><strong>Wallet Balance:</strong> ${this.formatBalance(this.walletBalance)} BTC</p>
                  ` : ''}
                  <button 
                    @click=${this.disconnectWallet.bind(this)} 
                    ?disabled=${this.loading}
                    class="btn btn-outline"
                  >
                    ${this.loading ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </div>
              </div>

              <div class="user-section">
                <h3>User Information</h3>
                ${this.currentUser ? html`
                  <div class="user-info">
                    <p><strong>Balance:</strong> ${this.formatBalance(this.currentUser.balance)} BTC</p>
                    <p><strong>Transaction Count:</strong> ${(this.currentUser.transaction_history || []).length}</p>
                    <p><strong>Winning Count:</strong> ${(this.currentUser.winning_history || []).length}</p>
                  </div>
                ` : html`
                  <div class="user-info">
                    <p>User not created</p>
                    <button 
                      @click=${this.createUser.bind(this)} 
                      ?disabled=${this.loading}
                      class="btn btn-secondary"
                    >
                      ${this.loading ? 'Creating...' : 'Create User'}
                    </button>
                  </div>
                `}
              </div>

              ${this.currentUser ? html`
                <div class="actions-section">
                  <h3>Actions</h3>
                  <div class="action-group">
                    <div class="deposit-group">
                      <input 
                        type="number" 
                        placeholder="Deposit amount (BTC)" 
                        .value=${this.depositAmount}
                        @input=${(e) => this.depositAmount = e.target.value}
                        step="0.000001"
                        min="0"
                        class="input"
                      />
                      <button 
                        @click=${this.deposit.bind(this)} 
                        ?disabled=${this.loading || !this.depositAmount}
                        class="btn btn-primary"
                      >
                        ${this.loading ? 'Depositing...' : 'Deposit'}
                      </button>
                    </div>
                    
                    <button 
                      @click=${this.placeBet.bind(this)} 
                      ?disabled=${this.loading || !this.currentUser || this.currentUser.balance < 1000000n}
                      class="btn btn-success"
                    >
                      ${this.loading ? 'Betting...' : 'Place Bet (1 BTC)'}
                    </button>
                  </div>
                </div>
              ` : ''}

              ${this.isAdmin ? html`
                <div class="admin-section">
                  <h3>Admin Actions</h3>
                  <button 
                    @click=${this.triggerDraw.bind(this)} 
                    ?disabled=${this.loading}
                    class="btn btn-warning"
                  >
                    ${this.loading ? 'Drawing...' : 'Manual Draw'}
                  </button>
                </div>
              ` : html`
                <div class="admin-section">
                  <h3>Admin</h3>
                  <button 
                    @click=${this.initializeAuth.bind(this)} 
                    ?disabled=${this.loading}
                    class="btn btn-secondary"
                  >
                    ${this.loading ? 'Initializing...' : 'Initialize Admin Privileges'}
                  </button>
                </div>
              `}

              ${this.currentUser && (this.currentUser.transaction_history || []).length > 0 ? html`
                <div class="history-section">
                  <h3>Transaction History</h3>
                  <div class="history-list">
                    ${(this.currentUser.transaction_history || []).slice(-5).reverse().map(tx => html`
                      <div class="history-item">
                        <span class="tx-type">${tx.transaction_type}</span>
                        <span class="tx-amount">${this.formatBalance(tx.amount)} BTC</span>
                        <span class="tx-time">${this.formatTimestamp(tx.timestamp)}</span>
                      </div>
                    `)}
                  </div>
                </div>
              ` : ''}
            </div>
          ` : ''}
        </main>
      </div>
    `, document.getElementById('app'));
  }
}

export default App;

// Initialize the app when the module loads
new App();