# ckBTC Integration Guide for Virtual BTC Lottery

## Overview

The Virtual BTC Lottery now supports real Bitcoin transactions through ckBTC (Canister Bitcoin) integration. Users can connect their Internet Computer identity, generate unique ckBTC addresses, and participate in the lottery using real Bitcoin.

## How It Works

### 1. Identity Connection
- Users connect using Internet Identity, Plug Wallet, or Oisy Wallet
- No additional wallet installation required for basic functionality
- Secure authentication through Internet Computer's native identity system

### 2. ckBTC Address Generation
- Each user gets a unique ckBTC address upon request
- Addresses are generated based on user's principal ID and timestamp
- Addresses are stored securely in the canister

### 3. Bitcoin Deposits
- Users send real Bitcoin to their generated ckBTC address
- Transactions are recorded with hash and amount
- Balances are automatically updated upon deposit confirmation

### 4. Lottery Participation
- Users place bets using their ckBTC balance
- Each bet costs 0.001 ckBTC (1,000,000 e8s)
- Winners receive prizes in ckBTC

## User Flow

### Step 1: Connect Identity
1. Visit the lottery application
2. Click "Connect Identity & Start Playing"
3. Choose your preferred identity provider:
   - **Internet Identity**: Official IC identity provider
   - **Plug Wallet**: Popular browser extension
   - **Oisy Wallet**: Modern IC wallet

### Step 2: Generate ckBTC Address
1. After connecting, click "Generate CkBTC Address"
2. Copy your unique address
3. Use this address to receive Bitcoin deposits

### Step 3: Deposit Bitcoin
1. Send Bitcoin to your ckBTC address from any Bitcoin wallet
2. Record the transaction by entering:
   - Transaction hash
   - Amount in BTC
3. Click "Record Deposit" to update your balance

### Step 4: Place Bets
1. Use your ckBTC balance to place lottery bets
2. Each bet costs 0.001 ckBTC
3. Wait for the round to end and see if you win!

## Technical Details

### Backend Integration
- **Candid Interface**: Updated to include ckBTC methods
- **Data Structures**: Enhanced to track ckBTC addresses and deposits
- **Transaction Tracking**: Complete history of all ckBTC transactions

### Frontend Features
- **Multi-Provider Support**: Internet Identity, Plug, and Oisy
- **Address Management**: Generate and copy ckBTC addresses
- **Deposit Recording**: Manual transaction recording system
- **Balance Display**: Real-time ckBTC balance updates
- **Transaction History**: Complete deposit and betting history

### Security Features
- **Principal-based Authentication**: Secure user identification
- **Transaction Verification**: Hash-based deposit verification
- **Address Uniqueness**: Each user gets a unique address
- **Admin Controls**: Manual deposit confirmation system

## Supported Identity Providers

### Internet Identity
- **URL**: https://identity.ic0.app/
- **Type**: Official IC identity provider
- **Features**: No installation required, web-based

### Plug Wallet
- **URL**: https://plugwallet.ooo/
- **Type**: Browser extension
- **Features**: Full wallet functionality, easy to use

### Oisy Wallet
- **URL**: https://oisy.com/
- **Type**: Modern IC wallet
- **Features**: Advanced features, mobile support

## ckBTC Address Format

Generated addresses follow the format:
```
ckbtc_{principal_id}_{timestamp}
```

Example:
```
ckbtc_2vxsx-fae_1640995200000000000
```

## Transaction Recording

### Required Information
- **Transaction Hash**: The Bitcoin transaction hash
- **Amount**: The amount in BTC (e.g., 0.001)

### Process
1. User sends Bitcoin to their ckBTC address
2. User records the transaction in the app
3. System verifies and updates balance
4. User can immediately use the balance for betting

## Benefits of This Approach

### For Users
- **Real Bitcoin**: Use actual Bitcoin instead of virtual currency
- **Multiple Options**: Choose from various identity providers
- **Easy Setup**: No complex wallet configuration required
- **Transparent**: All transactions are visible and verifiable

### For Developers
- **Simplified Integration**: No complex wallet SDK required
- **Flexible**: Support for multiple identity providers
- **Scalable**: Easy to add new providers
- **Secure**: Built on Internet Computer's security model

## Troubleshooting

### Common Issues

**Identity Connection Fails**
- Ensure you have an Internet Identity, Plug, or Oisy wallet installed
- Check browser compatibility
- Try refreshing the page

**Address Generation Fails**
- Make sure you're connected to an identity
- Check network connection
- Try disconnecting and reconnecting

**Deposit Not Recorded**
- Verify the transaction hash is correct
- Ensure the amount matches the actual transaction
- Check that the transaction has sufficient confirmations

**Balance Not Updated**
- Wait for transaction confirmation
- Verify the deposit was recorded correctly
- Contact support if issues persist

### Support

For technical support or questions about the ckBTC integration:
- Check the application's help section
- Review transaction history for verification
- Ensure all required fields are filled correctly

## Future Enhancements

### Planned Features
- **Automatic Detection**: Automatic deposit detection and confirmation
- **Multiple Addresses**: Support for multiple ckBTC addresses per user
- **Withdrawal System**: Direct ckBTC withdrawal functionality
- **Advanced Analytics**: Detailed transaction analytics and reporting

### Integration Improvements
- **Real-time Updates**: Live balance and transaction updates
- **Mobile Support**: Enhanced mobile experience
- **API Access**: Public API for third-party integrations

---

This integration provides a seamless way for users to participate in the Virtual BTC Lottery using real Bitcoin while maintaining the security and simplicity of the Internet Computer ecosystem. 