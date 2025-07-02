// Internet Identity and ckBTC Integration for Virtual BTC Lottery
// This module handles Internet Identity authentication and ckBTC address generation

import { AuthClient } from '@dfinity/auth-client';
import { my_rust_dapp_backend } from 'declarations/my_rust_dapp_backend';
import { Principal } from '@dfinity/principal';

class IdentityCkBtcManager {
  constructor() {
    this.authClient = null;
    this.identity = null;
    this.principal = null;
    this.isConnected = false;
    this.provider = null;
  }

  // Initialize AuthClient
  async initializeAuthClient() {
    try {
      if (!this.authClient) {
        this.authClient = await AuthClient.create();
        console.log('AuthClient initialized');
      }
      return this.authClient;
    } catch (error) {
      console.error('Failed to initialize AuthClient:', error);
      throw error;
    }
  }

  // Check if Internet Identity is available
  isIdentityAvailable() {
    return typeof window !== 'undefined';
  }

  // Simplified authentication for local development
  async connectWithLocalIdentity() {
    try {
      console.log('Using simplified local identity authentication...');
      
      // Generate a unique local principal for testing
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const mockPrincipal = `local-dev-${timestamp}-${randomId}`;
      
      this.principal = mockPrincipal;
      this.isConnected = true;
      this.provider = 'local-dev';
      
      console.log('Connected with local identity:', this.principal);
      
      return {
        success: true,
        principal: this.principal,
        provider: this.provider
      };
    } catch (error) {
      console.error('Local identity connection failed:', error);
      throw error;
    }
  }

  // Connect using Internet Identity
  async connectWithIdentity() {
    try {
      if (!this.isIdentityAvailable()) {
        throw new Error('Browser environment not available');
      }

      // 检查是否在本地开发环境
      const isLocalDevelopment = window.location.hostname === 'localhost' || 
                                window.location.hostname === '127.0.0.1' ||
                                window.location.hostname.includes('dfx');
      
      if (isLocalDevelopment) {
        console.log('Local development environment detected, using local identity');
        return await this.connectWithLocalIdentity();
      }

      // 主网环境使用真实 Internet Identity
      console.log('Mainnet environment detected, using Internet Identity');
      
      // 确保 AuthClient 已初始化
      if (!this.authClient) {
        this.authClient = await AuthClient.create();
        console.log('AuthClient created for mainnet');
      }
      
      // 检查是否已经认证
      if (this.authClient.isAuthenticated()) {
        console.log('Already authenticated with Internet Identity');
        this.identity = this.authClient.getIdentity();
        this.principal = this.identity.getPrincipal().toText();
        
        // 检查是否是匿名身份
        if (this.principal === '2vxsx-fae') {
          console.log('Detected anonymous identity, starting fresh authentication');
          // 如果检测到匿名身份，清除认证状态并重新认证
          await this.authClient.logout();
          // 继续执行下面的认证流程
        } else {
          this.isConnected = true;
          this.provider = 'internet-identity';
          console.log('Connected with existing Internet Identity:', this.principal);
          return { success: true, principal: this.principal, provider: this.provider };
        }
      }

      // 需要重新认证
      console.log('Starting Internet Identity authentication...');
      await new Promise((resolve, reject) => {
        this.authClient.login({
          identityProvider: 'https://identity.ic0.app/',
          onSuccess: resolve,
          onError: reject
        });
      });
      
      this.identity = this.authClient.getIdentity();
      this.principal = this.identity.getPrincipal().toText();
      
      // 再次检查是否是匿名身份
      if (this.principal === '2vxsx-fae') {
        throw new Error('Authentication failed - anonymous identity detected');
      }
      
      this.isConnected = true;
      this.provider = 'internet-identity';
      console.log('Connected with real Internet Identity:', this.principal);
      return { success: true, principal: this.principal, provider: this.provider };
    } catch (error) {
      console.error('Identity connection failed:', error);
      throw error;
    }
  }

  // Connect with Internet Identity using AuthClient
  async connectWithInternetIdentity() {
    try {
      const authClient = await this.initializeAuthClient();
      
      if (authClient.isAuthenticated()) {
        // Already authenticated
        this.identity = authClient.getIdentity();
        const principal = this.identity.getPrincipal();
        
        // Check if principal is valid (not anonymous)
        if (principal.toText() === '2vxsx-fae') {
          throw new Error('Anonymous principal detected. Please authenticate properly.');
        }
        
        this.principal = principal.toText();
        this.isConnected = true;
        this.provider = 'internet-identity';
        
        console.log('Already authenticated with Internet Identity:', this.principal);
        
        return {
          success: true,
          principal: this.principal,
          provider: this.provider
        };
      }

      // Need to authenticate
      return new Promise((resolve, reject) => {
        authClient.login({
          identityProvider: 'https://identity.ic0.app/',
          onSuccess: async () => {
            try {
              this.identity = authClient.getIdentity();
              const principal = this.identity.getPrincipal();
              
              // Check if principal is valid (not anonymous)
              if (principal.toText() === '2vxsx-fae') {
                throw new Error('Anonymous principal detected. Please authenticate properly.');
              }
              
              this.principal = principal.toText();
              this.isConnected = true;
              this.provider = 'internet-identity';
              
              console.log('Connected with Internet Identity:', this.principal);
              
              resolve({
                success: true,
                principal: this.principal,
                provider: this.provider
              });
            } catch (error) {
              reject(error);
            }
          },
          onError: (error) => {
            console.error('Authentication failed:', error);
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error('Internet Identity connection failed:', error);
      throw error;
    }
  }

  // Disconnect from identity
  async disconnect() {
    try {
      if (this.authClient) {
        await this.authClient.logout();
      }
      
      this.authClient = null;
      this.identity = null;
      this.principal = null;
      this.isConnected = false;
      this.provider = null;
      
      console.log('Disconnected from identity');
      
      return { success: true };
    } catch (error) {
      console.error('Disconnect failed:', error);
      throw error;
    }
  }



  // Record a ckBTC deposit
  async recordCkBtcDeposit(txHash, amount) {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to identity');
      }
      if (!this.principal || this.principal === '2vxsx-fae') {
        throw new Error('Invalid principal');
      }
      console.log('Recording ckBTC deposit:', { txHash, amount });
      await my_rust_dapp_backend.record_ckbtc_deposit(txHash, amount);
      console.log('CkBTC deposit recorded successfully');
      return { success: true };
    } catch (error) {
      console.error('Failed to record ckBTC deposit:', error);
      throw error;
    }
  }

  // Get user's ckBTC deposits
  async getUserCkBtcDeposits() {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to identity');
      }
      if (!this.principal || this.principal === '2vxsx-fae') {
        throw new Error('Invalid principal');
      }
      const principalObj = Principal.fromText(this.principal);
      const deposits = await my_rust_dapp_backend.get_user_ckbtc_deposits(principalObj);
      return deposits;
    } catch (error) {
      console.error('Failed to get ckBTC deposits:', error);
      throw error;
    }
  }

  // Get user's ckBTC balance
  async getUserCkBtcBalance() {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to identity');
      }
      if (!this.principal || this.principal === '2vxsx-fae') {
        throw new Error('Invalid principal');
      }
      const principalObj = Principal.fromText(this.principal);
      const balanceNat = await my_rust_dapp_backend.get_user_ckbtc_balance(principalObj);
      
      // Convert Nat to number (u64)
      // The Nat type from candid has a .toString() method and can be converted to BigInt
      const balance = typeof balanceNat === 'object' && balanceNat.toString ? 
        BigInt(balanceNat.toString()) : 
        BigInt(balanceNat || 0);
      
      return Number(balance);
    } catch (error) {
      console.error('Failed to get ckBTC balance:', error);
      throw error;
    }
  }

  // Check for new ckBTC deposits
  async checkCkBtcDeposits() {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to identity');
      }
      
      console.log('Checking for new ckBTC deposits...');
      await my_rust_dapp_backend.check_ckbtc_deposits();
      
      console.log('CkBTC deposits check completed');
      return { success: true };
    } catch (error) {
      console.error('Failed to check ckBTC deposits:', error);
      throw error;
    }
  }



  // Get ckBTC canister ID
  async getCkBtcCanisterId() {
    try {
      const canisterId = await my_rust_dapp_backend.get_ckbtc_canister_id();
      return canisterId;
    } catch (error) {
      console.error('Failed to get ckBTC canister ID:', error);
      throw error;
    }
  }

  // Get connection status
  async getConnectionStatus() {
    try {
      console.log('Checking connection status...');
      console.log('Current state:', {
        isConnected: this.isConnected,
        principal: this.principal,
        provider: this.provider
      });
      
      // Check if we already have a valid connection
      if (this.isConnected && this.principal && this.principal !== '2vxsx-fae') {
        console.log('Already connected with valid principal');
        return {
          isConnected: true,
          principal: this.principal,
          provider: this.provider
        };
      }
      
      // 检查是否在本地开发环境
      const isLocalDevelopment = window.location.hostname === 'localhost' || 
                                window.location.hostname === '127.0.0.1' ||
                                window.location.hostname.includes('dfx');
      
      if (isLocalDevelopment) {
        console.log('Local development environment - no persistent connection to restore');
        return {
          isConnected: false,
          principal: null,
          provider: null
        };
      }
      
      // 主网环境：检查 AuthClient 状态
      console.log('Mainnet environment - checking AuthClient status');
      
      // Check if AuthClient is already authenticated
      if (!this.authClient) {
        this.authClient = await AuthClient.create();
      }
      
      if (this.authClient.isAuthenticated()) {
        const identity = this.authClient.getIdentity();
        const principal = identity.getPrincipal();
        console.log('AuthClient principal:', principal.toText());
        
        // Check if principal is valid (not anonymous)
        if (principal.toText() !== '2vxsx-fae') {
          // Restore connection state from AuthClient
          this.identity = identity;
          this.principal = principal.toText();
          this.isConnected = true;
          this.provider = 'internet-identity';
          
          console.log('Restored connection state from AuthClient:', this.principal);
          return {
            isConnected: true,
            principal: this.principal,
            provider: this.provider
          };
        } else {
          console.log('AuthClient has anonymous principal');
        }
      } else {
        console.log('AuthClient not authenticated');
      }
      
      console.log('No valid connection found');
      return {
        isConnected: false,
        principal: null,
        provider: null
      };
    } catch (error) {
      console.error('Failed to get connection status:', error);
      return {
        isConnected: false,
        principal: null,
        provider: null
      };
    }
  }

  // Get current provider name
  getCurrentProvider() {
    return this.provider;
  }

  // Format ckBTC amount (from e8s to BTC)
  formatCkBtcAmount(amount) {
    return (amount / 100_000_000).toFixed(8);
  }

  // Parse ckBTC amount (from BTC to e8s)
  parseCkBtcAmount(btcAmount) {
    const amount = parseFloat(btcAmount);
    if (isNaN(amount) || amount < 0) {
      throw new Error('Invalid BTC amount');
    }
    return Math.floor(amount * 100_000_000);
  }

  // Get installation guide for Internet Identity
  getInstallationGuide() {
    return {
      'internet-identity': {
        name: 'Internet Identity',
        description: 'Official Internet Computer identity provider',
        url: 'https://identity.ic0.app/',
        instructions: 'Visit the Internet Identity website and create an identity'
      }
    };
  }
}

// Create and export a singleton instance
const identityCkBtcManager = new IdentityCkBtcManager();

export default identityCkBtcManager;
export { IdentityCkBtcManager };