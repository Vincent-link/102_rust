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
    this.debugMode = false; // Add debug mode flag
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
      
      // For local development, use a simple but valid principal
      // Create a unique principal based on current time and random data
      const timestamp = Date.now();
      const randomBytes = new Uint8Array(29);
      
      // Fill first 8 bytes with timestamp
      const timestampBigInt = BigInt(timestamp);
      const timestampBytes = new Uint8Array(new BigInt64Array([timestampBigInt]).buffer);
      randomBytes.set(timestampBytes.slice(0, 8), 0);
      
      // Fill remaining bytes with deterministic but unique data
      for (let i = 8; i < 29; i++) {
        randomBytes[i] = (timestamp + i * 7) % 256; // Use prime number for better distribution
      }
      
      // Ensure it's not the anonymous principal (which starts with all zeros)
      if (randomBytes[0] === 0 && randomBytes[1] === 0 && randomBytes[2] === 0 && randomBytes[3] === 0) {
        randomBytes[0] = 1; // Make it non-anonymous
      }
      
      const localPrincipal = Principal.fromUint8Array(randomBytes);
      
      this.principal = localPrincipal.toText();
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
      
      // 检查移动端兼容性
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      
      if (isMobile && isSafari) {
        console.log('Mobile Safari detected, using enhanced authentication flow');
        return await this.connectWithMobileSafari();
      }
      
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
          
          // 保存会话状态到 localStorage
          localStorage.setItem('ic_principal', this.principal);
          localStorage.setItem('ic_provider', this.provider);
          console.log('Saved session state to localStorage for existing connection:', this.principal);
          
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
      
      // 保存会话状态到 localStorage（适用于所有环境）
      localStorage.setItem('ic_principal', this.principal);
      localStorage.setItem('ic_provider', this.provider);
      console.log('Saved session state to localStorage:', this.principal);
      
      return { success: true, principal: this.principal, provider: this.provider };
    } catch (error) {
      console.error('Identity connection failed:', error);
      throw error;
    }
  }

  // 专门处理移动端 Safari 的登录
  async connectWithMobileSafari() {
    try {
      console.log('Using Mobile Safari optimized authentication...');
      
      // 确保 AuthClient 已初始化
      if (!this.authClient) {
        this.authClient = await AuthClient.create();
        console.log('AuthClient created for Mobile Safari');
      }
      
      // 检查是否已经认证
      if (this.authClient.isAuthenticated()) {
        console.log('Already authenticated in Mobile Safari');
        this.identity = this.authClient.getIdentity();
        this.principal = this.identity.getPrincipal().toText();
        
        if (this.principal === '2vxsx-fae') {
          console.log('Detected anonymous identity in Mobile Safari, starting fresh authentication');
          await this.authClient.logout();
        } else {
          this.isConnected = true;
          this.provider = 'internet-identity';
          console.log('Connected with existing Internet Identity in Mobile Safari:', this.principal);
          
          // 保存会话状态到 localStorage
          localStorage.setItem('ic_principal', this.principal);
          localStorage.setItem('ic_provider', this.provider);
          console.log('Saved session state to localStorage for existing Mobile Safari connection:', this.principal);
          
          return { success: true, principal: this.principal, provider: this.provider };
        }
      }

      // Mobile Safari 特殊处理
      console.log('Starting Mobile Safari authentication...');
      
      // 使用更兼容的登录方式
      await new Promise((resolve, reject) => {
        const loginOptions = {
          identityProvider: 'https://identity.ic0.app/',
          onSuccess: () => {
            console.log('Mobile Safari authentication successful');
            resolve();
          },
          onError: (error) => {
            console.error('Mobile Safari authentication failed:', error);
            reject(new Error('Mobile Safari authentication failed. Please try again or use a different browser.'));
          }
        };
        
        // 添加超时处理
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timeout. Please check if the popup was blocked.'));
        }, 30000); // 30秒超时
        
        this.authClient.login(loginOptions);
        
        // 监听成功回调，清除超时
        const originalOnSuccess = loginOptions.onSuccess;
        loginOptions.onSuccess = () => {
          clearTimeout(timeout);
          originalOnSuccess();
        };
      });
      
      this.identity = this.authClient.getIdentity();
      this.principal = this.identity.getPrincipal().toText();
      
      if (this.principal === '2vxsx-fae') {
        throw new Error('Authentication failed - anonymous identity detected in Mobile Safari');
      }
      
      this.isConnected = true;
      this.provider = 'internet-identity';
      console.log('Connected with Internet Identity in Mobile Safari:', this.principal);
      
      // 保存会话状态到 localStorage
      localStorage.setItem('ic_principal', this.principal);
      localStorage.setItem('ic_provider', this.provider);
      console.log('Saved session state to localStorage for Mobile Safari:', this.principal);
      
      return { success: true, principal: this.principal, provider: this.provider };
    } catch (error) {
      console.error('Mobile Safari authentication failed:', error);
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
              
              // 保存会话状态到 localStorage
              localStorage.setItem('ic_principal', this.principal);
              localStorage.setItem('ic_provider', this.provider);
              console.log('Saved session state to localStorage:', this.principal);
              
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
      
      // 清除 localStorage 中的会话状态
      localStorage.removeItem('ic_principal');
      localStorage.removeItem('ic_provider');
      console.log('Disconnected from identity and cleared localStorage');
      
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
      const balance = typeof balanceNat === 'object' && balanceNat && balanceNat.toString ? 
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
      // Only log when debugging is needed
      if (this.debugMode) {
        console.log('Checking connection status...');
        console.log('Current state:', {
          isConnected: this.isConnected,
          principal: this.principal,
          provider: this.provider
        });
      }
      
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
        console.log('Local development environment detected');
        
        // 在本地开发环境中，如果没有已保存的principal，创建一个新的
        if (!this.principal || this.principal === '2vxsx-fae') {
          console.log('Creating new local identity for development');
          
          // 创建基于时间戳的唯一principal
          const timestamp = Date.now();
          const randomBytes = new Uint8Array(29);
          
          // Fill first 8 bytes with timestamp
          const timestampBigInt = BigInt(timestamp);
          const timestampBytes = new Uint8Array(new BigInt64Array([timestampBigInt]).buffer);
          randomBytes.set(timestampBytes.slice(0, 8), 0);
          
          // Fill remaining bytes with deterministic but unique data
          for (let i = 8; i < 29; i++) {
            randomBytes[i] = (timestamp + i * 7) % 256;
          }
          
          // Ensure it's not the anonymous principal
          if (randomBytes[0] === 0 && randomBytes[1] === 0 && randomBytes[2] === 0 && randomBytes[3] === 0) {
            randomBytes[0] = 1;
          }
          
          const localPrincipal = Principal.fromUint8Array(randomBytes);
          this.principal = localPrincipal.toText();
          this.isConnected = true;
          this.provider = 'local-dev';
          
          console.log('Created local development identity:', this.principal);
          
          return {
            isConnected: true,
            principal: this.principal,
            provider: this.provider
          };
        } else {
          // 如果已经有有效的principal，返回它
          return {
            isConnected: true,
            principal: this.principal,
            provider: this.provider
          };
        }
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
      
      // 检查移动端 Safari 的特殊情况
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      
      if (isMobile && isSafari) {
        console.log('Mobile Safari detected, checking for persistent session...');
        // 尝试从 localStorage 恢复会话状态
        const savedPrincipal = localStorage.getItem('ic_principal');
        const savedProvider = localStorage.getItem('ic_provider');
        
        if (savedPrincipal && savedPrincipal !== '2vxsx-fae') {
          console.log('Found saved principal in localStorage:', savedPrincipal);
          this.principal = savedPrincipal;
          this.provider = savedProvider || 'internet-identity';
          this.isConnected = true;
          
          return {
            isConnected: true,
            principal: this.principal,
            provider: this.provider
          };
        }
      }
      
      // 通用会话恢复：尝试从 localStorage 恢复（适用于所有环境）
      console.log('Checking localStorage for saved session...');
      const savedPrincipal = localStorage.getItem('ic_principal');
      const savedProvider = localStorage.getItem('ic_provider');
      
      if (savedPrincipal && savedPrincipal !== '2vxsx-fae') {
        console.log('Found saved principal in localStorage:', savedPrincipal);
        this.principal = savedPrincipal;
        this.provider = savedProvider || 'internet-identity';
        this.isConnected = true;
        
        return {
          isConnected: true,
          principal: this.principal,
          provider: this.provider
        };
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

export async function getPrincipal() {
  const identity = await getIdentity();
  console.log("identity:", identity);
  if (identity) {
    const principal = identity.getPrincipal().toText();
    console.log("principal:", principal);
    return principal;
  }
  return null;
}