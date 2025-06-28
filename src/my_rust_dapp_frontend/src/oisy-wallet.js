/**
 * Oisy Wallet Integration Module
 * Provides integration with the official @dfinity/oisy-wallet-signer library
 */

import { IcrcWallet } from '@dfinity/oisy-wallet-signer/icrc-wallet';

export class OisyWallet {
  constructor() {
    this.isConnected = false;
    this.principal = null;
    this.wallet = null;
    this.accounts = [];
  }

  /**
   * Check if Oisy wallet is available
   * @returns {boolean}
   */
  static isAvailable() {
    try {
      // Check if the browser supports the required APIs
      return typeof window !== 'undefined' && 
             typeof window.navigator !== 'undefined' &&
             typeof window.navigator.userAgent !== 'undefined';
    } catch (error) {
      console.warn('Error checking Oisy availability:', error);
      return false;
    }
  }

  /**
   * Get Oisy wallet instance
   * @returns {Object|null}
   */
  static getWallet() {
    try {
      return new IcrcWallet();
    } catch (error) {
      console.warn('Error getting Oisy wallet:', error);
      return null;
    }
  }

  /**
   * Initialize Oisy wallet connection
   * @returns {Promise<Object>}
   */
  async connect() {
    try {
      console.log('Starting Oisy wallet connection...');
      
      // Create IcrcWallet instance
      this.wallet = new IcrcWallet();
      console.log('Wallet instance created:', this.wallet);

      // Check if wallet is already connected
      const isConnected = await this.wallet.isConnected();
      console.log('Initial connection status:', isConnected);

      if (!isConnected) {
        // Request connection
        console.log('Requesting wallet connection...');
        await this.wallet.requestConnect();
        
        // Check connection status again
        this.isConnected = await this.wallet.isConnected();
        console.log('Connection status after request:', this.isConnected);
        
        if (!this.isConnected) {
          throw new Error('Failed to connect to Oisy wallet');
        }
      } else {
        this.isConnected = true;
      }

      // Get principal
      this.principal = await this.wallet.getPrincipal();
      console.log('Principal obtained:', this.principal);

      // Get accounts
      this.accounts = await this.wallet.getAccounts();
      console.log('Accounts obtained:', this.accounts);

      if (!this.principal) {
        throw new Error('Failed to get wallet principal');
      }

      console.log('Oisy wallet connected successfully');
      
      return {
        success: true,
        principal: this.principal,
        wallet: this.wallet,
        accounts: this.accounts
      };
    } catch (error) {
      console.error('Oisy wallet connection failed:', error);
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
      
      this.isConnected = await this.wallet.isConnected();
      return this.isConnected;
    } catch (error) {
      console.error('Failed to get Oisy connection status:', error);
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
      
      this.principal = await this.wallet.getPrincipal();
      return this.principal;
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
      
      this.accounts = await this.wallet.getAccounts();
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

      const balance = await this.wallet.getBalance();
      return {
        success: true,
        balance
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
   * Transfer tokens
   * @param {string} to - Recipient address
   * @param {bigint} amount - Amount to transfer
   * @returns {Promise<Object>}
   */
  async transfer(to, amount) {
    try {
      if (!this.wallet || !this.isConnected) {
        throw new Error('Wallet not connected');
      }

      console.log(`Transferring ${amount} to ${to}...`);
      
      const result = await this.wallet.transfer({
        to,
        amount,
        fee: 10000n // Default fee
      });

      console.log('Transfer result:', result);

      return {
        success: true,
        result,
        txHash: result.blockHeight?.toString() || `tx-${Date.now()}`
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
   * Sign a message
   * @param {string} message - Message to sign
   * @returns {Promise<Object>}
   */
  async signMessage(message) {
    try {
      if (!this.wallet || !this.isConnected) {
        throw new Error('Wallet not connected');
      }

      if (typeof this.wallet.signMessage !== 'function') {
        throw new Error('Message signing not supported by this wallet');
      }

      const signature = await this.wallet.signMessage(message);
      return {
        success: true,
        signature,
        message
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
      name: 'Oisy Wallet',
      isConnected: this.isConnected,
      principal: this.principal,
      hasWallet: !!this.wallet,
      type: 'oisy',
      accounts: this.accounts
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
  return 'Oisy wallet is a modern wallet for Internet Computer. Please visit https://oisy.com to learn more.';
} 