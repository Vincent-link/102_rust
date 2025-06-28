# Oisy Wallet Integration Guide

## Overview

This project has successfully integrated Oisy wallet, supporting multiple Internet Computer wallet switching.

## Supported Wallets

### 1. Oisy Wallet (Recommended)
- **Official Website**: https://oisy.com
- **Features**: Modern wallet designed specifically for Internet Computer
- **Advantages**: User-friendly interface, complete functionality, high security

### 2. Plug Wallet
- **Official Website**: https://plugwallet.ooo
- **Features**: Popular IC ecosystem wallet
- **Advantages**: Good community support, rich features

### 3. Internet Identity
- **Official Website**: https://identity.ic0.app
- **Features**: DFINITY official identity verification
- **Advantages**: Official support, high stability

## Integration Features

### Automatic Detection
- Automatically detect available wallets when application starts
- Prioritize connecting to Oisy wallet
- Support multi-wallet switching

### User Interface
- Beautiful wallet selection interface
- Clear wallet information display
- One-click disconnect functionality

### Error Handling
- Comprehensive error prompts
- Guidance when wallet is not installed
- Retry mechanism for connection failures

## Usage Instructions

### 1. Install Wallet
Users need to install the corresponding wallet plugin first:

#### Oisy Wallet
1. Visit https://oisy.com
2. Download and install browser extension
3. Create or import wallet account

#### Plug Wallet
1. Visit https://plugwallet.ooo
2. Download and install browser extension
3. Create or import wallet account

#### Internet Identity
1. Visit https://identity.ic0.app
2. Create Internet Identity account
3. Enable plugin in browser

### 2. Connect Wallet
1. Open application
2. Select wallet type to connect
3. Click connect button
4. Confirm connection in wallet

### 3. Use Features
After successful connection, users can:
- Create user account
- Deposit virtual BTC
- Participate in lottery games
- View transaction history
- Manage wallet connection

## Technical Implementation

### Wallet Detection
```javascript
async checkAvailableWallets() {
  // Check Oisy wallet
  if (window.oisy) {
    console.log('Oisy wallet available');
  }
  
  // Check Plug wallet
  if (window.ic && window.ic.plug) {
    console.log('Plug wallet available');
  }
}
```

### Wallet Connection
```javascript
async connectOisyWallet() {
  if (!window.oisy) {
    throw new Error('Please install Oisy wallet plugin');
  }

  await window.oisy.requestConnect();
  this.userPrincipal = await window.oisy.getPrincipal();
  this.walletType = 'oisy';
}
```

### Auto Reconnection
```javascript
async autoConnectWallet() {
  // Prioritize Oisy wallet
  if (window.oisy && window.oisy.isConnected) {
    try {
      const connected = await window.oisy.isConnected();
      if (connected) {
        this.walletType = 'oisy';
        this.userPrincipal = await window.oisy.getPrincipal();
        await this.loadUserData();
        return;
      }
    } catch (error) {
      console.log('Oisy auto-connection failed:', error);
    }
  }
}
```

## Style Design

### Wallet Option Cards
- Responsive grid layout
- Hover animation effects
- Clear visual hierarchy

### Wallet Information Display
- Wallet type identification
- Principal ID display
- Disconnect button

### Installation Guide
- Links to official download pages
- Clear installation step instructions

## Security Considerations

1. **Wallet Verification**: Ensure connecting to official wallet
2. **Permission Control**: Only request necessary permissions
3. **Error Handling**: Comprehensive exception handling mechanism
4. **User Prompts**: Clear security prompt information

## Troubleshooting

### Common Issues

1. **Wallet Not Detected**
   - Ensure wallet plugin is properly installed
   - Check browser compatibility
   - Try refreshing the page

2. **Connection Failed**
   - Check network connection
   - Confirm wallet plugin is enabled
   - Try reinstalling wallet

3. **Permission Denied**
   - Check wallet permission settings
   - Confirm application access is authorized
   - Try reconnecting

### Debug Information
Application will output detailed debug information in console:
- Wallet detection results
- Connection status changes
- Error details

## Update Log

### v1.0.0
- Initial Oisy wallet integration
- Support multi-wallet switching
- Add auto-connection functionality
- Improve error handling

## Contributing

Welcome to submit Issues and Pull Requests to improve wallet integration functionality!

## License

MIT License 