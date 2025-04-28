import React, { useState } from 'react';
import { buyTokens } from '../contract';

const BuyTokensForm = ({ provider, account }) => {
  const [bnbAmount, setBnbAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!provider || !account) {
      alert('Please connect your wallet first!');
      return;
    }
    if (!bnbAmount || bnbAmount <= 0) {
      alert('Please enter a valid BNB amount!');
      return;
    }

    setIsLoading(true);
    try {
      await buyTokens(provider, account, bnbAmount);
      alert('Token purchase successful!');
      setBnbAmount('');
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Purchase failed! ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="buy-tokens-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="bnb-amount">BNB Amount</label>
        <input
          type="number"
          id="bnb-amount"
          value={bnbAmount}
          onChange={(e) => setBnbAmount(e.target.value)}
          placeholder="Example: 0.1"
          step="0.01"
          min="0"
          disabled={isLoading}
        />
      </div>
      <button type="submit" className="buy-button" disabled={isLoading}>
        {isLoading ? 'processing...' : 'Token Buy'}
      </button>
    </form>
  );
};

export default BuyTokensForm;
