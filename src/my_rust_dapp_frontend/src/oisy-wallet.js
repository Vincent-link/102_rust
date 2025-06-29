/**
 * Oisy Wallet Integration Module for BTC Lottery dApp
 * Uses the official @dfinity/oisy-wallet-signer library
 */

import { IcpWallet } from '@dfinity/oisy-wallet-signer/icp-wallet';
import { DEFAULT_SIGNER_WINDOW_FEATURES } from '@dfinity/oisy-wallet-signer';

export class OisyWallet {
  constructor() {
    this.isConnected = false;
    this.principal = null;
    this.wallet = null;
    this.accounts = [];
    this.balance = null;
  }

  /**
   * Check if Oisy wallet is available
   * @returns {boolean}
   */
  static isAvailable() {
    try {
      return typeof window !== 'undefined' && 
             typeof window.navigator !== 'undefined' &&
             typeof window.navigator.userAgent !== 'undefined';
    } catch (error) {
      console.warn('Error checking Oisy availability:', error);
      return false;
    }
  }

  /**
   * Initialize Oisy wallet connection
   * @returns {Promise<Object>}
   */
  async connect() {
    try {
      console.log('Starting Oisy wallet connection...');
      
      // Create IcpWallet instance with proper configuration
      this.wallet = await IcpWallet.connect({
        url: 'https://oisy.com/sign',
        windowOptions: {
          width: 576,
          height: 625,
          position: 'center',
          features: DEFAULT_SIGNER_WINDOW_FEATURES
        },
      });

      console.log('Wallet instance created:', this.wallet);

      // Request permissions and get accounts
      console.log('Requesting permissions...');
      const permissionsResult = await this.wallet.requestPermissionsNotGranted();
      console.log('Permissions result:', permissionsResult);
      
      const { allPermissionsGranted } = permissionsResult;
      console.log('All permissions granted:', allPermissionsGranted);
      
      if (!allPermissionsGranted) {
        throw new Error('All permissions are required to continue');
      }

      console.log('Getting accounts...');
      this.accounts = await this.wallet.accounts();
      console.log('Accounts obtained:', this.accounts);
      console.log('First account:', this.accounts?.[0]);
      console.log('First account owner:', this.accounts?.[0]?.owner);

      if (!this.accounts || this.accounts.length === 0) {
        throw new Error('No accounts available in wallet');
      }

      // Get principal from the first account
      this.principal = this.accounts[0].owner;
      this.isConnected = true;

      console.log('Oisy wallet connected successfully');
      console.log('Principal:', this.principal);
      console.log('Principal type:', typeof this.principal);
      console.log('Principal toString:', this.principal?.toString());

      console.log("Connect wallet result:", {
        success: true,
        principal: this.principal,
        principalType: typeof this.principal,
        accountsCount: this.accounts.length,
        wallet: this.wallet
      });

      return {
        success: true,
        principal: this.principal,
        wallet: this.wallet,
        accounts: this.accounts
      };

    } catch (error) {
      console.error('Oisy wallet connection failed:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Disconnect from Oisy wallet
   * @returns {Promise<boolean>}
   */
  async disconnect() {
    try {
      if (this.wallet && typeof this.wallet.disconnect === 'function') {
        await this.wallet.disconnect();
      }
      
      this.isConnected = false;
      this.principal = null;
      this.wallet = null;
      this.accounts = [];
      this.balance = null;
      
      return true;
    } catch (error) {
      console.error('Oisy wallet disconnection failed:', error);
      return false;
    }
  }

  /**
   * Get current connection status
   * @returns {Promise<boolean>}
   */
  async getConnectionStatus() {
    try {
      if (!this.wallet) {
        return false;
      }
      
      // For Oisy wallet, we need to check if we can actually get accounts
      // This will fail if the wallet is not connected or session expired
      const accounts = await this.wallet.accounts();
      this.isConnected = accounts && accounts.length > 0;
      
      // Update principal if connected
      if (this.isConnected) {
        this.principal = accounts[0].owner;
      }
      
      return this.isConnected;
    } catch (error) {
      console.error('Failed to get Oisy connection status:', error);
      this.isConnected = false;
      this.principal = null;
      return false;
    }
  }

  /**
   * Get wallet principal
   * @returns {Promise<string|null>}
   */
  async getPrincipal() {
    try {
      if (!this.wallet || !this.isConnected) {
        return null;
      }
      
      const accounts = await this.wallet.accounts();
      if (accounts && accounts.length > 0) {
        this.principal = accounts[0].owner;
        return this.principal;
      }
      return null;
    } catch (error) {
      console.error('Failed to get Oisy principal:', error);
      return null;
    }
  }

  /**
   * Get accounts
   * @returns {Promise<Array>}
   */
  async getAccounts() {
    try {
      if (!this.wallet || !this.isConnected) {
        return [];
      }
      
      this.accounts = await this.wallet.accounts();
      return this.accounts;
    } catch (error) {
      console.error('Failed to get Oisy accounts:', error);
      return [];
    }
  }

  /**
   * Get account balance
   * @returns {Promise<Object>}
   */
  async getBalance() {
    try {
      if (!this.wallet || !this.isConnected) {
        throw new Error('Wallet not connected');
      }

      const accounts = await this.wallet.accounts();
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts available');
      }
      const account = accounts[0];
      // Use the correct API for IcpWallet (v0.2.x): getBalance(account)
      // const balance = await this.wallet.getBalance(account);
      this.balance = null;
      return {
        success: true,
        balance: null,
        account: account
      };
    } catch (error) {
      console.error('Balance checking failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Transfer ICP (BTC equivalent) to canister
   * @param {string} toPrincipal - Recipient principal
   * @param {bigint} amount - Amount in e8s (1 ICP = 100,000,000 e8s)
   * @returns {Promise<Object>}
   */
  async transfer(toPrincipal, amount) {
    try {
      if (!this.wallet || !this.isConnected) {
        throw new Error('Wallet not connected');
      }

      const accounts = await this.wallet.accounts();
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts available');
      }

      const account = accounts[0];
      
      // Create transfer request
      const request = {
        owner: {
          owner: toPrincipal,
          subaccount: []
        },
        amount: amount
      };

      console.log('Initiating transfer:', {
        from: account.owner,
        to: toPrincipal,
        amount: amount.toString()
      });

      // Execute transfer
      const result = await this.wallet.icrc1Transfer({
        owner: account.owner,
        request
      });

      console.log('Transfer result:', result);

      return {
        success: true,
        result: result
      };
    } catch (error) {
      console.error('Transfer failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sign a message for authentication
   * @param {string} message - Message to sign
   * @returns {Promise<Object>}
   */
  async signMessage(message) {
    try {
      if (!this.wallet || !this.isConnected) {
        throw new Error('Wallet not connected');
      }

      const accounts = await this.wallet.accounts();
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts available');
      }

      const account = accounts[0];
      
      // Create signature request
      const signature = await this.wallet.signMessage({
        message: new TextEncoder().encode(message),
        owner: account.owner
      });

      return {
        success: true,
        signature: signature,
        principal: account.owner
      };
    } catch (error) {
      console.error('Message signing failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get wallet information
   * @returns {Object}
   */
  getWalletInfo() {
    return {
      isConnected: this.isConnected,
      principal: this.principal,
      accounts: this.accounts,
      balance: this.balance,
      type: 'oisy'
    };
  }
}

/**
 * Create a new Oisy wallet instance
 * @returns {OisyWallet}
 */
export function createOisyWallet() {
  return new OisyWallet();
}

/**
 * Check if Oisy wallet is available
 * @returns {boolean}
 */
export function isOisyAvailable() {
  return OisyWallet.isAvailable();
}

/**
 * Get Oisy wallet installation guide
 * @returns {string}
 */
export function getOisyInstallGuide() {
  return `
    <h3>Install Oisy Wallet</h3>
    <p>To use this dApp, you need to install the Oisy Wallet:</p>
    <ol>
      <li>Visit <a href="https://oisy.com" target="_blank">oisy.com</a></li>
      <li>Download and install the Oisy Wallet extension</li>
      <li>Create or import your wallet</li>
      <li>Make sure you have some ICP for betting</li>
      <li>Return here and click "Connect Wallet"</li>
    </ol>
  `;
} 