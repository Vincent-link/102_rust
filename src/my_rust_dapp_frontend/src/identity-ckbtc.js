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
      
      // 增强的移动端浏览器检测
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      const isFirefox = /Firefox/.test(navigator.userAgent);
      const isEdge = /Edg/.test(navigator.userAgent);
      const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
      
      console.log('Browser detection:', {
        isMobile,
        isSafari,
        isFirefox,
        isEdge,
        isChrome,
        userAgent: navigator.userAgent
      });
      
      // 针对不同移动端浏览器的特殊处理
      if (isMobile) {
        if (isSafari) {
        console.log('Mobile Safari detected, using enhanced authentication flow');
        return await this.connectWithMobileSafari();
        } else if (isFirefox) {
          console.log('Mobile Firefox detected, using Firefox optimized flow');
          return await this.connectWithMobileFirefox();
        } else if (isEdge) {
          console.log('Mobile Edge detected, using Edge optimized flow');
          return await this.connectWithMobileEdge();
        } else if (isChrome) {
          console.log('Mobile Chrome detected, using Chrome optimized flow');
          return await this.connectWithMobileChrome();
        } else {
          console.log('Other mobile browser detected, using generic mobile flow');
          return await this.connectWithGenericMobile();
        }
      }
      
      // 桌面端浏览器处理
      if (isFirefox) {
        console.log('Desktop Firefox detected, using Firefox optimized flow');
        return await this.connectWithDesktopFirefox();
      } else if (isEdge) {
        console.log('Desktop Edge detected, using Edge optimized flow');
        return await this.connectWithDesktopEdge();
      }
      
      // 默认处理（Chrome和其他浏览器）
      console.log('Using default authentication flow');
      return await this.connectWithDefaultBrowser();
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
      
      // Safari 移动端特殊处理：先尝试直接跳转
      const safariAuthUrl = 'https://identity.ic0.app/';
      
      // 检查是否支持弹窗
      let popupSupported = true;
      try {
        const testPopup = window.open('', '_blank', 'width=1,height=1');
        if (testPopup) {
          testPopup.close();
        } else {
          popupSupported = false;
        }
      } catch (e) {
        popupSupported = false;
      }
      
      console.log('Safari popup support check:', popupSupported);
      
      if (!popupSupported) {
        // Safari 不支持弹窗，使用直接跳转
        console.log('Safari popup not supported, using direct navigation');
        window.location.href = safariAuthUrl;
        throw new Error('Safari authentication requires direct navigation. Please complete authentication and return to this page.');
      }
      
      // 使用更兼容的登录方式
      await new Promise((resolve, reject) => {
        const loginOptions = {
          identityProvider: safariAuthUrl,
          onSuccess: () => {
            console.log('Mobile Safari authentication successful');
            resolve();
          },
          onError: (error) => {
            console.error('Mobile Safari authentication failed:', error);
            reject(new Error('Mobile Safari authentication failed. Please try again or use a different browser.'));
          }
        };
        
        // Safari 需要更长的超时时间
        const timeout = setTimeout(() => {
          console.log('Safari authentication timeout, trying alternative method');
          // 尝试直接跳转作为备选方案
          window.location.href = safariAuthUrl;
          reject(new Error('Authentication timeout. Please complete authentication and return to this page.'));
        }, 60000); // 60秒超时
        
        // 添加用户交互检测
        let userInteracted = false;
        const interactionHandler = () => {
          userInteracted = true;
          document.removeEventListener('touchstart', interactionHandler);
          document.removeEventListener('click', interactionHandler);
        };
        
        document.addEventListener('touchstart', interactionHandler);
        document.addEventListener('click', interactionHandler);
        
        // 延迟启动认证，确保用户交互
        setTimeout(() => {
          if (!userInteracted) {
            console.log('No user interaction detected, prompting user');
            // 显示用户提示
            if (confirm('Safari requires user interaction to open authentication. Click OK to continue.')) {
              userInteracted = true;
            }
          }
          
          if (userInteracted) {
            console.log('User interaction detected, starting authentication');
            this.authClient.login(loginOptions);
          } else {
            reject(new Error('User interaction required for Safari authentication.'));
          }
        }, 100);
        
        // 监听成功回调，清除超时
        const originalOnSuccess = loginOptions.onSuccess;
        loginOptions.onSuccess = () => {
          clearTimeout(timeout);
          document.removeEventListener('touchstart', interactionHandler);
          document.removeEventListener('click', interactionHandler);
          originalOnSuccess();
        };
        
        // 监听错误回调，清除事件监听器
        const originalOnError = loginOptions.onError;
        loginOptions.onError = (error) => {
          clearTimeout(timeout);
          document.removeEventListener('touchstart', interactionHandler);
          document.removeEventListener('click', interactionHandler);
          originalOnError(error);
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

  // 专门处理移动端 Firefox 的登录
  async connectWithMobileFirefox() {
    try {
      console.log('Using Mobile Firefox optimized authentication...');
      
      // 确保 AuthClient 已初始化
      if (!this.authClient) {
        this.authClient = await AuthClient.create();
        console.log('AuthClient created for Mobile Firefox');
      }
      
      // 检查是否已经认证
      if (this.authClient.isAuthenticated()) {
        console.log('Already authenticated in Mobile Firefox');
        this.identity = this.authClient.getIdentity();
        this.principal = this.identity.getPrincipal().toText();
        
        if (this.principal === '2vxsx-fae') {
          console.log('Detected anonymous identity in Mobile Firefox, starting fresh authentication');
          await this.authClient.logout();
        } else {
          this.isConnected = true;
          this.provider = 'internet-identity';
          console.log('Connected with existing Internet Identity in Mobile Firefox:', this.principal);
          
          localStorage.setItem('ic_principal', this.principal);
          localStorage.setItem('ic_provider', this.provider);
          console.log('Saved session state to localStorage for existing Mobile Firefox connection:', this.principal);
          
          return { success: true, principal: this.principal, provider: this.provider };
        }
      }

      // Mobile Firefox 特殊处理
      console.log('Starting Mobile Firefox authentication...');
      
      await new Promise((resolve, reject) => {
        const loginOptions = {
          identityProvider: 'https://identity.ic0.app/',
          onSuccess: () => {
            console.log('Mobile Firefox authentication successful');
            resolve();
          },
          onError: (error) => {
            console.error('Mobile Firefox authentication failed:', error);
            reject(new Error('Mobile Firefox authentication failed. Please try again or use a different browser.'));
          }
        };
        
        // Firefox 需要更长的超时时间
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timeout. Please check if the popup was blocked.'));
        }, 45000); // 45秒超时
        
        this.authClient.login(loginOptions);
        
        const originalOnSuccess = loginOptions.onSuccess;
        loginOptions.onSuccess = () => {
          clearTimeout(timeout);
          originalOnSuccess();
        };
      });
      
      this.identity = this.authClient.getIdentity();
      this.principal = this.identity.getPrincipal().toText();
      
      if (this.principal === '2vxsx-fae') {
        throw new Error('Authentication failed - anonymous identity detected in Mobile Firefox');
      }
      
      this.isConnected = true;
      this.provider = 'internet-identity';
      console.log('Connected with Internet Identity in Mobile Firefox:', this.principal);
      
      localStorage.setItem('ic_principal', this.principal);
      localStorage.setItem('ic_provider', this.provider);
      console.log('Saved session state to localStorage for Mobile Firefox:', this.principal);
      
      return { success: true, principal: this.principal, provider: this.provider };
    } catch (error) {
      console.error('Mobile Firefox authentication failed:', error);
      throw error;
    }
  }

  // 专门处理移动端 Edge 的登录
  async connectWithMobileEdge() {
    try {
      console.log('Using Mobile Edge optimized authentication...');
      
      if (!this.authClient) {
        this.authClient = await AuthClient.create();
        console.log('AuthClient created for Mobile Edge');
      }
      
      if (this.authClient.isAuthenticated()) {
        console.log('Already authenticated in Mobile Edge');
        this.identity = this.authClient.getIdentity();
        this.principal = this.identity.getPrincipal().toText();
        
        if (this.principal === '2vxsx-fae') {
          console.log('Detected anonymous identity in Mobile Edge, starting fresh authentication');
          await this.authClient.logout();
        } else {
          this.isConnected = true;
          this.provider = 'internet-identity';
          console.log('Connected with existing Internet Identity in Mobile Edge:', this.principal);
          
          localStorage.setItem('ic_principal', this.principal);
          localStorage.setItem('ic_provider', this.provider);
          console.log('Saved session state to localStorage for existing Mobile Edge connection:', this.principal);
          
          return { success: true, principal: this.principal, provider: this.provider };
        }
      }

      console.log('Starting Mobile Edge authentication...');
      
      await new Promise((resolve, reject) => {
        const loginOptions = {
          identityProvider: 'https://identity.ic0.app/',
          onSuccess: () => {
            console.log('Mobile Edge authentication successful');
            resolve();
          },
          onError: (error) => {
            console.error('Mobile Edge authentication failed:', error);
            reject(new Error('Mobile Edge authentication failed. Please try again or use a different browser.'));
          }
        };
        
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timeout. Please check if the popup was blocked.'));
        }, 40000); // 40秒超时
        
        this.authClient.login(loginOptions);
        
        const originalOnSuccess = loginOptions.onSuccess;
        loginOptions.onSuccess = () => {
          clearTimeout(timeout);
          originalOnSuccess();
        };
      });
      
      this.identity = this.authClient.getIdentity();
      this.principal = this.identity.getPrincipal().toText();
      
      if (this.principal === '2vxsx-fae') {
        throw new Error('Authentication failed - anonymous identity detected in Mobile Edge');
      }
      
        this.isConnected = true;
        this.provider = 'internet-identity';
      console.log('Connected with Internet Identity in Mobile Edge:', this.principal);
      
      localStorage.setItem('ic_principal', this.principal);
      localStorage.setItem('ic_provider', this.provider);
      console.log('Saved session state to localStorage for Mobile Edge:', this.principal);
      
      return { success: true, principal: this.principal, provider: this.provider };
    } catch (error) {
      console.error('Mobile Edge authentication failed:', error);
      throw error;
    }
  }

  // 专门处理移动端 Chrome 的登录
  async connectWithMobileChrome() {
    try {
      console.log('Using Mobile Chrome optimized authentication...');
      
      if (!this.authClient) {
        this.authClient = await AuthClient.create();
        console.log('AuthClient created for Mobile Chrome');
      }
      
      if (this.authClient.isAuthenticated()) {
        console.log('Already authenticated in Mobile Chrome');
        this.identity = this.authClient.getIdentity();
        this.principal = this.identity.getPrincipal().toText();
        
        if (this.principal === '2vxsx-fae') {
          console.log('Detected anonymous identity in Mobile Chrome, starting fresh authentication');
          await this.authClient.logout();
        } else {
          this.isConnected = true;
          this.provider = 'internet-identity';
          console.log('Connected with existing Internet Identity in Mobile Chrome:', this.principal);
          
          localStorage.setItem('ic_principal', this.principal);
          localStorage.setItem('ic_provider', this.provider);
          console.log('Saved session state to localStorage for existing Mobile Chrome connection:', this.principal);
          
          return { success: true, principal: this.principal, provider: this.provider };
      }
      }

      console.log('Starting Mobile Chrome authentication...');
      
      await new Promise((resolve, reject) => {
        const loginOptions = {
          identityProvider: 'https://identity.ic0.app/',
          onSuccess: () => {
            console.log('Mobile Chrome authentication successful');
            resolve();
          },
          onError: (error) => {
            console.error('Mobile Chrome authentication failed:', error);
            reject(new Error('Mobile Chrome authentication failed. Please try again.'));
          }
        };
        
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timeout. Please check if the popup was blocked.'));
        }, 35000); // 35秒超时
        
        this.authClient.login(loginOptions);
        
        const originalOnSuccess = loginOptions.onSuccess;
        loginOptions.onSuccess = () => {
          clearTimeout(timeout);
          originalOnSuccess();
        };
      });
      
      this.identity = this.authClient.getIdentity();
      this.principal = this.identity.getPrincipal().toText();
      
      if (this.principal === '2vxsx-fae') {
        throw new Error('Authentication failed - anonymous identity detected in Mobile Chrome');
      }
      
      this.isConnected = true;
      this.provider = 'internet-identity';
      console.log('Connected with Internet Identity in Mobile Chrome:', this.principal);
      
      localStorage.setItem('ic_principal', this.principal);
      localStorage.setItem('ic_provider', this.provider);
      console.log('Saved session state to localStorage for Mobile Chrome:', this.principal);
      
      return { success: true, principal: this.principal, provider: this.provider };
    } catch (error) {
      console.error('Mobile Chrome authentication failed:', error);
      throw error;
    }
  }

  // 通用移动端浏览器登录（适用于其他移动端浏览器）
  async connectWithGenericMobile() {
    try {
      console.log('Using generic mobile browser authentication...');
      
      if (!this.authClient) {
        this.authClient = await AuthClient.create();
        console.log('AuthClient created for generic mobile browser');
      }
      
      if (this.authClient.isAuthenticated()) {
        console.log('Already authenticated in generic mobile browser');
        this.identity = this.authClient.getIdentity();
        this.principal = this.identity.getPrincipal().toText();
        
        if (this.principal === '2vxsx-fae') {
          console.log('Detected anonymous identity in generic mobile browser, starting fresh authentication');
          await this.authClient.logout();
        } else {
          this.isConnected = true;
          this.provider = 'internet-identity';
          console.log('Connected with existing Internet Identity in generic mobile browser:', this.principal);
          
          localStorage.setItem('ic_principal', this.principal);
          localStorage.setItem('ic_provider', this.provider);
          console.log('Saved session state to localStorage for existing generic mobile browser connection:', this.principal);
          
          return { success: true, principal: this.principal, provider: this.provider };
        }
      }

      console.log('Starting generic mobile browser authentication...');
      
      await new Promise((resolve, reject) => {
        const loginOptions = {
          identityProvider: 'https://identity.ic0.app/',
          onSuccess: () => {
            console.log('Generic mobile browser authentication successful');
            resolve();
          },
          onError: (error) => {
            console.error('Generic mobile browser authentication failed:', error);
            reject(new Error('Authentication failed. Please try again or use a different browser.'));
          }
        };
        
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timeout. Please check if the popup was blocked.'));
        }, 50000); // 50秒超时，给其他浏览器更多时间
        
        this.authClient.login(loginOptions);
        
        const originalOnSuccess = loginOptions.onSuccess;
        loginOptions.onSuccess = () => {
          clearTimeout(timeout);
          originalOnSuccess();
        };
      });
      
      this.identity = this.authClient.getIdentity();
      this.principal = this.identity.getPrincipal().toText();
      
      if (this.principal === '2vxsx-fae') {
        throw new Error('Authentication failed - anonymous identity detected in generic mobile browser');
      }
      
      this.isConnected = true;
      this.provider = 'internet-identity';
      console.log('Connected with Internet Identity in generic mobile browser:', this.principal);
      
      localStorage.setItem('ic_principal', this.principal);
      localStorage.setItem('ic_provider', this.provider);
      console.log('Saved session state to localStorage for generic mobile browser:', this.principal);
      
      return { success: true, principal: this.principal, provider: this.provider };
    } catch (error) {
      console.error('Generic mobile browser authentication failed:', error);
      throw error;
    }
  }

  // 桌面端 Firefox 登录
  async connectWithDesktopFirefox() {
    try {
      console.log('Using Desktop Firefox optimized authentication...');
      
      if (!this.authClient) {
        this.authClient = await AuthClient.create();
        console.log('AuthClient created for Desktop Firefox');
      }
      
      if (this.authClient.isAuthenticated()) {
        console.log('Already authenticated in Desktop Firefox');
        this.identity = this.authClient.getIdentity();
        this.principal = this.identity.getPrincipal().toText();
        
        if (this.principal === '2vxsx-fae') {
          console.log('Detected anonymous identity in Desktop Firefox, starting fresh authentication');
          await this.authClient.logout();
        } else {
              this.isConnected = true;
              this.provider = 'internet-identity';
          console.log('Connected with existing Internet Identity in Desktop Firefox:', this.principal);
              
          localStorage.setItem('ic_principal', this.principal);
          localStorage.setItem('ic_provider', this.provider);
          console.log('Saved session state to localStorage for existing Desktop Firefox connection:', this.principal);
          
          return { success: true, principal: this.principal, provider: this.provider };
        }
      }

      console.log('Starting Desktop Firefox authentication...');
      
      await new Promise((resolve, reject) => {
        const loginOptions = {
          identityProvider: 'https://identity.ic0.app/',
          onSuccess: () => {
            console.log('Desktop Firefox authentication successful');
            resolve();
          },
          onError: (error) => {
            console.error('Desktop Firefox authentication failed:', error);
            reject(new Error('Desktop Firefox authentication failed. Please try again.'));
          }
        };
        
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timeout. Please check if the popup was blocked.'));
        }, 30000); // 30秒超时
        
        this.authClient.login(loginOptions);
        
        const originalOnSuccess = loginOptions.onSuccess;
        loginOptions.onSuccess = () => {
          clearTimeout(timeout);
          originalOnSuccess();
        };
      });
      
      this.identity = this.authClient.getIdentity();
      this.principal = this.identity.getPrincipal().toText();
      
      if (this.principal === '2vxsx-fae') {
        throw new Error('Authentication failed - anonymous identity detected in Desktop Firefox');
      }
      
      this.isConnected = true;
      this.provider = 'internet-identity';
      console.log('Connected with Internet Identity in Desktop Firefox:', this.principal);
      
              localStorage.setItem('ic_principal', this.principal);
              localStorage.setItem('ic_provider', this.provider);
      console.log('Saved session state to localStorage for Desktop Firefox:', this.principal);
      
      return { success: true, principal: this.principal, provider: this.provider };
    } catch (error) {
      console.error('Desktop Firefox authentication failed:', error);
      throw error;
    }
  }

  // 桌面端 Edge 登录
  async connectWithDesktopEdge() {
    try {
      console.log('Using Desktop Edge optimized authentication...');
      
      if (!this.authClient) {
        this.authClient = await AuthClient.create();
        console.log('AuthClient created for Desktop Edge');
      }
      
      if (this.authClient.isAuthenticated()) {
        console.log('Already authenticated in Desktop Edge');
        this.identity = this.authClient.getIdentity();
        this.principal = this.identity.getPrincipal().toText();
        
        if (this.principal === '2vxsx-fae') {
          console.log('Detected anonymous identity in Desktop Edge, starting fresh authentication');
          await this.authClient.logout();
        } else {
          this.isConnected = true;
          this.provider = 'internet-identity';
          console.log('Connected with existing Internet Identity in Desktop Edge:', this.principal);
          
          localStorage.setItem('ic_principal', this.principal);
          localStorage.setItem('ic_provider', this.provider);
          console.log('Saved session state to localStorage for existing Desktop Edge connection:', this.principal);
          
          return { success: true, principal: this.principal, provider: this.provider };
        }
      }

      console.log('Starting Desktop Edge authentication...');
      
      await new Promise((resolve, reject) => {
        const loginOptions = {
          identityProvider: 'https://identity.ic0.app/',
          onSuccess: () => {
            console.log('Desktop Edge authentication successful');
            resolve();
          },
          onError: (error) => {
            console.error('Desktop Edge authentication failed:', error);
            reject(new Error('Desktop Edge authentication failed. Please try again.'));
          }
        };
        
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timeout. Please check if the popup was blocked.'));
        }, 30000); // 30秒超时
        
        this.authClient.login(loginOptions);
        
        const originalOnSuccess = loginOptions.onSuccess;
        loginOptions.onSuccess = () => {
          clearTimeout(timeout);
          originalOnSuccess();
        };
      });
      
      this.identity = this.authClient.getIdentity();
      this.principal = this.identity.getPrincipal().toText();
      
      if (this.principal === '2vxsx-fae') {
        throw new Error('Authentication failed - anonymous identity detected in Desktop Edge');
      }
      
      this.isConnected = true;
      this.provider = 'internet-identity';
      console.log('Connected with Internet Identity in Desktop Edge:', this.principal);
      
      localStorage.setItem('ic_principal', this.principal);
      localStorage.setItem('ic_provider', this.provider);
      console.log('Saved session state to localStorage for Desktop Edge:', this.principal);
      
      return { success: true, principal: this.principal, provider: this.provider };
            } catch (error) {
      console.error('Desktop Edge authentication failed:', error);
      throw error;
    }
  }

  // 默认浏览器登录（Chrome和其他浏览器）
  async connectWithDefaultBrowser() {
    try {
      console.log('Using default browser authentication...');
      
      if (!this.authClient) {
        this.authClient = await AuthClient.create();
        console.log('AuthClient created for default browser');
            }
      
      if (this.authClient.isAuthenticated()) {
        console.log('Already authenticated in default browser');
        this.identity = this.authClient.getIdentity();
        this.principal = this.identity.getPrincipal().toText();
        
        if (this.principal === '2vxsx-fae') {
          console.log('Detected anonymous identity in default browser, starting fresh authentication');
          await this.authClient.logout();
        } else {
          this.isConnected = true;
          this.provider = 'internet-identity';
          console.log('Connected with existing Internet Identity in default browser:', this.principal);
          
          localStorage.setItem('ic_principal', this.principal);
          localStorage.setItem('ic_provider', this.provider);
          console.log('Saved session state to localStorage for existing default browser connection:', this.principal);
          
          return { success: true, principal: this.principal, provider: this.provider };
        }
      }

      console.log('Starting default browser authentication...');
      
      await new Promise((resolve, reject) => {
        const loginOptions = {
          identityProvider: 'https://identity.ic0.app/',
          onSuccess: () => {
            console.log('Default browser authentication successful');
            resolve();
          },
          onError: (error) => {
            console.error('Default browser authentication failed:', error);
            reject(new Error('Authentication failed. Please try again.'));
          }
        };
        
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timeout. Please check if the popup was blocked.'));
        }, 30000); // 30秒超时
        
        this.authClient.login(loginOptions);
        
        const originalOnSuccess = loginOptions.onSuccess;
        loginOptions.onSuccess = () => {
          clearTimeout(timeout);
          originalOnSuccess();
        };
      });
      
      this.identity = this.authClient.getIdentity();
      this.principal = this.identity.getPrincipal().toText();
      
      if (this.principal === '2vxsx-fae') {
        throw new Error('Authentication failed - anonymous identity detected in default browser');
      }
      
      this.isConnected = true;
      this.provider = 'internet-identity';
      console.log('Connected with Internet Identity in default browser:', this.principal);
      
      localStorage.setItem('ic_principal', this.principal);
      localStorage.setItem('ic_provider', this.provider);
      console.log('Saved session state to localStorage for default browser:', this.principal);
      
      return { success: true, principal: this.principal, provider: this.provider };
    } catch (error) {
      console.error('Default browser authentication failed:', error);
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
      
      // 增强的移动端浏览器检测和会话恢复
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      const isFirefox = /Firefox/.test(navigator.userAgent);
      const isEdge = /Edg/.test(navigator.userAgent);
      const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
      
      console.log('Browser detection for session recovery:', {
        isMobile,
        isSafari,
        isFirefox,
        isEdge,
        isChrome
      });
      
      // 针对不同移动端浏览器的会话恢复
      if (isMobile) {
        console.log('Mobile browser detected, checking for persistent session...');
        
        // 尝试从 localStorage 恢复会话状态
        const savedPrincipal = localStorage.getItem('ic_principal');
        const savedProvider = localStorage.getItem('ic_provider');
        
        if (savedPrincipal && savedPrincipal !== '2vxsx-fae') {
          console.log('Found saved principal in localStorage for mobile browser:', savedPrincipal);
          this.principal = savedPrincipal;
          this.provider = savedProvider || 'internet-identity';
          this.isConnected = true;
          
          return {
            isConnected: true,
            principal: this.principal,
            provider: this.provider
          };
        }
        
        // 针对特定移动端浏览器的额外检查
        if (isSafari) {
          console.log('Mobile Safari detected, checking for Safari-specific session...');
          // Safari 可能需要额外的会话检查
        } else if (isFirefox) {
          console.log('Mobile Firefox detected, checking for Firefox-specific session...');
          // Firefox 可能需要额外的会话检查
        } else if (isEdge) {
          console.log('Mobile Edge detected, checking for Edge-specific session...');
          // Edge 可能需要额外的会话检查
        }
      }
      
      // 桌面端浏览器的会话恢复
      if (!isMobile) {
        console.log('Desktop browser detected, checking for persistent session...');
        
        const savedPrincipal = localStorage.getItem('ic_principal');
        const savedProvider = localStorage.getItem('ic_provider');
        
        if (savedPrincipal && savedPrincipal !== '2vxsx-fae') {
          console.log('Found saved principal in localStorage for desktop browser:', savedPrincipal);
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