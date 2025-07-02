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
    this.ckbtcAmount = ''; // For ckBTC deposit amount
    this.loading = false;
    this.message = '';
    this.messageType = 'info'; // 'info', 'success', 'error'
    this.identityProvider = null; // 'internet-identity'
    this.countdown = null; // Countdown
    this.countdownInterval = null; // Countdown timer
    this.ckbtcBalanceInterval = null; // ckBTC balance check interval
    this.canisterAddress = null;

    this.ckbtcBalance = 0; // User's ckBTC balance
    this.ckbtcDeposits = []; // User's ckBTC deposits
    this.pageState = 'connect'; // 'connect', 'dashboard', 'loading'
    this.lastCountdown = null; // Store the last countdown value
    this.renderScheduled = false; // Prevent multiple render calls
    this.txHash = ''; // For recording ckBTC deposits
    
    // Render immediately, then initialize asynchronously
    this.#render();
    this.init();
  }

  // Getter for connection status
  get isConnected() {
    return this.userPrincipal && this.userPrincipal !== '2vxsx-fae';
  }

  async init() {
    try {
      console.log('Initializing app...');
      
      // Check if user is already connected
      const status = await identityCkBtcManager.getConnectionStatus();
      if (status.isConnected) {
        console.log('User already connected, restoring session...');
        console.log("init principal:",status.principal);
        this.userPrincipal = status.principal;
        this.identityProvider = status.provider;
        

        
        this.pageState = 'dashboard';
        
        // Load user data
        await this.loadUserData();
        
        // await this.loadCkBtcData();
        
        // Start ckBTC balance monitoring
        this.startCkBtcBalanceMonitoring();
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
        
        // Load ckBTC data to restore address and balance
        await this.loadCkBtcData();
        
        // Start ckBTC balance monitoring
        this.startCkBtcBalanceMonitoring();
        
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
      await my_rust_dapp_backend.create_user(this.userPrincipal);
      console.log('User created successfully');
      
      // Verify user was created by trying to get user data
      const principalObj = Principal.fromText(this.userPrincipal);
      const user = await my_rust_dapp_backend.get_user(principalObj);
      if (user) {
        console.log('User verification successful:', user);
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
      
      // Stop ckBTC balance monitoring
      this.stopCkBtcBalanceMonitoring();
      
      this.userPrincipal = null;
      this.currentUser = null;
      this.identityProvider = null;

      this.ckbtcBalance = 0;
      this.ckbtcDeposits = [];
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

  async deposit() {
    if (!this.depositAmount || this.depositAmount <= 0) {
      this.showMessage('Please enter a valid deposit amount', 'error');
      return;
    }

    try {
      this.loading = true;
      this.#render();
      
      // Convert to number and ensure it's valid
      const amount = parseFloat(this.depositAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Invalid deposit amount');
      }
      
      await my_rust_dapp_backend.deposit(amount);
      
      await this.loadUserData();
      this.depositAmount = '';
      this.showMessage('Deposit successful!', 'success');
    } catch (error) {
      console.error('Failed to deposit:', error);
      this.showMessage('Deposit failed: ' + error.message, 'error');
    } finally {
      this.loading = false;
      this.#render();
    }
  }

  async getCanisterAddress() {
    try {
      this.canisterAddress = await my_rust_dapp_backend.get_canister_address();
      return this.canisterAddress;
    } catch (error) {
      console.error('Failed to get canister address:', error);
      throw error;
    }
  }

  async placeBet() {
    try {
      // Check if user has sufficient balance
      if (!this.currentUser) {
        this.showMessage('Please wait for user data to load', 'error');
        return;
      }

      console.log('currentUser:', this.currentUser);

      
      this.loading = true;
      this.#render();
      
      // Generate a unique transaction hash for this bet
      const txHash = `bet_${this.userPrincipal}_${Date.now()}`;
      
      console.log('Placing bet with tx_hash:', txHash);
      await my_rust_dapp_backend.place_bet(this.userPrincipal, txHash);
      
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
      if (this.userPrincipal && this.userPrincipal !== '2vxsx-fae') {
        const principalObj = Principal.fromText(this.userPrincipal);
        this.currentUser = await my_rust_dapp_backend.get_user(principalObj);
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }

  async loadCkBtcData() {
    try {
      console.log('loadCkBtcData called, userPrincipal:', this.userPrincipal);
      if (this.userPrincipal && this.userPrincipal !== '2vxsx-fae') {
        // Load ckBTC balance
        try {
          console.log('Attempting to load ckBTC balance...');
          this.ckbtcBalance = await identityCkBtcManager.getUserCkBtcBalance();
          console.log('CkBTC balance loaded:', this.ckbtcBalance);
        } catch (error) {
          console.error('Failed to load ckBTC balance:', error);
          this.ckbtcBalance = 0;
        }
        
        // Load ckBTC deposits
        try {
          console.log('Attempting to load ckBTC deposits...');
          this.ckbtcDeposits = await identityCkBtcManager.getUserCkBtcDeposits();
          console.log('CkBTC deposits loaded:', this.ckbtcDeposits.length);
        } catch (error) {
          console.error('Failed to load ckBTC deposits:', error);
          this.ckbtcDeposits = [];
        }
      } else {
        console.log('User not connected or anonymous principal, skipping ckBTC data load');
      }
    } catch (error) {
      console.error('Failed to load ckBTC data:', error);
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
    // Convert BigInt balance to number for calculation
    const balanceNumber = typeof balance === 'bigint' ? Number(balance) : Number(balance);
    return (balanceNumber / 100_000_000).toFixed(8) + ' ckBTC';
  }

  formatTimestamp(timestamp) {
    // Convert BigInt timestamp to number for Date constructor
    const timestampNumber = typeof timestamp === 'bigint' ? Number(timestamp) : Number(timestamp);
    return new Date(timestampNumber / 1_000_000).toLocaleString();
  }

  getProviderName(provider) {
    if (provider === 'internet-identity') {
      return 'Internet Identity';
    } else if (provider === 'local-dev') {
      return 'Local Development Identity';
    }
    return provider || 'Unknown';
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
      this.countdown = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
    if (this.ckbtcBalanceInterval) {
      clearInterval(this.ckbtcBalanceInterval);
    }
  }

  // Start ckBTC balance monitoring
  startCkBtcBalanceMonitoring() {
    if (this.ckbtcBalanceInterval) {
      clearInterval(this.ckbtcBalanceInterval);
    }
    
    // Check balance every 30 seconds
    this.ckbtcBalanceInterval = setInterval(async () => {
      if (this.isConnected) {
        try {
          const newBalance = await identityCkBtcManager.getUserCkBtcBalance();
          if (newBalance !== this.ckbtcBalance) {
            console.log('CkBTC balance changed:', this.ckbtcBalance, '->', newBalance);
            this.ckbtcBalance = newBalance;
            this.#render();
          }
        } catch (error) {
          console.error('Failed to check ckBTC balance:', error);
        }
      }
    }, 30000); // 30 seconds
  }

  // Stop ckBTC balance monitoring
  stopCkBtcBalanceMonitoring() {
    if (this.ckbtcBalanceInterval) {
      clearInterval(this.ckbtcBalanceInterval);
      this.ckbtcBalanceInterval = null;
    }
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
              ` : html`
                <div class="user-info-header">
                  <span class="principal-id">${this.userPrincipal ? this.userPrincipal.toString() : ''}</span>
                  <button class="btn btn-logout" @click=${this.disconnectIdentity.bind(this)}>
                    Logout
                  </button>
                </div>
              `}
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

                    <p><strong>CkBTC Balance:</strong> <span style="color: #38a169; font-weight: bold;">${this.formatBalance(this.ckbtcBalance)}</span></p>
                    <p><strong>Debug Info:</strong> <span style="font-size: 0.8rem; color: #666;">Balance: ${this.ckbtcBalance}</span></p>
                    
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
                  

                  <div class="ckbtc-history-personal">
                    <h3>Deposit History</h3>
                    ${this.ckbtcDeposits && this.ckbtcDeposits.length > 0 ? html`
                      <div class="deposit-list-personal">
                        ${this.ckbtcDeposits.slice(-10).reverse().map(deposit => html`
                          <div class="deposit-item-personal ${deposit.status}">
                            <div class="deposit-info-personal">
                              <span class="deposit-amount">${identityCkBtcManager.formatCkBtcAmount(deposit.amount)} BTC</span>
                              <span class="deposit-status ${deposit.status}">${deposit.status}</span>
                            </div>
                            <div class="deposit-details-personal">
                              <span class="deposit-hash">${deposit.tx_hash.substring(0, 16)}...</span>
                              <span class="deposit-time">${this.formatTimestamp(deposit.timestamp)}</span>
                            </div>
                          </div>
                        `)}
                      </div>
                    ` : html`<p>No deposit history yet.</p>`}
                  </div>
                  <div class="bet-history-personal">
                    <h3>Bet History</h3>
                    ${this.currentUser && this.currentUser.transaction_history && this.currentUser.transaction_history.length > 0
                      ? html`
                        <div class="bet-list-personal">
                          ${this.currentUser.transaction_history
                            .filter(tx => tx.transaction_type === "Bet")
                            .slice(-10).reverse().map(bet => html`
                              <div class="bet-item-personal">
                                <div class="bet-info-personal">
                                  <span class="bet-amount">${identityCkBtcManager.formatCkBtcAmount(bet.amount)} BTC</span>
                                  <span class="bet-time">${this.formatTimestamp(bet.timestamp)}</span>
                                  ${bet.tx_hash ? html`<span class="bet-hash">${bet.tx_hash.substring(0, 16)}...</span>` : ''}
                                </div>
                              </div>
                          `)}
                        </div>
                      `
                      : html`<p>No bet history yet.</p>`
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
                    <p><strong>Prize Pool:</strong> ${this.formatBalance(this.currentRound.prize_pool)} BTC</p>
                    <p><strong>Participants:</strong> ${(this.currentRound.participants || []).length} people</p>
                    <p><strong>Start Time:</strong> ${this.formatTimestamp(this.currentRound.start_time)}</p>
                    <p><strong>End Time:</strong> ${this.formatTimestamp(this.currentRound.end_time)}</p>
                    <div class="countdown">
                      <span class="countdown-label">Remaining Time:</span>
                      <span class="countdown-time">${this.countdown || '--:--'}</span>
                    </div>
                    ${(this.currentRound.winners || []).length > 0 ? html`
                      <p><strong>Winner:</strong> ${this.currentRound.winners[0].toString()}</p>
                    ` : ''}
                    
                    ${this.isConnected ? html`
                      <div class="round-actions">
                        <button 
                          class="btn btn-primary" 
                          @click=${this.placeBet.bind(this)}
                          ?disabled=${this.loading}
                          style="width: 100%; margin-bottom: 1rem;"
                        >
                          ${this.loading ? 'Placing Bet...' : 'Place Bet (0.001 ckBTC)'}
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

// Initialize the app when the module loads
new App();