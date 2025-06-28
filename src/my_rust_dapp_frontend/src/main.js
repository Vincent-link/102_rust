console.log('Starting Virtual BTC Lottery...');

// Immediately execute the code
(function() {
  console.log('Executing main.js...');
  
  // Simple test - just update the page content
  document.getElementById('app').innerHTML = `
    <div style="text-align: center; color: white; padding: 20px;">
      <h2>🚀 Virtual BTC Lottery</h2>
      <p>✅ JavaScript is working!</p>
      <p>✅ Page content updated successfully!</p>
      <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h3>🎯 Ready to Play!</h3>
        <p>Click the button below to connect your wallet and start playing the lottery!</p>
        <button id="connectWalletBtn" style="padding: 15px 30px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;">
          🚀 Connect Wallet & Start Playing
        </button>
      </div>
      <div style="margin-top: 20px; font-size: 14px; opacity: 0.8;">
        <p>Features:</p>
        <ul style="text-align: left; display: inline-block;">
          <li>🔐 Secure built-in wallet</li>
          <li>✍️ No browser extension required</li>
          <li>💰 Easy deposit and betting</li>
          <li>🎨 Simple and intuitive</li>
          <li>⚡ Fast and reliable</li>
        </ul>
      </div>
    </div>
  `;

  // Add event listener for connect wallet button
  document.getElementById('connectWalletBtn').addEventListener('click', connectWallet);

  // Simple wallet connection function
  function connectWallet() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div style="text-align: center; color: white; padding: 20px;">
        <h2>🎉 Wallet Connected!</h2>
        <p>Your wallet is now connected and ready to play!</p>
        <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; margin: 20px 0;">
          <h3>💰 Your Balance: 0 BTC</h3>
          <p>Deposit some BTC to start playing!</p>
          <input type="number" id="depositAmount" placeholder="Amount (BTC)" style="padding: 10px; margin: 10px; border: none; border-radius: 5px; width: 200px;">
          <button id="depositBtn" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">Deposit</button>
        </div>
        <button id="placeBetBtn" style="padding: 15px 30px; background: #ffc107; color: black; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; margin: 10px;">
          🎲 Place Bet (1 BTC)
        </button>
      </div>
    `;

    // Add event listeners for new buttons
    document.getElementById('depositBtn').addEventListener('click', deposit);
    document.getElementById('placeBetBtn').addEventListener('click', placeBet);
  }

  function deposit() {
    const amount = document.getElementById('depositAmount').value;
    alert(`Deposit functionality will be implemented with the full app! Amount: ${amount} BTC`);
  }

  function placeBet() {
    alert('Betting functionality will be implemented with the full app!');
  }

  console.log('Simple test completed successfully!');
})();

// Add global error handler
window.addEventListener('error', function(e) {
  console.error('Global error:', e.error);
  document.getElementById('app').innerHTML = `
    <div style="text-align: center; color: white; padding: 20px;">
      <h2>⚠️ JavaScript Error</h2>
      <p>Error: ${e.error.message}</p>
      <pre style="text-align: left; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; overflow-x: auto; font-size: 12px;">${e.error.stack}</pre>
      <button id="refreshBtn" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">Refresh Page</button>
    </div>
  `;
  document.getElementById('refreshBtn').addEventListener('click', () => location.reload());
});

// Add unhandled promise rejection handler
window.addEventListener('unhandledrejection', function(e) {
  console.error('Unhandled promise rejection:', e.reason);
  document.getElementById('app').innerHTML = `
    <div style="text-align: center; color: white; padding: 20px;">
      <h2>⚠️ Promise Error</h2>
      <p>Error: ${e.reason.message || e.reason}</p>
      <button id="refreshBtn2" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">Refresh Page</button>
    </div>
  `;
  document.getElementById('refreshBtn2').addEventListener('click', () => location.reload());
});
